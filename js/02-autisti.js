    // ═══ AUTISTI ════════════════════════════════════════════════════════
    // Questo file è GENERATO da port-autisti.js partendo dall'app Infermieri PROVA:
    // la base è la stessa, qui e nelle sostituzioni dello script ci sono solo le differenze.
    // Firebase autisti: la prova scrive SOLO documenti "prova_…" dentro admin_config.
    // Le collezioni dell'app autisti in uso si leggono soltanto (cessioni di reperibilità,
    // cambi turno approvati, impostazioni del portale) oppure non si toccano (sessioni).
    const TEAM_AS = true;
    // Riferimento "muto" al posto delle collezioni da non toccare: legge vuoto, non scrive nulla.
    function asNoopRef() {
        const empty = { exists:false, data: () => ({}), docs: [], size: 0, forEach() {}, docChanges: () => [] };
        const o = { doc: () => o, collection: () => o, where: () => o, orderBy: () => o, limit: () => o,
            set: () => Promise.resolve(), update: () => Promise.resolve(), delete: () => Promise.resolve(), add: () => Promise.resolve({ id: '' }),
            get: () => Promise.resolve(empty),
            onSnapshot: (a, b) => { const cb = typeof a === 'function' ? a : b; try { if(cb) cb(empty); } catch(e) {} return () => {}; } };
        return o;
    }

    // ── Excel autisti (turni.xlsx) ──────────────────────────────────────
    // Riga 1: mesi ("GENNAIO . 1"), riga 2: giorni (in colonna 1 l'anno). Poi per ogni autista
    // una riga con i turni e, sotto, una riga con le assenze (codici minuscoli). Righe 29-32:
    // reperibilità a fasce [00-07, 07-13, 13-20, 20-00]; più sotto la legenda dei codici.
    const AS_REP_ROWS = [29, 30, 31, 32];
    const AS_SKIP_NAMES = /CONGEDO|MALATTIA|RESIDUE|P\.S\.|RECUPERO|PERM\.|ASPETTATIVA|FEST\.|DISTACCO|1>7|P\/PN/;
    let asRepFasce = {};   // "YYYY-MM-DD" -> [4 nomi] come scritti nel file
    function asCellV(c) { return c && c.v !== undefined && c.v !== null ? c.v : ''; }
    function asParseWorkbook(raw) {
        const header = ['MESE', 'GIORNO', 'NOME'], people = [];
        for(let r = 3; r < raw.length; r++) {
            if(!raw[r] || AS_REP_ROWS.includes(r)) continue;
            const t = typeof asCellV(raw[r][1]) === 'string' ? asCellV(raw[r][1]).trim() : '';
            if(t.length <= 2 || AS_SKIP_NAMES.test(t.toUpperCase())) continue;
            const next = raw[r + 1] && raw[r + 1][1];
            people.push({ name: t.toUpperCase(), idx: r, sub: (!next || String(asCellV(next)).trim() === '') ? r + 1 : null });
            header.push(t.toUpperCase());
        }
        const out = [header], rowM = raw[1] || [], rowD = raw[2] || [];
        let year = parseInt(asCellV(rowD[1])) || new Date().getFullYear(), month = '', lastMi = -1;
        asRepFasce = {};
        for(let c = 2; c < rowD.length; c++) {
            const mTxt = asCellV(rowM[c]);
            if(typeof mTxt === 'string' && mTxt.trim()) { const up = mTxt.toUpperCase(), p = Object.keys(MONTH_MAP).find(m => up.includes(m)); if(p) month = p; }   // anche "GENNAIO 2027" scritto senza punto
            const dn = parseInt(asCellV(rowD[c])); if(!month || isNaN(dn) || dn < 1) continue;
            const mi = MONTH_MAP[month]; if(mi < lastMi) year++; lastMi = mi;   // gennaio dopo dicembre: anno dopo
            const line = [{ v: month }, { v: dn }, { v: '' }];
            people.forEach(p => {
                const main = raw[p.idx] ? raw[p.idx][c] : null, sub = p.sub && raw[p.sub] ? raw[p.sub][c] : null;
                line.push({ v: asCellV(main), subV: asCellV(sub), supV: '' });
            });
            out.push(line);
            const f = AS_REP_ROWS.map(rr => { const v = raw[rr] ? asCellV(raw[rr][c]) : ''; return v ? String(v).trim().toUpperCase() : ''; });
            if(f.some(Boolean)) asRepFasce[ymd(new Date(year, mi, dn))] = f;
        }
        return out;
    }
    // Codici assenza degli autisti in più rispetto agli infermieri (riga sotto il turno).
    const AS_EXTRA_SUB = { e:'ASPETTATIVA', l:'PERMESSO<br>LUTTO', s:'PERMESSO<br>SPORT', a:'PERMESSO<br>MATRIM.', k:'DISTACCO<br>SPECIALE' };

    // ── Dati dell'app autisti in uso (solo lettura) ─────────────────────
    let asProdCessioni = {}, asSwaps = {}, asBibbia = { autoApplyCambioTurno: false, autoSyncReperibilita: true };
    function asNorm(n) { const u = (n || '').toString().toUpperCase().trim().replace(/\.$/, ''); return u.startsWith('MICHELOT') ? 'MICHELOTTI' : u; }
    function asListenProduction() {
        if(!fbReady) return;
        // impostazioni del portale Richieste (cambi turno automatici, cessioni automatiche)
        db.collection('admin_config').doc('bibbia').onSnapshot(d => {
            asBibbia = Object.assign({ autoApplyCambioTurno: false, autoSyncReperibilita: true }, d.exists ? d.data() : {});
            repInvalidate(); refreshAfterRemoteOverrides(); if(typeof repAfterRemoteChange === 'function') repAfterRemoteChange();
        }, e => console.warn('Bibbia non leggibile:', e));
        // cessioni di reperibilità approvate dal portale Richieste autisti
        db.collection('reperibilita_overrides').onSnapshot(snap => {
            const m = {};
            snap.forEach(doc => {
                const x = doc.data(); if(!x || !x.date || x.slotIndex === undefined || x.slotIndex === null) return;
                const p = String(x.date).split('-'); if(p.length !== 3) return;
                m[ymd(new Date(+p[0], +p[1] - 1, +p[2])) + '_' + (+x.slotIndex)] = { newDriver: x.newDriver || '', originalDriver: x.originalDriver || '', requestId: x.requestId || '', id: doc.id, prod: true };
            });
            asProdCessioni = m; repInvalidate(); if(typeof repAfterRemoteChange === 'function') repAfterRemoteChange();
        }, e => console.warn('Cessioni reperibilità non leggibili:', e));
        // cambi turno approvati (si applicano solo se attivi nella Bibbia, come nell'app in uso)
        db.collection('turno_overrides').onSnapshot(snap => {
            const m = {};
            snap.forEach(doc => { const x = doc.data(); if(!x || !x.date || !x.driverA || !x.driverB) return; (m[x.date] = m[x.date] || []).push({ a: asNorm(x.driverA), b: asNorm(x.driverB) }); });
            asSwaps = m; refreshAfterRemoteOverrides();
        }, e => console.warn('Cambi turno non leggibili:', e));
    }
    function asApplySwaps() {
        if(!asBibbia.autoApplyCambioTurno || !Object.keys(asSwaps).length || !finalData.length) return;
        const header = finalData[0];
        for(let r = 1; r < finalData.length; r++) {
            const iso = repRowDate(r), sw = iso && asSwaps[iso]; if(!sw) continue;
            sw.forEach(s => {
                const ia = header.findIndex((h, i) => i >= 3 && asNorm(h) === s.a), ib = header.findIndex((h, i) => i >= 3 && asNorm(h) === s.b);
                if(ia < 3 || ib < 3) return;
                const row = finalData[r], t = row[ia];
                row[ia] = Object.assign({}, row[ib], { swapped: true }); row[ib] = Object.assign({}, t, { swapped: true });
            });
        }
    }
    // Passaggio a Firebase: le fasce dell'Excel diverse dal titolare diventano cessioni.
    function asExcelCessioni(tit) {
        const out = {}, now = new Date().toISOString();
        Object.keys(asRepFasce).forEach(date => asRepFasce[date].forEach((nm, s) => {
            const turn = s >= 2 ? date : repDateAdd(date, -1), t = tit[turn] || '', who = repToOrig(asNorm(nm));
            if(who && who !== t) out[date + '_' + s] = { date, slotIndex: s, timeSlot: REP_SLOTS[s].long, newDriver: who, originalDriver: t, requestId: 'excel', updatedAt: now };
        }));
        return out;
    }

    // ── Regole degli autisti ────────────────────────────────────────────
    // 9 autisti: 5 turnisti (P › M › N › S › R, blocchi di 5 settimane dal lunedì pomeriggio
    // al venerdì notte, poi tornano diurnisti) e 4 diurnisti (m 06:30-13:42, p 13:15-20:27,
    // 2 riposi a settimana). Sempre 2 ambulanze di mattina, 2 di pomeriggio, 1 di notte.
    // Reperibilità di 24 h dalle 13 dopo la mattina: il giorno dopo il turnista fa la notte,
    // il diurnista il pomeriggio.
    function asCoverageMsg(dd, k, n, name) {
        if(k === 'N' || n >= 2) return `${name}: ${n} su ${coverageMin[k]}`;
        const rest = drivers.filter(d => !d.hidden && ['R', 'r'].includes(workCode(dd.rowIdx, d.idx))).map(d => d.name);
        const who = rest.length ? ' (di riposo: ' + rest.join(', ') + ')' : ' (nessuno di riposo)';
        return n === 0 ? `${name}: nessuna ambulanza, richiamare dal riposo${who}` : `${name}: una sola ambulanza, richiamare qualcuno dal riposo${who}`;
    }
    function asExtraChecks(allDays, get, flag, active) {
        // solo dalla settimana in corso in poi: i mesi passati sono storia, non si pianificano più
        const w0 = new Date(); w0.setHours(0, 0, 0, 0); w0.setDate(w0.getDate() - ((w0.getDay() + 6) % 7));
        const days = allDays.filter(x => x.date >= w0);
        const R = repData();
        active.forEach(d => {
            days.forEach((dd, i) => {
                // Tolti (26/11/2026) i controlli "il blocco da turnista dovrebbe iniziare di lunedì /
                // finire di venerdì": i turni veri non seguono quella regola e davano una ventina di
                // falsi allarmi al mese, mentre "Da controllare" diceva che tornava tutto.
            });
        });
        // il reperibile fa la mattina; il giorno dopo notte (turnista) o pomeriggio (diurnista)
        days.forEach((dd, i) => {
            const who = R.tit[ymd(dd.date)]; if(!who || !days[i + 1]) return;
            const d = active.find(x => x.originalName === who); if(!d) return;
            const c = workCode(dd.rowIdx, d.idx), n = workCode(days[i + 1].rowIdx, d.idx);
            if(c === 'M' && n && n !== 'N') flag(days[i + 1].rowIdx, d.idx, 'dopo la reperibilità il turnista dovrebbe fare la notte');
            else if(c === 'm' && n && n !== 'p') flag(days[i + 1].rowIdx, d.idx, 'dopo la reperibilità il diurnista dovrebbe fare il pomeriggio');
        });
        // diurnisti: 2 riposi a settimana (solo settimane lun–dom intere da diurnista, senza assenze)
        active.forEach(d => {
            for(let i = 0; i + 6 < days.length; i++) {
                if(days[i].date.getDay() !== 1) continue;
                const wk = days.slice(i, i + 7), info = wk.map(x => computeDayInfo(x.rowIdx, d.idx));
                if(info.some(x => x.justified || !x.code)) continue;
                if(!info.every(x => /^[mprR]$/.test(x.code)) || !info.some(x => /^[mp]$/.test(x.code))) continue;
                const rest = info.filter(x => /^[rR]$/.test(x.code)).length;
                // dal 5/10/2026 i diurnisti lavorano 6 giorni da 6 ore: un riposo a settimana (prima 2)
                const need = ymd(wk[0].date) >= DIURNI_FROM[0].from ? 1 : 2;
                if(rest !== need) flag(wk[6].rowIdx, d.idx, `settimana da diurnista con ${rest} ${rest === 1 ? 'riposo' : 'riposi'} (ne ${need === 1 ? 'serve 1' : 'servono 2'})`);
            }
        });
    }
    // ── Contatore dei consumi Firebase ──────────────────────────────────
    // Conta le letture, le scritture e le eliminazioni che fa QUESTA app sul dispositivo (non le altre
    // app né le Functions) e ogni tanto le somma in admin_config/prova_consumi, per giorno "di Google"
    // (le quote gratuite si azzerano a mezzanotte della California) e per documento o raccolta.
    // È una stima: le letture servite dalla cache non costano e non si contano, ma Google a volte
    // ne fa pagare qualcuna in più (ascoltatori che ripartono). Il dato ufficiale è nella scheda
    // "Consumi Firebase" del pannello admin, letto da Google con l'accesso del proprietario.
    const CONS_DOC = 'consumi', CONS_KEEP_DAYS = 35, CONS_FLUSH_MS = 10 * 60e3;
    const CONS_DOC_COLS = ['admin_config'];          // qui si conta per documento, altrove per raccolta
    const consPT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
    const consDay = ms => consPT.format(new Date(ms == null ? Date.now() : ms));
    const CONS_HERE = { r: 0, w: 0, x: 0, since: Date.now(), keys: {} };   // questo dispositivo da quando è aperta l'app
    let consPend = {}, consDirty = false, consFlushing = null;
    function consKey(path) {
        const seg = String(path || '?').split('/').filter(Boolean);
        const col = seg.length % 2 === 0 ? seg[seg.length - 2] : seg[seg.length - 1];
        // i nomi dei documenti con date e numeri (log_2026-10-25, turni_2026-03) diventano uno solo
        const k = seg.length % 2 === 0 && CONS_DOC_COLS.includes(col) ? String(seg[seg.length - 1]).replace(/\d{4}-\d{2}-\d{2}/g, '#data').replace(/\d+/g, '#') : col;
        return String(k || '?').replace(/[^A-Za-z0-9_#-]+/g, '-').slice(0, 60) || '?';
    }
    function consPath(ref) {
        try { return ref.path || (ref._delegate && ref._delegate._query && ref._delegate._query.path.canonicalString()) || '?'; } catch(e) { return '?'; }
    }
    function consAdd(kind, path, n) {
        if(!n) return;
        const k = consKey(path), day = consDay(), P = consPend[day] || (consPend[day] = { r: {}, w: {}, x: {} });
        P[kind][k] = (P[kind][k] || 0) + n;
        CONS_HERE[kind] += n; const h = CONS_HERE.keys[k] || (CONS_HERE.keys[k] = { r: 0, w: 0, x: 0 }); h[kind] += n;
        // il salvataggio del contatore si conta ma non fa ripartire un altro salvataggio
        if(k !== DATA_NS + CONS_DOC) consDirty = true;
    }
    (function consPatch() {
        const F = firebase.firestore; if(!F || !F.DocumentReference || !F.Query) return;
        const DR = F.DocumentReference.prototype, Q = F.Query.prototype;
        const wrapW = (P, m, kind, refArg) => { const o = P && P[m]; if(typeof o !== 'function') return;
            P[m] = function(...a) { try { consAdd(kind, consPath(refArg ? a[0] : this), 1); } catch(e) {} return o.apply(this, a); }; };
        wrapW(DR, 'set', 'w'); wrapW(DR, 'update', 'w'); wrapW(DR, 'delete', 'x');
        if(F.CollectionReference) { const o = F.CollectionReference.prototype.add; if(o) F.CollectionReference.prototype.add = function(...a) { try { consAdd('w', this.path, 1); } catch(e) {} return o.apply(this, a); }; }
        [F.WriteBatch, F.Transaction].forEach(C => { if(C) { wrapW(C.prototype, 'set', 'w', 1); wrapW(C.prototype, 'update', 'w', 1); wrapW(C.prototype, 'delete', 'x', 1); } });
        if(F.Transaction) { const o = F.Transaction.prototype.get; F.Transaction.prototype.get = function(ref) { try { consAdd('r', consPath(ref), 1); } catch(e) {} return o.apply(this, arguments); }; }
        // letture: quelle arrivate dalla cache del telefono non costano; una ricerca vuota costa 1
        const fresh = s => s && !(s.metadata && s.metadata.fromCache);
        const dg = DR.get; DR.get = function(...a) { const p = consPath(this); return dg.apply(this, a).then(s => { if(fresh(s)) consAdd('r', p, 1); return s; }); };
        const qg = Q.get; Q.get = function(...a) { const p = consPath(this); return qg.apply(this, a).then(s => { if(fresh(s)) consAdd('r', p, Math.max(1, s.size)); return s; }); };
        // ascoltatori: la prima risposta del server costa tutti i documenti, poi solo quelli cambiati
        const wrapL = (P, isQ) => { const o = P.onSnapshot; P.onSnapshot = function(...a) {
            const p = consPath(this); let first = true;
            const count = s => { if(!fresh(s) || s.metadata.hasPendingWrites) return; consAdd('r', p, isQ ? (first ? Math.max(1, s.size) : s.docChanges().length) : 1); first = false; };
            const i = a.findIndex(x => typeof x === 'function' || (x && typeof x === 'object' && typeof x.next === 'function'));
            if(i >= 0) { const h = a[i];
                if(typeof h === 'function') a[i] = function(s) { try { count(s); } catch(e) {} return h.apply(this, arguments); };
                else a[i] = { next: s => { try { count(s); } catch(e) {} return h.next(s); }, error: h.error && (e => h.error(e)), complete: h.complete && (() => h.complete()) };
            }
            return o.apply(this, a);
        }; };
        wrapL(DR, false); wrapL(Q, true);
    })();
    // salva le somme (una sola scrittura, e solo se c'è stato qualcosa da contare). Con la rete assente la
    // scrittura resta in coda sul dispositivo e parte dopo; il motore aspetta al massimo qualche secondo.
    function consFlush(waitMs) {
        if(consFlushing || !consDirty || !fbReady || !db || !fbAuth || !fbAuth.currentUser) return consFlushing || Promise.resolve();
        const pend = consPend; consPend = {}; consDirty = false;
        const inc = firebase.firestore.FieldValue.increment, src = SERVER_MODE ? 'motore' : 'app', days = {};
        Object.entries(pend).forEach(([day, P]) => {
            const D = days[day] = { tot: {}, src: { [src]: {} } };
            ['r', 'w', 'x'].forEach(kind => {
                const e = Object.entries(P[kind]); if(!e.length) return;
                let t = 0; D[kind] = {}; e.forEach(([k, n]) => { D[kind][k] = inc(n); t += n; });
                D.tot[kind] = inc(t); D.src[src][kind] = inc(t);
            });
        });
        const w = cfgRef(CONS_DOC).set({ days, updatedAt: Date.now() }, { merge: true }).catch(e => console.warn('Contatore consumi:', e && (e.code || e.message)));
        consFlushing = Promise.race([w, new Promise(r => setTimeout(r, waitMs || 4000))]).finally(() => { consFlushing = null; });
        return consFlushing;
    }
    setInterval(() => consFlush(), CONS_FLUSH_MS);
    document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') consFlush(); });
    window.addEventListener('pagehide', () => consFlush());

    try {
        fbApp = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        liveInstall();   // gli ascolti Firebase passano da qui, così la pausa li può staccare e riattaccare
        // memoria offline: le scritture fatte senza rete restano in coda sul dispositivo
        // (anche chiudendo l'app) e partono appena torna la connessione
        try { db.enablePersistence({ synchronizeTabs:true }).then(() => { fbPersistence = true; }).catch(e => console.warn('Memoria offline non disponibile:', e && e.code)); } catch(e) {}
        fbAuth = firebase.auth();
        fbReady = true;
    } catch(e) { console.error("Errore inizializzazione Firebase:", e); }

    // Password: nella pagina ci sono solo le impronte (SHA-256), mai le password in chiaro (26/11/2026).
    const ADMIN_PW_H = ['a4aaff931382bae0a9c9c33f41b072989c2c8ef5b69a2a3f7af7a97376810aaf'];
    async function pwHash(pw) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pw118|' + String(pw || ''))); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
    async function pwMatch(pw, list) { try { return list.includes(await pwHash(pw)); } catch(e) { return false; } }
    const DEFAULT_COLORS = {
        "--primary":"#1d4ed8","--c-M":"#c3d9fb","--c-P":"#e3eeff","--c-N":"#4a76c4","--c-R":"#ffffff","--c-SM":"#9dbbe8",
        "--bg-ferie":"#f97316","--bg-rec":"#be185d","--bg-cong":"#facc15","--bg-mal":"#dc2626","--bg-nl":"#cceef2",
        "--bg-perm":"#22c55e","--bg-ng":"#009fd6","--bg-stu":"#ffffff","--bg-pn":"#166534","--bg-coord":"#ffffff"
    };
    let nameOverrides = Object.assign({}, DEFAULT_NAME_OVERRIDES_BAKED);
    let colorOverrides = Object.assign({}, DEFAULT_COLORS_BAKED);
    let scheduleOverride = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE_OVERRIDE_BAKED));
    let welcomeConfig = Object.assign({}, DEFAULT_WELCOME_BAKED);
    let customAnnouncements = JSON.parse(JSON.stringify(DEFAULT_ANNOUNCEMENTS_BAKED));
    let announcementQueue = [];
    // Operatori gestiti dall'Area Coordinatore (ordine colonne, nascosti, rimossi, aggiunti, ore contratto)
    let operatorConfig = { order:[], hidden:{}, removed:{}, added:[], contract:{}, allow:{} };
    let excelParsedData = [];              // dati letti dal file Excel, senza colonne aggiunte né modifiche
    applyColorOverrides();
    Object.assign(SCHEDULE, scheduleOverride.SCHEDULE || {});
    Object.assign(SCHEDULE_DIURNI, scheduleOverride.SCHEDULE_DIURNI || {});

    // ── Sessione / tracciamento accessi ─────────────────────────────────────
    // Ogni apertura dell'app genera una sessione NUOVA (non riutilizza mai una
    // sessione precedente), così la durata mostrata in Admin è sempre corretta
    // e non eredita mai il tempo di una visita passata.
    let sessionId = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,10);
    let sessionStartTime = Date.now();
    let currentViewLabel = "Avvio app";
    let sessionViewHistory = [];
    let adminAccessUnsub = null, adminConfigApplyBusy = false;

    // ── Identità utente ("Chi sei?") ─────────────────────────────────────────
    // COORDINATORE: account del coordinatore (invece di "Ospite"). TEST: operatore finto per le prove,
    // con una colonna sua che vede solo chi entra come TEST, fuori da ogni conteggio.
    // Tutti e due si scelgono con la password "coord" (chiesta una volta sola su ogni telefono).
    const COORD_ID = 'COORDINATORE', TEST_OP = 'TEST';
    const PW_IDENTITIES = [COORD_ID, TEST_OP];
    const ID_PW_H = ['891b6e0c4ece0366a19496170fe1d5945195deff862cbccc058dcea350963bb2', '4402503b9ecdaa8a6a505ff84dab56a22e076cb373f9106cb2458d6e3c18569a'];
    function identityPwOk(pw) { return pwMatch(String(pw || '').trim().toLowerCase(), ID_PW_H); }
    function identityPwRemembered(name) { try { return localStorage.getItem('id_pw_ok_' + name) === '1'; } catch(e) { return false; } }
    const IDENTITY_EXTRA_OPTIONS = ["MOSCA", "CENTRALE", "Ospite", TEST_OP, COORD_ID];   // MOSCA: il coordinatore (non è un autista)
    // in "Chi sei?" in fondo, in gruppi: prima Centrale e Ospite, poi TEST e COORDINATORE
    const IDENTITY_GROUPS = { "CENTRALE": 'Altri accessi', [TEST_OP]: 'Con password' };

    // ── Finestra password (COORDINATORE / TEST) ──
    let pwAskCtx = null;
    function pwAsk(o) {
        return new Promise(resolve => {
            if(pwAskCtx) pwAskCtx.resolve(false);
            pwAskCtx = Object.assign({}, o, { resolve });
            document.getElementById('pw-ask-ico').textContent = o.icon || 'lock';
            document.getElementById('pw-ask-title').textContent = o.title || 'Password';
            document.getElementById('pw-ask-text').textContent = o.text || '';
            document.getElementById('pw-ask-err').textContent = '';
            const inp = document.getElementById('pw-ask-input'); inp.value = '';
            document.getElementById('pw-ask').style.display = 'flex';
            setTimeout(() => inp.focus(), 50);
        });
    }
    async function pwAskSubmit() {
        if(!pwAskCtx) return;
        const v = document.getElementById('pw-ask-input').value;
        if(await pwAskCtx.check(v)) { pwAskClose(true); return; }
        document.getElementById('pw-ask-err').textContent = 'Password sbagliata';
        const c = document.getElementById('pw-ask-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
        vibrate();
    }
    function pwAskClose(ok) {
        document.getElementById('pw-ask').style.display = 'none';
        const c = pwAskCtx; pwAskCtx = null; if(c) c.resolve(!!ok);
    }

    // ── Password per aprire l'app (privacy) ──
    // Decisa nell'area admin (settings.appGate = { on, hash, ver, by, at }): si salva solo l'impronta (SHA-256),
    // mai la password. Ogni telefono la chiede una volta e poi la ricorda (localStorage); se l'admin la cambia,
    // la richiede a tutti. Non vale per il motore (?server=1).
    // NB: è un blocco della pagina, non dei dati: chi sa usare Firebase può ancora leggerli (vedi area admin).
    // 18/11/2026: schermata password TOLTA per ora (compariva un attimo all'apertura anche se spenta).
    // Per riaccenderla basta rimettere true: tutto il resto (admin, impostazioni) è rimasto.
    const GATE_ENABLED = false;
    const GATE_KEY = 'app_gate_' + DATA_NS, GATE_OK_KEY = 'app_gate_ok_' + DATA_NS;
    let appGate = null;
    let appGatePw = '';
    let gateSessionHash = '';   // sbloccato solo per questa apertura (chi ha appena impostato la password in admin): alla prossima apertura la chiede anche a lui   // password in chiaro (settings.appGate.pw) solo per mostrarla nell'area admin; non va nella copia del telefono
    async function gateHash(pw) {
        const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('turni118|' + String(pw || '').trim().toLowerCase()));
        return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    function gateOkHash() { try { return localStorage.getItem(GATE_OK_KEY) || ''; } catch(e) { return ''; } }
    function gateLocked() { return GATE_ENABLED && !SERVER_MODE && !!(appGate && appGate.on && appGate.hash) && gateOkHash() !== appGate.hash && gateSessionHash !== appGate.hash; }
    function gateApply(g) {
        const prevSig = JSON.stringify([appGate, appGatePw]);
        appGatePw = (g && typeof g === 'object' && typeof g.pw === 'string') ? g.pw : '';
        gateWaitEnd();
        appGate = (g && typeof g === 'object') ? { on: !!g.on, hash: g.hash || '', ver: g.ver || 0, by: g.by || '', at: g.at || '' } : null;
        try { localStorage.setItem(GATE_KEY, JSON.stringify(appGate)); } catch(e) {}
        const el = document.getElementById('app-gate'); if(!el) return;
        // area admin aperta: si aggiorna se la password è cambiata (senza cancellare quello che si sta scrivendo)
        const ai = document.getElementById('adm-gate-pw');
        if(document.getElementById('adm-password') && prevSig !== JSON.stringify([appGate, appGatePw]) && !(ai && ai.value)) try { admRenderGate(); } catch(e) {}
        const lock = gateLocked(), was = el.style.display === 'flex';
        el.style.display = lock ? 'flex' : 'none';
        document.documentElement.style.overflow = lock ? 'hidden' : '';
        if(lock && !was) { document.getElementById('app-gate-input').value = ''; document.getElementById('app-gate-err').textContent = ''; setTimeout(() => { const i = document.getElementById('app-gate-input'); if(i) i.focus(); }, 80); }
    }
    async function gateSubmit() {
        if(!appGate || !appGate.hash) { gateApply(appGate); return; }
        const inp = document.getElementById('app-gate-input');
        const h = await gateHash(inp.value);
        if(h === appGate.hash) {
            try { localStorage.setItem(GATE_OK_KEY, h); } catch(e) {}
            vibrate(); gateApply(appGate);
            return;
        }
        document.getElementById('app-gate-err').textContent = 'Password sbagliata';
        const c = document.getElementById('app-gate-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
        inp.select(); vibrate();
    }
    const COORD_DEFAULT = 'MOSCA';   // coordinatore se nelle impostazioni non ce n'è un altro
    const PS_NAME = 'PC Pronto Soccorso';   // account PC Pronto Soccorso degli infermieri: negli autisti non è tra i nomi di "Chi sei?"
    // ?server=1: l'app viene aperta dal motore su GitHub solo per leggere i turni (niente sessioni, popup o scritture).
    const SERVER_MODE = new URLSearchParams(location.search).has('server');
    if(GATE_ENABLED && !SERVER_MODE) { try { const g = JSON.parse(localStorage.getItem(GATE_KEY) || 'null'); if(g) gateApply(g); } catch(e) {} }   // blocco subito, prima che arrivino le impostazioni
    // Prima apertura su questo telefono: non si sa ancora se serve la password, quindi i turni restano coperti
    // finché non arrivano le impostazioni (senza, si vedevano i turni per qualche secondo prima della password).
    if(GATE_ENABLED && !SERVER_MODE) { let known = true; try { known = localStorage.getItem(GATE_KEY) !== null; } catch(e) {}
        if(!known) { document.documentElement.classList.add('gate-wait'); setTimeout(gateWaitEnd, 12000); } }   // 12 s: senza rete non si resta bloccati
    function gateWaitEnd() { document.documentElement.classList.remove('gate-wait'); }
    // configurazione dell'app (le due prove hanno lo stesso codice degli account, cambia solo questo)
    const ACCT_TEAM = 'aut', ACCT_OTHER = 'inf';
    const ACCT_TEAMS = { inf: { one:'infermiere', many:'infermieri', Many:'Infermieri', Cap:'Infermiere', ico:'medical_services' }, aut: { one:'autista', many:'autisti', Many:'Autisti', Cap:'Autista', ico:'local_shipping' } };
    const ACCT_PW_NAMES = [COORD_ID, TEST_OP];
    const ACCT_PW_ICONS = {};
    const ACCT_EXTRA_NAMES = IDENTITY_EXTRA_OPTIONS.filter(n => n !== 'Ospite' && n !== 'CENTRALE' && !ACCT_PW_NAMES.includes(n));   // MOSCA (senza colonna)
    // accessi completi condivisi (password unica, valgono in tutte e due le app): nome nell'elenco → nome usato in questa app
    const ACCT_SHARED_ID = { 'CENTRALE 118': 'CENTRALE', 'PRONTO SOCCORSO': 'PRONTO SOCCORSO' };
    const ACCT_IDENTITY_KEY = 'infermieri_identity_name';
    const ACCT_OTHER_URL = 'https://centrale118rsm-code.github.io/Turni-Infermieri-PROVA/';   // la prova infermieri
    // l'elenco degli account sta nel Firebase degli infermieri: qui si apre un secondo collegamento solo per quello
    const ACCT_FB_CONFIG = { apiKey: "AIzaSyDCycpsVJus8Mwd-AqaPORZIrFUIyo00VQ", authDomain: "creazione-turni-118.firebaseapp.com", projectId: "creazione-turni-118", storageBucket: "creazione-turni-118.firebasestorage.app", messagingSenderId: "389097635025", appId: "1:389097635025:web:331564551f0e5190a199f0" };
    let acctFb = null, acctDb = null, acctAuthX = null, acctFbOk = false;
    function acctRegRef() { return acctDb.collection('infermieri26_config').doc('prova_settings'); }
    function acctRegOk() { return acctFbOk; }
    function acctIdsCol() { return acctDb.collection('infermieri26_identities'); }
    function acctUid() { return acctAuthX && acctAuthX.currentUser ? acctAuthX.currentUser.uid : null; }
    function acctFbInit() {
        if(acctFb || SERVER_MODE || !ACCT_ENABLED || typeof firebase === 'undefined') return;
        try {
            acctFb = firebase.initializeApp(ACCT_FB_CONFIG, 'acct118'); acctDb = acctFb.firestore(); acctAuthX = acctFb.auth(); acctFbOk = true;
            acctAuthX.signInAnonymously().catch(e => console.warn('Accesso elenco account:', e && e.code)).finally(() => {
                acctRegRef().onSnapshot(d => { const x = d.exists ? d.data() : {}; acctApply(x[ACCT_FIELD] || null, d.metadata.fromCache); }, e => console.warn('Elenco account:', e && e.code));
            });
        } catch(e) { console.error('Elenco account:', e); }
    }
    // ── Account personali (solo le PROVE infermieri e autisti, 18-19/11/2026) ──────────────
    // Ogni app ha nella schermata d'accesso solo i suoi nomi (infermieri qui, autisti là). Primo accesso con la
    // password provvisoria, poi ognuno sceglie la sua. Fatto l'accesso il telefono resta collegato per sempre:
    // a chi è già collegato la schermata non compare mai (la decide lo script in <head> prima del primo disegno).
    // L'accesso vale per TUTTE E DUE le app (stessa memoria, chiave ACCT_KEY senza prefisso): chi è entrato
    // nell'altra app qui vede i turni in sola lettura. Sull'iPhone le app installate hanno memorie separate:
    // il tasto che apre l'altra app porta con sé l'accesso (#acct=…), oppure si entra col link in fondo.
    // FAMILIARE: codice di 6 cifre creato dall'operatore dal suo menu: solo i suoi turni, in sola lettura.
    // Elenco unico degli account (le due app) nel Firebase infermieri: infermieri26_config/prova_settings
    //   accountsProva = { inf:{NOME:rec}, aut:{NOME:rec}, roster:{inf:[nomi], aut:[nomi]} }
    //   rec = { h (impronta SHA-256, mai la password), at, by, first (nome), blocked, fam:{h, at} }
    // L'ufficiale infermieri legge lo stesso documento ma ignora questo campo: lì l'app resta libera.
    // Telefoni collegati: infermieri26_identities/{uid} con acctV:1 (Firebase infermieri).
    // NB: è un blocco della pagina, non dei dati (le regole Firebase non sono cambiate).
    const ACCT_ENABLED = true;
    const ACCT_FIELD = 'accountsProva';
    const ACCT_KEY = 'acct118_prova';   // stessa chiave nelle due app e nello script in <head>
    const ACCT_FIRST_PW = '118';
    // CENTRALE 118 e PRONTO SOCCORSO: password unica (maiuscole contano), solo l'impronta qui; accesso completo nelle due app
    const ACCT_SHARED = Object.keys(ACCT_SHARED_ID), ACCT_SHARED_H = '0b08d46632a180894a1362372dd7987a92fc5bee9e64546e50395c6c8598683a';
    const ACCT_SHARED_ICONS = { 'CENTRALE 118': 'support_agent', 'PRONTO SOCCORSO': 'local_hospital' };
    function acctIdOf(a) { return a && a.team === 'all' ? (ACCT_SHARED_ID[a.name] || a.name) : (a && a.name); }
    const ACCT_T = ACCT_TEAMS[ACCT_TEAM], ACCT_O = ACCT_TEAMS[ACCT_OTHER];
    function acctRead() { try { const a = JSON.parse(localStorage.getItem(ACCT_KEY) || 'null'); return a && a.name && (ACCT_TEAMS[a.team] || a.team === 'all') ? a : null; } catch(e) { return null; } }
    // own = operatore di questa app · other = entrato dall'altra app (sola lettura) · fam = familiare (sola lettura) · need = serve l'accesso
    function acctKind(a) { if(!a) return 'need'; if(a.team === 'all') return ACCT_SHARED_ID[a.name] ? 'own' : 'need'; if(a.view === 'fam') return a.team === ACCT_TEAM ? 'fam' : 'need'; return a.team === ACCT_TEAM ? 'own' : 'other'; }
    const ACCT_ME0 = acctRead();
    let acctNeed = ACCT_ENABLED && !SERVER_MODE && acctKind(ACCT_ME0) === 'need';
    const ACCT_RO = (!ACCT_ENABLED || SERVER_MODE || acctNeed || acctKind(ACCT_ME0) === 'own') ? null : ACCT_ME0;
    (function() { const h = document.documentElement; h.classList.toggle('acct-need', acctNeed); h.classList.toggle('acct-ro', !!ACCT_RO); h.classList.toggle('acct-fam', !!(ACCT_RO && ACCT_RO.view === 'fam')); })();
    function acctMine() { const a = acctRead(); return a && acctKind(a) === 'own' ? a : null; }
    let acctReg = {}, acctLoaded = false, acctSel = null, acctStep = 'list', acctStartupPending = false, acctBusy = false;
    let acctListTeam = ACCT_TEAM, acctFamMode = false, acctDevSent = false, acctLinkTok = '';
    function acctMap(t) { const m = acctReg && acctReg[t]; return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; }
    function acctRec(t, n) { const r = acctMap(t)[n]; return r && typeof r === 'object' ? r : {}; }
    async function acctSha(txt) {
        const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
        return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    function acctHash(t, name, pw) { return acctSha('acct118|' + t + '|' + name + '|' + String(pw || '').trim().toLowerCase()); }
    function famHash(t, name, code) { return acctHash(t, 'fam|' + name, code); }
    function acctFirst(t, n) { const r = acctRec(t, n); return typeof r.first === 'string' ? r.first.trim() : ''; }
    function acctSortNames(arr) { return [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'it', { sensitivity:'base' })); }
    // i nomi di questa app: le colonne del calendario (anche quelle nascoste) più chi non ha colonna
    function acctOwnNames(onlyLive) {
        const set = new Set();
        try { (drivers || []).forEach(d => { if(d && d.name && !d.test) set.add(d.name); }); } catch(e) {}
        if(!set.size && !onlyLive && typeof operatorConfig !== 'undefined' && operatorConfig) {
            (operatorConfig.baseNames || []).forEach(n => set.add(n));
            (operatorConfig.added || []).forEach(o => o && o.name && set.add(o.name));
            Object.keys(operatorConfig.removed || {}).forEach(n => set.delete(n));
        }
        if(!set.size) return [];
        ACCT_EXTRA_NAMES.forEach(n => set.add(n));
        return acctSortNames([...set]);
    }
    function acctRoster(t) { const r = acctReg && acctReg.roster && acctReg.roster[t]; return Array.isArray(r) ? r.filter(x => typeof x === 'string') : []; }
    function acctTeamNames(t) { if(t === ACCT_TEAM) { const own = acctOwnNames(); return own.length ? own : acctRoster(t); } return acctSortNames(acctRoster(t)); }
    // ogni app scrive l'elenco dei suoi nomi, così l'altra app può mostrarli (accesso dal link in fondo, admin)
    function acctRosterSync() {
        if(!ACCT_ENABLED || SERVER_MODE || !acctLoaded || !acctRegOk()) return;
        const own = acctOwnNames(true); if(!own.length || JSON.stringify(own) === JSON.stringify(acctRoster(ACCT_TEAM))) return;
        acctRegRef().update(new firebase.firestore.FieldPath(ACCT_FIELD, 'roster', ACCT_TEAM), own).catch(() => {});
    }
    function acctSaveRec(t, n, rec) {
        if(!acctRegOk()) return Promise.reject(new Error('offline'));
        const clean = {}; Object.keys(rec).forEach(k => { if(rec[k] !== undefined && rec[k] !== null && rec[k] !== '' && rec[k] !== false) clean[k] = rec[k]; });
        const ref = acctRegRef();
        return ref.update(new firebase.firestore.FieldPath(ACCT_FIELD, t, n), clean).catch(e => {
            if(e && e.code === 'not-found') return ref.set({ [ACCT_FIELD]: { [t]: { [n]: clean } } }, { merge:true });
            throw e;
        });
    }
    // Con la memoria offline di Firebase, se i dati in memoria sono uguali a quelli del server lo snapshot dal server
    // non arriva mai (fromCache resta vero): l'elenco va chiesto al server una volta, direttamente.
    let acctSrvP = null;
    function acctServerLoad() {
        if(acctLoaded) return Promise.resolve(true);
        if(!acctSrvP) acctSrvP = Promise.resolve().then(() => { if(!acctRegOk()) throw new Error('offline'); return acctRegRef().get({ source: 'server' }); })
            .then(d => { const x = d.exists ? (d.data() || {}) : {}; acctApply(x[ACCT_FIELD] || null, false); return true; })
            .catch(e => { console.warn('Elenco account dal server:', e && (e.code || e.message)); return false; })
            .finally(() => { setTimeout(() => { acctSrvP = null; }, 3000); });
        return acctSrvP;
    }
    function acctApply(map, fromCache) {
        if(!ACCT_ENABLED || SERVER_MODE) return;
        acctReg = (map && typeof map === 'object') ? map : {};
        if(fromCache && !acctLoaded) acctServerLoad();
        if(!fromCache) {
            acctLoaded = true;
            const a = acctRead(), k = acctKind(a);
            if(k === 'fam') { const r = acctRec(a.team, a.famOf); if(r.blocked || !r.fam || r.fam.at !== a.famAt) { acctLogout('fam'); return; } }
            else if((k === 'own' || k === 'other') && a.team !== 'all') { if(acctRec(a.team, a.name).blocked) { acctLogout('blocked'); return; } }
            acctRosterSync(); acctLinkPrep(); acctTryHandoff(); acctRegisterDevice();
        }
        if(acctNeed) acctRenderList();
        if(typeof admTab !== 'undefined' && admTab === 'account' && document.getElementById('adm-accounts') && !document.querySelector('#adm-accounts input:focus')) try { admRenderAccounts(); } catch(e) {}
    }
    // ── schermata d'accesso ──
    function acctMono(n) {
        const ico = n === COORD_ID ? 'supervisor_account' : n === TEST_OP ? 'science' : ACCT_PW_ICONS[n] || ACCT_SHARED_ICONS[n] || '';
        if(ico) return `<span class="acct-mono" style="background:#334155"><span class="material-icons-round">${ico}</span></span>`;
        let h = 0; for(const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        const hues = [214, 199, 168, 262, 330, 24, 4, 142, 228, 286];
        return `<span class="acct-mono" style="background:hsl(${hues[h % hues.length]} 62% 42%)">${esc(n.substring(0, 2).toUpperCase())}</span>`;
    }
    function acctRenderList() {
        const box = document.getElementById('acct-names'); if(!box || !acctNeed) return;
        const t = acctListTeam, T = ACCT_TEAMS[t], own = t === ACCT_TEAM;
        document.querySelector('#acct-step-list h1').textContent = acctFamMode ? 'Di chi vuoi vedere i turni?' : own ? 'Chi sta entrando?' : `Sei un ${T.one}?`;
        document.querySelector('#acct-step-list .acct-kicker').textContent = acctFamMode ? 'Accesso familiare' : 'Accesso ' + T.many;
        const lt = document.getElementById('acct-list-text');
        if(!lt.dataset.msg) lt.textContent = acctFamMode ? `Scegli il nome del tuo familiare: poi ti serve il codice che crea dal suo menu. Vedrai solo i suoi turni.`
            : own ? 'Scegli il tuo nome. Lo fai una volta sola: poi questo telefono resta collegato e l’app si apre direttamente sui turni.'
            : `Entra con il tuo account degli ${T.many}: qui vedrai i turni degli ${ACCT_T.many} in sola lettura.`;
        document.getElementById('acct-alt').innerHTML = acctFamMode
            ? `<button onclick="acctFamStart(false)"><span class="material-icons-round">arrow_back</span>Non sono un familiare</button>`
            : (own ? `<button onclick="acctFamStart(true)"><span class="material-icons-round">family_restroom</span>Sono un familiare</button><button onclick="acctSwitchTeam('${ACCT_OTHER}')"><span class="material-icons-round">${ACCT_O.ico}</span>Sei un ${ACCT_O.one}? Entra con il tuo account</button>`
                   : `<button onclick="acctSwitchTeam('${ACCT_TEAM}')"><span class="material-icons-round">arrow_back</span>Torna agli ${ACCT_T.many}</button>`);
        const names = acctTeamNames(t);
        if(!names.length) { box.innerHTML = `<div class="acct-wait">${own || !acctLoaded ? 'Carico i nomi…' : 'Elenco non ancora disponibile: riprova più tardi.'}</div>`; return; }
        const q = ((document.getElementById('acct-search') || {}).value || '').trim().toLowerCase();
        const hit = n => !q || (n + ' ' + acctFirst(t, n)).toLowerCase().includes(q);
        const btn = n => `<button class="acct-name" onclick="acctPick(this.dataset.n)" data-n="${esc(n)}">${acctMono(n)}<span class="acct-nm"><b>${esc(n)}</b>${acctFirst(t, n) ? `<span>${esc(acctFirst(t, n))}</span>` : ACCT_PW_NAMES.includes(n) ? '<span>Password coordinatore</span>' : ACCT_SHARED.includes(n) ? '<span>Infermieri e autisti</span>' : ''}</span><span class="material-icons-round acct-go">chevron_right</span></button>`;
        const main = names.filter(hit), extra = (own && !acctFamMode) ? ACCT_SHARED.concat(ACCT_PW_NAMES).filter(hit) : [];
        box.innerHTML = main.map(btn).join('')
            + (extra.length ? '<div class="acct-grp">Altri accessi</div>' + extra.map(btn).join('') : '')
            + (!main.length && !extra.length ? '<div class="acct-wait">Nessun nome trovato</div>' : '');
    }
    function acctSwitchTeam(t) { vibrate(); acctListTeam = t; acctFamMode = false; const q = document.getElementById('acct-search'); if(q) q.value = ''; acctRenderList(); document.getElementById('acct-gate').scrollTop = 0; }
    function acctFamStart(on) { vibrate(); acctFamMode = !!on; acctListTeam = ACCT_TEAM; const q = document.getElementById('acct-search'); if(q) q.value = ''; acctRenderList(); document.getElementById('acct-gate').scrollTop = 0; }
    function acctEye() {
        const show = document.getElementById('acct-pw').type === 'password';
        ['acct-pw', 'acct-pw2'].forEach(id => document.getElementById(id).type = show ? 'text' : 'password');
        document.getElementById('acct-eye-ico').textContent = show ? 'visibility_off' : 'visibility';
    }
    function acctShowStep(step) {
        document.getElementById('acct-step-list').hidden = step !== 'list';
        document.getElementById('acct-step-pw').hidden = step === 'list';
        document.getElementById('acct-gate').scrollTop = 0;
    }
    function acctPick(n) {
        vibrate(); acctSel = n;
        const t = acctListTeam, isPw = ACCT_PW_NAMES.includes(n) && t === ACCT_TEAM, isSh = ACCT_SHARED.includes(n) && t === ACCT_TEAM && !acctFamMode, r = acctRec(t, n);
        const av = document.getElementById('acct-av'), mono = acctMono(n);
        av.innerHTML = mono.replace(/^<span[^>]*>|<\/span>$/g, ''); av.style.background = (mono.match(/background:([^"]+)"/) || [])[1] || '';
        document.getElementById('acct-who-name').textContent = n;
        document.getElementById('acct-who-sub').textContent = acctFamMode ? 'Accesso familiare · solo i suoi turni' : isSh ? 'Accesso completo · infermieri e autisti' : isPw ? 'Account con la password del coordinatore' : (acctFirst(t, n) || ACCT_TEAMS[t].Cap);
        acctSetPwMode(acctFamMode ? 'fam' : isSh ? 'shared' : isPw ? 'coord' : 'pw', r);
        acctShowStep('pw');
        setTimeout(() => { const i = document.getElementById('acct-pw'); if(i) i.focus(); }, 60);
    }
    function acctSetPwMode(mode, r) {
        const p1 = document.getElementById('acct-pw'), p2 = document.getElementById('acct-pw2');
        p1.value = ''; p2.value = ''; document.getElementById('acct-pw2-wrap').hidden = mode !== 'new';
        p1.type = p2.type = 'password'; document.getElementById('acct-eye-ico').textContent = 'visibility';
        p1.inputMode = mode === 'fam' ? 'numeric' : '';
        document.getElementById('acct-lbl1').textContent = mode === 'new' ? 'Nuova password' : mode === 'fam' ? 'Codice familiare' : 'Password';
        document.getElementById('acct-steps').innerHTML = (mode === 'coord' || mode === 'fam' || mode === 'shared') ? '' : '<i class="on"></i><i class="on"></i>' + (mode === 'new' ? '<i class="on"></i>' : '<i></i>');
        document.getElementById('acct-err').textContent = '';
        const ok = document.getElementById('acct-ok'); ok.disabled = false; document.getElementById('acct-ok-l').textContent = mode === 'new' ? 'Salva ed entra' : 'Entra';
        const t = document.getElementById('acct-pw-text'), info = document.getElementById('acct-info');
        info.hidden = false;
        if(mode === 'coord') { t.textContent = 'Inserisci la password del coordinatore.'; info.hidden = true; }
        else if(mode === 'shared') { t.textContent = 'Inserisci la password di questo accesso.'; info.innerHTML = 'Accesso completo, valido nell’app degli infermieri e in quella degli autisti. <b>Maiuscole e minuscole contano.</b>'; }
        else if(mode === 'fam') { t.textContent = `Scrivi il codice che ti ha dato ${acctSel}.`; info.innerHTML = `Il codice lo crea l’${ACCT_T.one} dal suo menu <b>☰ › Impostazioni › Accesso per un familiare</b>. Vedrai solo i suoi turni, senza poter cambiare nulla.`; }
        else if(mode === 'new') { t.textContent = 'Primo accesso fatto. Ora scegli la tua password personale (almeno 4 caratteri, diversa da quella provvisoria).'; info.innerHTML = 'Vale per l’app degli infermieri e per quella degli autisti. <b>Se la dimentichi</b>, chiedi al coordinatore: la riporta a quella provvisoria e ne scegli una nuova.'; }
        else { t.textContent = 'Inserisci la tua password.'; info.innerHTML = (r && r.h) ? '<b>Password dimenticata?</b> Chiedi al coordinatore di riportarla a quella provvisoria.' : '<b>Primo accesso?</b> Usa la password provvisoria che ti ha dato il coordinatore: subito dopo scegli la tua.'; }
        acctStep = mode;
    }
    function acctBack() { vibrate(); acctSel = null; acctShowStep('list'); }
    function acctBad(msg) {
        document.getElementById('acct-err').textContent = msg;
        const c = document.getElementById('acct-step-pw'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
        vibrate();
    }
    async function acctSubmit() {
        if(acctBusy || !acctSel) return;
        const n = acctSel, t = acctListTeam, pw = document.getElementById('acct-pw').value.trim();
        if(!pw) { acctBad(acctStep === 'fam' ? 'Scrivi il codice' : 'Scrivi la password'); return; }
        if(acctStep === 'shared') { if(await acctSha('acct118|all|' + pw) === ACCT_SHARED_H) acctFinish({ team: 'all', name: n }); else acctBad('Password sbagliata'); return; }
        if(acctStep === 'coord') { if(await identityPwOk(pw)) acctFinish({ team: t, name: n }); else acctBad('Password sbagliata'); return; }
        if(acctStep === 'new') {
            const pw2 = document.getElementById('acct-pw2').value.trim();
            if(pw.length < 4) { acctBad('Almeno 4 caratteri'); return; }
            if(pw === ACCT_FIRST_PW) { acctBad('Scegline una diversa da quella provvisoria'); return; }
            if(pw !== pw2) { acctBad('Le due password non sono uguali'); return; }
            acctBusy = true; const ok = document.getElementById('acct-ok'), okl = document.getElementById('acct-ok-l'); ok.disabled = true; okl.textContent = 'Salvo…';
            try {
                const rec = Object.assign({}, acctRec(t, n), { h: await acctHash(t, n, pw), at: new Date().toISOString(), by: getDeviceLabel() });
                delete rec.resetAt;
                await acctSaveRec(t, n, rec);
                if(!acctReg[t]) acctReg[t] = {}; acctReg[t][n] = rec;
                acctFinish({ team: t, name: n });
            } catch(e) { ok.disabled = false; okl.textContent = 'Salva ed entra'; acctBad('Non riesco a salvare: controlla la connessione e riprova'); }
            acctBusy = false;
            return;
        }
        if(!acctLoaded) await acctServerLoad();
        if(!acctLoaded) { acctBad('Serve la connessione internet per entrare. Riprova tra poco.'); return; }
        const r = acctRec(t, n);
        if(acctStep === 'fam') {
            if(r.blocked || !r.fam || !r.fam.h) { acctBad(`${n} non ha ancora creato un codice per i familiari`); return; }
            if(await famHash(t, n, pw) !== r.fam.h) { acctBad('Codice sbagliato'); return; }
            acctFinish({ team: t, name: 'Ospite', view: 'fam', famOf: n, famAt: r.fam.at });
            return;
        }
        if(r.blocked) { acctBad('Account bloccato: chiedi al coordinatore'); return; }
        if(r.h) { if(await acctHash(t, n, pw) === r.h) acctFinish({ team: t, name: n }); else acctBad('Password sbagliata'); return; }
        if(pw === ACCT_FIRST_PW) { vibrate(); acctSetPwMode('new'); setTimeout(() => document.getElementById('acct-pw').focus(), 60); return; }
        acctBad('Password sbagliata');
    }
    // accesso fatto: un operatore di questa app entra subito; familiare o operatore dell'altra app → si ricarica (sola lettura dal primo disegno)
    function acctFinish(rec) {
        rec = Object.assign({ at: new Date().toISOString() }, rec);
        try { localStorage.setItem(ACCT_KEY, JSON.stringify(rec)); } catch(e) {}
        if((rec.team === ACCT_TEAM || rec.team === 'all') && !rec.view) { acctDone(acctIdOf(rec)); return; }
        try { localStorage.setItem(ACCT_IDENTITY_KEY, 'Ospite'); } catch(e) {}
        vibrate(); document.getElementById('acct-ok').disabled = true;
        setTimeout(() => location.reload(), 150);
    }
    function acctDone(n) {
        if(ACCT_PW_NAMES.includes(n)) try { localStorage.setItem('id_pw_ok_' + n, '1'); } catch(e) {}
        acctNeed = false;
        userIdentity = n;
        try { localStorage.setItem(ACCT_IDENTITY_KEY, n); } catch(e) {}
        document.documentElement.classList.remove('acct-need');
        vibrate();
        try { applySplashWelcome(); } catch(e) {}
        try { writeIdentityToSession(); persistIdentityToUidBackup(); checkIfIAmCoordinator(); } catch(e) {}
        try { prefsEnsureOwner(); prefsPullRemote(); pushSyncOwner(); notifClaimLegacy(); updateBadge(); } catch(e) {}
        try { if(typeof desAfterIdentity === 'function') desAfterIdentity(); } catch(e) {}
        acctDevSent = false; acctRegisterDevice(); acctLinkPrep();
        // i tocchi sulla schermata d'accesso fermano il "parti da oggi": si riporta oggi in cima
        try { if(prefs.startToday !== false && !calOverview) startAtToday(); } catch(e) {}   // anche dopo che arrivano le preferenze della persona (ridisegno)
        if(acctStartupPending) { acctStartupPending = false; try { showStartupMessages(); if(prefs.startPage === 'me') setTimeout(openMyPage, 400); } catch(e) {} }
    }
    // "Esci": il telefono torna alla schermata d'accesso (vale per le due app: la memoria è la stessa)
    function acctLogout(why) {
        try { localStorage.removeItem(ACCT_KEY); localStorage.removeItem(ACCT_IDENTITY_KEY); } catch(e) {}
        const msg = { blocked: 'Il tuo account è stato bloccato dal coordinatore.', fam: 'Il codice familiare non è più valido: chiedine uno nuovo.' }[why];
        try { if(msg) sessionStorage.setItem('acct_msg', msg); } catch(e) {}
        userIdentity = null;
        try { if(!ACCT_RO) { writeIdentityToSession(); persistIdentityToUidBackup(); } } catch(e) {}
        try { if(acctRegOk() && acctUid()) acctIdsCol().doc(acctUid()).set({ acctV: 0 }, { merge:true }).catch(() => {}); } catch(e) {}
        setTimeout(() => location.reload(), 400);
    }
    async function acctAskLogout() {
        try { closeMenu(); } catch(e) {} vibrate();
        const a = acctRead();
        const who = !a ? '' : a.view === 'fam' ? `Stai guardando i turni di ${a.famOf}.` : `Sei entrato come ${a.name}.`;
        const ok = await ccConfirm('Esci dall’account', `${who} Uscendo, su questo telefono dovrai rifare l’accesso (anche nell’app degli ${ACCT_O.many}).`, 'Esci', 'danger');
        if(ok) acctLogout('menu');
    }
    if(acctNeed) { try { const m = sessionStorage.getItem('acct_msg'); if(m) { sessionStorage.removeItem('acct_msg'); const p = document.getElementById('acct-list-text'); if(p) { p.dataset.msg = '1'; p.innerHTML = '<b style="color:#fecaca">' + esc(m) + '</b>'; } } } catch(e) {} }
    // barra in basso nella sola lettura
    if(ACCT_RO) { const el = document.getElementById('acct-ro-text'); if(el) el.innerHTML = ACCT_RO.view === 'fam' ? `Turni di <b>${esc(ACCT_RO.famOf)}</b> · sola lettura` : `<b>${esc(ACCT_RO.name)}</b> · sola lettura`; }
    // ── passaggio all'altra app: il link porta con sé l'accesso (sull'iPhone le app installate non condividono la memoria) ──
    async function acctLinkPrep() {
        acctLinkTok = '';
        const a = acctRead(); if(!a || a.view || a.team === 'all' || ACCT_PW_NAMES.includes(a.name)) return;
        const r = acctRec(a.team, a.name); if(!r.h) return;
        try { acctLinkTok = btoa(unescape(encodeURIComponent(JSON.stringify({ t: a.team, n: a.name, k: await acctSha(r.h + '|link118') })))).replace(/=+$/, ''); } catch(e) {}
    }
    function acctOpenOther(url) { vibrate(); window.open(url + (acctLinkTok ? '#acct=' + encodeURIComponent(acctLinkTok) : ''), '_blank'); }
    async function acctTryHandoff() {
        const m = /[#&]acct=([^&]+)/.exec(location.hash || ''); if(!m) return;
        try { history.replaceState(null, '', location.pathname + location.search); } catch(e) {}
        if(!acctNeed) return;
        try {
            const o = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
            const r = acctRec(o.t, o.n);
            if(!ACCT_TEAMS[o.t] || !r.h || r.blocked || await acctSha(r.h + '|link118') !== o.k) return;
            acctFinish({ team: o.t, name: o.n });
        } catch(e) {}
    }
    // telefoni collegati (per l'area admin): un documento per telefono nel Firebase infermieri
    function acctRegisterDevice() {
        if(acctDevSent || SERVER_MODE || !acctRegOk() || !acctUid()) return;
        const a = acctRead(); if(!a || acctKind(a) === 'need') return;
        acctDevSent = true;
        acctIdsCol().doc(acctUid()).set({ acctV: 1, acctTeam: a.team, acctName: a.view === 'fam' ? '' : a.name, acctView: a.view || '', famOf: a.famOf || '', acctApp: ACCT_TEAM, acctDevice: getDeviceLabel(), acctSeen: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true }).catch(() => { acctDevSent = false; });
    }
    // ── "Accesso per un familiare" (menu dell'operatore) ──
    function famCanUse() { const a = acctMine(); return !!(a && a.team !== 'all' && !ACCT_PW_NAMES.includes(a.name)); }
    function famOpen(code) {
        try { closeMenu(); } catch(e) {}
        const a = acctMine(); if(!a) return;
        const r = acctRec(ACCT_TEAM, a.name), f = r.fam, box = document.getElementById('fam-box');
        const when = f && f.at ? new Date(f.at).toLocaleDateString('it-IT', { day:'numeric', month:'long', year:'numeric' }) : '';
        box.innerHTML = `<h3><span class="material-icons-round">family_restroom</span>Accesso per un familiare</h3>`
            + (code ? `<p>Ecco il codice. Mandalo al tuo familiare: nella schermata d’accesso tocca <b>Sono un familiare</b>, sceglie <b>${esc(a.name)}</b> e scrive questo codice.</p><div class="fam-code">${esc(code)}</div><div class="acct-info">Vedrà solo i tuoi turni, senza poter cambiare nulla. Il codice si vede solo adesso: se lo perdi, ne crei uno nuovo.</div>`
                : f ? `<p>Il codice per i familiari è <b>attivo</b> dal ${esc(when)}.</p><div class="acct-info">Per sicurezza il codice non si può rivedere. Se l’hai perso, creane uno nuovo: quello vecchio smette di funzionare e chi lo usava esce.</div>`
                : `<p>Un parente può vedere i tuoi turni sul suo telefono, <b>in sola lettura</b> e senza vedere quelli dei colleghi. Crea un codice e mandaglielo.</p>`)
            + `<div class="fam-acts">${code ? '' : `<button class="acct-ok" onclick="famCreate()"><span class="material-icons-round">key</span><span>${f ? 'Crea un nuovo codice' : 'Crea il codice'}</span></button>`}
                ${f && !code ? `<button class="acct-ok sec" onclick="famRemove()"><span class="material-icons-round">link_off</span><span>Disattiva l’accesso familiare</span></button>` : ''}
                <button class="acct-ok sec" onclick="famClose()"><span>Chiudi</span></button></div>`;
        document.getElementById('fam-modal').style.display = 'flex';
    }
    function famClose() { document.getElementById('fam-modal').style.display = 'none'; }
    async function famCreate() {
        const a = acctMine(); if(!a) return;
        const n = new Uint32Array(1); crypto.getRandomValues(n);
        const code = String(n[0] % 1000000).padStart(6, '0');
        try {
            const rec = Object.assign({}, acctRec(ACCT_TEAM, a.name), { fam: { h: await famHash(ACCT_TEAM, a.name, code), at: new Date().toISOString() } });
            await acctSaveRec(ACCT_TEAM, a.name, rec);
            if(!acctReg[ACCT_TEAM]) acctReg[ACCT_TEAM] = {}; acctReg[ACCT_TEAM][a.name] = rec;
            vibrate(); famOpen(code);
        } catch(e) { ccToast('Non riesco a salvare: controlla la connessione', true); }
    }
    async function famRemove() {
        const a = acctMine(); if(!a) return;
        if(!(await ccConfirm('Disattiva l’accesso familiare', 'Il codice smette di funzionare e chi lo usava esce subito.', 'Disattiva', 'danger'))) return;
        try { const rec = Object.assign({}, acctRec(ACCT_TEAM, a.name)); delete rec.fam; await acctSaveRec(ACCT_TEAM, a.name, rec); acctReg[ACCT_TEAM][a.name] = rec; vibrate(); famOpen(); }
        catch(e) { ccToast('Non riesco a salvare: controlla la connessione', true); }
    }

    // ── area admin: account (tutte e due le app: l'elenco è unico) ──
    let admAcctTeam = ACCT_TEAM, admAcctDevs = null, admAcctDevAt = 0, admAcctOpen = {};
    async function admAcctLoadDevs(force) {
        if(!acctRegOk()) return;
        if(!force && admAcctDevs && Date.now() - admAcctDevAt < 60000) return;
        try {
            const snap = await acctIdsCol().where('acctV', '==', 1).get();
            const out = {};
            snap.forEach(d => { const x = d.data() || {}; const key = x.acctView === 'fam' ? 'fam|' + x.acctTeam + '|' + x.famOf : x.acctTeam + '|' + x.acctName; (out[key] = out[key] || []).push({ dev: x.acctDevice || 'Dispositivo', app: x.acctApp, at: x.acctSeen && x.acctSeen.toDate ? x.acctSeen.toDate() : null }); });
            Object.values(out).forEach(l => l.sort((a, b) => (b.at || 0) - (a.at || 0)));
            admAcctDevs = out; admAcctDevAt = Date.now();
        } catch(e) { admAcctDevs = admAcctDevs || {}; }
        admRenderAccounts();
    }
    function admRenderAccounts() {
        const box = document.getElementById('adm-accounts'); if(!box) return;
        if(!admAcctDevs) admAcctLoadDevs();
        const devs = admAcctDevs || {};
        // riepilogo di tutte e due le app
        const sum = Object.keys(ACCT_TEAMS).map(k => {
            const nm = acctTeamNames(k), fam = nm.filter(n => acctRec(k, n).fam);
            return { k, n: nm.length, set: nm.filter(n => acctRec(k, n).h).length, blk: nm.filter(n => acctRec(k, n).blocked).length,
                ph: nm.reduce((x, n) => x + (devs[k + '|' + n] || []).length, 0), fam: fam.length, fph: fam.reduce((x, n) => x + (devs['fam|' + k + '|' + n] || []).length, 0) };
        });
        const sumHtml = `<div class="adm-acct-sum">${sum.map(x => `<div><b><span class="material-icons-round">${ACCT_TEAMS[x.k].ico}</span>${ACCT_TEAMS[x.k].Many}</b>
            <span><em>${x.set}</em>/${x.n} con password scelta</span><span><em>${x.n - x.set}</em> ancora provvisoria${x.blk ? ` · <em style="color:#dc2626">${x.blk}</em> bloccati` : ''}</span>
            <span><em>${x.ph}</em> telefoni collegati</span><span><em>${x.fam}</em> accessi familiari · <em>${x.fph}</em> telefoni</span></div>`).join('')}</div>`;
        const tabs = Object.keys(ACCT_TEAMS).map(k => `<button class="adm-btn sm${k === admAcctTeam ? ' primary' : ''}" onclick="admAcctTeam='${k}';admAcctOpen={};admRenderAccounts()"><span class="material-icons-round">${ACCT_TEAMS[k].ico}</span>${ACCT_TEAMS[k].Many}</button>`).join(' ')
            + ` <button class="adm-btn sm${admAcctTeam === 'fam' ? ' primary' : ''}" onclick="admAcctTeam='fam';admRenderAccounts()"><span class="material-icons-round">family_restroom</span>Familiari</button>`
            + ` <button class="adm-btn sm${admAcctTeam === 'guida' ? ' primary' : ''}" onclick="admAcctTeam='guida';admRenderAccounts()"><span class="material-icons-round">menu_book</span>Guida</button>`
            + ` <button class="adm-btn sm" onclick="admAcctLoadDevs(true)"><span class="material-icons-round">refresh</span>Aggiorna</button>`;
        const fmtT = d => { try { return new Date(d).toLocaleString('it-IT', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); } catch(e) { return ''; } };
        if(admAcctTeam === 'guida') {
            const sec = (ico, title, items) => `<div class="adm-card adm-acct-guide"><h4><span class="material-icons-round">${ico}</span>${title}</h4><ul>${items.map(x => `<li>${x}</li>`).join('')}</ul></div>`;
            box.innerHTML = `<div class="adm-card"><div style="display:flex;gap:6px;flex-wrap:wrap">${tabs}</div></div>`
                + sec('login', 'Come si entra', [
                    'Ogni app mostra <b>solo i suoi nomi</b>: gli infermieri nella prova infermieri, gli autisti nella prova autisti.',
                    'Primo accesso: il proprio nome e la password provvisoria <b>118</b> (non è scritta da nessuna parte nell’app: la mandi tu sul gruppo). Subito dopo l’app obbliga a sceglierne una personale (almeno 4 caratteri, diversa da 118).',
                    'Fatto l’accesso il telefono <b>resta collegato per sempre</b>: la schermata d’accesso non compare più e l’app si apre sui turni.',
                    'COORDINATORE e TEST entrano con la password del coordinatore (<b>coord</b>).',
                    '<b>CENTRALE 118</b> e <b>PRONTO SOCCORSO</b> (in “Altri accessi”) entrano con la password <b>Cerotto1</b> (C maiuscola): accesso completo come prima, in tutte e due le app.',
                    'Le password scelte non le vede nessuno, nemmeno tu: l’app tiene solo un’impronta da cui non si risale alla password.'])
                + sec('sync_alt', 'Infermieri e autisti insieme', [
                    'Chi è entrato in una app vede anche l’altra, <b>in sola lettura</b>: turni e note “per tutti” (tasto <b>Note</b> nella barra in basso). Non vede le note al coordinatore o personali e non può cambiare nulla.',
                    'Il tasto in alto (A.S. / 118) apre l’altra prova <b>portando con sé l’accesso</b>: serve sull’iPhone, dove le app installate sulla Home non condividono la memoria.',
                    'Se qualcuno apre l’altra app direttamente, in fondo all’elenco c’è “Sei un infermiere/autista? Entra con il tuo account”.',
                    '“Esci dall’account” (menu ☰ › Impostazioni, o barra in basso) fa uscire da <b>tutte e due</b> le app su quel telefono.'])
                + sec('family_restroom', 'Familiari', [
                    'L’operatore crea un codice di 6 cifre da <b>☰ › Impostazioni › Accesso per un familiare</b> e lo manda al parente.',
                    'Il parente, nella schermata d’accesso, tocca <b>Sono un familiare</b>, sceglie il nome e scrive il codice. Vede <b>solo i turni di quella persona</b>, in sola lettura.',
                    'Il codice si vede solo quando viene creato. Se l’operatore ne crea uno nuovo o lo disattiva, i familiari collegati escono subito.',
                    'Qui in <b>Familiari</b> vedi chi ha un codice attivo, quando l’ha creato e quali telefoni lo usano. Con <b>Togli</b> lo disattivi tu.'])
                + sec('admin_panel_settings', 'Cosa puoi fare da qui', [
                    '<b>Riporta a 118</b>: per chi ha dimenticato la password. Rientra con 118 e ne sceglie una nuova; i telefoni già collegati restano collegati.',
                    '<b>Blocca</b>: la persona (e i suoi familiari) esce subito da tutti i telefoni e non può rientrare finché non tocchi <b>Sblocca</b>.',
                    '<b>Nome</b>: il nome di battesimo, che compare accanto al cognome nella schermata d’accesso.',
                    'Il numerino con il telefono accanto al cognome dice quanti telefoni sono collegati: toccalo per vedere quali e da quale app. <b>Aggiorna</b> rilegge i telefoni.',
                    'Le schede Infermieri e Autisti mostrano lo stesso elenco da tutte e due le app: puoi gestire tutti da qui.'])
                + sec('shield', 'Da ricordare', [
                    'Vale <b>solo sulle prove</b>: le app ufficiali restano libere.',
                    'È un blocco della schermata: i dati su Firebase restano leggibili da chi sa dove guardare. Per proteggere davvero i dati servono regole Firebase legate agli account, da fare quando si porterà sulle ufficiali.',
                    'Se un telefono cancella i dati del browser (o Safari dopo molti giorni senza aprire l’app, se non è installata sulla Home) bisogna rifare l’accesso con la propria password.'])
                ;
            return;
        }
        if(admAcctTeam === 'fam') {
            const rows = [];
            Object.keys(ACCT_TEAMS).forEach(k => acctTeamNames(k).forEach(n => { const r = acctRec(k, n); if(!r.fam) return; const fl = devs['fam|' + k + '|' + n] || [];
                rows.push(`<tr><td><b>${esc(n)}</b><div class="adm-muted">${ACCT_TEAMS[k].Cap}${acctFirst(k, n) ? ' · ' + esc(acctFirst(k, n)) : ''}</div></td><td>${esc(fmtT(r.fam.at))}</td>
                    <td>${fl.length ? `<ul class="adm-dev-list" style="margin:0">${fl.map(d => `<li><span class="material-icons-round" style="font-size:13px;vertical-align:-2px">smartphone</span> ${esc(d.dev)}${d.app ? ' · app ' + esc(ACCT_TEAMS[d.app] ? ACCT_TEAMS[d.app].many : d.app) : ''}${d.at ? ' · ultimo uso ' + esc(fmtT(d.at)) : ''}</li>`).join('')}</ul>` : '<span class="adm-muted">Nessun telefono ancora</span>'}</td>
                    <td class="act"><button class="adm-btn sm" onclick="admAcctTeam='${k}';admAcctFamOff('${esc(n).replace(/'/g, '&#39;')}').then(()=>{admAcctTeam='fam';admRenderAccounts()})"><span class="material-icons-round">link_off</span>Togli</button></td></tr>`); }));
            box.innerHTML = `<div class="adm-card"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${tabs}</div>${sumHtml}</div>
                <div class="adm-card"><table class="adm-acct-tbl"><thead><tr><th>Di chi</th><th>Codice creato</th><th>Telefoni dei familiari</th><th></th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="4" class="adm-muted">Nessun accesso familiare attivo.</td></tr>'}</tbody></table>
                <div class="adm-muted" style="font-size:.74rem;margin-top:8px">Il codice lo crea l’operatore dal suo menu (☰ › Impostazioni › Accesso per un familiare) e si vede solo in quel momento. Il familiare vede solo i turni di quella persona, in sola lettura. <b>Togli</b>: il codice smette di funzionare e i familiari escono subito.</div></div>`;
            return;
        }
        const t = admAcctTeam, T = ACCT_TEAMS[t], names = acctTeamNames(t);
        const fmt = d => { try { return new Date(d).toLocaleDateString('it-IT', { day:'numeric', month:'short', year:'numeric' }); } catch(e) { return ''; } };
        const devList = (l, ico) => l.map(d => `<li><span class="material-icons-round" style="font-size:13px;vertical-align:-2px">${ico}</span> ${esc(d.dev)}${d.app && d.app !== t ? ' · app ' + esc(ACCT_TEAMS[d.app] ? ACCT_TEAMS[d.app].many : d.app) : ''}${d.at ? ' · ' + esc(fmt(d.at)) : ''}</li>`).join('');
        const rows = names.map(n => {
            const r = acctRec(t, n), a = esc(n), dl = devs[t + '|' + n] || [], fl = devs['fam|' + t + '|' + n] || [], open = admAcctOpen[t + '|' + n];
            const st = r.blocked ? '<span class="adm-pill err">Bloccato</span>' : r.h ? `<span class="adm-pill ok">Password scelta</span> <span class="adm-muted">${esc(fmt(r.at))}</span>` : '<span class="adm-pill muted">Provvisoria</span>';
            const chips = `<span class="adm-dev" data-k="${a}" onclick="admAcctToggle(this.dataset.k)" title="Telefoni collegati"><span class="material-icons-round">smartphone</span>${dl.length}</span>${r.fam ? `<span class="adm-dev" data-k="${a}" onclick="admAcctToggle(this.dataset.k)" title="Accesso familiare attivo"><span class="material-icons-round">family_restroom</span>${fl.length}</span>` : ''}`;
            const list = open ? `<ul class="adm-dev-list">${dl.length ? devList(dl, 'smartphone') : '<li>Nessun telefono collegato</li>'}${r.fam ? `<li><b>Familiari</b> (codice del ${esc(fmt(r.fam.at))})</li>` + (fl.length ? devList(fl, 'family_restroom') : '<li>Nessun telefono di familiari</li>') : ''}</ul>` : '';
            return `<tr><td><b>${a}</b>${chips}${list}</td><td><input value="${esc(r.first || '')}" placeholder="Nome" data-n="${a}" onchange="admAcctFirst(this.dataset.n, this.value)"></td><td>${st}</td>
                <td class="act">${r.h ? `<button class="adm-btn sm" data-n="${a}" onclick="admAcctReset(this.dataset.n)"><span class="material-icons-round">restart_alt</span>Riporta a 118</button>` : ''}
                ${r.fam ? `<button class="adm-btn sm" data-n="${a}" onclick="admAcctFamOff(this.dataset.n)"><span class="material-icons-round">link_off</span>Togli familiare</button>` : ''}
                <button class="adm-btn sm" data-n="${a}" onclick="admAcctBlock(this.dataset.n, ${r.blocked ? 'false' : 'true'})"><span class="material-icons-round">${r.blocked ? 'lock_open' : 'block'}</span>${r.blocked ? 'Sblocca' : 'Blocca'}</button></td></tr>`;
        }).join('');
        box.innerHTML = `<div class="adm-card">
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${tabs}</div>${sumHtml}
                <div class="adm-muted" style="font-size:.8rem;line-height:1.5;margin-top:10px">Un solo elenco per le due app di prova: ognuno entra dalla sua app con nome e password (<b>primo accesso: 118</b>, poi la sceglie) e così può vedere anche l’app degli altri, in sola lettura. Fatto l’accesso il telefono resta collegato. COORDINATORE e TEST entrano con la password del coordinatore.</div>
                </div>
            <div class="adm-card"><table class="adm-acct-tbl"><thead><tr><th>Cognome · telefoni</th><th>Nome</th><th>Stato</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="adm-muted">${t === ACCT_TEAM ? 'Carico i nomi…' : `Elenco degli ${T.many} non ancora disponibile: compare quando qualcuno apre l’app degli ${T.many}.`}</td></tr>`}</tbody></table>
                <div class="adm-muted" style="font-size:.74rem;margin-top:8px">Tocca <span class="material-icons-round" style="font-size:13px;vertical-align:-2px">smartphone</span> per vedere i telefoni collegati (e quelli dei familiari). Il nome di battesimo compare nella schermata d’accesso. <b>Riporta a 118</b>: per chi ha dimenticato la password (i telefoni già collegati restano collegati). <b>Blocca</b>: la persona (e i suoi familiari) escono subito da tutti i telefoni.</div></div>
            <div class="adm-note" style="margin-top:12px"><span class="material-icons-round">info</span><div><b>Cosa protegge.</b> Senza accesso la pagina non mostra i turni. È un blocco della pagina: i dati su Firebase restano leggibili da chi sa dove guardare. La protezione vera dei dati richiede regole Firebase legate agli account, da fare quando si porterà sulle app ufficiali.</div></div>`;
    }
    function admAcctToggle(n) { const k = admAcctTeam + '|' + n; admAcctOpen[k] = !admAcctOpen[k]; admRenderAccounts(); }
    async function admAcctUpdate(n, patch, msg) {
        const t = admAcctTeam, rec = Object.assign({}, acctRec(t, n), patch);
        Object.keys(rec).forEach(k => { if(rec[k] === null || rec[k] === '' || rec[k] === false) delete rec[k]; });
        try { await acctSaveRec(t, n, rec); if(!acctReg[t]) acctReg[t] = {}; acctReg[t][n] = rec; admRenderAccounts(); showAdminToast(msg); vibrate(); }
        catch(e) { showAdminToast('Errore: ' + (e.code || e.message)); }
    }
    function admAcctFirst(n, v) { admAcctUpdate(n, { first: String(v || '').trim().replace(/\s+/g, ' ').slice(0, 40) }, 'Nome salvato'); }
    async function admAcctReset(n) {
        if(!(await ccConfirm('Riporta a 118', `${n} entrerà con la password provvisoria 118 e poi ne sceglierà una nuova. I telefoni già collegati restano collegati.`, 'Riporta a 118'))) return;
        admAcctUpdate(n, { h: null, at: null, by: null, resetAt: new Date().toISOString() }, n + ': password riportata a 118');
    }
    async function admAcctFamOff(n) {
        if(!(await ccConfirm('Togli accesso familiare', `Il codice familiare di ${n} smette di funzionare e i familiari escono subito.`, 'Togli', 'danger'))) return;
        admAcctUpdate(n, { fam: null }, n + ': accesso familiare tolto');
    }
    async function admAcctBlock(n, on) {
        if(on && !(await ccConfirm('Blocca account', `${n} (e i suoi familiari) escono subito da tutti i telefoni e non potrà entrare finché non lo sblocchi.`, 'Blocca', 'danger'))) return;
        admAcctUpdate(n, { blocked: on ? true : null }, on ? n + ' bloccato' : n + ' sbloccato');
    }
    acctFbInit();
    let userIdentity = (SERVER_MODE || acctNeed) ? null : ACCT_RO ? 'Ospite' : (acctIdOf(acctMine()) || localStorage.getItem('infermieri_identity_name') || null);   // con l'account l'identità è il nome dell'accesso
    console.log('[Identità] Letta da localStorage all\'avvio:', userIdentity || '(nessuna)');
    let identityRecoveryPromise = null;

    // Personalizza subito la schermata di apertura se conosciamo già chi è
    function applySplashWelcome() {
        const titleEl = document.getElementById('splash-welcome-title');
        const subEl = document.getElementById('splash-welcome-sub');
        if(!titleEl || !subEl) return;
        if(userIdentity) {
            titleEl.innerText = `Benvenuto, ${userIdentity}`;
            subEl.innerText = 'Turni Autisti 2026';
        } else {
            titleEl.innerText = 'TURNI AUTISTI';
            subEl.innerText = '2026';
        }
    }
    applySplashWelcome();
    function getDeviceLabel() {
        const ua = navigator.userAgent;
        let browser = "Browser";
        if(/Edg\//.test(ua)) browser = "Edge";
        else if(/OPR\//.test(ua)) browser = "Opera";
        else if(/CriOS|Chrome\//.test(ua)) browser = "Chrome";
        else if(/FxiOS|Firefox\//.test(ua)) browser = "Firefox";
        else if(/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
        let os = "Dispositivo";
        if(/iPhone|iPad|iPod/.test(ua)) os = "iOS";
        else if(/Android/.test(ua)) os = "Android";
        else if(/Windows/.test(ua)) os = "Windows";
        else if(/Mac OS X/.test(ua)) os = "macOS";
        else if(/Linux/.test(ua)) os = "Linux";
        return `${browser} • ${os}`;
    }

    async function initFirebaseTracking() {
        if(!fbReady) return;
        try { await fbAuth.signInAnonymously(); } catch(e) { console.error("Auth anonima fallita:", e); }
        // motore (?server=1): niente sessione né identità, ma impostazioni, reperibilità e note sì,
        // sennò non sa che i turni stanno su Firebase e calendari/avvisi partono dal vecchio Excel
        if(SERVER_MODE) { listenConfigChanges(); listenReperibilita(); listenOpNotes(); asListenProduction(); return; }   // autisti: anche cessioni e cambi turno del portale
        identityRecoveryPromise = tryRecoverIdentityFromUid();
        setTimeout(() => { try { appErrFlush(); } catch(e) {} }, 1500);   // errori capitati prima del collegamento
        setTimeout(() => { const go = () => loadLib('chart').catch(() => {}); window.requestIdleCallback ? requestIdleCallback(go, { timeout: 10000 }) : go(); }, 8000);
        // impostazioni e reperibilità subito: non aspettano la scrittura della sessione (connessione lenta o assente)
        listenConfigChanges();
        netWatchSync();         // ora dell'ultimo allineamento, per l'avviso "Senza rete"
        listenReperibilita();   // le richieste in arrivo si ascoltano solo sul telefono del coordinatore
        listenOpNotes();        // note degli operatori per il coordinatore
        listenAbsMinutes();     // ore delle assenze importate dal file Excel principale
        asListenProduction(); asStart();   // autisti: dati dell'app in uso (sola lettura), note, veicoli, scherzi
        try {
            await asNoopRef().doc(sessionId).set({
                device: getDeviceLabel(),
                userAgent: navigator.userAgent,
                identity: userIdentity || null,
                startTime: firebase.firestore.FieldValue.serverTimestamp(),
                lastActive: firebase.firestore.FieldValue.serverTimestamp(),
                currentView: currentViewLabel,
                online: true
            }, { merge:true });
        } catch(e) { console.error("Errore scrittura sessione:", e); }
        sendHeartbeat();
        setInterval(sendHeartbeat, 45000);
        document.addEventListener('visibilitychange', sendHeartbeat);
        window.addEventListener('pagehide', () => {
            try {
                asNoopRef().doc(sessionId).set({ online:false, lastActive: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
            } catch(e) {}
        });
    }

    // Rete di sicurezza: se il browser ha cancellato i dati salvati sul dispositivo
    // (es. Safari iOS dopo 7gg di inattività, "pulizia dati" automatica, ecc.)
    // proviamo a recuperare l'identità dal profilo anonimo Firebase, che è
    // collegato allo stesso dispositivo/browser in modo indipendente.
    async function tryRecoverIdentityFromUid() {
        if(userIdentity || !fbReady || acctNeed) return;   // senza accesso non si recupera il nome da solo
        try {
            const uid = fbAuth.currentUser && fbAuth.currentUser.uid;
            console.log('[Identità] Tentativo recupero da UID Firebase:', uid || '(uid assente)');
            if(!uid) return;
            const doc = await cfgRef('identities').get();   // autisti: un solo documento "prova_identities" con { u: { uid: { name, updatedAt } } }
            const mine = doc.exists ? ((doc.data().u || {})[uid] || {}) : {};
            if(mine.name) {
                userIdentity = mine.name;
                localStorage.setItem('infermieri_identity_name', userIdentity);
                applySplashWelcome();
                checkIfIAmCoordinator();
                console.log('[Identità] Recuperata dal backup UID:', userIdentity);
            } else {
                console.log('[Identità] Nessun backup trovato per questo UID.');
            }
        } catch(e) { console.error("Errore recupero identità di riserva:", e); }
    }
    function persistIdentityToUidBackup() {
        if(!fbReady || !fbAuth.currentUser) return;
        cfgRef('identities')
            .set({ u: { [fbAuth.currentUser.uid]: { name: userIdentity || null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() } } }, { merge:true })
            .catch(e => console.error("Errore salvataggio identità di riserva:", e));
    }

    function writeIdentityToSession() {
        if(!fbReady) return Promise.resolve();
        return asNoopRef().doc(sessionId)
            .set({ identity: userIdentity || null, online: document.visibilityState === 'visible' }, { merge:true })
            .catch(e => console.error("Errore aggiornamento identità sessione:", e));
    }

    // ── Modale "Chi sei?" ────────────────────────────────────────────────────
    // La prenotazione di un nome è PERMANENTE (non basata sulla presenza in tempo
    // reale): resta "occupato" finché quella persona non cambia esplicitamente
    // identità, o finché non passano 5 giorni senza che abbia riaperto l'app
    // (rete di sicurezza per liberare nomi abbandonati, es. dopo un reset del
    // dispositivo). Così chi si logga all'apertura del programma e poi non tocca
    // più il menu resta comunque correttamente segnato come "in uso".
    const IDENTITY_CLAIM_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;
    async function getLockedIdentities() {
        if(!fbReady) return new Set();
        try {
            const myUid = fbAuth.currentUser && fbAuth.currentUser.uid;
            const cutoffMs = Date.now() - IDENTITY_CLAIM_MAX_AGE_MS;
            const idDoc = await cfgRef('identities').get();   // chi ha scelto quale nome (vedi persistIdentityToUidBackup)
            const all = idDoc.exists ? (idDoc.data().u || {}) : {};
            const rel = identityReleases || {};   // nomi liberati dall'admin (dalle impostazioni già in memoria)
            const locked = new Set();
            Object.keys(all).forEach(uid => {
                if(uid === myUid) return;
                const d = all[uid] || {};
                if(!d.name || d.name === 'Ospite' || d.name === PS_NAME || PW_IDENTITIES.includes(d.name)) return;   // PC condiviso, COORDINATORE e TEST non sono mai "in uso"
                const ms = tsToMillis(d.updatedAt);
                if(ms && ms > cutoffMs && !(rel[d.name] && ms <= rel[d.name])) locked.add(d.name);
            });
            identityLockedCache = locked;
            try { localStorage.setItem('infermieri_identity_locked', JSON.stringify([...locked])); } catch(e) {}
            return locked;
        } catch(e) { console.error("Errore lettura identità attive:", e); return null; }
    }
    function showIdentityInfoPopup() {
        let m = document.getElementById('identity-info-modal'); m.style.display = 'flex';
        setTimeout(() => m.classList.add('open'), 20);
    }
    function closeIdentityInfoPopup() {
        vibrate();
        let m = document.getElementById('identity-info-modal'); m.classList.remove('open');
        setTimeout(() => { m.style.display = 'none'; openIdentityModal(); }, 300);
    }
    // La finestra si apre subito con gli ultimi nomi "In uso" conosciuti (salvati sul telefono),
    // poi si aggiorna appena la rete risponde (al massimo 6 s). Se non si sa ancora nulla,
    // i nomi restano in attesa invece di sembrare tutti liberi.
    let identityLockedCache = null, identityReleases = {};
    function savedLockedIdentities() {
        try { const a = JSON.parse(localStorage.getItem('infermieri_identity_locked') || 'null'); return Array.isArray(a) ? new Set(a) : null; } catch(e) { return null; }
    }
    async function openIdentityModal() {
        const known = identityLockedCache || savedLockedIdentities();
        renderIdentityList(known || new Set(), !known);
        const m = document.getElementById('identity-modal'); m.style.display = 'flex';
        setTimeout(() => m.classList.add('open'), 20);
        const fresh = await Promise.race([getLockedIdentities(), new Promise(r => setTimeout(() => r(null), 6000))]);
        if(m.style.display !== 'none' && (fresh || !known)) renderIdentityList(fresh || known || new Set());
    }
    function renderIdentityList(locked, pending) {
        const names = (drivers && drivers.length) ? drivers.filter(d => !d.test).map(d => d.name) : [];
        const allOptions = names.concat(IDENTITY_EXTRA_OPTIONS);
        const c = document.getElementById('identity-list-container'); c.innerHTML = "";
        allOptions.forEach(name => {
            if(IDENTITY_GROUPS[name]) { const h = document.createElement('div'); h.className = 'identity-group'; h.textContent = IDENTITY_GROUPS[name]; c.appendChild(h); }
            const isGuest = name === 'Ospite', isPS = name === PS_NAME, isPw = PW_IDENTITIES.includes(name);
            const isCurrent = name === userIdentity;
            const isLocked = !isGuest && !isPS && !isPw && !isCurrent && locked.has(name);
            const isPending = pending && !isGuest && !isPS && !isPw && !isCurrent;
            const initials = name.substring(0,2).toUpperCase();
            const btn = document.createElement('div');
            btn.className = 'identity-btn' + (isGuest ? ' guest-btn' : '') + (isLocked ? ' locked' : '') + (isPending ? ' pending' : '') + (isCurrent ? ' current' : '');
            let tag = '';
            if(isCurrent) tag = '<div class="identity-current-tag">TU</div>';
            else if(isPending) tag = '<div class="identity-pending-tag">Verifica…</div>';
            else if(isLocked) tag = '<div class="identity-lock-tag">In uso</div>';
            else if(isPw) tag = '<div class="identity-pw-tag"><span class="material-icons-round">lock</span></div>';
            const ico = isGuest ? 'person' : isPS ? 'computer' : name === COORD_ID ? 'supervisor_account' : name === TEST_OP ? 'science' : '';
            btn.innerHTML = `<div class="identity-avatar">${ico ? `<span class="material-icons-round" style="font-size:20px">${ico}</span>` : initials}</div><div class="identity-name">${name}</div>${tag}`;
            if(!isLocked && !isPending) btn.onclick = () => selectIdentity(name);
            c.appendChild(btn);
        });
    }
    async function selectIdentity(name) {
        vibrate();
        if(name !== userIdentity && PW_IDENTITIES.includes(name) && !identityPwRemembered(name)) {
            const ok = await pwAsk({ icon: name === COORD_ID ? 'supervisor_account' : 'science', title: name, text: name === COORD_ID ? 'Account del coordinatore: inserisci la password.' : 'Operatore di prova, fuori da ogni conteggio: inserisci la password.', check: identityPwOk, cancel: true });
            if(!ok) return;
            try { localStorage.setItem('id_pw_ok_' + name, '1'); } catch(e) {}
        }
        if(name === userIdentity) {
            let m = document.getElementById('identity-modal'); m.classList.remove('open');
            setTimeout(() => { m.style.display = 'none'; showStartupMessages(); }, 300);
            return;
        }
        userIdentity = name;
        localStorage.setItem('infermieri_identity_name', name);
        writeIdentityToSession();
        persistIdentityToUidBackup();
        checkIfIAmCoordinator();
        prefsEnsureOwner(); prefsPullRemote();   // ogni operatore ritrova le sue preferenze
        pushSyncOwner();
        notifClaimLegacy(); updateBadge();   // le notifiche sono di chi le ha ricevute
        let m = document.getElementById('identity-modal'); m.classList.remove('open');
        setTimeout(() => { m.style.display = 'none'; showStartupMessages(); }, 300);
        if(typeof desAfterIdentity === 'function') desAfterIdentity();
    }
    function requestChangeIdentity() {
        if(ACCT_ENABLED) { acctAskLogout(); return; }   // con gli account si cambia utente uscendo e rientrando
        closeMenu(); vibrate();
        requestChangeIdentityDirect();
    }
    function requestChangeIdentityDirect() {
        // Non cancelliamo subito l'identità corrente: resta valida e visibile
        // (evidenziata come "TU") nel selettore finché non si sceglie davvero
        // un nome diverso, così non si perde mai la selezione per errore.
        openIdentityModal();
    }

    // Segnale "app aperta" per l'area admin: solo con l'app in primo piano (in background
    // basta l'ultimo segnale di chiusura), per non consumare scritture Firebase inutili.
    function sendHeartbeat(e) {
        if(!fbReady) return;
        if(document.visibilityState !== 'visible' && !(e && e.type === 'visibilitychange')) return;
        if(LIVE.paused) return;   // in pausa: niente segnali
        asNoopRef().doc(sessionId).set({
            lastActive: firebase.firestore.FieldValue.serverTimestamp(),
            currentView: currentViewLabel,
            online: document.visibilityState === 'visible'
        }, { merge:true }).catch(()=>{});
    }

    function appErrFlush() {
        if(SERVER_MODE || !fbReady || !APP_ERR.queue.length || !fbAuth || !fbAuth.currentUser) return;
        const items = APP_ERR.queue.splice(0), FV = firebase.firestore.FieldValue;
        asNoopRef().doc(sessionId).set({ errors: FV.arrayUnion(...items), errCount: FV.increment(items.length), lastErrorAt: FV.serverTimestamp() }, { merge:true }).catch(() => {});
    }
    function setCurrentView(label) {
        const changed = currentViewLabel !== label;
        currentViewLabel = label;
        if(changed) {
            sessionViewHistory.push({ view: label, time: Date.now() });
            if(sessionViewHistory.length > 40) sessionViewHistory.shift();
        }
        if(!fbReady) return;
        const payload = {
            lastActive: firebase.firestore.FieldValue.serverTimestamp(),
            currentView: currentViewLabel,
            online: document.visibilityState === 'visible'
        };
        if(changed) payload.viewHistory = sessionViewHistory;
        asNoopRef().doc(sessionId).set(payload, { merge:true }).catch(()=>{});
    }

    // ── Config remota (colori, nomi operatori, orari) ───────────────────────
    function listenConfigChanges() {
        if(!fbReady) return;
        cfgRef('settings').onSnapshot(doc => {
            // senza rete un documento che manca dalla copia sul dispositivo non vuol dire che non esista: niente copia iniziale
            if(!doc.exists) { if(!doc.metadata.fromCache) { gateWaitEnd(); seedNamespaceSettings(); } resolveConfigReady(); return; }
            const data = doc.data();
            if(!SERVER_MODE && !doc.metadata.fromCache) gateApply(data.appGate || null);
            else if(!SERVER_MODE && data.appGate) gateApply(data.appGate);
            if(!doc.metadata.fromCache) snapSettingsOk = true;
            if(data.dataSource !== undefined) dataSourceMode = data.dataSource === 'firebase' ? 'firebase' : 'excel';
            if(data.activeYear !== undefined && data.activeYear) activeYear = +data.activeYear;
            if(data.archivedYears !== undefined) archivedYears = (data.archivedYears || []).map(Number);
            // è stato attivato il passaggio a Firebase mentre questa app girava ancora sull'Excel
            if(appBooted && bootMode === 'excel' && dataSourceMode === 'firebase' && !sessionStorage.getItem('fb_mode_reloaded')) {
                sessionStorage.setItem('fb_mode_reloaded', '1'); location.reload(); return;
            }
            updateYearUi();
            if(data.colors) { colorOverrides = data.colors; applyColorOverrides(); }
            if(data.nameOverrides) { nameOverrides = data.nameOverrides; applyNameOverrides(); }
            if(data.operatorConfig !== undefined) {
                const prevAdded = JSON.stringify(operatorConfig.added || []);
                operatorConfig = normalizeOperatorConfig(data.operatorConfig);
                if(excelParsedData.length) {
                    if(JSON.stringify(operatorConfig.added) !== prevAdded) rebuildDataFromExcel();
                    refreshAfterOperatorChange();
                }
            }
            if(data.scheduleOverride) { scheduleOverride = data.scheduleOverride; applyScheduleOverride(); }
            if(data.welcome) { welcomeConfig = Object.assign({}, DEFAULT_WELCOME_BAKED, data.welcome); }
            if(data.announcements) { customAnnouncements = data.announcements; }
            if(data.coordMessages !== undefined) { coordMessages = Array.isArray(data.coordMessages) ? data.coordMessages : []; }
            if(dataSourceMode === 'excel' && data.manualOverrides !== undefined) {
                // le modifiche degli altri si fondono con quelle in sospeso su questo dispositivo
                mergeRemoteOverrides(data.manualOverrides || {}, null);
                refreshAfterRemoteOverrides();
            }
            if(data.excelSyncedMarks !== undefined) {
                excelSyncedMarks = data.excelSyncedMarks || {};
                renderCoordSyncList();
            }
            if(data.coverageMin) { coverageMin = Object.assign({}, COVERAGE_DEFAULT, data.coverageMin); dayChecksCache = null; }
            if(data.identityReleases !== undefined) identityReleases = data.identityReleases || {};
            if(data.checksResolved !== undefined) { checksResolved = data.checksResolved || {}; setTimeout(chkRefresh, 0); }   // fuori dal flusso: un errore qui non deve fermare il resto delle impostazioni
            if(data.customCodes !== undefined && JSON.stringify(data.customCodes || {}) !== JSON.stringify(customCodes)) {
                customCodes = data.customCodes || {}; applyCustomCodes();
                if(finalData.length && document.querySelector('#table-body tr[data-row]')) renderTable();
            }
            if(data.ferieRules) { ferieRules = Object.assign({}, FERIE_DEFAULT, data.ferieRules); if(calOverview) renderOverviewSoon(); }
            if(data.coordinatorName !== undefined) {
                coordinatorName = data.coordinatorName || COORD_DEFAULT;
                checkIfIAmCoordinator();
                renderCoordinatorTab();
            }
            resolveConfigReady();
        }, err => { console.error("Errore ascolto config:", err); resolveConfigReady(); });
    }

    // ── Coordinatore designato: selezionabile in Area Coordinatore, notifiche
    // in arrivo dal portale Richieste vengono inviate SOLO a chi risulta loggato
    // con lo stesso nome qui impostato. ──────────────────────────────────────
    let coordinatorName = COORD_DEFAULT;
    let isCoordinator = false;
    function normalizeNameForMatch(n) {
        return (n || "").toString().toUpperCase().trim();
    }
    let richiesteListenerStarted = false;
    function checkIfIAmCoordinator() {
        isCoordinator = userIdentity === COORD_ID || !!(userIdentity && coordinatorName && normalizeNameForMatch(userIdentity) === normalizeNameForMatch(coordinatorName))
            || AS_OPERATORI.includes(String(userIdentity || '').toUpperCase());   // autisti: Pazzaglia, Barbieri e Centrale ricevono le richieste
        if(isCoordinator && !richiesteListenerStarted && fbReady) { richiesteListenerStarted = true; listenIncomingRequests(); }
        if(opNotesVer) { notesAfterChange(); noteNotify(); }
    }

    // ── Notifiche richieste in arrivo dal portale Richieste Infermieri ──────
    // Ascolta la collection "richieste_infermieri" (stesso progetto Firebase):
    // per ogni NUOVA richiesta (non quelle già presenti al primo caricamento),
    // se chi è loggato in questo momento è il coordinatore designato, genera
    // una notifica nel centro notifiche esistente (🔔).
    const RICHIESTE_TYPE_LABELS = {
        "copertura_reperibilita": "Cessione Reperibilità",
        "cambio_turno":           "Cambio Turno",
        "cambio_riposo":          "Cambio Riposo",
        "ferie":                  "Congedo Ordinario",
        "ferie_anno_prec":        "Congedo Anno Precedente",
        "permesso_ore":           "Permesso straordinario ad Ore",
        "permesso":               "Permesso straordinario",
        "recupero_ore":           "Recupero Ore",
        "permesso_matrimonio":    "Permesso Matrimonio",
        "permesso_studio":        "Permesso Studio",
        "permesso_sportivo":      "Permesso Sportivo",
        "permesso_notte":         "Permesso straordinario Notte",
        "permesso_lutto":         "Permesso Lutto",
        "aspettativa":            "Aspettativa",
        "permesso_sindacale":     "Permesso Sindacale"
    };
    let richiesteListenerReady = false;
    function listenIncomingRequests() {
        if(!fbReady) return;
        db.collection('richieste_turni').orderBy('timestamp', 'desc').limit(50)
            .onSnapshot(snap => {
                // al primo caricamento: quelle arrivate mentre l'app era chiusa (non si perde nessuna richiesta)
                if(!richiesteListenerReady) { richiesteListenerReady = true; reqCatchUp(snap.docs); return; }
                snap.docChanges().forEach(change => {
                    if(change.type !== 'added') return;
                    notifyCoordinatorOfNewRequest(change.doc.data(), change.doc.id);
                    reqMarkSeen(change.doc.data().timestamp);
                });
            }, err => console.error('Errore ascolto richieste infermieri:', err));
    }
    function reqParts(r) {
        const label = RICHIESTE_TYPE_LABELS[r.type] || r.type || 'Richiesta';
        let periodo = '';
        if(r.dateFrom) {
            const parts = r.dateFrom.split('-');
            if(parts.length === 3) periodo = parts[2] + '/' + parts[1];
        }
        if(r.type === 'copertura_reperibilita' && r.timeSlot) periodo += (periodo ? ' ' : '') + '(' + r.timeSlot + ')';
        const swap = r.swapWith ? (' con ' + r.swapWith) : '';
        return { label, periodo, swap };
    }
    function notifyCoordinatorOfNewRequest(r, reqId, quiet) {
        if(!isCoordinator) return;
        if(reqId && notifHistory.some(n => n.reqId === reqId && n.owner === prefOwner())) return;   // già notificata su questo telefono
        const { label, periodo, swap } = reqParts(r), info = reqIsAutoCessione(r);
        const msg = `<b>${r.name || '—'}</b><br><span style="font-size:0.85rem;color:var(--text-sec)">${label}${swap}${periodo ? ' · ' + periodo : ''}${info ? ' · inserita in automatico' : ''}</span>`;
        // la cessione di reperibilità è già nel calendario: solo un avviso informativo (tra turni e reperibilità)
        const extra = info ? { kind: 'rep', title: 'Cessione di reperibilit\u00e0', detail: `${r.name || '—'}${swap} · ${periodo} · gi\u00e0 inserita in automatico` } : {};
        notifHistory.unshift(Object.assign({ id: Date.now()+Math.random(), ts: Date.now(), text: msg, read:false, archived:false, date:new Date().toLocaleString(), type:'richiesta', reqId: reqId || null, owner: prefOwner() }, extra));
        saveNotifications(); updateBadge();
        if(!quiet) showRichiestaAlert(r.name, label, swap, periodo, reqId, info);
    }
    // Cessione di reperibilità dal portale: entra da sola nel calendario (nessuna approvazione).
    function reqIsAutoCessione(r) { return !!r && r.type === 'copertura_reperibilita' && !r.obscured && r.autoApplied !== false; }
    // Ultima richiesta già vista dal coordinatore su questo telefono (data di invio della richiesta).
    function reqSeenKey() { return 'req_seen_ts_' + normalizeNameForMatch(coordinatorName || ''); }
    function reqMarkSeen(ts) {
        ts = String(ts || ''); if(!ts || !isCoordinator) return;
        try { const k = reqSeenKey(), cur = localStorage.getItem(k) || ''; if(ts > cur) localStorage.setItem(k, ts); } catch(e) {}
    }
    // Richieste arrivate ad app chiusa: tutte nel centro notifiche e un solo avviso riassuntivo.
    // La prima volta su un telefono si guardano quelle degli ultimi 7 giorni non ancora inserite.
    function reqCatchUp(docs) {
        if(!isCoordinator) return;
        let last = ''; try { last = localStorage.getItem(reqSeenKey()) || ''; } catch(e) {}
        const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
        const fresh = docs.map(d => ({ id: d.id, r: d.data() || {} })).filter(x => {
            const t = String(x.r.timestamp || ''); if(!t || x.r.obscured) return false;
            return last ? t > last : (t > weekAgo && !x.r.insertedInShifts);
        }).filter(x => !notifHistory.some(n => n.reqId === x.id && n.owner === prefOwner())).reverse();
        docs.forEach(d => reqMarkSeen((d.data() || {}).timestamp));
        if(!fresh.length) return;
        if(fresh.length === 1) { notifyCoordinatorOfNewRequest(fresh[0].r, fresh[0].id); return; }
        const allInfo = fresh.every(x => reqIsAutoCessione(x.r));
        fresh.forEach(x => notifyCoordinatorOfNewRequest(x.r, x.id, true));
        lastRichiestaAlertReqId = null; lastAlertNote = '';
        const rows = fresh.slice(-6).reverse().map(x => { const p = reqParts(x.r); return `<div style="background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:9px 12px; text-align:left; margin-bottom:6px;"><div style="font-weight:900;">${esc(x.r.name || '—')}</div><div style="font-size:0.84rem; color:var(--text-sec);">${esc(p.label + p.swap)}${p.periodo ? ' · ' + esc(p.periodo) : ''}${reqIsAutoCessione(x.r) ? ' · inserita in automatico' : ''}</div></div>`; }).join('');
        document.getElementById('richiesta-alert-text').innerHTML = `<div style="font-weight:800; margin-bottom:10px;">${fresh.length} richieste arrivate mentre l’app era chiusa</div>${rows}${fresh.length > 6 ? `<div style="font-size:0.8rem; color:var(--text-sec);">e altre ${fresh.length - 6}: le trovi tutte nelle notifiche</div>` : ''}<div style="font-size:0.8rem; color:var(--text-sec); margin-top:10px;">${allInfo ? 'Cessioni di reperibilit\u00e0 gi\u00e0 inserite in automatico: solo per informazione.' : 'Da approvare come coordinatore (le cessioni di reperibilit\u00e0 sono gi\u00e0 inserite).'}</div>`;
        reqAlertTitle(allInfo);
        const m = document.getElementById('richiesta-alert-modal'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 100);
        if(navigator.vibrate) navigator.vibrate([40,60,40]);
    }

    function applyColorOverrides() {
        Object.entries(colorOverrides).forEach(([varName, val]) => {
            document.documentElement.style.setProperty(varName, val);
            document.body.style.setProperty(varName, val);   // altrimenti il tema scuro li coprirebbe
        });
    }
    function applyNameOverrides() {
        if(!drivers || drivers.length === 0) return;
        let changed = false;
        drivers.forEach(d => {
            const orig = d.originalName || d.name;
            d.originalName = orig;
            const newName = nameOverrides[orig] || orig;
            if(d.name !== newName) { d.name = newName; changed = true; }
        });
        if(changed) { renderTable(); renderDriverFilterDropdown(); initNotificationOptions(); }
    }
    function applyScheduleOverride() {
        if(scheduleOverride.SCHEDULE) Object.assign(SCHEDULE, scheduleOverride.SCHEDULE);
        if(scheduleOverride.SCHEDULE_DIURNI) Object.assign(SCHEDULE_DIURNI, scheduleOverride.SCHEDULE_DIURNI);
        if(typeof finalData !== 'undefined' && finalData.length) renderTable();
    }

    // ── Login Admin ──────────────────────────────────────────────────────
    function openAdminLoginModal() {
        closeMenu();
        document.getElementById('admin-pw-input').value = "";
        document.getElementById('admin-pw-error').innerText = "";
        let m = document.getElementById('admin-login-modal'); m.style.display = 'flex';
        setTimeout(() => { m.classList.add('open'); document.getElementById('admin-pw-input').focus(); }, 10);
    }
    function closeAdminLoginModal(e) { if(e && e.target !== e.currentTarget) return; let m = document.getElementById('admin-login-modal'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 300); }
    async function checkAdminPassword() {
        vibrate();
        const val = document.getElementById('admin-pw-input').value;
        if(await pwMatch(val, ADMIN_PW_H)) {
            closeAdminLoginModal();
            setTimeout(openAdminPanel, 250);
        } else {
            document.getElementById('admin-pw-error').innerText = "Password errata. Riprova.";
        }
    }

    // ── Pannello Admin ───────────────────────────────────────────────────
    function openAdminPanel() {
        let m = document.getElementById('admin-panel-modal'); m.style.display = 'flex';
        setTimeout(() => m.classList.add('open'), 10);
        document.querySelectorAll('#admin-panel-modal .adm-fold').forEach(f => f.classList.add('open'));
        switchAdminTab('home', document.querySelector('.admin-tab-btn[data-tab="home"]'));
        admRefresh(true);   // si vedono subito i dati dell'ultima apertura (se ci sono), poi si aggiornano
        if(pendingAdminTab) { const t = pendingAdminTab; pendingAdminTab = null; switchAdminTab(t, document.querySelector(`.admin-tab-btn[data-tab="${t}"]`)); }
        startAdminAccessListener();
        populateAdminColorInputs();
        populateAdminOperatorInputs();
        populateAdminScheduleInputs();
        populateAdminTextsInputs();
        if(!window._adminDurationTicker) window._adminDurationTicker = setInterval(refreshAdminDurations, 1000);
    }
    function closeAdminPanel(e) {
        if(e && e.target !== e.currentTarget) return;
        let m = document.getElementById('admin-panel-modal'); m.classList.remove('open');
        setTimeout(() => m.style.display = 'none', 250);
        if(adminAccessUnsub) { adminAccessUnsub(); adminAccessUnsub = null; }
        if(window._adminDurationTicker) { clearInterval(window._adminDurationTicker); window._adminDurationTicker = null; }
        if(accessDetailTicker) { clearInterval(accessDetailTicker); accessDetailTicker = null; }
        adminAnnouncementsDraft = null;
    }
    function switchAdminTab(tab, btnEl) {
        vibrate();
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));
        if(!btnEl) btnEl = document.querySelector(`#admin-panel-modal .admin-tab-btn[data-tab="${tab}"]`);
        if(btnEl) { btnEl.classList.add('active'); const f = btnEl.closest('.adm-fold'); if(f) f.classList.add('open'); }
        document.getElementById('admin-tab-' + tab).classList.add('active');
        if(tab === 'scherzo') asRenderPrankAdmin();
        if(tab === 'bibbia') asRenderBibbiaAdmin();
        admOnTab(tab);
    }
    function showAdminToast(text) {
        const t = document.getElementById('admin-save-toast');
        document.getElementById('admin-save-toast-text').innerText = text;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2200);
    }

    let adminAccessDocs = [];
    function startAdminAccessListener() {
        if(!fbReady) return;
        if(adminAccessUnsub) adminAccessUnsub();
        adminAccessUnsub = asSessionsQuery()   // autisti: sessioni dell'app in uso, sola lettura
            .onSnapshot(snap => {
                adminAccessDocs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
                renderAdminAccessList();
            }, err => {
                console.error("Errore listener accessi:", err);
                document.getElementById('admin-access-list').innerHTML = `<div class="admin-empty"><span class="material-icons-round">error_outline</span><br>Impossibile leggere gli accessi.<br><span style="font-size:0.7rem">Verifica le regole Firestore.</span></div>`;
            });
    }
    function renderAdminAccessList() {
        const c = document.getElementById('admin-access-list'); if(!c) return;
        document.querySelectorAll('#adm-acc-seg button').forEach(b => b.classList.toggle('on', b.dataset.f === admAccFilter));
        const now = Date.now(), dayStart = new Date().setHours(0, 0, 0, 0), q = admAccSearch.trim().toLowerCase();
        const isOn = a => a.online && a.lastActive && (now - tsToMillis(a.lastActive)) < 100000;
        const docs = adminAccessDocs.filter(a => !(admAccHideTests && admIsTest(a))).filter(a => {
            if(admAccFilter === 'online' && !isOn(a)) return false;
            if(admAccFilter === 'oggi' && (tsToMillis(a.startTime) || 0) < dayStart) return false;
            if(admAccFilter === 'errori' && !(a.errCount > 0)) return false;
            if(admAccFilter === 'coord' && !(a.currentView === 'Area Coordinatore' || (a.viewHistory || []).some(v => v && v.view === 'Area Coordinatore'))) return false;
            return !q || [a.identity, a.device, a.currentView].some(x => String(x || '').toLowerCase().includes(q));
        });
        document.getElementById('admin-stat-online').innerText = docs.filter(isOn).length;
        document.getElementById('admin-stat-total').innerText = docs.length;
        const pp = document.getElementById('adm-acc-people'); if(pp) pp.innerText = new Set(docs.map(a => a.identity).filter(x => x && x !== 'Ospite')).size;
        if(!docs.length) { c.innerHTML = `<div class="admin-empty"><span class="material-icons-round">devices_other</span><br>Nessuna sessione con questi filtri.</div>`; return; }
        c.innerHTML = docs.map(a => {
            const on = isOn(a), start = tsToMillis(a.startTime) || now;
            const mainLabel = a.identity ? a.identity : 'Non identificato';
            const tags = (a.errCount ? `<span class="adm-pill err">${a.errCount} ${a.errCount === 1 ? 'problema' : 'problemi'}</span>` : '') + (a.wheelSpins ? `<span class="adm-pill violet">ruota ×${a.wheelSpins}</span>` : '') + (admIsTest(a) ? '<span class="adm-pill muted">prova</span>' : '');
            return `<div class="access-row" data-start="${start}" onclick="openAccessDetail('${a.id}')">
                <span class="access-dot ${on?'online':''}"></span>
                <span class="adm-av">${esc(mainLabel.substring(0, 2).toUpperCase())}</span>
                <div class="access-info">
                    <div class="access-device">${esc(mainLabel)} ${tags}</div>
                    <div class="access-view">${esc(a.currentView || '—')}</div>
                    <div class="access-meta">${esc(a.device || 'Dispositivo sconosciuto')} • Ultimo accesso: ${formatLastActive(a.lastActive)}</div>
                </div>
                <div class="access-duration">
                    <div class="access-duration-inner"><b class="admin-dur-val">--:--</b><span>Sessione</span></div>
                    <span class="material-icons-round access-chevron">chevron_right</span>
                </div>
            </div>`;
        }).join('');
        refreshAdminDurations();
        if(typeof admBadges === 'function' && admData) admBadges();
    }
    function tsToMillis(ts) { if(!ts) return null; if(typeof ts.toMillis === 'function') return ts.toMillis(); if(ts.seconds) return ts.seconds*1000; return null; }
    function formatLastActive(ts) {
        const ms = tsToMillis(ts); if(!ms) return "—";
        return new Date(ms).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    }


