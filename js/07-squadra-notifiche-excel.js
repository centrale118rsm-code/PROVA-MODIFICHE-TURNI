    // ═══ CONDIVIDI L'APP SU WHATSAPP ════════════════════════════════════
    function shareAppWhatsApp() {
        vibrate();
        const url = location.origin + location.pathname.replace(/index\.html$/, '');
        const msg = `Ciao! Questa è l’app dei turni degli autisti soccorritori del 118: ${url}\n\nPer averla sul telefono come un’app:\n• Android: aprila con Chrome, tocca ⋮ e poi “Aggiungi a schermata Home”\n• iPhone: aprila con Safari, tocca Condividi e poi “Aggiungi alla schermata Home”`;
        window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
        closeMenu();
    }

    // ═══ AREA COORDINATORE: REGOLE FERIE E PERMESSI ══════════════════════
    let frDraft = null;
    function renderCcFerie() {
        const main = document.getElementById('cc-main');
        if(!frDraft) frDraft = JSON.parse(JSON.stringify(ferieRules));
        frDraft.perm = Object.assign({}, PERM_DEFAULT, frDraft.perm || {});
        if(!frDraft.totalMax) frDraft.totalMax = FERIE_DEFAULT.totalMax;
        if(!Array.isArray(frDraft.totalCodes)) frDraft.totalCodes = FERIE_DEFAULT.totalCodes.slice();
        const D = frDraft, PD = D.perm;
        const chk = (list, k, label) => `<label class="fr-chk"><input type="checkbox" ${D[list].includes(k) ? 'checked' : ''} onchange="frToggle('${list}','${k}',this.checked)">${esc(label)}</label>`;
        const chkP = (k, label) => `<label class="fr-chk"><input type="checkbox" ${PD.codes.includes(k) ? 'checked' : ''} onchange="frTogglePerm('${k}',this.checked)">${esc(label)}</label>`;
        const lbl = k => (ABS_TYPES[k] || {}).label || SPECIAL_SUBCODES[k];
        const today = new Date(); today.setHours(0, 0, 0, 0); const end = new Date(today); end.setDate(end.getDate() + 90);
        const active = drivers.filter(d => !d.hidden), stat = { ok:0, last:0, no:0 }, statP = { ok:0, last:0, no:0, off:0 };
        buildDaysIndex().filter(dd => dd.date >= today && dd.date <= end).forEach(dd => { stat[ferieDay(dd, active, D).status]++; statP[permDay(dd, active, null, D).status]++; });
        const P = feriePeriods(D, today, end);
        const rng = b => { const a = new Date(b.from + 'T00:00'), z = new Date((b.to || b.from) + 'T00:00'); return frShort(a, z); };
        main.innerHTML = `
            <div class="cc-panel"><div class="cc-panel-head"><h3>Assenti in totale nello stesso giorno</h3></div><div class="cc-panel-body">
                <p class="cc-note" style="margin-bottom:12px">Limite unico per ferie, permessi, recuperi e le altre assenze scelte qui sotto: raggiunto questo numero, il giorno è sconsigliato sia per le ferie sia per i permessi.</p>
                <div class="cc-inline-form"><label class="cc-field" style="max-width:220px">Massimo assenti nello stesso giorno<input type="number" min="1" max="15" class="cc-input" value="${frTotal(D).max}" onchange="frSet('totalMax', this.value)"></label></div>
                <p class="cc-note" style="margin:14px 0 8px">Quali assenze contano nel totale</p>
                <div class="fr-chks">${['f','v','p','pn','r','c','m','ng','nl','e','l','s','a','k','gr'].map(k => chk('totalCodes', k, lbl(k))).join('')}</div>
            </div></div>
            <div class="cc-panel"><div class="cc-panel-head"><h3>Persone in ferie nello stesso giorno</h3></div><div class="cc-panel-body">
                <p class="cc-note" style="margin-bottom:12px">Gli operatori vedono in verde i giorni consigliati, in giallo quelli con un solo posto libero e in rosso quelli sconsigliati (Menu › Ferie e permessi).</p>
                <div class="cc-inline-form">
                    <label class="cc-field" style="max-width:190px">Massimo nello stesso giorno<input type="number" min="1" max="15" class="cc-input" value="${D.max}" onchange="frSet('max', this.value)"></label>
                    <label class="cc-field" style="max-width:230px">Periodi consigliati di almeno (giorni)<input type="number" min="1" max="31" class="cc-input" value="${D.minDays}" onchange="frSet('minDays', this.value)"></label>
                </div>
                <p class="cc-note" style="margin:14px 0 8px">Cosa conta come ferie</p>
                <div class="fr-chks">${chk('ferieCodes', 'f', 'Congedo ordinario (C.O.)')}${chk('ferieCodes', 'v', 'Ferie residue')}</div>
            </div></div>
            <div class="cc-panel"><div class="cc-panel-head"><h3>Altre assenze nello stesso giorno</h3></div><div class="cc-panel-body">
                <p class="cc-note" style="margin-bottom:12px">Se quel giorno c’è già una di queste assenze, il giorno diventa sconsigliato per le ferie.</p>
                <div class="fr-chks">${['p','pn','r','m','c','l','s','a','e','k','ng','nl'].map(k => chk('blockCodes', k, lbl(k))).join('')}</div>
                <div class="cc-inline-form" style="margin-top:14px"><label class="cc-field" style="max-width:230px">Quante se ne tollerano<input type="number" min="0" max="10" class="cc-input" value="${D.maxOther}" onchange="frSet('maxOther', this.value)"></label></div>
            </div></div>
            <div class="cc-panel"><div class="cc-setting"><div><b>Ferie: rispetta la copertura minima</b><small>Sconsiglia i giorni in cui mattina, pomeriggio o notte sono già sotto la copertura minima (${coverageMin.M} / ${coverageMin.P} / ${coverageMin.N}, in Impostazioni).</small></div>
                <label class="cc-switch"><input type="checkbox" ${D.useCoverage ? 'checked' : ''} onchange="frSet('useCoverage', this.checked)"><span></span></label></div></div>
            <div class="cc-panel"><div class="cc-panel-head"><h3>Permessi e recuperi (assenze di un giorno)</h3></div><div class="cc-panel-body">
                <p class="cc-note" style="margin-bottom:12px">L’operatore vede i singoli giorni consigliati (Menu › Ferie e permessi, scheda Permessi e recuperi). Se ha scelto il suo nome vede solo i giorni in cui lavora, e il giorno è sconsigliato se senza di lui il suo turno scende sotto la copertura minima.</p>
                <div class="cc-inline-form">
                    <label class="cc-field" style="max-width:220px">Massimo nello stesso giorno<input type="number" min="1" max="10" class="cc-input" value="${PD.max}" onchange="frSetPerm('max', this.value)"></label>
                </div>
                <p class="cc-note" style="margin:14px 0 8px">Cosa conta come permesso di un giorno</p>
                <div class="fr-chks">${['p','pn','r','c','l','s','a'].map(k => chkP(k, lbl(k))).join('')}</div>
                <div class="cc-setting" style="padding:14px 0 0"><div><b>Rispetta la copertura minima</b><small>Il giorno è sconsigliato se il turno dell’operatore resterebbe sotto il minimo.</small></div>
                    <label class="cc-switch"><input type="checkbox" ${PD.useCoverage ? 'checked' : ''} onchange="frSetPerm('useCoverage', this.checked)"><span></span></label></div>
            </div></div>
            <div class="cc-panel"><div class="cc-panel-head"><h3>Periodi bloccati</h3><span class="cc-hint">ferie e permessi sconsigliati in queste date</span></div><div class="cc-panel-body">
                ${D.blocked.length ? `<ul class="cc-list">${D.blocked.map((b, i) => `<li><span class="msym" style="color:var(--cc-neg)">event_busy</span><span class="cc-grow">${esc(rng(b))}<small>${esc(b.note || 'senza motivo indicato')}</small></span><button class="cc-btn ghost" onclick="frDelBlock(${i})" title="Togli"><span class="msym">delete</span></button></li>`).join('')}</ul>` : '<p class="cc-note">Nessun periodo bloccato.</p>'}
                <div class="cc-inline-form" style="margin-top:14px">
                    <label class="cc-field" style="max-width:170px">Dal<input type="date" id="fr-from" class="cc-input"></label>
                    <label class="cc-field" style="max-width:170px">Al<input type="date" id="fr-to" class="cc-input"></label>
                    <label class="cc-field" style="flex:1;min-width:170px">Motivo<input type="text" id="fr-note" class="cc-input" placeholder="es. corso aziendale"></label>
                    <button class="cc-btn" onclick="frAddBlock()" style="align-self:flex-end"><span class="msym">add_circle</span>Aggiungi</button>
                </div>
            </div></div>
            <div class="cc-panel"><div class="cc-panel-head"><h3>Anteprima dei prossimi 90 giorni</h3><span class="cc-hint">con le regole qui sopra</span></div><div class="cc-panel-body">
                <p class="cc-note" style="margin-bottom:8px"><b>Ferie</b></p>
                <div class="fr-kpis"><div class="ok"><b>${stat.ok}</b><small>giorni consigliati</small></div><div class="last"><b>${stat.last}</b><small>con un solo posto</small></div><div class="no"><b>${stat.no}</b><small>sconsigliati</small></div></div>
                <p class="cc-note" style="margin-top:10px">${P.length ? 'Periodi consigliati: ' + P.slice(0, 6).map(p => esc(p.label) + ' (' + p.n + ' gg)').join(' · ') : 'Nessun periodo consigliato con queste regole.'}</p>
                <p class="cc-note" style="margin:14px 0 8px"><b>Permessi e recuperi</b></p>
                <div class="fr-kpis"><div class="ok"><b>${statP.ok}</b><small>giorni consigliati</small></div><div class="last"><b>${statP.last}</b><small>al limite</small></div><div class="no"><b>${statP.no}</b><small>sconsigliati</small></div></div>
            </div></div>
            <div class="fr-save"><button class="cc-btn ghost" onclick="frOpenOverview()"><span class="msym">visibility</span>Vedi nel calendario</button><button class="cc-btn primary" onclick="frSave()"><span class="msym">save</span>Salva le regole</button></div>`;
    }
    function frSet(k, v) {
        if(k === 'useCoverage') frDraft[k] = !!v;
        else frDraft[k] = Math.max(k === 'maxOther' ? 0 : 1, Math.min(k === 'minDays' ? 31 : 15, parseInt(v) || 0));
        renderCcFerie();
    }
    function frSetPerm(k, v) {
        if(k === 'useCoverage') frDraft.perm[k] = !!v;
        else frDraft.perm[k] = Math.max(1, Math.min(10, parseInt(v) || 0));
        renderCcFerie();
    }
    function frToggle(list, k, on) {
        const s = new Set(frDraft[list]); if(on) s.add(k); else s.delete(k);
        frDraft[list] = [...s]; renderCcFerie();
    }
    function frTogglePerm(k, on) {
        const s = new Set(frDraft.perm.codes); if(on) s.add(k); else s.delete(k);
        frDraft.perm.codes = [...s]; renderCcFerie();
    }
    function frAddBlock() {
        const from = document.getElementById('fr-from').value, to = document.getElementById('fr-to').value || from;
        const note = document.getElementById('fr-note').value.trim().slice(0, 80);
        if(!from) { ccToast('Scegli almeno la data di inizio.', true); return; }
        frDraft.blocked.push(to < from ? { from: to, to: from, note } : { from, to, note });
        frDraft.blocked.sort((a, b) => a.from.localeCompare(b.from));
        renderCcFerie();
    }
    function frDelBlock(i) { frDraft.blocked.splice(i, 1); renderCcFerie(); }
    function frSave() {
        if(!frDraft.ferieCodes.length) { ccToast('Scegli almeno un tipo di assenza che conta come ferie.', true); return; }
        if(!frDraft.totalCodes.length) { ccToast('Scegli quali assenze contano nel totale.', true); return; }
        if(!frDraft.perm.codes.length) { ccToast('Scegli almeno un tipo di permesso di un giorno.', true); return; }
        if(!fbReady) { ccToast('Nessuna connessione: regole non salvate, riprova tra poco.', true); return; }
        ferieRules = JSON.parse(JSON.stringify(frDraft));
        if(calOverview) renderOverview(true);
        cfgRef('settings').set({ ferieRules }, { merge:true }).then(() => { ccToast('Regole salvate'); logNote('Regole ferie e permessi cambiate'); }).catch(() => ccToast('Salvataggio non riuscito.', true));
    }
    function frOpenOverview() { closeCoordConsole(); setTimeout(() => setCalView('insieme', { advice:true }), 200); }


    // ═══ L'ALTRA SQUADRA IN TURNO ════════════════════════════════════════
    // Nel riepilogo del turno (tocco su una casella) compaiono anche gli autisti in turno quel
    // giorno, con le stesse schede dei colleghi. Si legge il file dell'app autisti in uso
    // (solo lettura). Nell'app autisti lo script di conversione cambia OTHER_TEAM con gli infermieri.
    var OTHER_TEAM = { title: 'Infermieri in turno', icon: 'medical_services', url: 'https://centrale118rsm-code.github.io/Turni-Infermieri-2026/' + 'infermieri' + '.xlsx', parse: raw => parseHorizontalLayout(raw) };
    var otherTeam = null, otherTeamLoading = null;
    // File autisti: riga 1 mesi ("GENNAIO . 1"), riga 2 giorni, per ogni autista riga turni + riga
    // assenze sotto; righe 29-32 reperibilità, poi la legenda (esclusa dai nomi).
    function parseAutistiLayout(raw) {
        const skip = /CONGEDO|MALATTIA|RESIDUE|P\.S\.|RECUPERO|PERM\.|ASPETTATIVA|FEST\.|DISTACCO|1>7|P\/PN/;
        const val = c => c && c.v !== undefined && c.v !== null ? c.v : '';
        const header = ['MESE', 'GIORNO', 'NOME'], people = [];
        for(let r = 3; r < raw.length; r++) {
            if(!raw[r] || (r >= 29 && r <= 32)) continue;
            const t = typeof val(raw[r][1]) === 'string' ? val(raw[r][1]).trim() : '';
            if(t.length <= 2 || skip.test(t.toUpperCase())) continue;
            const nx = raw[r + 1] && raw[r + 1][1];
            people.push({ idx: r, sub: (!nx || String(val(nx)).trim() === '') ? r + 1 : null }); header.push(t.toUpperCase());
        }
        const out = [header], rowM = raw[1] || [], rowD = raw[2] || []; let month = '';
        for(let c = 2; c < rowD.length; c++) {
            const mt = val(rowM[c]); if(typeof mt === 'string' && mt.trim()) { const up = mt.toUpperCase(), p = Object.keys(MONTH_MAP).find(m => up.includes(m)); if(p) month = p; }
            const dn = parseInt(val(rowD[c])); if(!month || isNaN(dn) || dn < 1) continue;
            const line = [{ v: month }, { v: dn }, { v: '' }];
            people.forEach(p => line.push({ v: val(raw[p.idx] && raw[p.idx][c]), subV: p.sub && raw[p.sub] ? val(raw[p.sub][c]) : '' }));
            out.push(line);
        }
        return out;
    }
    // ── Infermieri in turno: dai dati veri dell'app infermieri (sola lettura) ──
    // L'app infermieri non usa più il file infermieri.xlsx (fermo dal 2 ottobre): i turni stanno
    // sul suo Firebase, un documento per mese ("prova_turni_AAAA-MM" in infermieri26_config).
    // Qui si leggono e basta, con un collegamento a parte; se non si riesce si torna al file Excel
    // con sopra le modifiche fatte nell'app (quando l'app infermieri è ancora in modalità Excel).
    const INF_FB_CONFIG = {
        apiKey: "AIzaSyDCycpsVJus8Mwd-AqaPORZIrFUIyo00VQ",
        authDomain: "creazione-turni-118.firebaseapp.com",
        projectId: "creazione-turni-118",
        storageBucket: "creazione-turni-118.firebasestorage.app",
        messagingSenderId: "389097635025",
        appId: "1:389097635025:web:331564551f0e5190a199f0"
    };
    const INF_FB_NS = 'prova_';   // i documenti che usa l'app infermieri ufficiale
    let infFbDbP = null;
    function infFbDb() {
        if(!infFbDbP) infFbDbP = (async () => {
            const app = firebase.apps.find(a => a.name === 'infermieri') || firebase.initializeApp(INF_FB_CONFIG, 'infermieri');
            const auth = app.auth();
            if(!auth.currentUser) await auth.signInAnonymously();
            return app.firestore();
        })().catch(e => { infFbDbP = null; throw e; });
        return infFbDbP;
    }
    function infFbDoc(db, name) { return db.collection('infermieri26_config').doc(INF_FB_NS + name).get(); }
    // Valore di una casella dell'app infermieri, come lo legge il resto di questa app
    function infCellVal(c) { return c && typeof c === 'object' ? { v: c.v == null ? '' : c.v, subV: c.subV == null ? '' : c.subV } : { v: '', subV: '' }; }
    // Mette le caselle { "NOME__MESE-giorno[@anno]": {v, subV} } dentro una griglia [intestazione, righe…]
    function infApplyCells(grid, cells, year) {
        const H = grid[0] || [], col = {};
        for(let c = 3; c < H.length; c++) col[String(H[c]).trim().toUpperCase()] = c;
        const rowAt = {}; let y = year, last = -1;
        for(let i = 1; i < grid.length; i++) {
            const mi = MONTH_MAP[grid[i][0].v]; if(mi === undefined) continue;
            if(mi < last) y++; last = mi;
            rowAt[grid[i][0].v + '-' + parseInt(grid[i][1].v) + '@' + y] = i;
        }
        Object.keys(cells || {}).forEach(k => {
            const i = k.indexOf('__'); if(i === -1) return;
            const name = k.slice(0, i).trim().toUpperCase(), rest = k.slice(i + 2), at = rest.indexOf('@');
            const ky = at === -1 ? year : parseInt(rest.slice(at + 1), 10), ds = at === -1 ? rest : rest.slice(0, at);
            const r = rowAt[ds + '@' + ky], c = col[name];
            if(r === undefined || c === undefined) return;
            grid[r][c] = infCellVal(cells[k]);
        });
        return grid;
    }
    async function infLoadFromFirebase() {
        const db = await infFbDb();
        const sDoc = await infFbDoc(db, 'settings'); if(!sDoc.exists) return null;
        const st = sDoc.data() || {}, oc = st.operatorConfig || {};
        if(st.dataSource !== 'firebase') return { excel: true, overrides: st.manualOverrides || {} };
        const year = SHIFT_YEAR, removed = oc.removed || {};
        const names = (Array.isArray(oc.baseNames) ? oc.baseNames : []).concat((Array.isArray(oc.added) ? oc.added : []).map(o => o && o.name))
            .filter(n => n && !removed[n] && !['TEST', 'COORDINATORE'].includes(String(n).trim().toUpperCase()));
        const uniq = [...new Set(names)];
        const grid = buildBlankYearData(year, uniq, NEXT_YEAR_MONTHS);
        const docs = await Promise.all(Array.from({ length: 12 }, (_, m) => infFbDoc(db, monthDocName(year, m)).catch(() => null)));
        docs.forEach(d => { if(d && d.exists) infApplyCells(grid, d.data().cells || {}, year); });
        // l'anno dopo: nel suo documento le chiavi sono senza anno
        const nextDocs = await Promise.all(Array.from({ length: NEXT_YEAR_MONTHS }, (_, m) => infFbDoc(db, monthDocName(year + 1, m)).catch(() => null)));
        nextDocs.forEach(d => { if(!d || !d.exists) return; const src = d.data().cells || {}, cells = {}; Object.keys(src).forEach(k => { cells[k.includes('@') ? k : k + '@' + (year + 1)] = src[k]; }); infApplyCells(grid, cells, year); });
        return { grid };
    }
    async function infLoadFromExcel(overrides) {
        const r = await fetch(OTHER_TEAM.url + '?v=' + Date.now()); if(!r.ok) return null;
        await loadLib('excel');
        const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await r.arrayBuffer());
        const ws = wb.getWorksheet('Foglio2') || wb.worksheets[0], raw = [];
        ws.eachRow({ includeEmpty: true }, (row, rn) => { const rd = []; row.eachCell({ includeEmpty: true }, (cell, cn) => { let v = cell.value; if(typeof v === 'object' && v !== null) v = v.result || (v.richText && v.richText[0] && v.richText[0].text) || ''; rd[cn] = { v }; }); raw[rn] = rd; });
        const grid = OTHER_TEAM.parse(raw);
        return overrides ? infApplyCells(grid, overrides, SHIFT_YEAR) : grid;
    }
    const OTHER_TEAM_TTL = 10 * 60000;   // dopo 10 minuti si rilegge (l'app può restare aperta a lungo)
    let otherTeamAt = 0;
    function loadOtherTeam() {
        if(otherTeamLoading && Date.now() - otherTeamAt < OTHER_TEAM_TTL) return otherTeamLoading;
        otherTeamAt = Date.now();
        otherTeamLoading = (async () => {
            let fb = null;
            try { fb = await infLoadFromFirebase(); }
            catch(e) { console.log('Turni infermieri da Firebase non disponibili, uso il file:', e.message); }
            try {
                if(fb && fb.grid) otherTeam = fb.grid;
                else otherTeam = await infLoadFromExcel(fb && fb.overrides) || otherTeam;
            } catch(e) { console.log('Turni dell’altra squadra non disponibili:', e.message); }
        })();
        return otherTeamLoading;
    }
    // Riga del giorno nel file dell'altra squadra (il file può arrivare a gennaio dell'anno dopo).
    function otherRowFor(data, mese, giorno, year) {
        let y = SHIFT_YEAR, last = -1;
        for(let i = 1; i < data.length; i++) {
            const mi = MONTH_MAP[data[i][0].v]; if(mi === undefined) continue;
            if(mi < last) y++; last = mi;
            if(data[i][0].v === mese && parseInt(data[i][1].v) === giorno && y === year) return data[i];
        }
        return null;
    }
    function otherTeamHtml(rowIndex, uShift) {
        const row = finalData[rowIndex]; if(!row) return '';
        const mese = row[0].v, giorno = parseInt(row[1].v), year = shiftRowYear(rowIndex);
        const head = n => `<div class="sm2-sec"><span class="material-icons-round">${OTHER_TEAM.icon}</span>${esc(OTHER_TEAM.title)}${n != null ? `<span class="sm2-n">${n}</span>` : ''}</div>`;
        const box = (inner, n) => `<div id="ot-list" data-row="${rowIndex}" data-shift="${esc(uShift)}">${head(n)}${inner}</div>`;
        const stdTime = ['M','P','N','SM'].includes(uShift) ? (SCHEDULE[uShift] || '') : '';
        if(!otherTeam) {
            if(!otherTeamLoading) loadOtherTeam();
            otherTeamLoading.then(() => { const el = document.getElementById('ot-list'); if(el && +el.dataset.row === rowIndex && otherTeam) el.outerHTML = otherTeamHtml(rowIndex, uShift); });
            return box('<div class="sm2-empty">Caricamento…</div>');
        }
        const orow = otherRowFor(otherTeam, mese, giorno, year);
        if(!orow) return box('<div class="sm2-empty">Nessun dato per questo giorno</div>');
        const H = otherTeam[0], cards = [];
        for(let c = 3; c < H.length; c++) {
            const cell = orow[c] || {}, sub = String(cell.subV || '').trim().toLowerCase();
            if(SPECIAL_SUBCODES[sub] !== undefined) continue;   // assente quel giorno
            let rawV = String(cell.v || '').trim(); const rep = /\/r$/i.test(rawV);
            const si = rawV.indexOf('/'); if(si !== -1) rawV = rawV.substring(0, si).trim();
            let uVal = rawV.toUpperCase(); if(uVal === 'S') uVal = 'SM';
            const isD = rawV.length > 0 && rawV.charAt(0) >= 'a' && rawV.charAt(0) <= 'z';
            const isWorking = ['M','P','N','SM'].includes(uVal) || isMN(rawV);
            let isMatch = false;
            if(['M','P','N','SM'].includes(uShift)) { if(uVal === uShift) isMatch = true; if(isMN(rawV) && (uShift === 'M' || uShift === 'N')) isMatch = true; }
            else if(isWorking) isMatch = true;
            if(!isMatch) continue;
            const time = isD ? (diurniSched(rawV, new Date(year, MONTH_MAP[mese], giorno)) || rawV) : (isMN(rawV) ? `M ${SCHEDULE['M']} · N ${SCHEDULE['N']}` : (SCHEDULE[uVal] || uVal));
            cards.push(sm2Person(String(H[c]), rawV, uVal, isD, time, '', rep, ''));   // l'orario dell'altra squadra sempre visibile
        }
        return box(cards.length ? `<div class="sm2-grid">${cards.join('')}</div>` : '<div class="sm2-empty">Nessuno in questo turno</div>', cards.length);
    }

    // ═══ EQUITÀ DELL'ANNO ════════════════════════════════════════════════
    // Per ogni persona: notti, domeniche, sabati e festivi lavorati, reperibilità (turni da
    // titolare e ore di fascia) e saldo ore. Ogni numero è confrontato con la media della
    // squadra: arancione = oltre il 20% sopra, azzurro = oltre il 20% sotto.
    let eqPeriod = 'oggi', eqSort = null;
    const EQ_COLS = [
        { k: 'notti', label: 'Notti', onlyDoers: true },
        { k: 'dom', label: 'Domeniche' },
        { k: 'sab', label: 'Sabati' },
        { k: 'fest', label: 'Festivi' },
        { k: 'repT', label: 'Reperibilità', sub: 'turni' },
        { k: 'repH', label: 'Ore rep.', fmt: m => Math.round(m / 60) },
        { k: 'saldo', label: 'Saldo ore', fmt: m => fmtHM(m, true) || '0:00', signed: true }
    ];
    function openEquity() {
        closeMenu(); vibrate(); eqSort = null; eqCat = 'tutto'; renderEquity();
        const m = document.getElementById('eq-modal'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10);
        setCurrentView('Equità');
    }
    function closeEquity(e) { if(e && e.target !== e.currentTarget) return; const m = document.getElementById('eq-modal'); m.classList.remove('open'); setTimeout(() => { if(!m.classList.contains('open')) m.style.display = 'none'; }, 300); }
    function eqSetPeriod(p) { vibrate(); eqPeriod = p; renderEquity(); }
    function eqSortBy(k) { vibrate(); eqSort = eqSort === k ? null : k; renderEquity(); }
    function computeEquityOld() {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const all = buildDaysIndex(), days = eqPeriod === 'oggi' ? all.filter(dd => dd.date <= today) : all;
        const R = repData(), me = prefMe();
        const rows = drivers.filter(d => !d.hidden).map(d => {
            const r = { d, isMe: !!me && me.idx === d.idx, notti: 0, dom: 0, sab: 0, fest: 0, repT: 0, repH: 0, worked: 0 };
            days.forEach(dd => {
                const info = computeDayInfo(dd.rowIdx, d.idx); r.worked += info.minutes || 0;
                const c = info.justified ? '' : info.code;
                const works = ['M', 'P', 'N', 'M+N', 'm', 'p'].includes(c) || (info.custom && customCodes[c] && customCodes[c].kind === 'work');
                if(works) {
                    const g = dd.date.getDay();
                    if(g === 0) r.dom++; if(g === 6) r.sab++;
                    if(HOLIDAYS[`${dd.monthIdx}-${dd.day}`]) r.fest++;
                    if(c === 'N' || c === 'M+N') r.notti++;
                }
                const iso = ymd(dd.date);
                if(R.tit[iso] === d.originalName) r.repT++;
                (R.days[iso] || []).forEach((who, s) => { if(who === d.originalName) r.repH += REP_SLOTS[s].minutes; });
            });
            r.saldo = r.worked - contractMinutesFor(getContractHours(d.idx), days.map(dd => dd.date), d.idx);
            return r;
        });
        const avg = {};
        EQ_COLS.forEach(c => { const set = c.onlyDoers ? rows.filter(r => r[c.k] > 0) : rows; avg[c.k] = set.length ? set.reduce((a, r) => a + r[c.k], 0) / set.length : 0; });
        return { rows, avg, days };
    }
    function renderEquityOld() {
        const { rows, avg, days } = computeEquity();
        document.querySelectorAll('#eq-modal .ab-period button').forEach(b => b.classList.toggle('active', b.dataset.p === eqPeriod));
        let list = rows.slice();
        if(eqSort) list.sort((a, b) => b[eqSort] - a[eqSort]); else list.sort((a, b) => b.isMe - a.isMe);
        const max = {}; EQ_COLS.forEach(c => max[c.k] = Math.max(1, ...rows.map(r => Math.abs(r[c.k]))));
        const cell = (c, r) => {
            const v = r[c.k], txt = c.fmt ? c.fmt(v) : v;
            if(c.signed) return `<td class="eq-c ${Math.abs(v) < 30 ? '' : (v < 0 ? 'neg' : 'pos')}"><b>${txt}</b></td>`;
            let cls = '';
            if(!(c.onlyDoers && v === 0) && avg[c.k] > 0) { const q = v / avg[c.k]; cls = q >= 1.2 ? 'hi' : (q <= 0.8 ? 'lo' : ''); }
            return `<td class="eq-c ${cls}"><b>${txt}</b><i style="width:${Math.round(Math.abs(v) / max[c.k] * 100)}%"></i></td>`;
        };
        const headL = `<th class="eq-name">${eqPeriod === 'oggi' ? 'Fino a oggi' : 'Anno ' + SHIFT_YEAR}</th>`;
        const headR = EQ_COLS.map(c => `<th onclick="eqSortBy('${c.k}')" class="${eqSort === c.k ? 'on' : ''}">${c.label}${c.sub ? `<small>${c.sub}</small>` : ''}</th>`).join('');
        const items = list.map(r => ({ attrs: `class="${r.isMe ? 'me' : ''}"`, left: `<th class="eq-name"><span>${esc(r.d.name)}</span>${r.isMe ? '<em>tu</em>' : ''}</th>`, right: EQ_COLS.map(c => cell(c, r)).join('') }));
        items.push({ attrs: 'class="eq-avg"', left: '<th class="eq-name"><span>Media</span></th>', right: EQ_COLS.map(c => `<td class="eq-c"><b>${c.signed ? '' : (c.fmt ? c.fmt(avg[c.k]) : avg[c.k].toFixed(1))}</b></td>`).join('') });
        document.getElementById('eq-grid').innerHTML = xgHtml('eq-table', headL, headR, items, 620);
        document.getElementById('eq-note').innerHTML = `${days.length} giorni considerati. <span class="eq-key hi"></span> oltre il 20% sopra la media della squadra, <span class="eq-key lo"></span> oltre il 20% sotto. Per le notti la media conta solo chi ne fa. Tocca un titolo di colonna per ordinare.`;
    }

    // ═══ BOZZA AUTOMATICA DEL MESE ═══════════════════════════════════════
    // Continua la rotazione di ognuno guardando le 6 settimane prima del mese:
    //  • turnisti: la fase nel ciclo P › M › N › SM › R (ogni giorno noto "vota" la fase);
    //  • diurnisti: si ripete la settimana (o le due settimane) che spiega meglio le ultime 4.
    // Non tocca mai le assenze; di norma riempie solo le caselle vuote. Poi chiude i buchi di
    // copertura di mattina e pomeriggio richiamando chi è di riposo (senza scendere sotto i
    // riposi settimanali). Autisti: cambio del turnista il lunedì dopo 5 settimane di blocco.
    // Il risultato entra come modifiche NON salvate: si rivede nel calendario, poi Salva o Scarta.
    const DRAFT_CYCLE = ['P', 'M', 'N', 'SM', 'R'];
    const DRAFT_IS_AS = typeof TEAM_AS !== 'undefined' && TEAM_AS;
    let draftOpts = { month: null, onlyEmpty: true, cover: true, blocks: true }, draftLast = null;
    function draftCode(r, idx) {
        const cell = finalData[r][idx] || {}, sub = String(cell.subV || '').trim().toLowerCase();
        if(SPECIAL_SUBCODES[sub] !== undefined) return 'ABS';
        let v = String(cell.v || '').trim(); const si = v.indexOf('/'); if(si !== -1) v = v.slice(0, si).trim();
        if(!v || v === '-') return '';
        if(/^[mpr]$/.test(v)) return v;
        let u = v.toUpperCase(); if(u === 'S') u = 'SM'; if(u === 'MN') u = 'M+N';
        if(customCodes[u]) return customCodes[u].kind === 'abs' ? 'ABS' : u;
        return u;
    }
    function draftPlan(monthIdx, opts) {
        if(DRAFT_IS_AS && typeof draftPlanAutisti === 'function') return draftPlanAutisti(monthIdx, opts);   // autisti: bozza costruita dalle regole
        const days = buildDaysIndex(), i0 = days.findIndex(dd => dd.monthIdx === monthIdx);
        if(i0 < 0) return null;
        const target = days.filter(dd => dd.monthIdx === monthIdx);
        const H = 42, hist = days.slice(Math.max(0, i0 - H), i0), longHist = days.slice(Math.max(0, i0 - 91), i0);
        const active = drivers.filter(d => !d.hidden);
        const cur = {}, plan = {}, kind = {}, smCode = {}, noPattern = [];
        active.forEach(d => {
            const h = hist.map(dd => draftCode(dd.rowIdx, d.idx));
            cur[d.idx] = target.map(dd => draftCode(dd.rowIdx, d.idx));
            smCode[d.idx] = hist.some(dd => String((finalData[dd.rowIdx][d.idx] || {}).v || '').trim().toUpperCase() === 'S') ? 'S' : 'SM';
            const known = h.filter(c => c && c !== 'ABS').length;
            const isTurn = h.slice(-14).some(c => c === 'N' || c === 'SM' || c === 'M+N');
            const out = [];
            if(known < 5) { plan[d.idx] = target.map(() => ''); kind[d.idx] = 'none'; noPattern.push(d.name); return; }   // nessuno schema recente (es. assente a lungo)
            if(isTurn) {
                const votes = [0, 0, 0, 0, 0];
                // contano soprattutto gli ultimi giorni: il ciclo ogni tanto salta e le settimane vecchie sarebbero fuori fase
                h.forEach((c, j) => { const p = DRAFT_CYCLE.indexOf(c); if(p >= 0) votes[((p - j) % 5 + 5) % 5] += Math.pow(2, (j - h.length) / 3); });
                const phase = votes.indexOf(Math.max(...votes));
                target.forEach((dd, k) => out.push(DRAFT_CYCLE[(phase + h.length + k) % 5]));
                kind[d.idx] = 'turn';
            } else {
                const score = p => { let ok = 0, tot = 0; for(let j = Math.max(p, h.length - 28); j < h.length; j++) { const a = h[j], b = h[j - p]; if(!a || a === 'ABS' || !b || b === 'ABS') continue; tot++; if(a === b) ok++; } return tot ? ok / tot : 0; };
                const per = score(14) > score(7) + 0.1 ? 14 : 7;
                target.forEach((dd, k) => {
                    let j = h.length + k - per, c = '';
                    while(j >= 0) { c = j < h.length ? h[j] : out[j - h.length]; if(c && c !== 'ABS') break; j -= per; }
                    out.push(c && c !== 'ABS' ? c : (dd.date.getDay() === 0 ? 'r' : 'm'));
                });
                kind[d.idx] = 'diur';
            }
            plan[d.idx] = out;
        });
        const swaps = [];
        // Autisti: il turnista esce il lunedì dopo 5 settimane dall'inizio del blocco (lunedì pomeriggio)
        if(DRAFT_IS_AS && opts.blocks) {
            const lastTurnDay = idx => { for(let j = longHist.length - 1; j >= 0; j--) { const c = draftCode(longHist[j].rowIdx, idx); if(c === 'N' || c === 'SM') return j; } return -1; };
            active.filter(d => kind[d.idx] === 'turn').forEach(d => {
                const h = longHist.map(dd => draftCode(dd.rowIdx, d.idx));
                let start = -1;
                for(let j = h.length - 1; j > 0; j--) {
                    if(h[j] !== 'P' || longHist[j].date.getDay() !== 1) continue;
                    let prev = ''; for(let q = j - 1; q >= Math.max(0, j - 3) && !prev; q--) prev = h[q] === 'ABS' ? '' : h[q];
                    if(/^[mpr]$/.test(prev)) { start = j; break; }
                }
                if(start < 0) return;
                const exit = new Date(longHist[start].date); exit.setDate(exit.getDate() + 35);   // lunedì dopo il venerdì notte della 5ª settimana
                let k = target.findIndex(dd => dd.date >= exit && dd.date.getDay() === 1);
                if(k < 0) return;
                const cands = active.filter(x => kind[x.idx] === 'diur' && !swaps.some(s => s.inIdx === x.idx)).map(x => ({ x, last: lastTurnDay(x.idx) })).sort((a, b) => a.last - b.last);
                if(!cands.length) return;
                const E = cands[0].x;
                const leaving = plan[d.idx].slice(k), entering = plan[E.idx].slice(k);
                plan[E.idx].splice(k, leaving.length, ...leaving); plan[d.idx].splice(k, entering.length, ...entering);
                swaps.push({ outIdx: d.idx, inIdx: E.idx, date: target[k].date });
            });
        }
        // caselle da scrivere
        const fin = {}, write = {};
        active.forEach(d => {
            fin[d.idx] = cur[d.idx].slice(); write[d.idx] = [];
            target.forEach((dd, k) => {
                const c = cur[d.idx][k];
                if(c === 'ABS') return;
                if(c && opts.onlyEmpty) return;
                if(plan[d.idx][k] && plan[d.idx][k] !== c) { fin[d.idx][k] = plan[d.idx][k]; write[d.idx][k] = plan[d.idx][k]; }
                else if(!c) write[d.idx][k] = undefined;
            });
        });
        // copertura: mattina e pomeriggio richiamando chi è di riposo (solo caselle che la bozza può scrivere)
        const count = (k, what) => active.reduce((a, d) => { const c = fin[d.idx][k]; return a + (what === 'M' ? (c === 'M' || c === 'm' || c === 'M+N') : what === 'P' ? (c === 'P' || c === 'p') : (c === 'N' || c === 'M+N')); }, 0);
        const minRest = DRAFT_IS_AS ? 2 : 1, recalls = [];
        const weekRests = (idx, k) => { const mon = new Date(target[k].date); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); let n = 0; target.forEach((dd, q) => { if(dd.date >= mon && (dd.date - mon) < 7 * 86400000 && /^[rR]$/.test(fin[idx][q])) n++; }); return n; };
        if(opts.cover) target.forEach((dd, k) => {
            ['M', 'P'].forEach(sh => {
                while(count(k, sh) < coverageMin[sh]) {
                    const cands = active.filter(d => {
                        const c = fin[d.idx][k]; if(!/^[rR]$/.test(c)) return false;
                        if(cur[d.idx][k] && (opts.onlyEmpty || cur[d.idx][k] === 'ABS')) return false;   // casella già scritta: non si tocca
                        const prev = k > 0 ? fin[d.idx][k - 1] : ''; if(prev === 'N' || prev === 'M+N') return false;
                        if(kind[d.idx] === 'turn') return false;   // il riposo del turnista fa parte del ciclo
                        return weekRests(d.idx, k) > minRest;
                    }).sort((a, b) => weekRests(b.idx, k) - weekRests(a.idx, k));
                    if(!cands.length) break;
                    const d = cands[0]; fin[d.idx][k] = sh === 'M' ? 'm' : 'p'; write[d.idx][k] = fin[d.idx][k];
                    recalls.push({ date: dd.date, shift: sh, name: d.name });
                }
            });
        });
        const holes = [];
        target.forEach((dd, k) => ['M', 'P', 'N'].forEach(sh => { const n = count(k, sh); if(n < coverageMin[sh]) holes.push({ date: dd.date, shift: sh, have: n, need: coverageMin[sh] }); }));
        // modifiche finali
        const changes = [];
        active.forEach(d => target.forEach((dd, k) => {
            let c = write[d.idx][k]; if(!c) return;
            if(c === 'SM') c = smCode[d.idx];
            changes.push({ row: dd.rowIdx, col: d.idx, v: c });
        }));
        return { changes, holes, recalls, swaps, target, noPattern };
    }
    function draftApply() {
        if(isViewingArchive()) { ccToast('Anno archiviato: non si può modificare.', true); return; }
        const mi = draftOpts.month;
        const res = draftPlan(mi, draftOpts);
        if(!res) { ccToast('Il mese scelto non è nel calendario.', true); return; }
        if(!res.changes.length) { ccToast('Niente da riempire: il mese è già completo.', true); draftLast = res; renderCcDraft(); return; }
        if(!coordEditModeActive) toggleCoordEditMode(true);
        const entries = [], keys = [];
        res.changes.forEach(ch => { const key = cellKey(ch.row, ch.col), next = { v: ch.v, subV: '' }; const prev = setOverride(key, next); entries.push({ key, prev, next }); keys.push(key); });
        pushUndo({ entries }); afterCoordChange(keys);
        draftLast = res; renderCcDraft();
        ccToast(`Bozza pronta: ${res.changes.length} caselle. Controllala nel calendario, poi Salva o Annulla.`);
    }
    function draftMonthsOptions() {
        const now = new Date(), out = [];
        for(let k = 0; k < 3; k++) { const d = new Date(now.getFullYear(), now.getMonth() + k, 1); if(d.getFullYear() === SHIFT_YEAR) out.push(d.getMonth()); }
        return out.length ? out : [11];
    }
    function renderCcDraft() {
        const main = document.getElementById('cc-main'); if(!main) return;
        const months = draftMonthsOptions(); if(draftOpts.month === null || !months.includes(draftOpts.month)) draftOpts.month = months[Math.min(1, months.length - 1)];
        const mName = m => MONTH_NAMES_IT[m].charAt(0).toUpperCase() + MONTH_NAMES_IT[m].slice(1);
        const fmt = d => d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
        const sw = (k, t, s) => `<div class="cc-setting"><div><b>${t}</b><small>${s}</small></div><label class="cc-switch"><input type="checkbox" ${draftOpts[k] ? 'checked' : ''} onchange="draftOpts.${k}=this.checked"><span></span></label></div>`;
        const r = draftLast;
        main.innerHTML = `
            <div class="cc-panel"><div class="cc-panel-head"><h3>Mese da preparare</h3></div><div class="cc-panel-body">
                <div class="fr-chks">${months.map(m => `<label class="fr-chk"><input type="radio" name="draft-m" ${draftOpts.month === m ? 'checked' : ''} onchange="draftOpts.month=${m}">${mName(m)} ${SHIFT_YEAR}</label>`).join('')}</div>
                <p class="cc-note" style="margin-top:12px">${DRAFT_IS_AS
                    ? 'La bozza segue le regole degli autisti: i 5 turnisti proseguono il ciclo pomeriggio › mattina › notte › smonto › riposo (una persona per posizione), i diurnisti coprono la seconda ambulanza di mattina e di pomeriggio con 2 riposi a settimana. Ogni assenza già inserita resta com’è. Le reperibilità non vengono toccate.'
                    : 'La bozza continua la rotazione di ognuno partendo dalle 6 settimane prima del mese, lascia com’è ogni assenza già inserita (ferie, permessi…) e prova a chiudere i buchi di mattina e pomeriggio. Le reperibilità non vengono toccate.'}</p>
            </div></div>
            <div class="cc-panel">
                ${sw('onlyEmpty', 'Riempi solo le caselle vuote', 'Spento: riscrive anche i turni già messi nel mese (le assenze restano sempre).')}
                ${sw('cover', 'Completa la copertura', 'Richiama i diurnisti di riposo dove mancano persone, senza scendere sotto ' + (DRAFT_IS_AS ? '2 riposi' : '1 riposo') + ' a settimana.')}
                ${DRAFT_IS_AS ? sw('blocks', 'Blocchi da turnista di 5 settimane', 'Il lunedì dopo la 5ª settimana il turnista torna diurnista ed entra il diurnista che non fa turni da più tempo.') : ''}
            </div>
            <div class="fr-save"><button class="cc-btn primary" onclick="draftApply()"><span class="msym">edit_calendar</span>Crea la bozza di ${mName(draftOpts.month)}</button></div>
            ${r ? `<div class="cc-panel"><div class="cc-panel-head"><h3>Risultato</h3><span class="cc-hint">${r.changes.length} caselle proposte</span><button class="cc-link" onclick="enterCoordEdit()">Vedi nel calendario</button></div><div class="cc-panel-body">
                ${r.noPattern && r.noPattern.length ? `<p class="cc-note" style="margin-bottom:8px"><b>Lasciati vuoti (nessun turno nelle ultime settimane):</b> ${r.noPattern.map(esc).join(', ')}</p>` : ''}
                ${r.swaps.length ? `<p class="cc-note" style="margin-bottom:8px"><b>Cambi di blocco:</b> ${r.swaps.map(s => `${esc(getDriverByIdx(s.outIdx).name)} esce e entra ${esc(getDriverByIdx(s.inIdx).name)} (${fmt(s.date)})`).join(' · ')}</p>` : ''}
                ${r.recalls.length ? `<p class="cc-note" style="margin-bottom:8px"><b>Richiamati dal riposo:</b> ${r.recalls.slice(0, 20).map(x => `${esc(x.name)} ${fmt(x.date)} (${x.shift === 'M' ? 'mattina' : 'pomeriggio'})`).join(' · ')}${r.recalls.length > 20 ? ' …' : ''}</p>` : ''}
                ${r.holes.length ? `<ul class="cc-list">${r.holes.slice(0, 40).map(h => `<li><span class="msym" style="color:var(--cc-neg)">warning</span><span class="cc-grow">${fmt(h.date)}<small>${{ M: 'mattina', P: 'pomeriggio', N: 'notte' }[h.shift]}: ${h.have} su ${h.need}</small></span></li>`).join('')}</ul>` : '<div class="cc-empty"><span class="msym">verified</span>Nessun buco di copertura nel mese.</div>'}
                <p class="cc-note" style="margin-top:10px">La bozza non è ancora salvata: in Modifica turni puoi ritoccarla con la ruota, poi Salva. Con Annulla (o uscendo e scegliendo Scarta) torna tutto com’era.</p>
            </div></div>` : ''}`;
    }

    // ═══ NOTIFICHE SUL TELEFONO E CALENDARIO PERSONALE ═══════════════════
    // Il "motore" su GitHub Actions (.github/motore del repository) ogni 15 minuti apre questa
    // app in un browser invisibile con ?server=1, prende serverExport() e:
    //  • scrive i calendari personali cal/<nome>.ics (link da aggiungere al telefono);
    //  • manda le notifiche Web Push a chi le ha attivate (documento "push").
    const VAPID_PUBLIC = 'BC2o0b0SAeUU78gFoD8lwVd6xrpIijlIjAv9YnZVpsAZJ0r2s5B_510Im0otM8IuhuntaVZK-vpGrIKRAV97Cso';
    function calSlug(orig) { return String(orig || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
    function appBaseUrl() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
    function calUrl(orig) { return appBaseUrl() + 'cal/' + calSlug(orig) + '.ics'; }
    function hmRange(s) { const m = String(s || '').match(/(\d{1,2})[:.](\d{2})\D+(\d{1,2})[:.](\d{2})/); return m ? [m[1].padStart(2, '0') + ':' + m[2], m[3].padStart(2, '0') + ':' + m[4]] : null; }
    // Eventi di una persona in un giorno: turni con orario, assenze a giornata intera.
    function dayEvents(rowIdx, d) {
        const info = computeDayInfo(rowIdx, d.idx), c = info.code; if(!c || c === 'STR' || info.pnTail) return [];
        if(info.justified) {
            const lbl = info.custom ? (customCodes[c].label || c).replace(/\|/g, ' ') : ((ABS_TYPES[c] && ABS_TYPES[c].label) || SPECIAL_SUBCODES[c] || c);
            return [{ kind: 'abs', code: c, label: lbl.charAt(0) + lbl.slice(1).toLowerCase() }];
        }
        if(c === 'R' || c === 'r') return [{ kind: 'rest', code: c, label: 'Riposo' }];
        if(c === 'M+N') return [Object.assign({ kind: 'work', code: 'M', label: 'Mattina' }, { t: hmRange(SCHEDULE.M) }), Object.assign({ kind: 'work', code: 'N', label: 'Notte' }, { t: hmRange(SCHEDULE.N) })];
        if(info.custom) { const cc = customCodes[c]; return [{ kind: cc.kind === 'work' ? 'work' : 'note', code: c, label: (cc.label || c).replace(/\|/g, ' '), t: cc.kind === 'work' ? [cc.from, cc.to] : null }]; }
        const t = hmRange(/^[mpr]$/.test(c) ? diurniSched(c, repRowDate(rowIdx)) : SCHEDULE[c]);
        return [{ kind: 'work', code: c, label: SHIFT_NAMES[c === 'S' ? 'SM' : c] || info.label || c, t }];
    }
    function icsEsc(s) { return String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n'); }
    // Calendario .ics di una persona (dal giorno "from" in poi).
    function icsFor(d, fromIso) {
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Turni 118 San Marino//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
            'X-WR-CALNAME:' + icsEsc('Turni ' + d.name), 'X-WR-TIMEZONE:Europe/Rome', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
        const stamp = 'DTSTAMP:20260101T000000Z', slug = calSlug(d.originalName);
        const dt = (iso, hm) => iso.replace(/-/g, '') + 'T' + hm.replace(':', '') + '00';
        const add = (uid, s, e, summary, allDay) => L.push('BEGIN:VEVENT', 'UID:' + uid + '-' + slug + '@turni118', stamp, (allDay ? 'DTSTART;VALUE=DATE:' : 'DTSTART:') + s, (allDay ? 'DTEND;VALUE=DATE:' : 'DTEND:') + e, 'SUMMARY:' + icsEsc(summary), 'END:VEVENT');
        const rows = []; for(let r = 1; r < finalData.length; r++) { const iso = repRowDate(r); if(iso && iso >= fromIso) rows.push({ r, iso }); }
        rows.forEach(({ r, iso }, i) => {
            dayEvents(r, d).forEach(ev => {
                if(ev.kind === 'rest') return;
                if(ev.kind === 'abs' || ev.kind === 'note' || !ev.t) { add(iso + '-' + ev.code, iso.replace(/-/g, ''), repDateAdd(iso, 1).replace(/-/g, ''), ev.label, true); return; }
                if(ev.code === 'SM' || ev.code === 'S') { const prev = rows[i - 1] && dayEvents(rows[i - 1].r, d).some(x => x.code === 'N'); if(prev) return; }   // lo smonto è già nella notte
                let [s, e] = ev.t, endIso = iso;
                if(ev.code === 'N') { const nx = rows[i + 1] && dayEvents(rows[i + 1].r, d).find(x => x.code === 'SM' || x.code === 'S'); endIso = repDateAdd(iso, 1); if(nx && nx.t) e = nx.t[1]; }
                else if(e <= s) endIso = repDateAdd(iso, 1);
                add(iso + '-' + ev.code, dt(iso, s), dt(endIso, e), ev.label + (ev.code === 'N' ? ' (con smonto)' : ''), false);
            });
        });
        // reperibilità: fasce della persona, unite quando sono di seguito
        const R = repData(), SL = [['00:00', '07:00'], ['07:00', '13:00'], ['13:00', '20:00'], ['20:00', '24:00']], spans = [];
        rows.forEach(({ iso }) => (R.days[iso] || []).forEach((who, s) => {
            if(who !== d.originalName) return;
            const a = dt(iso, SL[s][0]), b = SL[s][1] === '24:00' ? dt(repDateAdd(iso, 1), '00:00') : dt(iso, SL[s][1]);
            const last = spans[spans.length - 1]; if(last && last.e === a) last.e = b; else spans.push({ s: a, e: b });
        }));
        spans.forEach(sp => add('rep-' + sp.s, sp.s, sp.e, 'Reperibilità', false));
        return L.join('\r\n') + '\r\nEND:VCALENDAR\r\n';
    }
    function downloadMyIcs() {
        const me = prefMe(); if(!me) { ccToast('Scegli prima chi sei.', true); return; }
        const from = new Date(); from.setDate(from.getDate() - 7);
        const blob = new Blob([icsFor(me, ymd(from))], { type: 'text/calendar' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'turni-' + calSlug(me.originalName) + '.ics';
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    function copyMyCalLink() {
        const me = prefMe(); if(!me) return;
        const url = calUrl(me.originalName);
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => ccToast('Link del calendario copiato')).catch(() => ccDialog('Link del calendario', url, [{ label: 'Ok', kind: 'primary', value: true }]));
    }
    function calOptionsHtml() {
        const me = prefMe();
        if(!me) return `<div class="option-item"><div class="opt-txt"><span>Turni nel calendario del telefono</span><small>Scegli prima chi sei: il calendario è personale.</small></div></div>`;
        const url = calUrl(me.originalName), webcal = url.replace(/^https?:/, 'webcal:');
        return `<div class="opt-block"><div class="opt-txt"><span>Turni nel calendario del telefono</span><small>Un calendario con i tuoi turni, le assenze e le reperibilità che si aggiorna da solo (di solito entro un’ora; Google a volte ci mette di più).</small></div>
            <div class="cal-btns">
                <a class="cal-btn" href="${esc(webcal)}"><span class="material-icons-round">phone_iphone</span>iPhone / iPad</a>
                <button class="cal-btn" onclick="copyMyCalLink()"><span class="material-icons-round">content_copy</span>Copia il link</button>
                <button class="cal-btn" onclick="downloadMyIcs()"><span class="material-icons-round">download</span>Scarica ora</button>
            </div>
            <small class="cal-help"><b>Google Calendar</b>: dal computer apri calendar.google.com › Altri calendari › + › Da URL e incolla il link copiato. <b>iPhone</b>: tocca il pulsante e conferma “Iscriviti”; se non si apre niente, copia il link e vai in Impostazioni › Calendario › Account › Aggiungi account › Altro › Aggiungi calendario sottoscritto, poi incollalo. “Scarica ora” importa una copia che non si aggiorna.</small></div>`;
    }

    function openOptionsCal() { openOptionsModal(); setTimeout(() => { const el = document.getElementById('opt-cal'); if(el) el.scrollIntoView({ block:'start' }); }, 350); }

    // ── Notifiche Web Push ──
    function b64uToBytes(s) { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...b].map(c => c.charCodeAt(0))); }
    function pushIdOf(endpoint) { let h = 5381; for(let i = 0; i < endpoint.length; i++) h = ((h << 5) + h + endpoint.charCodeAt(i)) >>> 0; return 'p' + h.toString(16) + endpoint.length.toString(16); }
    function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
    async function pushCurrent() { if(!pushSupported()) return null; const reg = await navigator.serviceWorker.getRegistration(); return reg ? reg.pushManager.getSubscription() : null; }
    async function pushEnable() {
        vibrate();
        if(!pushSupported()) {
            const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
            ccDialog('Notifiche non disponibili qui', ios ? 'Su iPhone le notifiche funzionano solo con l’app installata: Condividi › Aggiungi alla schermata Home, poi aprila dall’icona e riprova.' : 'Questo browser non supporta le notifiche. Prova con Chrome.', [{ label: 'Ok', kind: 'primary', value: true }]);
            return;
        }
        if(!pushMeOrNull()) { ccToast('Scegli prima chi sei.', true); return; }
        const perm = await Notification.requestPermission();
        if(perm !== 'granted') { ccToast('Permesso negato: si può riattivare dalle impostazioni del browser.', true); return; }
        try {
            const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
            const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(VAPID_PUBLIC) });
            const id = pushIdOf(sub.endpoint), json = sub.toJSON();
            await cfgRef('push').set({ subs: { [id]: { owner: prefOwner(), sub: { endpoint: json.endpoint, keys: json.keys }, ua: navigator.userAgent.slice(0, 120), createdAt: new Date().toISOString() } } }, { merge: true });
            try { localStorage.setItem('push_id', id); } catch(e) {}
            reg.showNotification('Notifiche attive', { body: 'Riceverai qui gli avvisi sui tuoi turni, anche ad app chiusa.', icon: 'icon-autisti3-192.png', tag: 'push-ok' });
            ccToast('Notifiche attivate'); renderOptions();
        } catch(e) { console.error(e); ccToast('Attivazione non riuscita: ' + (e.message || e), true); }
    }
    async function pushDisable() {
        vibrate();
        try { const sub = await pushCurrent(); if(sub) { const id = pushIdOf(sub.endpoint); await sub.unsubscribe(); await cfgRef('push').update({ ['subs.' + id]: firebase.firestore.FieldValue.delete() }).catch(() => {}); } } catch(e) {}
        try { localStorage.removeItem('push_id'); } catch(e) {}
        ccToast('Notifiche disattivate'); renderOptions();
    }
    // Se cambia chi usa il telefono, la sottoscrizione passa al nuovo nome.
    async function pushSyncOwner() {
        try { const sub = await pushCurrent(); if(!sub || !fbReady) return; const id = pushIdOf(sub.endpoint); await cfgRef('push').set({ subs: { [id]: { owner: prefOwner() } } }, { merge: true }); } catch(e) {}
    }
    function pushMeOrNull() { return (userIdentity && userIdentity !== 'Ospite') ? userIdentity : null; }
    function pushOptionsHtml() {
        setTimeout(async () => {
            const el = document.getElementById('push-state'), btn = document.getElementById('push-btn'); if(!el || !btn) return;
            if(!pushSupported()) { el.textContent = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'Su iPhone serve l’app installata sulla schermata Home.' : 'Non supportate da questo browser.'; btn.textContent = 'Come fare'; return; }
            const sub = await pushCurrent();
            el.textContent = sub && Notification.permission === 'granted' ? 'Attive su questo telefono.' : 'Spente: ricevi gli avvisi solo aprendo l’app.';
            btn.textContent = sub ? 'Disattiva' : 'Attiva'; btn.onclick = sub ? pushDisable : pushEnable;
        }, 0);
        return `<div class="option-item"><div class="opt-txt"><span>Notifiche sul telefono</span><small id="push-state">…</small><small>Cambi ai turni, reperibilità di domani e richieste arrivano anche ad app chiusa (con qualche minuto di ritardo). Usano le scelte qui sotto.</small></div>
            <button class="btn-change-identity" id="push-btn" onclick="pushEnable()">Attiva</button></div>`;
    }

    // ── Modalità server (usata dal motore su GitHub) ──
    function serverReady() { return appBooted && finalData.length > 1 && (dataSourceMode !== 'firebase' || fbMonthsReady()); }
    async function serverExport() {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const from = new Date(today); from.setDate(from.getDate() - 35);
        const fromIso = ymd(from), todayIso = ymd(today), horizon = repDateAdd(todayIso, 70);
        const R = repData(), people = drivers.filter(d => !d.hidden || d.test);   // TEST riceve gli avvisi come un operatore
        const ics = {}, schedule = {}, labels = {}, repTomorrow = {}, tomorrow = repDateAdd(todayIso, 1);
        people.forEach(d => {
            ics[calSlug(d.originalName)] = icsFor(d, fromIso);
            const sc = schedule[d.originalName] = {};
            for(let r = 1; r < finalData.length; r++) {
                const iso = repRowDate(r); if(!iso || iso < todayIso || iso > horizon) continue;
                const ev = dayEvents(r, d), key = x => (x.kind === 'abs' ? 'A-' : '') + x.code;   // A-: assenza (p = permesso, non pomeriggio diurno)
                sc[iso] = ev.map(key).join('+'); ev.forEach(x => { labels[key(x)] = x.t ? `${x.label} ${x.t[0]}–${x.t[1]}` : x.label; });
            }
        });
        const slotName = ['00–07', '07–13', '13–20', '20–24'];
        people.forEach(d => {
            const mine = []; (R.days[tomorrow] || []).forEach((w, s) => { if(w === d.originalName && s >= 2) mine.push(slotName[s]); });
            (R.days[repDateAdd(tomorrow, 1)] || []).forEach((w, s) => { if(w === d.originalName && s < 2) mine.push(slotName[s] + ' del giorno dopo'); });
            if(R.tit[tomorrow] === d.originalName) repTomorrow[d.originalName] = 'reperibile dalle 13:00 di domani per 24 ore';
            else if(mine.length) repTomorrow[d.originalName] = 'reperibile domani nelle fasce ' + mine.join(', ');
        });
        let prefsDoc = {}, subs = {}, requests = [];
        try { const p = await cfgRef('prefs').get(); prefsDoc = p.exists ? p.data() : {}; } catch(e) {}
        try { const p = await cfgRef('push').get(); subs = p.exists ? (p.data().subs || {}) : {}; } catch(e) {}
        try {
            const q = await db.collection('richieste_turni').orderBy('timestamp', 'desc').limit(80).get();
            requests = q.docs.map(x => { const r = x.data(); return { id: x.id, name: r.name || '', type: (RICHIESTE_TYPE_LABELS && RICHIESTE_TYPE_LABELS[r.type]) || String(r.type || '').replace(/_/g, ' '), kind: r.type || '', timeSlot: r.timeSlot || '', auto: reqIsAutoCessione(r), dateFrom: r.dateFrom || '', dateTo: r.dateTo || '', swapWith: r.swapWith || '', inserted: !!r.insertedInShifts }; });
        } catch(e) {}
        // note degli operatori ancora da gestire: al coordinatore arrivano come le richieste (id nuovo se la nota cambia)
        const notes = (prefsDoc && prefsDoc[NOTE_FIELD]) || {};
        Object.keys(notes).forEach(k => { const n = notes[k] || {}; if(!n.date || !n.author || n.status === 'fatta' || (n.to && n.to !== 'COORD')) return;
            requests.push({ id: 'nota-' + k + '-' + (n.updatedAt || ''), name: noteName(n), type: 'nota per il coordinatore' + (NOTE_PREFS[n.pref] ? ' (preferisce ' + NOTE_PREFS[n.pref].label.toLowerCase() + ')' : '') + (n.text ? ': ' + String(n.text).slice(0, 140) : ''), kind: 'nota', timeSlot: '', auto: false, dateFrom: n.date, dateTo: n.date, swapWith: '', inserted: false }); });
        // note mandate con "Invia notifica" e risposte nelle chat: il motore le manda sul telefono una volta sola (chiave)
        // destinatari: nomi originali, '*all*' (tutti) o '*coord*' (i coordinatori); exclude = chi l'ha scritta
        const noteMsgs = [], base = appBaseUrl();
        Object.keys(notes).forEach(k => { const raw = notes[k] || {}; if(!raw.author) return;
            const n = Object.assign({ id: k, text: '', date: '' }, raw, { id: k }), t = noteTo(n), who = n.author === 'COORD' ? '*coord*' : n.author;
            const url = base + '?nota=' + encodeURIComponent(k), tag = 'nota-' + k, day = n.date ? noteWhen(n.date) + ': ' : '';
            if(n.push && t !== 'COORD') noteMsgs.push({ key: 'n-' + k + '-' + (n.updatedAt || ''), at: n.updatedAt || n.createdAt || '', to: [t === 'ALL' ? '*all*' : t], exclude: [who], title: t === 'ALL' ? 'Nota per tutti da ' + noteName(n) : 'Nota da ' + noteName(n), body: day + String(n.text || '').slice(0, 200), url, tag });
            const reps = noteReplies(n);
            reps.forEach((r, i) => { const by = r.by === 'COORD' ? '*coord*' : r.by, to = new Set([who]);
                if(t !== 'ALL') to.add(t === 'COORD' ? '*coord*' : t);
                reps.slice(0, i).forEach(x => to.add(x.by === 'COORD' ? '*coord*' : x.by)); to.delete(by);
                if(to.size) noteMsgs.push({ key: 'r-' + k + '-' + r.id, at: r.at || '', to: [...to], exclude: [by], title: 'Risposta di ' + noteReplyName(r), body: (n.author === 'COORD' ? 'Nota del coordinatore' : 'Nota di ' + noteName(n)) + (n.date ? ' (' + noteWhen(n.date) + ')' : '') + ': ' + String(r.text || '').slice(0, 200), url, tag });
            });
        });
        prefsDoc = Object.assign({}, prefsDoc); delete prefsDoc[NOTE_FIELD];
        // il coordinatore con tutti i nomi con cui può aver scelto "chi sei" (nome mostrato e nome originale)
        const cd = coordinatorName ? drivers.find(d => normalizeNameForMatch(d.name) === normalizeNameForMatch(coordinatorName) || normalizeNameForMatch(d.originalName) === normalizeNameForMatch(coordinatorName)) : null;
        const coordinators = [COORD_ID, coordinatorName, cd && cd.name, cd && cd.originalName].concat(typeof AS_OPERATORI !== 'undefined' ? AS_OPERATORI : []).filter(Boolean).map(x => String(x).toUpperCase());
        await consFlush(4000);   // il motore chiude subito dopo: salva prima il contatore dei consumi
        return { team: document.title, url: appBaseUrl(), today: todayIso, tomorrow, people: people.map(d => ({ orig: d.originalName, name: d.name, slug: calSlug(d.originalName) })),
            ics, schedule, labels, repTomorrow, prefs: prefsDoc, subs, requests, coordinators, noteMsgs };
    }
    async function serverRemoveSubs(ids) {
        if(!ids || !ids.length) return 0;
        const upd = {}; ids.forEach(id => upd['subs.' + id] = firebase.firestore.FieldValue.delete());
        await cfgRef('push').update(upd).catch(() => {}); return ids.length;
    }

    // ═══ IMPORTA DA EXCEL (periodo di passaggio) ═══════════════════════════
    // Finché il coordinatore prepara i turni su Excel: il file si confronta con i turni dell'app
    // e le differenze diventano modifiche in sospeso nel calendario (da controllare, poi Salva).
    // Le persone dell'app che mancano nel file e gli straordinari inseriti nell'app non si toccano.
    const IMPORT_OFFICIAL = { label: 'il file dell’app autisti ufficiale', url: 'https://centrale118rsm-code.github.io/Turni-Autisti-2026-Rsm/' + 'turni' + '.xlsx' };
    let importLast = null, importSel = {};
    function importReadRaw(ws) {
        const raw = [];
        ws.eachRow({ includeEmpty: true }, (row, rn) => {
            const line = [];
            row.eachCell({ includeEmpty: true }, (cell, cn) => { let v = cell.value; if(typeof v === 'object' && v !== null) v = v.result || v.richText?.[0]?.text || ''; line[cn] = { v }; });
            raw[rn] = line;
        });
        return raw;
    }
    // Righe del file nel formato del calendario + anno del primo mese + titolari di reperibilità.
    // autisti: formato del file autisti (le reperibilità a fasce non si importano)
    function importParseRaw(raw) {
        const keep = asRepFasce;
        try {
            const rows = asParseWorkbook(raw);
            let year = parseInt(asCellV((raw[2] || [])[1])) || activeYear, last = -1;
            rows.slice(1).forEach(row => { const mi = MONTH_MAP[row[0].v]; if(mi === undefined) return; if(mi < last) year++; last = mi; row.year = year; });
            return { rows, rep: {} };
        } finally { asRepFasce = keep; }
    }
    function importParseRawInf(raw) {
        const rows = parseHorizontalLayout(raw), yearTxt = (raw[1] || []).map(c => String((c && c.v) || '')).join(' ').match(/\b(20\d\d)\b/);
        const baseYear = yearTxt ? +yearTxt[1] : activeYear, header = rows[0], rep = {};
        let year = baseYear, last = -1;
        rows.slice(1).forEach(row => {
            const mi = MONTH_MAP[row[0].v]; if(mi === undefined) return;
            if(mi < last) year++; last = mi; row.year = year;
            for(let c = 3; c < row.length; c++) { const x = row[c] || {}; if([x.v, x.subV, x.supV].some(v => isRepStr((v || '').toString()))) { rep[ymd(new Date(year, mi, parseInt(row[1].v)))] = header[c]; break; } }
        });
        return { rows, rep };
    }
    function importCellVal(x) {
        let v = (x && x.v !== undefined && x.v !== null ? x.v : '').toString().trim(); if(isRepStr(v)) v = v.slice(0, v.indexOf('/')).trim();
        const subV = (x && x.subV !== undefined && x.subV !== null ? x.subV : '').toString().trim();
        return { v, subV };
    }
    function importAnalyze(parsed, fileName) {
        const { rows, rep } = parsed, header = rows[0].slice(3);
        const byNorm = {}; drivers.forEach(d => { byNorm[normalizeNameForMatch(d.originalName)] = d; byNorm[normalizeNameForMatch(d.name)] = d; });
        const map = header.map(n => byNorm[normalizeNameForMatch(n)] || null);
        const unknown = header.filter((n, i) => !map[i]);
        const missing = drivers.filter(d => !d.hidden && !map.includes(d)).map(d => d.name);
        const months = {}, otherYears = new Set(), today = ymd(new Date());
        const M = mi => months[mi] = months[mi] || { mi, cells: [], rep: [], people: new Set(), days: 0 };
        rows.slice(1).forEach(row => {
            const mi = MONTH_MAP[row[0].v], dn = parseInt(row[1].v); if(mi === undefined || isNaN(dn)) return;
            const nextY = row.year === activeYear + 1 && mi < NEXT_YEAR_MONTHS, gi = nextY ? 12 + mi : mi;   // gi: 12+ = mesi dell'anno dopo
            if(row.year !== activeYear && !nextY) { otherYears.add(MONTH_NAMES_IT[mi] + ' ' + row.year); return; }
            M(gi).days++;
            map.forEach((d, i) => {
                if(!d) return;
                const key = overrideKey(d.originalName, row[0].v, dn, row.year), cur = manualOverrides[key] || null, x = importCellVal(row[i + 3]);
                const cv = cur ? (cur.v || '').toString().trim() : '', cs = cur ? (cur.subV || '').toString().trim() : '';
                if(cv === x.v && cs === x.subV) return;
                const hasMin = cur && cur.customMinutes !== undefined && cur.customMinutes !== null && cur.customMinutes !== '';
                let next = (x.v || x.subV) ? { v: x.v, subV: x.subV } : null;
                if(hasMin) next = Object.assign(next || { v: '', subV: '' }, { customMinutes: cur.customMinutes });   // lo straordinario resta
                if(cur && cur.perm && next && next.v && !x.subV) next.perm = cur.perm;   // anche il permesso a ore dentro il turno
                months[gi].cells.push({ key, next, prev: cur, name: d.name, dn, iso: ymd(new Date(row.year, mi, dn)) });
                months[gi].people.add(d.name);
            });
        });
        const R = repData();
        Object.keys(rep).forEach(iso => {
            const [y, m] = iso.split('-').map(Number); if(y !== activeYear && !(y === activeYear + 1 && m - 1 < NEXT_YEAR_MONTHS)) return;
            const d = byNorm[normalizeNameForMatch(rep[iso])]; if(!d) return;
            if((R.tit[iso] || '') === d.originalName) return;
            M(y === activeYear ? m - 1 : 12 + m - 1).rep.push({ iso, orig: d.originalName, name: d.name, prev: R.tit[iso] ? (drivers.find(x => x.originalName === R.tit[iso]) || { name: R.tit[iso] }).name : '' });
        });
        const curMonth = today.startsWith(activeYear + '-') ? new Date().getMonth() : (activeYear > new Date().getFullYear() ? -1 : 12);
        importSel = {};
        Object.values(months).forEach(m => { importSel[m.mi] = (m.cells.length + m.rep.length) > 0 && m.mi >= curMonth; });
        importLast = { fileName, at: new Date(), months, unknown, missing, otherYears: [...otherYears], hasRep: Object.keys(rep).length > 0 };
    }
    async function importLoadBuffer(buf, fileName) {
        const el = document.getElementById('imp-status'); if(el) el.innerHTML = '<p class="cc-note">Leggo il file…</p>';
        try {
            await loadLib('excel');
            const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
            importAnalyze(importParseRaw(importReadRaw(wb.worksheets[0])), fileName);
        } catch(e) { console.error(e); importLast = null; ccToast('File non leggibile: ' + (e.message || e), true); }
        renderCcImport();
    }
    function importPickFile() {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx';
        inp.onchange = () => { const f = inp.files[0]; if(!f) return; const r = new FileReader(); r.onload = () => importLoadBuffer(r.result, f.name); r.readAsArrayBuffer(f); };
        inp.click();
    }
    async function importFromOfficial() {
        try {
            const r = await fetch(IMPORT_OFFICIAL.url + '?t=' + Date.now(), { cache: 'no-store' }); if(!r.ok) throw new Error('HTTP ' + r.status);
            const lm = r.headers.get('last-modified');
            await importLoadBuffer(await r.arrayBuffer(), IMPORT_OFFICIAL.label + (lm ? ' (caricato il ' + new Date(lm).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ')' : ''));
        } catch(e) { ccToast('Non riesco a scaricare il file: ' + (e.message || e), true); }
    }
    function importApply() {
        if(!importLast) return;
        if(isViewingArchive()) { ccToast('Anno archiviato: non si può modificare.', true); return; }
        if(pendingChangesCount()) { ccToast('Prima salva o annulla le modifiche in sospeso.', true); return; }
        const ms = Object.values(importLast.months).filter(m => importSel[m.mi]);
        const cells = ms.flatMap(m => m.cells), reps = ms.flatMap(m => m.rep);
        if(!cells.length && !reps.length) { ccToast('Nessun mese scelto con differenze.', true); return; }
        if(!coordEditModeActive) toggleCoordEditMode(true);
        const entries = [], keys = [], repDates = [];
        cells.forEach(c => { const prev = setOverride(c.key, c.next); entries.push({ key: c.key, prev, next: c.next }); keys.push(c.key); });
        reps.forEach(r => { const en = repChange('rep', r.iso, r.orig); entries.push(en); repDates.push(...repDatesOfKey('rep', r.iso)); });
        pushUndo({ entries }); afterCoordChange(keys, repDates);
        const n = cells.length + reps.length;
        importLast = null; closeCoordConsole();
        ccToast(`Dal file Excel: ${cells.length} caselle${reps.length ? ` e ${reps.length} reperibilità` : ''} nel calendario. Controlla (sono evidenziate), poi Salva o Annulla.`);
        return n;
    }
    // ═══ FILE EXCEL PRINCIPALE (Autisti 2026.xlsm) ══════════════════════════
    // Dal file principale si leggono: i turni dal foglio CARTELLINO (stesso contenuto del file
    // piccolo turni.xlsx, spostato di 3 colonne) e le ore delle assenze dal foglio CONTEGGI ORARI
    // (per ogni autista: codice assenza, turno, ore lavorate, ore di assenza). Le ore delle assenze si
    // salvano subito (documento prova_ore_assenze) e il conteggio orario dell'app le usa al minuto;
    // i turni passano dal solito confronto di "Importa da Excel" prima di finire nel calendario.
    function xlCellVal(v) {
        if(v && typeof v === 'object' && !(v instanceof Date)) v = v.result !== undefined ? v.result : (v.richText ? v.richText.map(t => t.text).join('') : (v.text || ''));
        return v === undefined || v === null ? '' : v;
    }
    function xlMinutes(v) {
        v = xlCellVal(v);
        if(v instanceof Date) return Math.round(((v.getTime() / 60000) % 1440 + 1440) % 1440);
        if(typeof v === 'number') return Math.round(v * 1440);
        const m = String(v).trim().match(/^(-?)(\d{1,2}):(\d{2})/); if(!m) return null;
        return (m[1] ? -1 : 1) * (+m[2] * 60 + +m[3]);
    }
    function mainParseWorkbook(wb) {
        const ct = wb.getWorksheet('CONTEGGI ORARI'), car = wb.getWorksheet('CARTELLINO'), tur = wb.getWorksheet('TURNI');
        if(!ct || !car) throw new Error('non è il file principale: mancano i fogli CONTEGGI ORARI o CARTELLINO');
        const year = parseInt(xlCellVal(tur && tur.getCell('A4').value)) || activeYear;
        // ore delle assenze: riga 2 = nomi (uno ogni 6 colonne), dalla riga 6 un giorno per riga
        const people = [];
        for(let c = 1; c <= 60; c++) {
            const n = String(xlCellVal(ct.getCell(2, c).value)).trim(); if(!n || n.length < 3) continue;
            const d = drivers.find(x => normalizeNameForMatch(x.originalName) === normalizeNameForMatch(n) || normalizeNameForMatch(x.name) === normalizeNameForMatch(n))
                || drivers.find(x => normalizeNameForMatch(x.originalName).startsWith(normalizeNameForMatch(n).replace(/\.$/, '').slice(0, 7)));
            if(d && !people.some(p => p.d === d)) people.push({ c, d });
        }
        const min = {}; let y = year, month = -1, nAbs = 0;
        for(let r = 6; r <= ct.rowCount; r++) {
            const mTxt = String(xlCellVal(ct.getCell(r, 1).value)).toUpperCase();
            const mk = Object.keys(MONTH_MAP).find(m => mTxt.includes(m));
            if(mk !== undefined) { const mi = MONTH_MAP[mk]; if(mi < month) y++; month = mi; }
            const dn = parseInt(xlCellVal(ct.getCell(r, 2).value)); if(month < 0 || isNaN(dn) || dn < 1 || dn > 31) continue;
            const iso = ymd(new Date(y, month, dn));
            people.forEach(p => {
                const code = String(xlCellVal(ct.getCell(r, p.c).value)).trim();
                if(!code || code === '0') return;
                const m = xlMinutes(ct.getCell(r, p.c + 3).value); if(m === null) return;
                min[iso + '|' + p.d.originalName] = m; nAbs++;
            });
        }
        // turni: CARTELLINO righe 1-28, colonne spostate di 3 rispetto al file piccolo; i nomi stanno in colonna A
        const raw = [];
        for(let r = 1; r <= 28; r++) {
            const line = [];
            const nc = car.getCell(r, 1);   // nome unito su due righe: vale solo la prima
            line[1] = { v: nc.isMerged && nc.master && nc.master.address !== nc.address ? '' : xlCellVal(nc.value) };
            for(let c = 2; c <= car.columnCount - 3; c++) line[c] = { v: xlCellVal(car.getCell(r, c + 3).value) };
            raw[r] = line;
        }
        raw[2][1] = { v: year };
        return { raw, min, nAbs, people: people.length };
    }
    async function importMainBuffer(buf, fileName) {
        ccToast('Leggo il file principale… (qualche secondo)');
        try {
            await loadLib('excel');
            const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
            const res = mainParseWorkbook(wb);
            if(!res.people) throw new Error('nel foglio CONTEGGI ORARI non trovo gli autisti dell’app');
            absMinImported = res.min; refreshAfterRemoteOverrides();
            if(fbReady) await cfgRef('ore_assenze').set({ min: res.min, fileName, importedAt: new Date().toISOString(), by: whoAmI() });
            if(dataSourceMode === 'firebase') {
                importAnalyze(importParseRaw(res.raw), fileName);
                ccGo('importa');
                ccToast(`Ore di ${res.nAbs} assenze prese dal file principale. Controlla qui sotto i turni che cambiano, poi Porta nel calendario.`);
            } else {
                ccToast(`Ore di ${res.nAbs} assenze prese dal file principale: il conteggio orario ora le usa al minuto. I turni restano quelli di turni.xlsx.`);
                ccRefreshIfOpen();
            }
        } catch(e) { console.error(e); ccToast('File principale non leggibile: ' + (e.message || e), true); }
    }
    function importPickMain() {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsm,.xlsx';
        inp.onchange = () => { const f = inp.files[0]; if(!f) return; const r = new FileReader(); r.onload = () => importMainBuffer(r.result, f.name); r.readAsArrayBuffer(f); };
        inp.click();
    }
    function importPickSmall() {
        if(dataSourceMode !== 'firebase') { ccToast('L’app legge già turni.xlsx da sola: per aggiornarla basta caricare il file nuovo su GitHub. Il caricamento da qui serve dopo il passaggio a Firebase.', true); return; }
        ccGo('importa'); importPickFile();
    }
    function absImportInfoHtml() {
        return `<p class="cc-note" style="margin-top:10px">Ore delle assenze: l’app le calcola come il file Excel (foglio CONTEGGI ORARI), seguendo il ciclo del turno P › M › N › S › R, senza bisogno di importarle. Se un giorno nel file ha ore scritte a mano diverse, correggilo con «Ore a mano» in Modifica turni.</p>`;
    }
    function renderCcImport() {
        const main = document.getElementById('cc-main'); if(!main) return;
        const mName = m => MONTH_NAMES_IT[m % 12].charAt(0).toUpperCase() + MONTH_NAMES_IT[m % 12].slice(1) + (m >= 12 ? ' ' + (activeYear + 1) : '');
        if(dataSourceMode !== 'firebase') {
            main.innerHTML = `<div class="cc-panel"><div class="cc-panel-body"><p class="cc-note">L’app legge ancora i turni direttamente da ${esc(FILE_NAME.split("?")[0])}: basta aggiornare quel file. L’importazione serve dopo il passaggio a Firebase (Dati e backup).</p></div></div>`;
            return;
        }
        const L = importLast;
        let body = '';
        if(L) {
            const list = Object.values(L.months).sort((a, b) => a.mi - b.mi);
            const tot = list.reduce((a, m) => a + (importSel[m.mi] ? m.cells.length + m.rep.length : 0), 0);
            const fmtD = iso => new Date(iso + 'T12:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
            const cellTxt = x => x ? [x.v, x.subV ? '(' + x.subV + ')' : ''].filter(Boolean).join(' ') || '—' : '—';
            const warn = [];
            if(L.unknown.length) warn.push(`<li><span class="msym" style="color:var(--cc-warn)">person_off</span><span class="cc-grow"><b style="font-weight:600">Nel file ma non nell’app: ${esc(L.unknown.join(', '))}</b><small>Queste righe non vengono importate. Se è un nuovo collega aggiungilo prima in Operatori.</small></span></li>`);
            if(L.missing.length) warn.push(`<li><span class="msym" style="color:var(--cc-muted)">person_search</span><span class="cc-grow"><b style="font-weight:600">Nell’app ma non nel file: ${esc(L.missing.join(', '))}</b><small>I loro turni nell’app restano come sono.</small></span></li>`);
            if(L.otherYears.length) warn.push(`<li><span class="msym" style="color:var(--cc-muted)">event_busy</span><span class="cc-grow"><b style="font-weight:600">Mesi di un altro anno: ${esc(L.otherYears.join(', '))}</b><small>Non importati: l’anno attivo è il ${activeYear}. Si importano dopo aver aperto il nuovo anno.</small></span></li>`);
            body = `
            <div class="cc-panel"><div class="cc-panel-head"><h3>Cosa cambia</h3><span class="cc-hint">${esc(L.fileName)}</span></div><div class="cc-panel-body">
                ${list.length ? `<div class="cc-table-wrap"><table class="cc-table imp-table"><thead><tr><th></th><th>Mese</th><th>Caselle diverse</th><th>Persone</th>${L.hasRep ? '<th>Reperibilità</th>' : ''}</tr></thead><tbody>
                ${list.map(m => { const n = m.cells.length + m.rep.length; return `<tr class="${n ? '' : 'imp-same'}"><td><input type="checkbox" ${importSel[m.mi] ? 'checked' : ''} ${n ? '' : 'disabled'} onchange="importSel[${m.mi}]=this.checked;renderCcImport()"></td>
                    <td><b>${mName(m.mi)}</b>${m.mi < new Date().getMonth() && activeYear === new Date().getFullYear() ? ' <small>passato</small>' : ''}</td>
                    <td>${m.cells.length || '<small>uguale</small>'}</td><td>${m.people.size ? `<small>${esc([...m.people].slice(0, 6).join(', '))}${m.people.size > 6 ? ` e altri ${m.people.size - 6}` : ''}</small>` : ''}</td>${L.hasRep ? `<td>${m.rep.length || '<small>uguale</small>'}</td>` : ''}</tr>`; }).join('')}
                </tbody></table></div>` : '<p class="cc-note">Nel file non ci sono giorni del ' + activeYear + '.</p>'}
                ${list.filter(m => importSel[m.mi] && (m.cells.length || m.rep.length)).map(m => `<details class="imp-det"><summary>Dettaglio di ${mName(m.mi).toLowerCase()} (${m.cells.length + m.rep.length})</summary><ul>
                    ${m.cells.slice().sort((a, b) => a.dn - b.dn || a.name.localeCompare(b.name)).slice(0, 150).map(c => `<li><span>${fmtD(c.iso)}</span> <b>${esc(c.name)}</b> ${esc(cellTxt(c.prev))} → <b>${esc(cellTxt(c.next))}</b></li>`).join('')}
                    ${m.cells.length > 150 ? `<li><small>… e altre ${m.cells.length - 150}</small></li>` : ''}
                    ${m.rep.map(r => `<li><span>${fmtD(r.iso)}</span> reperibile: ${esc(r.prev || '—')} → <b>${esc(r.name)}</b></li>`).join('')}
                </ul></details>`).join('')}
                ${warn.length ? `<ul class="cc-list" style="margin-top:12px">${warn.join('')}</ul>` : ''}
                <div class="cc-inline-form" style="margin-top:14px">
                    <button class="cc-btn primary" ${tot ? '' : 'disabled'} onclick="importApply()"><span class="msym">move_down</span>Porta nel calendario (${tot})</button>
                    <button class="cc-btn" onclick="importLast=null;renderCcImport()">Chiudi</button>
                </div>
                <p class="cc-note" style="margin-top:10px">Le differenze diventano modifiche in sospeso, evidenziate nel calendario: controlli, correggi se serve e poi <b>Salva</b> (oppure Annulla). Prima del salvataggio non cambia niente per nessuno.</p>
            </div></div>`;
        }
        main.innerHTML = `
            <div class="cc-panel"><div class="cc-panel-head"><h3>Carica il file</h3></div><div class="cc-panel-body">
                <p class="cc-note" style="margin-bottom:12px">Finché prepari i turni su Excel, caricalo qui ogni volta che lo aggiorni: l’app lo confronta con i turni che ha e ti mostra mese per mese cosa cambia, prima di salvare.</p>
                <div class="cc-inline-form">
                    <button class="cc-btn primary" onclick="importPickFile()"><span class="msym">upload_file</span>Scegli il file Excel…</button>
                    <button class="cc-btn" onclick="importFromOfficial()"><span class="msym">cloud_download</span>Prendi ${esc(IMPORT_OFFICIAL.label)}</button>
                </div>
                <div id="imp-status"></div>
            </div></div>
            ${body}
            <div class="cc-panel"><div class="cc-panel-head"><h3>Per lasciare Excel</h3></div><div class="cc-panel-body">
                <ol class="imp-steps">
                    <li>Per qualche settimana prepara i turni come sempre su Excel e importali qui dopo ogni modifica: tutti li vedono nell’app.</li>
                    <li>Le piccole correzioni (cambi, assenze, reperibilità) falle direttamente in <b>Modifica turni</b>, senza passare dall’Excel.</li>
                    <li>Il mese nuovo preparalo con <b>Bozza del mese</b>, poi sistemalo in Modifica turni.</li>
                    <li>Quando il mese dopo lo prepari tutto qui, l’Excel non serve più: per la bacheca c’è la stampa PDF del mese.</li>
                </ol>
                <p class="cc-note">Attenzione: importando un mese, le modifiche fatte nell’app su quel mese vengono riportate a com’è il file (le vedi nel dettaglio prima). Per questo, nel mese in cui passi all’app, non importare più quel mese.</p>
            </div></div>`;
    }

    // ═══ VISTA COMPATTA (solo in Modifica turni) ═══════════════════════════
    // Caselle piccole con il colore e la sigla del turno e la sola scritta REP (niente orari né
    // fasce), per vedere più giorni e più colleghi insieme. Si accende dalla ruota strumenti.
    let calCompact = (() => { try { return localStorage.getItem('cal_compact_v1') === '1'; } catch(e) { return false; } })();
    // fuori dalla modifica la vista compatta la sceglie ognuno per sé (Opzioni > Come vedere il calendario)
    function calCompactOn() { if(calOverview) return false; return coordEditModeActive ? calCompact : !!(prefs && prefs.calView === 'compatta'); }
    const MINI_SHORT = { 't-M':'M', 't-P':'P', 't-N':'N', 't-S':'S', 't-SM':'S', 't-R':'R', 'd-M':'m', 'd-P':'p', 'd-R':'r',
        'spec-cong':'C.O.', 'spec-mal':'MAL', 'spec-gr':'GR', 'spec-ferie':'F.R.', 'spec-rec':'REC', 'spec-coord':'Z', 'spec-perm':'PERM',
        'spec-pn':'PN', 'spec-mn':'M+N', 'spec-nl':'NL', 'spec-ng':'NG', 'spec-stu':'STU', 'spec-pl':'PL', 'spec-ps':'PS', 'spec-xk':'DS', 'spec-xs':'SPO', 'spec-xl':'LUT', 'spec-xa':'MAT' };
    function miniCellHtml(html) {
        const m = html.match(/^\s*<div class="cell ([^"]*)"((?:\s+style="[^"]*")?)/); if(!m) return html;
        const cls = m[1].split(/\s+/), style = m[2] || '';
        const text = () => html.replace(/<div class="(time-tag|rep-text|rep-bar)[\s\S]*$/, '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        let short = '';
        for(const c of cls) if(MINI_SHORT[c]) { short = MINI_SHORT[c]; break; }
        if(!short && !cls.includes('empty')) {
            const words = text().split(' ').filter(w => /\w/.test(w));
            short = words.length > 1 ? words.slice(0, 3).map(w => w.charAt(0)).join('') : (words[0] || '').slice(0, 4);
        }
        const rep = html.includes('class="rep-text"') ? '<span class="mini-rep">REP</span>' : '';
        return `<div class="cell ${m[1]} mini"${style}><b>${esc(short)}</b>${rep}</div>`;
    }
    function calToggleCompact() {
        vibrate(); calCompact = !calCompact;
        try { localStorage.setItem('cal_compact_v1', calCompact ? '1' : '0'); } catch(e) {}
        calCompactUi();
        if(finalData.length) renderTable();
        ccToast(calCompact ? 'Vista compatta: solo turni e REP' : 'Vista completa');
    }
    function calCompactUi() {
        document.body.classList.toggle('cal-compact', calCompactOn());
        try { ddSync(); } catch(e) {}
        ['tw-view-btn', 'tw-sat-view'].forEach(id => {
            const b = document.getElementById(id); if(!b) return;
            b.classList.toggle('on', calCompact);
            b.title = calCompact ? 'Torna alla vista completa' : 'Vista compatta: solo turni e REP';
            const ic = b.querySelector('.msym'); if(ic) ic.textContent = calCompact ? 'view_agenda' : 'view_compact';
        });
    }

