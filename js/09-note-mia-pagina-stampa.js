    // ═══ NOTE: AL COORDINATORE, AI COLLEGHI, A TUTTI ════════════════════════
    // Un operatore tocca un giorno del calendario e scrive una nota:
    //  • al coordinatore (con una preferenza facoltativa: mattina, pomeriggio…): la vedono solo
    //    lui e il coordinatore, che la ritrova nell'Area Coordinatore ("Note degli operatori"),
    //    come notifica e, in Modifica turni, dall'icona della barra in basso;
    //  • a un collega: la vedono solo lui e il collega;
    //  • a tutti: la vede chiunque.
    // Il coordinatore scrive le sue dall'Area Coordinatore (a un collega o a tutti, con o senza giorno).
    // Dove: campo "noteCoordinatore" del documento prefs (già ammesso dalle regole di Firebase),
    // { id: { id, author: nome originale (o 'COORD'), authorName, to: 'COORD' | 'ALL' | nome originale,
    //   date: 'YYYY-MM-DD' o '', text, pref: 'M'|'P'|'N'|'R'|'', status: 'nuova'|'vista'|'fatta',
    //   createdAt, updatedAt, seenBy, doneBy } }   (le note senza "to" sono per il coordinatore)
    const NOTE_FIELD = 'noteCoordinatore';
    const NOTE_PREFS = { M: { label: 'Mattina', bg: '#dbeafe', fg: '#1e40af' }, P: { label: 'Pomeriggio', bg: '#ffedd5', fg: '#9a3412' }, N: { label: 'Notte', bg: '#1e293b', fg: '#f8fafc' }, R: { label: 'Riposo', bg: '#dcfce7', fg: '#166534' } };
    const NOTE_STATUS = { nuova: 'Inviata', vista: 'Vista dal coordinatore', fatta: 'Gestita dal coordinatore' };
    var opNotesReady = false;
    let opNotes = {}, opNotesVer = 0, noteIdxCache = null, noteEditCtx = null, edNotesOpen = false, edNotesAll = false;
    function noteIsCoord() { return !!isCoordinator || isCoordLoggedIn(); }
    function noteTo(n) { return (n && n.to) || 'COORD'; }
    function noteMeDriver() { return myCalDriver(); }
    function noteIsMe(key) {
        if(!key || prefOwner() === 'OSPITE') return false;
        const d = noteMeDriver(); key = String(key).toUpperCase();
        return key === prefOwner() || (!!d && (key === String(d.originalName).toUpperCase() || key === String(d.name).toUpperCase()));
    }
    function noteMine(n) { return !!n && (n.author === 'COORD' ? noteIsCoord() : noteIsMe(n.author)); }
    function noteForMe(n) { const t = noteTo(n); return t === 'ALL' || (t === 'COORD' ? noteIsCoord() : noteIsMe(t)); }
    function noteVisible(n) { return noteMine(n) || noteForMe(n); }
    function noteDriverOf(key) { const a = String(key || '').toUpperCase(); return drivers.find(d => String(d.originalName).toUpperCase() === a || String(d.name).toUpperCase() === a) || null; }
    function noteDriver(n) { return n.author === 'COORD' ? null : noteDriverOf(n.author); }
    function noteName(n) { if(n.author === 'COORD') return 'Coordinatore' + (n.authorName ? ' (' + n.authorName + ')' : ''); const d = noteDriver(n); return d ? d.name : (n.author || '—'); }
    function noteToName(n) { const t = noteTo(n); if(t === 'ALL') return 'tutti'; if(t === 'COORD') return 'il coordinatore'; const d = noteDriverOf(t); return d ? d.name : t; }
    function noteList(onlyVisible = true) { return Object.values(opNotes).filter(n => !onlyVisible || noteVisible(n)).sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || String(a.createdAt).localeCompare(String(b.createdAt))); }
    function notePrefChip(n) { const p = NOTE_PREFS[n.pref]; return p && noteTo(n) === 'COORD' ? `<span class="note-pref" style="background:${p.bg};color:${p.fg}">${p.label}</span>` : ''; }
    function noteToChip(n) { const t = noteTo(n); if(t === 'COORD') return ''; return `<span class="note-to ${t === 'ALL' ? 'all' : ''}">${t === 'ALL' ? 'a tutti' : 'a ' + esc(noteToName(n))}</span>`; }
    function noteWhen(iso, long) { return iso ? repDateObj(iso).toLocaleDateString('it-IT', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' }) : 'senza giorno'; }
    function noteStatusTxt(n) {
        const t = noteTo(n);
        if(t === 'COORD') return NOTE_STATUS[n.status] || '';
        if(t === 'ALL') return 'Visibile a tutti';
        return n.status === 'vista' ? `Letta da ${noteToName(n)}` : `Visibile solo a ${noteToName(n)}`;
    }
    // casella dove compare il segno: per un collega la sua colonna, altrimenti quella di chi scrive
    function noteColumn(n) { const t = noteTo(n); return t !== 'COORD' && t !== 'ALL' ? noteDriverOf(t) : noteDriver(n); }
    function noteIndex() {
        if(noteIdxCache && noteIdxCache.v === opNotesVer && noteIdxCache.drv === drivers && noteIdxCache.who === prefOwner() + noteIsCoord()) return noteIdxCache.map;
        const map = {};
        noteList().forEach(n => { if(!n.date) return; const d = noteColumn(n); if(!d) return; ((map[n.date] = map[n.date] || {})[d.idx] = map[n.date][d.idx] || []).push(n); });
        noteIdxCache = { v: opNotesVer, drv: drivers, who: prefOwner() + noteIsCoord(), map };
        return map;
    }
    function noteFlagHtml(iso, idx) {
        if(!opNotesVer) return '';
        const l = (noteIndex()[iso] || {})[idx]; if(!l || !l.length) return '';
        const open = l.some(n => !(noteTo(n) === 'COORD' && n.status === 'fatta'));
        return `<span class="note-flag ${open ? '' : 'done'}" title="${esc(l.map(n => noteName(n) + ': ' + (NOTE_PREFS[n.pref] && noteTo(n) === 'COORD' ? NOTE_PREFS[n.pref].label + '. ' : '') + n.text).join(' · '))}"><span class="material-icons-round">sticky_note_2</span></span>`;
    }
    // chat da aprire appena arrivano le note: ?nota=ID nell'indirizzo (tocco su una notifica del telefono)
    let notePendingOpen = (() => { try { return new URLSearchParams(location.search).get('nota') || null; } catch(e) { return null; } })();
    if(notePendingOpen) try { const u = new URL(location.href); u.searchParams.delete('nota'); history.replaceState(history.state, '', u.href); } catch(e) {}
    function noteOpenPending() {
        const id = notePendingOpen; if(!id || !opNotes[id] || SERVER_MODE) return;
        notePendingOpen = null;
        setTimeout(() => { const a = document.getElementById('richiesta-alert-modal'); if(a && a.classList.contains('open')) closeRichiestaAlert(); noteOpenChat(id); }, 1200);
    }
    if('serviceWorker' in navigator && !SERVER_MODE) navigator.serviceWorker.addEventListener('message', e => {
        const d = e.data || {}; if(d.type !== 'open-nota' || !d.id) return;
        notePendingOpen = d.id; if(opNotes[d.id]) noteOpenPending();
    });
    function listenOpNotes() {
        if(!fbReady) return;
        cfgRef('prefs').onSnapshot(doc => {
            const raw = doc.exists ? ((doc.data() || {})[NOTE_FIELD] || {}) : {}, m = {};
            Object.keys(raw).forEach(k => { const n = raw[k]; if(n && typeof n === 'object' && /^(\d{4}-\d{2}-\d{2})?$/.test(n.date || '') && n.author) m[k] = Object.assign({ id: k, text: '', pref: '', status: 'nuova', date: '' }, n, { id: k }); });
            if(JSON.stringify(m) === JSON.stringify(opNotes)) { opNotesReady = true; return; }
            opNotesReady = true; opNotes = m; notesAfterChange(); noteNotify(); noteOpenPending();
        }, err => console.error('Errore ascolto note:', err));
    }
    let notesRenderTimer = null;
    function notesAfterChange() {
        opNotesVer++; noteIdxCache = null;
        edNotesUi();
        clearTimeout(notesRenderTimer);
        notesRenderTimer = setTimeout(() => {
            if(finalData.length && document.querySelector('#table-body tr[data-row]')) renderTable();
            if(edNotesOpen) edNotesRender();
            if(noteChatId) noteChatRender(true);
            const hub = document.getElementById('note-hub'); if(hub && hub.classList.contains('open')) noteHubRender();
            const cc = document.getElementById('coord-console');
            if(cc && cc.classList.contains('open') && ccSection === 'note') renderCcNotes();
            const me = document.getElementById('me-modal'); if(me && me.classList.contains('open')) renderMyPage();
            ccUpdateNavCounts();
        }, 150);
    }
    function noteWrite(id, val) {
        // aggiornamento immediato sul telefono; Firebase manda poi lo stesso stato a tutti
        // le risposte (chat sotto la nota) hanno scritture loro: qui restano quelle già presenti
        const keepRep = val && (val.replies || (opNotes[id] && opNotes[id].replies));
        if(val) { val = Object.assign({}, val); delete val.replies; delete val.id; opNotes[id] = Object.assign({}, val, { id }, keepRep ? { replies: keepRep } : {}); } else delete opNotes[id];
        notesAfterChange();
        // senza rete la scrittura resta in coda sul telefono e parte appena torna la connessione
        const fail = e => { console.error(e); ccToast('Nota non salvata: ' + (e.code || e.message), true); };
        if(!fbReady) { fail(new Error('nessuna connessione a Firebase')); return false; }
        try {
            (val ? cfgRef('prefs').set({ [NOTE_FIELD]: { [id]: val } }, { merge: true })
                 : cfgRef('prefs').update(new firebase.firestore.FieldPath(NOTE_FIELD, id), firebase.firestore.FieldValue.delete())).catch(fail);
            return true;
        } catch(e) { fail(e); return false; }
    }

    // ── Scrivere una nota ─────────────────────────────────────────────────
    // iso: giorno toccato nel calendario ('' = senza giorno); asCoord: scritta dall'Area Coordinatore
    function noteOpenEditor(iso, id, asCoord) {
        const n = id ? opNotes[id] : null;
        if(n && !noteMine(n)) return;
        asCoord = n ? n.author === 'COORD' : !!asCoord;
        if(!asCoord && prefOwner() === 'OSPITE') { ccToast('Per scrivere una nota scegli prima chi sei.', true); return; }
        const t0 = n ? noteTo(n) : (asCoord ? 'ALL' : 'COORD');
        noteEditCtx = { iso: n ? n.date || '' : (iso || ''), id: n ? n.id : null, pref: n ? n.pref || '' : '', asCoord,
            kind: t0 === 'COORD' ? 'COORD' : (t0 === 'ALL' ? 'ALL' : 'ONE'), who: t0 !== 'COORD' && t0 !== 'ALL' ? t0 : '', push: n ? !!n.push : true };
        let el = document.getElementById('note-modal');
        if(!el) {
            el = document.createElement('div'); el.id = 'note-modal'; el.className = 'cc-scope';
            el.onclick = e => { if(e.target === el) noteCloseEditor(); };
            document.body.appendChild(el);
        }
        const c = noteEditCtx, me = noteMeDriver();
        const kinds = (asCoord ? [] : [['COORD', 'Coordinatore']]).concat([['ONE', 'Un collega'], ['ALL', 'Tutti']]);
        const people = drivers.filter(d => !d.hidden && (!me || d.idx !== me.idx)).map(d => `<option value="${esc(d.originalName)}" ${c.who === d.originalName ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
        const others = c.iso ? noteList().filter(x => noteMine(x) && x.date === c.iso && x.id !== c.id) : [];
        el.innerHTML = `<div class="note-box" role="dialog" aria-labelledby="note-title">
            <div class="note-head"><span class="note-hico"><span class="material-icons-round">sticky_note_2</span></span><div><h4 id="note-title">${n ? 'Modifica la nota' : (asCoord ? 'Nota del coordinatore' : 'Nuova nota')}</h4><small>${c.iso && !asCoord ? esc(noteWhen(c.iso, true)) + ' ' + repDateObj(c.iso).getFullYear() : (asCoord ? 'dall’Area Coordinatore' : '')}</small></div>
                <button class="cc-icon-btn" onclick="noteCloseEditor()" aria-label="Chiudi"><span class="material-icons-round">close</span></button></div>
            <div class="note-body">
                <label class="note-lbl">A chi</label>
                <div class="note-prefs note-kinds">${kinds.map(([k, l]) => `<button data-k="${k}" class="${c.kind === k ? 'on' : ''}" onclick="noteSetKind('${k}')">${l}</button>`).join('')}</div>
                <select id="note-who" class="note-who" style="${c.kind === 'ONE' ? '' : 'display:none'}" onchange="noteEditCtx.who=this.value;noteEdPriv()"><option value="">Scegli il collega…</option>${people}</select>
                ${asCoord ? `<label class="note-lbl" for="note-date">Giorno <small>(facoltativo)</small></label><input type="date" id="note-date" class="note-date-in" value="${esc(c.iso)}" onchange="noteEditCtx.iso=this.value">` : ''}
                <div id="note-pref-box" style="${c.kind === 'COORD' ? '' : 'display:none'}"><label class="note-lbl">Per questo giorno preferirei <small>(facoltativo)</small></label>
                <div class="note-prefs">${Object.keys(NOTE_PREFS).map(k => `<button data-p="${k}" class="${c.pref === k ? 'on' : ''}" onclick="noteSetPref('${k}')">${NOTE_PREFS[k].label}</button>`).join('')}</div></div>
                <label class="note-lbl" for="note-text">Messaggio</label>
                <textarea id="note-text" maxlength="500" rows="4">${esc(n ? n.text : '')}</textarea>
                <label class="note-push" id="note-push-box"><input type="checkbox" id="note-push" ${c.push ? 'checked' : ''} onchange="noteEditCtx.push=this.checked;noteEdPriv()"><span class="material-icons-round">notifications_active</span><span><b>Invia notifica sul telefono</b><small id="note-push-t"></small></span></label>
                <p class="note-priv"><span class="material-icons-round">lock</span><span id="note-priv-t"></span></p>
                ${n ? `<p class="note-st">${esc(noteStatusTxt(n))}</p>` : ''}
                ${others.length ? `<div class="note-old"><b>Altre tue note per questo giorno</b>${others.map(x => `<div class="note-it" onclick="noteOpenEditor('${x.date}','${x.id}')">${notePrefChip(x)}${noteToChip(x)}<span>${esc(x.text || '(senza testo)')}</span><small>${esc(noteStatusTxt(x))}</small></div>`).join('')}</div>` : ''}
            </div>
            <div class="note-foot">${n ? `<button class="cc-btn danger" onclick="noteDelete('${n.id}')"><span class="material-icons-round">delete</span>Elimina</button>` : ''}<span class="cc-spacer"></span>
                <button class="cc-btn" onclick="noteCloseEditor()">Annulla</button><button class="cc-btn primary" onclick="noteSave()"><span class="material-icons-round">send</span>${n ? 'Salva' : 'Invia'}</button></div>
        </div>`;
        noteEdPriv();
        el.style.display = 'flex'; requestAnimationFrame(() => el.classList.add('open'));
        setTimeout(() => { const t = document.getElementById('note-text'); if(t && !n) t.focus(); }, 120);
    }
    function noteEdPriv() {
        const c = noteEditCtx, t = document.getElementById('note-priv-t'); if(!c || !t) return;
        const pb = document.getElementById('note-push-box'), pt = document.getElementById('note-push-t');
        if(pb) pb.style.display = c.kind === 'COORD' ? 'none' : '';
        if(pt) { const d2 = c.who ? noteDriverOf(c.who) : null; pt.textContent = !c.push ? 'Nessuna notifica: la vedranno aprendo l’app.' : c.kind === 'ALL' ? 'Arriva sul telefono di tutti i colleghi, anche a schermo spento.' : `Arriva sul telefono di ${d2 ? d2.name : 'chi scegli'}, anche a schermo spento.`; }
        const d = c.who ? noteDriverOf(c.who) : null, me = c.asCoord ? 'il coordinatore' : 'tu';
        t.textContent = c.kind === 'COORD' ? 'La vedete solo tu e il coordinatore. Gli arriva anche come notifica.'
            : c.kind === 'ALL' ? 'La vedono tutti nell’app, e sotto si può rispondere.'
            : `La vedete solo ${me} e ${d ? d.name : 'il collega che scegli'}, e sotto potete rispondervi.`;
    }
    function noteSetKind(k) {
        vibrate(); const c = noteEditCtx; if(!c) return; c.kind = k;
        document.querySelectorAll('#note-modal .note-kinds button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
        document.getElementById('note-who').style.display = k === 'ONE' ? '' : 'none';
        document.getElementById('note-pref-box').style.display = k === 'COORD' ? '' : 'none';
        noteEdPriv();
    }
    function noteSetPref(k) { vibrate(); if(!noteEditCtx) return; noteEditCtx.pref = noteEditCtx.pref === k ? '' : k; document.querySelectorAll('#note-modal .note-prefs button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === noteEditCtx.pref)); }
    function noteCloseEditor() { const el = document.getElementById('note-modal'); if(!el) return; el.classList.remove('open'); setTimeout(() => { if(!el.classList.contains('open')) el.style.display = 'none'; }, 180); noteEditCtx = null; }
    function noteSave() {
        const c = noteEditCtx; if(!c) return;
        const text = (document.getElementById('note-text').value || '').trim().slice(0, 500);
        const pref = c.kind === 'COORD' ? c.pref || '' : '';
        if(!text && !pref) { ccToast('Scrivi il messaggio' + (c.kind === 'COORD' ? ' o scegli una preferenza.' : '.'), true); return; }
        if(c.kind === 'ONE' && !c.who) { ccToast('Scegli il collega a cui mandarla.', true); return; }
        vibrate();
        const now = new Date().toISOString(), old = c.id ? opNotes[c.id] : null, me = noteMeDriver();
        const id = c.id || ('n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
        // una nota cambiata torna "nuova": chi la riceve deve rileggerla
        const val = { author: c.asCoord ? 'COORD' : (me ? me.originalName : prefOwner()), to: c.kind === 'ONE' ? c.who : c.kind, date: c.iso || '', text, pref, status: 'nuova', createdAt: old ? old.createdAt : now, updatedAt: now, push: c.kind !== 'COORD' && !!c.push };
        if(c.asCoord) val.authorName = (userIdentity && userIdentity !== 'Ospite') ? userIdentity : (coordinatorName || '');
        noteCloseEditor();
        if(noteWrite(id, val)) ccToast(old ? 'Nota aggiornata' : 'Nota inviata a ' + noteToName(val));
    }
    async function noteDelete(id) {
        const n = opNotes[id]; if(!n) return;
        const ok = await ccConfirm('Eliminare la nota?', `${noteName(n)}, ${noteWhen(n.date)}: “${(n.text || NOTE_PREFS[n.pref]?.label || '').slice(0, 80)}”`, 'Elimina', 'solid-danger');
        if(!ok) return;
        noteCloseEditor();
        if(noteWrite(id, null)) ccToast('Nota eliminata');
    }
    // il coordinatore segna come vista / gestita una nota per lui; il collega che la riceve la segna letta
    function noteSetStatus(id, st) {
        const n = opNotes[id]; if(!n || n.status === st) return;
        const t = noteTo(n);
        if(t === 'COORD' ? !noteIsCoord() : !(t !== 'ALL' && noteIsMe(t))) return;
        vibrate();
        const who = (userIdentity && userIdentity !== 'Ospite') ? userIdentity : (coordinatorName || 'Coordinatore'), now = new Date().toISOString();
        const val = Object.assign({}, n, { status: st }, st === 'fatta' ? { doneBy: who, doneAt: now } : {}, st === 'vista' ? { seenBy: who, seenAt: now } : {});
        delete val.id; noteWrite(id, val);
    }
    // aprendo l'elenco chi riceve "vede" le note nuove
    function noteMarkSeen(list) { list.filter(n => n.status === 'nuova' && noteForMe(n) && !noteMine(n) && noteTo(n) !== 'ALL').forEach(n => noteSetStatus(n.id, 'vista')); }

    // ── Notifiche a chi riceve la nota ────────────────────────────────────
    let lastAlertNote = '';
    function noteNotify() {
        if(prefOwner() === 'OSPITE' && !noteIsCoord()) return;
        const key = 'note_notified_v2_' + normalizeNameForMatch(prefOwner());
        let seen = null; try { seen = JSON.parse(localStorage.getItem(key) || 'null'); } catch(e) {}
        const first = !Array.isArray(seen); seen = new Set(seen || []);
        const recent = Date.now() - 3 * 864e5;
        const fresh = noteList().filter(n => noteForMe(n) && !noteMine(n) && !(noteTo(n) === 'COORD' && n.status !== 'nuova') && !seen.has(n.id + '|' + n.updatedAt) && (!first || Date.parse(n.updatedAt || n.createdAt || 0) > recent));
        // risposte nuove nelle chat delle note: a chi ha scritto la nota, a chi l'ha ricevuta (se privata) e a chi ha già risposto
        const freshRep = [];
        noteList().forEach(n => { if(!noteInvolved(n)) return; noteReplies(n).forEach(r => { if(!noteReplyMine(r) && !seen.has('r|' + n.id + '|' + r.id) && (!first || Date.parse(r.at || 0) > recent)) freshRep.push({ n, r }); }); });
        Object.values(opNotes).forEach(n => { seen.add(n.id + '|' + n.updatedAt); Object.keys(n.replies || {}).forEach(rid => seen.add('r|' + n.id + '|' + rid)); });
        try { localStorage.setItem(key, JSON.stringify([...seen].slice(-800))); } catch(e) {}
        if(!fresh.length && !freshRep.length) return;
        const title = n => noteTo(n) === 'COORD' ? 'Nota per il coordinatore' : (noteTo(n) === 'ALL' ? `Nota per tutti da ${noteName(n)}` : `Nota da ${noteName(n)}`);
        const repOf = n => noteMine(n) ? 'alla tua nota' : 'alla nota di ' + noteName(n);
        fresh.forEach(n => notifHistory.unshift({ id: Date.now() + Math.random(), ts: Date.now(), kind: 'nota', type: 'nota', noteId: n.id, title: title(n), detail: `${noteName(n)}${n.date ? ' · ' + noteWhen(n.date) : ''}${NOTE_PREFS[n.pref] && noteTo(n) === 'COORD' ? ' · preferisce ' + NOTE_PREFS[n.pref].label.toLowerCase() : ''}${n.text ? ': ' + n.text : ''}`, read: false, archived: false, date: new Date().toLocaleString(), owner: prefOwner() }));
        freshRep.forEach(({ n, r }) => notifHistory.unshift({ id: Date.now() + Math.random(), ts: Date.now(), kind: 'nota', type: 'nota', noteId: n.id, title: `Risposta di ${noteReplyName(r)}`, detail: `${repOf(n)}${n.date ? ' (' + noteWhen(n.date) + ')' : ''}: ${r.text}`, read: false, archived: false, date: new Date().toLocaleString(), owner: prefOwner() }));
        saveNotifications(); updateBadge();
        const ids = new Set(fresh.map(n => n.id).concat(freshRep.map(x => x.n.id)));
        lastRichiestaAlertReqId = null;
        lastAlertNote = ids.size === 1 ? 'chat:' + [...ids][0] : (fresh.length && fresh.every(n => noteTo(n) === 'COORD') && !freshRep.length ? 'coord' : 'me');
        const tot = fresh.length + freshRep.length;
        const head = !freshRep.length ? (fresh.length === 1 ? title(fresh[0]).toUpperCase() : fresh.length + ' NUOVE NOTE')
            : !fresh.length ? (freshRep.length === 1 ? 'NUOVA RISPOSTA' : freshRep.length + ' NUOVE RISPOSTE') : tot + ' NOVITÀ NELLE NOTE';
        const t = document.querySelector('#richiesta-alert-modal .alert-title'); if(t) t.textContent = head;
        const box = (id, top, body, extra) => `<div class="rq-alert-note" onclick="noteAlertChat('${id}')" style="background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:10px 12px; text-align:left; margin-bottom:6px;"><div style="font-weight:900;">${top}</div><div style="font-size:0.86rem; color:var(--text-sec); margin-top:3px;">${body}</div><span class="rq-reply"><span class="material-icons-round">forum</span>${extra}</span></div>`;
        const repCount = n => { const k = noteReplies(n).length; return k ? `Rispondi · ${k} ${k === 1 ? 'risposta' : 'risposte'}` : 'Rispondi'; };
        document.getElementById('richiesta-alert-text').innerHTML = fresh.slice(0, 4).map(n => box(n.id, `${esc(noteName(n))}${noteTo(n) === 'ALL' ? ' · a tutti' : ''}${n.date ? ' · ' + esc(noteWhen(n.date)) : ''}`, `${NOTE_PREFS[n.pref] && noteTo(n) === 'COORD' ? '<b>Preferisce ' + NOTE_PREFS[n.pref].label.toLowerCase() + '.</b> ' : ''}${esc(n.text || '')}`, repCount(n))).join('')
            + freshRep.slice(0, 4).map(({ n, r }) => box(n.id, `${esc(noteReplyName(r))} ha risposto ${esc(repOf(n))}${n.date ? ' · ' + esc(noteWhen(n.date)) : ''}`, `<i>“${esc((n.text || '').slice(0, 70))}${(n.text || '').length > 70 ? '…' : ''}”</i><br><b style="color:var(--text)">${esc(r.text)}</b>`, 'Apri la chat')).join('')
            + (tot > 8 ? `<div style="font-size:0.8rem;color:var(--text-sec)">…e altre ${tot - 8}</div>` : '');
        noteAlertWhenFree(0);
    }
    // L'avviso delle note nuove aspetta che l'operatore chiuda la finestra che sta usando
    // (menu, scheda del giorno, conteggi…): prima compariva sopra, a metà di quello che si faceva.
    function noteAlertBusy() {
        const dd = document.getElementById('menu-dropdown'); if(dd && dd.style.display === 'flex') return true;
        return [...document.querySelectorAll('.open')].some(e => e.id !== 'richiesta-alert-modal' && e.id !== 'tm-strip' && e.offsetHeight > 200 && getComputedStyle(e).position === 'fixed');
    }
    function noteAlertWhenFree(tries) {
        if(tries < 48 && noteAlertBusy()) { setTimeout(() => noteAlertWhenFree(tries + 1), 2500); return; }   // al massimo 2 minuti
        const m = document.getElementById('richiesta-alert-modal'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 100);
        if(navigator.vibrate) navigator.vibrate([40, 60, 40]);
    }
    function noteOpenList(where) { if(where === 'coord') openCoordConsole('note'); else { openMyPage(); setTimeout(() => { const c = document.getElementById('me-notes'); if(c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 450); } }
    function noteOpenFromNotif(id) { closeNotifCenter(); const n = opNotes[id]; setTimeout(() => n && noteVisible(n) ? noteOpenChat(id) : noteOpenList(n && noteTo(n) === 'COORD' && noteIsCoord() ? 'coord' : 'me'), 320); }
    function noteAlertChat(id) { lastAlertNote = ''; closeRichiestaAlert(); setTimeout(() => noteOpenChat(id), 320); }

    // ── Chat sotto ogni nota: chi vede la nota può rispondere, con il proprio nome ──
    // Nel campo della nota: replies: { id: { by: nome originale | 'COORD', byName (solo coordinatore), text, at } }
    // (stesso documento prefs, già ammesso dalle regole). Ogni risposta si scrive da sola, senza toccare la nota.
    let noteChatId = null;
    function noteReplies(n) { const r = (n && n.replies) || {}; return Object.keys(r).map(k => Object.assign({}, r[k], { id: k })).filter(x => x && x.by && x.text).sort((a, b) => String(a.at).localeCompare(String(b.at))); }
    function noteReplyMine(r) { return !!r && (r.by === 'COORD' ? noteIsCoord() : noteIsMe(r.by)); }
    function noteReplyName(r) { if(r.by === 'COORD') return 'Coordinatore' + (r.byName ? ' (' + r.byName + ')' : ''); const d = noteDriverOf(r.by); return d ? d.name : (r.by || '—'); }
    // chi riceve l'avviso delle risposte: chi ha scritto la nota, chi l'ha ricevuta (se non è "a tutti") e chi ha già risposto
    function noteInvolved(n) { return noteMine(n) || (noteTo(n) !== 'ALL' && noteForMe(n)) || noteReplies(n).some(noteReplyMine); }
    // con che nome rispondo: il coordinatore risponde come coordinatore alle note per lui o sue; gli altri col proprio nome
    function noteReplyAs(n) {
        const me = noteMeDriver(), coordName = (userIdentity && userIdentity !== 'Ospite') ? userIdentity : (coordinatorName || '');
        if(noteIsCoord() && (n.author === 'COORD' || noteTo(n) === 'COORD' || !me)) return { by: 'COORD', byName: coordName };
        if(me) return { by: me.originalName };
        if(prefOwner() !== 'OSPITE') return { by: prefOwner() };
        return null;
    }
    function noteChatReadKey() { return 'note_chat_read_v1_' + normalizeNameForMatch(prefOwner()) + (noteIsCoord() ? '_c' : ''); }
    function noteChatRead() { try { return JSON.parse(localStorage.getItem(noteChatReadKey()) || '{}') || {}; } catch(e) { return {}; } }
    function noteChatMarkRead(n) { const l = noteReplies(n); if(!l.length) return; const m = noteChatRead(); m[n.id] = l[l.length - 1].at; try { localStorage.setItem(noteChatReadKey(), JSON.stringify(m)); } catch(e) {} }
    function noteUnreadReplies(n) { const at = noteChatRead()[n.id] || ''; return noteReplies(n).filter(r => !noteReplyMine(r) && String(r.at) > at).length; }
    // pulsantino "Rispondi / 3 risposte" da mettere sotto ogni nota
    function noteChatChip(n, fromDay) {
        if(!n || !noteVisible(n)) return '';
        const k = noteReplies(n).length, u = noteUnreadReplies(n), canW = !!noteReplyAs(n);
        if(!k && !canW) return '';
        return `<button class="note-rep-chip ${u ? 'new' : ''}" onclick="event.stopPropagation();${fromDay ? `closeShiftModal();setTimeout(() => noteOpenChat('${n.id}'), 220)` : `noteOpenChat('${n.id}')`}"><span class="material-icons-round">forum</span>${k ? k + (k === 1 ? ' risposta' : ' risposte') + (u ? ' · ' + u + ' nuov' + (u === 1 ? 'a' : 'e') : '') : 'Rispondi'}</button>`;
    }
    // ── Tutte le note e le chat, dal menu: l'ultima attività in cima ──
    function noteLastAt(n) { const l = noteReplies(n); return String((l.length && l[l.length - 1].at) || n.updatedAt || n.createdAt || ''); }
    function noteHubItems() {
        const t = ymd(new Date()), recent = new Date(Date.now() - 14 * 864e5).toISOString();
        return noteList().filter(n => !n.date || n.date >= repDateAdd(t, -7) || noteLastAt(n) > recent).sort((a, b) => noteLastAt(b).localeCompare(noteLastAt(a)));
    }
    function noteHubUnread() { return noteHubItems().reduce((k, n) => k + noteUnreadReplies(n), 0); }
    function noteOpenHub() {
        let el = document.getElementById('note-hub');
        if(!el) { el = document.createElement('div'); el.id = 'note-hub'; el.className = 'cc-scope'; el.onclick = e => { if(e.target === el) noteCloseHub(); }; document.body.appendChild(el); }
        noteHubRender();
        el.style.display = 'flex'; requestAnimationFrame(() => el.classList.add('open'));
    }
    document.addEventListener('keydown', e => { if(e.key === 'Escape') { const h = document.getElementById('note-hub'); if(h && h.classList.contains('open')) noteCloseHub(); } });
    function noteCloseHub() { const el = document.getElementById('note-hub'); if(!el) return; el.classList.remove('open'); setTimeout(() => { if(!el.classList.contains('open')) el.style.display = 'none'; }, 180); }
    function noteHubRender() {
        const el = document.getElementById('note-hub'); if(!el) return;
        const items = noteHubItems(), at = iso => iso ? new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        const row = n => { const l = noteReplies(n), last = l[l.length - 1], u = noteUnreadReplies(n);
            return `<div class="nhub-it ${u ? 'new' : ''}" onclick="noteOpenChat('${n.id}')">
                <div class="nhub-r1"><b>${esc(noteMine(n) ? 'Tu' : noteName(n))}</b>${noteToChip(n)}<span class="nhub-when">${esc(noteWhen(n.date))}</span>${u ? `<span class="nhub-badge">${u}</span>` : ''}</div>
                <div class="nhub-txt">${esc(n.text || (NOTE_PREFS[n.pref] ? 'Preferisce ' + NOTE_PREFS[n.pref].label.toLowerCase() : ''))}</div>
                <div class="nhub-last"><span class="material-icons-round">forum</span>${last ? `<span><b>${esc(noteReplyMine(last) ? 'Tu' : noteReplyName(last))}:</b> ${esc(last.text)}</span>` : '<span>Nessuna risposta</span>'}<small>${esc(at(noteLastAt(n)))}</small></div></div>`; };
        el.innerHTML = `<div class="nchat-box" role="dialog" aria-labelledby="nhub-title">
            <div class="nchat-head"><span class="material-icons-round">forum</span><div><h4 id="nhub-title">Note e chat</h4><small>Le note che puoi vedere, l’ultima attività in cima</small></div>
                <button class="cc-icon-btn" onclick="noteCloseHub()" aria-label="Chiudi"><span class="material-icons-round">close</span></button></div>
            <div class="nchat-list nhub-list">${items.length ? items.map(row).join('') : '<div class="nchat-empty">Nessuna nota per ora.</div>'}</div>
            <div class="nchat-foot"><div class="nchat-ro">Per scrivere una nota nuova tocca un giorno nel calendario e poi “Scrivi una nota”.</div></div></div>`;
    }
    function noteOpenChat(id) {
        const n = opNotes[id]; if(!n || !noteVisible(n)) { ccToast('Nota non trovata (forse è stata eliminata).', true); return; }
        noteChatId = id;
        let el = document.getElementById('note-chat');
        if(!el) { el = document.createElement('div'); el.id = 'note-chat'; el.className = 'cc-scope'; el.onclick = e => { if(e.target === el) noteCloseChat(); }; document.body.appendChild(el); }
        noteChatRender(false);
        el.style.display = 'flex'; requestAnimationFrame(() => el.classList.add('open'));
        if(noteForMe(n) && !noteMine(n) && noteTo(n) !== 'ALL') noteMarkSeen([n]);
    }
    function noteCloseChat() { const el = document.getElementById('note-chat'); if(!el) return; el.classList.remove('open'); noteChatId = null; setTimeout(() => { if(!el.classList.contains('open')) el.style.display = 'none'; }, 180); notesAfterChange(); }
    function noteChatListHtml(n) {
        const l = noteReplies(n);
        const at = iso => iso ? new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="nchat-orig"><b>${esc(noteName(n))}</b> ${noteToChip(n)} ${notePrefChip(n)}<p>${esc(n.text || '')}</p><small>scritta il ${esc(at(n.createdAt))}${n.updatedAt && n.updatedAt !== n.createdAt ? ' · modificata' : ''}</small></div>
            ${l.length ? `<div class="nchat-sep">${l.length} ${l.length === 1 ? 'risposta' : 'risposte'}</div>` : `<div class="nchat-empty">Ancora nessuna risposta.${noteReplyAs(n) ? ' Scrivi tu la prima qui sotto.' : ''}</div>`}
            ${l.map(r => { const me = noteReplyMine(r); return `<div class="nchat-msg ${me ? 'me' : ''}"><span class="who">${esc(me ? 'Tu' + (r.by === 'COORD' ? ' (coordinatore)' : '') : noteReplyName(r))}</span><div class="txt">${esc(r.text)}</div><div class="at">${esc(at(r.at))}${me ? `<button onclick="noteReplyDelete('${n.id}','${r.id}')" title="Elimina la risposta" aria-label="Elimina la risposta"><span class="material-icons-round">delete</span></button>` : ''}</div></div>`; }).join('')}`;
    }
    function noteChatRender(update) {
        const el = document.getElementById('note-chat'), n = noteChatId && opNotes[noteChatId];
        if(!el) return;
        if(!n) { if(update) { noteCloseChat(); ccToast('La nota è stata eliminata.', true); } return; }
        const list = update && el.querySelector('.nchat-list');
        if(list) {
            const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
            list.innerHTML = noteChatListHtml(n); if(atEnd) list.scrollTop = list.scrollHeight;
        } else {
            const as = noteReplyAs(n);
            el.innerHTML = `<div class="nchat-box" role="dialog" aria-labelledby="nchat-title">
                <div class="nchat-head"><span class="material-icons-round">forum</span><div><h4 id="nchat-title">Nota di ${esc(noteName(n))}</h4><small><span>${esc(noteWhen(n.date, true))}</span>${noteTo(n) === 'ALL' ? ' · a tutti' : ' · ' + (noteTo(n) === 'COORD' ? 'per il coordinatore' : 'per ' + esc(noteToName(n)))}</small></div>
                    <button class="cc-icon-btn" onclick="noteCloseChat()" aria-label="Chiudi"><span class="material-icons-round">close</span></button></div>
                <div class="nchat-list">${noteChatListHtml(n)}</div>
                ${as ? `<div class="nchat-as">Rispondi come <b>${esc(as.by === 'COORD' ? 'Coordinatore' + (as.byName ? ' (' + as.byName + ')' : '') : noteReplyName(as))}</b>${noteTo(n) === 'ALL' ? ' · la vedono tutti' : ' · la vede solo chi vede questa nota'}</div>
                <div class="nchat-foot"><textarea id="nchat-text" rows="1" maxlength="500" placeholder="Scrivi una risposta…" oninput="this.style.height='auto';this.style.height=Math.min(120,this.scrollHeight)+'px'"></textarea><button class="nchat-send" onclick="noteReplySend()" aria-label="Invia"><span class="material-icons-round">send</span></button></div>`
                : `<div class="nchat-foot"><div class="nchat-ro">Per rispondere scegli prima chi sei.</div></div>`}
            </div>`;
            const l2 = el.querySelector('.nchat-list'); setTimeout(() => { l2.scrollTop = l2.scrollHeight; }, 30);
        }
        noteChatMarkRead(n);
    }
    function noteReplySend() {
        const id = noteChatId, n = id && opNotes[id], t = document.getElementById('nchat-text'); if(!n || !t) return;
        const text = (t.value || '').trim().slice(0, 500); if(!text) { t.focus(); return; }
        const as = noteReplyAs(n); if(!as) { ccToast('Per rispondere scegli prima chi sei.', true); return; }
        if(!fbReady) { ccToast('Risposta non inviata: nessuna connessione a Firebase.', true); return; }
        vibrate();
        const rid = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), val = Object.assign({}, as, { text, at: new Date().toISOString() });
        if(!val.byName) delete val.byName;
        opNotes[id] = Object.assign({}, n, { replies: Object.assign({}, n.replies || {}, { [rid]: val }) });
        t.value = ''; t.style.height = '';
        // segno già come vista la mia risposta, così non mi arriva come notifica
        try { const k = 'note_notified_v2_' + normalizeNameForMatch(prefOwner()), a = JSON.parse(localStorage.getItem(k) || '[]'); a.push('r|' + id + '|' + rid); localStorage.setItem(k, JSON.stringify(a.slice(-800))); } catch(e) {}
        notesAfterChange();
        const l = document.querySelector('#note-chat .nchat-list'); if(l) { l.innerHTML = noteChatListHtml(opNotes[id]); l.scrollTop = l.scrollHeight; }
        cfgRef('prefs').set({ [NOTE_FIELD]: { [id]: { replies: { [rid]: val } } } }, { merge: true })
            .catch(e => { console.error(e); ccToast('Risposta non salvata: ' + (e.code || e.message), true); });
    }
    async function noteReplyDelete(id, rid) {
        const n = opNotes[id], r = n && n.replies && n.replies[rid]; if(!r || !noteReplyMine(r)) return;
        const ok = await ccConfirm('Eliminare la risposta?', `“${String(r.text).slice(0, 80)}”`, 'Elimina', 'solid-danger'); if(!ok) return;
        const rep = Object.assign({}, n.replies); delete rep[rid];
        opNotes[id] = Object.assign({}, n, { replies: rep }); notesAfterChange();
        cfgRef('prefs').update(new firebase.firestore.FieldPath(NOTE_FIELD, id, 'replies', rid), firebase.firestore.FieldValue.delete())
            .catch(e => { console.error(e); ccToast('Risposta non eliminata: ' + (e.code || e.message), true); });
    }

    // ── Elenco nella barra di Modifica turni (note per il coordinatore) ────
    function edNotesBase() { return noteList().filter(n => noteTo(n) === 'COORD'); }
    function edNotesCount() { const t = ymd(new Date()); return edNotesBase().filter(n => n.status !== 'fatta' && (!n.date || n.date >= t)).length; }
    function edNotesUi() {
        const b = document.getElementById('ces-notes'); if(!b) return;
        const n = edNotesCount();
        b.classList.toggle('on', edNotesOpen); b.title = edNotesOpen ? 'Chiudi le note degli operatori' : 'Note degli operatori';
        const c = b.querySelector('.ces-badge'); if(c) { c.textContent = n || ''; c.style.display = n ? '' : 'none'; }
        const k = document.getElementById('cc-count-note'); if(k) { const x = noteIsCoord() ? edNotesBase().filter(z => z.status === 'nuova').length : 0; k.textContent = x || ''; }
    }
    function edNotesToggle(force) {
        vibrate(); edNotesOpen = typeof force === 'boolean' ? force : !edNotesOpen;
        let p = document.getElementById('ed-notes');
        if(!p) { p = document.createElement('div'); p.id = 'ed-notes'; p.className = 'cc-scope'; document.body.appendChild(p); }
        if(edNotesOpen) { edNotesRender(); p.classList.add('show'); noteMarkSeen(edNotesItems()); } else p.classList.remove('show');
        edNotesUi();
    }
    function edNotesItems() { const t = ymd(new Date()); return edNotesBase().filter(n => edNotesAll || (n.status !== 'fatta' && (!n.date || n.date >= t))); }
    function edNotesRender() {
        const p = document.getElementById('ed-notes'); if(!p) return;
        const items = edNotesItems();
        p.innerHTML = `<div class="edn-head"><span class="material-icons-round">sticky_note_2</span><b>Note degli operatori</b>
                <button class="edn-x" onclick="edNotesToggle(false)" aria-label="Chiudi"><span class="material-icons-round">close</span></button>
                <div class="edn-tabs"><button class="${edNotesAll ? '' : 'on'}" onclick="edNotesAll=false;edNotesRender()">Da gestire</button><button class="${edNotesAll ? 'on' : ''}" onclick="edNotesAll=true;edNotesRender()">Tutte</button></div></div>
            <div class="edn-list">${items.length ? items.map(n => noteItemHtml(n, 'ed')).join('') : `<div class="edn-empty">${edNotesAll ? 'Nessuna nota.' : 'Nessuna nota da gestire per i prossimi giorni.'}</div>`}</div>
            <div class="edn-foot">Tocca una nota per andare al giorno.</div>`;
    }
    function noteItemHtml(n, where) {
        const st = n.status || 'nuova', t = noteTo(n), forCoord = t === 'COORD';
        const at = n.createdAt ? new Date(n.createdAt).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        const acts = [];
        if(forCoord && noteIsCoord() && where !== 'sent') acts.push(st === 'fatta' ? `<button onclick="event.stopPropagation();noteSetStatus('${n.id}','vista')" title="Riapri"><span class="material-icons-round">undo</span></button>` : `<button onclick="event.stopPropagation();noteSetStatus('${n.id}','fatta')" title="Segna come gestita"><span class="material-icons-round">check_circle</span></button>`);
        if(noteMine(n)) acts.push(`<button onclick="event.stopPropagation();noteOpenEditor('${n.date}','${n.id}')" title="Modifica"><span class="material-icons-round">edit</span></button>`);
        if(where === 'cc' || where === 'sent' || noteMine(n)) acts.push(`<button onclick="event.stopPropagation();noteDelete('${n.id}')" title="Elimina"><span class="material-icons-round">delete</span></button>`);
        return `<div class="note-row st-${forCoord ? st : 'x'}" onclick="noteGo('${n.id}')">
            <div class="note-r1"><b>${esc(noteName(n))}</b>${noteToChip(n)}<span class="note-date">${esc(noteWhen(n.date))}</span>${notePrefChip(n)}${forCoord && st === 'nuova' ? '<span class="note-new">nuova</span>' : ''}</div>
            ${n.text ? `<p>${esc(n.text)}</p>` : ''}
            <div class="note-r3">${noteChatChip(n)}<small>${at ? 'scritta il ' + esc(at) : ''}${forCoord && st === 'fatta' ? ' · gestita' + (n.doneBy ? ' da ' + esc(n.doneBy) : '') : ''}${!forCoord ? ' · ' + esc(noteStatusTxt(n)) : ''}</small>${acts.join('')}</div>
        </div>`;
    }
    function noteGo(id) {
        const n = opNotes[id]; if(!n) return;
        if(!n.date) { if(noteMine(n)) noteOpenEditor('', id); return; }
        const r = repRowOfDate(n.date), d = noteColumn(n);
        if(!r) { ccToast('Questo giorno non è nel calendario aperto.', true); return; }
        vibrate();
        const cc = document.getElementById('coord-console'), ccOpen = cc && cc.classList.contains('open');
        if(ccOpen) closeCoordConsole();
        const me = document.getElementById('me-modal'); if(me && me.classList.contains('open')) closeMyPage();
        setTimeout(() => calGoToCell(r, d ? d.idx : undefined), ccOpen ? 220 : 0);
    }

    // ── Area Coordinatore › Note ───────────────────────────────────────────
    let ccNotesTab = 'aperte';
    function renderCcNotes() {
        const main = document.getElementById('cc-main'); if(!main) return;
        const t = ymd(new Date()), rec = edNotesBase(), sent = noteList().filter(n => n.author === 'COORD');
        const tabs = { aperte: rec.filter(n => n.status !== 'fatta'), fatte: rec.filter(n => n.status === 'fatta'), inviate: sent };
        const list = tabs[ccNotesTab] || [], where = ccNotesTab === 'inviate' ? 'sent' : 'cc';
        // prima i giorni da oggi in poi (e le note senza giorno), poi quelli passati (più recenti in cima)
        const next = list.filter(n => !n.date || n.date >= t), past = list.filter(n => n.date && n.date < t).reverse();
        main.innerHTML = `<div class="cc-toolbar"><div class="cc-seg">
                <button class="${ccNotesTab === 'aperte' ? 'active' : ''}" onclick="ccNotesTab='aperte';renderCcNotes()">Da gestire (${tabs.aperte.length})</button>
                <button class="${ccNotesTab === 'fatte' ? 'active' : ''}" onclick="ccNotesTab='fatte';renderCcNotes()">Gestite (${tabs.fatte.length})</button>
                <button class="${ccNotesTab === 'inviate' ? 'active' : ''}" onclick="ccNotesTab='inviate';renderCcNotes()">Inviate da te (${tabs.inviate.length})</button></div></div>
            <div class="cc-scope note-cc">${list.length ? `${next.length ? `<div class="note-sec">Da oggi in poi</div>${next.map(n => noteItemHtml(n, where)).join('')}` : ''}${past.length ? `<div class="note-sec">Giorni passati</div>${past.map(n => noteItemHtml(n, where)).join('')}` : ''}`
                : `<div class="cc-empty"><span class="msym">sticky_note_2</span>${ccNotesTab === 'inviate' ? 'Non hai ancora mandato note.' : (ccNotesTab === 'fatte' ? 'Nessuna nota gestita.' : 'Nessuna nota dagli operatori.')}</div>`}</div>
            <div class="cc-legend"><span>Gli operatori scrivono una nota toccando un giorno nel calendario: quelle per il coordinatore le vedete solo tu e chi le scrive. Le note tra colleghi restano private tra loro. Con “Scrivi una nota” ne mandi una a un collega o a tutti.</span></div>`;
        document.getElementById('cc-top-actions').innerHTML = `<button class="cc-btn primary" onclick="noteOpenEditor('', null, true)"><span class="msym">edit_note</span>Scrivi una nota</button>`;
        if(ccNotesTab === 'aperte') noteMarkSeen(tabs.aperte);
    }

    // ── Dettaglio del giorno (tocco su una casella): note del giorno e pulsante per scriverne una ──
    function noteDaySectionHtml(iso) {
        if(!iso) return '';
        const list = noteList().filter(n => n.date === iso), guest = prefOwner() === 'OSPITE';
        if(guest && !list.length) return '';
        const head = n => noteMine(n) ? `La tua nota${noteTo(n) === 'COORD' ? '' : ' ' + noteToChip(n)}` : `${esc(noteName(n))} ${noteToChip(n)}`;
        return `<div class="sm2-sec note"><span class="material-icons-round">sticky_note_2</span>Note del giorno${list.length ? `<span class="sm2-n">${list.length}</span>` : ''}</div><div class="sm2-pad"><div class="note-day">
            ${list.map(n => `<div class="note-day-it" onclick="${noteMine(n) ? `closeShiftModal();setTimeout(() => noteOpenEditor('${n.date}','${n.id}'), 220)` : `closeShiftModal();setTimeout(() => noteOpenChat('${n.id}'), 220)`}"><span class="material-icons-round">sticky_note_2</span><div><b>${head(n)}</b> ${notePrefChip(n)}<div>${esc(n.text || '')}</div><small>${esc(noteStatusTxt(n))}</small><div style="margin-top:5px">${noteChatChip(n, true)}</div></div></div>`).join('')}
            ${guest ? '' : `<button class="note-day-btn" onclick="closeShiftModal();setTimeout(() => noteOpenEditor('${iso}'), 220)"><span class="material-icons-round">edit_note</span>Scrivi una nota<small>al coordinatore, a un collega o a tutti</small></button>`}
        </div></div>`;
    }
    // ── La mia pagina: note ricevute e scritte ─────────────────────────────
    function myNotesHtml() {
        const t = ymd(new Date()), keep = n => !n.date || n.date >= t;
        const rec = noteList().filter(n => noteForMe(n) && !noteMine(n) && noteTo(n) !== 'COORD' && keep(n)), mine = noteList().filter(n => noteMine(n) && n.author !== 'COORD' && keep(n));
        const row = n => `<div class="me-note" onclick="${noteMine(n) ? `closeMyPage();setTimeout(() => noteOpenEditor('${n.date}','${n.id}'), 260)` : `noteGo('${n.id}')`}"><span class="when">${esc(noteWhen(n.date))}</span>${notePrefChip(n)}${noteMine(n) ? noteToChip(n) : `<span class="note-to">da ${esc(noteName(n))}${noteTo(n) === 'ALL' ? ' a tutti' : ''}</span>`}<span class="what">${esc(n.text || '')}</span>${noteChatChip(n)}<small>${esc(noteStatusTxt(n))}</small></div>`;
        setTimeout(() => noteMarkSeen(rec), 0);
        return `<div class="me-card" id="me-notes"><h4><span class="material-icons-round">sticky_note_2</span>Note</h4>
            ${rec.length ? `<div class="me-note-sec">Ricevute</div>${rec.map(row).join('')}` : ''}
            <div class="me-note-sec">Scritte da te</div>${mine.length ? mine.map(row).join('') : '<small>Nessuna nota per i prossimi giorni.</small>'}
            <p class="me-note-hint">Per scriverne una tocca il giorno nel calendario e poi “Scrivi una nota”: al coordinatore, a un collega (la vedete solo voi due) o a tutti.</p></div>`;
    }

    // ═══ MESSAGGI ALL'APERTURA DELL'APP (dall'Area Coordinatore) ═════════════
    // Il coordinatore scrive messaggi che compaiono a tutti quando aprono l'app, per i giorni
    // scelti; ognuno resta a schermo i secondi indicati (0 = finché non si tocca "Ho capito").
    // Documento impostazioni: coordMessages: [{ id, title, text, secs, from, to, active, by, updatedAt }]
    let coordMessages = [], cmDraft = null;
    function cmValidToday(m) { const t = ymd(new Date()); return m && m.active !== false && (m.title || m.text) && (!m.from || m.from <= t) && (!m.to || m.to >= t); }
    function cmStartupItems() { return (coordMessages || []).filter(cmValidToday).map(m => ({ icon: 'campaign', title: m.title || 'MESSAGGIO DEL COORDINATORE', text: m.text || '', secs: +m.secs || 0 })); }
    function renderCcMessages() {
        const main = document.getElementById('cc-main'); if(!main) return;
        if(!cmDraft) cmDraft = JSON.parse(JSON.stringify(coordMessages || []));
        const t = ymd(new Date());
        const card = (m, i) => { const st = m.active === false ? 'spento' : (m.to && m.to < t ? 'scaduto' : (m.from && m.from > t ? 'dal ' + noteWhen(m.from) : 'visibile oggi'));
            return `<div class="cm-card ${cmValidToday(m) ? 'on' : ''}">
                <div class="cm-row"><input class="cc-input" placeholder="Titolo (es. Riunione)" maxlength="60" value="${esc(m.title || '')}" oninput="cmSet(${i},'title',this.value)"><span class="cm-st">${esc(st)}</span></div>
                <textarea class="cc-input cm-text" rows="3" maxlength="600" placeholder="Testo del messaggio" oninput="cmSet(${i},'text',this.value)">${esc(m.text || '')}</textarea>
                <div class="cm-row cm-opts">
                    <label>Resta a schermo <input class="cc-input cm-secs" type="number" min="0" max="120" value="${+m.secs || 0}" onchange="cmSet(${i},'secs',Math.max(0,Math.min(120,+this.value||0)))"> secondi <small>(0 = finché non si chiude)</small></label>
                    <label>Dal <input class="cc-input" type="date" value="${esc(m.from || '')}" onchange="cmSet(${i},'from',this.value)"></label>
                    <label>al <input class="cc-input" type="date" value="${esc(m.to || '')}" onchange="cmSet(${i},'to',this.value)"></label>
                    <label class="cm-act"><input type="checkbox" ${m.active !== false ? 'checked' : ''} onchange="cmSet(${i},'active',this.checked)"> Attivo</label>
                    <span class="cc-spacer"></span>
                    <button class="cc-btn sm" onclick="cmPreview(${i})"><span class="msym">visibility</span>Anteprima</button>
                    <button class="cc-btn sm danger" onclick="cmDel(${i})"><span class="msym">delete</span></button>
                </div></div>`; };
        main.innerHTML = `<div class="cm-list">${cmDraft.length ? cmDraft.map(card).join('') : `<div class="cc-empty"><span class="msym">campaign</span>Nessun messaggio. Aggiungine uno: lo vedranno tutti all’apertura dell’app.</div>`}</div>
            <div class="cc-toolbar" style="margin-top:12px"><button class="cc-btn" onclick="cmAdd()"><span class="msym">add_circle</span>Nuovo messaggio</button><span class="cc-spacer"></span><button class="cc-btn primary" onclick="cmSave()"><span class="msym">save</span>Salva i messaggi</button></div>
            <div class="cc-legend"><span>I messaggi attivi compaiono a tutti quando aprono l’app, nei giorni indicati (senza date: sempre). Se metti dei secondi, il messaggio si chiude da solo con una barra che si accorcia.</span></div>`;
    }
    function cmSet(i, k, v) { if(cmDraft && cmDraft[i]) { cmDraft[i][k] = v; if(k === 'active' || k === 'from' || k === 'to') renderCcMessages(); } }
    function cmAdd() { vibrate(); if(!cmDraft) cmDraft = []; cmDraft.push({ id: 'cm' + Date.now().toString(36), title: '', text: '', secs: 8, from: ymd(new Date()), to: '', active: true }); renderCcMessages(); }
    async function cmDel(i) { if(!(await ccConfirm('Eliminare il messaggio?', (cmDraft[i].title || cmDraft[i].text || '').slice(0, 80), 'Elimina', 'solid-danger'))) return; cmDraft.splice(i, 1); renderCcMessages(); }
    function cmPreview(i) { const m = cmDraft[i]; if(!m) return; announcementQueue = [{ icon: 'campaign', title: m.title || 'MESSAGGIO DEL COORDINATORE', text: m.text || '', secs: +m.secs || 0 }]; showNextAnnouncement(); }
    function cmSave() {
        vibrate();
        const now = new Date().toISOString(), by = (userIdentity && userIdentity !== 'Ospite') ? userIdentity : (coordinatorName || '');
        const list = (cmDraft || []).filter(m => (m.title || '').trim() || (m.text || '').trim()).map(m => Object.assign({}, m, { title: (m.title || '').trim(), text: (m.text || '').trim(), secs: +m.secs || 0, by, updatedAt: now }));
        coordMessages = list; cmDraft = JSON.parse(JSON.stringify(list)); renderCcMessages();
        if(!fbReady) { ccToast('Nessuna connessione a Firebase: messaggi non salvati.', true); return; }
        saveSettingsFields({ coordMessages: list }).catch(e => ccToast('Salvataggio non riuscito: ' + (e.code || e.message), true));
        ccToast('Messaggi salvati');
    }

    // ═══ CHI LAVORA CON CHI ══════════════════════════════════════════════
    // Per ogni coppia di colleghi: quanti turni hanno fatto insieme (stessa mattina, stesso
    // pomeriggio o stessa notte; M+N conta per mattina e notte, i diurni m/p con mattina e
    // pomeriggio). Per una persona scelta: grafico a barre con la media dei suoi colleghi,
    // così si vede con chi lavora troppo spesso o quasi mai. Sotto, la tabella di tutte le coppie.
    // In "Equità dell'anno" e nell'Area Coordinatore (sezione "Chi lavora con chi").
    let pwSel = null, pwCcPeriod = 'oggi', pwKind = 'turnisti';
    const PW_BANDS = { M: ['M'], m: ['M'], P: ['P'], p: ['P'], N: ['N'], 'M+N': ['M', 'N'] };
    function pairWork(period) {
        const today = absTodayDate(), all = buildDaysIndex();
        const days = period === 'oggi' ? all.filter(dd => dd.date <= today) : (typeof period === 'number' ? all.filter(dd => dd.monthIdx === period) : all);
        const people = drivers.filter(d => !d.hidden), cnt = {}, tot = {}, notti = {};
        people.forEach(d => { cnt[d.idx] = {}; tot[d.idx] = 0; notti[d.idx] = 0; });
        days.forEach(dd => {
            const band = { M: [], P: [], N: [] };
            people.forEach(d => { const b = PW_BANDS[workCode(dd.rowIdx, d.idx)]; if(!b) return; tot[d.idx]++; b.forEach(x => band[x].push(d.idx)); if(b.includes('N')) notti[d.idx]++; });
            Object.values(band).forEach(g => { for(let i = 0; i < g.length; i++) for(let j = i + 1; j < g.length; j++) { const a = g[i], b = g[j]; cnt[a][b] = (cnt[a][b] || 0) + 1; cnt[b][a] = (cnt[b][a] || 0) + 1; } });
        });
        // turnisti = chi fa notti; i diurnisti si confrontano solo tra loro e con i turnisti di giorno
        const list = people.filter(d => tot[d.idx] > 0).map(d => ({ d, tot: tot[d.idx], turnista: notti[d.idx] > 0 }));
        return { days, list, cnt };
    }
    // media dei turni insieme di una persona con i colleghi dello stesso gruppo
    function pairRow(P, x) {
        const set = P.list.filter(y => y.d.idx !== x.d.idx && (pwKind === 'tutti' || y.turnista === x.turnista));
        const vals = set.map(y => ({ y, n: P.cnt[x.d.idx][y.d.idx] || 0 }));
        const avg = vals.length ? vals.reduce((a, v) => a + v.n, 0) / vals.length : 0;
        return { vals, avg };
    }
    function pairCls(n, avg) { if(!(avg > 0)) return ''; const q = n / avg; return q >= 1.3 ? 'hi' : (q <= 0.7 ? 'lo' : ''); }
    function pairsHtml(period, where) {
        const P = pairWork(period);
        const shown = P.list.filter(x => pwKind === 'tutti' || x.turnista);
        if(shown.length < 2) return `<div class="pw-empty">Nel periodo scelto non ci sono abbastanza turni per confrontare i colleghi.</div>`;
        const me = prefMe();
        let sel = shown.find(x => x.d.originalName === pwSel) || (me && shown.find(x => x.d.idx === me.idx)) || shown[0];
        pwSel = sel.d.originalName;
        const R = pairRow(P, sel), max = Math.max(1, ...R.vals.map(v => v.n));
        const f1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
        const bars = R.vals.slice().sort((a, b) => b.n - a.n || a.y.d.name.localeCompare(b.y.d.name)).map(v => {
            const c = pairCls(v.n, R.avg), diff = Math.round(v.n - R.avg);
            return `<div class="pw-bar ${c}" title="${esc(sel.d.name)} e ${esc(v.y.d.name)}: ${v.n} turni insieme (media ${f1(R.avg)})"><span class="pw-bn">${esc(v.y.d.name)}</span>
                <span class="pw-bt"><i style="width:${Math.round(v.n / max * 100)}%"></i><u style="left:${Math.round(R.avg / max * 100)}%"></u></span>
                <b>${v.n}</b><small>${diff === 0 ? '=' : (diff > 0 ? '+' : '−') + Math.abs(diff)}</small></div>`;
        }).join('');
        // tabella: righe e colonne = colleghi, colore rispetto alla media della riga
        const head = shown.map(y => `<th title="${esc(y.d.name)}"><span>${esc(y.d.name)}</span></th>`).join('');
        const rows = shown.map(x => {
            const rr = pairRow(P, x), on = x.d.idx === sel.d.idx;
            return `<tr class="${on ? 'on' : ''}"><th onclick="pwPick('${esc(x.d.originalName)}','${where}')">${esc(x.d.name)}</th>${shown.map(y => {
                if(y.d.idx === x.d.idx) return '<td class="pw-self"></td>';
                const n = P.cnt[x.d.idx][y.d.idx] || 0, same = pwKind === 'tutti' || y.turnista === x.turnista;
                return `<td class="${same ? (n || rr.avg >= 3 ? pairCls(n, rr.avg) : '') : 'pw-other'}" title="${esc(x.d.name)} e ${esc(y.d.name)}: ${n} turni insieme">${n || ''}</td>`;
            }).join('')}<td class="pw-avg">${f1(rr.avg)}</td></tr>`;
        }).join('');
        const opts = shown.map(x => `<option value="${esc(x.d.originalName)}" ${x === sel ? 'selected' : ''}>${esc(x.d.name)}</option>`).join('');
        const hi = R.vals.filter(v => pairCls(v.n, R.avg) === 'hi').length, lo = R.vals.filter(v => pairCls(v.n, R.avg) === 'lo').length;
        return `<div class="pw">
            <div class="pw-top"><label>Persona <select onchange="pwPick(this.value,'${where}')">${opts}</select></label>
                <div class="pw-kind"><button class="${pwKind === 'turnisti' ? 'on' : ''}" onclick="pwSetKind('turnisti','${where}')">Solo turnisti</button><button class="${pwKind === 'tutti' ? 'on' : ''}" onclick="pwSetKind('tutti','${where}')">Anche diurnisti</button></div></div>
            <div class="pw-box"><div class="pw-h"><b>${esc(sel.d.name)}</b> · ${sel.tot} turni lavorati · in media <b>${f1(R.avg)}</b> turni con ogni collega${hi || lo ? ` · <span class="pw-tag hi">${hi} spesso</span> <span class="pw-tag lo">${lo} poco</span>` : ''}</div>
                <div class="pw-bars">${bars}</div>
                <p class="pw-note">La barra è il numero di turni fatti insieme (stessa mattina, pomeriggio o notte); la linea verticale è la media. <span class="eq-key hi"></span> oltre il 30% sopra la media, <span class="eq-key lo"></span> oltre il 30% sotto.</p></div>
            <div class="pw-tw"><table class="pw-t"><thead><tr><th></th>${head}<th class="pw-avg">Media</th></tr></thead><tbody>${rows}</tbody></table></div>
            <p class="pw-note">${P.days.length} giorni considerati. In ogni riga i colori sono rispetto alla media di quella persona${pwKind === 'turnisti' ? '' : ' (turnisti e diurnisti a confronto solo con il proprio gruppo; le caselle grigie sono dell’altro gruppo)'}. Tocca un nome per vederne il grafico.</p>
        </div>`;
    }
    function pwRefresh(where) { if(where === 'cc') renderCcPairs(); else renderEquity(); }
    function pwPick(orig, where) { vibrate(); pwSel = orig; pwRefresh(where); }
    function pwSetKind(k, where) { vibrate(); pwKind = k; pwRefresh(where); }
    function pwCcSetPeriod(p) { vibrate(); pwCcPeriod = p === 'oggi' || p === 'anno' ? p : +p; renderCcPairs(); }
    function renderCcPairs() {
        const main = document.getElementById('cc-main'); if(!main) return;
        const p = pwCcPeriod, months = MONTH_NAMES_IT.map((m, i) => `<option value="${i}" ${p === i ? 'selected' : ''}>${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('');
        main.innerHTML = `<div class="cc-toolbar"><div class="cc-seg"><button class="${p === 'oggi' ? 'active' : ''}" onclick="pwCcSetPeriod('oggi')">Fino a oggi</button><button class="${p === 'anno' ? 'active' : ''}" onclick="pwCcSetPeriod('anno')">Anno intero</button></div>
            <select class="cc-input pw-month" onchange="pwCcSetPeriod(this.value)"><option value="" ${typeof p === 'number' ? '' : 'selected'} disabled>Un mese…</option>${months}</select></div>
            ${pairsHtml(p, 'cc')}`;
    }

    // ═══ CONTEGGIO ORE › VISTA "FOGLIO" (come il file Excel) ════════════════
    // Righe = giorni del mese, per ogni persona: turno, ore lavorate, ore di assenza giustificata
    // (col colore dell'assenza) e, la domenica, il totale della settimana; il lunedì dopo il
    // saldo progressivo dall'inizio dell'anno (verde sopra, rosso sotto il contratto).
    let hgView = (() => { try { return localStorage.getItem('hg_view_v1') || 'riep'; } catch(e) { return 'riep'; } })();
    function hgSetView(v) { vibrate(); hgView = v; try { localStorage.setItem('hg_view_v1', v); } catch(e) {} renderHoursGrid(); }
    function renderHoursGrid() {
        document.querySelectorAll('#hc-list-view .hg-viewsw button').forEach(b => b.classList.toggle('active', b.dataset.v === hgView));
        const leg = document.querySelector('#hc-list-view .hg-legend'), note = document.querySelector('#hc-list-view .hg-note');
        if(leg) leg.style.display = hgView === 'foglio' ? 'none' : '';
        const nav = document.querySelector('#hc-list-view .hg-nav'), pick = document.getElementById('hs-pick');
        if(nav) nav.style.display = hgView === 'foglio' ? 'none' : '';
        if(pick) pick.style.display = hgView === 'foglio' ? '' : 'none';
        if(hgView !== 'foglio') { if(note && note.dataset.orig) note.innerHTML = note.dataset.orig; renderHoursGridOld(); return; }
        if(note && !note.dataset.orig) note.dataset.orig = note.innerHTML;
        renderHoursSheet();
    }
    const HS_HEAD_COLORS = ['#ef4444', '#d946ef', '#38bdf8', '#22c55e', '#f59e0b', '#8b5cf6', '#14b8a6', '#f43f5e'];
    function hsHM(min) { const neg = min < 0, m = Math.round(Math.abs(min)); return (neg && m ? '−' : '') + Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); }
    // Tutto l'anno in un solo foglio che scorre in verticale (un'intestazione per ogni mese con le
    // ore del mese di ognuno). In alto si sceglie se vedere tutti gli operatori affiancati o uno solo.
    let hsPick = (() => { try { return localStorage.getItem('hs_pick_v1') || ''; } catch(e) { return ''; } })();
    let hsGen = 0;
    function hsSetPick(v) {
        vibrate(); hsPick = v; try { localStorage.setItem('hs_pick_v1', v); } catch(e) {}
        // si resta sullo stesso giorno: si ricorda la prima riga visibile e la si ritrova dopo
        const w = document.querySelector('#hg-grid .hs-wrap'); let anchor = null;
        if(w) { const head = w.querySelector('thead').offsetHeight, rows = [...w.querySelectorAll('tbody tr')]; const i = rows.findIndex(r => r.offsetTop + r.offsetHeight > w.scrollTop + head); if(i >= 0) anchor = { d: rows[i].dataset.d, off: rows[i].offsetTop - w.scrollTop }; }
        renderHoursSheet(anchor);
    }
    function hsPickHtml(people) {
        const me = prefMe(), list = people.slice().sort((a, b) => (me && b.idx === me.idx) - (me && a.idx === me.idx));
        const opts = [`<option value="">Tutti gli operatori (${people.length})</option>`]
            .concat(list.map(d => `<option value="${esc(d.originalName || d.name)}" ${hsPick === (d.originalName || d.name) ? 'selected' : ''}>${esc(d.name)}${me && d.idx === me.idx ? ' (tu)' : ''}</option>`));
        return `<label class="hs-pick-lbl" for="hs-pick-sel"><span class="material-icons-round">person_search</span></label>
            <select id="hs-pick-sel" onchange="hsSetPick(this.value)">${opts.join('')}</select>
            ${hsPick ? `<button class="hs-pick-all" onclick="hsSetPick('')"><span class="material-icons-round">groups</span>Tutti</button>` : ''}`;
    }
    function renderHoursSheet(keepTop) {
        const el = document.getElementById('hg-grid'); if(!el) return;
        const all = buildDaysIndex(), today = ymd(new Date());
        const everyone = drivers.filter(d => !d.hidden);
        if(hsPick && !everyone.some(d => (d.originalName || d.name) === hsPick)) hsPick = '';
        const people = hsPick ? everyone.filter(d => (d.originalName || d.name) === hsPick) : everyone;
        const pick = document.getElementById('hs-pick'); if(pick) pick.innerHTML = hsPickHtml(everyone);
        // per persona, su tutto l'anno: minuti lavorati / di assenza, totale settimana, saldo progressivo, ore del mese
        const data = people.map(d => {
            const ch = getContractHours(d.idx), sp = serviceSpan(d.idx), perDay = ch * 60 / CONTRACT_WORKDAYS;
            let cum = 0, weekTot = 0; const byRow = {}, weekEnd = {}, balAfter = {}, month = {};
            all.forEach((dd, i) => {
                const info = computeDayInfo(dd.rowIdx, d.idx), inS = dd.date >= sp.first && dd.date <= sp.last;
                const work = info.justified ? 0 : (info.minutes || 0), abs = info.justified ? (info.minutes || 0) : 0;
                byRow[dd.rowIdx] = { info, work, abs, inS };
                weekTot += work + abs;
                const M = month[dd.monthIdx] || (month[dd.monthIdx] = { tot: 0, tgt: 0, inS: false });
                M.tot += work + abs; if(inS) { M.inS = true; if(isContractDay(dd.date)) M.tgt += perDay; }
                if(inS) cum += work + abs - (isContractDay(dd.date) ? perDay : 0);
                if(dd.date.getDay() === 0 || i === all.length - 1) { weekEnd[dd.rowIdx] = weekTot; balAfter[ymd(dd.date)] = cum; weekTot = 0; }
            });
            return { d, byRow, weekEnd, balAfter, month, inYear: sp.first.getFullYear() < 3000 };
        });
        const one = data.length === 1, wd = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
        const colorOf = d => HS_HEAD_COLORS[everyone.indexOf(d) % HS_HEAD_COLORS.length];
        const curM = today.slice(0, 4) === String(SHIFT_YEAR) ? new Date().getMonth() : 0;
        const head1 = `<tr><th class="hs-date hs-h1" rowspan="2">${SHIFT_YEAR}</th>${data.map(p => `<th class="hs-name" colspan="4" style="--hc:${colorOf(p.d)}" onclick="openHoursDetail(${p.d.idx}, ${curM})">${esc(p.d.name)}<small>${getContractHours(p.d.idx)} h/sett.</small></th>`).join('')}</tr>`;
        const head2 = `<tr>${data.map(() => `<th class="hs-sub">Turno</th><th class="hs-sub">Ore</th><th class="hs-sub">Ass.</th><th class="hs-sub hs-wk">Sett.</th>`).join('')}</tr>`;
        const parts = {}; let lastM = -1;
        all.forEach(dd => {
            if(dd.monthIdx !== lastM) {
                lastM = dd.monthIdx; parts[lastM] = '';
                const mName = MONTH_NAMES_IT[lastM];
                parts[lastM] += `<tr class="hs-mrow" id="hs-m-${lastM}" data-d="m${lastM}"><th class="hs-date hs-mlabel">${mName.charAt(0).toUpperCase() + mName.slice(1)}</th>${data.map(p => {
                    const M = p.month[lastM]; if(!M || (!M.inS && !M.tot)) return '<td class="hs-mtot" colspan="4"></td>';
                    const df = M.tot - M.tgt, cls = Math.abs(df) < 1 ? '' : (df < 0 ? 'neg' : 'pos');
                    return `<td class="hs-mtot" colspan="4"><b>${hsHM(M.tot)}</b><span>ore del mese</span>${M.tgt ? `<em class="${cls}">${cls ? (df > 0 ? '+' : '') + hsHM(df) : 'in pari'}</em>` : ''}</td>`;
                }).join('')}</tr>`;
            }
            const iso = ymd(dd.date), g = dd.date.getDay(), red = g === 0 || !!HOLIDAYS[`${dd.monthIdx}-${dd.day}`], sun = g === 0;
            const prevSun = new Date(dd.date); prevSun.setDate(prevSun.getDate() - 1);
            const cells = data.map(p => {
                const c = p.byRow[dd.rowIdx]; if(!c) return '<td></td><td></td><td></td><td class="hs-wk"></td>';
                const meta = ccCodeMeta(c.info), code = c.info.code;
                const codeCell = code ? `<td class="hs-code"><span style="${swatchStyle(meta.colors)}">${esc(meta.short || code)}</span></td>` : `<td class="hs-code"><span class="hs-dash">${c.inS ? '-' : ''}</span></td>`;
                const ore = `<td class="hs-ore ${c.work ? '' : 'z'}">${c.inS || c.work ? hsHM(c.work) : ''}</td>`;
                const ass = c.abs ? `<td class="hs-ass" style="background:var(${(meta.colors && meta.colors.bg) || '--bg-mal'});color:var(${(meta.colors && meta.colors.fg) || '--t-mal'})">${hsHM(c.abs)}</td>` : '<td class="hs-ass"></td>';
                let wk = '';
                if(p.weekEnd[dd.rowIdx] !== undefined && p.inYear) wk = `<b>${hsHM(p.weekEnd[dd.rowIdx])}</b>`;
                else if(g === 1 && p.balAfter[ymd(prevSun)] !== undefined && p.inYear) { const b = p.balAfter[ymd(prevSun)]; wk = `<em class="${Math.abs(b) < 1 ? '' : (b < 0 ? 'neg' : 'pos')}" title="Saldo dall'inizio dell'anno">${b > 0 ? '+' : ''}${hsHM(b)}</em>`; }
                return codeCell + ore + ass + `<td class="hs-wk">${wk}</td>`;
            }).join('');
            parts[lastM] += `<tr class="${sun ? 'hs-sun' : ''} ${iso === today ? 'hs-today' : ''}" data-d="${iso}"><th class="hs-date ${red ? 'red' : ''}"><b>${dd.day}</b><small>${wd[g]}</small></th>${cells}</tr>`;
        });
        const months = Object.keys(parts).map(Number).sort((a, b) => a - b), gen = ++hsGen;
        const tb = m => `<tbody data-m="${m}">${parts[m]}</tbody>`;
        const startM = months.includes(curM) ? curM : months[0], progressive = !keepTop && months.length > 2;
        // si parte dal mese corrente più il successivo, così c'è spazio per portare oggi in alto
        const firstMs = progressive ? months.filter(m => m >= startM).slice(0, 2) : months;
        el.innerHTML = `<div class="hs-wrap ${one ? 'hs-one' : ''}"><table class="hs-table"><thead>${head1}${head2}</thead>${firstMs.map(tb).join('')}</table></div>`;
        if(progressive) {
            const after = months.filter(m => m > firstMs[firstMs.length - 1]), before = months.filter(m => m < startM).reverse();
            const step = () => {
                const w = el.querySelector('.hs-wrap'), table = w && w.querySelector('table');
                if(gen !== hsGen || !table) return;
                if(after.length) table.insertAdjacentHTML('beforeend', tb(after.shift()));
                else if(before.length) { const h0 = w.scrollHeight; table.querySelector('tbody').insertAdjacentHTML('beforebegin', tb(before.shift())); w.scrollTop += w.scrollHeight - h0; }
                else return;
                setTimeout(step, 20);
            };
            setTimeout(step, 60);
        }
        const note = document.querySelector('#hc-list-view .hg-note');
        if(note) note.innerHTML = 'Come il foglio Excel, con tutto l’anno da scorrere in verticale: per ognuno il turno, le ore lavorate e le ore di assenza giustificata (col colore dell’assenza). All’inizio di ogni mese le ore del mese e la differenza dal contratto; la domenica il totale della settimana, il lunedì dopo il saldo dall’inizio dell’anno (verde sopra, rosso sotto). Scegli un operatore dall’elenco per vedere solo lui; tocca un nome per il dettaglio.';
        const w = el.querySelector('.hs-wrap'); if(!w) return;
        if(keepTop) { const r = w.querySelector(`tbody tr[data-d="${keepTop.d}"]`); if(r) w.scrollTop = Math.max(0, r.offsetTop - keepTop.off); return; }
        const t = el.querySelector('.hs-today'); if(t) setTimeout(() => { w.scrollTop = Math.max(0, t.offsetTop - 120); }, 30);
    }

    // ═══ ORIGINE DEI TURNI: DA EXCEL O SOLO DALL'APP ═════════════════════
    async function ccSwitchSource(target) {
        if(target === dataSourceMode) return;
        if(isViewingArchive()) { ccToast('Torna all’anno attivo prima di cambiare.', true); return; }
        if(pendingChangesCount()) { ccToast('Prima salva o annulla le modifiche in sospeso.', true); return; }
        if(target === 'excel') {
            const ok = await ccConfirm('Tornare ai turni dal file Excel?', 'L’app mostrerà il file turni.xlsx così com’è. I turni fatti nell’app restano salvati ma non si vedono finché non torni a "Solo dall’app". Le correzioni fatte in modalità Excel ripartono da zero. Prima faccio una copia di sicurezza.', 'Passa a Excel', 'solid-danger');
            if(!ok) return;
            try {
                await takeSnapshot('prima-di-tornare-a-excel');
                const batch = db.batch();
                batch.update(cfgRef('settings'), { dataSource: 'excel', manualOverrides: {}, excelSyncedMarks: {} });
                addLogWrite(batch, [], 'Origine dei turni: file Excel');
                await batch.commit();
                try { localStorage.setItem('data_source_' + DATA_NS, 'excel'); } catch(e) {}
                ccToast('Fatto: ora i turni arrivano dal file Excel. Riapro l’app…'); setTimeout(() => location.reload(), 1200);
            } catch(e) { console.error(e); ccToast('Cambio non riuscito: ' + (e.code || e.message), true); }
            return;
        }
        const choice = await ccDialog('Passare a "Solo dall’app"?', 'Scegli cosa fare con i turni: copiare nell’app tutto il file Excel (i mesi dell’app vengono sostituiti dal file) oppure tenere i turni già salvati nell’app e poi portare dentro solo le differenze con "Importa da Excel". In entrambi i casi prima faccio una copia di sicurezza.', [
            { label: 'Annulla', kind: 'ghost', value: null },
            { label: 'Tieni i turni dell’app', kind: '', value: 'keep' },
            { label: 'Copia il file Excel nell’app', kind: 'solid-danger', value: 'copy' }
        ]);
        if(choice === 'copy') { ccMigrateToFirebase(true); return; }
        if(choice !== 'keep') return;
        try {
            await takeSnapshot('prima-di-passare-a-solo-app');
            const batch = db.batch();
            batch.update(cfgRef('settings'), { dataSource: 'firebase' });
            addLogWrite(batch, [], 'Origine dei turni: solo dall’app (turni dell’app tenuti)');
            await batch.commit();
            sessionStorage.setItem('fb_mode_reloaded', '1');
            ccToast('Fatto: i turni si fanno solo nell’app. Riapro…'); setTimeout(() => location.reload(), 1200);
        } catch(e) { console.error(e); ccToast('Cambio non riuscito: ' + (e.code || e.message), true); }
    }
    function ccSourcePanelHtml() {
        const xl = dataSourceMode !== 'firebase';
        setTimeout(async () => {   // data dell'ultimo caricamento del file Excel ufficiale
            const s = document.getElementById('src-xl-date'); if(!s) return;
            try { const r = await fetch(IMPORT_OFFICIAL.url + '?t=' + Date.now(), { method: 'HEAD', cache: 'no-store' }); const lm = r.headers.get('last-modified'); s.textContent = lm ? 'ultimo caricamento del file: ' + new Date(lm).toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''; } catch(e) {}
        }, 0);
        return `<div class="src-switch" role="radiogroup" aria-label="Origine dei turni">
                <button class="src-opt ${xl ? 'on' : ''}" role="radio" aria-checked="${xl}" onclick="ccSwitchSource('excel')"><span class="msym">table_view</span><span><b>Da file Excel</b><small>il coordinatore carica turni.xlsx su GitHub</small></span>${xl ? '<em>in uso</em>' : ''}</button>
                <button class="src-opt ${xl ? '' : 'on'}" role="radio" aria-checked="${!xl}" onclick="ccSwitchSource('firebase')"><span class="msym">cloud_done</span><span><b>Solo dall’app</b><small>i turni si fanno in Modifica turni</small></span>${xl ? '' : '<em>in uso</em>'}</button>
            </div>
            <div class="src-info"><span class="msym">info</span><div>
                ${xl ? `<b>Ora: i turni arrivano dal file Excel</b> <small id="src-xl-date"></small>
                    <ul><li>L’app mostra il file così com’è: per aggiornare i turni basta caricare il nuovo turni.xlsx.</li>
                    <li>Le correzioni fatte in Modifica turni restano sopra il file.</li>
                    <li><b>Se passi a "Solo dall’app"</b>: scegli se copiare tutto il file nell’app (i mesi vengono sostituiti) o tenere i turni già nell’app e importare solo le differenze. Da lì caricare il file non cambia più niente: i turni si fanno solo qui.</li></ul>`
                : `<b>Ora: i turni si fanno solo nell’app</b> <small id="src-xl-date"></small>
                    <ul><li>Il file Excel non viene letto: se ne carichi uno nuovo, portalo dentro con "Importa da Excel".</li>
                    <li>Tutto ciò che si salva in Modifica turni è subito visibile a tutti (un documento per mese su Firebase).</li>
                    <li><b>Se torni a "Da file Excel"</b>: l’app mostra di nuovo il file così com’è; i turni fatti nell’app restano salvati ma non si vedono finché non torni qui; le correzioni ripartono da zero. Prima del cambio faccio sempre una copia di sicurezza.</li></ul>`}
            </div></div>`;
    }

    // ═══ FINESTRA "I TUOI TURNI SONO CAMBIATI" ═══════════════════════════
    // Riepilogo (modificati / nuovi / tolti), effetto su ore e notti, e ogni giorno con il turno
    // di prima e quello nuovo (colore e orario). Toccando un giorno il calendario va lì.
    function chgDate(k) { const i = k.lastIndexOf('-'); return new Date(SHIFT_YEAR, MONTH_MAP[k.slice(0, i)], parseInt(k.slice(i + 1))); }
    function chgChip(v, k) {
        const [code, sub] = String(v || '').split('|'), dt = chgDate(k);
        if(sub) { const lbl = (ABS_TYPES[sub] && ABS_TYPES[sub].label) || (SPECIAL_SUBCODES[sub] || sub).charAt(0) + (SPECIAL_SUBCODES[sub] || sub).slice(1).toLowerCase(); return { short: ABS_SHORT[sub] || sub.toUpperCase(), label: lbl, time: '', colors: SUB_CODE_COLORS[sub] }; }
        let c = String(code || '').trim(); if(isRepStr(c)) c = c.slice(0, c.indexOf('/')).trim();
        if(!c || c === '-') return { short: '—', label: 'Libero', time: '', colors: null };
        const u = c.toUpperCase().replace(/\s+/g, '');
        if(isMN(u)) return { short: 'M+N', label: 'Mattina + notte', time: `${SCHEDULE.M} e ${SCHEDULE.N}`, colors: MAIN_CODE_COLORS.N };
        if(/^[a-z]/.test(c) && DIURNI_CODE_COLORS[c.toLowerCase()]) { const d = c.toLowerCase(); return { short: d, label: SHIFT_NAMES[d] || d, time: d === 'r' ? '' : diurniSched(d, dt), colors: DIURNI_CODE_COLORS[d] }; }
        const cc = customCodes[u]; if(cc) return { short: u.slice(0, 4), label: (cc.label || u).replace(/\|/g, ' '), time: cc.kind === 'work' ? `${cc.from}-${cc.to}` : '', colors: customColors(u) };
        const key = u === 'S' ? 'SM' : u;
        return { short: u === 'SM' ? 'S' : u, label: SHIFT_NAMES[key] || u, time: SCHEDULE[key] && SCHEDULE[key] !== 'RIPOSO' && u !== 'R' ? SCHEDULE[key] : '', colors: MAIN_CODE_COLORS[key] };
    }
    function chgMinutes(v, k, contractH) {
        const [code, sub] = String(v || '').split('|'), dt = chgDate(k);
        let c = String(code || '').trim(); if(isRepStr(c)) c = c.slice(0, c.indexOf('/')).trim();
        if(sub) return /^r(iposo)?$/i.test(c) || !isContractDay(dt) ? 0 : contractH * 60 / CONTRACT_WORKDAYS;
        if(!c || c === '-') return 0;
        const u = c.toUpperCase().replace(/\s+/g, '');
        if(isMN(u)) return minutesFromRange(SCHEDULE.M) + minutesFromRange(SCHEDULE.N);
        if(/^[a-z]/.test(c)) { const t = diurniSched(c, dt); return t && t !== 'RIPOSO' ? minutesFromRange(t) : 0; }
        const cc = customCodes[u]; if(cc) return customMinutes(cc);
        const t = SCHEDULE[u === 'S' ? 'SM' : u]; return t && t !== 'RIPOSO' ? minutesFromRange(t) : 0;
    }
    const chgIsNight = v => { const c = String(v || '').split('|'); if(c[1]) return false; const u = String(c[0] || '').toUpperCase().replace(/\s+/g, '').split('/')[0]; return u === 'N' || isMN(u); };
    function showChangeAlert2(ch, who) {
        const all = [].concat(ch.changed.map(x => Object.assign({ t: 'mod' }, x)), ch.added.map(x => Object.assign({ t: 'new' }, x)), ch.removed.map(x => Object.assign({ t: 'del' }, x)))
            .sort((a, b) => chgDate(a.k) - chgDate(b.k));
        if(!all.length) return;
        const me = prefMe(), ch36 = me ? getContractHours(me.idx) : 36;
        const minBefore = all.reduce((s, x) => s + chgMinutes(x.from, x.k, ch36), 0), minAfter = all.reduce((s, x) => s + chgMinutes(x.to, x.k, ch36), 0);
        const nBefore = all.filter(x => chgIsNight(x.from)).length, nAfter = all.filter(x => chgIsNight(x.to)).length;
        const dm = minAfter - minBefore, dn = nAfter - nBefore;
        const chip = (v, k) => { const c = chgChip(v, k); return `<span class="chg-chip"><span class="chg-code" style="${c.colors ? swatchStyle(c.colors) : ''}">${esc(c.short)}</span><span class="chg-lbl">${esc(c.label)}${c.time ? `<small>${esc(c.time)}</small>` : ''}</span></span>`; };
        const wd = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
        let lastM = -1, rows = '';
        all.slice(0, 80).forEach(x => {
            const dt = chgDate(x.k);
            if(dt.getMonth() !== lastM) { lastM = dt.getMonth(); rows += `<div class="chg-month">${MONTH_NAMES_IT[lastM].charAt(0).toUpperCase() + MONTH_NAMES_IT[lastM].slice(1)} ${SHIFT_YEAR}</div>`; }
            const red = dt.getDay() === 0 || HOLIDAYS[`${dt.getMonth()}-${dt.getDate()}`];
            rows += `<button class="chg-row ${x.t}" onclick="chgGo('${x.k}')"><span class="chg-date ${red ? 'red' : ''}"><b>${dt.getDate()}</b><small>${wd[dt.getDay()]}</small></span>
                <span class="chg-pair">${x.t === 'new' ? '<span class="chg-tag new">nuovo</span>' : chip(x.from, x.k)}<span class="material-icons-round chg-arrow">arrow_forward</span>${x.t === 'del' ? '<span class="chg-tag del">tolto</span>' : chip(x.to, x.k)}</span></button>`;
        });
        if(all.length > 80) rows += `<div class="chg-more">e altri ${all.length - 80} giorni: li trovi nello storico delle notifiche</div>`;
        const pill = (n, cls, one, many) => n ? `<span class="chg-pill ${cls}">${n} ${n === 1 ? one : many}</span>` : '';
        const fmtD = m => (m > 0 ? '+' : m < 0 ? '−' : '') + permHFmt(Math.abs(m) / 60);
        let el = document.getElementById('chg-modal');
        if(!el) { el = document.createElement('div'); el.id = 'chg-modal'; el.onclick = e => { if(e.target === el) chgClose(); }; document.body.appendChild(el); }
        el.innerHTML = `<div class="chg-card" role="dialog" aria-labelledby="chg-title">
            <div class="chg-head"><span class="chg-ico"><span class="material-icons-round">event_repeat</span></span>
                <div class="chg-ht"><b id="chg-title">${all.length === 1 ? 'Un tuo turno è cambiato' : `${all.length} tuoi turni sono cambiati`}</b><small>${esc(who || (me ? me.name : ''))} · aggiornamento del ${new Date().toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</small></div>
                <button class="chg-x" onclick="chgClose()" aria-label="Chiudi"><span class="material-icons-round">close</span></button></div>
            <div class="chg-sum">${pill(ch.changed.length, 'mod', 'modificato', 'modificati')}${pill(ch.added.length, 'new', 'nuovo', 'nuovi')}${pill(ch.removed.length, 'del', 'tolto', 'tolti')}
                <span class="chg-imp" title="Effetto sui giorni cambiati">ore ${dm === 0 ? 'invariate' : fmtD(dm)}${dn ? ` · notti ${dn > 0 ? '+' : '−'}${Math.abs(dn)}` : ''}</span></div>
            <div class="chg-list">${rows}</div>
            <div class="chg-foot"><button class="chg-btn ghost" onclick="chgClose(true)"><span class="material-icons-round">history</span>Storico</button>
                <button class="chg-btn ghost" onclick="chgGo('${all[0].k}')"><span class="material-icons-round">calendar_month</span>Vedi nel calendario</button>
                <button class="chg-btn primary" onclick="chgClose()"><span class="material-icons-round">check</span>Ho capito</button></div>
        </div>`;
        el.style.display = 'flex'; requestAnimationFrame(() => el.classList.add('open')); vibrate();
    }
    function chgClose(history) {
        const el = document.getElementById('chg-modal'); if(!el) return;
        el.classList.remove('open'); setTimeout(() => { el.style.display = 'none'; }, 250);
        if(history) setTimeout(() => { openNotifCenter(); switchNotifTab('tutte', document.querySelector('#notif-center-modal .nt-tab[data-notiftab="tutte"]')); }, 280);
    }
    function chgGo(k) {
        chgClose();
        const i = k.lastIndexOf('-'), m = k.slice(0, i), d = parseInt(k.slice(i + 1));
        const r = finalData.findIndex((row, j) => j > 0 && row[0].v === m && +row[1].v === d && shiftRowYear(j) === SHIFT_YEAR);
        if(r < 0) return;
        if(calOverview) setCalView('dettaglio');
        setTimeout(() => { if(liteOn()) liteShowRow(r); const tr = document.querySelector(`#table-body tr[data-row="${r}"]`); if(tr) { liteScrollTo(tr, 200); tr.classList.add('chg-flash'); setTimeout(() => tr.classList.remove('chg-flash'), 2200); } }, 300);
    }
    // ═══ DA CONTROLLARE: caselle che non tornano nei conteggi ═══════════════
    // Finestra dell'Area coordinatore con le caselle sospette (notti senza smonto, assenze scritte
    // sotto un turno, codici sconosciuti, assenze oltre il limite…). Si spunta una voce quando è
    // sistemata o va bene così: la spunta sta nelle impostazioni condivise (checksResolved).
    let checksResolved = {}, chkTab = 'open', chkCache = null;
    const CHK_KINDS = {
        night:  { icon: 'bedtime',     title: 'Notte senza smonto' },
        sub:    { icon: 'layers',      title: 'Assenza sotto un turno' },
        code:   { icon: 'help',        title: 'Codice sconosciuto' },
        pn:     { icon: 'nights_stay', title: 'Permesso notte' },
        smonto: { icon: 'wb_twilight', title: 'Smonto senza notte' },
        limit:  { icon: 'event_busy',  title: 'Oltre il limite' }
    };
    const chkId = (...p) => p.join('_').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 140);
    const chkDateLbl = d => d.toLocaleDateString('it-IT', Object.assign({ weekday: 'short', day: 'numeric', month: 'short' }, d.getFullYear() !== SHIFT_YEAR ? { year: 'numeric' } : {}));
    const chkBase = c => { let v = String((c && c.v) || '').trim(); const i = v.indexOf('/'); if(i !== -1) v = v.slice(0, i).trim(); return v; };
    const chkSub = c => String((c && c.subV) || '').trim().toLowerCase();
    const chkIsAbs = s => !!s && SPECIAL_SUBCODES[s] !== undefined;
    const chkAbsName = s => s === 'z' ? 'sostituzione coordinatore' : (SPECIAL_SUBCODES[s] || s).toLowerCase().replace(' (c.o.)', '');
    function chkCellTxt(c) {
        const v = chkBase(c), s = chkSub(c);
        if(chkIsAbs(s)) return v && v !== '-' ? `"${v}" con ${chkAbsName(s)}` : chkAbsName(s);
        if(!v || v === '-') return 'una casella vuota';
        if(/^r(iposo)?$/i.test(v)) return 'un riposo (R)';
        return `"${v}"`;
    }
    function chkShiftMinutes(v, r) {
        const u = v.toUpperCase().replace(/\s+/g, '');
        if(isMN(u)) return minutesFromRange(SCHEDULE.M) + minutesFromRange(SCHEDULE.N);
        if(/^[a-z]/.test(v)) { const t = diurniSched(v, repRowDate(r)); return t && t !== 'RIPOSO' ? minutesFromRange(t) : 0; }
        if(customCodes[u]) return customCodes[u].kind === 'work' ? customMinutes(customCodes[u]) : 0;
        const t = SCHEDULE[u]; return t && t !== 'RIPOSO' ? minutesFromRange(t) : 0;
    }
    function ccAnomalies() {
        if(chkCache && chkCache.data === finalData && Date.now() - chkCache.t < 1500) return chkCache.list;
        const out = [], all = buildDaysIndex(), rowOf = {}; all.forEach(dd => rowOf[ymd(dd.date)] = dd.rowIdx);
        // le caselle si controllano anche nei mesi dell'anno dopo già aperti (si compilano in anticipo)
        const rowsAll = []; for(let r = 1; r < finalData.length; r++) { const iso = repRowDate(r); if(iso && shiftRowYear(r) <= SHIFT_YEAR + 1) rowsAll.push({ rowIdx: r, date: repDateObj(iso) }); }
        drivers.filter(d => !d.hidden).forEach(d => {
            const nm = d.originalName || d.name;
            const add = (kind, iso, key, r, date, detail) => out.push({ id: chkId(kind, nm, iso, key), kind, d, r, idx: d.idx, date, detail });
            rowsAll.forEach(dd => {
                const r = dd.rowIdx, c = finalData[r][d.idx] || {}, iso = ymd(dd.date);
                const nx = finalData[r + 1] ? (finalData[r + 1][d.idx] || {}) : null, pv = r > 1 ? (finalData[r - 1][d.idx] || {}) : null;
                const v = chkBase(c), V = v.toUpperCase().replace(/\s+/g, ''), s = chkSub(c);
                const nd = new Date(dd.date); nd.setDate(nd.getDate() + 1);
                const hasCustom = c.customMinutes !== undefined && c.customMinutes !== null && c.customMinutes !== '';
                // 1. notte non seguita dallo smonto
                if(V === 'N' && !chkIsAbs(s) && !hasCustom && nx) {
                    const nV = chkBase(nx).toUpperCase().replace(/\s+/g, ''), ns = chkSub(nx);
                    if(nV !== 'S' && nV !== 'SM') add('night', iso, nV + ns, r + 1, nd, chkIsAbs(ns)
                        ? `Dopo la notte del ${chkDateLbl(dd.date)}, il ${chkDateLbl(nd)} c'è ${chkCellTxt(nx)}: le 7:20 dopo mezzanotte non sono contate. Se la notte è stata fatta, scrivi S il giorno dopo.`
                        : `Dopo la notte del ${chkDateLbl(dd.date)}, il ${chkDateLbl(nd)} c'è ${chkCellTxt(nx)} invece dello smonto (S). Le 7:20 dopo mezzanotte sono contate lo stesso, così la notte vale 11:35. Se è un errore, scrivi S.`);
                }
                // 2. assenza scritta sotto un turno di lavoro: conta l'assenza al posto del turno
                if(chkIsAbs(s) && v && v !== '-' && !/^r(iposo)?$/i.test(v)) {
                    const own = chkShiftMinutes(v, r), just = justifiedDayMinutes(r, d.idx);
                    if(own && Math.round(own) !== Math.round(just)) add('sub', iso, V + s, r, dd.date, `Il ${chkDateLbl(dd.date)} c'è "${v}" con sotto ${chkAbsName(s)}: per le ore conta ${hsHM(just)} (l'assenza) invece delle ${hsHM(own)} del turno. Se il turno è stato lavorato tutto, togli il codice sotto; se va bene così, spunta.`);
                }
                // 3. codici sconosciuti (la "x" dopo un permesso notte è lo smonto del permesso)
                if(s && !chkIsAbs(s) && !(s === 'x' && pv && chkSub(pv) === 'pn'))
                    add('code', iso, 'sub' + s, r, dd.date, `Il ${chkDateLbl(dd.date)} sotto ${v && v !== '-' ? `"${v}"` : 'la casella'} c'è "${c.subV}": l'app non conosce questo codice e conta ${v && v !== '-' ? 'solo il turno' : 'zero ore'}.`);
                const info = computeDayInfo(r, d.idx);
                if(info.unrecognized) add('code', iso, 'main' + info.code, r, dd.date, `Il ${chkDateLbl(dd.date)} c'è il turno "${info.code}": l'app non lo conosce e conta 0 ore.`);
                // 4. permesso notte con il giorno dopo occupato
                if(s === 'pn' && nx && !pnTailFree(nx)) add('pn', iso, chkBase(nx) + chkSub(nx), r + 1, nd, `Permesso notte il ${chkDateLbl(dd.date)}, ma il giorno dopo c'è ${chkCellTxt(nx)}: le 7:20 dopo mezzanotte del permesso non sono contate.`);
                // 5. smonto senza notte il giorno prima
                if((V === 'S' || V === 'SM') && pv) {
                    const pV = chkBase(pv).toUpperCase().replace(/\s+/g, '');
                    if(pV !== 'N' && !isMN(pV) && chkSub(pv) !== 'pn') add('smonto', iso, pV, r, dd.date, `Il ${chkDateLbl(dd.date)} c'è lo smonto (S), ma il giorno prima c'è ${chkCellTxt(pv)} e non una notte: conta comunque 7:20.`);
                }
            });
            // 6. assenze oltre il limite dell'anno
            const a = absCountFor(d, all);
            const over = (key, used, max, dates, what) => {
                if(used <= max) return;
                const ds = (dates || []).slice().sort((x, y) => x - y), dt = ds[max] || ds[ds.length - 1] || new Date(SHIFT_YEAR, 11, 31), r = rowOf[ymd(dt)] || null;
                add('limit', String(SHIFT_YEAR), key + used, r, dt, `${what}: ${used} su ${max}. Il primo oltre il limite è il ${chkDateLbl(dt)}.`);
            };
            over('co', a.allow.co, a.max.co, a.dates.f, 'Giorni di congedo ordinario');
            over('sp', a.allow.sp, a.max.sp, [].concat(a.dates.p || [], a.dates.pn || []), 'Permessi straordinari (compresi i permessi notte)');
            over('pn', a.allow.pn, a.max.pn, a.dates.pn, 'Permessi notte');
            if(PERM_HOURLY.pl.max && a.hours.pl > PERM_HOURLY.pl.max) {
                const hd = a.hdates.pl.slice().sort((x, y) => x.date - y.date); let t = 0, dt = hd.length ? hd[hd.length - 1].date : new Date(SHIFT_YEAR, 11, 31);
                for(const h of hd) { t += h.h; if(t > PERM_HOURLY.pl.max) { dt = h.date; break; } }
                add('limit', String(SHIFT_YEAR), 'pl' + a.hours.pl, rowOf[ymd(dt)] || null, dt, `Permesso legge: ${permHFmt(a.hours.pl)} su ${PERM_HOURLY.pl.max}h. Si supera il limite il ${chkDateLbl(dt)}.`);
            }
        });
        out.sort((x, y) => x.date - y.date || x.d.name.localeCompare(y.d.name));
        chkCache = { data: finalData, t: Date.now(), list: out };
        return out;
    }
    function chkOpenCount() { if(!finalData.length) return 0; try { return ccAnomalies().filter(x => !checksResolved[x.id]).length; } catch(e) { console.error(e); return 0; } }
    function chkOpen() {
        vibrate(); chkCache = null;
        let el = document.getElementById('chk-modal');
        if(!el) {
            el = document.createElement('div'); el.id = 'chk-modal'; el.className = 'cc-scope';
            el.onclick = e => { if(e.target === el) chkClose(); };
            el.innerHTML = `<div class="chk-box" role="dialog" aria-labelledby="chk-title">
                <div class="chk-head"><span class="chk-hico"><span class="msym">fact_check</span></span><div class="chk-ht"><h4 id="chk-title">Da controllare</h4><small id="chk-sub"></small></div>
                    <button class="cc-icon-btn" onclick="chkClose()" aria-label="Chiudi"><span class="msym">close</span></button></div>
                <div class="chk-tabs"><button data-t="open" onclick="chkSetTab('open')">Da risolvere <b id="chk-n-open"></b></button><button data-t="done" onclick="chkSetTab('done')">Risolte <b id="chk-n-done"></b></button></div>
                <div class="chk-list" id="chk-list"></div>
                <div class="chk-foot"><small>Spunta una voce quando l'hai sistemata o va bene così: la spunta la vedono tutti i coordinatori. Se correggi la casella, la voce sparisce da sola.</small><button class="cc-btn primary" onclick="chkClose()">Chiudi</button></div>
            </div>`;
            document.body.appendChild(el);
        }
        el.style.display = 'flex'; requestAnimationFrame(() => el.classList.add('open'));
        chkRender();
    }
    function chkClose() { const el = document.getElementById('chk-modal'); if(!el) return; el.classList.remove('open'); setTimeout(() => { if(!el.classList.contains('open')) el.style.display = 'none'; }, 180); }
    function chkSetTab(t) { vibrate(); chkTab = t; chkRender(); }
    function chkRender() {
        const el = document.getElementById('chk-modal'); if(!el || el.style.display === 'none') return;
        const list = ccAnomalies(), open = list.filter(x => !checksResolved[x.id]), done = list.filter(x => checksResolved[x.id]);
        document.getElementById('chk-n-open').textContent = open.length; document.getElementById('chk-n-done').textContent = done.length;
        el.querySelectorAll('.chk-tabs button').forEach(b => b.classList.toggle('active', b.dataset.t === chkTab));
        document.getElementById('chk-sub').textContent = open.length ? `${open.length} ${open.length === 1 ? 'cosa da guardare' : 'cose da guardare'} nei turni del ${SHIFT_YEAR}` : `Nei turni del ${SHIFT_YEAR} torna tutto`;
        const items = chkTab === 'done' ? done : open;
        const box = document.getElementById('chk-list');
        if(!items.length) { box.innerHTML = `<div class="chk-empty"><span class="msym">${chkTab === 'done' ? 'inventory_2' : 'task_alt'}</span>${chkTab === 'done' ? 'Nessuna voce spuntata.' : 'Niente da controllare: i conteggi tornano.'}</div>`; return; }
        box.innerHTML = items.map(x => {
            const K = CHK_KINDS[x.kind], res = checksResolved[x.id];
            const when = res ? new Date(res.at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
            return `<div class="chk-item ${res ? 'done' : ''} k-${x.kind}">
                <label class="chk-tick" title="${res ? 'Togli la spunta' : 'Segna come risolta'}"><input type="checkbox" ${res ? 'checked' : ''} onchange="chkToggle('${x.id}', this.checked)"><span class="msym">check</span></label>
                <div class="chk-main"><div class="chk-top"><span class="chk-kind"><span class="msym">${K.icon}</span>${K.title}</span><b>${esc(x.d.name)}</b><span class="chk-date">${chkDateLbl(x.date)}</span></div>
                    <p>${esc(x.detail)}</p>${res ? `<small class="chk-by">Risolta da ${esc(res.by || 'coordinatore')} · ${when}</small>` : ''}</div>
                ${x.r ? `<button class="cc-btn sm chk-go" onclick="chkGo(${x.r}, ${x.idx})" title="Apri la casella nel calendario"><span class="msym">open_in_new</span>Vai</button>` : ''}
            </div>`;
        }).join('');
    }
    async function chkToggle(id, on) {
        vibrate();
        const val = on ? { at: new Date().toISOString(), by: (userIdentity && userIdentity !== 'Ospite') ? userIdentity : (coordinatorName || 'Coordinatore') } : null;
        if(on) checksResolved[id] = val; else delete checksResolved[id];
        chkRender(); ccUpdateNavCounts();
        try {
            if(!fbReady) throw new Error('nessuna connessione a Firebase');
            await cfgRef('settings').update(new firebase.firestore.FieldPath('checksResolved', id), on ? val : firebase.firestore.FieldValue.delete());
        } catch(e) { console.error(e); ccToast('Spunta non salvata: ' + (e.code || e.message), true); }
    }
    function chkRefresh() { chkCache = null; try { chkRender(); if(appBooted && finalData.length) ccUpdateNavCounts(); } catch(e) { console.error('Da controllare:', e); } }
    function chkMaybeAuto() {
        try { if(sessionStorage.getItem('chk_auto_shown')) return; } catch(e) {}
        if(isViewingArchive() || !chkOpenCount()) return;
        try { sessionStorage.setItem('chk_auto_shown', '1'); } catch(e) {}
        chkOpen();
    }
    function chkGo(r, idx) {
        chkClose(); closeCoordConsole();
        setTimeout(() => {
            if(calOverview) setCalView('dettaglio');
            if(liteOn()) liteShowRow(r);
            setTimeout(() => {
                const td = document.querySelector(`#main-table td[data-row="${r}"][data-col="${idx}"]`), tr = td ? td.closest('tr') : document.querySelector(`#table-body tr[data-row="${r}"]`);
                liteQuietUntil = Date.now() + 1500;
                if(td) { td.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); td.classList.add('chk-flash'); setTimeout(() => td.classList.remove('chk-flash'), 2600); }
                else if(tr) liteScrollTo(tr, 200);
            }, 280);
        }, 220);
    }

    // ═══ SALDI ASSENZE PER IL PORTALE RICHIESTE ══════════════════════════
    // Documento "saldi" (C.O., permessi straordinari e notte usati/spettanti di ognuno):
    // il portale Richieste lo legge per mostrare quanti giorni restano. Si scrive solo se
    // qualcosa è cambiato rispetto a quanto già pubblicato.
    let saldiTimer = null, saldiLast = null;
    function publishSaldiSoon() { clearTimeout(saldiTimer); saldiTimer = setTimeout(publishSaldi, 4000); }
    // JSON con le chiavi in ordine: Firestore restituisce le mappe in un ordine diverso
    function stableJson(o) { return JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, x) => (a[x] = v[x], a), {}) : v); }
    function publishSaldi() {
        if(SERVER_MODE || !fbReady || !appBooted || isViewingArchive() || !finalData.length || !fbMonthsReady()) return;
        const all = buildDaysIndex(), operatori = {};
        drivers.forEach(d => {
            if(d.test) return;
            const a = absCountFor(d, all);
            operatori[d.originalName] = { name: d.name, co:{ used:a.allow.co, max:a.max.co }, str:{ used:a.allow.sp, max:a.max.sp }, pn:{ used:a.allow.pn, max:a.max.pn } };
        });
        const json = stableJson({ year: SHIFT_YEAR, operatori });
        if(json === saldiLast) return;
        cfgRef('saldi').get().then(doc => {
            const cur = doc.exists ? stableJson({ year: doc.data().year, operatori: doc.data().operatori }) : null;
            saldiLast = json;
            if(cur === json) return;
            return cfgRef('saldi').set({ year: SHIFT_YEAR, operatori, updatedAt: new Date().toISOString() });
        }).catch(e => console.warn('Saldi non pubblicati:', e));
    }

    // ═══ LA MIA PAGINA ═══════════════════════════════════════════════════
    function openMyPage() {
        closeMenu(); vibrate();
        renderMyPage();
        const m = document.getElementById('me-modal'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10);
        setCurrentView('La mia pagina');
    }
    function closeMyPage(e) {
        if(e && e.target !== e.currentTarget) return;
        const m = document.getElementById('me-modal'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 300);
    }
    function renderMyPage() {
        const body = document.getElementById('me-body');
        const d = userIdentity && userIdentity !== 'Ospite' ? drivers.find(x => x.name === userIdentity || x.originalName === userIdentity.toUpperCase()) : null;
        if(!d) { body.innerHTML = `<div class="nt-intro" style="margin:16px"><span class="material-icons-round">info</span><div><b>Chi sei?</b><small>Scegli il tuo nome per vedere i tuoi turni, le ore, le assenze e le reperibilit\u00e0.</small></div><button onclick="closeMyPage();setTimeout(requestChangeIdentityDirect,300)">Scegli</button></div>`; return; }
        const all = buildDaysIndex(), today = new Date(); today.setHours(0, 0, 0, 0);
        const R = repData(), me = d.originalName;
        // prossimi 7 giorni
        const next = all.filter(dd => dd.date >= today).slice(0, 7).map(dd => {
            const info = computeDayInfo(dd.rowIdx, d.idx), meta = ccCodeMeta(info), iso = ymd(dd.date);
            const sched = info.code && (/^[mpr]$/.test(info.code) ? diurniSched(info.code, dd.date) : SCHEDULE[info.code]);
            const label = meta.kind === 'abs' ? ((ABS_TYPES[info.code] || {}).label || meta.label) : (SHIFT_NAMES[info.code] || info.label || 'Libero');
            const mine = (R.days[iso] || []).map((w, s) => w === me ? REP_SLOTS[s].label : null).filter(Boolean);
            const rep = R.tit[iso] === me ? '<span class="me-rep">REPERIBILE</span>' : (mine.length ? `<span class="me-rep">REP ${mine.join(' ')}</span>` : '');
            const when = dd.date.getTime() === today.getTime() ? 'Oggi' : dd.date.toLocaleDateString('it-IT', { weekday:'short', day:'numeric' });
            return `<div class="me-day"><span class="when ${when === 'Oggi' ? 'today' : ''}">${when}</span><span class="chip" style="${swatchStyle(meta.colors)}">${esc(meta.short || '\u2014')}</span><span class="what">${esc(label.charAt(0).toUpperCase() + label.slice(1))}${sched && sched !== 'RIPOSO' && meta.kind !== 'abs' ? `<small>${esc(sched)}</small>` : ''}</span>${rep}</div>`;
        }).join('');
        // ore del mese
        const mi = today.getFullYear() === SHIFT_YEAR ? today.getMonth() : 0, mdays = all.filter(dd => dd.monthIdx === mi);
        const worked = mdays.reduce((a, dd) => a + computeDayInfo(dd.rowIdx, d.idx).minutes, 0);
        const target = contractMinutesFor(getContractHours(d.idx), mdays.map(dd => dd.date), d.idx);
        const soFar = mdays.filter(dd => dd.date <= today), workedSoFar = soFar.reduce((a, dd) => a + computeDayInfo(dd.rowIdx, d.idx).minutes, 0);
        const bal = computeDriverBalance(d.idx);
        // assenze
        const ab = absCountFor(d, all);
        const cnt = (used, max, lbl) => `<div><small>${lbl}</small><b>${used}/${max}</b><em class="${used > max ? 'over' : ''}">${used > max ? 'oltre di ' + (used - max) : 'restano ' + (max - used)}</em></div>`;
        // reperibilità
        const future = Object.keys(R.tit).filter(k => R.tit[k] === me && repDateObj(k) >= today).sort().slice(0, 6);
        let repMin = 0; mdays.forEach(dd => (R.days[ymd(dd.date)] || []).forEach((w, s) => { if(w === me) repMin += REP_SLOTS[s].minutes; }));
        body.innerHTML = `
            <div class="me-hero"><span class="ab-av">${esc(absInitials(d.name))}</span><div><b>${esc(d.name)}</b><small>${today.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' })}</small></div></div>
            <div class="me-card"><h4><span class="material-icons-round">event</span>Prossimi 7 giorni</h4>${next || '<small>Nessun turno in calendario.</small>'}</div>
            <div class="me-card"><h4><span class="material-icons-round">schedule</span>Ore di ${MONTH_NAMES_IT[mi]}</h4>
                <div class="me-hours"><b>${fmtHM(worked)} <small>/ ${fmtHM(target)}</small></b></div>
                <div class="me-hcap">ore del mese in calendario · su ore da contratto</div>
                <div class="me-bar"><i style="width:${Math.min(100, target ? worked / target * 100 : 0).toFixed(0)}%"></i></div>
                <div class="me-kv"><span>Fatte finora</span><b>${fmtHM(workedSoFar)}</b></div>
                <div class="me-kv"><span>Saldo da gennaio a oggi</span><b class="${bal < 0 ? 'neg' : 'pos'}">${fmtHM(bal, true) || '0:00'}</b></div>
            </div>
            <div class="me-card"><h4><span class="material-icons-round">beach_access</span>Assenze ${SHIFT_YEAR}</h4>
                <div class="me-counters">${cnt(ab.allow.co, ab.max.co, 'C.O.')}${cnt(ab.allow.sp, ab.max.sp, 'Perm. straord.')}${cnt(ab.allow.pn, ab.max.pn, 'Perm. notte')}</div>
                ${(ab.counts.m || ab.counts.r) ? `<div class="me-kv"><span>Malattia \u00b7 recuperi</span><b>${ab.counts.m || 0} \u00b7 ${ab.counts.r || 0} giorni</b></div>` : ''}
            </div>
            <div class="me-card"><h4><span class="material-icons-round">phone_in_talk</span>Reperibilit\u00e0</h4>
                <div class="me-kv" style="margin-top:0"><span>Ore di reperibilit\u00e0 a ${MONTH_NAMES_IT[mi]}</span><b>${repHours(repMin)} h</b></div>
                <div class="me-kv"><span>Prossime</span><b>${future.length ? future.map(k => repDateObj(k).toLocaleDateString('it-IT', { day:'numeric', month:'short' })).join(', ') : 'nessuna in calendario'}</b></div>
            </div>
            ${myNotesHtml()}
            <div class="me-btns">
                <button onclick="closeMyPage();setTimeout(() => { openHoursModal(); setTimeout(() => openHoursDetail(${d.idx}, ${mi}), 350); }, 250)"><span class="material-icons-round">query_stats</span>Le mie ore</button>
                <button onclick="closeMyPage();setTimeout(() => { openAbsModal(); setTimeout(() => absOpenDetail(${d.idx}), 350); }, 250)"><span class="material-icons-round">event_busy</span>Le mie assenze</button>
            </div>
            <div class="me-btns" style="margin-top:-8px">
                <button onclick="closeMyPage();setTimeout(openOptionsCal, 250)"><span class="material-icons-round">calendar_month</span>Turni nel calendario del telefono</button>
            </div>
            <div class="me-btns" style="margin-top:-8px">
                <button onclick="openMyCal()"><span class="material-icons-round">print</span>Stampa, PDF o WhatsApp dei miei turni</button>
            </div>`;
    }

    // ═══ I MIEI TURNI: STAMPA, PDF, WHATSAPP ═════════════════════════════
    // Calendario mensile dei propri turni (uno o più mesi, o tutto l'anno), da stampare,
    // scaricare in PDF o mandare con WhatsApp (il PDF dove il telefono lo permette, se no il testo).
    let myCalSel = new Set();
    const MYCAL_WD = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
    function myCalDriver() { return userIdentity && userIdentity !== 'Ospite' ? drivers.find(x => x.name === userIdentity || x.originalName === userIdentity.toUpperCase()) : null; }
    function openMyCal() {
        vibrate();
        const d = myCalDriver(); if(!d) { ccToast('Scegli prima chi sei.', true); return; }
        if(!myCalSel.size) { const now = new Date(); myCalSel = new Set([now.getFullYear() === SHIFT_YEAR ? now.getMonth() : 0]); }
        renderMyCal();
        const m = document.getElementById('mycal-modal'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10);
    }
    function closeMyCal(e) {
        if(e && e.target !== e.currentTarget) return;
        const m = document.getElementById('mycal-modal'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 300);
    }
    function myCalToggle(mi) { vibrate(); if(myCalSel.has(mi)) myCalSel.delete(mi); else myCalSel.add(mi); renderMyCal(); }
    function myCalQuick(k) {
        vibrate();
        const now = new Date(), cur = now.getFullYear() === SHIFT_YEAR ? now.getMonth() : 0;
        const avail = myCalMonthsAvail();
        myCalSel = new Set(k === 'anno' ? avail : k === 'prossimo' ? [Math.min(11, cur + 1)] : k === 'tre' ? [cur, cur + 1, cur + 2].filter(m => m <= 11) : [cur]);
        renderMyCal();
    }
    function myCalMonthsAvail() { return [...new Set(buildDaysIndex().map(dd => dd.monthIdx))].sort((a, b) => a - b); }
    // Un giorno del calendario personale: sigla, colori, orario e reperibilità.
    function myCalEntry(d, dd, R) {
        const info = computeDayInfo(dd.rowIdx, d.idx), meta = ccCodeMeta(info), iso = ymd(dd.date), me = d.originalName;
        const sched = info.code && (/^[mpr]$/.test(info.code) ? diurniSched(info.code, dd.date) : SCHEDULE[info.code]);
        const label = meta.kind === 'abs' ? ((ABS_TYPES[info.code] || {}).label || meta.label) : (SHIFT_NAMES[info.code === 'S' ? 'SM' : info.code] || info.label || '');
        const slots = (R.days[iso] || []).map((w, s) => w === me ? REP_SLOTS[s].label : null).filter(Boolean);
        return {
            dd, meta, minutes: info.minutes || 0, code: info.code || '',
            short: meta.short || '', label: label ? label.charAt(0).toUpperCase() + label.slice(1) : '',
            sched: sched && sched !== 'RIPOSO' && meta.kind !== 'abs' ? sched : '',
            rep: R.tit[iso] === me ? 'REP' : (slots.length ? 'REP ' + slots.join(' ') : ''),
            fest: dd.date.getDay() === 0 || !!HOLIDAYS[`${dd.date.getMonth()}-${dd.date.getDate()}`]
        };
    }
    function myCalData() {
        const d = myCalDriver(); if(!d) return null;
        const R = repData(), all = buildDaysIndex();
        const months = [...myCalSel].sort((a, b) => a - b).map(mi => {
            const days = all.filter(dd => dd.monthIdx === mi).map(dd => myCalEntry(d, dd, R));
            const tot = days.reduce((a, e) => a + e.minutes, 0);
            const notti = days.filter(e => e.code === 'N' || e.code === 'M+N').length, reps = days.filter(e => e.rep).length;
            return { mi, title: MONTH_NAMES_IT[mi] + ' ' + SHIFT_YEAR, days, tot, notti, reps };
        }).filter(m => m.days.length);
        return { d, months };
    }
    function myCalSummary(m) { return `${fmtHM(m.tot)} h` + (m.notti ? ` · ${m.notti} nott${m.notti === 1 ? 'e' : 'i'}` : '') + (m.reps ? ` · ${m.reps} reperibilità` : ''); }
    function myCalRangeTxt(months) {
        if(!months.length) return '';
        if(months.length === 12) return 'Anno ' + SHIFT_YEAR;
        const n = (mi, i) => i ? MONTH_NAMES_IT[mi] : MONTH_NAMES_IT[mi].charAt(0).toUpperCase() + MONTH_NAMES_IT[mi].slice(1);
        const contiguous = months.every((m, i) => !i || m.mi === months[i - 1].mi + 1);
        if(months.length === 1) return n(months[0].mi, 0) + ' ' + SHIFT_YEAR;
        return (contiguous ? n(months[0].mi, 0) + ' - ' + n(months[months.length - 1].mi, 1) : months.map((m, i) => n(m.mi, i)).join(', ')) + ' ' + SHIFT_YEAR;
    }
    function renderMyCal() {
        const body = document.getElementById('mycal-body');
        const data = myCalData(); if(!data) { body.innerHTML = '<div class="mc-empty">Scegli prima chi sei.</div>'; return; }
        const avail = new Set(myCalMonthsAvail()), now = new Date(), cur = now.getFullYear() === SHIFT_YEAR ? now.getMonth() : 0;
        const sel = [...myCalSel].sort((a, b) => a - b), same = arr => arr.length === sel.length && arr.every((m, i) => m === sel[i]);
        const quick = [['mese', 'Questo mese', [cur]], ['prossimo', 'Prossimo mese', [Math.min(11, cur + 1)]], ['tre', '3 mesi', [cur, cur + 1, cur + 2].filter(m => m <= 11)], ['anno', 'Tutto l’anno', [...avail].sort((a, b) => a - b)]];
        const today = ymd(now), none = !data.months.length;
        const grid = m => {
            const lead = (m.days[0].dd.date.getDay() + 6) % 7;
            const cells = Array(lead).fill('<div class="mc-cell out"></div>').concat(m.days.map(e => `<div class="mc-cell ${e.fest ? 'fest' : ''} ${ymd(e.dd.date) === today ? 'today' : ''}" title="${esc(e.label)}"><span class="n">${e.dd.day}</span>${e.short ? `<span class="c" style="${swatchStyle(e.meta.colors)}">${esc(e.short)}</span>` : ''}${e.sched ? `<span class="h">${esc(e.sched.replace(/\s/g, ''))}</span>` : ''}${e.rep ? '<span class="r">REP</span>' : ''}</div>`));
            return `<div class="mc-month"><h4>${esc(m.title)}<small>${esc(myCalSummary(m))}</small></h4><div class="mc-grid">${MYCAL_WD.map((w, i) => `<div class="mc-wd ${i === 6 ? 'fest' : ''}">${w}</div>`).join('')}${cells.join('')}</div></div>`;
        };
        body.innerHTML = `
            <div class="mc-actions">
                <button onclick="myCalPrint()" ${none ? 'disabled' : ''}><span class="material-icons-round">print</span>Stampa</button>
                <button onclick="myCalPdf()" ${none ? 'disabled' : ''}><span class="material-icons-round">picture_as_pdf</span>PDF</button>
                <button class="wa" onclick="myCalWhatsApp()" ${none ? 'disabled' : ''}><span class="material-icons-round">send</span>WhatsApp</button>
            </div>
            <div class="mc-pick">
                <div class="mc-quick">${quick.map(([k, l, arr]) => `<button class="${same(arr) ? 'on' : ''}" onclick="myCalQuick('${k}')">${l}</button>`).join('')}</div>
                <div class="mc-months">${MONTH_NAMES_IT.map((n, mi) => `<button class="${myCalSel.has(mi) ? 'on' : ''}" ${avail.has(mi) ? '' : 'disabled'} onclick="myCalToggle(${mi})">${n.slice(0, 3)}</button>`).join('')}</div>
                <div class="mc-hint">Tocca i mesi per sceglierne uno o più.</div>
            </div>
            ${none ? '<div class="mc-empty">Scegli almeno un mese.</div>' : data.months.map(grid).join('')}`;
    }
    // Colore di una variabile CSS come [r,g,b], sempre con il tema chiaro (le variabili del tema scuro sono sul body).
    function myCalRgb(v) {
        if(!v) return null;
        const p = document.createElement('span'); p.style.cssText = 'position:absolute;visibility:hidden'; p.style.color = `var(${v}, rgb(1, 2, 3))`;
        document.documentElement.appendChild(p); const c = getComputedStyle(p).color; p.remove();
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c);
        if(!m || c === 'rgb(1, 2, 3)' || (m[4] !== undefined && +m[4] === 0)) return null;
        return [+m[1], +m[2], +m[3]];
    }
    function myCalFileName(data) { return `turni-${(data.d.name || 'autista').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${myCalRangeTxt(data.months).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`; }
    function myCalPrint() {
        vibrate();
        const data = myCalData(); if(!data || !data.months.length) return;
        const css = c => c ? `rgb(${c.join(',')})` : '';
        const month = m => {
            const lead = (m.days[0].dd.date.getDay() + 6) % 7;
            const cells = Array(lead).fill('<td class="out"></td>').concat(m.days.map(e => {
                const bg = e.meta.colors ? css(myCalRgb(e.meta.colors.bg)) : '', fg = e.meta.colors ? css(myCalRgb(e.meta.colors.fg)) : '';
                return `<td class="${e.fest ? 'fest' : ''}"><div class="n">${e.dd.day}${e.rep ? `<span class="r">${esc(e.rep)}</span>` : ''}</div>${e.short ? `<div class="c" style="${bg ? 'background:' + bg + ';' : ''}${fg ? 'color:' + fg : ''}">${esc(e.short)}</div>` : ''}<div class="l">${esc(e.label)}</div>${e.sched ? `<div class="h">${esc(e.sched)}</div>` : ''}</td>`;
            }));
            while(cells.length % 7) cells.push('<td class="out"></td>');
            const rows = []; for(let i = 0; i < cells.length; i += 7) rows.push('<tr>' + cells.slice(i, i + 7).join('') + '</tr>');
            return `<section><h2>${esc(m.title)}<small>${esc(myCalSummary(m))}</small></h2><table><thead><tr>${MYCAL_WD.map((w, i) => `<th class="${i === 6 ? 'fest' : ''}">${w}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></section>`;
        };
        const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Turni di ${esc(data.d.name)}</title><style>
            @page { size:A4 portrait; margin:10mm; }
            * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
            body { font-family:Helvetica,Arial,sans-serif; color:#0f172a; margin:0; }
            header { display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid #0b2257; padding-bottom:4px; margin-bottom:6px; }
            header b { font-size:16pt; } header span { font-size:8pt; color:#475569; }
            section { break-inside:avoid; page-break-inside:avoid; margin-bottom:6mm; }
            h2 { font-size:12pt; margin:0 0 3px; text-transform:capitalize; display:flex; justify-content:space-between; align-items:baseline; }
            h2 small { font-size:8pt; color:#475569; font-weight:600; text-transform:none; }
            table { width:100%; border-collapse:collapse; table-layout:fixed; }
            th { font-size:8pt; background:#0b2257; color:#fff; padding:3px 0; }
            th.fest { background:#b91c1c; }
            td { border:1px solid #cbd5e1; height:${data.months.length === 1 ? 32 : 17}mm; vertical-align:top; padding:2px 3px; }
            td.out { background:#f8fafc; }
            td.fest .n { color:#b91c1c; }
            .n { font-size:8pt; font-weight:700; display:flex; justify-content:space-between; }
            .r { font-size:6pt; background:#dc2626; color:#fff; border-radius:3px; padding:0 3px; }
            .c { text-align:center; font-weight:800; font-size:11pt; border-radius:3px; margin:1px 0; padding:1px 0; }
            .l { font-size:6pt; text-align:center; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .h { font-size:6pt; text-align:center; color:#475569; }
        </style></head><body><header><b>Turni di ${esc(data.d.name)}</b><span>${esc(myCalRangeTxt(data.months))} · stampato il ${new Date().toLocaleDateString('it-IT')}</span></header>${data.months.map(month).join('')}</body></html>`;
        const old = document.getElementById('mycal-print-frame'); if(old) old.remove();
        const fr = document.createElement('iframe');
        fr.id = 'mycal-print-frame'; fr.setAttribute('aria-hidden', 'true');
        fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
        document.body.appendChild(fr);
        const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
        setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch(e) { ccToast('Stampa non riuscita.', true); } }, 250);
    }
    // PDF A4 verticale: un mese grande se è uno solo, altrimenti due mesi per pagina.
    async function myCalBuildPdf(data) {
        const jsPDF = await repEnsurePdfLib();
        const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
        const W = 210, L = 10, CW = (W - 2 * L) / 7, one = data.months.length === 1, RH = one ? 32 : 17.5;
        const txt = s => String(s).replace(/·/g, '-').replace(/[–—]/g, '-').replace(/’/g, "'");
        const header = () => {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(11, 34, 87); doc.text(txt(`Turni di ${data.d.name}`), L, 13);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90);
            doc.text(txt(`${myCalRangeTxt(data.months)} - stampato il ${new Date().toLocaleDateString('it-IT')}`), W - L, 13, { align:'right' });
            doc.setDrawColor(11, 34, 87); doc.setLineWidth(0.5); doc.line(L, 15.5, W - L, 15.5); doc.setLineWidth(0.1);
        };
        const colorCache = {}, rgb = v => (v in colorCache) ? colorCache[v] : (colorCache[v] = myCalRgb(v));
        let y = 0;
        data.months.forEach((m, i) => {
            if(one || i % 2 === 0) { if(i) doc.addPage(); header(); y = 20; }
            doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42);
            const t = m.title.charAt(0).toUpperCase() + m.title.slice(1); doc.text(t, L, y + 4);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90); doc.text(txt(myCalSummary(m)), W - L, y + 4, { align:'right' });
            y += 6;
            MYCAL_WD.forEach((w, c) => {
                doc.setFillColor(...(c === 6 ? [185, 28, 28] : [11, 34, 87])); doc.rect(L + c * CW, y, CW, 5.5, 'F');
                doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255); doc.text(w, L + c * CW + CW / 2, y + 3.9, { align:'center' });
            });
            y += 5.5;
            const lead = (m.days[0].dd.date.getDay() + 6) % 7, nRows = Math.ceil((lead + m.days.length) / 7);
            doc.setDrawColor(203, 213, 225);
            for(let k = 0; k < nRows * 7; k++) {
                const x = L + (k % 7) * CW, cy = y + Math.floor(k / 7) * RH, e = m.days[k - lead];
                if(!e) { doc.setFillColor(248, 250, 252); doc.rect(x, cy, CW, RH, 'FD'); continue; }
                doc.rect(x, cy, CW, RH, 'S');
                doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...(e.fest ? [185, 28, 28] : [15, 23, 42])); doc.text(String(e.dd.day), x + 1.5, cy + 3.6);
                if(e.rep) {
                    doc.setFontSize(5.5); const rw = doc.getTextWidth(e.rep) + 2;
                    doc.setFillColor(220, 38, 38); doc.roundedRect(x + CW - rw - 1, cy + 1, rw, 3.4, 0.8, 0.8, 'F');
                    doc.setTextColor(255); doc.text(e.rep, x + CW - 2 - rw / 2 + 1, cy + 3.3, { align:'center' });
                }
                const ch = one ? 9 : 6.5, cy2 = cy + (one ? 7 : 5);
                if(e.short) {
                    const bg = e.meta.colors && rgb(e.meta.colors.bg), fg = e.meta.colors && rgb(e.meta.colors.fg);
                    if(bg) { doc.setFillColor(...bg); doc.roundedRect(x + 1.2, cy2, CW - 2.4, ch, 1, 1, 'F'); }
                    doc.setFont('helvetica', 'bold'); doc.setFontSize(one ? 14 : 11); doc.setTextColor(...(fg || [15, 23, 42]));
                    doc.text(e.short, x + CW / 2, cy2 + ch / 2 + (one ? 1.8 : 1.4), { align:'center' });
                }
                doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105); doc.setFontSize(one ? 7 : 5.5);
                const lines = [];
                if(one && e.label) lines.push(doc.splitTextToSize(txt(e.label), CW - 2)[0]);
                if(e.sched) lines.push(txt(e.sched));
                lines.forEach((s, li) => doc.text(s, x + CW / 2, cy2 + ch + (one ? 3.6 : 2.6) + li * (one ? 3.4 : 2.4), { align:'center' }));
            }
            y += nRows * RH + 9;
        });
        const pages = doc.getNumberOfPages();
        for(let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(140); doc.text(txt('M mattina - P pomeriggio - N notte - SM smonto - R riposo - lettere minuscole = diurni - REP reperibilita'), L, 290); doc.text(`${p}/${pages}`, W - L, 290, { align:'right' }); }
        return doc;
    }
    async function myCalPdf() {
        vibrate();
        const data = myCalData(); if(!data || !data.months.length) return;
        try { ccToast('Preparo il PDF…'); const doc = await myCalBuildPdf(data); doc.save(myCalFileName(data)); ccToast('PDF scaricato'); }
        catch(e) { console.error(e); ccToast('PDF non creato: controlla la connessione.', true); }
    }
    function myCalText(data) {
        const wd = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
        return `Turni di ${data.d.name} · ${myCalRangeTxt(data.months)}\n` + data.months.map(m => `\n*${m.title.charAt(0).toUpperCase() + m.title.slice(1)}* (${myCalSummary(m)})\n` + m.days.map(e => `${wd[e.dd.date.getDay()]} ${String(e.dd.day).padStart(2, '0')}  ${e.short || '—'}${e.sched ? ' ' + e.sched.replace(/\s/g, '') : ''}${e.rep ? '  📞 ' + e.rep : ''}`).join('\n')).join('\n');
    }
    // Sul telefono si manda il PDF (scegliendo WhatsApp dal menu Condividi); dove non si può, il testo dei turni.
    async function myCalWhatsApp() {
        vibrate();
        const data = myCalData(); if(!data || !data.months.length) return;
        try {
            if(navigator.canShare && window.File) {
                ccToast('Preparo il PDF…');
                const doc = await myCalBuildPdf(data);
                const file = new File([doc.output('blob')], myCalFileName(data), { type:'application/pdf' });
                if(navigator.canShare({ files:[file] })) { await navigator.share({ files:[file], title:`Turni di ${data.d.name}`, text:`Turni di ${data.d.name} · ${myCalRangeTxt(data.months)}` }); return; }
            }
        } catch(e) { if(e && e.name === 'AbortError') return; console.warn('Condivisione PDF non riuscita:', e); }
        window.open('https://wa.me/?text=' + encodeURIComponent(myCalText(data)), '_blank');
    }

    // ═══ STAMPA DEL MESE (PDF per la bacheca) ═════════════════════════════
    async function printMonthPick() {
        // mese prima, questo e il dopo, anche a cavallo d'anno (a dicembre si stampa gennaio dell'anno dopo, se c'è già)
        const now = new Date(), base = now.getFullYear() === SHIFT_YEAR ? now.getMonth() : 0;
        const has = (y, m) => { for(let r = 1; r < finalData.length; r++) { const iso = repRowDate(r); if(iso && iso.startsWith(y + '-' + String(m + 1).padStart(2, '0'))) return true; } return false; };
        const opts = [base - 1, base, base + 1].map(k => ({ y: SHIFT_YEAR + Math.floor(k / 12), m: ((k % 12) + 12) % 12, cur: k === base })).filter(o => has(o.y, o.m));
        const choice = await ccDialog('Stampa del mese', 'Scegli il mese: scarico un PDF A4 orizzontale con i turni di tutti, pronto da appendere.',
            opts.map(o => ({ label: MONTH_NAMES_IT[o.m].charAt(0).toUpperCase() + MONTH_NAMES_IT[o.m].slice(1) + (o.y !== SHIFT_YEAR ? ' ' + o.y : ''), kind: o.cur ? 'primary' : '', value: o.y + '-' + o.m })).concat([{ label:'Annulla', kind:'ghost', value:null }]));
        if(choice !== null && choice !== undefined) { const [y, m] = String(choice).split('-').map(Number); printMonthPdf(m, false, y); }
    }
    async function printMonthPdf(mi, returnDoc, year) {
        year = year || SHIFT_YEAR;
        try {
            ccToast('Preparo il PDF\u2026');
            const jsPDF = await repEnsurePdfLib();
            const days = year === SHIFT_YEAR ? buildDaysIndex().filter(dd => dd.monthIdx === mi) : (() => { const l = []; for(let r = 1; r < finalData.length; r++) { const iso = repRowDate(r); if(!iso) continue; const dt = new Date(iso + 'T12:00:00'); if(dt.getFullYear() === year && dt.getMonth() === mi) l.push({ rowIdx: r, monthIdx: mi, day: dt.getDate(), date: dt }); } return l; })();
            const ops = drivers.filter(d => !d.hidden);
            const R = repData(), css = getComputedStyle(document.documentElement);
            const hex = v => { const c = (css.getPropertyValue(v) || '').trim(); const m = /^#([0-9a-f]{6})$/i.exec(c); return m ? [parseInt(m[1].slice(0,2),16), parseInt(m[1].slice(2,4),16), parseInt(m[1].slice(4,6),16)] : null; };
            const title = MONTH_NAMES_IT[mi].charAt(0).toUpperCase() + MONTH_NAMES_IT[mi].slice(1) + ' ' + year;
            const wd = ['D','L','M','M','G','V','S'];
            const head = [['Autista', ...days.map(dd => `${dd.day}\n${wd[dd.date.getDay()]}`)]];
            const metas = ops.map(d => days.map(dd => ccCodeMeta(computeDayInfo(dd.rowIdx, d.idx))));
            const body = ops.map((d, i) => [d.name, ...metas[i].map(m => m.short === 'M+N' ? 'MN' : (m.short || ''))]);
            body.push(['Reperibile', ...days.map(dd => { const t = R.tit[ymd(dd.date)]; return t ? repDisplayName(t).slice(0, 5) : ''; })]);
            const fest = days.map(dd => dd.date.getDay() === 0 || !!HOLIDAYS[`${dd.date.getMonth()}-${dd.date.getDate()}`]);
            const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
            doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(`Turni autisti - ${title}`, 10, 12);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90);
            doc.text(`Stampato il ${new Date().toLocaleString('it-IT')} - M mattina, P pomeriggio, N notte, S/SM smonto, R riposo, lettere minuscole = diurni; assenze: CO, FER, REC, PER, MAL, STU, PN, NG, NL, SC, GR`, 10, 17);
            doc.setTextColor(0);
            doc.autoTable({
                head, body, startY: 20, margin:{ left:8, right:8 }, theme:'grid',
                styles:{ fontSize:6.5, cellPadding:0.8, halign:'center', valign:'middle', lineColor:[200,200,200], lineWidth:0.1, minCellHeight:5.2 },
                headStyles:{ fillColor:[11,34,87], textColor:255, fontStyle:'bold', fontSize:6.2 },
                columnStyles:{ 0:{ halign:'left', fontStyle:'bold', cellWidth:24 } },
                didParseCell: data => {
                    const c = data.column.index;
                    if(c < 1) { if(data.section === 'body' && data.row.index === body.length - 1) data.cell.styles.fillColor = [254,226,226]; return; }
                    if(data.section === 'head') { if(fest[c - 1]) data.cell.styles.fillColor = [185,28,28]; return; }
                    if(data.row.index === body.length - 1) { data.cell.styles.fillColor = [254,226,226]; data.cell.styles.fontSize = 5; data.cell.styles.textColor = [153,27,27]; return; }
                    const m = metas[data.row.index][c - 1]; if(!m || !m.colors) { if(fest[c - 1]) data.cell.styles.fillColor = [253,240,240]; return; }
                    const bg = hex(m.colors.bg), fg = hex(m.colors.fg);
                    if(bg) data.cell.styles.fillColor = bg; if(fg) data.cell.styles.textColor = fg;
                    data.cell.styles.fontStyle = 'bold';
                }
            });
            if(returnDoc) return doc;
            doc.save(`turni-autisti-${MONTH_NAMES_IT[mi]}-${year}.pdf`);
            ccToast('PDF scaricato');
        } catch(e) { console.error(e); ccToast('PDF non creato: controlla la connessione.', true); }
    }

