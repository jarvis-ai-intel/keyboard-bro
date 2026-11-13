// =====================================================================
//  Keyboard Bro — dispositions de clavier (dessin générique)
//  Unités : 1 = largeur d'une touche ordinaire. x, y = position; w, h = taille.
//  Chaque touche a un identifiant (id) commun à toutes les dispositions.
//  Les noms et les bulles d'aide sont traduits ici (tr, voir i18n.js); l'identifiant ne change jamais.
// =====================================================================
'use strict';
const KBLayouts = {
  layoutDef(id) {
    if (id === 'g710') return this.g710();
    const K = [];
    const add = (sec, kid, label, x, y, w, h, tip, na) => K.push({ sec: sec, id: kid, label: tr(label), x: x, y: y, w: w || 1, h: h || 1, tip: tr(tip || label), na: !!na });
    const run = (y, x0, labels) => labels.forEach((l, n) => add('main', l, l, x0 + n, y));
    const fnRow = (y, withTop) => {
      add('fn', 'Esc', 'Échap', 0, y);
      ['F1', 'F2', 'F3', 'F4'].forEach((l, n) => add('fn', l, l, 2 + n, y));
      ['F5', 'F6', 'F7', 'F8'].forEach((l, n) => add('fn', l, l, 6.5 + n, y));
      ['F9', 'F10', 'F11', 'F12'].forEach((l, n) => add('fn', l, l, 11 + n, y));
      if (withTop) {
        add('nav', 'PrtSc', 'Impr', 15.5, y, 1, 1, 'Impr. écran');
        add('nav', 'ScrLk', 'Défil', 16.5, y, 1, 1, 'Arrêt défil');
        add('nav', 'Pause', 'Pause', 17.5, y);
      }
    };
    const main = (y, o) => {
      const mac = !!o.mac, iso = !!o.iso;
      const r1 = y, r2 = y + 1, r3 = y + 2, r4 = y + 3, r5 = y + 4;
      if (o.escFirst) add('main', 'Esc', 'Échap', 0, r1); else add('main', 'Grave', '`', 0, r1);
      run(r1, 1, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']);
      add('main', 'Bksp', mac ? 'delete' : '⌫', 13, r1, 2, 1, mac ? 'delete (Retour arrière pour Windows)' : 'Retour arrière');
      add('main', 'Tab', mac ? 'tab' : 'Tab', 0, r2, 1.5);
      run(r2, 1.5, ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']']);
      if (iso) add('main', 'Enter', 'Entrée', 13.5, r2, 1.5, 1, 'Entrée');
      else add('main', 'Backslash', '\\', 13.5, r2, 1.5);
      add('main', 'Caps', mac ? '⇪' : 'Verr Maj', 0, r3, 1.75, 1, mac ? 'caps lock (Verr. Maj)' : 'Verr. Maj');
      run(r3, 1.75, ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'"]);
      if (iso) { add('main', 'Backslash', '#', 12.75, r3, 1, 1, '# (touche propre au format ISO)'); add('main', 'Enter', '', 13.75, r3, 1.25, 1, 'Entrée'); }
      else add('main', 'Enter', mac ? 'return' : 'Entrée', 12.75, r3, 2.25, 1, mac ? 'return (Entrée)' : 'Entrée');
      if (iso) { add('main', 'LShift', 'Maj', 0, r4, 1.25, 1, 'Maj gauche'); add('main', 'IntlBackslash', '<', 1.25, r4, 1, 1, '< (touche propre au format ISO)'); }
      else add('main', 'LShift', mac ? '⇧' : 'Maj', 0, r4, 2.25, 1, mac ? 'shift gauche' : 'Maj gauche');
      run(r4, 2.25, ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/']);
      add('main', 'RShift', mac ? '⇧' : 'Maj', 12.25, r4, o.rshift || 2.75, 1, mac ? 'shift droite' : 'Maj droite');
      const b = o.bottom || 'std';
      if (b === 'std') {
        add('main', 'LCtrl', 'Ctrl', 0, r5, 1.25, 1, 'Ctrl gauche'); add('main', 'LWin', 'Win', 1.25, r5, 1.25, 1, 'Windows gauche'); add('main', 'LAlt', 'Alt', 2.5, r5, 1.25, 1, 'Alt gauche');
        add('main', 'Space', 'Espace', 3.75, r5, 6.25);
        add('main', 'RAlt', 'Alt Gr', 10, r5, 1.25, 1, 'Alt droite'); add('main', 'RWin', 'Win', 11.25, r5, 1.25, 1, 'Windows droite'); add('main', 'Menu', 'Menu', 12.5, r5, 1.25); add('main', 'RCtrl', 'Ctrl', 13.75, r5, 1.25, 1, 'Ctrl droite');
      } else if (b === 'c60') {
        add('main', 'LCtrl', 'Ctrl', 0, r5, 1.25, 1, 'Ctrl gauche'); add('main', 'LWin', 'Win', 1.25, r5, 1.25, 1, 'Windows gauche'); add('main', 'LAlt', 'Alt', 2.5, r5, 1.25, 1, 'Alt gauche');
        add('main', 'Space', 'Espace', 3.75, r5, 6.25);
        add('main', 'RAlt', 'Alt Gr', 10, r5, 1.25, 1, 'Alt droite'); add('main', 'RWin', 'Win', 11.25, r5, 1.25, 1, 'Windows droite');
        add('main', 'Fn', 'Fn', 12.5, r5, 1.25, 1, 'Fn — gérée par le clavier lui-même, invisible pour Windows', true);
        add('main', 'RCtrl', 'Ctrl', 13.75, r5, 1.25, 1, 'Ctrl droite');
      } else if (b === 'compact') {
        add('main', 'LCtrl', 'Ctrl', 0, r5, 1.25, 1, 'Ctrl gauche'); add('main', 'LWin', 'Win', 1.25, r5, 1.25, 1, 'Windows gauche'); add('main', 'LAlt', 'Alt', 2.5, r5, 1.25, 1, 'Alt gauche');
        add('main', 'Space', 'Espace', 3.75, r5, 6.25);
        add('main', 'RAlt', 'Alt', 10, r5, 1, 1, 'Alt droite');
        add('main', 'Fn', 'Fn', 11, r5, 1, 1, 'Fn — gérée par le clavier lui-même, invisible pour Windows', true);
        add('main', 'RCtrl', 'Ctrl', 12, r5, 1, 1, 'Ctrl droite');
        add('nav', 'Left', '←', 13, r5, 1, 1, 'Flèche gauche'); add('nav', 'Down', '↓', 14, r5, 1, 1, 'Flèche bas'); add('nav', 'Right', '→', 15, r5, 1, 1, 'Flèche droite');
        add('nav', 'Up', '↑', 14, r4, 1, 1, 'Flèche haut');
      } else if (b === 'macfull') {
        add('main', 'LCtrl', 'control', 0, r5, 1.25, 1, 'control ⌃ (Ctrl pour Windows)');
        add('main', 'LAlt', 'option', 1.25, r5, 1.25, 1, 'option ⌥ (Alt pour Windows)');
        add('main', 'LWin', 'cmd ⌘', 2.5, r5, 1.5, 1, 'command ⌘ (touche Windows pour Windows)');
        add('main', 'Space', '', 4, r5, 6.5, 1, 'Espace');
        add('main', 'RWin', 'cmd ⌘', 10.5, r5, 1.5, 1, 'command ⌘ (touche Windows pour Windows)');
        add('main', 'RAlt', 'option', 12, r5, 1.5, 1, 'option ⌥ (Alt pour Windows)');
        add('main', 'RCtrl', 'control', 13.5, r5, 1.5, 1, 'control ⌃ (Ctrl pour Windows)');
      } else if (b === 'maccompact') {
        add('main', 'Fn', 'fn', 0, r5, 1, 1, 'fn / globe — invisible pour Windows', true);
        add('main', 'LCtrl', 'control', 1, r5, 1, 1, 'control ⌃ (Ctrl pour Windows)');
        add('main', 'LAlt', 'option', 2, r5, 1, 1, 'option ⌥ (Alt pour Windows)');
        add('main', 'LWin', 'cmd ⌘', 3, r5, 1.25, 1, 'command ⌘ (touche Windows pour Windows)');
        add('main', 'Space', '', 4.25, r5, 5.5, 1, 'Espace');
        add('main', 'RWin', 'cmd ⌘', 9.75, r5, 1.25, 1, 'command ⌘ (touche Windows pour Windows)');
        add('main', 'RAlt', 'option', 11, r5, 1, 1, 'option ⌥ (Alt pour Windows)');
        add('nav', 'Left', '←', 12, r5, 1, 1, 'Flèche gauche');
        add('nav', 'Up', '↑', 13, r5, 1, 0.5, 'Flèche haut');
        add('nav', 'Down', '↓', 13, r5 + 0.5, 1, 0.5, 'Flèche bas');
        add('nav', 'Right', '→', 14, r5, 1, 1, 'Flèche droite');
      }
    };
    const navBlock = (y1, mac) => {
      if (mac) { add('nav', 'Fn', 'fn', 15.5, y1, 1, 1, 'fn — invisible pour Windows', true); }
      else add('nav', 'Ins', 'Inser', 15.5, y1);
      add('nav', 'Home', mac ? 'home' : 'Orig', 16.5, y1, 1, 1, 'Origine'); add('nav', 'PgUp', mac ? 'pg ↑' : 'PgPr', 17.5, y1, 1, 1, 'Page précédente');
      add('nav', 'Del', mac ? '⌦' : 'Suppr', 15.5, y1 + 1, 1, 1, 'Supprimer'); add('nav', 'End', mac ? 'end' : 'Fin', 16.5, y1 + 1, 1, 1, 'Fin'); add('nav', 'PgDn', mac ? 'pg ↓' : 'PgSv', 17.5, y1 + 1, 1, 1, 'Page suivante');
      add('nav', 'Up', '↑', 16.5, y1 + 3, 1, 1, 'Flèche haut');
      add('nav', 'Left', '←', 15.5, y1 + 4, 1, 1, 'Flèche gauche'); add('nav', 'Down', '↓', 16.5, y1 + 4, 1, 1, 'Flèche bas'); add('nav', 'Right', '→', 17.5, y1 + 4, 1, 1, 'Flèche droite');
    };
    const pad = (x0, y1, mac) => {
      const P = (kid, label, x, y, w, h, tip) => add('pad', kid, label, x0 + x, y1 + y, w, h, tip || tr('Pavé {k}', { k: label }));
      if (mac) {
        P('NumLk', 'clear', 0, 0, 1, 1, 'clear (Verr. num pour Windows)'); P('NumEq', '=', 1, 0); P('NumDiv', '/', 2, 0); P('NumMul', '*', 3, 0);
        P('Num7', '7', 0, 1); P('Num8', '8', 1, 1); P('Num9', '9', 2, 1); P('NumSub', '-', 3, 1);
        P('Num4', '4', 0, 2); P('Num5', '5', 1, 2); P('Num6', '6', 2, 2); P('NumAdd', '+', 3, 2);
      } else {
        P('NumLk', 'Verr', 0, 0, 1, 1, 'Verr. num'); P('NumDiv', '/', 1, 0); P('NumMul', '*', 2, 0); P('NumSub', '-', 3, 0);
        P('Num7', '7', 0, 1); P('Num8', '8', 1, 1); P('Num9', '9', 2, 1); P('NumAdd', '+', 3, 1, 1, 2);
        P('Num4', '4', 0, 2); P('Num5', '5', 1, 2); P('Num6', '6', 2, 2);
      }
      P('Num1', '1', 0, 3); P('Num2', '2', 1, 3); P('Num3', '3', 2, 3); P('NumEnter', 'Entr', 3, 3, 1, 2, 'Pavé Entrée');
      P('Num0', '0', 0, 4, 2, 1); P('NumDot', '.', 2, 4);
    };

    let w = 23, h = 6.4;
    if (id === 'full-ansi' || id === 'full-iso' || id === 'tkl-ansi' || id === 'tkl-iso' || id === 'media') {
      const iso = id.indexOf('iso') !== -1;
      fnRow(0, true);
      main(1.4, { iso: iso });
      navBlock(1.4, false);
      if (id.indexOf('tkl') === -1) pad(19, 1.4, false); else w = 18.5;
      if (id === 'media') {
        K.forEach((k) => { k.y += 1.1; });
        [['Prev', 'Préc', 'Piste précédente'], ['Play', 'Lect', 'Lecture / Pause'], ['Next', 'Suiv', 'Piste suivante'], ['Mute', 'Muet', 'Couper le son'], ['VolDn', 'Vol −', 'Baisser le volume'], ['VolUp', 'Vol +', 'Monter le volume'], ['Calc', 'Calc', 'Calculatrice'], ['Mail', 'Mail', 'Courriel'], ['WebHome', 'Web', 'Page d’accueil du navigateur']]
          .forEach((m, n) => add('media', m[0], m[1], 14 + n, 0, 1, 0.8, m[2]));
        h = 7.5;
      }
    } else if (id === 'c75') {
      add('fn', 'Esc', 'Échap', 0, 0);
      for (let n = 1; n <= 12; n++) add('fn', 'F' + n, 'F' + n, n, 0);
      add('nav', 'PrtSc', 'Impr', 13, 0, 1, 1, 'Impr. écran'); add('nav', 'Pause', 'Pause', 14, 0); add('nav', 'Del', 'Suppr', 15, 0, 1, 1, 'Supprimer');
      main(1.25, { rshift: 1.75, bottom: 'compact' });
      add('nav', 'Home', 'Orig', 15, 1.25, 1, 1, 'Origine'); add('nav', 'PgUp', 'PgPr', 15, 2.25, 1, 1, 'Page précédente'); add('nav', 'PgDn', 'PgSv', 15, 3.25, 1, 1, 'Page suivante'); add('nav', 'End', 'Fin', 15, 4.25, 1, 1, 'Fin');
      w = 16; h = 6.25;
    } else if (id === 'c65') {
      main(0, { escFirst: true, rshift: 1.75, bottom: 'compact' });
      add('nav', 'Grave', '`', 15, 0); add('nav', 'Del', 'Suppr', 15, 1, 1, 1, 'Supprimer'); add('nav', 'PgUp', 'PgPr', 15, 2, 1, 1, 'Page précédente'); add('nav', 'PgDn', 'PgSv', 15, 3, 1, 1, 'Page suivante');
      w = 16; h = 5;
    } else if (id === 'c60') {
      main(0, { escFirst: true, bottom: 'c60' });
      w = 15; h = 5;
    } else if (id === 'pad') {
      pad(0, 0, false);
      w = 4; h = 5;
    } else if (id === 'mac-full') {
      add('fn', 'Esc', 'esc', 0, 0);
      ['F1', 'F2', 'F3', 'F4'].forEach((l, n) => add('fn', l, l, 2 + n, 0));
      ['F5', 'F6', 'F7', 'F8'].forEach((l, n) => add('fn', l, l, 6.5 + n, 0));
      ['F9', 'F10', 'F11', 'F12'].forEach((l, n) => add('fn', l, l, 11 + n, 0));
      const free = (l) => tr('{k} — presque aucun logiciel ne l’utilise : idéale pour une macro', { k: l });
      ['F13', 'F14', 'F15'].forEach((l, n) => add('fn', l, l, 15.5 + n, 0, 1, 1, free(l)));
      ['F16', 'F17', 'F18', 'F19'].forEach((l, n) => add('fn', l, l, 19 + n, 0, 1, 1, free(l)));
      main(1.4, { mac: true, bottom: 'macfull' });
      navBlock(1.4, true);
      pad(19, 1.4, true);
    } else if (id === 'mac-compact') {
      add('fn', 'Esc', 'esc', 0, 0, 1.5, 0.6);
      for (let n = 1; n <= 12; n++) add('fn', 'F' + n, 'F' + n, 0.5 + n, 0, 1, 0.6);
      add('fn', 'Lock', '', 13.5, 0, 1.5, 0.6, 'Touch ID / verrouillage — invisible pour Windows', true);
      main(0.8, { mac: true, rshift: 2.75, bottom: 'maccompact' });
      w = 15; h = 5.8;
    }
    return { keys: K, w: w, h: h };
  },
  layoutInfo() {
    return {
      'full-ansi': tr('Clavier complet, format américain (ANSI) : Entrée sur une seule rangée.'),
      'full-iso': tr('Format ISO : Entrée en « L » sur deux rangées et une touche de plus à côté de Maj gauche. Courant au Québec et en Europe.'),
      'media': tr('Clavier complet avec une rangée de touches multimédia (son, lecture, calculatrice…).'),
      'tkl-ansi': tr('Sans pavé numérique, format ANSI.'),
      'tkl-iso': tr('Sans pavé numérique, format ISO.'),
      'c75': tr('Compact 75 % : tout est collé, les flèches et quelques touches sont sur le côté.'),
      'c65': tr('Compact 65 % : pas de rangée F1–F12. Les F s’obtiennent avec Fn, que Windows ne voit pas.'),
      'c60': tr('Compact 60 % : ni rangée F, ni flèches dédiées.'),
      'pad': tr('Pavé numérique séparé : parfait comme petit clavier à macros.'),
      'mac-full': tr('Clavier Apple avec pavé : F13 à F19 ne servent à presque rien dans Windows, ce sont des touches idéales pour des macros.'),
      'mac-compact': tr('Magic Keyboard d’Apple : rangée du haut demi-hauteur et flèches en T inversé.'),
      'g710': tr('Logitech G710 / G710+ : 6 touches G à gauche, banques M1, M2, M3 (chaque banque donne d’autres actions aux touches G), touche MR et touches multimédia.')
    };
  },
  // Logitech G710 / G710+ : clavier complet + colonne G1-G6 à gauche + rangée M / multimédia en haut.
  g710() {
    const base = this.layoutDef('full-ansi');
    const dx = 1.45, dy = 0.95;
    const K = base.keys.map((k) => Object.assign({}, k, { x: k.x + dx, y: k.y + dy }));
    const add = (sec, id, label, x, y, w, h, tip, na) => K.push({ sec: sec, id: id, label: tr(label), x: x, y: y, w: w || 1, h: h || 1, tip: tr(tip || label), na: !!na });
    for (let n = 1; n <= 6; n++) {
      add('g', 'G' + n, 'G' + n, 0, dy + (n - 1) * 0.9, 1.15, 0.82, tr('G{n} — touche programmable (ses actions changent avec la banque M1, M2, M3)', { n }));
    }
    const th = 0.72;
    ['M1', 'M2', 'M3'].forEach((m, i) => add('m', m, m, dx + 2 + i, 0, 0.9, th, tr('{m} — banque {n} : clique pour donner d’autres actions aux touches G', { m, n: i + 1 })));
    add('m', 'MR', 'MR', dx + 5.2, 0, 0.9, th, 'MR — touche d’enregistrement (programmable dans Keyboard Bro)');
    add('m', 'GameMode', 'Jeu', dx + 6.5, 0, 1, th, 'Touche Jeu : désactive la touche Windows (gérée par le clavier lui-même)', true);
    add('m', 'Light1', 'Lum 1', dx + 10.6, 0, 1, th, 'Rétroéclairage zone 1 — ZQSD/WASD et flèches (géré par le clavier lui-même)', true);
    add('m', 'Light2', 'Lum 2', dx + 11.6, 0, 1, th, 'Rétroéclairage zone 2 — le reste du clavier (géré par le clavier lui-même)', true);
    [['Stop', 'Stop', 'Arrêt'], ['Prev', 'Préc', 'Piste précédente'], ['Play', 'Lect', 'Lecture / Pause'], ['Next', 'Suiv', 'Piste suivante']]
      .forEach((m, i) => add('media', m[0], m[1], dx + 13.3 + i, 0, 0.9, th, m[2]));
    add('media', 'Mute', 'Muet', dx + 18.1, 0, 1, th, 'Sourdine');
    add('media', 'VolDn', 'Vol −', dx + 19.3, 0, 1, th, 'Molette du volume (baisser)');
    add('media', 'VolUp', 'Vol +', dx + 20.3, 0, 1, th, 'Molette du volume (monter)');
    return { keys: K, w: base.w + dx, h: base.h + dy };
  }
};
