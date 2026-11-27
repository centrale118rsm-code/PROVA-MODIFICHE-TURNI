    // ═══ CONTEGGIO ASSENZE ═══════════════════════════════════════════════
    // Giorni per tipo di assenza (codice sotto il turno) e giornate particolari lavorate.
    // Spettanze annue: 31 giorni di C.O., 6 permessi straordinari, 2 permessi notte; ogni
    // permesso notte consuma anche un permesso straordinario.
    const ABS_ALLOW = { co:31, sp:6, pn:2 };
    // Spettanze della persona: quelle dell'anno salvo diverse in Area coordinatore › Operatori
    // (es. chi è assunto in corso d'anno ha meno giorni). operatorConfig.allow[nome] = { co, sp, pn }
    function absAllowFor(d) {
        const o = (d && operatorConfig.allow && operatorConfig.allow[d.originalName]) || {}, out = {};
        Object.keys(ABS_ALLOW).forEach(k => { const n = Number(o[k]); out[k] = o[k] !== undefined && o[k] !== null && o[k] !== '' && n >= 0 && n <= 99 ? n : ABS_ALLOW[k]; });
        return out;
    }
    const ABS_TYPES = {
        f:  { label:'Congedo ordinario', short:'C.O.',          color:'--bg-cong' },
        p:  { label:'Permessi straordinari', short:'Perm. straord.', color:'--bg-perm' },
        pn: { label:'Permessi notte',    short:'Perm. notte',   color:'--bg-pn' },
        m:  { label:'Malattia',          short:'Malattia',      color:'--bg-mal' },
        r:  { label:'Recuperi',          short:'Recuperi',      color:'--bg-rec' },
        v:  { label:'Ferie residue (anno prima)', short:'Ferie res.', color:'--bg-ferie' },
        c:  { label:'Permessi studio',   short:'Studio',        color:null, hex:'#dc2626' },
        gr: { label:'Gravidanza / maternit\u00e0', short:'Gravidanza', color:null, hex:'#ec4899' },
        ng: { label:'Festivi non goduti', short:'Fest. non god.', color:'--bg-ng' },
        nl: { label:'Festivi non lavorati', short:'Fest. non lav.', color:'--bg-nl' },
        pl: { label:'Permesso legge (14 h l’anno)', short:'Perm. legge', color:'--bg-pl' },
        k:  { label:'Distacco speciale', short:'Distacco', color:'--bg-ds' },
        s:  { label:'Permessi sportivi', short:'Sport', color:'--bg-sport' },
        l:  { label:'Permessi lutto', short:'Lutto', color:'--bg-lutto' },
        a:  { label:'Permesso matrimonio', short:'Matrimonio', color:'--bg-matr' },
        ps: { label:'Permesso sindacale', short:'Sindacale', color:'--bg-ps' },
        z:  { label:'Sostituzione coordinatore', short:'Sost. coord.', color:'--bg-coord', hex:'#dc2626', work:true },
        e:  { label:'Aspettativa',       short:'Aspettativa',   color:'--bg-stu' },
        l:  { label:'Permessi lutto',    short:'Lutto',         color:'--bg-stu' },
        s:  { label:'Permessi sportivi', short:'Sport',         color:'--bg-stu' },
        a:  { label:'Permessi matrimonio', short:'Matrimonio',  color:'--bg-stu' },
        k:  { label:'Distacco speciale', short:'Distacco',      color:'--bg-coord' },
        dom:   { label:'Domeniche lavorate', short:'Domeniche', hex:'#0ea5e9', work:true },
        fest:  { label:'Festivi lavorati',   short:'Festivi',   hex:'#f59e0b', work:true },
        notti: { label:'Notti',              short:'Notti',     hex:'#1e3a8a', work:true }
    };
    const ABS_OTHER = ['c', 'gr', 'ng', 'nl', 'e', 'l', 's', 'a', 'k'];
    const ABS_COUNTED = ['f', 'v', 'r', 'p', 'c', 'pn', 'm', 'gr', 'ng', 'nl', 'e', 'l', 's', 'a', 'k', 'pl', 'ps'];
    const typeColor = k => ABS_TYPES[k].color ? `var(${ABS_TYPES[k].color})` : ABS_TYPES[k].hex;
    let absPeriod = 'anno', absMonth = new Date().getMonth(), absDetailIdx = null, absOpenKey = null;
    function openAbsModal() {
        closeMenu(); vibrate();
        const now = new Date(); absMonth = now.getFullYear() === SHIFT_YEAR ? now.getMonth() : 0; absDetailIdx = null;
        renderAbsences();
        const m = document.getElementById('abs-modal'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10);
        setCurrentView('Conteggio assenze');
    }
    function closeAbsModal(e) {
        if(e && e.target !== e.currentTarget) return;
        const m = document.getElementById('abs-modal'); m.classList.remove('open'); setTimeout(() => m.style.display = 'none', 300);
    }
    function absSetPeriod(p) { vibrate(); absPeriod = p; renderAbsences(); }
    function absNav(d) { vibrate(); absMonth = Math.min(11, Math.max(0, absMonth + d)); renderAbsences(); }
    const WORK_SHIFTS = new Set(['M', 'P', 'N', 'M+N', 'm', 'p']);
    function absCountFor(d, days) {
        const counts = {}, dates = {}, hours = { pl: 0, ps: 0 }, hdates = { pl: [], ps: [] };
        const add = (k, dd) => { counts[k] = (counts[k] || 0) + 1; (dates[k] = dates[k] || []).push(dd.date); };
        days.forEach(dd => {
            const pm = permOfCell(dd.rowIdx, d.idx);   // permessi a ore (anche dentro un turno)
            if(pm) { hours[pm.k] = Math.round((hours[pm.k] + pm.h) * 100) / 100; hdates[pm.k].push({ date: dd.date, h: pm.h, full: pm.full }); }
            const cell = finalData[dd.rowIdx][d.idx] || {};
            const sub = (cell.subV || '').toString().trim().toLowerCase();
            let v = (cell.v || '').toString().trim(); if(isRepStr(v)) v = v.slice(0, v.indexOf('/')).trim();
            if(SPECIAL_SUBCODES[sub] !== undefined) { if(absCycleCode(dd.rowIdx, d.idx) !== 'R' && !(!ABS_CYCLE[sub] && /^r(iposo)?$/i.test(v))) add(sub, dd); return; }   // assenza su un riposo (anche il riposo del ciclo del turno): non conta
            const info = computeDayInfo(dd.rowIdx, d.idx);
            if(!WORK_SHIFTS.has(info.code) || !info.minutes) return;
            if(dd.date.getDay() === 0) add('dom', dd);
            if(HOLIDAYS[`${dd.date.getMonth()}-${dd.date.getDate()}`]) add('fest', dd);
            if(info.code === 'N' || info.code === 'M+N') add('notti', dd);
        });
        // conteggio dell'anno intero: contano su quest'anno le ferie (C.O.) messe a gennaio-marzo
        // dell'anno dopo e le "ferie residue" segnate nell'anno dopo (sono ferie di quest'anno)
        let nextF = 0;
        const lastDay = days[days.length - 1];
        if(lastDay && lastDay.monthIdx === 11 && lastDay.day === 31) {
            for(let r = 1; r < finalData.length; r++) {
                if(shiftRowYear(r) !== SHIFT_YEAR + 1) continue;
                const cell = finalData[r][d.idx] || {}, sub = (cell.subV || '').toString().trim().toLowerCase();
                let v = (cell.v || '').toString().trim(); if(isRepStr(v)) v = v.slice(0, v.indexOf('/')).trim();
                if(!(+cell.coY > SHIFT_YEAR) && absCycleCode(r, d.idx) !== 'R' && !(!ABS_CYCLE[sub] && /^r(iposo)?$/i.test(v)) && (sub === 'v' || (sub === 'f' && MONTH_MAP[finalData[r][0].v] < CO_CARRY_MONTHS))) { add('f', { date: new Date(SHIFT_YEAR + 1, MONTH_MAP[finalData[r][0].v], parseInt(finalData[r][1].v)) }); nextF++; }
            }
        }
        const n = k => counts[k] || 0;
        return { counts, dates, total: ABS_COUNTED.reduce((a, k) => a + n(k), 0),
                 allow: { co: n('f'), sp: n('p') + n('pn'), pn: n('pn') }, max: absAllowFor(d), hours, hdates, nextF };
    }
    function computeAbsences() {
        const all = buildDaysIndex(), days = absPeriod === 'anno' ? all : all.filter(dd => dd.monthIdx === absMonth);
        const me = userIdentity ? userIdentity.toUpperCase() : '';
        return drivers.filter(d => !d.hidden).map(d => Object.assign({ d, isMe: !!me && (d.name.toUpperCase() === me || (d.originalName || '').toUpperCase() === me) }, absCountFor(d, days)))
            .sort((a, b) => b.isMe - a.isMe);
    }
    function absInitials(name) { const w = name.trim().split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase(); }
    function absMeter(used, max, col) {
        const pct = Math.min(100, used / max * 100);
        return `<div class="ab-meter ${used > max ? 'over' : ''}" style="--pc:${col}"><b>${used}<small> / ${max}</small></b><div class="bar"><i style="width:${pct.toFixed(0)}%"></i></div></div>`;
    }
    function absPill(n, k) { return n ? `<span class="ab-pill" style="--pc:${typeColor(k)}">${n}</span>` : '<span class="ab-dot">\u00b7</span>'; }
    function renderAbsencesOld() {
        const grid = document.getElementById('ab-view-grid'), det = document.getElementById('ab-view-detail');
        if(absDetailIdx !== null) { grid.style.display = 'none'; det.style.display = ''; renderAbsDetail(); return; }
        grid.style.display = ''; det.style.display = 'none';
        document.querySelectorAll('#abs-modal .ab-period button').forEach(b => b.classList.toggle('active', b.dataset.p === absPeriod));
        document.getElementById('ab-nav').style.display = absPeriod === 'mese' ? '' : 'none';
        const mName = MONTH_NAMES_IT[absMonth].charAt(0).toUpperCase() + MONTH_NAMES_IT[absMonth].slice(1);
        document.getElementById('ab-label').innerHTML = `${mName} <small>${SHIFT_YEAR}</small>`;
        const rows = computeAbsences(), year = absPeriod === 'anno';
        const sum = k => rows.reduce((a, r) => a + (r.counts[k] || 0), 0);
        document.getElementById('ab-kpis').innerHTML = [
            ['f', 'giorni di C.O.'], ['m', 'giorni di malattia'], ['p', 'permessi straordinari'], ['dom', 'domeniche lavorate']
        ].map(([k, l]) => `<div class="ab-kpi"><b>${sum(k)}</b><small><i style="background:${typeColor(k)}"></i>${l}</small></div>`).join('');
        const otherShown = rows.some(r => ABS_OTHER.some(k => r.counts[k]));
        const headL = `<th class="ab-op">${year ? 'Anno ' + SHIFT_YEAR : mName}</th>`, head = `<th>C.O.</th><th>Perm. straord.</th><th>Perm. notte</th><th>Perm. legge</th><th>Sindacale</th><th>Malattia</th><th>Recuperi</th><th>Ferie res.</th>${otherShown ? '<th>Altre</th>' : ''}<th>Totale</th><th class="ab-sep">Domeniche</th><th>Festivi</th><th>Notti</th>`;
        const body = rows.map(r => {
            const c = k => r.counts[k] || 0, other = ABS_OTHER.reduce((a, k) => a + c(k), 0);
            return { attrs: `class="${r.isMe ? 'me' : ''}" onclick="absOpenDetail(${r.d.idx})"`,
                left: `<th class="ab-op"><div class="ab-who"><span class="ab-av">${esc(absInitials(r.d.name))}</span><span>${esc(r.d.name)}</span>${r.isMe ? '<em>tu</em>' : ''}</div></th>`,
                right: `<td>${year ? absMeter(r.allow.co, r.max.co, typeColor('f')) : absPill(c('f'), 'f')}</td>
                <td>${year ? absMeter(r.allow.sp, r.max.sp, typeColor('p')) : absPill(r.allow.sp, 'p')}</td>
                <td>${year ? absMeter(r.allow.pn, r.max.pn, typeColor('pn')) : absPill(c('pn'), 'pn')}</td>
                <td>${year ? permMeterHtml(r.hours.pl, PERM_HOURLY.pl.max, typeColor('pl')) : permPill(r.hours.pl, 'pl')}</td>
                <td>${permPill(r.hours.ps, 'ps')}</td>
                <td>${absPill(c('m'), 'm')}</td><td>${absPill(c('r'), 'r')}</td><td>${absPill(c('v'), 'v')}</td>
                ${otherShown ? `<td>${other ? `<span class="ab-pill" style="--pc:#94a3b8">${other}</span>` : '<span class="ab-dot">\u00b7</span>'}</td>` : ''}
                <td><span class="ab-tot">${r.total || '\u00b7'}</span></td>
                <td class="ab-sep">${absPill(c('dom'), 'dom')}</td><td>${absPill(c('fest'), 'fest')}</td><td>${absPill(c('notti'), 'notti')}</td>` };
        });
        document.getElementById('ab-grid').innerHTML = xgHtml('ab2', headL, head, body, otherShown ? 790 : 740);
    }
    function absOpenDetail(idx, key) { vibrate(); absDetailIdx = idx; absOpenKey = key || null; renderAbsences(); document.querySelector('#abs-modal .modal-body').scrollTop = 0; }
    function absCloseDetail() { vibrate(); absDetailIdx = null; renderAbsences(); }
    function absToggle(k) { vibrate(); absOpenKey = absOpenKey === k ? null : k; renderAbsDetail(); }
    // giorni consecutivi raggruppati: "3–7 agosto (5 giorni)"
    function absRanges(dates) {
        const out = []; let start = null, prev = null;
        const flush = () => { if(!start) return; const n = Math.round((prev - start) / 86400000) + 1;
            const f = dt => dt.toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'long' });
            const wd = dt => dt.toLocaleDateString('it-IT', { weekday:'short' });
            const from = start.getMonth() === prev.getMonth() ? `${wd(start)} ${start.getDate()}` : start.toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'long' });
            out.push([n === 1 ? f(start) : `${from} \u2013 ${f(prev)}`, n === 1 ? '1 giorno' : n + ' giorni']); };
        dates.slice().sort((a, b) => a - b).forEach(dt => { if(prev && (dt - prev) === 86400000) prev = dt; else { flush(); start = dt; prev = dt; } });
        flush(); return out;
    }
    function absRing(used, max, col) {
        const R = 20, C = 2 * Math.PI * R, pct = Math.min(1, used / max);
        return `<svg width="50" height="50" viewBox="0 0 50 50"><circle cx="25" cy="25" r="${R}" fill="none" stroke="var(--border)" stroke-width="6"/><circle cx="25" cy="25" r="${R}" fill="none" stroke="${used > max ? '#dc2626' : col}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 25 25)"/></svg>`;
    }
    function renderAbsDetailOld() {
        const det = document.getElementById('ab-view-detail');
        const d = drivers.find(x => x.idx === absDetailIdx); if(!d) { absDetailIdx = null; renderAbsences(); return; }
        const r = absCountFor(d, buildDaysIndex());   // il dettaglio è sempre sull'anno intero
        const counter = (key, used, max, label, note) => {
            const left = max - used;
            return `<div class="abd-c" onclick="absToggle('${key}')">${absRing(used, max, typeColor(key))}<div><small>${label}</small><b>${used} / ${max}</b><em class="${left < 0 ? 'over' : 'ok'}">${left < 0 ? 'oltre di ' + (-left) : 'restano ' + left}</em>${note ? `<small style="text-transform:none;letter-spacing:0;font-weight:600;margin-top:2px">${note}</small>` : ''}</div></div>`;
        };
        const item = k => {
            const T = ABS_TYPES[k], list = r.dates[k] || [], n = list.length;
            const sub = k === 'p' && (r.counts.pn || 0) ? `+ ${r.counts.pn} usati dai permessi notte` : (n ? absRanges(list).length + (absRanges(list).length === 1 ? ' periodo' : ' periodi') : 'nessuno');
            return `<div class="abd-item ${absOpenKey === k ? 'open' : ''} ${n ? '' : 'empty'}" id="abd-${k}">
                <div class="abd-row" ${n ? `onclick="absToggle('${k}')"` : ''} style="--pc:${typeColor(k)}"><span class="sw"></span><span class="t"><b>${T.label}</b><small>${sub}</small></span><span class="n">${n}</span>${n ? '<span class="material-icons-round">expand_more</span>' : ''}</div>
                <div class="abd-dates">${absRanges(list).map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('')}</div>
            </div>`;
        };
        const absKeys = ['f', 'p', 'pn', 'm', 'r', 'v', 'c', 'gr', 'ng', 'nl', 'e', 'l', 's', 'a', 'k'], workKeys = ['z', 'dom', 'fest', 'notti'];
        det.innerHTML = `
            <div class="abd-head"><button class="abd-back" onclick="absCloseDetail()" aria-label="Indietro"><span class="material-icons-round">arrow_back</span></button>
                <span class="ab-av">${esc(absInitials(d.name))}</span><div><b>${esc(d.name)}</b><small>Anno ${SHIFT_YEAR} \u00b7 ${r.total} giorni di assenza</small></div></div>
            <div class="abd-counters">
                ${counter('f', r.allow.co, r.max.co, 'Congedo ordinario')}
                ${counter('p', r.allow.sp, r.max.sp, 'Permessi straordinari', (r.counts.pn || 0) ? `di cui ${r.counts.pn} per permessi notte` : '')}
                ${counter('pn', r.allow.pn, r.max.pn, 'Permessi notte')}
                ${permCounterHtml(r)}
            </div>
            <div class="abd-list">
                <div class="abd-sec">Assenze</div>${absKeys.map(item).join('')}
                <div class="abd-sec">Permessi a ore</div>${['pl', 'ps'].map(k => permDetailItem(r, k)).join('')}
                <div class="abd-sec">Giornate lavorate particolari</div>${workKeys.map(item).join('')}
            </div>`;
        if(absOpenKey) setTimeout(() => { const el = document.getElementById('abd-' + absOpenKey); if(el) el.scrollIntoView({ behavior:'smooth', block:'nearest' }); }, 60);
    }

    // ── Griglia mensile: righe = operatori, colonne = settimane del mese ──
    let hgMonth = new Date().getMonth();
    function hgNav(d) { vibrate(); hgMonth = Math.min(11, Math.max(0, hgMonth + d)); renderHoursGrid(); }
    // colore della settimana secondo la differenza (minuti) rispetto al contratto
    function hgTint(delta) {
        if(Math.abs(delta) < 30) return [59,130,246,0.14];
        const a = Math.min(0.42, 0.16 + Math.abs(delta) / 360 * 0.12);
        return delta < 0 ? [239,68,68,a] : [34,197,94,a];
    }
    const hgRgba = c => `rgba(${c[0]},${c[1]},${c[2]},${c[3].toFixed(3)})`;
    const hgMix = (a, b) => a.map((v, i) => (v + b[i]) / 2);
    // piccola onda del saldo progressivo nel mese
    function hgSpark(points) {
        if(points.length < 2) return '';
        const W = 64, H = 20, max = Math.max(60, ...points.map(p => Math.abs(p)));
        const xy = points.map((p, i) => [i * W / (points.length - 1), H / 2 - p / max * (H / 2 - 2)]);
        let d = `M${xy[0][0].toFixed(1)} ${xy[0][1].toFixed(1)}`;
        for(let i = 1; i < xy.length; i++) { const mx = (xy[i - 1][0] + xy[i][0]) / 2; d += ` C${mx.toFixed(1)} ${xy[i - 1][1].toFixed(1)}, ${mx.toFixed(1)} ${xy[i][1].toFixed(1)}, ${xy[i][0].toFixed(1)} ${xy[i][1].toFixed(1)}`; }
        const last = points[points.length - 1], col = Math.abs(last) < 30 ? '#3b82f6' : (last < 0 ? '#dc2626' : '#16a34a');
        return `<svg class="hg-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><line x1="0" y1="${H/2}" x2="${W}" y2="${H/2}" stroke="currentColor" stroke-opacity=".18" stroke-dasharray="2 2"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round"/></svg>`;
    }
    function renderHoursGridOld() {
        const el = document.getElementById('hg-grid'); if(!el) return;
        document.getElementById('hg-month').innerHTML = `${MONTH_NAMES_IT[hgMonth].charAt(0).toUpperCase() + MONTH_NAMES_IT[hgMonth].slice(1)} <small>${SHIFT_YEAR}</small>`;
        const allDays = buildDaysIndex(), days = allDays.filter(dd => dd.monthIdx === hgMonth);
        const map = {}, weeks = [];
        days.forEach(dd => { const k = ymd(getWeekRange(dd.date).start); if(!map[k]) { map[k] = []; weeks.push(k); } map[k].push(dd); });
        // Settimana a cavallo di due mesi (es. solo domenica 1): il saldo si calcola sulla settimana intera,
        // altrimenti un giorno da solo risultava tutto "in più" (+6:00) e colorava la casella di verde.
        // Le ore del mese restano quelle dei soli giorni del mese.
        const byWeek = {}; allDays.forEach(dd => { const k = ymd(getWeekRange(dd.date).start); (byWeek[k] = byWeek[k] || []).push(dd); });
        const mon3 = m => MONTH_NAMES_IT[m].slice(0, 3);
        const cols = weeks.map((k, i) => { const g = map[k], full = byWeek[k] || g, part = full.length > g.length;
            return { label: 'Sett. ' + (i + 1), sub: part ? `${full[0].day} ${mon3(full[0].monthIdx)}\u2013${full[full.length - 1].day} ${mon3(full[full.length - 1].monthIdx)}` : g[0].day + (g.length > 1 ? '\u2013' + g[g.length - 1].day : '') + ' ' + mon3(hgMonth), days: g, full, part }; });
        const today = new Date(); today.setHours(0,0,0,0);
        const me = userIdentity ? userIdentity.toUpperCase() : '';
        const rows = drivers.filter(d => !d.hidden).map(d => {
            const ch = getContractHours(d.idx);
            let run = 0, tot = 0, tgt = 0; const spark = [0];
            const cells = cols.map(c => {
                const w = c.days.reduce((a, dd) => a + computeDayInfo(dd.rowIdx, d.idx).minutes, 0);
                const t = contractMinutesFor(ch, c.days.map(dd => dd.date), d.idx);
                tot += w; tgt += t; run += w - t; spark.push(run);
                if(!c.part) return { w, t, delta: w - t, future: c.days[0].date > today };
                const wf = c.full.reduce((a, dd) => a + computeDayInfo(dd.rowIdx, d.idx).minutes, 0), tf = contractMinutesFor(ch, c.full.map(dd => dd.date), d.idx);
                return { w: wf, t: tf, delta: wf - tf, future: c.full[0].date > today };
            });
            return { d, ch, cells, tot, tgt, spark, isMe: me && (d.name.toUpperCase() === me || (d.originalName || '').toUpperCase() === me) };
        });
        rows.sort((a, b) => (b.isMe - a.isMe));
        const headL = '<th class="hg-name">Operatore</th>', head = `${cols.map(c => `<th>${c.label}<small>${c.sub}</small></th>`).join('')}<th class="hg-tot">Ore del mese</th>`;
        const body = rows.map(r => {
            const tints = r.cells.map(c => hgTint(c.delta));
            const tds = r.cells.map((c, i) => {
                const cur = tints[i], prev = i ? hgMix(tints[i - 1], cur) : cur, next = i < tints.length - 1 ? hgMix(cur, tints[i + 1]) : cur;
                const bg = `linear-gradient(90deg, ${hgRgba(prev)} 0%, ${hgRgba(cur)} 50%, ${hgRgba(next)} 100%)`;
                const cls = Math.abs(c.delta) < 30 ? 'eq' : (c.delta < 0 ? 'neg' : 'pos');
                return `<td class="${c.future ? 'fut' : ''}" style="background:${bg}"><b>${fmtHM(c.w)}</b><small class="${cls}">${fmtHM(c.delta, true) || '0:00'}</small></td>`;
            }).join('');
            const dt = r.tot - r.tgt, dcls = Math.abs(dt) < 30 ? 'eq' : (dt < 0 ? 'neg' : 'pos');
            return { attrs: `class="${r.isMe ? 'me' : ''}"`, left: `<th class="hg-name" onclick="openHoursDetail(${r.d.idx}, ${hgMonth})"><span>${esc(r.d.name)}</span>${r.isMe ? '<em>tu</em>' : ''}<small>${r.ch} h/sett.</small></th>`, right: `${tds}<td class="hg-tot"><div><b>${fmtHM(r.tot)}</b>${hgSpark(r.spark)}</div><small class="${dcls}">${fmtHM(dt, true) || '0:00'} su ${fmtHM(r.tgt)}</small></td>` };
        });
        el.innerHTML = rows.length ? xgHtml('hg-table', headL, head, body, cols.length * 82 + 150) : '<div class="coord-sync-empty">Nessun dato per questo mese</div>';
    }
    function renderHoursOperatorList() {
        const listEl = document.getElementById('hc-op-list'); if(!listEl) return;
        const q = (document.getElementById('hc-search-input')?.value || "").trim().toLowerCase();
        let cols = drivers.filter(d => !d.test).sort((a,b)=>a.name.localeCompare(b.name));
        listEl.innerHTML = "";
        cols.forEach(d => {
            if(q && !d.name.toLowerCase().includes(q)) return;
            let initials = d.name.split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
            let item = document.createElement('div'); item.className = 'hc-op-item';
            item.onclick = () => openHoursDetail(d.idx);
            item.innerHTML = `<div class="hc-op-avatar">${initials}</div><div class="hc-op-name">${d.name}</div><span class="material-icons-round" style="color:var(--text-sec)">chevron_right</span>`;
            listEl.appendChild(item);
        });
        if(!listEl.children.length) listEl.innerHTML = `<div class="coord-sync-empty">Nessun operatore trovato</div>`;
    }
    function hoursBackToList() {
        vibrate();
        document.getElementById('hc-list-view').style.display='block';
        document.getElementById('hc-detail-view').style.display='none';
        if(hoursChartInstance) { hoursChartInstance.destroy(); hoursChartInstance = null; }
    }
    function openHoursDetail(driverIdx, monthIdx) {
        vibrate();
        hoursSelectedDriver = driverIdx; hoursPeriod = monthIdx !== undefined ? "mese" : "settimana";
        hoursWeekAnchor = new Date(); hoursSelectedMonthIdx = monthIdx !== undefined ? monthIdx : new Date().getMonth();
        document.getElementById('hc-list-view').style.display='none';
        document.getElementById('hc-detail-view').style.display='block';
        let d = getDriverByIdx(driverIdx);
        document.getElementById('hc-detail-name').innerText = d ? d.name : "";
        document.querySelectorAll('.hc-period-tab').forEach(t=>t.classList.toggle('active', t.dataset.period===hoursPeriod));
        renderHoursDetail();
    }
    function setHoursPeriod(p) {
        vibrate(); hoursPeriod = p;
        document.querySelectorAll('.hc-period-tab').forEach(t=>t.classList.toggle('active', t.dataset.period===p));
        renderHoursDetail();
    }
    function hoursShiftWeek(delta) {
        vibrate();
        let d = new Date(hoursWeekAnchor); d.setDate(d.getDate() + delta*7); hoursWeekAnchor = d;
        renderHoursDetail();
    }
    function hoursSetMonth(idx) { vibrate(); hoursSelectedMonthIdx = parseInt(idx); renderHoursDetail(); }

    function renderHoursTodayStatus(driverIdx) {
        const days = buildDaysIndex();
        let refDate = refDateForBalance();
        let elapsed = days.filter(dd => dd.date <= refDate);
        let statusEl = document.getElementById('hc-today-status');
        if(!elapsed.length) { statusEl.innerHTML = ""; document.getElementById('hc-projection').innerHTML = ""; return; }
        let workedSoFar = elapsed.reduce((s,dd)=>s+computeDayInfo(dd.rowIdx,driverIdx).minutes,0);
        let targetSoFar = contractMinutesFor(getContractHours(driverIdx), elapsed.map(dd => dd.date), driverIdx);
        let delta = workedSoFar - targetSoFar;
        let cls = delta>=0 ? 'ok' : 'low';
        let msg = delta>=0 ? `IN CREDITO ${formatHM(delta)}` : `IN DEBITO ${formatHM(Math.abs(delta))}`;
        statusEl.innerHTML = `<div class="hc-today-card ${cls}">
            <span class="material-icons-round">${delta>=0?'trending_up':'trending_down'}</span>
            <div><div class="hc-today-main">AD OGGI: ${msg}</div><div class="hc-today-sub">${formatHM(workedSoFar)} lavorate su ${formatHM(targetSoFar)} contrattuali maturate da inizio anno${delta<0?' — valuta di inserire un riposo':''}</div></div>
        </div>`;

        // proiezione prossime settimane, in base ai turni già pianificati a calendario
        let futureDays = days.filter(dd => dd.date > refDate);
        let weeksMap = {};
        futureDays.forEach(dd => { let wk = getISOWeek(dd.date); (weeksMap[wk]=weeksMap[wk]||[]).push(dd); });
        let weekKeys = Object.keys(weeksMap).sort((a,b)=>a-b).slice(0,4);
        let projEl = document.getElementById('hc-projection');
        if(!weekKeys.length) { projEl.innerHTML = ''; return; }
        let rows = weekKeys.map(wk => {
            let group = weeksMap[wk];
            let tot = group.reduce((s,dd)=>s+computeDayInfo(dd.rowIdx,driverIdx).minutes,0);
            let d2 = tot - contractMinutesFor(getContractHours(driverIdx), group.map(dd => dd.date), driverIdx);
            let startLbl = group[0].date.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});
            let cls2 = d2>=0?'pos':'neg';
            return `<div class="hc-bd-row"><div><div class="hc-bd-main">Settimana dal ${startLbl}</div><div class="hc-bd-sub">${group.length} giorni già pianificati</div></div><div style="text-align:right"><div class="hc-bd-hours">${formatHM(tot)}</div><div class="hc-bd-delta ${cls2}">${d2>=0?'+':''}${formatHM(d2)}</div></div></div>`;
        }).join('');
        projEl.innerHTML = `<div class="admin-section-label" style="margin:0 18px 8px;"><span class="material-icons-round" style="font-size:14px">insights</span> Prossime settimane pianificate</div><div style="margin:0 18px;">${rows}</div>`;
    }
    function renderMonthCalendarGrid(monthIdx, driverIdx) {
        const el = document.getElementById('hc-calendar-grid');
        if(hoursPeriod !== 'mese') { el.style.display='none'; el.innerHTML=''; return; }
        const days = buildDaysIndex().filter(dd=>dd.monthIdx===monthIdx);
        if(!days.length) { el.innerHTML = ''; el.style.display='none'; return; }
        el.style.display = 'block';
        let firstDow = (days[0].date.getDay()+6)%7;
        let cells = []; for(let i=0;i<firstDow;i++) cells.push(null);
        days.forEach(dd=>cells.push(dd));
        let todayStr = new Date().toDateString();
        let html = `<div class="hc-cal-weekdays">${['L','M','M','G','V','S','D'].map(w=>`<div>${w}</div>`).join('')}</div><div class="hc-cal-grid">`;
        cells.forEach(dd => {
            if(!dd) { html += `<div class="hc-cal-cell empty"></div>`; return; }
            let info = computeDayInfo(dd.rowIdx, driverIdx);
            let cls = 'worked';
            if(info.justified) cls='absence';
            else if(info.minutes===0 && info.unrecognized) cls='unrecognized';
            else if(info.minutes===0) cls='riposo';
            let isToday = dd.date.toDateString() === todayStr;
            html += `<div class="hc-cal-cell ${cls} ${isToday?'is-today':''}"><div class="hc-cal-daynum">${dd.day}</div><div class="hc-cal-code">${info.code||'—'}</div></div>`;
        });
        html += `</div>`;
        el.innerHTML = html;
    }

    function renderHoursDetail() {
        if(hoursSelectedDriver === null || hoursSelectedDriver === undefined) return;
        renderHoursTodayStatus(hoursSelectedDriver);
        const days = buildDaysIndex();
        const subnav = document.getElementById('hc-subnav');
        const CH = getContractHours(hoursSelectedDriver);
        let periodDays = [], targetHoursTotal = 0, chartLabels = [], chartData = [], chartTargetLine = null, breakdownRows = [];

        if(hoursPeriod === "settimana") {
            let {start,end} = getWeekRange(hoursWeekAnchor);
            subnav.innerHTML = `
                <button class="hc-subnav-btn" onclick="hoursShiftWeek(-1)"><span class="material-icons-round">chevron_left</span></button>
                <div class="hc-subnav-label">${start.toLocaleDateString('it-IT',{day:'2-digit',month:'short'})} — ${end.toLocaleDateString('it-IT',{day:'2-digit',month:'short'})}</div>
                <button class="hc-subnav-btn" onclick="hoursShiftWeek(1)"><span class="material-icons-round">chevron_right</span></button>`;
            periodDays = days.filter(dd => dd.date >= start && dd.date <= end);
            targetHoursTotal = CH;
            let giorniLbl = ["LUN","MAR","MER","GIO","VEN","SAB","DOM"];
            for(let i=0;i<7;i++) {
                let dt = new Date(start); dt.setDate(start.getDate()+i);
                let match = periodDays.find(dd=>dd.date.toDateString()===dt.toDateString());
                let info = match ? computeDayInfo(match.rowIdx, hoursSelectedDriver) : {minutes:0,label:""};
                chartLabels.push(giorniLbl[i]); chartData.push(+(info.minutes/60).toFixed(2));
                breakdownRows.push({ main: dt.toLocaleDateString('it-IT',{weekday:'long',day:'2-digit',month:'2-digit'}), sub: info.label || "—", minutes: info.minutes });
            }
            chartTargetLine = CH/CONTRACT_WORKDAYS;
        } else if(hoursPeriod === "mese") {
            let monthNamesArr = Object.keys(MONTH_MAP);
            let optsHtml = monthNamesArr.map((mn,i)=>`<option value="${i}" ${i===hoursSelectedMonthIdx?"selected":""}>${mn.charAt(0)+mn.slice(1).toLowerCase()}</option>`).join('');
            subnav.innerHTML = `<select onchange="hoursSetMonth(this.value)">${optsHtml}</select>`;
            periodDays = days.filter(dd => dd.monthIdx === hoursSelectedMonthIdx);
            let weeksMap = {};
            periodDays.forEach(dd => { let wk = getISOWeek(dd.date); (weeksMap[wk] = weeksMap[wk]||[]).push(dd); });
            let weekKeys = Object.keys(weeksMap).sort((a,b)=>a-b);
            targetHoursTotal = contractMinutesFor(CH, periodDays.map(dd => dd.date), hoursSelectedDriver) / 60;
            weekKeys.forEach((wk,i) => {
                let tot = weeksMap[wk].reduce((s,dd)=>s+computeDayInfo(dd.rowIdx,hoursSelectedDriver).minutes,0);
                chartLabels.push("Sett. "+(i+1)); chartData.push(+(tot/60).toFixed(2));
                breakdownRows.push({ main:"Settimana "+(i+1), sub: weeksMap[wk].length+" giorni nel mese", minutes: tot, delta: tot - contractMinutesFor(CH, weeksMap[wk].map(dd => dd.date), hoursSelectedDriver) });
            });
            chartTargetLine = CH;
        } else { // anno
            subnav.innerHTML = `<div class="hc-subnav-label">Anno ${SHIFT_YEAR}</div>`;
            periodDays = days;
            let monthNamesArr = Object.keys(MONTH_MAP);
            let monthsPresent = [...new Set(periodDays.map(dd=>dd.monthIdx))].sort((a,b)=>a-b);
            monthsPresent.forEach(mi => {
                let dGroup = periodDays.filter(dd=>dd.monthIdx===mi);
                let tot = dGroup.reduce((s,dd)=>s+computeDayInfo(dd.rowIdx,hoursSelectedDriver).minutes,0);
                let targetM = contractMinutesFor(CH, dGroup.map(dd => dd.date), hoursSelectedDriver);
                chartLabels.push(monthNamesArr[mi].slice(0,3));
                chartData.push(+(tot/60).toFixed(2));
                breakdownRows.push({ main: monthNamesArr[mi].charAt(0)+monthNamesArr[mi].slice(1).toLowerCase(), sub: dGroup.length+" giorni", minutes: tot, delta: tot-targetM });
                targetHoursTotal += targetM / 60;
            });
        }

        let totalMinutesA = periodDays.reduce((s,dd)=>s+computeDayInfo(dd.rowIdx,hoursSelectedDriver).minutes, 0);
        let unrecognizedCodes = new Set();
        periodDays.forEach(dd => { let info = computeDayInfo(dd.rowIdx,hoursSelectedDriver); if(info.unrecognized) unrecognizedCodes.add(info.code); });
        let totalMinutesB = periodDays.reduce((s,dd)=>s+independentDayMinutes(dd.rowIdx,hoursSelectedDriver), 0);
        let discrepancy = Math.abs(totalMinutesA - totalMinutesB);

        let deltaTotal = totalMinutesA - targetHoursTotal*60;
        document.getElementById('hc-summary-row').innerHTML = `
            <div class="hc-summary-box"><div class="hc-summary-num">${formatHM(totalMinutesA)}</div><div class="hc-summary-lbl">Ore lavorate</div></div>
            <div class="hc-summary-box"><div class="hc-summary-num">${formatHM(targetHoursTotal*60)}</div><div class="hc-summary-lbl">Contrattuali</div></div>
            <div class="hc-summary-box ${deltaTotal>=0?'ok':'low'}"><div class="hc-summary-num">${deltaTotal>=0?'+':''}${formatHM(deltaTotal)}</div><div class="hc-summary-lbl">Differenza</div></div>`;

        let badgeEl = document.getElementById('hc-check-badge');
        if(discrepancy > 1 || unrecognizedCodes.size) {
            let msg = discrepancy>1 ? `Discrepanza tra i due metodi di calcolo: ${formatHM(discrepancy)}. ` : "";
            if(unrecognizedCodes.size) msg += `Codici turno non riconosciuti esclusi dal conteggio: ${[...unrecognizedCodes].join(', ')}.`;
            badgeEl.innerHTML = `<div class="hc-check-badge warn"><span class="material-icons-round">warning</span>${msg}</div>`;
        } else {
            badgeEl.innerHTML = `<div class="hc-check-badge ok"><span class="material-icons-round">verified</span>Calcolo verificato con doppio controllo</div>`;
        }

        let bdEl = document.getElementById('hc-breakdown');
        bdEl.innerHTML = breakdownRows.map(r => {
            let deltaHtml = "";
            if(r.delta !== undefined) { let cls = r.delta>=0?'pos':'neg'; deltaHtml = `<div class="hc-bd-delta ${cls}">${r.delta>=0?'+':''}${formatHM(r.delta)}</div>`; }
            return `<div class="hc-bd-row"><div><div class="hc-bd-main">${r.main}</div><div class="hc-bd-sub">${r.sub}</div></div><div style="text-align:right"><div class="hc-bd-hours">${formatHM(r.minutes)}</div>${deltaHtml}</div></div>`;
        }).join('') || `<div class="coord-sync-empty">Nessun dato disponibile</div>`;

        renderMonthCalendarGrid(hoursSelectedMonthIdx, hoursSelectedDriver);

        if(typeof Chart === 'undefined') { loadLib('chart').then(() => { if(document.getElementById('hc-detail-view').style.display !== 'none') renderHoursDetail(); }).catch(() => {}); return; }
        let ctx = document.getElementById('hc-chart').getContext('2d');
        if(hoursChartInstance) hoursChartInstance.destroy();
        let datasets = [{ label:'Ore lavorate', data: chartData, backgroundColor:'rgba(37,99,235,0.75)', borderRadius:6 }];
        if(chartTargetLine !== null) {
            datasets.push({ label:'Target', data: chartLabels.map(()=>chartTargetLine), type:'line', borderColor:'#dc2626', borderDash:[6,4], pointRadius:0, borderWidth:2 });
        }
        hoursChartInstance = new Chart(ctx, {
            type:'bar',
            data:{ labels: chartLabels, datasets },
            options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true, labels:{ boxWidth:12, font:{size:10} } } }, scales:{ y:{ beginAtZero:true, title:{display:true,text:'ore'} } } }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SICUREZZA DEI DATI — salvataggi per singola casella, conferma, bozza, storico,
    // istantanee, backup, anni e passaggio definitivo a Firebase
    // ═══════════════════════════════════════════════════════════════════════
    // Origine dei turni: 'excel' = turni.xlsx + modifiche (manualOverrides nel documento
    // impostazioni); 'firebase' = i turni vivono solo su Firestore, un documento per mese
    // ("turni_AAAA-MM", mappa cells) e l'Excel non viene più letto.
    let dataSourceMode = 'excel', activeYear = 2026, archivedYears = [];
    let bootMode = null, appBooted = false;
    let configReadyResolve = null, configReadyDone = false;
    const configReady = new Promise(r => { configReadyResolve = r; });
    function resolveConfigReady() { if(!configReadyDone) { configReadyDone = true; configReadyResolve(); } }
    function waitForConfig(ms) { return Promise.race([configReady, new Promise(r => setTimeout(r, ms))]); }

    // Prima apertura di PROVA con i documenti separati: si parte da una copia delle impostazioni
    // condivise (una volta sola), poi le due app vanno ognuna per conto suo.
    let nsSeedTried = false;
    function seedNamespaceSettings() {
        if(!DATA_NS || nsSeedTried || !fbReady) return;
        nsSeedTried = true;
        db.collection('admin_config').doc('settings').get({ source: 'server' }).then(d => {
            if(!d.exists) return;
            return cfgRef('settings').get({ source: 'server' }).then(p => { if(!p.exists) return cfgRef('settings').set(Object.assign({}, d.data(), { copiedFromSharedAt: new Date().toISOString() })); });
        }).catch(e => console.error('Copia iniziale impostazioni non riuscita:', e));
    }

    // ── Modifiche in sospeso e fusione con quelle degli altri dispositivi ──
    // coordEditBaseline = ultimo stato confermato dal server; manualOverrides = stato locale.
    function pendingKeySet() {
        const set = new Set();
        new Set([...Object.keys(manualOverrides), ...Object.keys(coordEditBaseline || {})]).forEach(k => {
            if(JSON.stringify(manualOverrides[k] || null) !== JSON.stringify((coordEditBaseline || {})[k] || null)) set.add(k);
        });
        return set;
    }
    function setOrDel(map, k, v) { if(v === undefined || v === null) delete map[k]; else map[k] = JSON.parse(JSON.stringify(v)); }
    // Una casella cambiata da un altro coordinatore arriva subito; una casella che qui è ancora
    // da salvare resta com'è (e al salvataggio si scrive solo lei, senza toccare le altre).
    function mergeRemoteOverrides(remote, inScope) {
        const pend = pendingKeySet();
        const keys = new Set([...Object.keys(remote), ...Object.keys(coordEditBaseline || {}), ...Object.keys(manualOverrides)]);
        keys.forEach(k => {
            if(inScope && !inScope(k)) return;
            const r = remote[k];
            if(!pend.has(k)) setOrDel(manualOverrides, k, r);
            setOrDel(coordEditBaseline, k, r);
        });
    }
    let remoteRefreshTimer = null;
    function refreshAfterRemoteOverrides() {
        serviceSpanVer++;
        clearTimeout(remoteRefreshTimer);
        remoteRefreshTimer = setTimeout(() => {
            if(isViewingArchive()) return;
            applyManualOverrides();
            if(typeof finalData !== 'undefined' && finalData.length && document.querySelector('#table-body tr[data-row]')) renderTable();
            scheduleCheckSoon(); publishSaldiSoon();
            if(document.getElementById('hours-modal')?.classList.contains('open')) { if(document.getElementById('hc-detail-view').style.display === 'none') renderHoursGrid(); else renderHoursDetail(); }
            if(coordEditModeActive) updateCoordToolbarState();
            ccRefreshIfOpen();
        }, 220);
    }

    // ── Scrittura di una casella: valore completo (i campi assenti vengono cancellati) ──
    function cellWriteValue(v) {
        const del = firebase.firestore.FieldValue.delete();
        if(!v) return del;
        const has = v.customMinutes !== undefined && v.customMinutes !== null && v.customMinutes !== '';
        return { v: v.v || '', subV: v.subV || '', customMinutes: has ? v.customMinutes : del, perm: v.perm && v.perm.k && Number(v.perm.h) > 0 ? { k: v.perm.k, h: Number(v.perm.h) } : del,
                 coY: v.coY && String(v.subV || '').trim().toLowerCase() === 'f' ? +v.coY : del };   // anno a cui conta un C.O. di gennaio-marzo
    }
    function keyMonthIdx(key) {
        const i = key.indexOf('__'); if(i === -1) return -1;
        const ds = key.slice(i + 2).split('@')[0];
        return MONTH_MAP[ds.slice(0, ds.lastIndexOf('-'))] ?? -1;
    }
    function monthDocName(year, mIdx) { return `turni_${year}-${String(mIdx + 1).padStart(2, '0')}`; }
    // Aggiunge al batch le sole caselle cambiate (mai l'elenco intero).
    function addCellWrites(batch, changes) {
        const now = new Date().toISOString();
        if(dataSourceMode === 'firebase') {
            const byMonth = {};
            changes.forEach(c => {
                const m = keyMonthIdx(c.key); if(m < 0) return;
                const at = c.key.indexOf('@'), y = at >= 0 ? parseInt(c.key.slice(at + 1)) : activeYear, k = at >= 0 && y !== activeYear ? c.key.slice(0, at) : c.key;
                const g = byMonth[y + '-' + m] = byMonth[y + '-' + m] || { y, m, cells: {} }; g.cells[k] = cellWriteValue(c.next);
            });
            Object.values(byMonth).forEach(g => batch.set(cfgRef(monthDocName(g.y, g.m)), { cells: g.cells, updatedAt: now }, { merge:true }));
        } else {
            const cells = {}; changes.forEach(c => { cells[c.key] = cellWriteValue(c.next); });
            batch.set(cfgRef('settings'), { manualOverrides: cells }, { merge:true });
        }
    }
    function whoAmI() { return (userIdentity || coordinatorName || 'Coordinatore') + ' · ' + getDeviceLabel(); }
    function addLogWrite(batch, items, note) {
        const now = new Date(), id = now.getTime().toString(36) + Math.random().toString(36).slice(2, 6);
        const slim = v => (v === undefined ? null : v);
        batch.set(cfgRef('log_' + ymd(now)), { entries: { [id]: {
            t: now.toISOString(), who: whoAmI(), note: note || '', year: activeYear, mode: dataSourceMode,
            items: items.map(it => ({ k: it.k, key: it.key, prev: slim(it.prev), next: slim(it.next) }))
        } } }, { merge:true });
    }
    // Commit con attesa della conferma. Senza rete si risolve dopo 5 s come 'queued' (la scrittura
    // resta in coda); se più tardi arriva un errore o la conferma, lo gestiscono onLateFail/onLateOk.
    function commitWithConfirm(batch, onLateOk, onLateFail) {
        return new Promise(resolve => {
            let settled = false;
            batch.commit().then(() => { if(!settled) { settled = true; resolve('ok'); } else if(onLateOk) onLateOk(); })
                .catch(e => { console.error('Salvataggio non riuscito:', e); if(!settled) { settled = true; resolve({ error: e }); } else if(onLateFail) onLateFail(e); });
            setTimeout(() => { if(!settled) { settled = true; resolve('queued'); } }, 12000);   // connessione lenta: si aspetta fino a 12 s
        });
    }
    let saveInFlight = false;
    async function saveAllPendingChanges(quiet) {
        if(isViewingArchive()) { ccToast('Anno archiviato: sola lettura.', true); return false; }
        if(saveInFlight) { ccToast('Salvataggio già in corso…'); return false; }
        const changes = [...pendingKeySet()].map(k => ({ key: k, prev: (coordEditBaseline || {})[k] || null, next: manualOverrides[k] || null }));
        const rep = repBuildPayload();
        if(!changes.length && !rep) { ccToast('Non ci sono modifiche da salvare.'); return true; }
        if(!fbReady) { ccToast('Firebase non disponibile: le modifiche restano su questo dispositivo.', true); return false; }
        if(netBlockWrite('Senza rete i turni non si salvano: le modifiche restano qui, salvale appena torna la connessione.')) { draftSaveNow(); return false; }
        vibrate(); saveInFlight = true; ccToast('Salvataggio in corso…');
        const batch = db.batch();
        if(changes.length) addCellWrites(batch, changes);
        if(rep) batch.set(repDocRef(), rep.payload, { merge:true });
        addLogWrite(batch, changes.map(c => ({ k:'cell', key:c.key, prev:c.prev, next:c.next })).concat(rep ? rep.log : []));
        // se la conferma arriva tardi con un errore, le modifiche tornano "da salvare"
        const lateFail = e => {
            changes.forEach(c => { if(JSON.stringify(coordEditBaseline[c.key] || null) === JSON.stringify(c.next || null)) setOrDel(coordEditBaseline, c.key, c.prev); });
            if(rep) { Object.assign(repTurniEdits, rep.turni); Object.assign(repCessioniEdits, rep.ces); repInvalidate(); }
            updateCoordToolbarState(); ccUpdateNavCounts();
            ccToast('Il salvataggio in coda non è andato a buon fine: le modifiche sono di nuovo da salvare.', true);
        };
        const res = await commitWithConfirm(batch, () => { draftClear(); markLastSave(); ccToast('Salvato: la conferma è arrivata in ritardo, ora le modifiche sono visibili a tutti.'); }, lateFail);
        saveInFlight = false;
        if(res && res.error) {
            ccToast('Salvataggio NON riuscito (' + (res.error.code || 'errore') + '). Le modifiche sono ancora qui: riprova.', true);
            return false;
        }
        if(res === 'queued' && !fbPersistence) {
            ccToast('Nessuna connessione: il salvataggio partirà appena torna la rete. Non chiudere l’app fino ad allora.', true);
            return false;   // restano "da salvare": quando la scrittura arriva, lo conferma l'ascolto dei dati
        }
        changes.forEach(c => setOrDel(coordEditBaseline, c.key, c.next));
        if(rep) repMarkSaved(rep);
        coordUndoStack = []; coordRedoStack = [];
        if(res === 'ok') { draftClear(); markLastSave(); } else draftSaveNow();
        updateCoordToolbarState(); ccUpdateNavCounts(); ccRefreshIfOpen(); renderTableHead();
        if(res === 'queued') ccToast(navigator.onLine === false ? 'Senza rete: salvato sul dispositivo, verrà inviato appena torna la connessione.' : 'Connessione lenta: il salvataggio è partito e arriverà a breve (te lo confermo appena arriva).');
        else {
            const n = 0;   // il promemoria "riporta su Excel" non serve più
            ccToast(n ? `Salvato. Ricorda di riportare ${n} ${n===1?'modifica':'modifiche'} su Excel.` : 'Salvato: le modifiche sono visibili a tutti.');
        }
        logInvalidateToday(); maybeDailySnapshot(); publishSaldiSoon();
        return true;
    }
    function markLastSave() { try { localStorage.setItem('coord_last_save_' + DATA_NS, new Date().toISOString()); } catch(e) {} }

    // ── Bozza sul dispositivo: le modifiche non ancora salvate sopravvivono a chiusure e ricariche ──
    function draftKey() { return 'coord_draft_v1_' + DATA_NS + (dataSourceMode === 'firebase' ? activeYear : 'excel'); }
    let draftTimer = null;
    function draftSaveSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(draftSaveNow, 600); }
    function draftSaveNow() {
        try {
            const pend = [...pendingKeySet()];
            if(!pend.length && !repPendingCount()) { localStorage.removeItem(draftKey()); return; }
            const cells = {}; pend.forEach(k => { cells[k] = manualOverrides[k] || null; });
            localStorage.setItem(draftKey(), JSON.stringify({ ts: Date.now(), cells, turni: repTurniEdits, cessioni: repCessioniEdits }));
        } catch(e) {}
    }
    function draftClear() { try { localStorage.removeItem(draftKey()); } catch(e) {} }
    function draftRead() { try { return JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch(e) { return null; } }
    let draftOffered = false;
    async function draftOfferRestore() {
        if(draftOffered || pendingChangesCount()) return;
        const d = draftRead(); if(!d) return;
        const cells = d.cells || {}, n = Object.keys(cells).length + Object.keys(d.turni || {}).length + Object.keys(d.cessioni || {}).length;
        // tiene solo ciò che è ancora diverso da quanto salvato
        const diff = Object.keys(cells).filter(k => JSON.stringify(cells[k] || null) !== JSON.stringify((coordEditBaseline || {})[k] || null));
        if(!n || (!diff.length && !Object.keys(d.turni || {}).length && !Object.keys(d.cessioni || {}).length)) { draftClear(); return; }
        draftOffered = true;
        const when = new Date(d.ts).toLocaleString('it-IT', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        const choice = await ccDialog('Modifiche non salvate trovate', `Su questo dispositivo ci sono ${n} modifiche non salvate (${when}). Vuoi riprenderle? Potrai controllarle prima di salvarle.`, [
            { label:'Scarta', kind:'danger', value:'no' }, { label:'Riprendi', kind:'primary', value:'yes' }
        ]);
        if(choice === 'no') { draftClear(); return; }
        if(choice !== 'yes') return;
        diff.forEach(k => setOrDel(manualOverrides, k, cells[k]));
        Object.assign(repTurniEdits, d.turni || {}); Object.assign(repCessioniEdits, d.cessioni || {}); repInvalidate();
        afterCoordChange(); ccToast('Modifiche riprese: controllale e premi Salva.');
    }
    window.addEventListener('beforeunload', e => {
        if(typeof pendingChangesCount === 'function' && pendingChangesCount() > 0) { draftSaveNow(); e.preventDefault(); e.returnValue = ''; }
    });

    // ── Istantanee (copie complete salvate su Firebase) ─────────────────────
    let repRawCessioni = {};   // mappa "cessioni" così com'è su Firestore (per le istantanee)
    function buildSnapshotContent() {
        const content = {
            app:'turni-autisti', version:1, ns: DATA_NS, createdAt: new Date().toISOString(), createdBy: whoAmI(),
            mode: dataSourceMode, activeYear,
            settings: { operatorConfig, nameOverrides, coordinatorName: coordinatorName || null, excelSyncedMarks },
            reperibilita: { turni: repTurniSaved, cessioni: repRawCessioni }
        };
        const saved = JSON.parse(JSON.stringify(coordEditBaseline || {}));   // solo ciò che è confermato dal server
        if(dataSourceMode === 'firebase') {
            content.turni = {};
            content.turniNext = {};
            Object.keys(saved).forEach(k => {
                const m = keyMonthIdx(k); if(m < 0) return; const id = String(m + 1).padStart(2, '0'), at = k.indexOf('@');
                if(at >= 0) { const y = k.slice(at + 1); (content.turniNext[y + '-' + id] = content.turniNext[y + '-' + id] || {})[k.slice(0, at)] = saved[k]; }
                else (content.turni[id] = content.turni[id] || {})[k] = saved[k];
            });
        } else content.settings.manualOverrides = saved;
        return content;
    }
    async function takeSnapshot(kind, fixedId) {
        if(!fbReady || isViewingArchive()) return null;
        const now = new Date();
        const id = fixedId || (kind === 'daily' ? 'snap_' + ymd(now) : 'snap_' + ymd(now) + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + String(now.getSeconds()).padStart(2,'0'));
        const content = buildSnapshotContent(); content.kind = kind;
        const json = JSON.stringify(content);
        if(json.length > 950000) { console.warn('Istantanea troppo grande:', json.length); ccToast('Copia di sicurezza troppo grande per Firebase: scarica il backup completo da Dati e backup.', true); return null; }
        await cfgRef(id).set({ kind, createdAt: content.createdAt, size: json.length, data: json });
        // indice leggero: per elencare le copie non serve scaricarle tutte (ognuna pesa centinaia di KB)
        cfgRef('snapindex').set({ items: { [id]: { kind, createdAt: content.createdAt, size: json.length } } }, { merge:true }).catch(() => {});
        return id;
    }
    // Una copia al giorno (la prima volta che il coordinatore apre la console o salva) e pulizia
    // delle copie giornaliere più vecchie di 14 giorni.
    // Le copie automatiche si fanno solo quando sono arrivati dal server sia le impostazioni sia la
    // reperibilità (e, con i turni su Firebase, tutti i mesi): una copia a metà non deve mai finire tra le copie.
    let snapSettingsOk = false, snapRepOk = false;
    function snapDataReady() { return fbReady && appBooted && !SERVER_MODE && !isViewingArchive() && snapSettingsOk && snapRepOk && fbMonthsReady() && navigator.onLine !== false; }
    function weekStartYmd(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); }
    // Copia della settimana (una per settimana, dal lunedì), tenuta 12 settimane. La crea la prima
    // apertura dell'app della settimana, di chiunque: non serve che il coordinatore entri.
    function maybeWeeklySnapshot() {
        if(!snapDataReady()) return;
        const id = 'snap_w_' + weekStartYmd(new Date()), key = 'snap_done_' + DATA_NS + id;
        try { if(localStorage.getItem(key)) return; } catch(e) {}
        cfgRef(id).get().then(d => d.exists ? null : takeSnapshot('settimanale', id)).then(() => {
            try { localStorage.setItem(key, '1'); } catch(e) {}
            return cleanupWeeklySnapshots();
        }).catch(e => console.warn('Copia settimanale non riuscita:', e));
    }
    async function cleanupWeeklySnapshots() {
        const limit = new Date(); limit.setDate(limit.getDate() - 7 * 12); const cut = 'snap_w_' + weekStartYmd(limit);
        const list = await listSnapshots();
        for(const s of list.filter(s => /^snap_w_\d{4}-\d{2}-\d{2}$/.test(s.id) && s.id < cut)) {
            await cfgRef(s.id).delete().catch(() => {});
            await cfgRef('snapindex').update({ ['items.' + s.id]: firebase.firestore.FieldValue.delete() }).catch(() => {});
        }
    }
    // All'apertura dell'app (chiunque sia): copia del giorno e della settimana, quando i dati sono arrivati.
    function autoSnapshotsAtBoot() {
        if(SERVER_MODE) return;
        let tries = 0;
        const go = () => {
            if(snapDataReady()) { maybeDailySnapshot(); setTimeout(maybeWeeklySnapshot, 4000); return; }
            if(++tries < 12) setTimeout(go, 15000);   // dati non ancora arrivati: si riprova per qualche minuto
        };
        setTimeout(go, 20000);
    }
    function maybeDailySnapshot() {
        if(!snapDataReady()) return;
        const key = 'snap_done_' + DATA_NS + ymd(new Date());
        try { if(localStorage.getItem(key)) return; } catch(e) {}
        const id = 'snap_' + ymd(new Date());
        cfgRef(id).get().then(d => d.exists ? null : takeSnapshot('daily')).then(() => {
            try { localStorage.setItem(key, '1'); } catch(e) {}
            return cleanupDailySnapshots();
        }).catch(e => console.warn('Istantanea giornaliera non riuscita:', e));
    }
    // Toglie tutte le copie giornaliere più vecchie di 14 giorni (non solo quella di 15 giorni fa:
    // se il coordinatore non apre l'app per un po' le vecchie non restano per sempre).
    async function cleanupDailySnapshots() {
        const limit = new Date(); limit.setDate(limit.getDate() - 14); const cut = 'snap_' + ymd(limit);
        const list = await listSnapshots();
        const old = list.filter(s => s.kind === 'daily' && /^snap_\d{4}-\d{2}-\d{2}$/.test(s.id) && s.id < cut);
        for(const s of old) {
            await cfgRef(s.id).delete().catch(() => {});
            await cfgRef('snapindex').update({ ['items.' + s.id]: firebase.firestore.FieldValue.delete() }).catch(() => {});
        }
    }
    async function listSnapshots() {
        const out = [];
        try {   // prima l'indice (un solo documento piccolo)
            const ix = await cfgRef('snapindex').get();
            const items = ix.exists ? (ix.data().items || {}) : null;
            if(items && Object.keys(items).length) {
                Object.keys(items).forEach(id => out.push(Object.assign({ id }, items[id])));
                return out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            }
        } catch(e) {}
        try {
            const FP = firebase.firestore.FieldPath.documentId();
            const q = await db.collection('admin_config').where(FP, '>=', DATA_NS + 'snap_').where(FP, '<', DATA_NS + 'snap_').get();
            q.forEach(d => out.push({ id: d.id.slice(DATA_NS.length), kind: d.data().kind, createdAt: d.data().createdAt, size: d.data().size }));
        } catch(e) {
            // senza permesso di elencare: si provano le ultime 15 copie giornaliere
            for(let i = 0; i < 15; i++) { const dt = new Date(); dt.setDate(dt.getDate() - i); const id = 'snap_' + ymd(dt);
                try { const d = await cfgRef(id).get(); if(d.exists) out.push({ id, kind: d.data().kind, createdAt: d.data().createdAt, size: d.data().size }); } catch(err) {} }
        }
        // prima volta: si crea l'indice con le copie trovate
        if(out.length && fbReady) { const items = {}; out.forEach(s => items[s.id] = { kind: s.kind || '', createdAt: s.createdAt || '', size: s.size || 0 }); cfgRef('snapindex').set({ items }, { merge:true }).catch(() => {}); }
        return out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }
    // Ripristino: prima si salva una copia dello stato attuale, poi si riscrivono i dati.
    async function restoreFromContent(content, label) {
        if(!content || content.app !== 'turni-autisti') { ccToast('File non valido: non è un backup dei turni autisti.', true); return; }
        if(isViewingArchive()) { ccToast('Torna all’anno attivo prima di ripristinare.', true); return; }
        if(content.mode !== dataSourceMode || (content.mode === 'firebase' && +content.activeYear !== activeYear)) {
            ccToast(`Questa copia è di un’altra situazione (${content.mode === 'firebase' ? 'Firebase ' + content.activeYear : 'Excel'}): non la ripristino per non mescolare i dati.`, true); return;
        }
        const when = new Date(content.createdAt).toLocaleString('it-IT');
        const ok = await ccConfirm('Ripristinare questa copia?', `Turni e reperibilità tornano com’erano il ${when}. Tutto ciò che è stato salvato dopo verrà sostituito (prima faccio comunque una copia di adesso, recuperabile).`, 'Ripristina', 'solid-danger');
        if(!ok) return;
        try {
            ccToast('Copia di sicurezza di adesso…');
            await takeSnapshot('prima-del-ripristino');
            const batch = db.batch(), now = new Date().toISOString();
            if(content.mode === 'firebase') {
                for(let m = 0; m < 12; m++) { const id = String(m + 1).padStart(2, '0'); batch.set(cfgRef(monthDocName(activeYear, m)), { cells: (content.turni || {})[id] || {}, updatedAt: now, restoredFrom: content.createdAt }); }
                Object.keys(content.turniNext || {}).forEach(ym => { const [y, mm] = ym.split('-').map(Number); batch.set(cfgRef(monthDocName(y, mm - 1)), { cells: content.turniNext[ym], updatedAt: now, restoredFrom: content.createdAt }); });
            } else {
                batch.update(cfgRef('settings'), { manualOverrides: (content.settings || {}).manualOverrides || {}, excelSyncedMarks: (content.settings || {}).excelSyncedMarks || {} });
            }
            if(content.settings && content.settings.operatorConfig) batch.update(cfgRef('settings'), { operatorConfig: content.settings.operatorConfig, nameOverrides: content.settings.nameOverrides || {} });
            if(content.reperibilita) batch.set(repDocRef(), { turni: content.reperibilita.turni || {}, cessioni: content.reperibilita.cessioni || {}, updatedAt: now });
            addLogWrite(batch, [], 'Ripristino della copia del ' + when + (label ? ' (' + label + ')' : ''));
            await batch.commit();
            draftClear();
            ccToast('Ripristino completato: ricarico l’app…');
            setTimeout(() => location.reload(), 900);
        } catch(e) { console.error(e); ccToast('Ripristino non riuscito: ' + (e.code || e.message), true); }
    }
    async function restoreSnapshot(id) {
        try { const d = await cfgRef(id).get(); if(!d.exists) { ccToast('Copia non trovata.', true); return; } await restoreFromContent(JSON.parse(d.data().data), id); }
        catch(e) { ccToast('Copia non leggibile.', true); }
    }
    async function downloadSnapshot(id) {
        try { const d = await cfgRef(id).get(); if(!d.exists) return; downloadText(`turni-autisti-${id}.json`, d.data().data); } catch(e) { ccToast('Download non riuscito.', true); }
    }
    function downloadText(name, text) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type:'application/json' })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    // Backup completo da tenere sul computer: stato attuale + anni archiviati.
    async function downloadFullBackup() {
        try {
            ccToast('Preparo il backup…');
            const content = buildSnapshotContent(); content.kind = 'backup-manuale';
            content.archivio = {};
            for(const y of archivedYears) {
                const meta = await cfgRef('anno_' + y).get(); const turni = {};
                for(let m = 0; m < 12; m++) { const d = await cfgRef(monthDocName(y, m)).get(); if(d.exists) turni[String(m + 1).padStart(2, '0')] = d.data().cells || {}; }
                content.archivio[y] = { meta: meta.exists ? meta.data() : null, turni };
            }
            downloadText(`backup-turni-autisti-${ymd(new Date())}.json`, JSON.stringify(content, null, 1));
            try { localStorage.setItem('coord_last_backup_' + DATA_NS, new Date().toISOString()); } catch(e) {}
            ccToast('Backup scaricato: conservalo in un posto sicuro (es. Google Drive).');
            if(ccSection === 'dati') ccRefreshIfOpen();
        } catch(e) { console.error(e); ccToast('Backup non riuscito: ' + (e.code || e.message), true); }
    }
    function pickBackupFile() {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = () => { const f = inp.files[0]; if(!f) return; const r = new FileReader(); r.onload = () => { try { restoreFromContent(JSON.parse(r.result), f.name); } catch(e) { ccToast('File non leggibile.', true); } }; r.readAsText(f); };
        inp.click();
    }

    // ── Storico delle modifiche ─────────────────────────────────────────────
    let ccLogCache = [];
    const logDayCache = {};   // "AAAA-MM-GG" -> { at, list }: i giorni passati si leggono una volta sola
    async function loadRecentLogs(days) {
        const today = ymd(new Date()), jobs = [];
        for(let i = 0; i < days; i++) {
            const dt = new Date(); dt.setDate(dt.getDate() - i); const day = ymd(dt);
            const c = logDayCache[day];
            if(c && (day !== today || Date.now() - c.at < 30000)) { jobs.push(Promise.resolve(c.list)); continue; }
            jobs.push(cfgRef('log_' + day).get().then(d => {
                const list = d.exists ? Object.entries(d.data().entries || {}).map(([id, e]) => Object.assign({ id }, e)) : [];
                logDayCache[day] = { at: Date.now(), list }; return list;
            }).catch(() => []));
        }
        const out = [].concat(...(await Promise.all(jobs)));
        return out.sort((a, b) => (b.t || '').localeCompare(a.t || ''));
    }
    function logInvalidateToday() { delete logDayCache[ymd(new Date())]; }
    // Nota nello storico per i cambi che non sono caselle (operatori, regole, impostazioni)
    function logNote(note) {
        if(!fbReady || SERVER_MODE || !note) return;
        try { const b = db.batch(); addLogWrite(b, [], note); b.commit().then(logInvalidateToday).catch(() => {}); } catch(e) {}
    }

    // ── Sezione "Storico dei cambi" dell'Area Coordinatore ──────────────────
    let histDays = 7, histWho = '', histQuery = '';
    function histMatches(e) {
        if(histWho) {
            const d = drivers.find(x => x.originalName === histWho), nm = (d ? d.name : histWho).toUpperCase();
            const hit = (e.items || []).some(it => (it.k === 'cell' && it.key.startsWith(histWho + '__')) || describeLogItem(it).toUpperCase().includes(nm)) || (e.note || '').toUpperCase().includes(nm);
            if(!hit) return false;
        }
        if(histQuery) {
            const q = histQuery.toUpperCase();
            const txt = [e.who, e.note].concat((e.items || []).map(describeLogItem)).join(' ').toUpperCase();
            if(!txt.includes(q)) return false;
        }
        return true;
    }
    function histSet(k, v) { if(k === 'days') histDays = +v; else if(k === 'who') histWho = v; else histQuery = v; renderCcHistory(k === 'q'); }
    let histQueryTimer = null;
    function histQueryInput(v) { clearTimeout(histQueryTimer); histQueryTimer = setTimeout(() => histSet('q', v), 300); }
    async function renderCcHistory(keepForm) {
        const main = document.getElementById('cc-main');
        if(!keepForm || !document.getElementById('hist-list')) {
            const ops = drivers.filter(d => !d.removed).map(d => `<option value="${esc(d.originalName)}" ${histWho === d.originalName ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
            main.innerHTML = `
                <div class="cc-panel"><div class="cc-panel-body">
                    <div class="cc-inline-form hist-form">
                        <label class="cc-field">Periodo<select class="cc-input" onchange="histSet('days', this.value)">${[[7, 'Ultimi 7 giorni'], [30, 'Ultimi 30 giorni'], [90, 'Ultimi 3 mesi']].map(([v, l]) => `<option value="${v}" ${histDays === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                        <label class="cc-field">Autista<select class="cc-input" onchange="histSet('who', this.value)"><option value="">Tutti</option>${ops}</select></label>
                        <label class="cc-field hist-q">Cerca<input class="cc-input" type="search" placeholder="es. ferie, notte, MOSCA, 12/11" value="${esc(histQuery)}" oninput="histQueryInput(this.value)"></label>
                    </div>
                    <p class="cc-note" style="margin-top:10px">Ogni salvataggio resta qui con chi l’ha fatto e da quale dispositivo. “Annulla” rimette i valori di prima come modifiche da salvare: le controlli e premi Salva.</p>
                </div></div>
                <div class="cc-panel"><div class="cc-panel-body" id="hist-list"><p class="cc-note">Carico…</p></div></div>`;
        }
        const list = await loadRecentLogs(histDays);
        ccLogCache = list;
        const el = document.getElementById('hist-list'); if(!el || ccSection !== 'storico') return;
        const shown = list.map((e, i) => ({ e, i })).filter(x => histMatches(x.e));
        if(!shown.length) { el.innerHTML = `<p class="cc-note">${list.length ? 'Nessun cambio con questi filtri.' : 'Nessun cambio salvato in questo periodo.'}</p>`; return; }
        const dayLbl = iso => { const d = new Date(iso), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
            return ymd(d) === ymd(t) ? 'Oggi' : ymd(d) === ymd(y) ? 'Ieri' : d.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' }); };
        let html = '', lastDay = '';
        shown.slice(0, 300).forEach(({ e, i }) => {
            const day = dayLbl(e.t);
            if(day !== lastDay) { html += `${lastDay ? '</ul>' : ''}<div class="hist-day">${esc(day)}</div><ul class="cc-list dat-log">`; lastDay = day; }
            const [who, dev] = String(e.who || '').split(' \u00b7 ');
            const its = e.items || [];
            html += `<li><span class="hist-time">${esc(new Date(e.t).toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }))}</span><span class="cc-grow"><b style="font-weight:600">${esc(who || '')}</b>${dev ? ` <small style="display:inline">· ${esc(dev)}</small>` : ''}${e.note ? `<small>${esc(e.note)}</small>` : ''}${its.slice(0, 8).map(it => `<small>${esc(describeLogItem(it))}</small>`).join('')}${its.length > 8 ? `<small>… e altre ${its.length - 8}</small>` : ''}</span>${its.length ? `<button class="cc-btn sm" onclick="revertLogEntry(${i})"><span class="msym">undo</span>Annulla</button>` : ''}</li>`;
        });
        el.innerHTML = html + '</ul>' + (shown.length > 300 ? `<p class="cc-note">Mostrati i 300 cambi più recenti: restringi il periodo o cerca.</p>` : '');
    }
    // Storico della singola casella, nella finestra di modifica del coordinatore
    async function sepHistoryLoad(key) {
        const list = await loadRecentLogs(30);
        const el = document.getElementById('sep-hist'); if(!el || el.dataset.key !== key) return;
        const rows = [];
        list.forEach(e => (e.items || []).forEach(it => { if(it.k === 'cell' && it.key === key) rows.push({ e, it }); }));
        const val = v => v ? (describeOverrideValue(v) || '—') : 'come da Excel';
        el.innerHTML = rows.length ? rows.slice(0, 12).map(({ e, it }) => `<div class="sep-hist-row"><b>${esc(new Date(e.t).toLocaleString('it-IT', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }))}</b> · ${esc(String(e.who || '').split(' \u00b7 ')[0])}<br><span>${esc(val(it.prev))} → ${esc(val(it.next))}</span></div>`).join('')
            : `<small class="sep-hist-none">Nessun cambio salvato negli ultimi 30 giorni.</small>`;
    }
    function describeLogItem(it) {
        const val = v => v ? (v.v !== undefined ? (describeOverrideValue(v) || '—') : repDisplayName(v)) : '—';
        if(it.k === 'cell') {
            const i = it.key.indexOf('__'), who = i > 0 ? repDisplayName(it.key.slice(0, i)) : it.key;
            const ds = it.key.slice(i + 2).split('@')[0];
            return `${who} · ${ds.toLowerCase().replace('-', ' ')}: ${val(it.prev)} → ${val(it.next)}`;
        }
        if(it.k === 'rep') return `Reperibilità ${repDateLabel(it.key)}: ${val(it.prev)} → ${val(it.next)}`;
        const i = it.key.lastIndexOf('_');
        return `Fascia ${REP_SLOTS[+it.key.slice(i + 1)].label} del ${repDateLabel(it.key.slice(0, i))}: ${val(it.prev)} → ${val(it.next)}`;
    }
    // "Annulla" una modifica dello storico: rimette i valori di prima come modifiche da salvare.
    function revertLogEntry(idx) {
        const e = ccLogCache[idx]; if(!e) return;
        if(isViewingArchive() || (e.mode && e.mode !== dataSourceMode) || (e.mode === 'firebase' && e.year && +e.year !== activeYear)) { ccToast('Questa modifica riguarda un altro anno o un’altra origine dei turni.', true); return; }
        const entries = [];
        (e.items || []).forEach(it => {
            if(it.k === 'cell') { const prev = setOverride(it.key, it.prev || null); entries.push({ key: it.key, prev, next: it.prev || null }); }
            else if(it.k === 'rep' || it.k === 'repc') entries.push(repChange(it.k, it.key, it.prev || ''));
        });
        if(!entries.length) return;
        pushUndo({ entries });
        afterCoordChange(entries.filter(x => !x.kind).map(x => x.key), entries.filter(x => x.kind).flatMap(x => repDatesOfKey(x.kind, x.key)));
        ccToast(`${entries.length} ${entries.length === 1 ? 'valore riportato' : 'valori riportati'} a prima: controlla e premi Salva.`);
        ccGo('modifica');
    }

    // ── Turni solo su Firebase: calendario generato e un documento per mese ──
    // Mesi dell'anno dopo mostrati dopo dicembre (ferie dell'anno godute a gennaio, programmazione).
    const NEXT_YEAR_MONTHS = 12;   // tutto l'anno dopo, man mano si riempie
    const CO_CARRY_MONTHS = 3;     // le ferie (C.O.) messe entro marzo dell'anno dopo sono dell'anno in corso
    function buildBlankYearData(year, baseNames, extraMonths) {
        const header = ['MESE', 'GIORNO', 'NOME'].concat(baseNames);
        const rows = [header];
        const addMonth = (y, mn, mi) => { const days = new Date(y, mi + 1, 0).getDate(); for(let d = 1; d <= days; d++) { const row = [{ v: mn }, { v: d }, { v: '' }]; baseNames.forEach(() => row.push({ v: '', subV: '', supV: '' })); rows.push(row); } };
        Object.keys(MONTH_MAP).forEach((mn, mi) => addMonth(year, mn, mi));
        Object.keys(MONTH_MAP).slice(0, extraMonths || 0).forEach((mn, mi) => addMonth(year + 1, mn, mi));
        return rows;
    }
    let monthUnsubs = [];
    // Stato di ogni mese del calendario su Firebase: 'wait' finché non arriva, 'ok', 'err'.
    // Finché non sono arrivati tutti non si pubblicano i saldi e non si confrontano i turni
    // per le notifiche (un mese mancante sembrerebbe "turni rimossi").
    let fbMonthState = [];
    function fbMonthsReady() { return dataSourceMode !== 'firebase' || isViewingArchive() || (fbMonthState.length === 12 && fbMonthState.every(s => s === 'ok')); }
    let fbMonthsWarned = false;
    function fbMonthsWarn() {
        if(fbMonthsWarned || fbMonthsReady()) return; fbMonthsWarned = true;
        const bad = fbMonthState.map((s, i) => s === 'ok' ? null : MONTH_NAMES_IT[i]).filter(Boolean);
        ccToast(`Connessione lenta: ${bad.length === 12 ? 'i turni' : bad.join(', ')} ${bad.length === 1 ? 'arriva' : 'arrivano'} appena possibile`, true);
    }
    function fbMonthsAllLoaded() { fbMonthsWarned = false; publishSaldiSoon(); scheduleCheckSoon(); }
    function listenYearMonths(year, timeoutMs) {
        monthUnsubs.forEach(u => u()); monthUnsubs = [];
        fbMonthState = Array(12).fill('wait');
        return new Promise(resolve => {
            let pending = 12, done = false;
            const finish = () => { if(!done) { done = true; resolve(); } };
            for(let m = 0; m < 12; m++) {
                let first = true;
                monthUnsubs.push(cfgRef(monthDocName(year, m)).onSnapshot({ includeMetadataChanges: false }, doc => {
                    // senza rete e senza copia sul dispositivo Firestore risponde "documento inesistente":
                    // non è un mese vuoto, si aspetta il server
                    if(!doc.exists && doc.metadata.fromCache) return;
                    const cells = doc.exists ? (doc.data().cells || {}) : {};
                    mergeRemoteOverrides(cells, k => !k.includes('@') && keyMonthIdx(k) === m);   // i giorni "@anno dopo" li gestisce il loro lettore
                    if(first) {
                        first = false; fbMonthState[m] = 'ok';
                        if(--pending === 0) { finish(); if(appBooted) fbMonthsAllLoaded(); }
                        else if(done) refreshAfterRemoteOverrides();   // arrivato dopo l'avvio: si ridisegna subito
                    }
                    else refreshAfterRemoteOverrides();
                }, err => { console.error('Errore ascolto turni ' + monthDocName(year, m), err); fbMonthState[m] = 'err'; if(first) { first = false; if(--pending === 0) finish(); } fbMonthsWarn(); }));
            }
            // primi mesi dell'anno dopo: nel loro documento le chiavi sono senza anno, qui prendono "@anno"
            for(let m = 0; m < NEXT_YEAR_MONTHS; m++) {
                const y2 = year + 1, tag = '@' + y2;
                monthUnsubs.push(cfgRef(monthDocName(y2, m)).onSnapshot(doc => {
                    if(!doc.exists && doc.metadata.fromCache) return;
                    const src = doc.exists ? (doc.data().cells || {}) : {}, cells = {};
                    Object.keys(src).forEach(k => { cells[k.includes('@') ? k : k + tag] = src[k]; });
                    mergeRemoteOverrides(cells, k => k.endsWith(tag) && keyMonthIdx(k) === m);
                    refreshAfterRemoteOverrides();
                }, err => console.warn('Mese ' + monthDocName(y2, m) + ' non letto:', err)));
            }
            setTimeout(() => { finish(); if(pending > 0) fbMonthsWarn(); }, timeoutMs);
        });
    }
    async function bootFirebaseMode(splashMinTime) {
        bootMode = 'firebase';
        setShiftYear(activeYear);
        hoursWeekAnchor = new Date(SHIFT_YEAR, new Date().getMonth(), new Date().getDate());
        await listenYearMonths(activeYear, 5000);
        excelParsedData = buildBlankYearData(activeYear, operatorConfig.baseNames || [], NEXT_YEAR_MONTHS);
        rebuildDataFromExcel(); initApp(); updateYearUi();
        appBooted = true;
        await hideLoader(splashMinTime);
    }
    // Passaggio definitivo: i turni del calendario (Excel + modifiche) vengono copiati su Firebase,
    // un documento per mese; le reperibilità "/R" dell'Excel diventano reperibilità dell'app.
    async function ccMigrateToFirebase(skipConfirm) {
        if(dataSourceMode === 'firebase') return;
        if(netBlockWrite()) return;
        if(pendingChangesCount()) { ccToast('Prima salva o scarta le modifiche in sospeso.', true); return; }
        if(!excelParsedData.length || !finalData.length) { ccToast('Turni non ancora caricati: riprova tra poco.', true); return; }
        const year = SHIFT_YEAR;
        const ok = skipConfirm || await ccConfirm(`Passare definitivamente a Firebase?`,
            `I turni del ${year} visibili ora a calendario vengono copiati su Firebase, mese per mese. Da quel momento l’app non legge più turni.xlsx: ogni turno si assegna solo da qui. Prima faccio una copia di sicurezza. Fallo solo quando l’Excel caricato è quello giusto.`,
            'Copia e passa a Firebase', 'solid-danger');
        if(!ok) return;
        try {
            ccToast('Copia di sicurezza…');
            await takeSnapshot('prima-del-passaggio-a-firebase');
            const header = finalData[0], months = {}, nextMonths = {};
            let n = 0, nNext = 0;
            for(let r = 1; r < finalData.length; r++) {
                const ry = shiftRowYear(r);
                if(ry !== year && ry !== year + 1) continue;
                const mName = finalData[r][0].v, dNum = parseInt(finalData[r][1].v), mi = MONTH_MAP[mName];
                if(mi === undefined || isNaN(dNum)) continue;
                for(let i = 3; i < header.length; i++) {
                    const c = finalData[r][i] || {};
                    let v = (c.v || '').toString().trim(); if(isRepStr(v)) v = v.slice(0, v.indexOf('/')).trim();
                    const sv = (c.subV || '').toString().trim();
                    const hasMin = c.customMinutes !== undefined && c.customMinutes !== null && c.customMinutes !== '';
                    if(!v && !sv && !hasMin) continue;
                    const val = { v, subV: sv }; if(hasMin) val.customMinutes = c.customMinutes;
                    // i mesi dell'anno dopo (es. gennaio in fondo all'Excel) vanno già nel documento di quell'anno
                    if(ry === year) { (months[mi] = months[mi] || {})[overrideKey(header[i], mName, dNum)] = val; n++; }
                    else { (nextMonths[mi] = nextMonths[mi] || {})[overrideKey(header[i], mName, dNum)] = val; nNext++; }
                }
            }
            const excelTit = repExcelMap(), repTurni = {};
            Object.keys(excelTit).forEach(d => { if((d.startsWith(year + '-') || d.startsWith((year + 1) + '-')) && !repHas(repTurniSaved, d)) repTurni[d] = excelTit[d]; });
            const baseNames = (excelParsedData[0] || []).slice(3);
            const batch = db.batch(), now = new Date().toISOString();
            for(let m = 0; m < 12; m++) batch.set(cfgRef(monthDocName(year, m)), { cells: months[m] || {}, updatedAt: now, source: 'excel' });
            Object.keys(nextMonths).forEach(m => batch.set(cfgRef(monthDocName(year + 1, +m)), { cells: nextMonths[m], updatedAt: now, source: 'excel' }));
            if(Object.keys(repTurni).length) batch.set(repDocRef(), { turni: repTurni, cessioni: asExcelCessioni(repTurni), updatedAt: now }, { merge:true });
            batch.update(cfgRef('settings'), { dataSource: 'firebase', activeYear: year, archivedYears: [], operatorConfig: Object.assign({}, operatorConfig, { baseNames }), migratedAt: now });
            addLogWrite(batch, [], `Passaggio a Firebase: ${n} turni del ${year}${nNext ? ` e ${nNext} del ${year + 1}` : ''} copiati dal file Excel`);
            await batch.commit();
            sessionStorage.setItem('fb_mode_reloaded', '1');
            ccToast(`Fatto: ${n} turni copiati. Riapro l’app…`);
            setTimeout(() => location.reload(), 1200);
        } catch(e) { console.error('Migrazione non riuscita:', e); ccToast('Passaggio non riuscito: ' + (e.code || e.message) + '. Nulla è stato cambiato.', true); }
    }
    // Anno nuovo: l'anno attivo viene chiuso (sola lettura, con la sua squadra e le ore di contratto)
    // e si apre il successivo, vuoto, con la stessa squadra.
    async function ccStartNewYear(skipConfirm) {
        if(dataSourceMode !== 'firebase' || isViewingArchive()) return;
        if(netBlockWrite()) return;
        if(pendingChangesCount()) { ccToast('Prima salva o scarta le modifiche in sospeso.', true); return; }
        const next = activeYear + 1;
        const ok = skipConfirm || await ccConfirm(`Aprire il ${next}?`, `Il ${activeYear} viene chiuso: resta consultabile da tutti in sola lettura. Il ${next} parte con i turni già inseriti, la stessa squadra e le stesse ore di contratto; le ferie del ${activeYear} messe tra gennaio e marzo del ${next} diventano «ferie residue anno prima». Prima faccio una copia di sicurezza.`, `Apri il ${next}`, 'solid-danger');
        if(!ok) return;
        try {
            await takeSnapshot('prima-del-nuovo-anno');
            const header = (finalData[0] || []).slice(3);
            const newBase = header.filter(n => !operatorConfig.removed[n]);
            const batch = db.batch(), now = new Date().toISOString();
            batch.set(cfgRef('anno_' + activeYear), { year: activeYear, baseNames: header, contract: operatorConfig.contract || {}, allow: operatorConfig.allow || {}, removed: operatorConfig.removed || {}, nameOverrides, closedAt: now, closedBy: whoAmI() });
            batch.update(cfgRef('settings'), { activeYear: next, archivedYears: [...new Set(archivedYears.concat([activeYear]))], operatorConfig: Object.assign({}, operatorConfig, { baseNames: newBase, added: [], removed: {}, allow: {} }) });
            let conv = 0;
            for(let m = 0; m < CO_CARRY_MONTHS; m++) {
                const doc = await cfgRef(monthDocName(next, m)).get(); const cells = doc.exists ? (doc.data().cells || {}) : {}, upd = {};
                Object.keys(cells).forEach(k => { const c = cells[k] || {}; if(String(c.subV || '').trim().toLowerCase() === 'f' && +c.coY !== next && !/^r(iposo)?$/i.test(String(c.v || '').trim())) { upd[k] = Object.assign({}, c, { subV: 'v' }); conv++; } });
                if(Object.keys(upd).length) batch.set(cfgRef(monthDocName(next, m)), { cells: upd }, { merge:true });
            }
            addLogWrite(batch, [], `Chiuso il ${activeYear}, aperto il ${next}${conv ? ` (${conv} giorni di ferie del ${activeYear} diventati ferie residue)` : ''}`);
            await batch.commit();
            ccToast(`Fatto: da ora si lavora sul ${next}.`);
            setTimeout(() => location.reload(), 1000);
        } catch(e) { console.error(e); ccToast('Operazione non riuscita: ' + (e.code || e.message), true); }
    }
    // ── Capodanno: l'anno nuovo si apre da solo ──────────────────────────────
    // Al primo avvio dopo il 31 dicembre (o allo scoccare della mezzanotte con l'app aperta) l'anno
    // finito si chiude e resta consultabile in sola lettura da menu › Calendario › Anni passati.
    // Se l'app legge ancora turni.xlsx, prima i turni (anno finito e anno nuovo) vengono copiati su
    // Firebase, dove vivono gli anni archiviati; dopo il ricaricamento si chiude l'anno.
    let autoYearBusy = false, autoYearTimer = null;
    async function autoYearRollover() {
        if(SERVER_MODE || autoYearBusy || !fbReady || !appBooted || isViewingArchive()) return;   // il capodanno lo fanno solo le app vere, non il motore
        if(new Date().getFullYear() <= (dataSourceMode === 'firebase' ? activeYear : SHIFT_YEAR)) return;
        if(coordEditModeActive || pendingChangesCount() || !fbMonthsReady()) return;   // si riprova al prossimo controllo
        autoYearBusy = true;
        try {
            const doc = await cfgRef('settings').get(), st = doc.exists ? doc.data() : {};
            const fbMode = st.dataSource === 'firebase';
            // un altro dispositivo l'ha appena fatto: basta ricaricare
            if(fbMode !== (dataSourceMode === 'firebase') || (fbMode && +st.activeYear !== activeYear)) { location.reload(); return; }
            if(fbMode) await ccStartNewYear(true); else await ccMigrateToFirebase(true);
        } catch(e) { console.error('Cambio anno automatico non riuscito:', e); }
        finally { autoYearBusy = false; }
    }
    function startAutoYearWatch() {
        if(autoYearTimer) return;
        setTimeout(autoYearRollover, 8000);
        autoYearTimer = setInterval(autoYearRollover, 10 * 60000);
    }

    // ── Consultazione degli anni passati (per tutti, sola lettura) ──────────
    let ccArchiveBackup = null;
    function isViewingArchive() { return ccArchiveBackup !== null; }
    async function switchToYear(rawYear) {
        const year = parseInt(rawYear, 10);
        if(!year || year === activeYear) { returnToActiveYear(); return; }
        if(coordEditModeActive) { const ok = await exitCoordEdit(true); if(!ok) return; }
        try {
            const meta = await cfgRef('anno_' + year).get();
            if(!meta.exists) { alert(`Nessun dato salvato per il ${year}.`); return; }
            const m = meta.data(), cells = {}, tag = '@' + (year + 1);
            const docs = await Promise.all(Array.from({ length: 12 }, (_, mi) => cfgRef(monthDocName(year, mi)).get()));
            docs.forEach(d => { if(d.exists) Object.assign(cells, d.data().cells || {}); });
            // anche l'anno dopo, come nell'anno attivo: lì ci sono le ferie dell'anno godute dopo dicembre
            const nextDocs = await Promise.all(Array.from({ length: NEXT_YEAR_MONTHS }, (_, mi) => cfgRef(monthDocName(year + 1, mi)).get().catch(() => null)));
            nextDocs.forEach(d => { if(d && d.exists) { const src = d.data().cells || {}; Object.keys(src).forEach(k => { cells[k.includes('@') ? k : k + tag] = src[k]; }); } });
            if(!isViewingArchive()) ccArchiveBackup = { finalData, rawFinalData, drivers, operatorConfig, excelParsedData, SHIFT_YEAR, selectedDrivers };
            const baseNames = (m.baseNames || []).filter(n => !(m.removed || {})[n]);
            setShiftYear(year);
            excelParsedData = buildBlankYearData(year, baseNames, NEXT_YEAR_MONTHS);
            rawFinalData = JSON.parse(JSON.stringify(excelParsedData));
            finalData = JSON.parse(JSON.stringify(rawFinalData));
            const header = finalData[0];
            for(let r = 1; r < finalData.length; r++) {
                const mName = finalData[r][0].v, dNum = finalData[r][1].v;
                const ry = shiftRowYear(r);
                for(let i = 3; i < header.length; i++) { const ov = cells[overrideKey(header[i], mName, dNum, ry)]; if(ov) finalData[r][i] = normalizeWrittenAbsence(Object.assign({}, finalData[r][i], { v: ov.v || '', subV: ov.subV || '', customMinutes: ov.customMinutes, perm: ov.perm, coY: ov.coY })); }
            }
            drivers = baseNames.map((name, i) => ({ name: (m.nameOverrides || {})[name] || nameOverrides[name] || name, idx: i + 3, originalName: name, virtual:false, hidden:false }));
            operatorConfig = normalizeOperatorConfig({ contract: m.contract || {}, allow: m.allow || {}, baseNames });
            selectedDrivers = new Set();
            refreshAfterYearSwitch();
            setTimeout(scrollToToday, 300);
        } catch(e) { console.error(e); alert('Impossibile aprire il ' + year + ': ' + (e.code || e.message)); }
    }
    function returnToActiveYear() {
        if(!isViewingArchive()) return;
        const b = ccArchiveBackup; ccArchiveBackup = null;
        finalData = b.finalData; rawFinalData = b.rawFinalData; drivers = b.drivers; operatorConfig = b.operatorConfig;
        excelParsedData = b.excelParsedData; selectedDrivers = b.selectedDrivers; setShiftYear(b.SHIFT_YEAR);
        applyManualOverrides();
        refreshAfterYearSwitch();
        setTimeout(scrollToToday, 300);
    }
    function refreshAfterYearSwitch() {
        vibrate(); repInvalidate();
        hoursWeekAnchor = new Date(SHIFT_YEAR, new Date().getMonth(), new Date().getDate());
        if(finalData.length) renderTable();
        renderDriverFilterDropdown(); updateDriverFilterBadge();
        updateYearUi();
        const el = document.getElementById('coord-console');
        if(el && el.classList.contains('open')) { if(isViewingArchive() && ['modifica','operatori'].includes(ccSection)) ccGo('panoramica'); else ccRenderSection(); }
    }
    function updateYearUi() {
        const item = document.getElementById('menu-year-picker');
        if(item) item.style.display = (dataSourceMode === 'firebase' && archivedYears.length) ? '' : 'none';
        const banner = document.getElementById('year-banner');
        if(banner) {
            const on = isViewingArchive();
            banner.style.display = on ? 'flex' : 'none';
            if(on) document.getElementById('year-banner-text').textContent = `Stai guardando il ${SHIFT_YEAR} (sola lettura) · tocca per tornare al ${activeYear}`;
            document.documentElement.style.setProperty('--header-h', on ? 'calc(var(--header-base-h) + var(--safe-top) + 34px)' : 'calc(var(--header-base-h) + var(--safe-top))');
        }
        const ccb = document.getElementById('cc-archive-banner');
        if(ccb) {
            if(isViewingArchive()) { ccb.style.display = 'flex'; ccb.innerHTML = `<span class="msym">visibility</span><span>Stai guardando il ${SHIFT_YEAR}, in sola lettura.</span><button class="cc-btn sm" onclick="switchToYear(${activeYear})">Torna al ${activeYear}</button>`; }
            else { ccb.style.display = 'none'; ccb.innerHTML = ''; }
        }
        document.querySelectorAll('#cc-nav button[data-sec="modifica"], #cc-nav button[data-sec="operatori"]').forEach(b => b.style.display = isViewingArchive() ? 'none' : '');
        const rb = document.querySelector('#cc-nav button[data-sec="riportare"]'); if(rb) rb.style.display = dataSourceMode === 'firebase' ? 'none' : '';
    }
    async function openYearPicker() {
        const m = document.getElementById('menu-dropdown'); if(m && m.style.display === 'flex') toggleMenu();
        const shown = SHIFT_YEAR;
        const years = [activeYear].concat(archivedYears.filter(y => y !== activeYear).sort((a, b) => b - a));
        const choice = await ccDialog('Anni', 'Scegli l’anno da consultare. Gli anni passati sono in sola lettura.',
            years.map(y => ({ label: `${y}${y === activeYear ? ' · attuale' : ''}${y === shown ? ' ✓' : ''}`, kind: y === activeYear ? 'primary' : '', value: String(y) })).concat([{ label:'Chiudi', kind:'ghost', value:null }]));
        if(choice) switchToYear(choice);
    }

    // ── Sezione "Dati e backup" dell'Area Coordinatore ─────────────────────
    async function renderCcData() {
        const main = document.getElementById('cc-main');
        const fmt = iso => iso ? new Date(iso).toLocaleString('it-IT', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : 'mai';
        let lastSave = null, lastBackup = null; try { lastSave = localStorage.getItem('coord_last_save_' + DATA_NS); lastBackup = localStorage.getItem('coord_last_backup_' + DATA_NS); } catch(e) {}
        const draft = draftRead();
        const row = (ok, title, text) => `<li><span class="msym" style="color:var(${ok ? '--cc-pos' : '--cc-warn'})">${ok ? 'check_circle' : 'warning'}</span><span class="cc-grow"><b style="font-weight:600">${title}</b><small>${text}</small></span></li>`;
        const backupOld = !lastBackup || (Date.now() - new Date(lastBackup).getTime()) > 8 * 86400000;
        main.innerHTML = `
            <div class="cc-panel"><div class="cc-panel-head"><h3>Protezione dei dati</h3></div>
                <ul class="cc-list dat-status">
                    ${row(true, 'Salvataggio per singola casella', 'Ogni salvataggio scrive solo le caselle cambiate: due coordinatori non si cancellano più a vicenda.')}
                    ${row(fbPersistence, 'Memoria offline ' + (fbPersistence ? 'attiva' : 'non disponibile su questo browser'), fbPersistence ? 'Senza rete i salvataggi restano in coda sul dispositivo e partono appena torna la connessione.' : 'Senza rete non chiudere l’app finché il salvataggio non è confermato.')}
                    ${row(!draft, draft ? 'Bozza non salvata su questo dispositivo' : 'Nessuna bozza in sospeso', draft ? 'Ci sono modifiche non salvate: aprendo Modifica turni ti propongo di riprenderle.' : 'Le modifiche non salvate vengono conservate qui anche se l’app si chiude.')}
                    ${row(true, 'Ultimo salvataggio da questo dispositivo', fmt(lastSave))}
                    ${row(!backupOld, 'Ultimo backup scaricato', fmt(lastBackup) + (backupOld ? ' — scaricane uno almeno una volta a settimana' : ''))}
                </ul>
            </div>
            <div class="cc-panel"><div class="cc-panel-head"><h3>Backup</h3></div><div class="cc-panel-body">
                <p class="cc-note" style="margin-bottom:12px">L’app fa da sola una copia al giorno e una alla settimana, alla prima apertura di chiunque (le trovi qui sotto, con il pulsante Ripristina). Questo invece è un file con turni, reperibilità, operatori e anni archiviati. Tienilo su Google Drive: con quello si recupera tutto anche se Firebase venisse svuotato.</p>
                <div class="cc-inline-form">
                    <button class="cc-btn primary" onclick="downloadFullBackup()"><span class="msym">download</span>Scarica backup completo</button>
                    <button class="cc-btn" onclick="takeSnapshot('manuale').then(id => { if(id) { ccToast('Copia creata'); ccRefreshIfOpen(); } })"><span class="msym">save_as</span>Crea copia adesso</button>
                    <button class="cc-btn danger" onclick="pickBackupFile()"><span class="msym">upload</span>Ripristina da file…</button>
                </div>
            </div></div>
            <div class="cc-panel"><div class="cc-panel-head"><h3>Importa da Excel</h3></div><div class="cc-panel-body">
                <p class="cc-note" style="margin-bottom:12px">Il file principale porta anche le ore esatte di ferie, permessi e malattie (il turno che l’autista avrebbe fatto), così il conteggio orario è uguale a quello dell’Excel. Il file piccolo è quello che finora si caricava su GitHub per aggiornare l’app.</p>
                <div class="cc-inline-form">
                    <button class="cc-btn primary" onclick="importPickMain()"><span class="msym">upload_file</span>File principale (Autisti 2026.xlsm)</button>
                    <button class="cc-btn" onclick="importPickSmall()"><span class="msym">upload_file</span>File piccolo (turni.xlsx)</button>
                </div>
                ${absImportInfoHtml()}
            </div></div>
            <div class="cc-panel"><div class="cc-panel-head"><h3>Copie automatiche</h3><span class="cc-hint">una al giorno (ultime 14) e una a settimana (ultime 12)</span></div><div class="cc-panel-body" id="dat-snaps"><p class="cc-note">Carico…</p></div></div>
            <div class="cc-panel"><div class="cc-panel-head"><h3>Storico dei cambi</h3></div><div class="cc-panel-body"><p class="cc-note" style="margin-bottom:12px">Chi ha cambiato cosa e quando, fino a 3 mesi indietro, con la ricerca per autista e il pulsante Annulla.</p><button class="cc-btn" onclick="ccGo('storico')"><span class="msym">history</span>Apri lo storico dei cambi</button></div></div>
            <div class="cc-panel"><div class="cc-panel-head"><h3>Origine dei turni e anni</h3></div><div class="cc-panel-body">
                ${ccSourcePanelHtml()}
                ${dataSourceMode === 'firebase' ? `<div style="margin-top:14px"><div class="cc-inline-form">
                        ${archivedYears.length ? `<button class="cc-btn" onclick="openYearPicker()"><span class="msym">history</span>Consulta un anno passato</button>` : ''}
                        <button class="cc-btn danger" ${isViewingArchive() ? 'disabled' : ''} onclick="ccStartNewYear()"><span class="msym">event_upcoming</span>Chiudi il ${activeYear} e apri il ${activeYear + 1}</button>
                    </div></div>` : ''}
                <p class="cc-note" style="margin-top:12px">A capodanno l’anno nuovo si apre da solo, al primo avvio dell’app dopo il 31 dicembre: il ${dataSourceMode === 'firebase' ? activeYear : SHIFT_YEAR} si chiude e resta consultabile in sola lettura da menu › Calendario › Anni passati${dataSourceMode === 'firebase' ? '' : ' (prima i turni vengono copiati su Firebase, perché gli anni archiviati vivono lì)'}. Prima viene fatta una copia di sicurezza.</p>
            </div></div>`;
        maybeDailySnapshot();
        // copie e storico si caricano dopo, senza bloccare la pagina
        listSnapshots().then(list => {
            const el = document.getElementById('dat-snaps'); if(!el) return;
            el.innerHTML = list.length ? `<ul class="cc-list">${list.map(sn => `<li><span class="msym">backup</span><span class="cc-grow">${esc(fmt(sn.createdAt))}<small>${esc({ daily:'copia giornaliera', settimanale:'copia della settimana', manuale:'copia manuale' }[sn.kind] || (sn.kind || '').replace(/-/g, ' '))} · ${Math.round((sn.size || 0) / 1024)} KB</small></span><button class="cc-btn sm" onclick="downloadSnapshot('${sn.id}')" title="Scarica"><span class="msym">download</span></button><button class="cc-btn sm danger" onclick="restoreSnapshot('${sn.id}')"><span class="msym">restore</span>Ripristina</button></li>`).join('')}</ul>` : `<p class="cc-note">Ancora nessuna copia: la prima si crea oggi.</p>`;
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AREA COORDINATORE — console, operatori, conteggio ore, ruota strumenti
    // ═══════════════════════════════════════════════════════════════════════
    const COORD_SESSION_KEY = 'coord_session_v2';
    const WHEEL_POS_KEY = 'coord_wheel_pos_v1';
    const WHEEL_AUTOCLOSE_KEY = 'coord_wheel_autoclose';
    let ccSection = 'panoramica';
    let ccBoardOffset = 0;                       // giorni rispetto a oggi nel tabellone della panoramica
    let ccHoursPeriod = 'settimana', ccHoursAnchor = new Date(), ccHoursMonth = new Date().getMonth();
    let ccHoursSort = { key:'order', dir:1 }, ccHoursQuery = '';
    let ccOpRows = [];                           // originalName nell'ordine mostrato in "Operatori"
    let coordSwapMode = false, coordSwapFirst = null;
    let twExpanded = false, twPos = null, twHover = null;
    let ccDialogResolver = null, ccToastTimer = null;
    let ccSyncCache = [];                        // ultima lista mostrata in "Da riportare"

    const ABS_SHORT = { v:'FER', r:'REC', f:'CO', m:'MAL', p:'PER', c:'STU', pn:'PN', ng:'NG', nl:'NL', z:'SC', gr:'GR', e:'ASP', l:'LUT', s:'SPO', a:'MAT', k:'DIS', pl:'PL', ps:'PS' };
    const SHIFT_NAMES = { M:'Mattina', P:'Pomeriggio', N:'Notte', SM:'Smonto', R:'Riposo', m:'Mattina diurno', p:'Pomeriggio diurno', r:'Riposo diurno', 'M+N':'Mattina + notte' };
    const MONTH_NAMES_IT = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];

    function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
    function fmtHM(min, signed) {
        const neg = min < 0; const m = Math.round(Math.abs(min));
        const s = Math.floor(m/60) + ':' + String(m%60).padStart(2,'0');
        if(neg && m > 0) return '\u2212' + s;
        return (signed && m > 0 ? '+' : '') + s;
    }
    function coordToken(s) { let h = 5381; for(let i=0;i<s.length;i++) h = ((h<<5) + h + s.charCodeAt(i)) >>> 0; return 'c' + h.toString(36); }
    // L'accesso coordinatore vale solo finché l'app resta aperta (sessionStorage):
    // chiudendo e riaprendo l'app serve di nuovo la password.
    try { localStorage.removeItem(COORD_SESSION_KEY); } catch(e) {}   // vecchio accesso "permanente"
    function coordSessionSet(on) {
        try { if(on) sessionStorage.setItem(COORD_SESSION_KEY, coordToken('coord-ok-v2')); else sessionStorage.removeItem(COORD_SESSION_KEY); } catch(e) {}
        updateCoordExitBtn();
        if(opNotesVer) notesAfterChange();   // le note degli operatori si vedono solo da coordinatore
    }
    function isCoordLoggedIn() { try { return sessionStorage.getItem(COORD_SESSION_KEY) === coordToken('coord-ok-v2'); } catch(e) { return false; } }
    function updateCoordExitBtn() { document.body.classList.toggle('coord-session', isCoordLoggedIn()); }
    document.addEventListener('DOMContentLoaded', updateCoordExitBtn);
    // Pulsante rosso nella barra: esce subito (chiedendo prima delle modifiche non salvate).
    // Pulsante "Modifica turni" nella barra: apre subito il calendario in modifica
    function coordEditFromHeader() {
        vibrate();
        if(!isCoordLoggedIn() || coordEditModeActive) { openCoordConsole('modifica'); return; }
        enterCoordEdit();
    }
    async function coordExitFromHeader() {
        vibrate();
        if(coordEditModeActive) { if(!(await exitCoordEdit(true))) return; }
        coordSessionSet(false);
        const cc = document.getElementById('coord-console');
        if(cc && cc.classList.contains('open')) closeCoordConsole();
        showConsoleLogin();
        ccToast('Sei uscito dall’area coordinatore');
    }

    // ── Salvataggio su Firestore: update sostituisce la mappa intera (così le chiavi
    // cancellate spariscono davvero); se il documento non esiste ripiega su set/merge.
    function saveSettingsFields(obj) {
        if(!fbReady) return Promise.resolve();
        const ref = cfgRef('settings');
        return ref.update(obj).catch(() => ref.set(obj, { merge:true }));
    }

    // ── Operatori: configurazione condivisa (ordine, nascosti, rimossi, aggiunti, ore) ──
    function normalizeOperatorConfig(c) {
        c = c || {};
        return {
            order: Array.isArray(c.order) ? c.order.slice() : [],
            hidden: (c.hidden && typeof c.hidden === 'object') ? Object.assign({}, c.hidden) : {},
            removed: (c.removed && typeof c.removed === 'object') ? Object.assign({}, c.removed) : {},
            added: Array.isArray(c.added) ? c.added.filter(o => o && o.name).map(o => Object.assign({}, o)) : [],
            contract: (c.contract && typeof c.contract === 'object') ? Object.assign({}, c.contract) : {},
            allow: (c.allow && typeof c.allow === 'object') ? JSON.parse(JSON.stringify(c.allow)) : {},
            baseNames: Array.isArray(c.baseNames) ? c.baseNames.slice() : []
        };
    }
    function injectVirtualOperators(data) {
        const header = data[0]; if(!header) return data;
        (operatorConfig.added || []).forEach(op => {
            const nm = (op.name || '').toString().trim().toUpperCase();
            if(!nm || header.includes(nm)) return;
            header.push(nm);
            for(let r=1; r<data.length; r++) data[r].push({ v:"", subV:"", supV:"" });
        });
        // colonna dell'operatore di prova TEST (sempre in fondo, non sta nelle impostazioni condivise)
        if(!header.includes(TEST_OP)) { header.push(TEST_OP); for(let r=1; r<data.length; r++) data[r].push({ v:"", subV:"", supV:"" }); }
        return data;
    }
    function rebuildDataFromExcel() {
        if(!excelParsedData.length) return;
        rawFinalData = injectVirtualOperators(JSON.parse(JSON.stringify(excelParsedData)));
        applyManualOverrides();
    }
    function isVirtualOperator(orig) {
        const excelHeader = excelParsedData[0] || [];
        return !excelHeader.includes(orig) && (operatorConfig.added || []).some(o => (o.name||'').toUpperCase() === orig);
    }
    function isHiddenNow(orig) {
        const h = operatorConfig.hidden[orig]; if(!h) return false;
        if(h.until && ymd(new Date()) > h.until) return false;
        return true;
    }
    function rebuildDrivers() {
        const header = finalData[0]; if(!header) return;
        const order = operatorConfig.order || [];
        const list = [];
        for(let i=3; i<header.length; i++) {
            const orig = header[i];
            if(operatorConfig.removed[orig]) continue;
            // TEST: "nascosto" per tutti i conteggi (che guardano solo i visibili), la colonna si vede solo con testColVisible()
            if(orig === TEST_OP) { list.push({ name: TEST_OP, idx:i, originalName:TEST_OP, virtual:true, hidden:true, test:true }); continue; }
            list.push({ name: nameOverrides[orig] || orig, idx:i, originalName:orig, virtual:isVirtualOperator(orig), hidden:isHiddenNow(orig) });
        }
        const pos = d => { const k = order.indexOf(d.originalName); return k === -1 ? 10000 + d.idx : k; };
        list.sort((a,b) => pos(a) - pos(b));
        drivers = list;
        selectedDrivers = new Set([...selectedDrivers].filter(i => drivers.some(d => d.idx === i && !d.hidden)));
    }
    function getContractHours(idx) {
        const d = getDriverByIdx(idx);
        const orig = d ? (d.originalName || d.name) : null;
        const v = orig ? Number(operatorConfig.contract[orig]) : NaN;
        return (v > 0 && v <= 60) ? v : 36;
    }
    function refreshAfterOperatorChange() {
        rebuildDrivers();
        if(finalData.length) renderTable();
        renderDriverFilterDropdown(); updateDriverFilterBadge(); initNotificationOptions();
        ccRefreshIfOpen();
    }
    function saveOperatorConfig(msg) {
        return saveSettingsFields({ operatorConfig })
            .then(() => { if(msg) { ccToast(msg); logNote('Operatori: ' + msg); } })
            .catch(e => { console.error('Errore salvataggio operatori:', e); ccToast('Salvataggio non riuscito: controlla la connessione.', true); });
    }

    // ── Console: apertura, accesso unico, navigazione ───────────────────────
    function openCoordLoginModal() {
        const menu = document.getElementById('menu-dropdown');
        if(menu && menu.style.display === 'flex') {
            toggleMenu();
            // chiudendo il menu l'app consuma la sua voce di cronologia (history.back, asincrono):
            // apriamo la console solo dopo, altrimenti quel "indietro" la richiuderebbe subito.
            if(modalHistoryPushed) {
                let done = false;
                const go = () => { if(done) return; done = true; window.removeEventListener('popstate', go); setTimeout(() => openCoordConsole(), 0); };
                window.addEventListener('popstate', go); setTimeout(go, 400);
                return;
            }
        }
        openCoordConsole();
    }
    function openCoordConsole(section) {
        const el = document.getElementById('coord-console');
        el.style.display = 'block';
        cancelAnimationFrame(el._openRaf || 0);
        el._openRaf = requestAnimationFrame(() => { el._openRaf = 0; el.classList.add('open'); });
        document.body.classList.add('cc-lock');
        if(isCoordLoggedIn()) { showConsoleApp(section || ccSection); maybeDailySnapshot(); }
        else showConsoleLogin();
        setCurrentView('Area Coordinatore');
    }
    function closeCoordConsole() {
        const el = document.getElementById('coord-console');
        cancelAnimationFrame(el._openRaf || 0); el._openRaf = 0;
        el.classList.remove('open');
        document.body.classList.remove('cc-lock');
        setTimeout(() => { if(!el.classList.contains('open')) el.style.display = 'none'; }, 170);
        if(coordEditModeActive) twPlace();
    }
    function showConsoleLogin() {
        document.getElementById('cc-app').classList.remove('show');
        document.getElementById('cc-login').classList.add('show');
        document.getElementById('cc-pw').value = '';
        document.getElementById('cc-pw-error').textContent = '';
        setTimeout(() => document.getElementById('cc-pw').focus(), 60);
    }
    function showConsoleApp(section) {
        // "Importa da Excel" serve solo quando i turni vivono su Firebase: col file Excel la voce resta nascosta
        try { const ib = document.querySelector('#cc-app [data-sec="importa"]'); if(ib) ib.style.display = dataSourceMode === 'firebase' ? '' : 'none'; } catch(e) {}
        document.getElementById('cc-login').classList.remove('show');
        document.getElementById('cc-app').classList.add('show');
        ccGo(section || 'panoramica');
        setTimeout(chkMaybeAuto, 600);   // se nei turni c'è qualcosa che non torna, la finestra si apre da sola (una volta per sessione)
    }
    async function coordLogin(e) {
        if(e) e.preventDefault();
        const val = document.getElementById('cc-pw').value;
        if(await pwMatch(val.trim(), COORD_PW_H) || await pwMatch(val.trim().toLowerCase(), COORD_PW_H)) {
            coordSessionSet(true);
            vibrate(); showConsoleApp(ccPendingSection || 'panoramica'); ccPendingSection = null;
        } else {
            document.getElementById('cc-pw-error').textContent = 'Password non corretta.';
            document.getElementById('cc-pw').select();
        }
    }
    // compatibilità con eventuali richiami del vecchio popup
    function checkCoordPassword() { coordLogin(); }
    async function coordLogout() {
        const ok = await ccConfirm('Uscire dall\u2019area coordinatore?', 'Per rientrare servirà di nuovo la password.', 'Esci', 'solid-danger');
        if(!ok) return;
        if(coordEditModeActive) { if(!(await exitCoordEdit(true))) return; }
        coordSessionSet(false);
        showConsoleLogin();
    }
    const CC_SECTIONS = {
        panoramica:   { title:'Panoramica', sub:'Chi è in turno, ore da tenere d\u2019occhio e cose da fare.' },
        modifica:     { title:'Modifica turni', sub:'Modifica il calendario con la ruota strumenti.' },
        bozza:        { title:'Bozza del mese', sub:'Prepara in automatico i turni di un mese seguendo la rotazione, da rivedere prima di salvare.' },
        importa:      { title:'Importa da Excel', sub:'Porta nell’app i turni aggiornati dal file Excel, controllando prima cosa cambia.' },
        operatori:    { title:'Operatori', sub:'Aggiungi, rimuovi, riordina le colonne o nascondi temporaneamente un operatore.' },
        ore:          { title:'Conteggio ore', sub:'Ore lavorate rispetto al contratto (5 giorni, 36 h), per settimana, mese e anno.' },
        note:         { title:'Note', sub:'Note degli operatori per te (richieste e preferenze per un giorno) e note che mandi tu a un collega o a tutti.' },
        messaggi:     { title:'Messaggi all’apertura', sub:'Messaggi che tutti vedono quando aprono l’app, per i giorni scelti e per i secondi che decidi.' },
        coppie:       { title:'Chi lavora con chi', sub:'Quanti turni ognuno ha fatto insieme a ogni collega, per distribuire le coppie in modo equo.' },
        reperibilita: { title:'Report reperibilità', sub:'Ore di reperibilità di ogni operatore, giorno per giorno, per l’ufficio personale.' },
        ferie:        { title:'Regole ferie e permessi', sub:'Quante persone in ferie insieme, assenze incompatibili e periodi bloccati: gli operatori vedono i periodi consigliati.' },
        riportare:    { title:'Da riportare su Excel', sub:'Modifiche fatte nell\u2019app che vanno inserite anche nel file turni.xlsx.' },
        storico:      { title:'Storico dei cambi', sub:'Chi ha cambiato cosa e quando: turni, reperibilità e impostazioni, con la possibilità di annullare.' },
        dati:         { title:'Dati e backup', sub:'Protezione dei turni: backup, copie automatiche, anni e origine dei dati.' },
        impostazioni: { title:'Impostazioni', sub:'Coordinatore designato, consigli sulle ore, ruota e sessione.' }
    };
    function ccGo(section) {
        if(!CC_SECTIONS[section]) section = 'panoramica';
        if(section !== 'messaggi') cmDraft = null;
        if(section === 'riportare' && dataSourceMode === 'firebase') section = 'panoramica';
        if(['modifica','operatori'].includes(section) && isViewingArchive()) section = 'panoramica';
        if(section !== 'ferie') frDraft = null;
        ccSection = section;
        document.querySelectorAll('#cc-nav button').forEach(b => b.classList.toggle('active', b.dataset.sec === section));
        document.getElementById('cc-title').textContent = CC_SECTIONS[section].title;
        document.getElementById('cc-sub').textContent = CC_SECTIONS[section].sub;
        document.getElementById('cc-top-actions').innerHTML = '';
        const main = document.getElementById('cc-main');
        main.scrollTop = 0;
        ccRenderSection();
    }
    function ccRenderSection() {
        const main = document.getElementById('cc-main'); if(!main) return;
        if(!finalData.length) { main.innerHTML = `<div class="cc-empty"><span class="msym">hourglass_top</span>Sto caricando il file dei turni…</div>`; return; }
        ({ panoramica:renderCcOverview, modifica:renderCcEdit, bozza:renderCcDraft, importa:renderCcImport, operatori:renderCcOperators, ore:renderCcHours, reperibilita:renderCcReperibilita, coppie:renderCcPairs, note:renderCcNotes, messaggi:renderCcMessages, ferie:renderCcFerie, riportare:renderCcSync, storico:renderCcHistory, dati:renderCcData, impostazioni:renderCcSettings })[ccSection]();
        ccUpdateNavCounts();
    }
    function ccRefreshIfOpen() {
        ccUpdateNavCounts();
        const el = document.getElementById('coord-console');
        if(!el || !el.classList.contains('open') || !document.getElementById('cc-app').classList.contains('show')) return;
        const a = document.activeElement;
        if(a && a.closest && a.closest('#cc-main') && ['INPUT','SELECT','TEXTAREA'].includes(a.tagName)) return; // non disturbare chi sta scrivendo
        ccRenderSection();
    }
    let chkCountTimer = null;
    function ccUpdateNavCounts() {
        updateYearUi();
        const s = document.getElementById('cc-count-sync'); if(s) { const n = 0; s.textContent = n ? n : ''; }
        const p = document.getElementById('cc-count-pending'); if(p) { const n = pendingChangesCount(); p.textContent = n ? n : ''; }
        if(document.getElementById('cc-count-chk')) { clearTimeout(chkCountTimer); chkCountTimer = setTimeout(() => { const run = () => { const k = document.getElementById('cc-count-chk'); if(!k) return; const n = isViewingArchive() ? 0 : chkOpenCount(); k.textContent = n ? n : ''; }; window.requestIdleCallback ? requestIdleCallback(run, { timeout: 2000 }) : run(); }, 300); }
    }

    // ── Dialoghi e avvisi ────────────────────────────────────────────────────
    function ccDialog(title, text, actions) {
        return new Promise(resolve => {
            if(ccDialogResolver) ccDialogResolver(null);
            ccDialogResolver = resolve;
            document.getElementById('cc-dialog-title').textContent = title;
            document.getElementById('cc-dialog-text').textContent = text || '';
            const box = document.getElementById('cc-dialog-actions'); box.innerHTML = '';
            actions.forEach(a => {
                const b = document.createElement('button');
                b.className = 'cc-btn ' + (a.kind || '');
                b.textContent = a.label;
                b.onclick = () => ccDialogResolve(a.value);
                box.appendChild(b);
            });
            const m = document.getElementById('cc-dialog'); m.style.display = 'flex';
            requestAnimationFrame(() => m.classList.add('open'));
            setTimeout(() => { const last = box.lastElementChild; if(last) last.focus(); }, 30);
        });
    }
    function ccDialogResolve(v) {
        const m = document.getElementById('cc-dialog'); m.classList.remove('open');
        setTimeout(() => { if(!m.classList.contains('open')) m.style.display = 'none'; }, 150);
        const r = ccDialogResolver; ccDialogResolver = null; if(r) r(v);
    }
    function closeCcDialog() { ccDialogResolve(null); }
    function ccConfirm(title, text, okLabel, kind) {
        return ccDialog(title, text, [{ label:'Annulla', kind:'ghost', value:false }, { label: okLabel || 'Conferma', kind: kind || 'primary', value:true }]);
    }
    function ccToast(msg, isErr) {
        const t = document.getElementById('cc-toast'); if(!t) return;
        t.innerHTML = `<span class="msym">${isErr ? 'error' : 'check_circle'}</span><span>${esc(msg)}</span>`;
        t.classList.toggle('err', !!isErr); t.classList.add('show');
        clearTimeout(ccToastTimer); ccToastTimer = setTimeout(() => t.classList.remove('show'), isErr ? 4200 : 2600);
    }

    // ── Modalità offline: senza rete l'app mostra l'ultimo calendario scaricato, in sola lettura ──
    // La pagina, le librerie e l'Excel li tiene il service worker (sw.js); turni e impostazioni
    // li tiene Firestore sul dispositivo. Quando torna la rete Firestore si riallinea da solo.
    // Senza rete i salvataggi dei turni non partono (niente scritture in coda): restano "da salvare".
    const NET_SYNC_KEY = 'net_last_sync_' + DATA_NS;
    let netWasOffline = navigator.onLine === false;
    function netIsOffline() { return navigator.onLine === false; }
    function netMarkSync() { try { localStorage.setItem(NET_SYNC_KEY, String(Date.now())); } catch(e) {} }
    function netLastSyncText() {
        let t = 0; try { t = +localStorage.getItem(NET_SYNC_KEY) || 0; } catch(e) {}
        if(!t) return '';
        const d = new Date(t), day = d.toDateString() === new Date().toDateString() ? 'oggi' : d.toLocaleDateString('it-IT', { day:'numeric', month:'short' });
        return day + ' alle ' + d.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
    }
    function netUpdateBadge() {
        const b = document.getElementById('net-offline'); if(!b) return;
        const off = netIsOffline();
        if(off) { const t = netLastSyncText(); b.querySelector('.net-txt').textContent = 'Senza rete · ' + (t ? 'turni aggiornati ' + t : 'ultimo calendario scaricato'); }
        b.classList.toggle('show', off);
    }
    function netOfflineInfo() {
        ccToast('Senza rete vedi l’ultimo calendario scaricato. Si aggiorna da solo appena torna la connessione. Per salvare le modifiche serve la rete.');
        clearTimeout(ccToastTimer); ccToastTimer = setTimeout(() => { const t = document.getElementById('cc-toast'); if(t) t.classList.remove('show'); }, 6500);
    }
    // prima di un salvataggio: senza rete si ferma qui (true) e lo dice
    function netBlockWrite(msg) {
        if(!netIsOffline()) return false;
        ccToast(msg || 'Senza rete non si può salvare: riprova appena torna la connessione.', true);
        return true;
    }
    window.addEventListener('offline', () => { netWasOffline = true; netUpdateBadge(); });
    window.addEventListener('online', () => { netUpdateBadge(); if(netWasOffline) { netWasOffline = false; ccToast('Rete tornata: il calendario si aggiorna da solo.'); } });
    // Firestore dice se i dati arrivano dal server o dalla copia sul dispositivo: si annota l'ora dell'ultimo allineamento
    function netWatchSync() {
        if(!fbReady || SERVER_MODE) return;
        let iv = null;
        cfgRef('settings').onSnapshot({ includeMetadataChanges: true }, doc => {
            if(doc.metadata.fromCache) { clearInterval(iv); iv = null; return; }
            netMarkSync(); if(!iv) iv = setInterval(() => { if(!netIsOffline()) netMarkSync(); }, 60000);
        }, () => {});
    }

    // ── Colori e sigle dei codici turno (riusano le variabili CSS del calendario) ──
    function codeColors(kind, code) {
        if(kind === 'abs') return SUB_CODE_COLORS[code] || null;
        if(code === 'M+N') return MAIN_CODE_COLORS.N;
        if(code === 'S') return MAIN_CODE_COLORS.SM;
        return MAIN_CODE_COLORS[code] || DIURNI_CODE_COLORS[code] || MAIN_CODE_COLORS[(code||'').toUpperCase()] || null;
    }
    function ccCodeMeta(info) {
        const c = info.code || '';
        if(!c) return { short:'', kind:'empty' };
        if(info.custom && customCodes[c]) return { short: c, kind: customCodes[c].kind === 'abs' ? 'abs' : 'shift', colors: customColors(c), label: (customCodes[c].label || c).replace(/\|/g, ' ') };
        if(SPECIAL_SUBCODES[c] !== undefined && info.justified && !info.pnTail) return { short: ABS_SHORT[c] || c.toUpperCase(), kind:'abs', colors: codeColors('abs', c), label: SPECIAL_SUBCODES[c] + (info.manual ? ' \u00b7 ore a mano' : '') };
        if(info.unrecognized) return { short: c, kind:'unk', label:'Codice non riconosciuto' };
        if(c === 'STR') return { short:'ORE', kind:'str', label:'Ore a mano' };
        const isRest = (c === 'R' || c === 'r');
        return { short: c, kind: isRest ? 'rest' : 'shift', colors: codeColors('shift', c), label: info.label };
    }
    function codeChip(meta) {
        if(!meta.short) return `<span class="cc-code muted">\u2014</span>`;
        if(meta.kind === 'unk') return `<span class="cc-code warn" title="${esc(meta.label)}">${esc(meta.short)}</span>`;
        const st = meta.colors ? `--sw:var(${meta.colors.bg});--sf:var(${meta.colors.fg});` : '';
        return `<span class="cc-code" style="${st}" title="${esc(meta.label||'')}">${esc(meta.short)}</span>`;
    }

    // ═══ PANORAMICA ═══════════════════════════════════════════════════════
    function ccBoardShift(delta) { ccBoardOffset = delta === 0 ? 0 : ccBoardOffset + delta; renderCcOverview(); }
    function renderCcOverview() {
        const main = document.getElementById('cc-main');
        const target = new Date(); target.setHours(0,0,0,0); target.setDate(target.getDate() + ccBoardOffset);
        const days = buildDaysIndex();
        const dd = days.find(x => x.date.getTime() === target.getTime());
        const dateTxt = target.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' });
        const rel = ccBoardOffset === 0 ? 'Oggi' : ccBoardOffset === 1 ? 'Domani' : ccBoardOffset === -1 ? 'Ieri' : (ccBoardOffset > 0 ? `Tra ${ccBoardOffset} giorni` : `${-ccBoardOffset} giorni fa`);
        let boardHtml;
        if(!dd) {
            boardHtml = `<div class="cc-panel"><div class="cc-empty"><span class="msym">event_busy</span>Nessun turno nel file per questa data.</div></div>`;
        } else {
            const groups = { M:[], P:[], N:[] }; const absent = [], smonto = [], rest = [];
            drivers.forEach(d => {
                if(d.hidden) return;
                const info = computeDayInfo(dd.rowIdx, d.idx); const meta = ccCodeMeta(info); const c = info.code;
                if(meta.kind === 'abs') { absent.push(`${esc(d.name)} <span class="cc-tag">${esc(meta.label)}</span>`); return; }
                if(c === 'M+N') { groups.M.push({ n:d.name, t:'+ notte' }); groups.N.push({ n:d.name, t:'dopo la mattina' }); return; }
                if(c === 'M') groups.M.push({ n:d.name, t:'' });
                else if(c === 'm') groups.M.push({ n:d.name, t:'diurno' });
                else if(c === 'P') groups.P.push({ n:d.name, t:'' });
                else if(c === 'p') groups.P.push({ n:d.name, t:'diurno' });
                else if(c === 'N') groups.N.push({ n:d.name, t:'' });
                else if(c === 'SM' || c === 'S') smonto.push(esc(d.name));
                else if(c === 'R' || c === 'r') rest.push(esc(d.name));
            });
            const col = (key, title, time) => {
                const list = groups[key];
                const colors = MAIN_CODE_COLORS[key];
                const items = list.length ? list.map(x => `<li>${esc(x.n)}${x.t ? `<small>${esc(x.t)}</small>` : ''}</li>`).join('') : `<li class="cc-empty-li">Nessuno</li>`;
                return `<div class="cc-board-col"><div class="cc-board-col-head" style="--sw:var(${colors.bg})"><b>${title}</b><span class="cc-num">${esc(time||'')}</span><em>${list.length}</em></div><ul class="cc-board-list">${items}</ul></div>`;
            };
            const foot = [];
            if(absent.length) foot.push(`<span>Assenti: ${absent.join(', ')}</span>`);
            if(smonto.length) foot.push(`<span>Smonto: <b>${smonto.join(', ')}</b></span>`);
            if(rest.length) foot.push(`<span>Riposo: ${rest.join(', ')}</span>`);
            boardHtml = `<div class="cc-board">${col('M','Mattina',SCHEDULE.M)}${col('P','Pomeriggio',SCHEDULE.P)}${col('N','Notte',SCHEDULE.N)}${foot.length ? `<div class="cc-board-foot">${foot.join('')}</div>` : ''}</div>`;
        }

        // ore da tenere d'occhio
        const bal = drivers.filter(d => !d.hidden).map(d => ({ d, b: computeDriverBalance(d.idx) }));
        const debt = bal.filter(x => x.b <= -AI_THRESHOLD_LOW).sort((a,b) => a.b - b.b).slice(0,5);
        const cred = bal.filter(x => x.b >= AI_THRESHOLD_HIGH).sort((a,b) => b.b - a.b).slice(0,5);
        const balRow = x => `<li><span class="cc-grow">${esc(x.d.name)}<small>${getContractHours(x.d.idx)} h a settimana</small></span><span class="cc-num ${x.b<0?'cc-neg':'cc-pos'}">${fmtHM(x.b,true)}</span></li>`;
        let hoursList = '';
        if(!debt.length && !cred.length) hoursList = `<div class="cc-empty"><span class="msym">balance</span>Nessuno oltre le soglie: tutti entro \u22122 h e +4 h.</div>`;
        else hoursList = `<ul class="cc-list">${debt.map(balRow).join('')}${cred.map(balRow).join('')}</ul>`;

        // cose da fare
        const pending = pendingChangesCount(), toSync = 0;
        const hiddenOps = drivers.filter(d => d.hidden && !d.test);
        const todo = [];
        if(pending) todo.push(`<li><span class="msym" style="color:var(--cc-warn)">edit_note</span><span class="cc-grow">${pending} ${pending===1?'modifica non salvata':'modifiche non salvate'}<small>Visibili solo su questo dispositivo finché non salvi.</small></span><button class="cc-btn sm primary" onclick="coordConfirmChanges()">Salva</button></li>`);
        if(toSync && dataSourceMode !== 'firebase') todo.push(`<li><span class="msym" style="color:var(--cc-accent)">task_alt</span><span class="cc-grow">${toSync} ${toSync===1?'modifica da riportare':'modifiche da riportare'} su Excel</span><button class="cc-link" onclick="ccGo('riportare')">Apri elenco</button></li>`);
        hiddenOps.forEach(d => {
            const h = operatorConfig.hidden[d.originalName] || {};
            const until = h.until ? `fino al ${new Date(h.until+'T00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long'})}` : 'senza scadenza';
            todo.push(`<li><span class="msym" style="color:var(--cc-muted)">visibility_off</span><span class="cc-grow">${esc(d.name)} è nascosto<small>${until}</small></span><button class="cc-link" onclick="ccGo('operatori')">Gestisci</button></li>`);
        });
        const todoHtml = todo.length ? `<ul class="cc-list">${todo.join('')}</ul>` : `<div class="cc-empty"><span class="msym">done_all</span>Niente in sospeso.</div>`;

        main.innerHTML = `
            <div class="cc-board-head">
                <div class="cc-board-date">${rel}<small>${esc(dateTxt)}</small></div>
                <button class="cc-icon-btn" onclick="ccBoardShift(-1)" title="Giorno precedente" aria-label="Giorno precedente"><span class="msym">chevron_left</span></button>
                <button class="cc-btn sm" onclick="ccBoardShift(0)" ${ccBoardOffset===0?'disabled':''}>Oggi</button>
                <button class="cc-icon-btn" onclick="ccBoardShift(1)" title="Giorno successivo" aria-label="Giorno successivo"><span class="msym">chevron_right</span></button>
            </div>
            ${boardHtml}
            ${renderChecksPanel()}
            <div class="cc-grid-2">
                <div class="cc-panel"><div class="cc-panel-head"><h3>Saldo ore da tenere d\u2019occhio</h3><button class="cc-link" onclick="ccGo('ore')">Conteggio completo</button></div>${hoursList}</div>
                <div class="cc-panel"><div class="cc-panel-head"><h3>In sospeso</h3></div>${todoHtml}</div>
            </div>`;
        document.getElementById('cc-top-actions').innerHTML = `<button class="cc-btn primary" onclick="enterCoordEdit()"><span class="msym">edit_calendar</span>Modifica turni</button>`;
    }

    // ═══ MODIFICA TURNI (sezione della console) ═══════════════════════════
    function renderCcEdit() {
        const main = document.getElementById('cc-main');
        const pending = pendingChangesCount();
        const autoClose = localStorage.getItem(WHEEL_AUTOCLOSE_KEY) !== '0';
        main.innerHTML = `
            <div class="cc-panel"><div class="cc-panel-body">
                <div class="cc-edit-intro">
                    <div class="cc-wheel-preview" id="cc-wheel-preview"></div>
                    <div>
                        <ol>
                            <li><b>Frecce sopra la ruota</b>: cambiano la ruota tra <b>Turni</b> (turni e assenze), <b>Sequenze</b> (+5, +10, +15, turno 5 settimane (7 cicli P\u00b7M\u00b7N\u00b7SM\u00b7R) e +7 per i diurni) e <b>Reperibilit\u00e0</b> (aggiungi, sposta, fasce e cessioni, elimina). P, M e G cambiano la dimensione.</li>
                            <li><b>Anello esterno</b>: scegli un turno, una sequenza o uno strumento di reperibilit\u00e0, poi tocca le celle del calendario (i turni si possono anche trascinare).</li>
                            <li><b>Anello interno</b>: Seleziona (apre l\u2019editor della cella; su computer puoi anche trascinare per scambiare o estendere), Scambia (tocca due celle), Gomma, Annulla, Ripeti, Salva, Scarta, Esci.</li>
                            <li><b>Centro</b>: toccalo per chiudere o riaprire la ruota, trascinalo per spostarla dove non ti copre il calendario.</li>
                        </ol>
                        <p class="cc-note" style="margin-bottom:16px">Le modifiche restano su questo dispositivo finché non premi Salva: da quel momento le vedono tutti.</p>
                        <div class="cc-inline-form">
                            <button class="cc-btn primary" onclick="enterCoordEdit()"><span class="msym">edit_calendar</span>${coordEditModeActive ? 'Torna al calendario in modifica' : 'Apri il calendario in modifica'}</button>
                        </div>
                    </div>
                </div>
            </div></div>
            <div class="cc-panel">
                <div class="cc-panel-head"><h3>Modifiche non salvate</h3><span class="cc-hint cc-num">${pending}</span></div>
                <div class="cc-panel-body cc-inline-form">
                    ${pending ? `<button class="cc-btn primary" onclick="coordConfirmChanges()"><span class="msym">save</span>Salva ${pending} ${pending===1?'modifica':'modifiche'}</button><button class="cc-btn danger" onclick="coordResetChanges()"><span class="msym">restart_alt</span>Scarta</button>` : `<p class="cc-note">Nessuna modifica in attesa di salvataggio.</p>`}
                </div>
            </div>
            <div class="cc-panel">
                <div class="cc-setting"><div><b>Chiudi la ruota dopo aver scelto un turno</b><small>La ruota si riduce a un pulsante e il calendario resta libero. Toccalo per riaprirla.</small></div>
                    <label class="cc-switch"><input type="checkbox" ${autoClose?'checked':''} onchange="localStorage.setItem('${WHEEL_AUTOCLOSE_KEY}', this.checked?'1':'0')"><span></span></label></div>
                <div class="cc-setting"><div><b>Dimensione della ruota</b><small>G \u00e8 quella classica. Su telefono la ruota si riduce da sola per stare nello schermo.</small></div>
                    <div class="cc-seg" role="group" aria-label="Dimensione della ruota">${['P','M','G'].map(k => `<button class="${twPrefSize()===k?'active':''}" onclick="twSetSize('${k}');renderCcEdit()">${{P:'Piccola',M:'Media',G:'Grande'}[k]}</button>`).join('')}</div></div>
                <div class="cc-setting"><div><b>Posizione della ruota</b><small>Se l\u2019hai spostata in un punto scomodo, riportala in basso a destra.</small></div>
                    <button class="cc-btn sm" onclick="twResetPosition()">Ripristina</button></div>
            </div>`;
        const prev = document.getElementById('cc-wheel-preview');
        if(prev) prev.innerHTML = buildWheelMarkup(260, true);
    }

    // ═══ OPERATORI ════════════════════════════════════════════════════════
    function renderCcOperators() {
        const main = document.getElementById('cc-main');
        const header = (finalData[0] || []).slice(3);
        const ccOps = drivers.filter(d => !d.test);
        ccOpRows = ccOps.map(d => d.originalName);
        const rows = ccOps.map((d, i) => {
            const orig = d.originalName;
            const hEntry = operatorConfig.hidden[orig];
            const meta = [];
            if(d.virtual) meta.push(`<span class="cc-tag accent">aggiunto</span>`);
            if(d.name !== orig) meta.push(`<span>nome originale: ${esc(orig)}</span>`);
            if(operatorConfig.contract[orig]) meta.push(`<span class="cc-tag">contratto ${getContractHours(d.idx)} h</span>`);
            const al = absAllowFor(d), alCustom = Object.keys(ABS_ALLOW).some(k => al[k] !== ABS_ALLOW[k]);
            if(alCustom) meta.push(`<span class="cc-tag accent">spettanze ridotte</span>`);
            const ov = absOverList(d); if(ov.length) meta.push(`<span class="cc-tag danger" title="Ha già in calendario più di quanto gli spetta nel ${SHIFT_YEAR}">oltre: ${esc(ov.join(', '))}</span>`);
            const alHtml = [['co', 'C.O.', 'Giorni di congedo ordinario'], ['sp', 'P', 'Permessi straordinari'], ['pn', 'PN', 'Permessi notte']].map(([k, l, t]) =>
                `<label title="${t} di ${esc(d.name)} nel ${SHIFT_YEAR} (di norma ${ABS_ALLOW[k]})"><span>${l}</span><input type="number" class="cc-input${al[k] !== ABS_ALLOW[k] ? ' changed' : ''}" min="0" max="99" step="1" value="${al[k]}" onchange="ccOpSetAllow(${i},'${k}',this.value)" aria-label="${t} di ${esc(d.name)}"></label>`).join('');
            const visHtml = d.hidden
                ? `<label class="cc-switch" title="Mostra di nuovo"><input type="checkbox" onchange="ccOpSetVisible(${i},this.checked)"><span></span></label><span>Nascosto</span>
                   <label class="cc-until">fino al <input type="date" class="cc-input" value="${esc(hEntry && hEntry.until || '')}" min="${ymd(new Date())}" onchange="ccOpSetUntil(${i},this.value)"></label>`
                : `<label class="cc-switch" title="Nascondi temporaneamente"><input type="checkbox" checked onchange="ccOpSetVisible(${i},this.checked)"><span></span></label><span>Visibile</span>`;
            return `<div class="cc-op-row ${d.hidden?'is-hidden':''}" data-orig="${esc(orig)}">
                <button class="cc-op-grip" title="Trascina per spostare la colonna" aria-label="Sposta ${esc(d.name)}" onpointerdown="ccOpDragStart(event)"><span class="msym">drag_indicator</span></button>
                <span class="cc-op-pos">${i+1}</span>
                <div class="cc-op-name" id="cc-op-name-${i}"><b>${esc(d.name)}</b><small>${meta.join('')}</small></div>
                <label class="cc-op-hours"><input type="number" class="cc-input" min="1" max="60" step="0.5" value="${getContractHours(d.idx)}" onchange="ccOpSetContract(${i},this.value)" aria-label="Ore settimanali di ${esc(d.name)}"><span>h/sett.</span></label>
                <div class="cc-op-allow">${alHtml}</div>
                <div class="cc-op-vis">${visHtml}</div>
                <div class="cc-op-actions">
                    <button class="cc-icon-btn" title="Sposta prima" aria-label="Sposta prima" onclick="ccOpMove(${i},-1)" ${i===0?'disabled':''}><span class="msym">arrow_upward</span></button>
                    <button class="cc-icon-btn" title="Sposta dopo" aria-label="Sposta dopo" onclick="ccOpMove(${i},1)" ${i===drivers.length-1?'disabled':''}><span class="msym">arrow_downward</span></button>
                    <button class="cc-icon-btn" title="Rinomina" aria-label="Rinomina" onclick="ccOpRename(${i})"><span class="msym">edit</span></button>
                    <button class="cc-icon-btn danger" title="${d.virtual?'Elimina':'Rimuovi dal calendario'}" aria-label="Rimuovi" onclick="ccOpRemove(${i})"><span class="msym">person_remove</span></button>
                </div>
            </div>`;
        }).join('');
        const removed = header.filter(o => operatorConfig.removed[o]);
        const overAll = drivers.filter(d => !d.hidden).map(d => ({ d, ov: absOverList(d) })).filter(x => x.ov.length);
        const overHtml = overAll.length ? `<div class="cc-check warn" style="margin-bottom:12px"><span class="msym">warning</span><div><b>Già oltre le spettanze del ${SHIFT_YEAR}:</b> ${overAll.map(x => `${esc(x.d.name)} (${esc(x.ov.join(', '))})`).join(' · ')}. Da sistemare in calendario: finché sono oltre non si possono aggiungere altri giorni dello stesso tipo.</div></div>` : '';
        const removedHtml = removed.length ? `
            <div class="cc-panel" style="margin-top:18px"><div class="cc-panel-head"><h3>Rimossi dal calendario</h3><span class="cc-hint">Restano nel file Excel: puoi ripristinarli quando vuoi.</span></div>
                <ul class="cc-list">${removed.map(o => `<li><span class="cc-grow">${esc(nameOverrides[o] || o)}</span><button class="cc-btn sm" onclick="ccOpRestore('${encodeURIComponent(o)}')"><span class="msym">undo</span>Ripristina</button></li>`).join('')}</ul></div>` : '';
        main.innerHTML = `
            <div class="cc-panel">
                <div class="cc-panel-head"><h3>Aggiungi operatore</h3><span class="cc-hint">Crea una colonna vuota: i turni li inserisci da Modifica turni.</span></div>
                <form class="cc-panel-body cc-add-form" onsubmit="ccOpAdd(event)" autocomplete="off">
                    <label class="cc-field">Cognome e nome<input class="cc-input" id="cc-op-new-name" maxlength="40" placeholder="Es. ROSSI MARIA"></label>
                    <label class="cc-field">Ore a settimana<input class="cc-input cc-num" id="cc-op-new-hours" type="number" min="1" max="60" step="0.5" value="36"></label>
                    <button class="cc-btn primary" type="submit"><span class="msym">person_add</span>Aggiungi</button>
                </form>
            </div>
            ${overHtml}
            <div class="cc-op-list" id="cc-op-list">
                <div class="cc-op-head"><span></span><span>#</span><span>Operatore</span><span>Contratto</span><span title="Giorni che spettano nel ${SHIFT_YEAR}: congedo ordinario, permessi straordinari, permessi notte">Spettanze ${SHIFT_YEAR}</span><span>Nel calendario</span><span style="text-align:right">Azioni</span></div>
                ${rows || `<div class="cc-empty">Nessun operatore.</div>`}
            </div>
            <p class="cc-note" style="margin-top:10px">L\u2019ordine qui è l\u2019ordine delle colonne nel calendario, per tutti. Ogni modifica viene salvata subito. Spettanze: giorni di congedo ordinario (C.O.), permessi straordinari (P) e permessi notte (PN) del ${SHIFT_YEAR}; di norma ${ABS_ALLOW.co}, ${ABS_ALLOW.sp} e ${ABS_ALLOW.pn}, meno per chi è assunto in corso d\u2019anno. In Modifica turni non si possono inserire oltre questi numeri. A capodanno tornano quelle normali.</p>
            ${removedHtml}`;
        document.getElementById('cc-top-actions').innerHTML = `<span class="cc-tag cc-num">${drivers.filter(d=>!d.hidden).length} visibili \u00b7 ${drivers.filter(d=>d.hidden).length} nascosti</span>`;
    }
    function ccOpCommitOrder(arr, msg) {
        const rest = (operatorConfig.order || []).filter(o => !arr.includes(o));
        operatorConfig.order = arr.concat(rest);
        saveOperatorConfig(msg);
        refreshAfterOperatorChange();
        if(ccSection === 'operatori') renderCcOperators();
    }
    function ccOpMove(i, delta) {
        const j = i + delta; if(j < 0 || j >= ccOpRows.length) return;
        const arr = ccOpRows.slice(); [arr[i], arr[j]] = [arr[j], arr[i]];
        vibrate(); ccOpCommitOrder(arr, 'Ordine delle colonne aggiornato');
    }
    function ccOpDragStart(e) {
        const row = e.target.closest('.cc-op-row'); const list = document.getElementById('cc-op-list');
        if(!row || !list) return;
        e.preventDefault();
        row.classList.add('dragging');
        let lastY = e.clientY; const startY = e.clientY; let moved = false;
        const onMove = ev => {
            const y = ev.clientY; lastY = y;
            if(Math.abs(y - startY) > 3) moved = true;
            const prev = row.previousElementSibling, next = row.nextElementSibling;
            if(next && next.classList.contains('cc-op-row')) {
                const r = next.getBoundingClientRect();
                if(y > r.top + r.height/2) { list.insertBefore(next, row); return; }
            }
            if(prev && prev.classList.contains('cc-op-row')) {
                const r = prev.getBoundingClientRect();
                if(y < r.top + r.height/2) { list.insertBefore(row, prev); }
            }
            // scorrimento automatico vicino ai bordi del contenitore
            const main = document.getElementById('cc-main'); const mr = main.getBoundingClientRect();
            if(y < mr.top + 40) main.scrollTop -= 12; else if(y > mr.bottom - 40) main.scrollTop += 12;
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
            row.classList.remove('dragging');
            const arr = Array.from(list.querySelectorAll('.cc-op-row')).map(r => r.dataset.orig);
            if(moved && arr.join('\u0001') !== ccOpRows.join('\u0001')) { vibrate(); ccOpCommitOrder(arr, 'Ordine delle colonne aggiornato'); }
        };
        window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
    }
    function ccOpSetVisible(i, visible) {
        const orig = ccOpRows[i]; if(!orig) return;
        if(visible) delete operatorConfig.hidden[orig];
        else operatorConfig.hidden[orig] = { until:null, since: ymd(new Date()) };
        const d = drivers.find(x => x.originalName === orig);
        saveOperatorConfig(visible ? `${d ? d.name : orig} di nuovo visibile` : `${d ? d.name : orig} nascosto dal calendario`);
        refreshAfterOperatorChange(); if(ccSection === 'operatori') renderCcOperators();
    }
    function ccOpSetUntil(i, value) {
        const orig = ccOpRows[i]; if(!orig || !operatorConfig.hidden[orig]) return;
        operatorConfig.hidden[orig].until = value || null;
        saveOperatorConfig(value ? 'Tornerà visibile dal giorno dopo la data scelta' : 'Nascosto senza scadenza');
        refreshAfterOperatorChange();
    }
    function ccOpSetContract(i, value) {
        const orig = ccOpRows[i]; if(!orig) return;
        const v = parseFloat(String(value).replace(',','.'));
        if(!(v > 0 && v <= 60)) { ccToast('Inserisci un numero di ore tra 1 e 60.', true); renderCcOperators(); return; }
        if(v === 36) delete operatorConfig.contract[orig]; else operatorConfig.contract[orig] = v;
        saveOperatorConfig('Ore di contratto aggiornate');
        refreshAfterOperatorChange();
    }
    function ccOpSetAllow(i, k, value) {
        const orig = ccOpRows[i]; if(!orig || ABS_ALLOW[k] === undefined) return;
        const v = String(value).trim() === '' ? ABS_ALLOW[k] : Number(String(value).replace(',', '.'));
        if(!(Number.isInteger(v) && v >= 0 && v <= 99)) { ccToast('Scrivi un numero intero di giorni (da 0 a 99).', true); renderCcOperators(); return; }
        const cur = Object.assign({}, (operatorConfig.allow || {})[orig] || {});
        if(v === ABS_ALLOW[k]) delete cur[k]; else cur[k] = v;
        operatorConfig.allow = Object.assign({}, operatorConfig.allow || {});
        if(Object.keys(cur).length) operatorConfig.allow[orig] = cur; else delete operatorConfig.allow[orig];
        const d = drivers.find(x => x.originalName === orig);
        saveOperatorConfig(`Spettanze di ${d ? d.name : orig} aggiornate`);
        refreshAfterOperatorChange(); publishSaldiSoon();
        if(ccSection === 'operatori') renderCcOperators();
    }
    function ccOpRename(i) {
        const orig = ccOpRows[i]; const box = document.getElementById('cc-op-name-' + i); if(!orig || !box) return;
        const cur = nameOverrides[orig] || orig;
        box.innerHTML = `<input class="cc-input" maxlength="40" value="${esc(cur)}" aria-label="Nuovo nome"><small>Invio per salvare, Esc per annullare. Vuoto = nome del file Excel.</small>`;
        const inp = box.querySelector('input'); inp.focus(); inp.select();
        let done = false;
        const finish = save => {
            if(done) return; done = true;
            if(save) {
                const nm = inp.value.trim().toUpperCase().replace(/\s+/g,' ');
                if(!nm || nm === orig) delete nameOverrides[orig]; else nameOverrides[orig] = nm;
                saveSettingsFields({ nameOverrides }).then(() => { ccToast('Nome aggiornato'); logNote('Operatori: nome mostrato cambiato'); }).catch(() => ccToast('Salvataggio non riuscito.', true));
                applyNameOverrides(); refreshAfterOperatorChange();
            }
            renderCcOperators();
        };
        inp.addEventListener('keydown', ev => { if(ev.key === 'Enter') { ev.preventDefault(); finish(true); } else if(ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); } });
        inp.addEventListener('blur', () => finish(true));
    }
    async function ccOpRemove(i) {
        const orig = ccOpRows[i]; if(!orig) return;
        const d = drivers.find(x => x.originalName === orig); const name = d ? d.name : orig;
        if(d && d.virtual) {
            const ok = await ccConfirm(`Eliminare ${name}?`, 'La colonna sparisce dal calendario per tutti. I turni già salvati per questo operatore restano archiviati ma non saranno più visibili.', 'Elimina', 'solid-danger');
            if(!ok) return;
            operatorConfig.added = operatorConfig.added.filter(o => (o.name||'').toUpperCase() !== orig);
            delete operatorConfig.contract[orig]; delete operatorConfig.hidden[orig]; if(operatorConfig.allow) delete operatorConfig.allow[orig];
            operatorConfig.order = operatorConfig.order.filter(o => o !== orig);
            rebuildDataFromExcel();
        } else {
            const ok = await ccConfirm(`Rimuovere ${name} dal calendario?`, 'La colonna non sarà più mostrata a nessuno. Il file Excel non viene toccato e potrai ripristinarlo dalla lista in fondo a questa pagina.', 'Rimuovi', 'solid-danger');
            if(!ok) return;
            operatorConfig.removed[orig] = true;
        }
        saveOperatorConfig(`${name} rimosso`);
        refreshAfterOperatorChange(); renderCcOperators();
    }
    function ccOpRestore(encOrig) {
        const orig = decodeURIComponent(encOrig);
        delete operatorConfig.removed[orig];
        saveOperatorConfig(`${nameOverrides[orig] || orig} ripristinato`);
        refreshAfterOperatorChange(); renderCcOperators();
    }
    function ccOpAdd(e) {
        e.preventDefault();
        const nm = document.getElementById('cc-op-new-name').value.trim().toUpperCase().replace(/\s+/g,' ');
        const hrs = parseFloat(String(document.getElementById('cc-op-new-hours').value).replace(',','.'));
        if(nm.length < 3) { ccToast('Scrivi cognome e nome (almeno 3 lettere).', true); return; }
        if(!(hrs > 0 && hrs <= 60)) { ccToast('Le ore a settimana devono essere tra 1 e 60.', true); return; }
        const header = (finalData[0] || []).slice(3);
        if(header.includes(nm)) {
            ccToast(operatorConfig.removed[nm] ? `${nm} è tra i rimossi: ripristinalo dalla lista in fondo.` : 'Esiste già un operatore con questo nome.', true);
            return;
        }
        operatorConfig.added.push({ name:nm, created: ymd(new Date()) });
        if(hrs !== 36) operatorConfig.contract[nm] = hrs;
        rebuildDataFromExcel();
        saveOperatorConfig(`${nm} aggiunto in fondo al calendario`);
        refreshAfterOperatorChange(); renderCcOperators();
    }

    // ═══ CONTEGGIO ORE ════════════════════════════════════════════════════
    function ccHoursSetPeriod(p) { ccHoursPeriod = p; renderCcHours(); }
    function ccHoursNav(delta) {
        if(ccHoursPeriod === 'settimana') {
            if(delta === 0) ccHoursAnchor = new Date();
            else { const d = new Date(ccHoursAnchor); d.setDate(d.getDate() + delta*7); ccHoursAnchor = d; }
        } else if(ccHoursPeriod === 'mese') {
            ccHoursMonth = delta === 0 ? new Date().getMonth() : Math.min(11, Math.max(0, ccHoursMonth + delta));
        }
        renderCcHours();
    }
    function ccHoursSortBy(key) {
        if(ccHoursSort.key === key) ccHoursSort.dir *= -1; else ccHoursSort = { key, dir: key === 'name' || key === 'order' ? 1 : -1 };
        renderCcHours();
    }
    function ccHoursSearch(v) {
        ccHoursQuery = v;
        const q = v.trim().toLowerCase();
        document.querySelectorAll('#cc-hours-table tbody tr').forEach(tr => { tr.style.display = (!q || (tr.dataset.name||'').toLowerCase().includes(q)) ? '' : 'none'; });
    }
    // Costruisce colonne e valori del periodo scelto per tutti gli operatori.
    function computeHoursMatrix() {
        const days = buildDaysIndex();
        let units = [], label = '', periodDays = [];
        if(ccHoursPeriod === 'settimana') {
            const { start, end } = getWeekRange(ccHoursAnchor);
            periodDays = days.filter(dd => dd.date >= start && dd.date <= end);
            const wd = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
            for(let i=0;i<7;i++) {
                const dt = new Date(start); dt.setDate(start.getDate()+i);
                const match = periodDays.find(dd => dd.date.toDateString() === dt.toDateString());
                units.push({ label: wd[i], sub: dt.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'}), days: match ? [match] : [], isDay:true, red: (i>=5) || !!HOLIDAYS[`${dt.getMonth()}-${dt.getDate()}`] });
            }
            label = `${start.toLocaleDateString('it-IT',{day:'numeric',month:'short'})} \u2013 ${end.toLocaleDateString('it-IT',{day:'numeric',month:'short'})} \u00b7 sett. ${getISOWeek(start)}`;
        } else if(ccHoursPeriod === 'mese') {
            periodDays = days.filter(dd => dd.monthIdx === ccHoursMonth);
            const map = {}; const keys = [];
            periodDays.forEach(dd => { const wk = getISOWeek(dd.date); if(!map[wk]) { map[wk] = []; keys.push(wk); } map[wk].push(dd); });
            keys.forEach((wk, i) => {
                const g = map[wk]; const a = g[0].date, b = g[g.length-1].date;
                units.push({ label:`Sett. ${i+1}`, sub:`${a.getDate()}\u2013${b.getDate()} ${MONTH_NAMES_IT[ccHoursMonth].slice(0,3)}`, days:g });
            });
            label = MONTH_NAMES_IT[ccHoursMonth].charAt(0).toUpperCase() + MONTH_NAMES_IT[ccHoursMonth].slice(1) + ' ' + SHIFT_YEAR;
        } else {
            periodDays = days;
            for(let m=0;m<12;m++) {
                const g = days.filter(dd => dd.monthIdx === m);
                if(g.length) units.push({ label: MONTH_NAMES_IT[m].charAt(0).toUpperCase() + MONTH_NAMES_IT[m].slice(1,3), sub: `${g.length} gg`, days:g });
            }
            label = 'Anno ' + SHIFT_YEAR;
        }
        let discrepancy = 0; const unknown = new Set();
        const rows = drivers.filter(d => !d.test).map((d, order) => {
            const ch = getContractHours(d.idx);
            // operatore aggiunto a mano: il contratto conta dal primo giorno con un turno (come il saldo)
            let startDate = null;
            if(d.virtual) {
                const f = days.find(dd => { const c = finalData[dd.rowIdx][d.idx] || {}; return (c.v||'').toString().trim() || (c.subV||'').toString().trim(); });
                startDate = f ? f.date : new Date(8640000000000000);
            }
            const counts = dd => !startDate || dd.date >= startDate;
            let total = 0, absDays = 0;
            const cells = units.map(u => {
                let min = 0, first = null;
                u.days.forEach(dd => {
                    const info = computeDayInfo(dd.rowIdx, d.idx);
                    min += info.minutes;
                    discrepancy += Math.abs(info.minutes - independentDayMinutes(dd.rowIdx, d.idx));
                    const meta = ccCodeMeta(info);
                    if(meta.kind === 'abs') absDays++;
                    if(meta.kind === 'unk') unknown.add(info.code);
                    if(!first) first = meta;
                });
                total += min;
                const target = contractMinutesFor(ch, u.days.filter(counts).map(dd => dd.date), d.idx);
                return { min, meta:first, target, empty: !u.days.length };
            });
            const target = contractMinutesFor(ch, periodDays.filter(counts).map(dd => dd.date), d.idx);
            return { d, order, ch, cells, total, target, diff: total - target, balance: computeDriverBalance(d.idx), absDays };
        });
        return { units, rows, label, discrepancy, unknown, dayCount: periodDays.length };
    }
    function renderCcHours() {
        const main = document.getElementById('cc-main');
        const M = computeHoursMatrix();
        const s = ccHoursSort;
        const rows = M.rows.slice().sort((a,b) => {
            let va, vb;
            if(s.key === 'name') { va = a.d.name; vb = b.d.name; return va.localeCompare(vb) * s.dir; }
            if(s.key === 'order') { va = a.order; vb = b.order; }
            else if(s.key === 'total') { va = a.total; vb = b.total; }
            else if(s.key === 'diff') { va = a.diff; vb = b.diff; }
            else { va = a.balance; vb = b.balance; }
            return (va - vb) * s.dir;
        });
        const sortIco = key => ccHoursSort.key === key ? `<span class="msym cc-sort">${ccHoursSort.dir>0?'arrow_upward':'arrow_downward'}</span>` : '';
        const unitHead = M.units.map(u => `<th class="c cc-hcell" ${u.red?'style="color:var(--cc-neg)"':''}>${esc(u.label)}<small>${esc(u.sub)}</small></th>`).join('');
        const body = rows.map(r => {
            const cells = r.cells.map(c => {
                if(c.empty) return `<td class="c cc-hcell"><span class="cc-hv zero">\u00b7</span></td>`;
                if(ccHoursPeriod === 'settimana') {
                    const meta = c.meta || { short:'' };
                    return `<td class="cc-hcell"><div class="cc-hcell-in">${codeChip(meta)}<span class="cc-hv ${c.min? '' : 'zero'}">${c.min ? fmtHM(c.min) : ''}</span></div></td>`;
                }
                const dlt = c.min - c.target;
                return `<td class="r cc-hcell"><span class="cc-hv ${c.min?'':'zero'}">${fmtHM(c.min)}</span><span class="cc-seg-delta ${Math.abs(dlt)<1?'':(dlt<0?'cc-neg':'cc-pos')}">${fmtHM(dlt,true)}</span></td>`;
            }).join('');
            const pct = r.target > 0 ? Math.min(100, r.total / r.target * 100) : 0;
            const over = r.target > 0 && r.total > r.target;
            const hiddenTag = r.d.hidden ? ` <span class="cc-tag">nascosto</span>` : '';
            return `<tr data-name="${esc(r.d.name)}">
                <td class="cc-sticky"><div class="cc-opname">${esc(r.d.name)}${hiddenTag}<small>${r.ch} h/sett.${r.absDays?` \u00b7 ${r.absDays} gg assenza`:''}</small></div></td>
                ${cells}
                <td class="r cc-sep-l cc-num"><span class="cc-bar"><i class="${over?'over':''}" style="width:${pct.toFixed(1)}%"></i></span>${fmtHM(r.total)}</td>
                <td class="r cc-num" style="color:var(--cc-muted)">${fmtHM(r.target)}</td>
                <td class="r cc-num ${Math.abs(r.diff)<1?'':(r.diff<0?'cc-neg':'cc-pos')}"><b style="font-weight:500">${fmtHM(r.diff,true)}</b></td>
                <td class="r cc-num cc-sep-l ${Math.abs(r.balance)<1?'':(r.balance<0?'cc-neg':'cc-pos')}">${fmtHM(r.balance,true)}</td>
            </tr>`;
        }).join('');
        const vis = M.rows;
        const sum = k => vis.reduce((a,r) => a + r[k], 0);
        const footCells = M.units.map((u, i) => {
            const m = vis.reduce((a,r) => a + r.cells[i].min, 0);
            return `<td class="${ccHoursPeriod==='settimana'?'':'r'} cc-hcell cc-num">${u.days.length ? fmtHM(m) : ''}</td>`;
        }).join('');
        const nav = ccHoursPeriod === 'anno' ? `<div class="cc-period-nav"><span class="cc-period-label">${esc(M.label)}</span></div>` : `
            <div class="cc-period-nav">
                <button class="cc-icon-btn" onclick="ccHoursNav(-1)" aria-label="Periodo precedente"><span class="msym">chevron_left</span></button>
                <span class="cc-period-label">${esc(M.label)}</span>
                <button class="cc-icon-btn" onclick="ccHoursNav(1)" aria-label="Periodo successivo"><span class="msym">chevron_right</span></button>
            </div>
            <button class="cc-btn sm" onclick="ccHoursNav(0)">${ccHoursPeriod==='settimana'?'Questa settimana':'Questo mese'}</button>`;
        const check = (M.discrepancy > 1 || M.unknown.size)
            ? `<div class="cc-check warn"><span class="msym">warning</span>${M.discrepancy>1?`I due metodi di calcolo differiscono di ${fmtHM(M.discrepancy)}. `:''}${M.unknown.size?`Codici non riconosciuti, esclusi dal conteggio: ${esc([...M.unknown].join(', '))}.`:''}</div>`
            : `<div class="cc-check ok"><span class="msym">verified</span>Calcolo verificato con doppio controllo su ${M.dayCount} giorni.</div>`;
        main.innerHTML = `
            <div class="cc-toolbar">
                <div class="cc-seg" role="tablist">
                    <button class="${ccHoursPeriod==='settimana'?'active':''}" onclick="ccHoursSetPeriod('settimana')">Settimana</button>
                    <button class="${ccHoursPeriod==='mese'?'active':''}" onclick="ccHoursSetPeriod('mese')">Mese</button>
                    <button class="${ccHoursPeriod==='anno'?'active':''}" onclick="ccHoursSetPeriod('anno')">Anno</button>
                </div>
                ${nav}
                <div class="cc-spacer"></div>
                <div class="cc-search"><span class="msym">search</span><input class="cc-input" placeholder="Cerca operatore" value="${esc(ccHoursQuery)}" oninput="ccHoursSearch(this.value)"></div>
            </div>
            <div class="cc-table-wrap">
                <table class="cc-table" id="cc-hours-table">
                    <thead><tr>
                        <th class="cc-sticky sortable" onclick="ccHoursSortBy(ccHoursSort.key==='order'?'name':'order')">Operatore ${sortIco('name')}${sortIco('order')}<small>${ccHoursSort.key==='order'?'ordine del calendario':'alfabetico'}</small></th>
                        ${unitHead}
                        <th class="r cc-sep-l sortable" onclick="ccHoursSortBy('total')">Lavorate ${sortIco('total')}<small>con assenze giustificate</small></th>
                        <th class="r">Contratto<small>nel periodo</small></th>
                        <th class="r sortable" onclick="ccHoursSortBy('diff')">Differenza ${sortIco('diff')}<small>nel periodo</small></th>
                        <th class="r cc-sep-l sortable" onclick="ccHoursSortBy('balance')">Saldo ${sortIco('balance')}<small>da gennaio a oggi</small></th>
                    </tr></thead>
                    <tbody>${body}</tbody>
                    <tfoot><tr><td class="cc-sticky">Totale reparto</td>${footCells}<td class="r cc-sep-l cc-num">${fmtHM(sum('total'))}</td><td class="r cc-num">${fmtHM(sum('target'))}</td><td class="r cc-num">${fmtHM(sum('diff'),true)}</td><td class="cc-sep-l"></td></tr></tfoot>
                </table>
            </div>
            ${check}
            <div class="cc-legend">
                <span>Contratto su 5 giorni: ore settimanali \u00f7 5 per ogni giorno dal luned\u00ec al venerd\u00ec (36 h = 7 h 12 al giorno); sabato e domenica non maturano ore. Dal 5 ottobre 2026 i diurnisti fanno 6 h al giorno, dal luned\u00ec al sabato: le loro assenze valgono 6 h.</span>
                <span>Le assenze giustificate (ferie, recupero, congedo, malattia, permessi, festivi, gravidanza\u2026) coprono la giornata: contano le ore di contratto del giorno (6 h), la domenica 0.</span>
                <span>Le ore settimanali di ciascuno si cambiano in Operatori.</span>
            </div>`;
        if(ccHoursQuery) ccHoursSearch(ccHoursQuery);
        document.getElementById('cc-top-actions').innerHTML = `<button class="cc-btn" onclick="ccExportHours()"><span class="msym">download</span>Esporta Excel</button>`;
    }
    async function ccExportHours() {
        if(typeof ExcelJS === 'undefined') { ccToast('Esportazione non disponibile: libreria Excel non caricata.', true); return; }
        const M = computeHoursMatrix();
        await loadLib('excel');
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet(ccHoursPeriod === 'settimana' ? 'Settimana' : ccHoursPeriod === 'mese' ? 'Mese' : 'Anno');
        ws.addRow([`Conteggio ore \u2014 ${M.label}`]); ws.getRow(1).font = { bold:true, size:13 };
        ws.addRow(['Ore in formato decimale (es. 7,5 = 7 ore e 30 minuti)']); ws.getRow(2).font = { italic:true, color:{ argb:'FF5C6776' } };
        ws.addRow([]);
        const head = ['Operatore', 'Ore/sett.'].concat(M.units.map(u => `${u.label} ${u.sub}`)).concat(['Lavorate', 'Contratto', 'Differenza', 'Saldo ad oggi', 'Giorni di assenza']);
        const hr = ws.addRow(head); hr.font = { bold:true }; hr.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFE7EAEE' } };
        const h2 = m => Math.round(m / 60 * 100) / 100;
        M.rows.forEach(r => {
            const vals = [r.d.name, r.ch];
            r.cells.forEach(c => { if(ccHoursPeriod === 'settimana') vals.push(c.empty ? '' : (c.min ? h2(c.min) : (c.meta && c.meta.short) || '')); else vals.push(c.empty ? '' : h2(c.min)); });
            vals.push(h2(r.total), h2(r.target), h2(r.diff), h2(r.balance), r.absDays);
            ws.addRow(vals);
        });
        ws.columns.forEach((col, i) => { col.width = i === 0 ? 24 : 12; if(i > 0) col.numFmt = '0.00'; });
        ws.views = [{ state:'frozen', xSplit:1, ySplit:4 }];
        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const a = document.createElement('a');
        const tag = ccHoursPeriod === 'settimana' ? ymd(getWeekRange(ccHoursAnchor).start) : ccHoursPeriod === 'mese' ? MONTH_NAMES_IT[ccHoursMonth] : SHIFT_YEAR;
        a.href = URL.createObjectURL(blob); a.download = `conteggio-ore-${ccHoursPeriod}-${tag}.xlsx`;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        ccToast('File Excel scaricato');
    }

    // ═══ DA RIPORTARE SU EXCEL ════════════════════════════════════════════
    function computePendingExcelSyncList() {
        let list = [];
        if(!rawFinalData.length) return list;
        Object.keys(manualOverrides).forEach(key => {
            const idx2 = key.indexOf('__'); if(idx2 === -1) return;
            const orig = key.substring(0, idx2); const dateStr = key.substring(idx2 + 2);
            const d = drivers.find(dr => (dr.originalName || dr.name) === orig);
            if(!d) return; // operatore rimosso o eliminato
            const overrideVal = manualOverrides[key];
            const rawDisplay = describeRawExcelValue(orig, dateStr);
            const newDisplay = describeOverrideValue(overrideVal);
            if(rawDisplay === newDisplay) return;
            if(excelSyncedMarks[key] === JSON.stringify(overrideVal)) return;
            const ds = dateStr.split('@')[0]; const k = ds.lastIndexOf('-'); const mName = ds.substring(0, k); const dNum = parseInt(ds.substring(k + 1));
            list.push({ key, driverName: d.name, virtual: d.virtual, dateLabel: dateStr, monthIdx: MONTH_MAP[mName] ?? 99, day: dNum, oldDisplay: rawDisplay, newDisplay });
        });
        list.sort((a,b) => (a.monthIdx - b.monthIdx) || (a.day - b.day) || a.driverName.localeCompare(b.driverName));
        return list;
    }
    function renderCoordSyncList() { ccUpdateNavCounts(); if(ccSection === 'riportare') ccRefreshIfOpen(); }
    function renderCcSync() {
        const main = document.getElementById('cc-main');
        const list = computePendingExcelSyncList();
        if(!list.length) {
            main.innerHTML = `<div class="cc-panel"><div class="cc-empty"><span class="msym">task_alt</span>Il file Excel è allineato: nessuna modifica da riportare.</div></div>`;
            return;
        }
        const pretty = it => { if(it.monthIdx > 11) return it.dateLabel; const dt = new Date(SHIFT_YEAR, it.monthIdx, it.day); return dt.toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'long' }); };
        main.innerHTML = `
            <div class="cc-table-wrap"><table class="cc-table">
                <thead><tr><th>Giorno</th><th>Operatore</th><th>Nel file Excel</th><th>Nell\u2019app</th><th class="r">Riportato</th></tr></thead>
                <tbody>${list.map((it, i) => `<tr>
                    <td>${esc(pretty(it))}</td>
                    <td class="cc-opname">${esc(it.driverName)}</td>
                    <td style="color:var(--cc-muted)">${it.virtual ? 'operatore non presente nel file' : esc(it.oldDisplay || '\u2014')}</td>
                    <td><b style="font-weight:500">${esc(it.newDisplay || '\u2014')}</b></td>
                    <td class="r"><button class="cc-btn sm" onclick="confirmSyncItemDone(${i})"><span class="msym">check</span>Fatto</button></td>
                </tr>`).join('')}</tbody>
            </table></div>
            <p class="cc-note" style="margin-top:10px">Premi Fatto dopo aver inserito la modifica nel file turni.xlsx. Se il turno cambia di nuovo, la voce ricompare.</p>`;
        ccSyncCache = list;
        document.getElementById('cc-top-actions').innerHTML = `<button class="cc-btn" onclick="confirmAllSyncDone()"><span class="msym">done_all</span>Segna tutto come riportato</button>`;
    }
    function confirmSyncItemDone(i) {
        const it = ccSyncCache[i]; if(!it) return;
        vibrate();
        excelSyncedMarks[it.key] = JSON.stringify(manualOverrides[it.key] || null);
        persistSyncMarks([it.key]); renderCcSync(); ccUpdateNavCounts();
    }
    async function confirmAllSyncDone() {
        const list = computePendingExcelSyncList(); if(!list.length) return;
        const ok = await ccConfirm(`Segnare ${list.length} modifiche come riportate?`, 'Fallo solo se le hai già inserite tutte nel file Excel.', 'Segna tutte');
        if(!ok) return;
        list.forEach(it => { excelSyncedMarks[it.key] = JSON.stringify(manualOverrides[it.key] || null); });
        persistSyncMarks(list.map(it => it.key)); renderCcSync(); ccUpdateNavCounts(); ccToast('Elenco svuotato');
    }
    // "Riportato su Excel": si scrivono solo le voci toccate, senza riscrivere tutto l'elenco
    function persistSyncMarks(keys) {
        if(!fbReady || !keys.length) return Promise.resolve();
        const marks = {}; keys.forEach(k => { marks[k] = excelSyncedMarks[k]; });
        return cfgRef('settings').set({ excelSyncedMarks: marks }, { merge:true }).catch(e => { console.error('Errore salvataggio segni Excel:', e); ccToast('Salvataggio non riuscito: controlla la connessione.', true); });
    }

    // ═══ IMPOSTAZIONI ═════════════════════════════════════════════════════
    function renderCcSettings() {
        const main = document.getElementById('cc-main');
        const opts = [COORD_DEFAULT, COORD_ID].concat(drivers.filter(d => !d.test).map(d => d.name).filter(n => n !== COORD_DEFAULT).sort((a,b) => a.localeCompare(b))).map(n => `<option value="${esc(n)}" ${coordinatorName===n?'selected':''}>${esc(n)}${n === COORD_DEFAULT ? ' (coordinatore)' : ''}</option>`).join('');
        main.innerHTML = `
            <div class="cc-panel">
                <div class="cc-panel-head"><h3>Coordinatore designato</h3></div>
                <div class="cc-panel-body">
                    <p class="cc-note" style="margin-bottom:12px">Riceve sul telefono una notifica per ogni richiesta inviata dal portale Richieste, anche ad app chiusa (entro circa 15 minuti), e un avviso immediato quando ha l\u2019app aperta. Cambiando nome qui, le notifiche passano subito al nuovo coordinatore.</p>
                    <div class="cc-inline-form">
                        <select id="coord-select-name" class="cc-input"><option value="" ${coordinatorName?'':'selected'} disabled>Scegli operatore</option>${opts}</select>
                        <button class="cc-btn primary" id="btn-save-coordinatore" onclick="saveCoordinatorName()">Salva</button>
                    </div>
                    <p class="cc-note" id="coord-current-label" style="margin-top:10px">${coordinatorName ? 'Attuale: ' + esc(coordinatorName) : 'Nessun coordinatore impostato.'}</p>
                    <div id="coord-push-status"></div>
                </div>
            </div>
            <div class="cc-panel">
                <div class="cc-panel-head"><h3>Ambulanze minime per turno</h3></div>
                <div class="cc-panel-body">
                    <p class="cc-note" style="margin-bottom:12px">Sotto questi numeri il giorno viene segnalato in rosso in Modifica turni e nella Panoramica.</p>
                    <div class="cc-inline-form">
                        <label class="cc-field" style="max-width:110px">Mattina<input type="number" min="0" max="15" class="cc-input" id="cov-M" value="${coverageMin.M}"></label>
                        <label class="cc-field" style="max-width:110px">Pomeriggio<input type="number" min="0" max="15" class="cc-input" id="cov-P" value="${coverageMin.P}"></label>
                        <label class="cc-field" style="max-width:110px">Notte<input type="number" min="0" max="15" class="cc-input" id="cov-N" value="${coverageMin.N}"></label>
                        <button class="cc-btn primary" onclick="saveCoverageMin()" style="align-self:flex-end">Salva</button>
                    </div>
                </div>
            </div>
            ${ccCustomCodesPanel()}
            <div class="cc-panel">
                <div class="cc-setting"><div><b>Consigli sulle ore nel calendario</b><small>Mostra un\u2019icona sopra gli operatori sotto di 2 h o sopra di 4 h rispetto al contratto, con un suggerimento.</small></div>
                    <label class="cc-switch"><input type="checkbox" ${aiAdviceEnabled?'checked':''} onchange="toggleAiAdvice(this.checked)"><span></span></label></div>
            </div>
            <div class="cc-panel">
                <div class="cc-setting"><div><b>Sessione su questo dispositivo</b><small>L\u2019accesso vale finché l\u2019app resta aperta: chiudendola servirà di nuovo la password.</small></div>
                    <button class="cc-btn danger" onclick="coordLogout()"><span class="msym">logout</span>Esci</button></div>
            </div>`;
        coordPushStatus();
    }
    function renderCoordinatorTab() {
        const lbl = document.getElementById('coord-current-label');
        if(lbl) lbl.textContent = coordinatorName ? ('Attuale: ' + coordinatorName) : 'Nessun coordinatore impostato.';
        coordPushStatus();
    }
    // Quanti telefoni del coordinatore hanno attivato le notifiche: le richieste arrivano solo lì.
    async function coordPushStatus() {
        const el = document.getElementById('coord-push-status'); if(!el) return;
        if(!coordinatorName) { el.innerHTML = ''; return; }
        let n = 0;
        try { const d = (await cfgRef('push').get()).data() || {}; n = Object.values(d.subs || {}).filter(s => normalizeNameForMatch(s.owner || '') === normalizeNameForMatch(coordinatorName)).length; } catch(e) { el.innerHTML = ''; return; }
        let here = null; try { here = await pushCurrent(); } catch(e) {}
        el.innerHTML = n
            ? `<div class="cps ok"><span class="msym">notifications_active</span><span>Notifiche delle richieste attive su <b>${n} ${n === 1 ? 'telefono' : 'telefoni'}</b> di ${esc(coordinatorName)}.</span></div>`
            : `<div class="cps warn"><span class="msym">notifications_off</span><span><b>${esc(coordinatorName)} non ha ancora attivato le notifiche sul telefono</b>: finché non lo fa, le richieste le vede solo aprendo l\u2019app. Sul suo telefono: app con “chi sei” = ${esc(coordinatorName)} › Opzioni › Notifiche sul telefono › Attiva (su iPhone serve l\u2019app installata sulla schermata Home).</span></div>`;
        if(isCoordinator && !here) el.innerHTML += `<button class="cc-btn primary sm" style="margin-top:8px" onclick="pushEnable().then(coordPushStatus)"><span class="msym">notifications_active</span>Attiva su questo telefono</button>`;
    }
    function saveCoordinatorName() {
        const sel = document.getElementById('coord-select-name');
        if(!sel || !sel.value) { ccToast('Scegli un operatore prima di salvare.', true); return; }
        if(!fbReady) return;
        cfgRef('settings').set({ coordinatorName: sel.value }, { merge:true })
            .then(() => { coordinatorName = sel.value; checkIfIAmCoordinator(); renderCoordinatorTab(); ccToast('Coordinatore aggiornato: le notifiche delle richieste vanno ora a ' + sel.value); vibrate(); })
            .catch(e => { console.error('Errore salvataggio coordinatore:', e); ccToast('Salvataggio non riuscito.', true); });
    }

