(function() {
    // ── piccoli aiuti ──────────────────────────────────────────────────────
    const has = n => typeof window[n] === 'function';
    const $ = id => document.getElementById(id);
    const E = s => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])));
    const ic = (n, s) => `<span class="material-icons-round"${s ? ` style="font-size:${s}px"` : ''}>${n}</span>`;
    const sched = k => { try { return SCHEDULE[k] || ''; } catch(e) { return ''; } };
    // colori delle sigle: le stesse variabili del calendario
    const CODE_VARS = { M:['--c-M','--t-M'], P:['--c-P','--t-P'], N:['--c-N','--t-N'], SM:['--c-SM','--t-SM'], R:['--c-R','--t-R'], m:['--c-dM','--t-dM'], p:['--c-dP','--t-dP'], r:['--c-dR','--t-dR'], 'M+N':['--c-N','--t-N'],
        f:['--bg-cong','--t-cong'], v:['--bg-ferie','--t-ferie'], pn:['--bg-pn','--t-pn'], pe:['--bg-perm','--t-perm'], ma:['--bg-mal','--t-mal'], re:['--bg-rec','--t-rec'] };
    const CODE_TXT = { f:'CO', v:'FER', pn:'PN', pe:'PER', ma:'MAL', re:'REC' };
    function chip(code, label) {
        const c = CODE_VARS[code] || ['--bg', '--text-main'];
        return `<span class="gd-chip" style="background:var(${c[0]});color:var(${c[1]})">${E(label || CODE_TXT[code] || code)}</span>`;
    }
    function chipColors(colors, short) {
        if(!colors) return `<span class="gd-chip" style="background:var(--bg);color:var(--text-main)">${E(short)}</span>`;
        return `<span class="gd-chip" style="background:var(${colors.bg});color:var(${colors.fg})">${E(short)}</span>`;
    }
    // percorso vero di una voce del menu: conta solo l’ultima voce, che si cerca in tutte le cartelle
    // (così la guida segue il menu anche quando una voce cambia cartella)
    const realPath = path => {
        const id = path[path.length - 1]; let found = null;
        const dfs = (list, pre) => list.some(n => { if(!n || n.group) return false; const p = pre.concat(n.id); if(n.id === id) { found = p; return true; } return !!(n.children && dfs(n.children, p)); });
        try { dfs(menuTree(), []); } catch(e) {}
        return found;
    };
    const pathOk = path => !!realPath(path);
    const menuLbl = path => { try { const rp = realPath(path); if(!rp) return ''; let list = menuTree(), n = null; for(const id of rp) { n = list.find(x => x && x.id === id); list = (n && n.children) || []; } return n ? n.label : ''; } catch(e) { return ''; } };
    // "☰ › Cartella › Voce" scritto come nel menu vero
    const mp = (id, fb) => { const rp = realPath([id]); if(!rp) return E('☰' + (fb ? ' › ' + fb : '')); return E('☰ › ' + rp.map((x, i) => menuLbl(rp.slice(0, i + 1))).join(' › ')); };
    const NAMES = ['ANNA', 'LUCA', 'SARA', 'MARCO'];

    // ── scene animate (frame) ──────────────────────────────────────────────
    // CAL: calendario finto · MENU: percorso nel menu vero · SCR: una finestra · REQ: area Richieste
    const CAL = o => Object.assign({ m:'cal' }, o);
    const SCR = o => Object.assign({ m:'scr' }, o);
    const REQ = o => Object.assign({ m:'scr', req:true }, o);
    const MENU = (path, st, last) => ({ m:'menu', path, st, last });
    const row = (i, t, s, col, extra) => Object.assign({ row:[i, t, s], col }, extra || {});

    // ── contenuti: categorie e argomenti ───────────────────────────────────
    // when: l’argomento compare solo se la funzione c’è in questa versione dell’app.
    const C = [];
    const cat = (id, label, icon, color, desc) => { const c = { id, label, icon, color, desc, topics:[] }; C.push(c); return c; };
    const T = (c, t) => { t.cat = c; c.topics.push(t); return t; };

    // 1 ─ PRIMI PASSI
    const cIn = cat('inizio', 'Primi passi', 'flag', '#2563eb', 'Entrare, scegliere chi sei, il menu');
    T(cIn, { id:'chisei', t:'Chi sei? Scegli il tuo nome', icon:'badge',
        sub:'Il nome serve per i tuoi avvisi, la tua pagina e le tue preferenze.',
        steps:['La prima volta l’app chiede <b>Chi sei?</b>: tocca il tuo nome nell’elenco.',
            'I nomi già usati in quel momento da un’altra persona collegata sono grigi e non si possono scegliere.',
            'Se preferisci restare anonimo scegli <b>Ospite</b>: vedi i turni, ma non ricevi notifiche e non puoi scrivere note.',
            'Per cambiare nome: <b>' + mp('user') + '</b>.'],
        tips:['Le tue preferenze (tema, vista del calendario, notifiche…) sono legate al tuo nome: le ritrovi su ogni telefono in cui lo scegli.'],
        anim:[SCR({ title:'Chi sei?', icon:'badge', col:'#1d4ed8', sub:'Seleziona il tuo nome per continuare', st:0, say:'Tocca il tuo nome',
                body:[row('person', 'ANNA', '', '#64748b'), row('person', 'LUCA', 'in uso da un’altra persona', '#cbd5e1'), row('person', 'SARA', '', '#64748b', { hit:true }), row('person', 'MARCO', '', '#64748b'), row('visibility_off', 'Ospite', 'resta anonimo', '#94a3b8')] }),
            CAL({ st:0, say:'Fatto: adesso l’app sa chi sei', hold:1800 }),
            MENU(['imp', 'user'], 3)],
        try:{ label:'Cambia utente', run:() => requestChangeIdentity(), when:() => has('requestChangeIdentity') } });
    T(cIn, { id:'password', t:'La password d’accesso', icon:'lock', when:() => GATE_ENABLED && !!$('app-gate'),
        sub:'Se il coordinatore la accende, i turni si vedono solo dopo la password.',
        steps:['Alla prima apertura compare il logo 118 con la richiesta della <b>password</b>.',
            'Scrivila e tocca <b>Entra</b>.',
            'La metti solo la prima volta: poi quel telefono la ricorda.'],
        tips:['La password la decide il coordinatore. Se non la sai chiedila a lui: i turni sono riservati al personale (privacy).'],
        anim:[SCR({ title:'Turni Infermieri 118', icon:'lock', col:'#0f172a', sub:'Serve la password d’accesso', st:0, say:'Alla prima apertura chiede la password', hold:1600,
                body:[{ p:'Per entrare serve la password d’accesso. La metti solo la prima volta: poi questo telefono la ricorda.' }, { field:'Password', v:'••••••' }, { btn:'Entra', hit:true }] }),
            CAL({ st:2, say:'Dentro! La prossima volta non la chiede più', hold:2000 })] });
    T(cIn, { id:'menu', t:'Il menu con le tre lineette', icon:'menu',
        sub:'Tutte le funzioni dell’app partono da qui.',
        steps:['Tocca <b>☰</b> in alto a destra.',
            'Le voci con la freccia <b>›</b> sono cartelle: si aprono dentro il menu. Con la freccia in alto torni indietro.',
            'Le voci con il <b>lucchetto</b> sono riservate (coordinatore, admin) e chiedono la password.',
            'In fondo trovi <b>Guida</b>: questa pagina.'],
        anim:[MENU(['cal'], 0), SCR({ st:1, say:'Le cartelle si aprono dentro il menu', hold:200, menuAt:['cal'] })],
        try:{ label:'Apri il menu', run:() => toggleMenu() } });
    T(cIn, { id:'installa', t:'Installare l’app sul telefono', icon:'install_mobile',
        sub:'Con l’icona sulla schermata Home si apre come un’app vera.',
        steps:['<b>iPhone</b>: apri l’app con Safari, tocca <b>Condividi</b> e poi <b>Aggiungi alla schermata Home</b>.',
            '<b>Android</b>: <b>' + mp('opts') + '</b>, sezione Applicazione, tocca <b>INSTALLA</b>. Se non compare la finestra, usa il menu ⋮ di Chrome › Aggiungi a schermata Home.',
            'Poi apri l’app sempre dall’icona.'],
        tips:['Su iPhone le notifiche sul telefono funzionano solo con l’app installata sulla schermata Home.'],
        anim:[MENU(['imp', 'opts'], 1), SCR({ title:'Opzioni', icon:'settings', col:'#64748b', st:1, say:'Sezione Applicazione › INSTALLA',
                body:[{ grp:'Applicazione' }, row('vibration', 'Vibrazione al tocco', 'Una breve vibrazione', '#64748b', { sw:true }), row('install_mobile', 'Installa l’app', 'Aggiungila alla schermata Home', '#16a34a', { hit:true }), row('refresh', 'Aggiorna', 'Ricarica l’ultima versione', '#64748b')] })],
        try:{ label:'Apri Opzioni', run:() => openOptionsModal(), when:() => has('openOptionsModal') } });
    T(cIn, { id:'aggiorna', t:'Aggiornare l’app', icon:'refresh',
        sub:'L’app viene migliorata spesso: ogni tanto ricaricala.',
        steps:['<b>' + mp('reload') + '</b>: ricarica la pagina con l’ultima versione.',
            'I turni invece si aggiornano da soli, in tempo reale, senza fare niente.'],
        tips:['In caso di dubbio sui turni, controlla sempre i turni cartacei in guardiola.'],
        anim:[MENU(['imp', 'reload'], 0)] });
    T(cIn, { id:'offline', t:'Senza rete', icon:'cloud_off', when:() => !!$('net-offline'),
        sub:'Anche senza connessione vedi l’ultimo calendario scaricato.',
        steps:['Quando manca la rete in basso compare la scritta <b>Senza rete</b>.',
            'Vedi l’ultimo calendario scaricato; appena torna la connessione si aggiorna da solo.',
            'Per salvare qualcosa (note, modifiche) serve la rete.'],
        anim:[CAL({ offline:true, st:0, say:'In basso compare “Senza rete”', hold:2200 }), CAL({ offline:true, hit:'off', st:1, say:'Toccala per sapere cosa puoi fare', hold:1200 })] });
    T(cIn, { id:'pausa', t:'Turni in pausa e una scheda sola', icon:'pause_circle', when:() => has('liveShow'),
        sub:'Per non consumare, l’app si mette in pausa quando non la usi.',
        steps:['Dopo <b>30 minuti</b> senza toccare niente compare <b>Turni in pausa</b>: i turni smettono di aggiornarsi.',
            'Tocca <b>Riprendi</b> e si aggiornano subito.',
            'Sul computer i turni restano aggiornati in <b>una scheda sola</b>: se li apri in un’altra scheda, quella vecchia va in pausa. Con <b>Usa questa scheda</b> scegli quale tenere.'],
        anim:[SCR({ title:'Turni in pausa', icon:'pause_circle', col:'#334155', st:0, say:'Dopo 30 minuti senza uso', hold:400,
                body:[{ p:'Nessun movimento da 30 minuti: per non consumare letture, i turni hanno smesso di aggiornarsi.' }, { btn:'Riprendi', hit:true }] }),
            CAL({ st:1, say:'Turni di nuovo aggiornati in tempo reale', hold:1800 })] });

    // 2 ─ IL CALENDARIO
    const cCal = cat('calendario', 'Il calendario', 'calendar_month', '#1d4ed8', 'Sigle, caselle, viste e stampa');
    T(cCal, { id:'sigle', t:'Leggere il calendario', icon:'palette',
        sub:'Ogni colonna è un collega, ogni riga un giorno. Le sigle dicono il turno.',
        steps:['Ogni <b>colonna</b> è un infermiere, ogni <b>riga</b> un giorno; la riga di <b>oggi</b> è arancione.',
            'Le lettere <b>maiuscole</b> sono i turni dei turnisti, le <b>minuscole</b> (in viola) quelle dei diurnisti.',
            'Le <b>assenze</b> (congedo, permessi, malattia…) hanno un colore pieno tutto loro.',
            'Sotto il turno puoi trovare <b>REPERIBILE</b> e le fasce di reperibilità colorate.'],
        legend:true,
        anim:[CAL({ st:0, say:'Colonne = colleghi, righe = giorni', hold:2200 }), CAL({ st:1, say:'Maiuscole turnisti, minuscole diurnisti', hold:2200, hl:'col3' }), CAL({ st:3, rep:true, say:'Sotto il turno: reperibilità e fasce', hold:2400 })] });
    T(cCal, { id:'casella', t:'Toccare una casella', icon:'touch_app',
        sub:'Ti dice chi lavora con te, gli orari, la reperibilità e le note del giorno.',
        steps:['Tocca una casella del calendario.',
            'Si apre il dettaglio: il turno con l’<b>orario</b>, i <b>colleghi in turno</b> con te (anche i diurnisti), gli autisti, la <b>reperibilità</b> del giorno e le <b>note</b>.',
            'Da qui puoi anche <b>scrivere una nota</b> per quel giorno.',
            'Toccando una casella <b>vuota</b> si apre direttamente la nota per quel giorno.'],
        anim:[CAL({ hit:'c0-0', st:0, say:'Tocca una casella' }),
            CAL({ st:1, say:'Chi è in turno con te, e a che ora', hold:2600, pop:{ title:'Mattina', ic:'wb_sunny', col:'var(--c-M)', icol:'var(--t-M)', sub:'Oggi · ' + (sched('M') || ''),
                body:[{ sec:'Infermieri in turno', ic:'medical_services' }, { ppl:[['ANNA', 'M'], ['MARCO', 'm']] }, { sec:'Reperibilità', ic:'phone_in_talk', sc:'#dc2626' }, row('call', 'MARCO', 'Titolare · 13:00 › 13:00', '#dc2626'), { btn:'Scrivi una nota', ic:'edit_note', g:true }] } })] });
    T(cCal, { id:'naviga', t:'Oggi, i mesi e l’anno dopo', icon:'today',
        sub:'Spostarsi nel calendario in un attimo.',
        steps:['All’apertura il calendario parte da <b>oggi</b>, in cima (si può cambiare in Opzioni).',
            'Il tasto <b>Oggi</b> nella barra in alto ti riporta al giorno corrente.',
            '<b>Mesi</b>, sempre nella barra in alto: scegli il mese dalla griglia.',
            pathOk(['cal', 'nexty']) ? `<b>${E(menuLbl(['cal', 'nexty']))}</b>: l’anno dopo è già nel calendario, sotto dicembre.` : 'L’anno dopo, quando c’è, si trova sotto dicembre.'],
        anim:[CAL({ st:1, say:'Oggi e Mesi sono nella barra in alto', hold:2200 }), MENU(['cal', 'nexty'], 2)],
        try:{ label:'Vai a oggi', run:() => scrollToToday(), when:() => has('scrollToToday') } });
    T(cCal, { id:'viste', t:'Tabella, Compatta o Giorni', icon:'view_day', when:() => has('openCalViewPicker'),
        sub:'Scegli tu come vedere il calendario: vale solo per te.',
        steps:['<b>' + mp('calview') + '</b>.',
            '<b>Tabella</b>: come sempre. <b>Compatta</b>: caselle piccole con la sigla, più giorni e colleghi nello schermo.',
            '<b>Giorno per giorno</b>: una scheda per giorno con chi fa mattina, pomeriggio e notte. Comoda sul telefono.',
            'La scelta vale solo per te e la ritrovi su ogni telefono; si cambia anche da Opzioni.'],
        anim:[MENU(['cal', 'calview'], 0), SCR({ title:'Come vedere il calendario', icon:'view_day', col:'#2563eb', st:1, say:'Scegli la vista che preferisci',
                body:[row('table_chart', 'Tabella', 'Come sempre', '#2563eb'), row('view_compact', 'Compatta', 'Caselle piccole con la sigla', '#2563eb'), row('view_day', 'Giorno per giorno', 'Una scheda per giorno', '#2563eb', { hit:true })] }),
            SCR({ title:'Giovedì', icon:'view_day', col:'#2563eb', sub:'Giorno per giorno', st:2, say:'Una scheda per ogni giorno', hold:2200,
                body:[{ ppl:[['ANNA', 'M'], ['MARCO', 'M']] }, { ppl:[['LUCA', 'P'], ['SARA', 'N']] }, { sec:'Assenti', ic:'event_busy' }, { ppl:[['PAOLA', 'f']] }] })],
        try:{ label:'Scegli la vista', run:() => openCalViewPicker() } });
    T(cCal, { id:'insieme', t:'Vista d’insieme', icon:'grid_view',
        sub:'Tutto l’anno a colpo d’occhio, con quadratini colorati.',
        steps:['<b>' + mp('calview') + ' › Anno intero</b>: tutto l’anno di tutti in una pagina.',
            'Tocca un giorno per vedere il dettaglio.',
            'Scegli di nuovo <b>Tabella</b> (o un’altra vista) per tornare al calendario di sempre.'],
        anim:[MENU(['calview'], 0)],
        try:{ label:'Apri la vista d’insieme', run:() => toggleCalView(), when:() => has('toggleCalView') } });
    T(cCal, { id:'filtra', t:'Vedere solo alcuni colleghi', icon:'groups',
        sub:'Nascondi le colonne che non ti servono.',
        steps:['Il tasto <b>Operatori</b> nella barra in alto.',
            'Tocca i nomi da vedere; <b>TUTTI GLI OPERATORI</b> li rimette tutti.',
            'La scelta resta salvata nelle tue preferenze.'],
        anim:[CAL({ st:0, say:'Tocca Operatori, in alto', hold:1800 }), SCR({ title:'Filtra Operatori', icon:'groups', col:'#2563eb', st:1, say:'Scegli chi vedere',
                body:[{ btn:'TUTTI GLI OPERATORI', ic:'select_all', g:true }, { opts:['ANNA', 'LUCA', 'SARA', 'MARCO'], on:[0, 2], sq:true, hit:2 }] })],
        try:{ label:'Filtra operatori', run:() => toggleDriverFilterDropdown(), when:() => has('toggleDriverFilterDropdown') } });
    T(cCal, { id:'evidenzia', t:'Mettere vicini due colleghi', icon:'view_column', when:() => has('toggleColFocus'),
        sub:'Tocca i nomi in alto per affiancare le loro colonne.',
        steps:['Tocca il <b>nome</b> di un collega nella riga in alto: la sua colonna va per prima, le altre diventano chiare.',
            'Tocca altri nomi per <b>affiancarli</b>; ritocca un nome per toglierlo.',
            'Tocca <b>DATA</b> per rivedere tutti. Vale solo su quello schermo.'],
        anim:[CAL({ hit:'h2', st:0, say:'Tocca un nome in alto' }), CAL({ focus:[2], hit:'h3', st:1, say:'Tocca un altro nome per affiancarlo' }),
            CAL({ focus:[2, 3], hit:'h-1', st:2, say:'DATA per rivedere tutti', hold:900 }), CAL({ st:2, say:'Di nuovo tutte le colonne', hold:1400 })] });
    T(cCal, { id:'domani', t:'Il tuo turno di domani', icon:'event', when:() => has('tmShow'),
        sub:'Una striscia in basso, all’apertura, con il turno di domani.',
        steps:['Se hai scelto il tuo nome, all’apertura compare in basso una striscia: <b>Domani</b>, il tuo turno, con chi lo fai e se sei reperibile.',
            'Toccala per aprire il dettaglio di quel giorno. Sparisce da sola dopo qualche secondo.'],
        anim:[CAL({ strip:true, st:0, say:'Domani: il tuo turno e i colleghi', hold:1400 }), CAL({ strip:true, hit:'strip', st:1, say:'Toccala per il dettaglio' }),
            CAL({ st:1, hold:1800, say:'Il dettaglio del giorno', pop:{ title:'Pomeriggio', ic:'wb_twilight', col:'var(--c-P)', icol:'var(--t-P)', sub:'Domani · ' + (sched('P') || ''), body:[{ sec:'Infermieri in turno', ic:'medical_services' }, { ppl:[['ANNA', 'P']] }] } })] });
    T(cCal, { id:'stampa', t:'Stampa del mese', icon:'print',
        sub:'Il PDF dei turni di tutti, per la bacheca.',
        steps:['<b>' + mp('print') + '</b>.',
            'Scegli il mese (quello prima, questo o il prossimo).',
            'L’app scarica un <b>PDF A4 orizzontale</b> con i turni di tutti e i reperibili, pronto da appendere.'],
        anim:[MENU(['cal', 'print'], 0), SCR({ title:'Stampa del mese', icon:'print', col:'#2563eb', st:1, say:'Scegli il mese: parte il PDF',
                body:[{ p:'Scegli il mese: scarico un PDF A4 orizzontale con i turni di tutti, pronto da appendere.' }, { btn:'Ottobre', g:true }, { btn:'Novembre', hit:true }, { btn:'Dicembre', g:true }] })],
        try:{ label:'Stampa del mese', run:() => printMonthPick(), when:() => has('printMonthPick') } });
    T(cCal, { id:'anni', t:'Gli anni passati', icon:'history', when:() => has('openYearPicker'),
        sub:'Il calendario degli anni conclusi, solo da guardare.',
        steps:['<b>' + mp('years', 'Calendario › Anni passati') + '</b> (la voce compare solo quando c’è almeno un anno concluso).',
            'Scegli l’anno: si apre in <b>sola lettura</b>.',
            'Una barra in alto ti riporta all’anno attuale.'],
        anim:[SCR({ title:'Anni', icon:'history', col:'#2563eb', sub:'Gli anni passati sono in sola lettura', st:1, say:'Scegli l’anno da consultare', body:[{ btn:'Anno attuale' }, { btn:'Anno passato', g:true, hit:true }] })] });

    // 3 ─ I MIEI TURNI
    const cMe = cat('miei', 'I miei turni', 'person', '#7c3aed', 'La tua pagina, stampa, calendario del telefono');
    T(cMe, { id:'miapagina', t:'La mia pagina', icon:'person',
        sub:'Tutto quello che riguarda te, in una schermata.',
        steps:['<b>☰ › La mia pagina</b> (serve aver scelto chi sei).',
            'Trovi i <b>prossimi 7 giorni</b>, le <b>ore del mese</b> con il saldo da gennaio, le <b>assenze</b> (C.O., straordinari, notte: usati e quanti restano), le tue <b>reperibilità</b> e le <b>note</b>.',
            'In fondo: <b>Le mie ore</b>, <b>Le mie assenze</b>, i turni nel calendario del telefono e la stampa dei tuoi turni.',
            'In Opzioni puoi farla aprire <b>all’avvio</b> al posto del calendario.'],
        anim:[MENU(['me'], 0), SCR({ title:'SARA', icon:'person', col:'#1d4ed8', sub:'La mia pagina', st:1, say:'Turni, ore, assenze e reperibilità', hold:2400,
                body:[{ sec:'Prossimi 7 giorni', ic:'event' }, { chips:['M', 'P', 'N', 'SM', 'R', 'M', 'P'] }, { sec:'Ore del mese', ic:'schedule' }, { bar:64 }, { kv:['Saldo da gennaio a oggi', '+3:20'] }, { sec:'Assenze', ic:'beach_access' }, { kv:['C.O.', '12/31 · restano 19'] }, { kv:['Straordinari', '2/6 · restano 4'] }] })],
        try:{ label:'Apri la mia pagina', run:() => openMyPage(), when:() => has('openMyPage') } });
    T(cMe, { id:'mieiturni', t:'Stampa, PDF o WhatsApp dei miei turni', icon:'picture_as_pdf', when:() => has('openMyCal'),
        sub:'I tuoi turni a calendario, da stampare o mandare.',
        steps:['<b>☰ › La mia pagina</b>, in fondo <b>Stampa, PDF o WhatsApp dei miei turni</b>.',
            'Scegli i mesi: <b>Questo mese</b>, <b>Prossimo mese</b>, <b>3 mesi</b>, <b>Tutto l’anno</b>, oppure tocca i mesi uno per uno.',
            'Poi <b>Stampa</b>, <b>PDF</b> o <b>WhatsApp</b>.'],
        anim:[SCR({ title:'I miei turni', icon:'print', col:'#7c3aed', st:1, say:'Scegli i mesi',
                body:[{ btns:[{ t:'Stampa', ic:'print', g:true }, { t:'PDF', ic:'picture_as_pdf', g:true }, { t:'WhatsApp', ic:'send', g:true }] }, { seg:['Questo mese', 'Prossimo', '3 mesi', 'Anno'], on:2, hit:2 }, { chips:['M', 'P', 'N', 'SM', 'R', 'M', 'P', 'N', 'SM', 'R'] }] }),
            SCR({ title:'I miei turni', icon:'print', col:'#7c3aed', st:2, say:'Poi Stampa, PDF o WhatsApp',
                body:[{ btns:[{ t:'Stampa', ic:'print', g:true }, { t:'PDF', ic:'picture_as_pdf', hit:true }, { t:'WhatsApp', ic:'send', g:true }] }, { seg:['Questo mese', 'Prossimo', '3 mesi', 'Anno'], on:2 }, { chips:['M', 'P', 'N', 'SM', 'R', 'M', 'P', 'N', 'SM', 'R'] }] })],
        try:{ label:'Apri i miei turni', run:() => { openMyPage(); setTimeout(() => openMyCal(), 400); }, when:() => has('openMyPage') } });
    T(cMe, { id:'telefono', t:'I turni nel calendario del telefono', icon:'phone_iphone', when:() => has('openOptionsCal'),
        sub:'I tuoi turni, assenze e reperibilità nel calendario dell’iPhone o di Google, aggiornati da soli.',
        steps:['<b>' + mp('phonecal') + '</b>.',
            '<b>iPhone</b>: tocca <b>iPhone / iPad</b> e conferma <b>Iscriviti</b>.',
            '<b>Google Calendar</b>: tocca <b>Copia il link</b>; dal computer apri calendar.google.com › Altri calendari › + › Da URL e incolla il link.',
            'Si aggiorna da solo, di solito entro un’ora (Google a volte ci mette di più). <b>Scarica ora</b> salva una copia del momento.'],
        anim:[MENU(['cal', 'phonecal'], 0), SCR({ title:'Opzioni', icon:'settings', col:'#64748b', sub:'Calendario del telefono', st:1, say:'iPhone / iPad, poi conferma Iscriviti',
                body:[{ p:'Un calendario con i tuoi turni, le assenze e le reperibilità che si aggiorna da solo.' }, { btn:'iPhone / iPad', ic:'phone_iphone', hit:true }, { btn:'Copia il link', ic:'content_copy', g:true }, { btn:'Scarica ora', ic:'download', g:true }] })],
        try:{ label:'Apri', run:() => openOptionsCal() } });
    T(cMe, { id:'cambionotte', t:'Cambiare la tua notte con un collega', icon:'swap_vert', when:() => has('cnOpen'),
        sub:'L’app ti mostra con chi puoi scambiare la notte senza creare problemi.',
        steps:['Tocca una tua <b>notte</b> nel calendario.',
            'Nel dettaglio tocca <b>Cambia la tua notte con un collega</b>.',
            'Vedi chi ha la notte il giorno prima o il giorno dopo e se il cambio si può fare (a volte con mattina + notte); se un cambio toccherebbe altri giorni, l’app ti dice il motivo.',
            'Il cambio lo inserisce il <b>coordinatore</b>: mettiti d’accordo con il collega e manda la richiesta di <b>Cambio turno</b> dal portale Richieste.'],
        anim:[CAL({ hit:'c2-0', st:0, say:'Tocca la tua notte' }),
            CAL({ st:1, say:'Tocca “Cambia la tua notte”', hit:'cnb', pop:{ title:'Notte', ic:'bedtime', col:'var(--c-N)', icol:'var(--t-N)', sub:'Oggi · ' + (sched('N') || ''), body:[{ sec:'Infermieri in turno', ic:'medical_services' }, { ppl:[['LUCA', 'N'], ['SARA', 'N']] }, { btn:'Cambia la tua notte con un collega', ic:'swap_vert', k:'cnb' }] } }),
            SCR({ title:'Cambia la notte con un collega', icon:'swap_vert', col:'#1e3a8a', st:2, say:'Con chi ha la notte il giorno prima o dopo', hold:2400,
                body:[{ sec:'Con chi ha la notte il giorno dopo', ic:'arrow_downward' }, row('check_circle', 'PAOLA', 'Cambio possibile', '#16a34a'), { sec:'Con chi ha la notte il giorno prima', ic:'arrow_upward' }, row('block', 'GIULIA', 'Toccherebbe altri giorni', '#dc2626'), { note:'Il cambio lo inserisce il coordinatore: manda la richiesta dal portale Richieste.', nc:'#1e3a8a' }] })] });
    T(cMe, { id:'opzioni', t:'Le tue opzioni', icon:'tune',
        sub:'Tema, avvio, colonna in evidenza, orari, notifiche.',
        steps:['<b>' + mp('opts') + '</b>.',
            '<b>Aspetto</b>: tema Chiaro, Scuro o Automatico. <b>Velocità</b>: Modalità leggera (consigliata su iPhone).',
            '<b>Calendario</b>: cosa mostrare all’apertura, partire da oggi, la tua colonna per prima, evidenziare la tua colonna, orari dentro i turni, fasce di reperibilità, colleghi visibili.',
            '<b>Notifiche</b> e <b>calendario del telefono</b>; in fondo <b>Ripristina le mie preferenze</b>.'],
        tips:['Il tema scuro si sceglie in <b>' + mp('opts') + '</b>, alla voce Tema.'],
        anim:[MENU(['imp', 'opts'], 0), SCR({ title:'Opzioni', icon:'settings', col:'#64748b', sub:'Le preferenze di SARA', st:1, say:'Scegli il tema',
                body:[{ grp:'Aspetto' }, { seg:['Chiaro', 'Scuro', 'Automatico'], on:0, hit:1 }, { grp:'Calendario' }, row('first_page', 'La mia colonna per prima', '', '#2563eb', { sw:false }), row('highlight', 'Evidenzia la mia colonna', '', '#2563eb', { sw:true }), row('schedule', 'Orari dentro i turni', '', '#2563eb', { sw:true })] }),
            SCR({ title:'Opzioni', icon:'settings', col:'#64748b', sub:'Le preferenze di SARA', st:2, say:'Accendi e spegni quello che vuoi',
                body:[{ grp:'Aspetto' }, { seg:['Chiaro', 'Scuro', 'Automatico'], on:1 }, { grp:'Calendario' }, row('first_page', 'La mia colonna per prima', '', '#2563eb', { sw:false, hit:true }), row('highlight', 'Evidenzia la mia colonna', '', '#2563eb', { sw:true }), row('schedule', 'Orari dentro i turni', '', '#2563eb', { sw:true })] })],
        try:{ label:'Apri Opzioni', run:() => openOptionsModal(), when:() => has('openOptionsModal') } });

    // 4 ─ NOTIFICHE E NOTE
    const cNo = cat('avvisi', 'Notifiche e note', 'notifications', '#db2777', 'Avvisi, note ai colleghi, chat');
    T(cNo, { id:'campanella', t:'La campanella', icon:'notifications',
        sub:'Gli avvisi sui tuoi turni dentro l’app.',
        steps:['Tocca la <b>campanella</b> in alto: un pallino ti dice che c’è qualcosa di nuovo.',
            'Schede: <b>Da leggere</b>, <b>Tutte</b> e <b>Archivio</b>.',
            'Con <b>Archivia tutte</b> sposti in archivio quelle già viste.'],
        anim:[CAL({ hit:'bell', bellDot:true, st:0, say:'Tocca la campanella' }), SCR({ title:'Notifiche', icon:'notifications', col:'#db2777', st:1, say:'Da leggere, Tutte, Archivio', hold:2200,
                body:[{ seg:['Da leggere', 'Tutte', 'Archivio'], on:0 }, row('edit_calendar', 'Turno cambiato', 'Giovedì: da M a P', '#2563eb'), row('phone_in_talk', 'Reperibilità', 'Domani sei reperibile', '#dc2626'), { btn:'Archivia tutte', ic:'archive', g:true }] })],
        try:{ label:'Apri le notifiche', run:() => openNotifCenter(), when:() => has('openNotifCenter') } });
    T(cNo, { id:'push', t:'Notifiche sul telefono', icon:'notifications_active', when:() => has('pushEnable'),
        sub:'Gli avvisi arrivano anche ad app chiusa.',
        steps:['Scegli prima <b>chi sei</b>: come Ospite non arrivano avvisi.',
            '<b>' + mp('opts') + '</b>, sezione Notifiche: <b>Notifiche sul telefono › Attiva</b> e consenti.',
            'Scegli cosa ricevere: <b>Cambi ai miei turni</b>, <b>Promemoria reperibilità</b> (il giorno prima), <b>Il mio turno di domani</b> (dopo mezzogiorno).',
            'Arrivano con qualche minuto di ritardo. Su iPhone servono l’app installata sulla schermata Home.'],
        anim:[MENU(['imp', 'opts'], 1), SCR({ title:'Opzioni', icon:'settings', col:'#64748b', sub:'Notifiche', st:1, say:'Notifiche sul telefono › Attiva',
                body:[{ grp:'Notifiche' }, row('notifications_active', 'Notifiche sul telefono', 'Spente', '#db2777', { hit:true }), row('edit_calendar', 'Cambi ai miei turni', '', '#64748b', { sw:true }), row('phone_in_talk', 'Promemoria reperibilità', '', '#64748b', { sw:true }), row('event', 'Il mio turno di domani', '', '#64748b', { sw:false })] }),
            SCR({ title:'Opzioni', icon:'settings', col:'#64748b', sub:'Notifiche', st:2, say:'Attive su questo telefono', hold:2000,
                body:[{ grp:'Notifiche' }, row('notifications_active', 'Notifiche sul telefono', 'Attive su questo telefono', '#16a34a'), row('edit_calendar', 'Cambi ai miei turni', '', '#64748b', { sw:true }), row('phone_in_talk', 'Promemoria reperibilità', '', '#64748b', { sw:true }), row('event', 'Il mio turno di domani', '', '#64748b', { sw:true })] })],
        try:{ label:'Apri Opzioni', run:() => openOptionsModal(), when:() => has('openOptionsModal') } });
    T(cNo, { id:'nota', t:'Scrivere una nota', icon:'edit_note', when:() => has('noteOpenEditor'),
        sub:'Un messaggio legato a un giorno: al coordinatore, a un collega o a tutti.',
        steps:['Tocca il giorno nel calendario e poi <b>Scrivi una nota</b> (su una casella vuota si apre subito).',
            '<b>A chi</b>: <b>Coordinatore</b> (la vedete solo tu e lui), <b>Un collega</b> (solo voi due) o <b>Tutti</b>.',
            'Al coordinatore puoi indicare cosa <b>preferiresti</b> quel giorno: Mattina, Pomeriggio, Notte o Riposo.',
            'Scrivi il messaggio e tocca <b>Invia</b>. Con <b>Invia notifica sul telefono</b> arriva anche come notifica (a un collega o a tutti).'],
        tips:['Le tue note le ritrovi in <b>La mia pagina</b>: le puoi modificare o eliminare toccandole. Il coordinatore la segna come vista o gestita.'],
        anim:[CAL({ hit:'c0-0', st:0, say:'Tocca il giorno' }),
            CAL({ st:0, hit:'nb', say:'Poi “Scrivi una nota”', pop:{ title:'Mattina', ic:'wb_sunny', col:'var(--c-M)', icol:'var(--t-M)', sub:'Oggi', body:[{ ppl:[['ANNA', 'M'], ['MARCO', 'm']] }, { sec:'Note del giorno', ic:'sticky_note_2' }, { btn:'Scrivi una nota', ic:'edit_note', k:'nb' }] } }),
            SCR({ title:'Nuova nota', icon:'sticky_note_2', col:'#7c3aed', st:1, say:'A chi: coordinatore, un collega o tutti',
                body:[{ grp:'A chi' }, { seg:['Coordinatore', 'Un collega', 'Tutti'], on:0, hit:1 }, { grp:'Per questo giorno preferirei' }, { seg:['Mattina', 'Pomeriggio', 'Notte', 'Riposo'], on:-1 }, { field:'Messaggio', v:'', ph:'…' }] }),
            SCR({ title:'Nuova nota', icon:'sticky_note_2', col:'#7c3aed', st:3, say:'Scrivi e tocca Invia',
                body:[{ grp:'A chi' }, { seg:['Coordinatore', 'Un collega', 'Tutti'], on:1 }, { field:'Collega', v:'LUCA', sel:true }, { field:'Messaggio', v:'Mi copri il pomeriggio?' }, row('notifications_active', 'Invia notifica sul telefono', 'Arriva sul telefono di LUCA', '#db2777', { sw:true }), { btn:'Invia', ic:'send', hit:true }] })] });
    T(cNo, { id:'chat', t:'Note e chat', icon:'forum', when:() => has('noteOpenHub'),
        sub:'Tutte le note che puoi vedere e le risposte, come una chat.',
        steps:['<b>☰ › Note e chat</b>: le note che puoi vedere, con l’ultima attività in cima. Un numerino ti dice le risposte nuove.',
            'Tocca una nota per aprire la <b>chat</b>: scrivi sotto per rispondere.',
            'Chi ha scritto la nota, chi la riceve e chi ha già risposto vedono le risposte nuove.'],
        anim:[MENU(['notechat'], 0), SCR({ title:'Note e chat', icon:'forum', col:'#7c3aed', st:1, say:'Tocca una nota per la chat',
                body:[row('sticky_note_2', 'LUCA › Tutti', 'Chi viene alla cena di sabato?', '#7c3aed', { hit:true }), row('sticky_note_2', 'Tu › MARCO', 'Mi copri il pomeriggio?', '#7c3aed')] }),
            SCR({ title:'Chi viene alla cena?', icon:'forum', col:'#7c3aed', st:1, say:'Rispondi qui sotto', hold:2200,
                body:[{ note:'LUCA: Chi viene alla cena di sabato?', nc:'#7c3aed' }, { note:'ANNA: Io ci sono!', nc:'#16a34a' }, { note:'Tu: Anche io 👍', nc:'#2563eb' }, { field:'Rispondi', v:'', ph:'Scrivi una risposta…' }] })],
        try:{ label:'Apri Note e chat', run:() => noteOpenHub() } });
    T(cNo, { id:'messaggi', t:'I messaggi all’apertura', icon:'campaign',
        sub:'Avvisi che compaiono quando apri l’app.',
        steps:['All’apertura può comparire un <b>avviso</b> (per esempio quello rosso: “L’app viene aggiornata spesso, in caso di dubbio verifica i turni cartacei in guardiola”).',
            'Il coordinatore può aggiungere <b>messaggi per tutti</b> per i giorni che sceglie: una barra mostra quanto resta e si chiudono da soli.',
            'Se più messaggi sono in coda, compaiono uno dopo l’altro.'],
        anim:[SCR({ title:'ATTENZIONE', icon:'warning', col:'#dc2626', st:0, say:'L’avviso compare all’apertura', hold:2400, body:[{ p:'L’app viene aggiornata spesso. In caso di dubbio, verifica sempre i turni cartacei in guardiola.' }, { bar:100 }] }),
            SCR({ title:'AVVISO', icon:'campaign', col:'#2563eb', st:1, say:'Poi i messaggi del coordinatore', hold:2400, body:[{ p:'Riunione di reparto giovedì alle 14:00.' }, { bar:70 }] })] });

    // 5 ─ REPERIBILITÀ
    const cRe = cat('reperibilita', 'Reperibilità', 'phone_in_talk', '#dc2626', 'Fasce, reperibili del mese, cessioni');
    T(cRe, { id:'fasce', t:'Le fasce nel calendario', icon:'phone_in_talk',
        sub:'Chi è reperibile e quali fasce copre.',
        steps:['La reperibilità parte alle <b>13:00</b> del giorno e finisce alle <b>13:00</b> del giorno dopo, in 4 fasce: 13-20, 20-00, 00-07, 07-13.',
            'Nella casella del titolare compare <b>REPERIBILE</b> con le fasce: <b>verde</b> = la copre lui.',
            '<b>Rossa</b> con un nome = fascia ceduta a quel collega. Chi la riceve la vede <b>lampeggiare</b> giallo/rosso con il nome del titolare.',
            'Se un reperibile è in <b>permesso notte</b>, la casella lo segnala.'],
        tips:['Le fasce si possono nascondere: Opzioni › Calendario › Fasce di reperibilità.'],
        anim:[CAL({ rep:true, st:1, say:'Verde: la fascia la copre il titolare', hold:2400 }), CAL({ rep:'ced', st:2, say:'Rossa: ceduta. Lampeggia per chi la riceve', hold:3000 })] });
    T(cRe, { id:'repmese', t:'Reperibili del mese', icon:'table_view', when:() => has('openRepList'),
        sub:'La tabella con chi è reperibile in ogni fascia, cessioni comprese.',
        steps:['<b>' + mp('replist') + '</b>.',
            'Per ogni giorno le 4 fasce con chi le copre davvero; le cessioni sono in giallo.',
            'Con le frecce cambi mese; <b>Stampa</b> o <b>Scarica PDF</b> per averla su carta.'],
        anim:[MENU(['cal', 'replist'], 0), SCR({ title:'Reperibili del mese', icon:'phone_in_talk', col:'#dc2626', sub:'Già con le cessioni', st:1, say:'Le 4 fasce, giorno per giorno', hold:2400,
                body:[{ seg:['‹', 'NOVEMBRE', '›'], on:1 }, { kv:['Lun 13-20 / 20-00', 'SARA'] }, { kv:['Mar 00-07 / 07-13', 'SARA'] }, { note:'Mar 13-20 › LUCA (ceduta da ANNA)', nc:'#eab308' }, { btns:[{ t:'Stampa', ic:'print', g:true }, { t:'Scarica PDF', ic:'picture_as_pdf', g:true }] }] })],
        try:{ label:'Apri Reperibili del mese', run:() => openRepList() } });
    T(cRe, { id:'cedi', t:'Cedere una reperibilità', icon:'swap_horiz',
        sub:'Si fa dall’area Richieste e compare subito nel calendario.',
        steps:['Apri l’area <b>Richieste</b> e tocca <b>+</b>.',
            'Tipo: <b>Cessione reperibilità</b>. Scegli <b>quale tua reperibilità</b> cedere (l’elenco mostra solo le tue).',
            'Spunta le <b>fasce</b> (o “Tutta la fascia”) e scegli <b>a chi</b>.',
            'Conferma: le fasce cedute compaiono <b>subito</b> nel calendario, senza aspettare.'],
        go:'req-cessione' });

    // 6 ─ FERIE E ASSENZE
    const cFe = cat('ferie', 'Ferie e assenze', 'beach_access', '#16a34a', 'Giorni consigliati, conteggi, ferie desiderate');
    T(cFe, { id:'consigli', t:'Ferie e permessi consigliati', icon:'beach_access', when:() => has('openFerieAdvice'),
        sub:'Quando conviene chiedere ferie o permessi.',
        steps:['<b>' + mp('ferie') + '</b>.',
            'Scheda <b>Ferie</b>: i periodi liberi da oggi a fine anno. Scheda <b>Permessi e recuperi</b>: i giorni singoli.',
            'Colori: <b>verde</b> consigliato, <b>arancione</b> un solo posto libero / al limite, <b>rosso</b> sconsigliato.',
            'Vedi <b>Tutti i periodi</b> o <b>Per mese</b>; tocca un periodo per andarci nel calendario. Le regole le decide il coordinatore.'],
        anim:[MENU(['ferie'], 0), SCR({ title:'Vista d’insieme', icon:'beach_access', col:'#16a34a', sub:'Ferie e permessi', st:1, say:'Ferie o Permessi e recuperi',
                body:[{ seg:['Ferie', 'Permessi e recuperi'], on:0 }, { note:'Consigliato · Un solo posto libero · Sconsigliato', nc:'#16a34a' }, { seg:['Tutti i periodi', 'Per mese'], on:0 }, row('event_available', '3–9 dicembre', '7 giorni · almeno 2 posti', '#16a34a', { hit:true }), row('event_available', '14–18 dicembre', '5 giorni · 1 posto libero', '#f59e0b')] })],
        try:{ label:'Apri Ferie e permessi', run:() => openFerieAdvice() } });
    T(cFe, { id:'assenze', t:'Conteggio assenze', icon:'event_busy', when:() => has('openAbsModal'),
        sub:'Congedi, permessi, malattie e giornate particolari di tutti.',
        steps:['<b>' + mp('assenze') + '</b>; vista <b>Anno</b> o <b>Mese</b>.',
            'Ogni anno: <b>31</b> giorni di congedo ordinario, <b>6</b> permessi straordinari e <b>2</b> permessi notte (il coordinatore può avere impostato spettanze diverse per qualcuno).',
            'Un permesso notte usa anche un permesso straordinario. Le assenze che cadono su un riposo non contano.',
            'Tocca un nome per il dettaglio della persona.'],
        anim:[MENU(['assenze'], 0), SCR({ title:'Conteggio assenze', icon:'event_busy', col:'#b45309', st:3, say:'Tocca un nome per il dettaglio',
                body:[{ seg:['Anno', 'Mese'], on:0 }, { kv:['', 'C.O. · Straord. · Notte'] }, row('person', 'ANNA', '18/31 · 2/6 · 1/2', '#b45309'), row('person', 'SARA', '12/31 · 2/6 · 0/2', '#b45309', { hit:true }), row('person', 'LUCA', '25/31 · 5/6 · 2/2', '#b45309')] })],
        try:{ label:'Apri Conteggio assenze', run:() => openAbsModal() } });
    T(cFe, { id:'desiderate', t:'Calendario ferie desiderate', icon:'beach_access', when:() => has('openDesiderate'),
        sub:'Scrivi le ferie che vorresti, nella tua colonna, prima della riunione.',
        steps:['<b>' + mp('desid') + '</b>.',
            'In basso a destra tocca il cerchio: si apre la <b>ruota</b>. Scegli <b>Ferie</b>, <b>Permesso</b>, <b>Cancella</b> o <b>Nota</b>.',
            'Tocca i giorni <b>nella tua colonna</b> (tieni premuto e trascina per tanti giorni). <b>Dal… al…</b> riempie un periodo intero.',
            'Viste <b>Tutti</b>, <b>Colonne</b>, <b>Anno</b>; i contatori mostrano ferie e permessi usati. Il <b>quinto giorno</b> di ferie di fila diventa riposo.',
            'Un giorno <b>barrato</b> è già stato messo nei turni dal coordinatore e non si cambia più.'],
        tips:['Dentro il calendario ferie desiderate c’è anche il tasto <b>?</b> in alto: un tutorial a voce che ti illumina i tasti uno per uno.'],
        anim:[MENU(['cal', 'desid'], 0), SCR({ title:'Ferie desiderate', icon:'beach_access', col:'#16a34a', sub:'Scrivi le ferie che vorresti', st:1, say:'Apri la ruota e scegli Ferie', wheel:true,
                body:[{ seg:['Tutti', 'Colonne', 'Anno'], on:0 }, { kv:['Ferie', '12/31'] }, { kv:['Permessi', '1/6'] }] }),
            SCR({ title:'Ferie desiderate', icon:'beach_access', col:'#16a34a', sub:'La tua colonna: TU', st:2, say:'Tocca i giorni della tua colonna', hold:2200,
                body:[{ seg:['Tutti', 'Colonne', 'Anno'], on:0 }, { chips:['f', 'f', 'f', 'f', 'R', '', ''] }, { kv:['Ferie', '16/31'] }, { note:'Il 5° giorno di fila è riposo e non scala le ferie', nc:'#16a34a' }] })],
        try:{ label:'Apri le ferie desiderate', run:() => openDesiderate() } });

    // 7 ─ ORE ED EQUITÀ
    const cOr = cat('ore', 'Ore ed equità', 'query_stats', '#0f766e', 'Ore lavorate, saldo, equità dell’anno');
    T(cOr, { id:'ore', t:'Conteggio orario', icon:'query_stats', when:() => has('openHoursModal'),
        sub:'Ore lavorate e saldo rispetto al contratto.',
        steps:['<b>' + mp('ore') + '</b>: le ore del mese di tutti, settimana per settimana (<b>Riepilogo</b> o <b>Foglio</b>).',
            'Colori: <b>rosso</b> sotto le ore, <b>azzurro</b> in pari, <b>verde</b> sopra.',
            'Il contratto conta 6 ore al giorno dal lunedì al sabato; ferie e assenze giustificate contano come giornata.',
            'Tocca un nome per il <b>dettaglio</b>: settimana, mese, anno, con il grafico.'],
        anim:[MENU(['ore'], 0), SCR({ title:'Conteggio orario', icon:'query_stats', col:'#0f766e', st:3, say:'Tocca un nome per il dettaglio',
                body:[{ seg:['Riepilogo', 'Foglio'], on:0 }, { seg:['‹', 'NOVEMBRE', '›'], on:1 }, row('person', 'ANNA', '+2:10', '#16a34a'), row('person', 'SARA', '0:00', '#3b82f6', { hit:true }), row('person', 'LUCA', '−4:30', '#dc2626')] }),
            SCR({ title:'SARA', icon:'query_stats', col:'#0f766e', sub:'Dettaglio ore', st:3, say:'Settimana, mese o anno', hold:2200, body:[{ seg:['SETTIMANA', 'MESE', 'ANNO'], on:1 }, { bar:72 }, { kv:['Fatte', '112:30'] }, { kv:['Dovute', '156:00'] }] })],
        try:{ label:'Apri Conteggio orario', run:() => openHoursModal() } });
    T(cOr, { id:'equita', t:'Equità dell’anno', icon:'balance', when:() => has('openEquity'),
        sub:'Notti, weekend, festivi e reperibilità di ognuno, rispetto alla media.',
        steps:['<b>' + mp('equita') + '</b>; scegli <b>Fino a oggi</b> o <b>Anno intero</b>.',
            'Categorie: <b>Panoramica</b>, <b>Notti e weekend</b>, <b>Reperibilità</b>, <b>Chi lavora con chi</b>, <b>Diurnisti e turnisti</b>.',
            'Ogni valore è confrontato con la media della squadra.'],
        anim:[MENU(['equita'], 0), SCR({ title:'Equità dell’anno', icon:'balance', col:'#0f766e', st:1, say:'Scegli la categoria',
                body:[{ seg:['Fino a oggi', 'Anno intero'], on:0 }, { seg:['Panoramica', 'Notti', 'Reperib.', 'Coppie'], on:0, hit:1 }, row('dark_mode', 'ANNA', 'Notti 42 · media 40', '#1e3a8a'), row('dark_mode', 'SARA', 'Notti 38 · media 40', '#1e3a8a')] })],
        try:{ label:'Apri Equità dell’anno', run:() => openEquity() } });

    // 8 ─ AREA RICHIESTE
    const cRq = cat('richieste', 'Area Richieste', 'assignment', '#4f46e5', 'Ferie, permessi, cambi turno, cessioni');
    const REQ_LIST = (hit, extra) => REQ(Object.assign({ fab:true, body:[{ sec:'In Attesa d’Azione', sc:'#ef4444' },
        { req:['beach_access', '#16a34a', 'SARA', 'Congedo ordinario • 03/12 - 09/12', '⏳ Attesa', '#d97706'], pend:true },
        { sec:'Inserite a: Novembre', ic:'calendar_month' }, { req:['swap_horiz', '#2563eb', 'LUCA', 'Cambio Turno • 20/11 ↔ ANNA'], ok:true }] }, extra || {}));
    T(cRq, { id:'req-apri', t:'Aprire l’area Richieste', icon:'assignment',
        sub:'Il portale delle richieste è dentro l’app dei turni.',
        steps:['Tocca la <b>maniglia viola</b> sul bordo destro dello schermo (oppure trascinala verso sinistra).',
            'Oppure <b>' + mp('req') + '</b>.',
            'Entri già con il tuo nome (quello scelto in “Chi sei?”). Con la freccia in alto a sinistra torni ai turni.'],
        anim:[CAL({ hit:'handle', st:0, say:'Tocca la maniglia a destra' }), REQ_LIST(null, { enter:'r', st:0, say:'Ecco le richieste', hold:1800 }), MENU(['link', 'req'], 1)],
        try:{ label:'Apri le Richieste', run:() => window.openRichiestePanel && window.openRichiestePanel(), when:() => typeof window.openRichiestePanel === 'function' } });
    T(cRq, { id:'req-nuova', t:'Fare una richiesta', icon:'add_circle',
        sub:'Ferie, permessi, recuperi e tutto il resto.',
        steps:['Nell’area Richieste tocca <b>+</b> in basso a destra.',
            'Scegli il <b>Tipo di Richiesta</b>: congedo ordinario (anche dell’anno precedente), permessi straordinari (anche a ore), recupero ore, permessi speciali (matrimonio, studio, sportivo, notte, lutto, sindacale), aspettativa, cessione reperibilità, cambio turno.',
            'Per ferie e permessi vedi subito il <b>saldo</b>: quanti giorni hai già usato e quanti ne restano. Se chiedi più di quanti ne restano l’app ti avvisa.',
            'Metti <b>Dal giorno</b>, <b>Al giorno</b> (facoltativo), i <b>giorni effettivi</b> (anche 0,5) e le <b>note</b>; tocca <b>INVIA RICHIESTA</b>.',
            'Controlla il <b>riepilogo</b> e tocca <b>Sì, corretto</b> (o <b>Torna indietro</b> per correggere).'],
        tips:['Le richieste di assenza devono essere valutate e autorizzate dal coordinamento.'],
        anim:[REQ_LIST(true, { hit:'fab', st:0, say:'Tocca +' }),
            SCR({ title:'Nuova Richiesta', icon:'add', col:'#2563eb', st:1, say:'Scegli il tipo di richiesta', body:[{ field:'Operatore', v:'SARA' }, { field:'Tipo di Richiesta', v:'Congedo ordinario', sel:true, hit:true }, { field:'Dal Giorno', v:'gg/mm/aaaa', ph:true }] }),
            SCR({ title:'Nuova Richiesta', icon:'add', col:'#2563eb', st:2, say:'Il saldo: quanti te ne restano', hold:1700, body:[{ field:'Tipo di Richiesta', v:'Congedo ordinario', sel:true }, { note:'Congedo ordinario: già usati o in calendario 12 su 31 — restano 19', nc:'#10b981' }, { field:'Dal Giorno', v:'03/12' }, { field:'Al Giorno', v:'09/12' }] }),
            SCR({ title:'Nuova Richiesta', icon:'add', col:'#2563eb', st:3, say:'Tocca INVIA RICHIESTA', body:[{ field:'Giorni effettivi di assenza', v:'5' }, { field:'Note / Dettagli', v:'Ferie di dicembre' }, { btn:'INVIA RICHIESTA', hit:true }] }),
            SCR({ title:'Riepilogo Richiesta', icon:'fact_check', col:'#2563eb', st:4, say:'Controlla e tocca “Sì, corretto”', body:[{ p:'Controlla che sia tutto corretto prima di inviare.' }, { kv:['Tipo', 'Congedo ordinario'] }, { kv:['Periodo', '03/12 › 09/12'] }, { kv:['Giorni', '5'] }, { btns:[{ t:'Torna indietro', g:true }, { t:'Sì, corretto', hit:true }] }] }),
            REQ_LIST(false, { st:4, say:'Inviata: è in cima, in attesa', hold:2000 })] });
    T(cRq, { id:'req-cambio', t:'Chiedere un cambio turno', icon:'swap_horiz',
        sub:'Stesso giorno o cambio notte: l’app controlla che sia giusto.',
        steps:['Tipo <b>Cambio Turno</b>, poi scegli: <b>Turno dello stesso giorno</b> oppure <b>Cambio notte con un collega</b> (giorni diversi).',
            '<b>Stesso giorno</b>: data, con chi fai il cambio, il tuo turno e il suo (Mattina, Pomeriggio, Notte).',
            'L’app <b>confronta con il programma turni</b>: se i turni indicati non corrispondono, ti dice cosa non va e la richiesta non parte.',
            '<b>Cambio notte</b>: scegli la tua notte e una delle notti del collega (prese dal programma turni). Con chi ha la notte il giorno prima o dopo della tua il cambio si fa con mattina + notte.'],
        tips:['L’orario nella casella dei turni sarà l’orario effettivo di lavoro: il cambio non crea credito o debito di minuti significativo.'],
        anim:[SCR({ title:'Nuova Richiesta', icon:'add', col:'#2563eb', st:0, say:'Che cambio vuoi fare?', body:[{ field:'Tipo di Richiesta', v:'Cambio Turno', sel:true }, { grp:'Che cambio vuoi fare?' }, { opts:['Turno dello stesso giorno', 'Cambio notte con un collega'], on:[0], hit:0 }] }),
            SCR({ title:'Nuova Richiesta', icon:'add', col:'#2563eb', st:1, say:'Con chi e quali turni', body:[{ field:'Con chi fai il cambio?', v:'LUCA', sel:true }, { grp:'Turni da scambiare quel giorno' }, { btns:[{ t:'Il tuo: Mattina', g:true }, { t:'Il suo: Pomeriggio', g:true }] }, { field:'Il Giorno (Data)', v:'20/11' }, { btn:'INVIA RICHIESTA', hit:true }] }),
            SCR({ title:'Controllo turni…', icon:'fact_check', col:'#dc2626', st:2, say:'Se non corrisponde, te lo dice', hold:2400, body:[{ note:'⚠️ Il cambio turno indicato non corrisponde al programma turni: il turno di LUCA quel giorno risulta Notte, non Pomeriggio.', nc:'#dc2626' }] }),
            SCR({ title:'Nuova Richiesta', icon:'add', col:'#4f46e5', st:3, say:'Cambio notte: la tua e la sua', hold:2200, body:[{ opts:['Turno dello stesso giorno', 'Cambio notte con un collega'], on:[1] }, { field:'La tua notte da cambiare', v:'Gio 20/11', sel:true }, { field:'Notte del collega', v:'Ven 21/11 (giorno dopo)', sel:true }, { note:'Notte vicina alla tua: il cambio si fa con mattina + notte.', nc:'#4f46e5' }] })] });
    T(cRq, { id:'req-cessione', t:'Cedere una reperibilità', icon:'phone_forwarded',
        sub:'Le fasce cedute compaiono subito nel calendario turni.',
        steps:['Tipo <b>Cessione reperibilità</b>.',
            '<b>Quale tua reperibilità vuoi cedere?</b> L’elenco mostra solo le tue, prese dal calendario.',
            'Spunta le <b>fasce</b>: 13:00-20:00, 20:00-00:00, 00:00-07:00 e 07:00-13:00 (del giorno dopo), oppure <b>Tutta la fascia</b>.',
            'Scegli <b>a chi</b> la cedi e invia: è inserita <b>in automatico</b> nel programma turni (non serve spuntarla).'],
        anim:[SCR({ title:'Nuova Richiesta', icon:'add', col:'#4338ca', st:1, say:'Scegli la tua reperibilità', body:[{ field:'Tipo di Richiesta', v:'Cessione reperibilità', sel:true }, { field:'Quale tua reperibilità vuoi cedere?', v:'Sab 22/11', sel:true, hit:true }] }),
            SCR({ title:'Nuova Richiesta', icon:'add', col:'#4338ca', st:2, say:'Spunta le fasce da cedere', body:[{ grp:'Fasce di Reperibilità' }, { opts:['Tutta la fascia (tutte e 4)', '13:00 - 20:00', '20:00 - 00:00', '00:00 - 07:00 (giorno dopo)', '07:00 - 13:00 (giorno dopo)'], on:[2, 3], sq:true, hit:3 }] }),
            SCR({ title:'Nuova Richiesta', icon:'add', col:'#4338ca', st:3, say:'A chi la cedi, poi invia', body:[{ field:'Con chi fai il cambio?', v:'MARCO', sel:true }, { btn:'INVIA RICHIESTA', hit:true }] }),
            CAL({ rep:'ced', st:3, say:'Subito nel calendario: rossa per te, lampeggiante per lui', hold:2600 })] });
    T(cRq, { id:'req-stati', t:'Seguire una richiesta', icon:'fact_check',
        sub:'Colori e stati: a che punto è.',
        steps:['In alto, in <b>In Attesa d’Azione</b>, ci sono le richieste non ancora messe nei turni.',
            'Per le assenze un’etichetta dice l’approvazione: <b>✓ Approvata</b>, <b>✗ Rifiutata</b> o <b>⏳ Attesa</b>. Aprendo una richiesta non ancora inserita si può aggiornare l’esito e toccare <b>CONFERMA MODIFICHE</b>.',
            'Quando chi fa i turni l’ha inserita, diventa <b>verde</b> e scende nello storico, raggruppata per mese (tocca il mese per aprirlo).',
            'Dal dettaglio, il tasto <b>calendario</b> accanto al periodo apre i turni su quella data.'],
        anim:[REQ_LIST(false, { hit:'r0', st:0, say:'Tocca una richiesta' }),
            SCR({ title:'Dettaglio Richiesta', icon:'description', col:'#2563eb', st:1, say:'Esito dell’approvazione',
                body:[{ kv:['Stato Inserimento Turni', '⏳ In attesa'] }, { kv:['Tipo Richiesta', 'Congedo ordinario'] }, { kv:['Periodo', 'Dal 03/12 al 09/12'] }, { opts:['Sì, Approvato', 'No, Rifiutato', 'In Attesa'], on:[0] }, { btn:'CONFERMA MODIFICHE', hit:true }] }),
            REQ(Object.assign({ st:2, say:'Inserita nei turni: diventa verde', hold:2200, fab:true, body:[{ sec:'Inserite a: Novembre', ic:'calendar_month' }, { req:['beach_access', '#16a34a', 'SARA', 'Congedo ordinario • 03/12 - 09/12', '✓ Approvata', '#059669'], ok:true }, { req:['swap_horiz', '#2563eb', 'LUCA', 'Cambio Turno • 20/11 ↔ ANNA'], ok:true }] }))] });
    T(cRq, { id:'req-modifica', t:'Modificare o ritirare una richiesta', icon:'edit',
        sub:'Finché non è inserita nei turni, puoi correggerla.',
        steps:['Tocca la tua richiesta nella bacheca.',
            '<b>Modifica</b>: riapre il modulo per correggerla. <b>Ritira</b>: la nasconde (per gli altri compare come “Richiesta Ritirata / Oscurata”).',
            'Una richiesta ritirata si può <b>Ripristinare</b> aprendola.',
            'Le richieste già <b>inserite nei turni</b> (verdi) le può cambiare solo l’amministratore.'],
        anim:[REQ_LIST(false, { hit:'r0', st:0, say:'Tocca la tua richiesta' }),
            SCR({ title:'Dettaglio Richiesta', icon:'description', col:'#2563eb', st:1, say:'Modifica o Ritira', body:[{ kv:['Operatore', 'SARA'] }, { kv:['Periodo', 'Dal 03/12 al 09/12'] }, { kv:['Note', 'Ferie di dicembre'] }, { btns:[{ t:'Modifica', ic:'edit', hit:true }, { t:'Ritira', ic:'visibility_off', g:true }] }] }),
            SCR({ title:'Modifica Richiesta', icon:'edit', col:'#2563eb', st:1, say:'Correggi e salva', hold:1600, body:[{ field:'Al Giorno', v:'10/12' }, { field:'Giorni effettivi di assenza', v:'6' }, { btn:'SALVA MODIFICHE', hit:true }] })] });
    T(cRq, { id:'req-altro', t:'Cercare, consigli, manuale', icon:'search',
        sub:'Gli altri tasti in alto nell’area Richieste.',
        steps:['<b>Cerca</b>: scrivi un nome o un tipo per filtrare la bacheca.',
            '<b>Libro</b>: il manuale con le istruzioni del portale (si apre da solo la prima volta).',
            '<b>Lampadina</b>: <b>Note e Consigli</b>, una bacheca visibile a tutti per suggerimenti, idee o problemi trovati.',
            '<b>Freccia in giù</b>: scarica una copia (backup) di tutte le richieste.'],
        anim:[REQ_LIST(false, { hit:'search', st:0, say:'Cerca per nome o tipo' }), REQ_LIST(false, { hit:'man', st:1, say:'Il manuale' }), REQ_LIST(false, { hit:'bulb', st:2, say:'Note e consigli per tutti' }),
            SCR({ title:'Note e Consigli', icon:'lightbulb', col:'#eab308', st:2, say:'Scrivi un suggerimento', hold:1800, body:[{ p:'Inserisci qui suggerimenti, idee o bug riscontrati. Questa sezione è visibile a tutti.' }, { field:'Nuova nota', v:'Si potrebbe…' }, { btn:'AGGIUNGI NOTA', hit:true }] })] });
    T(cRq, { id:'req-nome', t:'Cambiare nome dal computer', icon:'swap_horiz',
        sub:'Sul PC condiviso, per fare una richiesta a nome tuo.',
        steps:['Dal <b>computer</b> (con il mouse) accanto a “LOGGATO COME” c’è il pulsante <b>CAMBIA</b>.',
            'Scegli il tuo nome e tocca <b>SALVA ED ENTRA</b>; <b>ANNULLA</b> lascia quello di prima.',
            'Sul telefono il pulsante non c’è: lì il nome è quello scelto nell’app dei turni.'],
        anim:[REQ_LIST(false, { hit:'cambia', st:0, say:'CAMBIA accanto al nome', pc:true }), SCR({ title:'Cambia nome', icon:'badge', col:'#2563eb', st:1, say:'Scegli e salva', body:[{ field:'Seleziona il tuo nome per continuare', v:'MARCO', sel:true }, { btn:'SALVA ED ENTRA', hit:true }, { btn:'ANNULLA', g:true }] })] });

    // 9 ─ SQUADRA E TEMPO LIBERO
    const cSq = cat('squadra', 'Squadra e tempo libero', 'celebration', '#d97706', 'Uscite, ruota della sfiga, condividi');
    T(cSq, { id:'uscita', t:'Organizza un’uscita', icon:'restaurant', when:() => has('openDinnerModal'),
        sub:'Trova il giorno in cui siete liberi in più, infermieri e autisti.',
        steps:['<b>' + mp('dinner') + '</b>.',
            'Scegli il <b>mese</b> e il <b>momento</b>: <b>Colazione</b> (non può chi fa la mattina), <b>Pranzo</b> (mattina o pomeriggio), <b>Cena</b> (pomeriggio o notte).',
            'Togli chi non viene (infermieri e autisti) e tocca <b>Cerca il giorno migliore</b>.',
            'I giorni sono in ordine di quanti sono liberi; per chi non può c’è il motivo (turno, ferie, malattia…).'],
        anim:[MENU(['svago', 'dinner'], 0), SCR({ title:'Organizza un’uscita', icon:'restaurant', col:'#ea580c', st:1, say:'Mese e momento',
                body:[{ grp:'Mese' }, { seg:['Nov', 'Dic', 'Gen'], on:1 }, { grp:'Momento' }, { seg:['Colazione', 'Pranzo', 'Cena'], on:2 }, { grp:'Chi viene' }, { opts:['ANNA', 'LUCA', 'SARA'], on:[0, 1, 2], sq:true }, { btn:'Cerca il giorno migliore', ic:'search', hit:true }] }),
            SCR({ title:'Organizza un’uscita', icon:'restaurant', col:'#ea580c', st:3, say:'Il giorno migliore in cima', hold:2400, body:[row('celebration', 'Sabato 13 dicembre', '9 liberi su 10', '#16a34a'), row('event', 'Venerdì 5 dicembre', '8 liberi · LUCA: Pomeriggio', '#f59e0b')] })],
        try:{ label:'Organizza un’uscita', run:() => openDinnerModal() } });
    T(cSq, { id:'ruota', t:'La ruota della sfiga', icon:'casino', when:() => has('openWheelModal'),
        sub:'Estrai a sorte chi tocca.',
        steps:['<b>' + mp('wheel') + '</b>.',
            '<b>Chi partecipa?</b> Spunta almeno 2 colleghi e tocca <b>AVANTI</b>.',
            'Scegli: <b>Smista le fasce orarie</b> (metti l’ora d’inizio, la fine è sempre alle 06:30: il turno si divide in 3 fasce uguali e la ruota assegna chi tocca) oppure <b>Estrazione a caso, per ridere</b>.',
            'Tocca <b>GIRA</b> e scopri chi ha scelto la sfiga!'],
        anim:[MENU(['svago', 'wheel'], 0), SCR({ title:'La ruota della sfiga', icon:'casino', col:'#db2777', st:1, say:'Chi partecipa?', body:[{ opts:['ANNA', 'LUCA', 'SARA', 'MARCO'], on:[0, 1, 3], sq:true }, { btn:'AVANTI', ic:'arrow_forward', hit:true }] }),
            SCR({ title:'La ruota della sfiga', icon:'casino', col:'#db2777', st:2, say:'Fasce orarie o per ridere', body:[row('schedule', 'Smista le fasce orarie', 'Il turno diviso in 3 fasce', '#2563eb'), row('theater_comedy', 'Estrazione a caso, per ridere', 'Con battuta finale', '#db2777', { hit:true })] }),
            SCR({ title:'La ruota della sfiga', icon:'casino', col:'#db2777', st:3, say:'GIRA!', hold:2600, spin:true, body:[] })],
        try:{ label:'Apri la ruota', run:() => openWheelModal() } });
    T(cSq, { id:'condividi', t:'Condividi l’app', icon:'share', when:() => has('shareAppWhatsApp'),
        sub:'Mandala su WhatsApp a chi non ce l’ha.',
        steps:['<b>' + mp('share') + '</b>.',
            'Si apre WhatsApp con un messaggio già pronto: il link dell’app e come metterla sulla schermata Home (Android e iPhone).',
            'Scegli a chi mandarlo.'],
        anim:[MENU(['share'], 0)] });
    T(cSq, { id:'autisti', t:'I turni degli autisti', icon:'airport_shuttle',
        sub:'L’app degli autisti soccorritori.',
        steps:['<b>☰ › Collegamenti › Turni autisti</b> apre l’app degli autisti in una nuova scheda.',
            'Sul computer c’è anche il tasto <b>A.S. Autisti</b> in alto.',
            'Nel dettaglio di una casella vedi anche gli autisti di quel giorno.'],
        anim:[MENU(['link', 'as'], 0)] });

    // 10 ─ COORDINATORE E ADMIN
    const cGe = cat('gestione', 'Coordinatore e admin', 'supervisor_account', '#0b6e7f', 'Accesso riservato, con password');
    T(cGe, { id:'coord', t:'Area coordinatore', icon:'supervisor_account', when:() => has('openCoordLoginModal'),
        sub:'Riservata al coordinatore: serve la password.',
        steps:['<b>' + mp('coord') + '</b> e la password.',
            'Le sezioni sono a sinistra (sul telefono in alto, da scorrere).',
            '<b>Torna al calendario</b> per uscire tenendo l’accesso, <b>Esci da coordinatore</b> per chiuderlo.'],
        coordList:true,
        anim:[MENU(['coord'], 0), SCR({ title:'Coordinamento', icon:'supervisor_account', col:'#0f2a63', sub:'Infermieri', st:1, say:'Le sezioni del coordinatore', hold:2400,
                body:[row('space_dashboard', 'Panoramica', '', '#2563eb'), row('fact_check', 'Da controllare', '', '#2563eb'), row('edit_calendar', 'Modifica turni', '', '#2563eb'), row('group', 'Operatori', '', '#2563eb'), row('sticky_note_2', 'Note', '', '#2563eb')] })] });
    T(cGe, { id:'modifica', t:'Modificare i turni con la ruota', icon:'edit_calendar', when:() => has('openCoordLoginModal'),
        sub:'Per il coordinatore: la ruota strumenti di Modifica turni.',
        steps:['Area coordinatore › <b>Modifica turni</b>: in basso a destra c’è la <b>ruota strumenti</b>.',
            'La ruota ha quattro facce: <b>Turni</b> (turni singoli e sequenze come +5 = P M N SM R), <b>Assenze</b> (con permesso a ore e ore a mano), <b>Reperibilità</b> (aggiungi, sposta, fasce e cessioni, elimina) e <b>Operatori</b>.',
            'Scegli lo strumento e tocca le caselle; le modifiche restano <b>evidenziate</b> e in sospeso.',
            'Tocca <b>Salva</b> per renderle valide per tutti (gli interessati ricevono l’avviso), <b>Esci</b> per uscire.'],
        anim:[CAL({ wheel:true, st:1, say:'La ruota strumenti, in basso a destra', hold:2400 }), CAL({ wheel:true, hit:'c0-3', st:2, say:'Scegli lo strumento e tocca la casella' }), CAL({ wheel:true, st:3, pend:true, say:'Poi Salva', hold:2000 })] });
    T(cGe, { id:'admin', t:'Area admin', icon:'admin_panel_settings', when:() => has('openAdminLoginModal'),
        sub:'Riservata all’amministratore: impostazioni dell’app per tutti.',
        steps:['<b>' + mp('admin') + '</b> e la password.',
            'Le sezioni sono elencate qui sotto.'],
        adminList:true,
        anim:[MENU(['admin'], 0)] });

    // ── app AUTISTI: stesse funzioni, parole e voci adattate ────────────────
    // (sull'app infermieri questo pezzo non fa nulla)
    const AUT = has('openRaceModal') && pathOk(['link', 'veicoli']);
    if(AUT) {
        const SWAP = [['Infermieri in turno', 'Autisti in turno'], ['medical_services', 'airport_shuttle'], ['Turni Infermieri 118', 'Turni Autisti 118'],
            ['Ogni <b>colonna</b> è un infermiere', 'Ogni <b>colonna</b> è un autista'], ['(anche i diurnisti), gli autisti,', '(anche i diurnisti), gli infermieri di quel giorno,']];
        const fix = v => {
            if(typeof v === 'string') { if(v === 'Infermieri') return 'Autisti'; SWAP.forEach(([a, b]) => { v = v.split(a).join(b); }); return v; }
            if(Array.isArray(v)) return v.map(fix);
            if(v && typeof v === 'object' && !v.topics) { Object.keys(v).forEach(k => { if(k !== 'cat' && typeof v[k] !== 'function') v[k] = fix(v[k]); }); }
            return v;
        };
        const tp = id => { for(const c of C) { const t = c.topics.find(x => x.id === id); if(t) return t; } return null; };
        C.forEach(c => c.topics.forEach(fix));
        // calendario: la legenda ha una voce sua; gli anni passati sono dentro Calendario
        const sig = tp('sigle'), at = cCal.topics.indexOf(sig) + 1;
        const leg = { id:'legenda', t:'Legenda dei colori', icon:'palette', cat:cCal, when:() => has('openColorLegend'),
            sub:'Cosa vuol dire ogni colore e ogni segno del calendario.',
            steps:['<b>' + mp('legend') + '</b>.',
                'In alto i colori dei <b>turni</b>, dei <b>diurnisti</b> e delle <b>assenze</b>.',
                'Sotto i <b>segni</b>: REPERIBILE, le fasce, quante <b>ambulanze</b> ci sono di mattina e di pomeriggio (il numero rosso che lampeggia vuol dire una sola), la notte che manca, i giorni in rosso.'],
            legend:true,
            anim:[MENU(['cal', 'legend'], 0), CAL({ st:1, say:'Ogni colore ha il suo significato', hold:2200 }), CAL({ st:2, rep:true, say:'Sotto il turno: reperibilità e fasce', hold:2200 })],
            try:{ label:'Apri la legenda', run:() => openColorLegend() } };
        cCal.topics.splice(at, 0, leg);
        const an = tp('anni'); if(an) an.steps[0] = '<b>' + mp('years', 'Calendario › Anni passati') + '</b> (la voce compare solo quando c’è almeno un anno concluso).';
        // area Richieste degli autisti: niente permesso sindacale, niente saldo, cambio turno solo nello stesso giorno, niente CAMBIA
        const nu = tp('req-nuova');
        if(nu) {
            nu.steps[1] = nu.steps[1].replace(', sindacale)', ')');
            nu.steps.splice(2, 1);
            nu.anim = nu.anim.filter(f => !/saldo/i.test(f.say || ''));
            nu.anim.forEach((f, i) => { if(f.st > 1) f.st = f.st - 1; });
        }
        const cb = tp('req-cambio');
        if(cb) {
            cb.sub = 'Turni dello stesso giorno: l’app controlla che sia giusto.';
            cb.steps = ['Tipo <b>Cambio Turno</b>.',
                'Metti <b>con chi</b> fai il cambio, il <b>tuo turno</b> e il <b>suo</b> (Mattina, Pomeriggio, Notte) e il <b>giorno</b>.',
                'L’app <b>confronta con il programma turni</b>: se i turni indicati non corrispondono, ti dice cosa non va e la richiesta non parte.'];
            cb.anim = [SCR({ title:'Nuova Richiesta', icon:'add', col:'#2563eb', st:0, say:'Tipo: Cambio Turno', body:[{ field:'Tipo di Richiesta', v:'Cambio Turno', sel:true, hit:true }, { field:'Il Giorno (Data)', v:'gg/mm/aaaa', ph:true }] }),
                SCR({ title:'Nuova Richiesta', icon:'add', col:'#2563eb', st:1, say:'Con chi e quali turni', body:[{ field:'Con chi fai il cambio?', v:'LUCA', sel:true }, { grp:'Turni da scambiare quel giorno' }, { btns:[{ t:'Il tuo: Mattina', g:true }, { t:'Il suo: Pomeriggio', g:true }] }, { field:'Il Giorno (Data)', v:'20/11' }, { btn:'INVIA RICHIESTA', hit:true }] }),
                SCR({ title:'Controllo turni…', icon:'fact_check', col:'#dc2626', st:2, say:'Se non corrisponde, te lo dice', hold:2400, body:[{ note:'⚠️ Il cambio turno indicato non corrisponde al programma turni: il turno di LUCA quel giorno risulta Notte, non Pomeriggio.', nc:'#dc2626' }] })];
        }
        const rn = tp('req-nome'); if(rn) rn.when = () => false;
        // squadra: gara di ambulanze; collegamenti con infermieri, area riservata e veicoli
        const ru = tp('ruota'), ri = cSq.topics.indexOf(ru) + 1;
        cSq.desc = 'Uscite, ruota della sfiga, gara di ambulanze';
        cSq.topics.splice(ri, 0, { id:'gara', t:'Gara di ambulanze', icon:'sports_score', cat:cSq, when:() => has('openRaceModal'),
            sub:'Scommetti su chi arriva primo.',
            steps:['<b>' + mp('race') + '</b>.',
                '<b>Chi scende in pista?</b> Spunta almeno 2 colleghi e tocca <b>IN GRIGLIA</b>.',
                'Fate le vostre scommesse, poi premi <b>VIA!</b>',
                'L’ordine d’arrivo è a caso… e l’ultima ambulanza resta in panne!'],
            anim:[MENU(['svago', 'race'], 0), SCR({ title:'Gara di ambulanze', icon:'sports_score', col:'#dc2626', st:1, say:'Chi scende in pista?', body:[{ opts:['ANNA', 'LUCA', 'SARA', 'MARCO'], on:[0, 1, 2], sq:true }, { btn:'IN GRIGLIA (min. 2)', ic:'sports_score', hit:true }] }),
                SCR({ title:'Gara di ambulanze', icon:'sports_score', col:'#dc2626', st:2, say:'Scommesse… e VIA!', hold:1800, body:[{ p:'Fate le vostre scommesse, poi premi VIA!' }, { btn:'VIA!', hit:true }] }),
                SCR({ title:'Gara di ambulanze', icon:'sports_score', col:'#dc2626', st:3, say:'Chi vince? E chi resta in panne?', hold:2400, body:[row('emoji_events', '1° SARA', 'Primo arrivato', '#d97706'), row('flag', '2° ANNA', '', '#64748b'), row('car_crash', 'LUCA', 'In panne!', '#dc2626')] })],
            try:{ label:'Apri la gara', run:() => openRaceModal() } });
        const au = tp('autisti');
        if(au) {
            au.id = 'infermieri'; au.t = 'Infermieri e altre app'; au.icon = 'medical_services';
            au.sub = 'Le altre app, da Collegamenti.';
            au.steps = ['Il tasto <b>inf</b> nella barra in alto apre l’app degli infermieri in una nuova scheda.',
                '<b>' + E(menuLbl(['link', 'area'])) + '</b>: l’area personale degli autisti.',
                '<b>' + E(menuLbl(['link', 'veicoli'])) + '</b>: appuntamenti e stato dei mezzi.',
                'Nel dettaglio di una casella vedi anche gli infermieri di quel giorno.'];
            au.anim = [MENU(['link', 'area'], 0), MENU(['link', 'veicoli'], 1)];
        }
        const sq = tp('uscita'); if(sq) { sq.sub = 'Trova il giorno in cui siete liberi in più, autisti e infermieri.'; }
    }

    // ── stato ───────────────────────────────────────────────────────────────
    const GD = { view:'home', cat:null, topic:null, q:'', run:0, paused:false };
    const visTopics = c => c.topics.filter(t => { try { return !t.when || t.when(); } catch(e) { return false; } });
    const allTopics = () => C.flatMap(c => visTopics(c));
    const findTopic = id => allTopics().find(t => t.id === id);

    function gdHead(title, sub) { $('gd-title').textContent = title; $('gd-sub').textContent = sub; }
    function gdScrollTop() { const b = $('gd-body'); if(b) b.scrollTop = 0; }

    function renderHome() {
        GD.view = 'home'; GD.cat = null; GD.topic = null; GD.run++;
        gdHead('Guida', 'Come funziona l’app, passo per passo');
        const tot = allTopics().length;
        const cats = C.map(c => ({ c, n: visTopics(c).length })).filter(x => x.n);
        $('gd-wrap').innerHTML = `<div class="gd-hero gd-in"><span class="gd-hero-ico">${ic('menu_book')}</span><div><b>Ciao${(typeof userIdentity === 'string' && userIdentity && userIdentity !== 'Ospite') ? ' ' + E(userIdentity.split(' ')[0].charAt(0) + userIdentity.split(' ')[0].slice(1).toLowerCase()) : ''}! Cosa vuoi imparare?</b><small>${tot} argomenti in ${cats.length} categorie. Ogni argomento ha un’animazione che ti mostra dove toccare e, quando si può, il tasto <b>Prova adesso</b>.</small></div></div>
            <label class="gd-search">${ic('search')}<input id="gd-q" type="search" placeholder="Cerca: ferie, notte, reperibilità, nota…" value="${E(GD.q)}" oninput="guideSearch(this.value)" autocomplete="off"></label>
            <div id="gd-res"></div>`;
        renderHomeList();
        gdScrollTop();
    }
    function renderHomeList() {
        const box = $('gd-res'); if(!box) return;
        const q = GD.q.trim().toLowerCase();
        if(q) {
            const strip = s => String(s || '').replace(/<[^>]+>/g, '').toLowerCase();
            const words = q.split(/\s+/).filter(Boolean);
            const res = allTopics().filter(t => { const txt = strip([t.t, t.sub, t.cat.label].concat(t.steps, t.tips || []).join(' ')); return words.every(w => txt.includes(w)); });
            box.innerHTML = res.length ? `<div class="gd-list">${res.map((t, i) => topicRowHtml(t, i, true)).join('')}</div>` : `<div class="gd-empty">Nessun argomento trovato per “${E(GD.q)}”.</div>`;
            return;
        }
        box.innerHTML = `<div class="gd-cats">${C.map(c => ({ c, n: visTopics(c).length })).filter(x => x.n).map((x, i) =>
            `<button class="gd-cat" style="--gc:${x.c.color};animation-delay:${i * 45}ms" onclick="guideCat('${x.c.id}')"><span class="gd-ci">${ic(x.c.icon)}</span><em>${x.n}</em><b>${E(x.c.label)}</b><small>${E(x.c.desc)}</small></button>`).join('')}</div>`;
    }
    function topicRowHtml(t, i, withCat) {
        return `<button class="gd-row" style="--gc:${t.cat.color};animation-delay:${i * 35}ms" onclick="guideTopic('${t.id}')"><span class="gd-ri">${ic(t.icon)}</span><span class="gd-rt">${withCat ? `<span class="gd-rc">${E(t.cat.label)}</span>` : ''}<b>${E(t.t)}</b><small>${E(t.sub)}</small></span>${ic('chevron_right')}</button>`;
    }
    function renderCat(id) {
        const c = C.find(x => x.id === id); if(!c) return renderHome();
        GD.view = 'cat'; GD.cat = c; GD.topic = null; GD.run++;
        gdHead(c.label, 'Guida › ' + c.desc);
        $('gd-wrap').innerHTML = `<div class="gd-list">${visTopics(c).map((t, i) => topicRowHtml(t, i)).join('')}</div>`;
        gdScrollTop();
    }
    function renderTopic(id) {
        let t = findTopic(id); if(!t) return renderHome();
        if(t.go) { const g = findTopic(t.go); if(g) t = g; }
        GD.view = 'topic'; GD.topic = t; GD.cat = t.cat; GD.paused = false;
        gdHead(t.t, 'Guida › ' + t.cat.label);
        const list = visTopics(t.cat), k = list.indexOf(t), prev = list[k - 1], next = list[k + 1];
        const tryOk = t.try && (() => { try { return t.try.when ? t.try.when() : true; } catch(e) { return false; } })();
        $('gd-wrap').innerHTML = `<div class="gd-topic gd-in" style="--gc:${t.cat.color}">
            <div class="gd-stage"><div class="gd-phone" id="gd-phone"><div class="gd-scr" id="gd-scr"></div><div class="gd-finger" id="gd-finger"></div></div>
                <div class="gd-say" id="gd-say"></div>
                <div class="gd-ctrl"><button onclick="guideReplay()">${ic('replay')}Da capo</button><button onclick="guidePause()" id="gd-pause">${ic('pause')}Pausa</button></div></div>
            <div class="gd-info"><h3><span class="gd-ri">${ic(t.icon, 20)}</span>${E(t.t)}</h3><p class="gd-lead">${E(t.sub)}</p>
                <ol class="gd-steps" id="gd-steps">${t.steps.map((s, i) => `<li data-i="${i}">${s}</li>`).join('')}</ol>
                ${t.legend ? legendHtml() : ''}${t.coordList ? coordListHtml() : ''}${t.adminList ? adminListHtml() : ''}
                ${t.tips ? `<div class="gd-tips"><b class="h">${ic('lightbulb')}Da sapere</b>${t.tips.map(x => `<p>${x}</p>`).join('')}</div>` : ''}
                ${tryOk ? `<div class="gd-acts"><button class="gd-try" onclick="guideTry()">${ic('play_arrow')}Prova adesso: ${E(t.try.label)}</button></div>` : ''}
                <div class="gd-nav">${prev ? `<button onclick="guideTopic('${prev.id}')">${ic('chevron_left')}<span class="t">${E(prev.t)}</span></button>` : '<span style="flex:1"></span>'}${next ? `<button class="nx" onclick="guideTopic('${next.id}')"><span class="t">${E(next.t)}</span>${ic('chevron_right')}</button>` : '<span style="flex:1"></span>'}</div>
            </div></div>`;
        gdScrollTop();
        play(t);
    }
    // legenda vera: le sigle e i colori presi dalla ruota del coordinatore
    function legendHtml() {
        let items = [];
        try { items = wheelPaletteItems(); } catch(e) {}
        if(!items.length) return '';
        const g = (title, arr) => arr.length ? `<h5>${title}</h5>` + arr.map(it => `<div>${chipColors(it.colors, it.short)}<span>${E(it.label)}${it.time ? ` <small>${E(it.time)}</small>` : ''}</span></div>`).join('') : '';
        return `<div class="gd-leg">${g('Turni', items.filter(i => i.group === 0))}${g('Diurnisti e combinati', items.filter(i => i.group === 1))}${g('Assenze e permessi', items.filter(i => i.group === 2))}</div>`;
    }
    function coordListHtml() {
        try { if(typeof CC_SECTIONS !== 'object') return ''; } catch(e) { return ''; }
        return `<div class="gd-leg" style="grid-template-columns:1fr">${Object.keys(CC_SECTIONS).filter(k => k !== 'riportare').map(k => `<div style="display:block"><b>${E(CC_SECTIONS[k].title)}</b> <small>· ${E(CC_SECTIONS[k].sub)}</small></div>`).join('')}</div>`;
    }
    function adminListHtml() {
        try { if(typeof ADM_TABS !== 'object') return ''; } catch(e) { return ''; }
        const shown = Object.keys(ADM_TABS).filter(k => document.querySelector(`#admin-panel-modal .admin-tab-btn[data-tab="${k}"]`));
        return `<div class="gd-leg" style="grid-template-columns:1fr">${shown.map(k => `<div style="display:block"><b>${E(ADM_TABS[k][0])}</b> <small>· ${E(ADM_TABS[k][1])}</small></div>`).join('')}</div>`;
    }

    // ── disegno delle scene ────────────────────────────────────────────────
    const CAL_ROWS = [['M', 'N', 'N', 'm'], ['P', 'SM', 'SM', 'm'], ['N', 'R', 'R', 'p'], ['SM', 'M', 'P', 'm'], ['R', 'P', 'M', 'r'], ['M', 'R', 'N', 'f']];
    function calHtml(f) {
        const wd = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'], t0 = new Date(); t0.setHours(12);
        let order = [0, 1, 2, 3];
        if(f.focus && f.focus.length) order = f.focus.concat(order.filter(i => !f.focus.includes(i)));
        const dim = i => f.focus && f.focus.length && !f.focus.includes(i) ? ' dim' : '';
        const head = `<tr><th data-k="h-1">DATA</th>${order.map(i => `<th data-k="h${i}" class="${f.focus && f.focus.includes(i) ? 'fo' : ''}${dim(i)}">${NAMES[i]}</th>`).join('')}</tr>`;
        const rows = CAL_ROWS.map((r, ri) => {
            const d = new Date(t0); d.setDate(t0.getDate() + ri);
            return `<tr class="${ri === 0 ? 'today' : ''}"><td>${wd[d.getDay()]} ${d.getDate()}</td>${order.map(ci => {
                const code = r[ci], lbl = code === 'f' ? 'CO' : code;
                let extra = '';
                if(f.rep && ci === 3 && ri === 0) extra = `<div class="gd-mreptxt">REPERIBILE</div><div class="gd-mrep"><i>13-20</i>${f.rep === 'ced' ? '<i class="r">20-00</i>' : '<i>20-00</i>'}</div>`;
                if(f.rep && ci === 3 && ri === 1) extra = `<div class="gd-mrep"><i>00-07</i><i>07-13</i></div>`;
                if(f.rep === 'ced' && ci === 0 && ri === 0) extra = `<div class="gd-mrep"><i class="b">20-00</i></div>`;
                const pend = f.pend && ri === 3 && ci === 0;
                return `<td data-k="c${ci}-${ri}" class="${dim(ci).trim()}">${pend ? `<span class="gd-chip" style="background:var(--c-M);color:var(--t-M);box-shadow:0 0 0 2px #f59e0b">M</span>` : chip(code, lbl)}${extra}</td>`;
            }).join('')}</tr>`;
        }).join('');
        return `<div class="gd-app"><div class="gd-top"><b>Turni</b><span class="material-icons-round" data-k="bell" style="position:relative">notifications${f.bellDot ? '<i style="position:absolute;right:4px;top:4px;width:7px;height:7px;border-radius:50%;background:#ef4444"></i>' : ''}</span><span class="material-icons-round" data-k="menu">menu</span></div>
            <div class="gd-mcal"><table>${head}${rows}</table></div>
            <div class="gd-handle" data-k="handle">${ic('chevron_left')}</div>
            ${f.strip ? `<div class="gd-strip" data-k="strip">${chip('P')}<span><small>Domani</small><b>Pomeriggio</b> <span class="w">${E(sched('P'))}</span></span></div>` : ''}
            ${f.offline ? `<div class="gd-strip" data-k="off" style="left:50%;right:auto;transform:translateX(-50%);background:#334155;color:#fff;border:none;border-radius:999px;padding:6px 12px;animation:none">${ic('cloud_off', 13)}<b style="color:#fff">Senza rete</b></div>` : ''}
            ${f.wheel ? `<div class="gd-mwheel"><b>TURNI</b></div>` : ''}
            ${f.pop ? `<div class="gd-veil"><div class="gd-pop"><div class="gd-ph"><span class="ic" style="background:${f.pop.col};color:${f.pop.icol || '#fff'}">${ic(f.pop.ic)}</span><span><b>${E(f.pop.title)}</b><small>${E(f.pop.sub || '')}</small></span><span class="material-icons-round x">close</span></div><div class="gd-pb">${blocks(f.pop.body || [])}</div></div></div>` : ''}
        </div>`;
    }
    function blocks(arr) {
        return arr.map(b => {
            const k = b.k ? ` data-k="${b.k}"` : (b.hit === true ? ' data-k="hit"' : '');
            if(b.row) return `<div class="gd-b-row"${k}><span class="ic" style="background:${b.col || '#64748b'}">${ic(b.row[0])}</span><span class="t"><b>${E(b.row[1])}</b>${b.row[2] ? `<small>${E(b.row[2])}</small>` : ''}</span>${b.sw !== undefined ? `<span class="gd-sw ${b.sw ? 'on' : ''}"></span>` : (b.chev ? `<span class="material-icons-round gd-chev">chevron_right</span>` : '')}</div>`;
            if(b.grp) return `<div class="gd-b-grp">${E(b.grp)}</div>`;
            if(b.sec) return `<div class="gd-b-sec" style="${b.sc ? '--sc:' + b.sc : ''}">${b.ic ? ic(b.ic) : ''}${E(b.sec)}</div>`;
            if(b.seg) return `<div class="gd-b-seg">${b.seg.map((s, i) => `<span class="${i === b.on ? 'on' : ''}"${b.hit === i ? ' data-k="hit"' : ''}>${E(s)}</span>`).join('')}</div>`;
            if(b.kv) return `<div class="gd-b-kv"><span>${E(b.kv[0])}</span><b>${E(b.kv[1])}</b></div>`;
            if(b.p) return `<div class="gd-b-p">${E(b.p)}</div>`;
            if(b.btn) return `<div class="gd-b-btn ${b.g ? 'g' : ''}"${k}>${b.ic ? ic(b.ic) : ''}${E(b.btn)}</div>`;
            if(b.btns) return `<div class="gd-b-btns">${b.btns.map(x => `<div class="gd-b-btn ${x.g ? 'g' : ''}"${x.hit ? ' data-k="hit"' : ''}>${x.ic ? ic(x.ic) : ''}${E(x.t)}</div>`).join('')}</div>`;
            if(b.field !== undefined) return `<div class="gd-b-field"${k}><small>${E(b.field)}</small><div class="${b.ph || !b.v ? 'ph' : ''}">${E(b.v || b.ph || '')}${b.sel ? ic('expand_more') : ''}</div></div>`;
            if(b.chips) return `<div class="gd-b-chips">${b.chips.map(c => c ? chip(c) : '<span class="gd-chip" style="background:var(--bg);color:var(--text-sec)">·</span>').join('')}</div>`;
            if(b.bar !== undefined) return `<div class="gd-b-bar"><i style="width:${b.bar}%"></i></div>`;
            if(b.ppl) return `<div class="gd-b-ppl">${b.ppl.map(p => `<div>${chip(p[1])}<span class="n">${E(p[0])}</span></div>`).join('')}</div>`;
            if(b.note) return `<div class="gd-b-note" style="--nc:${b.nc || '#2563eb'}"${k}>${E(b.note)}</div>`;
            if(b.opts) return b.opts.map((o, i) => `<div class="gd-b-opt ${b.on && b.on.includes(i) ? 'on' : ''}"${b.hit === i ? ' data-k="hit"' : ''}><i class="${b.sq ? 'sq' : ''}"></i>${E(o)}</div>`).join('');
            if(b.req) { const r = b.req; return `<div class="gd-b-req ${b.ok ? 'ok' : ''} ${b.pend ? 'pend' : ''}" data-k="r${b.ok ? 1 : 0}"><span class="ic" style="background:${r[1]}">${ic(r[0])}</span><span><b>${E(r[2])}</b><small>${E(r[3])}</small>${r[4] ? `<em style="color:${r[5]};border-color:${r[5]}">${E(r[4])}</em>` : ''}</span></div>`; }
            return '';
        }).join('');
    }
    function scrHtml(f) {
        if(f.req) return `<div class="gd-scrn"><div class="gd-rq-top"><div class="r1"><span class="material-icons-round">arrow_back</span><b>Gestione Richieste<small>LOGGATO COME: SARA${f.pc ? ' <span data-k="cambia" style="display:inline-block;background:rgba(255,255,255,.2);color:#fff;border-radius:4px;padding:0 4px">CAMBIA</span>' : ''}</small></b><span class="material-icons-round" data-k="man">menu_book</span><span class="material-icons-round" data-k="bulb">lightbulb</span><span class="material-icons-round">admin_panel_settings</span><span class="material-icons-round" data-k="dl">download</span></div>
            <div class="sr" data-k="search"><span class="material-icons-round">search</span>Cerca nome o tipo...</div></div>
            <div class="gd-sb">${blocks(f.body || [])}</div>${f.fab ? `<div class="gd-fab" data-k="fab">${ic('add')}</div>` : ''}</div>`;
        return `<div class="gd-scrn"><div class="gd-sh" style="background:${f.col || '#2563eb'}">${ic(f.icon || 'apps')}<b>${E(f.title || '')}${f.sub ? `<small>${E(f.sub)}</small>` : ''}</b>${ic('close')}</div>
            <div class="gd-sb">${blocks(f.body || [])}${f.spin ? `<div style="display:flex;justify-content:center;padding-top:20px"><div class="gd-mwheel" style="position:static;width:170px;height:170px;background:conic-gradient(#db2777 0 90deg,#2563eb 90deg 180deg,#16a34a 180deg 270deg,#f59e0b 270deg 360deg);animation-duration:1.2s"><b style="width:60px;height:60px;font-size:11px">GIRA</b></div></div>` : ''}</div>
            ${f.wheel ? `<div class="gd-fab" data-k="hit" style="background:#16a34a">${ic('beach_access')}</div>` : ''}</div>`;
    }
    // menu: righe vere dal menu dell’app
    function menuHtml(path, depth) {
        let list = [], node = null;
        try { list = menuTree(); for(let i = 0; i < depth; i++) { node = list.find(x => x && x.id === path[i]); list = (node && node.children) || []; } } catch(e) {}
        const nm = (typeof userIdentity === 'string' && userIdentity) || 'Ospite';
        const head = depth === 0 ? `<span class="ic" style="background:#1d4ed8">${E(nm.slice(0, 2).toUpperCase())}</span><span><b>${E(nm)}</b><small>Menu</small></span>`
            : `<span class="ic" style="background:var(--border);color:var(--text-main)">${ic('arrow_back')}</span><span><b>${E(node ? node.label : '')}</b><small>Menu</small></span>`;
        const rows = list.filter(Boolean).map(n => n.group ? `<div class="gd-b-grp">${E(n.group)}</div>`
            : `<div class="gd-b-row" data-k="m-${E(n.id)}"><span class="ic" style="background:${n.color}">${ic(n.icon)}</span><span class="t"><b>${E(n.label)}</b>${n.desc ? `<small>${E(n.desc)}</small>` : ''}</span>${n.children ? '<span class="material-icons-round gd-chev">chevron_right</span>' : (n.lock ? '<span class="material-icons-round gd-chev">lock</span>' : '')}</div>`).join('');
        return `<div class="gd-app">${calHtml({}).replace(/^<div class="gd-app">/, '').replace(/<\/div>\s*$/, '')}<div class="gd-veil" style="align-items:flex-start;justify-content:flex-end;padding:44px 6px 6px 18px;background:rgba(12,18,26,.25)"><div class="gd-pop" style="height:100%"><div class="gd-ph">${head}</div><div class="gd-pb gd-mlist" style="overflow:hidden;flex:1">${rows}</div></div></div></div>`;
    }
    // espande le scene MENU in più passaggi (tocca ☰, poi ogni voce)
    function expand(anim) {
        const out = [];
        (anim || []).forEach(f => {
            if(f.m !== 'menu') { if(f.menuAt) { const ma = realPath(f.menuAt) || f.menuAt; out.push({ m:'menuview', path:ma, depth:ma.length, st:f.st, say:f.say, hold:2200 }); } else out.push(f); return; }
            const rp = realPath(f.path); if(!rp) return; f = Object.assign({}, f, { path:rp });
            out.push(CAL({ hit:'menu', st:f.st, say:'Tocca ☰ in alto a destra' }));
            f.path.forEach((id, d) => out.push({ m:'menuview', path:f.path, depth:d, hit:'m-' + id, st:f.st, say:`Tocca «${menuLbl(f.path.slice(0, d + 1))}»` }));
        });
        return out;
    }

    // ── motore dell’animazione ─────────────────────────────────────────────
    const sleep = (ms, tok) => new Promise(res => { const t0 = Date.now(); const tick = () => { if(tok !== GD.run) return res(false); if(GD.paused) { setTimeout(tick, 150); return; } if(Date.now() - t0 >= ms) return res(true); setTimeout(tick, 60); }; setTimeout(tick, 30); });
    async function play(t) {
        const tok = ++GD.run;
        const frames = expand(t.anim);
        if(!frames.length) frames.push(CAL({ st:0, hold:3000 }));
        let first = true;
        while(tok === GD.run) {
            for(const f of frames) { if(tok !== GD.run) return; await frame(f, tok, first); first = false; }
            if(!(await sleep(1600, tok))) return;
        }
    }
    async function frame(f, tok, first) {
        const scr = $('gd-scr'), fing = $('gd-finger'), say = $('gd-say'); if(!scr) return;
        const html = f.m === 'cal' ? calHtml(f) : f.m === 'menuview' ? menuHtml(f.path, f.depth) : scrHtml(f);
        const old = [...scr.querySelectorAll('.gd-lay')];
        const lay = document.createElement('div'); lay.className = 'gd-lay' + (f.enter === 'r' ? ' r' : ''); lay.innerHTML = html;
        if(first || f.m === 'menuview' && old.length && old[old.length - 1].dataset.m === 'menuview') lay.style.animation = 'none';
        lay.dataset.m = f.m;
        scr.appendChild(lay);
        old.forEach(o => { o.classList.add('out'); setTimeout(() => o.remove(), 260); });
        if(say) say.innerHTML = f.say ? `<span>${E(f.say)}</span>` : '';
        document.querySelectorAll('#gd-steps li').forEach(li => li.classList.toggle('on', +li.dataset.i === f.st));
        const target = f.hit ? lay.querySelector(`[data-k="${f.hit}"]`) : (lay.querySelector('[data-k="hit"]'));
        // nel menu la voce può essere più in basso: la lista scorre fino a lei
        if(target && f.m === 'menuview') {
            const ml = lay.querySelector('.gd-mlist');
            if(ml) { const want = target.offsetTop - ml.offsetTop - 60; if(want > 0) { await sleep(500, tok); ml.style.scrollBehavior = 'smooth'; ml.scrollTop = want; } }
        }
        if(!(await sleep(target ? 650 : 200, tok))) return;
        if(target && fing) {
            const pr = $('gd-phone').getBoundingClientRect(), r = target.getBoundingClientRect();
            fing.style.left = (r.left - pr.left + Math.min(r.width / 2, 60)) + 'px';
            fing.style.top = (r.top - pr.top + r.height / 2) + 'px';
            fing.classList.add('show');
            if(!(await sleep(700, tok))) return;
            fing.classList.add('press'); target.classList.add('gd-tap');
            if(!(await sleep(420, tok))) return;
            fing.classList.remove('press');
            if(!(await sleep(f.hold || 350, tok))) return;
        } else {
            if(fing) fing.classList.remove('show');
            if(!(await sleep(f.hold || 2000, tok))) return;
        }
    }

    // ── comandi ────────────────────────────────────────────────────────────
    window.openGuide = function(topicId) {
        const el = $('guide-view'); if(!el) return;
        GD.q = '';
        if(topicId && findTopic(topicId)) renderTopic(topicId); else renderHome();
        el.style.display = 'flex'; requestAnimationFrame(() => el.classList.add('open'));
        try { if(typeof setCurrentView === 'function') setCurrentView('Guida'); } catch(e) {}
    };
    window.closeGuide = function() {
        GD.run++; const el = $('guide-view'); if(!el) return;
        el.classList.remove('open'); setTimeout(() => { if(!el.classList.contains('open')) el.style.display = 'none'; }, 200);
    };
    window.guideBack = function() {
        if(GD.view === 'topic') { if(GD.q) renderHome(); else renderCat(GD.cat.id); }
        else if(GD.view === 'cat') renderHome();
        else closeGuide();
    };
    window.guideCat = id => { try { vibrate(); } catch(e) {} renderCat(id); };
    window.guideTopic = id => { try { vibrate(); } catch(e) {} renderTopic(id); };
    window.guideSearch = v => { GD.q = v || ''; renderHomeList(); };
    window.guideReplay = () => { if(GD.topic) { GD.paused = false; const b = $('gd-pause'); if(b) b.innerHTML = ic('pause') + 'Pausa'; play(GD.topic); } };
    window.guidePause = () => { GD.paused = !GD.paused; const b = $('gd-pause'); if(b) b.innerHTML = GD.paused ? ic('play_arrow') + 'Riprendi' : ic('pause') + 'Pausa'; };
    window.guideTry = () => {
        const t = GD.topic; if(!t || !t.try) return;
        closeGuide();
        setTimeout(() => { try { t.try.run(); } catch(e) { console.error(e); if(typeof ccToast === 'function') ccToast('Non si è potuto aprire: ' + (e.message || e), true); } }, 320);
    };
    window.guideTopicsForTest = () => C.map(c => ({ cat:c.id, topics:visTopics(c).map(t => ({ id:t.id, frames:expand(t.anim).length, menuOk:(t.anim || []).filter(f => f.m === 'menu').every(f => pathOk(f.path)), tryOk: !!(t.try && (!t.try.when || t.try.when())) })) }));

    // tasto indietro del telefono: risale di un livello (argomento › categoria › guida › chiudi)
    try {
        BACK_BUTTON_CLOSERS['guide-view'] = () => { if(GD.view !== 'home') { guideBack(); setTimeout(syncModalHistoryState, 0); } else closeGuide(); };
        new MutationObserver(syncModalHistoryState).observe($('guide-view'), { attributes:true, attributeFilter:['class'] });
    } catch(e) {}
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && $('guide-view') && $('guide-view').classList.contains('open')) { e.stopPropagation(); guideBack(); } }, true);
})();
