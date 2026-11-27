    // ═══ PREFERENZE PERSONALI ════════════════════════════════════════════
    // Ogni operatore ha le sue scelte (tema, calendario, notifiche...): si salvano sul
    // dispositivo sotto il suo nome e anche su Firebase, così le ritrova su ogni telefono
    // in cui sceglie il proprio nome. Chi non ha ancora scelto il nome usa "OSPITE".
    // iPhone/iPad (anche iPad che si presenta come Mac): stile alleggerito, vedi html.ios nel CSS
    var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if(IS_IOS) document.documentElement.classList.add('ios');
    var PREF_DEFAULTS = {
        theme:'auto', startPage:'calendario', startToday:true, lite: IS_IOS,
        myColFirst:false, highlightMe:true, showTimes:true, showRepBars:true, filter:null,
        notifyChanges:true, notifyRep:true, notifyTomorrow:false, haptics:true, ticker:true, textSize:'normal', look:'leggera', calView:'normale'
    };
    var prefs = null, prefsOwnerLoaded = null, prefsRemoteTimer = null;
    function prefOwner() { return (userIdentity && userIdentity !== 'Ospite') ? String(userIdentity).toUpperCase() : 'OSPITE'; }
    function loadPrefs() {
        const owner = prefOwner(); prefsOwnerLoaded = owner;
        let p = null; try { p = JSON.parse(localStorage.getItem('prefs_v1__' + owner) || 'null'); } catch(e) {}
        if(!p) { const old = localStorage.getItem('theme'); p = { theme: old === 'dark' ? 'dark' : old === 'light' ? 'light' : 'auto' }; }   // primo avvio: il tema usato finora, altrimenti quello del telefono
        return prefsFix(Object.assign({}, PREF_DEFAULTS, p));
    }
    // L'app si apre sempre nel calendario normale: la "Vista d'insieme" come pagina iniziale non
    // si sceglie più (rimasta salvata su qualche telefono, faceva aprire sempre la vista d'insieme).
    function prefsFix(p) { if(p.startPage !== 'me') p.startPage = 'calendario'; return p; }
    function savePrefsLocal() { try { localStorage.setItem('prefs_v1__' + prefsOwnerLoaded, JSON.stringify(prefs)); } catch(e) {} }
    function prefsSaveRemoteSoon() {
        if(SERVER_MODE || prefsOwnerLoaded === 'OSPITE') return;
        clearTimeout(prefsRemoteTimer);
        prefsRemoteTimer = setTimeout(() => {
            if(!fbReady || prefsOwnerLoaded === 'OSPITE') return;
            cfgRef('prefs').set({ [prefsOwnerLoaded]: prefs }, { merge:true }).catch(e => console.warn('Preferenze non salvate online:', e));
        }, 1500);
    }
    // Se su un altro dispositivo le preferenze sono più recenti, si usano quelle.
    async function prefsPullRemote() {
        if(!fbReady || prefsOwnerLoaded === 'OSPITE') return;
        try {
            const owner = prefsOwnerLoaded, snap = await cfgRef('prefs').get();
            const r = snap.exists ? (snap.data() || {})[owner] : null;
            if(owner !== prefsOwnerLoaded || !r || (r.updatedAt || 0) <= (prefs.updatedAt || 0)) return;
            prefs = prefsFix(Object.assign({}, PREF_DEFAULTS, r)); savePrefsLocal(); applyAllPrefs();
            if(document.getElementById('options-modal').classList.contains('open')) renderOptions();
        } catch(e) {}
    }
    function prefsEnsureOwner() { if(prefsOwnerLoaded !== prefOwner()) { prefs = loadPrefs(); applyAllPrefs(); } }
    function applyTheme() {
        const dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.body.classList.toggle('dark-mode', dark);
        const meta = document.querySelector('#theme-color-meta'); if(meta) meta.setAttribute('content', dark ? '#061331' : '#0b2257');
        try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch(e) {}    if(prefs) applyLook();
    }
    function applyBodyPrefClasses() {
        document.body.classList.toggle('pref-hl-me', !!prefs.highlightMe);
        document.body.classList.toggle('pref-no-times', !prefs.showTimes);
        document.body.classList.toggle('pref-no-repbar', !prefs.showRepBars);
        document.body.classList.toggle('lite', !!prefs.lite);
        if(prefs.textSize === 'xbig') prefs.textSize = 'big';   // la vecchia "Molto grande" ora è Grande
        document.body.classList.toggle('pref-text-big', prefs.textSize === 'big');
        document.body.classList.toggle('pref-text-xbig', prefs.textSize === 'xbig');
        // scritte nelle caselle (vista normale): Piccolo = come prima, Medio (predefinito) e Grande; le caselle si adattano da sole
        document.body.style.setProperty('--cfs', ({ small: 1, normal: 1.22, big: 1.45, xbig: 1.45 })[prefs.textSize] || 1.22);
        applyLook();
    }
    // Grafica "leggera" (predefinita) o "classica" (colori pieni e barre blu notte)
    function applyLook() {
        const tl = false;   // grafica unica, identica all'app infermieri
        document.body.classList.toggle('tl', tl);
        const ic = document.querySelector('#hdr-menu-btn .material-icons-round'); if(ic) ic.textContent = 'menu';
        const dark = document.body.classList.contains('dark-mode');
        const meta = document.querySelector('#theme-color-meta'); if(meta) meta.setAttribute('content', tl ? (dark ? '#121826' : '#ffffff') : (dark ? '#061331' : '#0b2257'));
    }
    function prefsApplyFilter() {
        if(ACCT_RO && ACCT_RO.view === 'fam') { selectedDrivers = new Set(drivers.filter(d => d.name === ACCT_RO.famOf || d.originalName === ACCT_RO.famOf).map(d => d.idx)); return; }   // familiare: solo la sua colonna
        if(prefs.filter == null) {   // prima volta: si riprende il filtro che c'era su questo dispositivo
            try { const arr = JSON.parse(localStorage.getItem('selected_nurses') || 'null'); if(Array.isArray(arr) && arr.length) { prefs.filter = drivers.filter(d => arr.includes(d.idx)).map(d => d.originalName || d.name); savePrefsLocal(); } } catch(e) {}
        }
        selectedDrivers = new Set(drivers.filter(d => (prefs.filter || []).includes(d.originalName || d.name)).map(d => d.idx));
    }
    function applyAllPrefs() {
        applyTheme(); applyBodyPrefClasses();
        if(finalData.length && drivers.length) { prefsApplyFilter(); renderDriverFilterDropdown(); updateDriverFilterBadge(); renderTable(); }
    }
    function setPref(k, v, noApply) {
        prefs[k] = v; prefs.updatedAt = Date.now(); savePrefsLocal(); prefsSaveRemoteSoon();
        if(noApply) return;
        if(k === 'theme') applyTheme();
        else if(k === 'ticker') asBuildTicker();
        else if(k === 'look') applyBodyPrefClasses();
        else if(k === 'calView') calViewApply(true);
        else if(['myColFirst','highlightMe','showTimes','showRepBars','lite','textSize'].includes(k)) {
            applyBodyPrefClasses();
            if(k === 'lite') liteFrom = null;
            if(finalData.length) { renderTable(); if(k === 'lite') setTimeout(scrollToToday, 60); }
        }
    }
    prefs = loadPrefs(); applyTheme(); applyBodyPrefClasses();
    if(window.matchMedia) { try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if(prefs.theme === 'auto') applyTheme(); }); } catch(e) {} }

    function vibrate() { if(prefs && prefs.haptics === false) return; if(navigator.vibrate) navigator.vibrate(10); }

    function toggleMenu() {
        vibrate(); let m = document.getElementById('menu-dropdown');
        if(m.style.display === 'flex') { m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 100); }
        else { try { noteCloseHub(); } catch(e) {} menuPath = []; renderMenu(); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10); }
    }
    function closeMenu() { const m = document.getElementById('menu-dropdown'); if(m && m.style.display === 'flex') toggleMenu(); }

    // ═══ MENU A CARTELLE (icona con le tre lineette) ═══════════════════════
    // Ogni voce: icona, titolo, descrizione; le cartelle (children) si aprono dentro al
    // menu con "indietro". Le azioni chiudono il menu e partono dopo che il tasto
    // indietro del telefono ha consumato la voce di cronologia del menu.
    let menuPath = [], pendingAdminTab = null, ccPendingSection = null;
    const MN_COLORS = { cal:'#2563eb', ore:'#0f766e', svago:'#d97706', link:'#7c3aed', coord:'#0b6e7f', admin:'#334155', imp:'#64748b' };
    function menuGo(fn) {
        const m = document.getElementById('menu-dropdown');
        if(!m || m.style.display !== 'flex') { fn(); return; }
        toggleMenu();
        if(modalHistoryPushed) {
            let done = false;
            const go = () => { if(done) return; done = true; window.removeEventListener('popstate', go); setTimeout(fn, 0); };
            window.addEventListener('popstate', go); setTimeout(go, 400);
        } else setTimeout(fn, 60);
    }
    function menuTree() {
        const hasYears = typeof dataSourceMode !== 'undefined' && dataSourceMode === 'firebase' && archivedYears.length > 0;
        const vw = calOverview ? 'insieme' : ((prefs && prefs.calView) || 'normale');
        return [
            { group:'Per te' },
            { id:'me', icon:'person', label:'La mia pagina', desc: (userIdentity && userIdentity !== 'Ospite') ? 'Prossimi turni, ore, assenze, reperibilità' : 'Scegli prima chi sei', color:'#1d4ed8', run: () => openMyPage() },
            { id:'notechat', icon:'forum', label:'Note e chat', desc: (() => { try { const u = noteHubUnread(); return u ? u + (u === 1 ? ' risposta nuova' : ' risposte nuove') : 'Le note dei colleghi e le risposte'; } catch(e) { return 'Le note dei colleghi e le risposte'; } })(), color:'#7c3aed', run: () => noteOpenHub() },
            { group:'Calendario' },
            // Oggi, Mesi, Operatori e "inf" sono nella barra in alto: qui non si ripetono
            { id:'cal', icon:'calendar_month', label:'Calendario', desc:'Legenda, reperibili, stampa, telefono' + (hasYears ? ', anni passati' : ''), color: MN_COLORS.cal, children: [
                { id:'legend', icon:'palette', label:'Legenda dei colori', desc:'Cosa vuol dire ogni colore e segno', color: MN_COLORS.cal, run: () => openColorLegend() },
                { id:'replist', icon:'phone_in_talk', label:'Reperibili del mese', desc:'Tabella con chi è reperibile in ogni fascia, cessioni comprese', color:'#dc2626', run: () => openRepList() },
                { id:'print', icon:'print', label:'Stampa del mese', desc:'PDF dei turni per la bacheca', color: MN_COLORS.cal, run: () => printMonthPick() },
                { id:'phonecal', icon:'phone_iphone', label:'Nel calendario del telefono', desc:'I tuoi turni nel calendario del telefono, aggiornati da soli', color: MN_COLORS.cal, run: () => openOptionsCal() },
                (typeof isViewingArchive === 'function' && isViewingArchive()) ? null : { id:'nexty', icon:'fast_forward', label:'Vai al ' + (SHIFT_YEAR + 1), desc:'L’anno dopo è già qui, sotto dicembre: i turni si possono già scrivere', color: MN_COLORS.cal, run: () => goNextYear() },
                hasYears ? { id:'years', icon:'history', label:'Anni passati', desc:'Consulta gli anni archiviati (sola lettura)', color: MN_COLORS.cal, run: () => openYearPicker() } : null,
            ] },
            { id:'calview', icon:'view_day', label:'Vista del calendario', desc:'Ora: ' + ({ normale:'tabella', compatta:'compatta', giorni:'giorno per giorno', insieme:'anno intero' })[vw] + ' · scegli tu', color: MN_COLORS.cal, run: () => openCalViewPicker() },
            { id:'ferieg', icon:'beach_access', label:'Ferie', desc:'Quando prenderle e ferie desiderate', color:'#16a34a', children: [
                { id:'ferie', icon:'tips_and_updates', label:'Quando prendere ferie e permessi', desc:'Giorni e periodi consigliati', color:'#16a34a', run: () => openFerieAdvice() },
                { id:'desid', icon:'beach_access', label:'Calendario ferie desiderate', desc:'Scrivi le ferie e i permessi che vorresti, nella tua colonna', color:'#16a34a', run: () => openDesiderate() },
            ] },
            { id:'conti', icon:'query_stats', label:'Conteggi', desc:'Ore, assenze ed equità dell’anno, in tre schede', color: MN_COLORS.ore, run: () => openHoursModal() },
            { group:'Squadra' },
            { id:'link', icon:'apps', label:'Collegamenti', desc:'Richieste, area A.S., veicoli', color: MN_COLORS.link, children: [
                { id:'req', icon:'assignment', label:'Richieste', desc:'Ferie, permessi, cambi turno, cessioni', color: MN_COLORS.link, run: () => window.openRichiestePanel && window.openRichiestePanel() },
                { id:'area', icon:'badge', label:'Area riservata A.S.', desc:'Area personale degli autisti', color: MN_COLORS.link, run: () => window.open('https://centrale118rsm-code.github.io/Area-riservata-A.S.-118/', '_blank') },
                { id:'veicoli', icon:'local_shipping', label:'Veicoli 118', desc:'Appuntamenti e stato dei mezzi', color: MN_COLORS.link, run: () => window.open('https://centrale118rsm-code.github.io/Veicoli-118/', '_blank') }
            ] },
            { group:'App' },
            { id:'imp', icon:'more_horiz', label:'Altro', desc:'Opzioni, tempo libero, area riservata, utente', color: MN_COLORS.imp, children: [
                { id:'opts', icon:'settings', label:'Opzioni dell’app', desc:'Le tue preferenze: tema, calendario, notifiche', color: MN_COLORS.imp, run: () => openOptionsModal() },
                { id:'svago', icon:'celebration', label:'Tempo libero', desc:'Uscite di gruppo, ruota della sfiga e gara di ambulanze', color: MN_COLORS.svago, children: [
                    { id:'dinner', icon:'restaurant', label:'Organizza un’uscita', desc:'Chi è libero per colazione, pranzo, cena…', color: MN_COLORS.svago, run: () => openDinnerModal() },
                    { id:'wheel', icon:'casino', label:'La ruota della sfiga', desc:'Estrai a sorte chi tocca', color: MN_COLORS.svago, run: () => openWheelModal() },
                    { id:'race', icon:'sports_score', label:'Gara di ambulanze', desc:'Scommetti su chi arriva primo', color: MN_COLORS.svago, run: () => openRaceModal() }
                ] },
                { id:'share', icon:'share', label:'Condividi l’app', desc:'Mandala su WhatsApp a chi non ce l’ha', color:'#16a34a', stay:true, run: () => shareAppWhatsApp() },
                ...(ACCT_ENABLED && famCanUse() ? [{ id:'fam', icon:'family_restroom', label:'Accesso per un familiare', desc:'Fai vedere i tuoi turni a un parente', color: MN_COLORS.imp, run: () => famOpen() }] : []),
                { id:'riserv', icon:'lock', label:'Area riservata', desc:'Coordinatore e admin: si apre l’area giusta in base alla password', color: MN_COLORS.coord, lock:true, run: () => openAdminLoginModal() },
                { id:'user', icon: ACCT_ENABLED ? 'logout' : 'switch_account', label: ACCT_ENABLED ? 'Esci dall’account' : 'Cambia utente', desc: userIdentity ? 'Ora sei ' + userIdentity : 'Scegli chi sei', color: MN_COLORS.imp, run: () => requestChangeIdentity() },
                { id:'reload', icon:'refresh', label:'Aggiorna l’app', desc:'Ricarica per avere l’ultima versione', color: MN_COLORS.imp, run: () => { vibrate(); location.reload(); } }
            ] },
            { id:'guida', icon:'menu_book', label:'Guida', desc:'Come si usa l’app e l’area Richieste, con le animazioni', color:'#0ea5e9', run: () => openGuide() }
        ];
    }
    // ═══ CONTEGGI: ore, assenze ed equità come tre schede della stessa finestra ═══
    // In cima a ognuna delle tre finestre c'è la stessa fila di schede: si passa dall'una
    // all'altra senza chiudere. Il tasto indietro del telefono chiude quella aperta.
    const CONTI = [
        { k:'ore', id:'hours-modal', ic:'query_stats', l:'Ore', open: () => openHoursModal(), close: () => closeHoursModal() },
        { k:'assenze', id:'abs-modal', ic:'event_busy', l:'Assenze', open: () => openAbsModal(), close: () => closeAbsModal() },
        { k:'equita', id:'eq-modal', ic:'balance', l:'Equità', open: () => openEquity(), close: () => closeEquity() }
    ];
    function contiTabsInstall() {
        CONTI.forEach(c => {
            const mc = document.querySelector('#' + c.id + ' .modal-content'), hd = mc && mc.querySelector('.modal-header');
            if(!hd || mc.querySelector('.conti-tabs')) return;
            const bar = document.createElement('div'); bar.className = 'conti-tabs'; bar.setAttribute('role', 'tablist');
            bar.innerHTML = CONTI.map(x => `<button type="button" role="tab" class="${x.k === c.k ? 'on' : ''}" aria-selected="${x.k === c.k}" onclick="contiGo('${x.k}')"><span class="material-icons-round">${x.ic}</span>${x.l}</button>`).join('');
            hd.insertAdjacentElement('afterend', bar);
        });
    }
    function contiGo(k) {
        const t = CONTI.find(c => c.k === k); if(!t) return;
        const cur = CONTI.find(c => { const el = document.getElementById(c.id); return el && el.classList.contains('open'); });
        if(cur === t) return;
        t.open();
        const el = document.getElementById(t.id); if(el) el.classList.add('open');   // subito aperta: la cronologia del tasto indietro resta una sola
        if(cur) { cur.close(); const o = document.getElementById(cur.id); if(o) { o.style.display = 'none'; o.classList.remove('open'); } }
        try { currentBackButtonModalId = t.id; } catch(e) {}
    }
    try { contiTabsInstall(); } catch(e) {}
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { try { contiTabsInstall(); } catch(e) {} });

    function menuNodeAt(path) {
        let list = menuTree(), node = null;
        for(const id of path) { node = list.find(n => n && n.id === id); if(!node || !node.children) return null; list = node.children; }
        return { node, list };
    }
    function renderMenu(dir) {
        let cur = menuNodeAt(menuPath);
        if(!cur) { menuPath = []; cur = menuNodeAt([]); }
        const head = document.getElementById('mn-head'), body = document.getElementById('mn-body'); if(!head || !body) return;
        if(!menuPath.length) {
            const nm = userIdentity || 'Ospite';
            head.innerHTML = `<span class="mn-avatar">${esc(nm.slice(0, 2).toUpperCase())}</span><span class="mn-title"><b>${esc(nm)}</b><small>Turni autisti ${SHIFT_YEAR}</small></span>`;
        } else {
            const trail = menuPath.map((id, i) => (menuNodeAt(menuPath.slice(0, i + 1)) || {}).node).filter(Boolean);
            const crumbs = ['Menu'].concat(trail.slice(0, -1).map(n => n.label)).join(' \u203a ');
            head.innerHTML = `<button class="mn-back" onclick="menuBack()" aria-label="Indietro"><span class="material-icons-round">arrow_back</span></button><span class="mn-title"><b>${esc(cur.node.label)}</b><small>${esc(crumbs)}</small></span>`;
        }
        body.innerHTML = cur.list.filter(Boolean).map(n => {
            if(n.group) return `<div class="mn-group">${esc(n.group)}</div>`;
            const right = n.children ? `${n.lock ? '<span class="material-icons-round mn-go" style="font-size:15px">lock</span>' : ''}<span class="material-icons-round mn-go">chevron_right</span>`
                : (n.toggle !== undefined ? `<span class="mn-switch ${n.toggle ? 'on' : ''}"></span>` : (n.lock ? '<span class="material-icons-round mn-go" style="font-size:15px">lock</span>' : ''));
            return `<button class="mn-row" role="menuitem" onclick="menuPick('${n.id}')"><span class="mn-ico" style="background:${n.color}"><span class="material-icons-round">${n.icon}</span></span><span class="mn-txt"><b>${esc(n.label)}</b>${n.desc ? `<small>${esc(n.desc)}</small>` : ''}</span>${right}</button>`;
        }).join('');
        body.classList.remove('slide-in', 'slide-back'); void body.offsetWidth;
        if(dir) body.classList.add(dir === 'back' ? 'slide-back' : 'slide-in');
        body.scrollTop = 0;
    }
    function menuPick(id) {
        const cur = menuNodeAt(menuPath); if(!cur) return;
        const n = cur.list.find(x => x && x.id === id); if(!n) return;
        vibrate();
        if(n.children) { menuPath.push(id); renderMenu('in'); return; }
        if(n.stay) { n.run(); return; }
        menuGo(n.run);
    }
    function menuBack() { vibrate(); menuPath.pop(); renderMenu('back'); }

    // compatibilità: la vecchia barra a scomparsa non esiste più
    function toggleActions() {}

    function openOptionsModal() {
        closeMenu(); prefsEnsureOwner(); renderOptions();
        let m = document.getElementById('options-modal'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10);
        setCurrentView("Opzioni");
    }
    function closeOptionsModal(e) { if(e && e.target !== e.currentTarget) return; let m = document.getElementById('options-modal'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 200); }

    function toggleDarkMode() {
        vibrate(); setPref('theme', document.body.classList.contains('dark-mode') ? 'light' : 'dark');
    }

    function toggleMonthDropdown(e) {
        if(e) e.stopPropagation();
        vibrate();
        const dd = document.getElementById('month-select-dropdown');
        if(dd.classList.contains('open')) { closeMonthDropdown(); return; }
        renderMonthDropdown();
        dd.classList.add('open');
    }
    // primo giorno dell'anno dopo, che nel calendario sta già sotto dicembre
    function goNextYear() {
        vibrate();
        const m = globalMonthsList.find(x => shiftRowYear(x.row) === SHIFT_YEAR + 1);
        if(!m) { ccToast('L’anno dopo non è ancora nel calendario', true); return; }
        if(calOverview) setCalView('normale');
        if(ddOn()) { ddScrollToMonth(MONTH_MAP[m.name], SHIFT_YEAR + 1); return; }
        setTimeout(() => { if(liteOn()) liteShowRow(m.row); liteScrollTo(document.getElementById(m.id), 120); }, calOverview ? 120 : 0);
    }
    function closeMonthDropdown() { document.getElementById('month-select-dropdown').classList.remove('open'); }
    function renderMonthDropdown() {
        const grid = document.getElementById('month-grid-container'); grid.innerHTML = "";
        if(globalMonthsList.length === 0) { grid.innerHTML = "<div style='text-align:center;color:var(--text-sec);padding:10px;'>Nessun mese disponibile</div>"; return; }
        const nowMonthIdx = new Date().getMonth();
        globalMonthsList.forEach(m => {
            const yr = shiftRowYear(m.row);
            const isCurrent = MONTH_MAP[m.name] === nowMonthIdx && yr === new Date().getFullYear();
            const niceName = m.name.charAt(0) + m.name.slice(1).toLowerCase();
            let btn = document.createElement('div'); btn.className = 'month-btn' + (isCurrent ? ' month-current' : '');
            btn.innerHTML = `<span class="material-icons-round">${isCurrent ? 'today' : 'event'}</span><span>${niceName}</span>`;
            btn.onclick = () => { vibrate(); closeMonthDropdown(); if(calOverview) { ovScrollTo('ov-m-' + MONTH_MAP[m.name]); return; } if(ddOn()) { ddScrollToMonth(MONTH_MAP[m.name], shiftRowYear(m.row)); return; } if(liteOn()) liteShowRow(m.row); liteScrollTo(document.getElementById(m.id), 120); };
            grid.appendChild(btn);
        });
    }

    document.addEventListener('click', function(event) {
        let m = document.getElementById('menu-dropdown'); let btn = document.getElementById('hdr-menu-btn');
        if(m.style.display === 'flex' && !m.contains(event.target) && !btn.contains(event.target)) toggleMenu();
        let dd = document.getElementById('driver-filter-dropdown'); let dbtn = document.querySelector('.driver-filter-btn');
        if(dd.classList.contains('open') && !dd.contains(event.target) && !dbtn.contains(event.target)) closeDriverFilterDropdown();
        let md = document.getElementById('month-select-dropdown');
        if(md.classList.contains('open') && !md.contains(event.target)) closeMonthDropdown();
    });

    if('serviceWorker' in navigator && !SERVER_MODE) navigator.serviceWorker.register('sw.js').catch(() => {});
    window.onload = async () => {
        netUpdateBadge();
        initFirebaseTracking();
        try {
            const lastUp = new Date(document.lastModified);
            const lastUpText = `${lastUp.toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'})} - ${lastUp.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}`;
            const optUpd = document.getElementById('options-last-update'); if(optUpd) optUpd.innerText = lastUpText;
        } catch(e) {}
        const splashMinTime = new Promise(resolve => setTimeout(resolve, 900));
        // l'Excel si scarica in parallelo; intanto si chiede a Firebase se i turni vivono ormai solo lì
        // se l'ultima volta i turni erano già su Firebase, l'Excel (300 KB) non si scarica nemmeno
        let lastDs = null; try { lastDs = localStorage.getItem('data_source_' + DATA_NS); } catch(e) {}
        const fetchExcel = async () => {
            try { const response = await fetch(/PROVA/i.test(location.pathname) ? IMPORT_OFFICIAL.url + '?v=' + Date.now() : FILE_NAME); if(!response.ok) throw new Error("File mancante"); return await response.arrayBuffer(); }
            catch(e) { console.error(e); return null; }
        };
        const excelAttempt = lastDs === 'firebase' ? null : fetchExcel();
        await waitForConfig(6000);
        try { localStorage.setItem('data_source_' + DATA_NS, dataSourceMode); } catch(e) {}
        if(dataSourceMode === 'firebase') { await bootFirebaseMode(splashMinTime); return; }
        const buffer = await (excelAttempt || fetchExcel());
        if(buffer) { bootMode = 'excel'; await loadWorkbook(buffer, splashMinTime); appBooted = true; }
        else {
            document.getElementById('splash-brand').style.display = 'none';
            document.getElementById('manual-upload').style.display = 'block';
        }
    };

    document.getElementById('file-input').addEventListener('change', function(e) {
        const file = e.target.files[0]; if(!file) return;
        const reader = new FileReader(); reader.onload = evt => loadWorkbook(evt.target.result); reader.readAsArrayBuffer(file);
    });

    // ── Copia dell'Excel già letto sul dispositivo (IndexedDB) ─────────────────
    // Leggere il file Excel chiede una libreria pesante (più di 1 MB) e tempo: se il file è lo
    // stesso dell'ultima apertura (stessa impronta) si usa la lettura già fatta.
    function xlIdb() {
        return new Promise((res, rej) => {
            const r = indexedDB.open('as26p-turni-cache', 1);
            r.onupgradeneeded = () => r.result.createObjectStore('kv');
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
    }
    async function xlCacheGet() {
        try { const d = await xlIdb(); return await new Promise(res => { const q = d.transaction('kv').objectStore('kv').get('xlsx'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
        catch(e) { return null; }
    }
    async function xlCachePut(v) {
        try { const d = await xlIdb(); d.transaction('kv', 'readwrite').objectStore('kv').put(v, 'xlsx'); } catch(e) {}
    }
    async function xlHash(buffer) {
        try { const h = await crypto.subtle.digest('SHA-1', buffer); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('') + ':' + buffer.byteLength; }
        catch(e) { return null; }
    }
    async function loadWorkbook(buffer, splashMinTime) {
        try {
            let rawData = null;
            const hash = await xlHash(buffer);
            if(hash) { const c = await xlCacheGet(); if(c && c.v === 1 && c.h === hash && Array.isArray(c.raw)) rawData = c.raw; }
            if(!rawData) {
                await loadLib('excel');
                const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
                let ws = workbook.getWorksheet('Foglio2') || workbook.worksheets[0]; rawData = [];
                ws.eachRow({ includeEmpty:true }, (row, rowNumber) => {
                    let rowData = [];
                    row.eachCell({ includeEmpty:true }, (cell, colNumber) => {
                        let val = cell.value;
                        if(typeof val === 'object' && val !== null) val = val.result || val.richText?.[0]?.text || "";
                        rowData[colNumber] = { v: val };
                    });
                    rawData[rowNumber] = rowData;
                });
                if(hash) xlCachePut({ v: 1, h: hash, raw: rawData, at: Date.now() });   // copiato subito, prima di ogni modifica
            }
            excelParsedData = asParseWorkbook(rawData);   // formato del file autisti
            rebuildDataFromExcel();            // aggiunge le colonne create dal coordinatore + modifiche manuali
            initApp();
            await hideLoader(splashMinTime);
        } catch(e) { alert("Errore file: " + e.message); }
    }

    function parseHorizontalLayout(raw) {
        let processed = []; let daysRowIdx = -1;
        for(let r=1; r<raw.length; r++) {
            if(raw[r]) {
                let countNums = 0;
                for(let c=1; c<raw[r].length; c++) if(raw[r][c] && !isNaN(parseInt(raw[r][c].v)) && parseInt(raw[r][c].v) > 0) countNums++;
                if(countNums > 20) { daysRowIdx = r; break; }
            }
        }
        if(daysRowIdx === -1) throw new Error("Riga giorni non trovata");

        let nurseRows = []; let seenNames = new Set();
        for(let r = daysRowIdx + 1; r < raw.length; r++) {
            if(raw[r] && raw[r][1] && typeof raw[r][1].v === 'string' && raw[r][1].v.length > 2) {
                let n = raw[r][1].v.trim().toUpperCase();
                if(n === "NAN" || seenNames.has(n)) continue;
                let cleanNameForCheck = n.replace(/\s+/g,'');
                if(cleanNameForCheck.includes("P/PN") || cleanNameForCheck.includes("P.S.") ||
                   cleanNameForCheck.includes("1>7") || cleanNameForCheck.includes("1-7") ||
                   cleanNameForCheck.includes("ORA") || cleanNameForCheck.includes("CONGEDO") ||
                   cleanNameForCheck.includes("MALATTIA") || cleanNameForCheck.includes("FERIE") ||
                   cleanNameForCheck.includes("RECUPERO") || cleanNameForCheck.includes("LEGENDA") ||
                   /^[A-Z]{1,2}-/.test(cleanNameForCheck)) continue;
                seenNames.add(n); nurseRows.push({ name:n, idx:r, subIdx:r+1 });
            }
        }

        let headerRow = ["MESE","GIORNO","NOME"]; nurseRows.forEach(n => headerRow.push(n.name)); processed.push(headerRow);
        let currentMonth = "GENNAIO"; let daysRow = raw[daysRowIdx]; let monthRow = raw[1];

        for(let c = 2; c < daysRow.length; c++) {
            if(monthRow && monthRow[c] && typeof monthRow[c].v === 'string') {
                let txt = monthRow[c].v.toUpperCase(); let pureMonth = txt.replace(/[^A-Z]/g,'');
                if(MONTH_MAP[pureMonth] !== undefined) currentMonth = pureMonth;
                else {
                    const months = ["GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO","LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"];
                    for(let mn of months) if(txt.includes(mn)) { currentMonth = mn; break; }
                }
            }
            if(!daysRow[c]) continue;
            let dayVal = parseInt(daysRow[c].v); if(isNaN(dayVal) || dayVal === 0) continue;
            let dataRow = [{v:currentMonth},{v:dayVal},{v:""}];
            nurseRows.forEach(nurse => {
                let cellMain = raw[nurse.idx][c] || {v:""};
                let cellSub  = (raw[nurse.subIdx]  && raw[nurse.subIdx][c])   ? raw[nurse.subIdx][c]   : {v:""};
                let cellSup  = (raw[nurse.idx-1]   && raw[nurse.idx-1][c])    ? raw[nurse.idx-1][c]    : {v:""};
                dataRow.push({ v:cellMain.v, subV:cellSub.v, supV:cellSup.v });
            });
            processed.push(dataRow);
        }
        return processed;
    }

    // ── Legenda dei colori del calendario ──────────────────────────────────
    // Fatta con gli stessi colori delle caselle (anche quelli cambiati dall'admin e le caselle personalizzate).
    function openColorLegend() {
        vibrate();
        let m = document.getElementById('legend-modal');
        if(!m) {
            m = document.createElement('div'); m.id = 'legend-modal';
            m.onclick = e => { if(e.target === m) closeColorLegend(); };
            document.body.appendChild(m);
        }
        const items = wheelPaletteItems();
        const row = it => `<div class="lg-row"><span class="lg-sw" style="background:var(${it.colors ? it.colors.bg : '--bg-card'});color:var(${it.colors ? it.colors.fg : '--text-main'})">${esc(it.short)}</span><span class="lg-txt"><b>${esc(it.label)}</b>${it.time ? `<small>${esc(it.time)}</small>` : ''}</span></div>`;
        const group = (title, arr) => arr.length ? `<div class="lg-group">${title}</div><div class="lg-grid">${arr.map(row).join('')}</div>` : '';
        const sign = (html, title, txt) => `<div class="lg-row lg-sign"><span class="lg-mark">${html}</span><span class="lg-txt"><b>${title}</b><small>${txt}</small></span></div>`;
        m.innerHTML = `<div class="lg-card" role="dialog" aria-label="Legenda dei colori">
            <div class="lg-head"><span class="material-icons-round">palette</span><div><b>Legenda dei colori</b><small>Cosa vuol dire ogni casella del calendario</small></div><button onclick="closeColorLegend()" aria-label="Chiudi"><span class="material-icons-round">close</span></button></div>
            <div class="lg-body">
                ${group('Turni', items.filter(i => i.group === 0))}
                ${group('Diurnisti e turni combinati', items.filter(i => i.group === 1))}
                ${group('Assenze e permessi', items.filter(i => i.group === 2))}
                ${group('Caselle personalizzate', items.filter(i => i.group === 3))}
                <div class="lg-group">Segni nel calendario</div>
                <div class="lg-grid">
                    ${sign('<span class="cell" style="display:inline-flex;width:auto;height:auto;padding:2px 6px;cursor:default;box-shadow:none;background:var(--c-M);color:var(--t-M)">MATTINA<span class="rep-r">R</span></span>', 'Reperibile del giorno', 'La R rossa accanto al turno: il titolare della reperibilità (“/R” nel turno).')}
                    ${sign('<span class="lg-bars"><i>13-20</i><i>20-00</i></span>', 'Fasce di reperibilità', 'Le fasce orarie che quell’autista copre.')}
                    ${sign('<span class="day-staff-counts" style="margin:0"><span class="dsc-m">M<b>2</b></span><span class="dsc-p">P<b>2</b></span></span>', 'Ambulanze del giorno', 'Quanti autisti di mattina (M) e di pomeriggio (P).')}
                    ${sign('<span class="day-staff-counts" style="margin:0"><span class="dsc-m dsc-alert-3" style="animation:none">M<b>1</b></span></span>', 'Una sola ambulanza', 'Il numero diventa rosso e lampeggia.')}
                    ${sign('<span class="day-staff-counts" style="margin:0"><span class="dsc-n">N<b>0</b></span></span>', 'Manca la notte', 'Compare solo quando di notte manca l’autista.')}
                    ${sign('<img src="cane.png" alt="" style="width:30px;height:auto">', 'Graziella', 'In quel turno c’è una sola ambulanza: toccala!')}
                    ${sign('<span class="lg-date">7<small>SAB</small></span>', 'Giorno in rosso', 'Sabato, domenica o festivo.')}
                </div>
            </div></div>`;
        m.style.display = 'flex';
        requestAnimationFrame(() => m.classList.add('open'));
    }
    function closeColorLegend() {
        const m = document.getElementById('legend-modal'); if(!m) return;
        m.classList.remove('open'); setTimeout(() => { m.style.display = 'none'; }, 200);
    }

    function closeWelcomeModal() {
        let m = document.getElementById('welcome-modal');
        m.classList.remove('open');
        setTimeout(() => {
            m.style.display = 'none';
            const bar = document.getElementById('welcome-progress-bar'); if(bar) bar.classList.remove('counting');
            showNextAnnouncement();
        }, 400);
    }

    function initApp() {
        if(SHIFT_YEAR !== activeYear && dataSourceMode === 'firebase') setShiftYear(activeYear);
        hoursWeekAnchor = new Date(SHIFT_YEAR, new Date().getMonth(), new Date().getDate());
        rebuildDrivers();                    // ordine, nascosti e rimossi decisi in Area Coordinatore
        updateYearUi();
        publishSaldiSoon();
        prefsApplyFilter();                  // colleghi visibili: preferenza dell'operatore
        renderDriverFilterDropdown(); updateDriverFilterBadge();
        initNotificationOptions(); loadNotificationHistory(); renderTable(); startLiveClock();
        setCurrentView("Tabella Turni");
        if(prefs.startToday !== false) startAtToday();
        setTimeout(loadOtherTeam, 3000);   // turni dell'altra squadra per il riepilogo del turno
        startAutoYearWatch();              // a capodanno l'anno nuovo si apre da solo
        autoSnapshotsAtBoot();             // copia del giorno e della settimana
        setTimeout(async () => {
            if(SERVER_MODE) return;
            acctRosterSync();
            if(ACCT_RO) return;   // sola lettura (familiare o operatore dell'altra app): niente nome, messaggi o avvisi
            if(acctNeed) { acctStartupPending = true; acctRenderList(); checkForScheduleChanges(); return; }   // messaggi all'apertura dopo l'accesso
            if(!userIdentity && identityRecoveryPromise) { try { await identityRecoveryPromise; } catch(e) {} }
            prefsEnsureOwner(); prefsPullRemote();
            if(userIdentity) { writeIdentityToSession(); persistIdentityToUidBackup(); showStartupMessages(); if(prefs.startPage === 'me') setTimeout(openMyPage, 400); }
            else showIdentityInfoPopup();
            checkForScheduleChanges();
        }, 2600);
    }

    function initNotificationOptions() {
        const list = document.getElementById('notification-driver-list'); if(!list) return; list.innerHTML = "";
        const saved = localStorage.getItem('watched_nurses_ids'); if(saved) watchedDrivers = new Set(JSON.parse(saved));
        drivers.forEach(d => {
            if(d.test) return;
            let isChecked = watchedDrivers.has(d.idx) ? "checked" : "";
            let item = document.createElement('label'); item.className = `dinner-check-item ${isChecked}`;
            item.innerHTML = `<input type="checkbox" value="${d.idx}" ${isChecked?"checked":""} onchange="toggleWatchDriver(${d.idx},this)"><div class="dinner-check-icon"><span class="material-icons-round" style="font-size:14px">notifications</span></div>${d.name}`;
            list.appendChild(item);
        });
    }
    function toggleWatchDriver(idx, el) {
        vibrate(); if(watchedDrivers.has(idx)) { watchedDrivers.delete(idx); el.parentElement.classList.remove('checked'); } else { watchedDrivers.add(idx); el.parentElement.classList.add('checked'); }
        localStorage.setItem('watched_nurses_ids', JSON.stringify([...watchedDrivers]));
    }
    // ── Notifiche: cambi turno e reperibilità dell'operatore loggato ────────
    function checkForScheduleChanges() {
        // Si segue automaticamente la colonna dell'operatore identificato.
        if(!userIdentity || userIdentity === 'Ospite') return;
        if(typeof isViewingArchive === 'function' && isViewingArchive()) return;
        if(!fbMonthsReady()) return;   // turni non ancora tutti arrivati: si ricontrolla quando ci sono
        const myDriver = drivers.find(d => d.name === userIdentity); if(!myDriver) return;
        const dIdx = myDriver.idx, orig = myDriver.originalName || myDriver.name;
        const current = {}, labels = {};
        for(let i = 1; i < finalData.length; i++) {
            const row = finalData[i], month = row[0].v, day = row[1].v; if(!day || !month) continue;
            if(shiftRowYear(i) !== SHIFT_YEAR) continue;
            const key = `${month}-${day}`, cell = row[dIdx] || {};
            const sub = (cell.subV || '').toString().trim().toLowerCase();
            current[key] = (cell.v ? cell.v.toString().trim() : '') + (SPECIAL_SUBCODES[sub] ? '|' + sub : '');
        }
        const snapKey = `nurse_schedule_snapshot_${SHIFT_YEAR}_${orig}`, legacyKey = `nurse_schedule_snapshot_${orig}`;
        let oldJson = localStorage.getItem(snapKey);
        if(!oldJson && SHIFT_YEAR === 2026) oldJson = localStorage.getItem(legacyKey);
        const show = v => { const [code, sub] = v.split('|'); return sub ? (SPECIAL_SUBCODES[sub] || sub).toLowerCase().replace(/^./, c => c.toUpperCase()) : formatShiftLabel(code); };
        if(oldJson && prefs.notifyChanges !== false) {
            const old = JSON.parse(oldJson), added = [], changed = [], removed = [];
            Object.entries(current).forEach(([k, v]) => {
                const o = old[k]; if(o === undefined || o === v) return;
                const lbl = formatNotifDateKey(k);
                if(!o) added.push({ label: lbl, value: show(v), k, from: '', to: v });
                else if(!v) removed.push({ label: lbl, value: 'era ' + show(o), k, from: o, to: '' });
                else changed.push({ label: lbl, value: show(o) + ' \u2192 ' + show(v), k, from: o, to: v });
            });
            const push = obj => notifHistory.unshift(Object.assign({ id: Date.now() + Math.random(), ts: Date.now(), read:false, archived:false, date: new Date().toLocaleString(), type:'turno', owner: prefOwner() }, obj));
            const alerts = [];
            if(added.length >= 3) {
                const months = [...new Set(added.map(a => a.label.split(' ').slice(-1)[0]))].join(', ');
                push({ kind:'nuovi', title:`Nuovi turni pubblicati`, detail:`${added.length} giorni assegnati (${months})`, items: added, text:`<b>Nuovi turni pubblicati</b> \u2014 ${added.length} giorni` });
                alerts.push(`<b>🆕 Nuovi turni pubblicati</b><br><span style="font-size:0.85rem;color:var(--text-sec)">${added.length} giorni assegnati (${months})</span>`);
            } else added.forEach(a => { push({ kind:'nuovo', title:'Nuovo turno', detail:`${a.label}: ${a.value}`, text:`<b>🆕 Nuovo turno</b> \u2014 ${a.label}` }); alerts.push(`<b>🆕 Nuovo turno</b> \u2014 ${a.label}<br><span style="font-size:0.85rem;color:var(--text-sec)">${a.value}</span>`); });
            if(changed.length > 3) {
                push({ kind:'modifiche', title:'Turni modificati', detail:`${changed.length} giorni cambiati`, items: changed, text:`<b>Turni modificati</b> \u2014 ${changed.length} giorni` });
                alerts.push(`<b>🔄 ${changed.length} turni modificati</b>`);
            } else changed.forEach(a => { push({ kind:'modificato', title:'Turno modificato', detail:`${a.label}: ${a.value}`, text:`<b>🔄 Turno modificato</b> \u2014 ${a.label}` }); alerts.push(`<b>🔄 Turno modificato</b> \u2014 ${a.label}<br><span style="font-size:0.85rem;color:var(--text-sec)">${a.value}</span>`); });
            removed.forEach(a => { push({ kind:'rimosso', title:'Turno rimosso', detail:`${a.label}: ${a.value}`, text:`<b>🗑️ Turno rimosso</b> \u2014 ${a.label}` }); alerts.push(`<b>🗑️ Turno rimosso</b> \u2014 ${a.label}<br><span style="font-size:0.85rem;color:var(--text-sec)">${a.value}</span>`); });
            if(alerts.length) { saveNotifications(); updateBadge(); showChangeAlert2({ added, changed, removed }, myDriver && myDriver.name); if(document.getElementById('notif-center-modal').classList.contains('open')) renderNotifList(); }
        }
        localStorage.setItem(snapKey, JSON.stringify(current));
        if(prefs.notifyRep !== false) checkReperibilitaReminder(myDriver);
        checkTomorrowReminder(myDriver);
    }
    // Ricontrollo quando arrivano modifiche mentre l'app è aperta (non solo all'avvio).
    let scheduleCheckTimer = null;
    function scheduleCheckSoon() { clearTimeout(scheduleCheckTimer); scheduleCheckTimer = setTimeout(() => { if(appBooted) checkForScheduleChanges(); }, 2500); }
    function checkReperibilitaReminder(myDriver) {
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        const tDay = tomorrow.getDate();
        const tMonthName = Object.keys(MONTH_MAP).find(k => MONTH_MAP[k] === tomorrow.getMonth());
        // reperibilità a fasce: titolare del turno che parte domani o fasce coperte domani
        const R = repData(); const tDate = ymd(tomorrow); const me = myDriver.originalName || myDriver.name;
        const mine = (R.days[tDate] || []).map((w, s) => w === me ? REP_SLOTS[s].long : null).filter(Boolean);
        if(R.tit[tDate] !== me && !mine.length) return;
        const reminderKey = `rep_reminder_${me}_${tMonthName}_${tDay}`;
        if(localStorage.getItem(reminderKey)) return;
        const dateLabel = tomorrow.toLocaleDateString('it-IT', { day:'2-digit', month:'long' });
        const detail = R.tit[tDate] === me ? 'sei <b>reperibile</b> dalle 13:00 per 24 ore' : `copri la reperibilità: <b>${mine.join(', ')}</b>`;
        const msg = `<b>📟 Promemoria Reperibilità</b><br><span style="font-size:0.85rem;color:var(--text-sec)">Domani, <b>${dateLabel}</b>, ${detail}.</span>`;
        notifHistory.unshift({ id:Date.now()+Math.random(), ts:Date.now(), text:msg, kind:'rep', title:'Reperibilit\u00e0 domani', detail: `${dateLabel}: ${R.tit[tDate] === me ? 'reperibile dalle 13:00 per 24 ore' : 'copri ' + mine.join(', ')}`, read:false, archived:false, date:new Date().toLocaleString(), type:'turno', owner: prefOwner() });
        saveNotifications(); updateBadge();
        localStorage.setItem(reminderKey, '1');
    }

    function loadNotificationHistory() {
        let saved = localStorage.getItem('notifications_history_nurses');
        if(saved) { const mem = notifHistory; notifHistory = JSON.parse(saved); notifHistory.forEach(n => { if(n.archived === undefined) n.archived = false; }); mem.forEach(n => { if(!notifHistory.some(x => x.id === n.id)) notifHistory.unshift(n); }); }   // non si perdono quelle arrivate prima del caricamento
        notifClaimLegacy(); updateBadge();
    }
    // Le notifiche sono di chi le ha ricevute: cambiando nome (o come Ospite) non si vedono quelle degli altri.
    function notifClaimLegacy() {
        const me = prefOwner(); if(me === 'OSPITE') return;
        let ch = false; notifHistory.forEach(n => { if(!n.owner) { n.owner = me; ch = true; } }); if(ch) saveNotifications();
    }
    function myNotifs() { const me = prefOwner(); return me === 'OSPITE' ? [] : notifHistory.filter(n => n.owner === me); }
    function saveNotifications() { localStorage.setItem('notifications_history_nurses', JSON.stringify(notifHistory)); }
    function updateBadge() { const c = myNotifs().filter(n => !n.read && !n.archived).length; const b = document.getElementById('notif-badge'); if(c > 0) b.classList.add('visible'); else b.classList.remove('visible'); }
    function openNotifCenter() {
        vibrate(); let modal = document.getElementById('notif-center-modal'); modal.style.display = 'flex'; setTimeout(() => modal.classList.add('open'), 10);
        currentNotifTab = myNotifs().some(n => !n.read && !n.archived) ? 'nuove' : 'tutte';
        document.querySelectorAll('#notif-center-modal .nt-tab').forEach(b => b.classList.toggle('active', b.dataset.notiftab === currentNotifTab));
        updateArchiveAllBtnVisibility();
        renderNotifList(); setCurrentView("Notifiche");
    }
    function closeNotifCenter() { let modal = document.getElementById('notif-center-modal'); modal.classList.remove('open'); setTimeout(() => modal.style.display = 'none', 300); }
    function switchNotifTab(tab, btnEl) {
        vibrate(); currentNotifTab = tab;
        document.querySelectorAll('#notif-center-modal .nt-tab').forEach(b => b.classList.remove('active'));
        if(btnEl) btnEl.classList.add('active');
        updateArchiveAllBtnVisibility();
        renderNotifList();
    }
    // Il pulsante "Archivia tutte" ha senso solo tra le notifiche Attive.
    function updateArchiveAllBtnVisibility() {
        const btn = document.getElementById('btn-archive-all-notif');
        if(btn) btn.style.display = myNotifs().some(n => !n.read && !n.archived) ? 'flex' : 'none';
    }
    // Timestamp numerico affidabile per ordinare/raggruppare: le notifiche più vecchie,
    // salvate prima di questa revisione, non hanno "ts" — si ricava dalla data testuale.
    function getNotifTs(item) {
        if(item.ts) return item.ts;
        // Notifiche salvate prima di avere il campo "ts": il testo è in formato italiano
        // "GG/MM/AAAA, HH:MM:SS", che Date.parse legge in modo inaffidabile (spesso fallisce
        // o lo scambia per MM/GG, finendo raggruppato sotto "1970"). Lo leggiamo a mano.
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(item.date || '');
        if(m) {
            const dt = new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]), parseInt(m[4]), parseInt(m[5]), m[6]?parseInt(m[6]):0);
            if(!isNaN(dt.getTime())) return dt.getTime();
        }
        const t = Date.parse(item.date);
        return isNaN(t) ? Date.now() : t; // meglio "adesso" che finire scorrettamente nel 1970
    }
    function formatNotifDayLabel(d) {
        const today = new Date(); today.setHours(0,0,0,0);
        const yest = new Date(today); yest.setDate(yest.getDate()-1);
        const dd = new Date(d); dd.setHours(0,0,0,0);
        if(dd.getTime() === today.getTime()) return 'Oggi';
        if(dd.getTime() === yest.getTime()) return 'Ieri';
        return dd.toLocaleDateString('it-IT', { weekday:'long', day:'2-digit', month:'long' });
    }
    // Raggruppa le notifiche per anno e per giorno (più recenti in cima), così anche uno
    // storico lungo resta leggibile: ogni notifica mostra solo l'orario, la data si legge
    // dall'intestazione del gruppo giorno in cui si trova.
    // Riconosce una notifica di richiesta anche in quelle salvate PRIMA di avere il campo
    // "type" (o "reqId"): ripiega sul testo, che per queste notifiche era sempre nella
    // forma "Nuova richiesta - ...". Così le notifiche vecchie non finiscono nel gruppo
    // sbagliato "Turni e Reperibilità".
    function isRichiestaNotif(item) {
        if(item.type === 'richiesta') return true;
        if(item.reqId) return true;
        return /nuova richiesta/i.test(item.text || '');
    }
    // Tipo di notifica (anche per quelle salvate prima di questa versione, dal testo).
    const NT_KINDS = {
        nuovi:      { icon:'event_available', color:'#16a34a', title:'Nuovi turni pubblicati' },
        nuovo:      { icon:'event_available', color:'#16a34a', title:'Nuovo turno' },
        modificato: { icon:'sync',            color:'#2563eb', title:'Turno modificato' },
        modifiche:  { icon:'sync',            color:'#2563eb', title:'Turni modificati' },
        rimosso:    { icon:'event_busy',      color:'#dc2626', title:'Turno rimosso' },
        rep:        { icon:'phone_in_talk',   color:'#e11d48', title:'Reperibilit\u00e0' },
        domani:     { icon:'event',           color:'#0891b2', title:'Turno di domani' },
        nota:       { icon:'sticky_note_2',   color:'#7c3aed', title:'Nota' },
        richiesta:  { icon:'assignment',      color:'#7c3aed', title:'Nuova richiesta' },
        nota:       { icon:'sticky_note_2',   color:'#0d9488', title:'Nota per il coordinatore' },
        altro:      { icon:'notifications',   color:'#64748b', title:'Avviso' }
    };
    function notifKind(n) {
        if(n.kind && NT_KINDS[n.kind]) return n.kind;
        if(isRichiestaNotif(n)) return 'richiesta';
        const t = (n.text || '').toLowerCase();
        if(t.includes('reperibil')) return 'rep';
        if(t.includes('nuovo turno')) return 'nuovo';
        if(t.includes('rimosso')) return 'rimosso';
        if(t.includes('modificato')) return 'modificato';
        return 'altro';
    }
    function renderNotifList() {
        const c = document.getElementById('notif-list-container');
        const mine = myNotifs(), unread = mine.filter(n => !n.read && !n.archived).length;
        const guest = prefOwner() === 'OSPITE', tabs = document.querySelector('#notif-center-modal .nt-tabs');
        if(tabs) tabs.style.display = guest ? 'none' : '';
        const cnt = document.getElementById('nt-count-nuove'); if(cnt) cnt.textContent = unread || '';
        const sub = document.getElementById('nt-subtitle');
        if(sub) sub.textContent = (userIdentity && userIdentity !== 'Ospite') ? `Avvisi sui turni e le reperibilit\u00e0 di ${userIdentity}` : 'Modalità Ospite';
        if(guest) {
            // l'Ospite non riceve avvisi: si spiega perché e cosa resta salvato sul telefono
            const others = {}; notifHistory.forEach(n => { if(n.owner && n.owner !== 'OSPITE' && !n.archived) others[n.owner] = (others[n.owner] || 0) + 1; });
            const names = Object.keys(others).map(o => { const d = drivers.find(x => (x.originalName || '').toUpperCase() === o || x.name.toUpperCase() === o); return { o, nm: d ? d.name : o, n: others[o] }; });
            const kept = names.length ? `<div class="nt-guest-kept"><span class="material-icons-round">inventory_2</span><div>${names.map(x => `<b>${esc(x.nm)}</b>: ${x.n} ${x.n === 1 ? 'notifica salvata' : 'notifiche salvate'}`).join('<br>')}<small>Non si vedono in modalità Ospite. Le ritrovi scegliendo di nuovo quel nome.</small></div></div>` : '';
            c.innerHTML = `<div class="nt-guest"><span class="nt-guest-ico material-icons-round">notifications_off</span><b>Come Ospite non ricevi notifiche</b>
                <p>Le notifiche sono personali: avvisano <b>te</b> quando ti assegnano nuovi turni, quando cambiano o vengono tolti, il giorno prima di una reperibilità e con il turno di domani.</p>
                <p>Per riceverle scegli il tuo nome. Funzionano anche ad app chiusa, se le attivi nelle Opzioni.</p>
                <button onclick="closeNotifCenter();setTimeout(requestChangeIdentityDirect,300)"><span class="material-icons-round">person_search</span>Scegli chi sei</button></div>` + kept;
            return;
        }
        const items = currentNotifTab === 'archivio' ? mine.filter(n => n.archived)
            : currentNotifTab === 'nuove' ? mine.filter(n => !n.read && !n.archived)
            : mine.filter(n => !n.archived);
        let intro = '';
        if(!userIdentity || userIdentity === 'Ospite') intro = `<div class="nt-intro"><span class="material-icons-round">info</span><div><b>Non sai chi sei per l\u2019app</b><small>Scegli il tuo nome: ti avviseremo quando ti assegnano nuovi turni, quando cambiano e il giorno prima di una reperibilit\u00e0.</small></div><button onclick="closeNotifCenter();setTimeout(requestChangeIdentityDirect,300)">Scegli</button></div>`;
        if(!items.length) {
            const msg = currentNotifTab === 'archivio' ? 'Archivio vuoto.' : currentNotifTab === 'nuove' ? 'Sei in pari: nessuna notifica da leggere.' : 'Nessuna notifica.';
            c.innerHTML = intro + `<div class="nt-empty"><span class="material-icons-round">${currentNotifTab === 'nuove' ? 'mark_email_read' : 'notifications_none'}</span>${msg}</div>`;
            return;
        }
        const rich = items.filter(n => ['richiesta', 'nota'].includes(notifKind(n))), rest = items.filter(n => !['richiesta', 'nota'].includes(notifKind(n)));
        let html = intro;
        if(rich.length) html += `<div class="nt-section">Richieste da gestire <span>${rich.length}</span></div>` + renderNotifGroup(rich);
        if(rest.length) html += `<div class="nt-section">Turni e reperibilit\u00e0 <span>${rest.length}</span></div>` + renderNotifGroup(rest);
        c.innerHTML = html;
    }
    function renderNotifGroup(items) {
        const sorted = items.slice().sort((a, b) => getNotifTs(b) - getNotifTs(a));
        let html = '', lastDay = null;
        sorted.forEach(item => {
            const d = new Date(getNotifTs(item)), dayKey = d.toDateString();
            if(dayKey !== lastDay) { html += `<div class="nt-day">${formatNotifDayLabel(d)}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}</div>`; lastDay = dayKey; }
            const k = notifKind(item), K = NT_KINDS[k];
            const time = d.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
            const title = item.title || K.title;
            const detail = item.detail !== undefined ? esc(item.detail) : (item.text || '');
            const list = (item.items || []).map(it => `<li><span>${esc(it.label)}</span><b>${esc(it.value)}</b></li>`).join('');
            let actions = '';
            if(currentNotifTab === 'archivio') actions = `<button class="nt-act" title="Ripristina" onclick="event.stopPropagation();restoreNotif(${item.id})"><span class="material-icons-round">unarchive</span></button><button class="nt-act danger" title="Elimina" onclick="event.stopPropagation();permanentDeleteNotif(${item.id})"><span class="material-icons-round">delete_forever</span></button>`;
            else if(k === 'nota') actions = `<button class="nt-act" title="Apri le note" onclick="event.stopPropagation();noteOpenFromNotif('${item.noteId || ''}')"><span class="material-icons-round">open_in_new</span></button><button class="nt-act ok" title="Letta: archivia" onclick="event.stopPropagation();checkOffRichiesta(${item.id})"><span class="material-icons-round">check_circle</span></button>`;
            else if(k === 'richiesta') actions = `<button class="nt-act" title="Apri nel portale Richieste" onclick="event.stopPropagation();openRequestFromNotif(${item.reqId ? `'${item.reqId}'` : 'null'})"><span class="material-icons-round">open_in_new</span></button><button class="nt-act ok" title="Gestita: archivia" onclick="event.stopPropagation();checkOffRichiesta(${item.id})"><span class="material-icons-round">check_circle</span></button>`;
            else actions = `<button class="nt-act" title="Archivia" onclick="event.stopPropagation();deleteNotif(${item.id})"><span class="material-icons-round">archive</span></button>`;
            html += `<div class="nt-card notif-item ${item.read ? '' : 'unread'} ${list ? 'has-list' : ''}" data-id="${item.id}" onclick="notifTap('${item.id}')">
                <span class="nt-ico" style="background:${K.color}"><span class="material-icons-round">${K.icon}</span></span>
                <div class="nt-main">
                    <div class="nt-top"><b>${esc(title)}</b><span class="nt-time">${time}</span></div>
                    <div class="nt-detail">${detail}</div>
                    ${list ? `<ul class="nt-list">${list}</ul><div class="nt-more">${(item.items || []).length} giorni \u00b7 tocca per vedere</div>` : ''}
                </div>
                <div class="nt-actions">${actions}</div>
            </div>`;
        });
        return html;
    }
    function deleteNotif(id) { vibrate(); const n = notifHistory.find(x => x.id === id); if(n) n.archived = true; saveNotifications(); renderNotifList(); updateBadge(); }
    function restoreNotif(id) { vibrate(); const n = notifHistory.find(x => x.id === id); if(n) n.archived = false; saveNotifications(); renderNotifList(); updateBadge(); }
    function permanentDeleteNotif(id) { if(!confirm("Eliminare definitivamente questa notifica?")) return; vibrate(); notifHistory = notifHistory.filter(n => n.id !== id); saveNotifications(); renderNotifList(); updateBadge(); }
    function clearAllNotif() { vibrate(); myNotifs().forEach(n => { n.read = true; }); saveNotifications(); updateArchiveAllBtnVisibility(); renderNotifList(); updateBadge(); }
    // Tocco su una notifica: diventa letta e mostra/nasconde il dettaglio.
    function notifTap(id) {
        const n = notifHistory.find(x => String(x.id) === String(id)); if(!n) return;
        const card = document.querySelector(`.nt-card[data-id="${id}"]`);
        if(!n.read) { n.read = true; saveNotifications(); updateBadge(); updateArchiveAllBtnVisibility(); if(card) card.classList.remove('unread'); const c = document.getElementById('nt-count-nuove'); if(c) { const k = myNotifs().filter(x => !x.read && !x.archived).length; c.textContent = k || ''; } }
        if(card) card.classList.toggle('open');
    }
    // Spunta una richiesta: bagliore verde sulla card, poi la archivia davvero e ridisegna.
    function checkOffRichiesta(id) {
        vibrate();
        const el = document.querySelector(`.notif-item[data-id="${id}"]`);
        if(el) el.classList.add('notif-flash-green');
        setTimeout(() => {
            const n = notifHistory.find(x => x.id === id);
            if(n) n.archived = true;
            saveNotifications(); renderNotifList(); updateBadge();
        }, 600);
    }
    // Apre il pannello Richieste direttamente da una notifica (chiude prima il centro notifiche).
    function openRequestFromNotif(reqId) {
        closeNotifCenter();
        setTimeout(() => { window.openRichiestePanel(reqId); }, 320);
    }
    // Converte una chiave data "MESE-giorno" (es. "SETTEMBRE-18") in un'etichetta leggibile.
    function formatNotifDateKey(dateKey) {
        const parts = (dateKey || "").split('-');
        if(parts.length !== 2) return dateKey;
        const monthName = parts[0].charAt(0) + parts[0].slice(1).toLowerCase();
        return `${parseInt(parts[1])} ${monthName}`;
    }
    // Converte un codice turno grezzo (M, P, N, M+N, "P/R"...) nel nome completo, includendo
    // l'eventuale reperibilità associata — usata nelle notifiche di cambio turno.
    function formatShiftLabel(rawCode) {
        let val = (rawCode || "").toString().trim();
        if(!val || val === "-") return "Libero / Nessun turno";
        let repSuffix = "";
        if(isRepStr(val)) {
            repSuffix = " + Reperibilità";
            const si = val.indexOf('/'); if(si !== -1) val = val.substring(0, si).trim();
        }
        const upper = val.toUpperCase().replace(/\s+/g,'');
        if(isMN(upper)) return "Mattina + Notte" + repSuffix;
        const SHIFT_FULL_LABELS = { M:"Mattina", P:"Pomeriggio", N:"Notte", SM:"Smonto", S:"Smonto", R:"Riposo" };
        const diurno = /^[a-z]/.test(val) && SHIFT_FULL_LABELS[upper] ? " (diurno)" : "";
        return (SHIFT_FULL_LABELS[upper] || val) + diurno + repSuffix;
    }
    function showChangeAlert(changes) {
        const box = document.getElementById('alert-message-text');
        const shown = changes.slice(0, 5);
        const extra = changes.length - shown.length;
        box.innerHTML =
            `<div style="font-weight:800; margin-bottom:12px;">${changes.length === 1 ? 'È cambiato 1 turno:' : `Sono cambiati ${changes.length} turni:`}</div>` +
            shown.map(c => `<div style="background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:10px 12px; margin-bottom:8px; text-align:left;">${c}</div>`).join('') +
            (extra > 0 ? `<div style="font-size:0.78rem; color:var(--text-sec); text-align:center; margin-top:4px;">+ altri ${extra} cambiamenti — vedi tutto nelle notifiche</div>` : '');
        let m = document.getElementById('alert-modal'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 100); vibrate();
    }
    // Chiude questo avviso e apre direttamente il centro notifiche sullo Storico completo.
    function openNotificationsFromAlert() {
        closeAlertAndSave();
        setTimeout(() => {
            openNotifCenter();
            switchNotifTab('tutte', document.querySelector('#notif-center-modal .nt-tab[data-notiftab="tutte"]'));
        }, 320);
    }
    function closeAlertAndSave() { vibrate(); let m = document.getElementById('alert-modal'); m.classList.remove('open'); setTimeout(() => m.style.display='none', 300); }

    // ── Popup dedicato alle nuove richieste dal portale Richieste ───────────
    let lastRichiestaAlertReqId = null;
    function reqAlertTitle(info) { const t = document.querySelector('#richiesta-alert-modal .alert-title'); if(t) t.textContent = info ? 'CESSIONE REPERIBILIT\u00c0' : 'NUOVA RICHIESTA'; }
    function showRichiestaAlert(name, label, swap, periodo, reqId, info) {
        lastRichiestaAlertReqId = reqId || null; lastAlertNote = '';
        reqAlertTitle(info);
        document.getElementById('richiesta-alert-text').innerHTML =
            `<div style="background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:12px 14px; text-align:left;">
                <div style="font-weight:900; font-size:1rem; margin-bottom:4px;">${name || '—'}</div>
                <div style="font-size:0.88rem; color:var(--text-sec);">${label}${swap}${periodo ? ' · ' + periodo : ''}</div>
             </div>
             <div style="font-size:0.8rem; color:var(--text-sec); margin-top:12px;">${info ? 'Gi\u00e0 inserita in automatico nel calendario delle reperibilit\u00e0: \u00e8 solo un avviso, non serve fare nulla.' : 'Da approvare come coordinatore.'}</div>`;
        let m = document.getElementById('richiesta-alert-modal'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 100);
        if(navigator.vibrate) navigator.vibrate([40,60,40]); // vibrazione doppia: si distingue da un avviso normale
    }
    function closeRichiestaAlert() {
        vibrate();
        let m = document.getElementById('richiesta-alert-modal'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 300);
    }
    function openRequestFromAlert() {
        const reqId = lastRichiestaAlertReqId;
        closeRichiestaAlert();
        if(lastAlertNote) { const w = lastAlertNote; lastAlertNote = ''; setTimeout(() => w.startsWith('chat:') ? noteOpenChat(w.slice(5)) : noteOpenList(w), 320); return; }
        setTimeout(() => { window.openRichiestePanel(reqId); }, 320);
    }

    // oggi come prima riga: subito sotto barra in alto, nomi e barra del mese (tutti fissi)
    function todayTopOffset(el) {
        const hdr = document.querySelector('header'), th = document.querySelector('#main-table thead th');
        let mh = el.previousElementSibling; while(mh && !mh.classList.contains('month-header')) mh = mh.previousElementSibling;
        return (hdr ? hdr.offsetHeight : 0) + (th ? th.offsetHeight : 0) + (mh ? mh.offsetHeight : 0);
    }
    function scrollToToday(instant) {
        if(calOverview) { ovScrollToday(); return; }
        if(ddOn()) { ddScrollToday(instant); return; }
        if(liteOn()) liteShowRow(liteTodayRow());
        const el = document.getElementById('today-row'); if(!el) return;
        liteScrollTo(el, todayTopOffset(el), instant);
    }
    // All'apertura: oggi già in cima, senza vedere i giorni scorrere. Si salta secco (mentre c'è ancora
    // la schermata di caricamento) e si risalta finché il calendario cambia altezza (caratteri e dati
    // che arrivano dopo, ridisegni); ci si ferma appena l'utente tocca o scorre.
    function startAtToday() {
        const evs = ['touchstart', 'wheel', 'mousedown', 'keydown'], tbl = document.getElementById('main-table');
        let stopped = false, ro = null;
        const stop = () => { stopped = true; evs.forEach(e => removeEventListener(e, stop, true)); if(ro) ro.disconnect(); };
        evs.forEach(e => addEventListener(e, stop, { capture:true, passive:true }));
        const pin = () => { if(!stopped) scrollToToday(true); };
        pin();
        if(tbl && window.ResizeObserver) { ro = new ResizeObserver(pin); ro.observe(tbl); }
        [300, 1000, 2500].forEach(t => setTimeout(pin, t));
        setTimeout(stop, 10000);
    }
    // la schermata di caricamento si toglie solo quando i caratteri sono pronti e oggi è già in cima
    async function hideLoader(splashMinTime) {
        if(splashMinTime) await splashMinTime;
        try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]); } catch(e) {}
        if(prefs.startToday !== false && !calOverview) scrollToToday(true);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        document.getElementById('loader').style.opacity = '0';
        setTimeout(() => document.getElementById('loader').style.display = 'none', 500);
    }

    function filterDriver(val) {
        vibrate();
        if(val === 'all') selectedDrivers.clear();
        else { const intVal = parseInt(val); if(selectedDrivers.has(intVal)) selectedDrivers.delete(intVal); else selectedDrivers.add(intVal); }
        setPref('filter', drivers.filter(d => selectedDrivers.has(d.idx)).map(d => d.originalName || d.name), true); renderTable();
        renderDriverFilterDropdown(); updateDriverFilterBadge();
        if(selectedDrivers.size === 0) setCurrentView("Tabella Turni (Tutti)");
        else setCurrentView("Filtro: " + drivers.filter(d => selectedDrivers.has(d.idx)).map(d => d.name).join(", "));
    }
    function selectAllDriversFilter() { filterDriver('all'); }
    function toggleDriverFilterDropdown(e) {
        if(e) e.stopPropagation();
        vibrate();
        const dd = document.getElementById('driver-filter-dropdown');
        if(dd.classList.contains('open')) closeDriverFilterDropdown();
        else { renderDriverFilterDropdown(); dd.classList.add('open'); }
    }
    function closeDriverFilterDropdown() { document.getElementById('driver-filter-dropdown').classList.remove('open'); }
    function renderDriverFilterDropdown() {
        const grid = document.getElementById('driver-filter-grid'); if(!grid) return;
        grid.innerHTML = "";
        drivers.filter(d => !d.hidden).forEach(d => {
            const chip = document.createElement('div');
            chip.className = "driver-filter-chip" + (selectedDrivers.has(d.idx) ? " active" : "");
            chip.innerText = d.name;
            chip.onclick = () => filterDriver(d.idx);
            grid.appendChild(chip);
        });
        const allBtn = document.getElementById('driver-filter-all-btn');
        if(allBtn) allBtn.classList.toggle('active', selectedDrivers.size === 0);
    }
    function updateDriverFilterBadge() {
        const b = document.getElementById('driver-filter-badge'); if(!b) return;
        if(selectedDrivers.size > 0) b.classList.add('visible'); else b.classList.remove('visible');
    }
    // Orologio nelle barre dei mesi: la struttura si crea una volta sola e ogni secondo si cambia
    // solo il testo; mentre si scorre non si tocca niente (su iPhone ogni ridisegno fa scattare).
    let clockLastScroll = 0;
    window.addEventListener('scroll', () => { clockLastScroll = Date.now(); }, { passive:true });
    function startLiveClock() {
        setInterval(() => {
            if(document.hidden) return;
            const now = new Date();
            const dateShort = now.toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'});
            const hh = String(now.getHours()).padStart(2,'0'), mm = String(now.getMinutes()).padStart(2,'0'), ss = String(now.getSeconds()).padStart(2,'0');
            if(Date.now() - clockLastScroll > 400) document.querySelectorAll('.live-clock').forEach(el => {
                if(!el._lc) {
                    el.innerHTML = '<span class="material-icons-round">schedule</span><span class="lc-date"></span><span class="lc-time"><span class="lc-hm"></span><span class="lc-sec"></span></span>';
                    el._lc = { d: el.querySelector('.lc-date'), hm: el.querySelector('.lc-hm'), s: el.querySelector('.lc-sec') };
                }
                if(el._lc.d.textContent !== dateShort) el._lc.d.textContent = dateShort;
                if(el._lc.hm.textContent !== hh + ':' + mm) el._lc.hm.textContent = hh + ':' + mm;
                el._lc.s.textContent = ':' + ss;
            });
            const dateEl = document.getElementById('options-live-date');
            const hmEl = document.getElementById('options-live-hm');
            const sEl = document.getElementById('options-live-s');
            if(dateEl) dateEl.innerText = now.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
            if(hmEl) hmEl.innerText = `${hh}:${mm}`;
            if(sEl) sEl.innerText = `:${ss}`;
            if(ss === '00') updateRepNowPill();   // la fascia può cambiare allo scoccare dell'ora
        }, 1000);
    }

    // ── helpers ──────────────────────────────────────────────────────────────
    function isRepStr(str) {
        let s = (str || "").toLowerCase().replace(/\s+/g,'');
        return s.includes("m/r") || s.includes("p/r") || s.includes("n/r") || s.includes("s/r") || s.includes("sm/r");
    }
    function isMN(str) {
        let s = (str || "").toUpperCase().replace(/\s+/g,'');
        return s === "M+N" || s === "MN";
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONTEGGIO ORARIO — calcolo ore lavorate a partire dal calendario
    // ═══════════════════════════════════════════════════════════════════════
    function minutesFromRange(rangeStr) {
        if(!rangeStr) return 0;
        let s = rangeStr.toString().trim().toUpperCase();
        if(s === "RIPOSO" || s === "") return 0;
        let parts = s.split('-').map(p=>p.trim());
        if(parts.length !== 2) return 0;
        let a = parts[0].split(':').map(Number), b = parts[1].split(':').map(Number);
        if(a.length<2 || b.length<2 || a.some(isNaN) || b.some(isNaN)) return 0;
        let start = a[0]*60+a[1], end = b[0]*60+b[1];
        if(end <= start) end += 1440; // turno che attraversa la mezzanotte (es. Notte 19:45-00:00)
        return end - start;
    }
    function overrideKey(originalName, monthName, day, year) {
        const k = `${originalName}__${monthName}-${day}`;
        return (year && year !== SHIFT_YEAR) ? `${k}@${year}` : k;
    }

    // Assenze giustificate (ferie, recupero, congedo, malattia, permessi, festivi, gravidanza,
    // sostituzione coordinatore…): coprono l'intera giornata di contratto (vedi contractDayMinutesAt).
    // Autisti: dal 5/10/2026 chi in quei giorni fa il diurnista lavora 6 giorni (lun–sab) da 6 ore,
    // quindi un'assenza giustificata vale ore settimanali ÷ 6 anche il sabato; i turnisti restano
    // a ÷ 5 dal lunedì al venerdì. Diurnista o turnista si capisce dai turni vicini (m/p/r minuscoli).
    function isDiurnoDay(rowIdx, colIdx) {
        const iso = repRowDate(rowIdx); if(!iso || iso < DIURNI6_FROM) return false;
        const kind = r => {
            const c = finalData[r] && finalData[r][colIdx]; if(!c) return null;
            const v = (c.v || '').toString().split('/')[0].trim();
            if(/^[mpr]$/.test(v)) return 'd';
            if(/^(M|P|N|S|SM|R|M\+N|MN)$/.test(v.toUpperCase().replace(/\s+/g, '')) && v !== v.toLowerCase()) return 't';
            return null;
        };
        const base = new Date(iso + 'T12:00:00'), wd = (base.getDay() + 6) % 7;   // 0 = lunedì
        const at = k => { const dt = new Date(base); dt.setDate(dt.getDate() + k); const r = repRowOfDate(ymd(dt)); return r ? kind(r) : null; };
        // prima la stessa settimana (lun–dom): basta un m/p/r per essere diurnista
        const week = []; for(let k = -wd; k <= 6 - wd; k++) week.push(at(k));
        if(week.includes('d')) return true;
        if(week.includes('t')) return false;
        // settimana tutta di assenze: decide il turno più vicino prima o dopo
        for(let k = 1; k <= 21; k++) { const a = at(-wd - k), b = at(6 - wd + k); if(a || b) return (a || b) === 'd'; }
        return false;
    }
    function contractDayMinutesAt(rowIdx, colIdx) {
        const iso = repRowDate(rowIdx); if(!iso) return 0;
        const dt = new Date(iso + 'T12:00:00'), wh = getContractHours(colIdx);
        if(isDiurnoDay(rowIdx, colIdx)) return dt.getDay() === 0 ? 0 : wh * 60 / 6;
        return isContractDay(dt) ? wh * 60 / CONTRACT_WORKDAYS : 0;
    }
    // ── Ore importate dal file principale (Autisti 2026.xlsm, foglio CONTEGGI ORARI) ──
    // Restano solo come informazione: dal 1/11/2026 le ore delle assenze si calcolano come per gli
    // infermieri (ciclo del turno, vedi absCycleCode), così combaciano col file anche senza importarlo.
    let absMinImported = {};   // "YYYY-MM-DD|NOME" -> minuti, dal file principale (documento prova_ore_assenze)
    function absImportedMinutes(rowIdx, colIdx) {
        const iso = repRowDate(rowIdx), d = getDriverByIdx(colIdx);
        if(!iso || !d) return null;
        const v = absMinImported[iso + '|' + d.originalName];
        return typeof v === 'number' ? v : null;
    }
    // Assenze a giornata intera dei turnisti (C.O., ferie residue, P.S., recuperi, malattia, festivi
    // non lavorati, studio…): come nel file Excel valgono le ore del turno che coprono e seguono il
    // ciclo P › M › N › SM › R. Il ciclo continua dal turno del giorno prima del blocco di assenze
    // (dopo una mattina si parte dalla notte, dopo un riposo dal pomeriggio; dopo un turno da
    // diurnista o una casella vuota dal pomeriggio). Se sopra l'assenza è scritto il turno (P, M, N,
    // S, R) vale quello. Il riposo vale 0 ore e non scala giorni. Il festivo non goduto resta a 6 h,
    // il permesso notte vale la notte e il giorno dopo lo smonto. (Stesso calcolo dell'app infermieri.)
    // autisti: nel file Excel anche il distacco (k) e il permesso legge (pl) seguono il ciclo del turno
    const ABS_CYCLE = { f:1, v:1, r:1, m:1, p:1, c:1, nl:1, gr:1, s:1, l:1, a:1, k:1, pl:1 };
    const ABS_CYCLE_NEXT = { P:'M', M:'N', N:'SM', SM:'R', R:'P' };
    function absTurnCode(v) {   // turno da turnista scritto nella casella (P, M, N, SM, R), 'd' se da diurnista, o ''
        let u = String(v || '').trim(); const i = u.indexOf('/'); if(i !== -1) u = u.slice(0, i).trim();
        if(/^[a-z]/.test(u)) return 'd';
        u = u.toUpperCase().replace(/\s+/g, '');
        if(u === 'M+N' || u === 'MN') return 'N';
        if(u === 'S') return 'SM';
        if(u === 'RIPOSO') return 'R';
        return ABS_CYCLE_NEXT[u] ? u : '';
    }
    function absCycleCode(rowIdx, colIdx) {
        const cellAt = r => (finalData[r] || [])[colIdx] || {}, sub = r => String(cellAt(r).subV || '').trim().toLowerCase();
        const inBlock = r => r >= 1 && finalData[r] && (ABS_CYCLE[sub(r)] || sub(r) === 'ng' || sub(r) === 'pn' || (r - 1 >= 1 && sub(r - 1) === 'pn' && pnTailFree(cellAt(r))));
        if(!finalData[rowIdx] || !ABS_CYCLE[sub(rowIdx)]) return null;
        let start = rowIdx; while(inBlock(start - 1)) start--;
        const before = start - 1 >= 1 ? absTurnCode(cellAt(start - 1).v) : '';
        // un giorno solo tra due giorni da diurnista (es. un recupero isolato): vale una giornata da diurnista
        if(before === 'd' && start === rowIdx && !inBlock(rowIdx + 1) && rowIdx + 1 < finalData.length && absTurnCode(cellAt(rowIdx + 1).v) === 'd') return sub(rowIdx) === 'nl' ? 'F6' : 'D';
        let code = before && before !== 'd' ? before : 'R', flat = false;
        for(let r = start; r <= rowIdx; r++) {
            const own = absTurnCode(cellAt(r).v);
            flat = false;
            if(sub(r) === 'pn') code = 'N';
            else if(own && own !== 'd') code = own;
            else if(r === start && before === 'd' && sub(r) === 'nl') flat = true;   // festivo dopo un diurno: 6 h, il ciclo parte dopo
            else code = ABS_CYCLE_NEXT[code];
        }
        return flat ? 'F6' : code;
    }
    // ore di un giorno di assenza secondo absCycleCode
    function absCycleMinutes(code, rowIdx, colIdx) {
        if(code === 'D') return minutesFromRange(diurniSched('m', repRowDate(rowIdx)));
        if(code === 'F6') return getContractHours(colIdx) * 60 / 6;
        return minutesFromRange(SCHEDULE[code]);
    }
    function justifiedDayMinutes(rowIdx, colIdx) {
        const cell = (finalData[rowIdx] || [])[colIdx] || {};
        const sb = String(cell.subV || '').trim().toLowerCase();
        if(sb === 'pn') return minutesFromRange(SCHEDULE["N"]);
        const coc = absCycleCode(rowIdx, colIdx); if(coc) return absCycleMinutes(coc, rowIdx, colIdx);
        const own = String(cell.v || '').split('/')[0].trim();
        if(/^(r|riposo)$/i.test(own)) return 0;
        if(sb === 'ng') return getContractHours(colIdx) * 60 / 6;   // festivo non goduto: 6 h
        if(sb === 'k') return 0;   // distacco speciale: 0 ore, come nel file Excel
        if(sb === 'z') {           // sostituzione coordinatore: le ore del turno scritto sopra, se no una mattina da diurnista
            if(own && own !== '-') { const t = /^[a-z]/.test(own) ? diurniSched(own, repRowDate(rowIdx)) : SCHEDULE[own.toUpperCase()]; if(t !== undefined) return minutesFromRange(t); }
            return minutesFromRange(diurniSched('m', repRowDate(rowIdx)));
        }
        return contractDayMinutesAt(rowIdx, colIdx);
    }
    function listenAbsMinutes() {
        if(!fbReady) return;
        cfgRef('ore_assenze').onSnapshot(doc => {
            absMinImported = doc.exists ? ((doc.data() || {}).min || {}) : {};
            refreshAfterRemoteOverrides();
        }, err => console.error('Errore ascolto ore assenze:', err));
    }
    // Il giorno dopo un permesso notte è libero se non ha un turno suo né un'altra assenza
    function pnTailFree(cell) {
        const sub = String((cell && cell.subV) || '').trim().toLowerCase();
        if(sub && SPECIAL_SUBCODES[sub] !== undefined) return false;
        let v = String((cell && cell.v) || '').trim(); const i = v.indexOf('/'); if(i !== -1) v = v.slice(0, i).trim();
        return !v || v === '-' || /^(r|riposo|s|sm)$/i.test(v);
    }
    // Ogni notte vale 11:35: 4:15 prima di mezzanotte e 7:20 il giorno dopo. Se il giorno dopo non
    // c'è lo smonto (S) ma un riposo, una casella vuota o un'altra notte, le 7:20 si contano lo stesso.
    function prevPlainNight(rowIdx, colIdx) {
        if(rowIdx - 1 < 1) return false;
        const c = (finalData[rowIdx - 1] || [])[colIdx] || {}, sub = String(c.subV || '').trim().toLowerCase();
        if(sub && SPECIAL_SUBCODES[sub] !== undefined) return false;
        if(c.customMinutes !== undefined && c.customMinutes !== null && c.customMinutes !== '') return false;
        let v = String(c.v || '').trim(); const i = v.indexOf('/'); if(i !== -1) v = v.slice(0, i).trim();
        return v.toUpperCase() === 'N';
    }
    function computeDayInfo(rowIdx, colIdx) {
        const info = computeDayInfoBase(rowIdx, colIdx);
        if(info.code === 'SM' || info.code === 'S' || info.code === 'STR' || info.manual || info.justified || info.unrecognized || !prevPlainNight(rowIdx, colIdx)) return info;
        const rest = !info.code || /^r$/i.test(info.code), tail = minutesFromRange(SCHEDULE["SM"]);
        return Object.assign({}, info, { minutes: (rest ? 0 : (info.minutes || 0)) + tail, code: rest ? 'SM' : info.code, label: rest ? 'SMONTO (dopo la notte)' : 'SMONTO + ' + info.label, nightTail: true });
    }
    // Metodo A (principale): rispecchia esattamente la logica usata per disegnare
    // le celle del calendario, incluso lo SMONTO automatico dopo un turno M+N.
    // Ore a mano (customMinutes, in ore): il coordinatore scrive le ore vere di quel giorno. Il turno
    // o l'assenza restano (il C.O. continua a contare nei giorni di ferie), cambiano solo le ore.
    function computeDayInfoBase(rowIdx, colIdx) {
        const row = finalData[rowIdx]; if(!row) return { minutes:0, code:"", label:"" };
        const cm = (row[colIdx] || {}).customMinutes;
        if(cm === undefined || cm === null || cm === "") return computeDayInfoAuto(rowIdx, colIdx);
        const minutes = Math.round(Number(cm)*60) || 0, auto = computeDayInfoAuto(rowIdx, colIdx);
        if(!auto.code || auto.unrecognized) return { minutes, code: "STR", label: "ORE A MANO", manual:true };
        return Object.assign({}, auto, { minutes, label: auto.label + " \u00b7 ore a mano", manual:true, autoMinutes: auto.minutes });
    }
    function computeDayInfoAuto(rowIdx, colIdx) {
        const row = finalData[rowIdx]; if(!row) return { minutes:0, code:"", label:"" };
        const info = row[colIdx] || {};
        const prevRow = finalData[rowIdx-1];
        const prevInfo = prevRow ? (prevRow[colIdx] || {}) : null;
        let prevRaw = (prevInfo && prevInfo.v !== undefined && prevInfo.v !== null) ? prevInfo.v.toString().trim().toUpperCase().replace(/\s+/g,'') : "";
        if(isMN(prevRaw)) return { minutes: minutesFromRange(SCHEDULE["SM"]), code:"SM", label:"SMONTO (dopo M+N)" };
        // Permesso notte: il giorno dopo la notte continua fino alle 07:20 e quelle ore si contano sempre
        // (anche se la casella è vuota, "-", un riposo o segnata "x" come nel file Excel)
        if(prevInfo && String(prevInfo.subV || '').trim().toLowerCase() === 'pn' && pnTailFree(info))
            return { minutes: minutesFromRange(SCHEDULE["SM"]), code:"pn", label:"PERMESSO NOTTE (dopo mezzanotte)", justified:true, pnTail:true };

        let rawStr = (info.v !== undefined && info.v !== null) ? info.v.toString().trim() : "";
        let rawUpper = rawStr.toUpperCase().replace(/\s+/g,'');
        if(isMN(rawUpper)) return { minutes: minutesFromRange(SCHEDULE["M"]) + minutesFromRange(SCHEDULE["N"]), code:"M+N", label:"MATTINA + NOTTE" };

        let subVal = (info.subV||"").toString().trim().toLowerCase();
        if(SPECIAL_SUBCODES[subVal] !== undefined) return { minutes: subVal === 'pl' ? plDayMinutes(info) : justifiedDayMinutes(rowIdx, colIdx), code:subVal, label: SPECIAL_SUBCODES[subVal], justified:true };

        let val = rawStr; let si = val.indexOf('/'); if(si !== -1) val = val.substring(0,si).trim();
        if(!val || val === "-") return { minutes:0, code:"", label:"" };

        let firstChar = val.charAt(0);
        let isDiurnista = firstChar >= 'a' && firstChar <= 'z';
        if(isDiurnista) {
            let t = diurniSched(val, repRowDate(rowIdx));
            if(t === undefined) return { minutes:0, code:val, label:val, unrecognized:true };
            return { minutes: minutesFromRange(t), code: val.toLowerCase(), label: val.toUpperCase()+" (diurno)" };
        } else {
            let u = val.toUpperCase();
            if(customCodes[u]) return customDayInfo(u, customCodes[u], rowIdx, colIdx);   // casella personalizzata
            let t = SCHEDULE[u];
            if(t === undefined) return { minutes:0, code:u, label:u, unrecognized:true };
            return { minutes: minutesFromRange(t), code:u, label:u };
        }
    }
    // Metodo B (doppio controllo): ricalcolo indipendente scritto da zero, senza
    // richiamare computeDayInfo, per intercettare eventuali errori di calcolo.
    function independentDayMinutes(rowIdx, colIdx) {
        const base = independentDayMinutesBase(rowIdx, colIdx);
        if(rowIdx < 2) return base;
        const prev = (finalData[rowIdx - 1] || [])[colIdx] || {}, cur = (finalData[rowIdx] || [])[colIdx] || {};
        const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k), filled = x => x !== undefined && x !== null && x !== "";
        const pv = String(prev.v || "").split('/')[0].trim().toUpperCase(), ps = String(prev.subV || "").trim().toLowerCase();
        if(pv !== "N" || (ps && has(SPECIAL_SUBCODES, ps)) || filled(prev.customMinutes)) return base;
        const cs = String(cur.subV || "").trim().toLowerCase(), cv = String(cur.v || "").split('/')[0].trim(), cu = cv.toUpperCase().replace(/\s+/g, "");
        if((cs && has(SPECIAL_SUBCODES, cs)) || filled(cur.customMinutes) || cu === "S" || cu === "SM") return base;
        if(customCodes[cu] && customCodes[cu].kind === 'abs') return base;
        const known = !cv || cv === "-" || cu === "M+N" || cu === "MN" || customCodes[cu] || (/^[a-z]/.test(cv) ? diurniSched(cv, repRowDate(rowIdx)) !== undefined : SCHEDULE[cu] !== undefined);
        return known ? base + minutesFromRange(SCHEDULE["SM"]) : base;
    }
    function independentDayMinutesBase(rowIdx, colIdx) {
        const row = finalData[rowIdx]; if(!row) return 0;
        const cell = row[colIdx] || {};
        if(cell.customMinutes !== undefined && cell.customMinutes !== null && cell.customMinutes !== "") {
            return Math.round(Number(cell.customMinutes)*60) || 0;
        }
        const prevRow = finalData[rowIdx-1]; const prevCell = prevRow ? (prevRow[colIdx]||{}) : {};
        let prevRaw = (prevCell.v||"").toString().trim().toUpperCase().replace(/\s+/g,'');
        if(prevRaw === "M+N" || prevRaw === "MN") return minutesFromRange(SCHEDULE["SM"]);
        if((prevCell.subV||"").toString().trim().toLowerCase() === "pn") {
            const sb = (cell.subV||"").toString().trim().toLowerCase(), own = (cell.v||"").toString().split('/')[0].trim();
            const otherAbs = sb && Object.prototype.hasOwnProperty.call(SPECIAL_SUBCODES, sb);
            if(!otherAbs && (own === "" || own === "-" || ["R","RIPOSO","S","SM"].includes(own.toUpperCase()))) return minutesFromRange(SCHEDULE["SM"]);
        }
        let raw = (cell.v||"").toString().trim();
        let rawU = raw.toUpperCase().replace(/\s+/g,'');
        if(rawU === "M+N" || rawU === "MN") return minutesFromRange(SCHEDULE["M"]) + minutesFromRange(SCHEDULE["N"]);
        let sub = (cell.subV||"").toString().trim().toLowerCase();
        if(Object.prototype.hasOwnProperty.call(SPECIAL_SUBCODES, sub)) {
            // assenza giustificata: l'orario del turno che avrebbe fatto (come nel file Excel principale)
            if(sub === 'pl') return plDayMinutes(cell);   // permesso legge: le ore scritte nella casella (6 h, Mat 26/11/2026)
            return justifiedDayMinutes(rowIdx, colIdx);
        }
        let v = raw; let si = v.indexOf('/'); if(si !== -1) v = v.substring(0,si).trim();
        if(!v || v === "-") { const imp = absImportedMinutes(rowIdx, colIdx); return imp !== null ? imp : 0; }   // es. permesso legge di un giorno senza turno (/R)
        let fc = v.charAt(0); let isD = fc>='a' && fc<='z';
        if(!isD && customCodes[v.toUpperCase()]) { const cc = customCodes[v.toUpperCase()]; return cc.kind === 'abs' ? justifiedDayMinutes(rowIdx, colIdx) : customMinutes(cc); }
        let t = isD ? diurniSched(v, repRowDate(rowIdx)) : SCHEDULE[v.toUpperCase()];
        if(t === undefined) return 0;
        return minutesFromRange(t);
    }
    // Il file può continuare oltre dicembre (es. gennaio dell'anno dopo): le righe dopo il
    // "giro d'anno" appartengono a SHIFT_YEAR+1 e non vanno contate nell'anno dei turni.
    let shiftYearRollRow = null, shiftYearRollFor = null;
    function shiftRowYear(r) {
        if(shiftYearRollFor !== finalData) {
            shiftYearRollRow = Infinity; let prev = -1;
            for(let i = 1; i < finalData.length; i++) { const mi = MONTH_MAP[finalData[i][0].v]; if(mi === undefined) continue; if(mi < prev) { shiftYearRollRow = i; break; } prev = mi; }
            shiftYearRollFor = finalData;
        }
        return r >= shiftYearRollRow ? SHIFT_YEAR + 1 : SHIFT_YEAR;
    }
    function buildDaysIndex() {
        let list = [];
        for(let r=1; r<finalData.length; r++) {
            let row = finalData[r]; let mName = row[0].v; let dNum = parseInt(row[1].v);
            if(!mName || isNaN(dNum)) continue;
            if(shiftRowYear(r) !== SHIFT_YEAR) continue;
            let mIdx = MONTH_MAP[mName]; if(mIdx === undefined) continue;
            list.push({ rowIdx:r, month:mName, monthIdx:mIdx, day:dNum, date:new Date(SHIFT_YEAR, mIdx, dNum) });
        }
        return list;
    }
    function getISOWeek(date) {
        let d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        let dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        let yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    }
    function getWeekRange(anchorDate) {
        let d = new Date(anchorDate); let day = d.getDay(); let diffToMon = (day===0?-6:1-day);
        let mon = new Date(d); mon.setDate(d.getDate()+diffToMon); mon.setHours(0,0,0,0);
        let sun = new Date(mon); sun.setDate(mon.getDate()+6); sun.setHours(23,59,59,999);
        return { start:mon, end:sun };
    }
    // Cartellino orario: settimana lavorativa su 6 giorni (lunedì–sabato). Con un
    // contratto da 36 h ogni giorno lun–sab matura 6 h; la domenica non matura ore.
    // Autisti: 36 h su 5 giorni (7 h 12 al giorno), dal lunedì al venerdì; dal 5/10/2026 i diurnisti 6 h lun–sab (contractDayMinutesAt).
    const CONTRACT_WORKDAYS = 5;
    function isContractDay(date) { const g = date.getDay(); return g !== 0 && g !== 6; }
    // Il contratto conta solo nel periodo in servizio: dal primo all'ultimo giorno dell'anno in cui la
    // persona ha qualcosa in calendario (turno, riposo o assenza). Chi è entrato ad aprile non è "in
    // debito" per gennaio-marzo, e chi non ha più turni dopo una certa data smette di accumulare debito.
    function contractMinutesFor(weeklyHours, dates, driverIdx) {
        const sp = driverIdx === undefined ? null : serviceSpan(driverIdx);
        return dates.filter(dt => isContractDay(dt) && (!sp || (dt >= sp.first && dt <= sp.last))).length * weeklyHours / CONTRACT_WORKDAYS * 60;
    }
    let serviceSpanCache = { data: null, ver: -1, map: {} }, serviceSpanVer = 0;
    function serviceSpan(driverIdx) {
        if(serviceSpanCache.data !== finalData || serviceSpanCache.ver !== serviceSpanVer) serviceSpanCache = { data: finalData, ver: serviceSpanVer, map: {} };
        if(serviceSpanCache.map[driverIdx]) return serviceSpanCache.map[driverIdx];
        let first = null, last = null;
        buildDaysIndex().forEach(dd => { if(computeDayInfo(dd.rowIdx, driverIdx).code) { if(!first) first = dd.date; last = dd.date; } });
        return serviceSpanCache.map[driverIdx] = first ? { first, last } : { first: new Date(8640000000000000), last: new Date(-8640000000000000) };
    }
    function formatHM(totalMinutes) {
        let neg = totalMinutes < 0; let m = Math.round(Math.abs(totalMinutes));
        let h = Math.floor(m/60); let mm = m%60;
        return (neg?"-":"") + h + "h " + (mm<10?"0"+mm:mm) + "m";
    }
    function getDriverByIdx(idx) { return drivers.find(d=>d.idx===idx); }
    function refDateForBalance() {
        let today = new Date(); today.setHours(0,0,0,0);
        if(today.getFullYear() === SHIFT_YEAR) return today;
        return today.getFullYear() > SHIFT_YEAR ? new Date(SHIFT_YEAR,11,31) : new Date(SHIFT_YEAR,0,1);
    }
    function computeDriverBalance(driverIdx) {
        const days = buildDaysIndex();
        let refDate = refDateForBalance();
        let elapsed = days.filter(dd => dd.date <= refDate);
        const drv = getDriverByIdx(driverIdx);
        if(drv && drv.virtual) { // operatore aggiunto a mano: il saldo parte dal primo giorno con un turno
            const first = elapsed.findIndex(dd => { const c = finalData[dd.rowIdx][driverIdx] || {}; return (c.v||'').toString().trim() || (c.subV||'').toString().trim(); });
            elapsed = first === -1 ? [] : elapsed.slice(first);
        }
        if(!elapsed.length) return 0;
        let worked = elapsed.reduce((s,dd)=>s+computeDayInfo(dd.rowIdx,driverIdx).minutes,0);
        let target = contractMinutesFor(getContractHours(driverIdx), elapsed.map(dd => dd.date), driverIdx);
        return worked - target;
    }

    // ── Consigli IA (motore di regole locale, nessuna chiamata esterna) ─────
    const AI_THRESHOLD_LOW = 2*60;   // sotto -2h di scostamento -> operatore in debito
    const AI_THRESHOLD_HIGH = 4*60;  // sopra +4h di scostamento -> operatore in credito
    function toggleAiAdvice(active) {
        aiAdviceEnabled = active;
        localStorage.setItem('ai_advice_enabled', active ? '1' : '0');
        if(typeof finalData !== 'undefined' && finalData.length) renderTable();
    }
    function getAdviceForDriver(driverIdx) {
        let balance = computeDriverBalance(driverIdx);
        if(balance <= -AI_THRESHOLD_LOW) {
            return { type:'debito', title:'Ore in debito',
                text:`È sotto di ${formatHM(Math.abs(balance))} rispetto alle ore contrattuali maturate ad oggi. Valuta di assegnargli uno o più turni aggiuntivi nelle prossime settimane, oppure di fargli recuperare con dello straordinario, per riportarlo in pari. Apri il Conteggio Orario per vedere il dettaglio settimana per settimana.` };
        }
        if(balance >= AI_THRESHOLD_HIGH) {
            return { type:'credito', title:'Ore in credito',
                text:`È in credito di ${formatHM(balance)} rispetto alle ore contrattuali maturate ad oggi. Valuta di inserirgli uno o più riposi extra nelle prossime settimane per riportarlo in pari ed evitare che accumuli troppe ore. Apri il Conteggio Orario per vedere il dettaglio settimana per settimana.` };
        }
        return null;
    }
    function openAiAdvicePopup(driverIdx) {
        let d = getDriverByIdx(driverIdx); if(!d) return;
        let advice = getAdviceForDriver(driverIdx); if(!advice) return;
        vibrate();
        document.getElementById('ai-advice-title').innerText = `${d.name} — ${advice.title}`;
        document.getElementById('ai-advice-text').innerText = advice.text;
        document.getElementById('ai-advice-gotohours').onclick = () => { closeAiAdvicePopup(); setTimeout(()=>{ openHoursModal(); setTimeout(()=>openHoursDetail(driverIdx), 350); }, 260); };
        let m = document.getElementById('ai-advice-popup'); m.style.display='flex';
        setTimeout(()=>m.classList.add('open'),10);
    }
    function closeAiAdvicePopup(e) {
        if(e && e.target !== e.currentTarget) return;
        let m = document.getElementById('ai-advice-popup'); m.classList.remove('open');
        setTimeout(()=>m.style.display='none',250);
    }

    function applyManualOverrides() {
        if(!rawFinalData.length) return;
        finalData = JSON.parse(JSON.stringify(rawFinalData));
        let header = finalData[0]; if(!header) return;
        for(let r=1; r<finalData.length; r++) {
            let row = finalData[r]; let mName = row[0].v; let dNum = parseInt(row[1].v);
            for(let i=3; i<header.length; i++) {
                let origName = header[i];
                let key = overrideKey(origName, mName, dNum, shiftRowYear(r));
                let ov = manualOverrides[key];
                if(ov) row[i] = Object.assign({}, row[i], { v: ov.v, subV: ov.subV || "", overridden:true, customMinutes: ov.customMinutes, perm: ov.perm, coY: ov.coY });
                row[i] = normalizeWrittenAbsence(row[i]);
            }
        }
        asApplySwaps();   // autisti: cambi turno approvati dal portale (se attivi nella Bibbia)
    }
    // Assenze scritte per esteso nella casella (es. "gravidanza") invece del codice sotto il
    // turno: vengono trattate come il codice corrispondente (colore, ore, conteggio assenze).
    const WRITTEN_ABSENCES = { gravidanza:'gr', maternita:'gr', 'maternità':'gr', malattia:'m', ferie:'v', congedo:'f', 'congedo ordinario':'f', recupero:'r', permesso:'p' };
    function normalizeWrittenAbsence(cell) {
        if(!cell) return cell;
        // file Excel: un numero nella riga sotto il turno (es. 7, sfondo azzurro) = ore di permesso legge.
        // Con "-" o vuoto sopra è a giornata intera, con un turno sopra sono ore dentro quel turno.
        const subRaw = (cell.subV === undefined || cell.subV === null ? '' : cell.subV).toString().trim();
        if(/^\d+([.,]\d+)?$/.test(subRaw) && !(cell.perm && cell.perm.k)) {
            const h = parseFloat(subRaw.replace(',', '.'));
            if(h > 0 && h <= 24) {
                let v = (cell.v || '').toString().trim(); if(isRepStr(v) || /^\/\s*r$/i.test(v)) v = v.slice(0, v.indexOf('/')).trim();   // "/R" da solo = solo reperibile, nessun turno
                const onShift = v && v !== '-' && !/^r(iposo)?$/i.test(v);
                return Object.assign({}, cell, onShift ? { subV: '', perm: { k: 'pl', h } } : { subV: 'pl', perm: { k: 'pl', h } }, { writtenAs: subRaw });
            }
        }
        if((cell.subV || '').toString().trim()) return cell;
        const code = WRITTEN_ABSENCES[(cell.v || '').toString().trim().toLowerCase()];
        return code ? Object.assign({}, cell, { v:'', subV: code, writtenAs: cell.v }) : cell;
    }

    // ── Modale Conteggio Orario: elenco operatori ────────────────────────────
    function openHoursModal() {
        closeMenu(); vibrate();
        document.getElementById('hc-list-view').style.display = 'block';
        document.getElementById('hc-detail-view').style.display = 'none';
        const now = new Date(); hgMonth = now.getFullYear() === SHIFT_YEAR ? now.getMonth() : (now.getFullYear() > SHIFT_YEAR ? 11 : 0);
        renderHoursGrid();
        let m = document.getElementById('hours-modal'); m.style.display = 'flex';
        hoursApplyFull();
        setTimeout(()=>m.classList.add('open'),10);
    }
    // Tutto schermo: la finestra occupa tutto lo schermo (si ricorda la scelta su questo telefono)
    let hoursFull = (() => { try { return localStorage.getItem('hours_full_v1') === '1'; } catch(e) { return false; } })();
    function hoursApplyFull() {
        const m = document.getElementById('hours-modal'), b = document.getElementById('hm-full-btn');
        if(m) m.classList.toggle('hm-full', hoursFull);
        if(b) { b.querySelector('.material-icons-round').textContent = hoursFull ? 'close_fullscreen' : 'open_in_full'; b.title = hoursFull ? 'Esci da tutto schermo' : 'Tutto schermo'; b.setAttribute('aria-label', b.title); }
    }
    function hoursToggleFull() {
        vibrate(); hoursFull = !hoursFull; try { localStorage.setItem('hours_full_v1', hoursFull ? '1' : '0'); } catch(e) {}
        hoursApplyFull();
        if(hoursChartInstance) setTimeout(() => { try { hoursChartInstance.resize(); } catch(e) {} }, 50);
    }
    function closeHoursModal(e) {
        if(e && e.target !== e.currentTarget) return;
        let m = document.getElementById('hours-modal'); m.classList.remove('open');
        setTimeout(()=>m.style.display='none',300);
        if(hoursChartInstance) { hoursChartInstance.destroy(); hoursChartInstance = null; }
    }
