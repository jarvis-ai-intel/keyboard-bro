// =====================================================================
//  Keyboard Bro — langues de l'interface (français, anglais, espagnol)
//
//  Le texte français écrit dans le code sert de « clé » : tr('Annuler')
//  donne « Cancel » en anglais et « Cancelar » en espagnol.
//  Les traductions sont dans translations.js. S'il en manque une,
//  le texte français s'affiche (rien ne casse).
//
//  - tr('Banque {b}', { b: 'M2' })   : remplace {b} par la valeur
//  - trn(n, '{n} touche', '{n} touches') : singulier ou pluriel
//    (français : 0 et 1 au singulier; anglais et espagnol : 1 seulement)
//
//  La langue est choisie au chargement de la page (Réglages › Langue).
//  Changer de langue recharge la fenêtre : tout est redessiné d'un coup.
// =====================================================================
'use strict';
const KBI18n = (() => {
  const LANGS = [['fr', 'Français'], ['en', 'English'], ['es', 'Español']];
  const COL = { en: 0, es: 1 };
  const D = {};            // texte français → [anglais, espagnol]
  const MISS = new Set();  // textes sans traduction (pour vérifier)

  const valid = (l) => l === 'fr' || l === 'en' || l === 'es';

  /** Langue gardée, sinon celle de Windows / du Mac (anglais si ce n'est ni fr, ni es). */
  function detect() {
    try { const s = localStorage.getItem('kb.lang'); if (valid(s)) return s; } catch { /* stockage indisponible */ }
    const n = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').slice(0, 2).toLowerCase();
    return valid(n) ? n : 'en';
  }
  let lang = detect();
  document.documentElement.lang = lang;

  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m)) : s);

  function tr(s, vars) {
    if (s == null) return '';
    if (lang === 'fr') return fill(s, vars);
    const e = D[s];
    const out = e && e[COL[lang]];
    if (!out && /[A-Za-zÀ-ÿ]{2}/.test(s)) MISS.add(s);
    return fill(out || s, vars);
  }

  function trn(n, one, many, vars) {
    const single = lang === 'fr' ? Math.abs(n) < 2 : n === 1;
    return tr(single ? one : many, Object.assign({ n }, vars || {}));
  }

  /** Change la langue (gardée dans la fenêtre; la config garde aussi une copie). */
  function set(l) {
    if (!valid(l)) return;
    lang = l;
    try { localStorage.setItem('kb.lang', l); } catch { /* rien */ }
    document.documentElement.lang = l;
  }

  const locale = () => ({ fr: 'fr-CA', en: 'en-CA', es: 'es' })[lang];
  /** 1.5 → « 1,5 » en français et en espagnol, « 1.5 » en anglais. */
  const num = (x) => (lang === 'en' ? String(x) : String(x).replace('.', ','));

  /** Traduit le HTML fixe de index.html : textes et attributs title, placeholder, aria-label, alt. */
  function translateDom(root) {
    if (lang === 'fr') return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const raw = node.nodeValue, s = raw.trim();
      if (s && D[s]) node.nodeValue = raw.replace(s, tr(s));
    });
    root.querySelectorAll('[title],[placeholder],[aria-label],[alt],optgroup[label]').forEach((el) => {
      ['title', 'placeholder', 'aria-label', 'alt', 'label'].forEach((a) => {
        const v = el.getAttribute(a);
        if (v && D[v]) el.setAttribute(a, tr(v));
      });
    });
  }

  return {
    LANGS, tr, trn, set, locale, num, translateDom,
    add(dict) { Object.assign(D, dict); },
    get lang() { return lang; },
    missing: () => Array.from(MISS),
    has: (s) => !!D[s]
  };
})();
const tr = KBI18n.tr;
const trn = KBI18n.trn;
