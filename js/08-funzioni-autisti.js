    // ═══ AUTISTI: FUNZIONI DELL'APP AUTISTI ORIGINALE ═══════════════════
    // Note sui giorni, veicoli dal gestionale, barra scorrevole, infermieri in turno,
    // cane e gioco dell'ambulanza, modalità scherzo, richieste, sessioni, file turni.
    // Tutto ciò che la prova scrive va in documenti "prova_…" (note, scherzi): le collezioni
    // dell'app in uso (note_giorni, prank_mode, gestionale_118, richieste_turni, app_sessions)
    // si leggono soltanto.
    const AS_OPERATORI = ['PAZZAGLIA', 'BARBIERI', 'CENTRALE'];   // ricevono le nuove richieste
    function asMe() { return (userIdentity && userIdentity !== 'Ospite') ? String(userIdentity).toUpperCase() : ''; }
    function asDateKeyOfRow(r) { const row = finalData[r]; return row ? row[0].v + '-' + parseInt(row[1].v) : ''; }
    function asMonthName(mi) { return Object.keys(MONTH_MAP).find(k => MONTH_MAP[k] === mi) || ''; }
    function asStart() { asListenNotes(); asListenVehicles(); asListenPrank(); asListenMyRequests(); asFetchUpdated(); }

    // ── Note sui giorni ─────────────────────────────────────────────────
    // Documento prova_note: { items: { id: { dateKey, iso, mese, giorno, testo, autore,
    // autoreNorm, destinatari: 'all' | [NOMI], createdAt } } }
    let asNotes = {}, asNotesByDate = {}, asNotesLoaded = false, asNotesView = null, asNoteRecip = 'all', asNoteSel = new Set(), asCalloutNext = null;
    function asNoteVisible(n) {
        const me = asMe(); if(!me) return false;
        if(me === 'CENTRALE' || n.autoreNorm === me || n.destinatari === 'all') return true;
        return Array.isArray(n.destinatari) && n.destinatari.some(x => asNorm(x) === me);
    }
    function asRebuildNotes() {
        const by = {};
        Object.keys(asNotes).forEach(id => { const n = Object.assign({ _id: id }, asNotes[id]); if(!n.dateKey || !asNoteVisible(n)) return; (by[n.dateKey] = by[n.dateKey] || []).push(n); });
        Object.keys(by).forEach(k => by[k].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')));
        asNotesByDate = by;
    }
    function asListenNotes() {
        if(!fbReady) return;
        cfgRef('note').onSnapshot(doc => {
            const items = doc.exists ? (doc.data().items || {}) : {};
            if(asNotesLoaded) Object.keys(items).forEach(id => {
                if(asNotes[id]) return;
                const n = items[id]; if(!asNoteVisible(n) || n.autoreNorm === asMe()) return;
                notifHistory.unshift({ id: 'note_' + id, ts: Date.now(), kind: 'nota', title: 'Nuova nota di ' + (n.autore || 'un collega'), detail: `${n.giorno} ${String(n.mese || '').toLowerCase()}: ${n.testo}`, text: `<b>Nuova nota</b> — ${esc(n.testo || '')}`, read: false, archived: false, date: new Date().toLocaleString(), type: 'turno' });
                saveNotifications(); updateBadge();
            });
            asNotes = items; asNotesLoaded = true; asRebuildNotes();
            if(doc.exists && !doc.data().migrated && Object.keys(items).length) asMigrateNotes(items);
            asRefreshMarks();
            if(document.getElementById('as-notes-modal').classList.contains('open') && asNotesView && asNotesView.mode !== 'new') asRenderNotes();
        }, e => console.warn('Note non disponibili:', e));
    }
    // Le note vecchie degli autisti ("Note e appuntamenti") passano una volta sola in "Note e chat"
    // (stesse note degli infermieri, campo noteCoordinatore di prefs). Id fissi "as_…": ripetere
    // non crea doppioni; alla fine il documento vecchio viene segnato migrated e non si rilegge più.
    let asMigrating = false;
    function asMigrateNotes(items) {
        if(asMigrating || SERVER_MODE || !fbReady) return;
        if(!opNotesReady || !drivers.length || !finalData.length) { setTimeout(() => asMigrateNotes(items), 3000); return; }
        asMigrating = true;
        const out = {}, now = new Date().toISOString();
        const orig = n => { const d = noteDriverOf(n); return d ? d.originalName : String(n || '').toUpperCase(); };
        Object.keys(items).forEach(id => {
            const n = items[id] || {}; if(!n.testo) return;
            let date = /^\d{4}-\d{2}-\d{2}$/.test(n.iso || '') ? n.iso : '';
            if(!date && n.mese && n.giorno) { for(let r = 1; r < finalData.length; r++) { if(finalData[r][0].v === n.mese && parseInt(finalData[r][1].v) === parseInt(n.giorno)) { date = repRowDate(r) || ''; break; } } }
            const tos = n.destinatari === 'all' || !Array.isArray(n.destinatari) || !n.destinatari.length ? ['ALL'] : n.destinatari.map(orig);
            tos.forEach((to, k) => {
                const nid = 'as_' + id + (tos.length > 1 ? '_' + k : '');
                if(opNotes[nid]) return;
                out[nid] = { author: orig(n.autoreNorm || n.autore || 'CENTRALE'), to, date, text: String(n.testo).slice(0, 500), pref: '', status: 'vista', createdAt: n.createdAt || now, updatedAt: now, push: false, fromOld: true };
            });
        });
        const done = () => cfgRef('note').set({ migrated: true, migratedAt: now }, { merge: true });
        (Object.keys(out).length ? cfgRef('prefs').set({ [NOTE_FIELD]: out }, { merge: true }).then(done) : done())
            .catch(e => { console.warn('Note vecchie non spostate:', e); asMigrating = false; });
    }
    function asNoteTargets(key, d) { return (asNotesByDate[key] || []).filter(n => n.destinatari === 'all' || (Array.isArray(n.destinatari) && n.destinatari.some(x => asNorm(x) === asNorm(d.name)))); }
    function asOpenNotes(view) {
        vibrate();
        if(!asMe()) { requestChangeIdentityDirect(); return; }
        asNotesView = view; asRenderNotes();
        const m = document.getElementById('as-notes-modal'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10);
    }
    function asOpenDayNotes(r) { const row = finalData[r]; if(!row) return; asOpenNotes({ mode: 'day', key: asDateKeyOfRow(r), mese: row[0].v, giorno: parseInt(row[1].v), row: r }); }
    function asOpenNotesOverview() { asOpenNotes({ mode: 'all' }); }
    function asCloseNotes(e) {
        if(e && e.target !== e.currentTarget) return;
        const m = document.getElementById('as-notes-modal'); m.classList.remove('open'); setTimeout(() => { if(!m.classList.contains('open')) m.style.display = 'none'; }, 220);
        const next = asCalloutNext; asCalloutNext = null; if(next) setTimeout(next, 230);
    }
    function asNoteItem(n, showDate) {
        const canDel = n.autoreNorm === asMe() || asMe() === 'CENTRALE';
        const dest = n.destinatari === 'all' ? 'Tutti i colleghi' : (Array.isArray(n.destinatari) ? n.destinatari.join(', ') : '');
        return `<div class="as-note"><span class="material-icons-round as-note-ic">sticky_note_2</span><div class="as-note-b"><div class="as-note-t">${esc(n.testo || '')}</div>
            <div class="as-note-m">${showDate ? `<span>${n.giorno} ${esc(String(n.mese || '').slice(0, 3).toLowerCase())}</span>` : ''}<span>${esc(n.autore || 'Anonimo')}</span><span>${esc(dest)}</span></div></div>
            ${canDel ? `<button class="as-note-del" onclick="asDeleteNote('${n._id}')" title="Elimina"><span class="material-icons-round">delete_outline</span></button>` : ''}</div>`;
    }
    function asRenderNotes() {
        const v = asNotesView || { mode: 'all' }, body = document.getElementById('as-notes-body'), title = document.getElementById('as-notes-title'), sub = document.getElementById('as-notes-sub');
        if(v.mode === 'new') {
            title.textContent = 'Nuova nota'; sub.textContent = 'Visibile ai colleghi che scegli';
            const names = drivers.filter(d => !d.hidden).map(d => d.name);
            body.innerHTML = `<label class="as-f">Giorno<input type="date" id="as-note-date" value="${v.iso || ymd(new Date())}"></label>
                <label class="as-f">Testo<textarea id="as-note-text" rows="4" placeholder="Scrivi la nota"></textarea></label>
                <div class="as-seg"><button class="${asNoteRecip === 'all' ? 'on' : ''}" onclick="asSetRecip('all')">Tutti i colleghi</button><button class="${asNoteRecip === 'custom' ? 'on' : ''}" onclick="asSetRecip('custom')">Solo alcuni</button></div>
                <div class="as-help">${asNoteRecip === 'all' ? 'Nota pubblica: la vedono tutti i colleghi e la Centrale, e a tutti arriva una notifica.' : 'Nota riservata: la vedono solo i colleghi scelti (oltre a te e alla Centrale).'}</div>
                ${asNoteRecip === 'custom' ? `<div class="as-chips">${names.map(n => `<button class="${asNoteSel.has(n) ? 'on' : ''}" onclick="asToggleRecip('${esc(n)}')">${esc(n)}</button>`).join('')}</div>` : ''}
                <div class="as-actions"><button onclick="asNotesBack()">Annulla</button><button class="pri" onclick="asSaveNote()">Salva nota</button></div>`;
            return;
        }
        if(v.mode === 'callout') {
            title.textContent = 'Nota per te'; sub.textContent = `${v.giorno} ${String(v.mese).toLowerCase()}`;
            body.innerHTML = v.notes.map(n => asNoteItem(n)).join('') + `<div class="as-actions"><button class="pri" onclick="asCloseNotes()">Vedi i turni del giorno</button></div>`;
            return;
        }
        let list;
        if(v.mode === 'day') { title.textContent = 'Note del giorno'; sub.textContent = `${v.giorno} ${String(v.mese).toLowerCase()}`; list = asNotesByDate[v.key] || []; }
        else { title.textContent = 'Note e appuntamenti'; sub.textContent = 'Tutte le note visibili a te'; list = [].concat(...Object.values(asNotesByDate)).sort((a, b) => (a.iso || '').localeCompare(b.iso || '')); }
        body.innerHTML = (list.length ? list.map(n => asNoteItem(n, v.mode === 'all')).join('') : `<div class="as-empty">Nessuna nota${v.mode === 'day' ? ' per questo giorno' : ''}.</div>`)
            + (asMe() === 'OSPITE' ? '' : `<div class="as-actions"><button class="pri" onclick="asNewNote()"><span class="material-icons-round">add</span>Nuova nota</button></div>`);
    }
    function asNewNote() {
        vibrate(); const v = asNotesView || {};
        let iso = ymd(new Date());
        if(v.mode === 'day' && v.row) { const d = repRowDate(v.row); if(d) iso = d; }
        asNoteRecip = 'all'; asNoteSel = new Set();
        asNotesView = { mode: 'new', iso, back: v }; asRenderNotes();
    }
    function asNotesBack() { asNotesView = (asNotesView && asNotesView.back) || { mode: 'all' }; asRenderNotes(); }
    function asSetRecip(m) { vibrate(); const t = document.getElementById('as-note-text').value, d = document.getElementById('as-note-date').value; asNoteRecip = m; asRenderNotes(); document.getElementById('as-note-text').value = t; document.getElementById('as-note-date').value = d; }
    function asToggleRecip(n) { vibrate(); const t = document.getElementById('as-note-text').value, d = document.getElementById('as-note-date').value; if(asNoteSel.has(n)) asNoteSel.delete(n); else asNoteSel.add(n); asRenderNotes(); document.getElementById('as-note-text').value = t; document.getElementById('as-note-date').value = d; }
    async function asSaveNote() {
        const testo = document.getElementById('as-note-text').value.trim(), iso = document.getElementById('as-note-date').value;
        if(!testo) { ccToast('Scrivi il testo della nota.', true); return; }
        if(!iso) { ccToast('Scegli il giorno.', true); return; }
        if(asNoteRecip === 'custom' && !asNoteSel.size) { ccToast('Scegli almeno un collega, oppure "Tutti i colleghi".', true); return; }
        if(!fbReady) { ccToast('Nessuna connessione: nota non salvata.', true); return; }
        const p = iso.split('-'), mese = asMonthName(+p[1] - 1), giorno = +p[2];
        const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const note = { dateKey: mese + '-' + giorno, iso, mese, giorno, testo, autore: asMe() === 'CENTRALE' ? 'Centrale Operativa 118' : userIdentity, autoreNorm: asMe(),
            destinatari: asNoteRecip === 'all' ? 'all' : [...asNoteSel].map(n => n.toUpperCase()), createdAt: new Date().toISOString() };
        try { vibrate(); await cfgRef('note').set({ items: { [id]: note } }, { merge: true }); ccToast('Nota salvata'); asNotesBack(); }
        catch(e) { ccToast('Nota non salvata: ' + (e.code || e.message), true); }
    }
    async function asDeleteNote(id) {
        const ok = await ccConfirm('Eliminare questa nota?', 'La nota sparisce per tutti.', 'Elimina', 'solid-danger'); if(!ok) return;
        try { await cfgRef('note').update({ ['items.' + id]: firebase.firestore.FieldValue.delete() }); ccToast('Nota eliminata'); }
        catch(e) { ccToast('Non eliminata: ' + (e.code || e.message), true); }
    }
    // Tocco su una casella destinataria di una nota: prima la nota, poi il riepilogo del turno.
    function asNoteCalloutFirst(r, colIdx, next) {
        const d = getDriverByIdx(colIdx); if(!d) return false;
        const notes = asNoteTargets(asDateKeyOfRow(r), d); if(!notes.length) return false;
        const row = finalData[r]; asCalloutNext = next;
        asOpenNotes({ mode: 'callout', notes, mese: row[0].v, giorno: parseInt(row[1].v) });
        return true;
    }

    // ── Veicoli dal gestionale 118 (solo lettura) ───────────────────────
    let asVehicles = {};   // "MESE-giorno" -> [{ operazione, veicolo, officina, problema, ora }]
    function asListenVehicles() {
        if(!fbReady) return;
        db.collection('gestionale_118').doc('tickets').onSnapshot(doc => {
            const m = {};
            const add = (iso, x) => { const d = new Date(iso); if(isNaN(d)) return; const k = asMonthName(d.getMonth()) + '-' + d.getDate(); (m[k] = m[k] || []).push(x); };
            if(doc.exists) {
                try {
                    JSON.parse(doc.data().data || '[]').forEach(tk => {
                        if(tk.dataAppuntamento && tk.stato === 'segnalato') add(tk.dataAppuntamento, { operazione: 'Appuntamento', veicolo: tk.mezzo, officina: tk.officinaAppuntamento || 'Officina', problema: tk.problema || '', ora: tk.dataAppuntamentoOra || '' });
                        if(tk.dataStimataConsegna && tk.stato === 'in_officina') add(tk.dataStimataConsegna, { operazione: 'Ritiro', veicolo: tk.mezzo, officina: tk.officina || 'Officina', problema: tk.problema || '', ora: tk.dataStimataConsegnaOra || '' });
                    });
                } catch(e) { console.warn('Ticket veicoli non leggibili:', e); }
            }
            asVehicles = m; asRefreshMarks();
        }, e => console.warn('Gestionale veicoli non disponibile:', e));
    }

    // ── Infermieri in turno (file dell'app infermieri, solo lettura) ────
    let asNurses = null;
    async function asLoadNurses() {   // stessi dati di "Infermieri in turno" (Firebase dell'app infermieri)
        await loadOtherTeam(); asNurses = otherTeam;
    }
    function asNursesOn(mese, giorno) {
        if(!asNurses) return null;
        const row = asNurses.find((x, i) => i > 0 && x[0].v === mese && parseInt(x[1].v) === giorno); if(!row) return null;
        const out = { M: [], P: [], N: [] }, head = asNurses[0];
        for(let c = 3; c < head.length; c++) {
            const cell = row[c] || {}, sub = String(cell.subV || '').trim().toLowerCase();
            if(SPECIAL_SUBCODES[sub] !== undefined) continue;
            let v = String(cell.v || '').trim(); const si = v.indexOf('/'); if(si >= 0) v = v.slice(0, si).trim();
            const u = v.toUpperCase().replace(/\s+/g, ''), nm = String(head[c]).charAt(0) + String(head[c]).slice(1).toLowerCase();
            if(u === 'M' || u === 'M+N' || u === 'MN') out.M.push(nm); if(u === 'P') out.P.push(nm); if(u === 'N' || u === 'M+N' || u === 'MN') out.N.push(nm);
        }
        return out;
    }

    // Sezioni in più nel riepilogo del turno: note del giorno e veicoli (gli infermieri in turno
    // li mostra la base, con le stesse schede degli autisti).
    function asShiftModalExtras(r, uShift) {
        const row = finalData[r]; if(!row) return '';
        const mese = row[0].v, giorno = parseInt(row[1].v), key = mese + '-' + giorno;
        let h = '';
        const notes = [];   // le note del giorno ora sono quelle di "Note e chat" (sezione della base)
        if(false) h += `<div class="as-sec"><span class="material-icons-round">sticky_note_2</span>Note del giorno<button onclick="closeShiftModal();setTimeout(() => asOpenDayNotes(${r}), 220)">${notes.length ? 'Apri' : 'Aggiungi'}</button></div>`;
        if(notes.length) h += notes.map(n => `<div class="as-line">${esc(n.testo || '')}<small>${esc(n.autore || '')}</small></div>`).join('');
        const veh = asVehicles[key] || [];
        if(veh.length) {
            h += `<div class="as-sec amber"><span class="material-icons-round">directions_car</span>Gestione veicoli<button onclick="window.open('https://centrale118rsm-code.github.io/Veicoli-118/','_blank')">Apri app</button></div>`;
            h += veh.map(t => `<div class="as-line"><b>${esc(t.operazione)}${t.ora ? ' · ' + esc(t.ora) : ''}</b> ${esc(t.veicolo || '')} ${t.officina ? 'presso ' + esc(t.officina) : ''}${t.problema ? `<small>${esc(t.problema)}</small>` : ''}</div>`).join('');
        }
        return h;
    }

    // ── Segni sul calendario: note, veicoli, ambulanza del gioco ────────
    function asAmbulanceMap() {
        let map = {}; try { map = JSON.parse(localStorage.getItem('ambulance_dates_map') || '{}'); } catch(e) {}
        const byKey = {}; let changed = false;
        buildDaysIndex().forEach(dd => drivers.forEach(d => { if(workCode(dd.rowIdx, d.idx) === 'M') (byKey[d.originalName + '-' + dd.month] = byKey[d.originalName + '-' + dd.month] || []).push(dd.day); }));
        Object.keys(byKey).forEach(k => { if(!map[k]) { const a = byKey[k]; map[k] = a[Math.floor(Math.random() * a.length)]; changed = true; } });
        if(changed) try { localStorage.setItem('ambulance_dates_map', JSON.stringify(map)); } catch(e) {}
        return map;
    }
    let asAmbMap = null, asAmbFor = null;
    function asRefreshMarks() {
        if(!finalData.length) return;
        if(asAmbFor !== finalData) { asAmbMap = asAmbulanceMap(); asAmbFor = finalData; }
        document.querySelectorAll('#table-body tr[data-row]').forEach(tr => {
            const r = +tr.dataset.row, key = asDateKeyOfRow(r), notes = [], veh = asVehicles[key] || [];
            const td = tr.querySelector('td.td-date');
            if(td) { let dot = td.querySelector('.as-note-dot'); if(notes.length && !dot) { dot = document.createElement('span'); dot.className = 'as-note-dot'; td.appendChild(dot); } else if(!notes.length && dot) dot.remove(); }
            tr.querySelectorAll('td[data-col]').forEach(c => {
                const d = getDriverByIdx(+c.dataset.col); if(!d) return;
                c.classList.toggle('as-note-target', notes.length > 0 && asNoteTargets(key, d).length > 0);
                const cell = c.querySelector('.cell'); if(!cell) return;
                const code = workCode(r, d.idx), working = ['M', 'P', 'm', 'p', 'M+N'].includes(code);
                let vb = cell.querySelector('.as-veh'); if(veh.length && working && !vb) { vb = document.createElement('span'); vb.className = 'as-veh'; vb.title = 'Veicoli: ' + veh.map(t => t.operazione + ' ' + (t.veicolo || '')).join(', '); vb.innerHTML = '<span class="material-icons-round">directions_car</span>'; cell.appendChild(vb); } else if((!veh.length || !working) && vb) vb.remove();
                const amb = code === 'M' && asAmbMap && asAmbMap[d.originalName + '-' + finalData[r][0].v] == parseInt(finalData[r][1].v);
                let ab = cell.querySelector('.as-amb'); if(amb && !ab) { ab = document.createElement('img'); ab.src = 'ambulanza.png'; ab.className = 'as-amb'; ab.alt = ''; ab.onclick = asOpenGame; cell.appendChild(ab); } else if(!amb && ab) ab.remove();
            });
        });
        asBuildTicker();
    }

    // ── Striscia fissa sotto la barra in alto: chi fa mattina, pomeriggio e notte oggi ──
    // (27/11/2026, richiesta di Mat: non scorre più). Se i nomi interi non ci stanno, tutti
    // i nomi diventano abbreviati (Bar, Volp…): l'abbreviazione più corta, almeno 3 lettere,
    // che non si confonde con un altro autista.
    function asShortNames() {
        const names = drivers.map(d => d.name.toUpperCase()), out = {};
        names.forEach(n => {
            let k = 3;
            while(k < n.length && names.some(o => o !== n && o.startsWith(n.slice(0, k)))) k++;
            const s = n.slice(0, k); out[n] = s.charAt(0) + s.slice(1).toLowerCase();
        });
        return out;
    }
    function asBuildTicker() {
        const bar = document.getElementById('as-ticker'); if(!bar) return;
        const show = prefs.ticker !== false && !coordEditModeActive && finalData.length > 1;
        const t = new Date(); t.setHours(0, 0, 0, 0);
        const dd = show ? buildDaysIndex().find(x => x.date.getTime() === t.getTime()) : null;
        const by = { M: [], P: [], N: [] };
        if(dd) drivers.filter(d => !d.hidden).forEach(d => { const c = workCode(dd.rowIdx, d.idx), n = d.name.toUpperCase(); if(c === 'M' || c === 'm' || c === 'M+N') by.M.push(n); if(c === 'P' || c === 'p') by.P.push(n); if(c === 'N' || c === 'M+N') by.N.push(n); });
        const parts = [['M', 'Mattina', 'M'], ['P', 'Pomeriggio', 'P'], ['N', 'Notte', 'N']].filter(([k]) => by[k].length);
        document.body.classList.toggle('as-has-ticker', parts.length > 0);
        if(!parts.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
        const cap = n => n.charAt(0) + n.slice(1).toLowerCase();
        const html = (lbl, nm) => '<div class="as-fix">' + parts.map(([k, l, s]) => `<span class="as-fix-${k}"><b>${lbl === 'long' ? l : s}</b> ${esc(by[k].map(nm).join(', '))}</span>`).join('') + '</div>';
        bar.style.display = 'block';
        bar.title = parts.map(([k, l]) => l + ': ' + by[k].map(cap).join(', ')).join(' · ');
        const short = asShortNames();
        // dalla versione più lunga alla più corta: si tiene la prima che sta nella striscia
        const tries = [html('long', cap), html('short', cap), html('short', n => short[n] || cap(n))];
        for(const h of tries) { bar.innerHTML = h; const f = bar.firstChild; f.classList.add('measure'); const fits = f.scrollWidth <= f.clientWidth + 1; f.classList.remove('measure'); if(fits) break; }
    }

    let asTickerRz = null;
    window.addEventListener('resize', () => { clearTimeout(asTickerRz); asTickerRz = setTimeout(() => { try { if(document.body.classList.contains('as-has-ticker')) asBuildTicker(); } catch(e) {} }, 200); });

    // ── Cane (una sola ambulanza) e gioco dell'ambulanza ────────────────
    let asGame = null;
    function asOpenGame(e) {
        if(e) e.stopPropagation(); vibrate();
        const m = document.getElementById('as-game'); m.style.display = 'flex'; requestAnimationFrame(() => m.classList.add('open'));
        setTimeout(asInitGame, 60);
    }
    function asCloseGame() { const m = document.getElementById('as-game'); m.classList.remove('open'); setTimeout(() => { if(!m.classList.contains('open')) m.style.display = 'none'; }, 220); asGame = null; }
    function asInitGame() {
        const cv = document.getElementById('as-game-canvas'), box = document.getElementById('as-game-box'); if(!cv || !box) return;
        cv.width = box.offsetWidth; cv.height = box.offsetHeight;
        const ctx = cv.getContext('2d');
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#6d4c41'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center'; ctx.fillText('TRASCINA PER PULIRE', cv.width / 2, cv.height / 2);
        asGame = { cv, ctx, box, cleaning: false, n: 0 };
        document.getElementById('as-game-fill').style.width = '0%';
        if(!cv._asBound) {
            cv._asBound = true;
            const down = e => { if(asGame) { asGame.cleaning = true; asGameMove(e); } };
            cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', asGameMove);
            window.addEventListener('pointerup', () => { if(asGame) asGame.cleaning = false; });
            cv.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
        }
    }
    function asGameMove(e) {
        const g = asGame; if(!g || !g.cleaning) return;
        const rc = g.cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
        g.ctx.globalCompositeOperation = 'destination-out'; g.ctx.beginPath(); g.ctx.arc(x, y, 30, 0, Math.PI * 2); g.ctx.fill();
        if(Math.random() > 0.8) { const b = document.createElement('div'); b.className = 'as-bubble'; const s = 10 + Math.random() * 20; b.style.cssText = `width:${s}px;height:${s}px;left:${x}px;top:${y}px`; g.box.appendChild(b); setTimeout(() => b.remove(), 1000); }
        g.n++; const pct = Math.min(100, g.n / 200 * 100);
        document.getElementById('as-game-fill').style.width = pct + '%';
        if(pct >= 100) g.ctx.clearRect(0, 0, g.cv.width, g.cv.height);
    }

    // ── Modalità scherzo (decisa dall'admin, per operatore) ─────────────
    // Documento prova_prank: { modes: { NOME: 'off' | 'kid' | 'demon' } }
    let asPrankModes = {}, asPrankMode = 'off', asPrankTimer = null;
    const AS_PRANK = { kid: { banner: n => `Ciao ${n}! Oggi giochiamo insieme!`, bits: ['🎈', '🎊', '✨', '🎉', '🌟', '🦄', '🍭', '🌈'], train: ['🚂🚃🚃🚃', '🦄🌈', '🎈🎈🎈'] },
                      demon: { banner: n => `${n}... non puoi sfuggirmi`, bits: ['🔥', '💀', '😈', '⚡', '🖤', '👹'], train: ['😈🔥🔥', '💀💀💀', '👹⚡'] } };
    function asListenPrank() {
        if(!fbReady) return;
        cfgRef('prank').onSnapshot(doc => { asPrankModes = doc.exists ? (doc.data().modes || {}) : {}; asApplyPrank(); if(document.getElementById('admin-tab-scherzo') && document.getElementById('admin-tab-scherzo').classList.contains('active')) asRenderPrankAdmin(); }, e => console.warn('Scherzi non disponibili:', e));
    }
    function asApplyPrank() {
        const me = asMe(), mode = me && me !== 'CENTRALE' ? (asPrankModes[me] || 'off') : 'off';
        asPrankMode = AS_PRANK[mode] ? mode : 'off';
        document.body.classList.toggle('as-prank-kid', asPrankMode === 'kid');
        document.body.classList.toggle('as-prank-demon', asPrankMode === 'demon');
        const b = document.getElementById('as-prank-banner');
        if(b) { b.textContent = asPrankMode === 'off' ? '' : AS_PRANK[asPrankMode].banner((userIdentity || '').split(' ')[0]); b.classList.toggle('show', asPrankMode !== 'off'); }
        clearTimeout(asPrankTimer); if(asPrankMode !== 'off') asPrankTrainSoon();
    }
    document.addEventListener('pointerdown', e => {
        if(asPrankMode === 'off' || document.body.classList.contains('lite')) return;
        const set = AS_PRANK[asPrankMode].bits;
        for(let i = 0; i < 6; i++) {
            const el = document.createElement('div'); el.className = 'as-bit'; el.textContent = set[Math.floor(Math.random() * set.length)];
            const a = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 70;
            el.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;--dx:${Math.cos(a) * dist}px;--dy:${Math.sin(a) * dist - 35}px`;
            document.body.appendChild(el); setTimeout(() => el.remove(), 1100);
        }
    }, { passive: true });
    function asPrankTrainSoon() {
        asPrankTimer = setTimeout(() => {
            if(asPrankMode === 'off') return;
            if(!document.body.classList.contains('lite')) { const set = AS_PRANK[asPrankMode].train, el = document.createElement('div'); el.className = 'as-train'; el.textContent = set[Math.floor(Math.random() * set.length)]; el.style.top = (100 + Math.random() * 140) + 'px'; document.body.appendChild(el); setTimeout(() => el.remove(), 8300); }
            asPrankTrainSoon();
        }, 18000 + Math.random() * 17000);
    }
    function asRenderPrankAdmin() {
        const el = document.getElementById('as-prank-admin'); if(!el) return;
        const lbl = { off: 'Spento', kid: 'Giocoso', demon: 'Demoniaco' };
        el.innerHTML = drivers.map(d => { const k = String(d.originalName).toUpperCase(), cur = asPrankModes[k] || 'off';
            return `<div class="as-prank-row"><b>${esc(d.name)}</b><div class="as-seg">${['off', 'kid', 'demon'].map(m => `<button class="${cur === m ? 'on' : ''}" onclick="asSetPrank('${k}','${m}')">${lbl[m]}</button>`).join('')}</div></div>`; }).join('');
    }
    function asSetPrank(name, mode) {
        vibrate(); if(!fbReady) { showAdminToast('Nessuna connessione'); return; }
        cfgRef('prank').set({ modes: { [name]: mode } }, { merge: true }).then(() => showAdminToast('Scherzo aggiornato')).catch(e => showAdminToast('Errore: ' + (e.code || e.message)));
    }
    // Bibbia del portale Richieste: si legge soltanto (la modifica resta nell'app autisti in uso).
    function asRenderBibbiaAdmin() {
        const el = document.getElementById('as-bibbia-admin'); if(!el) return;
        const tipi = asBibbia.tipiRichiesta || {};
        el.innerHTML = `<p class="as-help">Impostazioni del portale Richieste autisti, lette dall'app in uso: si cambiano da lì, la prova non le modifica.</p>
            <div class="as-line"><b>Cambi turno applicati da soli:</b> ${asBibbia.autoApplyCambioTurno ? 'sì' : 'no'}</div>
            <div class="as-line"><b>Cessioni di reperibilità applicate da sole:</b> ${asBibbia.autoSyncReperibilita !== false ? 'sì' : 'no'}</div>
            <div class="as-line"><b>Richieste attive:</b> ${esc(Object.keys(tipi).filter(k => tipi[k]).map(k => k.replace(/_/g, ' ')).join(', ') || 'nessuna')}</div>`;
    }

    // ── Richieste (portale autisti): avviso al richiedente quando viene inserita ──
    let asReqState = {}, asReqLoaded = false;
    function asListenMyRequests() {
        if(!fbReady) return;
        db.collection('richieste_turni').onSnapshot(snap => {
            snap.docChanges().forEach(ch => {
                const r = ch.doc.data(), id = ch.doc.id, was = asReqState[id];
                asReqState[id] = !!r.insertedInShifts;
                if(!asReqLoaded || ch.type !== 'modified' || was || !r.insertedInShifts) return;
                if(asNorm(r.name) !== asMe()) return;
                const seenKey = 'req_inserted_' + id; try { if(localStorage.getItem(seenKey)) return; localStorage.setItem(seenKey, '1'); } catch(e) {}
                const tipo = (RICHIESTE_TYPE_LABELS && RICHIESTE_TYPE_LABELS[r.type]) || String(r.type || 'Richiesta').replace(/_/g, ' ');
                const dal = r.dateFrom ? new Date(r.dateFrom).toLocaleDateString('it-IT') : '', al = r.dateTo ? new Date(r.dateTo).toLocaleDateString('it-IT') : dal;
                notifHistory.unshift({ id: 'ins_' + id, ts: Date.now(), kind: 'richiesta', title: 'Richiesta inserita nei turni', detail: `${tipo}${dal ? ': dal ' + dal + ' al ' + al : ''}`, text: `<b>Richiesta inserita</b> — ${esc(tipo)}`, read: false, archived: false, date: new Date().toLocaleString(), type: 'turno' });
                saveNotifications(); updateBadge();
                showChangeAlert([`<b>✅ Richiesta inserita nei turni</b><br><span style="font-size:0.85rem;color:var(--text-sec)">${esc(tipo)}${dal ? ' · dal ' + dal + ' al ' + al : ''}</span>`]);
            });
            asReqLoaded = true;
        }, e => console.warn('Richieste non disponibili:', e));
    }

    // ── Sessioni dell'app autisti in uso (sola lettura, per l'area admin) ──
    // Le stesse sessioni lette una volta sola (pannello admin): ultimi giorni, sola lettura.
    async function asSessionsGet(since) {
        if(!fbReady) return { docs: [] };
        const ms = s => { const t = Date.parse(s || ''); return isNaN(t) ? null : { toMillis: () => t }; };
        const snap = await db.collection('app_sessions').orderBy('startedAt', 'desc').limit(400).get();
        const from = since && since.toMillis ? since.toMillis() : 0;
        return { docs: snap.docs.map(d => { const x = d.data(), last = ms(x.lastActiveAt), st = ms(x.startedAt);
            return { id: d.id, data: () => ({ identity: x.user && x.user !== 'Non identificato' ? x.user : null, device: x.device || '', userAgent: x.userAgent || '',
                currentView: x.views ? Object.keys(x.views).slice(-1)[0] || 'App autisti in uso' : 'App autisti in uso',
                viewHistory: x.views ? Object.keys(x.views).map(v => ({ view: v })) : [],
                lastActive: last, startTime: st, online: !!last && Date.now() - last.toMillis() < 100000 }) }; })
            .filter(d => { const t = d.data().startTime; return !from || (t && t.toMillis() >= from); }) };
    }
    function asSessionsQuery() {
        return { onSnapshot(cb, err) {
            if(!fbReady) return () => {};
            const ms = s => { const t = Date.parse(s || ''); return isNaN(t) ? null : { toMillis: () => t }; };
            return db.collection('app_sessions').orderBy('startedAt', 'desc').limit(50).onSnapshot(snap => {
                cb({ docs: snap.docs.map(d => { const x = d.data(); const last = ms(x.lastActiveAt);
                    return { id: d.id, data: () => ({ identity: x.user && x.user !== 'Non identificato' ? x.user : null, device: x.device || '', currentView: x.views ? Object.keys(x.views).slice(-1)[0] || 'App autisti in uso' : 'App autisti in uso',
                        lastActive: last, startTime: ms(x.startedAt), online: !!last && Date.now() - last.toMillis() < 100000, viewHistory: [] }) }; }) });
            }, err);
        } };
    }

    // ── Logo: quando è stato caricato l'ultimo file turni ───────────────
    // Data dell'ultimo caricamento di turni.xlsx, chiesta a GitHub al massimo ogni 30 minuti: GitHub risponde
    // solo 60 volte l'ora per rete, e con tanti telefoni sul wifi della centrale andava in errore.
    async function asLastUploadWhen() {
        const K = 'as_last_upload_v1'; let c = null; try { c = JSON.parse(localStorage.getItem(K) || 'null'); } catch(e) {}
        if(c && c.when && Date.now() - c.at < 30 * 60 * 1000) return c.when;
        try { const r = await fetch('https://api.github.com/repos/centrale118rsm-code/Turni-Autisti-2026-Rsm/commits?path=turni.xlsx&per_page=1'); if(r.ok) { const j = await r.json(); const w = j && j[0] && j[0].commit && j[0].commit.committer && j[0].commit.committer.date; if(w) { try { localStorage.setItem(K, JSON.stringify({ when: w, at: Date.now() })); } catch(e) {} return w; } } } catch(e) {}
        return c && c.when || null;   // GitHub non risponde: l'ultima data letta
    }
    async function asShowLastUpload() {
        vibrate();
        let when = null;
        when = await asLastUploadWhen();
        const txt = when ? new Date(when).toLocaleString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Non riesco a leggerlo da GitHub in questo momento.';
        ccDialog('File turni', when ? 'Ultimo caricamento di turni.xlsx: ' + txt : txt, [{ label: 'Ok', kind: 'primary', value: true }]);
    }
    // (il tocco sulla data apriva le note vecchie: ora le note del giorno sono in "Note e chat")
    // Sotto "A.S. 26": quando è stato caricato l'ultimo file turni (come nell'app originale).
    async function asFetchUpdated() {
        const el = document.getElementById('as-updated'); if(!el) return;
        let when = null;
        when = await asLastUploadWhen();
        const d = new Date(when || document.lastModified); if(isNaN(d)) return;
        el.textContent = 'Aggiornato ' + d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    }

    // Autisti: la bozza si costruisce dalle regole invece di ricopiare lo schema passato.
    // • 5 turnisti, uno per ogni posizione del ciclo P › M › N › S › R (chi la occupa si ricava
    //   dagli ultimi giorni prima del mese); cambio di blocco il lunedì dopo 5 settimane.
    // • diurnisti: seconda ambulanza di mattina (m) e di pomeriggio (p), massimo 5 giorni a
    //   settimana (2 riposi), preferendo il pomeriggio dopo una mattina.
    // • assenze intoccabili; se manca un turnista di mattina o pomeriggio si chiama un diurnista
    //   in più, se manca di notte resta un buco segnalato.
    function draftPlanAutisti(monthIdx, opts) {
        const days = buildDaysIndex(), i0 = days.findIndex(dd => dd.monthIdx === monthIdx);
        if(i0 < 1) return null;
        const target = days.filter(dd => dd.monthIdx === monthIdx), active = drivers.filter(d => !d.hidden);
        const back = days.slice(Math.max(0, i0 - 91), i0), L = back.length;
        const cur = {}, fixed = {}, fin = {}, write = {}, noPattern = [], swaps = [], recalls = [];
        active.forEach(d => {
            cur[d.idx] = target.map(dd => draftCode(dd.rowIdx, d.idx));
            fixed[d.idx] = cur[d.idx].map(c => c === 'ABS' || (opts.onlyEmpty && !!c));
            fin[d.idx] = cur[d.idx].map((c, k) => fixed[d.idx][k] ? c : '');
            write[d.idx] = [];
        });
        // chi è turnista e in che fase del ciclo si trova l'ultimo giorno prima del mese
        const phaseOf = {};
        active.forEach(d => {
            const h = back.map(dd => draftCode(dd.rowIdx, d.idx)), recent = h.slice(-10);
            if(!recent.some(c => c === 'N' || c === 'SM')) return;
            const votes = [0, 0, 0, 0, 0];
            h.forEach((c, j) => { const p = DRAFT_CYCLE.indexOf(c); if(p >= 0) votes[((p - j) % 5 + 5) % 5] += Math.pow(2, (j - L) / 3); });
            const best = Math.max(...votes); if(best <= 0) return;
            phaseOf[d.idx] = { first: (votes.indexOf(best) + L) % 5, score: best };   // posizione del ciclo il 1° giorno del mese
        });
        // una persona per posizione: se due cadono sulla stessa, resta quella più sicura
        const slot = [null, null, null, null, null];
        Object.keys(phaseOf).map(Number).sort((a, b) => phaseOf[b].score - phaseOf[a].score).forEach(idx => { const p = phaseOf[idx].first; if(slot[p] === null) slot[p] = idx; });
        const turnisti = new Set(slot.filter(x => x !== null));
        // cambi di blocco (lunedì dopo 5 settimane dall'inizio del blocco del turnista)
        const owner = target.map(() => slot.slice());
        if(opts.blocks) {
            const lastTurn = idx => { for(let j = L - 1; j >= 0; j--) { const c = draftCode(back[j].rowIdx, idx); if(c === 'N' || c === 'SM') return j; } return -1; };
            slot.forEach((idx, pos) => {
                if(idx === null) return;
                const h = back.map(dd => draftCode(dd.rowIdx, idx)); let start = -1;
                for(let j = L - 1; j > 0; j--) { if(h[j] !== 'P' || back[j].date.getDay() !== 1) continue; let prev = ''; for(let q = j - 1; q >= Math.max(0, j - 3) && !prev; q--) prev = h[q] === 'ABS' ? '' : h[q]; if(/^[mpr]$/.test(prev)) { start = j; break; } }
                if(start < 0) return;
                const exit = new Date(back[start].date); exit.setDate(exit.getDate() + 35);
                const k = target.findIndex(dd => dd.date >= exit && dd.date.getDay() === 1); if(k < 0) return;
                const absFrom = idx => cur[idx].slice(k).filter(c => c === 'ABS').length;   // chi entra deve esserci: esclusi gli assenti per metà del periodo
                const cand = active.filter(x => !turnisti.has(x.idx) && !swaps.some(s => s.inIdx === x.idx) && absFrom(x.idx) <= (target.length - k) / 2).sort((a, b) => absFrom(a.idx) - absFrom(b.idx) || lastTurn(a.idx) - lastTurn(b.idx))[0];
                if(!cand) return;
                for(let q = k; q < target.length; q++) owner[q][pos] = cand.idx;
                swaps.push({ outIdx: idx, inIdx: cand.idx, date: target[k].date });
            });
        }
        const smCode = 'S';
        target.forEach((dd, k) => owner[k].forEach((idx, pos) => {
            if(idx === null) return;
            const code = DRAFT_CYCLE[(pos + k) % 5];
            if(!fixed[idx][k]) { fin[idx][k] = code; write[idx][k] = code === 'SM' ? smCode : code; }
        }));
        // diurnisti: seconda ambulanza (o prima, se manca il turnista) di mattina e pomeriggio
        const isTurnOn = (idx, k) => owner[k].includes(idx);
        const cnt = (k, sh) => active.reduce((a, d) => { const c = fin[d.idx][k]; return a + (sh === 'M' ? (c === 'M' || c === 'm' || c === 'M+N') : sh === 'P' ? (c === 'P' || c === 'p') : (c === 'N' || c === 'M+N')); }, 0);
        const weekShifts = (idx, k) => { const mon = new Date(target[k].date); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); let n = 0; target.forEach((dd, q) => { if(dd.date >= mon && dd.date - mon < 7 * 86400000 && /^[mpMP]$/.test(fin[idx][q])) n++; }); return n; };
        target.forEach((dd, k) => {
            [['M', 'm'], ['P', 'p']].forEach(([sh, code]) => {
                let guard = 0;
                while(cnt(k, sh) < coverageMin[sh] && guard++ < 5) {
                    const prevNight = idx => k > 0 && ['N', 'M+N'].includes(fin[idx][k - 1]);
                    const cands = active.filter(d => !isTurnOn(d.idx, k) && !fixed[d.idx][k] && !fin[d.idx][k] && !prevNight(d.idx) && weekShifts(d.idx, k) < 5)
                        .sort((a, b) => weekShifts(a.idx, k) - weekShifts(b.idx, k) || ((k > 0 && fin[b.idx][k - 1] === (sh === 'P' ? 'm' : 'p')) - (k > 0 && fin[a.idx][k - 1] === (sh === 'P' ? 'm' : 'p'))));
                    if(!cands.length) break;
                    const d = cands[0]; fin[d.idx][k] = code; write[d.idx][k] = code;
                    if(owner[k].some((idx, pos) => idx !== null && DRAFT_CYCLE[(pos + k) % 5] === sh && cur[idx][k] === 'ABS')) recalls.push({ date: dd.date, shift: sh, name: d.name });
                }
            });
            // chi resta senza turno quel giorno è di riposo (r per i diurnisti)
            active.forEach(d => { if(!fixed[d.idx][k] && !fin[d.idx][k]) { fin[d.idx][k] = 'r'; write[d.idx][k] = 'r'; } });
        });
        const holes = [];
        target.forEach((dd, k) => ['M', 'P', 'N'].forEach(sh => { const n = cnt(k, sh); if(n < coverageMin[sh]) holes.push({ date: dd.date, shift: sh, have: n, need: coverageMin[sh] }); }));
        const changes = [];
        active.forEach(d => target.forEach((dd, k) => { const c = write[d.idx][k]; if(c && c !== cur[d.idx][k] && !(c === 'S' && cur[d.idx][k] === 'SM')) changes.push({ row: dd.rowIdx, col: d.idx, v: c }); }));
        if(slot.some(x => x === null)) noPattern.push(`posizioni del ciclo senza turnista: ${slot.map((x, p) => x === null ? DRAFT_CYCLE[p] : null).filter(Boolean).join(', ')}`);
        return { changes, holes, recalls, swaps, target, noPattern };
    }

    // ═══ PERMESSI A ORE: permesso legge (14 h l'anno) e permesso sindacale ═══════
    // Giornata intera: casella con l'assenza (subV 'pl' / 'ps'), come le altre assenze.
    // A ore dentro un turno: il turno resta com'è e la casella porta perm = { k, h }; le ore di
    // permesso sono retribuite, quindi il saldo delle ore non cambia: scalano solo dal monte ore.
    const PERM_HOURLY = {
        pl: { label: 'Permesso legge', short: 'PL', max: 14, dayH: 6 },   // un giorno intero vale 6 ore (Mat 26/11/2026)
        ps: { label: 'Permesso sindacale', short: 'PS', max: null }
    };
    // Permesso legge di un giorno intero: vale le ore scritte nella casella (di solito 6; fino a inizio
    // ottobre l'Excel scriveva 7), non l'orario del turno. Senza numero vale 6 h.
    function plDayMinutes(cell) { const h = cell && cell.perm && Number(cell.perm.h) > 0 ? Number(cell.perm.h) : PERM_HOURLY.pl.dayH; return Math.round(h * 60); }
    function permHFmt(h) { const m = Math.round((Number(h) || 0) * 60); return Math.floor(m / 60) + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : ''); }
    function permDayHours(rowIdx, col) {
        const m = justifiedDayMinutes(rowIdx, col) || getContractHours(col) * 60 / CONTRACT_WORKDAYS;
        return Math.round(m / 6) / 10;
    }
    // { k, h, full } se nella casella c'è un permesso a ore (o a giornata intera), altrimenti null
    function permOfCell(rowIdx, col) {
        const cell = (finalData[rowIdx] || [])[col] || {};
        const sub = (cell.subV || '').toString().trim().toLowerCase();
        const h = cell.perm && Number(cell.perm.h) > 0 ? Number(cell.perm.h) : 0;
        if(PERM_HOURLY[sub]) {
            let v = (cell.v || '').toString().trim(); if(isRepStr(v)) v = v.slice(0, v.indexOf('/')).trim();
            if(/^r(iposo)?$/i.test(v)) return null;   // su un riposo non conta
            return { k: sub, h: h || PERM_HOURLY[sub].dayH || permDayHours(rowIdx, col), full: true };
        }
        if(cell.perm && PERM_HOURLY[cell.perm.k] && h) return { k: cell.perm.k, h, full: false };
        return null;
    }
    // ore usate nell'anno da una persona (si può escludere una riga: quella che si sta modificando)
    function permUsedHours(col, k, skipRow) {
        let t = 0; for(let r = 1; r < finalData.length; r++) { if(r === skipRow || shiftRowYear(r) !== SHIFT_YEAR) continue; const p = permOfCell(r, col); if(p && p.k === k) t += p.h; }
        return Math.round(t * 100) / 100;
    }
    function permTagHtml(info) {
        const p = info && info.perm; if(!p || !PERM_HOURLY[p.k] || !(Number(p.h) > 0)) return '';
        if(p.k === 'pl') return `<i class="perm-corner" title="Permesso legge ${permHFmt(p.h)}"></i><div class="perm-tag perm-${p.k}">${PERM_HOURLY[p.k].short} ${permHFmt(p.h)}</div>`;
        return `<div class="perm-tag perm-${p.k}">${PERM_HOURLY[p.k].short} ${permHFmt(p.h)}</div>`;
    }
    // ── sezione "Permesso a ore" nel popup della casella ──
    let sepPermKind = 'pl';
    function sepPermHtml(rowIdx, col) {
        const cell = finalData[rowIdx][col] || {}, cur = permOfCell(rowIdx, col);
        if(cur) sepPermKind = cur.k;
        const info = computeDayInfo(rowIdx, col);
        const onShift = ['M', 'P', 'N', 'm', 'p', 'M+N'].includes(info.code) || (info.custom && !info.justified && info.minutes > 0);
        const used = permUsedHours(col, 'pl', rowIdx), left = Math.round((PERM_HOURLY.pl.max - used) * 100) / 100;
        const hVal = cur ? cur.h : 2;
        return `<div class="sep-group-label">Permesso a ore</div>
            <div class="sep-perm">
                <div class="sep-perm-kinds">${Object.keys(PERM_HOURLY).map(k => `<button class="${sepPermKind === k ? 'on' : ''}" onclick="sepPermKind='${k}';this.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===this));document.getElementById('sep-perm-left').style.visibility='${k === 'pl' ? 'visible' : 'hidden'}'"><span class="cc-code" style="${swatchStyle(SUB_CODE_COLORS[k])}">${PERM_HOURLY[k].short}</span>${PERM_HOURLY[k].label}</button>`).join('')}</div>
                <div class="sep-perm-row">
                    <label>Ore <input type="number" id="sep-perm-h" min="0.25" max="24" step="0.25" value="${hVal}" inputmode="decimal"></label>
                    <small id="sep-perm-left" style="visibility:${sepPermKind === 'pl' ? 'visible' : 'hidden'}">Permesso legge: usate ${permHFmt(used)} su 14h (giornata intera = 6h) · ${left >= 0 ? 'restano ' + permHFmt(left) : 'oltre di ' + permHFmt(-left)}</small>
                </div>
                <div class="sep-perm-row">
                    <button class="cc-btn primary" ${onShift ? '' : 'disabled title="Nella casella non c’è un turno"'} onclick="sepPermApply(false)"><span class="msym">schedule</span>Ore dentro il turno</button>
                    <button class="cc-btn" onclick="sepPermApply(true)"><span class="msym">event_busy</span>Giornata intera</button>
                    ${cur || cell.perm ? `<button class="cc-btn danger" onclick="sepPermRemove()">Togli permesso</button>` : ''}
                </div>
            </div>`;
    }
    // ── Ore a mano: il coordinatore corregge le ore del giorno senza cambiare turno o assenza ──
    function sepManHtml(rowIdx, col) {
        const cell = finalData[rowIdx][col] || {}, has = cell.customMinutes !== undefined && cell.customMinutes !== null && cell.customMinutes !== '';
        const info = computeDayInfo(rowIdx, col), autoMin = has ? (info.autoMinutes || 0) : info.minutes;
        const val = has ? Number(cell.customMinutes) : Math.round(autoMin / 6) / 10;
        return `<div class="sep-group-label">Ore a mano</div>
            <div class="sep-perm">
                <div class="sep-perm-row">
                    <label>Ore del giorno <input type="number" id="sep-man-h" min="0" max="24" step="0.25" value="${val}" inputmode="decimal"></label>
                    <small>${has ? `Scritte a mano: ${hsHM(info.minutes)} invece delle ${hsHM(autoMin)} calcolate` : `Calcolate dall\u2019app: ${hsHM(autoMin)}`}. Turno e assenza restano come sono, cambiano solo le ore.</small>
                </div>
                <div class="sep-perm-row">
                    <button class="cc-btn primary" onclick="sepManApply()"><span class="msym">edit</span>Salva ore</button>
                    ${has ? `<button class="cc-btn danger" onclick="sepManRemove()">Torna alle ore calcolate</button>` : ''}
                </div>
            </div>`;
    }
    function sepManSet(h) {
        if(!coordEditPopupTarget) return; vibrate();
        const { row, col } = coordEditPopupTarget, key = cellKey(row, col), cell = finalData[row][col] || {};
        const next = { v: (cell.v || '').toString(), subV: (cell.subV || '').toString() };
        if(cell.perm && cell.perm.k) next.perm = cell.perm;
        if(h !== null) next.customMinutes = h;
        const prev = setOverride(key, next);
        pushUndo({ entries: [{ key, prev, next }] });
        afterCoordChange([key]); closeShiftEditPopup();
    }
    function sepManApply() {
        const h = parseFloat(String(document.getElementById('sep-man-h').value).replace(',', '.'));
        if(!(h >= 0 && h <= 24)) { ccToast('Scrivi le ore (da 0 a 24).', true); return; }
        sepManSet(Math.round(h * 100) / 100);
        ccToast(`Ore del giorno: ${hsHM(Math.round(h * 60))} (a mano)`);
    }
    function sepManRemove() { sepManSet(null); ccToast('Tornano le ore calcolate.'); }
    function sepPermApply(full) {
        if(!coordEditPopupTarget) return; vibrate();
        const { row, col } = coordEditPopupTarget, key = cellKey(row, col), cell = finalData[row][col] || {};
        let h = parseFloat(String(document.getElementById('sep-perm-h').value).replace(',', '.'));
        if(!full && !(h > 0)) { ccToast('Scrivi quante ore.', true); return; }
        let next;
        if(full) next = { v: '', subV: sepPermKind, perm: { k: sepPermKind, h: PERM_HOURLY[sepPermKind].dayH || (h > 0 ? h : permDayHours(row, col)) } };
        else {
            const sub = (cell.subV || '').toString().trim().toLowerCase();
            next = { v: (cell.v || '').toString(), subV: PERM_HOURLY[sub] ? '' : (cell.subV || ''), perm: { k: sepPermKind, h } };
            if(cell.customMinutes !== undefined && cell.customMinutes !== null && cell.customMinutes !== '') next.customMinutes = cell.customMinutes;
        }
        const prev = setOverride(key, next);
        pushUndo({ entries: [{ key, prev, next }] });
        afterCoordChange([key]); closeShiftEditPopup();
        if(sepPermKind === 'pl') {
            const tot = permUsedHours(col, 'pl');
            ccToast(`Permesso legge: ${permHFmt(tot)} usate su 14h` + (tot > 14 ? ' — oltre il limite!' : ''), tot > 14);
        }
    }
    function sepPermRemove() {
        if(!coordEditPopupTarget) return; vibrate();
        const { row, col } = coordEditPopupTarget, key = cellKey(row, col), cell = finalData[row][col] || {};
        const sub = (cell.subV || '').toString().trim().toLowerCase();
        const next = { v: (cell.v || '').toString(), subV: PERM_HOURLY[sub] ? '' : (cell.subV || '') };
        if(cell.customMinutes !== undefined && cell.customMinutes !== null && cell.customMinutes !== '') next.customMinutes = cell.customMinutes;
        const prev = setOverride(key, next);
        pushUndo({ entries: [{ key, prev, next }] });
        afterCoordChange([key]); closeShiftEditPopup();
    }
    // ── conteggio assenze: colonne e dettaglio dei permessi a ore ──
    function permMeterHtml(used, max, col) {
        const pct = Math.min(100, used / max * 100);
        return `<div class="ab-meter ${used > max ? 'over' : ''}" style="--pc:${col}"><b>${permHFmt(used)}<small> / ${max}h</small></b><div class="bar"><i style="width:${pct.toFixed(0)}%"></i></div></div>`;
    }
    function permPill(h, k) { return h ? `<span class="ab-pill wide" style="--pc:${typeColor(k)}">${permHFmt(h)}</span>` : '<span class="ab-dot">·</span>'; }
    function permCounterHtml(r) {
        const used = r.hours.pl, max = PERM_HOURLY.pl.max, left = Math.round((max - used) * 100) / 100;
        return `<div class="abd-c" onclick="absToggle('pl')">${absRing(used, max, typeColor('pl'))}<div><small>Permesso legge</small><b>${permHFmt(used)} / ${max}h</b><em class="${left < 0 ? 'over' : 'ok'}">${left < 0 ? 'oltre di ' + permHFmt(-left) : 'restano ' + permHFmt(left)}</em></div></div>`;
    }
    function permDetailItem(r, k) {
        const list = r.hdates[k] || [], tot = r.hours[k] || 0;
        const f = dt => dt.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' });
        return `<div class="abd-item ${absOpenKey === k ? 'open' : ''} ${list.length ? '' : 'empty'}" id="abd-${k}">
            <div class="abd-row" ${list.length ? `onclick="absToggle('${k}')"` : ''} style="--pc:${typeColor(k)}"><span class="sw"></span><span class="t"><b>${ABS_TYPES[k].label}</b><small>${list.length ? list.length + (list.length === 1 ? ' volta' : ' volte') : 'nessuno'}</small></span><span class="n">${tot ? permHFmt(tot) : 0}</span>${list.length ? '<span class="material-icons-round">expand_more</span>' : ''}</div>
            <div class="abd-dates">${list.slice().sort((a, b) => a.date - b.date).map(x => `<div><span>${f(x.date)}</span><span>${permHFmt(x.h)} ${x.full ? '· giornata intera' : '· nel turno'}</span></div>`).join('')}</div>
        </div>`;
    }

    // ═══ COPERTURA DEGLI AUTISTI IN MODIFICA ═══════════════════════════════
    // Mattina, pomeriggio e notte devono avere le ambulanze minime (soglie coverageMin,
    // di base 2 · 2 · 1, contando turnisti e diurnisti): sotto il minimo le caselle hanno
    // il bordo arancio, sopra il minimo lampeggiano in rosso (solo in Modifica turni).
    // M+N conta sia per la mattina sia per la notte, come nei controlli del giorno.
    const NIGHT_STAFF_MIN = () => coverageMin.N;   // sotto questo numero la colonna data mostra quanti sono di notte
    function dayTurnistiCover(i) {
        const cnt = { M: 0, P: 0, N: 0 }, who = {};
        drivers.forEach(d => {
            if(d.hidden) return;
            const c = workCode(i, d.idx), w = [];
            if(c === 'M' || c === 'm' || c === 'M+N') w.push('M');
            if(c === 'P' || c === 'p') w.push('P');
            if(c === 'N' || c === 'M+N') w.push('N');
            if(w.length) { who[d.idx] = w; w.forEach(s => cnt[s]++); }
        });
        const cls = {};
        Object.keys(who).forEach(idx => {
            const st = who[idx].map(s => cnt[s] > coverageMin[s] ? 'hi' : (cnt[s] < coverageMin[s] ? 'lo' : ''));
            cls[idx] = st.includes('hi') ? 'cov-hi' : (st.includes('lo') ? 'cov-lo' : '');
        });
        return { cnt, cls };
    }

    // ═══ SEQUENZE DEI TURNISTI: DA QUALE TURNO PARTIRE ════════════════════════
    // Prima di inserire +5 / +10 / +15 / 5 settimane si sceglie il turno del primo giorno;
    // il primo pulsante continua il ciclo dal giorno prima.
    async function seqAskStart(row, col, s) {
        const names = { P: 'Pomeriggio', M: 'Mattina', N: 'Notte', SM: 'Smonto', R: 'Riposo' };
        const prevCode = row > 1 ? computeDayInfo(row - 1, col).code : '';
        const pi = TURNISTI_CYCLE.indexOf(prevCode === 'S' ? 'SM' : prevCode);
        const sug = pi >= 0 ? (pi + 1) % 5 : 0;
        const order = [sug, ...[0, 1, 2, 3, 4].filter(x => x !== sug)];
        const d = getDriverByIdx(col);
        const res = await ccDialog(`${s.label}: da quale turno parte?`,
            `${d ? d.name + ', ' : ''}dal ${repDateLabel(repRowDate(row))}. ${pi >= 0 ? 'Il giorno prima c’è ' + names[TURNISTI_CYCLE[pi]].toLowerCase() + ': il primo pulsante continua il ciclo.' : 'Poi il ciclo prosegue P › M › N › SM › R.'}`,
            order.map((x, n) => ({ label: `${names[TURNISTI_CYCLE[x]]}${n === 0 && pi >= 0 ? ' (continua)' : ''}`, kind: n === 0 ? 'primary' : '', value: String(x) })).concat([{ label: 'Annulla', kind: 'ghost', value: null }]));
        return res === null || res === undefined ? null : +res;
    }

    // ═══ RESOCONTO PER PERSONA (solo in Modifica turni) ══════════════════════
    // Sotto il nome di ognuno, se aperto: ferie e permessi che restano nell'anno, ore di
    // permesso legge rimaste, reperibilità dell'anno (fatte e in programma), loro ore e quante di domenica o
    // festivo. Si apre e si chiude dal pulsante "Resoconto" nella barra di Modifica turni.
    let edSumOpen = (() => { try { return localStorage.getItem('ed_sum_v1') === '1'; } catch(e) { return false; } })();
    function edSumToggle() {
        vibrate(); edSumOpen = !edSumOpen;
        try { localStorage.setItem('ed_sum_v1', edSumOpen ? '1' : '0'); } catch(e) {}
        edSumUi(); renderTableHead();
        if(edSumOpen) ccToast('Resoconto: CO ferie, P permessi straord., PN perm. notte, PL ore perm. legge (rimasti) · REP reperibilità dell’anno come le inserisci tu (anche in programma; le cessioni tra colleghi non le cambiano), h loro ore, DOM di domenica/festivo');
    }
    function edSumUi() { const b = document.getElementById('ces-sum'); if(b) { b.classList.toggle('on', edSumOpen); b.title = edSumOpen ? 'Chiudi il resoconto' : 'Resoconto di ferie, permessi e reperibilità per persona'; } const f = document.getElementById('ces-sumf'); if(f) f.style.display = edSumOpen ? '' : 'none'; }
    function edSumCtx() { return { days: buildDaysIndex(), R: repData(), today: ymd(new Date()), y: SHIFT_YEAR + '-' }; }
    function edSumHtmlOld(d, ctx) {
        const a = absCountFor(d, ctx.days), o = d.originalName;
        const co = a.max.co - a.allow.co, sp = a.max.sp - a.allow.sp, pn = a.max.pn - a.allow.pn;
        const pl = Math.round((PERM_HOURLY.pl.max - a.hours.pl) * 100) / 100;
        let rep = 0, repAll = 0, dom = 0, min = 0, minAll = 0;
        Object.keys(ctx.R.tit).forEach(dt => { if(ctx.R.tit[dt] !== o || !dt.startsWith(ctx.y)) return; repAll++; if(dt <= ctx.today) { rep++; if(repIsFestive(dt)) dom++; } });
        Object.keys(ctx.R.days).forEach(dt => { if(!dt.startsWith(ctx.y)) return; ctx.R.days[dt].forEach((w, s) => { if(w !== o) return; minAll += REP_SLOTS[s].minutes; if(dt <= ctx.today) min += REP_SLOTS[s].minutes; }); });
        const t = (lbl, val, tip, neg) => `<span class="${neg ? 'neg' : ''}" title="${esc(tip)}"><i>${lbl}</i>${val}</span>`;
        return `<div class="th-sum">
            ${t('CO', co, `Congedo ordinario: restano ${co} giorni su ${a.max.co}`, co < 0)}${t('P', sp, `Permessi straordinari: restano ${sp} su ${a.max.sp}`, sp < 0)}
            ${t('PN', pn, `Permessi notte: restano ${pn} su ${a.max.pn}`, pn < 0)}${t('PL', permHFmt(Math.max(0, pl)), `Permesso legge: restano ${permHFmt(Math.max(0, pl))} su 14h${pl < 0 ? ' (oltre di ' + permHFmt(-pl) + ')' : ''}`, pl < 0)}
            ${t('REP', rep, `Reperibilità fatte fino a oggi: ${rep} (in calendario nell'anno: ${repAll})`)}${t('h', Math.round(min / 60), `Ore di reperibilità fatte fino a oggi: ${repHours(min)} (nell'anno: ${repHours(minAll)})`)}
            ${t('DOM', dom, `Reperibilità di domenica o festivo fatte fino a oggi: ${dom}`)}
        </div>`;
    }

    // ═══ VISTA D'INSIEME › FERIE E PERMESSI: barra compatta fissa ═══════════
    // I consigli completi scorrono con il calendario (così resta spazio sul telefono); appena
    // escono dallo schermo compare in alto una barra sottile con Ferie/Permessi e i giorni consigliati.
    function ovMiniRender() {
        const mini = document.getElementById('ov-adv-mini'), el = document.getElementById('ov-advice'); if(!mini || !el) return;
        if(!ovAdvice) { mini.innerHTML = ''; ovMiniCheck(); return; }
        const perm = ovAdvKind === 'perm';
        const chips = [...el.querySelectorAll('.ov-periods .ov-per')].map(b => b.outerHTML).join('');
        mini.innerHTML = `<div class="ov-mini-kind"><button class="${perm ? '' : 'on'}" onclick="ovAdvSetKind('ferie')">Ferie</button><button class="${perm ? 'on' : ''}" onclick="ovAdvSetKind('perm')">Permessi</button></div>
            <div class="ov-mini-chips">${chips || `<span class="ov-none">${perm ? 'Nessun giorno consigliato' : 'Nessun periodo consigliato'}</span>`}</div>
            <button class="ov-mini-up" onclick="ovMiniUp()" title="Mostra i consigli completi" aria-label="Mostra i consigli completi"><span class="material-icons-round">expand_more</span></button>`;
        ovMiniCheck();
    }
    function ovMiniUp() { vibrate(); const sc = document.getElementById('ov-scroll'); if(sc) sc.scrollTo({ top: 0, behavior: 'smooth' }); }
    function ovMiniCheck() {
        const v = document.getElementById('ov-view'), sc = document.getElementById('ov-scroll'), el = document.getElementById('ov-advice'); if(!v || !sc || !el) return;
        v.classList.toggle('mini-on', !!ovAdvice && el.offsetHeight > 0 && sc.scrollTop > el.offsetTop + el.offsetHeight - 8);
    }
    document.addEventListener('scroll', e => { if(e.target && e.target.id === 'ov-scroll') ovMiniCheck(); }, true);

    // ═══ RESOCONTO COLORATO, CON FILTRO ══════════════════════════════════════
    // Ogni voce ha il colore della sua assenza (ferie gialle, permessi verdi…); le
    // reperibilità stanno in un riquadro separato. Il filtro sceglie quali voci vedere.
    const EDSUM_ITEMS = [
        { id: 'co',  lbl: 'CO',  name: 'Ferie (congedo ordinario) rimaste', grp: 'abs', bg: '--bg-cong', fg: '--t-cong' },
        { id: 'p',   lbl: 'P',   name: 'Permessi straordinari rimasti', grp: 'abs', bg: '--bg-perm', fg: '--t-perm' },
        { id: 'pn',  lbl: 'PN',  name: 'Permessi notte rimasti', grp: 'abs', bg: '--bg-pn', fg: '--t-pn' },
        { id: 'pl',  lbl: 'PL',  name: 'Ore di permesso legge rimaste', grp: 'abs', bg: '--bg-pl', fg: '--t-pl' },
        { id: 'rep', lbl: 'REP', name: 'Reperibilità inserite nell’anno (le cessioni tra colleghi non le cambiano)', grp: 'rep' },
        { id: 'h',   lbl: 'h',   name: 'Ore delle reperibilità inserite nell’anno', grp: 'rep' },
        { id: 'dom', lbl: 'DOM', name: 'Reperibilità di domenica o festivo nell’anno', grp: 'rep' }
    ];
    let edSumShow = (() => { try { const a = JSON.parse(localStorage.getItem('ed_sum_items_v1') || 'null'); if(Array.isArray(a)) return new Set(a); } catch(e) {} return new Set(EDSUM_ITEMS.map(x => x.id)); })();
    function edSumHtml(d, ctx) {
        const a = absCountFor(d, ctx.days), o = d.originalName;
        const pl = Math.round((PERM_HOURLY.pl.max - a.hours.pl) * 100) / 100;
        // Reperibilità come le ha inserite il coordinatore (titolare, 24 h ciascuna): le cessioni
        // di fasce tra colleghi non cambiano questi numeri, sono indicate solo nel suggerimento.
        let rep = 0, repAll = 0, dom = 0, domAll = 0, cedute = 0, ricevute = 0;
        const REP_DAY_MIN = REP_SLOTS.reduce((a, x) => a + x.minutes, 0);
        Object.keys(ctx.R.tit).forEach(dt => { if(ctx.R.tit[dt] !== o || !dt.startsWith(ctx.y)) return; const fest = repIsFestive(dt); repAll++; if(fest) domAll++; if(dt <= ctx.today) { rep++; if(fest) dom++; } });
        Object.keys(ctx.R.ces).forEach(k => { if(!k.startsWith(ctx.y)) return; const i = k.lastIndexOf('_'), who = repToOrig(ctx.R.ces[k].newDriver), tit = repTitolareOfSlot(ctx.R, k.slice(0, i), +k.slice(i + 1)); if(who === tit) return; if(tit === o) cedute++; if(who === o) ricevute++; });
        const min = rep * REP_DAY_MIN, minAll = repAll * REP_DAY_MIN;
        const cesTxt = cedute || ricevute ? ` · cessioni tra colleghi non contate: ${cedute} fasce cedute, ${ricevute} ricevute` : '';
        const val = {
            co: [a.max.co - a.allow.co, `Congedo ordinario: restano ${a.max.co - a.allow.co} giorni su ${a.max.co}`],
            p: [a.max.sp - a.allow.sp, `Permessi straordinari: restano ${a.max.sp - a.allow.sp} su ${a.max.sp}`],
            pn: [a.max.pn - a.allow.pn, `Permessi notte: restano ${a.max.pn - a.allow.pn} su ${a.max.pn}`],
            pl: [pl, `Permesso legge: restano ${permHFmt(Math.max(0, pl))} su 14h${pl < 0 ? ' (oltre di ' + permHFmt(-pl) + ')' : ''}`],
            rep: [repAll, `Reperibilità inserite nell'anno: ${repAll} (fino a oggi ${rep}, in programma ${repAll - rep})${cesTxt}`],
            h: [Math.round(minAll / 60), `Ore delle reperibilità inserite nell'anno: ${repHours(minAll)} (fino a oggi ${repHours(min)})${cesTxt}`],
            dom: [domAll, `Reperibilità inserite di domenica o festivo nell'anno: ${domAll} (fino a oggi ${dom})${cesTxt}`]
        };
        const cell = it => { const [v, tip] = val[it.id], neg = it.grp === 'abs' && v < 0;
            const txt = it.id === 'pl' ? permHFmt(Math.max(0, v)) : v;
            return `<span class="${neg ? 'neg' : ''}" title="${esc(tip)}"${it.bg ? ` style="background:var(${it.bg});color:var(${it.fg})"` : ''}><i>${it.lbl}</i>${txt}</span>`; };
        const shown = g => EDSUM_ITEMS.filter(it => it.grp === g && edSumShow.has(it.id));
        const A = shown('abs'), Rp = shown('rep');
        if(!A.length && !Rp.length) return '';
        return `<div class="th-sum">${A.length ? `<div class="th-sum-abs">${A.map(cell).join('')}</div>` : ''}${Rp.length ? `<div class="th-sum-rep">${Rp.map(cell).join('')}</div>` : ''}</div>`;
    }
    function edSumMenu(ev) {
        if(ev) ev.stopPropagation();
        let m = document.getElementById('ed-sum-menu');
        if(m) { m.remove(); return; }
        m = document.createElement('div'); m.id = 'ed-sum-menu'; m.className = 'cc-scope ed-pop';
        const row = it => `<label><input type="checkbox" ${edSumShow.has(it.id) ? 'checked' : ''} onchange="edSumSet('${it.id}',this.checked)"><span class="ed-pop-sw ${it.grp}"${it.bg ? ` style="background:var(${it.bg});color:var(${it.fg})"` : ''}>${it.lbl}</span>${esc(it.name)}</label>`;
        m.innerHTML = `<b>Cosa mostrare nel resoconto</b>
            <div class="ed-pop-sec">Assenze</div>${EDSUM_ITEMS.filter(x => x.grp === 'abs').map(row).join('')}
            <div class="ed-pop-sec">Reperibilità</div>${EDSUM_ITEMS.filter(x => x.grp === 'rep').map(row).join('')}
            <div class="ed-pop-foot"><button class="cc-btn sm" onclick="edSumAll(true)">Tutte</button><button class="cc-btn sm" onclick="edSumAll(false)">Nessuna</button><button class="cc-btn sm primary" onclick="document.getElementById('ed-sum-menu').remove()">Fatto</button></div>`;
        m.onclick = e => e.stopPropagation();
        document.body.appendChild(m);
        setTimeout(() => document.addEventListener('click', function off() { const x = document.getElementById('ed-sum-menu'); if(x) x.remove(); document.removeEventListener('click', off); }), 0);
    }
    function edSumSave() { try { localStorage.setItem('ed_sum_items_v1', JSON.stringify([...edSumShow])); } catch(e) {} renderTableHead(); }
    function edSumSet(id, on) { if(on) edSumShow.add(id); else edSumShow.delete(id); edSumSave(); }
    function edSumAll(on) { edSumShow = new Set(on ? EDSUM_ITEMS.map(x => x.id) : []); edSumSave(); const m = document.getElementById('ed-sum-menu'); if(m) { m.remove(); edSumMenu(); } }
    // l'intestazione dei nomi cambia altezza (saldo, resoconto): la barra del mese resta attaccata sotto
    let rtDeferHeadFit = false, thFitSig = '';   // dentro renderTable l'intestazione si misura alla fine, insieme alle caselle
    function thFitHeight() {
        if(rtDeferHeadFit) return;
        const thead = document.getElementById('table-head'); if(!thead) return;
        const root = document.documentElement.style; root.setProperty('--th-h', '40px');
        const h = Math.ceil(thead.getBoundingClientRect().height);
        if(h > 41) root.setProperty('--th-h', h + 'px');
        thFitSig = '';   // misura fatta fuori da renderTable: la prossima volta si rimisura
    }

    // ═══ BARRA IN ALTO NASCOSTA DURANTE LA MODIFICA ══════════════════════════
    let edHdrHidden = (() => { try { return localStorage.getItem('ed_hdr_v1') === '1'; } catch(e) { return false; } })();
    function edHdrToggle() { vibrate(); edHdrHidden = !edHdrHidden; try { localStorage.setItem('ed_hdr_v1', edHdrHidden ? '1' : '0'); } catch(e) {} edHdrUi(); }
    function edHdrUi() {
        document.body.classList.toggle('ed-no-hdr', coordEditModeActive && edHdrHidden);
        const b = document.getElementById('ces-hdr'); if(!b) return;
        b.classList.toggle('on', edHdrHidden); b.title = edHdrHidden ? 'Mostra la barra in alto' : 'Nascondi la barra in alto';
        b.querySelector('.msym').textContent = edHdrHidden ? 'expand_more' : 'expand_less';
    }

    // ═══ VIGNETTA DEGLI AVVISI ═══════════════════════════════════════════════
    // Dopo ogni modifica controlla i giorni toccati: turnisti diversi da 3, caselle rimaste
    // vuote, smonto mancante, riposi troppo corti, reperibilità scoperte… e li mostra in basso a destra.
    let edAlertsOn = (() => { try { return localStorage.getItem('ed_alerts_v1') !== '0'; } catch(e) { return true; } })();
    let edAlertTimer = null, edAlertHideTimer = null;
    function edAlertsToggle() {
        vibrate(); edAlertsOn = !edAlertsOn; try { localStorage.setItem('ed_alerts_v1', edAlertsOn ? '1' : '0'); } catch(e) {}
        edAlertsUi(); if(!edAlertsOn) edAlertHide(); ccToast(edAlertsOn ? 'Avvisi attivi' : 'Avvisi spenti');
    }
    function edAlertsUi() {
        const b = document.getElementById('ces-alert'); if(!b) return;
        b.classList.toggle('on', edAlertsOn); b.title = edAlertsOn ? 'Avvisi attivi: tocca per spegnerli' : 'Avvisi spenti: tocca per accenderli';
        b.querySelector('.msym').textContent = edAlertsOn ? 'notifications_active' : 'notifications_off';
    }
    function edRowsOf(keys, repDates) {
        const rows = new Set(), byKey = {}, byIso = {};
        for(let r = 1; r < finalData.length; r++) { if(shiftRowYear(r) !== SHIFT_YEAR) continue; byKey[finalData[r][0].v + '-' + parseInt(finalData[r][1].v)] = r; const iso = repRowDate(r); if(iso) byIso[iso] = r; }
        (keys || []).forEach(k => { const i = k.indexOf('__'); if(i < 0 || k.includes('@')) return; const r = byKey[k.slice(i + 2)]; if(r) { rows.add(r); if(finalData[r + 1]) rows.add(r + 1); } });
        (repDates || []).forEach(iso => { if(byIso[iso]) rows.add(byIso[iso]); });
        return [...rows].sort((a, b) => a - b);
    }
    // Precedenza degli avvisi (richiesta del coordinatore): prima la mattina, poi i riposi,
    // poi il pomeriggio; dopo la notte, le reperibilità e il resto.
    const ED_AL_CATS = [
        { id: 'M',   label: 'Mattina',      icon: 'wb_twilight' },
        { id: 'R',   label: 'Riposi',       icon: 'bedtime' },
        { id: 'P',   label: 'Pomeriggio',   icon: 'schedule' },
        { id: 'N',   label: 'Notte',        icon: 'nights_stay' },
        { id: 'REP', label: 'Reperibilità', icon: 'phone_in_talk' },
        { id: 'X',   label: 'Altro',        icon: 'info' }
    ];
    const ED_MAX_RUN = 6;        // oltre 6 giorni di fila senza un riposo scatta l'avviso
    const ED_REP_MIN_GAP = 3;    // due reperibilità della stessa persona a 3 giorni o meno sono "ravvicinate"
    function edRestDay(r, idx) {
        // giorno senza lavoro: riposo, smonto, casella vuota, ferie, malattia… (come la regola del 7° giorno)
        const c = workCode(r, idx);
        if(['M', 'P', 'N', 'm', 'p', 'M+N'].includes(c)) return false;
        return !(customCodes[c] && customCodes[c].kind === 'work');
    }
    function edAlertCollect(rows) {
        const out = [], names = { M: 'mattina', P: 'pomeriggio', N: 'notte' }, chk = dayChecks(), R = repData();
        const active = drivers.filter(d => !d.hidden);
        const runSeen = new Set(), repSeen = new Set();
        rows.forEach(r => {
            const iso = repRowDate(r); if(!iso) return;
            const when = repDateLabel(iso), cov = dayTurnistiCover(r), any = cov.cnt.M + cov.cnt.P + cov.cnt.N > 0;
            ['M', 'P', 'N'].forEach(s => {
                const n = cov.cnt[s];
                const min = coverageMin[s];
                if(n > min) out.push({ r, cat: s, err: false, t: `${when}: ${n} autisti di ${names[s]}, ne bastano ${min}` });
                else if(n < min && (n > 0 || any)) out.push({ r, cat: s, err: n === 0, t: `${when}: ${n ? 'solo ' + n : 'nessun'} autist${n === 1 ? 'a' : 'i'} di ${names[s]} su ${min}` });
            });
            const c = chk.rows[r];
            if(c) {
                c.day.filter(m => !/^(mattina|pomeriggio|notte):/.test(m)).forEach(m => out.push({ r, cat: /reperibil/.test(m) ? 'REP' : 'X', err: /in permesso notte/.test(m), t: `${when}: ${m}` }));
                Object.keys(c.cells).forEach(idx => { const d = getDriverByIdx(+idx); c.cells[idx].msgs.forEach(m => {
                    if(/giorno lavorato di fila/.test(m)) return;   // sostituito dal conteggio qui sotto
                    out.push({ r, idx: +idx, cat: /smonto|riposo/.test(m) ? 'R' : 'X', err: c.cells[idx].err, t: `${when} · ${d ? d.name : ''}: ${m}` });
                }); });
            }
            // troppi giorni di fila senza riposo (contando anche i giorni prima e dopo quelli toccati)
            active.forEach(d => {
                if(edRestDay(r, d.idx)) return;
                let a = r, b = r;
                while(a > 1 && repRowDate(a - 1) && !edRestDay(a - 1, d.idx)) a--;
                while(finalData[b + 1] && repRowDate(b + 1) && !edRestDay(b + 1, d.idx)) b++;
                const len = b - a + 1, k = d.idx + ':' + a;
                if(len <= ED_MAX_RUN || runSeen.has(k)) return; runSeen.add(k);
                out.push({ r: a + ED_MAX_RUN, idx: d.idx, cat: 'R', err: true, t: `${d.name}: ${len} giorni di fila senza riposo (dal ${repDateLabel(repRowDate(a))} al ${repDateLabel(repRowDate(b))})` });
            });
            // reperibilità ravvicinate della stessa persona
            [iso, repDateAdd(iso, -1)].forEach(x => {
                const t = R.tit[x]; if(!t) return;
                for(let g = -ED_REP_MIN_GAP; g <= ED_REP_MIN_GAP; g++) {
                    if(!g) continue;
                    const y = repDateAdd(x, g); if(R.tit[y] !== t) continue;
                    const p = [x, y].sort(), k = t + p.join(); if(repSeen.has(k)) continue; repSeen.add(k);
                    const d = drivers.find(z => z.originalName === t), gap = Math.abs(g);
                    out.push({ r: repRowOfDate(p[1]) || r, idx: d ? d.idx : undefined, cat: 'REP', err: gap === 1, t: `${repDisplayName(t)}: reperibilità ravvicinate, ${repDateLabel(p[0])} e ${repDateLabel(p[1])} (${gap === 1 ? 'una dopo l’altra' : 'a ' + gap + ' giorni'})` });
                }
            });
            // casella vuota: solo per chi nei 7 giorni prima e dopo ha dei turni (chi non è in servizio non conta)
            const busyNear = d => { for(let q = Math.max(1, r - 7); q <= Math.min(finalData.length - 1, r + 7); q++) { if(q !== r && computeDayInfo(q, d.idx).code) return true; } return false; };
            if(any) { const empty = active.filter(d => !computeDayInfo(r, d.idx).code && busyNear(d)); if(empty.length) out.push({ r, idx: empty.length === 1 ? empty[0].idx : undefined, cat: 'X', err: false, t: `${when}: casella vuota per ${empty.slice(0, 4).map(d => d.name).join(', ')}${empty.length > 4 ? ` e altri ${empty.length - 4}` : ''}` }); }
        });
        const seen = new Set(), ord = id => ED_AL_CATS.findIndex(c => c.id === id);
        return out.filter(x => !seen.has(x.t) && seen.add(x.t)).sort((a, b) => ord(a.cat) - ord(b.cat) || b.err - a.err || a.r - b.r);
    }
    let edAlertLast = null, edAlertPinned = false;   // ultimo controllo (per "tutto il mese") e vignetta fermata da un tocco
    function edAlertCheck(keys, repDates) {
        if(!edAlertsOn || !coordEditModeActive) return;
        clearTimeout(edAlertTimer);
        edAlertTimer = setTimeout(() => {
            const rows = edRowsOf(keys, repDates); if(!rows.length) return;
            edAlertLast = { rows, month: false };
            const items = edAlertCollect(rows);
            if(items.length) edAlertShow(items); else if(!edAlertPinned) edAlertHide();
        }, 160);
    }
    // controlla tutti i giorni del mese dell'ultima modifica (o di quello in vista)
    function edAlertMonth() {
        vibrate();
        let r0 = edAlertLast && edAlertLast.rows[0];
        if(!r0) { const tr = [...document.querySelectorAll('#table-body tr[data-row]')].find(t => t.getBoundingClientRect().top > 120); r0 = tr ? +tr.dataset.row : 1; }
        const m = finalData[r0] && finalData[r0][0].v, y = shiftRowYear(r0), rows = [];
        for(let r = 1; r < finalData.length; r++) if(finalData[r][0].v === m && shiftRowYear(r) === y && repRowDate(r)) rows.push(r);
        edAlertLast = { rows, month: m };
        const items = edAlertCollect(rows);
        edAlertPinned = true;
        if(items.length) edAlertShow(items); else { edAlertHide(); ccToast(`${String(m).charAt(0) + String(m).slice(1).toLowerCase()}: nessun avviso`); }
    }
    function edAlertShow(items) {
        let v = document.getElementById('ed-alert');
        if(!v) { v = document.createElement('div'); v.id = 'ed-alert'; v.className = 'cc-scope'; document.body.appendChild(v);
            v.addEventListener('pointerdown', () => { edAlertPinned = true; clearTimeout(edAlertHideTimer); });
            v.addEventListener('pointerenter', () => clearTimeout(edAlertHideTimer));
            v.addEventListener('pointerleave', () => { if(!edAlertPinned) edAlertHideTimer = setTimeout(edAlertHide, 8000); }); }
        edAlertItems = items;
        const nErr = items.filter(x => x.err).length, month = edAlertLast && edAlertLast.month;
        const groups = ED_AL_CATS.map(c => ({ c, list: items.map((x, i) => Object.assign({ i }, x)).filter(x => x.cat === c.id) })).filter(g => g.list.length);
        v.innerHTML = `<div class="ed-al-head ${nErr ? 'err' : ''}"><span class="msym">${nErr ? 'error' : 'warning'}</span><b>${items.length === 1 ? '1 avviso' : items.length + ' avvisi'}${month ? `<small>${esc(String(month).toLowerCase())}</small>` : ''}</b>
                <button onclick="edAlertMonth()" title="Controlla tutto il mese" aria-label="Controlla tutto il mese"><span class="msym">fact_check</span></button>
                <button onclick="edAlertHide()" aria-label="Chiudi"><span class="msym">close</span></button></div>
            <div class="ed-al-list">${groups.map(g => `<div class="ed-al-grp"><span class="msym">${g.c.icon}</span>${g.c.label}<em>${g.list.length}</em></div>
                <ul>${g.list.map(x => `<li class="${x.err ? 'err' : ''}" data-i="${x.i}" onclick="edAlertGo(${x.i})" title="Vai al giorno">${esc(x.t)}<span class="msym">chevron_right</span></li>`).join('')}</ul>`).join('')}</div>
            <div class="ed-al-foot">Tocca un avviso per andare al giorno.${month ? '' : ' <button onclick="edAlertMonth()">Controlla tutto il mese</button>'}</div>`;
        // se la ruota è in basso a destra, la vignetta si mette alla sua sinistra
        v.style.right = '';
        const tw = document.getElementById('tool-wheel');
        if(tw && tw.classList.contains('show')) {
            const w = tw.getBoundingClientRect(), vw = window.innerWidth, room = w.left - 24;
            if(w.right > vw - 380 && w.bottom > window.innerHeight - 320 && room >= 300) v.style.right = (vw - w.left + 10) + 'px';
        }
        v.classList.add('show');
        clearTimeout(edAlertHideTimer); if(!edAlertPinned) edAlertHideTimer = setTimeout(edAlertHide, 15000);
    }
    let edAlertItems = [];
    function edAlertHide() { edAlertPinned = false; clearTimeout(edAlertHideTimer); const v = document.getElementById('ed-alert'); if(v) v.classList.remove('show'); }
    function edAlertGo(i) {
        const x = edAlertItems[i]; if(!x) return;
        vibrate(); edAlertPinned = true; clearTimeout(edAlertHideTimer);
        document.querySelectorAll('#ed-alert li.on').forEach(li => li.classList.remove('on'));
        const li = document.querySelector(`#ed-alert li[data-i="${i}"]`); if(li) li.classList.add('on');
        calGoToCell(x.r, x.idx);
    }
    // la casella raggiunta non deve restare sotto una vignetta aperta (avvisi, note): si sposta a sinistra
    function calUncover(td) {
        const pops = ['ed-alert', 'ed-notes'].map(id => document.getElementById(id)).filter(p => p && p.classList.contains('show'));
        let sc = td.parentElement; while(sc && sc !== document.body && !(sc.scrollWidth > sc.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(sc).overflowX))) sc = sc.parentElement;
        pops.forEach(p => {
            const a = td.getBoundingClientRect(), b = p.getBoundingClientRect();
            if(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom) return;
            const dx = a.right - b.left + 16;
            if(sc && sc !== document.body && a.left - dx > 80) sc.scrollLeft += dx;
            else window.scrollBy(0, a.bottom - b.top + 16);
        });
    }
    // Porta il calendario sul giorno (riga) e, se indicata, sulla casella della persona, che lampeggia.
    function calGoToCell(r, idx) {
        if(calOverview) setCalView('dettaglio');
        if(liteOn()) liteShowRow(r);
        setTimeout(() => {
            const tr = document.querySelector(`#table-body tr[data-row="${r}"]`);
            const td = idx !== undefined && idx !== null ? document.querySelector(`#main-table td[data-row="${r}"][data-col="${idx}"]`) : null;
            liteQuietUntil = Date.now() + 1500;
            const el = td || (tr && tr.querySelector('td'));
            if(td) { td.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); calUncover(td); }
            else if(tr) tr.scrollIntoView({ block: 'center', behavior: 'auto' });
            const flash = td ? [td] : (tr ? [...tr.querySelectorAll('td')] : []);
            flash.forEach(c => { c.classList.remove('chk-flash'); void c.offsetWidth; c.classList.add('chk-flash'); setTimeout(() => c.classList.remove('chk-flash'), 2600); });
            if(!el) ccToast('Giorno non visibile nel calendario.', true);
        }, liteOn() ? 120 : 0);
    }

    // ═══ RUOTA A QUATTRO FACCE ═══════════════════════════════════════════════
    // Turni (turni singoli + sequenze), Assenze, Reperibilità, Operatori (nomi e colonne).
    const WHEEL_OP_TOOLS = [
        { id: 'rename',  short: 'NOME',     icon: 'badge',           label: 'Cambia nome',              hint: 'tocca una casella della persona da rinominare', fill: '#2563eb' },
        { id: 'hide',    short: 'NASCONDI', icon: 'visibility_off',  label: 'Nascondi colonna',         hint: 'tocca una casella: la colonna sparisce solo su questo dispositivo', fill: '#475569' },
        { id: 'showall', short: 'TUTTI',    icon: 'visibility',      label: 'Mostra tutte le colonne',  hint: 'rimette le colonne nascoste', fill: '#16a34a' },
        { id: 'manage',  short: 'GESTISCI', icon: 'manage_accounts', label: 'Gestione operatori',       hint: 'ordine, contratto, aggiungi o togli', fill: '#7c3aed' }
    ];
    let coordOpTool = null;
    // Strumenti della faccia Assenze che chiedono qualcosa (prima stavano nella finestra della casella)
    const WHEEL_CELL_TOOLS = [
        { id: 'perm', short: 'ORE PERM', icon: 'schedule',     label: 'Permesso a ore (legge o sindacale)', hint: 'tocca la casella: chiede le ore', fill: '#0f766e' },
        { id: 'man',  short: 'ORE MANO', icon: 'edit',         label: 'Ore a mano',                         hint: 'tocca la casella: scrivi le ore del giorno', fill: '#475569' }
    ];
    let coordCellTool = null;
    function wheelRingItems() {
        if(twMode === 'rep') return WHEEL_REP_TOOLS.map(r => ({ kind: 'rep', id: r.id, short: r.short, label: r.label, time: r.hint, fill: r.fill, fg: '#fff', group: 0, icon: r.icon }));
        if(twMode === 'operatori') return WHEEL_OP_TOOLS.map(o => ({ kind: 'op', id: o.id, short: o.short, label: o.label, time: o.hint, fill: o.fill, fg: '#fff', group: 0, icon: o.icon }));
        const pal = wheelPaletteItems().map((it, i) => Object.assign({ kind: 'pal', i }, it));
        const isAbsCustom = it => it.group === 3 && (customCodes[it.v] || {}).kind === 'abs';
        if(twMode === 'assenze') return pal.filter(it => it.group === 2 || isAbsCustom(it))
            .concat(WHEEL_CELL_TOOLS.map(t => ({ kind: 'ct', id: t.id, short: t.short, label: t.label, time: t.hint, fill: t.fill, fg: '#fff', group: 5, icon: t.icon })));
        return pal.filter(it => it.group === 0 || it.group === 1 || (it.group === 3 && !isAbsCustom(it)))
            .concat(WHEEL_SEQUENCES.map(s => ({ kind: 'seq', id: s.id, short: s.short, label: s.label, time: s.desc, fill: s.fill, fg: '#fff', group: 4 + s.group, dashed: s.dashed })));
    }
    async function edPrompt(title, text, value) {
        const p = ccDialog(title, text, [{ label: 'Annulla', kind: 'ghost', value: null }, { label: 'Salva', kind: 'primary', value: 'ok' }]);
        const box = document.getElementById('cc-dialog-text'), inp = document.createElement('input');
        inp.className = 'cc-input'; inp.value = value || ''; inp.maxLength = 40; inp.style.marginTop = '12px'; inp.style.display = 'block';
        box.appendChild(inp); setTimeout(() => { inp.focus(); inp.select(); }, 60);
        inp.addEventListener('keydown', e => { if(e.key === 'Enter') { e.preventDefault(); ccDialogResolve('ok'); } });
        const r = await p; return r === 'ok' ? inp.value : null;
    }
    async function applyOpTool(col) {
        const d = getDriverByIdx(col); if(!d) return;
        if(coordOpTool === 'rename') {
            const orig = d.originalName;
            const nm = await edPrompt('Nome della colonna', `Nome mostrato nel calendario per ${orig}. Vuoto = nome originale.`, nameOverrides[orig] || orig);
            if(nm === null) return;
            const v = nm.trim().toUpperCase().replace(/\s+/g, ' ');
            if(!v || v === orig) delete nameOverrides[orig]; else nameOverrides[orig] = v;
            saveSettingsFields({ nameOverrides }).then(() => { ccToast('Nome aggiornato'); logNote('Operatori: nome mostrato cambiato'); }).catch(() => ccToast('Salvataggio non riuscito.', true));
            applyNameOverrides(); refreshAfterOperatorChange();
        } else if(coordOpTool === 'hide') {
            if(!selectedDrivers.size) selectedDrivers = new Set(drivers.filter(x => !x.hidden).map(x => x.idx));
            selectedDrivers.delete(col);
            if(!selectedDrivers.size) { ccToast('Deve restare almeno una colonna.', true); selectedDrivers.add(col); return; }
            setPref('filter', drivers.filter(x => selectedDrivers.has(x.idx)).map(x => x.originalName || x.name), true);
            renderTable(); renderDriverFilterDropdown(); updateDriverFilterBadge(); vibrate();
            ccToast(`${d.name} nascosto su questo dispositivo · “Tutti” nella ruota Operatori per rimostrarlo`);
        }
    }
    function twOpClick(id) {
        if(id === 'showall') { filterDriver('all'); ccToast('Tutte le colonne di nuovo visibili'); return; }
        if(id === 'manage') { openCoordConsole('operatori'); return; }
        setCoordTool('op', id);
    }

    // ═══ CONTEGGIO ASSENZE (versione 2) ══════════════════════════════════
    // Per ferie, permessi straordinari, permessi notte e permesso legge: quanti già fatti
    // fino a oggi, quanti in programma più avanti e quanti restano sul totale dell'anno.
    function absTodayDate() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
    function absQuota(r) {
        const t = absTodayDate(), past = arr => (arr || []).filter(dt => dt <= t).length;
        return {
            co: { used: r.allow.co, done: past(r.dates.f), max: r.max.co, k: 'f', label: 'Ferie (C.O.)', unit: '' },
            sp: { used: r.allow.sp, done: past(r.dates.p) + past(r.dates.pn), max: r.max.sp, k: 'p', label: 'Permessi straord.', unit: '' },
            pn: { used: r.allow.pn, done: past(r.dates.pn), max: r.max.pn, k: 'pn', label: 'Permessi notte', unit: '' },
            pl: { used: r.hours.pl, done: Math.round((r.hdates.pl || []).filter(x => x.date <= t).reduce((a, x) => a + x.h, 0) * 100) / 100, max: PERM_HOURLY.pl.max, k: 'pl', label: 'Permesso legge', unit: 'h' }
        };
    }
    const absFmtQ = (v, unit) => unit === 'h' ? permHFmt(v) : String(v);
    function absMeter3(q) {
        const left = Math.round((q.max - q.used) * 100) / 100, plan = Math.max(0, q.used - q.done);
        const w = v => Math.max(0, Math.min(100, v / q.max * 100)).toFixed(1);
        return `<div class="ab3 ${left < 0 ? 'over' : ''}" style="--pc:${typeColor(q.k)}" title="${esc(q.label)}: ${absFmtQ(q.done, q.unit)} fatti, ${absFmtQ(plan, q.unit)} in programma, ${left >= 0 ? 'restano ' + absFmtQ(left, q.unit) : 'oltre di ' + absFmtQ(-left, q.unit)}">
            <div class="ab3-top"><b>${absFmtQ(q.used, q.unit)}</b><small>/${q.max}${q.unit}</small><em>${left >= 0 ? 'restano ' + absFmtQ(left, q.unit) : 'oltre ' + absFmtQ(-left, q.unit)}</em></div>
            <div class="ab3-bar"><i class="done" style="width:${w(q.done)}%"></i><i class="plan" style="width:${w(plan)}%"></i></div>
        </div>`;
    }
    function absPillN(n, k, unit) { return n ? `<span class="ab-pill ${unit ? 'wide' : ''}" style="--pc:${typeColor(k)}">${unit ? permHFmt(n) : n}</span>` : '<span class="ab-dot">·</span>'; }
    function renderAbsences() {
        const grid = document.getElementById('ab-view-grid'), det = document.getElementById('ab-view-detail');
        if(absDetailIdx !== null) { grid.style.display = 'none'; det.style.display = ''; renderAbsDetail(); return; }
        grid.style.display = ''; det.style.display = 'none';
        document.querySelectorAll('#abs-modal .ab-period button').forEach(b => b.classList.toggle('active', b.dataset.p === absPeriod));
        document.getElementById('ab-nav').style.display = absPeriod === 'mese' ? '' : 'none';
        const mName = MONTH_NAMES_IT[absMonth].charAt(0).toUpperCase() + MONTH_NAMES_IT[absMonth].slice(1);
        document.getElementById('ab-label').innerHTML = `${mName} <small>${SHIFT_YEAR}</small>`;
        const rows = computeAbsences(), year = absPeriod === 'anno';
        // per i saldi dell'anno serve sempre l'anno intero, anche nella vista del mese
        const inService = d => serviceSpan(d.idx).first.getFullYear() < 3000;   // chi non ha mai turni (es. operatore di prova) non conta nei totali
        const yearRows = (year ? rows : drivers.filter(d => !d.hidden).map(d => Object.assign({ d }, absCountFor(d, buildDaysIndex())))).filter(r => inService(r.d));
        const Q = yearRows.map(absQuota), sumQ = (k, f) => Q.reduce((a, q) => a + q[k][f], 0);
        const sum = k => rows.reduce((a, r) => a + (r.counts[k] || 0), 0);
        const t = absTodayDate(), todayRow = buildDaysIndex().find(dd => dd.date.getTime() === t.getTime());
        const absentToday = todayRow ? drivers.filter(d => !d.hidden && computeDayInfo(todayRow.rowIdx, d.idx).justified).map(d => d.name) : [];
        const kq = (k, label, unit) => { const used = sumQ(k, 'used'), max = sumQ(k, 'max'), left = Math.round((max - used) * 100) / 100, done = sumQ(k, 'done');
            return `<div class="ab-kpi2" style="--pc:${typeColor(Q[0][k].k)}"><small>${label}</small><b>${absFmtQ(Math.round(used * 100) / 100, unit)}<span> usati</span></b>
                <div class="ab3-bar"><i class="done" style="width:${(done / max * 100).toFixed(1)}%"></i><i class="plan" style="width:${(Math.max(0, used - done) / max * 100).toFixed(1)}%"></i></div>
                <em>restano ${absFmtQ(left, unit)} su ${absFmtQ(max, unit)} · ${absFmtQ(Math.round(done * 100) / 100, unit)} già fatti</em></div>`; };
        const kc = (k, label, n, sub) => `<div class="ab-kpi2" style="--pc:${typeColor(k)}"><small>${label}</small><b>${n}<span> ${sub}</span></b><em>${year ? 'nell’anno' : 'in ' + MONTH_NAMES_IT[absMonth]}</em></div>`;
        document.getElementById('ab-kpis').innerHTML = (Q.length ? kq('co', 'Ferie (C.O.)', '') + kq('sp', 'Permessi straordinari', '') + kq('pl', 'Permesso legge', 'h') : '')
            + kc('m', 'Malattia', sum('m'), 'giorni') + kc('r', 'Recuperi', sum('r'), 'giorni')
            + `<div class="ab-kpi2 today"><small>Assenti oggi</small><b>${absentToday.length}<span> ${absentToday.length === 1 ? 'persona' : 'persone'}</span></b><em>${esc(absentToday.slice(0, 4).join(', ') || 'nessuno')}${absentToday.length > 4 ? '…' : ''}</em></div>`;
        const otherKeys = ABS_OTHER, otherShown = rows.some(r => otherKeys.some(k => r.counts[k])), psShown = rows.some(r => r.hours.ps > 0);
        const headL = `<th class="ab-op">${year ? 'Anno ' + SHIFT_YEAR : mName}</th>`;
        const head = `<th>Ferie (C.O.)</th><th>Perm. straord.</th><th>Perm. notte</th><th>Perm. legge</th>${psShown ? '<th>Sindacale</th>' : ''}<th>Malattia</th><th>Recuperi</th><th>Ferie res.</th>${otherShown ? '<th>Altre</th>' : ''}<th>Totale</th>`;
        const body = rows.map((r, i) => {
            const c = k => r.counts[k] || 0, other = otherKeys.reduce((a, k) => a + c(k), 0), q = year ? absQuota(r) : null;
            return { attrs: `class="${r.isMe ? 'me' : ''}" onclick="absOpenDetail(${r.d.idx})"`,
                left: `<th class="ab-op"><div class="ab-who"><span class="ab-av">${esc(absInitials(r.d.name))}</span><span>${esc(r.d.name)}</span>${r.isMe ? '<em>tu</em>' : ''}</div></th>`,
                right: `<td>${year ? absMeter3(q.co) : absPillN(c('f'), 'f')}</td>
                    <td>${year ? absMeter3(q.sp) : absPillN(r.allow.sp, 'p')}</td>
                    <td>${year ? absMeter3(q.pn) : absPillN(c('pn'), 'pn')}</td>
                    <td>${year ? absMeter3(q.pl) : absPillN(r.hours.pl, 'pl', 'h')}</td>
                    ${psShown ? `<td>${absPillN(r.hours.ps, 'ps', 'h')}</td>` : ''}
                    <td>${absPillN(c('m'), 'm')}</td><td>${absPillN(c('r'), 'r')}</td><td>${absPillN(c('v'), 'v')}</td>
                    ${otherShown ? `<td>${other ? `<span class="ab-pill" style="--pc:#94a3b8" title="${esc(otherKeys.filter(k => c(k)).map(k => ABS_TYPES[k].label + ' ' + c(k)).join(', '))}">${other}</span>` : '<span class="ab-dot">·</span>'}</td>` : ''}
                    <td><span class="ab-tot">${r.total || '·'}</span></td>` };
        });
        document.getElementById('ab-grid').innerHTML = xgHtml('ab2', headL, head, body, year ? 860 + (psShown ? 70 : 0) + (otherShown ? 60 : 0) : 640);
        const note = document.querySelector('#ab-view-grid .hg-note');
        if(note) note.innerHTML = `${year ? '<span class="ab-leg"><i class="done"></i>già fatti fino a oggi</span><span class="ab-leg"><i class="plan"></i>in programma</span><span class="ab-leg"><i class="free"></i>restano</span><br>' : ''}Ogni anno: ${ABS_ALLOW.co} giorni di congedo ordinario, ${ABS_ALLOW.sp} permessi straordinari, ${ABS_ALLOW.pn} permessi notte (un permesso notte usa anche un permesso straordinario) e ${PERM_HOURLY.pl.max} ore di permesso legge; chi ne ha meno (es. i nuovi assunti) ha le sue spettanze in Area coordinatore › Operatori. Le assenze che cadono su un riposo non contano. Le assenze dei turnisti seguono il ciclo del turno come nel file Excel: dopo il turno del giorno prima si continua con pomeriggio, mattina, notte, smonto e riposo (il riposo vale 0 ore e non scala). Tocca un nome per il dettaglio.`;
    }
    // dettaglio della persona: contatori con fatti/in programma/restano e grafico mese per mese
    function renderAbsDetail() {
        renderAbsDetailOld();
        const det = document.getElementById('ab-view-detail'), d = drivers.find(x => x.idx === absDetailIdx); if(!d) return;
        const r = absCountFor(d, buildDaysIndex()), Q = absQuota(r);
        const ring = q => {
            const R = 22, C = 2 * Math.PI * R, done = Math.min(1, q.done / q.max), all = Math.min(1, q.used / q.max), col = typeColor(q.k);
            return `<svg width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="${R}" fill="none" stroke="var(--border)" stroke-width="7"/>
                <circle cx="28" cy="28" r="${R}" fill="none" stroke="${col}" stroke-opacity=".38" stroke-width="7" stroke-dasharray="${(all * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 28 28)"/>
                <circle cx="28" cy="28" r="${R}" fill="none" stroke="${q.used > q.max ? '#dc2626' : col}" stroke-width="7" stroke-dasharray="${(done * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 28 28)" stroke-linecap="round"/></svg>`;
        };
        const card = (q, note) => { const left = Math.round((q.max - q.used) * 100) / 100, plan = Math.round(Math.max(0, q.used - q.done) * 100) / 100;
            return `<div class="abd-c2" onclick="absToggle('${q.k}')">${ring(q)}<div class="abd-c2-t"><small>${q.label}</small><b>${absFmtQ(q.used, q.unit)} / ${q.max}${q.unit}</b>
                <span class="abd-c2-s"><i class="done"></i>${absFmtQ(q.done, q.unit)} fatti <i class="plan"></i>${absFmtQ(plan, q.unit)} in programma</span>
                <em class="${left < 0 ? 'over' : 'ok'}">${left < 0 ? 'oltre di ' + absFmtQ(-left, q.unit) : 'restano ' + absFmtQ(left, q.unit)}</em>${note ? `<small class="abd-c2-n">${note}</small>` : ''}</div></div>`; };
        const counters = det.querySelector('.abd-counters');
        if(counters) counters.outerHTML = `<div class="abd-counters2">${card(Q.co, r.nextF ? `di cui ${r.nextF} ${r.nextF === 1 ? 'giorno' : 'giorni'} nel ${SHIFT_YEAR + 1}` : '')}${card(Q.sp, (r.counts.pn || 0) ? `di cui ${r.counts.pn} per permessi notte` : '')}${card(Q.pn)}${card(Q.pl)}</div>${absMonthChart(r)}`;
    }
    // grafico mese per mese: colonne impilate per tipo di assenza
    function absMonthChart(r) {
        const groups = [ { ks: ['f'], label: 'Ferie', col: typeColor('f') }, { ks: ['p', 'pn'], label: 'Permessi', col: typeColor('p') }, { ks: ['m'], label: 'Malattia', col: typeColor('m') },
            { ks: ['r'], label: 'Recuperi', col: typeColor('r') }, { ks: ['v'], label: 'Ferie res.', col: typeColor('v') }, { ks: ABS_OTHER.concat(['pl', 'ps']), label: 'Altre', col: '#94a3b8' } ];
        const m = Array.from({ length: 12 }, () => groups.map(() => 0));
        groups.forEach((g, gi) => g.ks.forEach(k => (r.dates[k] || []).forEach(dt => { if(dt.getFullYear() === SHIFT_YEAR) m[dt.getMonth()][gi]++; })));
        const tot = m.map(a => a.reduce((x, y) => x + y, 0)), max = Math.max(4, ...tot), now = absTodayDate();
        if(!tot.some(Boolean)) return '';
        const bars = m.map((a, mi) => `<div class="abm-col ${now.getFullYear() === SHIFT_YEAR && mi === now.getMonth() ? 'now' : ''}" title="${MONTH_NAMES_IT[mi]}: ${tot[mi]} giorni${tot[mi] ? ' (' + groups.map((g, gi) => a[gi] ? g.label.toLowerCase() + ' ' + a[gi] : '').filter(Boolean).join(', ') + ')' : ''}">
            <span class="abm-n">${tot[mi] || ''}</span><div class="abm-stack" style="height:${(tot[mi] / max * 100).toFixed(1)}%">${a.map((v, gi) => v ? `<i style="flex:${v};background:${groups[gi].col}"></i>` : '').join('')}</div><small>${MONTH_NAMES_IT[mi].slice(0, 3)}</small></div>`).join('');
        return `<div class="abm"><div class="abm-head"><b>Mese per mese</b><span>${groups.filter((g, gi) => m.some(a => a[gi])).map(g => `<span><i style="background:${g.col}"></i>${g.label}</span>`).join('')}</span></div><div class="abm-chart">${bars}</div></div>`;
    }

    // ═══ EQUITÀ DELL'ANNO (versione 2) ═══════════════════════════════════
    // Ogni numero con lo scarto dalla media della squadra; in alto media, chi ne ha di più e
    // chi di meno; reperibilità di domenica o festivo. Sul telefono una scheda per persona.
    EQ_COLS.splice(5, 0, { k: 'repF', label: 'Rep. festive', sub: 'dom. e festivi' });
    EQ_COLS.splice(3, 0, { k: 'we', label: 'Weekend', sub: 'sab. + dom.' });
    // ore di reperibilità coperte per un collega: fasce fatte quando il titolare era un altro
    EQ_COLS.splice(EQ_COLS.findIndex(c => c.k === 'repH') + 1, 0, { k: 'repC', label: 'Rep. coperte', sub: 'ore a colleghi', fmt: m => Math.round(m / 60) });
    function computeEquity() {
        const today = absTodayDate();
        const all = buildDaysIndex(), days = eqPeriod === 'oggi' ? all.filter(dd => dd.date <= today) : all;
        const R = repData(), me = prefMe();
        const rows = drivers.filter(d => !d.hidden).map(d => {
            const r = { d, isMe: !!me && me.idx === d.idx, notti: 0, dom: 0, sab: 0, we: 0, fest: 0, repT: 0, repF: 0, repH: 0, repC: 0, worked: 0, active: false };
            days.forEach(dd => {
                const info = computeDayInfo(dd.rowIdx, d.idx); r.worked += info.minutes || 0; if(info.code) r.active = true;
                const c = info.justified ? '' : info.code;
                const works = ['M', 'P', 'N', 'M+N', 'm', 'p'].includes(c) || (info.custom && customCodes[c] && customCodes[c].kind === 'work');
                if(works) {
                    const g = dd.date.getDay();
                    if(g === 0) r.dom++; if(g === 6) r.sab++;
                    if(HOLIDAYS[`${dd.monthIdx}-${dd.day}`]) r.fest++;
                    if(c === 'N' || c === 'M+N') r.notti++;
                }
                const iso = ymd(dd.date);
                if(R.tit[iso] === d.originalName) { r.repT++; if(repIsFestive(iso)) r.repF++; }
                (R.days[iso] || []).forEach((who, s) => { if(who !== d.originalName) return; r.repH += REP_SLOTS[s].minutes;
                    const tit = repTitolareOfSlot(R, iso, s); if(tit && tit !== who) r.repC += REP_SLOTS[s].minutes; });
            });
            r.we = r.sab + r.dom;
            r.dovute = contractMinutesFor(getContractHours(d.idx), days.map(dd => dd.date), d.idx);
            r.saldo = r.worked - r.dovute;
            return r;
        }).filter(r => r.active);   // chi nel periodo non ha niente in calendario non entra nelle medie
        const avg = {};
        EQ_COLS.concat(EQ_EXTRA).forEach(c => { const set = c.onlyDoers ? rows.filter(r => r[c.k] > 0) : rows; avg[c.k] = set.length ? set.reduce((a, r) => a + r[c.k], 0) / set.length : 0; });
        return { rows, avg, days };
    }
    function eqDev(c, r, avg) {
        if(c.signed || (c.onlyDoers && r[c.k] === 0) || !(avg[c.k] > 0)) return { cls: '', d: '' };
        const v = c.fmt ? c.fmt(r[c.k]) : r[c.k], a = c.fmt ? c.fmt(avg[c.k]) : avg[c.k], diff = Math.round((v - a) * 10) / 10, q = r[c.k] / avg[c.k];
        return { cls: q >= 1.2 ? 'hi' : (q <= 0.8 ? 'lo' : ''), d: diff === 0 ? '=' : (diff > 0 ? '+' : '−') + Math.abs(diff).toString().replace('.', ',') };
    }
    // ── Categorie: ognuna mostra solo i suoi dati. "Panoramica" è la vista completa di prima.
    const EQ_EXTRA = [
        { k: 'worked', label: 'Ore fatte', sub: 'assenze giust. comprese', fmt: m => Math.round(m / 60) },
        { k: 'dovute', label: 'Ore dovute', sub: 'da contratto', fmt: m => Math.round(m / 60) }
    ];
    const EQ_CATS = [
        { k: 'tutto', label: 'Panoramica', icon: 'dashboard', desc: 'Tutte le voci dell’equità a confronto con la media della squadra' },
        { k: 'pesanti', label: 'Notti e weekend', icon: 'dark_mode', cols: ['notti', 'we', 'sab', 'dom', 'fest'], desc: 'Notti, sabati, domeniche e festivi lavorati' },
        { k: 'rep', label: 'Reperibilità', icon: 'phone_in_talk', cols: ['repT', 'repF', 'repH', 'repC'], desc: 'Turni da titolare, festivi, ore di fascia e ore coperte per i colleghi' },
        { k: 'coppie', label: 'Chi lavora con chi', icon: 'groups', desc: 'Quanti turni ognuno ha fatto con ogni collega' },
        { k: 'ruolo', label: 'Diurnisti e turnisti', icon: 'swap_horiz', desc: 'Quanti giorni ognuno ha fatto da diurnista e da turnista' }
    ];
    let eqCat = 'tutto', rtSort = null;
    function eqSetCat(k) { vibrate(); eqCat = k; eqSort = null; rtSort = null; renderEquity(); const b = document.querySelector('#eq-modal .modal-body'); const c = document.getElementById('eq-cats'); if(b && c && b.scrollTop > c.offsetTop) b.scrollTop = c.offsetTop - 8; }
    function eqCatCols(cat) { const all = EQ_COLS.concat(EQ_EXTRA); return cat.cols ? cat.cols.map(k => all.find(c => c.k === k)).filter(Boolean) : EQ_COLS; }
    function renderEquity() {
        document.querySelectorAll('#eq-modal .ab-period button').forEach(b => b.classList.toggle('active', b.dataset.p === eqPeriod));
        const cat = EQ_CATS.find(c => c.k === eqCat) || EQ_CATS[0];
        document.getElementById('eq-cats').innerHTML = EQ_CATS.map(c => `<button class="${c.k === cat.k ? 'on' : ''}" onclick="eqSetCat('${c.k}')"><span class="material-icons-round">${c.icon}</span>${c.label}</button>`).join('');
        const head = `<div class="eq-cat-h"><span class="material-icons-round">${cat.icon}</span>${cat.label}<small>${cat.desc}</small></div>`;
        const grid = document.getElementById('eq-grid'), note = document.getElementById('eq-note'), pw = document.getElementById('eq-pairs');
        pw.innerHTML = ''; grid.innerHTML = ''; note.innerHTML = '';
        if(cat.k === 'coppie') { pw.innerHTML = head + pairsHtml(eqPeriod, 'eq'); return; }
        if(cat.k === 'ruolo') { renderRoleTable(head); return; }
        renderEquityCols(eqCatCols(cat), cat.k === 'tutto' ? '' : head);
    }
    function renderEquityCols(COLS, head) {
        const { rows, avg, days } = computeEquity();
        if(eqSort && !COLS.some(c => c.k === eqSort)) eqSort = null;
        let list = rows.slice();
        if(eqSort) list.sort((a, b) => b[eqSort] - a[eqSort]); else list.sort((a, b) => b.isMe - a.isMe);
        const max = {}; COLS.forEach(c => max[c.k] = Math.max(1, ...rows.map(r => Math.abs(r[c.k]))));
        const txt = (c, v) => c.fmt ? c.fmt(v) : v;
        // riepilogo in alto: media, il più alto e il più basso per ogni voce
        const sumCols = COLS.filter(c => !c.signed);
        const extreme = (c, hi) => { const set = c.onlyDoers ? rows.filter(r => r[c.k] > 0) : rows; if(!set.length) return null; return set.reduce((b, r) => (hi ? r[c.k] > b[c.k] : r[c.k] < b[c.k]) ? r : b); };
        const summary = `<div class="eq-sum">${sumCols.map(c => { const H = extreme(c, true), L = extreme(c, false);
            return `<div class="eq-sum-c ${eqSort === c.k ? 'on' : ''}" onclick="eqSortBy('${c.k}')"><small>${c.label}</small><b>${c.fmt ? c.fmt(avg[c.k]) : (Math.round(avg[c.k] * 10) / 10).toString().replace('.', ',')}<span> media</span></b>
                ${H ? `<span class="eq-x hi">▲ ${esc(H.d.name)} ${txt(c, H[c.k])}</span>` : ''}${L ? `<span class="eq-x lo">▼ ${esc(L.d.name)} ${txt(c, L[c.k])}</span>` : ''}</div>`; }).join('')}</div>`;
        const cell = (c, r) => {
            const v = r[c.k];
            if(c.signed) return `<td class="eq-c ${Math.abs(v) < 30 ? '' : (v < 0 ? 'neg' : 'pos')}"><b>${txt(c, v)}</b></td>`;
            const dv = eqDev(c, r, avg);
            return `<td class="eq-c ${dv.cls}"><b>${txt(c, v)}</b>${dv.d && dv.d !== '=' ? `<sup>${dv.d}</sup>` : ''}<i style="width:${Math.round(Math.abs(v) / max[c.k] * 100)}%"></i></td>`;
        };
        const headL = `<th class="eq-name">${eqPeriod === 'oggi' ? 'Fino a oggi' : 'Anno ' + SHIFT_YEAR}</th>`;
        const headR = COLS.map(c => `<th onclick="eqSortBy('${c.k}')" class="${eqSort === c.k ? 'on' : ''}">${c.label}${c.sub ? `<small>${c.sub}</small>` : ''}${eqSort === c.k ? ' ▼' : ''}</th>`).join('');
        const items = list.map(r => ({ attrs: `class="${r.isMe ? 'me' : ''}"`, left: `<th class="eq-name"><span>${esc(r.d.name)}</span>${r.isMe ? '<em>tu</em>' : ''}</th>`, right: COLS.map(c => cell(c, r)).join('') }));
        items.push({ attrs: 'class="eq-avg"', left: '<th class="eq-name"><span>Media</span></th>', right: COLS.map(c => `<td class="eq-c"><b>${c.signed ? '' : (c.fmt ? c.fmt(avg[c.k]) : avg[c.k].toFixed(1).replace('.', ','))}</b></td>`).join('') });
        // telefono: una scheda per persona
        const cards = list.map(r => `<div class="eq-card ${r.isMe ? 'me' : ''}"><div class="eq-card-h"><span class="ab-av">${esc(absInitials(r.d.name))}</span><b>${esc(r.d.name)}</b>${r.isMe ? '<em>tu</em>' : ''}</div>
            <div class="eq-card-g">${COLS.map(c => { const v = r[c.k], dv = eqDev(c, r, avg);
                if(c.signed) return `<div class="eq-m ${Math.abs(v) < 30 ? '' : (v < 0 ? 'neg' : 'pos')}"><small>${c.label}</small><b>${txt(c, v)}</b></div>`;
                return `<div class="eq-m ${dv.cls}"><small>${c.label}</small><b>${txt(c, v)}${dv.d && dv.d !== '=' ? `<sup>${dv.d}</sup>` : ''}</b><i style="width:${Math.round(Math.abs(v) / max[c.k] * 100)}%"></i></div>`; }).join('')}</div></div>`).join('');
        document.getElementById('eq-grid').innerHTML = head + summary + `<div class="eq-wide">${xgHtml('eq-table', headL, headR, items, Math.max(420, COLS.length * 96))}</div><div class="eq-cards">${cards}</div>`;
        const hasDoers = COLS.some(c => c.onlyDoers), hasSaldo = COLS.some(c => c.signed);
        document.getElementById('eq-note').innerHTML = `${days.length} giorni considerati. Il numerino accanto è lo scarto dalla media della squadra. <span class="eq-key hi"></span> oltre il 20% sopra la media, <span class="eq-key lo"></span> oltre il 20% sotto.${hasDoers ? ' Per le notti e per le reperibilità coperte (fasce ricevute da un collega con una cessione) la media conta solo chi ne fa.' : ''}${hasSaldo ? ' Il saldo è la differenza tra ore fatte (assenze giustificate comprese) e ore dovute da contratto.' : ''} Tocca un titolo o un riquadro in alto per ordinare.`;
    }

    // ── Diurnisti e turnisti: giorni passati in ognuno dei due ruoli ─────────
    // Da diurnista = caselle in minuscolo (m, p, r); da turnista = M, P, N, M+N, smonto e R.
    // Le assenze giustificate non sono né l'uno né l'altro e si contano a parte.
    function computeRoles() {
        const today = absTodayDate(), all = buildDaysIndex(), days = eqPeriod === 'oggi' ? all.filter(dd => dd.date <= today) : all, me = prefMe();
        const rows = drivers.filter(d => !d.hidden).map(d => {
            const r = { d, isMe: !!me && me.idx === d.idx, dM: 0, dP: 0, dR: 0, tM: 0, tP: 0, tN: 0, tSM: 0, tR: 0, abs: 0, mm: Array.from({ length: 12 }, () => ({ d: 0, t: 0, a: 0, n: 0 })) };
            days.forEach(dd => {
                const info = computeDayInfo(dd.rowIdx, d.idx), m = r.mm[dd.monthIdx] || r.mm[0]; m.n++;
                let c = info.code, role = '';
                if(info.justified) { if(info.pnTail) { r.tSM++; role = 't'; } else { r.abs++; role = 'a'; } }
                else if(c === 'm') { r.dM++; role = 'd'; } else if(c === 'p') { r.dP++; role = 'd'; } else if(c === 'r') { r.dR++; role = 'd'; }
                else if(c === 'M') { r.tM++; role = 't'; } else if(c === 'P') { r.tP++; role = 't'; } else if(c === 'N') { r.tN++; role = 't'; }
                else if(c === 'M+N') { r.tM++; r.tN++; role = 't'; }
                else if(c === 'SM' || c === 'S') { r.tSM++; role = 't'; } else if(c === 'R') { r.tR++; role = 't'; }
                if(role) m[role]++;
            });
            r.dLav = r.dM + r.dP; r.dGg = r.dLav + r.dR;
            r.tGg = r.mm.reduce((a, x) => a + x.t, 0);
            r.tLav = r.tGg - r.tSM - r.tR;
            r.tot = r.dGg + r.tGg;
            return r;
        }).filter(r => r.tot + r.abs > 0);
        return { rows, days };
    }
    function rtSortBy(k) { vibrate(); rtSort = rtSort === k ? null : k; renderEquity(); }
    function renderRoleTable(head) {
        const { rows, days } = computeRoles();
        const list = rows.slice();
        if(rtSort) list.sort((a, b) => b[rtSort] - a[rtSort] || a.d.name.localeCompare(b.d.name)); else list.sort((a, b) => b.isMe - a.isMe);
        const pct = (a, t) => t ? Math.round(a / t * 100) : 0;
        const bar = r => { const t = r.tot + r.abs || 1;
            return `<div class="rt-bar" title="Diurnista ${r.dGg} giorni, turnista ${r.tGg}, assenze ${r.abs}">${r.dGg ? `<i class="d" style="width:${r.dGg / t * 100}%"></i>` : ''}${r.tGg ? `<i class="t" style="width:${r.tGg / t * 100}%"></i>` : ''}${r.abs ? `<i class="a" style="width:${r.abs / t * 100}%"></i>` : ''}</div>
                <div class="rt-pct">${r.tot ? `${pct(r.dGg, r.tot)}% diurnista · ${pct(r.tGg, r.tot)}% turnista` : 'solo assenze'}</div>`; };
        const months = r => `<div class="rt-mm">${r.mm.map((m, i) => { const n = m.n || 1;
            return `<div><span title="${MONTH_NAMES_IT[i]}: ${m.n ? `diurnista ${m.d}, turnista ${m.t}, assenze ${m.a}` : 'non considerato'}">${m.d ? `<i class="d" style="height:${m.d / n * 100}%"></i>` : ''}${m.t ? `<i class="t" style="height:${m.t / n * 100}%"></i>` : ''}${m.a ? `<i class="a" style="height:${m.a / n * 100}%"></i>` : ''}</span><em>${MONTH_NAMES_IT[i].charAt(0)}</em></div>`; }).join('')}</div>`;
        const v = (cls, n, sub) => `<div class="rt-v ${cls}"><b>${n}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
        const dSub = (r, br) => `${r.dLav} lavorati${br ? '<br>' : ' · '}${r.dR} riposi`, tSub = (r, br) => `${r.tLav} lavorati${br ? '<br>' : ' · '}${r.tN} notti`;
        const COLS = [
            { k: 'dGg', label: 'Da diurnista', sub: 'giorni (m, p, r)', td: r => v('d', r.dGg, dSub(r)) },
            { k: 'tGg', label: 'Da turnista', sub: 'giorni (M, P, N, SM, R)', td: r => v('t', r.tGg, tSub(r)) },
            { k: 'abs', label: 'Assenze', sub: 'giustificate', td: r => v('', r.abs) },
            { k: null, label: 'Ripartizione', td: bar },
            { k: null, label: 'Mese per mese', td: months }
        ];
        const th = c => c.k ? `<th onclick="rtSortBy('${c.k}')" class="${rtSort === c.k ? 'on' : ''}">${c.label}<small>${c.sub}</small>${rtSort === c.k ? ' ▼' : ''}</th>` : `<th style="cursor:default">${c.label}</th>`;
        const headL = `<th class="eq-name">${eqPeriod === 'oggi' ? 'Fino a oggi' : 'Anno ' + SHIFT_YEAR}</th>`;
        const items = list.map(r => ({ attrs: `class="${r.isMe ? 'me' : ''}"`, left: `<th class="eq-name"><span>${esc(r.d.name)}</span>${r.isMe ? '<em>tu</em>' : ''}</th>`, right: COLS.map(c => `<td>${c.td(r)}</td>`).join('') }));
        const S = k => rows.reduce((a, r) => a + r[k], 0);
        items.push({ attrs: 'class="eq-avg"', left: '<th class="eq-name"><span>Squadra</span></th>', right: `<td>${v('d', S('dGg'), S('dLav') + ' lavorati')}</td><td>${v('t', S('tGg'), S('tLav') + ' lavorati')}</td><td>${v('', S('abs'))}</td><td colspan="2"></td>` });
        const cards = list.map(r => `<div class="eq-card ${r.isMe ? 'me' : ''}"><div class="eq-card-h"><span class="ab-av">${esc(absInitials(r.d.name))}</span><b>${esc(r.d.name)}</b>${r.isMe ? '<em>tu</em>' : ''}</div>
            <div class="rt-card-b"><div class="eq-card-g"><div class="eq-m"><small>Da diurnista</small>${v('d', r.dGg, dSub(r, 1))}</div><div class="eq-m"><small>Da turnista</small>${v('t', r.tGg, tSub(r, 1))}</div><div class="eq-m"><small>Assenze</small>${v('', r.abs)}</div></div>
            <div>${bar(r)}</div>${months(r)}</div></div>`).join('');
        const nD = rows.filter(r => r.dGg > 0).length, nT = rows.filter(r => r.tGg > 0).length, both = rows.filter(r => r.dGg > 0 && r.tGg > 0).length;
        const summary = `<div class="eq-sum">
            <div class="eq-sum-c ${rtSort === 'dGg' ? 'on' : ''}" onclick="rtSortBy('dGg')"><small>Giorni da diurnista</small><b>${S('dGg')}<span> in tutto</span></b><span class="eq-x">${nD} persone</span></div>
            <div class="eq-sum-c ${rtSort === 'tGg' ? 'on' : ''}" onclick="rtSortBy('tGg')"><small>Giorni da turnista</small><b>${S('tGg')}<span> in tutto</span></b><span class="eq-x">${nT} persone</span></div>
            <div class="eq-sum-c" style="cursor:default"><small>Hanno fatto entrambi</small><b>${both}<span> persone</span></b><span class="eq-x">sia diurnista sia turnista</span></div></div>`;
        document.getElementById('eq-grid').innerHTML = head + summary + `<div class="eq-wide">${xgHtml('eq-table rt-table', headL, COLS.map(th).join(''), items, 780)}</div><div class="eq-cards">${cards}</div>`;
        document.getElementById('eq-note').innerHTML = `${days.length} giorni considerati. <span class="rt-key d"></span> da diurnista (caselle in minuscolo: m, p, r), <span class="rt-key t"></span> da turnista (M, P, N, M+N, smonto e R), <span class="rt-key a"></span> assenze giustificate. I giorni vuoti non contano. Tocca un titolo o un riquadro in alto per ordinare.`;
    }

