    // ═══ REPERIBILITÀ A FASCE (come per gli autisti) ══════════════════════
    // Una reperibilità dura 24 h: parte alle 13:00 del giorno X e finisce alle 13:00 del
    // giorno X+1. Ogni giorno FISICO ha 4 fasce, nello stesso ordine usato dal programma
    // autisti e dal portale Richieste:
    //   [0]=00-07  [1]=07-13   coda della reperibilità iniziata IERI
    //   [2]=13-20  [3]=20-00   reperibilità che inizia OGGI
    // • Titolare del turno che parte il giorno X: documento admin_config/reperibilita,
    //   mappa "turni" { "YYYY-MM-DD": nome originale della colonna, "" = eliminata }. I giorni
    //   senza voce ripiegano sul file Excel (codice "/R", es. "M/R"), così si può abbandonare
    //   l'Excel un po' alla volta.
    // • Cessioni di singole fasce: mappa "cessioni" dello stesso documento, con lo stesso
    //   formato degli override autisti { date: giorno fisico della fascia, slotIndex,
    //   newDriver, ... }, scritta dal portale Richieste (Cessione reperibilità) e dal
    //   coordinatore dalla ruota.
    const REP_SLOTS = [
        { label:'00-07', long:'00:00–07:00', minutes:420 },
        { label:'07-13', long:'07:00–13:00', minutes:360 },
        { label:'13-20', long:'13:00–20:00', minutes:420 },
        { label:'20-00', long:'20:00–00:00', minutes:240 }
    ];
    let repTurniSaved = {};        // salvato su Firestore
    let repTurniEdits = {};        // modifiche non ancora salvate (modalità modifica)
    let repCessioniSaved = {};     // "YYYY-MM-DD_slot" -> { newDriver, originalDriver, requestId, id }
    let repCessioniEdits = {};     // "YYYY-MM-DD_slot" -> { newDriver } oppure null (= da rimuovere)
    let repCache = null, repExcelCache = null, repExcelFor = null, repRowMap = null, repRowMapFor = null;

    function repHas(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
    function repDateAdd(iso, n) { const p = iso.split('-').map(Number); return ymd(new Date(p[0], p[1]-1, p[2] + n)); }
    function repDateObj(iso) { const p = iso.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }
    function repDateLabel(iso, long) { return iso ? repDateObj(iso).toLocaleDateString('it-IT', long ? { weekday:'long', day:'numeric', month:'long' } : { day:'2-digit', month:'2-digit' }) : ''; }
    function repRowDate(rowIdx) {
        const row = finalData[rowIdx]; if(!row || rowIdx < 1) return null;
        const mi = MONTH_MAP[row[0].v], dn = parseInt(row[1].v);
        return (mi === undefined || isNaN(dn)) ? null : ymd(new Date(shiftRowYear(rowIdx), mi, dn));
    }
    function repRowOfDate(iso) {
        if(repRowMapFor !== finalData) { repRowMap = {}; for(let r = 1; r < finalData.length; r++) { const d = repRowDate(r); if(d) repRowMap[d] = r; } repRowMapFor = finalData; }
        return repRowMap[iso] || null;
    }
    function repNormName(n) { return (n || '').toString().toUpperCase().trim().replace(/\.$/, ''); }
    // Nome qualsiasi (anche rinominato o scritto dal portale Richieste) -> nome originale della colonna.
    function repToOrig(n) {
        const u = repNormName(n); if(!u) return '';
        const d = drivers.find(x => repNormName(x.originalName) === u) || drivers.find(x => repNormName(x.name) === u);
        return d ? d.originalName : u;
    }
    function repDisplayName(orig) { const d = drivers.find(x => x.originalName === orig); return d ? d.name : (nameOverrides[orig] || orig || ''); }
    function repIsFestive(iso) { const dt = repDateObj(iso); return dt.getDay() === 0 || !!HOLIDAYS[`${dt.getMonth()}-${dt.getDate()}`]; }

    // Titolari letti dal file Excel (una cella con "/R" = reperibile dalle 13:00 di quel giorno).
    function repExcelMap() {
        if(repExcelFor === rawFinalData && repExcelCache) return repExcelCache;
        // autisti: titolare = chi ha "/R" nel proprio turno (es. M/R). Chi riceve la fascia 13-20
        // con una cessione NON diventa titolare (era una regola del file Excel, non serve più):
        // la fascia scritta nelle righe 29-32 diversa dal titolare resta una cessione.
        // Solo nei giorni senza nessun "/R" vale ancora chi ha la fascia 13-20.
        const out = {}; const header = rawFinalData[0] || [];
        for(let r = 1; r < rawFinalData.length; r++) {
            const row = rawFinalData[r]; const mi = MONTH_MAP[row[0].v], dn = parseInt(row[1].v);
            if(mi === undefined || isNaN(dn)) continue;
            for(let c = 3; c < row.length; c++) {
                const x = row[c] || {};
                if([x.v, x.subV, x.supV].some(v => isRepStr((v || '').toString()))) { out[ymd(new Date(shiftRowYear(r), mi, dn))] = header[c]; break; }
            }
        }
        if(TEAM_AS) Object.keys(asRepFasce).forEach(d => { const n = asRepFasce[d][2]; if(n && !out[d]) out[d] = repToOrig(asNorm(n)); });
        repExcelCache = out; repExcelFor = rawFinalData;
        return out;
    }
    // Stato effettivo: titolari (Excel < salvato < modifiche) e fasce di ogni giorno fisico.
    function repBuild() {
        const tit = Object.assign({}, repExcelMap(), repTurniSaved, repTurniEdits);
        Object.keys(tit).forEach(k => { if(!tit[k]) delete tit[k]; });
        const ces = {};
        if(TEAM_AS && asBibbia.autoSyncReperibilita !== false) Object.keys(asProdCessioni).forEach(k => { ces[k] = asProdCessioni[k]; });   // cessioni dell'app in uso
        Object.keys(repCessioniSaved).forEach(k => { ces[k] = repCessioniSaved[k]; });
        Object.keys(repCessioniEdits).forEach(k => { if(repCessioniEdits[k]) ces[k] = repCessioniEdits[k]; else delete ces[k]; });
        const days = {};
        const put = (date, slot, name) => { (days[date] = days[date] || ['', '', '', ''])[slot] = name; };
        Object.keys(tit).forEach(x => { const t = tit[x], n = repDateAdd(x, 1); put(x, 2, t); put(x, 3, t); put(n, 0, t); put(n, 1, t); });
        // autisti: le fasce scritte nell'Excel valgono dove il titolare non è stato cambiato nell'app
        if(TEAM_AS) Object.keys(asRepFasce).forEach(date => asRepFasce[date].forEach((nm, s) => {
            const turn = s >= 2 ? date : repDateAdd(date, -1);
            if(repHas(repTurniSaved, turn) || repHas(repTurniEdits, turn)) return;
            const who = repToOrig(asNorm(nm)); if(who) put(date, s, who);
        }));
        Object.keys(ces).forEach(k => {
            const i = k.lastIndexOf('_'), date = k.slice(0, i), slot = +k.slice(i + 1), who = repToOrig(ces[k].newDriver);
            if(who && slot >= 0 && slot < 4) put(date, slot, who);
        });
        repCache = { tit, ces, days, raw: rawFinalData, drv: drivers };
        return repCache;
    }
    function repData() { return (repCache && repCache.raw === rawFinalData && repCache.drv === drivers) ? repCache : repBuild(); }
    function repInvalidate() { repCache = null; }
    // Titolare del turno a cui appartiene una fascia fisica.
    function repTitolareOfSlot(R, date, slot) { return slot >= 2 ? (R.tit[date] || '') : (R.tit[repDateAdd(date, -1)] || ''); }

    // ── Visualizzazione nelle celle (stesse regole del programma autisti) ──
    // Giorno X (inizio): il titolare vede 13-20 e 20-00; giorno X+1 (fine): 00-07 e 07-13.
    // Verde = coperta dal titolare; rossa col nome = ceduta a quel collega; chi la riceve
    // la vede lampeggiare giallo/rosso con il nome del titolare.
    function repBarHtml(orig, date) {
        const R = repData(); const f = R.days[date]; if(!f) return '';
        const titOggi = R.tit[date] || '', titIeri = R.tit[repDateAdd(date, -1)] || '';
        const segs = [];
        const green = l => `<div class="rep-bar-seg green">${l}</div>`;
        const ceduta = (l, who) => `<div class="rep-bar-seg red">${l}<br>${esc(repDisplayName(who))}</div>`;
        const acquisita = (l, tit) => `<div class="rep-bar-seg rep-sub">${l}<br>${esc(repDisplayName(tit))}</div>`;
        [0, 1, 2, 3].forEach(s => {
            const who = f[s], tit = s >= 2 ? titOggi : titIeri, L = REP_SLOTS[s].label;
            if(tit === orig) segs.push(!who || who === orig ? green(L) : ceduta(L, who));
            else if(who === orig) segs.push(tit ? acquisita(L, tit) : green(L));
        });
        return segs.length ? `<div class="rep-bar">${segs.join('')}</div>` : '';
    }
    function repCellHtml(orig, date) {
        if(!date) return '';
        const R = repData();
        const d = drivers.find(x => x.originalName === orig), r = repRowOfDate(date);
        const pn = (d && r && pnRepConflictAt(r, d, R)) ? `<div class="rep-pn-warn">IN PERMESSO NOTTE<br>NO REPERIBILITÀ</div>` : '';
        return (R.tit[date] === orig ? `<div class="rep-text">REPERIBILE</div>` : '') + pn + repBarHtml(orig, date);
    }
    // Riquadro nel dettaglio del giorno (tocco su una cella fuori dalla modalità modifica).
    function repDaySectionHtml(date) {
        const R = repData(); const tit = R.tit[date]; if(!tit || !date) return '';
        const n = repDateAdd(date, 1);
        const fasce = [[date, 2], [date, 3], [n, 0], [n, 1]].map(([d, s]) => { const who = (R.days[d] || [])[s] || tit; return { d, s, who, ced: who !== tit }; });
        const head = `<div class="sm2-sec rep"><span class="material-icons-round">phone_in_talk</span>Reperibilità<span class="sm2-n r">13:00 › 13:00</span></div>`;
        // nessuna cessione: una riga sola con il titolare
        if(!fasce.some(f => f.ced)) return `${head}<div class="sm2-pad"><div class="sm2-rep-one"><span class="sm2-rep-ico"><span class="material-icons-round">call</span></span><div class="sm2-who"><b>${esc(repDisplayName(tit))}</b><small>Tutte le fasce, fino alle 13:00 del ${esc(repDateLabel(n))}</small></div></div></div>`;
        const rows = fasce.map(f => `<span>${REP_SLOTS[f.s].long}${f.s < 2 ? ` <small>(${esc(repDateLabel(f.d))})</small>` : ''}</span><b${f.ced ? ' class="ced"' : ''}>${esc(repDisplayName(f.who))}${f.ced ? ' <small>ceduta</small>' : ''}</b>`).join('');
        return `${head}<div class="sm2-pad"><div style="font-size:0.78rem;color:var(--text-sec);font-weight:600;margin-bottom:6px">Titolare: <b style="color:var(--text-main)">${esc(repDisplayName(tit))}</b></div><div class="sm2-rep">${rows}</div></div>`;
    }

    // ── Reperibili del mese (menu Calendario) ──────────────────────────────
    // Tabella come il foglio Excel delle reperibilità: per ogni giorno le 4 fasce con chi le
    // copre davvero (titolare oppure chi ha ricevuto la fascia con una cessione). Solo lettura.
    let repListMonth = null;   // { y, m }
    const RL_WD = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    const RL_MN = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO','LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];
    function repListBounds() { return { lo: SHIFT_YEAR * 12, hi: (SHIFT_YEAR + 1) * 12 + 11 }; }
    function openRepList() {
        closeMenu(); vibrate();
        const now = new Date(), b = repListBounds();
        let k = now.getFullYear() * 12 + now.getMonth(); k = Math.min(Math.max(k, b.lo), b.hi);
        repListMonth = { y: Math.floor(k / 12), m: k % 12 };
        renderRepList();
        const m = document.getElementById('rl-modal'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10);
        setCurrentView('Reperibili');
        setTimeout(() => { const t = document.querySelector('#rl-body tr.rl-today'), body = document.querySelector('#rl-modal .modal-body'); if(t && body) body.scrollTop = Math.max(0, t.offsetTop - 120); }, 80);
    }
    function closeRepList(e) { if(e && e.target !== e.currentTarget) return; const m = document.getElementById('rl-modal'); m.classList.remove('open'); setTimeout(() => { if(!m.classList.contains('open')) m.style.display = 'none'; }, 300); }
    function repListMove(d) {
        vibrate(); const b = repListBounds();
        const k = Math.min(Math.max(repListMonth.y * 12 + repListMonth.m + d, b.lo), b.hi);
        repListMonth = { y: Math.floor(k / 12), m: k % 12 }; renderRepList();
        const body = document.querySelector('#rl-modal .modal-body'); if(body) body.scrollTop = 0;
    }
    // Righe del mese: giorno, sigla, festivo, oggi e le 4 fasce { who, ced, tit }.
    function repListRows(y, m) {
        const R = repData(), H = holidaysFor(y), today = ymd(new Date()), nd = new Date(y, m + 1, 0).getDate(), out = [];
        for(let d = 1; d <= nd; d++) {
            const dt = new Date(y, m, d), iso = ymd(dt), f = R.days[iso] || ['', '', '', ''];
            out.push({ d, wd: dt.getDay(), fest: H[`${m}-${d}`] || '', today: iso === today, slots: [0, 1, 2, 3].map(s => {
                const who = f[s], tit = who ? repTitolareOfSlot(R, iso, s) : '';
                return { who: who ? repDisplayName(who).toUpperCase() : '', ced: !!who && !!tit && who !== tit, tit: tit ? repDisplayName(tit) : '' };
            }) });
        }
        return out;
    }
    function renderRepList() {
        if(!repListMonth) return;
        const { y, m } = repListMonth, b = repListBounds(), k = y * 12 + m;
        document.getElementById('rl-title').textContent = RL_MN[m] + ' ' + y;
        document.getElementById('rl-prev').disabled = k <= b.lo; document.getElementById('rl-next').disabled = k >= b.hi;
        const rows = repListRows(y, m).map(r => {
            const cls = [r.wd === 0 ? 'rl-sun' : '', r.fest ? 'rl-fest' : '', r.today ? 'rl-today' : ''].filter(Boolean).join(' ');
            const cells = r.slots.map(x => !x.who ? '<td class="rl-n rl-empty"></td>'
                : `<td class="rl-n${x.ced ? ' rl-ces' : ''}"${x.ced ? ` title="Ceduta da ${esc(x.tit)}"` : ''}>${esc(x.who)}</td>`).join('');
            return `<tr class="${cls}"${r.fest ? ` title="${esc(r.fest)}"` : ''}><td class="rl-d">${r.d}</td><td class="rl-w">${RL_WD[r.wd]}</td>${cells}</tr>`;
        }).join('');
        document.getElementById('rl-body').innerHTML = `<table class="rl-table"><colgroup><col class="rl-cd"><col class="rl-cw"><col><col><col><col></colgroup>
            <thead><tr><th class="rl-m" colspan="2">${RL_MN[m]}</th>${REP_SLOTS.map(x => `<th>${x.label.replace('-', ' - ')}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    // Stampa: stessa tabella su un foglio A4, colori compresi.
    function repListPrint() {
        if(!repListMonth) return; vibrate();
        const { y, m } = repListMonth;
        const rows = repListRows(y, m).map(r => `<tr class="${r.wd === 0 ? 'sun' : ''}"><td class="d${r.fest ? ' fe' : ''}">${r.d}</td><td class="w${r.wd === 0 ? ' su' : ''}">${RL_WD[r.wd]}</td>${r.slots.map(x => `<td class="n${x.ced ? ' c' : x.who ? '' : ' e'}">${esc(x.who)}</td>`).join('')}</tr>`).join('');
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Reperibili ${RL_MN[m]} ${y}</title><style>
            @page { size:A4 portrait; margin:10mm; } * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
            body { font-family:Arial, sans-serif; margin:0; color:#111; } h1 { font-size:16px; margin:0 0 6px; }
            table { width:99%; border-collapse:collapse; font-size:12px; } th, td { border:1px solid #888; padding:3px 6px; }
            th { background:#8ef04a; font-size:14px; } th.m { background:#22d3a0; font-style:italic; }
            td.d { text-align:center; font-weight:bold; color:#1e3a8a; width:28px; font-size:14px; } td.d.fe { background:#5eead4; }
            td.w { text-align:center; color:#1d4ed8; background:#dde3fb; width:36px; } td.w.su { background:#c6f04a; }
            tr.sun td { border-bottom:2px solid #a21caf; } td.n { background:#e3f1dc; } td.n.c { background:#fde68a; } td.n.e { background:#fff; }
            .legend { margin-top:6px; font-size:10px; color:#555; }
        </style></head><body><h1>Reperibili infermieri \u2014 ${RL_MN[m]} ${y}</h1>
            <table><thead><tr><th class="m" colspan="2">${RL_MN[m]}</th>${REP_SLOTS.map(x => `<th>${x.label.replace('-', ' - ')}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
            <p class="legend">Generato il ${new Date().toLocaleString('it-IT')}</p></body></html>`;
        const old = document.getElementById('rl-print-frame'); if(old) old.remove();
        const fr = document.createElement('iframe');
        fr.id = 'rl-print-frame'; fr.setAttribute('aria-hidden', 'true');
        fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
        document.body.appendChild(fr);
        const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
        setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch(e) { ccToast('Stampa non riuscita.', true); } }, 250);
    }
    async function repListPdf() {
        if(!repListMonth) return; vibrate();
        const { y, m } = repListMonth;
        try {
            ccToast('Preparo il PDF\u2026');
            const jsPDF = await repEnsurePdfLib();
            const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
            const rows = repListRows(y, m);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
            doc.text(`Reperibili infermieri - ${RL_MN[m]} ${y}`, 12, 13);
            doc.autoTable({
                startY: 17, margin: { left: 12, right: 12 }, theme: 'grid',
                head: [[{ content: RL_MN[m], colSpan: 2 }, ...REP_SLOTS.map(x => x.label.replace('-', ' - '))]],
                body: rows.map(r => [String(r.d), RL_WD[r.wd], ...r.slots.map(x => x.who)]),
                styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 1.6, lineColor: [140, 140, 140], lineWidth: 0.2, textColor: [17, 17, 17] },
                headStyles: { fillColor: [142, 240, 74], textColor: [17, 17, 17], fontStyle: 'bold', halign: 'center', fontSize: 11 },
                columnStyles: { 0: { cellWidth: 12, halign: 'center', fontStyle: 'bold', textColor: [30, 58, 138] }, 1: { cellWidth: 14, halign: 'center', textColor: [29, 78, 216] } },
                didParseCell: h => {
                    if(h.section === 'head' && h.column.index === 0) { h.cell.styles.fillColor = [34, 211, 160]; h.cell.styles.fontStyle = 'bolditalic'; h.cell.styles.fontSize = 9; }
                    if(h.section !== 'body') return;
                    const r = rows[h.row.index], c = h.column.index;
                    if(c === 0) h.cell.styles.fillColor = r.fest ? [94, 234, 212] : [255, 255, 255];
                    else if(c === 1) h.cell.styles.fillColor = r.wd === 0 ? [198, 240, 74] : [221, 227, 251];
                    else { const x = r.slots[c - 2]; h.cell.styles.fillColor = !x.who ? [255, 255, 255] : x.ced ? [253, 230, 138] : [227, 241, 220]; }
                }
            });
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90);
            doc.text(`Generato il ${new Date().toLocaleString('it-IT')}`, 12, doc.lastAutoTable.finalY + 6);
            doc.save(`reperibili-infermieri-${RL_MN[m].toLowerCase()}-${y}.pdf`);
            ccToast('PDF scaricato');
        } catch(e) { console.error(e); ccToast('PDF non riuscito: controlla la connessione.', true); }
    }

    // "Reperibile ora" nella barra di ogni mese: chi copre la fascia in corso adesso.
    function updateRepNowPill() {
        const pills = document.querySelectorAll('.rep-now-pill'); if(!pills.length) return;
        const now = new Date(), h = now.getHours();
        const slot = h >= 20 ? 3 : h >= 13 ? 2 : h >= 7 ? 1 : 0;
        const who = (repData().days[ymd(now)] || [])[slot] || '';
        const html = now.getFullYear() !== SHIFT_YEAR ? '' : `<span class="rep-now-dot ${who ? '' : 'off'}"></span><span class="rep-now-label">Reperibile ora</span><span class="rep-now-name">${who ? esc(repDisplayName(who)) : '—'}</span><span class="rep-now-slot">${REP_SLOTS[slot].long}</span>`;
        pills.forEach(p => { if(p.innerHTML !== html) p.innerHTML = html; });
    }

    // ── Firestore ──────────────────────────────────────────────────────────
    // Tutto in un solo documento (le regole Firebase del progetto consentono admin_config):
    //   turni:    { "YYYY-MM-DD": nome originale, "" = eliminata }
    //   cessioni: { "YYYY-MM-DD_slot": { date, slotIndex, timeSlot, originalDriver, newDriver, requestId, updatedAt } }
    // Le cessioni hanno lo stesso formato dei documenti "reperibilita_overrides" degli autisti.
    function repDocRef() { return cfgRef('reperibilita'); }   // autisti prova: documento proprio, le cessioni dell'app in uso si leggono a parte
    function listenReperibilita() {
        if(!fbReady) return;
        repDocRef().onSnapshot(doc => {
            if(!doc.metadata.fromCache) snapRepOk = true;
            const data = doc.exists ? (doc.data() || {}) : {};
            const t = data.turni;
            repTurniSaved = (t && typeof t === 'object') ? Object.assign({}, t) : {};
            const m = {}, c = (data.cessioni && typeof data.cessioni === 'object') ? data.cessioni : {};
            Object.keys(c).forEach(k => {
                const x = c[k]; if(!x || !x.date || x.slotIndex === undefined || x.slotIndex === null) return;
                const p = String(x.date).split('-'); if(p.length !== 3) return;
                const key = ymd(new Date(+p[0], +p[1] - 1, +p[2])) + '_' + (+x.slotIndex);
                m[key] = { newDriver: x.newDriver || '', originalDriver: x.originalDriver || '', requestId: x.requestId || '', id: k };
            });
            repCessioniSaved = m; repRawCessioni = c;
            repAfterRemoteChange();
        }, err => console.error('Errore ascolto reperibilità:', err));
    }
    let repRemoteTimer = null;
    function repAfterRemoteChange() {
        repInvalidate();
        clearTimeout(repRemoteTimer);
        repRemoteTimer = setTimeout(() => {
            if(finalData.length && document.querySelector('#table-body tr[data-row]')) renderTable();
            if(coordEditModeActive) updateCoordToolbarState();
            ccRefreshIfOpen();
            if(document.getElementById('rl-modal')?.classList.contains('open')) renderRepList();
        }, 120);
    }
    function repPendingCount() { return Object.keys(repTurniEdits).length + Object.keys(repCessioniEdits).length; }
    function repDiscardEdits() { repTurniEdits = {}; repCessioniEdits = {}; repInvalidate(); }
    // Contenuto da scrivere per le reperibilità in sospeso (senza toccare lo stato locale).
    function repBuildPayload() {
        const turni = Object.assign({}, repTurniEdits), ces = Object.assign({}, repCessioniEdits);
        const count = Object.keys(turni).length + Object.keys(ces).length;
        if(!count) return null;
        const R = repData(), now = new Date().toISOString();
        const payload = { updatedAt: now };
        if(Object.keys(turni).length) payload.turni = turni;
        if(Object.keys(ces).length) {
            payload.cessioni = {};
            Object.keys(ces).forEach(k => {
                const i = k.lastIndexOf('_'), date = k.slice(0, i), slot = +k.slice(i + 1);
                payload.cessioni[k] = ces[k] ? {
                    date, slotIndex: slot, timeSlot: REP_SLOTS[slot].long.replace('\u2013', '-'),
                    originalDriver: repDisplayName(repTitolareOfSlot(R, date, slot)) || null,
                    newDriver: repDisplayName(repToOrig(ces[k].newDriver)),
                    requestId: 'coordinatore', updatedAt: now
                } : firebase.firestore.FieldValue.delete();
            });
        }
        const log = [];
        Object.keys(turni).forEach(d => log.push({ k:'rep', key:d, prev: repTitBase(d) || null, next: turni[d] || null }));
        Object.keys(ces).forEach(k => log.push({ k:'repc', key:k, prev: repCesBase(k) || null, next: ces[k] ? repToOrig(ces[k].newDriver) : null }));
        return { payload, turni, ces, count, log };
    }
    // Dopo la conferma: le modifiche diventano "salvate" (solo quelle inviate, non quelle nuove).
    function repMarkSaved(p) {
        Object.assign(repTurniSaved, p.turni);
        Object.keys(p.ces).forEach(k => { if(p.ces[k]) repCessioniSaved[k] = Object.assign({}, p.ces[k], { id: k }); else delete repCessioniSaved[k]; });
        Object.keys(p.turni).forEach(k => { if(JSON.stringify(repTurniEdits[k]) === JSON.stringify(p.turni[k])) delete repTurniEdits[k]; });
        Object.keys(p.ces).forEach(k => { if(JSON.stringify(repCessioniEdits[k]) === JSON.stringify(p.ces[k])) delete repCessioniEdits[k]; });
        repInvalidate();
    }

    // ── Modifiche (con Annulla/Ripeti, salvate insieme ai turni) ──────────
    // prev/next delle voci di annullamento: null = nessuna modifica in sospeso, {v} = valore.
    function repSetEdit(kind, key, box) {
        const map = kind === 'rep' ? repTurniEdits : repCessioniEdits;
        const prev = repHas(map, key) ? { v: map[key] } : null;
        if(box) map[key] = box.v; else delete map[key];
        repInvalidate();
        return prev;
    }
    function repDatesOfKey(kind, key) {
        if(kind === 'rep') return [key, repDateAdd(key, 1)];
        return [key.slice(0, key.lastIndexOf('_'))];
    }
    function repTitBase(date) { return repHas(repTurniSaved, date) ? (repTurniSaved[date] || '') : (repExcelMap()[date] || ''); }
    function repCesBase(key) { return repCessioniSaved[key] ? repToOrig(repCessioniSaved[key].newDriver) : ''; }
    // value: nome originale ('' = nessun titolare / nessuna cessione). Restituisce la voce di annullamento.
    function repChange(kind, key, value) {
        value = value || '';
        const base = kind === 'rep' ? repTitBase(key) : repCesBase(key);
        let next = null;
        if(value !== base) next = kind === 'rep' ? { v: value } : { v: value ? { newDriver: value } : null };
        const prev = repSetEdit(kind, key, next);
        return { kind, key, prev, next };
    }
    function repTurnSlotKeys(x) { const n = repDateAdd(x, 1); return [x + '_2', x + '_3', n + '_0', n + '_1']; }
    function repClearTurnCessioni(x, entries) {
        repTurnSlotKeys(x).forEach(k => { if(repData().ces[k] || repHas(repCessioniEdits, k)) entries.push(repChange('repc', k, '')); });
    }
    function repCommitEntries(entries, msg) {
        entries = entries.filter(en => JSON.stringify(en.prev) !== JSON.stringify(en.next));
        if(!entries.length) return false;
        pushUndo({ entries });
        afterCoordChange([], entries.flatMap(en => repDatesOfKey(en.kind, en.key)));
        vibrate();
        if(msg) ccToast(msg);
        return true;
    }
    function repCellCtx(row, col) {
        const d = getDriverByIdx(col);
        return { date: repRowDate(row), orig: d ? d.originalName : String((finalData[0] || [])[col] || ''), name: d ? d.name : '' };
    }
    // Una cella (giorno X, operatore) può appartenere alla reperibilità iniziata il giorno X
    // oppure a quella iniziata il giorno prima, che dura fino alle 13:00 di X.
    function repOwnTurn(date, orig) {
        const R = repData();
        if(R.tit[date] === orig) return date;
        const prev = repDateAdd(date, -1);
        return R.tit[prev] === orig ? prev : null;
    }
    // Reperibilità da aprire nell'editor delle fasce toccando una cella.
    function repTurnForCell(date, orig) {
        const R = repData(), prev = repDateAdd(date, -1), f = R.days[date] || [];
        const own = repOwnTurn(date, orig); if(own) return own;
        if(f[0] === orig || f[1] === orig) return prev;       // copre una fascia della notte/mattina
        if(f[2] === orig || f[3] === orig) return date;
        const now = new Date();                                 // oggi prima delle 13: è in corso quella di ieri
        if(date === ymd(now) && now.getHours() < 13 && R.tit[prev]) return prev;
        return date;
    }
    function repIsLive(x) { const now = new Date(), a = repDateObj(x); a.setHours(13, 0, 0, 0); const b = new Date(a); b.setDate(b.getDate() + 1); return now >= a && now < b; }
    // Tocco su una cella con uno strumento della ruota "Reperibilità".
    function repToolTap(row, col) {
        const c = repCellCtx(row, col); if(!c.date) return;
        const R = repData(); const tit = R.tit[c.date] || ''; const lbl = repDateLabel(c.date, true);
        const entries = [];
        if(coordRepTool === 'add') {
            if(tit === c.orig) { ccToast(`${c.name} è già reperibile ${lbl}.`); return; }
            if(tit) repClearTurnCessioni(c.date, entries);
            entries.push(repChange('rep', c.date, c.orig));
            repCommitEntries(entries, tit ? `Reperibilità di ${lbl}: ${repDisplayName(tit)} → ${c.name}` : `${c.name} reperibile ${lbl} dalle 13:00 per 24 ore`);
        } else if(coordRepTool === 'del') {
            const own = repOwnTurn(c.date, c.orig);
            if(own) { repClearTurnCessioni(own, entries); entries.push(repChange('rep', own, '')); }
            else [0, 1, 2, 3].forEach(s => { const k = c.date + '_' + s; if(R.ces[k] && repToOrig(R.ces[k].newDriver) === c.orig) entries.push(repChange('repc', k, '')); });
            if(!repCommitEntries(entries, `Reperibilità eliminata (${c.name}, ${repDateLabel(c.date)})`)) ccToast(`Qui ${c.name} non ha reperibilità da eliminare.`, true);
        } else if(coordRepTool === 'move') {
            if(!coordRepMoveFirst) {
                const own = repOwnTurn(c.date, c.orig);
                if(!own) { ccToast('Tocca prima una cella di chi è reperibile (verde).', true); return; }
                coordRepMoveFirst = { row, col, date: own, orig: c.orig };
                markSelectedCell(row, col); vibrate(); updateCoordToolbarState();
                return;
            }
            const a = coordRepMoveFirst; coordRepMoveFirst = null; clearSelectedCellVisual(); coordSelectedCell = null;
            if(a.date === c.date && a.orig === c.orig) { updateCoordToolbarState(); return; }
            const destTit = R.tit[c.date] || '';
            repClearTurnCessioni(a.date, entries);
            if(a.date !== c.date) {
                if(destTit) repClearTurnCessioni(c.date, entries);
                // se il giorno di destinazione aveva già un reperibile, i due si scambiano
                entries.push(repChange('rep', a.date, destTit && destTit !== a.orig ? destTit : ''));
            }
            entries.push(repChange('rep', c.date, c.orig));
            const swapTxt = (a.date !== c.date && destTit && destTit !== a.orig) ? ` (scambiata con ${repDisplayName(destTit)})` : '';
            repCommitEntries(entries, `Reperibilità spostata: ${repDisplayName(a.orig)} ${repDateLabel(a.date)} → ${c.name} ${repDateLabel(c.date)}${swapTxt}`);
            updateCoordToolbarState();
        } else if(coordRepTool === 'fasce') {
            const x = repTurnForCell(c.date, c.orig);
            openRepEditPopup(x, x === c.date ? c.orig : null);
        }
    }

    // ── Editor delle 4 fasce ───────────────────────────────────────────────
    let repEditCtx = null;
    function openRepEditPopup(date, origHint) {
        if(!date) return;
        const R = repData(); const n = repDateAdd(date, 1);
        const tit = R.tit[date] || '';
        repEditCtx = { date };
        const opts = (sel, emptyLabel) => `<option value="">${emptyLabel}</option>` + drivers.filter(d => !d.test).map(d => `<option value="${esc(d.originalName)}" ${d.originalName === sel ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
        const slots = [[date, 2], [date, 3], [n, 0], [n, 1]];
        const titSel = tit || origHint || '';
        const live = repIsLive(date);
        let html = `<div class="rep-ed-nav"><button class="cc-btn sm" onclick="repEditShift(-1)"><span class="msym">chevron_left</span>Giorno prima</button>${live ? '<span class="rep-ed-live"><i></i>In corso ora</span>' : '<span></span>'}<button class="cc-btn sm" onclick="repEditShift(1)">Giorno dopo<span class="msym">chevron_right</span></button></div>`;
        html += `<div class="rep-ed-row tit"><label>Titolare<small>reperibile 24 h</small></label><select class="cc-input" id="rep-ed-tit" onchange="repEditTitChanged(this)">${opts(titSel, '— nessuno —')}</select></div>`;
        slots.forEach(([d, s], i) => {
            const who = (R.days[d] || [])[s] || '';
            const cur = who && who !== tit ? who : '';
            html += `<div class="rep-ed-row ${cur ? 'rep-ed-slot-ceduta' : ''}"><label>${REP_SLOTS[s].long}<small>${repDateLabel(d, true)}</small></label><select class="cc-input" id="rep-ed-s${i}" onchange="this.parentNode.classList.toggle('rep-ed-slot-ceduta', !!this.value)">${opts(cur, 'coperta dal titolare')}</select></div>`;
        });
        html += `<p class="rep-ed-note">Scegli un collega in una fascia per cederla: nel calendario il titolare la vede rossa con il nome, chi la copre la vede lampeggiare. Le cessioni inviate dal portale Richieste compaiono già qui. Le modifiche vanno salvate con Salva, come i turni.</p>`;
        document.getElementById('rep-edit-title').textContent = 'Reperibilità ' + repDateLabel(date, true);
        document.getElementById('rep-edit-sub').textContent = `dalle 13:00 di ${repDateLabel(date, true)} alle 13:00 di ${repDateLabel(n, true)}`;
        document.getElementById('rep-edit-body').innerHTML = html;
        const m = document.getElementById('rep-edit-popup'); m.style.display = 'flex';
        requestAnimationFrame(() => m.classList.add('open'));
    }
    function repEditShift(d) { if(repEditCtx) openRepEditPopup(repDateAdd(repEditCtx.date, d)); }
    function repEditTitChanged(sel) {
        // una fascia ceduta proprio al nuovo titolare torna "coperta dal titolare"
        for(let i = 0; i < 4; i++) { const s = document.getElementById('rep-ed-s' + i); if(s && s.value === sel.value) { s.value = ''; s.parentNode.classList.remove('rep-ed-slot-ceduta'); } }
    }
    function closeRepEditPopup(e) {
        if(e && e.target !== e.currentTarget) return;
        const m = document.getElementById('rep-edit-popup'); m.classList.remove('open');
        setTimeout(() => { if(!m.classList.contains('open')) m.style.display = 'none'; }, 150);
        repEditCtx = null;
    }
    function repEditApply() {
        if(!repEditCtx) return;
        const date = repEditCtx.date;
        const tit = document.getElementById('rep-ed-tit').value;
        const keys = repTurnSlotKeys(date);
        const entries = [repChange('rep', date, tit)];
        keys.forEach((k, i) => {
            const v = document.getElementById('rep-ed-s' + i).value;
            const want = (v && v !== tit) ? v : '';
            const R = repData(); const cur = R.ces[k] ? repToOrig(R.ces[k].newDriver) : '';
            if(want !== cur || repHas(repCessioniEdits, k)) entries.push(repChange('repc', k, want));
        });
        closeRepEditPopup();
        if(!repCommitEntries(entries, 'Reperibilità aggiornata')) ccToast('Nessuna modifica.');
    }
    function repEditRemove() {
        if(!repEditCtx) return;
        const date = repEditCtx.date; const entries = [];
        repClearTurnCessioni(date, entries);
        entries.push(repChange('rep', date, ''));
        closeRepEditPopup();
        if(!repCommitEntries(entries, 'Reperibilità eliminata')) ccToast('Questo giorno non ha reperibilità.');
    }
    function repOpenFromShiftPopup() {
        if(!coordEditPopupTarget) return;
        const { row, col } = coordEditPopupTarget; const c = repCellCtx(row, col);
        closeShiftEditPopup();
        const x = repTurnForCell(c.date, c.orig);
        setTimeout(() => openRepEditPopup(x, x === c.date ? c.orig : null), 160);
    }

    // ── Sequenze della ruota (+5, +10, +15, 5 settimane, +7 diurni) ────────────
    async function applyWheelSequence(row, col) {
        const s = WHEEL_SEQUENCES.find(x => x.id === coordSeqTool); if(!s) return;
        let off = 0;
        if(s.pattern === TURNISTI_CYCLE) { off = await seqAskStart(row, col, s); if(off === null) return; }
        const entries = []; let last = row;
        for(let i = 0; i < s.len; i++) {
            const r = row + i; if(!finalData[r] || shiftRowYear(r) !== shiftRowYear(row)) break; // non oltre il cambio d'anno
            const key = cellKey(r, col);
            const next = { v: s.pattern[(i + off) % s.pattern.length], subV: '' };
            const prev = setOverride(key, next);
            entries.push({ key, prev, next }); last = r;
        }
        if(!entries.length) return;
        pushUndo({ entries });
        afterCoordChange(entries.map(en => en.key)); vibrate();
        const d = getDriverByIdx(col);
        ccToast(`${d ? d.name + ': ' : ''}${entries.length} turni inseriti dal ${repDateLabel(repRowDate(row))} al ${repDateLabel(repRowDate(last))}`);
    }

    // ═══ REPORT REPERIBILITÀ (Area Coordinatore) ══════════════════════════
    // Ore di reperibilità per operatore e giorno fisico del mese scelto, per l'ufficio
    // personale: 00-07 = 7 h, 07-13 = 6 h, 13-20 = 7 h, 20-00 = 4 h (24 h per turno).
    let ccRepMonth = new Date().getFullYear() === SHIFT_YEAR ? new Date().getMonth() : 0;
    function ccRepNav(delta) { ccRepMonth = delta === 0 ? (new Date().getFullYear() === SHIFT_YEAR ? new Date().getMonth() : 0) : Math.min(11, Math.max(0, ccRepMonth + delta)); renderCcReperibilita(); }
    // Griglia del mese: una riga per OGNI infermiere (ordine del calendario), una colonna per
    // giorno con le ore di reperibilità fatte in quel giorno, e il totale del mese in fondo.
    function repMonthReport(monthIdx) {
        const R = repData();
        const nDays = new Date(SHIFT_YEAR, monthIdx + 1, 0).getDate();
        const dates = []; for(let d = 1; d <= nDays; d++) dates.push(ymd(new Date(SHIFT_YEAR, monthIdx, d)));
        const per = {};
        const row = o => per[o] = per[o] || { days:{}, total:0, list:{} };
        drivers.forEach(d => { if(!d.test) row(d.originalName); });
        dates.forEach((dt, i) => {
            const f = R.days[dt]; if(!f) return;
            f.forEach((who, s) => {
                if(!who) return;
                const p = row(who), m = REP_SLOTS[s].minutes;
                p.days[i + 1] = (p.days[i + 1] || 0) + m; p.total += m;
                (p.list[dt] = p.list[dt] || []).push(s);
            });
        });
        const order = o => { const k = drivers.findIndex(d => d.originalName === o); return k === -1 ? 9999 : k; };
        const rows = Object.keys(per).sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map(o => Object.assign({ orig:o, name:repDisplayName(o) }, per[o]));
        const title = MONTH_NAMES_IT[monthIdx].charAt(0).toUpperCase() + MONTH_NAMES_IT[monthIdx].slice(1) + ' ' + SHIFT_YEAR;
        return { monthIdx, nDays, dates, rows, title, total: rows.reduce((a, r) => a + r.total, 0) };
    }
    function repHours(min) { const h = min / 60; return Number.isInteger(h) ? String(h) : h.toFixed(1).replace('.', ','); }
    function repListText(p, dt) { return (p.list[dt] || []).slice().sort((a, b) => a - b).map(s => REP_SLOTS[s].label).join(', '); }
    const REP_WD = ['D','L','M','M','G','V','S'];
    function renderCcReperibilita() {
        const main = document.getElementById('cc-main');
        const M = repMonthReport(ccRepMonth);
        const red = dt => repIsFestive(dt) ? 'rr-red' : '';
        const head = M.dates.map((dt, i) => `<th class="rr-day ${red(dt)}">${i + 1}<small>${REP_WD[repDateObj(dt).getDay()]}</small></th>`).join('');
        const body = M.rows.map(r => `<tr><td class="cc-sticky"><div class="cc-opname">${esc(r.name)}</div></td>${M.dates.map((dt, i) => {
            const m = r.days[i + 1] || 0;
            return `<td class="rr-day ${red(dt)} ${m ? 'rr-on' : ''}" ${m ? `title="${esc(repListText(r, dt))}"` : ''}>${m ? repHours(m) : ''}</td>`;
        }).join('')}<td class="r cc-sep-l cc-num rr-total ${r.total ? '' : 'rr-zero'}">${repHours(r.total)}</td></tr>`).join('');
        main.innerHTML = `
            <div class="cc-toolbar">
                <div class="cc-period-nav">
                    <button class="cc-icon-btn" onclick="ccRepNav(-1)" aria-label="Mese precedente"><span class="msym">chevron_left</span></button>
                    <span class="cc-period-label">${esc(M.title)}</span>
                    <button class="cc-icon-btn" onclick="ccRepNav(1)" aria-label="Mese successivo"><span class="msym">chevron_right</span></button>
                </div>
                <button class="cc-btn sm" onclick="ccRepNav(0)">Questo mese</button>
                <div class="cc-spacer"></div>
                <span class="cc-hint">Totale reparto: <b class="cc-num">${repHours(M.total)} h</b></span>
            </div>
            <div class="cc-table-wrap">
                <table class="cc-table rr-table">
                    <thead><tr><th class="cc-sticky">Autista</th>${head}<th class="r cc-sep-l">Totale<small>ore nel mese</small></th></tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
            <div class="cc-legend">
                <span>In ogni casella: ore di reperibilità fatte quel giorno (00-07 = 7 h, 07-13 = 6 h, 13-20 = 7 h, 20-00 = 4 h). Le fasce cedute contano per chi le copre. Colonne rosate = domeniche e festivi.</span>
            </div>`;
        document.getElementById('cc-top-actions').innerHTML = `<button class="cc-btn" onclick="repReportPrint()"><span class="msym">print</span>Stampa</button><button class="cc-btn primary" onclick="repReportPdf()"><span class="msym">picture_as_pdf</span>Scarica PDF</button>`;
    }
    // Documento stampabile, isolato dalla pagina (A4 orizzontale).
    function repReportHtml(M) {
        const f = dt => repIsFestive(dt) ? 'f' : '';
        const th = M.dates.map((dt, i) => `<th class="${f(dt)}">${i + 1}<br><small>${REP_WD[repDateObj(dt).getDay()]}</small></th>`).join('');
        const rows = M.rows.map(r => `<tr><td class="n">${esc(r.name)}</td>${M.dates.map((dt, i) => { const m = r.days[i + 1] || 0; return `<td class="${f(dt)} ${m ? 'on' : ''}">${m ? repHours(m) : ''}</td>`; }).join('')}<td class="t">${repHours(r.total)}</td></tr>`).join('');
        return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Reperibilità autisti — ${esc(M.title)}</title><style>
            @page { size:A4 landscape; margin:10mm; }
            * { box-sizing:border-box; } body { font:10px/1.3 Arial, Helvetica, sans-serif; color:#111; margin:0; }
            h1 { font-size:16px; margin:0 0 2px; } .sub { color:#555; margin:0 0 10px; }
            table { border-collapse:collapse; width:100%; } th, td { border:1px solid #bbb; padding:4px 2px; text-align:center; }
            th { background:#eef1f5; font-size:9px; } th small { font-weight:normal; color:#666; }
            td.n { text-align:left; font-weight:bold; white-space:nowrap; padding:4px 6px; } td.t { font-weight:bold; background:#eef1f5; font-size:11px; }
            .f { background:#fdecec; } td.on { font-weight:bold; background:#dcfce7; }
            .legend { margin:8px 0 0; color:#555; }
            .firma { margin-top:28px; display:flex; justify-content:space-between; } .firma div { width:40%; border-top:1px solid #333; padding-top:4px; text-align:center; }
        </style></head><body>
            <h1>Reperibilità autisti — ${esc(M.title)}</h1>
            <p class="sub">Ore di reperibilità per giorno · totale reparto ${repHours(M.total)} h · generato il ${new Date().toLocaleString('it-IT')}</p>
            <table><thead><tr><th>Autista</th>${th}<th>Totale ore</th></tr></thead><tbody>${rows}</tbody></table>
            <p class="legend">00-07 = 7 h · 07-13 = 6 h · 13-20 = 7 h · 20-00 = 4 h. Ore attribuite al giorno in cui cadono. Colonne rosate = domeniche e festivi.</p>
            <div class="firma"><div>Il coordinatore</div><div>Ufficio personale</div></div>
        </body></html>`;
    }
    function repReportPrint() {
        const M = repMonthReport(ccRepMonth);
        const old = document.getElementById('rep-print-frame'); if(old) old.remove();
        const fr = document.createElement('iframe');
        fr.id = 'rep-print-frame'; fr.setAttribute('aria-hidden', 'true');
        fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
        document.body.appendChild(fr);
        const doc = fr.contentWindow.document; doc.open(); doc.write(repReportHtml(M)); doc.close();
        setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch(e) { ccToast('Stampa non riuscita.', true); } }, 250);
    }
    function repLoadScript(src) {
        return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Impossibile caricare ' + src)); document.head.appendChild(s); });
    }
    async function repEnsurePdfLib() {
        if(!(window.jspdf && window.jspdf.jsPDF)) await repLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        if(!window.jspdf.jsPDF.API.autoTable) await repLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
        return window.jspdf.jsPDF;
    }
    // Costruisce il PDF del mese (restituisce il documento jsPDF, senza scaricarlo).
    async function repBuildPdf(monthIdx) {
        const jsPDF = await repEnsurePdfLib();
        const M = repMonthReport(monthIdx);
        const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
        const W = doc.internal.pageSize.getWidth();
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
        doc.text(`Reperibilità autisti - ${M.title}`, 10, 13);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
        doc.text(`Ore di reperibilità per giorno - totale reparto ${repHours(M.total)} h - generato il ${new Date().toLocaleString('it-IT')}`, 10, 18.5);
        doc.setTextColor(0);
        const fest = M.dates.map(repIsFestive);
        const head = [['Autista', ...M.dates.map((dt, i) => `${i + 1}\n${REP_WD[repDateObj(dt).getDay()]}`), 'Totale']];
        const body = M.rows.map(r => [r.name, ...M.dates.map((dt, i) => r.days[i + 1] ? repHours(r.days[i + 1]) : ''), repHours(r.total)]);
        doc.autoTable({
            head, body, startY:22, margin:{ left:10, right:10 }, theme:'grid',
            styles:{ fontSize:7.5, cellPadding:1.2, halign:'center', valign:'middle', lineColor:[190, 190, 190], lineWidth:0.1 },
            headStyles:{ fillColor:[232, 236, 242], textColor:20, fontStyle:'bold', fontSize:6.5 },
            columnStyles:{ 0:{ halign:'left', fontStyle:'bold', cellWidth:30 }, [M.nDays + 1]:{ fontStyle:'bold', fillColor:[232, 236, 242], cellWidth:14 } },
            didParseCell: data => {
                const c = data.column.index;
                if(c < 1 || c > M.nDays) return;
                if(data.section === 'head') { if(fest[c - 1]) data.cell.styles.textColor = [200, 30, 30]; return; }
                if(data.cell.raw) { data.cell.styles.fillColor = [220, 252, 231]; data.cell.styles.fontStyle = 'bold'; }
                else if(fest[c - 1]) data.cell.styles.fillColor = [253, 234, 234];
            }
        });
        let y = doc.lastAutoTable.finalY + 5;
        doc.setFontSize(8); doc.setTextColor(90);
        doc.text('00-07 = 7 h, 07-13 = 6 h, 13-20 = 7 h, 20-00 = 4 h. Ore attribuite al giorno in cui cadono. Colonne rosate = domeniche e festivi.', 10, y);
        doc.setTextColor(0);
        y += 20;
        if(y > doc.internal.pageSize.getHeight() - 12) { doc.addPage(); y = 30; }
        doc.setFontSize(9);
        doc.line(20, y, 110, y); doc.line(W - 110, y, W - 20, y);
        doc.text('Il coordinatore', 65, y + 5, { align:'center' }); doc.text('Ufficio personale', W - 65, y + 5, { align:'center' });
        return { doc, M };
    }
    async function repReportPdf() {
        try {
            ccToast('Preparo il PDF…');
            const { doc, M } = await repBuildPdf(ccRepMonth);
            doc.save(`reperibilita-autisti-${MONTH_NAMES_IT[M.monthIdx]}-${SHIFT_YEAR}.pdf`);
            ccToast('PDF scaricato');
        } catch(e) { console.error(e); ccToast('PDF non creato: controlla la connessione.', true); }
    }

    // ═══ SALDO ORE ACCANTO AI NOMI (modalità modifica) ════════════════════
    // Il selettore nella cella "DATA" sceglie il periodo; settimana e mese seguono il giorno
    // in cima al calendario mentre si scorre, l'anno è il saldo da gennaio a oggi.
    const TH_PERIODS = {
        settimana: { short:'SETT', label:'Saldo della settimana visualizzata' },
        mese:      { short:'MESE', label:'Saldo del mese visualizzato' },
        anno:      { short:'ANNO', label:'Saldo da gennaio a oggi' }
    };
    let thBalPeriod = (() => { try { const p = localStorage.getItem('th_bal_period'); return TH_PERIODS[p] ? p : 'mese'; } catch(e) { return 'mese'; } })();
    let thViewIso = null, thRenderedKey = null;
    function thViewDate() {
        const d = thViewIso ? repDateObj(thViewIso) : new Date();
        return d.getFullYear() === SHIFT_YEAR ? d : (d.getFullYear() > SHIFT_YEAR ? new Date(SHIFT_YEAR, 11, 31) : new Date(SHIFT_YEAR, 0, 1));
    }
    function thPeriodKey() {
        const d = thViewDate();
        if(thBalPeriod === 'mese') return 'm' + d.getMonth();
        if(thBalPeriod === 'settimana') return 'w' + ymd(getWeekRange(d).start);
        return 'a';
    }
    function thPeriodContext() {
        const d = thViewDate();
        if(thBalPeriod === 'mese') return MONTH_NAMES_IT[d.getMonth()].slice(0, 3);
        if(thBalPeriod === 'settimana') return 'sett. ' + getISOWeek(d);
        return 'ad oggi';
    }
    function thPeriodDays() {
        if(thBalPeriod === 'anno') return null;
        const d = thViewDate(), days = buildDaysIndex();
        if(thBalPeriod === 'mese') return days.filter(dd => dd.monthIdx === d.getMonth());
        const { start, end } = getWeekRange(d);
        return days.filter(dd => dd.date >= start && dd.date <= end);
    }
    function thBalance(driverIdx, periodDays) {
        if(!periodDays) return computeDriverBalance(driverIdx);
        const worked = periodDays.reduce((s, dd) => s + computeDayInfo(dd.rowIdx, driverIdx).minutes, 0);
        return worked - contractMinutesFor(getContractHours(driverIdx), periodDays.map(dd => dd.date), driverIdx);
    }
    function thSetPeriod(p) {
        thBalPeriod = p; try { localStorage.setItem('th_bal_period', p); } catch(e) {}
        thClosePeriodMenu(); vibrate(); thSyncViewDate(true);
    }
    function thTogglePeriodMenu(btn) {
        let m = document.getElementById('th-period-menu');
        if(m && m.classList.contains('open')) { thClosePeriodMenu(); return; }
        if(!m) { m = document.createElement('div'); m.id = 'th-period-menu'; m.onclick = e => e.stopPropagation(); document.body.appendChild(m); }
        const ctx = { settimana:'la settimana che stai guardando', mese:'il mese che stai guardando', anno:'da gennaio a oggi' };
        m.innerHTML = `<div class="thp-title">Saldo ore accanto ai nomi</div>` + Object.keys(TH_PERIODS).map(k =>
            `<button class="${k === thBalPeriod ? 'on' : ''}" onclick="thSetPeriod('${k}')"><span class="material-icons-round">${k === thBalPeriod ? 'radio_button_checked' : 'radio_button_unchecked'}</span><span><b>${{ settimana:'Settimanale', mese:'Mensile', anno:'Annuale' }[k]}</b><small>${ctx[k]}</small></span></button>`).join('');
        const r = btn.getBoundingClientRect();
        m.style.left = Math.max(8, r.left) + 'px'; m.style.top = (r.bottom + 6) + 'px';
        m.classList.add('open');
    }
    function thClosePeriodMenu() { const m = document.getElementById('th-period-menu'); if(m) m.classList.remove('open'); }
    document.addEventListener('click', thClosePeriodMenu);
    // Giorno in cima al calendario (sotto intestazioni e barra del mese).
    function thSyncViewDate(force) {
        if(!coordEditModeActive) return;
        const head = document.querySelector('header'), thead = document.getElementById('table-head');
        // sotto le intestazioni fisse ci sono le barre dei mesi (sticky, impilate): si scende
        // finché si trova la prima riga di un giorno
        const y0 = (head ? head.getBoundingClientRect().bottom : 60) + (thead ? thead.offsetHeight : 40) + 8;
        let tr = null;
        for(let y = y0; y < Math.min(y0 + 200, window.innerHeight - 5) && !tr; y += 12) {
            const hit = document.elementsFromPoint(20, y).find(e => e.closest && e.closest('tr[data-row]'));
            if(hit) tr = hit.closest('tr[data-row]');
        }
        if(tr) thViewIso = repRowDate(+tr.dataset.row) || thViewIso;
        if(force || thPeriodKey() !== thRenderedKey) renderTableHead();
    }
    let thScrollTimer = null;
    window.addEventListener('scroll', () => {
        if(!coordEditModeActive || thBalPeriod === 'anno' || thScrollTimer) return;
        thScrollTimer = setTimeout(() => { thScrollTimer = null; thSyncViewDate(); }, 150);
    }, { passive:true });

    // ── renderTable ───────────────────────────────────────────────────────────
    // Costruita fuori dal DOM (DocumentFragment) e in un solo inserimento: prima i
    // mesi venivano aggiunti con tbody.innerHTML += che ricreava l'intera tabella
    // dodici volte. Le modifiche del coordinatore ridisegnano solo le righe toccate.
    const RT_WEEKDAY_FMT = new Intl.DateTimeFormat('it-IT', { weekday:'short' });
    let rtCols = [];
    let rtMeIdx = null;
    let focusCols = [];   // colonne in evidenza (indici operatore), solo su questo schermo
    // colonna TEST: la vede solo chi è entrato come TEST (nessun altro, nemmeno il coordinatore)
    function testColVisible() { return userIdentity === TEST_OP; }
    function rtVisibleCols() {
        const visibleDrivers = drivers.filter(d => !d.hidden);
        let list = (selectedDrivers.size === 0) ? visibleDrivers : visibleDrivers.filter(d => selectedDrivers.has(d.idx));
        const td = testColVisible() && drivers.find(d => d.test);
        // da TEST si vede per prima; in Modifica turni da TEST resta solo la sua colonna, così le prove non toccano i colleghi
        if(td) list = coordEditModeActive ? [td] : [td].concat(list);
        const me = prefMe(); rtMeIdx = me ? me.idx : null;
        // preferenza "la mia colonna per prima" (non in modifica turni: lì resta l'ordine vero)
        if(me && prefs.myColFirst && !coordEditModeActive && list.includes(me)) list = [me].concat(list.filter(d => d !== me));
        // colonne messe in evidenza toccando i nomi: affiancate per prime, nell'ordine in cui si toccano
        focusCols = focusCols.filter(i => list.some(d => d.idx === i));
        if(focusCols.length) list = focusCols.map(i => list.find(d => d.idx === i)).concat(list.filter(d => !focusCols.includes(d.idx)));
        return list;
    }
    // Tocco su un nome dell'intestazione: aggiunge o toglie la colonna da quelle in evidenza.
    function colFocusCls(idx) {
        if(!focusCols.length) return '';
        const k = focusCols.indexOf(idx);
        return k < 0 ? 'col-dim' : (k === focusCols.length - 1 ? 'col-focus col-focus-end' : 'col-focus');
    }
    function toggleColFocus(idx) {
        const k = focusCols.indexOf(idx);
        if(k < 0) focusCols.push(idx); else focusCols.splice(k, 1);
        renderTable(); vibrate();
        if(k < 0) {   // le colonne in evidenza sono le prime: si torna all'inizio a sinistra
            if(focusCols.length === 1) ccToast('Tocca altri nomi per affiancarli · di nuovo per toglierli · DATA per vederli tutti');
            let el = document.getElementById('main-table');
            for(; el; el = el.parentElement) if(el.scrollLeft) el.scrollLeft = 0;
            if(window.scrollX) window.scrollTo(0, window.scrollY);
        }
    }
    function clearColFocus() { if(!focusCols.length) return; focusCols = []; renderTable(); }
    document.addEventListener('click', e => {
        const th = e.target.closest && e.target.closest('#table-head th');
        if(!th || e.target.closest('button, a, input, select, .th-ai-badge')) return;
        if(th.dataset.col !== undefined) toggleColFocus(+th.dataset.col);
        else if(focusCols.length) clearColFocus();
    });
    function renderTableHead() {
        const thead = document.getElementById('table-head'); if(!thead) return;
        const frag = document.createDocumentFragment();
        let thD = document.createElement('th');
        const periodDays = coordEditModeActive ? thPeriodDays() : null;
        const sumCtx = coordEditModeActive && edSumOpen ? edSumCtx() : null;   // resoconto per persona
        if(coordEditModeActive) {
            const P = TH_PERIODS[thBalPeriod];
            thD.className = 'th-period-cell';
            thD.innerHTML = `<button class="th-period-btn" onclick="event.stopPropagation();thTogglePeriodMenu(this)" title="Saldo ore: ${esc(P.label)} (tocca per cambiare)"><span class="th-period-top">${esc(P.short)}<span class="material-icons-round">arrow_drop_down</span></span><small>${esc(thPeriodContext())}</small></button>`;
            thRenderedKey = thPeriodKey();
        } else if(focusCols.length) { thD.className = 'th-focus-clear'; thD.title = 'Mostra di nuovo tutte le colonne'; thD.innerHTML = 'DATA<br><span class="material-icons-round" style="font-size:16px">close</span>'; }
        else thD.innerText = "DATA";
        frag.appendChild(thD);
        const shortNm = calCompactOn() ? compactNames(rtCols) : null;   // vista compatta: nomi accorciati senza ambiguità
        rtCols.forEach(d => {
            let th = document.createElement('th'); th.innerText = shortNm ? shortNm[d.idx] : d.name; if(shortNm) th.dataset.full = d.name; if(d.idx === rtMeIdx) th.classList.add('me-col');
            th.dataset.col = d.idx; const fc = colFocusCls(d.idx); if(fc) th.className += ' ' + fc;
            th.title = focusCols.includes(d.idx) ? 'Tocca per togliere dall\'evidenza' : 'Tocca per mettere in evidenza';
            if(coordEditModeActive) {
                let delta = thBalance(d.idx, periodDays);
                let bEl = document.createElement('div');
                bEl.className = 'th-balance ' + (delta>=0?'pos':'neg');
                bEl.innerText = (delta>=0?'+':'') + formatHM(delta);
                bEl.title = `${TH_PERIODS[thBalPeriod].label}: ore lavorate meno ore da contratto`;
                th.appendChild(bEl);
                if(sumCtx) th.insertAdjacentHTML('beforeend', edSumHtml(d, sumCtx));
            }
            if(aiAdviceEnabled) {
                let advice = getAdviceForDriver(d.idx);
                if(advice) {
                    let icon = document.createElement('div');
                    icon.className = 'th-ai-badge ' + advice.type;
                    icon.innerHTML = '<span class="material-icons-round">smart_toy</span>';
                    icon.title = advice.title;
                    icon.onclick = (ev) => { ev.stopPropagation(); openAiAdvicePopup(d.idx); };
                    th.appendChild(icon);
                }
            }
            frag.appendChild(th);
        });
        thead.innerHTML = ""; thead.appendChild(frag);
        thFitHeight();
    }
    // Nomi corti per la vista compatta: cognome tagliato alla lunghezza minima (almeno 4 lettere)
    // che lo distingue dagli altri; con lo stesso inizio si aggiunge l'iniziale della parola dopo.
    function compactNames(cols) {
        const out = {}, words = cols.map(d => String(d.name || '').trim().split(/\s+/));
        cols.forEach((d, i) => {
            const w = words[i][0] || '';
            let n = Math.min(4, w.length);
            const clash = k => cols.some((o, j) => j !== i && (words[j][0] || '').slice(0, k) === w.slice(0, k));
            while(n < w.length && clash(n)) n++;
            let lbl = n < w.length ? w.slice(0, n) + '.' : w;
            if(n >= w.length && clash(w.length) && words[i][1]) lbl = w + ' ' + words[i][1].charAt(0) + '.';
            out[d.idx] = lbl;
        });
        return out;
    }
    function buildDayRow(i, today) {
        const year = shiftRowYear(i);
        let row = finalData[i]; let mName = row[0].v; let dNum = parseInt(row[1].v);
        let tr = document.createElement('tr'); tr.dataset.row = i;
        let mIdx = MONTH_MAP[mName]; let dateObj = new Date(year, mIdx, dNum);
        let dayWeek = RT_WEEKDAY_FMT.format(dateObj).toUpperCase(); let dayIdx = dateObj.getDay();
        let holKey = `${mIdx}-${dNum}`; let holidayName = HOLIDAYS[holKey]; let isRed = (dayIdx===0||dayIdx===6||holidayName);
        let dateClass = isRed ? "td-date date-red" : "td-date";
        if(mIdx === today.getMonth() && dNum === today.getDate() && today.getFullYear() === year) { tr.className = "today"; tr.id = "today-row"; }
        if(dayIdx === 0) tr.classList.add('week-end');   // linea che separa le settimane

        // conta M e P per il riepilogo giornaliero (sempre visibile) e per "Graziella"
        let countM = 0, countP = 0, countN = 0;
        drivers.forEach(d => {
            if(d.test) return;
            let v = (row[d.idx]?.v || "").toString().trim();
            if(isRepStr(v)) { let si = v.indexOf('/'); if(si !== -1) v = v.substring(0, si).trim(); }
            let u = v.toUpperCase().replace(/\s+/g,'');
            if(u === "M" || u === "M+N" || u === "MN") countM++;
            if(u === "P") countP++;
        });
        // notte contata sul turno effettivo: chi ha la notte con un'assenza sotto (es. permesso) non c'è
        drivers.forEach(d => { if(d.hidden) return; const c = computeDayInfo(i, d.idx).code; if(c === 'N' || c === 'M+N') countN++; });
        // notte: il numero compare solo quando manca l'autista di notte (es. N0 = nessuno su 1)
        const nightBadge = countN < NIGHT_STAFF_MIN() && (countM + countP + countN) > 0
            ? `<span class="dsc-n" title="Autisti di notte: ${countN} su ${NIGHT_STAFF_MIN()}">N<b>${countN}</b></span>` : '';
        let hasGraziellaM = countM === 1, hasGraziellaP = countP === 1;   // autisti: il cane quando c'è una sola ambulanza
        const cover = coordEditModeActive ? dayTurnistiCover(i) : null;   // ambulanze minime per turno: bordo arancio o lampeggio rosso

        // Solo mattina/pomeriggio nella colonna data: se uno dei due arriva a 3
        // lampeggia in rosso come avviso. La notte non viene più mostrata qui.
        // autisti: rosso quando mattina o pomeriggio restano con una sola ambulanza
        const mClass = countM <= 1 ? 'dsc-m dsc-alert-3' : 'dsc-m';
        const pClass = countP <= 1 ? 'dsc-p dsc-alert-3' : 'dsc-p';
        const chk = coordEditModeActive ? dayChecks().rows[i] : null;
        if(chk && chk.day.length) dateClass += ' chk-warn';
        let html = `<td class="${dateClass}"${chk && chk.day.length ? ` title="${esc(chk.day.join(' \u00b7 '))}"` : ''}>${dNum}<small>${dayWeek}</small>${holidayName?`<div class="holiday-name">${holidayName}</div>`:""}<div class="day-staff-counts"><span class="${mClass}" title="Operatori mattina">M<b>${countM}</b></span><span class="${pClass}" title="Operatori pomeriggio">P<b>${countP}</b></span>${nightBadge}</div></td>`;

        let prevRow = finalData[i-1];
        const isoDate = ymd(dateObj); fmtDateCtx = isoDate;
        rtCols.forEach(d => {
            let cellInfo = row[d.idx] || { v:"", subV:"" };
            let prevCellInfo = prevRow ? prevRow[d.idx] : null;
            let v = (cellInfo.v || "").toString().trim();
            if(isRepStr(v)) { let si = v.indexOf('/'); if(si !== -1) v = v.substring(0, si).trim(); }
            let uVal = v.toUpperCase();
            let showGraziella = (uVal==="M" && hasGraziellaM) || (uVal==="P" && hasGraziellaP);
            let rawVal = (cellInfo.v || "").toString().trim();
            const orig = String(d.originalName || d.name).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
            const click = `handleCellClick(${i},${d.idx},'${mName}',${dNum},'${dayWeek}','${rawVal.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')`.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
            const sel = coordEditModeActive && coordSelectedCell && coordSelectedCell.row === i && coordSelectedCell.col === d.idx;
            const tdCls = [sel ? 'coord-selected' : '', d.idx === rtMeIdx ? 'me-col' : '', cover ? cover.cls[d.idx] || '' : '', colFocusCls(d.idx)].filter(Boolean).join(' ');
            html += `<td${tdCls ? ` class="${tdCls}"` : ''} data-row="${i}" data-col="${d.idx}" data-month="${mName}" data-day="${dNum}" data-orig="${orig}" onclick="${click}">${noteFlagHtml(isoDate, d.idx)}${chk && chk.cells[d.idx] ? `<span class="chk-flag ${chk.cells[d.idx].err ? 'err' : ''}" title="${esc(chk.cells[d.idx].msgs.join(' \u00b7 '))}">!</span>` : ''}${calCompactOn() ? miniCellHtml(formatCell(cellInfo, prevCellInfo, false, repCellHtml(d.originalName || d.name, isoDate))) : formatCell(cellInfo, prevCellInfo, showGraziella, repCellHtml(d.originalName || d.name, isoDate))}</td>`;
        });
        tr.innerHTML = html;
        return tr;
    }
    function renderTable() {
        dayChecksCache = null;
        const tbody = document.getElementById('table-body');
        rtCols = rtVisibleCols();
        rtDeferHeadFit = true; try { renderTableHead(); } finally { rtDeferHeadFit = false; }
        const frag = document.createDocumentFragment();
        const today = new Date(), blocks = monthBlocks(), lite = liteOn();
        if(lite) liteCheckRange();
        globalMonthsList = blocks.map(b => ({ name: b.name + (shiftRowYear(b.start) !== SHIFT_YEAR ? ' ' + shiftRowYear(b.start) : ''), id: 'm-' + b.start, row: b.start }));
        if(lite && liteFrom > 0) frag.appendChild(liteMoreRow(-1, blocks[liteFrom - 1].name));
        blocks.forEach((b, bi) => {
            if(lite && (bi < liteFrom || bi > liteTo)) return;   // modalità leggera: solo i mesi della finestra
            let mh = document.createElement('tr'); mh.className = 'month-header'; mh.id = 'm-' + b.start;
            mh.innerHTML = `<td colspan="${rtCols.length+1}"><div class="sticky-month-text"><span class="month-label">${b.name} ${shiftRowYear(b.start)}</span><span class="live-clock"></span><span class="rep-now-pill"></span></div></td>`;
            frag.appendChild(mh);
            for(let i = b.start; i <= b.end; i++) frag.appendChild(buildDayRow(i, today));
        });
        if(lite && liteTo < blocks.length - 1) frag.appendChild(liteMoreRow(1, blocks[liteTo + 1].name));
        tbody.innerHTML = ""; tbody.appendChild(frag);
        updateRepNowPill();
        // l'intestazione si rimisura solo se è cambiata (nomi, resoconto, larghezza): misurarla obbliga a reimpaginare la tabella
        const thead = document.getElementById('table-head'), thSig = thead ? thead.innerHTML.length + ':' + twVP.w + ':' + document.body.className : '';
        // intestazione e caselle si misurano insieme: un solo ricalcolo dell'impaginazione
        if(thSig !== thFitSig) { document.documentElement.style.setProperty('--th-h', '40px'); fitCalendarCells(null, thead); thFitSig = thSig; }
        else fitCalendarCells();
        liteObserve();
        asRefreshMarks();
        if(calOverview) renderOverviewSoon();
        ddSync();
        tmSoon();
    }
