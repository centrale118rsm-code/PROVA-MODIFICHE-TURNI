    // ═══ PERMESSO NOTTE E REPERIBILITÀ ═════════════════════════════════════
    // Chi ha il permesso notte ("pn" sotto la casella) un giorno non può fare la reperibilità del
    // turno che parte quel giorno (13:00 › 13:00 del giorno dopo), né le fasce di quel turno
    // ricevute da un collega. Avviso: finestra quando lo si crea in Modifica turni, vignetta e
    // controlli in rosso, scritta lampeggiante nella casella e messaggio all'apertura dell'app.
    function pnRepOn(rowIdx, d) { return String((((finalData[rowIdx] || [])[d.idx]) || {}).subV || '').trim().toLowerCase() === 'pn'; }
    function pnRepConflictAt(rowIdx, d, R) {
        if(!d || !pnRepOn(rowIdx, d)) return null;
        const iso = repRowDate(rowIdx); if(!iso) return null;
        R = R || repData(); const n = repDateAdd(iso, 1);
        const slots = [[iso, 2], [iso, 3], [n, 0], [n, 1]].filter(([x, s]) => ((R.days[x] || [])[s]) === d.originalName).map(([x, s]) => REP_SLOTS[s].label);
        if(!slots.length) return null;
        return { r: rowIdx, idx: d.idx, iso, name: d.name, orig: d.originalName, tit: R.tit[iso] === d.originalName, slots };
    }
    function pnRepConflicts(rows) {
        const R = repData(), out = [], act = drivers.filter(d => !d.hidden);
        rows.forEach(r => act.forEach(d => { const c = pnRepConflictAt(r, d, R); if(c) out.push(c); }));
        return out;
    }
    function pnRepText(c) {
        const what = c.slots.length === 4 ? (c.tit ? 'è il reperibile dalle 13:00 per 24 ore' : 'copre tutte le fasce') : 'copre ' + (c.slots.length === 1 ? 'la fascia ' : 'le fasce ') + c.slots.join(', ');
        return `${c.name} in permesso notte: non può fare la reperibilità (${what})`;
    }
    // Finestra subito, in Modifica turni, quando una modifica (permesso o reperibilità) crea il problema.
    const pnRepWarned = new Set();
    function pnRepEditCheck(keys, repDates) {
        setTimeout(() => {
            const rows = new Set();
            edRowsOf(keys, repDates).forEach(r => { rows.add(r); if(r > 1) rows.add(r - 1); });
            const all = pnRepConflicts([...rows]), now = new Set(all.map(c => c.orig + '|' + c.iso));
            rows.forEach(r => { const iso = repRowDate(r); [...pnRepWarned].forEach(k => { if(k.endsWith('|' + iso) && !now.has(k)) pnRepWarned.delete(k); }); });
            const fresh = all.filter(c => { const k = c.orig + '|' + c.iso; if(pnRepWarned.has(k)) return false; pnRepWarned.add(k); return true; });
            if(!fresh.length) return;
            vibrate();
            const txt = fresh.map(c => `${repDateLabel(c.iso, true)}: ${pnRepText(c)}.`).join('\n') + '\n\nCambia la reperibilità (ruota › Reperibilità) oppure togli il permesso notte.';
            ccDialog(fresh.length === 1 ? 'Reperibile in permesso notte' : fresh.length + ' reperibili in permesso notte', txt, [{ label: 'Vai al giorno', kind: 'ghost', value: 'go' }, { label: 'Ho capito', kind: 'primary', value: 'ok' }])
                .then(v => { if(v === 'go') calGoToCell(fresh[0].r, fresh[0].idx); });
        }, 220);
    }
    // Messaggio all'apertura: problemi da oggi ai prossimi 60 giorni (una volta al giorno su ogni
    // dispositivo, e di nuovo se ne compare uno nuovo).
    function pnRepStartupItems() {
        try {
            const t = ymd(new Date()), lim = repDateAdd(t, 60), rows = [];
            for(let r = 1; r < finalData.length; r++) { const iso = repRowDate(r); if(iso && iso >= t && iso <= lim) rows.push(r); }
            const list = pnRepConflicts(rows); if(!list.length) return [];
            const sig = t + '#' + list.map(c => c.orig + '|' + c.iso + '|' + c.slots.join(',')).join(';');
            let seen = ''; try { seen = localStorage.getItem('pnrep_seen_v1') || ''; } catch(e) {}
            if(seen === sig) return [];
            try { localStorage.setItem('pnrep_seen_v1', sig); } catch(e) {}
            const text = list.map(c => `<b>${esc(repDateLabel(c.iso, true))}</b>: ${esc(pnRepText(c))}.`).join('\n') + '\n\n<small>Il coordinatore deve cambiare la reperibilità o il permesso.</small>';
            return [{ icon: 'phone_disabled', title: list.length === 1 ? 'REPERIBILE IN PERMESSO NOTTE' : 'REPERIBILI IN PERMESSO NOTTE', text }];
        } catch(e) { console.warn('pnRep', e); return []; }
    }
    // ═══ CONTROLLI: COPERTURA E REGOLE SUI TURNI ═════════════════════════
    // Copertura: persone per mattina/pomeriggio/notte sotto la soglia, giorno senza
    // reperibile, reperibile assente. Regole: notte senza smonto, riposo sotto le 10 ore
    // (il passaggio pomeriggio → mattina della rotazione in quinta dà 10 h 20 ed è ammesso),
    // 7 o più giorni lavorati di fila. Visibili in Modifica turni e nella Panoramica.
    const COVERAGE_DEFAULT = { M:2, P:2, N:1 };   // autisti: 2 ambulanze di mattina e di pomeriggio, 1 di notte
    let coverageMin = Object.assign({}, COVERAGE_DEFAULT), dayChecksCache = null;
    const SHIFT_SPAN = { M:['06:30','13:15'], P:['12:45','20:10'], N:['19:45','24:00'], m:['06:30','13:42'], p:['13:15','20:27'] };
    function shiftSpan(code) {
        const cc = customCodes[code];
        if(cc) { if(cc.kind !== 'work' || !cc.from || !cc.to) return null; const t = x => { const [h, m] = x.split(':').map(Number); return h * 60 + (m || 0); }; let a = t(cc.from), b = t(cc.to); if(b <= a) b += 1440; return [a, b]; }
        const sched = /^[mp]$/.test(code) ? diurniSched(code) : SCHEDULE[code];
        let a, b;
        if(sched && sched.includes('-')) { [a, b] = sched.split('-').map(x => x.trim()); } else if(SHIFT_SPAN[code]) [a, b] = SHIFT_SPAN[code]; else return null;
        const t = x => { const [h, m] = x.split(':').map(Number); return h * 60 + m; };
        let s0 = t(a), e0 = t(b); if(e0 <= s0) e0 += 1440; return [s0, e0];
    }
    // codice del turno lavorato: vuoto per le assenze (malattia "m" e permesso "p" hanno
    // lo stesso codice della mattina e del pomeriggio dei diurnisti)
    function workCode(rowIdx, idx) { const i = computeDayInfo(rowIdx, idx); return i.justified ? '' : i.code; }
    function dayChecks() {
        if(dayChecksCache) return dayChecksCache;
        const days = buildDaysIndex(), rows = {}, R = repData();
        const get = r => rows[r] = rows[r] || { day: [], cells: {} };
        const flag = (r, idx, msg, err) => { const x = get(r); const c = x.cells[idx] = x.cells[idx] || { msgs: [], err: false }; c.msgs.push(msg); if(err) c.err = true; };
        const active = drivers.filter(d => !d.hidden);
        days.forEach((dd, i) => {
            const cnt = { M:0, P:0, N:0 };
            active.forEach(d => { const c = workCode(dd.rowIdx, d.idx); if(c === 'M' || c === 'm' || c === 'M+N') cnt.M++; if(c === 'P' || c === 'p') cnt.P++; if(c === 'N' || c === 'M+N') cnt.N++; });
            const names = { M:'mattina', P:'pomeriggio', N:'notte' };
            ['M','P','N'].forEach(k => { if(cnt[k] < coverageMin[k]) get(dd.rowIdx).day.push(asCoverageMsg(dd, k, cnt[k], names[k])); });
            const iso = ymd(dd.date);
            if(!R.tit[iso]) get(dd.rowIdx).day.push('nessun reperibile dalle 13:00');
            (R.days[iso] || []).forEach((who, s) => {
                if(!who) return; const d = drivers.find(x => x.originalName === who); if(!d) return;
                const meta = ccCodeMeta(computeDayInfo(dd.rowIdx, d.idx));
                if(pnRepOn(dd.rowIdx, d)) return;   // permesso notte: avviso dedicato qui sotto
                if(meta.kind === 'abs') get(dd.rowIdx).day.push(`reperibile ${d.name} assente (${meta.label.toLowerCase()}) nella fascia ${REP_SLOTS[s].label}`);
            });
            active.forEach(d => { const c = pnRepConflictAt(dd.rowIdx, d, R); if(c) get(dd.rowIdx).day.push(pnRepText(c)); });
        });
        active.forEach(d => {
            let run = 0;
            days.forEach((dd, i) => {
                const a = workCode(dd.rowIdx, d.idx), next = days[i + 1] ? workCode(days[i + 1].rowIdx, d.idx) : null;
                if(['M','P','N','m','p','M+N'].includes(a)) { run++; if(run === 7) flag(dd.rowIdx, d.idx, '7\u00b0 giorno lavorato di fila senza riposo'); } else run = 0;
                if(!next) return;
                if(a === 'N' && next && !['SM','S'].includes(next)) { flag(days[i + 1].rowIdx, d.idx, 'dopo la notte manca lo smonto', true); return; }
                if(a === 'M+N' || a === 'N') return;
                const A = shiftSpan(a), B = shiftSpan(next === 'M+N' ? 'M' : next);
                if(A && B) { const gap = 1440 + B[0] - A[1]; if(gap < 600) flag(days[i + 1].rowIdx, d.idx, `riposo di ${Math.floor(gap / 60)} h ${String(gap % 60).padStart(2, '0')} dal turno precedente`, true); }
            });
        });
        asExtraChecks(days, get, flag, active);   // autisti: rotazione, reperibilità, riposi dei diurnisti
        dayChecksCache = { rows, days };
        return dayChecksCache;
    }
    function renderChecksPanel() {
        const { rows, days } = dayChecks();
        const today = new Date(); today.setHours(0, 0, 0, 0); const end = new Date(today); end.setDate(end.getDate() + 30);
        const items = [];
        days.filter(dd => dd.date >= today && dd.date <= end).forEach(dd => {
            const x = rows[dd.rowIdx]; if(!x) return;
            const lbl = dd.date.toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'short' });
            x.day.forEach(m => items.push({ lbl, m, err: /nessun|assente/.test(m) || true }));
            Object.entries(x.cells).forEach(([idx, c]) => { const d = getDriverByIdx(+idx); c.msgs.forEach(m => items.push({ lbl, m: (d ? d.name + ': ' : '') + m, err: c.err })); });
        });
        const list = items.length ? `<ul class="cc-list">${items.slice(0, 40).map(it => `<li><span class="msym" style="color:var(${it.err ? '--cc-neg' : '--cc-warn'})">warning</span><span class="cc-grow">${esc(it.lbl)}<small>${esc(it.m)}</small></span></li>`).join('')}${items.length > 40 ? `<li><span class="cc-grow"><small>\u2026 e altri ${items.length - 40}</small></span></li>` : ''}</ul>`
            : `<div class="cc-empty"><span class="msym">verified</span>Nessun problema di copertura o di regole nei prossimi 30 giorni.</div>`;
        return `<div class="cc-panel"><div class="cc-panel-head"><h3>Controlli dei prossimi 30 giorni</h3><span class="cc-hint">${items.length} ${items.length === 1 ? 'avviso' : 'avvisi'}</span><button class="cc-link" onclick="enterCoordEdit()">Vedi nel calendario</button></div>${list}</div>`;
    }

    // ═══ CASELLE PERSONALIZZATE ══════════════════════════════════════════
    // Il coordinatore crea nuove caselle (Impostazioni › Caselle personalizzate): sigla, testo,
    // colori e tipo. Si mettono nel calendario dalla ruota come un turno (la sigla va nel campo
    // del turno, quindi si possono scrivere anche nell'Excel). Documento impostazioni:
    // customCodes: { SIGLA: { label, bg, fg, kind: 'work' | 'abs' | 'off', from, to } }
    var customCodes = {};
    const CUSTOM_RESERVED = ['M','P','N','S','SM','R','MN','M+N','MAT','POM','NOTT','RIP','SMONTO','MATTINA','POMERIGGIO','NOTTE','RIPOSO','STR'];
    function customSlug(code) { return String(code).toLowerCase().replace(/[^a-z0-9]/g, '_'); }
    function customCode(v) {
        const s = (v || '').toString().trim(); if(!s || (s.charAt(0) >= 'a' && s.charAt(0) <= 'z')) return null;
        return customCodes[s.toUpperCase()] || null;
    }
    function customColors(code) { const k = customSlug(code); return { bg: `--cc-${k}-bg`, fg: `--cc-${k}-fg` }; }
    function customMinutes(c) {
        if(!c || c.kind !== 'work' || !c.from || !c.to) return 0;
        const t = x => { const [h, m] = x.split(':').map(Number); return h * 60 + (m || 0); };
        let a = t(c.from), b = t(c.to); if(b <= a) b += 1440; return b - a;
    }
    // Colori come variabili CSS, così calendario, vista d'insieme, ruota e PDF li trovano come gli altri.
    function applyCustomCodes() {
        let st = document.getElementById('custom-codes-style');
        if(!st) { st = document.createElement('style'); st.id = 'custom-codes-style'; document.head.appendChild(st); }
        st.textContent = ':root{' + Object.keys(customCodes).map(k => { const c = customCodes[k], s = customSlug(k); return `--cc-${s}-bg:${c.bg || '#64748b'};--cc-${s}-fg:${c.fg || '#ffffff'};`; }).join('') + '}';
    }
    function customCellHtml(code, c, repHtml) {
        const label = esc(c.label || code).replace(/\|/g, '<br>');
        const time = c.kind === 'work' && c.from && c.to ? `<div class="time-tag">${esc(c.from)}-${esc(c.to)}</div>` : '';
        return `<div class="cell cc-custom" style="background:var(--cc-${customSlug(code)}-bg);color:var(--cc-${customSlug(code)}-fg);border:1px solid rgba(0,0,0,0.08)"><div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;width:100%;"><div>${label}</div>${time}</div>${repHtml || ''}</div>`;
    }
    function customDayInfo(code, c, rowIdx, colIdx) {
        if(c.kind === 'abs') return { minutes: justifiedDayMinutes(rowIdx, colIdx), code, label: c.label || code, justified: true, custom: true };
        return { minutes: customMinutes(c), code, label: c.label || code, custom: true };
    }
    // ── Pannello nell'area coordinatore ──
    function ccCustomCodesPanel() {
        const keys = Object.keys(customCodes).sort();
        const kindTxt = c => c.kind === 'work' ? `turno ${c.from || '?'}–${c.to || '?'}` : c.kind === 'abs' ? 'assenza giustificata' : 'solo scritta, non conta ore';
        return `<div class="cc-panel"><div class="cc-panel-head"><h3>Caselle personalizzate</h3><span class="cc-hint">nuove caselle per il calendario</span></div><div class="cc-panel-body">
            <p class="cc-note" style="margin-bottom:12px">Crea una casella con la sua sigla, il testo e i colori: compare nella ruota della modifica turni e si può scrivere anche nell’Excel con la stessa sigla. Nel testo, la barra verticale | manda a capo.</p>
            ${keys.length ? `<ul class="cc-list">${keys.map(k => { const c = customCodes[k]; return `<li><span class="cc-code" style="--sw:var(--cc-${customSlug(k)}-bg);--sf:var(--cc-${customSlug(k)}-fg)">${esc(k)}</span><span class="cc-grow">${esc((c.label || k).replace(/\|/g, ' '))}<small>${esc(kindTxt(c))}</small></span><button class="cc-btn ghost" onclick="ccCustomEdit('${esc(k)}')" title="Modifica"><span class="msym">edit</span></button><button class="cc-btn ghost" onclick="ccCustomDelete('${esc(k)}')" title="Elimina"><span class="msym">delete</span></button></li>`; }).join('')}</ul>` : '<p class="cc-note">Nessuna casella personalizzata.</p>'}
            <div class="cc-inline-form" style="margin-top:14px">
                <label class="cc-field" style="max-width:110px">Sigla<input type="text" id="cust-code" class="cc-input" maxlength="6" placeholder="CORSO" oninput="this.value=this.value.toUpperCase();ccCustomPreview()"></label>
                <label class="cc-field" style="flex:1;min-width:170px">Testo nella casella<input type="text" id="cust-label" class="cc-input" maxlength="30" placeholder="CORSO|AGGIORNAMENTO" oninput="ccCustomPreview()"></label>
            </div>
            <div class="cc-inline-form" style="margin-top:10px">
                <label class="cc-field" style="max-width:120px">Sfondo<input type="color" id="cust-bg" class="cc-input" value="#7c3aed" oninput="ccCustomPreview()"></label>
                <label class="cc-field" style="max-width:120px">Testo<input type="color" id="cust-fg" class="cc-input" value="#ffffff" oninput="ccCustomPreview()"></label>
                <label class="cc-field" style="max-width:230px">Tipo<select id="cust-kind" class="cc-input" onchange="ccCustomPreview()"><option value="work">Turno di lavoro (conta le ore)</option><option value="abs">Assenza giustificata</option><option value="off">Solo scritta (non conta ore)</option></select></label>
                <label class="cc-field" style="max-width:110px" id="cust-from-f">Dalle<input type="time" id="cust-from" class="cc-input" value="08:00" oninput="ccCustomPreview()"></label>
                <label class="cc-field" style="max-width:110px" id="cust-to-f">Alle<input type="time" id="cust-to" class="cc-input" value="14:00" oninput="ccCustomPreview()"></label>
            </div>
            <div class="cc-inline-form" style="margin-top:12px;align-items:center">
                <div id="cust-preview" class="cust-preview"></div>
                <button class="cc-btn primary" onclick="ccCustomSave()" style="margin-left:auto"><span class="msym">save</span>Salva casella</button>
            </div>
        </div></div>`;
    }
    function ccCustomPreview() {
        const g = id => document.getElementById(id); if(!g('cust-preview')) return;
        const kind = g('cust-kind').value; ['cust-from-f', 'cust-to-f'].forEach(id => g(id).style.display = kind === 'work' ? '' : 'none');
        const c = { label: g('cust-label').value || g('cust-code').value || 'Anteprima', kind, from: g('cust-from').value, to: g('cust-to').value };
        g('cust-preview').innerHTML = `<div class="cell" style="background:${g('cust-bg').value};color:${g('cust-fg').value};width:120px;height:62px;border:1px solid rgba(0,0,0,0.08)"><div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;width:100%;"><div>${esc(c.label).replace(/\|/g, '<br>')}</div>${kind === 'work' && c.from && c.to ? `<div class="time-tag">${esc(c.from)}-${esc(c.to)}</div>` : ''}</div></div>`;
    }
    function ccCustomEdit(k) {
        const c = customCodes[k]; if(!c) return; const g = id => document.getElementById(id);
        g('cust-code').value = k; g('cust-label').value = c.label || ''; g('cust-bg').value = c.bg || '#7c3aed'; g('cust-fg').value = c.fg || '#ffffff';
        g('cust-kind').value = c.kind || 'work'; g('cust-from').value = c.from || '08:00'; g('cust-to').value = c.to || '14:00';
        ccCustomPreview(); g('cust-code').scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    function ccCustomSave() {
        const g = id => document.getElementById(id);
        const code = g('cust-code').value.trim().toUpperCase(), label = g('cust-label').value.trim(), kind = g('cust-kind').value;
        if(!/^[A-Z0-9+.]{1,6}$/.test(code)) { ccToast('Sigla: da 1 a 6 lettere o numeri.', true); return; }
        if(CUSTOM_RESERVED.includes(code) || SCHEDULE[code] !== undefined) { ccToast(`La sigla ${code} è già usata dai turni normali: scegline un’altra.`, true); return; }
        if(kind === 'work' && (!g('cust-from').value || !g('cust-to').value)) { ccToast('Indica l’orario del turno.', true); return; }
        const obj = { label: label || code, bg: g('cust-bg').value, fg: g('cust-fg').value, kind };
        if(kind === 'work') { obj.from = g('cust-from').value; obj.to = g('cust-to').value; }
        if(!fbReady) { ccToast('Nessuna connessione: casella non salvata.', true); return; }
        customCodes = Object.assign({}, customCodes, { [code]: obj }); applyCustomCodes();
        cfgRef('settings').set({ customCodes: { [code]: obj } }, { merge: true })
            .then(() => { ccToast(`Casella ${code} salvata`); if(finalData.length) renderTable(); renderCcSettings(); })
            .catch(e => ccToast('Salvataggio non riuscito: ' + (e.code || e.message), true));
    }
    async function ccCustomDelete(k) {
        const ok = await ccConfirm(`Eliminare la casella ${k}?`, 'Le caselle già messe nel calendario restano con la sigla ma senza colore e senza ore.', 'Elimina', 'solid-danger');
        if(!ok || !fbReady) return;
        const next = Object.assign({}, customCodes); delete next[k]; customCodes = next; applyCustomCodes();
        cfgRef('settings').update(new firebase.firestore.FieldPath('customCodes', k), firebase.firestore.FieldValue.delete())
            .then(() => { ccToast(`Casella ${k} eliminata`); if(finalData.length) renderTable(); renderCcSettings(); })
            .catch(e => ccToast('Non eliminata: ' + (e.code || e.message), true));
    }
    function saveCoverageMin() {
        const v = k => Math.max(0, Math.min(15, parseInt(document.getElementById('cov-' + k).value) || 0));
        coverageMin = { M: v('M'), P: v('P'), N: v('N') }; dayChecksCache = null;
        if(fbReady) cfgRef('settings').set({ coverageMin }, { merge:true }).then(() => { ccToast('Soglie salvate'); logNote('Impostazioni: ambulanze minime per turno cambiate'); }).catch(() => ccToast('Salvataggio non riuscito.', true));
    }

    // ═══ GRIGLIE CON COLONNA DEI NOMI SEPARATA ═══════════════════════════
    // Due tabelle affiancate: i nomi restano fermi a sinistra e scorre solo la parte destra.
    // Sul telefono è più affidabile della colonna "sticky" (che si sovrapponeva ai numeri).
    function xgHtml(cls, headL, headR, items, minW) {
        const t = side => `<table class="${cls} xg-${side}"${side === 'right' ? ` style="min-width:${minW}px"` : ''}><thead><tr>${side === 'left' ? headL : headR}</tr></thead><tbody>${items.map(it => `<tr ${it.attrs || ''}>${it[side]}</tr>`).join('')}</tbody></table>`;
        return `<div class="xg-split">${t('left')}<div class="xg-scroll">${t('right')}</div></div>`;
    }

    // ═══ OPZIONI DELL'APP (per operatore) ════════════════════════════════
    function prefMe() {
        if(!userIdentity || userIdentity === 'Ospite') return null;
        const u = String(userIdentity).toUpperCase();
        return drivers.find(d => d.name.toUpperCase() === u || (d.originalName || '').toUpperCase() === u) || null;
    }
    function renderOptions() {
        const body = document.getElementById('opt-body'); if(!body) return;
        const named = !!(userIdentity && userIdentity !== 'Ospite');
        const nm = named ? userIdentity : 'Ospite';
        const seg = (key, opts) => `<div class="opt-seg">${opts.map(([v, l, ic]) => `<button class="${prefs[key] === v ? 'on' : ''}" onclick="optSet('${key}','${v}')">${ic ? `<span class="material-icons-round">${ic}</span>` : ''}${l}</button>`).join('')}</div>`;
        const sw = (key, title, sub) => `<div class="option-item"><div class="opt-txt"><span>${title}</span><small>${sub}</small></div><label class="switch"><input type="checkbox" ${prefs[key] ? 'checked' : ''} onchange="optSet('${key}', this.checked)"><span class="slider"></span></label></div>`;
        const nSel = selectedDrivers.size;
        // interruttore acceso se la preferenza non è stata spenta (per le voci nuove senza valore salvato)
        const swOff = (key, title, sub) => `<div class="option-item"><div class="opt-txt"><span>${title}</span><small>${sub}</small></div><label class="switch"><input type="checkbox" ${prefs[key] !== false ? 'checked' : ''} onchange="optSet('${key}', this.checked)"><span class="slider"></span></label></div>`;
        // riquadro di una sezione (27/11/2026): titolo con icona e le sue voci dentro una scheda
        const card = (ic, t, sub, inner, id) => `<section class="opt-card"${id ? ` id="${id}"` : ''}><div class="opt-card-h"><span class="material-icons-round">${ic}</span><div><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>${inner}</section>`;
        const lastUp = (() => { try { const d = new Date(document.lastModified); return d.toLocaleDateString('it-IT', { day:'2-digit', month:'short', year:'numeric' }) + ' - ' + d.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }); } catch(e) { return ''; } })();
        document.getElementById('opt-sub').textContent = named ? 'Le preferenze di ' + nm : 'Preferenze di questo dispositivo';
        body.innerHTML = `
            <div class="opt-hero">
                <div class="opt-av">${esc(named ? nm.slice(0, 2).toUpperCase() : '?')}</div>
                <div class="opt-hero-txt"><b>${esc(nm)}</b><small>${named ? 'Queste scelte valgono solo per te e le ritrovi su ogni dispositivo in cui scegli il tuo nome.' : 'Scegli chi sei per avere preferenze tutte tue, anche su altri dispositivi.'}</small></div>
                <button onclick="closeOptionsModal();setTimeout(requestChangeIdentityDirect,220)"><span class="material-icons-round">switch_account</span>${named ? 'Cambia' : 'Scegli'}</button>
            </div>

            ${card('grid_on', 'Caselle del calendario', 'Cosa si vede dentro ogni casella', `
            <div class="opt-block"><div class="opt-txt"><span>Testo nelle caselle</span><small>Le caselle si adattano da sole alla grandezza scelta.</small></div>
                ${seg('textSize', [['small', 'Piccolo', 'text_decrease'], ['normal', 'Medio', 'text_fields'], ['big', 'Grande', 'text_increase']])}</div>
            ${sw('showTimes', 'Orari dei turnisti', 'Gli orari sotto mattina, pomeriggio, notte e smonto.')}
            ${swOff('showTimesD', 'Orari dei diurnisti', 'Gli orari sotto i turni da diurnista (mattina e pomeriggio in minuscolo).')}
            ${sw('showRepBars', 'Fasce di reperibilità', 'Le barre verdi e rosse delle fasce sotto i turni.')}
            ${sw('highlightMe', 'Evidenzia la mia colonna', 'Colora leggermente la tua colonna per trovarla subito.')}
            ${sw('myColFirst', 'La mia colonna per prima', named ? 'I tuoi turni sempre nella prima colonna, accanto alla data.' : 'Disponibile dopo aver scelto chi sei.')}
            <div class="option-item"><div class="opt-txt"><span>Legenda dei colori</span><small>Cosa vuol dire ogni colore e ogni segno.</small></div>
                <button class="btn-change-identity" onclick="closeOptionsModal();setTimeout(openColorLegend,220)"><span class="material-icons-round" style="font-size:16px">palette</span> APRI</button></div>`)}

            ${card('calendar_month', 'Calendario', 'Come si apre e cosa mostra', `
            <div class="opt-block"><div class="opt-txt"><span>All’apertura mostra</span><small>La schermata con cui parte l’app.</small></div>
                ${seg('startPage', [['calendario', 'Calendario', 'view_agenda'], ['me', 'La mia pagina', 'person']])}</div>
            <div class="opt-block"><div class="opt-txt"><span>Come vedere il calendario</span><small>Tabella: come sempre. Compatta: caselle piccole con la sigla. Giorni: una scheda per giorno, comoda sul telefono.</small></div>
                ${seg('calView', [['normale', 'Tabella', 'table_chart'], ['compatta', 'Compatta', 'view_compact'], ['giorni', 'Giorni', 'view_day']])}</div>
            ${sw('startToday', 'Parti dal giorno di oggi', 'All’apertura il calendario scorre fino a oggi.')}
            <div class="option-item"><div class="opt-txt"><span>Colleghi visibili</span><small>${nSel ? `Ne vedi ${nSel} su ${drivers.filter(d => !d.hidden).length}` : 'Vedi tutti i colleghi'}</small></div>
                <button class="btn-change-identity" onclick="closeOptionsModal();setTimeout(() => toggleDriverFilterDropdown(), 240)"><span class="material-icons-round" style="font-size:16px">groups</span> SCEGLI</button></div>`)}

            ${card('palette', 'Aspetto e velocità', 'Colori, animazioni e vibrazione', `
            <div class="opt-block"><div class="opt-txt"><span>Tema</span><small>Automatico segue l’impostazione del telefono.</small></div>
                ${seg('theme', [['light', 'Chiaro', 'light_mode'], ['dark', 'Scuro', 'dark_mode'], ['auto', 'Automatico', 'brightness_auto']])}</div>
            ${sw('lite', 'Modalità leggera' + (IS_IOS ? ' · consigliata su iPhone' : ''), 'Due mesi alla volta (gli altri si caricano scorrendo) e niente animazioni: più fluido su iPhone e telefoni meno recenti.')}
            ${sw('ticker', 'Striscia dei turni di oggi', 'In alto, sotto la barra: chi fa mattina, pomeriggio e notte oggi.')}
            ${sw('haptics', 'Vibrazione al tocco', 'Una breve vibrazione quando tocchi i pulsanti.')}`)}

            ${card('notifications', 'Notifiche', named ? 'Gli avvisi che arrivano sul tuo telefono' : 'Solo per chi ha scelto il suo nome', `
            ${named ? '' : `<div class="option-item"><div class="opt-txt"><span>Come Ospite non ricevi notifiche</span><small>Gli avvisi sono personali: scegli il tuo nome per riceverli, anche ad app chiusa.</small></div>
                <button class="btn-change-identity" onclick="closeOptionsModal();setTimeout(requestChangeIdentityDirect,220)">SCEGLI</button></div>`}
            ${named ? pushOptionsHtml() : ''}
            ${named ? '' : '<div style="display:none">'}${sw('notifyChanges', 'Cambi ai miei turni', 'Avviso quando un tuo turno viene aggiunto, cambiato o tolto.')}
            ${sw('notifyRep', 'Promemoria reperibilità', 'Il giorno prima, se sei reperibile o copri una fascia.')}
            ${sw('notifyTomorrow', 'Il mio turno di domani', 'Dopo mezzogiorno, un promemoria con il turno del giorno dopo.')}
            ${named ? '' : '</div>'}
            ${isCoordinator ? `<div class="option-item"><div class="opt-txt"><span>Richieste dal portale</span><small>Sei il coordinatore: con le notifiche sul telefono attive ricevi anche ogni nuova richiesta.</small></div></div>` : ''}`)}

            ${card('phone_iphone', 'Calendario del telefono', 'I tuoi turni nel calendario di Google o dell’iPhone', calOptionsHtml(), 'opt-cal')}

            ${card('apps', 'Applicazione', 'Installazione, aggiornamento e ripristino', `
            <div class="option-item" id="install-container"><div class="opt-txt"><span>Installa l’app</span><small>Aggiungila alla schermata Home</small></div>
                <button class="btn-install" id="btn-install-pwa" onclick="installPWA()"><span class="material-icons-round">install_mobile</span> INSTALLA</button></div>
            <div class="option-item"><div class="opt-txt"><span>Aggiorna</span><small>Ricarica l’ultima versione dei turni</small></div>
                <button class="btn-change-identity" onclick="vibrate();location.reload()"><span class="material-icons-round" style="font-size:16px">refresh</span> RICARICA</button></div>
            <div class="opt-reset"><button onclick="optReset()"><span class="material-icons-round">restart_alt</span>Ripristina le mie preferenze</button></div>`)}

            ${card('info', 'Info', '', `
            <div class="info-clock-card">
                <div class="live-clock-date" id="options-live-date">—</div>
                <div class="live-clock-time"><span id="options-live-hm">--:--</span><span class="clock-seconds" id="options-live-s">:--</span></div>
            </div>
            <div class="info-update-card"><span class="material-icons-round">update</span>
                <div><div style="font-weight:800;font-size:0.85rem;color:var(--text-main);">Ultimo aggiornamento dell’app</div>
                <div style="font-size:0.78rem;color:var(--text-sec);" id="options-last-update">${esc(lastUp)}</div></div></div>`)}`;
    }
    function optSet(k, v) {
        vibrate();
        if(k === 'myColFirst' && v && !prefMe()) { ccToast('Scegli prima chi sei', true); renderOptions(); return; }
        setPref(k, v);
        if(k === 'theme' || k === 'startPage' || k === 'textSize' || k === 'look' || k === 'calView') renderOptions();
    }
    async function optReset() {
        const ok = await ccConfirm('Ripristinare le preferenze?', 'Tema, calendario, colleghi visibili e notifiche tornano come all’inizio.', 'Ripristina');
        if(!ok) return;
        prefs = Object.assign({}, PREF_DEFAULTS, { filter: [], updatedAt: Date.now() });
        savePrefsLocal(); prefsSaveRemoteSoon(); applyAllPrefs(); renderOptions();
        ccToast('Preferenze ripristinate');
    }
    // Promemoria del turno di domani (se attivato nelle opzioni), una volta al giorno.
    function checkTomorrowReminder(md) {
        if(!prefs.notifyTomorrow || !md) return;
        const now = new Date(); if(now.getHours() < 12) return;
        const t = new Date(now); t.setDate(t.getDate() + 1); t.setHours(0, 0, 0, 0);
        const key = 'tomorrow_rem_' + (md.originalName || md.name) + '_' + ymd(t);
        if(localStorage.getItem(key)) return;
        const dd = buildDaysIndex().find(x => x.date.getTime() === t.getTime()); if(!dd) return;
        const info = computeDayInfo(dd.rowIdx, md.idx); if(!info.code) return;
        const lbl = info.justified ? ((ABS_TYPES[info.code] || {}).label || info.label) : (SHIFT_NAMES[info.code] || info.label);
        const time = info.justified ? '' : ((/^[mpr]$/.test(info.code) ? diurniSched(info.code, dd.date) : SCHEDULE[info.code]) || '');
        const dateLabel = t.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' });
        notifHistory.unshift({ id: Date.now() + Math.random(), ts: Date.now(), kind:'domani', title:'Il tuo turno di domani', detail:`${dateLabel}: ${lbl}${time ? ' ' + time : ''}`, text:`<b>Domani</b> — ${esc(lbl)}`, read:false, archived:false, date: new Date().toLocaleString(), type:'turno', owner: prefOwner() });
        saveNotifications(); updateBadge();
        try { localStorage.setItem(key, '1'); } catch(e) {}
    }

    // ═══ FERIE E PERMESSI: REGOLE E GIORNI CONSIGLIATI ═════════════════════
    // Le regole le decide il coordinatore (Area coordinatore > Regole ferie).
    // Ferie: periodi di più giorni. Permessi straordinari e recuperi: singoli giorni.
    var PERM_DEFAULT = { max:2, codes:['p','pn','r','l','s','a'], useCoverage:true };
    // totalMax: assenti al massimo nello stesso giorno fra tutte le assenze in totalCodes
    // (ferie, permessi, recuperi, malattia...), vale sia per le ferie sia per i permessi.
    // autisti: al massimo 2 assenti insieme, di qualunque tipo
    var FERIE_DEFAULT = { max:2, totalMax:2, totalCodes:['f','v','p','pn','r','c','m','ng','nl','e','l','s','a','k'], ferieCodes:['f','v'], blockCodes:[], maxOther:0, minDays:3, useCoverage:true, blocked:[], perm: Object.assign({}, PERM_DEFAULT) };
    function frTotal(rules) { return { max: rules.totalMax || FERIE_DEFAULT.totalMax, codes: rules.totalCodes || FERIE_DEFAULT.totalCodes }; }
    var ferieRules = JSON.parse(JSON.stringify(FERIE_DEFAULT));
    const FR_SHIFT = { M:'mattina', P:'pomeriggio', N:'notte' };
    const FR_WORK = ['M','P','N','m','p','M+N'];
    function frBlockedOn(rules, dd) { const iso = ymd(dd.date); return (rules.blocked || []).find(b => b.from && b.from <= iso && iso <= (b.to || b.from)); }
    function ferieDay(dd, active, rules) {
        rules = rules || ferieRules;
        const T = frTotal(rules);
        const fer = [], oth = [], cnt = { M:0, P:0, N:0 }; let tot = 0;
        active.forEach(d => {
            const cell = finalData[dd.rowIdx][d.idx] || {};
            const sub = (cell.subV || '').toString().trim().toLowerCase();
            if(SPECIAL_SUBCODES[sub] !== undefined) {
                if(T.codes.includes(sub)) tot++;
                if(rules.ferieCodes.includes(sub)) fer.push(d);
                else if(rules.blockCodes.includes(sub)) oth.push({ d, sub });
                return;
            }
            const c = workCode(dd.rowIdx, d.idx);
            if(c === 'M' || c === 'm' || c === 'M+N') cnt.M++; if(c === 'P' || c === 'p') cnt.P++; if(c === 'N' || c === 'M+N') cnt.N++;
        });
        const bl = frBlockedOn(rules, dd);
        const low = rules.useCoverage && (cnt.M + cnt.P + cnt.N) > 0 ? ['M','P','N'].filter(k => cnt[k] < coverageMin[k]) : [];
        const reasons = [];
        if(bl) reasons.push('periodo bloccato dal coordinatore' + (bl.note ? ' (' + bl.note + ')' : ''));
        if(fer.length >= rules.max) reasons.push(`già ${fer.length} ${fer.length === 1 ? 'persona' : 'persone'} in ferie (massimo ${rules.max})`);
        else if(tot >= T.max) reasons.push(`già ${tot} assenti in totale (massimo ${T.max})`);
        if(oth.length > rules.maxOther) oth.forEach(o => reasons.push(`${SPECIAL_SUBCODES[o.sub].toLowerCase()} di ${o.d.name}`));
        if(low.length) reasons.push('copertura già sotto il minimo: ' + low.map(k => FR_SHIFT[k]).join(', '));
        const free = Math.max(0, Math.min(rules.max - fer.length, T.max - tot));
        return { fer, oth, cnt, bl, reasons, free, tot, status: reasons.length ? 'no' : (free <= 1 ? 'last' : 'ok') };
    }
    function permRules(rules) { return Object.assign({}, PERM_DEFAULT, (rules || ferieRules).perm || {}); }
    // Un giorno per un permesso straordinario o un recupero. Se si sa chi guarda (me),
    // conta solo se quel giorno lavora e se la sua assenza lascia il turno sotto il minimo.
    function permDay(dd, active, me, rules) {
        rules = rules || ferieRules; const R = permRules(rules), T = frTotal(rules);
        const perm = [], fer = [], absent = [], cnt = { M:0, P:0, N:0 };
        active.forEach(d => {
            const cell = finalData[dd.rowIdx][d.idx] || {};
            const sub = (cell.subV || '').toString().trim().toLowerCase();
            if(SPECIAL_SUBCODES[sub] !== undefined) {
                if(T.codes.includes(sub)) absent.push(d);
                if(R.codes.includes(sub)) perm.push(d); else if(rules.ferieCodes.includes(sub)) fer.push(d);
                return;
            }
            const c = workCode(dd.rowIdx, d.idx);
            if(c === 'M' || c === 'm' || c === 'M+N') cnt.M++; if(c === 'P' || c === 'p') cnt.P++; if(c === 'N' || c === 'M+N') cnt.N++;
        });
        let myShift = null, meAbsent = false;
        if(me) { const info = computeDayInfo(dd.rowIdx, me.idx); if(info.justified) meAbsent = true; else if(FR_WORK.includes(info.code)) myShift = info.code; }
        const bl = frBlockedOn(rules, dd), reasons = [];
        let tight = false;
        if(bl) reasons.push('periodo bloccato dal coordinatore' + (bl.note ? ' (' + bl.note + ')' : ''));
        if(perm.length >= R.max) reasons.push(`già ${perm.length} con permesso o recupero (massimo ${R.max})`);
        if(absent.length >= T.max) reasons.push(`già ${absent.length} assenti in totale (massimo ${T.max})`);
        if(R.useCoverage && (cnt.M + cnt.P + cnt.N) > 0) {
            if(myShift) (myShift === 'M+N' ? ['M','N'] : [myShift.toUpperCase()]).forEach(k => { if(cnt[k] - 1 < coverageMin[k]) reasons.push(`senza di te ${({ M:'la mattina', P:'il pomeriggio', N:'la notte' })[k]} scenderebbe a ${cnt[k] - 1} su ${coverageMin[k]}`); });
            else if(!me) { const low = ['M','P','N'].filter(k => cnt[k] < coverageMin[k]); if(low.length) reasons.push('copertura già sotto il minimo: ' + low.map(k => FR_SHIFT[k]).join(', ')); tight = ['M','P','N'].some(k => cnt[k] === coverageMin[k]); }
        }
        let status;
        if(me && !myShift) status = 'off';
        else if(reasons.length) status = 'no';
        else status = (R.max > 1 && perm.length === R.max - 1) || absent.length === T.max - 1 || tight ? 'last' : 'ok';
        return { perm, fer, absent, cnt, bl, reasons, myShift, meAbsent, free: Math.max(0, R.max - perm.length), status };
    }
    function frShort(a, b) {
        const f = (d, m) => d.getDate() + (m ? ' ' + MONTH_NAMES_IT[d.getMonth()].slice(0, 3) : '');
        if(!b || a.getTime() === b.getTime()) return f(a, true);
        return a.getMonth() === b.getMonth() ? `${a.getDate()}–${f(b, true)}` : `${f(a, true)} – ${f(b, true)}`;
    }
    // Periodi consecutivi (da una data in poi) senza motivi contrari, lunghi almeno minDays.
    function feriePeriods(rules, from, to) {
        const active = drivers.filter(d => !d.hidden), out = [];
        let cur = null;
        const close = () => { if(cur && cur.n >= rules.minDays) out.push(cur); cur = null; };
        buildDaysIndex().forEach(dd => {
            if(dd.date < from || (to && dd.date > to)) return;
            const f = ferieDay(dd, active, rules);
            if(f.status === 'no') { close(); return; }
            if(cur && (dd.date - cur.end) === 86400000) { cur.end = dd.date; cur.n++; cur.minFree = Math.min(cur.minFree, f.free); }
            else { close(); cur = { start: dd.date, end: dd.date, n: 1, minFree: f.free, row: dd.rowIdx }; }
        });
        close();
        out.forEach(p => p.label = frShort(p.start, p.end));
        return out;
    }
    function ferieRulesText(r) {
        const parts = [`massimo ${r.max} in ferie e ${frTotal(r).max} assenti in totale nello stesso giorno`];
        if(r.blockCodes.length) parts.push(`${r.maxOther ? 'al massimo ' + r.maxOther : 'nessun'} ${r.maxOther ? 'tra ' : ''}${r.blockCodes.map(k => SPECIAL_SUBCODES[k].toLowerCase()).join(', ')} nello stesso giorno`);
        if(r.useCoverage) parts.push('copertura minima rispettata');
        if((r.blocked || []).length) parts.push(r.blocked.length === 1 ? '1 periodo bloccato' : r.blocked.length + ' periodi bloccati');
        return 'Regole del coordinatore: ' + parts.join(' · ') + '.';
    }
    function frOrList(a) { return a.length > 1 ? a.slice(0, -1).join(', ') + ' o ' + a[a.length - 1] : (a[0] || ''); }
    function permRulesText(r) {
        const R = permRules(r);
        const parts = [`al massimo ${R.max} con ${frOrList(R.codes.map(k => SPECIAL_SUBCODES[k].toLowerCase()))} nello stesso giorno`, `al massimo ${frTotal(r).max} assenti in totale (ferie comprese)`];
        if(R.useCoverage) parts.push('copertura minima rispettata');
        if((r.blocked || []).length) parts.push(r.blocked.length === 1 ? '1 periodo bloccato' : r.blocked.length + ' periodi bloccati');
        return 'Regole del coordinatore: ' + parts.join(' · ') + '.';
    }

    // ═══ VISTA D'INSIEME DEL CALENDARIO ═════════════════════════════════
    // Tutto l'anno a colpo d'occhio: una riga per giorno, una colonnina per operatore,
    // colori dei turni. Con "Ferie e permessi" i giorni si colorano secondo le regole.
    var calOverview = false, ovAdvice = false, ovRenderTimer = null, ovInfo = {}, ovAdvKind = 'ferie';
    function setCalView(v, opts) {
        const on = v === 'insieme';
        if(on && coordEditModeActive) { ccToast('Chiudi prima la modifica dei turni', true); return; }
        calOverview = on;
        if(opts && opts.advice !== undefined) ovAdvice = !!opts.advice;
        if(opts && opts.kind) ovAdvKind = opts.kind;
        document.body.classList.toggle('cal-overview', on);
        document.body.classList.toggle('ov-adv', on && ovAdvice);
        document.getElementById('ov-view').classList.toggle('open', on);
        if(on) { renderOverview(); setTimeout(ovScrollStart, 30); setCurrentView('Vista d’insieme'); }
        else { ovCloseSheet(); setCurrentView('Tabella Turni'); }
    }
    function toggleCalView() { vibrate(); setCalView(calOverview ? 'dettaglio' : 'insieme'); }

    // ═══ COME VEDERE IL CALENDARIO: tabella, compatta, giorno per giorno ═══════
    // Ognuno sceglie per sé (prefs.calView, salvata con le altre preferenze). La compatta usa le
    // caselle piccole della modifica turni; "Giorni" mostra una scheda per giorno con chi lavora.
    const CAL_VIEWS = [
        ['normale', 'Tabella', 'table_chart', 'Il calendario di sempre, con orari e fasce.'],
        ['compatta', 'Compatta', 'view_compact', 'Caselle piccole con la sigla del turno: più giorni e colleghi nello schermo.'],
        ['giorni', 'Giorno per giorno', 'view_day', 'Una scheda per giorno: chi fa mattina, pomeriggio e notte, assenti e reperibile.']
    ];
    function ddOn() { return !!(prefs && prefs.calView === 'giorni') && !coordEditModeActive && !SERVER_MODE; }
    // nella scelta della vista c'è anche l'anno intero (la vista d'insieme), che non è una preferenza salvata
    const CAL_VIEW_YEAR = ['insieme', 'Anno intero', 'grid_view', 'Tutto l’anno di tutti a colpo d’occhio, con quadratini colorati.'];
    function calViewSet(v) {
        vibrate(); closeCalViewPicker();
        if(v === 'insieme') { if(!calOverview) setCalView('insieme'); return; }
        if(calOverview) setCalView('dettaglio');
        if(prefs.calView !== v) setPref('calView', v);
    }
    function calViewApply(changed) {
        document.body.classList.toggle('cal-compact', calCompactOn());
        if(finalData.length) renderTable(); else ddSync();
        if(changed) setTimeout(() => scrollToToday(true), 60);
    }
    function openCalViewPicker() {
        const cur = calOverview ? 'insieme' : ((prefs && prefs.calView) || 'normale');
        document.getElementById('cvp-card').innerHTML = `<h3>Come vedere il calendario</h3><small>La scelta vale solo per te${prefMe() ? ' e la ritrovi su ogni telefono' : ''}. La cambi quando vuoi, anche da Opzioni.</small>`
            + CAL_VIEWS.concat(coordEditModeActive ? [] : [CAL_VIEW_YEAR]).map(([v, l, ic, d]) => `<button class="cvp-opt ${cur === v ? 'on' : ''}" onclick="calViewSet('${v}')"><span class="material-icons-round">${ic}</span><span><b>${l}</b><small>${d}</small></span></button>`).join('');
        document.getElementById('cvp-modal').classList.add('open');
    }
    function closeCalViewPicker(e) { if(e && e.target !== e.currentTarget) return; const m = document.getElementById('cvp-modal'); if(m) m.classList.remove('open'); }
    let ddFrom = null, ddSig = '';
    function ddSync() {
        const v = document.getElementById('dd-view'); if(!v) return;
        const on = ddOn();
        v.classList.toggle('open', on); document.body.classList.toggle('cal-days', on);
        if(on) ddRender();
    }
    function ddSegHtml() {
        const cur = (prefs && prefs.calView) || 'normale';
        return CAL_VIEWS.map(([v, l, ic]) => `<button class="${cur === v ? 'on' : ''}" onclick="calViewSet('${v}')"><span class="material-icons-round">${ic}</span>${v === 'giorni' ? 'Giorni' : l}</button>`).join('');
    }
    function ddRender() {
        const box = document.getElementById('dd-body'); if(!box) return;
        document.getElementById('dd-seg').innerHTML = ddSegHtml();
        if(!finalData.length) { box.innerHTML = '<div class="dd-none" style="padding:20px;text-align:center">Sto caricando i turni…</div>'; return; }
        const sc = document.getElementById('dd-scroll'), top = sc.scrollTop;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if(ddFrom === null) ddFrom = new Date(today.getFullYear(), today.getMonth(), 1);
        const me = prefMe();
        let active = drivers.filter(d => !d.hidden);
        if(me && prefs.myColFirst && active.includes(me)) active = [me].concat(active.filter(d => d !== me));
        if(selectedDrivers && selectedDrivers.size) active = active.filter(d => selectedDrivers.has(d.idx) || (me && d.idx === me.idx));
        const R = repData();
        let html = '', lastM = '', first = null;
        for(let r = 1; r < finalData.length; r++) {
            const iso = repRowDate(r); if(!iso) continue;
            const dt = repDateObj(iso); if(dt < ddFrom) { if(first === null) first = r; continue; }
            const mk = dt.getFullYear() + '-' + dt.getMonth();
            if(mk !== lastM) { lastM = mk; html += `<div class="dd-mh" id="dd-m-${mk}">${MONTH_NAMES_IT[dt.getMonth()]} ${dt.getFullYear()}</div>`; }
            html += ddDayHtml(r, dt, iso, active, me, R, today);
        }
        const more = ddFrom > repDateObj(repRowDate(1) || ymd(ddFrom)) ? `<button class="dd-more" onclick="ddShowEarlier()"><span class="material-icons-round" style="font-size:16px;vertical-align:-3px">expand_less</span> Mostra i mesi prima</button>` : '';
        box.innerHTML = more + html;
        sc.scrollTop = top;
    }
    function ddShowEarlier() { vibrate(); const sc = document.getElementById('dd-scroll'), h = sc.scrollHeight; ddFrom = new Date(1970, 0, 1); ddRender(); sc.scrollTop += sc.scrollHeight - h; }
    function ddDayHtml(r, dt, iso, active, me, R, today) {
        const row = finalData[r], mName = row[0].v, dNum = parseInt(row[1].v);
        const wd = dt.toLocaleDateString('it-IT', { weekday:'long' });
        const hol = HOLIDAYS[`${dt.getMonth()}-${dt.getDate()}`], red = dt.getDay() === 0 || !!hol || dt.getDay() === 6;
        const isToday = dt.getTime() === today.getTime();
        const dayWeek = RT_WEEKDAY_FMT.format(dt).toUpperCase();
        const g = { M:[], P:[], N:[] }, abs = [];
        const repT = R.tit[iso] || '';
        active.forEach(d => {
            const info = computeDayInfo(r, d.idx), c = info.code;
            if(info.justified && !info.pnTail) { abs.push({ d, meta: ccCodeMeta(info) }); return; }
            const dz = c === 'm' || c === 'p' || (c && c.charAt(0) >= 'a' && c.charAt(0) <= 'z' && !info.justified);
            const lc = String(c || '').toLowerCase();
            const into = lc === 'm+n' || isMN(String(c || '')) ? ['M', 'N'] : (c === 'M' || (dz && lc.startsWith('m'))) ? ['M'] : (c === 'P' || (dz && lc.startsWith('p'))) ? ['P'] : c === 'N' ? ['N'] : [];
            into.forEach(k => g[k].push({ d, dz, mn: into.length > 1, raw: String((row[d.idx] || {}).v || '').trim(), code: c }));
        });
        const person = (x, sig) => {
            const rawVal = String((row[x.d.idx] || {}).v || '').trim();
            const click = `handleCellClick(${r},${x.d.idx},'${mName}',${dNum},'${dayWeek}','${rawVal.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')`.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
            const isRep = repT && (x.d.originalName === repT);
            return `<button class="dd-p${me && x.d.idx === me.idx ? ' me' : ''}${x.dz ? ' dz' : ''}" onclick="${click}">${esc(x.d.name)}${sig || ''}${x.mn ? '<i>M+N</i>' : ''}${x.dz ? `<i style="--sw:var(--c-dM);--sf:var(--t-dM)">${esc(ddDzTime(x.code, iso))}</i>` : ''}${isRep ? '<i class="rp">REP</i>' : ''}</button>`;
        };
        const lbl = (code, time) => `<div class="dd-lbl"><span class="cc-code" style="--sw:var(--c-${code});--sf:var(--t-${code})">${code}</span><small>${esc(time || '')}</small></div>`;
        const t = k => { const v = SCHEDULE[k] || ''; return v ? v.split('-')[0].trim() : ''; };
        let rows = '';
        [['M', 'Mattina'], ['P', 'Pomeriggio'], ['N', 'Notte']].forEach(([k]) => {
            rows += `<div class="dd-row">${lbl(k, t(k))}<div class="dd-ppl">${g[k].length ? g[k].map(x => person(x)).join('') : '<span class="dd-none">Nessuno</span>'}</div></div>`;
        });
        if(abs.length) rows += `<div class="dd-row abs"><div class="dd-lbl"><span class="cc-code" style="--sw:#e2e8f0;--sf:#475569">ASS</span><small>assenti</small></div><div class="dd-ppl">${abs.map(x => person({ d: x.d }, `<i style="${x.meta.colors ? `--sw:var(${x.meta.colors.bg});--sf:var(${x.meta.colors.fg})` : ''}">${esc(x.meta.short)}</i>`)).join('')}</div></div>`;
        if(repT) {
            const n = repDateAdd(iso, 1);
            const ced = [[iso, 2], [iso, 3], [n, 0], [n, 1]].map(([d, s]) => ({ s, who: (R.days[d] || [])[s] || repT })).filter(f => f.who !== repT);
            rows += `<div class="dd-row"><div class="dd-lbl"><span class="cc-code" style="--sw:#dc2626;--sf:#fff">REP</span><small>13 › 13</small></div><div class="dd-ppl dd-rep"><span>Reperibile <b>${esc(repDisplayName(repT))}</b></span>${ced.map(f => `<span class="ced">${REP_SLOTS[f.s].label} <b class="ced">${esc(repDisplayName(f.who))}</b></span>`).join('')}</div></div>`;
        }
        const wk = dt.getDay() === 0 ? ' wk-end' : '';
        return `<div class="dd-day${isToday ? ' today' : ''}${red ? ' red' : ''}${wk}" id="dd-r-${r}"><div class="dd-dh"><span class="dd-dn">${dt.getDate()}</span><span class="dd-dw"><b>${esc(wd)}</b>${hol ? `<small>${esc(hol)}</small>` : ''}</span>${isToday ? '<span class="dd-today">OGGI</span>' : ''}</div><div class="dd-rows">${rows}</div></div>`;
    }
    // ═══ DOMANI A COLPO D'OCCHIO ════════════════════════════════════════════
    // All'apertura (una volta per apertura) una striscia in basso col proprio turno di domani e
    // chi lavora insieme; si chiude da sola dopo qualche secondo, tocco = finestra della casella.
    let tmDone = false, tmTimer = null;
    function tmSoon() {
        if(tmDone || SERVER_MODE || !finalData.length) return;
        clearTimeout(tmTimer); tmTimer = setTimeout(tmShow, 2500);
    }
    function tmShow() {
        if(tmDone) return;
        const gate = document.getElementById('app-gate');
        if(document.documentElement.classList.contains('gate-wait') || (gate && getComputedStyle(gate).display !== 'none') || document.visibilityState === 'hidden') { tmTimer = setTimeout(tmShow, 3000); return; }
        const me = prefMe(); if(!me) { tmDone = true; return; }
        const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 1);
        const iso = ymd(t), r = repRowOfDate(iso); if(!r) { tmDone = true; return; }
        tmDone = true;
        const info = computeDayInfo(r, me.idx), meta = ccCodeMeta(info), c = String(info.code || '');
        const R = repData(), isRep = R.tit[iso] === me.originalName;
        const grp = k => { const u = String(k || ''); return isMN(u) ? ['M', 'N'] : (u === 'M' || u === 'm') ? ['M'] : (u === 'P' || u === 'p') ? ['P'] : u === 'N' ? ['N'] : []; };
        const mine = info.justified ? [] : grp(c);
        let txt;
        if(mine.length) {
            const mates = drivers.filter(d => !d.hidden && d.idx !== me.idx && grp(workCode(r, d.idx)).some(k => mine.includes(k))).map(d => d.name);
            const lab = { M:'Mattina', P:'Pomeriggio', N:'Notte' }, time = c.charAt(0) >= 'a' && c.charAt(0) <= 'z' ? (diurniSched(c, iso) || '') : (SCHEDULE[c.toUpperCase()] || '');
            txt = `<b>${mine.map(k => lab[k]).join(' + ')}</b>${time && mine.length === 1 ? ` <small>${esc(time)}</small>` : ''}${mates.length ? `<span>con ${esc(mates.join(', '))}</span>` : ''}`;
        } else if(meta.kind === 'abs') txt = `<b>${esc(meta.label || meta.short)}</b>`;
        else if(/^SM?$/i.test(c)) txt = `<b>Smonto</b><span>riposo dopo la notte</span>`;
        else txt = `<b>Riposo</b>`;
        if(isRep) txt += `<span class="tm-rep">Reperibile dalle 13:00</span>`;
        let el = document.getElementById('tm-strip');
        if(!el) { el = document.createElement('div'); el.id = 'tm-strip'; document.body.appendChild(el); }
        const row = finalData[r], rawVal = String((row[me.idx] || {}).v || '').trim();
        el.onclick = () => { tmHide(); handleCellClick(r, me.idx, row[0].v, parseInt(row[1].v), RT_WEEKDAY_FMT.format(t).toUpperCase(), rawVal); };
        const st = meta.colors ? `--sw:var(${meta.colors.bg});--sf:var(${meta.colors.fg})` : '--sw:#fff;--sf:#64748b';
        el.innerHTML = `<span class="tm-code cc-code" style="${st}">${esc(meta.short || 'R')}</span><span class="tm-txt"><small>Domani, ${esc(t.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' }))}</small>${txt}</span><button class="tm-x" onclick="event.stopPropagation();tmHide()" aria-label="Chiudi"><span class="material-icons-round">close</span></button>`;
        requestAnimationFrame(() => el.classList.add('show'));
        setTimeout(tmHide, 9000);
    }
    function tmHide() { const el = document.getElementById('tm-strip'); if(el) el.classList.remove('show'); }
    // la striscia non deve coprire le finestre: al primo tocco altrove (menu, casella, pulsanti) sparisce
    document.addEventListener('pointerdown', e => { const el = document.getElementById('tm-strip'); if(el && el.classList.contains('show') && !el.contains(e.target)) tmHide(); }, true);
    // diurnista: il suo orario vero di quel giorno (inizio), non quello dei turnisti
    function ddDzTime(code, iso) {
        let t = ''; try { t = diurniSched(String(code || ''), iso) || ''; } catch(e) {}
        const m = String(t).match(/(\d{1,2}[:.]\d{2})/); return m ? 'D ' + m[1].replace('.', ':') : 'D';
    }
    function ddScrollToday(instant) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const el = document.querySelector('#dd-body .dd-day.today') || document.getElementById('dd-m-' + today.getFullYear() + '-' + today.getMonth());
        const sc = document.getElementById('dd-scroll'); if(!el || !sc) return;
        const mh = document.querySelector('#dd-body .dd-mh'); sc.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - (mh ? mh.offsetHeight : 34) - 6), behavior: instant ? 'auto' : 'smooth' });
    }
    function ddScrollToMonth(mi, y) { const el = document.getElementById('dd-m-' + y + '-' + mi); const sc = document.getElementById('dd-scroll'); if(el && sc) sc.scrollTo({ top: el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop, behavior: 'smooth' }); }
