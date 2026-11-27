    // ═══ EQUITÀ DELL'ANNO (versione 3, semplificata) ═════════════════════
    // "Classifiche": una voce alla volta (scelta con i bottoni in alto), la media in grande,
    // chi ne ha di più e di meno, e una barra per persona con la linea tratteggiata della media.
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
    let nqMetric = 'notti';
    const nqTxt = (c, v) => c.fmt ? c.fmt(v) : (Math.round(v * 10) / 10).toString().replace('.', ',');
    const nqAvg = (c, rows) => { const set = c.doers ? rows.filter(r => r[c.k] > 0) : rows; return set.length ? set.reduce((a, r) => a + r[c.k], 0) / set.length : 0; };
    // livello rispetto alla media: 'hi' oltre +20%, 'lo' oltre −20%
    const nqLvl = (c, v, a) => { if(c.signed) return Math.abs(v) < 30 ? '' : (v < 0 ? 'neg' : 'pos'); if(c.doers && !v) return ''; if(!(a > 0)) return ''; const q = v / a; return q >= 1.2 ? 'hi' : (q <= 0.8 ? 'lo' : ''); };
    function nqSetMetric(k) { vibrate(); nqMetric = k; renderEquity(); }

    EQ_CATS.splice(0, 3, { k: 'tutto', label: 'Equità', icon: 'balance', desc: '' });
    const nqOldRender = window.renderEquity;
    window.renderEquity = function() {
        if(eqCat !== 'tutto') return nqOldRender();
        document.querySelectorAll('#eq-modal .ab-period button').forEach(b => b.classList.toggle('active', b.dataset.p === eqPeriod));
        document.getElementById('eq-cats').innerHTML = EQ_CATS.map(c => `<button class="${c.k === eqCat ? 'on' : ''}" onclick="eqSetCat('${c.k}')"><span class="material-icons-round">${c.icon}</span>${c.label}</button>`).join('');
        document.getElementById('eq-pairs').innerHTML = '';
        const { rows, days } = computeEquity();
        const avg = {}; NQ.forEach(c => avg[c.k] = nqAvg(c, rows));
        const html = !rows.length ? '<div class="nq-empty">Nessun dato nel periodo.</div>' : nqClassifica(rows, avg);
        document.getElementById('eq-grid').innerHTML = `<div class="nq">${html}</div>`;
        document.getElementById('eq-note').innerHTML = `${days.length} giorni considerati${eqPeriod === 'oggi' ? ', fino a oggi' : ', tutto il ' + SHIFT_YEAR}. <span class="nq-key hi"></span> oltre il 20% sopra la media, <span class="nq-key lo"></span> oltre il 20% sotto. Per notti e reperibilità coperte la media conta solo chi ne fa.`;
    };

    // ── Classifiche ──────────────────────────────────────────────────
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
