// =====================================================================
//  Keyboard Bro — l'interface (version 0.5 : français, anglais, espagnol)
//
//  En haut : le dessin du clavier (à gauche) et le terminal en direct (à droite).
//  En bas  : Étape 1 (choisir la touche), Étape 2 (ce que fait la touche),
//            Étape 3 (sauvegarde automatique, exporter, importer).
//
//  La configuration est gardée dans keyboard-bro.json (voir src-tauri/src/config.rs).
//  Les touches programmées sont envoyées au cœur du programme (set_bindings) : sous
//  Windows, il les cache aux autres programmes et lance leurs actions.
//  Bouton ⚙ en haut à droite : Réglages (démarrer avec l'ordinateur, fenêtre réduite).
// =====================================================================
'use strict';

(() => {
  const tauri = window.__TAURI__;
  const invoke = tauri ? tauri.core.invoke : null;
  const listen = tauri ? tauri.event.listen : null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const frag = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  const COLORS = ['#3B5BDB', '#2B7A4B', '#C2410C', '#7A3FB5', '#0E7490', '#B4235A', '#8A6D00', '#4A5160'];
  const TERM_COLORS = ['#8FA6FF', '#7EE2A8', '#F2A36D', '#C9A2F2', '#6DD3E8', '#F28DB4', '#F2D26D', '#C4CAD4'];
  const MAX_LINES = 300;

  // ---------- Icônes (traits simples) ----------
  const ICON = {
    prog: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    url: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    combo: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    wait: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    script: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
    dots: '<path d="M12 5v.01M12 12v.01M12 19v.01"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
  };
  const svg = (name, size = 16, sw = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;

  const TYPES = {
    prog: tr('Ouvrir un programme'),
    url: tr('Ouvrir une URL'),
    text: tr('Coller du texte'),
    combo: tr('Combinaison de touches'),
    wait: tr('Attendre')
  };

  // ---------- Zoom : tout l'écran entre toujours dans la fenêtre ----------
  const BASE_W = 1500, BASE_H = 880;
  function fit() {
    const z = Math.max(0.55, Math.min(1.25, window.innerWidth / BASE_W, window.innerHeight / BASE_H));
    document.documentElement.style.zoom = String(z);
    const app = $('app');
    app.style.width = (window.innerWidth / z) + 'px';
    app.style.height = (window.innerHeight / z) + 'px';
    sizeBoard();
  }
  window.addEventListener('resize', fit);

  // ---------- Noms des touches ----------
  const KEYINFO = {};
  ['g710', 'mac-full', 'media', 'full-iso', 'full-ansi'].forEach((id) => {
    KBLayouts.layoutDef(id).keys.forEach((k) => { if (k.label) KEYINFO[k.id] = { label: k.label, tip: k.tip }; });
  });
  Object.assign(KEYINFO, { Space: { label: tr('Espace'), tip: tr('Espace') }, Enter: { label: tr('Entrée'), tip: tr('Entrée') } });
  function keyLabel(kid) {
    if (!kid) return '?';
    const info = KEYINFO[kid];
    const label = info ? info.label : kid;
    if (/^Num/.test(kid) && kid !== 'NumLk' && label.length <= 4) return tr('Pavé {k}', { k: label });
    return label;
  }
  function keyTip(kid) { return (KEYINFO[kid] && KEYINFO[kid].tip) || keyLabel(kid); }

  // Noms utilisés dans les combinaisons (comme dans la liste des raccourcis de Windows)
  const COMBO_NAMES = {
    Esc: 'Échap', Enter: 'Entrée', NumEnter: 'Entrée', Space: 'Espace', Tab: 'Tab', Bksp: 'Retour arr.', Del: 'Suppr', Ins: 'Inser',
    Home: 'Origine', End: 'Fin', PgUp: 'Page préc.', PgDn: 'Page suiv.', Up: '↑', Down: '↓', Left: '←', Right: '→',
    PrtSc: 'Impr. écran', ScrLk: 'Arrêt défil', Pause: 'Pause', Grave: '`', Backslash: '\\', IntlBackslash: '<',
    NumAdd: '+', NumSub: '-', NumMul: '*', NumDiv: '/', NumDot: '.', Caps: 'Verr. Maj', Menu: 'Menu'
  };
  function comboName(kid) {
    if (COMBO_NAMES[kid]) return COMBO_NAMES[kid];
    if (/^Num[0-9]$/.test(kid)) return 'Pavé ' + kid.slice(3);   // nom gardé dans la config : toujours en français
    return keyLabel(kid);
  }

  // ---------- Petits utilitaires ----------
  const two = (n) => String(n).padStart(2, '0');
  const clock = (d) => two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
  const fmtSec = (s) => KBI18n.num(Math.round(s * 10) / 10);
  const baseName = (p) => String(p || '').split(/[\\/]/).pop().replace(/\.(exe|lnk|bat|cmd|app)$/i, '');
  function isTyping(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
    return el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(el.type);
  }
  let toastTimer = null;
  function toast(text, bad) {
    const t = $('toast');
    t.textContent = text;
    t.className = 'toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 3500);
  }
  function banner(text) {
    const b = $('banner');
    b.hidden = !text;
    b.textContent = text || '';
  }

  // =====================================================================
  //  Configuration (keyboard-bro.json)
  // =====================================================================
  const newConfig = () => ({ app: 'keyboard-bro', version: 1, lang: null, principal: null, principalMacros: false, startMinimized: true, order: [], keyboards: {} });
  let cfg = newConfig();
  let cfgPath = '';
  let saveState = 'ok';
  let saveError = '';
  let savedAt = null;
  let saveTimer = null;

  function normalize(c) {
    if (!c || typeof c !== 'object' || c.app !== 'keyboard-bro') throw new Error(tr('ce n’est pas une configuration Keyboard Bro'));
    const out = newConfig();
    out.principal = typeof c.principal === 'string' ? c.principal : null;
    out.principalMacros = !!c.principalMacros;
    out.startMinimized = c.startMinimized !== false;   // oui par défaut
    out.lang = ['fr', 'en', 'es'].includes(c.lang) ? c.lang : null;   // null = langue de l'ordinateur
    out.order = Array.isArray(c.order) ? c.order.filter((x) => typeof x === 'string') : [];
    const layouts = KBLayouts.layoutInfo();
    if (c.keyboards && typeof c.keyboards === 'object') {
      Object.entries(c.keyboards).forEach(([k, v]) => {
        if (!v || typeof v !== 'object') return;
        const kb = { layout: layouts[v.layout] ? v.layout : 'full-ansi', keys: {} };
        if (['M1', 'M2', 'M3'].includes(v.bank)) kb.bank = v.bank;
        if (v.separateG === true) kb.separateG = true;
        if (v.useAnyway === true) kb.useAnyway = true;
        if (v.keys && typeof v.keys === 'object') {
          Object.entries(v.keys).forEach(([kid, e]) => {
            if (!e || !Array.isArray(e.actions)) return;
            const actions = e.actions.filter((a) => a && typeof a === 'object' && TYPES[a.type]);
            if (actions.length) kb.keys[kid] = { name: typeof e.name === 'string' ? e.name : '', actions };
          });
        }
        out.keyboards[k] = kb;
      });
    }
    return out;
  }

  async function loadConfig() {
    try {
      if (invoke) {
        const r = await invoke('load_config');
        cfgPath = r.path || '';
        if (r.recovered) banner(tr('Le fichier de configuration était abîmé. Il a été mis de côté (') + r.recovered + tr(') et Keyboard Bro repart à neuf.'));
        if (r.json) cfg = normalize(JSON.parse(r.json));
      } else {
        const j = localStorage.getItem('kb.config');
        if (j) cfg = normalize(JSON.parse(j));
      }
    } catch (e) {
      banner(tr('La configuration n’a pas pu être lue (') + e + tr('). Keyboard Bro repart à neuf.'));
      cfg = newConfig();
    }
  }

  function changed() {
    pushBindings();
    saveState = 'pending';
    paintSave();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  async function saveNow() {
    const json = JSON.stringify(cfg, null, 2);
    try {
      if (invoke) cfgPath = await invoke('save_config', { json });
      else localStorage.setItem('kb.config', json);
      saveState = 'ok';
      savedAt = new Date();
    } catch (e) {
      saveState = 'err';
      saveError = String(e);
    }
    paintSave();
  }
  function paintSave() {
    const pill = $('save-pill');
    pill.className = 'pill save ' + saveState;
    pill.textContent = saveState === 'ok' ? tr('✓ Sauvegardé automatiquement') : (saveState === 'pending' ? tr('Sauvegarde…') : tr('Erreur de sauvegarde'));
    $('footer-right').textContent = cfgPath ? tr('Config : ') + cfgPath : '';
    $('footer-right').title = cfgPath;
    const box = document.querySelector('.savebox');
    if (!box) return;
    box.className = 'savebox ' + saveState;
    box.querySelector('.save-title').textContent = saveState === 'ok' ? tr('Tout est sauvegardé') : (saveState === 'pending' ? tr('Sauvegarde en cours…') : tr('La sauvegarde n’a pas marché'));
    box.querySelector('.save-text').textContent = saveState === 'err'
      ? saveError
      : tr('Rien à faire : chaque changement est enregistré automatiquement.') + (savedAt ? tr(' Dernière sauvegarde : ') + clock(savedAt) + '.' : '');
  }

  // =====================================================================
  //  Claviers
  // =====================================================================
  const st = {
    live: false,
    keyboards: [],
    selected: null,       // id d'un clavier, ou 'empty' (onglet vide)
    edit: {},             // id clavier → touche en modification
    down: {},             // id clavier → Set des touches appuyées
    paused: false,
    follow: true,
    showUp: false,
    lineCount: 0,
    dialog: false,
    lastG: {},            // id clavier → moment de la dernière touche G (G710)
    macrosOn: true,       // « Désactiver les macros » : le clavier redevient normal
    status: null          // état des macros dans le cœur du programme (blocage, nombre de touches)
  };

  const byId = (id) => st.keyboards.find((k) => k.id === id);
  const isReal = (kb) => kb && !kb.virtual && kb.id !== 'simule';
  // Souris qui se présente aussi comme un clavier : mise de côté, sauf si on choisit de l'utiliser.
  const isHiddenMouse = (kb) => !!kb && !!kb.mouse && !(cfg.keyboards[cfgKey(kb)] && cfg.keyboards[cfgKey(kb)].useAnyway);
  const isShown = (kb) => isReal(kb) && !isHiddenMouse(kb);

  /** Identifiant gardé dans la config : VID:PID (stable d'un port USB à l'autre). */
  function cfgKey(kb) {
    if (!kb) return '';
    if (!kb.vid) return kb.id;
    const base = (kb.vid + ':' + kb.pid).toLowerCase();
    const same = st.keyboards.filter((k) => k.vid === kb.vid && k.pid === kb.pid);
    return same.length > 1 ? base + '#' + kb.id : base;
  }
  const isPrincipal = (kb) => !!kb && !!cfg.principal && cfg.principal === cfgKey(kb);
  const macrosAllowed = (kb) => isReal(kb) && (!isPrincipal(kb) || cfg.principalMacros);
  function kbConf(kb) {
    const k = cfgKey(kb);
    if (!cfg.keyboards[k]) cfg.keyboards[k] = { layout: guessLayout(kb), keys: {} };
    return cfg.keyboards[k];
  }
  // ---------- Logitech G710+ : banques M1-M3 et commandes ----------
  const BANKS = ['M1', 'M2', 'M3'];
  const hasBanks = (kb) => !!kb && kb.model === 'g710';
  const isGKey = (kid) => /^G[1-6]$/.test(kid || '');
  const bankOf = (kb) => { const b = kbConf(kb).bank; return BANKS.includes(b) ? b : 'M1'; };
  /** Les touches G ont des actions différentes dans chaque banque : « M2:G1 », etc. */
  const storeId = (kb, kid) => (hasBanks(kb) && isGKey(kid) ? bankOf(kb) + ':' + kid : kid);
  function g710(cmd, kb, args) {
    if (!invoke || !st.live) return Promise.reject(new Error(tr('disponible dans le programme Windows seulement')));
    return invoke(cmd, Object.assign({ device: kb.id }, args || {}));
  }
  function syncLeds(kb) {
    if (hasBanks(kb)) g710('g710_leds', kb, { mask: 0x10 << BANKS.indexOf(bankOf(kb)) }).catch(() => {});
  }
  function setBank(kb, bank) {
    const conf = kbConf(kb);
    const was = bankOf(kb);
    conf.bank = bank;
    syncLeds(kb);
    if (was === bank) return;
    pushBindings();
    changed();
    if (kb.id === st.selected) { renderCard(kb); renderSteps(); }
    toast(tr('Banque {b} : les touches G1 à G6 ont maintenant les actions de {b}.', { b: bank }));
  }
  async function separateG(kb, quiet) {
    try {
      await g710('g710_separate', kb);
      if (!quiet) toast(tr('C’est fait : les touches G1 à G6 ne tapent plus 1 à 6.'));
      return true;
    } catch (e) {
      if (!quiet) toast(tr('Le G710 n’a pas accepté la commande : ') + e, true);
      return false;
    }
  }

  function guessLayout(kb) { return !kb ? 'full-ansi' : kb.model === 'g710' ? 'g710' : kb.vid === '05AC' ? 'mac-full' : 'full-ansi'; }

  function colorIndex(kb) {
    const k = cfgKey(kb);
    let i = cfg.order.indexOf(k);
    if (i === -1) { cfg.order.push(k); i = cfg.order.length - 1; }
    return i;
  }
  const macroKeyboards = () => st.keyboards.filter((k) => isShown(k) && !isPrincipal(k));
  // Le clavier principal est toujours « Clavier 1 »; les autres suivent (2, 3…).
  const firstMacroNumber = () => (cfg.principal ? 2 : 1);
  function titleOf(kb) {
    if (!kb) return tr('Clavier');
    if (kb.id === 'simule') return tr('Simulé');
    if (kb.virtual) return tr('Virtuel');
    if (isHiddenMouse(kb)) return tr('Souris');
    if (isPrincipal(kb)) return tr('Clavier {n}', { n: 1 });
    const i = macroKeyboards().findIndex((k) => k.id === kb.id);
    return tr('Clavier {n}', { n: i + firstMacroNumber() });
  }

  function setKeyboards(list) {
    const before = new Set(st.keyboards.map((k) => k.id));
    const sim = byId('simule');
    st.keyboards = list.slice();
    if (sim) st.keyboards.push(sim);
    const known = cfg.order.length;
    st.keyboards.filter(isReal).forEach((k) => colorIndex(k));
    if (cfg.order.length !== known) changed();
    // G710 qui vient d'arriver : refaire la séparation des touches G et rallumer le bon voyant M.
    st.keyboards.filter((k) => hasBanks(k) && !before.has(k.id)).forEach((k) => {
      if (kbConf(k).separateG) separateG(k, true);
      syncLeds(k);
    });
    if (!st.selected || (st.selected !== 'empty' && (!byId(st.selected) || isHiddenMouse(byId(st.selected))))) {
      const first = macroKeyboards()[0] || st.keyboards.find((k) => isShown(k) && isPrincipal(k));
      st.selected = first ? first.id : 'empty';
    }
    pushBindings();
    renderAll();
  }

  function select(id) {
    if (st.selected === id) return;
    st.selected = id;
    renderAll();
  }

  // =====================================================================
  //  Macros : touches programmées envoyées au cœur du programme
  // =====================================================================
  /** Toutes les touches programmées des claviers à macros branchés (banque active pour le G710). */
  function buildBindings() {
    const out = [];
    st.keyboards.filter((kb) => isShown(kb) && macrosAllowed(kb)).forEach((kb) => {
      const conf = cfg.keyboards[cfgKey(kb)];
      if (!conf) return;
      Object.entries(conf.keys).forEach(([sid, entry]) => {
        if (!entry.actions.length) return;
        let kid = sid;
        const m = /^(M[1-3]):(.+)$/.exec(sid);
        if (m) { if (!hasBanks(kb) || m[1] !== bankOf(kb)) return; kid = m[2]; }
        if (hasBanks(kb) && BANKS.includes(kid)) return; // M1-M3 changent de banque
        const raw = KBKeymap.toRaw(kid);
        if (!raw) return;
        out.push({ device: kb.id, vk: raw.vk, make: raw.make, e0: raw.e0, special: raw.special, name: displayName(entry), actions: entry.actions });
      });
    });
    return out;
  }
  let pushTimer = null;
  function pushBindings() {
    if (!invoke || !st.live) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try { st.status = await invoke('set_bindings', { bindings: buildBindings(), enabled: st.macrosOn }); }
      catch (e) { st.status = { blocking: false, enabled: st.macrosOn, count: 0, message: String(e) }; }
      paintMacros();
    }, 60);
  }
  /** Bouton en haut à droite + petit état à l'étape 2. */
  function paintMacros() {
    const btn = $('macros-btn');
    if (!st.live) { btn.hidden = true; return; }
    const s = st.status || { blocking: true, enabled: st.macrosOn, count: 0, message: '' };
    btn.hidden = false;
    let cls = 'on', text = tr('Macros en marche');
    if (!st.macrosOn) { cls = 'off'; text = tr('Macros désactivées'); }
    else if (!s.blocking) { cls = 'warn'; text = tr('Macros en marche · sans blocage'); }
    if (st.macrosOn && s.count) text += ' · ' + trn(s.count, '{n} touche', '{n} touches');
    btn.className = 'macros-btn ' + cls;
    btn.innerHTML = '<i></i><span>' + esc(text) + '</span>';
    btn.setAttribute('aria-pressed', String(!st.macrosOn));
    btn.title = st.macrosOn
      ? tr('Clique pour désactiver les macros : le clavier à macros redevient un clavier normal (F1 fait F1, etc.).')
        + (s.blocking ? '' : tr('\n\nAttention : ') + (s.message || tr('les touches programmées ne peuvent pas être cachées')) + '. Les macros partent quand même, mais la touche fait aussi son travail normal.')
      : tr('Les macros sont désactivées : chaque touche fait son travail normal. Clique pour les rallumer.');
    const live = document.querySelector('.live-state');
    if (live) {
      live.className = 'live-state ' + cls;
      live.textContent = !st.macrosOn ? tr('Macros désactivées (bouton en haut à droite)')
        : tr('En marche : essaie la touche dans un autre programme');
    }
  }
  function toggleMacros() {
    st.macrosOn = !st.macrosOn;
    pushBindings();
    paintMacros();
    toast(st.macrosOn ? tr('Macros rallumées : les touches programmées lancent leurs actions.') : tr('Macros désactivées : le clavier redevient un clavier normal (F1 fait F1, etc.).'));
  }

  // =====================================================================
  //  Onglets
  // =====================================================================
  function renderTabs() {
    const nav = $('tabs');
    nav.textContent = '';
    const principal = st.keyboards.find((k) => isShown(k) && isPrincipal(k));
    const list = (principal ? [principal] : []).concat(macroKeyboards());
    list.forEach((kb) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(kb.id === st.selected));
      b.dataset.id = kb.id;
      b.style.setProperty('--c', COLORS[colorIndex(kb) % COLORS.length]);
      const lock = isPrincipal(kb) ? (cfg.principalMacros ? svg('unlock', 14) : svg('lock', 14)) : '<span class="dot"></span>';
      b.innerHTML = lock + '<span>' + esc(titleOf(kb)) + '</span><span class="chip">· ' + esc(isPrincipal(kb) ? tr('principal') : (kb.vendor || kb.name)) + '</span>';
      b.addEventListener('click', () => select(kb.id));
      nav.append(b);
    });
    const empty = document.createElement('button');
    empty.type = 'button';
    empty.className = 'tab empty-tab';
    empty.setAttribute('role', 'tab');
    empty.setAttribute('aria-selected', String(st.selected === 'empty'));
    empty.innerHTML = '<span class="dot"></span><span>' + esc(tr('Clavier {n}', { n: macroKeyboards().length + firstMacroNumber() })) + '</span><span class="chip">· ' + esc(tr('vide')) + '</span>';
    empty.addEventListener('click', () => select('empty'));
    nav.append(empty);
  }
  function pulseTab(id) {
    const tab = document.querySelector('.tab[data-id="' + CSS.escape(id) + '"]');
    if (!tab) return;
    tab.classList.add('pulse');
    clearTimeout(tab._pulse);
    tab._pulse = setTimeout(() => tab.classList.remove('pulse'), 350);
  }

  // =====================================================================
  //  Carte du clavier (dessin)
  // =====================================================================
  const board = { layout: null, kbId: null, def: null, els: [] };

  function renderCard(kb) {
    $('kb-eyebrow').textContent = titleOf(kb) + (isPrincipal(kb) ? tr(' · principal') : '');
    $('kb-name').textContent = kb.name;
    const bits = [];
    if (kb.vendor && !kb.name.includes(kb.vendor)) bits.push(kb.vendor);
    if (kb.bus) bits.push(kb.bus);
    if (kb.vid) bits.push('VID ' + kb.vid + ' · PID ' + kb.pid);
    if (kb.interfaces > 1) bits.push(tr('{n} interfaces', { n: kb.interfaces }));
    $('kb-sub').textContent = bits.join(' · ');

    const role = $('role');
    if (!isReal(kb) || kb.id === 'demo') {
      role.innerHTML = '';
    } else if (isPrincipal(kb)) {
      role.innerHTML = '<span class="chip-principal">' + svg(cfg.principalMacros ? 'unlock' : 'lock', 14) + ' ' + esc(tr('Clavier principal')) + '</span>'
        + '<span class="switch-row" title="' + esc(tr('Éteint : ce clavier est verrouillé, ses touches marchent toujours normalement. Allumé : tu peux donner des macros à certaines de ses touches.')) + '">'
        + '<button type="button" class="switch" role="switch" aria-checked="' + cfg.principalMacros + '" aria-label="' + esc(tr('Permettre des macros sur le clavier principal')) + '" data-act="toggle-principal"><span></span></button>' + esc(tr('Macros permises')) + '</span>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-act="unset-principal">' + esc(tr('Ce n’est pas mon clavier principal')) + '</button>';
    } else {
      role.innerHTML = (kb.mouse ? '<button type="button" class="btn btn-ghost btn-sm" data-act="hide-mouse" title="' + esc(tr('Cet appareil est en fait une souris : le remettre de côté.')) + '">' + esc(tr('Remettre de côté (souris)')) + '</button>' : '')
        + '<button type="button" class="btn btn-sm" data-act="set-principal">' + svg('lock', 14) + esc(tr('C’est mon clavier principal')) + '</button>';
    }

    const bankEl = $('bank');
    if (hasBanks(kb) && macrosAllowed(kb)) {
      const cur = bankOf(kb);
      bankEl.innerHTML = '<span title="' + esc(tr('Chaque banque donne d’autres actions aux touches G1 à G6. Les touches M1, M2, M3 du clavier changent aussi de banque.')) + '">' + esc(tr('Banque')) + '</span><div class="seg" role="group" aria-label="' + esc(tr('Banque')) + '">'
        + BANKS.map((b) => '<button type="button" class="' + (b === cur ? 'on' : '') + '" data-bank="' + b + '" aria-pressed="' + (b === cur) + '">' + b + '</button>').join('') + '</div>';
    } else {
      bankEl.innerHTML = '';
    }

    const conf = kbConf(kb);
    $('layout-select').value = conf.layout;
    $('layout-hint').textContent = KBLayouts.layoutInfo()[conf.layout] || '';
    $('layout-hint').title = $('layout-hint').textContent;   // texte complet au survol s'il est coupé

    const note = $('kb-note');
    note.className = 'note';
    note.hidden = false;
    if (isPrincipal(kb) && !cfg.principalMacros) {
      note.textContent = tr('Clavier principal verrouillé : Keyboard Bro ne touchera jamais à ses touches.');
    } else if (isPrincipal(kb)) {
      note.classList.add('warn');
      note.textContent = tr('Macros permises sur ton clavier principal : choisis des touches dont tu ne te sers pas pour écrire (F13 à F19, Pause, Défil, pavé numérique…). Une touche qui reçoit une macro ne fera plus son travail normal.');
    } else if (hasBanks(kb) && !conf.separateG) {
      note.classList.add('warn');
      note.innerHTML = '<span>' + esc(tr('G710+ reconnu : sans le logiciel de Logitech, ses touches G1 à G6 tapent aussi 1 à 6.')) + '</span>'
        + '<button type="button" class="btn btn-sm btn-primary" data-act="g710-separate">' + esc(tr('Séparer les touches G')) + '</button>';
    } else if (hasBanks(kb)) {
      note.innerHTML = '<span>' + esc(tr('G710+ : touches G séparées des chiffres. M1, M2 et M3 changent de banque (le voyant suit).')) + '</span>'
        + '<button type="button" class="btn btn-sm" data-act="g710-unseparate" title="' + esc(tr('Les touches G retaperont 1 à 6 après avoir débranché et rebranché le clavier.')) + '">' + esc(tr('Ne plus séparer')) + '</button>';
    } else if (!cfg.principal && st.keyboards.filter(isShown).length > 1) {
      note.classList.add('warn');
      note.textContent = tr('Première chose à faire : va dans l’onglet de ton clavier de tous les jours et clique « C’est mon clavier principal ».');
    } else {
      note.hidden = true;
    }

    if (board.layout !== conf.layout || board.kbId !== kb.id) buildBoard(conf.layout, kb.id);
    sizeBoard();
    paintBoard();
  }

  function buildBoard(layout, kbId) {
    const el = $('kb-board');
    el.textContent = '';
    board.layout = layout;
    board.kbId = kbId;
    board.def = KBLayouts.layoutDef(layout);
    board.els = board.def.keys.map((k) => {
      const d = document.createElement('div');
      d.className = 'key' + (k.na ? ' na' : '');
      d.dataset.kid = k.id;
      d.textContent = k.label;
      el.append(d);
      return { el: d, k };
    });
  }

  function sizeBoard() {
    if (!board.def) return;
    const wrap = $('kb-wrap');
    const W = wrap.clientWidth - 4, H = wrap.clientHeight - 4;
    if (W <= 0 || H <= 0) return;
    const U = Math.max(14, Math.min(40, W / board.def.w, H / board.def.h));
    const b = $('kb-board');
    b.style.width = Math.round(board.def.w * U) + 'px';
    b.style.height = Math.round(board.def.h * U) + 'px';
    const pad = U < 26 ? 1.5 : 2;
    const scale = U / 46;
    board.els.forEach(({ el, k }) => {
      el.style.left = (k.x * U + pad).toFixed(1) + 'px';
      el.style.top = (k.y * U + pad).toFixed(1) + 'px';
      el.style.width = (k.w * U - 2 * pad).toFixed(1) + 'px';
      el.style.height = (k.h * U - 2 * pad).toFixed(1) + 'px';
      const base = k.h < 0.7 ? 10 : (k.label.length > 4 ? 10.5 : (k.label.length > 2 ? 11.5 : 13));
      // Le nom doit tenir dans la touche : on réduit le texte des longs noms sur les petits dessins.
      const fitW = k.label.length ? (k.w * U - 2 * pad - 3) / (k.label.length * 0.64) : 99;
      el.style.fontSize = Math.max(6, Math.min(Math.max(7.5, base * scale * 1.12), fitW)).toFixed(1) + 'px';
      el.style.borderBottomWidth = U < 26 ? '2px' : '3px';
    });
  }

  function paintBoard() {
    const kb = byId(st.selected);
    if (!kb || !board.def) return;
    const conf = kbConf(kb);
    const editKey = st.edit[kb.id];
    const down = st.down[kb.id] || new Set();
    const allowed = macrosAllowed(kb);
    board.els.forEach(({ el, k }) => {
      if (k.na) { el.title = k.tip; return; }
      const isBankKey = hasBanks(kb) && BANKS.includes(k.id);
      const entry = isBankKey ? null : conf.keys[storeId(kb, k.id)];
      const bankOn = isBankKey && k.id === bankOf(kb);
      el.classList.toggle('set', !!entry);
      el.classList.toggle('edit', allowed && !isBankKey && k.id === editKey);
      el.classList.toggle('bank-on', bankOn);
      el.classList.toggle('gkey', isGKey(k.id));
      el.classList.toggle('down', down.has(k.id));
      el.classList.toggle('locked', !allowed);
      el.title = k.tip + (isBankKey ? (bankOn ? tr(' (banque active)') : '') : entry ? ' — ' + displayName(entry) : (allowed ? tr(' — libre') : ''));
    });
  }

  $('kb-board').addEventListener('click', (e) => {
    const d = e.target.closest('.key');
    if (!d || d.classList.contains('na')) return;
    const kb = byId(st.selected);
    if (!kb) return;
    if (!macrosAllowed(kb)) { toast(tr('Ce clavier est verrouillé. Allume « Macros permises » pour modifier ses touches.')); return; }
    if (hasBanks(kb) && BANKS.includes(d.dataset.kid)) { setBank(kb, d.dataset.kid); return; }
    setEdit(kb, d.dataset.kid);
  });

  function setEdit(kb, kid) {
    st.edit[kb.id] = kid;
    paintBoard();
    renderSteps();
  }

  $('layout-select').addEventListener('change', (e) => {
    const kb = byId(st.selected);
    if (!kb) return;
    kbConf(kb).layout = e.target.value;
    changed();
    renderCard(kb);
  });

  $('bank').addEventListener('click', (e) => {
    const b = e.target.closest('[data-bank]');
    const kb = byId(st.selected);
    if (b && kb) setBank(kb, b.dataset.bank);
  });

  $('kb-note').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    const kb = byId(st.selected);
    if (!b || !kb) return;
    if (b.dataset.act === 'g710-separate') {
      b.disabled = true;
      if (await separateG(kb, false)) { kbConf(kb).separateG = true; changed(); syncLeds(kb); }
      renderCard(kb);
    } else if (b.dataset.act === 'g710-unseparate') {
      delete kbConf(kb).separateG;
      changed();
      renderCard(kb);
      toast(tr('C’est noté. Débranche et rebranche le G710+ : ses touches G retaperont 1 à 6.'));
    }
  });

  $('role').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const kb = byId(st.selected);
    if (!kb) return;
    if (b.dataset.act === 'set-principal') { cfg.principal = cfgKey(kb); cfg.principalMacros = false; }
    if (b.dataset.act === 'unset-principal') { cfg.principal = null; cfg.principalMacros = false; }
    if (b.dataset.act === 'toggle-principal') cfg.principalMacros = !cfg.principalMacros;
    if (b.dataset.act === 'hide-mouse') { delete kbConf(kb).useAnyway; st.selected = null; changed(); setKeyboards(st.keyboards.filter((k) => k.id !== 'simule')); return; }
    changed();
    renderAll();
  });

  // =====================================================================
  //  Étapes 1 - 2 - 3
  // =====================================================================
  function displayName(entry) {
    if (!entry) return '';
    if (entry.name) return entry.name;
    const a = entry.actions[0];
    return a ? TYPES[a.type] + ' — ' + detailOf(a) : 'Macro';
  }

  function detailOf(a) {
    switch (a.type) {
      case 'prog': return (a.label ? tr(a.label) : baseName(a.path)) + (a.window === 'max' ? tr(' (agrandie)') : a.window === 'min' ? tr(' (réduite)') : '');
      case 'url': return String(a.url || '').replace(/^https?:\/\//i, '') + (a.browser && a.browser !== 'default' ? ' · ' + (a.browserName || a.browser) + (a.private ? tr(' (privé)') : '') : '');
      case 'text': {
        const t = String(a.text || '').replace(/\s+/g, ' ').trim();
        return tr('« {t} »', { t: t.length > 40 ? t.slice(0, 40) + '…' : t }) + (a.mode === 'type' ? tr(' (tapé)') : '');
      }
      case 'combo': return (a.keys || []).map(tr).join() + (a.label ? ' (' + tr(a.label) + ')' : '');
      case 'wait': return a.kind === 'window' ? tr('que « {w} » s’ouvre', { w: a.window || '' }) : fmtSec((a.ms || 0) / 1000) + ' s';
      default: return '';
    }
  }

  function renderSteps() {
    const steps = $('steps');
    const kb = byId(st.selected);
    if (!kb) { steps.innerHTML = ''; return; }

    if (!macrosAllowed(kb)) {
      const principal = isPrincipal(kb);
      steps.innerHTML = '<section class="card lock-panel">'
        + '<span class="ic ic-lock">' + svg('lock', 26) + '</span>'
        + '<h2>' + (principal ? tr('Ton clavier principal est verrouillé') : tr('Ce clavier ne peut pas recevoir de macros')) + '</h2>'
        + (principal
          ? '<p>' + esc(tr('Keyboard Bro ne touchera jamais à ses touches : elles fonctionnent toujours normalement. C’est le réglage recommandé.')) + '</p>'
            + '<p>' + esc(tr('Tu peux quand même donner des macros à quelques touches de ce clavier, par exemple F13 à F19, Pause ou le pavé numérique.')) + '</p>'
            + '<button type="button" class="btn btn-primary" data-act="toggle-principal">' + svg('unlock', 16) + esc(tr('Permettre des macros sur ce clavier')) + '</button>'
          : '<p>' + esc(tr('C’est un clavier virtuel (bureau à distance, clavier à l’écran…) ou des touches simulées par un logiciel.')) + '</p>')
        + '</section>';
      return;
    }

    const conf = kbConf(kb);
    const ek = st.edit[kb.id] || null;
    const sid = ek ? storeId(kb, ek) : null;
    const entry = sid ? conf.keys[sid] : null;
    const label = keyLabel(ek);
    const bankNote = hasBanks(kb) && isGKey(ek) ? ' ' + tr('(banque {b})', { b: bankOf(kb) }) : '';
    const big = label.length > 6 ? 22 : (label.length > 3 ? 30 : 46);
    const assignedCount = Object.keys(conf.keys).length;

    // Étape 1
    const s1 = '<section class="card step">'
      + '<div class="step-head"><span class="num">1</span><h2>' + esc(tr('Choisis une touche')) + '</h2></div>'
      + '<p>' + esc(tr('Appuie sur une touche de ce clavier, ou clique-la sur le dessin.')) + '</p>'
      + (ek
        ? '<div class="bigkey" style="font-size:' + big + 'px">' + esc(label) + '</div>'
          + '<div class="box info"><strong>' + esc(tr('Tu modifies la touche {k}', { k: label + bankNote })) + '</strong>' + esc(keyTip(ek) !== label ? keyTip(ek) : '') + '</div>'
          + (entry
            ? '<div class="box warn">' + esc(tr('Cette touche fait déjà « {name} ». Tes changements remplacent l’ancienne version.', { name: displayName(entry) })) + '</div>'
            : '<div class="box ok">' + esc(tr('Cette touche est libre. Ajoute une action à l’étape 2 et elle deviendra bleue sur le dessin.')) + '</div>')
        : '<div class="bigkey wait" style="font-size:40px">?</div><div class="box info"><strong>' + esc(tr('En attente d’une touche…')) + '</strong>' + esc(tr('Appuie sur la touche que tu veux programmer.')) + '</div>')
      + '</section>';

    // Étape 2
    let s2 = '<section class="card step">'
      + '<div class="step-head"><span class="num">2</span><h2>' + esc(tr('Ce que fait la touche')) + '</h2>'
      + (ek ? '<input id="macro-name" class="name-input" maxlength="60" placeholder="' + esc(tr('Nom de la macro (ex. Note rapide)')) + '" aria-label="' + esc(tr('Nom de la macro')) + '" value="' + esc(entry ? entry.name : '') + '">' : '')
      + '<span class="spacer"></span>' + (st.live ? '<span class="live-state" title="' + esc(tr('Les macros ne partent pas quand Keyboard Bro est la fenêtre active : tu peux choisir et essayer tes touches ici en paix. Clique dans un autre programme (ou sur le bureau), puis appuie sur la touche.')) + '"></span>' : '<span class="soon">' + esc(tr('Mode démonstration : les touches ne lancent rien')) + '</span>') + '</div>';
    if (!ek) {
      s2 += '<div class="placeholder with-mascot"><img class="mascot mascot-md" src="logo.png" alt="" width="120" height="120">' + esc(tr('Choisis d’abord une touche à l’étape 1.')) + '</div>';
    } else {
      const actions = entry ? entry.actions : [];
      s2 += '<ol class="actions">' + actions.map((a, i) => '<li class="action">'
        + '<span class="n">' + (i + 1) + '</span>'
        + '<span class="ic ic-' + a.type + '">' + svg(a.type, 16) + '</span>'
        + '<span class="txt" title="' + esc(TYPES[a.type] + ' — ' + detailOf(a)) + '"><strong>' + esc(TYPES[a.type]) + '</strong><span> — ' + esc(detailOf(a)) + '</span></span>'
        + '<button type="button" class="icon-btn" data-act="up" data-i="' + i + '" aria-label="' + esc(tr('Monter l’action {n}', { n: i + 1 })) + '"' + (i === 0 ? ' disabled' : '') + '>' + svg('up', 15) + '</button>'
        + '<button type="button" class="icon-btn" data-act="down" data-i="' + i + '" aria-label="' + esc(tr('Descendre l’action {n}', { n: i + 1 })) + '"' + (i === actions.length - 1 ? ' disabled' : '') + '>' + svg('down', 15) + '</button>'
        + '<button type="button" class="btn btn-sm" data-act="edit" data-i="' + i + '">' + esc(tr('Modifier')) + '</button>'
        + '<button type="button" class="icon-btn" data-act="del" data-i="' + i + '" aria-label="' + esc(tr('Supprimer l’action {n}', { n: i + 1 })) + '">' + svg('trash', 15) + '</button>'
        + '</li>').join('') + '</ol>';
      if (!actions.length) s2 += '<div class="placeholder small">' + esc(tr('Aucune action pour l’instant. Ajoute-en une ci-dessous : elles s’exécuteront dans l’ordre.')) + '</div>';
      s2 += '<div class="add"><span class="eyebrow">' + esc(tr('Ajouter une action')) + '</span><div class="add-grid">'
        + ['prog', 'url', 'text', 'combo', 'wait'].map((t) => '<button type="button" class="add-btn ' + t + '" data-act="add" data-type="' + t + '"><span class="ico">' + svg(t, 17) + '</span>' + ({ prog: tr('Fichier ou programme'), url: tr('Ouvrir une URL'), text: tr('Coller du texte'), combo: tr('Combinaison de touches'), wait: tr('Attendre') })[t] + '</button>').join('')
        + '<button type="button" class="add-btn script" disabled title="' + esc(tr('Bientôt : importer un script AutoHotkey et le convertir en profil')) + '"><span class="ico">' + svg('upload', 17) + '</span><span class="two">' + esc(tr('Importer un script AHK')) + '<small>' + esc(tr('bientôt · converti en profil')) + '</small></span></button>'
        + '</div></div>';
    }
    s2 += '</section>';

    // Étape 3
    const s3 = '<section class="card step">'
      + '<div class="step-head"><span class="num">3</span><h2>' + esc(tr('Sauvegarde')) + '</h2></div>'
      + '<div class="savebox"><span class="bubble">' + svg('check', 18, 2.6) + '</span><div><strong class="save-title"></strong><span class="save-text"></span></div></div>'
      + '<div class="stat">' + esc(trn(assignedCount, '{n} touche assignée sur ce clavier', '{n} touches assignées sur ce clavier')) + '</div>'
      + '<div class="stack push">'
      + (entry ? '<button type="button" class="btn btn-danger" data-act="clear-key">' + svg('trash', 15) + esc(tr('Effacer la touche {k}', { k: label })) + '</button>' : '')
      + '<button type="button" class="btn" data-act="export">' + svg('download', 15) + esc(tr('Exporter une copie…')) + '</button>'
      + '<button type="button" class="btn" data-act="import">' + svg('upload', 15) + esc(tr('Importer une configuration…')) + '</button>'
      + '</div></section>';

    steps.innerHTML = s1 + s2 + s3;
    paintSave();
    paintMacros();

    const name = $('macro-name');
    if (name) {
      name.addEventListener('input', () => {
        const e = conf.keys[sid];
        if (!e) { if (!name.value.trim()) return; conf.keys[sid] = { name: name.value, actions: [] }; }
        else e.name = name.value;
        changed();
        paintBoard();
      });
    }
  }

  $('steps').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    const kb = byId(st.selected);
    if (act === 'toggle-principal') { cfg.principalMacros = !cfg.principalMacros; changed(); renderAll(); return; }
    if (act === 'export') { exportConfig(); return; }
    if (act === 'import') { importConfig(); return; }
    if (!kb) return;
    const conf = kbConf(kb);
    const ek = st.edit[kb.id];
    if (!ek) return;
    const sid = storeId(kb, ek);
    const entry = conf.keys[sid];
    const i = Number(b.dataset.i);
    const save = () => {
      if (entry && !entry.actions.length && !entry.name) delete conf.keys[sid];
      changed(); paintBoard(); renderSteps();
    };
    if (act === 'add') {
      openAction(b.dataset.type, null, (a) => {
        if (!conf.keys[sid]) conf.keys[sid] = { name: '', actions: [] };
        conf.keys[sid].actions.push(a);
        changed(); paintBoard(); renderSteps();
      });
    } else if (act === 'edit' && entry) {
      const old = entry.actions[i];
      openAction(old.type, old, (a) => { entry.actions[i] = a; save(); });
    } else if (act === 'del' && entry) {
      entry.actions.splice(i, 1);
      if (!entry.actions.length) delete conf.keys[sid];
      save();
    } else if (act === 'up' && entry && i > 0) {
      [entry.actions[i - 1], entry.actions[i]] = [entry.actions[i], entry.actions[i - 1]]; save();
    } else if (act === 'down' && entry && i < entry.actions.length - 1) {
      [entry.actions[i + 1], entry.actions[i]] = [entry.actions[i], entry.actions[i + 1]]; save();
    } else if (act === 'clear-key' && entry) {
      confirmBox(tr('Effacer la touche {k} ?', { k: keyLabel(ek) }), trn(entry.actions.length, 'Son action sera supprimée et la touche redeviendra libre.', 'Ses {n} actions seront supprimées et la touche redeviendra libre.'), tr('Effacer'), () => {
        delete conf.keys[sid]; changed(); paintBoard(); renderSteps();
      });
    }
  });

  // =====================================================================
  //  Vue générale
  // =====================================================================
  function renderAll() {
    renderTabs();
    const empty = st.selected === 'empty';
    $('kb-view').hidden = empty;
    $('empty-view').hidden = !empty;
    if (empty) { $('detect-msg').textContent = ''; renderSetAside(); return; }
    const kb = byId(st.selected);
    if (!kb) return;
    renderCard(kb);
    renderSteps();
  }

  // Appareils mis de côté (souris qui se présentent aussi comme des claviers)
  function renderSetAside() {
    const box = $('set-aside');
    const mice = st.keyboards.filter((k) => isReal(k) && isHiddenMouse(k));
    if (!mice.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="eyebrow">' + esc(tr('Mis de côté')) + '</div>' + mice.map((k) => '<div class="aside-row">'
      + '<span class="grow"><strong>' + esc(k.name) + '</strong><small>' + esc(tr('Partie « clavier » d’une souris')) + (k.vid ? ' · ' + esc(k.vid + ':' + k.pid) : '') + '</small></span>'
      + '<button type="button" class="btn btn-sm" data-use="' + esc(k.id) + '">' + esc(tr('L’utiliser comme clavier')) + '</button></div>').join('');
  }
  $('set-aside').addEventListener('click', (e) => {
    const b = e.target.closest('[data-use]');
    const kb = b && byId(b.dataset.use);
    if (!kb) return;
    kbConf(kb).useAnyway = true;
    changed();
    select(kb.id);
  });

  $('detect').addEventListener('click', async () => {
    const msg = $('detect-msg');
    msg.textContent = tr('Recherche…');
    const before = new Set(macroKeyboards().map((k) => k.id));
    if (invoke && st.live) {
      try { setKeyboards(await invoke('list_keyboards')); } catch (e) { msg.textContent = tr('Erreur : ') + e; return; }
    }
    const fresh = macroKeyboards().find((k) => !before.has(k.id));
    if (fresh) { select(fresh.id); toast(tr('Nouveau clavier trouvé : ') + fresh.name); return; }
    $('detect-msg').textContent = tr('Aucun nouveau clavier trouvé. Vérifie qu’il est bien branché (ou allumé, s’il est Bluetooth), puis appuie sur une de ses touches.');
  });

  // =====================================================================
  //  Terminal
  // =====================================================================
  function logEmpty() {
    const log = $('log');
    log.innerHTML = '<div class="empty">' + (st.live
      ? tr('Appuie sur une touche de n’importe quel clavier : elle apparaît ici avec le nom du clavier et ses codes.')
      : tr('Mode démonstration : tape dans cette fenêtre pour voir les touches.')) + '</div>';
    st.lineCount = 0;
  }
  function logKey(ev, kid) {
    if (st.paused || (!ev.down && !st.showUp)) return;
    const log = $('log');
    if (st.lineCount === 0) log.textContent = '';
    const kb = byId(ev.device);
    const color = kb && isReal(kb) ? TERM_COLORS[colorIndex(kb) % TERM_COLORS.length] : '#C4CAD4';
    const codes = ev.code
      || ('vk ' + KBKeymap.hex(ev.vkey, 2) + ' · scan ' + (ev.e0 ? 'E0 ' : '') + (ev.e1 ? 'E1 ' : '') + KBKeymap.hex(ev.make, 2));
    const line = frag('<div class="line' + (ev.down ? '' : ' up') + '"><span class="t">' + clock(new Date()) + '</span>'
      + '<span class="tag" style="--c:' + color + '">' + esc(titleOf(kb)) + '</span>'
      + '<span class="k">' + esc(keyLabel(kid)) + '</span><span>' + (ev.down ? '↓' : '↑') + '</span>'
      + (ev.fired ? '<span class="' + (ev.skipped ? 'skip' : 'fire') + '" title="' + esc(ev.skipped ? tr('Pas lancée : ') + ev.skipped : tr('Macro lancée')) + '">→ ' + esc(ev.fired) + (ev.skipped ? tr(' (pas lancée)') : '') + '</span>' : '')
      + (ev.blocked && !ev.fired && ev.down ? '<span class="hid" title="' + esc(tr('Touche programmée : cachée aux autres programmes')) + '">' + esc(tr('cachée')) + '</span>' : '')
      + '<span class="codes" title="' + esc(codes) + '">' + esc(codes) + '</span></div>');
    log.append(line);
    st.lineCount++;
    while (log.childElementCount > MAX_LINES) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  $('pause').addEventListener('click', () => {
    st.paused = !st.paused;
    $('pause').textContent = st.paused ? tr('Reprendre') : 'Pause';
    $('term-title').classList.toggle('paused', st.paused);
  });
  $('clear').addEventListener('click', logEmpty);
  $('follow').addEventListener('change', (e) => { st.follow = e.target.checked; });
  $('show-up').addEventListener('change', (e) => { st.showUp = e.target.checked; });

  // =====================================================================
  //  Une touche arrive (d'un vrai clavier, ou du mode démonstration)
  // =====================================================================
  function onKey(ev, kid) {
    if (ev.device === 'simule' && !byId('simule')) {
      st.keyboards.push({ id: 'simule', name: tr('Touches simulées par un logiciel'), vendor: '', vid: '', pid: '', interfaces: 1, virtual: true, bus: '' });
    }
    const down = st.down[ev.device] || (st.down[ev.device] = new Set());
    const repeat = ev.down && kid && down.has(kid);
    if (kid) { if (ev.down) down.add(kid); else down.delete(kid); }
    if (!repeat) logKey(ev, kid);
    if (ev.down && ev.fired && ev.skipped && Date.now() - (st.skipToast || 0) > 6000) {
      st.skipToast = Date.now();
      toast(tr('« {name} » n’est pas lancée quand Keyboard Bro est la fenêtre active. Clique dans un autre programme (ex. le bureau), puis appuie sur la touche.', { name: ev.fired }));
    }

    const kb = byId(ev.device);
    const busy = st.dialog || isTyping(document.activeElement);
    if (ev.down && !repeat) {
      pulseTab(ev.device);
      // Suivre le clavier utilisé (jamais vers le clavier principal : il sert à écrire).
      if (!busy && st.follow && isShown(kb) && !isPrincipal(kb) && ev.device !== st.selected) select(ev.device);
      if (hasBanks(kb) && isGKey(kid)) st.lastG[kb.id] = Date.now();
      // G710 : M1, M2, M3 changent de banque (même pendant qu'on écrit).
      if (hasBanks(kb) && BANKS.includes(kid)) {
        if (macrosAllowed(kb)) setBank(kb, kid);
      // G710 pas encore séparé : G1 tape aussi « 1 » — on garde la touche G.
      } else if (hasBanks(kb) && /^[1-6]$/.test(kid || '') && Date.now() - (st.lastG[kb.id] || 0) < 120) {
        // rien
      // Étape 1 : la touche appuyée devient la touche en modification.
      } else if (!busy && kb && ev.device === st.selected && kid && macrosAllowed(kb)) {
        if (board.els.some((x) => x.k.id === kid && !x.k.na)) {
          if (st.edit[kb.id] !== kid) setEdit(kb, kid);
        } else {
          $('layout-hint').textContent = tr('« {k} » n’est pas sur ce dessin : essaie une autre disposition.', { k: keyLabel(kid) });
        }
      }
    }
    if (ev.device === st.selected) paintBoard();
  }

  // Empêche les raccourcis de la fenêtre (F5 = recharger, Ctrl+F = chercher…) quand on n'écrit pas.
  window.addEventListener('keydown', (e) => {
    // Recharger la fenêtre effacerait le terminal : toujours bloqué.
    if (e.key === 'F5' || (e.ctrlKey && /^r$/i.test(e.key))) { e.preventDefault(); return; }
    if (isTyping(e.target) || st.dialog) return;
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key) || (e.ctrlKey && /^[fpgjhu]$/i.test(e.key))) e.preventDefault();
  });

  // =====================================================================
  //  Fenêtres (dialogues)
  // =====================================================================
  function openModal(o) {
    closeModal();
    const root = $('modal-root');
    const wrap = frag('<div class="overlay"><div class="dialog' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="dlg-title">'
      + '<div class="dlg-head"><span class="ic ic-' + o.kind + '">' + svg(o.icon || o.kind, 19) + '</span>'
      + '<div class="dlg-titles"><h2 id="dlg-title">' + esc(o.title) + '</h2><div class="muted">' + esc(o.sub || '') + '</div></div>'
      + '<button type="button" class="icon-btn" data-x aria-label="' + esc(tr('Fermer')) + '">' + svg('x', 16) + '</button></div>'
      + '<div class="dlg-body"></div>'
      + '<div class="dlg-foot"><span class="dlg-msg muted"></span><span class="spacer"></span>'
      + (o.noCancel ? '' : '<button type="button" class="btn" data-x>' + esc(tr('Annuler')) + '</button>')
      + '<button type="button" class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + esc(o.okText || tr('Ajouter à la suite')) + '</button></div></div></div>');
    wrap.querySelector('.dlg-body').append(o.body);
    const api = {
      el: wrap,
      msg(text, bad) { const m = wrap.querySelector('.dlg-msg'); m.textContent = text || ''; m.classList.toggle('bad', !!bad); }
    };
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) closeModal();
      else if (e.target.closest('[data-ok]')) { if (o.onOk(api) !== false) closeModal(); }
    });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeModal(); } });
    root.append(wrap);
    st.dialog = true;
    setTimeout(() => { const f = wrap.querySelector('[data-autofocus]') || wrap.querySelector('[data-ok]'); if (f) f.focus(); }, 0);
    return api;
  }
  function closeModal() {
    $('modal-root').textContent = '';
    st.dialog = false;
  }
  function confirmBox(title, text, okText, onYes) {
    openModal({ kind: 'lock', icon: 'dots', title, sub: '', body: frag('<p class="muted" style="margin:0;line-height:1.6">' + esc(text) + '</p>'), okText, danger: true, onOk: () => { onYes(); } });
  }

  async function pickFile(filters) {
    if (!invoke) { toast(tr('Disponible dans le programme seulement.')); return null; }
    try {
      const r = await invoke('plugin:dialog|open', { options: { multiple: false, directory: false, filters } });
      return typeof r === 'string' ? r : (r && r.path) || null;
    } catch (e) { toast(tr('Impossible d’ouvrir l’explorateur : ') + e, true); return null; }
  }

  function openAction(type, existing, done) {
    ({ prog: dlgProg, url: dlgUrl, text: dlgText, combo: dlgCombo, wait: dlgWait })[type](existing, done);
  }
  const okLabel = (existing) => (existing ? tr('Enregistrer') : tr('Ajouter à la suite'));

  // ---------- Fichier ou programme ----------
  const APPS = [['Bloc-notes', 'notepad.exe'], ['Calculatrice', 'calc.exe'], ['Paint', 'mspaint.exe'], ['Explorateur', 'explorer.exe'], ['Terminal', 'wt.exe'], ['Gestionnaire des tâches', 'taskmgr.exe']];
  function dlgProg(a, done) {
    const s = { path: a ? a.path : 'notepad.exe', label: a ? a.label : 'Bloc-notes', window: a ? (a.window || 'normal') : 'normal' };
    const body = frag('<div class="dlg-body" style="padding:0">'
      + '<button type="button" class="browse" data-browse><span class="ic">' + svg('search', 20) + '</span><span><strong>' + esc(tr('Parcourir l’ordinateur…')) + '</strong><span>' + esc(tr('Ouvre l’explorateur pour choisir un programme, un fichier ou un raccourci.')) + '</span></span></button>'
      + '<div><div class="eyebrow" style="margin-bottom:8px">' + esc(tr('Programmes courants')) + '</div><div class="grid3" data-apps></div></div>'
      + '<label class="field-col">' + esc(tr('Chemin')) + '<input type="text" class="input mono" data-path spellcheck="false"></label>'
      + '<div><div class="label">' + esc(tr('Taille de la fenêtre au lancement')) + '</div><div class="seg" data-seg></div></div></div>');
    const appsEl = body.querySelector('[data-apps]'), pathEl = body.querySelector('[data-path]'), segEl = body.querySelector('[data-seg]');
    const paint = () => {
      appsEl.innerHTML = APPS.map(([n, e]) => '<button type="button" class="choice' + (s.path.toLowerCase() === e ? ' on' : '') + '" data-exe="' + e + '" data-name="' + esc(n) + '"><strong>' + esc(tr(n)) + '</strong><span class="mono">' + e + '</span></button>').join('');
      pathEl.value = s.path;
      segEl.innerHTML = [['normal', tr('Normale')], ['max', tr('Agrandie')], ['min', tr('Réduite')]].map(([v, l]) => '<button type="button" class="' + (s.window === v ? 'on' : '') + '" data-win="' + v + '">' + l + '</button>').join('');
    };
    paint();
    appsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-exe]'); if (!b) return; s.path = b.dataset.exe; s.label = b.dataset.name; paint(); });
    segEl.addEventListener('click', (e) => { const b = e.target.closest('[data-win]'); if (!b) return; s.window = b.dataset.win; paint(); });
    pathEl.addEventListener('input', () => {
      s.path = pathEl.value.trim();
      const m = APPS.find((x) => x[1] === s.path.toLowerCase());
      s.label = m ? m[0] : '';
      appsEl.querySelectorAll('[data-exe]').forEach((b) => b.classList.toggle('on', b.dataset.exe === s.path.toLowerCase()));
    });
    body.querySelector('[data-browse]').addEventListener('click', async () => {
      const p = await pickFile([{ name: tr('Programmes et raccourcis'), extensions: ['exe', 'lnk', 'bat', 'cmd', 'app'] }, { name: tr('Tous les fichiers'), extensions: ['*'] }]);
      if (p) { s.path = p; s.label = ''; paint(); }
    });
    openModal({
      kind: 'prog', title: tr('Ouvrir un fichier ou un programme'), sub: tr('Choisis un programme courant ou n’importe quel fichier de ton ordinateur.'), body, okText: okLabel(a),
      onOk: (m) => {
        if (!s.path) { m.msg(tr('Choisis un programme ou un fichier.'), true); return false; }
        done({ type: 'prog', path: s.path, label: s.label || baseName(s.path), window: s.window });
      }
    });
  }

  // ---------- Ouvrir une URL ----------
  function dlgUrl(a, done) {
    const s = { url: a ? a.url : 'https://', browser: a ? (a.browser || 'default') : 'default', priv: a ? !!a.private : false, list: [], custom: a && a.browser === 'custom' ? a.browserPath : '' };
    const body = frag('<div class="dlg-body" style="padding:0">'
      + '<label class="field-col">' + esc(tr('Adresse (URL)')) + '<input type="text" class="input big" data-url data-autofocus spellcheck="false" placeholder="' + esc(tr('https://')) + '"></label>'
      + '<div><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px"><span class="eyebrow">' + esc(tr('Avec quel navigateur ?')) + '</span><span class="muted small">' + esc(tr('Trouvés automatiquement sur cet ordinateur')) + '</span></div><div class="rows" data-list></div>'
      + '<button type="button" class="linkish" data-other>' + esc(tr('Ton navigateur n’est pas là ? Le choisir dans l’ordinateur…')) + '</button></div>'
      + '<label class="checkline" data-privline><input type="checkbox" data-priv> <span>' + esc(tr('Ouvrir en navigation privée')) + ' <span class="muted small" data-privhint></span></span></label></div>');
    const urlEl = body.querySelector('[data-url]'), listEl = body.querySelector('[data-list]'), privEl = body.querySelector('[data-priv]');
    urlEl.value = s.url;
    const paint = () => {
      const rows = [{ id: 'default', name: tr('Navigateur par défaut'), path: tr('Celui que l’ordinateur utilise déjà'), installed: true }].concat(s.list);
      if (s.custom) rows.push({ id: 'custom', name: baseName(s.custom) || tr('Autre navigateur'), path: s.custom, installed: true });
      listEl.innerHTML = rows.map((b) => '<button type="button" class="row-choice' + (b.id === s.browser ? ' on' : '') + '" data-id="' + esc(b.id) + '"' + (b.installed ? '' : ' disabled') + '>'
        + '<span class="radio"></span><span class="grow"><strong>' + esc(b.name) + '</strong><span class="mono">' + esc(b.path) + '</span></span>'
        + (b.id === 'default' ? '<span class="badge ok">' + esc(tr('Recommandé')) + '</span>' : (b.installed ? '<span class="badge in">' + esc(tr('Installé')) + '</span>' : '<span class="badge no">' + esc(tr('Pas trouvé')) + '</span>'))
        + '</button>').join('');
      const def = s.browser === 'default';
      privEl.disabled = def;
      privEl.checked = s.priv && !def;
      body.querySelector('[data-privhint]').textContent = def ? tr('(choisis un navigateur précis pour cette option)') : '';
    };
    paint();
    if (invoke) invoke('list_browsers').then((list) => { s.list = list || []; paint(); }).catch(() => {});
    listEl.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (!b || b.disabled) return; s.browser = b.dataset.id; paint(); });
    privEl.addEventListener('change', () => { s.priv = privEl.checked; });
    urlEl.addEventListener('input', () => { s.url = urlEl.value; });
    body.querySelector('[data-other]').addEventListener('click', async () => {
      const p = await pickFile([{ name: tr('Programmes'), extensions: ['exe', 'app'] }]);
      if (p) { s.custom = p; s.browser = 'custom'; paint(); }
    });
    openModal({
      kind: 'url', title: tr('Ouvrir une URL'), sub: tr('Colle l’adresse du site et choisis le navigateur.'), body, okText: okLabel(a),
      onOk: (m) => {
        let u = s.url.trim();
        if (u && !/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
        let ok = false;
        try { const p = new URL(u); ok = (p.protocol === 'http:' || p.protocol === 'https:') && (p.hostname.includes('.') || p.hostname === 'localhost'); } catch { ok = false; }
        if (!ok) { m.msg(tr('Cette adresse ne semble pas valide (ex. meteo.gc.ca ou https://www.google.com).'), true); return false; }
        const chosen = s.browser === 'custom' ? { name: baseName(s.custom), path: s.custom } : s.list.find((b) => b.id === s.browser);
        done({
          type: 'url', url: u, browser: s.browser,
          browserName: s.browser === 'default' ? '' : (chosen ? chosen.name : s.browser),
          browserPath: s.browser === 'default' ? '' : (chosen ? chosen.path : ''),
          private: s.priv && s.browser !== 'default'
        });
      }
    });
  }

  // ---------- Coller du texte ----------
  function dlgText(a, done) {
    const s = { text: a ? a.text : '', mode: a ? (a.mode || 'paste') : 'paste' };
    const body = frag('<div class="dlg-body" style="padding:0">'
      + '<label class="field-col">' + esc(tr('Texte')) + '<textarea class="input" rows="5" data-text data-autofocus placeholder="' + esc(tr('Écris ou colle ton texte ici…')) + '"></textarea></label>'
      + '<div><div class="label">' + esc(tr('Insérer une valeur automatique')) + '</div><div class="chips" data-vars></div></div>'
      + '<div><div class="eyebrow" style="margin-bottom:6px">' + esc(tr('Aperçu')) + '</div><div class="preview" data-prev></div></div>'
      + '<div><div class="label">' + esc(tr('Façon d’insérer')) + '</div><div class="rows" data-modes></div></div></div>');
    const ta = body.querySelector('[data-text]'), prev = body.querySelector('[data-prev]'), modes = body.querySelector('[data-modes]');
    ta.value = s.text;
    // Valeurs automatiques : un nom par langue, mais tous les noms marchent partout
    // (une macro écrite avec {heure} marche aussi en anglais, et {time} en français).
    const VARS = {
      fr: [['{date}', 'date du jour'], ['{heure}', 'heure'], ['{presse-papiers}', 'ce que tu as copié'], ['{curseur}', 'place du curseur']],
      en: [['{date}', 'today’s date'], ['{time}', 'time'], ['{clipboard}', 'what you copied'], ['{cursor}', 'cursor position']],
      es: [['{fecha}', 'fecha de hoy'], ['{hora}', 'hora'], ['{portapapeles}', 'lo que copiaste'], ['{cursor}', 'posición del cursor']]
    }[KBI18n.lang];
    const ALIASES = { date: ['{date}', '{fecha}'], time: ['{heure}', '{time}', '{hora}'], clip: ['{presse-papiers}', '{clipboard}', '{portapapeles}'], cursor: ['{curseur}', '{cursor}'] };
    body.querySelector('[data-vars]').innerHTML = VARS.map(([t, l]) => '<button type="button" class="chipbtn" data-var="' + t + '"><span class="mono">' + t + '</span>' + esc(l) + '</button>').join('');
    const swap = (text, names, value) => names.reduce((acc, n) => acc.split(n).join(value), text);
    const paintPrev = () => {
      const now = new Date();
      const time = KBI18n.lang === 'fr' ? two(now.getHours()) + ' h ' + two(now.getMinutes())
        : KBI18n.lang === 'es' ? two(now.getHours()) + ':' + two(now.getMinutes())
          : now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      let out = s.text || '…';
      out = swap(out, ALIASES.date, now.toLocaleDateString(KBI18n.lang === 'en' ? 'en-US' : KBI18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' }));
      out = swap(out, ALIASES.time, time);
      out = swap(out, ALIASES.clip, tr('[ce que tu as copié]'));
      prev.textContent = swap(out, ALIASES.cursor, '|');
    };
    const paintModes = () => {
      modes.innerHTML = [['paste', tr('Coller d’un coup'), tr('Instantané. Recommandé dans presque tous les logiciels.')], ['type', tr('Taper lettre par lettre'), tr('Plus lent, pour les logiciels qui bloquent le collage.')]]
        .map(([v, t, h]) => '<button type="button" class="row-choice' + (s.mode === v ? ' on' : '') + '" data-mode="' + v + '"><span class="radio"></span><span class="grow"><strong>' + t + '</strong><small>' + h + '</small></span></button>').join('');
    };
    paintPrev(); paintModes();
    ta.addEventListener('input', () => { s.text = ta.value; paintPrev(); });
    body.querySelector('[data-vars]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-var]'); if (!b) return;
      const start = ta.selectionStart ?? ta.value.length, end = ta.selectionEnd ?? ta.value.length;
      ta.value = ta.value.slice(0, start) + b.dataset.var + ta.value.slice(end);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + b.dataset.var.length;
      s.text = ta.value; paintPrev();
    });
    modes.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (!b) return; s.mode = b.dataset.mode; paintModes(); });
    const m = openModal({
      kind: 'text', title: tr('Coller du texte'), sub: tr('Le texte sera inséré là où se trouve ton curseur.'), body, okText: okLabel(a),
      onOk: (api) => {
        if (!s.text.trim()) { api.msg(tr('Écris le texte à coller.'), true); return false; }
        done({ type: 'text', text: s.text, mode: s.mode });
      }
    });
    m.msg(tr('Ton presse-papiers est remis comme avant après le collage.'));
  }

  // ---------- Attendre ----------
  function dlgWait(a, done) {
    const s = { kind: a ? (a.kind || 'time') : 'time', sec: a && a.ms ? a.ms / 1000 : 0.5, win: a && a.window ? a.window : tr('Bloc-notes') };
    const body = frag('<div class="dlg-body" style="padding:0">'
      + '<div class="seg" data-tabs><button type="button" data-k="time">' + esc(tr('Un temps fixe')) + '</button><button type="button" data-k="window">' + esc(tr('Qu’une fenêtre s’ouvre')) + '</button></div>'
      + '<div data-time><div class="bignum"><b data-num></b><span data-unit></span></div>'
      + '<input type="range" min="0.1" max="10" step="0.1" aria-label="' + esc(tr('Durée en secondes')) + '" data-range><div class="scale"><span>' + fmtSec(0.1) + ' s</span><span>10 s</span></div>'
      + '<div class="chips" style="justify-content:center;margin-top:12px" data-presets></div></div>'
      + '<div data-win class="dlg-body" style="padding:0"><label class="field-col">' + esc(tr('Nom de la fenêtre à attendre')) + '<input type="text" class="input big" data-winname placeholder="' + esc(tr('ex. Bloc-notes')) + '"></label>'
      + '<div class="box info">' + esc(tr('On passe à l’action suivante dès que cette fenêtre apparaît, ou après 10 secondes au maximum. Plus fiable qu’un temps fixe : un ordinateur lent ne brise pas la macro.')) + '</div></div></div>');
    const range = body.querySelector('[data-range]'), nameEl = body.querySelector('[data-winname]');
    range.value = String(s.sec);
    nameEl.value = s.win;
    const paint = () => {
      body.querySelectorAll('[data-tabs] button').forEach((b) => b.classList.toggle('on', b.dataset.k === s.kind));
      body.querySelector('[data-time]').hidden = s.kind !== 'time';
      body.querySelector('[data-win]').hidden = s.kind !== 'window';
      body.querySelector('[data-num]').textContent = fmtSec(s.sec);
      body.querySelector('[data-unit]').textContent = s.sec >= 2 || (KBI18n.lang !== 'fr' && s.sec !== 1) ? tr('secondes') : tr('seconde');
      body.querySelector('[data-presets]').innerHTML = [0.1, 0.5, 1, 2, 5].map((v) => '<button type="button" class="chipbtn' + (Math.abs(v - s.sec) < 0.01 ? ' on' : '') + '" data-v="' + v + '">' + fmtSec(v) + ' s</button>').join('');
    };
    paint();
    body.querySelector('[data-tabs]').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; s.kind = b.dataset.k; paint(); if (s.kind === 'window') nameEl.focus(); });
    range.addEventListener('input', () => { s.sec = parseFloat(range.value); paint(); });
    body.querySelector('[data-presets]').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; s.sec = parseFloat(b.dataset.v); range.value = String(s.sec); paint(); });
    nameEl.addEventListener('input', () => { s.win = nameEl.value; });
    openModal({
      kind: 'wait', title: tr('Attendre'), sub: tr('Laisse le temps à un programme de s’ouvrir avant l’action suivante.'), body, okText: okLabel(a),
      onOk: (m) => {
        if (s.kind === 'window') {
          if (!s.win.trim()) { m.msg(tr('Écris le nom de la fenêtre à attendre.'), true); return false; }
          done({ type: 'wait', kind: 'window', window: s.win.trim() });
        } else {
          done({ type: 'wait', kind: 'time', ms: Math.round(s.sec * 1000) });
        }
      }
    });
  }

  // ---------- Combinaison de touches ----------
  function dlgCombo(a, done) {
    const cats = KBShortcuts.cats();
    const data = KBShortcuts.shortcuts();
    const s = { keys: a ? (a.keys || []).slice() : ['Ctrl', 'S'], label: a ? (a.label || '') : 'Enregistrer', query: '', cat: 'all', listening: false, partial: [] };
    const body = frag('<div class="dlg-body" style="padding:0">'
      + '<div><div class="label">' + esc(tr('Combinaison choisie — clique dans la case, puis fais la combinaison sur ton clavier')) + '</div><button type="button" class="capture" data-capture data-autofocus></button></div>'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span class="muted small">' + esc(tr('Ou choisis parmi les raccourcis de Windows')) + '</span><span class="muted small" data-count></span></div>'
      + '<div class="search">' + svg('search', 18) + '<input type="text" data-q placeholder="' + esc(tr('Rechercher : capture, bureau, onglet, volume…')) + '" aria-label="' + esc(tr('Rechercher un raccourci')) + '"></div>'
      + '<div class="chips" data-cats></div>'
      + '<div class="sc-list" data-list></div></div>');
    const cap = body.querySelector('[data-capture]'), qEl = body.querySelector('[data-q]'), listEl = body.querySelector('[data-list]'), catsEl = body.querySelector('[data-cats]');
    const norm = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    cats.forEach((c) => { c[1] = tr(c[1]); });
    const catName = {}; cats.forEach((c) => { catName[c[0]] = c[1]; });
    const kcaps = (keys, sm) => keys.map((k, i) => (i ? '<span class="plus">+</span>' : '') + '<span class="kcap' + (sm ? ' sm' : '') + '">' + esc(tr(k)) + '</span>').join('');
    const findLabel = (keys) => { const j = keys.join('|'); const f = data.find((d) => d[2] === j); return f ? f[1] : ''; };
    const paintCap = () => {
      cap.classList.toggle('listening', s.listening);
      const shown = s.listening && s.partial.length ? s.partial : s.keys;
      cap.innerHTML = (shown.length ? kcaps(shown) : '<span class="ph">' + esc(tr('Clique ici, puis fais la combinaison…')) + '</span>')
        + '<span class="label-r">' + esc(s.listening ? (s.partial.length ? '…' : tr('Fais la combinaison…')) : tr(s.label || '')) + '</span>';
    };
    const paintList = () => {
      const words = norm(s.query).split(/\s+/).filter(Boolean);
      // Recherche en français ET dans la langue choisie
      const found = data.filter((d) => !words.length || words.every((w) => norm(d[1] + ' ' + tr(d[1]) + ' ' + d[2].replace(/\|/g, ' ') + ' ' + d[2].split('|').map(tr).join(' ') + ' ' + (d[3] || '') + ' ' + (d[4] || '') + ' ' + tr(d[4] || '') + ' ' + catName[d[0]]).includes(w)));
      const shown = found.filter((d) => s.cat === 'all' || d[0] === s.cat);
      body.querySelector('[data-count]').textContent = trn(shown.length, '{n} raccourci', '{n} raccourcis');
      catsEl.innerHTML = [['all', tr('Tous'), found.length]].concat(cats.map((c) => [c[0], c[1], found.filter((d) => d[0] === c[0]).length]))
        .filter((c) => c[0] === 'all' || c[2] > 0 || c[0] === s.cat)
        .map((c) => '<button type="button" class="chipbtn' + (c[0] === s.cat ? ' on' : '') + '" data-cat="' + c[0] + '">' + esc(c[1]) + ' <span style="opacity:.7">' + c[2] + '</span></button>').join('');
      const cur = s.keys.join('|');
      const groups = cats.map((c) => [c, shown.filter((d) => d[0] === c[0])]).filter(([, items]) => items.length);
      listEl.innerHTML = groups.length ? groups.map(([c, items]) => '<div><div class="sc-group-title" style="--c:' + c[2] + '"><i></i>' + esc(c[1]) + ' · ' + items.length + '</div><div class="grid2">'
        + items.map((d) => '<button type="button" class="sc-item' + (d[2] === cur ? ' on' : '') + '" data-keys="' + esc(d[2]) + '" data-name="' + esc(d[1]) + '"><span class="nm"><span>' + esc(tr(d[1])) + '</span>' + (d[4] ? '<small>' + esc(tr(d[4])) + '</small>' : '') + '</span><span class="ks">' + kcaps(d[2].split('|'), true) + '</span></button>').join('')
        + '</div></div>').join('')
        : '<div class="muted" style="text-align:center;padding:20px;line-height:1.6">' + esc(tr('Aucun raccourci trouvé pour « {q} ».', { q: s.query })) + '<br>' + esc(tr('Tu peux aussi cliquer dans la case du haut et faire la combinaison toi-même.')) + '</div>';
    };
    paintCap(); paintList();
    cap.addEventListener('focus', () => { s.listening = true; s.partial = []; paintCap(); });
    cap.addEventListener('blur', () => { s.listening = false; s.partial = []; paintCap(); });
    cap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) return; // Échap seule : fermer la fenêtre
      e.preventDefault();
      e.stopPropagation();
      const mods = [];
      if (e.ctrlKey) mods.push('Ctrl');
      if (e.altKey) mods.push('Alt');
      if (e.shiftKey) mods.push('Maj');
      if (e.metaKey) mods.push('Win');
      const kid = KBKeymap.fromCode(e.code);
      const isMod = !kid || /^(L|R)(Ctrl|Shift|Alt|Win)$/.test(kid);
      if (isMod) { s.partial = mods; paintCap(); return; }
      s.keys = mods.concat([comboName(kid)]);
      s.label = findLabel(s.keys);
      s.partial = [];
      paintCap(); paintList();
    });
    cap.addEventListener('keyup', (e) => { e.preventDefault(); e.stopPropagation(); if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) { s.partial = []; paintCap(); } });
    qEl.addEventListener('input', () => { s.query = qEl.value; paintList(); });
    catsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; s.cat = b.dataset.cat; paintList(); });
    listEl.addEventListener('click', (e) => { const b = e.target.closest('[data-keys]'); if (!b) return; s.keys = b.dataset.keys.split('|'); s.label = b.dataset.name; paintCap(); paintList(); });
    const m = openModal({
      kind: 'combo', title: tr('Combinaison de touches'), sub: tr('Fais la combinaison toi-même, ou choisis un raccourci connu.'), body, okText: okLabel(a), wide: true,
      onOk: (api) => {
        if (!s.keys.length) { api.msg(tr('Choisis une combinaison.'), true); return false; }
        done({ type: 'combo', keys: s.keys.slice(), label: s.label });
      }
    });
    m.msg(tr('« Navigateur » ou « certaines apps » : dépend du logiciel ouvert.'));
  }

  // =====================================================================
  //  Exporter / importer
  // =====================================================================
  const countKeys = (c) => Object.values(c.keyboards).reduce((n, k) => n + Object.keys(k.keys).length, 0);

  async function exportConfig() {
    if (!invoke) { toast(tr('Disponible dans le programme seulement.')); return; }
    try {
      const d = new Date();
      const name = 'keyboard-bro-' + d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + '.json';
      const path = await invoke('plugin:dialog|save', { options: { title: tr('Exporter une copie de la configuration'), defaultPath: name, filters: [{ name: tr('Configuration Keyboard Bro'), extensions: ['json'] }] } });
      if (!path) return;
      await invoke('export_config', { path, json: JSON.stringify(cfg, null, 2) });
      toast(tr('Copie exportée : ') + path);
    } catch (e) { toast(tr('L’exportation n’a pas marché : ') + e, true); }
  }

  async function importConfig() {
    const path = await pickFile([{ name: tr('Configuration Keyboard Bro'), extensions: ['json'] }]);
    if (!path) return;
    let next;
    try { next = normalize(JSON.parse(await invoke('import_config', { path }))); } catch (e) { toast(tr('Ce fichier n’a pas pu être importé : ') + e, true); return; }
    const n = countKeys(next);
    openModal({
      kind: 'upload', icon: 'upload', title: tr('Remplacer ta configuration ?'), sub: path,
      body: frag('<div class="box warn">' + esc(tr('Le fichier contient')) + ' <strong style="display:inline">' + esc(trn(n, '{n} touche assignée', '{n} touches assignées')) + '</strong>. ' + esc(tr('Ta configuration actuelle sera remplacée. Une copie de sécurité de l’ancienne est gardée à côté (keyboard-bro.avant-import.json).')) + '</div>'),
      okText: tr('Remplacer'),
      onOk: () => {
        (async () => {
          try { await invoke('backup_config'); } catch (e) { toast(tr('Copie de sécurité impossible : ') + e, true); return; }
          cfg = next;
          st.edit = {};
          changed();
          renderAll();
          toast(tr('Configuration importée.'));
        })();
      }
    });
  }


  // =====================================================================
  //  Réglages (bouton ⚙ en haut à droite)
  // =====================================================================
  let platform = null;   // réponse de platform_info

  function osWord() {
    const os = platform && platform.os;
    return os === 'windows' ? 'Windows' : os === 'macos' ? tr('le Mac') : tr('l’ordinateur');
  }

  async function openSettings() {
    let auto = null;
    if (invoke) { try { auto = await invoke('autostart_state'); } catch (e) { auto = { supported: false, enabled: false, message: String(e) }; } }
    else auto = { supported: false, enabled: false, message: tr('Disponible dans le programme seulement (ici, c’est un aperçu).') };
    const mac = platform && platform.os === 'macos';
    const where = mac ? tr('le Dock') : tr('la barre des tâches');
    const body = frag('<div class="dlg-body" style="padding:0;gap:0">'
      + '<section class="set-section"><div class="eyebrow">Langue · Language · Idioma</div>'
      + '<div class="seg lang-seg" role="group" aria-label="Langue · Language · Idioma">' + KBI18n.LANGS.map(([code, name]) => '<button type="button" data-lang="' + code + '" class="' + (code === KBI18n.lang ? 'on' : '') + '" aria-pressed="' + (code === KBI18n.lang) + '">' + name + '</button>').join('') + '</div>'
      + '</section>'
      + '<section class="set-section">'
      + '<div class="eyebrow">' + esc(tr('Démarrage')) + '</div>'
      + '<div class="set-row"><button type="button" class="switch" role="switch" data-auto aria-labelledby="set-auto-t"><span></span></button>'
      + '<div class="set-text"><strong id="set-auto-t">' + esc(tr('Démarrer Keyboard Bro avec {os}', { os: osWord() })) + '</strong>'
      + '<span>' + esc(tr('Keyboard Bro s’ouvre tout seul quand tu ouvres ta session : tes macros sont prêtes sans y penser.')) + '</span></div></div>'
      + '<div class="note set-note" data-auto-note hidden></div>'
      + '<div class="set-row set-sub" data-min-row><button type="button" class="switch" role="switch" data-min aria-labelledby="set-min-t"><span></span></button>'
      + '<div class="set-text"><strong id="set-min-t">' + esc(tr('Ouvrir la fenêtre réduite')) + '</strong>'
      + '<span>' + esc(tr('Au démarrage, la fenêtre reste dans {where}. Les macros marchent quand même.', { where })) + '</span></div></div>'
      + '</section>'
      + '<section class="set-section">'
      + '<div class="eyebrow">' + esc(tr('Fichier de configuration')) + '</div>'
      + '<div class="set-path mono" data-cfg></div>'
      + '</section></div>');
    const autoBtn = body.querySelector('[data-auto]'), minBtn = body.querySelector('[data-min]');
    const note = body.querySelector('[data-auto-note]'), minRow = body.querySelector('[data-min-row]');
    body.querySelector('[data-cfg]').textContent = cfgPath || tr('(pas encore sauvegardé)');
    let busy = false;
    const paint = () => {
      autoBtn.setAttribute('aria-checked', String(!!auto.enabled));
      autoBtn.disabled = !auto.supported || busy;
      minBtn.setAttribute('aria-checked', String(cfg.startMinimized));
      minRow.classList.toggle('off', !auto.enabled);
      let text = '', warn = false;
      if (auto.message) { text = auto.message; warn = true; }
      else if (auto.blocked) { text = tr('Keyboard Bro a été désactivé dans le Gestionnaire des tâches (onglet « Applications de démarrage »). Allume l’interrupteur pour le réactiver.'); warn = true; }
      else if (auto.other) { text = tr('Le démarrage lance une autre copie de Keyboard Bro : {path}. Éteins puis rallume l’interrupteur pour utiliser celle-ci.', { path: auto.other }); warn = true; }
      else if (auto.enabled && platform && platform.os === 'windows') text = tr('Si tu déplaces le fichier de Keyboard Bro, ouvre-le une fois à sa nouvelle place : le démarrage se met à jour tout seul.');
      else if (auto.enabled && mac) text = tr('macOS peut afficher « Élément d’ouverture ajouté » : c’est normal. Tu le retrouves dans Réglages Système › Général › Ouverture.');
      note.hidden = !text;
      note.textContent = text;
      note.classList.toggle('warn', warn);
    };
    autoBtn.addEventListener('click', async () => {
      if (busy || !auto.supported) return;
      const want = !auto.enabled;
      busy = true; paint();
      try {
        auto = await invoke('set_autostart', { on: want });
        toast(want ? tr('Keyboard Bro démarrera avec {os}.', { os: osWord() }) : tr('Keyboard Bro ne démarrera plus tout seul.'));
      } catch (e) {
        auto = Object.assign({}, auto, { message: String(e) });
      }
      busy = false; paint();
    });
    minBtn.addEventListener('click', () => { cfg.startMinimized = !cfg.startMinimized; changed(); paint(); });
    body.querySelector('.lang-seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-lang]');
      if (b && b.dataset.lang !== KBI18n.lang) switchLanguage(b.dataset.lang);
    });
    paint();
    openModal({ kind: 'gear', title: tr('Réglages'), sub: tr('Les changements sont appliqués tout de suite.'), body, okText: tr('Fermer'), noCancel: true, onOk: () => {} });
  }

  // =====================================================================
  //  Démarrage
  // =====================================================================
  async function startLive() {
    await listen('kb-devices', (e) => setKeyboards(e.payload));
    await listen('kb-key', (e) => onKey(e.payload, e.payload.key || KBKeymap.fromRaw(e.payload)));
    await listen('kb-notice', (e) => { if (e.payload && e.payload.text) toast(e.payload.text, !e.payload.ok); });
    setKeyboards(await invoke('list_keyboards'));
    try { st.status = await invoke('macro_status'); } catch { st.status = null; }
    paintMacros();
    if (st.status && !st.status.blocking && st.status.message) banner(tr('Les touches programmées ne peuvent pas être cachées aux autres programmes : ') + st.status.message + tr(' Les macros partent quand même, mais la touche fait aussi son travail normal.'));
  }

  function startDemo(info) {
    $('mode-pill').textContent = tr('Mode démonstration');
    $('mode-pill').classList.add('demo');
    banner(info && info.os === 'macos'
      ? tr('Sur Mac, Keyboard Bro ne sait pas encore reconnaître chaque clavier séparément (ça arrive bientôt). En attendant, tape dans cette fenêtre : les touches s’allument sur le dessin.')
      : tr('Sur ce système, Keyboard Bro ne sait pas encore reconnaître chaque clavier séparément (ça arrive bientôt). En attendant, tape dans cette fenêtre : les touches s’allument sur le dessin.'));
    setKeyboards([{ id: 'demo', name: tr('Clavier de cet ordinateur'), vendor: '', vid: '', pid: '', interfaces: 1, virtual: false, bus: '' }]);
    const handler = (down) => (e) => {
      if (st.dialog || isTyping(e.target)) return;
      onKey({ device: 'demo', down, code: e.code }, KBKeymap.fromCode(e.code));
    };
    window.addEventListener('keydown', handler(true));
    window.addEventListener('keyup', handler(false));
  }

  /** Changer de langue : on sauvegarde, puis la fenêtre se recharge (tout est redessiné dans la nouvelle langue). */
  async function switchLanguage(lang) {
    cfg.lang = lang;
    clearTimeout(saveTimer);
    await saveNow();
    KBI18n.set(lang);
    try { sessionStorage.setItem('kb.macrosOn', String(st.macrosOn)); } catch { /* rien */ }
    location.reload();
  }

  async function boot() {
    KBI18n.translateDom(document.body);
    document.title = tr(document.title);
    try { const m = sessionStorage.getItem('kb.macrosOn'); if (m) { st.macrosOn = m === 'true'; sessionStorage.removeItem('kb.macrosOn'); } } catch { /* rien */ }
    fit();
    let info = null;
    if (invoke) { try { info = await invoke('platform_info'); } catch { info = null; } }
    platform = info;
    $('settings-btn').innerHTML = svg('gear', 18);
    $('settings-btn').addEventListener('click', openSettings);
    $('footer-left').textContent = 'Keyboard Bro ' + (info ? info.version + ' · ' + info.os + ' ' + info.arch : tr('(aperçu)'));
    st.live = !!(info && info.live);
    await loadConfig();
    // La langue gardée dans la config passe avant celle de l'ordinateur (ex. après un import).
    let reloaded = false;
    try { reloaded = sessionStorage.getItem('kb.langReload') === '1'; sessionStorage.removeItem('kb.langReload'); } catch { reloaded = true; }
    if (cfg.lang && cfg.lang !== KBI18n.lang && !reloaded) {
      KBI18n.set(cfg.lang);
      try { sessionStorage.setItem('kb.langReload', '1'); } catch { /* rien */ }
      location.reload();   // une seule fois : pas de boucle si le stockage ne marche pas
      return;
    }
    if (invoke) invoke('set_language', { lang: KBI18n.lang }).catch(() => {});
    paintSave();
    logEmpty();
    if (st.live) {
      $('mode-pill').hidden = true;
      $('macros-btn').addEventListener('click', toggleMacros);
      try { await startLive(); } catch (err) { banner(tr('Erreur au démarrage : ') + err); }
    } else {
      startDemo(info);
    }
    fit();
  }

  boot();
})();
