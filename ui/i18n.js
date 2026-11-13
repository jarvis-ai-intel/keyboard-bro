// =====================================================================
//  Keyboard Bro — langues de l'interface (français, anglais, espagnol)
//
//  Le texte français écrit dans le code sert de « clé » : tr('Annuler')
//  donne « Cancel » en anglais, « Cancelar » en espagnol, « Отказ » en bulgare.
//  Traductions : translations.js (anglais + espagnol) et un fichier par
//  langue ajoutée ensuite (translations-bg.js…). S'il en manque une,
//  le texte anglais s'affiche, sinon le français (rien ne casse).
//
//  - tr('Banque {b}', { b: 'M2' })   : remplace {b} par la valeur
//  - trn(n, '{n} touche', '{n} touches') : singulier ou pluriel
//    (français : 0 et 1 au singulier; les autres langues : 1 seulement)
//
//  La langue est choisie au chargement de la page (Réglages › Langue).
//  Changer de langue recharge la fenêtre : tout est redessiné d'un coup.
// =====================================================================
'use strict';
const KBI18n = (() => {
  const LANGS = [['fr', 'Français'], ['en', 'English'], ['es', 'Español'], ['bg', 'Български']];
  const D = { en: {}, es: {}, bg: {} };   // langue → { texte français : traduction }
  const MISS = new Set();  // textes sans traduction (pour vérifier)

  const valid = (l) => l === 'fr' || Object.prototype.hasOwnProperty.call(D, l);

  /** Langue gardée, sinon celle de Windows / du Mac (anglais si on ne la connaît pas). */
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
    const out = D[lang][s];
    if (!out && /[A-Za-zÀ-ÿ]{2}/.test(s)) MISS.add(s);
    // Traduction manquante : l'anglais (plus compris que le français), sinon le français
    return fill(out || D.en[s] || s, vars);
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

  const locale = () => ({ fr: 'fr-CA', en: 'en-CA', es: 'es', bg: 'bg-BG' })[lang];
  /** 1.5 → « 1,5 » en français, en espagnol et en bulgare, « 1.5 » en anglais. */
  const num = (x) => (lang === 'en' ? String(x) : String(x).replace('.', ','));

  const known = (s) => !!(D[lang][s] || D.en[s]);

  /** Traduit le HTML fixe de index.html : textes et attributs title, placeholder, aria-label, alt. */
  function translateDom(root) {
    if (lang === 'fr') return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const raw = node.nodeValue, s = raw.trim();
      if (s && known(s)) node.nodeValue = raw.replace(s, tr(s));
    });
    root.querySelectorAll('[title],[placeholder],[aria-label],[alt],optgroup[label]').forEach((el) => {
      ['title', 'placeholder', 'aria-label', 'alt', 'label'].forEach((a) => {
        const v = el.getAttribute(a);
        if (v && known(v)) el.setAttribute(a, tr(v));
      });
    });
  }

  return {
    LANGS, tr, trn, set, locale, num, translateDom,
    /** translations.js : { « français » : [anglais, espagnol] } */
    add(dict) { Object.entries(dict).forEach(([fr, [en, es]]) => { D.en[fr] = en; D.es[fr] = es; }); },
    /** Une langue de plus : { « français » : traduction } */
    addLang(code, dict) { D[code] = Object.assign(D[code] || {}, dict); },
    get lang() { return lang; },
    missing: () => Array.from(MISS),
    has: (s, l) => !!D[l || 'en'][s]
  };
})();
const tr = KBI18n.tr;
const trn = KBI18n.trn;
