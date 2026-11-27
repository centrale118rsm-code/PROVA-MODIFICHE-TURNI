    // ═══ CALENDARIO FERIE DESIDERATE ═════════════════════════════════════
    // Un calendario come quello dei turni ma vuoto: ognuno scrive le ferie e i permessi
    // che vorrebbe, solo nella propria colonna (riconosciuta da "Chi sei?").
    // Autisti: dati a parte dentro admin_config (le regole Firebase autisti lo permettono già
    // per i documenti "prova_…"): un documento per persona e per anno ("prova_des_2027_ROSSI"), con days = { "MM-GG": "F" | "P" }. I turni veri
    // non si toccano mai. Regola: in un periodo di ferie di fila, ogni quinto giorno è un
    // riposo e non scala le ferie (si calcola al volo, non si salva).
    const DES_COLL = 'admin_config';
    const DES_KINDS = {
        F: { label:'Ferie', cls:'spec-cong', bg:'var(--bg-cong)', fg:'var(--t-cong)', icon:'beach_access' },
        P: { label:'Permesso', cls:'spec-perm', bg:'var(--bg-perm)', fg:'var(--t-perm)', icon:'event_available' },
        X: { label:'Cancella', cls:'', bg:'#e2e8f0', fg:'#334155', icon:'backspace' },   // ink_eraser non c'è nel font Material Icons Round: compariva un rettangolo vuoto
        N: { label:'Nota', cls:'', bg:'#7c3aed', fg:'#fff', icon:'edit_note' },
        B: { label:'Barra', cls:'', bg:'#111827', fg:'#fff', icon:'strikethrough_s' },
        I: { label:'Importa', cls:'', bg:'#0f766e', fg:'#fff', icon:'move_down' }
    };
    let desAdmin = false, desOk = {}, desDirtySet = new Set(), desDocNames = {};
    let desNotes = {}, desNoteKey = null, desNoteRO = false, desPaint = null, desNoClickUntil = 0;
    function desNotesOf(d) { return (d && desNotes[desDKey(d)]) || {}; }
    let desYear = null, desData = {}, desUnsub = null, desTool = 'F', desRangeKind = 'F', desYgWho = null;
    let desMode = (() => { try { const m = localStorage.getItem('autisti_des_mode'); return m === 'anno' || m === 'tutti' ? m : 'cols'; } catch(e) { return 'cols'; } })();
    const DES_MODES = { cols:['view_column', 'Colonne', 'Caselle grandi come il calendario turni'], tutti:['view_comfy', 'Tutti', 'Tutti gli autisti in una schermata'], anno:['calendar_view_month', 'Anno intero', 'I 12 mesi di una persona'] };
    let desSaveTimer = null, desSaveState = 'ok', desDirty = false, desIdOk = false, desPendingOpen = false, desToastT = null;
    function desDefaultYear() { const t = new Date(); return t.getMonth() >= 8 ? t.getFullYear() + 1 : t.getFullYear(); }
    function desYearsAllowed() { const y = new Date().getFullYear(); return [y, y + 1]; }
    function desKeyName(n) { return String(n || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'X'; }
    function desDocId(name, y) { return DATA_NS + 'des_' + y + '_' + desKeyName(name); }
    // tutti i documenti delle desiderate di un anno (stesso inizio del nome: "prova_des_2027_")
    function desYearQuery(coll, pre) { const FP = firebase.firestore.FieldPath.documentId(); return db.collection(coll).where(FP, '>=', pre).where(FP, '<', pre + '\uf8ff'); }
    // dal PC Pronto Soccorso "io" è la persona a nome di cui si opera (scelta all'apertura)
    function desMe() { return desIsPS() ? desDriverOf(desPSOperator()) : prefMe(); }
    function desMyName() { return userIdentity && userIdentity !== 'Ospite' ? userIdentity : null; }
    // PC Pronto Soccorso: all'apertura chiede "Opero a nome di?" e scrive nella colonna di quella persona
    function desIsPS() { return userIdentity === PS_NAME; }
    function desAll() { return desAdmin; }
    function desDKey(d) { return desKeyName(d.originalName || d.name); }
    function desDaysOf(d) { return (d && desData[desDKey(d)]) || {}; }
    function desDriverOf(name) { const u = String(name || '').toUpperCase(); return drivers.find(d => d.name.toUpperCase() === u || String(d.originalName || '').toUpperCase() === u) || null; }
    function desLocalKey(y) { return 'autisti_desiderate_' + DATA_NS + y; }
    function desToast(msg) {
        const t = document.getElementById('des-toast'); if(!t) return;
        t.textContent = msg; t.classList.add('show');
        clearTimeout(desToastT); desToastT = setTimeout(() => t.classList.remove('show'), 2400);
    }
    // giorni dell'anno in ordine, con chiave "MM-GG"
    function desYearDays(y) {
        const out = [], d = new Date(y, 0, 1);
        while(d.getFullYear() === y) { out.push({ date: new Date(d), key: String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }); d.setDate(d.getDate() + 1); }
        return out;
    }
    // Ferie di fila: ogni 5° giorno di ferie diventa riposo. Un giorno vuoto chiude il periodo;
    // un permesso scelto a mano non chiude il periodo e non si conta fra le ferie.
    function desResolve(days, y) {
        const out = {}; let run = 0;
        desYearDays(y).forEach(({ key }) => {
            const v = days[key];
            if(v === 'F') { run++; out[key] = run % 5 === 0 ? { t:'R', auto:true, n:run } : { t:'F' }; }
            else if(v === 'P') out[key] = { t:'P' };
            else run = 0;
        });
        return out;
    }
    function desCount(days, y) {
        const r = desResolve(days, y); let f = 0, p = 0, auto = 0;
        Object.values(r).forEach(x => { if(x.t === 'F') f++; else if(x.t === 'R') auto++; else p++; });
        return { f, p, auto };
    }
    function desCellHtml(info, mine, note, ok) {
        let h = desCellHtml0(info, mine);
        if(ok && info) h = h.replace('<div class="cell', '<div class="cell des-okc').replace(/<\/div>$/, '<span class="des-okt" title="Già inserito nei turni">✓</span></div>');
        return note ? h.replace('<div class="cell', '<div title="' + esc(note) + '" class="cell').replace(/<\/div>$/, '<span class="des-dot"></span></div>') : h;
    }
    function desCellHtml0(info, mine) {
        if(!info) return mine ? '<div class="cell empty des-mine">+</div>' : '<div class="cell empty">-</div>';
        const box = t => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">${t}</div>`;
        if(info.t === 'F') return `<div class="cell spec-cong">${box('FERIE')}</div>`;
        if(info.t === 'R') return `<div class="cell t-R" title="Quinto giorno di ferie di fila: è un riposo, non scala le ferie">${box(`RIPOSO<span class="des-auto">${info.n}° giorno ferie</span>`)}</div>`;
        return `<div class="cell spec-perm">${box('PERMESSO')}</div>`;
    }
    function desCols() {
        const me = desMe();
        const list = drivers.filter(d => !d.hidden);
        return me ? [me].concat(list.filter(d => d !== me)) : list;   // la propria colonna c'è sempre, anche se nei turni è nascosta
    }

    function openDesiderate() {
        closeMenu(); vibrate();
        if(!desYear || !desYearsAllowed().includes(desYear)) desYear = desDefaultYear();
        const v = document.getElementById('des-view');
        v.classList.add('open'); document.body.classList.add('des-open');
        desTool = desTool || 'F';
        desMode = 'tutti';   // si apre sempre con tutti gli operatori in vista
        desRenderAll(true);
        desListen();
        setTimeout(() => { if(desMode === 'tutti') { const t = document.getElementById('da-today'), sc = document.getElementById('des-scroll'); if(t && sc) sc.scrollTop = Math.max(0, t.offsetTop - 122); } desGuideFirst(); }, 60);
        setCurrentView('Ferie desiderate');
        if(desIsPS()) { desPSOp = null; desRenderAll(true); setTimeout(() => desPSPick(), 250); }
        else if(!desMe()) {
            // non si sa ancora chi è: si chiede, poi si scrive solo nella sua colonna
            desPendingOpen = true;
            setTimeout(() => { desToast('Scegli chi sei: scriverai solo nella tua colonna'); openIdentityModal(); }, 250);
        }
    }
    function closeDesiderate() {
        const v = document.getElementById('des-view'); if(!v) return;
        if(desTour) desTourEnd();
        if(desDirty) desSaveNow();
        v.classList.remove('open'); document.body.classList.remove('des-open');
        document.getElementById('des-wheel').classList.add('collapsed');
        if(desUnsub) { try { desUnsub(); } catch(e) {} desUnsub = null; }
        desPendingOpen = false; desAdmin = false; if(desTool === 'B' || desTool === 'I') desTool = 'F';
    }
    // dopo "Chi sei?" scelto mentre il calendario delle desiderate è aperto
    function desAfterIdentity() {
        desPendingOpen = false; desIdOk = false;
        const v = document.getElementById('des-view');
        if(!desIsPS()) desPSOp = null;
        if(v && v.classList.contains('open')) { desRenderAll(false); if(desIsPS()) { if(!desPSOperator()) setTimeout(() => desPSPick(), 250); } else if(desMe()) desToast('Ora scrivi nella colonna di ' + desMe().name); }
    }
    function desChangeYear(dir) {
        const ys = desYearsAllowed(), ny = desYear + dir;
        if(!ys.includes(ny)) return;
        if(desDirty) desSaveNow();
        desYear = ny; desData = {}; desNotes = {}; desOk = {}; desDirtySet.clear(); vibrate();
        desRenderAll(true); desListen();
    }
    function desListen() {
        if(desUnsub) { try { desUnsub(); } catch(e) {} desUnsub = null; }
        const y = desYear;
        // copia sul telefono: si vede subito, anche senza rete
        try { const loc = JSON.parse(localStorage.getItem(desLocalKey(y)) || 'null'); const ld = loc && loc.days && desDriverOf(loc.name); if(ld) { desData[desDKey(ld)] = loc.days; desNotes[desDKey(ld)] = loc.notes || {}; if(loc.unsaved) desDirty = true; desRefreshCols(); } } catch(e) {}
        if(!fbReady) { desSaveState = 'offline'; desRenderSum(); return; }
        desUnsub = desYearQuery(DES_COLL, DATA_NS + 'des_' + y + '_').onSnapshot(snap => {
            if(y !== desYear) return;
            const me = desMe(), myKey = me ? desDKey(me) : null;
            const seen = {};
            snap.forEach(doc => {
                const x = doc.data(); if(!x || x.ns !== DATA_NS || x.year !== y || !x.name) return;
                const dd = desDriverOf(x.name); if(!dd) return;
                const k = desDKey(dd); seen[k] = true;
                desDocNames[k] = x.name;
                if(desDirtySet.has(k) || doc.metadata.hasPendingWrites) return;   // modifiche non ancora salvate: restano le nostre
                desData[k] = x.days || {}; desNotes[k] = x.notes || {}; desOk[k] = x.ok || {};
            });
            Object.keys(desData).forEach(k => { if(!seen[k] && k !== myKey) delete desData[k]; });
            Object.keys(desNotes).forEach(k => { if(!seen[k] && k !== myKey) delete desNotes[k]; });
            Object.keys(desOk).forEach(k => { if(!seen[k] && !desDirtySet.has(k)) delete desOk[k]; });
            desRefreshCols();
        }, err => { console.warn('Desiderate non lette:', err); desSaveState = 'err'; desRenderSum(); });
    }
    function desRenderAll(scroll) {
        const y = desYear, ys = desYearsAllowed();
        document.getElementById('des-y-lbl').textContent = y;
        document.getElementById('des-y-prev').disabled = !ys.includes(y - 1);
        document.getElementById('des-y-next').disabled = !ys.includes(y + 1);
        const me = desMe(), cols = desCols();
        document.getElementById('des-view').classList.toggle('des-admin', desAdmin);
        document.getElementById('des-view').classList.toggle('des-ps', !desAdmin && desIsPS());
        document.getElementById('des-sub').innerHTML = desAdmin ? `<b class="des-adm-tag">ADMIN</b> modifichi tutti · <button onclick="desAdminExit()">esci</button>` : desIsPS() ? desPSSubHtml() : me ? `Tu: <b>${esc(me.name)}</b> · <button onclick="requestChangeIdentityDirect()">cambia</button>` : '<button onclick="requestChangeIdentityDirect()">Scegli chi sei</button> per scrivere le tue';
        document.getElementById('des-range-btn').style.display = me || desAll() ? '' : 'none';
        // intestazione
        const head = document.getElementById('des-head');
        head.innerHTML = '<th>DATA</th>' + cols.map(d => `<th data-col="${d.idx}"${d === me ? ' class="me-col"' : ''}>${esc(d.name)}${d === me ? '<span class="des-th-tag">TU</span>' : ''}</th>`).join('');
        // giorni
        const H = holidaysFor(y), today = new Date(); let html = '', lastM = -1, row = 0;
        const res = new Map(cols.map(d => [d.idx, desResolve(desDaysOf(d), y)]));
        desYearDays(y).forEach(({ date, key }) => {
            const m = date.getMonth(), dn = date.getDate(), wd = date.getDay();
            if(m !== lastM) {
                lastM = m;
                html += `<tr class="month-header" id="des-m-${m}"><td colspan="${cols.length + 1}"><div class="sticky-month-text"><span class="month-label">${Object.keys(MONTH_MAP)[m]}${y !== SHIFT_YEAR ? ' ' + y : ''}</span></div></td></tr>`;
            }
            row++;
            const hol = H[m + '-' + dn], red = wd === 0 || wd === 6 || hol;
            const isToday = date.getFullYear() === today.getFullYear() && m === today.getMonth() && dn === today.getDate();
            html += `<tr data-row="${row}" data-key="${key}"${isToday ? ' class="today" id="des-today"' : ''}><td class="td-date${red ? ' date-red' : ''}">${dn}<small>${RT_WEEKDAY_FMT.format(date).toUpperCase()}</small>${hol ? `<div class="holiday-name">${hol}</div>` : ''}</td>`;
            cols.forEach(d => {
                const mine = d === me;
                html += `<td data-col="${d.idx}"${mine ? ' class="me-col"' : ''} onclick="desCellTap('${key}',${d.idx})">${desCellHtml(res.get(d.idx)[key], desCanEdit(d), desNotesOf(d)[key], desOkOf(d)[key])}</td>`;
            });
            html += '</tr>';
        });
        document.getElementById('des-body').innerHTML = desMode === 'cols' ? html : '';   // nelle altre viste non serve disegnarlo
        desRenderSum(); desRenderWheel(); desApplyMode();
        if(scroll) {
            const sc = document.getElementById('des-scroll');
            requestAnimationFrame(() => {
                const t = document.getElementById('des-today');
                if(t) { const th = document.querySelector('#des-table thead th'); sc.scrollTop = Math.max(0, t.offsetTop - (th ? th.offsetHeight : 40) - 46); }
                else sc.scrollTop = 0;
            });
        }
    }
    // aggiorna solo le caselle cambiate (le colonne di chi ha modificato)
    function desRefreshCols(onlyIdx, flashKeys) {
        const v = document.getElementById('des-view'); if(!v || !v.classList.contains('open')) return;
        const y = desYear, me = desMe();
        desCols().forEach(d => {
            if(onlyIdx != null && d.idx !== onlyIdx) return;
            const res = desResolve(desDaysOf(d), y), mine = desCanEdit(d), notes = desNotesOf(d), oks = desOkOf(d);
            document.querySelectorAll(`#des-body td[data-col="${d.idx}"]`).forEach(td => {
                const key = td.parentNode.dataset.key, html = desCellHtml(res[key], mine, notes[key], oks[key]);
                if(td._h !== html) { td.innerHTML = html; td._h = html; if(flashKeys && flashKeys.has(key)) { td.classList.remove('des-flash'); void td.offsetWidth; td.classList.add('des-flash'); } }
            });
        });
        desRenderSum();
        if(desMode === 'anno') desRenderYearGrid();
        if(desMode === 'tutti') desFillCompact();
    }
    // ── vista "Anno intero": i 12 mesi a griglia in una pagina ──
    function desApplyMode() {
        const v = document.getElementById('des-view');
        v.classList.toggle('des-anno', desMode === 'anno'); v.classList.toggle('des-tutti', desMode === 'tutti');
        document.querySelectorAll('#des-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === desMode));
        desRenderAdmBar();
        if(desMode === 'anno') desRenderYearGrid();
        if(desMode === 'tutti') desRenderAllCompact();
    }
    function desToggleMode() {
        vibrate();
        const m = document.getElementById('des-mode-menu');
        if(m.classList.contains('open')) { m.classList.remove('open'); return; }
        m.innerHTML = Object.entries(DES_MODES).map(([k, M]) => `<button class="${k === desMode ? 'on' : ''}" onclick="desSetMode('${k}')"><span class="material-icons-round">${M[0]}</span><span><b>${M[1]}</b><small>${M[2]}</small></span></button>`).join('')
            + `<div class="dmm-sep"></div><button onclick="desLogOpen()"><span class="material-icons-round">history</span><span><b>Storico inserimenti</b><small>Chi ha scritto cosa, con data e ora</small></span></button>`
            + `<button onclick="desAdminOpen()"><span class="material-icons-round">${desAdmin ? 'logout' : 'admin_panel_settings'}</span><span><b>${desAdmin ? 'Esci dall’admin' : 'Admin (riunione)'}</b><small>${desAdmin ? 'Torni a scrivere solo nella tua colonna' : 'Modifica le desiderate di tutti'}</small></span></button>`;
        const r = (document.getElementById('des-mode-btn') || document.getElementById('des-seg')).getBoundingClientRect();
        m.style.top = (r.bottom + 6) + 'px'; m.style.left = Math.max(8, Math.min(window.innerWidth - 238, r.right - 230)) + 'px';
        m.classList.add('open');
        if(!m._out) { m._out = true; document.addEventListener('click', e => { if(!e.target.closest('#des-mode-menu, #des-mode-btn')) m.classList.remove('open'); }); }   // un solo ascoltatore: chiude il menu toccando fuori
    }
    function desSetMode(k) {
        document.getElementById('des-mode-menu').classList.remove('open');
        if(!DES_MODES[k] || k === desMode) { if(k === desMode) desApplyMode(); return; }
        vibrate(); desMode = k;
        try { localStorage.setItem('autisti_des_mode', desMode); } catch(e) {}
        desApplyMode();
        const sc = document.getElementById('des-scroll');
        if(desMode === 'anno') { const t = document.querySelector('#des-yg .yg-m.cur'); sc.scrollTop = t ? Math.max(0, t.offsetTop - 12) : 0; }
        else if(desMode === 'tutti') { const t = document.getElementById('da-today'); sc.scrollTop = t ? Math.max(0, t.offsetTop - 92 - 30) : 0; }
        else desRenderAll(true);
    }
    // ── vista "Tutti": tutte le colonne strette in una schermata, con gli assenti del giorno ──
    function desRenderAllCompact() {
        const tb = document.getElementById('des-all'); if(!tb) return;
        const y = desYear, me = desMe(), cols = desCols(), H = holidaysFor(y), today = new Date(), MN = Object.keys(MONTH_MAP);
        let html = `<colgroup><col class="c-date">${cols.map(() => '<col class="c-op">').join('')}<col class="c-ass"></colgroup>`;
        html += `<thead><tr><th class="h-date">Data</th>${cols.map(d => `<th class="${d === me ? 'me' : ''}" title="${esc(d.name)}"><span class="vn">${esc(d.name)}${d === me ? ' · TU' : ''}</span></th>`).join('')}<th class="h-ass" title="Quanti sono assenti quel giorno">Ass.</th></tr></thead><tbody>`;
        let lastM = -1;
        desYearDays(y).forEach(({ date, key }) => {
            const m = date.getMonth(), dn = date.getDate(), wd = date.getDay();
            if(m !== lastM) { lastM = m; html += `<tr class="da-m"><td colspan="${cols.length + 2}">${MN[m]} ${y}</td></tr>`; }
            const we = wd === 0 || wd === 6 || H[m + '-' + dn], isT = y === today.getFullYear() && m === today.getMonth() && dn === today.getDate();
            html += `<tr data-key="${key}" class="${[we ? 'we' : '', isT ? 'today' : ''].filter(Boolean).join(' ')}"${isT ? ' id="da-today"' : ''}><td class="d">${dn}<small>${RT_WEEKDAY_FMT.format(date).slice(0, 2).toUpperCase()}</small></td>`;
            cols.forEach(d => { const mine = d === me; html += `<td class="c${mine ? ' me' : ''}" data-col="${d.idx}" onclick="desCellTap('${key}',${d.idx})"></td>`; });
            html += '<td class="a"></td></tr>';
        });
        tb.innerHTML = html + '</tbody>';
        desFillCompact();
    }
    function desFillCompact() {
        const tb = document.getElementById('des-all'); if(!tb || !tb.rows.length) return;
        const y = desYear, cols = desCols(), R = new Map(cols.map(d => [d.idx, desResolve(desDaysOf(d), y)])), N = new Map(cols.map(d => [d.idx, desNotesOf(d)])), O = new Map(cols.map(d => [d.idx, desOkOf(d)]));
        tb.querySelectorAll('tbody tr[data-key]').forEach(tr => {
            const key = tr.dataset.key; let ass = 0;
            for(const td of tr.children) {
                if(td.classList.contains('c')) {
                    const idx = +td.dataset.col, r = R.get(idx)[key], nt = N.get(idx)[key], okd = r && O.get(idx)[key];
                    if(r) ass++;
                    const cls = 'c' + (td.classList.contains('me') ? ' me' : '') + (r ? ' ' + r.t : '') + (nt ? ' nt' : '') + (okd ? ' ok' : '');
                    if(td.className !== cls) { td.className = cls; td.textContent = r ? r.t : ''; td.title = nt || ''; }
                } else if(td.classList.contains('a')) {
                    const cls = 'a' + (ass >= 4 ? ' a3' : ass >= 3 ? ' a2' : ass ? ' a1' : '');
                    if(td.className !== cls) td.className = cls;
                    const tx = ass ? String(ass) : ''; if(td.textContent !== tx) td.textContent = tx;
                }
            }
        });
    }
    function desRenderYearGrid() {
        const box = document.getElementById('des-yg'); if(!box) return;
        const y = desYear, me = desMe(), H = holidaysFor(y), today = new Date();
        const cols = desCols();
        if(!desYgWho || !cols.some(d => d.idx === desYgWho)) desYgWho = me ? me.idx : (cols[0] ? cols[0].idx : null);
        const who = cols.find(d => d.idx === desYgWho); if(!who) { box.innerHTML = ''; return; }
        const mine = desCanEdit(who), oks = who ? desOkOf(who) : {};
        const res = who ? desResolve(desDaysOf(who), y) : {}, notes = who ? desNotesOf(who) : {};
        const c = who ? desCount(desDaysOf(who), y) : { f:0, p:0, auto:0 };
        const MN = Object.keys(MONTH_MAP), WD = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
        let html = `<div class="yg-who">Calendario di <select onchange="desYgWho = +this.value; desRenderYearGrid()">${cols.map(d => `<option value="${d.idx}"${d === who ? ' selected' : ''}>${esc(d.name)}${d === me ? ' (tu)' : ''}</option>`).join('')}</select>${mine ? (desAdmin && who !== me ? '<span class="des-adm-tag">ADMIN</span>' : desIsPS() ? '<span class="des-ps-tag">PC PS</span>' : '') : '<span>solo da vedere</span>'}</div>`;
        html += `<div class="yg-legend"><span><i style="background:var(--bg-cong)"></i>Ferie ${c.f}</span><span><i style="background:var(--bg-perm)"></i>Permessi ${c.p}</span><span><i style="background:var(--c-R)"></i>Riposo al 5° giorno ${c.auto}</span>${mine ? '<span>Tocca un giorno: usa lo strumento della ruota</span>' : ''}</div>`;
        for(let m = 0; m < 12; m++) {
            const first = new Date(y, m, 1), n = new Date(y, m + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
            let cells = WD.map((w, i) => `<div class="yg-wd${i > 4 ? ' r' : ''}">${w}</div>`).join('');
            for(let i = 0; i < lead; i++) cells += '<div></div>';
            let mf = 0, mp = 0;
            for(let d = 1; d <= n; d++) {
                const dt = new Date(y, m, d), key = String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'), r = res[key];
                const hol = H[m + '-' + d], wd = dt.getDay();
                const isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
                if(r) { if(r.t === 'F') mf++; else if(r.t === 'P') mp++; }
                const cls = ['yg-d', r ? r.t : '', r && oks[key] ? 'ok' : '', (wd === 0 || wd === 6 || hol) && !r ? 'red' : '', hol ? 'hol' : '', isToday ? 'today' : '', mine ? '' : 'ro'].filter(Boolean).join(' ');
                const tip = (hol ? hol + ' · ' : '') + (r ? (r.t === 'F' ? 'Ferie' : r.t === 'P' ? 'Permesso' : 'Riposo (' + r.n + '° giorno di ferie)') : '');
                const nt = notes[key];
                cells += `<button class="${cls}"${tip || nt ? ` title="${esc([tip, nt].filter(Boolean).join(' · '))}"` : ''}${mine ? ` data-key="${key}"` : ''} onclick="desCellTap('${key}',${who.idx})">${d}${r ? `<small>${r.t === 'F' ? 'FER' : r.t === 'P' ? 'PERM' : 'RIP'}</small>` : ''}${nt ? '<span class="des-dot"></span>' : ''}</button>`;
            }
            const sub = [mf ? mf + ' ferie' : '', mp ? mp + ' perm.' : ''].filter(Boolean).join(' · ');
            html += `<div class="yg-m${y === today.getFullYear() && m === today.getMonth() ? ' cur' : ''}"><h4>${MN[m]}<small>${sub}</small></h4><div class="yg-g">${cells}</div></div>`;
        }
        box.innerHTML = html;
    }
    function desRenderSum() {
        const el = document.getElementById('des-sum'); if(!el) return;
        const me = desMe();
        if(desAdmin && !me) { el.innerHTML = `<span class="des-pill"><b class="des-adm-tag">ADMIN</b> tocca o trascina nelle colonne di tutti</span>`; return; }
        if(desIsPS() && !me) {
            const op = desPSOperator(), save = { ok:['cloud_done', 'Salvato'], saving:['sync', 'Salvo…'], err:['cloud_off', 'Non salvato'], offline:['cloud_off', 'Senza rete'] }[desSaveState] || ['cloud_done', 'Salvato'];
            el.innerHTML = `<span class="des-pill"><b class="des-ps-tag">PC PRONTO SOCCORSO</b> scegli a nome di chi operi</span>`
                + `<span class="des-who"><button onclick="desPSPick()">Opero a nome di…</button> · <button onclick="desLogOpen()">Storico</button></span>`
                + `<span class="des-save${desSaveState === 'err' || desSaveState === 'offline' ? ' err' : ''}" title="${save[1]}"><span class="material-icons-round">${save[0]}</span><span class="des-save-t">${save[1]}</span></span>`;
            return;
        }
        if(!me) { el.innerHTML = `<span>Per scrivere le tue ferie desiderate scegli chi sei.</span><span class="des-who"><button onclick="requestChangeIdentityDirect()">Scegli chi sei</button></span>`; return; }
        const c = desCount(desDaysOf(me), desYear), al = desAllow(me);
        const save = { ok:['cloud_done', 'Salvato'], saving:['sync', 'Salvo…'], err:['cloud_off', 'Non salvato'], offline:['cloud_off', 'Solo su questo telefono'] }[desSaveState] || ['cloud_done', 'Salvato'];
        el.innerHTML = (desIsPS() ? `<span class="des-pill"><b class="des-ps-tag">PC PS</b> a nome di <b>${esc(me.name)}</b></span><span class="des-who"><button onclick="desPSPick()">cambia</button> · <button onclick="desLogOpen()">Storico</button></span>` : '')
            + `<span class="des-pill${c.f > al.co ? ' over' : ''}"><i style="background:var(--bg-cong)"></i>Ferie <b>${c.f}</b>/${al.co}</span>`
            + `<span class="des-pill${c.p > al.sp ? ' over' : ''}"><i style="background:var(--bg-perm)"></i>Permessi <b>${c.p}</b>/${al.sp}</span>`
            + (c.auto ? `<span class="des-pill"><i style="background:var(--c-R)"></i>Riposi al 5° giorno <b>${c.auto}</b></span>` : '')
            + `<span class="des-save${desSaveState === 'err' || desSaveState === 'offline' ? ' err' : ''}" title="${save[1]}"><span class="material-icons-round">${save[0]}</span><span class="des-save-t">${save[1]}</span></span>`;
    }

    // ── modifica: tocco sulle caselle o periodo "dal… al…" ──
    // Ognuno scrive nella sua colonna; con l'accesso admin (riunione) si scrive in tutte.
    function desAllow(d) { return typeof absAllowFor === 'function' ? absAllowFor(d) : { co:31, sp:6 }; }
    function desCanEdit(d) { const me = desMe(); return !!d && (desAll() || (!!me && d === me)); }
    function desDriverByIdx(idx) { return idx == null ? desMe() : drivers.find(x => x.idx === +idx) || null; }
    function desOkOf(d) { return (d && desOk[desDKey(d)]) || {}; }
    function desSetDays(changes, who) {
        const d = who || desMe(); if(!desCanEdit(d)) return 0;
        const k = desDKey(d), days = Object.assign({}, desData[k] || {}), ok = desOkOf(d);
        // blocco: non si va oltre le spettanze dell'operatore (ferie = C.O., permessi straordinari)
        const al = desAllow(d); let n = 0, blocked = 0, locked = 0; const logged = [], unbar = [], res0 = desResolve(days, desYear);
        changes.forEach(([key, val]) => {
            if(ok[key] && !desAdmin) { if((days[key] || null) !== (val || null)) locked++; return; }   // già inserito nei turni dal coordinatore
            if(val && days[key] !== val) {
                const was = days[key], before = desCount(days, desYear); days[key] = val;
                const c = desCount(days, desYear);
                if((c.f > al.co && c.f > before.f) || (c.p > al.sp && c.p > before.p)) { if(was) days[key] = was; else delete days[key]; blocked++; return; }
                n++; logged.push([key, was || '', val]);
            } else if(!val && days[key]) { logged.push([key, days[key], '']); if(ok[key]) unbar.push([key, days[key], res0[key] && res0[key].t === 'R']); delete days[key]; n++; }
        });
        if(blocked) { desToast(`Limite raggiunto: ${d === desMe() ? 'hai' : d.name + ' ha'} ${al.co} giorni di ferie e ${al.sp} permessi${blocked > 1 ? ` (${blocked} giorni non inseriti)` : ''}`); if(navigator.vibrate) try { navigator.vibrate([30, 40, 30]); } catch(e) {} }
        else if(locked) desToast('Giorno barrato: è già nei turni. Lo toglie solo l’admin (riunione), con Barra o con Cancella');
        if(!n) return 0;
        desData[k] = days;
        // un giorno barrato cancellato (admin) perde anche la barra: rimessa la ferie non risulterebbe già nei turni
        if(unbar.length) { const o = Object.assign({}, desOk[k] || {}); unbar.forEach(x => delete o[x[0]]); desOk[k] = o; desUnimportQueue(d, unbar); }
        desLogPush(d, 'days', logged);
        desMarkDirty(d);
        desRefreshCols(d.idx, new Set(changes.map(c => c[0])));
        return n;
    }
    function desMarkDirty(who) {
        const d = who || desMe(); if(!d) return;
        desDirty = true; desDirtySet.add(desDKey(d));
        const me = desMe();
        if(d === me && !desIsPS()) try { localStorage.setItem(desLocalKey(desYear), JSON.stringify({ name: desMyName(), days: desData[desDKey(me)] || {}, notes: desNotes[desDKey(me)] || {}, unsaved:true })); } catch(e) {}
        clearTimeout(desSaveTimer); desSaveTimer = setTimeout(desSaveNow, 700);
        desSaveState = 'saving'; desRenderSum();
    }
    // ── note sui giorni ──
    function desKeyLabel(key) { const [m, d] = key.split('-').map(Number); return new Date(desYear, m - 1, d).toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' }); }
    let desNoteWho = null;
    function desOpenNote(key, ro, who) {
        vibrate();
        const d = who || desMe(); if(!d) return;
        desNoteKey = key; desNoteRO = !!ro; desNoteWho = d;
        const t = document.getElementById('dn-text');
        t.value = desNotesOf(d)[key] || ''; t.readOnly = desNoteRO;
        document.getElementById('dn-title').textContent = d !== desMe() ? 'NOTA DI ' + d.name : 'NOTA';
        document.getElementById('dn-sub').textContent = desKeyLabel(key) + (desOkOf(d)[key] ? ' · già inserito nei turni' : '');
        document.getElementById('dn-foot').style.display = ro ? 'none' : '';
        document.getElementById('dn-hint').style.display = ro ? 'none' : '';
        document.getElementById('des-wheel').classList.add('collapsed');
        const m = document.getElementById('des-note'); m.style.display = 'flex'; setTimeout(() => { m.classList.add('open'); if(!ro) t.focus(); }, 10);
    }
    function desCloseNote(e) {
        if(e && e.target !== e.currentTarget) return;
        const m = document.getElementById('des-note'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 300);
    }
    function desSaveNote(del) {
        const d = desNoteWho || desMe(); if(!desCanEdit(d) || !desNoteKey || desNoteRO) return;
        const k = desDKey(d), notes = Object.assign({}, desNotes[k] || {}), txt = del ? '' : document.getElementById('dn-text').value.trim().slice(0, 300);
        const oldTxt = notes[desNoteKey] || '';
        if(txt) notes[desNoteKey] = txt; else delete notes[desNoteKey];
        if(oldTxt !== txt) desLogPush(d, 'notes', [[desNoteKey, oldTxt, txt]]);
        desNotes[k] = notes; desMarkDirty(d);
        desRefreshCols(d.idx, new Set([desNoteKey]));
        desCloseNote(); desToast(txt ? 'Nota salvata' : 'Nota eliminata');
    }
    // ── barrare (admin): giorno già inserito a mano nel calendario turni ──
    function desToggleOk(keys, d, val) {
        if(!desAdmin || !d) return 0;
        const k = desDKey(d), ok = Object.assign({}, desOk[k] || {}), days = desDaysOf(d); let n = 0;
        keys.forEach(key => {
            const want = val === undefined ? !ok[key] : val;
            if(want && days[key] && !ok[key]) { ok[key] = true; n++; }
            else if(!want && ok[key]) { delete ok[key]; n++; }
        });
        if(!n) return 0;
        desOk[k] = ok; desMarkDirty(d);
        desRefreshCols(d.idx, new Set(keys));
        return n;
    }
    // ── giorno barrato cancellato dall'admin: si può togliere anche dal calendario turni ──
    // Si toglie l'assenza dalla casella dei turni solo se è proprio quella messa dall'importazione
    // (C.O. per le ferie, permesso per i permessi); il turno della casella resta com'è.
    let desUnQ = [], desUnT = null;
    function desUnimportQueue(d, items) {
        items.forEach(([key, was, rest]) => desUnQ.push({ d, key, sub: was === 'P' ? 'p' : 'f', rest, y: desYear }));
        clearTimeout(desUnT); desUnT = setTimeout(desUnimportAsk, 700);   // dopo un trascinamento si chiede una volta sola
    }
    async function desUnimportAsk() {
        const list = desUnQ.splice(0); if(!list.length || !desAdmin || !fbReady || dataSourceMode !== 'firebase') return;
        const names = [...new Set(list.map(x => x.d.name))].join(', ');
        if(!confirm(`${list.length === 1 ? 'Questo giorno era barrato' : 'Questi ' + list.length + ' giorni erano barrati'} (${names}): risultano già nel calendario turni.\n\nToglierli anche dal calendario turni?`)) return;
        try {
            await takeSnapshot('prima-togli-desiderate');
            const MN = Object.keys(MONTH_MAP), docs = {}, batch = db.batch(), byDoc = {}, done = [];
            for(const x of list) {
                const [mm, dd] = x.key.split('-').map(Number), name = monthDocName(x.y, mm - 1);
                if(!(name in docs)) { const s = await cfgRef(name).get(); docs[name] = s.exists ? (s.data().cells || {}) : {}; }
                const cell = `${x.d.originalName || x.d.name}__${MN[mm - 1]}-${dd}`, cur = docs[name][cell];
                if(x.rest) {   // riposo del 5° giorno: si toglie la R messa dall'importazione
                    if(!cur || String(cur.subV || '').trim() || !['R', 'r'].includes(String(cur.v || '').trim())) continue;
                    (byDoc[name] = byDoc[name] || {})[cell] = { v: '' };
                    done.push(x); continue;
                }
                if(!cur || String(cur.subV || '').trim().toLowerCase() !== x.sub) continue;   // nei turni c'è altro: non si tocca
                (byDoc[name] = byDoc[name] || {})[cell] = { v: cur.v || '', subV: firebase.firestore.FieldValue.delete(), coY: firebase.firestore.FieldValue.delete() };
                done.push(x);
            }
            if(!done.length) { desToast('Nel calendario turni quei giorni non ci sono più'); return; }
            const now = new Date().toISOString();
            Object.keys(byDoc).forEach(n => batch.set(cfgRef(n), { cells: byDoc[n], updatedAt: now }, { merge:true }));
            addLogWrite(batch, [], `Ferie desiderate tolte dal calendario turni: ${done.length} ${done.length === 1 ? "giorno" : "giorni"} (${[...new Set(done.map(x => x.d.name))].join(', ')})`);
            await batch.commit();
            desToast(`Tolti dal calendario turni ${done.length} ${done.length === 1 ? 'giorno' : 'giorni'}`);
        } catch(e) {
            console.error('Togli dai turni:', e);
            alert('Non sono riuscito a toglierli dal calendario turni: ' + (e && e.message || e));
        }
    }

    // ── trascinamento: col dito (tieni premuto un attimo, poi scorri) o col mouse ──
    // restituisce il giorno e la colonna sotto il dito, solo dove si può scrivere
    function desHitAtPoint(x, y) {
        const el = document.elementFromPoint(x, y); if(!el) return null;
        const td = el.closest('#des-table td[data-col], #des-all td.c');
        if(td) { const d = desDriverByIdx(td.dataset.col); return desCanEdit(d) ? { key: td.parentNode.dataset.key, idx: d.idx } : null; }
        const b = el.closest('#des-yg .yg-d[data-key]'); return b ? { key: b.dataset.key, idx: desYgWho } : null;
    }
    function desKeyAtPoint(x, y) { const h = desHitAtPoint(x, y); return h ? h.key : null; }
    function desPaintStart(hit) {
        if(!hit || desTool === 'N' || desTool === 'I') return false;
        const d = desDriverByIdx(hit.idx); if(!desCanEdit(d)) return false;
        if(desIsPS() && !desPSOperator()) return false;   // PC Pronto Soccorso: il nome dell'operatore si chiede al tocco
        const key = hit.key;
        if(desTool === 'B') desPaint = { ok: !desOkOf(d)[key], last: key, n: 0, d };
        else { const cur = desDaysOf(d)[key]; desPaint = { val: desTool === 'X' || cur === desTool ? null : desTool, last: key, n: 0, d }; }
        document.body.classList.add('des-painting');
        document.getElementById('des-wheel').classList.add('collapsed');
        vibrate(); desPaintTo(hit, true);
        return true;
    }
    function desPaintTo(hit, first) {
        if(!desPaint || !hit || hit.idx !== desPaint.d.idx || (!first && hit.key === desPaint.last)) return;   // si resta nella colonna di partenza
        const all = desYearDays(desYear).map(x => x.key), a = all.indexOf(desPaint.last), b = all.indexOf(hit.key);
        if(a < 0 || b < 0) return;
        const keys = first ? [hit.key] : all.slice(Math.min(a, b), Math.max(a, b) + 1);
        desPaint.n += desPaint.ok !== undefined ? desToggleOk(keys, desPaint.d, desPaint.ok) : desSetDays(keys.map(k => [k, desPaint.val]), desPaint.d);
        desPaint.last = hit.key;
    }
    function desPaintEnd() {
        if(!desPaint) return;
        document.body.classList.remove('des-painting');
        desNoClickUntil = Date.now() + 450; desPaint = null;
    }
    (function desPaintSetup() {
        const sc = document.getElementById('des-scroll'); if(!sc) return;
        let hold = null, sx = 0, sy = 0, tgt = null;
        // il dito resta legato all'elemento toccato anche se la casella viene ridisegnata (e quindi tolta
        // dalla pagina): per questo i movimenti si ascoltano proprio su quell'elemento
        const move = e => {
            const t = e.touches[0]; if(!t) return;
            if(desPaint) { e.preventDefault(); desPaintTo(desHitAtPoint(t.clientX, t.clientY)); return; }
            if(hold && (Math.abs(t.clientX - sx) > 8 || Math.abs(t.clientY - sy) > 8)) { clearTimeout(hold); hold = null; }
        };
        const stop = () => {
            clearTimeout(hold); hold = null; desPaintEnd();
            if(tgt) { tgt.removeEventListener('touchmove', move); tgt.removeEventListener('touchend', stop); tgt.removeEventListener('touchcancel', stop); tgt = null; }
        };
        sc.addEventListener('touchstart', e => {
            if(e.touches.length !== 1) { stop(); return; }
            const t = e.touches[0], hit = desHitAtPoint(t.clientX, t.clientY); if(!hit || desTool === 'N' || desTool === 'I') return;
            stop(); sx = t.clientX; sy = t.clientY; tgt = e.target;
            tgt.addEventListener('touchmove', move, { passive:false }); tgt.addEventListener('touchend', stop); tgt.addEventListener('touchcancel', stop);
            hold = setTimeout(() => { hold = null; desPaintStart(hit); }, 280);
        }, { passive:true });
        sc.addEventListener('contextmenu', e => { if(desPaint || desHitAtPoint(e.clientX, e.clientY)) e.preventDefault(); });
        // mouse: si preme e si trascina
        sc.addEventListener('mousedown', e => { if(e.button !== 0) return; const hit = desHitAtPoint(e.clientX, e.clientY); if(hit && desPaintStart(hit)) { desPaint.mouse = true; desNoClickUntil = 0; e.preventDefault(); } });
        window.addEventListener('mousemove', e => { if(desPaint && desPaint.mouse) desPaintTo(desHitAtPoint(e.clientX, e.clientY)); });
        window.addEventListener('mouseup', () => { if(desPaint && desPaint.mouse) { const moved = desPaint.n > 1; desPaintEnd(); if(!moved) desNoClickUntil = Date.now() + 450; } });
    })();
    function desCellTap(key, idx) {
        const d = desDriverByIdx(idx); if(!d) return;
        if(Date.now() < desNoClickUntil) return;   // fine di un trascinamento
        if(desPSNeed(() => desCellTap(key, idx), d)) return;   // PC Pronto Soccorso: prima "a nome di chi"
        if(!desCanEdit(d)) { desOtherTap(key, d.idx); return; }
        if(desTool === 'N') { desOpenNote(key, false, d); return; }
        if(desTool === 'I') { if(desAdmin) desImportTap(key, d); return; }
        vibrate();
        if(desTool === 'B') { if(!desToggleOk([key], d) && !desDaysOf(d)[key]) desToast('Si barrano solo i giorni con ferie o permesso'); }
        else if(desTool === 'X') desSetDays([[key, null]], d);
        else desSetDays([[key, desDaysOf(d)[key] === desTool ? null : desTool]], d);
        document.getElementById('des-wheel').classList.add('collapsed');
    }
    function desOtherTap(key, idx) {
        const d = desDriverByIdx(idx);
        if(desCanEdit(d)) { desCellTap(key, idx); return; }
        const nt = key && d ? desNotesOf(d)[key] : null;
        if(nt) { desOpenNote(key, true, d); return; }
        desToast(desIsPS() && desMe() ? 'Operi a nome di ' + desMe().name + ': per un’altra persona tocca “cambia”' : desMe() ? 'Puoi scrivere solo nella tua colonna' : 'Scegli chi sei per scrivere nella tua colonna');
    }
    async function desSaveNow() {
        clearTimeout(desSaveTimer); desSaveTimer = null;
        if(!desDirty || !desDirtySet.size) return;
        if(!fbReady) { desSaveState = 'offline'; desRenderSum(); return; }
        const y = desYear, me = desMe(), myName = desMyName(), keys = [...desDirtySet];
        desDirty = false; desDirtySet.clear(); desSaveState = 'saving'; desRenderSum();
        let failed = 0;
        for(const k of keys) {
            const d = drivers.find(x => desDKey(x) === k); if(!d) continue;
            const mine = !!me && d === me && !desIsPS(), name = mine ? myName : (desDocNames[k] || d.name);
            const logs = desLogTake(k);
            try {
                // le regole controllano che il nome sia quello scelto in "Chi sei?" da questo telefono (o che scriva l'admin)
                // autisti: niente collezione delle identità (le regole controllano solo il nome "prova_…")
                const days = Object.assign({}, desData[k] || {}), notes = Object.assign({}, desNotes[k] || {}), ok = Object.assign({}, desOk[k] || {});
                const payload = { ns: DATA_NS, year: y, name, days, byUid: fbAuth.currentUser.uid, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                if(Object.keys(notes).length) payload.notes = notes;
                if(Object.keys(ok).length) payload.ok = ok;
                if(!mine) payload.adminBy = desIsPS() ? (PS_NAME + ' · ' + (desPSLastOp[k] || desPSOp || '?')).slice(0, 60) : (myName || 'admin');
                const ref = db.collection(DES_COLL).doc(desDocId(name, y));
                // lo storico si scrive insieme ai giorni: dal PC Pronto Soccorso o vanno tutti e due o nessuno
                const batch = db.batch(); batch.set(ref, payload);
                const logRows = myName ? logs.map(e => desLogRow(e, name, y, myName)).filter(Boolean) : [];
                logRows.forEach(r => batch.set(db.collection(DES_LOG).doc(DATA_NS + 'deslog_' + y + '_' + db.collection(DES_LOG).doc().id), r));
                try { await batch.commit(); }
                catch(e) {
                    if(desIsPS() || !logRows.length) throw e;
                    // storico non accettato (regole vecchie): per i colleghi si salvano comunque i giorni
                    console.warn('Storico desiderate non salvato:', e);
                    await ref.set(payload);
                }
                if(mine) try { localStorage.setItem(desLocalKey(y), JSON.stringify({ name, days, notes })); } catch(e) {}
            } catch(e) {
                console.warn('Desiderate non salvate:', e); failed++;
                desDirty = true; desDirtySet.add(k); desLogBack(logs);
            }
        }
        if(failed) { desSaveState = 'err'; desToast('Non salvato: riprovo alla prossima modifica'); }
        else if(!desDirty) desSaveState = 'ok';
        desRenderSum();
    }

    // ── PC Pronto Soccorso: chi sta inserendo ──
    // Il PC è di tutti: prima di scrivere si sceglie il proprio nome (operatore). Il nome resta
    // finché nessuno tocca niente per 5 minuti, poi l'app lo richiede al prossimo che scrive.
    const DES_PS_IDLE_MS = 5 * 60 * 1000;
    let desPSOp = null, desPSOpAt = 0, desPSPending = null, desPSLastOp = {};
    function desPSOperator() { return desIsPS() && desPSOp && Date.now() - desPSOpAt < DES_PS_IDLE_MS ? desPSOp : null; }
    function desPSNeed(fn, d) {
        if(!desIsPS() || desPSOperator()) { if(desIsPS()) desPSOpAt = Date.now(); return false; }
        desPSPending = fn || null; desPSPick(d);
        return true;
    }
    function desPSSubHtml() { const op = desPSOperator(); return `<b class="des-ps-tag">PC PS</b> ${op ? 'a nome di <b>' + esc(op) + '</b>' : 'nessuno scelto'} · <button onclick="desPSPick()">${op ? 'cambia' : 'scegli'}</button>`; }
    function desPSPick(d) {
        const m = document.getElementById('des-op'); if(m.classList.contains('open')) return;
        document.getElementById('des-wheel').classList.add('collapsed');
        const cur = desPSOperator(), sel = cur || (d ? d.name : '');
        const names = drivers.filter(x => !x.hidden).map(x => x.name);
        document.getElementById('dop-list').innerHTML = names.map(n => `<button class="${n === sel ? 'on' : ''}" onclick="desPSChoose(this.dataset.n)" data-n="${esc(n)}">${esc(n)}</button>`).join('');
        m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10);
    }
    function desPSClose(e) {
        if(e && e.target !== e.currentTarget) return;
        desPSPending = null;
        const m = document.getElementById('des-op'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 300);
    }
    function desPSChoose(name) {
        const dd = desDriverOf(name); if(!dd) return;
        name = dd.name;
        vibrate();
        desPSOp = name; desPSOpAt = Date.now();
        const fn = desPSPending; desPSPending = null;
        const m = document.getElementById('des-op'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 300);
        desIdOk = false; desRenderAll(true); desToast('Operi a nome di ' + name + ': resta nello storico con data e ora');
        if(fn) setTimeout(fn, 320);
    }
    // l'operatore scade da solo: si aggiorna la scritta in alto
    setInterval(() => { if(desIsPS() && desPSOp && !desPSOperator()) { desPSOp = null; const v = document.getElementById('des-view'); if(v && v.classList.contains('open')) desRenderAll(false); } }, 30000);

    // ── storico degli inserimenti ──
    // Ogni salvataggio scrive anche una riga dello storico (autisti: in admin_config, "prova_deslog_2027_…"):
    // data e ora (del server), operatore, colonna e giorni cambiati. Le righe non si modificano
    // e non si cancellano.
    const DES_LOG = 'admin_config';
    let desLogQ = [];
    function desLogPush(d, field, changes) {
        if(!d || !changes || !changes.length) return;
        const op = desIsPS() ? (desPSOperator() || desPSOp || '?') : (desMyName() || 'ADMIN');
        if(desIsPS()) { desPSOpAt = Date.now(); desPSLastOp[desDKey(d)] = op; }
        const k = desDKey(d);
        let e = desLogQ.find(x => x.k === k && x.op === op && x.y === desYear);
        if(!e) { e = { k, op, y: desYear, days:{}, notes:{}, orig:{ days:{}, notes:{} } }; desLogQ.push(e); }
        changes.forEach(([key, was, now]) => {
            if(!(key in e.orig[field])) e.orig[field][key] = was;
            e[field][key] = now;
        });
    }
    function desLogTake(k) {
        const out = desLogQ.filter(e => e.k === k);
        desLogQ = desLogQ.filter(e => e.k !== k);
        return out;
    }
    function desLogBack(list) { desLogQ = list.concat(desLogQ); }
    function desLogRow(e, col, y, by) {
        if(e.y !== y) return null;
        const days = {}, notes = {};
        Object.keys(e.days).forEach(k => { if(e.days[k] !== e.orig.days[k]) days[k] = e.days[k]; });   // tolto e rimesso = nessun cambio
        Object.keys(e.notes).forEach(k => { if(e.notes[k] !== e.orig.notes[k]) notes[k] = e.notes[k]; });
        if(!Object.keys(days).length && !Object.keys(notes).length) return null;
        const r = { ns: DATA_NS, year: y, col, by, op: e.op, days, byUid: fbAuth.currentUser.uid, at: firebase.firestore.FieldValue.serverTimestamp() };
        if(Object.keys(notes).length) r.notes = notes;
        return r;
    }
    let desLogRows = [], desLogFilter = { who:'', ps:false };
    async function desLogOpen() {
        document.getElementById('des-mode-menu').classList.remove('open');
        vibrate();
        const m = document.getElementById('des-log');
        document.getElementById('dl-sub').textContent = 'Ferie desiderate ' + desYear;
        document.getElementById('dl-body').innerHTML = '<div class="dl-empty">Carico…</div>';
        m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10);
        if(desDirty) await desSaveNow();
        if(!fbReady) { document.getElementById('dl-body').innerHTML = '<div class="dl-empty">Senza rete non si può leggere lo storico.</div>'; return; }
        try {
            const snap = await desYearQuery(DES_LOG, DATA_NS + 'deslog_' + desYear + '_').get();
            desLogRows = [];
            snap.forEach(doc => { const x = doc.data(); if(x && x.ns === DATA_NS) desLogRows.push(Object.assign({ id: doc.id, ms: tsToMillis(x.at) || Date.now() }, x)); });
            desLogRows.sort((a, b) => b.ms - a.ms);
            const who = document.getElementById('dl-who'), cols = [...new Set(desLogRows.map(r => r.col).concat(desLogRows.map(r => r.op)))].filter(Boolean).sort();
            who.innerHTML = '<option value="">Tutti</option>' + cols.map(c => `<option value="${esc(c)}"${c === desLogFilter.who ? ' selected' : ''}>${esc(c)}</option>`).join('');
            desLogRender();
        } catch(e) {
            console.warn('Storico desiderate non letto:', e);
            document.getElementById('dl-body').innerHTML = `<div class="dl-empty">Storico non disponibile (${esc(e.code || e.message || e)}).</div>`;
        }
    }
    function desLogClose(e) {
        if(e && e.target !== e.currentTarget) return;
        const m = document.getElementById('des-log'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 300);
    }
    function desLogSet() {
        desLogFilter.who = document.getElementById('dl-who').value;
        desLogFilter.ps = document.getElementById('dl-ps').checked;
        desLogRender();
    }
    function desLogList() {
        const f = desLogFilter, w = String(f.who || '').toUpperCase();
        return desLogRows.filter(r => (!f.ps || r.by === PS_NAME) && (!w || String(r.col).toUpperCase() === w || String(r.op).toUpperCase() === w));
    }
    // "08-03", "08-04", "08-05" con lo stesso valore -> "3–5 ago"
    function desLogSpans(map) {
        const MN = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
        const keys = Object.keys(map || {}).sort(), out = [];
        const lbl = k => { const [m, d] = k.split('-').map(Number); return { m, d }; };
        keys.forEach(k => {
            const v = map[k], c = lbl(k), last = out[out.length - 1];
            if(last && last.v === v && last.m === c.m && last.d2 === c.d - 1) { last.d2 = c.d; last.n++; return; }
            out.push({ v, m: c.m, d1: c.d, d2: c.d, n: 1 });
        });
        return out.map(x => ({ v: x.v, n: x.n, txt: (x.d1 === x.d2 ? x.d1 : x.d1 + '–' + x.d2) + ' ' + MN[x.m - 1] }));
    }
    function desLogWhat(r) {
        const L = { F:'Ferie', P:'Permesso', '':'Tolto' }, C = { F:'F', P:'P', '':'X' };
        const parts = desLogSpans(r.days).map(x => `<span class="dl-chip k${C[x.v] || 'X'}">${L[x.v] || x.v}: ${x.txt}${x.n > 1 ? ' (' + x.n + ' gg)' : ''}</span>`);
        Object.keys(r.notes || {}).sort().forEach(k => { const t = r.notes[k], [m, d] = k.split('-').map(Number); parts.push(`<span class="dl-chip kN">Nota ${d}/${m}: ${t ? '“' + esc(t) + '”' : 'tolta'}</span>`); });
        return parts.join('');
    }
    function desLogRender() {
        const list = desLogList(), body = document.getElementById('dl-body');
        document.getElementById('dl-count').textContent = list.length + (list.length === 1 ? ' inserimento' : ' inserimenti');
        if(!list.length) { body.innerHTML = '<div class="dl-empty">Nessun inserimento registrato.</div>'; return; }
        const fmt = new Intl.DateTimeFormat('it-IT', { weekday:'short', day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
        body.innerHTML = list.slice(0, 500).map(r => `<div class="dl-row">
            <div class="dl-top"><b>${esc(fmt.format(new Date(r.ms)))}</b>${r.by === PS_NAME ? '<span class="des-ps-tag">PC PS</span>' : ''}</div>
            <div class="dl-who">Operatore <b>${esc(r.op || '?')}</b>${String(r.col).toUpperCase() !== String(r.op).toUpperCase() ? ` · colonna <b>${esc(r.col)}</b>` : ''}${r.by !== PS_NAME && r.by !== r.op ? ` · da ${esc(r.by)}` : ''}</div>
            <div class="dl-what">${desLogWhat(r)}</div></div>`).join('') + (list.length > 500 ? '<div class="dl-empty">Mostrati i 500 più recenti: scarica il file per vederli tutti.</div>' : '');
    }
    function desLogCsv() {
        const list = desLogList(); if(!list.length) { desToast('Niente da scaricare'); return; }
        const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
        const L = { F:'Ferie', P:'Permesso', '':'Tolto' };
        const rows = [['Data', 'Ora', 'Operatore', 'Dispositivo', 'Colonna', 'Giorno', 'Cosa', 'Nota']];
        list.forEach(r => {
            const dt = new Date(r.ms), dd = dt.toLocaleDateString('it-IT'), hh = dt.toLocaleTimeString('it-IT');
            Object.keys(r.days || {}).sort().forEach(k => { const [m, d] = k.split('-'); rows.push([dd, hh, r.op, r.by, r.col, d + '/' + m + '/' + r.year, L[r.days[k]] || r.days[k], '']); });
            Object.keys(r.notes || {}).sort().forEach(k => { const [m, d] = k.split('-'); rows.push([dd, hh, r.op, r.by, r.col, d + '/' + m + '/' + r.year, r.notes[k] ? 'Nota' : 'Nota tolta', r.notes[k] || '']); });
        });
        const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(';')).join('\r\n')], { type:'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `storico-ferie-desiderate-${desYear}.csv`;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    // ── barra admin: tutti gli strumenti della riunione in vista ──
    function desRenderAdmBar() {
        const el = document.getElementById('des-admbar'); if(!el) return;
        if(!desAdmin) { el.innerHTML = ''; return; }
        const b = (id, icon, label, fn, on) => `<button id="${id}" class="${on ? 'on' : ''}" onclick="${fn}"><span class="material-icons-round">${icon}</span>${label}</button>`;
        el.innerHTML = `<span class="dab-t"><span class="material-icons-round" style="font-size:17px">admin_panel_settings</span>ADMIN · scrivi nelle colonne di tutti</span>`
            + b('dab-f', 'edit', 'Inserisci', "desPickTool('F')", ['F', 'P', 'X', 'N'].includes(desTool))
            + b('dab-b', 'strikethrough_s', 'Barra giorni', "desPickTool('B')", desTool === 'B')
            + b('dab-i', 'move_down', 'Importa un periodo', "desAdmImportOne()", desTool === 'I')
            + b('dab-a', 'playlist_add_check', 'Importa tutte', "desAdmImportAll()", false)
            + b('dab-l', 'history', 'Storico', "desLogOpen()", false)
            + `<button class="exit" onclick="desAdminExit()"><span class="material-icons-round">logout</span>Esci</button>`;
    }
    function desAdmImportOne() { vibrate(); if(!desImportCheck()) return; desTool = 'I'; desRenderWheel(); desRenderAdmBar(); desToast('Tocca un periodo di ferie o permessi da importare'); }
    function desAdmImportAll() {
        vibrate(); if(!desImportCheck()) return;
        const all = desImportPlan();
        if(!all.plan.length) { desToast('Niente da importare: tutti i giorni sono già barrati'); return; }
        desImportConfirm(all);
    }
    // ── guida ──
    function desGuideHtml() {
        const c = (icon, t, bg) => `<span class="dg-chip"${bg ? ` style="background:${bg}"` : ''}>${icon ? `<span class="material-icons-round">${icon}</span>` : ''}${t}</span>`;
        const st = (n, t, p, adm) => `<div class="dg-step${adm ? ' adm' : ''}"><div class="dg-n">${n}</div><div><b>${t}</b><p>${p}</p></div></div>`;
        const voice = desVoiceOk() ? `<div class="dg-voice"><button id="dg-voice-btn" onclick="desVoiceToggle()"><span class="material-icons-round">volume_up</span>Ascolta</button><span class="t" id="dg-voice-t">Una voce ti legge la guida, un passo alla volta.</span></div>` : '';
        return voice + st(1, 'Chi sei', `L'app ti riconosce dal nome scelto in “Chi sei?”: scrivi solo nella <b>tua colonna</b> (la prima, con scritto TU). Se non l'hai ancora scelto te lo chiede.`)
            + st(2, 'Scegli cosa mettere', `Tocca il cerchio in basso a destra: si apre la ruota con ${c('beach_access', 'Ferie', 'var(--bg-cong)')} ${c('event_available', 'Permesso', 'var(--bg-perm)')} ${c('backspace', 'Cancella')} ${c('edit_note', 'Nota')}. Accanto al cerchio vedi sempre lo strumento scelto.`)
            + st(3, 'Tocca i giorni', `Tocca una casella della tua colonna. Per tanti giorni di fila <b>tieni premuto e trascina</b>, oppure usa ${c('date_range', 'Dal… al…')} e scrivi la prima e l'ultima data. Ritoccando un giorno lo togli.`)
            + st(4, 'Cambia visualizzazione', `In alto ci sono tre tasti: ${c('view_comfy', 'Tutti')} tutti gli operatori in una schermata, con quanti sono assenti ogni giorno; ${c('view_column', 'Colonne')} caselle grandi come il calendario turni; ${c('calendar_view_month', 'Anno')} i 12 mesi di una persona in una pagina (scegli di chi dal menu in alto). Con ${c('', '‹ 2027 ›')} cambi anno.`)
            + st(5, 'Regole', `Il <b>5° giorno di ferie di fila è riposo</b> e non scala le ferie. Non puoi superare le tue ferie e i tuoi permessi: in alto vedi quanti ne hai usati. Il pallino blu su una casella vuol dire che c'è una nota.`)
            + st(6, 'Giorni barrati', `Un giorno barrato con la ✓ è già stato messo nei turni dal coordinatore: non si cambia più da qui.`)
            + st(7, 'Area admin (riunione)', `Tocca ${c('admin_panel_settings', 'Admin')} e metti la password. Compare una barra arancione: puoi scrivere in tutte le colonne, ${c('strikethrough_s', 'Barra giorni')} per segnare quelli già messi a mano, ${c('move_down', 'Importa un periodo')} (tocchi un periodo e va nel calendario turni), ${c('playlist_add_check', 'Importa tutte')}, ${c('history', 'Storico')} per vedere chi ha scritto cosa. ${c('logout', 'Esci')} quando hai finito.`, true)
            + `<div class="dg-foot"><button onclick="desGuideClose(); desLogOpen()"><span class="material-icons-round">history</span>Storico inserimenti</button><button class="pri" onclick="desGuideClose()"><span class="material-icons-round">check</span>Ho capito</button></div>`;
    }
    function desGuideOpen() {
        vibrate();
        document.getElementById('dg-body').innerHTML = desGuideHtml();
        document.getElementById('des-wheel').classList.add('collapsed');
        const m = document.getElementById('des-guide'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10);
        try { localStorage.setItem('autisti_des_guide', '1'); } catch(e) {}
    }
    // ── tutorial animato: la voce spiega e si illuminano i tasti veri, uno alla volta ──
    let desTour = null;   // { i, playing, mute, timer, steps }
    function desTourSteps() {
        const me = desMe();
        const meTh = () => document.querySelector('#des-all thead th.me') || document.querySelector('#des-table th.me-col') || document.getElementById('des-sub');
        const wheel = open => { const w = document.getElementById('des-wheel'); w.classList.toggle('collapsed', !open); desRenderWheel(); };
        const mode = m => { if(desMode !== m) desSetMode(m); };
        return [
            { t:'Benvenuto', x:'Questo è il calendario delle ferie desiderate. Ti faccio vedere in un minuto come si usa. Puoi fermarmi quando vuoi.', el:() => document.querySelector('#des-view .des-title'), go:() => { wheel(false); mode('tutti'); } },
            { t:'La tua colonna', x: me ? `Questa è la tua colonna, ${me.name}: è la prima e c'è scritto TU. Scrivi solo qui; le colonne dei colleghi le puoi solo guardare.` : 'Per scrivere devi prima scegliere chi sei: poi la tua colonna sarà la prima, con scritto TU.', el: meTh, go:() => { wheel(false); mode('tutti'); } },
            { t:'Gli strumenti', x:'In basso a destra c\'è il cerchio degli strumenti. Toccalo e si apre la ruota.', el:() => document.getElementById('dw-hub'), go:() => wheel(false) },
            { t:'La ruota', x:'Nella ruota scegli cosa mettere: Ferie, Permesso, Cancella, oppure Nota per scrivere un appunto su un giorno. Accanto al cerchio resta sempre scritto lo strumento scelto.', el:() => document.getElementById('des-wheel'), go:() => wheel(true), pad:4, round:true },
            { t:'Tocca i giorni', x:'Poi tocca le caselle della tua colonna. Per tanti giorni di fila tieni premuto e trascina il dito. Ritoccando un giorno lo togli.', el: meTh, go:() => wheel(false) },
            { t:'Dal giorno al giorno', x:'Con questo tasto scrivi un periodo intero: metti la prima e l\'ultima data, e l\'app riempie tutti i giorni.', el:() => document.getElementById('des-range-btn'), go:() => wheel(false) },
            { t:'Le visualizzazioni', x:'Qui cambi visualizzazione. Tutti: tutti gli operatori in una schermata, con quanti sono assenti ogni giorno.', el:() => document.getElementById('des-seg'), go:() => mode('tutti') },
            { t:'Vista Colonne', x:'Colonne: caselle grandi, come nel calendario dei turni.', el:() => document.querySelector('#des-seg button[data-m="cols"]'), go:() => mode('cols') },
            { t:'Vista Anno', x:'Anno: i dodici mesi di una persona in una sola pagina. Dal menu in alto scegli di chi.', el:() => document.querySelector('#des-seg button[data-m="anno"]'), go:() => mode('anno') },
            { t:'L\'anno', x:'Con queste frecce passi da un anno all\'altro.', el:() => document.querySelector('#des-view .des-year'), go:() => mode('tutti') },
            { t:'I tuoi contatori', x:'Qui vedi quante ferie e quanti permessi hai usato. Non puoi superarli. Il quinto giorno di ferie di fila diventa riposo e non scala le ferie.', el:() => document.getElementById('des-sum') },
            { t:'Giorni barrati', x:'Un giorno barrato con la spunta è già stato messo nei turni dal coordinatore, e non si cambia più da qui.', el: meTh },
            { t:'Area admin', x:'Questo tasto è per il coordinatore, durante la riunione. Con la password compare una barra arancione per scrivere in tutte le colonne, barrare e importare le ferie nel calendario turni.', el:() => document.getElementById('des-adm-btn') },
            { t:'Fatto!', x:'Per rivedere questo tutorial tocca il punto di domanda in alto. Buone ferie!', el:() => document.querySelector('#des-view .des-help-btn') }
        ];
    }
    function desTourStart(gesture) {
        vibrate();
        document.getElementById('des-mode-menu').classList.remove('open');
        try { localStorage.setItem('autisti_des_guide', '1'); } catch(e) {}
        desTour = { i:0, playing: !!gesture, mute: !desVoiceOk(), timer:null, steps: desTourSteps(), back: desMode };
        document.getElementById('des-tour').classList.add('open');
        desTourShow(true);
    }
    function desTourEnd() {
        if(!desTour) return;
        clearTimeout(desTour.timer); try { speechSynthesis.cancel(); } catch(e) {}
        document.getElementById('des-wheel').classList.add('collapsed'); desRenderWheel();
        const back = desTour.back; desTour = null;
        document.getElementById('des-tour').classList.remove('open');
        if(desMode !== 'tutti' && back === 'tutti') desSetMode('tutti');
    }
    function desTourShow(first) {
        const T = desTour; if(!T) return;
        T.tok = (T.tok || 0) + 1;
        clearTimeout(T.timer); try { speechSynthesis.cancel(); } catch(e) {}
        const st = T.steps[T.i]; if(st.go) st.go();
        document.getElementById('dt-step').textContent = `Passo ${T.i + 1} di ${T.steps.length}`;
        document.getElementById('dt-title').textContent = st.t;
        document.getElementById('dt-text').textContent = st.x;
        document.getElementById('dt-dots').innerHTML = T.steps.map((_, k) => `<i class="${k === T.i ? 'on' : ''}"></i>`).join('');
        document.getElementById('dt-mute').innerHTML = `<span class="material-icons-round">${T.mute ? 'volume_off' : 'volume_up'}</span>`;
        const play = document.getElementById('dt-play');
        if(!T.playing && first) { play.className = 'dt-start'; play.innerHTML = '<span class="material-icons-round">play_arrow</span>Avvia il tutorial'; }
        else { play.className = 'dt-play'; play.innerHTML = `<span class="material-icons-round">${T.playing ? 'pause' : 'play_arrow'}</span>`; }
        // la luce si sposta sul tasto (dopo che la vista si è ridisegnata)
        setTimeout(() => desTourPlace(st), 80);
        if(T.playing) desTourSpeak(st);
    }
    function desTourPlace(st) {
        const hole = document.getElementById('dt-hole'), card = document.getElementById('dt-card');
        const el = st.el && st.el(); let r = el ? el.getBoundingClientRect() : null;
        if(!r || !r.width) r = { left: innerWidth / 2 - 60, top: innerHeight / 3, width: 120, height: 60, bottom: innerHeight / 3 + 60 };
        const pad = st.pad != null ? st.pad : 6;
        Object.assign(hole.style, { left:(r.left - pad) + 'px', top:(r.top - pad) + 'px', width:(r.width + pad * 2) + 'px', height:(r.height + pad * 2) + 'px', borderRadius: st.round ? '50%' : '14px' });
        hole.classList.add('pulse');
        // la scheda sta dalla parte opposta al tasto illuminato
        const below = (r.top + r.height / 2) < innerHeight / 2;
        if(below) { card.style.top = Math.min(innerHeight - 230, r.bottom + pad + 14) + 'px'; card.style.bottom = 'auto'; }
        else { card.style.bottom = Math.min(innerHeight - 230, innerHeight - r.top + pad + 14) + 'px'; card.style.top = 'auto'; }
    }
    function desTourSpeak(st) {
        const T = desTour; if(!T) return;
        // ogni passo ha il suo numero: la voce (o il timer) di un passo vecchio, interrotta da Avanti/Indietro,
        // non deve far avanzare il passo nuovo (prima saltavano più passi di fila, velocissimi)
        const tok = T.tok;
        const live = () => desTour === T && T.playing && T.tok === tok;
        const next = () => { if(live()) T.timer = setTimeout(() => { if(!live()) return; if(T.i < T.steps.length - 1) { T.i++; desTourShow(); } else { T.playing = false; desTourShow(); } }, 700); };
        if(T.mute || !desVoiceOk()) { T.timer = setTimeout(next, Math.max(3500, st.x.length * 62)); return; }
        const u = new SpeechSynthesisUtterance(st.x);
        u.lang = 'it-IT'; const v = desVoicePick(); if(v) u.voice = v; u.rate = 0.97;
        let done = false; const fin = () => { if(done || !live()) return; done = true; clearTimeout(T.timer); next(); };
        u.onend = fin;
        u.onerror = e => { if(e && (e.error === 'interrupted' || e.error === 'canceled')) return; fin(); };
        // se il telefono non parla (volume o voce mancante) si va avanti comunque; se ha iniziato a parlare si aspetta la fine
        T.timer = setTimeout(fin, Math.max(6000, st.x.length * 95));
        u.onstart = () => { if(!live()) return; clearTimeout(T.timer); T.timer = setTimeout(fin, Math.max(15000, st.x.length * 200)); };
        try { speechSynthesis.speak(u); } catch(e) { fin(); }
    }
    function desTourPlay() {
        const T = desTour; if(!T) return; vibrate();
        if(T.playing) { T.playing = false; clearTimeout(T.timer); try { speechSynthesis.cancel(); } catch(e) {} desTourShow(); return; }
        T.playing = true; if(T.i >= T.steps.length - 1) T.i = 0;
        desTourShow();
    }
    function desTourGo(d) {
        const T = desTour; if(!T) return; vibrate();
        T.i = Math.max(0, Math.min(T.steps.length - 1, T.i + d));
        desTourShow();
    }
    function desTourMute() {
        const T = desTour; if(!T) return; vibrate();
        if(!desVoiceOk()) { desToast('Questo telefono non ha la voce'); return; }
        T.mute = !T.mute; desTourShow();
    }
    window.addEventListener('resize', () => { if(desTour) desTourPlace(desTour.steps[desTour.i]); });

    // ── guida a voce (sintesi vocale del telefono, in italiano) ──
    let desVoiceOn = false;
    function desVoiceOk() { return typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined'; }
    function desVoicePick() {
        const vs = speechSynthesis.getVoices() || [];
        return vs.find(v => /^it[-_]IT/i.test(v.lang) && /google|alice|federica|elsa|luca|paola/i.test(v.name)) || vs.find(v => /^it/i.test(v.lang)) || null;
    }
    function desVoiceText(el) {
        const t = el.cloneNode(true); t.querySelectorAll('.material-icons-round, .dg-n').forEach(x => x.remove());
        const h = t.querySelector(':scope > div > b'), p = t.querySelector('p');
        return ((h ? h.textContent + '. ' : '') + (p ? p.textContent : t.textContent)).replace(/‹\s*2027\s*›|‹[^›]*›/g, 'le frecce dell’anno').replace(/5°/g, 'quinto').replace(/…/g, '').replace(/\s+/g, ' ').trim();
    }
    function desVoiceUi() {
        const b = document.getElementById('dg-voice-btn'); if(!b) return;
        b.classList.toggle('on', desVoiceOn);
        b.innerHTML = desVoiceOn ? '<span class="material-icons-round">stop</span>Ferma' : '<span class="material-icons-round">volume_up</span>Ascolta';
    }
    function desVoiceStop() {
        desVoiceOn = false;
        try { speechSynthesis.cancel(); } catch(e) {}
        document.querySelectorAll('.dg-step.speaking').forEach(x => x.classList.remove('speaking'));
        desVoiceUi();
    }
    function desVoiceToggle() {
        vibrate();
        if(!desVoiceOk()) return;
        if(desVoiceOn) { desVoiceStop(); return; }
        const steps = [...document.querySelectorAll('#dg-body .dg-step')]; if(!steps.length) return;
        desVoiceOn = true; desVoiceUi();
        try { speechSynthesis.cancel(); } catch(e) {}
        const voice = desVoicePick();
        const say = i => {
            document.querySelectorAll('.dg-step.speaking').forEach(x => x.classList.remove('speaking'));
            if(!desVoiceOn || i >= steps.length) { desVoiceStop(); return; }
            const el = steps[i]; el.classList.add('speaking'); el.scrollIntoView({ behavior:'smooth', block:'center' });
            const u = new SpeechSynthesisUtterance(desVoiceText(el));
            u.lang = 'it-IT'; if(voice) u.voice = voice; u.rate = 0.95;
            u.onend = () => { if(desVoiceOn) setTimeout(() => say(i + 1), 350); };
            u.onerror = () => { if(desVoiceOn) say(i + 1); };
            speechSynthesis.speak(u);
        };
        say(0);
    }
    function desGuideClose(e) {
        if(e && e.target !== e.currentTarget) return;
        desVoiceStop();
        const m = document.getElementById('des-guide'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 300);
    }
    // la prima volta su questo telefono la guida si apre da sola (non sul PC del Pronto Soccorso, che chiede il nome)
    function desGuideFirst() {
        if(desIsPS()) return;
        let seen = false; try { seen = !!localStorage.getItem('autisti_des_guide'); } catch(e) { seen = true; }
        if(!seen && desMe()) setTimeout(() => desTourStart(false), 600);
    }

    // ── accesso admin per la riunione (password semplice, solo su questo telefono finché resta aperto) ──
    const DES_ADMIN_H = ['fae848e91ad34aacc53d7afd83762610ce73a840ae9e24ba84dc248725c05346'];
    function desAdminOpen() {
        document.getElementById('des-mode-menu').classList.remove('open');
        if(desAdmin) { desAdminExit(); return; }
        const m = document.getElementById('des-admin'); document.getElementById('da-pw').value = ''; document.getElementById('da-err').textContent = '';
        m.style.display = 'flex'; setTimeout(() => { m.classList.add('open'); document.getElementById('da-pw').focus(); }, 10);
    }
    function desAdminClose(e) {
        if(e && e.target !== e.currentTarget) return;
        const m = document.getElementById('des-admin'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 300);
    }
    async function desAdminLogin() {
        if(!(await pwMatch(document.getElementById('da-pw').value.trim(), DES_ADMIN_H))) { document.getElementById('da-err').textContent = 'Password sbagliata'; vibrate(); return; }
        desAdmin = true; desAdminClose(); vibrate();
        desRenderAll(false); desToast('Admin: puoi modificare le desiderate di tutti');
        if(desMode === 'anno') desSetMode('tutti');
    }
    function desAdminExit() {
        if(desDirty) desSaveNow();
        desAdmin = false; if(desTool === 'B' || desTool === 'I') desTool = 'F';
        desRenderAll(false); desToast('Uscito dall’admin');
    }

    // ── importazione nel calendario turni (admin) ──
    // Le ferie e i permessi desiderati non ancora barrati diventano C.O. e permessi nel calendario
    // dell'anno; le caselle che hanno già un'assenza non si toccano; i giorni importati si barrano.
    // L'anno dopo è già nel calendario (sotto dicembre), quindi si può importare anche prima di capodanno.
    // Le ferie di gennaio-marzo importate così portano coY (l'anno a cui contano): senza, lì un C.O.
    // varrebbe come ferie dell'anno in corso e a capodanno diventerebbe "ferie residue".
    function desImportEarly() { return desYear === activeYear + 1; }
    // only: { d, keys:Set } per importare un solo periodo; senza, tutte le desiderate non barrate
    function desImportPlan(only) {
        const y = desYear, plan = [], skipped = [], rest = [], early = desImportEarly();
        (only ? [only.d] : desCols()).forEach(d => {
            const res = desResolve(desDaysOf(d), y), ok = desOkOf(d), orig = d.originalName || d.name;
            Object.keys(res).forEach(key => {
                if(only && !only.keys.has(key)) return;
                const r = res[key]; if(ok[key]) return;
                if(r.t === 'R') { rest.push({ d, key }); return; }   // il riposo del 5° giorno entra come riposo (R/r) insieme al suo periodo
                const [mm, dd] = key.split('-').map(Number);
                plan.push({ d, key, m: mm - 1, cell: `${orig}__${Object.keys(MONTH_MAP)[mm - 1]}-${dd}`, sub: r.t === 'F' ? 'f' : 'p', coY: early && r.t === 'F' && mm <= CO_CARRY_MONTHS ? y : 0 });
            });
        });
        return { plan, skipped, rest };
    }
    function desImportCheck() {
        const y = desYear;
        if(typeof dataSourceMode !== 'undefined' && dataSourceMode !== 'firebase') { alert('L’importazione funziona solo con i turni su Firebase.'); return false; }
        if(activeYear !== y && !desImportEarly()) { alert(`Il calendario turni ${y} non c’è (ora è aperto il ${activeYear}).`); return false; }
        return true;
    }
    // tasto Importa della ruota: tutte le desiderate oppure un periodo alla volta (si tocca)
    async function desImportAsk() {
        if(!desAdmin) return;
        document.getElementById('des-wheel').classList.add('collapsed');
        if(!desImportCheck()) return;
        const all = desImportPlan();
        if(!all.plan.length) { desToast('Niente da importare: tutti i giorni sono già barrati'); return; }
        const ch = await ccDialog('Importa nel calendario turni', `Le ferie entrano come C.O., i permessi come permessi e il 5° giorno di ferie di fila come riposo nel calendario turni ${desYear}. I giorni importati vengono barrati.`, [
            { label:'Scegli un periodo (tocca i giorni)', kind:'primary', value:'one' },
            { label:`Importa tutte (${all.plan.length} giorni)`, kind:'', value:'all' },
            { label:'Annulla', kind:'ghost', value:null }]);
        if(ch === 'one') { desTool = 'I'; desRenderWheel(); desToast('Tocca un periodo di ferie o permessi da importare'); return; }
        if(ch === 'all') desImportConfirm(all);
    }
    // giorni di fila con ferie, permessi o riposo attorno a quello toccato (nella colonna di quella persona)
    function desImportPeriodAt(key, d) {
        const res = desResolve(desDaysOf(d), desYear), all = desYearDays(desYear).map(x => x.key), i = all.indexOf(key);
        if(i < 0 || !res[key]) return null;
        let a = i, b = i; while(a > 0 && res[all[a - 1]]) a--; while(b < all.length - 1 && res[all[b + 1]]) b++;
        return new Set(all.slice(a, b + 1));
    }
    function desImportTap(key, d) {
        if(!desImportCheck()) return;
        const keys = desImportPeriodAt(key, d);
        if(!keys) { desToast('Tocca un giorno con ferie o permesso'); return; }
        const pl = desImportPlan({ d, keys });
        if(!pl.plan.length) { desToast('Questo periodo è già barrato'); return; }
        desImportConfirm(pl, d);
    }
    function desImportConfirm(pl, one) {
        const { plan, rest } = pl, y = desYear;
        const people = new Set(plan.map(p => p.d.idx)).size, f = plan.filter(p => p.sub === 'f').length, p = plan.length - f;
        const ks = plan.map(x => x.key).sort(), fmt = k => { const [m, g] = k.split('-').map(Number); return new Date(y, m - 1, g).toLocaleDateString('it-IT', { day:'numeric', month:'short' }); };
        const what = one ? `${one.name}, dal ${fmt(ks[0])} al ${fmt(ks[ks.length - 1])}` : `di ${people} ${people === 1 ? 'persona' : 'persone'}`;
        const nr = (rest || []).filter(r => plan.some(x => x.d === r.d)).length;
        if(!confirm(`Importare nel calendario turni ${y} (${what}):\n• ${f} giorni di ferie (C.O.)\n• ${p} permessi${nr ? `\n• ${nr} ${nr === 1 ? 'riposo' : 'riposi'} (5° giorno di ferie di fila)` : ''}\n\nLe caselle che hanno già un’assenza non vengono toccate. Prima si fa una copia di sicurezza; i giorni importati vengono barrati.`)) return;
        desImportRun(plan, rest);
    }
    async function desImportRun(plan, rest) {
        try {
            desToast('Importo…');
            await takeSnapshot('prima-import-desiderate');
            const y = desYear, MN = Object.keys(MONTH_MAP), docs = {};
            rest = (rest || []).map(r => { const [mm, dd] = r.key.split('-').map(Number); return Object.assign({ m: mm - 1, cell: `${r.d.originalName || r.d.name}__${MN[mm - 1]}-${dd}` }, r); });
            const months = [...new Set(plan.map(p => p.m).concat(rest.map(r => r.m)))];
            for(const m of months) { const s = await cfgRef(monthDocName(y, m)).get(); docs[m] = s.exists ? (s.data().cells || {}) : {}; }
            const batch = db.batch(), byMonth = {}, done = [], kept = [], rested = [];
            plan.forEach(p => {
                const cur = docs[p.m][p.cell] || {};
                if(String(cur.subV || '').trim()) { kept.push(p); return; }   // c'è già un'assenza
                (byMonth[p.m] = byMonth[p.m] || {})[p.cell] = Object.assign({ v: cur.v || '', subV: p.sub }, p.coY ? { coY: p.coY } : {});
                done.push(p);
            });
            // il 5° giorno di ferie di fila entra come riposo: R per i turnisti, r per i diurnisti
            // (si capisce dai turni già scritti di quella persona; se non ce ne sono, dal mese in corso)
            const diurno = {};
            const isDiurno = async d => {
                const orig = d.originalName || d.name; if(orig in diurno) return diurno[orig];
                const look = cells => { for(const [k, c] of Object.entries(cells || {})) { if(!k.startsWith(orig + '__')) continue; const v = String((c && c.v) || '').trim(); if(v && v !== '-') return /^[a-z]/.test(v); } return null; };
                let r = null; for(const m of months) { r = look(docs[m]); if(r !== null) break; }
                if(r === null) { try { const s = await cfgRef(monthDocName(activeYear, new Date().getMonth())).get(); r = look(s.exists ? s.data().cells : {}); } catch(e) {} }
                return (diurno[orig] = r === true);
            };
            for(const r of rest) {
                if(!done.some(p => p.d === r.d)) continue;   // solo nei periodi importati adesso
                const cur = docs[r.m][r.cell] || {};
                if(String(cur.subV || '').trim()) continue;   // c'è già un'assenza
                (byMonth[r.m] = byMonth[r.m] || {})[r.cell] = { v: (await isDiurno(r.d)) ? 'r' : 'R', subV: '' };
                rested.push(r);
            }
            const now = new Date().toISOString();
            Object.keys(byMonth).forEach(m => batch.set(cfgRef(monthDocName(y, +m)), { cells: byMonth[m], updatedAt: now }, { merge:true }));
            if(done.length) addLogWrite(batch, [], `Ferie desiderate importate nel ${y}: ${done.length} giorni${rested.length ? ' + ' + rested.length + ' riposi (5° giorno)' : ''} (${new Set(done.map(p => p.d.idx)).size} persone)`);
            await batch.commit();
            // si barrano i giorni importati
            const byD = new Map(); done.forEach(p => { if(!byD.has(p.d)) byD.set(p.d, []); byD.get(p.d).push(p.key); });
            rest.forEach(r => { if(byD.has(r.d)) byD.get(r.d).push(r.key); });   // anche il riposo del 5° giorno di quei periodi
            byD.forEach((keys, d) => desToggleOk(keys, d, true));
            desToast(`Importati ${done.length} giorni${rested.length ? ` e ${rested.length} ${rested.length === 1 ? 'riposo' : 'riposi'}` : ''}${kept.length ? ` · ${kept.length} lasciati com’erano (c’era già un’assenza)` : ''}`);
        } catch(e) {
            console.error('Importazione desiderate:', e);
            alert('Importazione non riuscita: ' + (e && e.message || e));
        }
    }

    // ── ruota degli strumenti ──
    function desRenderWheel() {
        const w = document.getElementById('des-wheel'); if(!w) return;
        w.classList.toggle('readonly', !desMe() && !desAll());
        const S = 250, c = S / 2, r0 = 46, r1 = 118;
        // ruota semplice: solo i quattro strumenti di tutti i giorni (Dal… al… e l'admin hanno i loro tasti in alto)
        const ids = ['F', 'P', 'X', 'N'], step = 360 / ids.length;
        const items = ids.map((id, i) => [id, i * step]);
        let paths = '', lbls = '';
        items.forEach(([id, a]) => {
            const a0 = a - step / 2 + 1.5, a1 = a + step / 2 - 1.5;
            const k = id === 'R' ? { label:'Dal… al…', bg:'#1d4ed8', fg:'#fff', icon:'date_range' } : DES_KINDS[id];
            paths += `<path class="dw-seg${desTool === id ? ' sel' : ''}" d="${annularSector(c, c, r0, r1, a0, a1)}" style="fill:${k.bg}" onclick="desPickTool('${id}')"><title>${esc(k.label)}</title></path>`;
            const [x, y] = polar(c, c, (r0 + r1) / 2, a);
            lbls += `<div class="dw-lbl" style="left:${x}px;top:${y}px;color:${k.fg}"><span class="material-icons-round">${k.icon}</span>${esc(k.label)}</div>`;
        });
        document.getElementById('dw-ring').innerHTML = `<svg viewBox="0 0 ${S} ${S}">${paths}</svg>${lbls}`;
        const k = DES_KINDS[desTool];
        const now = { F:'Metti <b>FERIE</b>: tocca i giorni', P:'Metti <b>PERMESSO</b>: tocca i giorni', X:'<b>CANCELLA</b>: tocca i giorni', N:'<b>NOTA</b>: tocca un giorno', B:'<b>BARRA</b>: tocca i giorni già nei turni', I:'<b>IMPORTA</b>: tocca un periodo' }[desTool] || '';
        let nw = document.getElementById('dw-now'); if(!nw) { nw = document.createElement('div'); nw.id = 'dw-now'; nw.className = 'dw-now'; nw.onclick = desToggleWheel; w.appendChild(nw); }
        nw.innerHTML = now;
        document.getElementById('dw-hub').innerHTML = `<span class="dw-hub-sw" style="background:${k.bg};color:${k.fg}">${desTool === 'X' || desTool === 'N' || desTool === 'B' || desTool === 'I' ? `<span class="material-icons-round">${k.icon}</span>` : (desTool === 'F' ? 'FERIE' : 'PERM.')}</span><small>${w.classList.contains('collapsed') ? 'strumenti' : 'chiudi'}</small>`;
        document.getElementById('dw-caption').innerHTML = desTool === 'I' ? 'Tocca un <b>periodo</b> di ferie o permessi: lo importo nel calendario turni e lo barro' : desTool === 'B' ? 'Tocca un giorno per <b>barrarlo</b> (già inserito nei turni); ritocca per togliere<br><small>Tieni premuto e trascina per più giorni</small>' : desTool === 'N' ? 'Tocca un tuo giorno per <b>scrivere una nota</b>' : (desTool === 'X' ? 'Tocca una tua casella per <b>cancellarla</b>' : `Tocca una tua casella per mettere <b>${esc(k.label.toLowerCase())}</b>; ritocca per togliere`) + '<br><small>Tieni premuto e trascina per più giorni</small>';
    }
    function desToggleWheel() { vibrate(); const w = document.getElementById('des-wheel'); w.classList.toggle('collapsed'); desRenderWheel(); }
    function desPickTool(id) {
        vibrate();
        document.getElementById('des-wheel').classList.add('collapsed');
        if(id === 'R') { desRenderWheel(); desOpenRange(); return; }
        if(id === 'I') { desRenderWheel(); desImportAsk(); return; }
        desTool = id; desRenderWheel(); desRenderAdmBar();
        desToast(id === 'B' ? 'Strumento: barra i giorni già inseriti nei turni' : id === 'X' ? 'Strumento: cancella' : id === 'N' ? 'Strumento: nota. Tocca un tuo giorno' : 'Strumento: ' + DES_KINDS[id].label.toLowerCase());
    }

    // ── periodo dal… al… ──
    function desRangeWho() { const s = document.getElementById('dr-who'); return desAll() && s && s.value ? desDriverByIdx(s.value) : desMe(); }
    function desOpenRange() {
        if(desPSNeed(desOpenRange)) return;   // PC Pronto Soccorso: prima "a nome di chi"
        if(!desMe() && !desAll()) { desOtherTap(); return; }
        const sw = document.getElementById('dr-who-row');
        sw.style.display = desAll() ? '' : 'none';
        if(desAll()) { const opD = desIsPS() ? desDriverOf(desPSOperator()) : null, def = desMode === 'anno' && desYgWho != null ? desYgWho : (desMe() ? desMe().idx : opD ? opD.idx : null); document.getElementById('dr-who').innerHTML = desCols().map(d => `<option value="${d.idx}"${d.idx === def ? ' selected' : ''}>${esc(d.name)}</option>`).join(''); }
        vibrate();
        const y = desYear, f = document.getElementById('dr-from'), t = document.getElementById('dr-to');
        f.min = t.min = y + '-01-01'; f.max = t.max = y + '-12-31';
        if(!f.value || +f.value.slice(0, 4) !== y) { f.value = ''; t.value = ''; }
        desRangeKind = desTool === 'X' ? 'X' : (desTool === 'P' ? 'P' : 'F');
        desRangePreview();
        const m = document.getElementById('des-range'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10);
    }
    function desCloseRange(e) {
        if(e && e.target !== e.currentTarget) return;
        const m = document.getElementById('des-range'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 300);
    }
    function desRangeSel(kind) { desRangeKind = kind; vibrate(); desRangePreview(); }
    function desRangeKeys() {
        const f = document.getElementById('dr-from').value, t = document.getElementById('dr-to').value;
        if(!f || !t) return null;
        let a = new Date(f + 'T00:00:00'), b = new Date(t + 'T00:00:00'); if(a > b) [a, b] = [b, a];
        return desYearDays(desYear).filter(x => x.date >= a && x.date <= b);
    }
    function desRangePreview() {
        document.getElementById('dr-kinds').innerHTML = ['F', 'P', 'X'].map(k => `<button class="${desRangeKind === k ? 'on' : ''}" onclick="desRangeSel('${k}')"><i style="background:${DES_KINDS[k].bg}"></i>${DES_KINDS[k].label}</button>`).join('');
        const list = desRangeKeys(), pv = document.getElementById('dr-preview'), go = document.getElementById('dr-go');
        if(!list || !list.length) { pv.innerHTML = 'Scegli il primo e l’ultimo giorno del periodo.'; go.disabled = true; return; }
        go.disabled = false;
        const fmt = d => d.toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'short' });
        const range = `<b>${list.length} ${list.length === 1 ? 'giorno' : 'giorni'}</b>, ${fmt(list[0].date)} → ${fmt(list[list.length - 1].date)}`;
        if(desRangeKind === 'X') { pv.innerHTML = range + '<br>Le tue desiderate di questi giorni si cancellano.'; return; }
        // anteprima con la regola del 5° giorno
        // simulazione con il blocco delle spettanze
        const me = desRangeWho(), al = desAllow(me), days = Object.assign({}, desDaysOf(me)); let skip = 0;
        list.forEach(x => { if(days[x.key] === desRangeKind) return; const was = days[x.key], b = desCount(days, desYear); days[x.key] = desRangeKind; const c = desCount(days, desYear); if((c.f > al.co && c.f > b.f) || (c.p > al.sp && c.p > b.p)) { if(was) days[x.key] = was; else delete days[x.key]; skip++; } });
        const res = desResolve(days, desYear); let f = 0, p = 0, auto = [];
        list.forEach(x => { const r = res[x.key]; if(!r) return; if(r.t === 'F') f++; else if(r.t === 'R') auto.push(r.n + '°'); else p++; });
        pv.innerHTML = range + `<br>Diventano <b>${f} ${f === 1 ? 'giorno' : 'giorni'} di ferie</b>` + (p ? ` e <b>${p} ${p === 1 ? 'permesso' : 'permessi'}</b>` : '') + (auto.length ? ` + <b>${auto.length} ${auto.length === 1 ? 'riposo' : 'riposi'}</b> (il ${auto.join(', ')} giorno di fila è riposo e non scala le ferie)` : '') + '.' + (skip ? `<br><b style="color:#b91c1c">${skip} ${skip === 1 ? 'giorno resta fuori' : 'giorni restano fuori'}: superano le tue spettanze (${al.co} ferie, ${al.sp} permessi).</b>` : '');
    }
    function desApplyRange() {
        const list = desRangeKeys(); if(!list || !list.length) return;
        const n = desSetDays(list.map(x => [x.key, desRangeKind === 'X' ? null : desRangeKind]), desRangeWho());
        desCloseRange();
        desToast(n ? (desRangeKind === 'X' ? 'Cancellati ' + n + ' giorni' : 'Inseriti ' + n + ' giorni') : 'Nessun cambiamento');
        // porta il periodo sullo schermo
        setTimeout(() => {
            const tr = document.querySelector(`#des-body tr[data-key="${list[0].key}"]`), sc = document.getElementById('des-scroll');
            if(tr && sc) { const th = document.querySelector('#des-table thead th'); sc.scrollTo({ top: Math.max(0, tr.offsetTop - (th ? th.offsetHeight : 40) - 46), behavior:'smooth' }); }
        }, 320);
    }

    function openFerieAdvice(kind) { vibrate(); setCalView('insieme', { advice:true, kind: kind || 'ferie' }); }
    function ovToggleAdvice() { vibrate(); ovAdvice = !ovAdvice; document.body.classList.toggle('ov-adv', ovAdvice); renderOverview(); setTimeout(ovScrollStart, 30); }
    // con i consigli si parte dall'alto (consigli e subito sotto il mese corrente), senza si va a oggi
    function ovScrollStart() { if(ovAdvice) { const sc = document.getElementById('ov-scroll'); if(sc) sc.scrollTop = 0; } else ovScrollToday(); }
    function ovAdvSetKind(k) { vibrate(); if(ovAdvKind === k) return; ovAdvKind = k; ovAdvMonth = null; renderOverview(true); }
    function renderOverviewSoon() { clearTimeout(ovRenderTimer); ovRenderTimer = setTimeout(() => { if(calOverview) renderOverview(true); }, 250); }
    function renderOverview(keepScroll) {
        const box = document.getElementById('ov-body'); if(!box || !calOverview) return;
        if(!finalData.length) { box.innerHTML = '<div class="coord-sync-empty">Sto caricando i turni…</div>'; return; }
        const sc = document.getElementById('ov-scroll'), top = sc.scrollTop;
        const me = prefMe(), perm = ovAdvKind === 'perm', PR = permRules();
        let active = drivers.filter(d => !d.hidden);
        if(me && prefs.myColFirst && active.includes(me)) active = [me].concat(active.filter(d => d !== me));
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const head = `<tr><th class="ov-d">Giorno</th>${active.map(d => `<th class="ov-op ${me && d.idx === me.idx ? 'me' : ''}" title="${esc(d.name)}"><span>${esc(d.name)}</span></th>`).join('')}<th class="ov-s" title="${perm ? 'Persone con permesso o recupero' : 'Persone in ferie'}">${perm ? 'Perm.' : 'Ferie'}</th></tr>`;
        let html = '', lastM = -1; ovInfo = {};
        // con i consigli ferie/permessi i mesi passati non servono: si parte dal mese corrente
        const fromDate = (ovAdvice || liteOn()) && SHIFT_YEAR === today.getFullYear() ? new Date(SHIFT_YEAR, today.getMonth(), 1) : null;
        buildDaysIndex().forEach(dd => {
            if(fromDate && dd.date < fromDate) return;
            if(dd.monthIdx !== lastM) {
                lastM = dd.monthIdx;
                html += `<tr class="ov-mh" id="ov-m-${lastM}"><td colspan="${active.length + 2}">${MONTH_NAMES_IT[lastM]} ${SHIFT_YEAR}</td></tr>`;
            }
            const f = perm ? permDay(dd, active, me) : ferieDay(dd, active); ovInfo[dd.rowIdx] = f;
            const red = dd.date.getDay() === 0 || dd.date.getDay() === 6 || HOLIDAYS[`${dd.monthIdx}-${dd.day}`];
            const isToday = dd.date.getTime() === today.getTime();
            const wd = dd.date.toLocaleDateString('it-IT', { weekday:'short' }).slice(0, 2);
            let cells = '';
            active.forEach(d => {
                const info = computeDayInfo(dd.rowIdx, d.idx), meta = ccCodeMeta(info);
                const mine = me && d.idx === me.idx ? ' me' : '';
                if(meta.kind === 'empty') { cells += `<td class="ov-c e${mine}"></td>`; return; }
                const col = meta.colors ? `--sw:var(${meta.colors.bg});--sf:var(${meta.colors.fg})` : (info.code === 'gr' ? '--sw:#ec4899;--sf:#fff' : '');
                cells += `<td class="ov-c${mine}" style="${col}">${esc(meta.short)}</td>`;
            });
            const sum = perm ? `${f.perm.length}<small style="opacity:.7">/${PR.max}</small>` : `${f.fer.length}<small style="opacity:.7">/${ferieRules.max}</small>`;
            html += `<tr class="ov-row${isToday ? ' ov-today' : ''}${dd.date.getDay() === 0 ? ' week-end' : ''}" id="ov-r-${dd.rowIdx}" onclick="ovDayTap(${dd.rowIdx})"><td class="ov-d ${red ? 'red' : ''} ${f.status}"><b>${dd.day}</b><small>${wd}</small></td>${cells}<td class="ov-s ${f.status}">${sum}</td></tr>`;
        });
        box.innerHTML = `<table class="ov-table" id="ov-table"><thead>${head}</thead><tbody>${html}</tbody></table>`;
        ovFitCells(active.length);
        document.getElementById('ov-sub').textContent = `${active.length} operatori · anno ${SHIFT_YEAR}`;
        renderOvAdvice();
        if(keepScroll) sc.scrollTop = top;
    }
    function ovFitCells(n) {
        const sc = document.getElementById('ov-scroll'), t = document.getElementById('ov-table'); if(!sc || !t) return;
        n = n || drivers.filter(d => !d.hidden).length;
        t.classList.toggle('tiny', (sc.clientWidth - 8 - 42 - 34) / Math.max(1, n) < 18);
    }
    window.addEventListener('resize', () => { if(calOverview) ovFitCells(); });
    function renderOvAdvice() {
        const el = document.getElementById('ov-advice'); if(!el) return;
        const btn = document.getElementById('ov-adv-btn'); if(btn) btn.classList.toggle('on', ovAdvice);
        if(!ovAdvice) { el.innerHTML = ''; ovMiniRender(); return; }
        const perm = ovAdvKind === 'perm', me = prefMe();
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const card = p => `<button class="ov-per ${p.minFree <= 1 ? 'last' : ''}" onclick="ovScrollTo('ov-r-${p.row}')"><b>${p.label}</b><small>${p.n} giorni · ${p.minFree <= 1 ? '1 posto libero' : 'almeno ' + p.minFree + ' posti'}</small></button>`;
        // mesi ancora utili: da quello corrente (se l'anno è questo) a dicembre
        const first = SHIFT_YEAR === today.getFullYear() ? today.getMonth() : (SHIFT_YEAR > today.getFullYear() ? 0 : 12);
        const months = []; for(let m = first; m < 12; m++) months.push(m);
        // giorni liberi per mese (da oggi in poi), per il numerino sui mesi e per il riepilogo
        const active = drivers.filter(d => !d.hidden), byMonth = {};
        buildDaysIndex().forEach(dd => {
            if(dd.date < today) return;
            const st = (ovInfo[dd.rowIdx] || (perm ? permDay(dd, active, me) : ferieDay(dd, active))).status;
            const b = byMonth[dd.monthIdx] = byMonth[dd.monthIdx] || { ok:0, last:0, no:0, off:0, free:[] };
            b[st]++; if(st === 'ok' || st === 'last') b.free.push(dd);
        });
        if(ovAdvMonth === null || !months.includes(ovAdvMonth)) ovAdvMonth = months.find(x => byMonth[x] && byMonth[x].free.length) ?? (months.length ? months[0] : 0);
        const dayBtn = dd => { const f = ovInfo[dd.rowIdx] || {}; const sh = perm && f.myShift ? ' · ' + (SHIFT_NAMES[f.myShift] || f.myShift).toLowerCase() : '';
            return `<button class="ov-per ${f.status === 'last' ? 'last' : ''}" onclick="ovScrollTo('ov-r-${dd.rowIdx}')"><b>${frShort(dd.date)}</b><small>${dd.date.toLocaleDateString('it-IT', { weekday:'long' })}${sh}</small></button>`; };
        const monthsRow = m => `<div class="ov-months">${months.map(x => { const n = (byMonth[x] || { free:[] }).free.length; return `<button class="${x === m ? 'on' : ''}" onclick="ovAdvSetMonth(${x})">${MONTH_NAMES_IT[x].slice(0, 3)}<b>${n}</b></button>`; }).join('')}</div>`;
        const sumLine = (m, b) => `<div class="ov-sum-line"><b>${MONTH_NAMES_IT[m].charAt(0).toUpperCase() + MONTH_NAMES_IT[m].slice(1)}:</b> <span class="g">${b.ok} consigliati</span> · <span class="y">${b.last} ${perm ? 'al limite' : 'con un solo posto'}</span> · <span class="r">${b.no} sconsigliati</span>${perm && me ? ` · ${b.off} in cui non lavori` : ''}</div>`;
        let list;
        if(perm) {
            if(ovAdvMode === 'mese') {
                const m = ovAdvMonth, b = byMonth[m] || { ok:0, last:0, no:0, off:0, free:[] };
                list = monthsRow(m) + sumLine(m, b) + (b.free.length ? `<div class="ov-periods">${b.free.map(dayBtn).join('')}</div>` : `<div class="ov-none">In ${MONTH_NAMES_IT[m]} non ci sono giorni consigliati per un permesso o un recupero.</div>`);
            } else {
                const all = months.flatMap(m => (byMonth[m] || { free:[] }).free);
                list = all.length ? `<div class="ov-sum-line">${all.length} giorni consigliati da oggi a fine anno${me ? ' tra quelli in cui lavori' : ''}</div><div class="ov-periods">${all.map(dayBtn).join('')}</div>`
                    : `<div class="ov-none">Da oggi a fine anno non ci sono giorni consigliati per un permesso o un recupero.</div>`;
            }
            if(!me) list += `<div class="ov-none">Scegli chi sei (Menu › Altro › Cambia utente) per vedere solo i giorni in cui lavori e se la tua assenza lascerebbe scoperto il turno.</div>`;
        } else if(ovAdvMode === 'mese') {
            const m = ovAdvMonth, from = new Date(SHIFT_YEAR, m, 1), to = new Date(SHIFT_YEAR, m + 1, 0);
            const P = feriePeriods(ferieRules, from < today ? today : from, to), b = byMonth[m] || { ok:0, last:0, no:0, off:0, free:[] };
            list = monthsRow(m) + sumLine(m, b) + (P.length ? `<div class="ov-periods">${P.map(card).join('')}</div>${(() => { const single = b.free.filter(dd => !P.some(p => dd.date >= p.start && dd.date <= p.end)); return single.length ? `<div class="ov-none">Altri giorni liberi (singoli o brevi):</div><div class="ov-periods">${single.map(dayBtn).join('')}</div>` : ''; })()}`
                : (b.free.length ? `<div class="ov-none">Nessun periodo di almeno ${ferieRules.minDays} giorni di fila. Giorni singoli disponibili:</div><div class="ov-periods">${b.free.map(dayBtn).join('')}</div>`
                : `<div class="ov-none">In ${MONTH_NAMES_IT[m]} non ci sono giorni disponibili per le ferie.</div>`));
        } else {
            const P = feriePeriods(ferieRules, today);
            list = P.length ? `<div class="ov-sum-line">${P.length} ${P.length === 1 ? 'periodo disponibile' : 'periodi disponibili'} da oggi a fine anno (di almeno ${ferieRules.minDays} giorni)</div><div class="ov-periods">${P.map(card).join('')}</div>`
                : `<div class="ov-none">Da oggi a fine anno non ci sono periodi di almeno ${ferieRules.minDays} giorni senza ostacoli.</div>`;
        }
        el.innerHTML = `<div class="ov-adv-seg kind"><button class="${perm ? '' : 'on'}" onclick="ovAdvSetKind('ferie')">Ferie</button><button class="${perm ? 'on' : ''}" onclick="ovAdvSetKind('perm')">Permessi e recuperi</button></div>
            <div class="ov-legend"><span><i style="background:#22c55e"></i>Consigliato</span><span><i style="background:#f59e0b"></i>${perm ? 'Al limite' : 'Un solo posto libero'}</span><span><i style="background:#ef4444"></i>Sconsigliato</span>${perm && me ? '<span><i style="background:#cbd5e1"></i>Non lavori</span>' : ''}<span style="margin-left:auto">tocca un giorno per i dettagli</span></div>
            <div class="ov-rules">${esc(perm ? permRulesText(ferieRules) : ferieRulesText(ferieRules))}</div>
            <div class="ov-adv-seg"><button class="${ovAdvMode === 'tutti' ? 'on' : ''}" onclick="ovAdvSetMode('tutti')">${perm ? 'Tutti i giorni' : 'Tutti i periodi'}</button><button class="${ovAdvMode === 'mese' ? 'on' : ''}" onclick="ovAdvSetMode('mese')">Per mese</button></div>
            ${list}`;
        ovMiniRender();
    }
    // Posti disponibili: tutti da oggi, oppure un mese alla volta.
    var ovAdvMode = 'tutti', ovAdvMonth = null;
    function ovAdvSetMode(m) { vibrate(); ovAdvMode = m; renderOvAdvice(); if(m === 'mese') ovScrollTo('ov-m-' + ovAdvMonth); }
    function ovAdvSetMonth(m) { vibrate(); ovAdvMonth = m; renderOvAdvice(); ovScrollTo('ov-m-' + m); }
    function ovScrollTo(id) {
        const sc = document.getElementById('ov-scroll'), el = document.getElementById(id); if(!sc || !el) return;
        const headH = (document.querySelector('#ov-table thead') || { offsetHeight:0 }).offsetHeight;
        sc.scrollTo({ top: sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - headH - 8, behavior:'smooth' });
        el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200);
    }
    function ovScrollToday() {
        const el = document.querySelector('#ov-table tr.ov-today'); if(!el) return;
        const sc = document.getElementById('ov-scroll'), headH = document.querySelector('#ov-table thead').offsetHeight;
        sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - headH - 60;
    }
    function ovDayTap(r) {
        vibrate();
        const dd = buildDaysIndex().find(x => x.rowIdx === r), f = ovInfo[r]; if(!dd || !f) return;
        const active = drivers.filter(d => !d.hidden), me = prefMe(), perm = ovAdvKind === 'perm', PR = permRules();
        const chip = (d, extra) => { const meta = ccCodeMeta(computeDayInfo(r, d.idx)); const st = meta.colors ? `--sw:var(${meta.colors.bg});--sf:var(${meta.colors.fg})` : ''; return `<span class="ovs-chip" style="${st}">${esc(d.name)}${extra ? ' · ' + esc(extra) : ''}</span>`; };
        const groups = { M:[], P:[], N:[] };
        active.forEach(d => { const c = workCode(r, d.idx); if(c === 'M' || c === 'm' || c === 'M+N') groups.M.push(d); if(c === 'P' || c === 'p') groups.P.push(d); if(c === 'N' || c === 'M+N') groups.N.push(d); });
        const absent = active.filter(d => computeDayInfo(r, d.idx).justified);
        const fer = f.fer || [], permList = perm ? f.perm : absent.filter(d => PR.codes.includes(computeDayInfo(r, d.idx).code));
        const title = dd.date.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' });
        const why = `<ul>${f.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
        let badge;
        if(perm) badge = f.status === 'off' ? `<b>Quel giorno non lavori</b> — ${f.meAbsent ? 'sei già assente' : 'sei di riposo o di smonto'}: non serve un permesso.`
            : f.status === 'no' ? `<b>Sconsigliato per un permesso o un recupero</b>${why}`
            : f.status === 'last' ? `<b>Possibile, ma al limite</b> — ${f.perm.length} con permesso o recupero, ${f.absent.length} assenti in totale.`
            : `<b>Consigliato per un permesso o un recupero</b>${f.myShift ? ' — faresti ' + esc((SHIFT_NAMES[f.myShift] || f.myShift).toLowerCase()) + '.' : '.'}`;
        else badge = f.status === 'no' ? `<b>Sconsigliato per le ferie</b>${why}`
            : (f.status === 'last' ? `<b>Ultimo posto libero</b> — ${fer.length} in ferie su ${ferieRules.max}.` : `<b>Consigliato</b> — ${f.free} posti liberi su ${ferieRules.max}.`);
        let mine = '';
        if(me) { const info = computeDayInfo(r, me.idx); const meta = ccCodeMeta(info); mine = `<div class="ovs-sec">Tu</div><div class="ovs-chips">${chip(me, meta.kind === 'abs' ? meta.label.toLowerCase() : (SHIFT_NAMES[info.code] || info.label || 'libero'))}</div>`; }
        const others = absent.filter(d => !fer.includes(d) && !permList.includes(d));
        const list = (label, arr, extra) => `<div class="ovs-sec">${label} (${arr.length})</div>${arr.length ? `<div class="ovs-chips">${arr.map(d => chip(d, extra ? extra(d) : '')).join('')}</div>` : '<div class="ovs-empty">Nessuno</div>'}`;
        document.getElementById('ov-sheet-card').innerHTML = `
            <div class="ovs-head"><b>${esc(title.charAt(0).toUpperCase() + title.slice(1))}</b><button onclick="ovCloseSheet()" aria-label="Chiudi"><span class="material-icons-round">close</span></button></div>
            <div class="ovs-badge ${f.status}">${badge}</div>
            ${mine}
            ${list('In ferie', fer)}
            ${list('Permessi e recuperi', permList, d => ccCodeMeta(computeDayInfo(r, d.idx)).label.toLowerCase())}
            ${list('Altre assenze', others, d => ccCodeMeta(computeDayInfo(r, d.idx)).label.toLowerCase())}
            ${['M','P','N'].map(k => `<div class="ovs-sec">${FR_SHIFT[k]} (${groups[k].length}${coverageMin[k] ? ' su ' + coverageMin[k] : ''})</div>${groups[k].length ? `<div class="ovs-chips">${groups[k].map(d => chip(d)).join('')}</div>` : '<div class="ovs-empty">Nessuno</div>'}`).join('')}
            <div class="ovs-actions"><button onclick="ovCloseSheet()">Chiudi</button><button class="pri" onclick="ovGoToDay(${r})">Apri nel calendario</button></div>`;
        document.getElementById('ov-sheet').classList.add('open');
    }
    function ovCloseSheet(e) { if(e && e.target !== e.currentTarget) return; const s = document.getElementById('ov-sheet'); if(s) s.classList.remove('open'); }
    function ovGoToDay(r) {
        setCalView('dettaglio');
        liteShowRow(r);
        setTimeout(() => liteScrollTo(document.querySelector(`#table-body tr[data-row="${r}"]`), 200), 120);
    }

