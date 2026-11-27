    // ═══ PANNELLO DI CONTROLLO ADMIN ═════════════════════════════════════
    // Raccoglie in un solo posto lo stato dell'app: errori arrivati dai telefoni (salvati nella
    // sessione, campo "errors"), accessi, nomi occupati in "Chi sei?" (con la possibilità di
    // liberarli), statistiche della ruota (campo "wheelLog" della sessione), registro delle
    // modifiche, motore delle notifiche su GitHub, richieste del portale e copie di sicurezza.
    const ADM_MOTORE_REPO = 'centrale118rsm-code/PROVA-MODIFICHE-TURNI';   // dove gira il motore delle notifiche
    const ADM_DAYS = 14;
    const ADM_TABS = {
        home:       ['Pannello di controllo', 'Tutte le cartelle: tocca quello che vuoi controllare'],
        panoramica: ['Panoramica', 'Stato dell’app e cose da guardare'],
        motore:     ['Motore notifiche', 'Il servizio su GitHub che manda le notifiche e aggiorna i calendari'],
        persone:    ['Scheda di ognuno', 'Chi entra, da quali dispositivi, cosa fa e cosa può fare'],
        ruoli:      ['Ruoli e permessi', 'Cosa può fare ogni tipo di account'],
        richieste:  ['Richieste del portale', 'Cambi turno, cessioni, ferie e permessi chiesti dal portale'],
        desiderate: ['Ferie desiderate', 'Chi le ha scritte, quante e se supera le spettanze'],
        copie:      ['Copie di sicurezza', 'Le copie dei turni salvate dall’app'],
        errori:     ['Errori e problemi', 'Quello che è andato storto sui telefoni negli ultimi 14 giorni'],
        accessi:    ['Accessi', 'Chi usa l’app, da quale dispositivo e cosa guarda'],
        identita:   ['Nomi e identità', 'I nomi occupati nella schermata “Chi sei?”'],
        ruota:      ['Ruota della sfiga', 'Statistiche delle estrazioni'],
        registro:   ['Registro modifiche', 'Chi ha cambiato cosa negli ultimi 7 giorni'],
        consumi:    ['Consumi Firebase', 'Letture, scritture e Functions, come nella console di Firebase'],
        aspetto:    ['Aspetto', 'Colori dell’app per tutti'],
        operatori:  ['Nomi operatori', 'Nome mostrato nell’app per ogni colonna'],
        turni:      ['Orari turni', 'Orari standard dei turni'],
        testi:      ['Avvisi', 'Avviso all’apertura e avvisi aggiuntivi'],
        esporta:    ['Esporta', 'Copia del file con le impostazioni attuali'],
        password:   ['Password app', 'Password per aprire l’app, ricordata su ogni telefono'],
        account:    ['Account e accessi', 'Infermieri, autisti e familiari: un solo elenco per le due prove'],
        scherzo:    ['Scherzo', 'Modalità scherzo per operatore'],
        bibbia:     ['Bibbia del portale', 'Regole automatiche del portale Richieste autisti (sola lettura)']
    };
    let admData = null, admLoading = null, admTab = 'home';
    let admErrPeriod = 1, admErrKind = 'tutti', admErrShowResolved = false, admAccFilter = 'tutti', admAccSearch = '', admAccHideTests = true;
    const admEsc = s => esc(s == null ? '' : String(s));
    const admIsTest = s => /Headless/i.test(String((s && s.userAgent) || ''));
    const admMs = v => { if(!v) return 0; if(typeof v === 'number') return v; if(typeof v === 'string') { const t = Date.parse(v); return isNaN(t) ? 0 : t; } return tsToMillis(v) || 0; };
    function admAgo(ms) {
        if(!ms) return '—';
        const d = Date.now() - ms, m = Math.round(d / 60000);
        if(m < 1) return 'adesso'; if(m < 60) return m + ' min fa';
        const h = Math.round(m / 60); if(h < 24) return h + (h === 1 ? ' ora fa' : ' ore fa');
        const g = Math.round(h / 24); return g + (g === 1 ? ' giorno fa' : ' giorni fa');
    }
    const admWhen = ms => ms ? new Date(ms).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    function admHash(s) { let h = 5381; for(let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'e' + (h >>> 0).toString(36); }
    function admSessName(s) { return s.identity && s.identity !== 'Ospite' ? s.identity : (s.identity === 'Ospite' ? 'Ospite' : 'Non identificato'); }

    // ── caricamento dei dati (sola lettura) ──
    async function admLoad() {
        if(!fbReady) return null;
        const since = firebase.firestore.Timestamp.fromMillis(Date.now() - ADM_DAYS * 864e5);
        const safe = p => p.catch(e => { console.warn('Pannello admin:', e && (e.code || e.message)); return null; });
        const dates = []; for(let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); dates.push(ymd(d)); }
        // lo stato del motore su GitHub arriva per conto suo: il pannello non lo aspetta
        admLoadMotore();
        const [sess, ids, set, push, saldi, snap, req, ...logs] = await Promise.all([
            safe(asSessionsGet(since)),   // autisti: sessioni dell'app in uso, sola lettura
            safe(asNoopRef().get()),
            safe(cfgRef('settings').get()), safe(cfgRef('push').get()), safe(cfgRef('saldi').get()), safe(cfgRef('snapindex').get()),
            safe(db.collection('richieste_turni').orderBy('timestamp', 'desc').limit(80).get()),
            ...dates.map(d => safe(cfgRef('log_' + d).get()))
        ]);
        const desSnap = await safe(desYearQuery(DES_COLL, DATA_NS + 'des_' + admDesYear() + '_').get());
        const S = set && set.exists ? (set.data() || {}) : {};
        return {
            at: Date.now(),
            sessions: sess ? sess.docs.map(d => Object.assign({ id: d.id }, d.data())) : [],
            identities: ids ? ids.docs.map(d => Object.assign({ uid: d.id }, d.data())) : [],
            settings: S, releases: S.identityReleases || {}, errResolved: S.adminErrorsResolved || {},
            subs: push && push.exists ? ((push.data() || {}).subs || {}) : {},
            saldi: saldi && saldi.exists ? (saldi.data() || {}) : null,
            snaps: snap && snap.exists ? Object.entries((snap.data() || {}).items || {}).map(([id, v]) => Object.assign({ id }, v)) : [],
            requests: req ? req.docs.map(d => Object.assign({ id: d.id }, d.data())) : [],
            logs: logs.map((x, i) => ({ date: dates[i], entries: x && x.exists ? Object.entries((x.data() || {}).entries || {}).map(([id, e]) => Object.assign({ id }, e)) : [] })),
            des: desSnap ? desSnap.docs.map(d => d.data()).filter(x => x && x.ns === DATA_NS && x.year === admDesYear()) : [],
            sessionsOk: !!sess
        };
    }
    let admMotoreData = { runs: null, motoreProblem: '', pending: false };
    async function admLoadMotore() {
        if(admMotoreData.pending) return;
        admMotoreData.pending = true;
        const get = url => Promise.race([fetch(url).then(r => r.ok ? r.json() : null).catch(() => null), new Promise(res => setTimeout(() => res(null), 7000))]);
        const [runs, mstate] = await Promise.all([
            get(`https://api.github.com/repos/${ADM_MOTORE_REPO}/actions/workflows/motore.yml/runs?per_page=40`),
            get(`https://raw.githubusercontent.com/${ADM_MOTORE_REPO}/main/push/state.json?t=${Date.now()}`)
        ]);
        admMotoreData = { runs: runs && runs.workflow_runs ? runs.workflow_runs : null, motoreProblem: mstate && mstate.problem ? String(mstate.problem) : '', pending: false };
        if(admData) { Object.assign(admData, { runs: admMotoreData.runs, motoreProblem: admMotoreData.motoreProblem }); admRenderTab(); admBadges(); }
    }
    async function admRefresh(quiet) {
        if(admLoading) return admLoading;
        const btns = document.querySelectorAll('.adm-refresh'); btns.forEach(b => b.classList.add('spin'));
        admLoading = admLoad().then(d => { if(d) admData = Object.assign(d, { runs: admMotoreData.runs, motoreProblem: admMotoreData.motoreProblem }); }).catch(e => console.warn(e)).finally(() => {
            admLoading = null; btns.forEach(b => b.classList.remove('spin'));
            admRenderTab(); admBadges();
            const u = document.getElementById('adm-updated'); if(u && admData) u.textContent = 'Dati delle ' + new Date(admData.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            if(!quiet && admData) showAdminToast('Dati aggiornati');
        });
        return admLoading;
    }
    function admOnTab(tab) {
        admTab = tab;
        const t = ADM_TABS[tab] || [tab, ''];
        const h = document.getElementById('adm-title'), s = document.getElementById('adm-sub');
        if(h) h.textContent = t[0]; if(s) s.textContent = t[1];
        const b = document.querySelector('#admin-panel-modal .adm-body'); if(b) b.scrollTop = 0;
        if(tab !== 'persone') admPerson = null;
        admRenderTab(); admTopBar();
    }
    function admRenderTab() {
        if(!document.getElementById('admin-panel-modal') || document.getElementById('admin-panel-modal').style.display === 'none') return;
        const f = { panoramica: admRenderPanoramica, errori: admRenderErrori, identita: admRenderIdentita, ruota: admRenderRuota, password: admRenderGate, account: admRenderAccounts, registro: admRenderRegistro, accessi: renderAdminAccessList, consumi: consRender, home: admRenderHome, motore: admRenderMotoreTab, persone: admRenderPersone, ruoli: admRenderRuoli, richieste: admRenderRichieste, desiderate: admRenderDesiderate, copie: admRenderCopie }[admTab];
        if(f) { try { f(); } catch(e) { console.warn('Pannello admin:', e); } }
    }
    const admLoadingHtml = () => `<div class="adm-empty"><span class="material-icons-round adm-spin">autorenew</span>Carico i dati…</div>`;
    const admReal = () => (admData ? admData.sessions : []).filter(s => !admIsTest(s));

    // ── errori ──
    // L'ora davanti al messaggio si toglie; "Firebase non raggiungibile" e simili sono la rete del telefono,
    // non un errore dell'app: finiscono nel tipo "rete" e non contano tra i problemi.
    const ADM_NET = /Could not reach Cloud Firestore backend|client is offline|operate in offline mode|Failed to fetch|NetworkError|Load failed|net::ERR|ERR_INTERNET_DISCONNECTED|\bunavailable\b/i;
    // avvisi di Firebase senza conseguenze per i dati: solo informazioni
    const ADM_INFO = [
        [/Failed to obtain primary lease/i, 'Firebase: l’app era aperta in più schede sullo stesso dispositivo (normale, nessun effetto sui dati)'],
        [/update time that is in the future/i, 'Firebase: l’orologio del dispositivo non è sincronizzato (nessun effetto sui turni)'],
        [/^Script error\.?$/i, 'Errore in uno script esterno (estensione del browser o libreria), senza dettagli: di solito non riguarda l’app']
    ];
    function admNormMsg(m) { return String(m || '').replace(/^\[\d{4}-\d{2}-\d{2}T[^\]]*\]\s*/, '').replace(/^@firebase\/firestore:\s*Firestore \([\d.]+\):\s*/, 'Firebase: ').trim(); }
    function admErrorGroups(periodDays) {
        const from = Date.now() - periodDays * 864e5, G = {};
        admReal().forEach(s => (s.errors || []).forEach(e => {
            if(!e || !e.msg || (e.t || 0) < from) return;
            const raw = admNormMsg(e.msg), net = ADM_NET.test(raw), info = ADM_INFO.find(x => x[0].test(raw));
            const kind = net ? 'rete' : info ? 'info' : (e.kind || 'errore');
            const msg = net ? 'Connessione a Firebase assente o lenta: per un po’ il dispositivo ha lavorato offline (poi si risincronizza da solo)' : info ? info[1] : raw;
            const sig = admHash(kind + '|' + msg.replace(/\d+/g, '#').slice(0, 160));   // stessi messaggi con numeri diversi = un solo gruppo
            const g = G[sig] || (G[sig] = { sig, kind, msg, orig: raw, n: 0, people: new Set(), devices: new Set(), views: new Set(), vers: new Set(), first: e.t, last: e.t, src: e.src, stack: e.stack });
            g.n++; g.people.add(admSessName(s)); if(s.device) g.devices.add(s.device); if(e.view) g.views.add(e.view); if(e.ver) g.vers.add(e.ver);
            g.first = Math.min(g.first, e.t); if(e.t >= g.last) { g.last = e.t; g.src = e.src || g.src; g.stack = e.stack || g.stack; }
        }));
        return Object.values(G).map(g => Object.assign(g, { resolved: (admData.errResolved[g.sig] || 0) >= g.last })).sort((a, b) => b.last - a.last);
    }
    const ADM_KIND = { errore: ['Errore', 'err', 'error'], promessa: ['Errore (operazione)', 'err', 'error'], console: ['Avviso', 'warn', 'warning'], rete: ['Rete', 'info', 'wifi_off'], info: ['Info', 'info', 'info'] };
    const admProblems = days => admErrorGroups(days).filter(g => !g.resolved && g.kind !== 'rete' && g.kind !== 'info');   // errori e avvisi veri (senza rete e informazioni)
    function admRenderErrori() {
        const box = document.getElementById('adm-errori'); if(!box) return;
        if(!admData) { box.innerHTML = admLoadingHtml(); return; }
        const all = admErrorGroups(admErrPeriod);
        const list = all.filter(g => (admErrShowResolved || !g.resolved) && (admErrKind === 'tutti' || (admErrKind === 'errori' ? !['console', 'rete', 'info'].includes(g.kind) : admErrKind === 'rete' ? (g.kind === 'rete' || g.kind === 'info') : g.kind === 'console')));
        const seg = (val, cur, fn, items) => `<div class="adm-seg">${items.map(([v, l]) => `<button class="${v === cur ? 'on' : ''}" onclick="${fn}(${typeof v === 'number' ? v : `'${v}'`})">${l}</button>`).join('')}</div>`;
        const nRes = all.filter(g => g.resolved).length;
        let html = `<div class="adm-toolbar">${seg(0, admErrPeriod, 'admErrSetPeriod', [[1, '24 ore'], [7, '7 giorni'], [14, '14 giorni']])}${seg(0, admErrKind, 'admErrSetKind', [['tutti', 'Tutti'], ['errori', 'Errori'], ['avvisi', 'Avvisi'], ['rete', 'Rete e info']])}
            <label class="adm-check"><input type="checkbox" ${admErrShowResolved ? 'checked' : ''} onchange="admErrShowResolved=this.checked;admRenderErrori()"> Mostra i risolti${nRes ? ` (${nRes})` : ''}</label></div>
            <div class="adm-note"><span class="material-icons-round">info</span><div>Gli errori arrivano dai telefoni di chi usa l’app, senza che se ne accorga. <b>Errore</b> = qualcosa si è rotto; <b>Avviso</b> = un problema gestito (per esempio un salvataggio non riuscito); <b>Rete</b> = il dispositivo è rimasto senza collegamento a Firebase per un po’ (succede con poco segnale: non è un errore dell’app e non conta tra i problemi). “Segna risolto” lo nasconde finché non si ripresenta.</div></div>`;
        if(!list.length) html += `<div class="adm-empty ok"><span class="material-icons-round">verified</span>${all.length ? 'Nessun problema da mostrare con questi filtri.' : 'Nessun errore registrato in questo periodo.'}</div>`;
        else html += list.map(g => {
            const K = ADM_KIND[g.kind] || ADM_KIND.errore;
            return `<details class="adm-err sev-${K[1]} ${g.resolved ? 'resolved' : ''}">
                <summary><span class="material-icons-round adm-err-ico">${K[2]}</span>
                    <div class="adm-err-main"><div class="adm-err-top"><span class="adm-tag ${K[1]}">${K[0]}</span><b>${admEsc(g.msg.length > 140 ? g.msg.slice(0, 140) + '…' : g.msg)}</b></div>
                    <small>${g.n} ${g.n === 1 ? 'volta' : 'volte'} · ${g.people.size} ${g.people.size === 1 ? 'persona' : 'persone'} · ultima ${admAgo(g.last)}${g.resolved ? ' · <span class="adm-ok-txt">risolto</span>' : ''}</small></div>
                    <span class="adm-err-n">${g.n}</span></summary>
                <div class="adm-err-body">
                    <div class="adm-kv"><span>Chi</span><b>${admEsc([...g.people].join(', '))}</b></div>
                    <div class="adm-kv"><span>Dispositivi</span><b>${admEsc([...g.devices].join(', ') || '—')}</b></div>
                    <div class="adm-kv"><span>Dove nell’app</span><b>${admEsc([...g.views].join(', ') || '—')}</b></div>
                    <div class="adm-kv"><span>Prima / ultima volta</span><b>${admWhen(g.first)} · ${admWhen(g.last)}</b></div>
                    ${g.orig && g.orig !== g.msg ? `<div class="adm-kv"><span>Messaggio originale</span><b>${admEsc(g.orig.slice(0, 300))}</b></div>` : ''}
                    ${g.src ? `<div class="adm-kv"><span>Punto del codice</span><b>${admEsc(g.src)}</b></div>` : ''}
                    ${g.stack ? `<pre class="adm-pre">${admEsc(g.stack)}</pre>` : ''}
                    <div class="adm-row-act">${g.resolved ? `<button class="adm-btn" onclick="admErrResolve('${g.sig}', false)"><span class="material-icons-round">undo</span>Riapri</button>` : `<button class="adm-btn primary" onclick="admErrResolve('${g.sig}', true)"><span class="material-icons-round">done</span>Segna risolto</button>`}</div>
                </div></details>`;
        }).join('');
        box.innerHTML = html;
    }
    function admErrSetPeriod(p) { vibrate(); admErrPeriod = p; admRenderErrori(); }
    function admErrSetKind(k) { vibrate(); admErrKind = k; admRenderErrori(); }
    async function admErrResolve(sig, on) {
        vibrate();
        try {
            await cfgRef('settings').update(new firebase.firestore.FieldPath('adminErrorsResolved', sig), on ? Date.now() : firebase.firestore.FieldValue.delete());
            if(on) admData.errResolved[sig] = Date.now(); else delete admData.errResolved[sig];
            admRenderErrori(); admBadges(); showAdminToast(on ? 'Segnato come risolto' : 'Riaperto');
        } catch(e) { showAdminToast('Non salvato: ' + (e.code || e.message)); }
    }

    // ── nomi e identità ──
    function admIdentityRows() {
        const cut = Date.now() - IDENTITY_CLAIM_MAX_AGE_MS;
        const names = (drivers || []).filter(d => !d.test).map(d => d.name).concat(IDENTITY_EXTRA_OPTIONS.filter(n => n !== 'Ospite'));
        const sessBy = {}; admReal().forEach(s => { if(s.identity) (sessBy[s.identity] = sessBy[s.identity] || []).push(s); });
        return names.map(nm => {
            const rel = admMs(admData.releases[nm]);
            const claims = admData.identities.filter(c => c.name === nm).map(c => ({ uid: c.uid, ms: admMs(c.updatedAt) })).filter(c => c.ms > cut);
            const active = claims.filter(c => !(rel && c.ms <= rel));
            const ss = (sessBy[nm] || []).sort((a, b) => admMs(b.lastActive) - admMs(a.lastActive));
            return { nm, rel, claims, active, last: Math.max(0, ...claims.map(c => c.ms), ...ss.map(s => admMs(s.lastActive))), devices: [...new Set(ss.map(s => s.device).filter(Boolean))], sessions: ss.length };
        });
    }
    function admRenderIdentita() {
        const box = document.getElementById('adm-identita'); if(!box) return;
        if(!admData) { box.innerHTML = admLoadingHtml(); return; }
        const rows = admIdentityRows(), busy = rows.filter(r => r.active.length), multi = rows.filter(r => r.active.length > 1);
        box.innerHTML = `<div class="adm-kpis three">
                ${admKpi('how_to_reg', busy.length, 'Nomi occupati', `su ${rows.length}`, 'info')}
                ${admKpi('devices', multi.length, 'Su più dispositivi', 'possibile nome preso per errore', multi.length ? 'warn' : 'ok')}
                ${admKpi('lock_open', rows.filter(r => r.rel).length, 'Liberati a mano', 'dal pannello', 'info')}</div>
            <div class="adm-note"><span class="material-icons-round">info</span><div>Quando qualcuno sceglie un nome in “Chi sei?”, quel nome resta occupato per 5 giorni sugli altri telefoni. Se un collega trova il suo nome già preso, premi <b>Libera</b>: da quel momento il nome torna disponibile per chiunque apra la schermata. Chi lo stava usando non viene disconnesso e non vede nulla.</div></div>
            <div class="adm-table adm-id-table">
                <div class="adm-tr adm-th"><span>Nome</span><span>Stato</span><span>Ultimo uso</span><span>Dispositivi (14 giorni)</span><span></span></div>
                ${rows.map(r => {
                    const st = r.active.length > 1 ? `<span class="adm-pill warn">Occupato su ${r.active.length} dispositivi</span>` : r.active.length ? `<span class="adm-pill info">Occupato</span>` : r.rel ? `<span class="adm-pill ok">Liberato ${admAgo(r.rel)}</span>` : `<span class="adm-pill muted">Libero</span>`;
                    return `<div class="adm-tr"><span class="adm-id-name"><i>${admEsc(r.nm.slice(0, 2).toUpperCase())}</i><b>${admEsc(r.nm)}</b></span><span>${st}</span><span>${r.last ? admAgo(r.last) : '—'}</span>
                        <span class="adm-muted">${admEsc(r.devices.slice(0, 3).join(', ') || '—')}${r.devices.length > 3 ? ' +' + (r.devices.length - 3) : ''}</span>
                        <span>${r.active.length ? `<button class="adm-btn primary sm" onclick="admReleaseName(${JSON.stringify(r.nm).replace(/"/g, '&quot;')})"><span class="material-icons-round">lock_open</span>Libera</button>` : ''}</span></div>`;
                }).join('')}
            </div>`;
    }
    async function admReleaseName(nm) {
        vibrate();
        if(!confirm(`Liberare il nome ${nm}?\n\nTornerà disponibile nella schermata “Chi sei?” per tutti i telefoni da adesso.`)) return;
        try {
            const now = Date.now();
            await cfgRef('settings').update(new firebase.firestore.FieldPath('identityReleases', nm), now);
            admData.releases[nm] = now; admRenderIdentita(); admBadges(); showAdminToast(nm + ' è di nuovo libero');
        } catch(e) { showAdminToast('Non riuscito: ' + (e.code || e.message)); }
    }

    // ── ruota ──
    function admRenderRuota() {
        const box = document.getElementById('adm-ruota'); if(!box) return;
        if(!admData) { box.innerHTML = admLoadingHtml(); return; }
        const real = admReal(), spins = [];
        let opens = 0;
        real.forEach(s => { (s.viewHistory || []).forEach(v => { if(v && v.view === 'Ruota della Sfiga') opens++; }); (s.wheelLog || []).forEach(w => w && w.winner && spins.push(Object.assign({ who: admSessName(s) }, w))); });
        spins.sort((a, b) => b.t - a.t);
        const slots = spins.filter(x => x.mode === 'slots'), fun = spins.filter(x => x.mode !== 'slots');
        const count = arr => { const c = {}; arr.forEach(x => c[x] = (c[x] || 0) + 1); return Object.entries(c).sort((a, b) => b[1] - a[1]); };
        const bars = (rows, tone) => { const mx = Math.max(1, ...rows.map(r => r[1])); return rows.length ? rows.slice(0, 12).map(([n, v], i) => `<div class="adm-bar"><span class="adm-bar-l">${i < 3 ? ['🥇', '🥈', '🥉'][i] + ' ' : ''}${admEsc(n)}</span><span class="adm-bar-t"><i class="${tone}" style="width:${Math.max(4, v / mx * 100)}%"></i></span><b>${v}</b></div>`).join('') : '<div class="adm-empty sm">Ancora nessuna estrazione.</div>'; };
        const hours = {}; slots.forEach(x => { if(x.slot) hours[x.slot] = (hours[x.slot] || 0) + 1; });
        box.innerHTML = `<div class="adm-kpis">
                ${admKpi('casino', opens, 'Aperture della ruota', 'ultimi 14 giorni', 'info')}
                ${admKpi('touch_app', spins.length, 'Estrazioni', 'registrate', 'info')}
                ${admKpi('schedule', slots.length, 'Fasce assegnate', 'modalità fasce orarie', 'info')}
                ${admKpi('theater_comedy', fun.length, 'Estrazioni per ridere', 'modalità random', 'info')}</div>
            ${spins.length ? '' : `<div class="adm-note"><span class="material-icons-round">info</span><div>Le estrazioni si registrano da adesso: appena qualcuno gira la ruota, qui compaiono la classifica e lo storico. Le aperture della ruota invece si contano già dagli accessi degli ultimi 14 giorni.</div></div>`}
            <div class="adm-grid2">
                <div class="adm-card"><h4><span class="material-icons-round">emoji_events</span>Classifica della sfiga</h4><small class="adm-muted">Chi è uscito più volte (tutte le modalità)</small>${bars(count(spins.map(x => x.winner)), 'red')}</div>
                <div class="adm-card"><h4><span class="material-icons-round">record_voice_over</span>Chi gira la ruota</h4><small class="adm-muted">Estrazioni avviate da ogni persona</small>${bars(count(spins.map(x => x.by || x.who)), 'blue')}</div>
            </div>
            ${Object.keys(hours).length ? `<div class="adm-card"><h4><span class="material-icons-round">bedtime</span>Fasce orarie estratte</h4>${bars(Object.entries(hours).sort((a, b) => a[0].localeCompare(b[0])), 'violet')}</div>` : ''}
            <div class="adm-card"><h4><span class="material-icons-round">history</span>Ultime estrazioni</h4>
                ${spins.length ? `<div class="adm-table"><div class="adm-tr adm-th"><span>Quando</span><span>Uscito</span><span>Modalità</span><span>Avviata da</span></div>${spins.slice(0, 25).map(x => `<div class="adm-tr"><span>${admWhen(x.t)}</span><b>${admEsc(x.winner)}</b><span>${x.mode === 'slots' ? 'Fascia ' + admEsc(x.slot || '') : 'Per ridere'} <span class="adm-muted">· ${x.n || '?'} nomi</span></span><span class="adm-muted">${admEsc(x.by || x.who)}</span></div>`).join('')}</div>` : '<div class="adm-empty sm">Nessuna estrazione registrata.</div>'}
            </div>`;
    }

    // ── password per aprire l'app ──
    function admRenderGate() {
        const box = document.getElementById('adm-password'); if(!box) return;
        const g = appGate, on = !!(g && g.on && g.hash), has = !!(g && g.hash);
        const when = g && g.at ? new Date(g.at).toLocaleString('it-IT', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
        box.innerHTML = (GATE_ENABLED ? '' : `<div class="adm-card" style="border-left:4px solid #f59e0b"><b>Schermata password tolta per ora</b><div class="adm-muted" style="font-size:.78rem">Anche se qui risulta attiva, l’app si apre senza chiederla.</div></div>`) + `<div class="adm-card">
                <div class="adm-gate-st"><span class="material-icons-round" style="color:${on ? '#16a34a' : '#94a3b8'}">${on ? 'lock' : 'lock_open'}</span>
                    <div><b>${on ? 'Attiva' : has ? 'Spenta' : 'Nessuna password'}</b> ${on ? '<span class="adm-pill ok">l’app chiede la password</span>' : '<span class="adm-pill muted">l’app si apre senza password</span>'}
                    ${has ? `<div class="adm-muted" style="font-size:.74rem">Impostata${when ? ' il ' + admEsc(when) : ''}${g.by ? ' da ' + admEsc(g.by) : ''}</div>` : ''}</div></div>
                ${has ? (appGatePw ? `<div class="adm-gate-cur"><span class="adm-muted">Password attuale</span><b id="adm-gate-cur-pw" class="hid">${'•'.repeat(Math.max(4, appGatePw.length))}</b>
                        <button class="adm-btn sm" onclick="admGateShowPw(this)"><span class="material-icons-round">visibility</span>Mostra</button></div>`
                    : `<div class="adm-gate-cur none"><span class="material-icons-round">help_outline</span><span>Questa password è stata scelta prima che l’app la ricordasse, quindi non si può mostrare. Scrivila qui sotto e premi <b>Cambia e attiva</b>: da quel momento la vedi qui.</span></div>`) : ''}
                <div class="adm-gate-row"><input id="adm-gate-pw" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${has ? 'Nuova password' : 'Scegli la password'}">
                    <button class="adm-btn primary" onclick="admGateSave()"><span class="material-icons-round">lock</span>${has ? 'Cambia e attiva' : 'Salva e attiva'}</button></div>
                ${has ? `<div class="adm-gate-row"><button class="adm-btn" onclick="admGateToggle(${on ? 'false' : 'true'})"><span class="material-icons-round">${on ? 'lock_open' : 'lock'}</span>${on ? 'Disattiva' : 'Riattiva la stessa password'}</button>${on ? `<button class="adm-btn" onclick="admGateForget()"><span class="material-icons-round">phonelink_lock</span>Richiedila su questo telefono</button>` : ''}</div>` : ''}
                <ul class="adm-gate-list">
                    <li>Ogni telefono la chiede <b>una volta sola</b>, alla prima apertura, poi la ricorda. Vale per tutti, coordinatore e admin compresi: anche questo telefono la chiederà alla prossima apertura.</li>
                    <li>Se la <b>cambi</b>, tutti dovranno mettere quella nuova (anche chi l’aveva già).</li>
                    <li>Maiuscole e minuscole non contano. La password resta scritta qui, così non la perdi.</li>
                    <li>Il motore delle notifiche e il calendario sul telefono (iPhone/Google) continuano a funzionare.</li>
                </ul></div>
            <div class="adm-note" style="margin-top:12px"><span class="material-icons-round">info</span><div><b>Cosa protegge davvero.</b> Chi apre il link dell’app senza password non vede i turni. Però è un blocco della pagina: i dati su Firebase, il file Excel e i calendari .ics nel repository restano leggibili da chi sa dove guardare. Per una protezione vera servono anche regole Firebase legate alla password: vedi la proposta nel progetto.</div></div>`;
    }
    async function admGateSave() {
        const inp = document.getElementById('adm-gate-pw'), pw = (inp && inp.value || '').trim();
        if(pw.length < 4) { showAdminToast('Almeno 4 caratteri'); return; }
        const hash = await gateHash(pw);
        const g = { on: true, hash, pw, ver: ((appGate && appGate.ver) || 0) + 1, by: 'Admin · ' + getDeviceLabel(), at: new Date().toISOString() };
        gateSessionHash = hash;   // ora resta aperta; alla prossima apertura la chiede anche a chi l'ha impostata (Mat: tutti, coordinatore compreso)
        try { await saveSettingsFields({ appGate: g }); gateApply(g); admRenderGate(); showAdminToast('Password attivata'); vibrate(); }
        catch(e) { showAdminToast('Errore: ' + (e.code || e.message)); }
    }
    function admGateShowPw(btn) {
        const b = document.getElementById('adm-gate-cur-pw'); if(!b) return;
        const hid = b.classList.toggle('hid');
        b.textContent = hid ? '•'.repeat(Math.max(4, appGatePw.length)) : appGatePw;
        btn.innerHTML = `<span class="material-icons-round">${hid ? 'visibility' : 'visibility_off'}</span>${hid ? 'Mostra' : 'Nascondi'}`;
    }
    // per provarla: questo telefono "dimentica" di averla già messa e mostra subito la schermata della password
    function admGateForget() {
        try { localStorage.removeItem(GATE_OK_KEY); } catch(e) {}
        gateSessionHash = '';
        vibrate(); gateApply(appGate);
    }
    async function admGateToggle(on) {
        if(!appGate || !appGate.hash) return;
        const g = Object.assign({}, appGate, appGatePw ? { pw: appGatePw } : {}, { on: !!on, at: new Date().toISOString(), by: 'Admin · ' + getDeviceLabel() });
        if(on) gateSessionHash = g.hash;
        try { await saveSettingsFields({ appGate: g }); gateApply(g); admRenderGate(); showAdminToast(on ? 'Password riattivata' : 'Password disattivata'); vibrate(); }
        catch(e) { showAdminToast('Errore: ' + (e.code || e.message)); }
    }

    // ── registro modifiche ──
    function admRenderRegistro() {
        const box = document.getElementById('adm-registro'); if(!box) return;
        if(!admData) { box.innerHTML = admLoadingHtml(); return; }
        const kindName = (k, n) => ({ rep: ['reperibilità', 'reperibilità'], repc: ['cessione', 'cessioni'], cell: ['casella', 'caselle'] })[k || 'cell']?.[n === 1 ? 0 : 1] || k;
        const val = v => v == null ? '—' : typeof v === 'object' ? ((v.v || '') + (v.subV ? ' ' + v.subV : '') || '—') : String(v || '—');
        let html = '';
        admData.logs.forEach(day => {
            if(!day.entries.length) return;
            const es = day.entries.sort((a, b) => String(b.t).localeCompare(String(a.t)));
            html += `<div class="adm-day">${new Date(day.date + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })} <span>${es.length} salvataggi</span></div>`;
            html += es.map(e => {
                const it = e.items || [], k = {}; it.forEach(x => k[x.k || 'cell'] = (k[x.k || 'cell'] || 0) + 1);
                const what = Object.entries(k).map(([a, b]) => `${b} ${kindName(a, b)}`).join(', ') || 'nessuna casella';
                return `<details class="adm-log"><summary><span class="adm-log-t">${new Date(e.t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                    <div><b>${admEsc(String(e.who || '—').split(' · ')[0])}</b> <span class="adm-muted">${admEsc(String(e.who || '').split(' · ')[1] || '')}</span><small>${admEsc(e.note || what)}${e.note && it.length ? ' · ' + what : ''}</small></div><span class="adm-log-n">${it.length}</span></summary>
                    ${it.length ? `<div class="adm-log-body">${it.slice(0, 60).map(x => `<div><span>${admEsc(String(x.key || '').replace('__', ' · ').replace('@', ' '))}</span><code>${admEsc(val(x.prev))}</code><span class="material-icons-round">arrow_forward</span><code>${admEsc(val(x.next))}</code></div>`).join('')}${it.length > 60 ? `<small class="adm-muted">e altre ${it.length - 60}</small>` : ''}</div>` : ''}</details>`;
            }).join('');
        });
        box.innerHTML = html || '<div class="adm-empty"><span class="material-icons-round">history</span>Nessuna modifica negli ultimi 7 giorni.</div>';
    }

    // ═══ PANNELLO ADMIN A CARTELLE ═══════════════════════════════════════
    // Le pagine sono divise in cartelle (menu a sinistra sul computer, pagina "Tutte le cartelle"
    // sul telefono). Pagine in più: scheda di ogni persona (tutto quello che fa), ruoli e permessi,
    // motore delle notifiche, richieste del portale, ferie desiderate, copie di sicurezza.
    const ADM_FOLDERS = [
        { id:'stato',   name:'Stato e salute',    desc:'Funziona tutto? Errori, motore, consumi', icon:'monitor_heart', color:'#16a34a', tabs:['panoramica', 'errori', 'motore', 'consumi'] },
        { id:'persone', name:'Persone e accessi', desc:'Chi entra, da dove e cosa fa',            icon:'groups',        color:'#2563eb', tabs:['account', 'persone', 'accessi', 'identita', 'ruoli'] },
        { id:'turni',   name:'Turni e richieste', desc:'Modifiche, richieste, ferie desiderate',  icon:'edit_calendar', color:'#d97706', tabs:['registro', 'richieste', 'desiderate'] },
        { id:'dati',    name:'Dati e sicurezza',  desc:'Copie di sicurezza ed esportazione',      icon:'shield',        color:'#0f766e', tabs:['copie', 'esporta', 'password'] },
        { id:'config',  name:'Configurazione',    desc:'Colori, nomi, orari e avvisi per tutti',  icon:'tune',          color:'#7c3aed', tabs:['aspetto', 'operatori', 'turni', 'testi'] },
        { id:'svago',   name:'Portale e svago',   desc:'Regole del portale, ruota e scherzi',     icon:'celebration',   color:'#db2777', tabs:['bibbia', 'ruota', 'scherzo'] }
    ];
    const ADM_TAB_ICON = { account:'manage_accounts', panoramica:'dashboard', errori:'bug_report', motore:'smart_toy', consumi:'data_usage', persone:'contacts', accessi:'insights', identita:'how_to_reg', ruoli:'verified_user',
        registro:'history', richieste:'inbox', desiderate:'beach_access', copie:'backup', esporta:'file_download', password:'lock', aspetto:'palette', operatori:'badge', turni:'schedule', testi:'campaign', bibbia:'menu_book', ruota:'casino', scherzo:'celebration' };
    function admFoldToggle(id) { vibrate(); const f = document.querySelector(`#admin-panel-modal .adm-fold[data-fold="${id}"]`); if(f) f.classList.toggle('open'); }
    function admBackHome() {
        vibrate();
        if(admTab === 'persone' && admPerson) { admPerson = null; admRenderPersone(); const b = document.querySelector('#admin-panel-modal .adm-body'); if(b) b.scrollTop = 0; admTopBar(); return; }
        switchAdminTab('home', document.querySelector('.admin-tab-btn[data-tab="home"]'));
    }
    function admTopBar() {
        const b = document.getElementById('adm-back'); if(b) b.classList.toggle('hide', admTab === 'home');
        if(admTab === 'persone' && admPerson) { const h = document.getElementById('adm-title'), s = document.getElementById('adm-sub'); if(h) h.textContent = admPerson; if(s) s.textContent = 'Scheda della persona'; }
    }
    const admKey = n => String(n || '').toUpperCase().replace(/[^A-Z0-9À-Ü]+/g, ' ').trim();
    const admInit = n => String(n || '?').split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();

    // ── pagina iniziale: tutte le cartelle ──
    function admTabStatus(t) {
        if(!admData) return ['', ''];
        const n = (v, one, many) => v + ' ' + (v === 1 ? one : many);
        try {
            if(t === 'panoramica') { const i = admIssues(); return i.length ? [n(i.length, 'cosa da guardare', 'cose da guardare'), i[0].sev === 'err' ? 'err' : 'warn'] : ['tutto ok', 'ok']; }
            if(t === 'errori') { const e = admProblems(1); return e.length ? [n(e.length, 'tipo di errore', 'tipi di errore') + ' (24 h)', e.some(g => g.kind !== 'console') ? 'err' : 'warn'] : ['nessuno in 24 ore', 'ok']; }
            if(t === 'motore') { const M = admMotore(); if(!M) return [admMotoreData.pending ? 'controllo…' : 'GitHub non risponde', '']; return ['ultimo giro ' + admAgo(M.last), M.failed24 || !M.ok ? 'err' : Date.now() - M.last > 36e5 ? 'warn' : 'ok']; }
            if(t === 'persone') { const p = admPeople().filter(x => x.sess.length); return [n(p.length, 'persona attiva', 'persone attive') + ' (14 gg)', '']; }
            if(t === 'accessi') { const t0 = new Date(); t0.setHours(0, 0, 0, 0); const s = admReal().filter(x => admMs(x.startTime) >= t0.getTime()); const on = admReal().filter(x => x.online).length; return [n(s.length, 'accesso', 'accessi') + ' oggi' + (on ? ' · ' + on + ' online' : ''), on ? 'ok' : '']; }
            if(t === 'identita') { const m = admIdentityRows().filter(r => r.active.length > 1); return m.length ? [n(m.length, 'nome doppio', 'nomi doppi'), 'warn'] : ['', '']; }
            if(t === 'registro') { const k = admData.logs.reduce((a, d) => a + d.entries.length, 0); return [n(k, 'salvataggio', 'salvataggi') + ' in 7 gg', '']; }
            if(t === 'richieste') { const p = admReqPending(); return p.length ? [n(p.length, 'da gestire', 'da gestire'), 'warn'] : ['niente da gestire', 'ok']; }
            if(t === 'desiderate') { const d = (admData.des || []).filter(x => Object.keys(x.days || {}).length); return [n(d.length, 'persona', 'persone') + ' · ' + admDesYear(), '']; }
            if(t === 'copie') { const l = Math.max(0, ...admData.snaps.map(s => admMs(s.createdAt))); return ['ultima ' + admAgo(l), l && Date.now() - l < 3 * 864e5 ? 'ok' : 'warn']; }
        } catch(e) {}
        return ['', ''];
    }
    function admRenderHome() {
        const box = document.getElementById('adm-home'); if(!box) return;
        let hero = '';
        if(admData) {
            const is = admIssues(), w = is.length ? is[0].sev : 'ok';
            hero = `<div class="adm-home-hero sev-${w}" onclick="admGo('panoramica')"><span class="material-icons-round">${w === 'ok' || w === 'info' ? 'verified' : 'error_outline'}</span><div><b>${w === 'ok' ? 'Tutto funziona' : w === 'info' ? 'Tutto funziona, qualche informazione' : is.length + (is.length === 1 ? ' cosa richiede' : ' cose richiedono') + ' attenzione'}</b><small>${is.length ? admEsc(is.slice(0, 2).map(i => i.title).join(' · ')) : 'Nessun problema da segnalare.'}</small></div><span class="material-icons-round">chevron_right</span></div>`;
        } else hero = admLoadingHtml();
        box.innerHTML = hero + `<div class="adm-folders">${ADM_FOLDERS.map(f => `<div class="adm-folder"><div class="adm-folder-h"><span class="material-icons-round" style="background:${f.color}">${f.icon}</span><div><b>${f.name}</b><small>${f.desc}</small></div></div>
            ${f.tabs.map(t => { const st = admTabStatus(t); return `<button class="adm-folder-i" onclick="admGo('${t}')"><span class="material-icons-round">${ADM_TAB_ICON[t] || 'chevron_right'}</span><span class="l">${(ADM_TABS[t] || [t])[0]}</span>${st[0] ? `<em class="${st[1]}">${admEsc(st[0])}</em>` : ''}<span class="material-icons-round">chevron_right</span></button>`; }).join('')}</div>`).join('')}</div>`;
    }
    function admFoldBadges() {
        const rank = { err: 3, warn: 2, ok: 1 };
        ADM_FOLDERS.forEach(f => {
            const b = document.getElementById('adm-fbadge-' + f.id); if(!b) return;
            let n = 0, tone = '';
            f.tabs.forEach(t => { const x = document.getElementById('adm-badge-' + t); if(!x || !x.textContent) return; n += parseInt(x.textContent, 10) || 0; const tn = ['err', 'warn', 'ok'].find(c => x.classList.contains(c)) || ''; if((rank[tn] || 0) > (rank[tone] || 0)) tone = tn; });
            b.textContent = n ? n : ''; b.className = 'adm-badge ' + tone;
        });
    }

    // ── persone: chi è, cosa può fare, cosa ha fatto ──
    let admPerson = null, admPeopleSearch = '';
    function admRoleOf(key) {
        if(key === 'OSPITE') return 'ospite';
        if(key === 'NON IDENTIFICATO') return 'anon';
        if(key === 'CENTRALE') return 'centrale';
        if(key === COORD_ID) return 'coord';
        if(key === admKey(coordinatorName || COORD_DEFAULT)) return 'coord';
        return 'autista';
    }
    const ADM_ROLES = {
        anon: { name:'Non identificato', icon:'help_outline', color:'#94a3b8', how:'Ha aperto l’app senza scegliere un nome in “Chi sei?”.',
            can:['Vede il calendario dei turni di tutti', 'Vede chi è reperibile e chi è in turno'],
            cant:['Non ha “La mia pagina” né le notifiche personali', 'Non scrive ferie desiderate né note a suo nome', 'Quello che fa non si può attribuire a nessuno'] },
        ospite: { name:'Ospite', icon:'person_outline', color:'#64748b', how:'Sceglie “Ospite” in “Chi sei?”.',
            can:['Vede il calendario dei turni di tutti', 'Vede reperibili, chi lavora con chi, conteggi generali', 'Può entrare nell’Area coordinatore solo con la password (le modifiche risultano di “Ospite”)'],
            cant:['Non ha “La mia pagina” né le notifiche sul telefono', 'Non scrive ferie desiderate', 'Non scrive note a suo nome'] },
        autista: { name:'Autista', icon:'local_shipping', color:'#2563eb', how:'Sceglie il suo nome in “Chi sei?”. Il nome resta legato a quel dispositivo: un altro telefono non lo può prendere finché l’admin non lo libera.',
            can:['Tutto quello che vede l’Ospite', '“La mia pagina”: prossimi turni, ore, assenze, reperibilità, stampa e PDF dei suoi turni', 'Notifiche sul telefono dei suoi cambi turno e reperibilità', 'Ferie desiderate: scrive solo nella sua colonna, entro le sue spettanze', 'Note ai colleghi, al coordinatore o a tutti', 'Richieste dal portale Richieste (cambi, cessioni, ferie, permessi)'],
            cant:['Non modifica i turni (serve la password dell’Area coordinatore)', 'Non scrive nelle colonne degli altri', 'Non apre questo pannello'] },
        centrale: { name:'Centrale operativa', icon:'support_agent', color:'#0f766e', how:'Sceglie “CENTRALE” in “Chi sei?”.',
            can:['Tutto quello che vede l’Ospite', 'Riceve le nuove richieste del portale', 'Vede tutte le note e può cancellarle', 'Le sue note escono come “Centrale Operativa 118”'],
            cant:['Non ha una colonna nel calendario', 'Non modifica i turni senza la password dell’Area coordinatore'] },
        coord: { name:'Coordinatore', icon:'workspace_premium', color:'#d97706', how:'È il coordinatore designato. Per modificare entra nell’Area coordinatore con la sua password: l’accesso dura finché l’app resta aperta.',
            can:['Modifica turni e reperibilità, bozza del mese, importa da Excel', 'Gestisce le richieste del portale e le inserisce nei turni', 'Spettanze di ferie e permessi per operatore', 'Messaggi all’apertura, note, storico dei cambi con Annulla', 'Copie di sicurezza e ripristino, chiusura e apertura dell’anno', 'Riceve le notifiche delle nuove richieste (se le ha attive)'],
            cant:['Non apre questo pannello senza la password admin'] }
    };
    const admExtraRoles = () => [
        { name:'Riceve le richieste', icon:'mark_email_unread', color:'#7c3aed', how:'Nomi fissi nell’app: ' + (typeof AS_OPERATORI !== 'undefined' ? AS_OPERATORI.join(', ') : '—') + '.',
            can:['Riceve un avviso per ogni nuova richiesta del portale'], cant:['Non può approvarle senza l’Area coordinatore'] },
        { name:'Admin riunione (ferie desiderate)', icon:'admin_panel_settings', color:'#ea580c', how:'Tasto Admin arancione nel calendario delle ferie desiderate, con la sua password. Vale solo su quel dispositivo finché resta aperto.',
            can:['Scrive le ferie desiderate nelle colonne di tutti', 'Barra i giorni già messi nei turni', 'Importa le desiderate nel calendario turni (con copia di sicurezza)', 'Vede lo storico degli inserimenti'], cant:['Non modifica i turni fuori dall’importazione'] },
        { name:'Admin (questo pannello)', icon:'shield_person', color:'#111827', how:'Entra con la password admin.',
            can:['Vede tutto: stato, errori, accessi, scheda di ognuno, consumi', 'Libera i nomi occupati in “Chi sei?”', 'Cambia colori, nomi mostrati, orari dei turni e avvisi per tutti', 'Modalità scherzo e regole del portale'], cant:['Non modifica i turni da qui (si fa dall’Area coordinatore)'] }
    ];
    function admPeople() {
        const P = {};
        const get = nm => { const k = admKey(nm); if(!k) return null; if(!P[k]) P[k] = { key: k, name: String(nm), role: admRoleOf(k), sess: [], mods: [], reqs: [], subs: [], des: null, col: false }; return P[k]; };
        (drivers || []).forEach(d => { if(d.virtual) return; const p = get(d.originalName || d.name); p.name = d.name; p.col = true; });
        IDENTITY_EXTRA_OPTIONS.forEach(n => get(n));
        if(!admData) return Object.values(P);
        admReal().forEach(s => get(s.identity || 'Non identificato').sess.push(s));
        admData.logs.forEach(day => day.entries.forEach(e => { const w = String(e.who || '').split(' · ')[0].trim(); const p = w && get(w); if(p) p.mods.push(e); }));
        admData.requests.forEach(r => { const p = r.name && get(r.name); if(p) p.reqs.push(r); });
        Object.values(admData.subs || {}).forEach(s => { const p = s.owner && get(s.owner); if(p) p.subs.push(s); });
        (admData.des || []).forEach(x => { const p = x.name && get(x.name); if(p) p.des = x; });
        return Object.values(P);
    }
    const admLastSeen = p => Math.max(0, ...p.sess.map(s => admMs(s.lastActive) || admMs(s.startTime)));
    const admDevices = p => [...new Set(p.sess.map(s => s.device || 'Dispositivo').filter(Boolean))];
    function admPersonChips(p) {
        const c = [];
        const on = p.sess.some(s => s.online);
        if(on) c.push(`<span class="adm-chip ok"><span class="material-icons-round">wifi_tethering</span>online</span>`);
        c.push(`<span class="adm-chip"><span class="material-icons-round">login</span>${p.sess.length} accessi</span>`);
        const dv = admDevices(p); if(dv.length) c.push(`<span class="adm-chip${dv.length > 2 ? ' warn' : ''}"><span class="material-icons-round">devices</span>${admEsc(dv.join(', '))}</span>`);
        if(p.role === 'autista' || p.role === 'coord' || p.role === 'centrale') c.push(p.subs.length ? `<span class="adm-chip ok"><span class="material-icons-round">notifications_active</span>notifiche</span>` : `<span class="adm-chip"><span class="material-icons-round">notifications_off</span>niente notifiche</span>`);
        if(p.mods.length) c.push(`<span class="adm-chip warn"><span class="material-icons-round">edit</span>${p.mods.length} modifiche</span>`);
        if(p.reqs.length) c.push(`<span class="adm-chip"><span class="material-icons-round">inbox</span>${p.reqs.length} richieste</span>`);
        if(p.des) { const n = Object.keys(p.des.days || {}).length; if(n) c.push(`<span class="adm-chip"><span class="material-icons-round">beach_access</span>${n} desiderate</span>`); }
        return `<div class="adm-chips">${c.join('')}</div>`;
    }
    function admOpenPerson(k) { vibrate(); admPerson = k; admRenderPersone(); const b = document.querySelector('#admin-panel-modal .adm-body'); if(b) b.scrollTop = 0; admTopBar(); }
    function admRenderPersone() {
        const box = document.getElementById('adm-persone'); if(!box) return;
        if(!admData) { box.innerHTML = admLoadingHtml(); return; }
        const all = admPeople();
        if(admPerson) {
            const p = all.find(x => x.key === admKey(admPerson)) || all.find(x => x.name === admPerson);
            if(p) { box.innerHTML = admPersonDetail(p); admTopBar(); return; }
            admPerson = null;
        }
        const q = admKey(admPeopleSearch);
        const order = { coord: 0, centrale: 1, autista: 2, ospite: 3, anon: 4 };
        const list = all.filter(p => !q || p.key.includes(q)).sort((a, b) => (order[a.role] - order[b.role]) || (admLastSeen(b) - admLastSeen(a)) || a.name.localeCompare(b.name));
        const never = all.filter(p => p.col && !p.sess.length);
        box.innerHTML = `<div class="adm-note"><span class="material-icons-round">info</span><div>Tocca una persona per vedere <b>tutto quello che fa</b>: da quali dispositivi entra, quando, cosa modifica, le richieste, le ferie desiderate e cosa può fare con il suo ruolo. Accessi degli ultimi ${ADM_DAYS} giorni, modifiche degli ultimi 7.</div></div>
            ${never.length ? `<div class="adm-issue sev-info"><span class="material-icons-round">person_off</span><div><b>${never.length} ${never.length === 1 ? 'persona non è mai entrata' : 'persone non sono mai entrate'} con il proprio nome in ${ADM_DAYS} giorni</b><p>${admEsc(never.map(p => p.name).join(', '))}</p></div></div>` : ''}
            <div class="adm-toolbar"><div class="adm-search"><span class="material-icons-round">search</span><input type="search" placeholder="Cerca una persona" value="${admEsc(admPeopleSearch)}" oninput="admPeopleSearch=this.value;admRenderPersone();const i=document.querySelector('#adm-persone input');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}"></div></div>
            <div class="adm-people">${list.map(p => { const R = ADM_ROLES[p.role] || ADM_ROLES.autista, ls = admLastSeen(p);
                return `<button class="adm-person" onclick="admOpenPerson('${admEsc(p.key).replace(/'/g, '&#39;')}')"><span class="adm-av${p.sess.some(s => s.online) ? ' on' : ''}" style="background:${R.color}22;color:${R.color}">${admEsc(admInit(p.name))}</span><div><b>${admEsc(p.name)}</b><small><span class="adm-pill muted">${R.name}</span> · ${ls ? 'ultimo accesso ' + admAgo(ls) : 'nessun accesso'}</small>${admPersonChips(p)}</div></button>`; }).join('')}</div>`;
    }
    function admPersonDetail(p) {
        const R = ADM_ROLES[p.role] || ADM_ROLES.autista, ls = admLastSeen(p);
        const extra = [];
        if(typeof AS_OPERATORI !== 'undefined' && AS_OPERATORI.includes(p.key)) extra.push('Riceve le nuove richieste del portale');
        const idRow = (() => { try { return admIdentityRows().find(r => admKey(r.nm) === p.key); } catch(e) { return null; } })();
        const ev = [];
        p.sess.forEach(s => { const st = admMs(s.startTime), la = admMs(s.lastActive) || st, min = Math.max(0, Math.round((la - st) / 60000));
            ev.push({ t: st, k: 'acc', ico: 'login', h: `Ha aperto l’app da <b>${admEsc(s.device || 'un dispositivo')}</b>`, s: (s.online ? 'online adesso · ' : '') + (min ? 'attivo per ' + (min < 60 ? min + ' min' : Math.floor(min / 60) + ' h ' + (min % 60) + ' min') : 'pochi secondi') + ((s.viewHistory || []).length ? ' · ha guardato: ' + s.viewHistory.map(v => v.view).filter(v => v && v !== 'Avvio app').slice(-6).join(', ') : '') }); });
        p.mods.forEach(e => { const it = e.items || []; ev.push({ t: admMs(e.t), k: 'mod', ico: 'edit', h: `Ha salvato <b>${it.length} ${it.length === 1 ? 'modifica' : 'modifiche'}</b>${String(e.who || '').split(' · ')[1] ? ' (' + admEsc(String(e.who).split(' · ')[1]) + ')' : ''}`,
            s: e.note ? String(e.note) : it.slice(0, 4).map(x => String(x.key || '').replace('__', ' ').replace('@', ' ')).join(', ') + (it.length > 4 ? '…' : '') }); });
        p.reqs.forEach(r => { const tp = (RICHIESTE_TYPE_LABELS && RICHIESTE_TYPE_LABELS[r.type]) || r.type || 'Richiesta';
            ev.push({ t: admMs(r.timestamp), k: 'req', ico: 'inbox', h: `Ha chiesto <b>${admEsc(tp)}</b>`, s: admReqWhen(r) + ' · ' + admReqState(r)[0] }); });
        if(p.des) { const c = desCount(p.des.days || {}, p.des.year); ev.push({ t: admMs(p.des.updatedAt), k: 'des', ico: 'beach_access', h: `Ferie desiderate ${p.des.year}: <b>${c.f} ferie, ${c.p} permessi</b>${c.auto ? ', ' + c.auto + ' riposi' : ''}`, s: p.des.adminBy ? 'ultima modifica fatta da ' + p.des.adminBy : 'scritte da lui/lei' }); }
        ev.sort((a, b) => b.t - a.t);
        const dv = {}; p.sess.forEach(s => { const k = s.device || 'Dispositivo'; dv[k] = dv[k] || { n: 0, last: 0, ua: s.userAgent || '' }; dv[k].n++; dv[k].last = Math.max(dv[k].last, admMs(s.lastActive) || admMs(s.startTime)); });
        const pend = p.reqs.filter(r => admReqState(r)[1] === 'warn').length;
        const desN = p.des ? desCount(p.des.days || {}, p.des.year) : null;
        return `<div class="adm-pd-head"><span class="adm-av${p.sess.some(s => s.online) ? ' on' : ''}" style="background:${R.color}22;color:${R.color}">${admEsc(admInit(p.name))}</span><div><h4>${admEsc(p.name)}</h4><span class="adm-pill" style="background:${R.color}1f;color:${R.color}">${R.name}</span> <span class="adm-muted">${ls ? 'ultimo accesso ' + admWhen(ls) : 'nessun accesso negli ultimi ' + ADM_DAYS + ' giorni'}</span></div>
                <button class="adm-btn sm" onclick="admBackHome()"><span class="material-icons-round">arrow_back</span>Tutte le persone</button></div>
            <div class="adm-kpis">
                ${admKpi('login', p.sess.length, 'Accessi', ADM_DAYS + ' giorni', p.sess.length ? 'info' : 'muted')}
                ${admKpi('devices', Object.keys(dv).length, 'Dispositivi', Object.keys(dv).join(', ') || '—', Object.keys(dv).length > 2 ? 'warn' : 'info')}
                ${admKpi('edit', p.mods.length, 'Salvataggi', 'ultimi 7 giorni', p.mods.length ? 'warn' : 'muted')}
                ${admKpi('inbox', p.reqs.length, 'Richieste', pend ? pend + ' da gestire' : 'nessuna in sospeso', pend ? 'warn' : 'muted')}
                ${admKpi(p.subs.length ? 'notifications_active' : 'notifications_off', p.subs.length ? 'sì' : 'no', 'Notifiche sul telefono', p.subs.length ? p.subs.length + ' dispositivi' : 'non attive', p.subs.length ? 'ok' : 'muted')}
                ${admKpi('beach_access', desN ? desN.f : '—', 'Ferie desiderate', desN ? admDesYear() + (desN.p ? ' · ' + desN.p + ' permessi' : '') : 'nessuna scritta', desN && desN.f ? 'ok' : 'muted')}
                ${admKpi('how_to_reg', idRow ? idRow.active.length : 0, 'Nome occupato da', idRow && idRow.active.length > 1 ? 'più dispositivi: controlla' : 'dispositivi', idRow && idRow.active.length > 1 ? 'warn' : 'info')}
                ${admKpi('history', ev.length, 'Cose fatte', 'nella cronologia qui sotto', 'info')}
            </div>
            <div class="adm-grid2">
                <div class="adm-card"><h4><span class="material-icons-round">verified_user</span>Cosa può fare</h4><small class="adm-muted">${admEsc(R.how)}</small><ul class="adm-can">${R.can.concat(extra).map(x => `<li><span class="material-icons-round">check_circle</span>${admEsc(x)}</li>`).join('')}</ul>
                    ${R.cant.length ? `<p class="adm-muted" style="margin:10px 0 6px;font-weight:800">Non può</p><ul class="adm-can no">${R.cant.map(x => `<li><span class="material-icons-round">block</span>${admEsc(x)}</li>`).join('')}</ul>` : ''}</div>
                <div class="adm-card"><h4><span class="material-icons-round">devices</span>Dispositivi usati</h4>${Object.keys(dv).length ? `<div class="adm-rows">${Object.entries(dv).sort((a, b) => b[1].last - a[1].last).map(([k, v]) => `<div class="adm-row"><span class="material-icons-round">${/iphone|android|telefono|mobile/i.test(k) ? 'smartphone' : /ipad|tablet/i.test(k) ? 'tablet' : 'computer'}</span><div><b>${admEsc(k)}</b><small>${v.n} accessi · ultimo ${admAgo(v.last)}</small></div></div>`).join('')}</div>` : '<div class="adm-empty sm"><span class="material-icons-round">devices</span>Nessun dispositivo negli ultimi ' + ADM_DAYS + ' giorni</div>'}
                    ${idRow && idRow.active.length ? `<div class="adm-row-act"><button class="adm-btn sm" onclick="admGo('identita')"><span class="material-icons-round">how_to_reg</span>Nomi e identità</button></div>` : ''}</div>
            </div>
            <div class="adm-card"><h4><span class="material-icons-round">timeline</span>Cosa ha fatto</h4>${ev.length ? `<ul class="adm-tl">${ev.slice(0, 80).map(e => `<li class="k-${e.k}"><i><span class="material-icons-round">${e.ico}</span></i><span class="adm-tl-t">${admWhen(e.t)}</span><div>${e.h}</div>${e.s ? `<small>${admEsc(e.s)}</small>` : ''}</li>`).join('')}</ul>${ev.length > 80 ? `<small class="adm-muted">Mostrate le ultime 80.</small>` : ''}` : '<div class="adm-empty sm"><span class="material-icons-round">hourglass_empty</span>Nessuna attività registrata</div>'}</div>`;
    }

    // ── ruoli e permessi ──
    function admRenderRuoli() {
        const box = document.getElementById('adm-ruoli'); if(!box) return;
        const ppl = admPeople(), who = r => ppl.filter(p => p.role === r).map(p => p.name);
        const card = (R, names) => `<div class="adm-role"><div class="adm-role-h"><span class="material-icons-round" style="background:${R.color}">${R.icon}</span><div><b>${R.name}</b><small>${admEsc(R.how)}</small></div></div>
            <p>Può</p><ul class="adm-can">${R.can.map(x => `<li><span class="material-icons-round">check_circle</span>${admEsc(x)}</li>`).join('')}</ul>
            ${R.cant.length ? `<p>Non può</p><ul class="adm-can no">${R.cant.map(x => `<li><span class="material-icons-round">block</span>${admEsc(x)}</li>`).join('')}</ul>` : ''}
            ${names ? `<div class="adm-role-who">Chi: <b>${admEsc(names)}</b></div>` : ''}</div>`;
        box.innerHTML = `<div class="adm-note"><span class="material-icons-round">info</span><div>Cosa può fare <b>ogni tipo di account</b> che entra nell’app. Il ruolo dipende dal nome scelto in “Chi sei?”; le aree protette (Area coordinatore, admin delle desiderate, questo pannello) si aprono solo con la password e valgono sul dispositivo finché l’app resta aperta.</div></div>
            <div class="adm-roles">${card(ADM_ROLES.autista, who('autista').join(', '))}${card(ADM_ROLES.coord, who('coord').join(', ') || coordinatorName)}${card(ADM_ROLES.centrale, who('centrale').join(', '))}${card(ADM_ROLES.ospite, '')}${admExtraRoles().map(r => card(r, '')).join('')}${card(ADM_ROLES.anon, '')}</div>`;
    }

    // ── motore delle notifiche ──
    function admRenderMotoreTab() {
        const box = document.getElementById('adm-motore'); if(!box) return;
        if(!admData) { box.innerHTML = admLoadingHtml(); return; }
        const runs = admData.runs, M = admMotore();
        if(!runs) { box.innerHTML = `<div class="adm-empty"><span class="material-icons-round">${admMotoreData.pending ? 'autorenew' : 'cloud_off'}</span>${admMotoreData.pending ? 'Chiedo a GitHub…' : 'GitHub non ha risposto. Riprova con Aggiorna.'}</div>`; return; }
        const dur = r => { const a = Date.parse(r.run_started_at || r.created_at), b = Date.parse(r.updated_at); return b > a ? Math.round((b - a) / 1000) : 0; };
        const done = runs.filter(r => r.status === 'completed'), okN = done.filter(r => r.conclusion === 'success').length;
        const avg = done.length ? Math.round(done.reduce((a, r) => a + dur(r), 0) / done.length) : 0;
        const subs = Object.values(admData.subs || {}), owners = {}; subs.forEach(s => { const o = s.owner || '?'; owners[o] = (owners[o] || 0) + 1; });
        const evName = { schedule: 'automatico', workflow_dispatch: 'avviato a mano', push: 'dopo una pubblicazione', repository_dispatch: 'chiamato dall’app' };
        box.innerHTML = `<div class="adm-note"><span class="material-icons-round">info</span><div>Il <b>motore</b> gira su GitHub ogni 15 minuti circa: manda le notifiche ad app chiusa e aggiorna i calendari del telefono. Qui vedi i suoi ultimi ${runs.length} giri.</div></div>
            <div class="adm-kpis">
                ${admKpi('schedule', M ? admAgo(M.last) : '—', 'Ultimo giro', M ? admWhen(M.last) : '', !M ? 'muted' : Date.now() - M.last > 36e5 ? 'warn' : 'ok')}
                ${admKpi('repeat', M ? M.auto24 : 0, 'Giri automatici', 'ultime 24 ore', 'info')}
                ${admKpi('task_alt', done.length ? Math.round(okN / done.length * 100) + '%' : '—', 'Riusciti', okN + ' su ' + done.length, okN === done.length ? 'ok' : 'warn')}
                ${admKpi('timer', avg ? avg + ' s' : '—', 'Durata media', 'per giro', 'info')}
            </div>
            ${admData.motoreProblem ? `<div class="adm-issue sev-err"><span class="material-icons-round">notifications_off</span><div><b>Le notifiche non partono</b><p>${admEsc(admData.motoreProblem)}</p></div></div>` : ''}
            <div class="adm-grid2"><div class="adm-card"><h4><span class="material-icons-round">notifications_active</span>Telefoni con le notifiche</h4>${subs.length ? `<div class="adm-rows">${Object.entries(owners).sort((a, b) => a[0].localeCompare(b[0])).map(([o, n]) => `<div class="adm-row"><span class="material-icons-round">smartphone</span><div><b>${admEsc(o)}</b><small>${n} ${n === 1 ? 'dispositivo' : 'dispositivi'}</small></div></div>`).join('')}</div>` : '<div class="adm-empty sm"><span class="material-icons-round">notifications_off</span>Nessun telefono ha le notifiche attive</div>'}</div>
            <div class="adm-card"><h4><span class="material-icons-round">link</span>Collegamenti</h4><div class="adm-rows"><div class="adm-row"><span class="material-icons-round">open_in_new</span><div><a href="https://github.com/${ADM_MOTORE_REPO}/actions" target="_blank" rel="noopener">Registro del motore su GitHub</a><small>Tutti i giri con i dettagli</small></div></div></div></div></div>
            <div class="adm-sec-h" style="margin-top:16px"><span class="material-icons-round">list</span>Ultimi giri <b>${runs.length}</b></div>
            <div class="adm-rows">${runs.slice(0, 40).map(r => { const st = r.status !== 'completed' ? ['in corso', 'info'] : r.conclusion === 'success' ? ['riuscito', 'ok'] : r.conclusion === 'cancelled' ? ['annullato', 'muted'] : ['fallito', 'err'];
                return `<div class="adm-row"><span class="material-icons-round" style="color:${st[1] === 'ok' ? '#16a34a' : st[1] === 'err' ? '#dc2626' : '#64748b'}">${st[1] === 'ok' ? 'check_circle' : st[1] === 'err' ? 'cancel' : 'pending'}</span><div><b>${admWhen(Date.parse(r.created_at))}</b><small>${evName[r.event] || r.event} · ${dur(r)} s</small></div><span class="adm-pill ${st[1]}">${st[0]}</span><a href="${admEsc(r.html_url)}" target="_blank" rel="noopener" class="adm-btn sm">Apri</a></div>`; }).join('')}</div>`;
    }

    // ── richieste del portale ──
    let admReqFilter = 'gestire';
    const admReqPending = () => (admData ? admData.requests : []).filter(r => !r.obscured && !r.insertedInShifts && !reqIsAutoCessione(r));
    function admReqState(r) {
        if(r.obscured) return ['nascosta / rifiutata', 'muted'];
        if(r.insertedInShifts) return ['inserita nei turni', 'ok'];
        if(reqIsAutoCessione(r)) return ['cessione automatica', 'info'];
        return ['da gestire', 'warn'];
    }
    function admReqWhen(r) {
        const f = d => d ? new Date(d + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
        return r.dateFrom ? (r.dateTo && r.dateTo !== r.dateFrom ? `dal ${f(r.dateFrom)} al ${f(r.dateTo)}` : `il ${f(r.dateFrom)}`) : '';
    }
    function admReqSet(f) { vibrate(); admReqFilter = f; admRenderRichieste(); }
    function admRenderRichieste() {
        const box = document.getElementById('adm-richieste'); if(!box) return;
        if(!admData) { box.innerHTML = admLoadingHtml(); return; }
        const all = admData.requests, pend = admReqPending();
        const list = admReqFilter === 'gestire' ? pend : admReqFilter === 'inserite' ? all.filter(r => r.insertedInShifts) : all;
        const byType = {}; all.forEach(r => { const t = (RICHIESTE_TYPE_LABELS && RICHIESTE_TYPE_LABELS[r.type]) || r.type || '—'; byType[t] = (byType[t] || 0) + 1; });
        const tmx = Math.max(1, ...Object.values(byType));
        const appr = { attesa: ['caposala: in attesa', 'warn'], approvata: ['caposala: approvata', 'ok'], rifiutata: ['caposala: rifiutata', 'err'] };
        box.innerHTML = `<div class="adm-kpis">
                ${admKpi('pending_actions', pend.length, 'Da gestire', pend.length ? 'la più vecchia ' + admAgo(Math.min(...pend.map(r => admMs(r.timestamp)))) : 'nessuna', pend.length ? 'warn' : 'ok')}
                ${admKpi('inbox', all.length, 'Ricevute', 'ultime ' + all.length, 'info')}
                ${admKpi('event_available', all.filter(r => r.insertedInShifts).length, 'Inserite nei turni', '', 'ok')}
                ${admKpi('swap_horiz', all.filter(r => reqIsAutoCessione(r)).length, 'Cessioni automatiche', 'reperibilità', 'info')}
            </div>
            <div class="adm-toolbar"><div class="adm-seg">${[['gestire', 'Da gestire'], ['inserite', 'Inserite'], ['tutte', 'Tutte']].map(([k, l]) => `<button class="${admReqFilter === k ? 'on' : ''}" onclick="admReqSet('${k}')">${l}</button>`).join('')}</div>
                <button class="adm-btn sm" onclick="closeAdminPanel();setTimeout(()=>openCoordConsole('panoramica'),300)"><span class="material-icons-round">open_in_new</span>Gestisci nell’Area coordinatore</button></div>
            ${list.length ? `<div class="adm-rows">${list.map(r => { const tp = (RICHIESTE_TYPE_LABELS && RICHIESTE_TYPE_LABELS[r.type]) || r.type || 'Richiesta', st = admReqState(r), ap = appr[r.headNurseApproval];
                return `<div class="adm-row"><span class="adm-av" style="width:32px;height:32px">${admEsc(admInit(r.name))}</span><div><b>${admEsc(r.name || '—')}</b> · ${admEsc(tp)}<small>${admEsc(admReqWhen(r))}${r.swapWith ? ' · con ' + admEsc(r.swapWith) : ''}${r.timeSlot ? ' · ' + admEsc(r.timeSlot) : ''}${r.notes ? ' · “' + admEsc(String(r.notes).slice(0, 80)) + '”' : ''}</small></div><span class="r">${admAgo(admMs(r.timestamp))}<br><span class="adm-pill ${st[1]}">${st[0]}</span>${ap ? ` <span class="adm-pill ${ap[1]}">${ap[0]}</span>` : ''}</span></div>`; }).join('')}</div>` : `<div class="adm-empty ok"><span class="material-icons-round">task_alt</span>${admReqFilter === 'gestire' ? 'Nessuna richiesta da gestire.' : 'Nessuna richiesta.'}</div>`}
            <div class="adm-card"><h4><span class="material-icons-round">bar_chart</span>Richieste per tipo</h4>${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<div class="adm-bar"><span class="adm-bar-l">${admEsc(t)}</span><span class="adm-bar-t"><i class="violet" style="width:${Math.round(n / tmx * 100)}%"></i></span><b>${n}</b></div>`).join('') || '<div class="adm-muted">—</div>'}</div>`;
    }

    // ── ferie desiderate ──
    const admDesYear = () => (typeof desDefaultYear === 'function' ? desDefaultYear() : new Date().getFullYear() + 1);
    function admRenderDesiderate() {
        const box = document.getElementById('adm-desiderate'); if(!box) return;
        if(!admData) { box.innerHTML = admLoadingHtml(); return; }
        const y = admDesYear(), by = {}; (admData.des || []).forEach(x => by[admKey(x.name)] = x);
        const rows = (drivers || []).filter(d => !d.virtual).map(d => { const x = by[admKey(d.originalName || d.name)] || by[admKey(d.name)], c = x ? desCount(x.days || {}, y) : { f: 0, p: 0, auto: 0 }, A = desAllow(d);
            return { d, x, c, A, notes: x ? Object.keys(x.notes || {}).length : 0, ok: x ? Object.keys(x.ok || {}).length : 0 }; });
        const started = rows.filter(r => r.c.f || r.c.p), over = rows.filter(r => r.c.f > r.A.co || r.c.p > r.A.sp);
        box.innerHTML = `<div class="adm-kpis">
                ${admKpi('beach_access', started.length + ' / ' + rows.length, 'Hanno scritto', 'ferie desiderate ' + y, started.length ? 'ok' : 'muted')}
                ${admKpi('event', rows.reduce((a, r) => a + r.c.f, 0), 'Giorni di ferie', 'chiesti in tutto', 'info')}
                ${admKpi('strikethrough_s', rows.reduce((a, r) => a + r.ok, 0), 'Giorni barrati', 'già nei turni', 'info')}
                ${admKpi('report', over.length, 'Oltre le spettanze', over.map(r => r.d.name).join(', ') || 'nessuno', over.length ? 'warn' : 'ok')}
            </div>
            <div class="adm-toolbar"><button class="adm-btn sm primary" onclick="closeAdminPanel();setTimeout(openDesiderate,300)"><span class="material-icons-round">open_in_new</span>Apri il calendario desiderate</button></div>
            <div class="adm-rows">${rows.sort((a, b) => b.c.f - a.c.f || a.d.name.localeCompare(b.d.name)).map(r => `<div class="adm-row"><span class="adm-av" style="width:32px;height:32px">${admEsc(admInit(r.d.name))}</span><div><b>${admEsc(r.d.name)}</b><small>Ferie <b>${r.c.f}</b>/${r.A.co} · permessi <b>${r.c.p}</b>/${r.A.sp}${r.c.auto ? ' · riposi ' + r.c.auto : ''}${r.notes ? ' · ' + r.notes + ' note' : ''}${r.ok ? ' · ' + r.ok + ' barrati' : ''}</small><div class="adm-desbar"><i class="${r.c.f > r.A.co ? 'over' : ''}" style="width:${Math.min(100, Math.round(r.c.f / Math.max(1, r.A.co) * 100))}%"></i></div></div><span class="r">${r.x ? 'aggiornate ' + admAgo(admMs(r.x.updatedAt)) + (r.x.adminBy ? '<br>da ' + admEsc(r.x.adminBy) : '') : 'non ancora scritte'}</span></div>`).join('')}</div>`;
    }

    // ── copie di sicurezza ──
    function admRenderCopie() {
        const box = document.getElementById('adm-copie'); if(!box) return;
        if(!admData) { box.innerHTML = admLoadingHtml(); return; }
        const list = admData.snaps.slice().sort((a, b) => admMs(b.createdAt) - admMs(a.createdAt)), last = list.length ? admMs(list[0].createdAt) : 0;
        const kind = k => ({ daily: 'copia giornaliera', settimanale: 'copia della settimana', weekly: 'copia della settimana', manuale: 'copia manuale' }[k] || String(k || 'copia').replace(/^prima-/, 'prima di: ').replace(/-/g, ' '));
        box.innerHTML = `<div class="adm-note"><span class="material-icons-round">info</span><div>L’app fa da sola una copia dei turni ogni giorno e ogni settimana (aprendo l’Area coordinatore) e prima delle operazioni grosse (importazioni, nuovo anno). Il <b>ripristino</b> si fa dall’Area coordinatore › Dati e backup.</div></div>
            <div class="adm-kpis three">
                ${admKpi('backup', admAgo(last), 'Ultima copia', admWhen(last), last && Date.now() - last < 3 * 864e5 ? 'ok' : 'warn')}
                ${admKpi('inventory_2', list.length, 'Copie salvate', '', 'info')}
                ${admKpi('storage', list.reduce((a, s) => a + (+s.size || 0), 0), 'Caselle salvate', 'in tutte le copie', 'info')}
            </div>
            <div class="adm-toolbar"><button class="adm-btn sm" onclick="closeAdminPanel();setTimeout(()=>openCoordConsole('dati'),300)"><span class="material-icons-round">settings_backup_restore</span>Ripristina dall’Area coordinatore</button></div>
            ${list.length ? `<div class="adm-rows">${list.map(s => `<div class="adm-row"><span class="material-icons-round">backup</span><div><b>${admWhen(admMs(s.createdAt))}</b><small>${admEsc(kind(s.kind))}${s.size ? ' · ' + s.size + ' caselle' : ''}</small></div><span class="r">${admAgo(admMs(s.createdAt))}</span></div>`).join('')}</div>` : '<div class="adm-empty"><span class="material-icons-round">backup</span>Nessuna copia salvata.</div>'}`;
    }

    // ── panoramica ──
    function admKpi(icon, val, label, sub, tone) { return `<div class="adm-kpi tone-${tone || 'info'}"><span class="material-icons-round">${icon}</span><div><b>${val}</b><small>${label}</small>${sub ? `<em>${sub}</em>` : ''}</div></div>`; }
    function admMotore() {
        const runs = admData && admData.runs; if(!runs) return null;
        const day = Date.now() - 864e5, last = runs[0];
        return { last: last ? (last.status !== 'completed' ? Date.now() : Date.parse(last.updated_at || last.created_at)) : 0,   // un giro acceso lavora ogni 15 minuti per ore
             ok: last ? last.conclusion === 'success' : false, running: last && last.status !== 'completed', event: last ? last.event : '', auto24: runs.filter(r => r.event === 'schedule' && Date.parse(r.created_at) > day).length, all24: runs.filter(r => Date.parse(r.created_at) > day).length, failed24: runs.filter(r => r.conclusion === 'failure' && Date.parse(r.created_at) > day).length };
    }
    function admIssues() {
        const out = [], add = (sev, icon, title, detail, act, actLbl) => out.push({ sev, icon, title, detail, act, actLbl });
        const errs = admProblems(1), hard = errs.filter(g => g.kind !== 'console');
        const net = admErrorGroups(1).filter(g => g.kind === 'rete'), netPeople = new Set(); net.forEach(g => g.people.forEach(p => netPeople.add(p)));
        if(netPeople.size >= 3) add('info', 'wifi_off', `Connessione lenta su ${netPeople.size} dispositivi nelle ultime 24 ore`, 'Hanno lavorato offline per un po’ e poi si sono risincronizzati: di solito è poco segnale, non un errore dell’app.', "admGo('errori')", 'Vedi');
        if(hard.length) add('err', 'bug_report', `${hard.length} ${hard.length === 1 ? 'errore' : 'errori'} nelle ultime 24 ore`, hard.slice(0, 2).map(g => g.msg.slice(0, 80)).join(' · '), "admGo('errori')", 'Vedi errori');
        else if(errs.length) add('warn', 'report', `${errs.length} ${errs.length === 1 ? 'avviso' : 'avvisi'} nelle ultime 24 ore`, errs.slice(0, 2).map(g => g.msg.slice(0, 80)).join(' · '), "admGo('errori')", 'Vedi');
        const M = admMotore();
        if(!M && admMotoreData.pending) { /* ancora in verifica */ }
        else if(!M) add('info', 'cloud_off', 'Motore delle notifiche: stato non disponibile', 'GitHub non ha risposto. Riprova con “Aggiorna”.', '', '');
        else if(!M.last || Date.now() - M.last > 6 * 36e5) add('err', 'notifications_off', 'Il motore delle notifiche è fermo', `Ultimo giro ${admAgo(M.last)}. Senza il motore niente notifiche ad app chiusa e i calendari del telefono non si aggiornano.`, `window.open('https://github.com/${ADM_MOTORE_REPO}/actions/workflows/motore.yml','_blank')`, 'Apri GitHub');
        else if(Date.now() - M.last > 36e5) add('warn', 'notifications_paused', 'Il motore delle notifiche è in ritardo', `Ultimo giro ${admAgo(M.last)} (dovrebbe girare ogni 15 minuti).`, `window.open('https://github.com/${ADM_MOTORE_REPO}/actions/workflows/motore.yml','_blank')`, 'Apri GitHub');
        if(admData.motoreProblem) add('err', 'notifications_off', 'Le notifiche sul telefono non partono', admData.motoreProblem + ' Rimetti il secret VAPID_PRIVATE su GitHub (Settings › Secrets › Actions): solo la chiave privata, senza spazi né scritte.', `window.open('https://github.com/${ADM_MOTORE_REPO}/settings/secrets/actions','_blank')`, 'Apri i secret');
        if(M && M.failed24) add('err', 'error', `${M.failed24} giri del motore falliti nelle ultime 24 ore`, 'Controlla il registro del motore su GitHub.', `window.open('https://github.com/${ADM_MOTORE_REPO}/actions','_blank')`, 'Apri GitHub');
        const owners = Object.values(admData.subs).map(s => String(s.owner || '').toUpperCase());
        if(coordinatorName && !owners.includes(String(coordinatorName).toUpperCase())) add('warn', 'phonelink_erase', `Il coordinatore (${coordinatorName}) non ha le notifiche attive`, 'Non riceve sul telefono le richieste dal portale ad app chiusa: deve scegliere il suo nome e attivarle in Opzioni.', '', '');
        const coordAsGuest = admReal().filter(s => s.identity === 'Ospite' && (s.viewHistory || []).some(v => v && v.view === 'Area Coordinatore') && admMs(s.lastActive) > Date.now() - 3 * 864e5);
        if(coordAsGuest.length) add('info', 'no_accounts', 'L’Area coordinatore viene usata come “Ospite”', `${coordAsGuest.length} sessioni negli ultimi 3 giorni: nel registro le modifiche risultano di “Ospite” e su quel dispositivo non arrivano gli avvisi delle richieste.`, "admGo('accessi')", 'Vedi accessi');
        const multi = admIdentityRows().filter(r => r.active.length > 1);
        if(multi.length) add('warn', 'how_to_reg', `${multi.length} ${multi.length === 1 ? 'nome è occupato' : 'nomi sono occupati'} da più dispositivi`, multi.slice(0, 5).map(r => `${r.nm} (${r.active.length})`).join(', ') + ': se qualcuno non riesce a scegliere il suo nome, liberalo.', "admGo('identita')", 'Gestisci');
        const pend = admData.requests.filter(r => !r.obscured && !r.insertedInShifts && !reqIsAutoCessione(r)), old = pend.filter(r => admMs(r.timestamp) < Date.now() - 3 * 864e5);
        if(old.length) add('warn', 'pending_actions', `${old.length} ${old.length === 1 ? 'richiesta aspetta' : 'richieste aspettano'} da più di 3 giorni`, old.slice(0, 4).map(r => `${r.name || '—'} (${(RICHIESTE_TYPE_LABELS[r.type] || r.type || '').toLowerCase()})`).join(', '), 'window.openRichiestePanel && (closeAdminPanel(), window.openRichiestePanel())', 'Apri richieste');
        try {
            const today = ymd(new Date()), lim = repDateAdd(today, 30), R = repData(), C = dayChecks(); let cov = 0, norep = 0;
            for(let r = 1; r < finalData.length; r++) { const iso = repRowDate(r); if(!iso || iso < today || iso > lim) continue; const c = C.rows[r]; if(c && c.day.length) cov++; if(!R.tit[iso]) norep++; }
            if(norep) add('warn', 'phone_disabled', `${norep} giorni senza reperibile nei prossimi 30`, 'Si sistemano in Modifica turni.', '', '');
            if(cov) add('warn', 'groups', `${cov} giorni con avvisi sul calendario nei prossimi 30`, 'Copertura, riposi o giorni di fila: li trovi nella Panoramica dell’Area coordinatore.', '', '');
        } catch(e) {}
        try { const n = chkOpenCount(); if(n) add('info', 'fact_check', `${n} ${n === 1 ? 'casella' : 'caselle'} da controllare nei conteggi`, 'Sono nella finestra “Da controllare” dell’Area coordinatore.', '', ''); } catch(e) {}
        const lastSnap = Math.max(0, ...admData.snaps.map(s => admMs(s.createdAt)));
        if(!lastSnap || Date.now() - lastSnap > 3 * 864e5) add('warn', 'backup', 'Nessuna copia di sicurezza recente', `Ultima copia ${admAgo(lastSnap)}. Si crea da sola aprendo l’Area coordinatore.`, '', '');
        const salAt = admData.saldi ? admMs(admData.saldi.updatedAt || admData.saldi.at) : 0;
        if(!salAt || Date.now() - salAt > 2 * 864e5) add('info', 'account_balance_wallet', 'Saldi per il portale Richieste non aggiornati di recente', `Ultimo aggiornamento ${admAgo(salAt)}.`, '', '');
        if(consG) ['r', 'w', 'x'].forEach(k => { const v = consG.kinds[k][consG.kinds[k].length - 1], p = v / CONS_LIMITS[k];
            if(p >= .7) add(p >= 1 ? 'err' : 'warn', 'data_usage', `${CONS_KIND[k]} Firebase di oggi: ${consFmt(v)} su ${consFmt(CONS_LIMITS[k])} gratuite`, p >= 1 ? (consG.plan === 'blaze' ? 'Oltre la quota gratuita: con il piano Blaze il resto si paga (pochi centesimi).' : 'Oltre la quota gratuita: con il piano gratuito Firebase smette di rispondere fino a domani.') : 'Ci si sta avvicinando alla quota gratuita di oggi.', "admGo('consumi')", 'Vedi consumi'); });
        if(dataSourceMode === 'excel') add('info', 'table_view', 'I turni arrivano dal file Excel', 'L’app è in modalità Excel: le modifiche si fanno sul file.', '', '');
        const rank = { err: 0, warn: 1, info: 2 }; return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
    }
    function admGo(tab) { const b = document.querySelector(`#admin-panel-modal .admin-tab-btn[data-tab="${tab}"]`); switchAdminTab(tab, b); }
    function admRenderPanoramica() {
        const box = document.getElementById('adm-panoramica'); if(!box) return;
        if(!admData) { box.innerHTML = admLoadingHtml(); return; }
        const real = admReal(), now = Date.now(), today = new Date(); today.setHours(0, 0, 0, 0);
        const online = real.filter(s => s.online && admMs(s.lastActive) > now - 100000);
        const todayS = real.filter(s => admMs(s.startTime) >= today.getTime());
        const people = new Set(todayS.map(s => s.identity).filter(x => x && x !== 'Ospite'));
        const errs = admProblems(1), errN = errs.reduce((a, g) => a + g.n, 0);
        const M = admMotore(), subs = Object.values(admData.subs);
        const pend = admData.requests.filter(r => !r.obscured && !r.insertedInShifts && !reqIsAutoCessione(r));
        let chk = 0; try { chk = chkOpenCount(); } catch(e) {}
        const issues = admIssues(), worst = issues.length ? issues[0].sev : 'ok';
        const head = { ok: ['verified', 'Tutto funziona', 'Nessun problema da segnalare.'], info: ['verified', 'Tutto funziona', 'Ci sono solo informazioni da leggere.'], warn: ['error_outline', 'Qualcosa da guardare', (n => n === 1 ? 'Un punto richiede attenzione.' : n + ' punti richiedono attenzione.')(issues.filter(i => i.sev !== 'info').length)], err: ['report', 'Ci sono problemi', (n => n === 1 ? 'Un problema da risolvere.' : n + ' problemi da risolvere.')(issues.filter(i => i.sev === 'err').length)] }[worst];
        // attività degli ultimi 14 giorni
        const days = []; for(let i = ADM_DAYS - 1; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push({ d, s: 0, p: new Set() }); }
        real.forEach(s => { const ms = admMs(s.startTime); const i = days.findIndex((x, k) => ms >= x.d.getTime() && (k === days.length - 1 || ms < days[k + 1].d.getTime())); if(i >= 0) { days[i].s++; if(s.identity && s.identity !== 'Ospite') days[i].p.add(s.identity); } });
        const mx = Math.max(1, ...days.map(x => x.s));
        const chart = `<div class="adm-chart">${days.map(x => `<div class="adm-col" title="${x.d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}: ${x.s} accessi, ${x.p.size} persone"><span class="adm-col-v">${x.s || ''}</span><i style="height:${x.s / mx * 100}%"><em style="height:${x.s ? x.p.size / x.s * 100 : 0}%"></em></i><small>${x.d.getDate()}</small></div>`).join('')}</div>
            <div class="adm-legend"><span><i class="a"></i>accessi</span><span><i class="b"></i>persone diverse</span></div>`;
        const views = {}; real.forEach(s => (s.viewHistory || []).forEach(v => { if(v && v.view && v.view !== 'Avvio app') views[v.view] = (views[v.view] || 0) + 1; }));
        const topV = Object.entries(views).sort((a, b) => b[1] - a[1]).slice(0, 7), vmx = Math.max(1, ...topV.map(x => x[1]));
        const status = (ok, label, value) => `<div class="adm-st"><span class="adm-dot ${ok}"></span><span>${label}</span><b>${value}</b></div>`;
        const lastSnap = Math.max(0, ...admData.snaps.map(s => admMs(s.createdAt)));
        const salAt = admData.saldi ? admMs(admData.saldi.updatedAt || admData.saldi.at) : 0;
        const coordSub = coordinatorName && subs.some(s => String(s.owner || '').toUpperCase() === String(coordinatorName).toUpperCase());
        box.innerHTML = `<div class="adm-hero sev-${worst}"><span class="material-icons-round">${head[0]}</span><div><b>${head[1]}</b><small>${head[2]}</small></div><button class="adm-btn ghost adm-refresh" onclick="admRefresh()"><span class="material-icons-round">refresh</span>Aggiorna</button></div>
            <div class="adm-kpis">
                ${admKpi('wifi_tethering', online.length, 'Online ora', online.map(admSessName).slice(0, 3).join(', '), online.length ? 'ok' : 'muted')}
                ${admKpi('login', todayS.length, 'Accessi oggi', `${people.size} persone con nome`, 'info')}
                ${admKpi('bug_report', errN, 'Problemi in 24 ore', errs.length ? `${errs.length} tipi diversi` : 'nessuno', errs.some(g => g.kind !== 'console') ? 'err' : errs.length ? 'warn' : 'ok')}
                ${admKpi('notifications_active', subs.length, 'Telefoni con notifiche', coordSub ? 'coordinatore incluso' : 'coordinatore escluso', coordSub ? 'ok' : 'warn')}
                ${admKpi('smart_toy', M ? admAgo(M.last) : '—', 'Ultimo giro motore', M ? `${M.auto24} automatici in 24 ore` : admMotoreData.pending ? 'controllo…' : 'GitHub non risponde', !M ? 'muted' : (now - M.last > 6 * 36e5 ? 'err' : now - M.last > 36e5 ? 'warn' : 'ok'))}
                ${admKpi('inbox', pend.length, 'Richieste da gestire', admData.requests.length ? 'ultima ' + admAgo(admMs(admData.requests[0].timestamp)) : 'nessuna', pend.length ? 'warn' : 'ok')}
                ${admKpi('fact_check', chk, 'Caselle da controllare', 'nei conteggi', chk ? 'warn' : 'ok')}
                ${admKpi('backup', admAgo(lastSnap), 'Ultima copia', `${admData.snaps.length} copie salvate`, lastSnap && now - lastSnap < 3 * 864e5 ? 'ok' : 'warn')}
            </div>
            <div class="adm-sec-h"><span class="material-icons-round">assignment_late</span>Cose da guardare <b>${issues.length}</b></div>
            ${issues.length ? issues.map(i => `<div class="adm-issue sev-${i.sev}"><span class="material-icons-round">${i.icon}</span><div><b>${admEsc(i.title)}</b><p>${admEsc(i.detail)}</p></div>${i.act ? `<button class="adm-btn sm" onclick="${i.act}">${admEsc(i.actLbl)}</button>` : ''}</div>`).join('') : '<div class="adm-empty ok sm"><span class="material-icons-round">verified</span>Niente da segnalare.</div>'}
            <div class="adm-grid2">
                <div class="adm-card"><h4><span class="material-icons-round">insights</span>Attività ultimi 14 giorni</h4>${chart}</div>
                <div class="adm-card"><h4><span class="material-icons-round">touch_app</span>Cosa guardano di più</h4>${topV.length ? topV.map(([n, v]) => `<div class="adm-bar"><span class="adm-bar-l">${admEsc(n)}</span><span class="adm-bar-t"><i class="blue" style="width:${v / vmx * 100}%"></i></span><b>${v}</b></div>`).join('') : '<div class="adm-empty sm">Nessun dato.</div>'}</div>
            </div>
            <div class="adm-card"><h4><span class="material-icons-round">dns</span>Stato del sistema</h4><div class="adm-sts">
                ${status(fbReady && fbAuth && fbAuth.currentUser ? 'ok' : 'err', 'Collegamento a Firebase', fbReady && fbAuth && fbAuth.currentUser ? 'attivo' : 'assente')}
                ${status(admData.sessionsOk ? 'ok' : 'err', 'Lettura dei dati', admData.sessionsOk ? 'regolare' : 'non riuscita')}
                ${status('ok', 'Origine dei turni', dataSourceMode === 'firebase' ? 'solo app' : 'file Excel')}
                ${status('ok', 'Anno attivo', activeYear + (archivedYears.length ? ` · archiviati ${archivedYears.join(', ')}` : ''))}
                ${status(coordinatorName ? (coordSub ? 'ok' : 'warn') : 'warn', 'Coordinatore designato', coordinatorName ? coordinatorName + (coordSub ? ' · notifiche attive' : ' · notifiche spente') : 'nessuno')}
                ${status(!M ? 'muted' : (M.ok ? (now - M.last > 36e5 ? 'warn' : 'ok') : 'err'), 'Motore notifiche (GitHub)', M ? `ultimo giro ${admWhen(M.last)} · ${M.event === 'schedule' ? 'automatico' : 'avviato a mano'} · ${M.ok ? 'riuscito' : 'fallito'}${M.running ? ' · in corso' : ''}` : admMotoreData.pending ? 'controllo…' : 'non disponibile')}
                ${status(admData.motoreProblem ? 'err' : 'ok', 'Invio notifiche', admData.motoreProblem ? 'bloccato: chiave non valida' : 'regolare')}
                ${status(subs.length ? 'ok' : 'warn', 'Notifiche attive', subs.length ? [...new Set(subs.map(s => s.owner || '?'))].join(', ') : 'nessun telefono')}
                ${status(salAt && now - salAt < 2 * 864e5 ? 'ok' : 'warn', 'Saldi per il portale', admAgo(salAt))}
                ${status(lastSnap && now - lastSnap < 3 * 864e5 ? 'ok' : 'warn', 'Copia di sicurezza', admWhen(lastSnap))}
                ${status('ok', 'Versione dell’app', admEsc(document.lastModified || '—'))}
            </div></div>`;
    }
    function admBadges() { admBadges0(); try { admBadgesMore(); admFoldBadges(); } catch(e) {} }
    function admBadgesMore() {
        const set = (id, n, tone) => { const b = document.getElementById(id); if(b) { b.textContent = n ? n : ''; b.className = 'adm-badge ' + (tone || ''); } };
        const M = admMotore(); set('adm-badge-motore', M && (M.failed24 || Date.now() - M.last > 36e5) ? (M.failed24 || 1) : 0, M && M.failed24 ? 'err' : 'warn');
        set('adm-badge-richieste', admReqPending().length, 'warn');
        const l = Math.max(0, ...admData.snaps.map(x => admMs(x.createdAt))); set('adm-badge-copie', !l || Date.now() - l > 3 * 864e5 ? 1 : 0, 'warn');
        if(admTab === 'home') admRenderHome();
    }
    function admBadges0() {
        if(!admData) return;
        const set = (id, n, tone) => { const b = document.getElementById(id); if(b) { b.textContent = n ? n : ''; b.className = 'adm-badge ' + (tone || ''); } };
        const errs = admProblems(1);
        set('adm-badge-errori', errs.length, errs.some(g => g.kind !== 'console') ? 'err' : 'warn');
        const iss = admIssues().filter(i => i.sev !== 'info'); set('adm-badge-panoramica', iss.length, iss.some(i => i.sev === 'err') ? 'err' : 'warn');
        set('adm-badge-identita', admIdentityRows().filter(r => r.active.length > 1).length, 'warn');
        const on = admReal().filter(s => s.online && admMs(s.lastActive) > Date.now() - 100000).length; set('adm-badge-accessi', on, 'ok');
    }
    function admAccSet(f) { vibrate(); admAccFilter = f; renderAdminAccessList(); }

    // ── consumi Firebase ──
    // Due fonti. 1) I numeri ufficiali di Google (gli stessi dei grafici della console Firebase), letti
    // da Cloud Monitoring con un accesso Google del proprietario del progetto: il permesso dura un'ora e
    // resta solo in questa scheda del browser, l'app non salva password né chiavi. 2) Il contatore
    // interno (admin_config/prova_consumi), che dice QUALI documenti legge e scrive questa app.
    const CONS_LIMITS = { r: 50000, w: 20000, x: 20000 };     // quote gratuite al giorno (piano Spark e Blaze)
    const CONS_SCOPES = ['https://www.googleapis.com/auth/monitoring.read', 'https://www.googleapis.com/auth/cloud-billing.readonly'];
    const CONS_KIND = { r: 'Letture', w: 'Scritture', x: 'Eliminazioni' };
    let consTok = null, consG = null, consGErr = '', consGLoading = null, consMine = null, consMineAt = 0;
    try { const t = JSON.parse(sessionStorage.getItem('cons_tok') || 'null'); if(t && t.exp > Date.now()) consTok = t; } catch(e) {}
    const consFmt = n => Math.round(n || 0).toLocaleString('it-IT');
    // ora italiana in cui Google azzera le quote (mezzanotte in California: le 9, o le 8 quando i cambi d'ora non coincidono)
    function consResetHour() { const now = Date.now(); let ms = now; while(consDay(ms) === consDay(now)) ms += 15 * 60e3; return new Date(ms - ms % (15 * 60e3)).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }); }
    const consDayLbl = day => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }); };
    function consLastDays(n) { const out = []; let ms = Date.now(); while(out.length < n) { const d = consDay(ms); if(!out.includes(d)) out.unshift(d); ms -= 6 * 36e5; } return out; }

    async function consSignIn() {
        vibrate(); consGErr = '';
        try {
            const app = firebase.apps.find(a => a.name === 'consumi') || firebase.initializeApp(firebaseConfig, 'consumi');
            const auth = app.auth(); await auth.setPersistence(firebase.auth.Auth.Persistence.NONE).catch(() => {});
            const pr = new firebase.auth.GoogleAuthProvider(); CONS_SCOPES.forEach(s => pr.addScope(s)); pr.setCustomParameters({ prompt: 'select_account' });
            const res = await auth.signInWithPopup(pr);
            const t = res && res.credential && res.credential.accessToken;
            if(!t) throw { code: 'no-token' };
            consTok = { t, exp: Date.now() + 55 * 60e3, email: (res.user && res.user.email) || '' };
            try { sessionStorage.setItem('cons_tok', JSON.stringify(consTok)); } catch(e) {}
            auth.signOut().catch(() => {});   // serve solo il permesso di lettura dei consumi, non l'accesso all'app
            await consLoadGoogle();
        } catch(e) {
            const c = String((e && e.code) || '');
            consGErr = c.includes('operation-not-allowed') ? 'In Firebase non è attivo l’accesso con Google. Apri la console Firebase › Authentication › Metodo di accesso, attiva “Google” e salva, poi riprova.'
                : c.includes('unauthorized-domain') ? `Il sito ${location.hostname} non è tra i domini autorizzati. Apri la console Firebase › Authentication › Impostazioni › Domini autorizzati, aggiungi ${location.hostname} e riprova.`
                : c.includes('popup-blocked') ? 'Il browser ha bloccato la finestra di accesso: consenti i popup per questo sito e riprova.'
                : c.includes('popup-closed') || c.includes('cancelled-popup') ? 'Accesso annullato.'
                : 'Accesso non riuscito' + (c ? ' (' + c + ')' : '') + '. Sul telefono con l’app installata la finestra di Google a volte non si apre: prova dal browser o dal PC.';
        }
        consRender();
    }
    function consSignOut() { vibrate(); consTok = null; consG = null; try { sessionStorage.removeItem('cons_tok'); } catch(e) {} consRender(); }

    async function consApi(url) {
        const r = await fetch(url, { headers: { Authorization: 'Bearer ' + consTok.t } });
        const j = await r.json().catch(() => ({}));
        if(r.status === 401) { consSignOut(); throw new Error('Il permesso di Google è scaduto: accedi di nuovo.'); }
        if(!r.ok) { const e = new Error((j.error && j.error.message) || ('errore ' + r.status)); e.status = r.status; throw e; }
        return j;
    }
    // somme per ora dal Cloud Monitoring; le finestre di un'ora finiscono all'ora piena, così i giorni tornano esatti
    async function consSeries(metric, group, hours) {
        const end = Math.ceil(Date.now() / 36e5) * 36e5, base = `https://monitoring.googleapis.com/v3/projects/${firebaseConfig.projectId}/timeSeries`;
        const q = endMs => { const p = new URLSearchParams({ filter: `metric.type="${metric}"`, 'interval.startTime': new Date(end - hours * 36e5).toISOString(), 'interval.endTime': new Date(endMs).toISOString(),
            'aggregation.alignmentPeriod': '3600s', 'aggregation.perSeriesAligner': 'ALIGN_SUM', 'aggregation.crossSeriesReducer': 'REDUCE_SUM' });
            if(group) p.append('aggregation.groupByFields', group); return base + '?' + p; };
        let j; try { j = await consApi(q(end)); } catch(e) { if(e.status === 400) j = await consApi(q(Date.now())); else throw e; }
        return (j.timeSeries || []).map(s => ({ name: group ? ((s.resource && s.resource.labels) || {})[group.split('.').pop()] || ((s.metric && s.metric.labels) || {})[group.split('.').pop()] || '?' : '',
            pts: (s.points || []).map(p => ({ t: Date.parse(p.interval.endTime) - 1, v: +(p.value.int64Value || p.value.doubleValue || 0) })) }));
    }
    const consSum = (series, f) => series.reduce((a, s) => a + s.pts.filter(f).reduce((b, p) => b + p.v, 0), 0);
    async function consLoadGoogle() {
        if(!consTok) return; if(consGLoading) return consGLoading;
        consGLoading = (async () => {
            const H = 24 * 8, days = consLastDays(7), out = { at: Date.now(), days, hours: [], kinds: {}, fn: [], plan: null, email: consTok.email };
            const pick = async (a, b) => { const s = await consSeries(a, '', H).catch(() => []); return s.some(x => x.pts.length) ? s : consSeries(b, '', H); };
            const [r, w, x, f1, f2, bill] = await Promise.all([
                pick('firestore.googleapis.com/document/read_ops_count', 'firestore.googleapis.com/document/read_count'),
                pick('firestore.googleapis.com/document/write_ops_count', 'firestore.googleapis.com/document/write_count'),
                pick('firestore.googleapis.com/document/delete_ops_count', 'firestore.googleapis.com/document/delete_count'),
                consSeries('cloudfunctions.googleapis.com/function/execution_count', 'resource.label.function_name', H).catch(() => []),
                consSeries('run.googleapis.com/request_count', 'resource.label.service_name', H).catch(() => []),
                consApi(`https://cloudbilling.googleapis.com/v1/projects/${firebaseConfig.projectId}/billingInfo`).catch(() => null)
            ]);
            Object.entries({ r, w, x }).forEach(([k, s]) => { out.kinds[k] = days.map(d => consSum(s, p => consDay(p.t) === d)); });
            // grafico per ora del giorno di Google in corso
            const today = days[days.length - 1];
            for(let t = Math.ceil(Date.now() / 36e5) * 36e5 - 36e5; consDay(t) === today; t -= 36e5) out.hours.unshift({ t, r: consSum(r, p => p.t >= t && p.t < t + 36e5), w: consSum(w, p => p.t >= t && p.t < t + 36e5) });
            // Functions di 1ª generazione (cloudfunctions) e di 2ª (girano su Cloud Run): stesso nome = stessa funzione
            const fn = {}; [...f1, ...f2].forEach(s => { const k = String(s.name).toLowerCase(); const v = { name: s.name, today: consSum([s], p => consDay(p.t) === today), week: consSum([s], p => days.includes(consDay(p.t))) };
                if(!fn[k] || fn[k].week < v.week) fn[k] = v; });
            out.fn = Object.values(fn).filter(v => v.week).sort((a, b) => b.week - a.week);
            out.fnDays = days.map(d => consSum([...f1, ...f2.filter(s => !f1.some(z => String(z.name).toLowerCase() === String(s.name).toLowerCase()))], p => consDay(p.t) === d));
            out.plan = bill ? (bill.billingEnabled ? 'blaze' : 'spark') : null;
            consG = out; consGErr = '';
        })().catch(e => { consGErr = 'Google non ha dato i dati: ' + ((e && e.message) || e) + (/disabled|has not been used/i.test(String(e && e.message)) ? ' Attiva “Cloud Monitoring API” nel progetto (link nel messaggio) e riprova tra qualche minuto.' : /permission|PERMISSION/i.test(String(e && e.message)) ? ' Accedi con l’account Google proprietario del progetto Firebase.' : ''); })
          .finally(() => { consGLoading = null; consRender(); });
        consRender();
        return consGLoading;
    }
    async function consLoadMine(force) {
        if(!fbReady || (!force && consMine && Date.now() - consMineAt < 60e3)) return;
        consMineAt = Date.now();
        try { await consFlush(); const s = await cfgRef(CONS_DOC).get(); consMine = s.exists ? (s.data() || {}) : {}; } catch(e) { consMine = consMine || {}; }
        // si tengono solo gli ultimi 35 giorni
        const old = Object.keys(consMine.days || {}).filter(d => d < consLastDays(CONS_KEEP_DAYS)[0]);
        if(old.length) { const del = firebase.firestore.FieldValue.delete(), u = {}; old.forEach(d => { u['days.' + d] = del; delete consMine.days[d]; }); cfgRef(CONS_DOC).update(u).catch(() => {}); }
        consRender();
    }
    function consRefresh() { vibrate(); consLoadMine(true); if(consTok) consLoadGoogle(); }

    function consBars(vals, labels, limit, tone) {
        const mx = Math.max(1, limit || 0, ...vals), short = v => v >= 1000 ? (v / 1000).toLocaleString('it-IT', { maximumFractionDigits: v >= 1e4 ? 0 : 1 }) + 'K' : v;
        return `<div class="adm-chart cons-chart">${vals.map((v, i) => `<div class="adm-col" title="${admEsc(labels[i])}: ${consFmt(v)}"><span class="adm-col-v">${v ? short(v) : ''}</span><span class="cons-track">${limit ? `<b class="cons-lim" style="bottom:${limit / mx * 100}%"></b>` : ''}<i class="cons-${tone}${limit && v > limit ? ' over' : ''}" style="height:${v / mx * 100}%"></i></span><small>${admEsc(String(labels[i]).split(' ')[1] || labels[i])}</small></div>`).join('')}</div>${limit ? `<div class="adm-legend"><span><i class="cons-lim-k"></i>quota gratuita al giorno (${consFmt(limit)})</span></div>` : ''}`;
    }
    function consMeter(kind, v) {
        const lim = CONS_LIMITS[kind], pct = v / lim * 100, tone = pct >= 100 ? 'err' : pct >= 70 ? 'warn' : 'ok';
        return `<div class="cons-meter tone-${tone}"><div class="cons-meter-h"><b>${CONS_KIND[kind]} oggi</b><span>${consFmt(v)} <small>/ ${consFmt(lim)}</small></span></div><div class="cons-meter-t"><i style="width:${Math.min(100, pct)}%"></i></div><small>${pct >= 100 ? 'oltre la quota gratuita' + (consG && consG.plan === 'blaze' ? ': il resto si paga (pochi centesimi)' : ': con il piano gratuito Firebase si blocca fino a domani') : Math.round(pct) + '% della quota gratuita di oggi'}</small></div>`;
    }
    function consRender() {
        const box = document.getElementById('adm-consumi'); if(!box || admTab !== 'consumi') return;
        if(!consMine) { box.innerHTML = admLoadingHtml(); consLoadMine(); return; }
        if(consTok && !consG && !consGLoading && !consGErr) consLoadGoogle();
        const days = consLastDays(7), lbl = days.map(consDayLbl), G = consG, M = consMine.days || {};
        const plan = G && G.plan ? (G.plan === 'blaze' ? ['ok', 'verified', 'Piano Blaze attivo', 'Paghi solo quello che supera le quote gratuite.'] : ['warn', 'savings', 'Piano gratuito (Spark)', 'Oltre le quote gratuite Firebase smette di rispondere fino al giorno dopo.']) : null;
        const gToday = k => G ? G.kinds[k][G.kinds[k].length - 1] : 0;
        let google;
        if(!consTok) google = `<div class="adm-card"><h4><span class="material-icons-round">query_stats</span>Numeri ufficiali di Google</h4>
            <p class="cons-p">Per vedere qui gli stessi numeri della console Firebase (letture, scritture, chiamate alle Functions e piano attivo) accedi con l’account Google <b>proprietario del progetto Firebase</b>. Il permesso è solo di lettura, dura un’ora e resta in questo browser.</p>
            ${consGErr ? `<div class="adm-issue sev-warn"><span class="material-icons-round">error_outline</span><div><p>${admEsc(consGErr)}</p></div></div>` : ''}
            <button class="adm-btn primary" onclick="consSignIn()"><span class="material-icons-round">login</span>Accedi con Google</button>
            <small class="adm-muted cons-note">La prima volta Google può avvisare che l’app “non è verificata”: è normale per un’app privata, scegli “Avanzate” e poi “Vai a…”.</small></div>`;
        else if(!G) google = `<div class="adm-card">${consGErr ? `<div class="adm-issue sev-err"><span class="material-icons-round">error</span><div><p>${admEsc(consGErr)}</p></div><button class="adm-btn sm" onclick="consLoadGoogle()">Riprova</button></div>` : admLoadingHtml()}</div>`;
        else google = `${plan ? `<div class="adm-issue sev-${plan[0] === 'ok' ? 'info' : 'warn'}"><span class="material-icons-round">${plan[1]}</span><div><b>${plan[2]}</b><p>${plan[3]}</p></div></div>` : ''}
            <div class="cons-meters">${consMeter('r', gToday('r'))}${consMeter('w', gToday('w'))}${consMeter('x', gToday('x'))}
                <div class="cons-meter tone-info"><div class="cons-meter-h"><b>Chiamate Functions oggi</b><span>${consFmt(G.fnDays[G.fnDays.length - 1])}</span></div><small>${consFmt(G.fnDays.reduce((a, b) => a + b, 0))} negli ultimi 7 giorni</small></div></div>
            <div class="adm-grid2">
                <div class="adm-card"><h4><span class="material-icons-round">menu_book</span>Letture Firestore, ultimi 7 giorni</h4>${consBars(G.kinds.r, lbl, CONS_LIMITS.r, 'r')}</div>
                <div class="adm-card"><h4><span class="material-icons-round">edit_note</span>Scritture Firestore, ultimi 7 giorni</h4>${consBars(G.kinds.w, lbl, CONS_LIMITS.w, 'w')}</div>
            </div>
            <div class="adm-grid2">
                <div class="adm-card"><h4><span class="material-icons-round">schedule</span>Letture di oggi, ora per ora</h4>${G.hours.length ? consBars(G.hours.map(h => h.r), G.hours.map(h => 'ore ' + new Date(h.t).toLocaleTimeString('it-IT', { hour: 'numeric', timeZone: 'Europe/Rome' })), 0, 'r') : '<div class="adm-empty sm">Il giorno è appena iniziato.</div>'}<p class="cons-p" style="margin:10px 0 0">Sotto ogni colonna l’ora italiana in cui inizia.</p></div>
                <div class="adm-card"><h4><span class="material-icons-round">functions</span>Functions, chiamate per funzione</h4>${G.fn.length ? `<div class="adm-table"><div class="adm-tr cons-tr adm-th"><span>Funzione</span><span>Oggi</span><span>7 giorni</span></div>${G.fn.slice(0, 12).map(f => `<div class="adm-tr cons-tr"><b>${admEsc(f.name)}</b><span>${consFmt(f.today)}</span><span>${consFmt(f.week)}</span></div>`).join('')}</div>` : '<div class="adm-empty sm">Nessuna chiamata alle Functions negli ultimi 7 giorni.</div>'}</div>
            </div>
            <small class="adm-muted cons-note">Dati Google delle ${new Date(G.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} per tutto il progetto Firebase (app ufficiale, app di prova, portale e Functions insieme). Google li pubblica con qualche minuto di ritardo. Accesso come ${admEsc(G.email || 'proprietario')} · <a href="#" onclick="consSignOut();return false">esci</a></small>`;
        // contatore interno
        const tot = (d, k) => ((M[d] || {}).tot || {})[k] || 0, srcT = (d, s) => (((M[d] || {}).src || {})[s] || {}).r || 0;
        const today = days[days.length - 1], T = M[today] || {};
        const top = k => Object.entries(T[k] || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const topR = top('r'), topW = top('w').concat(top('x').map(([n, v]) => [n + ' (elimina)', v])).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const bars = (rows, cls) => { const mx = Math.max(1, ...rows.map(x => x[1])); return rows.length ? rows.map(([n, v]) => `<div class="adm-bar"><span class="adm-bar-l" title="${admEsc(n)}">${admEsc(n)}</span><span class="adm-bar-t"><i class="${cls}" style="width:${v / mx * 100}%"></i></span><b>${consFmt(v)}</b></div>`).join('') : '<div class="adm-empty sm">Ancora niente oggi.</div>'; };
        const mine = `<div class="adm-sec-h"><span class="material-icons-round">phone_android</span>Misurato dall’app di prova</div>
            <p class="cons-p">Queste sono solo le operazioni fatte da <b>questa app di prova</b> (telefoni, PC e motore delle notifiche), contate dall’app stessa. Non comprendono l’app ufficiale, il portale Richieste né le Functions, e non sono identiche al conteggio di Google: servono a capire <b>quali dati</b> pesano di più.</p>
            <div class="adm-kpis three">
                ${admKpi('menu_book', consFmt(tot(today, 'r')), 'Letture oggi', srcT(today, 'motore') ? `di cui motore ${consFmt(srcT(today, 'motore'))}` : '', 'info')}
                ${admKpi('edit_note', consFmt(tot(today, 'w')), 'Scritture oggi', tot(today, 'x') ? `più ${consFmt(tot(today, 'x'))} eliminazioni` : '', 'info')}
                ${admKpi('devices', consFmt(CONS_HERE.r), 'Letture da questo dispositivo', `${consFmt(CONS_HERE.w)} scritture da quando hai aperto l’app`, 'muted')}
            </div>
            <div class="adm-grid2">
                <div class="adm-card"><h4><span class="material-icons-round">bar_chart</span>Letture dell’app di prova, 7 giorni</h4>${consBars(days.map(d => tot(d, 'r')), lbl, 0, 'r')}</div>
                <div class="adm-card"><h4><span class="material-icons-round">bar_chart</span>Scritture dell’app di prova, 7 giorni</h4>${consBars(days.map(d => tot(d, 'w') + tot(d, 'x')), lbl, 0, 'w')}</div>
            </div>
            <div class="adm-grid2">
                <div class="adm-card"><h4><span class="material-icons-round">visibility</span>Cosa legge di più, oggi</h4>${bars(topR, 'blue')}</div>
                <div class="adm-card"><h4><span class="material-icons-round">edit</span>Cosa scrive di più, oggi</h4>${bars(topW, 'cons-wbar')}</div>
            </div>`;
        box.innerHTML = `<div class="cons-head"><span class="adm-muted">Il giorno di Google va da mezzanotte della California: le quote gratuite ripartono alle <b>${consResetHour()}</b> ora italiana.</span>
                <button class="adm-btn sm" onclick="consRefresh()"><span class="material-icons-round">refresh</span>Aggiorna</button></div>
            <div class="adm-sec-h"><span class="material-icons-round">query_stats</span>Tutto il progetto Firebase (dati Google)</div>
            ${google}
            ${mine}`;
    }

    // ── Dettaglio singolo accesso ────────────────────────────────────────
    let accessDetailTicker = null;
    function openAccessDetail(docId) {
        const a = adminAccessDocs.find(d => d.id === docId); if(!a) return;
        vibrate();
        const isOnline = a.online && a.lastActive && (Date.now() - tsToMillis(a.lastActive)) < 100000;
        const name = a.identity || 'Non identificato';
        document.getElementById('access-detail-name').innerText = name;
        document.getElementById('access-detail-avatar').innerText = name.substring(0,2).toUpperCase();
        const pill = document.getElementById('access-detail-status-pill');
        pill.innerText = isOnline ? 'Online ora' : 'Offline';
        pill.classList.toggle('online', isOnline);
        document.getElementById('access-detail-device').innerText = a.device || 'Sconosciuto';
        document.getElementById('access-detail-start').innerText = formatLastActive(a.startTime);
        document.getElementById('access-detail-last').innerText = formatLastActive(a.lastActive);
        const startMs = tsToMillis(a.startTime) || Date.now();
        document.getElementById('access-detail-body').dataset.start = startMs;
        renderAccessDetailHistory(a.viewHistory || []);
        let m = document.getElementById('access-detail-modal'); m.style.display = 'flex';
        setTimeout(() => m.classList.add('open'), 10);
        if(!accessDetailTicker) accessDetailTicker = setInterval(refreshAccessDetailDuration, 1000);
        refreshAccessDetailDuration();
    }
    function closeAccessDetail(e) {
        if(e && e.target !== e.currentTarget) return;
        let m = document.getElementById('access-detail-modal'); m.classList.remove('open');
        setTimeout(() => m.style.display = 'none', 250);
        if(accessDetailTicker) { clearInterval(accessDetailTicker); accessDetailTicker = null; }
    }
    function refreshAccessDetailDuration() {
        const body = document.getElementById('access-detail-body'); if(!body) return;
        const start = parseInt(body.dataset.start); if(!start) return;
        const diff = Math.max(0, Date.now() - start);
        const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
        document.getElementById('access-detail-duration').innerText = h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m ${String(s).padStart(2,'0')}s`;
    }
    function renderAccessDetailHistory(history) {
        const c = document.getElementById('access-detail-history'); if(!c) return;
        if(!history || history.length === 0) { c.innerHTML = `<div class="admin-empty"><span class="material-icons-round">visibility_off</span><br>Nessuna cronologia disponibile.</div>`; return; }
        const sorted = history.slice().reverse();
        c.innerHTML = sorted.map(h => `<div class="history-item">
            <span class="material-icons-round" style="font-size:18px;color:var(--primary)">visibility</span>
            <div class="history-item-text"><b>${h.view}</b><span>${new Date(h.time).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span></div>
        </div>`).join('');
    }

    function refreshAdminDurations() {
        document.querySelectorAll('.access-row').forEach(row => {
            const start = parseInt(row.dataset.start); if(!start) return;
            const diff = Math.max(0, Date.now() - start);
            const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
            const txt = h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m ${String(s).padStart(2,'0')}s`;
            const el = row.querySelector('.admin-dur-val'); if(el) el.innerText = txt;
        });
    }

    function populateAdminColorInputs() {
        document.querySelectorAll('#admin-tab-aspetto input[type=color]').forEach(inp => {
            const varName = inp.dataset.var;
            const current = colorOverrides[varName] || getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || DEFAULT_COLORS[varName] || "#000000";
            inp.value = normalizeHexColor(current);
        });
    }
    function normalizeHexColor(c) {
        c = (c || "").trim();
        if(/^#[0-9a-fA-F]{6}$/.test(c)) return c;
        if(/^#[0-9a-fA-F]{8}$/.test(c)) return c.substring(0,7);
        if(/^#[0-9a-fA-F]{3}$/.test(c)) return "#" + [...c.slice(1)].map(ch => ch+ch).join('');
        return "#000000";
    }
    function saveAdminColors() {
        vibrate();
        const newColors = {};
        document.querySelectorAll('#admin-tab-aspetto input[type=color]').forEach(inp => { newColors[inp.dataset.var] = inp.value; });
        colorOverrides = newColors;
        applyColorOverrides();
        if(fbReady) {
            cfgRef('settings').set({ colors: newColors }, { merge:true })
                .then(() => showAdminToast("Colori salvati e sincronizzati"))
                .catch(e => { console.error(e); showAdminToast("Errore salvataggio"); });
        } else showAdminToast("Colori applicati (offline)");
    }
    function resetAdminColors() {
        vibrate();
        Object.entries(DEFAULT_COLORS).forEach(([k,v]) => document.documentElement.style.setProperty(k, v));
        populateAdminColorInputs();
        colorOverrides = {};
        if(fbReady) cfgRef('settings').set({ colors: {} }, { merge:true }).catch(()=>{});
        showAdminToast("Colori predefiniti ripristinati");
    }

    function populateAdminOperatorInputs() {
        const c = document.getElementById('admin-operators-list'); if(!c) return;
        if(!drivers || drivers.length === 0) { c.innerHTML = `<div class="admin-empty"><span class="material-icons-round">people_outline</span><br>Nessun operatore caricato.<br><span style="font-size:0.7rem">Attendi il caricamento del file turni.</span></div>`; return; }
        c.innerHTML = drivers.filter(d => !d.test).map(d => {
            const orig = d.originalName || d.name;
            const val = nameOverrides[orig] || "";
            return `<div class="admin-field-row"><label>${orig}</label><input type="text" data-orig="${orig.replace(/"/g,'&quot;')}" placeholder="${orig}" value="${val.replace(/"/g,'&quot;')}"></div>`;
        }).join('');
    }
    function saveAdminOperators() {
        vibrate();
        const newOverrides = {};
        document.querySelectorAll('#admin-operators-list input[type=text]').forEach(inp => {
            const orig = inp.dataset.orig; const val = inp.value.trim();
            if(val && val !== orig) newOverrides[orig] = val;
        });
        nameOverrides = newOverrides;
        applyNameOverrides();
        if(fbReady) {
            cfgRef('settings').set({ nameOverrides: newOverrides }, { merge:true })
                .then(() => showAdminToast("Nomi salvati e sincronizzati"))
                .catch(e => { console.error(e); showAdminToast("Errore salvataggio"); });
        } else showAdminToast("Nomi applicati (offline)");
    }

    function populateAdminScheduleInputs() {
        Object.keys(DEFAULT_SCHEDULE).forEach(k => { const el = document.getElementById('sch-'+k); if(el) el.value = SCHEDULE[k] || ""; });
        Object.keys(DEFAULT_SCHEDULE_DIURNI).forEach(k => { const el = document.getElementById('sch-'+k); if(el) el.value = SCHEDULE_DIURNI[k] || ""; });
    }
    function saveAdminSchedule() {
        vibrate();
        const newSched = {}, newSchedD = {};
        Object.keys(DEFAULT_SCHEDULE).forEach(k => { const el = document.getElementById('sch-'+k); if(el) newSched[k] = el.value; });
        Object.keys(DEFAULT_SCHEDULE_DIURNI).forEach(k => { const el = document.getElementById('sch-'+k); if(el) newSchedD[k] = el.value; });
        scheduleOverride = { SCHEDULE: newSched, SCHEDULE_DIURNI: newSchedD };
        applyScheduleOverride();
        if(fbReady) {
            cfgRef('settings').set({ scheduleOverride }, { merge:true })
                .then(() => showAdminToast("Orari salvati e sincronizzati"))
                .catch(e => { console.error(e); showAdminToast("Errore salvataggio"); });
        } else showAdminToast("Orari applicati (offline)");
    }

    // ── Testi: avviso iniziale + avvisi aggiuntivi ──────────────────────────
    function populateAdminTextsInputs() {
        document.getElementById('welcome-active-toggle').checked = welcomeConfig.active !== false;
        document.getElementById('admin-welcome-title').value = welcomeConfig.title || "";
        document.getElementById('admin-welcome-text').value = welcomeConfig.text || "";
        document.getElementById('admin-welcome-duration').value = welcomeConfig.duration || 3;
        renderAdminAnnouncementsList();
    }
    function saveAdminWelcome() {
        vibrate();
        let duration = parseInt(document.getElementById('admin-welcome-duration').value);
        if(isNaN(duration) || duration < 1) duration = 3;
        if(duration > 30) duration = 30;
        welcomeConfig = {
            active: document.getElementById('welcome-active-toggle').checked,
            title: document.getElementById('admin-welcome-title').value.trim() || "ATTENZIONE",
            text: document.getElementById('admin-welcome-text').value,
            duration: duration
        };
        if(fbReady) {
            cfgRef('settings').set({ welcome: welcomeConfig }, { merge:true })
                .then(() => showAdminToast("Avviso salvato e sincronizzato"))
                .catch(e => { console.error(e); showAdminToast("Errore salvataggio"); });
        } else showAdminToast("Avviso applicato (offline)");
    }

    let adminAnnouncementsDraft = null;
    function renderAdminAnnouncementsList() {
        if(adminAnnouncementsDraft === null) adminAnnouncementsDraft = JSON.parse(JSON.stringify(customAnnouncements || []));
        const c = document.getElementById('admin-announce-list'); if(!c) return;
        if(adminAnnouncementsDraft.length === 0) { c.innerHTML = `<div class="admin-empty" style="padding:20px;"><span class="material-icons-round">notifications_none</span><br>Nessun avviso aggiuntivo.</div>`; return; }
        const icons = ["campaign","info","celebration","build","warning","event","update","favorite"];
        c.innerHTML = adminAnnouncementsDraft.map((a, i) => `
            <div class="announce-card">
                <div class="announce-card-head">
                    <select onchange="updateAnnouncementField(${i},'icon',this.value)">
                        ${icons.map(ic => `<option value="${ic}" ${a.icon===ic?'selected':''}>${ic}</option>`).join('')}
                    </select>
                    <input type="text" value="${(a.title||'').replace(/"/g,'&quot;')}" placeholder="Titolo avviso" oninput="updateAnnouncementField(${i},'title',this.value)">
                    <button class="announce-remove-btn" onclick="removeAdminAnnouncement(${i})"><span class="material-icons-round" style="font-size:18px">delete</span></button>
                </div>
                <textarea class="admin-textarea" style="min-height:70px;" placeholder="Testo avviso..." oninput="updateAnnouncementField(${i},'text',this.value)">${a.text||''}</textarea>
                <label class="announce-toggle-inline">
                    <input type="checkbox" ${a.active!==false?'checked':''} onchange="updateAnnouncementField(${i},'active',this.checked)"> Avviso attivo
                </label>
            </div>
        `).join('');
    }
    function updateAnnouncementField(idx, field, value) {
        if(!adminAnnouncementsDraft[idx]) return;
        adminAnnouncementsDraft[idx][field] = value;
    }
    function addAdminAnnouncement() {
        vibrate();
        if(adminAnnouncementsDraft === null) adminAnnouncementsDraft = JSON.parse(JSON.stringify(customAnnouncements || []));
        adminAnnouncementsDraft.push({ id: 'ann_' + Date.now(), icon:'campaign', title:'', text:'', active:true });
        renderAdminAnnouncementsList();
    }
    function removeAdminAnnouncement(idx) {
        vibrate();
        adminAnnouncementsDraft.splice(idx, 1);
        renderAdminAnnouncementsList();
    }
    function saveAdminAnnouncements() {
        vibrate();
        customAnnouncements = (adminAnnouncementsDraft || []).filter(a => (a.title && a.title.trim()) || (a.text && a.text.trim()));
        if(fbReady) {
            cfgRef('settings').set({ announcements: customAnnouncements }, { merge:true })
                .then(() => showAdminToast("Avvisi salvati e sincronizzati"))
                .catch(e => { console.error(e); showAdminToast("Errore salvataggio"); });
        } else showAdminToast("Avvisi applicati (offline)");
    }

    // ── Messaggi di avvio (avviso principale + coda avvisi aggiuntivi) ──────
    function applyWelcomeConfig() {
        document.getElementById('welcome-title-text').innerText = welcomeConfig.title || "ATTENZIONE";
        document.getElementById('welcome-body-text').innerHTML = (welcomeConfig.text || "").replace(/\n/g,'<br>');
    }
    function showStartupMessages() {
        applyWelcomeConfig();
        announcementQueue = (customAnnouncements || []).filter(a => a.active !== false).concat(cmStartupItems()).concat(pnRepStartupItems());   // + messaggi del coordinatore, reperibili in permesso notte
        // avviso iniziale "ATTENZIONE… turni cartacei" tolto su richiesta di Mat (27/11/2026): restano gli avvisi aggiuntivi
        if(true || welcomeConfig.active === false) { showNextAnnouncement(); return; }
        const durationSec = welcomeConfig.duration && welcomeConfig.duration > 0 ? welcomeConfig.duration : 3;
        let wm = document.getElementById('welcome-modal');
        const bar = document.getElementById('welcome-progress-bar');
        bar.classList.remove('counting'); void bar.offsetWidth;
        bar.style.animationDuration = durationSec + 's';
        wm.style.display = 'flex';
        setTimeout(() => { wm.classList.add('open'); bar.classList.add('counting'); }, 50);
        setTimeout(closeWelcomeModal, (durationSec * 1000) + 50);
    }
    function showNextAnnouncement() {
        if(!announcementQueue || announcementQueue.length === 0) return;
        const item = announcementQueue.shift();
        document.getElementById('announce-title-text').innerText = item.title || "AVVISO";
        document.getElementById('announce-body-text').innerHTML = (item.text || "").replace(/\n/g,'<br>');
        document.getElementById('announce-icon-el').innerText = item.icon || "campaign";
        let m = document.getElementById('custom-announce-modal');
        // messaggio a tempo (dall'Area Coordinatore): barra che si accorcia e chiusura da sola
        let bar = document.getElementById('announce-progress');
        if(!bar) { bar = document.createElement('div'); bar.id = 'announce-progress'; bar.innerHTML = '<i></i>'; m.querySelector('.alert-body').after(bar); }
        clearTimeout(announceTimer);
        const secs = +item.secs || 0, i = bar.querySelector('i');
        bar.style.display = secs ? '' : 'none'; i.style.transition = 'none'; i.style.width = '100%';
        if(secs) { requestAnimationFrame(() => requestAnimationFrame(() => { i.style.transition = `width ${secs}s linear`; i.style.width = '0%'; })); announceTimer = setTimeout(() => { if(m.classList.contains('open')) closeAnnounceModal(); }, secs * 1000 + 80); }
        m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 30);
    }
    let announceTimer = null;
    function closeAnnounceModal() {
        clearTimeout(announceTimer);
        vibrate();
        let m = document.getElementById('custom-announce-modal');
        m.classList.remove('open');
        setTimeout(() => { m.style.display = 'none'; showNextAnnouncement(); }, 300);
    }

    // ── Esportazione file HTML con le personalizzazioni incorporate ────────
    function bakeMarkerConst(src, marker, varName, value) {
        const json = JSON.stringify(value);
        const re = new RegExp('const ' + varName + ' = .*?; // ' + marker);
        if(re.test(src)) return src.replace(re, 'const ' + varName + ' = ' + json + '; // ' + marker);
        console.warn('Marker non trovato nel sorgente:', marker);
        return src;
    }
    async function exportUpdatedHTML() {
        vibrate();
        showAdminToast("Preparazione file in corso...");
        try {
            // le impostazioni incorporate stanno in js/01-avvio.js (l'app è divisa in più file)
            const res = await fetch(new URL('js/01-avvio.js?export=' + Date.now(), location.href), { cache:'no-store' });
            if(!res.ok) throw new Error('Impossibile leggere il file corrente (' + res.status + ')');
            let src = await res.text();
            src = bakeMarkerConst(src, '__ADMIN_DEFAULT_COLORS__', 'DEFAULT_COLORS_BAKED', colorOverrides);
            src = bakeMarkerConst(src, '__ADMIN_DEFAULT_NAMES__', 'DEFAULT_NAME_OVERRIDES_BAKED', nameOverrides);
            src = bakeMarkerConst(src, '__ADMIN_DEFAULT_SCHEDULE__', 'DEFAULT_SCHEDULE_OVERRIDE_BAKED', scheduleOverride);
            src = bakeMarkerConst(src, '__ADMIN_DEFAULT_WELCOME__', 'DEFAULT_WELCOME_BAKED', welcomeConfig);
            src = bakeMarkerConst(src, '__ADMIN_DEFAULT_ANNOUNCEMENTS__', 'DEFAULT_ANNOUNCEMENTS_BAKED', customAnnouncements);

            const blob = new Blob([src], { type:'text/javascript;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = '01-avvio.js';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            showAdminToast("File scaricato: caricalo su GitHub nella cartella js/");
        } catch(e) {
            console.error(e);
            showAdminToast("Errore durante l'esportazione del file");
        }
    }

    const audioGraziella = new Audio(); audioGraziella.preload = 'none'; audioGraziella.src = 'cane.mp3';   // si scarica solo quando serve
    function playGraziella() {
        if(navigator.vibrate) navigator.vibrate(10);
        audioGraziella.currentTime = 0;
        let p = audioGraziella.play();
        if(p !== undefined) p.catch(e => {});
        let m = document.getElementById('graziella-modal');
        m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10);
    }
    function closeGraziellaModal() {
        let m = document.getElementById('graziella-modal');
        m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 300);
    }

    let finalData = [], drivers = [], selectedDrivers = new Set(),
        watchedDrivers = new Set(), notifHistory = [], deferredPrompt,
        globalMonthsList = [], dinnerSelectedMonth = "", eventType = "cena",
        currentNotifTab = "attive";

    // ── Conteggio Orario / Area Coordinatore: stato globale ──────────────────
    const COORD_PW_H = ['ecb111b62599ec5b2b9077f52493656ba27ca9f8d59c99fbda8753632ac73dba', '4402503b9ecdaa8a6a505ff84dab56a22e076cb373f9106cb2458d6e3c18569a', '891b6e0c4ece0366a19496170fe1d5945195deff862cbccc058dcea350963bb2'];   // area coordinatore: vale anche la password della scelta COORDINATORE
    let rawFinalData = [];                 // dati "puri" letti dall'ultimo Excel caricato
    let manualOverrides = {};              // chiave "NOME__MESE-giorno" -> {v,subV,customMinutes}
    let excelSyncedMarks = {};             // key -> valore (JSON) già segnato come riportato su Excel
    let coordEditModeActive = false;
    let coordEditBaseline = {};            // stato manualOverrides all'apertura della modalità modifica
    let coordUndoStack = [], coordRedoStack = [];
    let coordDragSource = null;            // {driverIdx, rowIdx} cella presa col drag
    let coordSelectedCell = null;          // {row,col} cella attualmente selezionata (per Canc)
    let coordColumnCellsCache = {};        // row -> elemento td, per il trascinamento verticale
    let coordLastFillRange = null;         // {lo,hi} ultimo intervallo evidenziato durante il fill
    let coordEditPopupTarget = null;       // {driverIdx, rowIdx} cella target del popup di modifica
    let hoursSelectedDriver = null, hoursPeriod = "settimana";
    let aiAdviceEnabled = (localStorage.getItem('ai_advice_enabled') === '1');
    let hoursWeekAnchor = new Date(2026, new Date().getMonth(), new Date().getDate());   // riallineata a SHIFT_YEAR all'avvio
    let hoursSelectedMonthIdx = new Date().getMonth();
    let hoursChartInstance = null;
    let SHIFT_YEAR = 2026;
    function setShiftYear(y) {
        SHIFT_YEAR = y; HOLIDAYS = holidaysFor(y);
        const sub = document.querySelector('.app-subtitle-text'); if(sub) sub.textContent = 'Calendario ' + y;
        document.title = 'AUTISTI ' + y;
    }
    const SPECIAL_SUBCODES = {
        v:  "FERIE RESIDUE", r: "RECUPERO", f: "CONGEDO ORDINARIO (C.O.)", m: "MALATTIA",
        p:  "PERMESSO", c: "PERMESSO STUDIO", pn: "PERMESSO NOTTE", ng: "FESTIVO NON GODUTO",
        nl: "FESTIVO NON LAVORATO", z: "SOSTITUZIONE COORD.", gr: "GRAVIDANZA",
        e: "ASPETTATIVA", l: "PERMESSO LUTTO", s: "PERMESSO SPORTIVO", a: "PERMESSO MATRIMONIO", k: "DISTACCO SPECIALE",
        pl: "PERMESSO LEGGE", ps: "PERMESSO SINDACALE"
    };
    // Altri codici della legenda del file Excel (riga sotto il turno): K distacco speciale,
    // S permesso sportivo, L permesso lutto, A permesso matrimonio.
    const EXTRA_SUB_INF = { k: "DISTACCO SPECIALE", s: "PERMESSO SPORTIVO", l: "PERMESSO LUTTO", a: "PERMESSO MATRIMONIO" };
    const EXTRA_INF_KEYS = Object.keys(EXTRA_SUB_INF);
    Object.assign(SPECIAL_SUBCODES, EXTRA_SUB_INF);
    const STANDARD_CODES = ["M","P","N","SM","R"];
    const DIURNI_CODES = ["m","p","r"];
    // Colori riusati dalle stesse variabili CSS del calendario, per coerenza visiva
    const MAIN_CODE_COLORS = { M:{bg:'--c-M',fg:'--t-M'}, P:{bg:'--c-P',fg:'--t-P'}, N:{bg:'--c-N',fg:'--t-N'}, SM:{bg:'--c-SM',fg:'--t-SM'}, R:{bg:'--c-R',fg:'--t-R'} };
    const DIURNI_CODE_COLORS = { m:{bg:'--c-dM',fg:'--t-dM'}, p:{bg:'--c-dP',fg:'--t-dP'}, r:{bg:'--c-dR',fg:'--t-dR'} };
    const SUB_CODE_COLORS = {
        v:{bg:'--bg-ferie',fg:'--t-ferie'}, r:{bg:'--bg-rec',fg:'--t-rec'}, f:{bg:'--bg-cong',fg:'--t-cong'},
        m:{bg:'--bg-mal',fg:'--t-mal'}, p:{bg:'--bg-perm',fg:'--t-perm'}, c:{bg:'--bg-stu',fg:'--t-stu'},
        pn:{bg:'--bg-pn',fg:'--t-pn'}, ng:{bg:'--bg-ng',fg:'--t-ng'}, nl:{bg:'--bg-nl',fg:'--t-nl'}, z:{bg:'--bg-coord',fg:'--t-coord'},
        e:{bg:'--bg-stu',fg:'--t-stu'}, l:{bg:'--bg-stu',fg:'--t-stu'}, s:{bg:'--bg-stu',fg:'--t-stu'}, a:{bg:'--bg-stu',fg:'--t-stu'}, k:{bg:'--bg-coord',fg:'--t-coord'},
        pl:{bg:'--bg-pl',fg:'--t-pl'}, ps:{bg:'--bg-ps',fg:'--t-ps'}
    };
    Object.assign(SUB_CODE_COLORS, { k:{bg:'--bg-ds',fg:'--t-ds'}, s:{bg:'--bg-sport',fg:'--t-sport'}, l:{bg:'--bg-lutto',fg:'--t-lutto'}, a:{bg:'--bg-matr',fg:'--t-matr'} });
    let coordPaintTool = null;             // {v,subV} oppure {clear:true}: pennello attualmente selezionato
    let coordPainting = false;             // true mentre l'utente sta trascinando per dipingere
    let coordPaintBatchEntries = [];       // modifiche accumulate durante il gesto di pittura corrente
    let coordPaintTouchedKeys = new Set(); // celle già toccate nel gesto corrente (evita doppie voci di undo)

    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });

    function installPWA() {
        if(deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then(() => { deferredPrompt = null; }); }
        else { const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; if(isIOS) alert("Su iPhone: tocca 'Condividi' e 'Aggiungi alla schermata Home'."); else alert("Usa il menu del browser per installare l'app."); }
    }

