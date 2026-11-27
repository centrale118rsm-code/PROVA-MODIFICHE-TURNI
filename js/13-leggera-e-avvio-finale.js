    // ═══ MODALITÀ LEGGERA ════════════════════════════════════════════════
    // Il calendario completo ha ~9.000 caselle: su iPhone Safari non fa in tempo a disegnarle
    // mentre si scorre (si vede bianco). In modalità leggera si mostrano pochi mesi (al massimo 4)
    // e il mese prima/dopo si aggiunge da solo quando ci si avvicina al bordo.
    let liteFrom = null, liteTo = null, liteKey = '', liteObs = null, mbCache = null, mbFor = null, mbLen = 0;
    function monthBlocks() {
        if(mbFor === finalData && mbLen === finalData.length && mbCache) return mbCache;
        const list = []; let cur = null;
        for(let i = 1; i < finalData.length; i++) {
            const n = finalData[i][0].v;
            if(n && (!cur || n !== cur.name)) { cur = { name: n, start: i, end: i }; list.push(cur); }
            else if(cur) cur.end = i;
        }
        mbCache = list; mbFor = finalData; mbLen = finalData.length; return list;
    }
    function liteOn() { return !!(prefs && prefs.lite); }
    function liteBlockOf(r) { return monthBlocks().findIndex(b => r >= b.start && r <= b.end); }
    function liteTodayRow() { const t = new Date(); t.setHours(0, 0, 0, 0); const d = buildDaysIndex().find(x => x.date.getTime() === t.getTime()); return d ? d.rowIdx : null; }
    function liteCheckRange() {
        const n = monthBlocks().length, key = SHIFT_YEAR + ':' + n;
        if(liteFrom !== null && liteKey === key && liteTo < n) return;
        liteKey = key;
        const tr = liteTodayRow(); let b = tr ? liteBlockOf(tr) : 0; if(b < 0) b = 0;
        liteFrom = b; liteTo = Math.min(n - 1, b + 1);
    }
    function liteRowShown(r) { const b = liteBlockOf(r); return liteFrom !== null && b >= liteFrom && b <= liteTo; }
    // Porta nella finestra il mese della riga r (per "Oggi", scelta del mese, apri il giorno...).
    function liteShowRow(r) {
        if(!liteOn() || r == null || liteRowShown(r)) return;
        const b = liteBlockOf(r); if(b < 0) return;
        // si mostra anche il mese prima, così subito dopo il salto non serve aggiungere nulla
        liteFrom = Math.max(0, b - 1); liteTo = Math.min(monthBlocks().length - 1, b + 1);
        liteQuietUntil = Date.now() + 1500; renderTable();
    }
    // dopo un salto (oggi, un mese, un giorno) per un attimo non si aggiungono mesi:
    // aggiungerli durante lo scorrimento farebbe finire nel punto sbagliato
    let liteQuietUntil = 0;
    function liteScrollTo(el, offset, instant) {
        if(!el) return;
        liteQuietUntil = Date.now() + 1500;
        window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - offset, behavior: liteOn() || instant ? 'auto' : 'smooth' });
        if(liteOn()) setTimeout(liteObserve, 1600);
    }
    function liteMoreRow(dir, name) {
        const tr = document.createElement('tr'); tr.className = 'lite-more'; tr.dataset.dir = dir;
        tr.innerHTML = `<td colspan="${rtCols.length + 1}"><div class="lite-more-in"><button onclick="liteExtend(${dir})"><span class="material-icons-round">${dir < 0 ? 'expand_less' : 'expand_more'}</span>${esc(String(name).toLowerCase())}</button></div></td>`;
        return tr;
    }
    function liteAnchor() {
        const top = (document.querySelector('header') || { offsetHeight: 70 }).offsetHeight + 60;
        for(const tr of document.querySelectorAll('#table-body tr[data-row]')) { const r = tr.getBoundingClientRect(); if(r.bottom > top) return { row: tr.dataset.row, top: r.top }; }
        return null;
    }
    function liteExtend(dir) {
        const n = monthBlocks().length, a = liteAnchor();
        if(dir < 0 && liteFrom > 0) { liteFrom--; if(liteTo - liteFrom > 3) liteTo--; }
        else if(dir > 0 && liteTo < n - 1) { liteTo++; if(liteTo - liteFrom > 3) liteFrom++; }
        else return;
        renderTable();
        // il giorno che si stava guardando resta allo stesso posto sullo schermo
        if(a) { const tr = document.querySelector(`#table-body tr[data-row="${a.row}"]`); if(tr) window.scrollBy(0, tr.getBoundingClientRect().top - a.top); }
    }
    function liteObserve() {
        if(liteObs) { liteObs.disconnect(); liteObs = null; }
        if(!liteOn() || !('IntersectionObserver' in window)) return;
        liteObs = new IntersectionObserver(entries => {
            const e = entries.find(x => x.isIntersecting); if(!e) return;
            if(Date.now() < liteQuietUntil) return;   // si ricontrolla alla fine della pausa (liteScrollTo)
            liteObs.disconnect(); setTimeout(() => liteExtend(+e.target.dataset.dir), 0);
        }, { rootMargin: '600px 0px' });
        document.querySelectorAll('#table-body tr.lite-more').forEach(el => liteObs.observe(el));
    }
    // Ridisegna soltanto i giorni indicati (e il giorno dopo ciascuno, perché
    // smonto/diurni dipendono dal giorno precedente). Le intestazioni col saldo ore
    // si aggiornano a parte, raggruppate, per non rallentare il trascinamento.
    // Tutte le caselle uguali: larghezza e altezza = quelle del contenuto più ingombrante
    // (più un piccolo margine). Si misura il calendario intero dopo ogni ridisegno; dopo una
    // modifica di poche righe si misurano solo quelle e le caselle possono solo crescere.
    let cellFit = { w: 0, h: 0 };
    function fitCalendarCells(onlyRows, headEl) {
        const table = document.getElementById('main-table'); if(!table) return;
        let headH = 0;
        const fitHead = () => { if(!headEl) return; if(headH > 41) document.documentElement.style.setProperty('--th-h', headH + 'px'); headEl = null; };
        const scope = onlyRows ? onlyRows.filter(Boolean) : [table];
        const cells = []; scope.forEach(el => el.querySelectorAll('td[data-col] > .cell').forEach(c => cells.push(c)));
        if(!cells.length) { if(headEl) { headH = Math.ceil(headEl.getBoundingClientRect().height); fitHead(); } return; }
        let w = 0, h = 0;
        // prima la larghezza (contenuto più largo), poi l'altezza con le copie larghe quanto
        // la casella vera: misurate strette andavano a capo e la casella veniva più alta del dovuto
        const measure = list => {
            list.forEach(c => { const r = c.getBoundingClientRect(); if(r.width > w) w = r.width; });
            const cw = Math.max(Math.ceil(w), onlyRows ? cellFit.w : 0) + 4;
            list.forEach(c => { c.style.setProperty('width', cw + 'px', 'important'); c.querySelectorAll('.rep-bar').forEach(b => b.style.setProperty('width', '100%', 'important')); });
            list.forEach(c => { const r = c.getBoundingClientRect(); if(r.height > h) h = r.height; });
        };
        // si misurano copie fuori dalla tabella (una per ogni casella diversa), senza ricalcolare tutto il calendario
        let probe = document.getElementById('cell-probe');
        if(!probe) { probe = document.createElement('div'); probe.id = 'cell-probe'; probe.setAttribute('aria-hidden', 'true'); document.body.appendChild(probe); }
        const uniq = new Map(); cells.forEach(c => { const k = c.className + '|' + c.innerHTML; if(!uniq.has(k)) uniq.set(k, c); });
        probe.innerHTML = ''; uniq.forEach(c => probe.appendChild(c.cloneNode(true)));
        if(headEl) headH = Math.ceil(headEl.getBoundingClientRect().height);   // stessa lettura delle copie: un solo ricalcolo
        measure([...probe.children]); probe.innerHTML = '';
        fitHead();
        if(onlyRows) { w = Math.max(w, cellFit.w); h = Math.max(h, cellFit.h); }
        if(!w || !h) return;
        cellFit = { w, h };
        const W = Math.ceil(w) + 5, H = Math.ceil(h) + 4;   // casella poco più grande del testo (in altezza appena 2 px sopra e sotto)
        const root = document.documentElement.style;
        if(root.getPropertyValue('--cell-w') !== W + 'px') root.setProperty('--cell-w', W + 'px');
        if(root.getPropertyValue('--cell-h') !== H + 'px') root.setProperty('--cell-h', H + 'px');
    }
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if(document.querySelector('#table-body tr[data-row]')) fitCalendarCells(); });
    function renderTableRows(rowSet) { dayChecksCache = null;
        const tbody = document.getElementById('table-body'); if(!tbody || !rtCols.length) { renderTable(); return; }
        const rows = new Set();
        rowSet.forEach(r => { r = +r; if(r >= 1 && r < finalData.length) rows.add(r); if(r + 1 < finalData.length) rows.add(r + 1); });
        const today = new Date(); const touched = [];
        for(const r of rows) {
            const old = tbody.querySelector(`tr[data-row="${r}"]`);
            if(!old) { if(liteOn() && !liteRowShown(r)) continue; renderTable(); return; }   // mese non mostrato: niente da ridisegnare
            const fresh = buildDayRow(r, today);
            old.replaceWith(fresh); touched.push(fresh);
        }
        fitCalendarCells(touched);
        asRefreshMarks();
    }
    let rtHeadTimer = null;
    function scheduleTableHeadRefresh(delay) {
        clearTimeout(rtHeadTimer);
        rtHeadTimer = setTimeout(() => { rtHeadTimer = null; renderTableHead(); }, delay == null ? 250 : delay);
    }

    // ── formatCell ────────────────────────────────────────────────────────────
    // repOverride: HTML della reperibilità a fasce (badge + striscia); se passato sostituisce
    // il vecchio riconoscimento dal testo della cella ("M/R").
    function formatCell(info, prevInfo, showGraziella = false, repOverride) {
        let rawValStr = (info.v || "").toString().trim();
        let val       = rawValStr;
        let subVal    = (info.subV  || "").toString().trim().toLowerCase();
        let prevSubVal= (prevInfo?.subV || "").toString().trim().toLowerCase();
        let prevRawVal= (prevInfo?.v   || "").toString().trim().toUpperCase().replace(/\s+/g,'');
        let supVal    = (info.supV  || "").toString().trim();

        // ── reperibilità ─────────────────────────────────────────────────────
        let isReperibile = false;
        if(isRepStr(val)) {
            isReperibile = true;
            let si = val.indexOf('/'); if(si !== -1) val = val.substring(0, si).trim();
        }
        if(!isReperibile && (isRepStr(subVal) || isRepStr(supVal))) isReperibile = true;
        let repHtml = isReperibile ? `<div class="rep-text">REPERIBILE</div>` : "";
        if(repOverride !== undefined) repHtml = repOverride;

        // ── SMONTO dopo M+N ───────────────────────────────────────────────────
        if(isMN(prevRawVal)) {
            let t = SCHEDULE["SM"] || "";
            return `<div class="cell t-S">
                <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;width:100%;">
                    <div>SMONTO</div>
                    ${t ? `<div class="time-tag">${t}</div>` : ""}
                </div>${repHtml}</div>`;
        }

        // ── M+N (Mattina + Notte) ─────────────────────────────────────────────
        if(isMN(rawValStr)) {
            return `<div class="cell spec-mn">
                <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;width:100%;gap:2px;">
                    <div style="font-weight:900;font-size:0.68rem;letter-spacing:-0.2px;">MATT. + NOTTE</div>
                    <div class="time-tag">M: ${SCHEDULE["M"]}</div>
                    <div class="time-tag">N: ${SCHEDULE["N"]}</div>
                </div>${repHtml}</div>`;
        }

        // ── GRAVIDANZA (subVal === "gr") ───────────────────────────────────────
        if(subVal === "gr") {
            return `<div class="cell spec-gr">
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                    <span class="baby-face">👶</span>
                    <div style="font-size:0.55rem;font-weight:900;letter-spacing:0.2px;">GRAVIDANZA</div>
                </div>${repHtml}</div>`;
        }

        // ── altri speciali ────────────────────────────────────────────────────
        if(EXTRA_SUB_INF[subVal]) return `<div class="cell spec-x${subVal}"><div style="flex:1;display:flex;align-items:center;text-align:center;">${EXTRA_SUB_INF[subVal].replace(' ', '<br>')}</div>${repHtml}</div>`;
        if(subVal === "pl" || subVal === "ps") {
            const ph = info.perm && Number(info.perm.h) > 0 ? `<div class="time-tag perm-h">${permHFmt(info.perm.h)}</div>` : '';
            return `<div class="cell spec-${subVal}"><div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">PERMESSO<br>${subVal === 'pl' ? 'LEGGE' : 'SINDACALE'}${ph}</div>${repHtml}</div>`;
        }
        if(subVal === "pn" || prevSubVal === "pn") {
            // giorno dopo il PN con un'altra assenza rimasta nella casella: si vede (e si conta)
            const hidden = subVal !== "pn" && SPECIAL_SUBCODES[subVal] !== undefined ? `<div class="riposo-sub" title="Nella casella c\u2019è anche ${esc(SPECIAL_SUBCODES[subVal].toLowerCase())}: conta nel conteggio assenze">+ ${esc(ABS_SHORT[subVal] || subVal.toUpperCase())}</div>` : "";
            return `<div class="cell spec-pn"><div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">PERMESSO<br>NOTTE${hidden}</div>${repHtml}</div>`;
        }
        if(subVal === "z")
            return `<div class="cell spec-coord"><div style="flex:1;display:flex;align-items:center;text-align:center;">SOSTITUZIONE<br>COORD.</div>${repHtml}</div>`;
        if(subVal === "v") {
            const prevV = fmtDateCtx && +fmtDateCtx.slice(0, 4) > SHIFT_YEAR;   // nell'anno dopo: ferie di quest'anno
            return `<div class="cell spec-ferie"${prevV ? ` title="Ferie residue del ${SHIFT_YEAR}"` : ''}><div style="flex:1;display:flex;align-items:center;text-align:center;">FERIE<br>${prevV ? 'RES. ' + SHIFT_YEAR : 'RESIDUE'}</div>${repHtml}</div>`;
        }
        if(subVal === "r")
            return `<div class="cell spec-rec"><div style="flex:1;display:flex;align-items:center;text-align:center;">RECUPERO</div>${repHtml}</div>`;

        // ── CONGEDO ORDINARIO — con eventuale RIPOSO ──────────────────────────
        if(subVal === "f") {
            let uVal = val.toUpperCase();
            let riposoHtml = (uVal === "R" || uVal === "RIPOSO")
                ? `<div class="riposo-sub">+ RIPOSO</div>` : "";
            // C.O. dell'anno messo a gennaio-marzo dell'anno dopo: metà giallo e metà arancio
            // (se viene dalle ferie desiderate dell'anno dopo, conta sull'anno dopo: giallo, "C.O. 2027")
            const nextCO = +info.coY > SHIFT_YEAR ? +info.coY : 0;
            const prevCO = !nextCO && fmtDateCtx && +fmtDateCtx.slice(0, 4) > SHIFT_YEAR && +fmtDateCtx.slice(5, 7) <= CO_CARRY_MONTHS;
            // le ferie dell'anno messe nell'anno dopo si vedono solo come FERIE RESIDUE arancioni (richiesta di Mat)
            if(prevCO) return `<div class="cell spec-ferie" title="Ferie residue del ${SHIFT_YEAR}"><div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">FERIE<br>${'RES. ' + SHIFT_YEAR}${riposoHtml}</div>${repHtml}</div>`;
            return `<div class="cell spec-cong${prevCO ? ' spec-cong-prev' : ''}"${prevCO ? ` title="Congedo ordinario del ${SHIFT_YEAR}"` : nextCO ? ` title="Congedo ordinario del ${nextCO}"` : ''}>
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
                    ${prevCO ? 'C.O.<br>' + SHIFT_YEAR : nextCO ? 'C.O.<br>' + nextCO : 'CONGEDO<br>ORD.'}${riposoHtml}
                </div>${repHtml}</div>`;
        }

        if(subVal === "m")
            return `<div class="cell spec-mal"><div style="flex:1;display:flex;align-items:center;text-align:center;">MALATTIA</div>${repHtml}</div>`;
        if(subVal === "nl")
            return `<div class="cell spec-nl"><div style="flex:1;display:flex;align-items:center;text-align:center;">FESTIVO<br>NON LAV.</div>${repHtml}</div>`;
        if(subVal === "p")
            return `<div class="cell spec-perm"><div style="flex:1;display:flex;align-items:center;text-align:center;">PERMESSO</div>${repHtml}</div>`;
        if(subVal === "ng")
            return `<div class="cell spec-ng"><div style="flex:1;display:flex;align-items:center;text-align:center;">FESTIVO<br>NON GOD.</div>${repHtml}</div>`;
        if(subVal === "c")
            return `<div class="cell spec-stu"><div style="flex:1;display:flex;align-items:center;text-align:center;">PERMESSO<br>STUDIO</div>${repHtml}</div>`;

        if(subVal === "x" && prevSubVal === "pn")   // autisti: "x" = secondo giorno del permesso notte
            return `<div class="cell spec-pn"><div style="flex:1;display:flex;align-items:center;text-align:center;">PERMESSO<br>NOTTE</div>${repHtml}</div>`;
        if(AS_EXTRA_SUB[subVal])
            return `<div class="cell spec-stu"><div style="flex:1;display:flex;align-items:center;text-align:center;">${AS_EXTRA_SUB[subVal]}</div>${repHtml}</div>`;
        if(!val || val === "-") return `<div class="cell empty">${val || "-"}${repHtml}</div>`;
        { const cc = customCode(val); if(cc) return customCellHtml(val.toUpperCase(), cc, repHtml); }   // casella personalizzata

        // ── turni normali ─────────────────────────────────────────────────────
        let firstChar  = val.charAt(0);
        let isDiurnista = (firstChar >= 'a' && firstChar <= 'z');
        let u = val.toUpperCase();
        let display = u;
        if(u==="M") display="MATTINA";
        else if(u==="P") display="POMERIGGIO";
        else if(u==="N") display="NOTTE";
        else if(u==="S"||u==="SM") display="SMONTO";
        else if(u==="R") display="RIPOSO";

        let graziellaHtml = showGraziella
            ? `<img src="cane.png" class="graziella-icon" onclick="event.stopPropagation();playGraziella();">` : "";

        if(isDiurnista) {
            let time = diurniSched(val, fmtDateCtx) || "";
            let timeHtml = time && time !== "RIPOSO" ? `<div class="time-tag">${time}</div>` : "";
            let cls = "d-" + u; if(!["M","P","R"].includes(u)) cls = "d-M";
            return `<div class="cell ${cls}">
                <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;width:100%;">
                    <div>${display}</div>${timeHtml}
                </div>${permTagHtml(info)}${repHtml}${graziellaHtml}</div>`;
        } else {
            let time = SCHEDULE[u] || "";
            let timeHtml = time && time !== "RIPOSO" ? `<div class="time-tag">${time}</div>` : "";
            let cls = "t-" + u;
            if(u==="S"||u==="SM") cls = "t-S";
            else if(!["M","P","N","R"].includes(u)) cls = "t-M";
            return `<div class="cell ${cls}">
                <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;width:100%;">
                    <div>${display}</div>${timeHtml}
                </div>${permTagHtml(info)}${repHtml}${graziellaHtml}</div>`;
        }
    }

    // ── openShiftModal ────────────────────────────────────────────────────────
    // Il giorno dopo un M+N è sempre smonto (come lo disegna il calendario), qualunque cosa ci sia scritta.
    function afterMN(rowIndex, colIdx) {
        const prev = finalData[rowIndex - 1], cell = prev && prev[colIdx];
        return !!cell && isMN((cell.v || "").toString());
    }
    // sigla del turno con gli stessi colori della casella del calendario
    function sm2Tag(rawV, uVal, isD) {
        if(isMN(rawV)) return '<span class="sm2-tag spec-mn">M+N</span>';
        const cls = isD ? (uVal.charAt(0) === 'P' ? 'd-P' : 'd-M') : ({ M:'t-M', P:'t-P', N:'t-N', SM:'t-S' }[uVal] || '');
        return `<span class="sm2-tag ${cls}"${cls ? '' : ' style="background:var(--bg);color:var(--text-sec);border:1px solid var(--border)"'}>${esc(uVal)}</span>`;
    }
    // riquadro di una persona: sigla colorata, nome, orario solo se diverso da quello del turno, reperibile
    function sm2Person(name, rawV, uVal, isD, time, stdTime, rep, permNote) {
        const sub = [isD ? 'Diurnista' : '', time !== stdTime ? String(time).replace(/ - /g, '\u00a0-\u00a0') : ''].filter(Boolean).join(' · ');
        return `<div class="sm2-row${permNote ? ' has-perm' : ''}">${sm2Tag(rawV, uVal, isD)}<div class="sm2-who"><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${rep ? '<small class="sm2-rp"><span class="material-icons-round">call</span>Reperibile</small>' : ''}${permNote || ''}</div></div>`;
    }
    function openShiftModal(rowIndex, cellValue, month, day, weekDay) {
        vibrate();
        let modal = document.getElementById('shift-modal');
        let list  = document.getElementById('modal-list');
        let content = document.querySelector('#shift-modal .modal-content');
        let valStr = (cellValue || "").toString().trim();
        if(isRepStr(valStr)) { let si = valStr.indexOf('/'); if(si !== -1) valStr = valStr.substring(0, si).trim(); }
        let uShift = valStr.toUpperCase();
        if(uShift === "S") uShift = "SM";
        content.className = "modal-content";
        if(uShift==="M") content.classList.add("modal-theme-M");
        else if(uShift==="P") content.classList.add("modal-theme-P");
        else if(uShift==="N") content.classList.add("modal-theme-N");
        else if(uShift==="R") content.classList.add("modal-theme-R");
        else if(uShift==="SM") content.classList.add("modal-theme-SM");
        else if(isMN(uShift)) content.classList.add("modal-theme-MN");
        let fullText = "Chi è in turno", icon = "groups", icoCls = "";
        if(uShift==="M")  { fullText=valStr === "m" ? "Mattina diurno" : "Mattina";    icon="wb_sunny";    icoCls="t-M"; }
        if(uShift==="P")  { fullText=valStr === "p" ? "Pomeriggio diurno" : "Pomeriggio"; icon="wb_twilight"; icoCls="t-P"; }
        if(uShift==="N")  { fullText="Notte";      icon="bedtime";     icoCls="t-N"; }
        // su un riposo (o un'assenza) la finestra mostra chi lavora quel giorno
        if(uShift==="SM") { fullText="Smonto";     icon="logout";      icoCls="t-S"; }
        if(isMN(uShift))  { fullText="Mattina + Notte"; icon="brightness_4"; icoCls="spec-mn"; }
        document.getElementById('modal-title').textContent = fullText;
        const ico = document.getElementById('modal-ico'); ico.className = 'sm2-ico ' + icoCls;
        if(!icoCls) ico.style.cssText = 'background:var(--bg);color:var(--primary);border:1px solid var(--border)'; else ico.style.cssText = '';
        ico.innerHTML = `<span class="material-icons-round">${icon}</span>`;
        // l'orario del turno si scrive una volta sola, in alto; nelle righe compare solo se è diverso
        const dIso = repRowDate(rowIndex);
        // casella di un diurnista (m, p): in alto il SUO orario, non quello dei turnisti
        const stdTime = /^[mp]$/.test(valStr) ? (diurniSched(valStr, dIso || undefined) || SCHEDULE[uShift] || '') : ["M","P","N","SM"].includes(uShift) ? (SCHEDULE[uShift] || '') : '';
        const dLong = dIso ? new Date(dIso + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' }).replace(/^./, c => c.toUpperCase()) : `${weekDay} ${day} ${month}`;
        document.getElementById('modal-subtitle').innerHTML = `${esc(dLong)}${stdTime ? `<em class="sm2-hchip"><span class="material-icons-round" style="font-size:14px">schedule</span>${esc(stdTime)}</em>` : ''}`;
        list.innerHTML = "";
        let rowData = finalData[rowIndex];
        let foundNurses = [];
        drivers.forEach(d => {
            if(d.test) return;
            let cell = rowData[d.idx];
            let rawV = afterMN(rowIndex, d.idx) ? "SM" : (cell.v || "").toString().trim();
            if(isRepStr(rawV)) { let si = rawV.indexOf('/'); if(si !== -1) rawV = rawV.substring(0, si).trim(); }
            let uVal = rawV.toUpperCase(); if(uVal==="S") uVal="SM";
            let isD = rawV.length > 0 && rawV.charAt(0) >= 'a' && rawV.charAt(0) <= 'z';
            let isWorking = ["M","P","N","SM"].includes(uVal) || isMN(rawV);
            let isMatch = false;
            if(["M","P","N","SM"].includes(uShift)) {
                if(uVal === uShift) isMatch = true;
                // chi fa M+N compare sia nel turno MATTINA che nel turno NOTTE
                if(isMN(rawV) && (uShift === "M" || uShift === "N")) isMatch = true;
            } else {
                if(isWorking) isMatch = true;
            }
            if(isMatch) {
                const rep = repData().tit[repRowDate(rowIndex)] === d.originalName;
                let time = isD ? (diurniSched(rawV, repRowDate(rowIndex)) || rawV)
                    : (isMN(rawV) ? `M ${SCHEDULE["M"]} · N ${SCHEDULE["N"]}` : (SCHEDULE[uVal] || uVal));
                const pm = permOfCell(rowIndex, d.idx);   // ore di permesso dentro il turno
                const permNote = pm && !pm.full ? `<div class="perm-note">${esc(d.name)} ha preso ${permHFmt(pm.h)} di ${PERM_HOURLY[pm.k].label.toLowerCase()}${pm.k === 'pl' ? ' · conta nel conteggio assenze' : ''}</div>` : '';
                foundNurses.push({ name:d.name, rawV, shift:uVal, time, rep, isDiurno:isD, permNote });
            }
        });
        const ord = n => n.isDiurno ? 9 : ({ M:0, P:2, N:3, SM:4 }[n.shift] ?? (isMN(n.rawV) ? 1 : 5));
        foundNurses.sort((a, b) => ord(a) - ord(b));
        list.innerHTML += `<div class="sm2-sec"><span class="material-icons-round">airport_shuttle</span>Autisti in turno<span class="sm2-n">${foundNurses.length}</span></div>`;
        if(foundNurses.length > 0) {
            list.innerHTML += `<div class="sm2-grid">${foundNurses.map(n => sm2Person(n.name, n.rawV, n.shift, n.isDiurno, n.time, stdTime, n.rep, n.permNote)).join('')}</div>`;
        } else {
            list.innerHTML += `<div class="sm2-empty">Nessun autista in questo turno.</div>`;
        }
        { const me = myCalDriver();   // la mia notte: con chi posso cambiarla
          if(me && (uShift === 'N' || isMN(uShift)) && cnIsNight(rowIndex, me.idx)) {
            const c = cnCandidates(rowIndex, me.idx), n = c.after.concat(c.before).filter(p => !p.problems.length).length;
            list.innerHTML += `<div class="sm2-pad bare"><button class="cn-mine-btn" onclick="cnOpen(${rowIndex},${me.idx})"><span class="material-icons-round">swap_vert</span><span><b>Cambia la tua notte con un collega</b><small>${n ? n + (n === 1 ? ' cambio possibile' : ' cambi possibili') + ' con chi ha la notte il giorno prima o dopo' : 'Vedi chi ha la notte il giorno prima o dopo'}</small></span></button></div>`;
          } }
        list.innerHTML += otherTeamHtml(rowIndex, uShift);
        list.innerHTML += asShiftModalExtras(rowIndex, uShift);
        list.innerHTML += repDaySectionHtml(repRowDate(rowIndex));
        list.innerHTML += noteDaySectionHtml(repRowDate(rowIndex));
        modal.style.display = 'flex'; setTimeout(() => modal.classList.add('open'), 10);
    }
    function closeShiftModal(e) { if(e && e.target !== e.currentTarget) return; let m = document.getElementById('shift-modal'); m.classList.remove('open'); setTimeout(() => m.style.display='none', 200); }

    // ── Organizza un'uscita ──────────────────────────────────────────────────
    // Si sceglie il mese, il momento (colazione, pranzo, cena) e chi viene, infermieri e autisti
    // (turni infermieri letti dall'app infermieri, solo lettura). Per ogni giorno da oggi in poi
    // si contano i liberi; chi non può compare con il motivo (turno o assenza).
    const OG_WHEN = {
        colazione: { label:'Colazione', icon:'free_breakfast', busy:['M','M+N'] },
        pranzo:    { label:'Pranzo',    icon:'lunch_dining',   busy:['M','P','M+N'] },
        cena:      { label:'Cena',      icon:'dinner_dining',  busy:['P','N','M+N'] }
    };
    const OG_SHIFT = { 'M':'Mattina', 'P':'Pomeriggio', 'N':'Notte', 'M+N':'M+N' };
    const OG_ABS = { f:'Ferie', v:'Ferie', m:'Malattia', pn:'Perm. notte', c:'Congedo', gr:'Gravidanza' };
    const OG_WD = ['dom','lun','mar','mer','gio','ven','sab'];
    let og = { month:null, when:'cena', off:new Set(), weekend:false, all:false, res:null, step:1 };
    function ogNurses() { return drivers.filter(d => !d.test && !d.hidden).map(d => d.name); }
    function ogDrivers() { return otherTeam && otherTeam[0] ? otherTeam[0].slice(3).filter(Boolean) : []; }
    function ogMonths() {
        const t = new Date(); t.setHours(0,0,0,0);
        return (globalMonthsList || []).map(m => ({ name:m.name, mi:MONTH_MAP[m.name], y:shiftRowYear(m.row) }))
            .filter(m => new Date(m.y, m.mi + 1, 0) >= t);
    }
    function openDinnerModal() {
        closeMenu();
        const m = document.getElementById('dinner-modal'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10);
        setCurrentView("Organizza Uscita");
        const ms = ogMonths();
        if(!og.month || !ms.some(x => x.name === og.month.name && x.y === og.month.y)) og.month = ms[0] || null;
        og.step = 1; ogRender();
        if(!otherTeam) loadOtherTeam().then(() => { if(og.step === 1) ogRender(); });
    }
    function closeDinnerModal(e) { if(e && e.target !== e.currentTarget) return; const m = document.getElementById('dinner-modal'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 200); }
    function ogPick(k, v) { vibrate(); og[k] = v; ogRender(); }
    function ogPickMonth(i) { vibrate(); og.month = ogMonths()[i] || null; ogRender(); }
    function ogToggle(name) { vibrate(); if(og.off.has(name)) og.off.delete(name); else og.off.add(name); ogRender(); }
    function ogGroup(list, on) { vibrate(); list.forEach(n => on ? og.off.delete(n) : og.off.add(n)); ogRender(); }
    function ogPeopleHtml(title, icon, list, kind) {
        const sel = list.filter(n => !og.off.has(n)).length, enc = JSON.stringify(list).replace(/"/g, '&quot;');
        return `<div class="og-card"><div class="og-card-h"><span class="material-icons-round">${icon}</span><b>${title}</b><small>${sel} su ${list.length}</small>
                <span class="og-sp"></span><button class="og-link" onclick="ogGroup(${enc},true)">Tutti</button><button class="og-link" onclick="ogGroup(${enc},false)">Nessuno</button></div>
            <div class="og-people">${list.map(n => `<button class="og-p ${og.off.has(n) ? '' : 'on'} ${kind}" onclick="ogToggle('${esc(n).replace(/'/g, "\\'")}')"><span class="material-icons-round">${og.off.has(n) ? 'radio_button_unchecked' : 'check_circle'}</span>${esc(n)}</button>`).join('')}</div></div>`;
    }
    function ogRender() {
        const box = document.getElementById('og-body'); if(!box) return;
        if(og.step === 2) { box.innerHTML = ogResultsHtml(); return; }
        const ms = ogMonths(), nurses = ogNurses(), drv = ogDrivers();
        const mLabel = m => m.name.charAt(0) + m.name.slice(1, 3).toLowerCase() + (m.y !== new Date().getFullYear() ? ' ' + String(m.y).slice(2) : '');
        const n = nurses.filter(x => !og.off.has(x)).length + drv.filter(x => !og.off.has(x)).length;
        box.innerHTML = `<div class="og-sec"><div class="og-lbl">Mese</div>
                <div class="og-months">${ms.map((m, i) => `<button class="og-chip ${og.month && og.month.name === m.name && og.month.y === m.y ? 'on' : ''}" onclick="ogPickMonth(${i})">${mLabel(m)}</button>`).join('') || '<small class="og-muted">Nessun mese nel calendario.</small>'}</div></div>
            <div class="og-sec"><div class="og-lbl">Momento</div>
                <div class="og-seg">${Object.entries(OG_WHEN).map(([k, w]) => `<button class="${og.when === k ? 'on' : ''}" onclick="ogPick('when','${k}')"><span class="material-icons-round">${w.icon}</span>${w.label}</button>`).join('')}</div>
                <small class="og-muted">${og.when === 'colazione' ? 'Non può chi fa la mattina.' : og.when === 'pranzo' ? 'Non può chi fa la mattina o il pomeriggio.' : 'Non può chi fa il pomeriggio o la notte.'} Chi è in ferie, malattia o congedo conta come assente.</small></div>
            <div class="og-sec"><div class="og-lbl">Chi viene</div>
                ${ogPeopleHtml('Autisti', 'airport_shuttle', nurses, 'inf')}
                ${drv.length ? ogPeopleHtml('Infermieri', 'medical_services', drv, 'aut') : `<div class="og-card og-wait"><span class="material-icons-round ${otherTeam ? '' : 'adm-spin'}">${otherTeam ? 'cloud_off' : 'autorenew'}</span>${otherTeam ? 'Turni degli infermieri non disponibili in questo momento.' : 'Carico i turni degli infermieri…'}</div>`}</div>
            <div class="og-foot"><button class="og-go" ${og.month && n ? '' : 'disabled'} onclick="ogSearch()"><span class="material-icons-round">search</span>Cerca il giorno migliore${n ? ` <small>(${n} persone)</small>` : ''}</button></div>`;
    }
    // stato di una persona in un giorno: '' libero, altrimenti il motivo
    function ogWhy(cell) {
        cell = cell || {};
        const sv = String(cell.subV || '').trim().toLowerCase();
        if(OG_ABS[sv]) return OG_ABS[sv];
        let v = String(cell.v || '').trim();
        if(isRepStr(v)) { const i = v.indexOf('/'); if(i !== -1) v = v.substring(0, i).trim(); }
        let u = v.toUpperCase().replace(/\s+/g, ''); if(isMN(u)) u = 'M+N';
        return OG_WHEN[og.when].busy.includes(u) ? OG_SHIFT[u] : '';
    }
    function ogSearch() {
        vibrate();
        const M = og.month; if(!M) return;
        const today = new Date(); today.setHours(0,0,0,0);
        const nurses = ogNurses().filter(n => !og.off.has(n)), drv = ogDrivers().filter(n => !og.off.has(n));
        const nIdx = nurses.map(n => (drivers.find(d => d.name === n) || {}).idx);
        const dIdx = drv.map(n => otherTeam[0].indexOf(n));
        const days = [], HY = holidaysFor(M.y);
        for(let r = 1; r < finalData.length; r++) {
            const row = finalData[r]; if(!row[0] || row[0].v !== M.name || shiftRowYear(r) !== M.y) continue;
            const dn = parseInt(row[1] && row[1].v); if(isNaN(dn)) continue;
            const dt = new Date(M.y, M.mi, dn); if(dt < today) continue;
            const no = [];
            nurses.forEach((n, k) => { const w = ogWhy(row[nIdx[k]]); if(w) no.push({ n, w, aut:false }); });
            const orow = drv.length ? otherRowFor(otherTeam, M.name, dn, M.y) : null;
            drv.forEach((n, k) => { const w = orow ? ogWhy(orow[dIdx[k]]) : ''; if(w) no.push({ n, w, aut:true }); });
            const fest = HY[`${dt.getMonth()}-${dt.getDate()}`] || '';
            days.push({ dt, dn, wd:dt.getDay(), fest, tot:nurses.length + drv.length, free:nurses.length + drv.length - no.length, no, noAut:!orow && drv.length });
        }
        og.res = { days, label:M.name.charAt(0) + M.name.slice(1).toLowerCase() + ' ' + M.y, when:og.when, tot:nurses.length + drv.length };
        og.step = 2; og.all = false; ogRender();
        const b = document.querySelector('#dinner-modal .modal-body'); if(b) b.scrollTop = 0;
    }
    function ogResultsHtml() {
        const R = og.res; if(!R) return '';
        let list = R.days.slice(); if(og.weekend) list = list.filter(d => d.wd === 5 || d.wd === 6 || d.wd === 0 || d.fest);
        list.sort((a, b) => b.free - a.free || a.dt - b.dt);
        const best = list.length ? list[0].free : 0, shown = og.all ? list : list.slice(0, 8);
        const card = d => { const pct = d.tot ? Math.round(d.free / d.tot * 100) : 0, top = d.free === best;
            return `<div class="og-res ${top ? 'top' : ''}"><div class="og-date ${d.wd === 0 || d.fest ? 'fe' : ''}"><small>${OG_WD[d.wd]}</small><b>${d.dn}</b></div>
                <div class="og-res-m"><div class="og-res-r"><b>${d.free === d.tot ? 'Tutti liberi' : d.free + ' su ' + d.tot + ' liberi'}</b>${top ? '<span class="og-best">migliore</span>' : ''}${d.fest ? `<span class="og-fest">${esc(d.fest.charAt(0) + d.fest.slice(1).toLowerCase())}</span>` : ''}</div>
                <div class="og-bar"><i style="width:${pct}%"></i></div>
                ${d.no.length ? `<div class="og-no">${d.no.map(x => `<span class="${x.aut ? 'aut' : ''}">${x.aut ? '<i class="material-icons-round">medical_services</i>' : ''}<b>${esc(x.n)}</b>${esc(x.w)}</span>`).join('')}</div>` : ''}
                ${d.noAut ? '<small class="og-muted">Turni infermieri di questo giorno non trovati.</small>' : ''}</div></div>`; };
        return `<div class="og-rbar"><button class="og-back" onclick="og.step=1;ogRender()"><span class="material-icons-round">arrow_back</span>Cambia</button>
                <div><b>${esc(R.label)} · ${OG_WHEN[R.when].label}</b><small>${R.tot} persone</small></div></div>
            <div class="og-sec"><div class="og-seg sm"><button class="${og.weekend ? '' : 'on'}" onclick="ogPick('weekend',false)">Tutti i giorni</button><button class="${og.weekend ? 'on' : ''}" onclick="ogPick('weekend',true)">Ven, sab, dom e festivi</button></div></div>
            <div class="og-list">${shown.length ? shown.map(card).join('') : '<div class="og-card og-wait"><span class="material-icons-round">event_busy</span>Nessun giorno da oggi in poi in questo mese.</div>'}</div>
            ${!og.all && list.length > shown.length ? `<div class="og-foot"><button class="og-more" onclick="ogPick('all',true)">Mostra tutti i ${list.length} giorni</button></div>` : ''}`;
    }

    // ── GARA DI AMBULANZE ────────────────────────────────────────────────────
    // Ogni operatore scelto è un'ambulanza in pista. L'ordine d'arrivo è estratto a
    // caso alla partenza (come la ruota); durante la corsa le ambulanze si superano
    // a vicenda, poi arrivano nell'ordine estratto. L'ultima rimane in panne.
    const RACE_LAST_QUOTES = [
        "Ha messo il navigatore su “percorso panoramico”.",
        "Si è fermato a fare benzina… e un caffè… e un cornetto.",
        "Sirena accesa, freno a mano tirato.",
        "Ha dato la precedenza anche ai piccioni.",
        "Il mezzo era in riserva dal 2019.",
        "Era convinto fosse un trasporto secondario.",
        "Ha chiesto indicazioni a un passante.",
        "Ha controllato la pressione delle gomme. Tutte e quattro. Due volte.",
        "Ha trovato tutti i semafori rossi. Anche quelli spenti.",
        "Ha fatto la check-list del mezzo durante la gara.",
        "Ha parcheggiato in retromarcia prima del traguardo.",
        "Doveva ancora sistemare la barella."
    ];
    let raceDrivers = [], raceRunning = false, raceRaf = 0, raceTimers = [];

    function openRaceModal() {
        closeMenu();
        raceStop();
        const m = document.getElementById('race-modal');
        m.style.display = 'flex';
        setTimeout(() => m.classList.add('open'), 10);
        setCurrentView("Gara di ambulanze");
        goToRaceStep1();
    }
    function closeRaceModal(e) {
        if(e && e.target !== e.currentTarget) return;
        raceStop();
        const m = document.getElementById('race-modal'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 200);
    }
    function raceStop() {
        raceRunning = false;
        if(raceRaf) cancelAnimationFrame(raceRaf); raceRaf = 0;
        raceTimers.forEach(t => clearTimeout(t)); raceTimers = [];
        if(window._raceSiren) { try { window._raceSiren.stop(); } catch(e) {} window._raceSiren = null; }
    }
    function raceLater(fn, ms) { raceTimers.push(setTimeout(fn, ms)); }

    function goToRaceStep1() {
        vibrate(); raceStop();
        document.getElementById('race-step-2').style.display = 'none';
        document.getElementById('race-step-1').style.display = 'block';
        const dl = document.getElementById('race-driver-list'); dl.innerHTML = '';
        drivers.filter(d => !d.test && !d.hidden).forEach(d => {
            const on = raceDrivers.includes(d.name);
            const l = document.createElement('label'); l.className = 'dinner-check-item' + (on ? ' checked' : '');
            l.innerHTML = `<input type="checkbox" value="${esc(d.name)}" ${on ? 'checked' : ''} onchange="this.parentElement.classList.toggle('checked');updateRaceContinueBtn();vibrate()"><div class="dinner-check-icon"><span class="material-icons-round" style="font-size:14px">check</span></div>${esc(d.name)}`;
            dl.appendChild(l);
        });
        updateRaceContinueBtn();
    }
    function updateRaceContinueBtn() {
        const n = document.querySelectorAll('#race-driver-list input:checked').length;
        document.getElementById('race-step1-continue').disabled = n < 2;
    }
    function toggleAllRaceDrivers() {
        const boxes = document.querySelectorAll('#race-driver-list input');
        const allOn = Array.from(boxes).every(b => b.checked);
        boxes.forEach(b => { b.checked = !allOn; b.parentElement.classList.toggle('checked', !allOn); });
        updateRaceContinueBtn(); vibrate();
    }

    function goToRaceTrack() {
        raceDrivers = Array.from(document.querySelectorAll('#race-driver-list input:checked')).map(b => b.value);
        if(raceDrivers.length < 2) return;
        vibrate();
        document.getElementById('race-step-1').style.display = 'none';
        document.getElementById('race-step-2').style.display = 'block';
        raceBuildTrack();
    }

    function raceBuildTrack() {
        raceStop();
        const n = raceDrivers.length;
        const h = n <= 6 ? 50 : n <= 10 ? 42 : n <= 16 ? 34 : 28;
        const track = document.getElementById('race-track');
        track.className = 'rc-track'; track.style.setProperty('--rc-h', h + 'px');
        track.innerHTML = raceDrivers.map((name, i) => `
            <div class="rc-lane" data-i="${i}">
                <div class="rc-name"><i style="background:${WHEEL_COLORS[i % WHEEL_COLORS.length]}">${i + 1}</i><span>${esc(name)}</span></div>
                <div class="rc-road"><div class="rc-finish"></div><div class="rc-car"><img src="ambulanza.png" alt=""><span class="rc-siren"></span></div></div>
            </div>`).join('') + '<div class="rc-count" id="race-count"></div>';
        document.getElementById('race-results').innerHTML = '';
        raceBoard('campaign', 'Fate le vostre scommesse, poi premi <b>VIA!</b>');
        const btn = document.getElementById('race-go-btn'); btn.disabled = false; btn.innerText = 'VIA!';
        document.getElementById('race-subtitle').innerText = n + ' ambulanze in griglia';
    }
    function raceBoard(icon, html) { document.getElementById('race-board').innerHTML = `<span class="material-icons-round">${icon}</span><span>${html}</span>`; }

    // suoni: bip del semaforo, sirena bitonale leggera durante la corsa, fanfara all'arrivo
    function raceBeep(freq, dur) {
        try { const ctx = getWheelAudioCtx(); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = freq; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur); } catch(e) {}
    }
    function raceSirenStart(seconds) {
        try {
            const ctx = getWheelAudioCtx(); const o = ctx.createOscillator(), g = ctx.createGain(); const t0 = ctx.currentTime;
            o.type = 'triangle'; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.2);
            for(let t = 0; t < seconds; t += 0.9) { o.frequency.setValueAtTime(960, t0 + t); o.frequency.setValueAtTime(720, t0 + t + 0.45); }
            g.gain.setValueAtTime(0.05, t0 + seconds - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
            o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + seconds + 0.05);
            window._raceSiren = o;
        } catch(e) {}
    }
    function raceFanfare() {
        try { const ctx = getWheelAudioCtx(); const t0 = ctx.currentTime;
            [523, 659, 784, 1047].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); const st = t0 + i * 0.13; o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.001, st); g.gain.exponentialRampToValueAtTime(0.14, st + 0.02); g.gain.exponentialRampToValueAtTime(0.001, st + (i === 3 ? 0.5 : 0.14)); o.connect(g); g.connect(ctx.destination); o.start(st); o.stop(st + 0.55); });
        } catch(e) {}
    }

    function startRace() {
        if(raceRunning) return;
        raceBuildTrack();
        raceRunning = true;
        const btn = document.getElementById('race-go-btn'); btn.disabled = true; btn.innerText = 'IN CORSA…';
        const cnt = document.getElementById('race-count'); cnt.classList.add('show');
        raceBoard('traffic', 'Motori accesi…');
        ['3', '2', '1'].forEach((s, i) => raceLater(() => { cnt.innerHTML = `<b>${s}</b>`; raceBeep(520, 0.12); vibrate(); }, i * 750));
        raceLater(() => { cnt.innerHTML = '<b class="go">VIA!</b>'; raceBeep(1040, 0.35); }, 2250);
        raceLater(() => { cnt.classList.remove('show'); raceRun(); }, 2700);
    }

    function raceRun() {
        const n = raceDrivers.length;
        // ordine d'arrivo estratto a caso, poi i tempi: il primo arriva in 6-7 s, gli altri a distanza
        const order = shuffleArr(raceDrivers.map((_, i) => i));
        const T = new Array(n); let t = 6000 + Math.random() * 1000;
        order.forEach((idx, k) => { if(k) t += 220 + Math.random() * 480; T[idx] = t; });
        const lastIdx = order[n - 1], PANNE = 1600, panneAt = 0.72 + Math.random() * 0.12;
        // andatura: u + somma di seni nulli a partenza e arrivo (sorpassi senza mai tornare indietro)
        const prof = raceDrivers.map(() => [(Math.random() * 2 - 1) * 0.12, (Math.random() * 2 - 1) * 0.06, (Math.random() * 2 - 1) * 0.025]);
        const pos = (i, ms) => {
            let tt = ms;
            if(i === lastIdx) { const tb = T[i] * panneAt; tt = ms < tb ? ms : ms < tb + PANNE ? tb : ms - PANNE; }
            const u = Math.min(1, tt / T[i]); const a = prof[i];
            return Math.min(1, u + a[0] * Math.sin(Math.PI * u) + a[1] * Math.sin(2 * Math.PI * u) + a[2] * Math.sin(3 * Math.PI * u));
        };
        const lanes = Array.from(document.querySelectorAll('#race-track .rc-lane'));
        const cars = lanes.map(l => l.querySelector('.rc-car'));
        const roadW = lanes[0].querySelector('.rc-road').clientWidth;
        const span = Math.max(40, roadW - cars[0].offsetWidth - 14);
        const track = document.getElementById('race-track'); track.classList.add('running');
        const total = T[lastIdx] + PANNE;
        raceSirenStart(total / 1000);
        const arrived = []; let leader = -1, broken = false, smokeAt = 0;
        const t0 = performance.now();
        const frame = now => {
            if(!raceRunning) return;
            const ms = now - t0;
            let best = -1, bestX = -1;
            for(let i = 0; i < n; i++) {
                const x = pos(i, ms);
                cars[i].style.transform = `translateX(${(x * span).toFixed(1)}px)`;
                if(x >= 1 && !arrived.includes(i)) raceArrive(i, arrived, lanes, cars);
                if(!arrived.includes(i) && x > bestX) { bestX = x; best = i; }
            }
            // l'ultima resta in panne per un po'
            const tb = T[lastIdx] * panneAt;
            if(!broken && ms >= tb && ms < tb + PANNE) {
                broken = true; cars[lastIdx].classList.add('broken');
                const b = document.createElement('span'); b.className = 'rc-bubble'; b.textContent = 'IN PANNE!'; cars[lastIdx].appendChild(b);
                raceBoard('car_crash', `<b>${esc(raceDrivers[lastIdx])}</b> è rimasto in panne!`); raceBeep(160, 0.4);
            }
            if(broken && ms < tb + PANNE && ms - smokeAt > 160) {
                smokeAt = ms; const s = document.createElement('span'); s.className = 'rc-smoke'; cars[lastIdx].appendChild(s); setTimeout(() => s.remove(), 1000);
            }
            if(broken && ms >= tb + PANNE && cars[lastIdx].classList.contains('broken')) {
                cars[lastIdx].classList.remove('broken'); const b = cars[lastIdx].querySelector('.rc-bubble'); if(b) b.remove();
            }
            if(!arrived.length && best !== leader && !(broken && ms < tb + PANNE)) { leader = best; raceBoard('campaign', `In testa: <b>${esc(raceDrivers[best])}</b>`); }
            if(arrived.length && arrived.length < n && !(broken && ms < tb + PANNE)) raceBoard('flag', `Vince <b>${esc(raceDrivers[arrived[0]])}</b>! Arrivano gli altri…`);
            if(arrived.length < n) raceRaf = requestAnimationFrame(frame);
            else raceFinish(arrived, T);
        };
        raceRaf = requestAnimationFrame(frame);
    }

    function raceArrive(i, arrived, lanes, cars) {
        arrived.push(i);
        const k = arrived.length, n = raceDrivers.length;
        cars[i].classList.add('done');
        const r = document.createElement('div'); r.className = 'rc-rank' + (k <= 3 ? ' p' + k : '') + (k === n ? ' last' : '');
        r.textContent = k === n ? 'ULT.' : k + '°';
        lanes[i].querySelector('.rc-road').appendChild(r);
        if(k === 1) { raceFanfare(); if(navigator.vibrate && !(prefs && prefs.haptics === false)) navigator.vibrate([30, 40, 60]); }
        else raceBeep(880, 0.06);
    }

    function raceFinish(arrived, T) {
        raceRunning = false; raceRaf = 0;
        document.getElementById('race-track').classList.remove('running');
        const n = arrived.length, win = raceDrivers[arrived[0]], last = raceDrivers[arrived[n - 1]];
        raceBoard('emoji_events', `Ha vinto <b>${esc(win)}</b>!`);
        const medal = k => k === 1 ? '🥇' : k === 2 ? '🥈' : k === 3 ? '🥉' : k + '°';
        const t1 = T[arrived[0]];
        const rows = arrived.slice(0, n - 1).map((i, k) => `<div class="rc-row${k === 0 ? ' first' : ''}"><span class="rc-pos">${medal(k + 1)}</span><span class="rc-who">${esc(raceDrivers[i])}</span><span class="rc-gap">${k ? '+' + ((T[i] - t1) / 1000).toFixed(2).replace('.', ',') + ' s' : 'vincitore'}</span></div>`).join('');
        const quote = RACE_LAST_QUOTES[Math.floor(Math.random() * RACE_LAST_QUOTES.length)];
        const res = document.getElementById('race-results');
        res.innerHTML = `<div class="rc-win"><small>Primo al traguardo</small><b>${esc(win)}</b><div class="wh-confetti" id="race-confetti"></div></div>${rows}
            <div class="rc-last"><span class="material-icons-round">car_crash</span><div><small>Ultimo · ${n}° posto</small><b>${esc(last)}</b><span>${quote}</span></div></div>`;
        const cf = document.getElementById('race-confetti');
        for(let c = 0; c < 36; c++) { const el = document.createElement('i'); el.style.left = (40 + Math.random() * 20) + '%'; el.style.background = WHEEL_COLORS[c % WHEEL_COLORS.length]; el.style.setProperty('--dx', (Math.random() * 260 - 130) + 'px'); el.style.setProperty('--dy', (Math.random() * 160 - 40) + 'px'); el.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg'); el.style.animationDelay = (Math.random() * 0.2) + 's'; cf.appendChild(el); }
        const btn = document.getElementById('race-go-btn'); btn.disabled = false; btn.innerText = 'RIVINCITA!';
        setTimeout(() => res.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
    }

    // ── LA RUOTA DELLA SFIGA ─────────────────────────────────────────────────
    const WHEEL_COLORS = ['#d6266f','#8b3ce0','#2563eb','#f97316','#16a34a','#0891b2','#ca8a04','#dc2626','#059669','#4338ca','#ea580c','#0d9488'];
    const IRONIC_QUOTES = [
        "Turno di notte? Il caffè è già in vena.",
        "Ho salvato tre vite oggi... e la mia dose di caffeina.",
        "La sala d'attesa è più affollata del mio umore stamattina.",
        "Ricordate: il paracetamolo non risolve tutto, ma ci prova sempre.",
        "Il mio corso di laurea non prevedeva 'saper leggere la calligrafia dei medici'.",
        "Se sopravvivo a questo turno, merito una medaglia. O un caffè doppio.",
        "La pressione del paziente è normale. La mia, dopo questo turno, no.",
        "Ho controllato tre volte: il paziente respira meglio di me.",
        "In 12 ore ho fatto più flebo che passi.",
        "Il mio superpotere è trovare la vena al primo colpo. A volte.",
        "Non sono stanco, sono in modalità risparmio energetico.",
        "Oggi ho imparato che 'urgente' per alcuni significa 'tra due settimane'.",
        "La ciambella in sala pausa è più contesa del defibrillatore.",
        "Ho il turno più lungo della giornata e la pazienza più corta.",
        "Oggi sono stato autista, psicologo, navigatore e paciere. Tutto incluso.",
        "Attenzione: il camice nasconde superpoteri, non un mantello.",
        "Se il monitor bippa non è colpa mia. Probabilmente.",
        "Conosco la macchinetta del caffè meglio del mio letto.",
        "Il mio diario clinico di oggi: 'tutto normale, tranne io'.",
        "Ho la patente C e un master in pazienza infinita."
    ];

    let wheelSelectedNurses = [], wheelMode = '', wheelSlots = [], wheelSlotPool = [],
        wheelAssignments = [], wheelCurrentSlotIdx = 0, wheelNamesOnWheel = [], wheelSpinning = false;

    function shuffleArr(a) { a = a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

    function getWheelAudioCtx() { if(!window._wheelAudioCtx) window._wheelAudioCtx = new (window.AudioContext||window.webkitAudioContext)(); return window._wheelAudioCtx; }
    function wheelTickSound() {
        try {
            const ctx = getWheelAudioCtx(); const o = ctx.createOscillator(); const g = ctx.createGain();
            o.type = 'square'; o.frequency.value = 1200; g.gain.value = 0.06;
            o.connect(g); g.connect(ctx.destination);
            o.start(); o.stop(ctx.currentTime + 0.03);
        } catch(e) {}
    }
    function wheelFunnySound() {
        try {
            const ctx = getWheelAudioCtx(); const t0 = ctx.currentTime;
            const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
            o1.type = 'sine'; g1.gain.value = 0.15;
            o1.frequency.setValueAtTime(1400, t0); o1.frequency.exponentialRampToValueAtTime(300, t0 + 0.5);
            o1.connect(g1); g1.connect(ctx.destination); o1.start(t0); o1.stop(t0 + 0.5);
            [440, 660].forEach((f, i) => {
                const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
                o2.type = 'sawtooth'; const st = t0 + 0.55 + i*0.18; o2.frequency.value = f;
                g2.gain.setValueAtTime(0.001, st); g2.gain.exponentialRampToValueAtTime(0.15, st+0.02); g2.gain.exponentialRampToValueAtTime(0.001, st+0.16);
                o2.connect(g2); g2.connect(ctx.destination); o2.start(st); o2.stop(st + 0.18);
            });
        } catch(e) {}
    }
    function scheduleWheelTicks(totalDuration) {
        let elapsed = 0, interval = 60;
        function tick() {
            if(elapsed >= totalDuration - 150) return;
            wheelTickSound();
            interval = interval * 1.09; elapsed += interval;
            setTimeout(tick, interval);
        }
        tick();
    }

    function openWheelModal() {
        closeMenu();
        resetWheelFullState();
        document.getElementById('wheel-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('wheel-modal').classList.add('open'), 10);
        setCurrentView("Ruota della Sfiga");
        goToWheelStep(1);
    }
    function closeWheelModal(e) { if(e && e.target !== e.currentTarget) return; let m = document.getElementById('wheel-modal'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 200); }

    function resetWheelFullState() {
        wheelSelectedNurses = []; wheelMode = ''; wheelSlots = []; wheelSlotPool = [];
        wheelAssignments = []; wheelCurrentSlotIdx = 0; wheelNamesOnWheel = []; wheelSpinning = false;
        const spinBtn = document.getElementById('wheel-spin-btn'); if(spinBtn) { spinBtn.style.display = 'inline-flex'; spinBtn.disabled = false; spinBtn.innerText = 'GIRA LA RUOTA!'; }
        const restartBtn = document.getElementById('wheel-restart-btn'); if(restartBtn) restartBtn.style.display = 'none';
        const doneBanner = document.getElementById('wheel-done-banner'); if(doneBanner) doneBanner.style.display = 'none';
        const slotLabel = document.getElementById('wheel-current-slot-label'); if(slotLabel) slotLabel.style.display = 'none';
        const assignList = document.getElementById('wheel-assign-list'); if(assignList) assignList.innerHTML = '';
        const rev = document.getElementById('wheel-character-reveal'); if(rev) rev.classList.remove('show');
        const slotList = document.getElementById('wheel-slot-list'); if(slotList) slotList.innerHTML = '';
        const slotsStartBtn = document.getElementById('wheel-slots-start-btn'); if(slotsStartBtn) slotsStartBtn.disabled = true;
    }

    function hideAllWheelSteps() {
        ['wheel-step-1','wheel-step-2','wheel-step-3-slots','wheel-step-spin'].forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
    }

    function goToWheelStep(n) {
        vibrate(); hideAllWheelSteps();
        if(n === 1) { document.getElementById('wheel-step-1').style.display = 'block'; renderWheelNurseList(); }
        if(n === 2) { document.getElementById('wheel-step-2').style.display = 'block'; }
    }

    function renderWheelNurseList() {
        const dl = document.getElementById('wheel-nurse-list'); dl.innerHTML = '';
        drivers.forEach(d => {
            if(d.test || d.hidden) return;
            let l = document.createElement('label'); l.className = 'dinner-check-item';
            l.innerHTML = `<input type="checkbox" value="${d.name}" onchange="this.parentElement.classList.toggle('checked');updateWheelContinueBtn();vibrate()"><div class="dinner-check-icon"><span class="material-icons-round" style="font-size:14px">check</span></div>${d.name}`;
            dl.appendChild(l);
        });
        updateWheelContinueBtn();
    }
    function updateWheelContinueBtn() {
        const n = document.querySelectorAll('#wheel-nurse-list input:checked').length;
        document.getElementById('wheel-step1-continue').disabled = n < 2;
    }
    function toggleAllWheelNurses() {
        vibrate(); let ck = document.querySelectorAll('#wheel-nurse-list input'); let all = Array.from(ck).every(c => c.checked);
        ck.forEach(c => { c.checked = !all; c.parentElement.classList.toggle('checked', !all); });
        updateWheelContinueBtn();
    }

    function goToWheelStep2() {
        const checked = Array.from(document.querySelectorAll('#wheel-nurse-list input:checked')).map(x => x.value);
        if(checked.length < 2) return alert("Seleziona almeno 2 colleghi!");
        vibrate(); wheelSelectedNurses = checked;
        hideAllWheelSteps(); document.getElementById('wheel-step-2').style.display = 'block';
    }

    function chooseWheelMode(mode) {
        vibrate(); wheelMode = mode; hideAllWheelSteps();
        if(mode === 'slots') {
            document.getElementById('wheel-step-3-slots').style.display = 'block';
        } else {
            whFreshRun();
            wheelNamesOnWheel = wheelSelectedNurses.slice();
            document.getElementById('wheel-step-spin').style.display = 'block';
            document.getElementById('wheel-current-slot-label').style.display = 'none';
            renderWheelGraphic(wheelNamesOnWheel);
        }
    }

    function calcThreeBands() {
        vibrate();
        const startVal = document.getElementById('wheel-start-time-input').value;
        if(!startVal) return alert("Inserisci l'orario di inizio!");
        const [sh, sm] = startVal.split(':').map(Number);
        const startMinutes = sh*60 + sm;
        const endMinutes = 6*60 + 30; // 06:30, sempre fine turno
        let duration = ((endMinutes - startMinutes) + 1440) % 1440;
        if(duration === 0) duration = 1440;
        const third = duration/3;
        const b0 = startMinutes, b1 = startMinutes + third, b2 = startMinutes + 2*third, b3 = startMinutes + duration;
        const fmt = m => { m = Math.round(m) % 1440; const h = Math.floor(m/60), mm = m%60; return String(h).padStart(2,'0') + ':' + String(mm).padStart(2,'0'); };
        wheelSlots = [
            `${fmt(b0)} - ${fmt(b1)}`,
            `${fmt(b1)} - ${fmt(b2)}`,
            `${fmt(b2)} - ${fmt(b3)}`
        ];
        renderWheelSlotChips();
    }
    function renderWheelSlotChips() {
        const c = document.getElementById('wheel-slot-list'); c.innerHTML = '';
        wheelSlots.forEach(s => { c.innerHTML += `<div class="slot-chip">${s}</div>`; });
        document.getElementById('wheel-slots-start-btn').disabled = wheelSlots.length < 1;
    }
    function startSlotWheel() {
        vibrate();
        whFreshRun();
        wheelSlotPool = shuffleArr(wheelSelectedNurses); wheelAssignments = []; wheelCurrentSlotIdx = 0;
        wheelNamesOnWheel = wheelSlotPool.slice();
        hideAllWheelSteps(); document.getElementById('wheel-step-spin').style.display = 'block';
        document.getElementById('wheel-current-slot-label').style.display = 'block';
        document.getElementById('wheel-current-slot-time').innerText = wheelSlots[0];
        document.getElementById('wheel-assign-list').innerHTML = '';
        renderWheelGraphic(wheelNamesOnWheel);
    }

    let wheelExpandedSegments = [];

    function buildWheelLayout(uniqueNames) {
        if(!uniqueNames || uniqueNames.length === 0) return [];
        const targetTotal = 10;
        let repeat = Math.max(2, Math.round(targetTotal/uniqueNames.length));
        if(uniqueNames.length > 6) repeat = 2;
        const segments = [];
        for(let r = 0; r < repeat; r++) { uniqueNames.forEach(nm => segments.push(nm)); }
        return segments;
    }

    function buildWheelSVG(uniqueNames) {
        const segments = buildWheelLayout(uniqueNames);
        wheelExpandedSegments = segments;
        const n = segments.length, seg = 360/n, cx=150, cy=150, r=150; let paths = '';
        const fontSize = n > 14 ? 11 : n > 10 ? 12.5 : n > 6 ? 14.5 : 17;
        segments.forEach((name, i) => {
            const start = -90 + i*seg, end = -90 + (i+1)*seg;
            const sr = start*Math.PI/180, er = end*Math.PI/180;
            const x1 = cx + r*Math.cos(sr), y1 = cy + r*Math.sin(sr);
            const x2 = cx + r*Math.cos(er), y2 = cy + r*Math.sin(er);
            const largeArc = seg > 180 ? 1 : 0;
            const color = WHEEL_COLORS[uniqueNames.indexOf(name) % WHEEL_COLORS.length];
            const mid = start + seg/2;
            const textRadius = r * 0.66;
            let label = name.length > 14 ? name.substring(0,13) + '…' : name;
            paths += n === 1 ? `<circle class="wh-seg" data-i="0" cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>` : `<path class="wh-seg" data-i="${i}" d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${color}" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/>`;
            paths += `<text x="${textRadius.toFixed(2)}" y="0" transform="translate(${cx},${cy}) rotate(${mid.toFixed(2)})" fill="#fff" font-size="${fontSize}" font-weight="800" text-anchor="middle" dominant-baseline="middle" font-family="'Plus Jakarta Sans',sans-serif" style="letter-spacing:0.3px;paint-order:stroke;stroke:rgba(0,0,0,0.28);stroke-width:2.5px;">${label}</text>`;
        });
        // luce e ombra sopra gli spicchi: la ruota sembra in rilievo
        const shade = `<defs><radialGradient id="whShade" cx="50%" cy="38%" r="62%"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.28"/></radialGradient></defs>`;
        return `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">${shade}${paths}<circle cx="150" cy="150" r="150" fill="url(#whShade)" pointer-events="none"/></svg>`;
    }
    let whAngle = 0;
    function renderWheelGraphic(names, keepResult) {
        const holder = document.getElementById('wheel-svg-holder');
        whAngle = 0; holder.style.transform = 'rotate(0deg)';
        holder.innerHTML = buildWheelSVG(names);
        whLights(); whProgress();
        const res = document.getElementById('wh-result'); if(res && !keepResult) { res.className = 'wh-result'; res.innerHTML = ''; }
        const hub = document.getElementById('wh-hub'); if(hub) hub.disabled = false;
    }
    // nuova estrazione: si riparte puliti (pulsanti, riepilogo, risultato)
    function whFreshRun() {
        wheelAssignments = []; wheelCurrentSlotIdx = 0; wheelSpinning = false;
        const sb = document.getElementById('wheel-spin-btn'); if(sb) { sb.style.display = 'inline-flex'; sb.disabled = false; sb.innerText = 'GIRA LA RUOTA!'; }
        ['wheel-restart-btn', 'wheel-done-banner'].forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
        const al = document.getElementById('wheel-assign-list'); if(al) al.innerHTML = '';
        const rev = document.getElementById('wheel-character-reveal'); if(rev) rev.classList.remove('show');
    }
    // luci intorno alla ruota
    function whLights() {
        const box = document.getElementById('wh-lights'); if(!box || box.childElementCount) return;
        const N = 24; let h = '';
        for(let i = 0; i < N; i++) h += `<i class="wh-light ${i % 2 ? '' : 'on'}" style="transform:rotate(${i * 360 / N}deg) translateY(calc(-1 * (min(76vw, 300px) / 2 + 8px)))"></i>`;
        box.innerHTML = h;
    }
    // fasce orarie: a che punto siamo (fatte, quella in corso, da fare)
    function whProgress() {
        const box = document.getElementById('wh-progress'); if(!box) return;
        if(wheelMode !== 'slots' || !wheelSlots.length) { box.innerHTML = ''; return; }
        box.innerHTML = wheelSlots.map((sl, i) => { const a = wheelAssignments[i]; const cls = a ? 'done' : i === wheelCurrentSlotIdx ? 'cur' : '';
            return `<div class="wh-step ${cls}"><small>${esc(sl)}</small><b>${a ? esc(a.name) : i === wheelCurrentSlotIdx ? 'in corso…' : '—'}</b></div>`; }).join('');
    }
    function whResult(title, name, sub, auto) {
        const res = document.getElementById('wh-result'); if(!res) return;
        res.className = 'wh-result'; void res.offsetWidth;
        res.innerHTML = `<small>${esc(title)}</small><b>${esc(name)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
        res.className = 'wh-result show' + (auto ? ' auto' : '');
    }
    function whConfetti() {
        const wheel = document.getElementById('wh-wheel'); if(!wheel) return;
        const box = document.createElement('div'); box.className = 'wh-confetti';
        const cols = ['#f97316', '#db2777', '#2563eb', '#16a34a', '#facc15', '#7c3aed'];
        let h = ''; for(let i = 0; i < 34; i++) { const ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 120;
            h += `<i style="left:${45 + Math.random() * 10}%;background:${cols[i % cols.length]};--dx:${Math.round(Math.cos(ang) * dist)}px;--dy:${Math.round(Math.sin(ang) * dist + 80)}px;--rot:${Math.round(Math.random() * 720 - 360)}deg;animation-delay:${Math.round(Math.random() * 120)}ms"></i>`; }
        box.innerHTML = h; wheel.appendChild(box); setTimeout(() => box.remove(), 2300);
    }

    // Il giro è animato a mano (requestAnimationFrame): gira anche in modalità leggera e su iPhone,
    // dove le transizioni CSS sono spente. Il puntatore scatta a ogni spicchio, con il suo "tic".
    function doSpin() {
        if(wheelSpinning) return;
        const segments = wheelExpandedSegments;
        if(!segments || segments.length === 0) return;
        wheelSpinning = true; vibrate();
        try { const ac = getWheelAudioCtx(); if(ac.state === 'suspended') ac.resume(); } catch(e) {}
        document.getElementById('wheel-spin-btn').disabled = true;
        const hub = document.getElementById('wh-hub'); if(hub) hub.disabled = true;
        const res = document.getElementById('wh-result'); if(res) { res.className = 'wh-result'; res.innerHTML = ''; }
        document.querySelectorAll('#wheel-svg-holder .wh-win').forEach(x => x.classList.remove('wh-win'));
        const holder = document.getElementById('wheel-svg-holder'), pointer = document.getElementById('wh-pointer'), wheel = document.getElementById('wh-wheel');
        const total = segments.length, seg = 360 / total;
        const winnerIndex = Math.floor(Math.random() * total), winnerName = segments[winnerIndex];
        // si ferma in un punto a caso dentro lo spicchio (non sempre al centro)
        const within = seg * (0.18 + Math.random() * 0.64);
        const start = whAngle, targetMod = (360 - (winnerIndex * seg + within) % 360) % 360;
        const target = start - (start % 360) + 360 * (6 + Math.floor(Math.random() * 3)) + targetMod;
        const dur = 5200 + Math.random() * 900, t0 = performance.now();
        const ease = t => 1 - Math.pow(1 - t, 4);
        let lastSeg = Math.floor(start / seg), kick = 0;
        if(wheel) wheel.classList.add('spinning');
        const frame = now => {
            const t = Math.min(1, (now - t0) / dur), a = start + (target - start) * ease(t);
            holder.style.transform = `rotate(${a.toFixed(2)}deg)`;
            const sNow = Math.floor(a / seg);
            if(sNow !== lastSeg) { lastSeg = sNow; kick = 1; wheelTickSound(); }
            kick *= 0.8; if(pointer) pointer.style.transform = `rotate(${(-22 * kick).toFixed(1)}deg)`;
            if(t < 1) { requestAnimationFrame(frame); return; }
            whAngle = target; if(pointer) pointer.style.transform = '';
            if(wheel) wheel.classList.remove('spinning');
            const win = document.querySelector(`#wheel-svg-holder .wh-seg[data-i="${winnerIndex}"]`); if(win) win.classList.add('wh-win');
            wheelFunnySound();
            if(navigator.vibrate) navigator.vibrate([40,60,40,120]);
            whConfetti();
            wheelSpinning = false;
            onWheelSpinResolved(winnerName);
        };
        requestAnimationFrame(frame);
    }

    function onWheelSpinResolved(winnerName, auto) {
        admWheelLog(winnerName);
        if(wheelMode === 'slots') {
            const slotTime = wheelSlots[wheelCurrentSlotIdx];
            wheelAssignments.push({ time: slotTime, name: winnerName });
            if(!auto) whResult('La fascia ' + slotTime + ' tocca a', winnerName, '');
            wheelSlotPool = wheelSlotPool.filter(nm => nm !== winnerName);
            wheelCurrentSlotIdx++;
            whProgress(); renderWheelAssignList();
            if(wheelCurrentSlotIdx >= wheelSlots.length) {
                document.getElementById('wheel-spin-btn').style.display = 'none';
                document.getElementById('wheel-current-slot-label').style.display = 'none';
                document.getElementById('wheel-done-banner').style.display = 'block';
                document.getElementById('wheel-restart-btn').style.display = 'flex';
                const hub = document.getElementById('wh-hub'); if(hub) hub.disabled = true;
            } else {
                if(wheelSlotPool.length === 0) wheelSlotPool = shuffleArr(wheelSelectedNurses);
                // si lascia vedere il risultato, poi la ruota si prepara per la fascia dopo
                setTimeout(() => {
                    wheelNamesOnWheel = wheelSlotPool.slice();
                    document.getElementById('wheel-current-slot-time').innerText = wheelSlots[wheelCurrentSlotIdx];
                    renderWheelGraphic(wheelNamesOnWheel, true);   // il risultato di prima resta visibile fino al prossimo giro
                    if(wheelSlotPool.length === 1) {
                        // rimane un solo autista: niente giro, la fascia è sua
                        const only = wheelSlotPool[0], time = wheelSlots[wheelCurrentSlotIdx];
                        document.getElementById('wheel-spin-btn').disabled = true;
                        const hub = document.getElementById('wh-hub'); if(hub) hub.disabled = true;
                        whResult('Rimane solo', only, 'La fascia ' + time + ' è sua, senza girare la ruota', true);
                        setTimeout(() => onWheelSpinResolved(only, true), 1600);
                    } else document.getElementById('wheel-spin-btn').disabled = false;
                }, auto ? 300 : 1500);
            }
        } else {
            whResult('La sfiga ha scelto', winnerName, '');
            showWheelCharacterReveal(winnerName);
            const spinBtn = document.getElementById('wheel-spin-btn'); spinBtn.innerText = 'GIRA ANCORA!'; spinBtn.disabled = false;
            document.getElementById('wheel-restart-btn').style.display = 'flex';
        }
    }

    // Ogni estrazione finisce nella sessione (campo "wheelLog") per le statistiche del pannello admin.
    function admWheelLog(winner) {
        try {
            if(SERVER_MODE || !fbReady) return;
            const e = { t: Date.now(), mode: wheelMode, winner: String(winner || ''), slot: wheelMode === 'slots' ? String(wheelSlots[wheelCurrentSlotIdx] || '') : '', n: (wheelNamesOnWheel || []).length, by: userIdentity || '' };
            const FV = firebase.firestore.FieldValue;
            asNoopRef().doc(sessionId).set({ wheelLog: FV.arrayUnion(e), wheelSpins: FV.increment(1) }, { merge:true }).catch(() => {});
        } catch(e) {}
    }
    function renderWheelAssignList() {
        const c = document.getElementById('wheel-assign-list'); c.innerHTML = '';
        if(wheelCurrentSlotIdx < wheelSlots.length) return;   // durante l'estrazione basta la barra in alto; alla fine il riepilogo
        wheelAssignments.forEach(a => { c.innerHTML += `<div class="wheel-assign-item"><span class="wa-time">${a.time}</span><span class="wa-name">${a.name}</span></div>`; });
    }

    function showWheelCharacterReveal(name) {
        const rev = document.getElementById('wheel-character-reveal');
        rev.classList.remove('show'); void rev.offsetWidth;
        document.getElementById('wheel-char-avatar').innerText = name.substring(0,2).toUpperCase();
        document.getElementById('wheel-char-name').innerText = name;
        document.getElementById('wheel-char-quote').innerText = IRONIC_QUOTES[Math.floor(Math.random()*IRONIC_QUOTES.length)];
        rev.classList.add('show');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GESTIONE TASTO "INDIETRO" (Android/browser) — con un popup aperto, il
    // tasto indietro deve chiudere SOLO il popup (con la sua animazione),
    // non l'intera app. Funziona osservando quando un popup riceve/perde la
    // classe "open" e sincronizzando con la cronologia del browser.
    // ═══════════════════════════════════════════════════════════════════════
    const BACK_BUTTON_CLOSERS = {
        'graziella-modal': closeGraziellaModal,
        'custom-announce-modal': closeAnnounceModal,
        'alert-modal': closeAlertAndSave,
        'richiesta-alert-modal': closeRichiestaAlert,
        'notif-center-modal': closeNotifCenter,
        'month-select-dropdown': closeMonthDropdown,
        'shift-modal': closeShiftModal,
        'options-modal': closeOptionsModal,
        'admin-login-modal': closeAdminLoginModal,
        'admin-panel-modal': closeAdminPanel,
        'hours-modal': closeHoursModal,
        'me-modal': closeMyPage,
        'as-notes-modal': () => asCloseNotes(),
        'as-game': asCloseGame,
        'eq-modal': closeEquity,
        'rl-modal': closeRepList,
        'ov-view': () => { if(document.getElementById('ov-sheet').classList.contains('open')) { ovCloseSheet(); setTimeout(syncModalHistoryState, 0); } else setCalView('dettaglio'); },
        'abs-modal': () => { if(absDetailIdx !== null) { absCloseDetail(); setTimeout(syncModalHistoryState, 0); } else closeAbsModal(); },
        'rep-edit-popup': closeRepEditPopup,
        'cc-dialog': closeCcDialog,
        'coord-console': closeCoordConsole,
        'shift-edit-popup': closeShiftEditPopup,
        'ai-advice-popup': closeAiAdvicePopup,
        'access-detail-modal': closeAccessDetail,
        'dinner-modal': closeDinnerModal,
        'wheel-modal': closeWheelModal,
        'race-modal': closeRaceModal,
        'des-range': desCloseRange,
        'des-note': desCloseNote,
        'des-admin': desAdminClose,
        'des-guide': desGuideClose,
        'des-tour': desTourEnd,
        'des-op': desPSClose,
        'des-log': desLogClose,
        'des-view': closeDesiderate,
        'driver-filter-dropdown': closeDriverFilterDropdown,
        'menu-dropdown': toggleMenu
    };
    let modalHistoryPushed = false;
    let currentBackButtonModalId = null;

    function findOpenTrackedModal() {
        for(const id in BACK_BUTTON_CLOSERS) {
            const el = document.getElementById(id);
            if(el && el.classList.contains('open')) return id;
        }
        return null;
    }
    function syncModalHistoryState() {
        const openId = findOpenTrackedModal();
        if(openId && !modalHistoryPushed) {
            history.pushState({ modalId: openId }, '');
            modalHistoryPushed = true;
            currentBackButtonModalId = openId;
        } else if(!openId && modalHistoryPushed) {
            // Il popup è stato chiuso dal codice (es. tap sulla X), non dal tasto
            // indietro: consumiamo la voce di cronologia aggiunta senza riaprire nulla.
            modalHistoryPushed = false;
            currentBackButtonModalId = null;
            history.back();
        }
    }
    window.addEventListener('popstate', () => {
        if(currentBackButtonModalId && BACK_BUTTON_CLOSERS[currentBackButtonModalId]) {
            modalHistoryPushed = false;
            const fn = BACK_BUTTON_CLOSERS[currentBackButtonModalId];
            currentBackButtonModalId = null;
            fn();
        }
    });
    Object.keys(BACK_BUTTON_CLOSERS).forEach(id => {
        const el = document.getElementById(id);
        if(!el) return;
        new MutationObserver(syncModalHistoryState).observe(el, { attributes:true, attributeFilter:['class'] });
    });

    // ══════════════════════════════════════════════════════════════════
    // MANIGLIA LATERALE — apre/chiude il pannello Richieste trascinando in orizzontale.
    // L'iframe viene ricaricato solo quando cambia davvero l'identità loggata (es. dopo
    // "Cambia Utente"), non ad ogni apertura: altrimenti si perderebbe un form a metà.
    // ══════════════════════════════════════════════════════════════════
    (function setupRichiestePanel() {
        const handle = document.getElementById('side-drag-handle');
        const icon = document.getElementById('side-drag-icon');
        const panel = document.getElementById('richieste-panel');
        const iframe = document.getElementById('richieste-iframe');
        if (!handle || !panel || !iframe) return;

        const RICHIESTE_URL = "https://centrale118rsm-code.github.io/Richieste-A.S.-118/";
        let iframeLoaded = false;
        let iframeLoadedIdentity = undefined; // identità con cui l'iframe è stato caricato l'ultima volta
        let dragging = false;
        let panelOpen = false;
        let startX = 0;
        let startTranslate = 0;

        function W() { return window.innerWidth; }

        // Se il portale non si carica (rete debole o assente) il pannello non resta bianco:
        // compare un messaggio con "Riprova".
        let rpTimer = null;
        function rpShow(kind) {
            const st = document.getElementById('rp-status'); if(!st) return;
            if(!kind) { st.hidden = true; return; }
            st.hidden = false;
            st.querySelector('.rp-ico').textContent = kind === 'err' ? 'wifi_off' : 'hourglass_top';
            document.getElementById('rp-st-t').textContent = kind === 'err' ? 'Le Richieste non si aprono' : 'Apro le Richieste…';
            document.getElementById('rp-st-s').textContent = kind === 'err' ? (navigator.onLine === false ? 'Il telefono è senza connessione.' : 'La connessione è lenta o il sito non risponde.') + ' Riprova tra poco.' : '';
            document.getElementById('rp-st-retry').hidden = kind !== 'err';
        }
        function rpWatch(fr) {
            rpShow('wait'); clearTimeout(rpTimer);
            rpTimer = setTimeout(() => rpShow('err'), 20000);
            fr.onload = () => {
                clearTimeout(rpTimer);
                // stesso sito (github.io): se la pagina non è arrivata il documento è vuoto o non leggibile
                let ok = false, same = true; try { same = new URL(fr.src).origin === location.origin; } catch(e) {}
                try { const d = fr.contentDocument; ok = d ? !!(d.body && d.body.childElementCount) : !same; } catch(e) { ok = !same; }
                rpShow(ok ? null : 'err');
            };
        }
        window.rpRetry = function() { iframeLoaded = false; ensureLoaded(); };

        function ensureLoaded(reqId) {
            const identity = (typeof userIdentity !== 'undefined' && userIdentity) ? userIdentity : null;
            // Passa l'identità già selezionata qui in Turni Autisti, così nel portale
            // Richieste non serve un secondo login: si accede in automatico con lo stesso
            // operatore. Se l'identità cambia (es. dopo "Cambia Utente"), l'iframe viene
            // ricaricato con la nuova identità la prossima volta che si apre il pannello.
            if (!iframeLoaded || iframeLoadedIdentity !== identity) {
                const url = new URL(RICHIESTE_URL);
                if (identity) url.searchParams.set('nome', identity);
                if (reqId) url.searchParams.set('richiesta', reqId);
                rpWatch(iframe);
                iframe.src = url.toString();
                iframeLoaded = true;
                iframeLoadedIdentity = identity;
            } else if (reqId) {
                // L'iframe è già caricato con l'identità giusta: non serve ricaricarlo,
                // gli chiediamo direttamente di aprire quella richiesta (stesso dominio,
                // quindi possiamo chiamare una sua funzione globale senza postMessage).
                try { iframe.contentWindow.openDeepLinkRequest(reqId); } catch(e) { console.error("Impossibile aprire la richiesta nel pannello:", e); }
            }
        }

        function setTranslate(px) {
            panel.style.transition = 'none';
            panel.style.transform = `translateX(${px}px)`;
        }
        function snapTo(px, isOpen) {
            panel.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)';
            panel.style.transform = `translateX(${px}px)`;
            icon.parentElement.classList.toggle('is-open', isOpen);
            panelOpen = isOpen;
        }
        function currentTranslate() {
            const m = new DOMMatrixReadOnly(getComputedStyle(panel).transform);
            return m.m41;
        }

        function onDown(e) {
            dragging = true;
            ensureLoaded();
            startX = (e.touches ? e.touches[0].clientX : e.clientX);
            startTranslate = panelOpen ? 0 : W();
            panel.style.transition = 'none';
            e.preventDefault();
        }
        function onMove(e) {
            if (!dragging) return;
            const x = (e.touches ? e.touches[0].clientX : e.clientX);
            let t = startTranslate + (x - startX);
            t = Math.max(0, Math.min(W(), t));
            setTranslate(t);
            e.preventDefault();
        }
        function onUp() {
            if (!dragging) return;
            dragging = false;
            const t = currentTranslate();
            if (t < W() * 0.6) snapTo(0, true);
            else snapTo(W(), false);
        }

        handle.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);

        // Tocco secco: apre se chiuso, chiude se aperto — non serve sempre trascinare.
        handle.addEventListener('click', () => {
            if (dragging) return;
            ensureLoaded();
            if (panelOpen) snapTo(W(), false);
            else snapTo(0, true);
        });

        window.closeRichiestePanel = function() { snapTo(W(), false); };
        window.openRichiestePanel = function(reqId) { ensureLoaded(reqId); snapTo(0, true); };
        // Richieste in una FINESTRA A SÉ (27/11/2026): sul computer si apre nella metà destra dello
        // schermo, così a sinistra restano i turni. Sul telefono diventa una scheda nuova.
        // esempio = true apre la copia di prova (Esempio richieste) invece del portale vero.
        window.openRichiesteWindow = function(esempio) {
            vibrate();
            const identity = (typeof userIdentity !== 'undefined' && userIdentity) ? userIdentity : null;
            const url = new URL(esempio ? 'richieste-esempio/' : RICHIESTE_URL, location.href);
            if (identity) url.searchParams.set('nome', identity);
            const s = window.screen || {}, aw = s.availWidth || 1280, ah = s.availHeight || 800, al = s.availLeft || 0, at = s.availTop || 0;
            const w = Math.max(420, Math.round(aw / 2));
            const win = window.open(url.toString(), esempio ? 'richieste118_esempio' : 'richieste118', `popup=yes,width=${w},height=${ah},left=${al + aw - w},top=${at}`);
            if (win) { try { win.focus(); } catch(e) {} window.closeRichiestePanel(); if (esempio && window.closeEsempioPanel) window.closeEsempioPanel(); }
            else window.open(url.toString(), '_blank');   // finestre a comparsa bloccate: almeno una scheda nuova
        };
    })();
