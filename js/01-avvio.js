    // usata già durante l'avvio (02-autisti.js): deve stare nel primo file
    function esc(s) { return (s===undefined||s===null?'':String(s)).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    // ── Registro errori per il pannello admin: gli errori finiscono nella sessione su Firebase (campo "errors").
    // Nessun effetto visibile: si raccolgono e si inviano in silenzio (al massimo 25 diversi per sessione).
    // Librerie caricate solo quando servono (Excel: import/export e modalità Excel; Chart: grafico del dettaglio ore)
    const LIBS = { excel: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js', chart: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js' }, libLoading = {};
    function loadLib(k) {
        if(k === 'excel' && typeof ExcelJS !== 'undefined') return Promise.resolve();
        if(k === 'chart' && typeof Chart !== 'undefined') return Promise.resolve();
        return libLoading[k] || (libLoading[k] = new Promise((res, rej) => {
            const sc = document.createElement('script'); sc.src = LIBS[k]; sc.async = true;
            sc.onload = () => res(); sc.onerror = () => { delete libLoading[k]; rej(new Error('Libreria non caricata: ' + k)); };
            document.head.appendChild(sc);
        }));
    }
    const APP_ERR = { queue: [], seen: new Set(), max: 25 };
    // dimensioni dello schermo in memoria (ruota strumenti): leggerle mentre il calendario cambia obbliga il browser a reimpaginarlo tutto
    var twVP = { w: window.innerWidth, h: window.innerHeight };
    window.addEventListener('resize', () => { twVP.w = window.innerWidth; twVP.h = window.innerHeight; }, { passive: true });
    function appErrRecord(kind, msg, src, stack) {
        try {
            msg = String(msg || '').replace(/^\[\d{4}-\d{2}-\d{2}T[^\]]*\]\s*/, '').slice(0, 300); if(!msg) return;
            const sig = kind + '|' + msg.slice(0, 120); if(APP_ERR.seen.has(sig) || APP_ERR.seen.size >= APP_ERR.max) return; APP_ERR.seen.add(sig);
            APP_ERR.queue.push({ t: Date.now(), kind, msg, src: String(src || '').slice(0, 200), stack: String(stack || '').slice(0, 600), view: (() => { try { return currentViewLabel; } catch(e) { return ''; } })(), ver: document.lastModified || '' });
            setTimeout(() => { try { appErrFlush(); } catch(e) {} }, 0);
        } catch(e) {}
    }
    window.addEventListener('error', e => { if(e && e.message) appErrRecord('errore', e.message, String(e.filename || '').split('/').pop() + ':' + (e.lineno || '') + ':' + (e.colno || ''), e.error && e.error.stack); });
    window.addEventListener('unhandledrejection', e => { const r = e && e.reason; appErrRecord('promessa', (r && (r.message || r.code)) || String(r), '', r && r.stack); });
    (function() {
        const orig = console.error;
        console.error = function(...a) {
            try { appErrRecord('console', a.map(x => x && x.message ? x.message + (x.code ? ' (' + x.code + ')' : '') : (x && typeof x === 'object' ? (() => { try { return JSON.stringify(x); } catch(e) { return String(x); } })() : String(x))).join(' '), '', (a.find(x => x && x.stack) || {}).stack); } catch(e) {}
            return orig.apply(console, a);
        };
    })();
    const FILE_NAME = "turni.xlsx?v=" + new Date().getTime();
    const MONTH_MAP = { "GENNAIO":0,"FEBBRAIO":1,"MARZO":2,"APRILE":3,"MAGGIO":4,"GIUGNO":5,"LUGLIO":6,"AGOSTO":7,"SETTEMBRE":8,"OTTOBRE":9,"NOVEMBRE":10,"DICEMBRE":11 };
    const FIXED_HOLIDAYS = {
        "0-1":"CAPODANNO","0-6":"EPIFANIA","1-5":"S. AGATA","2-25":"ARENGO","3-1":"REGGENZA",
        "4-1":"1° MAGGIO","6-28":"LIBERAZIONE","7-15":"FERRAGOSTO","8-3":"S. MARINO","9-1":"REGGENZA",
        "10-1":"OGNISSANTI","10-2":"COMM. DEFUNTI","11-8":"IMMACOLATA","11-25":"NATALE","11-26":"S. STEFANO"
    };
    // Pasqua (algoritmo di Gauss/Meeus), Lunedì dell'Angelo e Corpus Domini (+60 giorni) cambiano ogni anno.
    function easterDate(y) {
        const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
        return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
    }
    function holidaysFor(y) {
        const H = Object.assign({}, FIXED_HOLIDAYS), e = easterDate(y);
        const add = (n, name) => { const d = new Date(e); d.setDate(d.getDate() + n); H[`${d.getMonth()}-${d.getDate()}`] = name; };
        add(0, 'PASQUA'); add(1, 'LUN. ANGELO'); add(60, 'CORPUS DOM.');
        return H;
    }
    let HOLIDAYS = holidaysFor(2026);
    const SCHEDULE = { "M":"06:30 - 13:15","P":"12:45 - 20:10","N":"19:45 - 00:00","SM":"00:00 - 07:20","S":"00:00 - 07:20","R":"RIPOSO" };
    const SCHEDULE_DIURNI = { "m":"06:30 - 13:42","p":"13:15 - 20:27","r":"RIPOSO" };
    const DEFAULT_SCHEDULE = Object.assign({}, SCHEDULE);
    const DEFAULT_SCHEDULE_DIURNI = Object.assign({}, SCHEDULE_DIURNI);
    // Orari dei diurnisti che cambiano da una data in poi (prima valgono quelli sopra o delle impostazioni).
    // Autisti: dal 5 ottobre 2026 i diurnisti fanno turni da 6 ore, 6 giorni a settimana (i turnisti restano uguali).
    const DIURNI_FROM = [ { from: '2026-10-05', m: '07:00 - 13:00', p: '13:00 - 19:00' } ];
    const DIURNI6_FROM = '2026-10-05';
    let fmtDateCtx = null;   // giorno della riga che si sta disegnando (per gli orari dei diurnisti)
    function diurniSched(code, when) {
        code = String(code || '').toLowerCase();
        let t = SCHEDULE_DIURNI[code];
        if(code !== 'm' && code !== 'p') return t;
        const iso = !when ? ymd(new Date()) : (typeof when === 'string' ? when : ymd(when));
        DIURNI_FROM.forEach(p => { if(iso >= p.from && p[code]) t = p[code]; });
        return t;
    }

    // ── DATI DI DEFAULT "INCORPORATI" NEL FILE ──────────────────────────────
    // Queste costanti vengono lette/sovrascritte automaticamente dalla funzione
    // di esportazione del Pannello Admin (tab "Esporta"). Non modificarle a mano
    // se non sai cosa stai facendo: usa il pannello Admin dell'app.
    const DEFAULT_COLORS_BAKED = {}; // __ADMIN_DEFAULT_COLORS__
    const DEFAULT_NAME_OVERRIDES_BAKED = {}; // __ADMIN_DEFAULT_NAMES__
    const DEFAULT_SCHEDULE_OVERRIDE_BAKED = {"SCHEDULE":{},"SCHEDULE_DIURNI":{}}; // __ADMIN_DEFAULT_SCHEDULE__
    const DEFAULT_WELCOME_BAKED = {"active":true,"title":"ATTENZIONE","text":"L'app viene aggiornata spesso.\nIn caso di dubbio, verifica sempre i turni cartacei in guardiola.","duration":3}; // __ADMIN_DEFAULT_WELCOME__
    const DEFAULT_ANNOUNCEMENTS_BAKED = []; // __ADMIN_DEFAULT_ANNOUNCEMENTS__

    // ═══════════════════════════════════════════════════════════════════════
    // FIREBASE — inizializzazione, tracciamento accessi, sincronizzazione config
    // ═══════════════════════════════════════════════════════════════════════
    const firebaseConfig = {
        apiKey: "AIzaSyAMX2ycf_6P3AcBvarVX4XNKbdposkuqgE",
        authDomain: "area-personale-autsocc-118-rsm.firebaseapp.com",
        projectId: "area-personale-autsocc-118-rsm",
        storageBucket: "area-personale-autsocc-118-rsm.firebasestorage.app",
        messagingSenderId: "910283994567",
        appId: "1:910283994567:web:d9c45b5f4b5a83b92595e2",
        measurementId: "G-9P8X82Y4H5"
    };
    // ── Pausa degli aggiornamenti: una sola scheda per computer e stop dopo 30 minuti senza uso ──
    // Una pagina non può chiudere da sola una scheda aperta dall'utente: la mette "in pausa", cioè
    // stacca tutti gli ascolti Firebase (niente letture) senza ricaricare, così non si perde niente
    // di quanto è in memoria (anche le modifiche non salvate). Al ritorno si riattaccano e arriva
    // solo ciò che è cambiato. Il motore (?server=1) non ne è toccato.
    const LIVE = { subs: new Set(), paused: '', idleMs: 30 * 60 * 1000, last: Date.now(), tabId: Math.random().toString(36).slice(2), on: false };
    function liveInstall() {
        if(new URLSearchParams(location.search).has('server') || !window.firebase || !firebase.firestore) return;
        [firebase.firestore.DocumentReference, firebase.firestore.Query].forEach(C => {
            if(!C || !C.prototype || C.prototype._liveWrapped) return;
            const orig = C.prototype.onSnapshot;
            C.prototype.onSnapshot = function(...args) {
                const ref = this, e = { unsub: null };
                e.start = () => { if(!e.unsub) e.unsub = orig.apply(ref, args); };
                e.stop = () => { if(e.unsub) { try { e.unsub(); } catch(_) {} e.unsub = null; } };
                LIVE.subs.add(e);
                if(!LIVE.paused) e.start();
                return () => { LIVE.subs.delete(e); e.stop(); };
            };
            C.prototype._liveWrapped = true;
        });
        LIVE.on = true;
        liveTabsStart();
        ['pointerdown','pointermove','keydown','wheel','touchstart','scroll'].forEach(ev => window.addEventListener(ev, liveTouch, { passive:true, capture:true }));
        document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') liveTouch(); });
        setInterval(() => { if(!LIVE.paused && Date.now() - LIVE.last >= LIVE.idleMs) livePause('idle'); }, 30000);
    }
    function liveTouch() { if(!LIVE.paused) LIVE.last = Date.now(); }
    function livePause(why) {
        if(!LIVE.on) return;
        const was = LIVE.paused; LIVE.paused = why;
        liveShow();
        if(was) return;
        try { if(typeof pendingChangesCount === 'function' && pendingChangesCount() > 0 && typeof draftSaveNow === 'function') draftSaveNow(); } catch(e) {}
        LIVE.subs.forEach(e => e.stop());
        try { if(fbReady && typeof sessionId !== 'undefined') asNoopRef().doc(sessionId).set({ online:false, paused: why, lastActive: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true }).catch(() => {}); } catch(e) {}
    }
    function liveResume(claim) {
        if(!LIVE.paused) return;
        LIVE.paused = ''; LIVE.last = Date.now();
        if(claim) liveTabsClaim();
        const o = document.getElementById('live-pause'); if(o) o.classList.remove('show');
        LIVE.subs.forEach(e => e.start());
        try { if(fbReady && typeof sessionId !== 'undefined') asNoopRef().doc(sessionId).set({ online: document.visibilityState === 'visible', paused: null, lastActive: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true }).catch(() => {}); } catch(e) {}
        try { if(typeof ccToast === 'function') ccToast('Turni di nuovo aggiornati in tempo reale'); } catch(e) {}
    }
    function liveShow() {
        let o = document.getElementById('live-pause');
        if(!o) {
            o = document.createElement('div'); o.id = 'live-pause';
            o.innerHTML = '<div class="lp-card"><span class="material-icons-round lp-ic"></span><div class="lp-t"></div><p class="lp-p"></p><p class="lp-warn"></p><button class="lp-btn" type="button"></button><button class="lp-both" type="button" title="Tieni aggiornate tutte e due le schede"><span class="material-icons-round">library_add</span>Usa anche questa, senza fermare l’altra</button><p class="lp-hint">Per chiudere questa scheda: la X sulla sua linguetta in alto, oppure Ctrl+W (Mac: Cmd+W).</p></div>';
            o.addEventListener('click', ev => {
                if(ev.target.closest('.lp-btn')) { liveResume(true); return; }
                if(ev.target.closest('.lp-both')) { LIVE.keep = true; liveResume(false); return; }   // due schede insieme: questa non va più in pausa per le altre (fino a quando si ricarica)
                if(LIVE.paused === 'idle' && !ev.target.closest('.lp-card')) liveResume(true);
            });
            document.body.appendChild(o);
        }
        const other = LIVE.paused === 'tab';
        o.querySelector('.lp-ic').textContent = other ? 'tab' : 'pause_circle';
        o.querySelector('.lp-t').textContent = other ? 'Turni aperti in un’altra scheda' : 'Turni in pausa';
        o.querySelector('.lp-p').textContent = other
            ? 'Su questo computer i turni restano aggiornati in una scheda sola, quella aperta per ultima. Questa scheda puoi chiuderla, oppure continuare qui: l’altra andrà in pausa.'
            : 'Nessun movimento da 30 minuti: per non consumare letture, i turni hanno smesso di aggiornarsi. Tocca per riprendere, si aggiornano subito.';
        o.querySelector('.lp-btn').textContent = other ? 'Usa questa scheda' : 'Riprendi';
        o.querySelector('.lp-hint').style.display = other ? '' : 'none';
        o.querySelector('.lp-both').style.display = other ? '' : 'none';
        let n = 0; try { n = typeof pendingChangesCount === 'function' ? pendingChangesCount() : 0; } catch(e) {}
        const w = o.querySelector('.lp-warn');
        w.textContent = n ? `Hai ${n} modifiche non salvate in questa scheda: restano qui, riprendi per salvarle.` : '';
        w.style.display = n ? 'block' : 'none';
        o.classList.add('show');
    }
    // una scheda per computer: chi si apre (o preme "Usa questa scheda") lo dice alle altre, che vanno in pausa.
    // Prova e ufficiale hanno indirizzi diversi, quindi non si disturbano.
    let liveChan = null;
    const LIVE_KEY = 'turni_tab_' + location.pathname.replace(/index\.html$/, '');
    function liveTabsStart() {
        const onMsg = d => { if(d && d.type === 'claim' && d.id !== LIVE.tabId && !LIVE.keep) livePause('tab'); };
        try { if('BroadcastChannel' in window) { liveChan = new BroadcastChannel(LIVE_KEY); liveChan.onmessage = ev => onMsg(ev.data); } } catch(e) { liveChan = null; }
        if(!liveChan) window.addEventListener('storage', ev => { if(ev.key === LIVE_KEY && ev.newValue) { try { onMsg(JSON.parse(ev.newValue)); } catch(e) {} } });
        liveTabsClaim();
    }
    function liveTabsClaim() {
        const msg = { type:'claim', id: LIVE.tabId, t: Date.now() };
        if(liveChan) { try { liveChan.postMessage(msg); } catch(e) {} }
        else { try { localStorage.setItem(LIVE_KEY, JSON.stringify(msg)); } catch(e) {} }
    }

    let fbApp, db, fbAuth, fbReady = false, fbPersistence = false;
    // PROVA usa documenti propri dentro admin_config ("prova_settings", "prova_turni_…"),
    // così le prove non toccano l'app di produzione, che legge "settings". Per andare in
    // produzione basta DATA_NS = ''. Il documento "reperibilita" resta condiviso di proposito:
    // è quello in cui scrive anche il portale Richieste.
    const DATA_NS = 'prova_';
    function cfgRef(name) { return db.collection('admin_config').doc(DATA_NS + name); }

