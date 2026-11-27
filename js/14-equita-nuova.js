    // ═══ EQUITÀ DELL'ANNO (versione 3, semplificata) ═════════════════════
    // Tre impaginazioni da provare, scelte con la fila "Versione":
    //   A = Classifiche: una voce alla volta, barre ordinate con la linea della media
    //   B = Pagella: una persona alla volta, numeri grandi e posizione nella squadra
    //   C = Tabellone: tutte le voci in una tabella a colori + grafico dei turni pesanti
    // Le schede "Chi lavora con chi" e "Diurnisti e turnisti" restano come prima.
    const NQ = [
        { k: 'notti', l: 'Notti', s: 'Notti', ic: 'dark_mode', col: '#4f46e5', doers: true },
        { k: 'we', l: 'Weekend', s: 'Week', sub: 'sabati + domeniche', ic: 'weekend', col: '#0891b2' },
        { k: 'fest', l: 'Festivi', s: 'Fest', ic: 'celebration', col: '#db2777' },
        { k: 'repT', l: 'Reperibilità', s: 'Rep', sub: 'turni da titolare', ic: 'phone_in_talk', col: '#16a34a' },
        { k: 'repF', l: 'Rep. festive', s: 'Rep F', sub: 'domeniche e festivi', ic: 'event', col: '#ea580c' },
        { k: 'repC', l: 'Rep. coperte', s: 'Cop', sub: 'ore fatte per i colleghi', ic: 'handshake', col: '#9333ea', fmt: m => Math.round(m / 60), doers: true },
        { k: 'saldo', l: 'Saldo ore', s: 'Saldo', sub: 'ore fatte meno ore dovute', ic: 'schedule', col: '#475569', signed: true, fmt: m => fmtHM(m, true) || '0:00' }
    ];
    let nqVer = 'A', nqMetric = 'notti', nqWho = null;
    try { const v = localStorage.getItem('nq_ver'); if(/^[ABC]$/.test(v)) nqVer = v; } catch(e) {}
    const nqTxt = (c, v) => c.fmt ? c.fmt(v) : (Math.round(v * 10) / 10).toString().replace('.', ',');
    const nqAvg = (c, rows) => { const set = c.doers ? rows.filter(r => r[c.k] > 0) : rows; return set.length ? set.reduce((a, r) => a + r[c.k], 0) / set.length : 0; };
    // livello rispetto alla media: 'hi' oltre +20%, 'lo' oltre −20%
    const nqLvl = (c, v, a) => { if(c.signed) return Math.abs(v) < 30 ? '' : (v < 0 ? 'neg' : 'pos'); if(c.doers && !v) return ''; if(!(a > 0)) return ''; const q = v / a; return q >= 1.2 ? 'hi' : (q <= 0.8 ? 'lo' : ''); };
    function nqSetVer(v) { vibrate(); nqVer = v; try { localStorage.setItem('nq_ver', v); } catch(e) {} renderEquity(); }
    function nqSetMetric(k) { vibrate(); nqMetric = k; renderEquity(); }
    function nqSetWho(i) { vibrate(); nqWho = i; renderEquity(); }

    EQ_CATS.splice(0, 3, { k: 'tutto', label: 'Equità', icon: 'balance', desc: '' });
    const nqOldRender = window.renderEquity;
    window.renderEquity = function() {
        if(eqCat !== 'tutto') { document.getElementById('eq-ver').innerHTML = ''; document.getElementById('eq-modal').classList.remove('nq-on'); return nqOldRender(); }
        document.querySelectorAll('#eq-modal .ab-period button').forEach(b => b.classList.toggle('active', b.dataset.p === eqPeriod));
        document.getElementById('eq-cats').innerHTML = EQ_CATS.map(c => `<button class="${c.k === eqCat ? 'on' : ''}" onclick="eqSetCat('${c.k}')"><span class="material-icons-round">${c.icon}</span>${c.label}</button>`).join('');
        document.getElementById('eq-ver').innerHTML = `<span>Versione</span>` + [['A', 'Classifiche'], ['B', 'Pagella'], ['C', 'Tabellone']].map(([v, l]) => `<button class="${v === nqVer ? 'on' : ''}" onclick="nqSetVer('${v}')"><b>${v}</b> ${l}</button>`).join('');
        document.getElementById('eq-modal').classList.add('nq-on');
        document.getElementById('eq-pairs').innerHTML = '';
        const { rows, days } = computeEquity();
        const avg = {}; NQ.forEach(c => avg[c.k] = nqAvg(c, rows));
        const html = !rows.length ? '<div class="nq-empty">Nessun dato nel periodo.</div>' : nqVer === 'B' ? nqPagella(rows, avg) : nqVer === 'C' ? nqTabellone(rows, avg) : nqClassifica(rows, avg);
        document.getElementById('eq-grid').innerHTML = `<div class="nq nq-${nqVer}">${html}</div>`;
        document.getElementById('eq-note').innerHTML = `${days.length} giorni considerati${eqPeriod === 'oggi' ? ', fino a oggi' : ', tutto il ' + SHIFT_YEAR}. <span class="nq-key hi"></span> oltre il 20% sopra la media, <span class="nq-key lo"></span> oltre il 20% sotto. Per notti e reperibilità coperte la media conta solo chi ne fa.`;
    };

    // ── A · Classifiche ──────────────────────────────────────────────────
    function nqClassifica(rows, avg) {
        const c = NQ.find(x => x.k === nqMetric) || NQ[0];
        const chips = `<div class="nq-chips">${NQ.map(x => `<button class="${x.k === c.k ? 'on' : ''}" style="--c:${x.col}" onclick="nqSetMetric('${x.k}')"><span class="material-icons-round">${x.ic}</span>${x.l}</button>`).join('')}</div>`;
        const list = rows.slice().sort((a, b) => b[c.k] - a[c.k]);
        const a = avg[c.k], top = list[0], low = c.doers ? list.filter(r => r[c.k] > 0).pop() : list[list.length - 1];
        const hero = `<div class="nq-hero" style="--c:${c.col}"><span class="material-icons-round">${c.ic}</span><div><small>${c.l}${c.sub ? ' · ' + c.sub : ''}</small><b>${c.signed ? '' : nqTxt(c, a)}</b><em>${c.signed ? 'chi ha ore in più e chi in meno' : 'media della squadra'}</em></div>
            ${!c.signed && top && low ? `<div class="nq-hl"><span class="hi">▲ ${esc(top.d.name)} <b>${nqTxt(c, top[c.k])}</b></span><span class="lo">▼ ${esc(low.d.name)} <b>${nqTxt(c, low[c.k])}</b></span></div>` : ''}</div>`;
        let bars;
        if(c.signed) {
            const m = Math.max(60, ...list.map(r => Math.abs(r[c.k])));
            bars = list.map(r => { const v = r[c.k], w = Math.abs(v) / m * 50, lv = nqLvl(c, v);
                return `<div class="nq-row ${r.isMe ? 'me' : ''}"><span class="nq-n">${esc(r.d.name)}</span><div class="nq-track sym"><i class="${lv}" style="${v < 0 ? `right:50%` : `left:50%`};width:${w}%"></i><u style="left:50%"></u></div><b class="nq-v ${lv}">${nqTxt(c, v)}</b></div>`; }).join('');
        } else {
            const m = Math.max(1, ...list.map(r => r[c.k]));
            bars = list.map(r => { const v = r[c.k], lv = nqLvl(c, v, a);
                return `<div class="nq-row ${r.isMe ? 'me' : ''}"><span class="nq-n">${esc(r.d.name)}</span><div class="nq-track"><i class="${lv}" style="width:${v / m * 100}%;--c:${c.col}"></i><u style="left:${a / m * 100}%"></u></div><b class="nq-v ${lv}">${nqTxt(c, v)}</b></div>`; }).join('');
        }
        return chips + hero + `<div class="nq-bars">${bars}<div class="nq-leg"><u></u> ${c.signed ? 'pari: né ore in più né in meno' : 'linea della media'}</div></div>`;
    }

    // ── B · Pagella di una persona ───────────────────────────────────────
    function nqPagella(rows, avg) {
        const me = rows.find(r => r.isMe);
        let r = rows.find(x => x.d.idx === nqWho) || me || rows[0];
        const names = `<div class="nq-who">${rows.map(x => `<button class="${x === r ? 'on' : ''}" onclick="nqSetWho(${x.d.idx})">${esc(x.d.name)}${x.isMe ? ' (tu)' : ''}</button>`).join('')}</div>`;
        let ok = 0, hi = 0, lo = 0;
        const tiles = NQ.map(c => {
            const v = r[c.k], a = avg[c.k], lv = nqLvl(c, v, a), vals = rows.map(x => x[c.k]);
            const mn = Math.min(...vals), mx = Math.max(...vals), span = mx - mn || 1;
            const pos = (x) => ((x - mn) / span * 100).toFixed(1);
            const rank = 1 + rows.filter(x => x[c.k] > v).length;
            if(!c.signed) { if(lv === 'hi') hi++; else if(lv === 'lo') lo++; else ok++; }
            const cmp = c.signed ? (Math.abs(v) < 30 ? 'in pari' : (v < 0 ? 'ore in meno' : 'ore in più')) : (c.doers && !v ? 'non ne fa' : (lv === 'hi' ? 'sopra la media' : lv === 'lo' ? 'sotto la media' : 'nella media'));
            return `<div class="nq-tile ${lv}" style="--c:${c.col}"><div class="nq-th"><span class="material-icons-round">${c.ic}</span>${c.l}</div>
                <b class="nq-big">${nqTxt(c, v)}</b><div class="nq-cmp">${cmp}${c.signed ? '' : ` · media ${nqTxt(c, a)}`}</div>
                <div class="nq-range"><i style="left:${pos(v)}%"></i>${c.signed ? (mn < 0 && mx > 0 ? `<u style="left:${pos(0)}%"></u>` : '') : `<u style="left:${pos(a)}%"></u>`}</div>
                <div class="nq-rl"><span>${nqTxt(c, mn)}</span><span>${rank}° su ${rows.length}</span><span>${nqTxt(c, mx)}</span></div></div>`;
        }).join('');
        const verdict = `<div class="nq-verdict"><span class="ab-av">${esc(absInitials(r.d.name))}</span><div><b>${esc(r.d.name)}</b><small>Nella media in <b>${ok}</b> voci su ${ok + hi + lo}${hi ? `, sopra in <b class="hi">${hi}</b>` : ''}${lo ? `, sotto in <b class="lo">${lo}</b>` : ''}</small></div></div>`;
        return names + verdict + `<div class="nq-tiles">${tiles}</div><div class="nq-leg">Il pallino è ${r.isMe ? 'la tua posizione' : 'la sua posizione'} tra il minimo e il massimo della squadra, la tacca è la media.</div>`;
    }

    // ── C · Tabellone a colori + turni pesanti ───────────────────────────
    function nqTabellone(rows, avg) {
        const list = rows.slice().sort((a, b) => (b.isMe - a.isMe) || a.d.name.localeCompare(b.d.name));
        const heavy = rows.map(r => ({ r, n: r.notti, w: r.we, f: r.fest, t: r.notti + r.we + r.fest })).sort((a, b) => b.t - a.t);
        const hm = Math.max(1, ...heavy.map(h => h.t)), ha = heavy.reduce((s, h) => s + h.t, 0) / heavy.length;
        const chart = `<div class="nq-card"><div class="nq-ct">Turni pesanti<small>notti + weekend + festivi lavorati</small></div>
            <div class="nq-sk">${heavy.map(h => `<div class="nq-row ${h.r.isMe ? 'me' : ''}"><span class="nq-n">${esc(h.r.d.name)}</span><div class="nq-track"><span class="nq-stack" style="width:${h.t / hm * 100}%"><i style="flex:${h.n};background:${NQ[0].col}"></i><i style="flex:${h.w};background:${NQ[1].col}"></i><i style="flex:${h.f};background:${NQ[2].col}"></i></span><u style="left:${ha / hm * 100}%"></u></div><b class="nq-v">${h.t}</b></div>`).join('')}</div>
            <div class="nq-leg">${NQ.slice(0, 3).map(c => `<span><i style="background:${c.col}"></i>${c.l}</span>`).join('')}<span><u></u>media ${Math.round(ha)}</span></div></div>`;
        const th = NQ.map(c => `<th title="${c.l}${c.sub ? ' (' + c.sub + ')' : ''}"><span class="material-icons-round" style="color:${c.col}">${c.ic}</span>${c.s}</th>`).join('');
        const tr = list.map(r => `<tr class="${r.isMe ? 'me' : ''}"><th>${esc(r.d.name)}</th>${NQ.map(c => { const v = r[c.k]; return `<td class="${nqLvl(c, v, avg[c.k])}">${nqTxt(c, v)}</td>`; }).join('')}</tr>`).join('');
        const avgRow = `<tr class="avg"><th>Media</th>${NQ.map(c => `<td>${c.signed ? '' : nqTxt(c, avg[c.k])}</td>`).join('')}</tr>`;
        return chart + `<div class="nq-card"><div class="nq-ct">Tutte le voci<small>colorato = lontano dalla media</small></div><div class="nq-tw"><table class="nq-tab"><thead><tr><th></th>${th}</tr></thead><tbody>${tr}${avgRow}</tbody></table></div>
            <div class="nq-leg nq-abbr">${NQ.map(c => `<span><b>${c.s}</b> ${c.l.toLowerCase()}${c.sub ? ' (' + c.sub + ')' : ''}</span>`).join('')}</div></div>`;
    }
