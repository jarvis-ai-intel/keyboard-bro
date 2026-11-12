// =====================================================================
//  Keyboard Bro — l'interface (étape 1 : lecture seulement)
//
//  - Un onglet par clavier détecté.
//  - Le dessin du clavier s'allume quand on appuie sur ses touches.
//  - Le terminal montre chaque touche, de quel clavier elle vient, et ses codes.
//  - On peut marquer son clavier principal (il ne recevra jamais de macros).
//  Les choix (clavier principal, disposition) sont gardés sur cet ordinateur.
// =====================================================================
'use strict';

(() => {
  const tauri = window.__TAURI__;
  const invoke = tauri ? tauri.core.invoke : null;
  const listen = tauri ? tauri.event.listen : null;

  const COLORS = ['#3B5BDB', '#2B7A4B', '#C2410C', '#7A3FB5', '#0E7490', '#B4235A', '#8A6D00', '#4A5160'];
  const TERM_COLORS = ['#8FA6FF', '#7EE2A8', '#F2A36D', '#C9A2F2', '#6DD3E8', '#F28DB4', '#F2D26D', '#C4CAD4'];
  const MAX_LINES = 300;
  const U = 46; // taille d'une touche dans le dessin, en pixels

  const $ = (id) => document.getElementById(id);

  const store = {
    get(key, fallback) { try { const v = localStorage.getItem('kb.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem('kb.' + key, JSON.stringify(value)); } catch { /* rien */ } }
  };

  const state = {
    live: false,
    keyboards: [],
    order: store.get('order', []),        // ordre d'apparition → numéro « Clavier 1, 2… »
    selected: null,
    principal: store.get('principal', null),
    layouts: store.get('layouts', {}),
    seen: {},                             // id clavier → Set des touches déjà vues
    down: {},                             // id clavier → Set des touches appuyées
    paused: false,
    follow: true,
    showUp: false,
    lineCount: 0
  };

  // ---------- Libellés des touches (pour le terminal) ----------
  const LABELS = {};
  ['full-iso', 'media', 'mac-full', 'full-ansi'].forEach((id) => {
    KBLayouts.layoutDef(id).keys.forEach((k) => { if (k.label) LABELS[k.id] = k.label; });
  });
  Object.assign(LABELS, { Space: 'Espace', Enter: 'Entrée', NumEnter: 'Pavé Entr', LWin: 'Win', RWin: 'Win', Backslash: '\\' });
  const labelOf = (id) => {
    if (!id) return '?';
    const label = LABELS[id] || id;
    // Pavé numérique : « Pavé 7 » plutôt que « 7 », pour ne pas confondre avec la rangée du haut.
    if (/^Num/.test(id) && id !== 'NumLk' && label.length <= 4) return 'Pavé ' + label;
    return label;
  };
  const two = (n) => String(n).padStart(2, '0');
  const clock = (d) => two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());

  // ---------- Claviers ----------
  function numberOf(id) {
    let i = state.order.indexOf(id);
    if (i === -1) { state.order.push(id); store.set('order', state.order); i = state.order.length - 1; }
    return i;
  }
  function colorOf(id) { return COLORS[numberOf(id) % COLORS.length]; }
  function termColorOf(id) { return TERM_COLORS[numberOf(id) % TERM_COLORS.length]; }
  function titleOf(kb) {
    if (!kb) return 'Clavier';
    if (kb.id === state.principal) return 'Principal';
    if (kb.id === 'simule') return 'Simulé';
    const macro = state.keyboards.filter((k) => k.id !== state.principal && !k.virtual);
    const i = macro.findIndex((k) => k.id === kb.id);
    return i >= 0 ? 'Clavier ' + (i + 1) : 'Clavier';
  }
  function byId(id) { return state.keyboards.find((k) => k.id === id); }

  function guessLayout(kb) {
    if (!kb) return 'full-ansi';
    if (kb.vid === '05AC') return 'mac-full';
    return 'full-ansi';
  }
  function layoutOf(id) { return state.layouts[id] || guessLayout(byId(id)); }

  function setKeyboards(list) {
    const keep = state.keyboards.find((k) => k.id === 'simule');
    state.keyboards = list.slice();
    if (keep) state.keyboards.push(keep);
    state.keyboards.forEach((k) => numberOf(k.id));
    if (!state.selected || !byId(state.selected)) {
      const firstMacro = state.keyboards.find((k) => k.id !== state.principal && !k.virtual);
      state.selected = (firstMacro || state.keyboards[0] || {}).id || null;
    }
    renderTabs();
    renderDevices();
    renderCard();
  }

  // ---------- Onglets ----------
  function renderTabs() {
    const nav = $('tabs');
    nav.textContent = '';
    nav.setAttribute('role', 'tablist');
    const real = state.keyboards.filter((k) => !k.virtual || k.id === state.selected);
    real.forEach((kb) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(kb.id === state.selected));
      b.dataset.id = kb.id;
      b.style.setProperty('--c', colorOf(kb.id));
      const dot = document.createElement('span'); dot.className = 'dot';
      const label = document.createElement('span'); label.textContent = titleOf(kb);
      b.append(dot, label);
      const chip = document.createElement('span'); chip.className = 'chip';
      chip.textContent = kb.id === state.principal ? 'principal · ignoré' : (kb.vendor || kb.name);
      b.append(chip);
      b.addEventListener('click', () => select(kb.id));
      nav.append(b);
    });
    if (!real.length) {
      const s = document.createElement('span'); s.className = 'sub'; s.textContent = 'Aucun clavier pour l’instant';
      nav.append(s);
    }
  }

  function pulseTab(id) {
    const tab = document.querySelector('.tab[data-id="' + CSS.escape(id) + '"]');
    if (!tab) return;
    tab.classList.add('pulse');
    clearTimeout(tab._pulse);
    tab._pulse = setTimeout(() => tab.classList.remove('pulse'), 350);
  }

  function select(id) {
    if (state.selected === id) return;
    state.selected = id;
    renderTabs();
    renderDevices();
    renderCard();
  }

  // ---------- Carte du clavier ----------
  let boardKeys = {};   // id de touche → éléments du dessin
  let boardLayout = null;
  let boardKeyboard = null;

  function renderCard() {
    const kb = byId(state.selected);
    $('kb-eyebrow').textContent = kb ? titleOf(kb) : 'Clavier';
    $('kb-name').textContent = kb ? kb.name : (state.live ? 'Aucun clavier détecté' : 'Mode démonstration');
    const bits = [];
    if (kb) {
      if (kb.vendor && !kb.name.includes(kb.vendor)) bits.push(kb.vendor);
      if (kb.bus) bits.push(kb.bus);
      if (kb.vid) bits.push('VID ' + kb.vid + ' · PID ' + kb.pid);
      if (kb.interfaces > 1) bits.push(kb.interfaces + ' interfaces');
      if (kb.virtual) bits.push('appareil virtuel');
    }
    $('kb-sub').textContent = bits.join(' · ');

    const btn = $('principal-btn');
    btn.hidden = !kb || kb.virtual || kb.id === 'simule' || kb.id === 'demo';
    const isPrincipal = kb && kb.id === state.principal;
    btn.textContent = isPrincipal ? 'Clavier principal ✓' : 'C’est mon clavier principal';
    btn.classList.toggle('on', !!isPrincipal);

    const layout = kb ? layoutOf(kb.id) : 'full-ansi';
    $('layout-select').value = layout;
    $('layout-hint').textContent = KBLayouts.layoutInfo()[layout] || '';

    const note = $('kb-note');
    note.className = 'note';
    if (isPrincipal) {
      note.hidden = false;
      note.textContent = 'C’est ton clavier principal : Keyboard Bro ne lui donnera jamais de macros, et ses touches marcheront toujours normalement.';
    } else if (kb && kb.id === 'simule') {
      note.hidden = false;
      note.textContent = 'Touches « simulées » : elles viennent d’un logiciel (un autre outil de macros, un clavier à l’écran…), pas d’un vrai clavier.';
    } else if (kb && !state.principal && state.keyboards.filter((k) => !k.virtual).length > 1) {
      note.hidden = false;
      note.classList.add('warn');
      note.textContent = 'Première chose à faire : choisis l’onglet de ton clavier de tous les jours (appuie sur une de ses touches pour le trouver), puis clique « C’est mon clavier principal ».';
    } else {
      note.hidden = true;
    }

    if (boardLayout !== layout || boardKeyboard !== state.selected) buildBoard(layout);
    paintBoard();
  }

  function buildBoard(layout) {
    const board = $('kb-board');
    board.textContent = '';
    boardKeys = {};
    boardLayout = layout;
    boardKeyboard = state.selected;
    const def = KBLayouts.layoutDef(layout);
    board.style.width = Math.round(def.w * U) + 'px';
    board.style.height = Math.round(def.h * U) + 'px';
    def.keys.forEach((k) => {
      const el = document.createElement('div');
      el.className = 'key' + (k.na ? ' na' : '');
      el.style.left = Math.round(k.x * U + 2) + 'px';
      el.style.top = Math.round(k.y * U + 2) + 'px';
      el.style.width = Math.round(k.w * U - 4) + 'px';
      el.style.height = Math.round(k.h * U - 4) + 'px';
      el.style.fontSize = (k.h < 0.7 ? 10 : (k.label.length > 4 ? 10.5 : (k.label.length > 2 ? 11.5 : 13))) + 'px';
      el.textContent = k.label;
      el.title = k.tip;
      (boardKeys[k.id] = boardKeys[k.id] || []).push(el);
      board.append(el);
    });
  }

  function paintBoard() {
    const id = state.selected;
    const seen = state.seen[id] || new Set();
    const down = state.down[id] || new Set();
    Object.entries(boardKeys).forEach(([kid, els]) => {
      els.forEach((el) => {
        if (el.classList.contains('na')) return;
        el.classList.toggle('seen', seen.has(kid));
        el.classList.toggle('down', down.has(kid));
      });
    });
    const n = seen.size;
    $('seen-count').textContent = n ? n + (n > 1 ? ' touches différentes vues' : ' touche vue') : 'Appuie sur des touches de ce clavier';
  }

  function paintKey(kid) {
    const els = boardKeys[kid];
    if (!els) return false;
    const id = state.selected;
    const seen = state.seen[id] || new Set();
    const down = state.down[id] || new Set();
    els.forEach((el) => {
      el.classList.toggle('seen', seen.has(kid));
      el.classList.toggle('down', down.has(kid));
    });
    return true;
  }

  // ---------- Liste des claviers ----------
  function renderDevices() {
    const ul = $('device-list');
    ul.textContent = '';
    state.keyboards.forEach((kb) => {
      const li = document.createElement('li');
      li.className = kb.id === state.selected ? 'sel' : '';
      li.style.setProperty('--c', colorOf(kb.id));
      li.tabIndex = 0;
      const dot = document.createElement('span'); dot.className = 'dot';
      const meta = document.createElement('div'); meta.className = 'meta';
      const name = document.createElement('span'); name.className = 'name'; name.textContent = kb.name;
      const ids = document.createElement('span'); ids.className = 'ids';
      ids.textContent = kb.vid ? (kb.vendor ? kb.vendor + ' · ' : '') + kb.vid + ':' + kb.pid : (kb.virtual ? 'virtuel' : '');
      meta.append(name, ids);
      const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = titleOf(kb);
      li.append(dot, meta, chip);
      li.addEventListener('click', () => select(kb.id));
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(kb.id); } });
      ul.append(li);
    });
    if (!state.keyboards.length) {
      const li = document.createElement('li'); li.textContent = 'Aucun clavier détecté.'; ul.append(li);
    }
  }

  // ---------- Terminal ----------
  function logEmpty() {
    const log = $('log');
    log.textContent = '';
    const p = document.createElement('div'); p.className = 'empty';
    p.textContent = state.live
      ? 'Appuie sur une touche de n’importe quel clavier : elle apparaîtra ici avec le nom du clavier.'
      : 'Mode démonstration : tape dans cette fenêtre pour voir les touches.';
    log.append(p);
    state.lineCount = 0;
  }

  function logKey(ev, kid) {
    if (state.paused) return;
    if (!ev.down && !state.showUp) return;
    const log = $('log');
    if (state.lineCount === 0) log.textContent = '';
    const line = document.createElement('div');
    line.className = 'line' + (ev.down ? '' : ' up');
    const now = new Date();
    const t = document.createElement('span'); t.className = 't';
    t.textContent = clock(now);
    const tag = document.createElement('span'); tag.className = 'tag';
    tag.style.setProperty('--c', termColorOf(ev.device));
    tag.textContent = titleOf(byId(ev.device));
    const k = document.createElement('span'); k.className = 'k'; k.textContent = labelOf(kid);
    const dir = document.createElement('span'); dir.textContent = ev.down ? '↓' : '↑';
    const codes = document.createElement('span'); codes.className = 'codes';
    codes.textContent = ev.make === undefined ? ev.code
      : 'vk ' + KBKeymap.hex(ev.vkey, 2) + ' · scan ' + (ev.e0 ? 'E0 ' : '') + (ev.e1 ? 'E1 ' : '') + KBKeymap.hex(ev.make, 2);
    line.append(t, tag, k, dir, codes);
    log.append(line);
    state.lineCount++;
    while (log.childElementCount > MAX_LINES) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  // ---------- Une touche arrive ----------
  function onKey(ev, kid) {
    if (!byId(ev.device)) {
      if (ev.device === 'simule') {
        state.keyboards.push({ id: 'simule', name: 'Touches simulées par un logiciel', vendor: '', vid: '', pid: '', interfaces: 1, virtual: true, bus: '' });
        renderTabs(); renderDevices();
      }
    }
    const seen = state.seen[ev.device] || (state.seen[ev.device] = new Set());
    const down = state.down[ev.device] || (state.down[ev.device] = new Set());
    const repeat = ev.down && kid && down.has(kid);
    if (kid) {
      if (ev.down) { down.add(kid); seen.add(kid); } else { down.delete(kid); }
    }
    if (!repeat) logKey(ev, kid);

    if (ev.down && !repeat) {
      pulseTab(ev.device);
      const isOther = ev.device !== state.selected;
      const candidate = byId(ev.device);
      if (isOther && state.follow && candidate && !candidate.virtual && (ev.device !== state.principal || !state.principal)) {
        select(ev.device);
        return;
      }
    }
    if (ev.device === state.selected) {
      if (kid && !paintKey(kid) && ev.down && !repeat) {
        $('layout-hint').textContent = '« ' + labelOf(kid) + ' » n’est pas sur ce dessin. Essaie une autre disposition dans le menu.';
      }
      paintBoard();
    }
  }

  // ---------- Boutons ----------
  $('layout-select').addEventListener('change', (e) => {
    if (!state.selected) return;
    state.layouts[state.selected] = e.target.value;
    store.set('layouts', state.layouts);
    renderCard();
  });
  $('principal-btn').addEventListener('click', () => {
    const id = state.selected;
    state.principal = state.principal === id ? null : id;
    store.set('principal', state.principal);
    renderTabs(); renderDevices(); renderCard();
  });
  $('pause').addEventListener('click', () => {
    state.paused = !state.paused;
    $('pause').textContent = state.paused ? 'Reprendre' : 'Pause';
    document.querySelector('.term-title').classList.toggle('paused', state.paused);
  });
  $('clear').addEventListener('click', () => {
    logEmpty();
    Object.keys(state.seen).forEach((k) => state.seen[k].clear());
    paintBoard();
  });
  $('follow').addEventListener('change', (e) => { state.follow = e.target.checked; });
  $('show-up').addEventListener('change', (e) => { state.showUp = e.target.checked; });
  $('refresh').addEventListener('click', async () => {
    if (state.live) setKeyboards(await invoke('list_keyboards'));
  });

  // ---------- Démarrage ----------
  async function startLive() {
    await listen('kb-devices', (e) => setKeyboards(e.payload));
    await listen('kb-key', (e) => onKey(e.payload, KBKeymap.fromRaw(e.payload)));
    setKeyboards(await invoke('list_keyboards'));
  }

  function startDemo(info) {
    $('mode-pill').textContent = 'Mode démonstration';
    $('mode-pill').classList.add('demo');
    const banner = $('banner');
    banner.hidden = false;
    banner.textContent = (info && info.os === 'macos' ? 'Sur Mac' : 'Sur ce système')
      + ', Keyboard Bro ne sait pas encore reconnaître chaque clavier séparément (ça arrive bientôt). En attendant, tape dans cette fenêtre : les touches s’allument sur le dessin.';
    setKeyboards([{ id: 'demo', name: 'Clavier de cet ordinateur', vendor: '', vid: '', pid: '', interfaces: 1, virtual: false, bus: '' }]);
    const handler = (down) => (e) => {
      const kid = KBKeymap.fromCode(e.code);
      if (kid === 'Tab' || (kid && kid.startsWith('F'))) e.preventDefault();
      onKey({ device: 'demo', down, code: e.code }, kid);
    };
    window.addEventListener('keydown', handler(true));
    window.addEventListener('keyup', handler(false));
  }

  async function boot() {
    logEmpty();
    let info = null;
    if (invoke) {
      try { info = await invoke('platform_info'); } catch { info = null; }
    }
    $('footer-left').textContent = 'Keyboard Bro ' + (info ? info.version + ' · ' + info.os + ' ' + info.arch : '(aperçu)');
    state.live = !!(info && info.live);
    if (state.live) {
      $('mode-pill').textContent = 'Lecture seulement · rien n’est bloqué';
      try { await startLive(); } catch (err) { $('banner').hidden = false; $('banner').textContent = 'Erreur au démarrage : ' + err; }
    } else {
      startDemo(info);
    }
    logEmpty();
  }

  boot();
})();
