    // ═══ MODIFICA SUL CALENDARIO ══════════════════════════════════════════
    function cellKey(row, col) {
        let d = getDriverByIdx(col); let orig = d ? (d.originalName||d.name) : String(finalData[0][col]);
        let mName = finalData[row][0].v; let dNum = finalData[row][1].v;
        return overrideKey(orig, mName, dNum, shiftRowYear(row));
    }
    function setOverride(key, value) {
        let prev = manualOverrides[key] !== undefined ? Object.assign({}, manualOverrides[key]) : null;
        // C.O. dell'anno dopo messo a gennaio-marzo (dalle ferie desiderate): finché resta C.O. si tiene l'anno
        if(value && prev && prev.coY && value.coY === undefined && String(value.subV || '').trim().toLowerCase() === 'f') value = Object.assign({}, value, { coY: prev.coY });
        if(value === null || value === undefined) delete manualOverrides[key]; else manualOverrides[key] = value;
        return prev;
    }
    function pendingChangesCount() {
        const keys = new Set([...Object.keys(manualOverrides), ...Object.keys(coordEditBaseline || {})]);
        let n = 0; keys.forEach(k => { if(JSON.stringify(manualOverrides[k] || null) !== JSON.stringify((coordEditBaseline || {})[k] || null)) n++; });
        return n + repPendingCount();
    }
    // Aggiorna solo le celle toccate: ricalcola il valore dal dato Excel + modifica
    // e ridisegna le righe interessate, invece di ricostruire tutto il calendario.
    function applyOverrideAt(row, col, key) {
        if(!finalData[row] || !rawFinalData[row]) return false;
        const raw = rawFinalData[row][col];
        const base = raw ? JSON.parse(JSON.stringify(raw)) : { v:"", subV:"" };
        const ov = manualOverrides[key || cellKey(row, col)];
        finalData[row][col] = normalizeWrittenAbsence(ov ? Object.assign({}, base, { v: ov.v, subV: ov.subV || "", overridden:true, customMinutes: ov.customMinutes, perm: ov.perm, coY: ov.coY }) : base);
        return true;
    }
    function coordKeyIndex() {
        const m = new Map();
        for(let r = 1; r < finalData.length; r++) drivers.forEach(d => m.set(cellKey(r, d.idx), { row:r, col:d.idx }));
        return m;
    }
    let ccNavCountTimer = null;
    function scheduleNavCounts() { clearTimeout(ccNavCountTimer); ccNavCountTimer = setTimeout(ccUpdateNavCounts, 400); }
    // keys = celle di manualOverrides toccate; repDates = giorni (YYYY-MM-DD) le cui
    // reperibilità sono cambiate: si ridisegnano solo quelle righe (e il giorno dopo).
    function afterCoordChange(keys, repDates) {
        pnRepEditCheck(keys, repDates); // reperibile in permesso notte: finestra subito
        edAlertCheck(keys, repDates);   // vignetta degli avvisi
        serviceSpanVer++;
        let done = false;
        if(repDates && repDates.length) repInvalidate();
        if(((keys && keys.length) || (repDates && repDates.length)) && finalData.length === rawFinalData.length) {
            const rows = new Set(); let miss = false;
            if(keys && keys.length) {
                const idx = coordKeyIndex();
                keys.forEach(k => { const p = idx.get(k); if(!p || !applyOverrideAt(p.row, p.col, k)) miss = true; else rows.add(p.row); });
            }
            (repDates || []).forEach(d => { const r = repRowOfDate(d); if(r) rows.add(r); });
            if(!miss) { if(rows.size) renderTableRows(rows); scheduleTableHeadRefresh(); done = true; }
        }
        if(!done) { applyManualOverrides(); renderTable(); }
        if(repDates && repDates.length) updateRepNowPill();
        updateCoordToolbarState(); scheduleNavCounts(); draftSaveSoon();
    }
    function pushUndo(action) { coordUndoStack.push(action); coordRedoStack = []; updateCoordToolbarState(); }
    // Le voci di annullamento con kind 'rep' (titolare) o 'repc' (cessione di una fascia)
    // riguardano le reperibilità; le altre sono celle del calendario (manualOverrides).
    function applyUndoEntries(entries, useNext) {
        const repDates = [];
        entries.forEach(en => {
            const val = useNext ? en.next : en.prev;
            if(en.kind === 'rep' || en.kind === 'repc') { repSetEdit(en.kind, en.key, val); repDates.push(...repDatesOfKey(en.kind, en.key)); }
            else setOverride(en.key, val);
        });
        afterCoordChange(entries.filter(en => !en.kind).map(en => en.key), repDates);
    }
    function coordUndo() { if(!coordUndoStack.length) return; vibrate(); let a = coordUndoStack.pop(); coordRedoStack.push(a); applyUndoEntries(a.entries, false); }
    function coordRedo() { if(!coordRedoStack.length) return; vibrate(); let a = coordRedoStack.pop(); coordUndoStack.push(a); applyUndoEntries(a.entries, true); }

    function performCoordSwap(a, b) {
        let keyA = cellKey(a.row, a.col), keyB = cellKey(b.row, b.col);
        let cellA = finalData[a.row][a.col] || {}, cellB = finalData[b.row][b.col] || {};
        let valA = { v: cellA.v||"", subV: cellA.subV||"", customMinutes: cellA.customMinutes };
        let valB = { v: cellB.v||"", subV: cellB.subV||"", customMinutes: cellB.customMinutes };
        if(valA.customMinutes === undefined) delete valA.customMinutes;
        if(valB.customMinutes === undefined) delete valB.customMinutes;
        if(cellA.perm) valA.perm = cellA.perm; if(cellB.perm) valB.perm = cellB.perm;
        if(+cellA.coY) valA.coY = +cellA.coY; if(+cellB.coY) valB.coY = +cellB.coY;   // il C.O. 2027 (ferie desiderate) resta tale anche spostato
        const done = absApplyChecked([{ key: keyA, next: valB, row: a.row, col: a.col }, { key: keyB, next: valA, row: b.row, col: b.col }]);
        if(!done) return;
        pushUndo({ entries: done.map(x => ({ key: x.key, prev: x.prev, next: x.next })) });
        afterCoordChange([keyA, keyB]); vibrate();
    }
    function performCoordFill(source, dest) {
        let lo = Math.min(source.row, dest.row), hi = Math.max(source.row, dest.row);
        let cellSrc = finalData[source.row][source.col] || {};
        let valSrc = { v: cellSrc.v||"", subV: cellSrc.subV||"" };
        if(cellSrc.customMinutes !== undefined) valSrc.customMinutes = cellSrc.customMinutes;
        if(cellSrc.perm) valSrc.perm = cellSrc.perm;
        let list = [];
        for(let r=lo; r<=hi; r++) {
            if(!finalData[r]) continue;
            list.push({ key: cellKey(r, source.col), next: valSrc, row: r, col: source.col });
        }
        const done = absApplyChecked(list); if(!done) return;
        let entries = done.map(x => ({ key: x.key, prev: x.prev, next: x.next }));
        pushUndo({ entries });
        afterCoordChange(entries.map(en => en.key)); vibrate();
    }

    function enterCoordEdit() {
        if(isViewingArchive()) { ccToast(`Il ${SHIFT_YEAR} è archiviato: si può solo consultare. Torna al ${activeYear} per modificare.`, true); return; }
        closeCoordConsole();
        if(!coordEditModeActive) toggleCoordEditMode(true);
        setTimeout(() => { scrollToToday(); }, 200);
    }
    async function exitCoordEdit(silent) {
        const n = pendingChangesCount();
        if(n) {
            const choice = await ccDialog(`Hai ${n} ${n===1?'modifica non salvata':'modifiche non salvate'}`, 'Salvale per renderle visibili a tutti, oppure scartale per tornare alla versione salvata.', [
                { label:'Continua a modificare', kind:'ghost', value:null },
                { label:'Scarta', kind:'danger', value:'discard' },
                { label:'Salva ed esci', kind:'primary', value:'save' }
            ]);
            if(!choice) return false;
            if(choice === 'save') { const ok = await coordConfirmChanges(true); if(!ok) return false; silent = true; }
            else { manualOverrides = JSON.parse(JSON.stringify(coordEditBaseline)); repDiscardEdits(); coordUndoStack = []; coordRedoStack = []; draftClear(); applyManualOverrides(); renderTable(); }
        }
        toggleCoordEditMode(false);
        if(!silent) ccToast('Modalità modifica chiusa');
        return true;
    }
    function toggleCoordEditMode(active) {
        if(active && calOverview) setCalView('dettaglio');
        coordEditModeActive = active;
        calCompactUi(); edSumUi(); edHdrUi(); edAlertsUi(); edNotesUi(); if(!active) { edAlertHide(); if(edNotesOpen) edNotesToggle(false); const m = document.getElementById('ed-sum-menu'); if(m) m.remove(); }
        document.body.classList.toggle('coord-edit-mode', active);
        document.getElementById('coord-edit-strip').classList.toggle('show', active);
        document.getElementById('tool-wheel').classList.toggle('show', active);
        if(active) {
            if(!coordUndoStack.length && !pendingChangesCount()) coordEditBaseline = JSON.parse(JSON.stringify(manualOverrides));
            setTimeout(draftOfferRestore, 400);
            attachCellEditHandlers();
            setCoordTool('select', null, null, true);
            twExpanded = true; twRender(); requestAnimationFrame(twPlace);   // posizione al prossimo disegno, insieme al resto
        } else {
            coordPaintTool = null; coordSwapMode = false; coordSwapFirst = null;
            coordSeqTool = null; coordRepTool = null; coordRepMoveFirst = null;
            document.body.classList.remove('paint-active', 'swap-active', 'select-active');
            detachCellEditHandlers();
        }
        if(finalData.length) renderTable();   // ridisegno completo: in modifica compaiono gli avvisi di copertura e regole
        if(!active) clearTimeout(rtHeadTimer);
        updateCoordToolbarState(); ccUpdateNavCounts();
    }
    function currentToolInfo() {
        if(coordPaintTool && coordPaintTool.clear) return { key:'erase', name:'Gomma', hint:'tocca o trascina sulle celle per svuotarle' };
        if(coordPaintTool) {
            const it = wheelPaletteItems().find(p => p.v === (coordPaintTool.v||'') && p.subV === (coordPaintTool.subV||''));
            return { key:'paint', item: it, name: it ? it.label : 'Turno', hint:'tocca o trascina sulle celle per applicarlo' };
        }
        if(coordSwapMode) return { key:'swap', name:'Scambia', hint: coordSwapFirst ? 'ora tocca la seconda cella' : 'tocca la prima cella' };
        if(coordSeqTool) {
            const s = WHEEL_SEQUENCES.find(x => x.id === coordSeqTool);
            if(s) return { key:'seq', seq:s, name:s.label, hint:`tocca il primo giorno: inserisce ${s.len} giorni (${s.desc})` };
        }
        if(coordRepTool) {
            const r = WHEEL_REP_TOOLS.find(x => x.id === coordRepTool);
            if(r) return { key:'rep', rep:r, name:r.label, hint: (r.id === 'move' && coordRepMoveFirst) ? 'ora tocca la cella di destinazione' : r.hint };
        }
        if(coordOpTool) { const o = WHEEL_OP_TOOLS.find(x => x.id === coordOpTool); if(o) return { key:'op', name:o.label, hint:o.hint }; }
        if(coordCellTool) { const o = WHEEL_CELL_TOOLS.find(x => x.id === coordCellTool); if(o) return { key:'ct', ct:o, name:o.label, hint:o.hint }; }
        return { key:'select', name:'Nessuno strumento', hint:'scegli dalla ruota cosa inserire' };
    }
    function setCoordTool(kind, v, subV, silent) {
        coordSwapMode = kind === 'swap'; coordSwapFirst = null;
        coordSeqTool = kind === 'seq' ? v : null;
        coordRepTool = kind === 'rep' ? v : null;
        coordOpTool = kind === 'op' ? v : null;
        coordCellTool = kind === 'ct' ? v : null;
        coordRepMoveFirst = null;
        coNextChoice = null;
        if(kind === 'paint') coordPaintTool = { v: v || '', subV: subV || '' };
        else if(kind === 'erase') coordPaintTool = { clear:true };
        else coordPaintTool = null;
        clearSelectedCellVisual(); coordSelectedCell = null;
        document.body.classList.toggle('paint-active', !!coordPaintTool);
        document.body.classList.toggle('swap-active', coordSwapMode || kind === 'seq' || kind === 'rep' || kind === 'op' || kind === 'ct');
        document.body.classList.toggle('select-active', kind === 'select');
        applyEditModeDraggable();
        if(!silent) vibrate();
        if((kind === 'paint' || kind === 'erase' || kind === 'seq' || kind === 'rep' || kind === 'op' || kind === 'ct') && !silent && localStorage.getItem(WHEEL_AUTOCLOSE_KEY) !== '0') twExpanded = false;
        twRender(); twPlace(); updateCoordToolbarState();
    }
    function updateCoordToolbarState() {
        const n = pendingChangesCount();
        const t = currentToolInfo();
        const toolEl = document.getElementById('ces-tool');
        if(toolEl) toolEl.innerHTML = `Strumento: <b>${esc(t.name)}</b> \u2014 ${esc(t.hint)}`;
        const pEl = document.getElementById('ces-pending');
        if(pEl) { pEl.textContent = n ? `${n} da salvare` : 'Tutto salvato'; pEl.classList.toggle('has', !!n); }
        const sv = document.getElementById('ces-save'); if(sv) sv.disabled = !n;
        const b = document.getElementById('tw-badge'); if(b) { b.textContent = n || ''; b.classList.toggle('has', !!n); }
        const u = document.getElementById('tw-sat-undo'); if(u) u.disabled = !coordUndoStack.length;
        if(coordEditModeActive && twExpanded) twRender();
    }
    function coordConfirmChanges(quiet) { return saveAllPendingChanges(quiet); }
    async function coordResetChanges() {
        const n = pendingChangesCount(); if(!n) { ccToast('Non ci sono modifiche da scartare.'); return; }
        const ok = await ccConfirm(`Scartare ${n} ${n===1?'modifica':'modifiche'}?`, 'Il calendario torna all\u2019ultima versione salvata.', 'Scarta', 'solid-danger');
        if(!ok) return;
        vibrate();
        manualOverrides = JSON.parse(JSON.stringify(coordEditBaseline));
        repDiscardEdits();
        coordUndoStack = []; coordRedoStack = [];
        draftClear();
        afterCoordChange(); ccRefreshIfOpen();
    }

    // ── Gestori degli eventi sulla tabella ──────────────────────────────────
    let coordDelegatedHandlersAttached = false;
    function attachCellEditHandlers() {
        applyEditModeDraggable();
        document.addEventListener('keydown', coordOnKeyDown);
        if(coordDelegatedHandlersAttached) return;
        coordDelegatedHandlersAttached = true;
        const table = document.getElementById('main-table');
        table.addEventListener('dragstart', coordOnDragStart);
        table.addEventListener('dragover', coordOnDragOver);
        table.addEventListener('dragleave', coordOnDragLeave);
        table.addEventListener('drop', coordOnDrop);
        table.addEventListener('dragend', coordOnDragEnd);
        table.addEventListener('pointerdown', coordOnPointerDown);
        table.addEventListener('pointermove', coordOnPointerMove);
        document.addEventListener('pointerup', coordOnPointerUp);
        document.addEventListener('pointercancel', coordOnPointerUp);
    }
    function detachCellEditHandlers() {
        document.querySelectorAll('#main-table td[draggable]').forEach(td => td.removeAttribute('draggable'));
        document.removeEventListener('keydown', coordOnKeyDown);
        clearSelectedCellVisual(); coordSelectedCell = null;
    }
    function clearSelectedCellVisual() { document.querySelectorAll('#main-table td.coord-selected').forEach(t => t.classList.remove('coord-selected')); }
    function markSelectedCell(row, col) {
        clearSelectedCellVisual();
        coordSelectedCell = { row, col };
        let td = document.querySelector(`#main-table td[data-row="${row}"][data-col="${col}"]`);
        if(td) td.classList.add('coord-selected');
    }
    function clearSelectedCell() {
        if(!coordSelectedCell) return;
        vibrate();
        let { row, col } = coordSelectedCell;
        let key = cellKey(row, col);
        let next = { v:"", subV:"" };
        let prev = setOverride(key, next);
        pushUndo({ entries:[{ key, prev, next }] });
        coordSelectedCell = null;
        afterCoordChange([key]); closeShiftEditPopup();
    }
    function coordOnKeyDown(e) {
        if(!coordEditModeActive) return;
        if(document.getElementById('coord-console').classList.contains('open')) return;
        const a = document.activeElement;
        if(a && ['INPUT','TEXTAREA','SELECT'].includes(a.tagName)) return;
        const k = e.key.toLowerCase();
        if((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); coordUndo(); return; }
        if((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); coordRedo(); return; }
        if((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); if(pendingChangesCount()) coordConfirmChanges(); return; }
        if(!coordSelectedCell) { if(e.key === 'Escape' && coordPaintTool) setCoordTool('select'); return; }
        if(e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearSelectedCell(); }
        else if(e.key === 'Escape') { clearSelectedCellVisual(); coordSelectedCell = null; coordSwapFirst = null; closeShiftEditPopup(); updateCoordToolbarState(); }
    }
    // Il trascinamento (sposta/copia) si attiva solo sulla cella premuta col mouse:
    // niente attributo draggable su migliaia di celle, che su telefono rallentava.
    function applyEditModeDraggable() {
        document.querySelectorAll('#main-table td[draggable]').forEach(td => td.removeAttribute('draggable'));
    }
    function paintOneCell(row, col) {
        if(!finalData[row]) return;
        let key = cellKey(row, col);
        let value = coordPaintTool.clear ? { v:"", subV:"" } : { v: coordPaintTool.v, subV: coordPaintTool.subV };
        if(value.subV === 'f' && shiftRowYear(row) > SHIFT_YEAR) {   // C.O. nell'anno dopo: 2026 o 2027?
            if(!coNextChoice) {
                coordPainting = false;
                if(!coNextAsking) { coNextAsking = true; coNextAsk().then(ch => { coNextAsking = false; if(!ch || !coordPaintTool) return; coNextChoice = ch; coordPainting = true; coordPaintBatchEntries = []; coordPaintTouchedKeys = new Set(); paintOneCell(row, col); coordOnPointerUp(); }); }
                return;
            }
            value = coNextChoice === 'next' ? Object.assign(value, { coY: SHIFT_YEAR + 1 }) : Object.assign(value, { subV: 'v' });
        }
        const cur = finalData[row][col] || {};
        const same = String(cur.v||'').trim() === String(value.v||'').trim() && String(cur.subV||'').trim() === String(value.subV||'').trim() && (+cur.coY || 0) === (+value.coY || 0);
        if(same && !coordPaintTouchedKeys.has(key)) { coordPaintTouchedKeys.add(key); return; } // gia' uguale: nessuna modifica inutile
        if(same) return;
        const tail = coordPaintTouchedKeys.has(cellKey(row + 1, col)) ? null : pnFreeNextDay(row, col, value.subV);   // PN: via l'assenza nascosta il giorno dopo
        const done = absApplyChecked([{ key, next: value, row, col }].concat(tail ? [tail] : []));   // oltre le spettanze: niente
        if(!done) { coordPaintTouchedKeys.add(key); return; }
        done.forEach(x => { if(!coordPaintTouchedKeys.has(x.key)) { coordPaintBatchEntries.push({ key: x.key, prev: x.prev, next: x.next }); coordPaintTouchedKeys.add(x.key); } });
        if(finalData[row] && rawFinalData[row]) { renderTableRows(tail ? [row, row + 1] : [row]); scheduleTableHeadRefresh(600); }
        else { applyManualOverrides(); renderTable(); }
        updateCoordToolbarState();
    }
    function coordOnPointerDown(e) {
        if(!coordEditModeActive) return;
        if(!coordPaintTool) {
            if(!coordSwapMode && e.pointerType === 'mouse' && e.button === 0) {
                const t = e.target.closest('td[data-col]');
                if(t) { applyEditModeDraggable(); t.setAttribute('draggable', 'true'); }
            }
            return;
        }
        let td = e.target.closest('td[data-col]'); if(!td) return;
        e.preventDefault();
        coordPainting = true; coordPaintBatchEntries = []; coordPaintTouchedKeys = new Set();
        paintOneCell(+td.dataset.row, +td.dataset.col);
    }
    function coordOnPointerMove(e) {
        if(!coordPainting || !coordPaintTool) return;
        let el = document.elementFromPoint(e.clientX, e.clientY);
        let td = el ? el.closest('td[data-col]') : null; if(!td) return;
        const key = cellKey(+td.dataset.row, +td.dataset.col);
        if(coordPaintTouchedKeys.has(key)) return;
        paintOneCell(+td.dataset.row, +td.dataset.col);
    }
    function coordOnPointerUp() {
        if(!coordPainting) return;
        coordPainting = false;
        if(coordPaintBatchEntries.length) { pushUndo({ entries: coordPaintBatchEntries }); vibrate(); draftSaveSoon(); }
        coordPaintBatchEntries = []; coordPaintTouchedKeys = new Set();
        scheduleNavCounts();
    }
    function coordOnDragStart(e) {
        if(!coordEditModeActive || coordPaintTool || coordSwapMode) return;
        let td = e.target.closest('td[data-col]'); if(!td) return;
        coordDragSource = { row:+td.dataset.row, col:+td.dataset.col };
        td.classList.add('coord-dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain','shift'); } catch(err) {}
        coordColumnCellsCache = {};
        document.querySelectorAll(`#main-table td[data-col="${coordDragSource.col}"]`).forEach(t => { coordColumnCellsCache[+t.dataset.row] = t; });
        coordLastFillRange = null;
    }
    function coordClearFillHighlight() { Object.values(coordColumnCellsCache).forEach(t => t.classList.remove('coord-fillover')); }
    function coordOnDragOver(e) {
        if(!coordEditModeActive || !coordDragSource) return;
        let td = e.target.closest('td[data-col]'); if(!td) return;
        e.preventDefault();
        let dest = { row:+td.dataset.row, col:+td.dataset.col };
        if(dest.col === coordDragSource.col) {
            let lo = Math.min(coordDragSource.row, dest.row), hi = Math.max(coordDragSource.row, dest.row);
            if(!coordLastFillRange || coordLastFillRange.lo !== lo || coordLastFillRange.hi !== hi) {
                coordClearFillHighlight();
                for(let r=lo; r<=hi; r++) { let t = coordColumnCellsCache[r]; if(t) t.classList.add('coord-fillover'); }
                coordLastFillRange = { lo, hi };
            }
            td.classList.remove('coord-dragover');
        } else {
            coordClearFillHighlight(); coordLastFillRange = null;
            td.classList.add('coord-dragover');
        }
    }
    function coordOnDragLeave(e) { let td = e.target.closest('td[data-col]'); if(td) td.classList.remove('coord-dragover'); }
    function coordOnDrop(e) {
        if(!coordEditModeActive) return; e.preventDefault();
        let td = e.target.closest('td[data-col]'); if(!td || !coordDragSource) return;
        td.classList.remove('coord-dragover'); coordClearFillHighlight();
        let dest = { row:+td.dataset.row, col:+td.dataset.col };
        if(dest.row === coordDragSource.row && dest.col === coordDragSource.col) { coordDragSource = null; coordLastFillRange = null; return; }
        if(dest.col === coordDragSource.col) performCoordFill(coordDragSource, dest);
        else performCoordSwap(coordDragSource, dest);
        coordDragSource = null; coordLastFillRange = null;
    }
    function coordOnDragEnd() {
        document.querySelectorAll('#main-table td.coord-dragging').forEach(td => td.classList.remove('coord-dragging'));
        document.querySelectorAll('#main-table td.coord-dragover').forEach(td => td.classList.remove('coord-dragover'));
        coordClearFillHighlight();
        coordDragSource = null; coordLastFillRange = null; coordColumnCellsCache = {};
        applyEditModeDraggable();
    }

    function handleCellClick(rowIndex, colIdx, month, day, weekDay, cellValue) {
        if(coordEditModeActive) {
            if(coordPaintTool) return; // gestito dal pennello (pointerdown/pointermove)
            if(coordSwapMode) {
                if(!coordSwapFirst) { coordSwapFirst = { row: rowIndex, col: colIdx }; markSelectedCell(rowIndex, colIdx); vibrate(); }
                else if(coordSwapFirst.row === rowIndex && coordSwapFirst.col === colIdx) { coordSwapFirst = null; coordSelectedCell = null; clearSelectedCellVisual(); }
                else { const a = coordSwapFirst; coordSwapFirst = null; coordSelectedCell = null; performCoordSwap(a, { row: rowIndex, col: colIdx }); }
                updateCoordToolbarState();
                return;
            }
            if(coordSeqTool) { applyWheelSequence(rowIndex, colIdx); return; }
            if(coordRepTool) { repToolTap(rowIndex, colIdx); return; }
            if(coordOpTool) { applyOpTool(colIdx); return; }
            if(coordCellTool) { if(coordCellTool === 'cn' && typeof cnOpen === 'function') cnOpen(rowIndex, colIdx); else openCellToolPopup(colIdx, rowIndex, coordCellTool); return; }
            ccToast('Per inserire turni e assenze scegli dalla ruota delle modifiche.'); return;   // la finestra della casella è stata tolta (richiesta di Mat): si usa solo la ruota
        }
        if(afterMN(rowIndex, colIdx)) cellValue = "SM";
        let hasSub = (finalData[rowIndex] && finalData[rowIndex][colIdx] && finalData[rowIndex][colIdx].subV) ? finalData[rowIndex][colIdx].subV.toString().trim() : "";
        if(!cellValue && !hasSub) { const iso = repRowDate(rowIndex); if(iso && prefOwner() !== 'OSPITE') noteOpenEditor(iso); return; }
        if(asNoteCalloutFirst(rowIndex, colIdx, () => openShiftModal(rowIndex, cellValue, month, day, weekDay))) return;
        openShiftModal(rowIndex, cellValue, month, day, weekDay);
    }

    // ── Editor della singola cella ──────────────────────────────────────────
    function swatchStyle(colors) { return colors ? `--sw:var(${colors.bg});--sf:var(${colors.fg});` : ''; }
    // Finestrella di uno strumento della ruota (permesso a ore, ore a mano) per una casella
    function openCellToolPopup(colIdx, rowIdx, which) {
        coordEditPopupTarget = { row: rowIdx, col: colIdx };
        const d = getDriverByIdx(colIdx), mName = finalData[rowIdx][0].v, dNum = finalData[rowIdx][1].v;
        const dt = new Date(shiftRowYear(rowIdx), MONTH_MAP[mName], parseInt(dNum)), info = computeDayInfo(rowIdx, colIdx);
        document.getElementById('sep-title').textContent = d ? d.name : '';
        document.getElementById('sep-sub').textContent = dt.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' }) + ' \u00b7 attuale: ' + (info.label || 'vuoto');
        document.getElementById('sep-grid').innerHTML = '';
        document.getElementById('sep-perm').innerHTML = which === 'man' ? sepManHtml(rowIdx, colIdx) : sepPermHtml(rowIdx, colIdx);
        const m = document.getElementById('shift-edit-popup'); m.style.display = 'flex';
        requestAnimationFrame(() => m.classList.add('open'));
    }
    function openShiftEditPopup(colIdx, rowIdx) {
        coordEditPopupTarget = { row: rowIdx, col: colIdx };
        const d = getDriverByIdx(colIdx);
        const mName = finalData[rowIdx][0].v; const dNum = finalData[rowIdx][1].v;
        const nextYearRow = shiftRowYear(rowIdx) > SHIFT_YEAR;
        const dt = new Date(shiftRowYear(rowIdx), MONTH_MAP[mName], parseInt(dNum));
        document.getElementById('sep-title').textContent = d ? d.name : '';
        const info = computeDayInfo(rowIdx, colIdx);
        const cell = finalData[rowIdx][colIdx] || {};
        const curV = (cell.v || '').toString().trim(), curSub = (cell.subV || '').toString().trim().toLowerCase();
        document.getElementById('sep-sub').textContent = dt.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' }) + ' \u00b7 attuale: ' + (info.label || 'vuoto') + (cell.overridden ? ' (modificato)' : '');
        const items = wheelPaletteItems().filter(it => !(nextYearRow && it.subV === 'f'));   // anno dopo: il C.O. (2026 o 2027) si mette solo con la ruota, che chiede l'anno
        const group = (title, arr) => `<div class="sep-group-label">${title}</div><div class="sep-row">${arr.map(it => {
            const isCur = it.subV ? (curSub === it.subV && (!it.coY || +cell.coY === it.coY)) : (!SPECIAL_SUBCODES[curSub] && curV === it.v);
            return `<button class="sep-btn ${isCur?'current':''}" onclick="applyShiftChoice('${it.v}','${it.subV}'${it.coY ? ',' + it.coY : ''})"><span class="cc-code" style="${swatchStyle(it.colors)}">${esc(it.short)}</span><span>${esc(it.label)}${it.time?`<small>${esc(it.time)}</small>`:''}</span></button>`;
        }).join('')}</div>`;
        document.getElementById('sep-grid').innerHTML =
            group('Turni', items.filter(i => i.group === 0)) +
            group('Diurni e combinati', items.filter(i => i.group === 1)) +
            group('Assenze e permessi', items.filter(i => i.group === 2)) +
            (items.some(i => i.group === 3) ? group('Caselle personalizzate', items.filter(i => i.group === 3)) : '');
        const hKey = cellKey(rowIdx, colIdx);
        document.getElementById('sep-perm').innerHTML = cnSepHtml(rowIdx, colIdx) + sepPermHtml(rowIdx, colIdx) + sepManHtml(rowIdx, colIdx)
            + `<div class="sep-group-label">Storico di questa casella</div><div class="sep-hist" id="sep-hist" data-key="${esc(hKey)}"><small class="sep-hist-none">Carico…</small></div>`;
        if(fbReady) sepHistoryLoad(hKey); else document.getElementById('sep-hist').innerHTML = '<small class="sep-hist-none">Storico non disponibile senza Firebase.</small>';
        const m = document.getElementById('shift-edit-popup'); m.style.display = 'flex';
        requestAnimationFrame(() => m.classList.add('open'));
    }
    function closeShiftEditPopup(e) {
        if(e && e.target !== e.currentTarget) return;
        const m = document.getElementById('shift-edit-popup'); m.classList.remove('open');
        setTimeout(() => { if(!m.classList.contains('open')) m.style.display = 'none'; }, 150);
        coordEditPopupTarget = null;
    }
    function applyShiftChoice(v, subV, coY) {
        if(!coordEditPopupTarget) return; vibrate();
        const { row, col } = coordEditPopupTarget;
        const key = cellKey(row, col);
        const next = (v === null && subV === null) ? { v:"", subV:"" } : { v: v || "", subV: subV || "" };
        if(coY && next.subV === 'f') next.coY = +coY;   // C.O. 2027 messo nell'anno dopo
        const tail = pnFreeNextDay(row, col, next.subV);
        const done = absApplyChecked([{ key, next, row, col }].concat(tail ? [tail] : []));
        if(!done) return;
        const entries = done.map(x => ({ key: x.key, prev: x.prev, next: x.next })), keys = entries.map(x => x.key);
        pushUndo({ entries });
        afterCoordChange(keys); closeShiftEditPopup();
        if(tail) ccToast(`Il permesso notte copre anche il giorno dopo: tolto ${SPECIAL_SUBCODES[tail.was] ? SPECIAL_SUBCODES[tail.was].toLowerCase() : 'l\u2019assenza'} che c\u2019era, così torna disponibile.`);
    }
    // Il permesso notte occupa anche il giorno dopo (fino alle 7:20) e la casella di quel giorno
    // mostra "PERMESSO NOTTE": un'altra assenza rimasta lì sotto (es. il C.O. di prima) non si
    // vedrebbe ma resterebbe nel conteggio. Quando si mette un PN, quell'assenza si toglie.
    function pnFreeNextDay(row, col, subV) {
        if(String(subV || '').trim().toLowerCase() !== 'pn' || !finalData[row + 1]) return null;
        const nx = finalData[row + 1][col] || {}, sub = String(nx.subV || '').trim().toLowerCase();
        if(!sub || sub === 'pn' || SPECIAL_SUBCODES[sub] === undefined) return null;
        const key = cellKey(row + 1, col), next = { v: String(nx.v || ''), subV: '' };
        if(nx.customMinutes !== undefined && nx.customMinutes !== null && nx.customMinutes !== '') next.customMinutes = nx.customMinutes;
        return { key, next, row: row + 1, col, was: sub };
    }
    // ── Cambio notte con un collega ─────────────────────────────────────────
    // Si cambia con chi ha la notte il giorno prima o il giorno dopo. Su due notti vicine
    // (giorno d e giorno d+1): chi ha la notte più tardi fa MATTINA + NOTTE il giorno d,
    // chi ha la notte del giorno d ha riposo quel giorno e fa la notte del giorno d+1.
    //   notte prima (d):   N  SM R   →  R    N  SM
    //   notte dopo (d+1):  M  N  SM  →  M+N  SM R
    // Mattina e notte restano coperte come prima. È lo scambio usato nel file Excel.
    let cnState = null;
    function cnBase(v) { let s = String(v || '').trim(); const i = s.indexOf('/'); if(i !== -1) s = s.slice(0, i).trim(); return s; }
    function cnAt(r, c) {
        const cell = (finalData[r] || [])[c] || {}, i = computeDayInfo(r, c);
        const man = cell.customMinutes !== undefined && cell.customMinutes !== null && cell.customMinutes !== '';
        const code = String(i.code || '').toUpperCase() === 'S' ? 'SM' : String(i.code || '');
        return { code, info: i, raw: cnBase(cell.v), man, absent: !!i.justified };
    }
    function cnIsNight(r, c) { const x = cnAt(r, c); return x.code === 'N' && !x.absent && !x.man; }
    function cnName(c) { const d = getDriverByIdx(c); return d ? d.name : ''; }
    function cnOrig(c) { const d = getDriverByIdx(c); return d ? repNormName(d.originalName || d.name) : ''; }
    function cnDay(r) { const iso = repRowDate(r); return iso ? repDateObj(iso).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) : ''; }
    function cnWhat(x) {
        if(!x.code && !x.info.label) return 'la casella vuota';
        if(x.absent || !SHIFT_NAMES[x.code]) return (x.info.label || x.code).toLowerCase();
        return ((x.info.nightTail && x.code !== 'SM') ? 'smonto + ' : '') + SHIFT_NAMES[x.code].toLowerCase();
    }
    // Controlla e prepara il cambio tra chi ha la notte il giorno r (early) e chi ce l'ha il giorno r+1 (late).
    function cnPair(early, late, r) {
        const res = { early, late, r, problems: [], warns: [], changes: [] };
        const rows = [r, r + 1, r + 2];
        if(rows.some(x => !finalData[x] || !repRowDate(x) || shiftRowYear(x) !== shiftRowYear(r))) { res.problems.push('Il cambio va oltre la fine del calendario dell’anno.'); return res; }
        const nE = cnName(early), nL = cnName(late), dd = rows.map(cnDay);
        const E = rows.map(x => cnAt(x, early)), L = rows.map(x => cnAt(x, late));
        if(!cnIsNight(r, early)) res.problems.push(`${nE} non ha la notte di ${dd[0]}.`);
        if(!cnIsNight(r + 1, late)) res.problems.push(`${nL} non ha la notte di ${dd[1]}.`);
        if(E[1].absent || E[1].code !== 'SM') res.problems.push(`${nE} ${dd[1]} ha ${cnWhat(E[1])}: lì farà la notte, ci vuole lo smonto della sua notte di adesso.`);
        if(E[2].absent || !(E[2].code === '' || E[2].code.toUpperCase() === 'R')) res.problems.push(`${nE} ${dd[2]} ha ${cnWhat(E[2])}: dopo la nuova notte di ${dd[1]} quel giorno serve lo smonto.`);
        const lateFree = !L[0].absent && (L[0].code === '' || L[0].code.toUpperCase() === 'R');
        if(L[0].absent || !(L[0].code === 'M' || lateFree)) res.problems.push(`${nL} ${dd[0]} ha ${cnWhat(L[0])}: non può aggiungere la notte.`);
        if(L[2].absent || L[2].code !== 'SM') res.problems.push(`${nL} ${dd[2]} ha ${cnWhat(L[2])}: con il cambio quel giorno diventa riposo.`);
        rows.forEach((x, k) => {
            if(E[k].man) res.problems.push(`${nE} ${dd[k]} ha le ore scritte a mano: toglile prima del cambio.`);
            if(L[k].man) res.problems.push(`${nL} ${dd[k]} ha le ore scritte a mano: toglile prima del cambio.`);
        });
        // reperibilità: chi fa una notte non può essere reperibile in quelle ore
        const R = repData(), oE = cnOrig(early), oL = cnOrig(late);
        const isoD = repRowDate(r), isoD1 = repRowDate(r + 1), isoD2 = repRowDate(r + 2);
        const inSlots = (iso, slots, who) => { const f = R.days[iso]; return !!f && slots.some(s => repNormName(f[s]) === who); };
        const lateMN = L[0].code === 'M';
        if(oL && (inSlots(isoD, [2, 3], oL) || inSlots(isoD1, [0, 1], oL))) res.warns.push(`${nL} è reperibile dalle 13:00 di ${dd[0]}: facendo ${lateMN ? 'mattina + notte' : 'la notte'} non può coprire la reperibilità. Cedila o spostala.`);
        if(oE && (inSlots(isoD1, [2, 3], oE) || inSlots(isoD2, [0, 1], oE))) res.warns.push(`${nE} è reperibile dalle 13:00 di ${dd[1]}: facendo la notte non può coprire la reperibilità. Cedila o spostala.`);
        if(res.problems.length) return res;
        const set = (row, col, v) => res.changes.push({ row, col, v });
        set(r, early, 'R'); set(r + 1, early, 'N'); set(r + 2, early, E[1].raw);
        set(r, late, lateMN ? 'M+N' : 'N'); set(r + 1, late, L[2].raw); set(r + 2, late, E[2].raw);
        res.before = { early: [r - 1, r, r + 1, r + 2].map(x => finalData[x] ? cnAt(x, early).code : ''), late: [r - 1, r, r + 1, r + 2].map(x => finalData[x] ? cnAt(x, late).code : '') };
        res.after = { early: [res.before.early[0], 'R', 'N', 'SM'], late: [res.before.late[0], lateMN ? 'M+N' : 'N', 'SM', E[2].code ? 'R' : ''] };
        return res;
    }
    // Tutti i cambi possibili per la notte di (row, col): con chi ha la notte il giorno dopo
    // (fa M+N il giorno della mia notte) e con chi ce l'ha il giorno prima (faccio io M+N quel giorno).
    function cnCandidates(row, col) {
        const after = [], before = [];
        drivers.forEach(d => {
            if(d.idx === col || d.test) return;
            if(finalData[row + 1] && cnIsNight(row + 1, d.idx)) after.push(cnPair(col, d.idx, row));
            if(row - 1 >= 1 && finalData[row - 1] && cnIsNight(row - 1, d.idx)) before.push(cnPair(d.idx, col, row - 1));
        });
        const ord = (a, b) => (a.problems.length - b.problems.length) || (a.warns.length - b.warns.length);
        return { after: after.sort(ord), before: before.sort(ord) };
    }
    function cnChip(code) {
        const c = String(code || '');
        if(!c) return `<span class="cc-code cn-empty">·</span>`;
        const col = c === 'M+N' ? MAIN_CODE_COLORS.N : (MAIN_CODE_COLORS[c] || MAIN_CODE_COLORS[c.toUpperCase()] || DIURNI_CODE_COLORS[c] || SUB_CODE_COLORS[c.toLowerCase()]);
        return `<span class="cc-code" style="${swatchStyle(col)}">${esc(ABS_SHORT[c.toLowerCase()] && !MAIN_CODE_COLORS[c] && c !== 'M+N' ? ABS_SHORT[c.toLowerCase()] : c)}</span>`;
    }
    function cnCardHtml(p, i, kind, canApply) {
        const nE = cnName(p.early), nL = cnName(p.late), other = kind === 'after' ? nL : nE;
        const d0 = cnDay(p.r), d1 = cnDay(p.r + 1);
        const how = `${esc(nL)} fa <b>mattina + notte</b> ${esc(d0)}, ${esc(nE)} ha riposo ${esc(d0)} e fa la notte di ${esc(d1)}.`;
        let h = `<div class="cn-card ${p.problems.length ? 'ko' : ''}"><div class="cn-card-h"><b>${esc(other)}</b><small>${kind === 'after' ? 'notte di ' + esc(d1) : 'notte di ' + esc(d0)}</small></div>`;
        if(!p.problems.length) {
            const days = [p.r - 1, p.r, p.r + 1, p.r + 2];
            h += `<p class="cn-how">${how}</p><table class="cn-tab"><tr><th></th>${days.map(x => { const o = finalData[x] && repRowDate(x) ? repDateObj(repRowDate(x)) : null; return `<th>${o ? esc(o.toLocaleDateString('it-IT', { weekday: 'short' })) + '<br><b>' + o.getDate() + '</b>' : ''}</th>`; }).join('')}</tr>`;
            [[p.early, 'early'], [p.late, 'late']].forEach(([c, k]) => {
                h += `<tr><td class="cn-who">${esc(cnName(c))}</td>${p.before[k].map((b, j) => { const a = p.after[k][j], ch = a !== b; return `<td class="${ch ? 'ch' : ''}">${cnChip(b)}${ch ? `<span class="material-icons-round cn-arr">arrow_downward</span>${cnChip(a)}` : ''}</td>`; }).join('')}</tr>`;
            });
            h += `</table>`;
        }
        p.problems.forEach(t => h += `<div class="cn-msg ko"><span class="material-icons-round">block</span>${esc(t)}</div>`);
        p.warns.forEach(t => h += `<div class="cn-msg warn"><span class="material-icons-round">warning</span>${esc(t)}</div>`);
        if(canApply && !p.problems.length) h += `<div class="cn-act"><button class="cc-btn primary" onclick="cnApply('${kind}',${i})"><span class="material-icons-round">swap_vert</span>Fai il cambio con ${esc(other)}</button></div>`;
        return h + `</div>`;
    }
    function cnOpen(row, col) {
        const canApply = !!coordEditModeActive;
        cnState = Object.assign({ row, col }, cnCandidates(row, col));
        closeShiftEditPopup(); closeShiftModal();
        document.getElementById('cn-title').textContent = `Cambio notte · ${cnName(col)}`;
        document.getElementById('cn-sub').textContent = `Notte di ${repDateLabel(repRowDate(row), true)}`;
        const okA = cnState.after.filter(p => !p.problems.length).length, okB = cnState.before.filter(p => !p.problems.length).length;
        let h = `<div class="cn-intro"><span class="material-icons-round">info</span><div>Si cambia con chi ha la notte <b>il giorno dopo</b> o <b>il giorno prima</b>. Chi ha la notte più tardi fa mattina + notte, l’altro ha riposo e fa la notte del giorno dopo. Mattine e notti restano coperte come prima.</div></div>`;
        const sec = (title, list, kind) => {
            h += `<div class="sep-group-label">${title}</div>`;
            if(!list.length) { h += `<div class="cn-none">Nessuno ha la notte quel giorno.</div>`; return; }
            list.forEach((p, i) => h += cnCardHtml(p, i, kind, canApply));
        };
        sec(`Con chi ha la notte il giorno dopo (${esc(cnDay(row + 1))}): il collega fa mattina + notte`, cnState.after, 'after');
        sec(`Con chi ha la notte il giorno prima (${esc(cnDay(row - 1))}): ${esc(cnName(col))} fa mattina + notte`, cnState.before, 'before');
        if(!okA && !okB) h += `<div class="cn-msg warn"><span class="material-icons-round">warning</span>Nessun cambio possibile senza toccare altri giorni: vedi i motivi sopra.</div>`;
        if(!canApply) h += `<div class="cn-intro" style="margin-top:12px"><span class="material-icons-round">assignment</span><div>Il cambio lo inserisce il coordinatore. Mettiti d’accordo con il collega e manda la richiesta di cambio turno dal portale Richieste.</div></div>`;
        document.getElementById('cn-body').innerHTML = h;
        const m = document.getElementById('cn-popup'); m.style.display = 'flex';
        document.getElementById('cn-body').scrollTop = 0;
        requestAnimationFrame(() => m.classList.add('open'));
    }
    function cnClose(e) {
        if(e && e.target !== e.currentTarget) return;
        const m = document.getElementById('cn-popup'); m.classList.remove('open');
        setTimeout(() => { if(!m.classList.contains('open')) m.style.display = 'none'; }, 150);
    }
    function cnApply(kind, i) {
        if(!cnState || !coordEditModeActive) return;
        const old = (cnState[kind] || [])[i]; if(!old) return;
        const p = cnPair(old.early, old.late, old.r);   // ricontrolla sui dati di adesso
        if(p.problems.length) { ccToast(p.problems[0], true); return; }
        const list = p.changes.map(x => ({ key: cellKey(x.row, x.col), next: { v: x.v, subV: '' }, row: x.row, col: x.col }));
        const done = absApplyChecked(list); if(!done) return;
        const entries = done.map(x => ({ key: x.key, prev: x.prev, next: x.next }));
        pushUndo({ entries }); afterCoordChange(entries.map(x => x.key)); vibrate();
        cnClose();
        ccToast(`Cambio notte fatto: ${cnName(p.late)} M+N ${cnDay(p.r)}, ${cnName(p.early)} notte ${cnDay(p.r + 1)}. Ricordati di salvare.`);
    }
    // Riquadro nell'editor della cella (solo se la cella è una notte)
    function cnSepHtml(row, col) {
        if(!cnIsNight(row, col)) return '';
        const c = cnCandidates(row, col), n = c.after.concat(c.before).filter(p => !p.problems.length).length;
        return `<div class="sep-group-label">Cambio notte</div><div class="sep-perm"><div class="sep-perm-row">
            <button class="cc-btn primary" onclick="cnOpen(${row},${col})"><span class="material-icons-round">swap_vert</span>Cambia la notte con un collega</button>
            <small>${n ? `${n} ${n === 1 ? 'cambio possibile' : 'cambi possibili'} con chi ha la notte il giorno prima o dopo` : 'Nessun cambio possibile senza toccare altri giorni: apri per vedere perché'}</small></div></div>`;
    }
    // ── Spettanze: in Modifica turni non si va oltre i C.O. e i permessi che la persona ha ──
    const ABS_LIMITED = { f: 1, v: 1, p: 1, pn: 1 };   // v: le ferie residue messe nell'anno dopo scalano il C.O. di quest'anno
    // ["P 8/6", …]: dove la persona è già oltre le spettanze dell'anno
    function absOverList(d) {
        const a = absCountFor(d, buildDaysIndex()), L = { co: 'C.O.', sp: 'P', pn: 'PN' };
        return ['co', 'sp', 'pn'].filter(k => a.allow[k] > a.max[k]).map(k => `${L[k]} ${a.allow[k]}/${a.max[k]}`);
    }
    function absUse(col) {
        const d = getDriverByIdx(col); if(!d) return null;
        const a = absCountFor(d, buildDaysIndex());
        return { d, co: a.allow.co, sp: a.allow.sp, pn: a.allow.pn, max: a.max };
    }
    function absOverMsg(b, a) {
        const L = { co: 'giorni di congedo ordinario', sp: 'permessi straordinari (anche i permessi notte ne usano uno)', pn: 'permessi notte' };
        const k = ['co', 'sp', 'pn'].find(k => a[k] > a.max[k] && a[k] > b[k]); if(!k) return '';
        const left = Math.max(0, a.max[k] - b[k]);
        return `${a.d.name} ha ${a.max[k]} ${L[k]} nel ${SHIFT_YEAR}${left ? `: ne restano solo ${left}` : ' e li ha già usati tutti'}. Non inserito. Se la spettanza è sbagliata si cambia in Area coordinatore › Operatori.`;
    }
    // Nei mesi dell'anno dopo (prima di capodanno) un C.O. è o "ferie residue" dell'anno in corso
    // (arancione, conta su quest'anno) o "C.O. 2027" (coY, giallo, conta sull'anno dopo): con la ruota
    // lo si chiede (coNextAsk), nell'editor ci sono i due tasti; un C.O. senza anno che arriva lì
    // (es. uno scambio) diventa ferie residue.
    let coNextChoice = null, coNextAsking = false;   // scelta valida finché non si cambia strumento
    function coNextAsk() {
        const y = SHIFT_YEAR + 1;
        return ccDialog(`Ferie nel ${y}`, `Queste ferie su quale anno contano?`, [
            { label: 'Annulla', kind: 'ghost', value: null },
            { label: `Ferie residue ${SHIFT_YEAR} (contano sul ${SHIFT_YEAR})`, kind: 'primary', value: 'v' },
            { label: `Ferie desiderate ${y} (contano sul ${y})`, kind: 'primary', value: 'next' }]);
    }
    function coNextToResidue(x) {
        const n = x && x.next;
        if(!n || String(n.subV || '').trim().toLowerCase() !== 'f' || x.row == null || shiftRowYear(x.row) <= SHIFT_YEAR) return x;
        const old = manualOverrides[x.key];
        if(+n.coY > SHIFT_YEAR || (old && +old.coY > SHIFT_YEAR && String(old.subV || '').trim().toLowerCase() === 'f')) return x;
        return Object.assign({}, x, { next: Object.assign({}, n, { subV: 'v' }) });
    }
    // Applica le caselle [{ key, next, row, col }] (alle modifiche in sospeso). Se così qualcuno
    // supera le sue spettanze rimette tutto com'era, avvisa e restituisce null; altrimenti le
    // voci con il valore di prima, per l'annullamento.
    function absApplyChecked(list) {
        const sub = x => String((x && x.subV) || '').trim().toLowerCase();
        list = list.map(coNextToResidue);
        const check = list.some(x => ABS_LIMITED[sub(x.next)]);
        const cols = check ? [...new Set(list.map(x => x.col))] : [], before = {};
        cols.forEach(c => before[c] = absUse(c));
        const done = list.map(x => Object.assign({}, x, { prev: setOverride(x.key, x.next) }));
        done.forEach(x => applyOverrideAt(x.row, x.col, x.key));
        for(const c of cols) {
            const after = absUse(c), msg = before[c] && after ? absOverMsg(before[c], after) : '';
            if(!msg) continue;
            done.slice().reverse().forEach(x => { setOverride(x.key, x.prev); applyOverrideAt(x.row, x.col, x.key); });
            ccToast(msg, true);
            return null;
        }
        return done;
    }
    function describeOverrideValue(ov) {
        if(!ov) return "vuoto";
        if(ov.customMinutes) return `STRAORDINARIO ${ov.customMinutes}h`;
        if(ov.perm && PERM_HOURLY[ov.perm.k] && Number(ov.perm.h) > 0) return `${ov.subV && SPECIAL_SUBCODES[ov.subV] ? SPECIAL_SUBCODES[ov.subV] : (ov.v || '')} ${PERM_HOURLY[ov.perm.k].short} ${permHFmt(ov.perm.h)}`.trim();
        if(ov.subV && SPECIAL_SUBCODES[ov.subV]) return SPECIAL_SUBCODES[ov.subV];
        return ov.v || "vuoto";
    }
    function describeRawExcelValue(orig, dateStr) {
        const at = dateStr.indexOf('@'); const wantYear = at === -1 ? SHIFT_YEAR : parseInt(dateStr.slice(at + 1)); if(at !== -1) dateStr = dateStr.slice(0, at);
        let idx1 = dateStr.lastIndexOf('-'); let mName = dateStr.substring(0, idx1); let dNum = dateStr.substring(idx1 + 1);
        let headerRaw = rawFinalData[0]; let idx = headerRaw ? headerRaw.indexOf(orig) : -1;
        if(idx === -1) return "vuoto (excel)";
        for(let r=1; r<rawFinalData.length; r++) {
            let row = rawFinalData[r];
            if(row[0].v === mName && String(parseInt(row[1].v)) === String(parseInt(dNum)) && shiftRowYear(r) === wantYear) {
                let c = row[idx] || {};
                let sub = (c.subV || "").toString().trim().toLowerCase();
                if(sub && SPECIAL_SUBCODES[sub]) return SPECIAL_SUBCODES[sub];
                return (c.v || "").toString().trim() || "vuoto (excel)";
            }
        }
        return "vuoto (excel)";
    }

    // ═══ RUOTA STRUMENTI ══════════════════════════════════════════════════
    const WHEEL_ACTIONS = [
        { id:'select',  icon:'arrow_selector_tool', label:'Nessuno strumento',  hint:'il tocco non cambia le caselle' },
        { id:'swap',    icon:'swap_horiz',          label:'Scambia',    hint:'tocca due celle' },
        { id:'erase',   icon:'ink_eraser',          label:'Gomma',      hint:'svuota le celle' },
        { id:'undo',    icon:'undo',                label:'Annulla',    hint:'Ctrl+Z' },
        { id:'redo',    icon:'redo',                label:'Ripeti',     hint:'Ctrl+Y' },
        { id:'save',    icon:'save',                label:'Salva',      hint:'rende visibili a tutti' },
        { id:'discard', icon:'restart_alt',         label:'Scarta',     hint:'torna all\u2019ultimo salvataggio' },
        { id:'exit',    icon:'logout',              label:'Esci',       hint:'chiude la modalità modifica' }
    ];
    // Dimensione della ruota (G = quella storica da 300 px). Su schermi piccoli si
    // riduce da sola per stare sempre dentro lo schermo.
    const WHEEL_SIZE_KEY = 'coord_wheel_size', WHEEL_MODE_KEY = 'coord_wheel_mode';
    const WHEEL_SIZES = { P:210, M:250, G:300 };
    // Tipologie di ruota: si cambiano con le frecce della barra sopra la ruota.
    // L'anello interno (strumenti) è lo stesso per tutte, cambia l'anello esterno.
    const WHEEL_MODES = [
        { id:'turni',     label:'Turni',        sub:'turni e sequenze' },
        { id:'assenze',   label:'Assenze',      sub:'ferie, permessi, malattia' },
        { id:'rep',       label:'Reperibilità', sub:'aggiungi, sposta, fasce' },
        { id:'operatori', label:'Operatori',    sub:'nomi e colonne' }
    ];
    // Sequenze: toccando un giorno si inseriscono i turni da quel giorno in avanti.
    const TURNISTI_CYCLE = ['P','M','N','SM','R'];   // pomeriggio, mattina, notte, smonto, riposo
    const WHEEL_SEQUENCES = [
        { id:'c5',   short:'+5',  label:'+5 · un ciclo',            desc:'P › M › N › SM › R',   pattern:TURNISTI_CYCLE, len:5,  fill:'#0f766e', group:0 },
        { id:'c10',  short:'+10', label:'+10 · due cicli',          desc:'2 × P M N SM R',               pattern:TURNISTI_CYCLE, len:10, fill:'#0d6b62', group:0 },
        { id:'c15',  short:'+15', label:'+15 · tre cicli',          desc:'3 × P M N SM R',               pattern:TURNISTI_CYCLE, len:15, fill:'#0b5e56', group:0 },
        { id:'w5',   short:'5 sett.', label:'Turno 5 settimane',      desc:'7 cicli P M N SM R = 35 giorni', pattern:TURNISTI_CYCLE, len:35, fill:'#08514a', group:0 },
        { id:'d7mp', short:'+7 m', label:'+7 diurno · mattina e pomeriggio alternati', desc:'m › p › m › p › m › p › m', pattern:['m','p'], len:7, fill:'#6d28d9', group:1, dashed:true },
        { id:'d7pm', short:'+7 p', label:'+7 diurno · pomeriggio e mattina alternati', desc:'p › m › p › m › p › m › p', pattern:['p','m'], len:7, fill:'#5b21b6', group:1, dashed:true }
    ];
    const WHEEL_REP_TOOLS = [
        { id:'add',   short:'+ REP',  icon:'add_circle',    label:'Aggiungi reperibilità', hint:'tocca il giorno: reperibile dalle 13:00 per 24 h', fill:'#16a34a' },
        { id:'move',  short:'SPOSTA', icon:'open_with',     label:'Sposta reperibilità',   hint:'tocca la reperibilità, poi la nuova cella', fill:'#d97706' },
        // autisti: niente strumento per dividere le fasce (le cessioni arrivano dal portale Richieste)
        { id:'del',   short:'− REP', icon:'remove_circle', label:'Elimina reperibilità', hint:'tocca la reperibilità da eliminare', fill:'#dc2626' }
    ];
    let twMode = (() => { try { const m = localStorage.getItem(WHEEL_MODE_KEY); return WHEEL_MODES.some(x => x.id === m) ? m : 'turni'; } catch(e) { return 'turni'; } })();
    let coordSeqTool = null, coordRepTool = null, coordRepMoveFirst = null;
    function twPrefSize() { let k = 'G'; try { k = localStorage.getItem(WHEEL_SIZE_KEY) || 'G'; } catch(e) {} return WHEEL_SIZES[k] ? k : 'G'; }
    function twSize() {
        const fit = Math.min(twVP.w - 24, twVP.h - 150);
        return Math.round(Math.max(170, Math.min(WHEEL_SIZES[twPrefSize()], fit)));
    }
    function twSetSize(k) { try { localStorage.setItem(WHEEL_SIZE_KEY, k); } catch(e) {} vibrate(); twRender(); twPlace(); }
    function twSwitchMode(dir) {
        const i = WHEEL_MODES.findIndex(m => m.id === twMode);
        twMode = WHEEL_MODES[(i + dir + WHEEL_MODES.length) % WHEEL_MODES.length].id;
        try { localStorage.setItem(WHEEL_MODE_KEY, twMode); } catch(e) {}
        twHover = null; vibrate(); twRender(); twPlace();
        if(ccSection === 'modifica') { const prev = document.getElementById('cc-wheel-preview'); if(prev) prev.innerHTML = buildWheelMarkup(260, true); }
    }
    // Elementi dell'anello esterno per la ruota attiva.
    function wheelRingItemsOld() {
        if(twMode === 'sequenze') return WHEEL_SEQUENCES.map(s => ({ kind:'seq', id:s.id, short:s.short, label:s.label, time:s.desc, fill:s.fill, fg:'#fff', group:s.group, dashed:s.dashed }));
        if(twMode === 'rep') return WHEEL_REP_TOOLS.map(r => ({ kind:'rep', id:r.id, short:r.short, label:r.label, time:r.hint, fill:r.fill, fg:'#fff', group:0, icon:r.icon }));
        return wheelPaletteItems().map((it, i) => Object.assign({ kind:'pal', i }, it));
    }
    function wheelPaletteItems() {
        const items = [];
        STANDARD_CODES.forEach(c => items.push({ v:c, subV:'', short:c, label:SHIFT_NAMES[c] || c, time:SCHEDULE[c] && SCHEDULE[c] !== 'RIPOSO' ? SCHEDULE[c] : '', colors:MAIN_CODE_COLORS[c], group:0 }));
        DIURNI_CODES.forEach(c => items.push({ v:c, subV:'', short:c, label:SHIFT_NAMES[c] || c, time:diurniSched(c) && diurniSched(c) !== 'RIPOSO' ? diurniSched(c) : '', colors:DIURNI_CODE_COLORS[c], group:1, dashed:true }));
        items.push({ v:'M+N', subV:'', short:'M+N', label:SHIFT_NAMES['M+N'], time:`${SCHEDULE.M} e ${SCHEDULE.N}`, colors:MAIN_CODE_COLORS.N, group:1 });
        Object.keys(customCodes).sort().forEach(k => { const c = customCodes[k];
            items.push({ v:k, subV:'', short:k.slice(0, 4), label:(c.label || k).replace(/\|/g, ' '), time: c.kind === 'work' ? `${c.from}-${c.to}` : (c.kind === 'abs' ? 'assenza' : ''), colors: customColors(k), group:3 }); });
        Object.keys(SPECIAL_SUBCODES).filter(k => k !== 'gr').forEach(k => {
            const lbl = SPECIAL_SUBCODES[k]; const nice = lbl.charAt(0) + lbl.slice(1).toLowerCase().replace('(c.o.)','(C.O.)').replace('coord.','coordinatore');
            items.push({ v:'', subV:k, short:ABS_SHORT[k], label:nice, colors:SUB_CODE_COLORS[k], group:2 });
        });
        return items;
    }
    function annularSector(cx, cy, r0, r1, a0, a1) {
        const p = (r, a) => { const t = (a - 90) * Math.PI / 180; return [(cx + r*Math.cos(t)).toFixed(2), (cy + r*Math.sin(t)).toFixed(2)]; };
        const large = (a1 - a0) > 180 ? 1 : 0;
        const [x1,y1] = p(r1,a0), [x2,y2] = p(r1,a1), [x3,y3] = p(r0,a1), [x4,y4] = p(r0,a0);
        return `M${x1} ${y1}A${r1} ${r1} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${r0} ${r0} 0 ${large} 0 ${x4} ${y4}Z`;
    }
    function polar(cx, cy, r, a) { const t = (a - 90) * Math.PI / 180; return [cx + r*Math.cos(t), cy + r*Math.sin(t)]; }
    // Costruisce la ruota: anello interno = strumenti, anello esterno = turni e assenze.
    function buildWheelMarkup(size, preview) {
        const S = size, c = S/2, k = S/300;
        const rIn0 = 42*k, rIn1 = 88*k, rOut0 = 93*k, rOut1 = 147*k;
        const items = wheelRingItems();
        const t = currentToolInfo();
        let paths = `<circle class="tw-back" cx="${c}" cy="${c}" r="${rOut1+1.5*k}"/>`, labels = '';
        // anello interno
        const nA = WHEEL_ACTIONS.length, stepA = 360 / nA;
        WHEEL_ACTIONS.forEach((a, i) => {
            const a0 = i*stepA - stepA/2 + 0.8, a1 = (i+1)*stepA - stepA/2 - 0.8;
            let st = '';
            if(!preview) {
                if((a.id === 'select' && t.key === 'select') || (a.id === 'swap' && t.key === 'swap') || (a.id === 'erase' && t.key === 'erase')) st = 'on';
                if((a.id === 'undo' && !coordUndoStack.length) || (a.id === 'redo' && !coordRedoStack.length) || ((a.id === 'save' || a.id === 'discard') && !pendingChangesCount())) st = 'off';
            }
            paths += `<path class="tw-seg act ${st}" data-kind="act" data-id="${a.id}" d="${annularSector(c,c,rIn0,rIn1,a0,a1)}"><title>${esc(a.label)}</title></path>`;
            const [x,y] = polar(c, c, (rIn0+rIn1)/2, i*stepA);
            labels += `<span class="tw-lbl ico ${st}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px"><span class="msym" style="font-size:${Math.round(20*k)}px">${a.icon}</span></span>`;
        });
        // anello esterno, con uno stacco tra i gruppi
        const groups = [...new Set(items.map(it => it.group))].sort().map(g => items.filter(it => it.group === g));
        const gap = groups.length > 1 ? 5 : 0, pad = 0.9;
        const step = (360 - gap*groups.length) / items.length;
        let ang = -step/2 - gap/2;
        groups.forEach(g => {
            ang += gap/2;
            g.forEach(it => {
                const a0 = ang + pad/2, a1 = ang + step - pad/2;
                let sel = false;
                if(!preview) {
                    if(it.kind === 'pal') sel = !!(coordPaintTool && !coordPaintTool.clear && coordPaintTool.v === it.v && coordPaintTool.subV === it.subV);
                    else if(it.kind === 'seq') sel = coordSeqTool === it.id;
                    else if(it.kind === 'rep') sel = coordRepTool === it.id;
                    else if(it.kind === 'op') sel = coordOpTool === it.id;
                    else if(it.kind === 'ct') sel = coordCellTool === it.id;
                }
                const fill = it.fill || (it.colors ? `var(${it.colors.bg})` : '#999');
                const idx = items.indexOf(it);
                paths += `<path class="tw-seg ${sel?'sel':''}" data-kind="${it.kind}" data-i="${idx}" data-id="${esc(it.id || '')}" d="${annularSector(c,c,rOut0,rOut1,a0,a1)}" style="fill:${fill}"><title>${esc(it.label)}</title></path>`;
                const [x,y] = polar(c, c, (rOut0+rOut1)/2, (a0+a1)/2);
                const fg = it.fg || (it.colors ? `var(${it.colors.fg})` : '#fff');
                const fs = Math.max(9, Math.round((it.short.length>2?10:11.5)*k));
                const inner = it.icon ? `<span class="msym" style="display:block;font-size:${Math.round(22*k)}px;margin:0 auto 2px">${it.icon}</span>${esc(it.short)}` : esc(it.short);
                labels += `<span class="tw-lbl ${it.dashed?'dashed':''}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;color:${fg};font-size:${fs}px">${inner}</span>`;
                ang += step;
            });
            ang += gap/2;
        });
        const svg = `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" aria-hidden="${preview?'true':'false'}">${paths}</svg><div class="tw-labels">${labels}</div>`;
        if(!preview) return svg;
        // anteprima statica per la console
        const hubR = 34*k;
        return `<div class="cc-scope" style="position:relative;width:${S}px;height:${S}px;pointer-events:none">${svg.replace('<svg ', '<svg style="filter:none" ')}<div style="position:absolute;left:50%;top:50%;width:${hubR*2}px;height:${hubR*2}px;margin:-${hubR}px 0 0 -${hubR}px;border-radius:50%;background:var(--cc-surface);border:3px solid var(--cc-ink);display:flex;align-items:center;justify-content:center;font:500 11px/1.1 var(--cc-font);color:var(--cc-muted);text-align:center">centro</div></div>`;
    }
    function twRender() {
        const ring = document.getElementById('tw-ring'); if(!ring) return;
        const wheel = document.getElementById('tool-wheel');
        wheel.classList.toggle('collapsed', !twExpanded);
        const S = twSize();
        wheel.style.width = wheel.style.height = S + 'px';
        wheel.style.setProperty('--tw-hub', Math.max(54, Math.round(72 * S / 300)) + 'px');
        const mode = WHEEL_MODES.find(m => m.id === twMode) || WHEEL_MODES[0];
        const modeEl = document.getElementById('tw-bar-mode');
        if(modeEl) modeEl.innerHTML = `${esc(mode.label)}<small>${WHEEL_MODES.indexOf(mode)+1}/${WHEEL_MODES.length} · ${esc(mode.sub)}</small>`;
        const pref = twPrefSize();
        document.querySelectorAll('#tw-bar .tw-bar-sizes button').forEach(b => b.classList.toggle('on', b.dataset.size === pref));
        if(twExpanded) {
            ring.innerHTML = buildWheelMarkup(S, false);
            ring.querySelectorAll('path.tw-seg').forEach(p => {
                p.addEventListener('click', twOnSegmentClick);
                p.addEventListener('pointerenter', () => { twHover = p; twCaption(); });
                p.addEventListener('pointerleave', () => { if(twHover === p) twHover = null; twCaption(); });
            });
        }
        // centro
        const t = currentToolInfo(); const sw = document.getElementById('tw-hub-sw');
        if(t.key === 'paint' && t.item) { sw.className = 'tw-hub-sw'; sw.setAttribute('style', swatchStyle(t.item.colors)); sw.textContent = t.item.short; }
        else if(t.key === 'seq' || t.key === 'rep' || t.key === 'ct') { const o = t.key === 'seq' ? t.seq : t.key === 'rep' ? t.rep : t.ct; sw.className = 'tw-hub-sw'; sw.setAttribute('style', `background:${o.fill};color:#fff;width:auto;min-width:30px;padding:0 4px`); sw.textContent = o.short; }
        else { sw.className = 'tw-hub-sw plain'; sw.removeAttribute('style'); const ic = { select:'arrow_selector_tool', swap:'swap_horiz', erase:'ink_eraser' }[t.key] || 'touch_app'; sw.innerHTML = `<span class="msym">${ic}</span>`; }
        twCaption();
    }
    function twCaption() {
        const cap = document.getElementById('tw-caption'); if(!cap) return;
        if(twHover) {
            if(twHover.dataset.kind === 'act') { const a = WHEEL_ACTIONS.find(x => x.id === twHover.dataset.id); cap.innerHTML = `${esc(a.label)}<small>${esc(a.hint)}</small>`; return; }
            const it = wheelRingItems()[+twHover.dataset.i]; if(!it) return; cap.innerHTML = `${esc(it.label)}${it.time?`<small>${esc(it.time)}</small>`:''}`; return;
        }
        const t = currentToolInfo();
        cap.innerHTML = `${esc(t.name)}<small>${esc(t.hint)}</small>`;
    }
    function twOnSegmentClick(e) {
        const p = e.currentTarget;
        if(p.dataset.kind === 'pal') { const it = wheelRingItems()[+p.dataset.i]; twHover = null; setCoordTool('paint', it.v, it.subV); return; }
        if(p.dataset.kind === 'op') { twHover = null; twOpClick(p.dataset.id); return; }
        if(p.dataset.kind === 'seq' || p.dataset.kind === 'rep' || p.dataset.kind === 'ct') { twHover = null; setCoordTool(p.dataset.kind, p.dataset.id); return; }
        const id = p.dataset.id;
        if(id === 'select' || id === 'swap' || id === 'erase') { twHover = null; setCoordTool(id); }
        else if(id === 'undo') coordUndo();
        else if(id === 'redo') coordRedo();
        else if(id === 'save') { if(pendingChangesCount()) coordConfirmChanges(); }
        else if(id === 'discard') coordResetChanges();
        else if(id === 'exit') exitCoordEdit();
    }
    function twDefaultPos() { return { x: twVP.w - 60, y: twVP.h - 120 }; }
    function twLoadPos() {
        if(twPos) return twPos;
        try { const p = JSON.parse(localStorage.getItem(WHEEL_POS_KEY)); if(p && isFinite(p.x) && isFinite(p.y)) twPos = p; } catch(e) {}
        if(!twPos) twPos = twDefaultPos();
        return twPos;
    }
    function twClamp(p, expanded) {
        const W = twVP.w, H = twVP.h, half = twSize() / 2;
        const r = expanded ? half : 34, top = expanded ? half + 46 : 40, bottom = expanded ? half + 66 : 100;
        const x = W < r*2 + 16 ? W/2 : Math.min(Math.max(p.x, r + 8), W - r - 8);
        const y = H < top + bottom ? H/2 : Math.min(Math.max(p.y, top + (expanded ? 0 : 20)), H - bottom);
        return { x, y };
    }
    function twPlace() {
        const wheel = document.getElementById('tool-wheel'); if(!wheel) return;
        const p = twClamp(twLoadPos(), twExpanded), half = twSize() / 2;
        wheel.style.transform = `translate(${Math.round(p.x - half)}px, ${Math.round(p.y - half)}px)`;
        wheel.classList.toggle('caption-top', p.y > twVP.h - (half + 80));
        // la barra (frecce + dimensione) può essere più larga della ruota: resta dentro lo schermo
        const bar = document.getElementById('tw-bar');
        if(bar && twExpanded) {
            const bw = bar.offsetWidth, W = twVP.w;
            const left = Math.min(Math.max(p.x - bw / 2, 8), Math.max(8, W - 8 - bw));
            bar.style.transform = `translateX(calc(-50% + ${Math.round(left - (p.x - bw / 2))}px))`;
        }
    }
    function twResetPosition() { twPos = twDefaultPos(); localStorage.removeItem(WHEEL_POS_KEY); twPlace(); ccToast('Ruota riportata in basso a destra'); }
    (function setupToolWheelDrag() {
        const hub = document.getElementById('tw-hub'); if(!hub) return;
        let start = null;
        hub.addEventListener('pointerdown', e => {
            e.preventDefault();
            const p = twClamp(twLoadPos(), twExpanded);
            start = { x:e.clientX, y:e.clientY, px:p.x, py:p.y, moved:false, id:e.pointerId };
            try { hub.setPointerCapture(e.pointerId); } catch(err) {}
        });
        hub.addEventListener('pointermove', e => {
            if(!start || e.pointerId !== start.id) return;
            const dx = e.clientX - start.x, dy = e.clientY - start.y;
            if(!start.moved && Math.hypot(dx, dy) < 6) return;
            start.moved = true;
            twPos = { x: start.px + dx, y: start.py + dy };
            twPlace();
        });
        const end = e => {
            if(!start || (e && e.pointerId !== start.id)) return;
            const s = start; start = null;
            if(s.moved) { twPos = twClamp(twPos, twExpanded); localStorage.setItem(WHEEL_POS_KEY, JSON.stringify(twPos)); twPlace(); }
            else { twExpanded = !twExpanded; twHover = null; twRender(); twPlace(); vibrate(); }
        };
        hub.addEventListener('pointerup', end);
        hub.addEventListener('pointercancel', () => { start = null; });
        hub.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); twExpanded = !twExpanded; twRender(); twPlace(); } });
    })();
    window.addEventListener('resize', () => { if(coordEditModeActive) { twRender(); twPlace(); } });
    document.addEventListener('keydown', e => {
        if(e.key !== 'Escape') return;
        const mnu = document.getElementById('menu-dropdown');
        if(mnu && mnu.style.display === 'flex') { e.preventDefault(); if(menuPath.length) menuBack(); else toggleMenu(); return; }
        if(document.getElementById('cc-dialog').classList.contains('open')) { e.preventDefault(); ccDialogResolve(null); return; }
        if(document.getElementById('rep-edit-popup').classList.contains('open')) { e.preventDefault(); closeRepEditPopup(); return; }
        if(document.getElementById('shift-edit-popup').classList.contains('open')) { e.preventDefault(); closeShiftEditPopup(); return; }
        const cc = document.getElementById('coord-console');
        if(cc.classList.contains('open') && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('.cc-op-name'))) { e.preventDefault(); closeCoordConsole(); }
    });


