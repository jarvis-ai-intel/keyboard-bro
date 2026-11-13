// =====================================================================
//  Keyboard Bro — traduire ce que Windows envoie en touche du dessin
//
//  Windows donne pour chaque touche :
//  - un « scan code » (position physique de la touche), parfois précédé de E0;
//  - un code « virtuel » (VK).
//  On se fie surtout au scan code, qui ne dépend pas de la langue du clavier.
// =====================================================================
'use strict';
const KBKeymap = (() => {
  const SCAN = {
    0x01: 'Esc', 0x02: '1', 0x03: '2', 0x04: '3', 0x05: '4', 0x06: '5', 0x07: '6', 0x08: '7', 0x09: '8', 0x0A: '9', 0x0B: '0',
    0x0C: '-', 0x0D: '=', 0x0E: 'Bksp', 0x0F: 'Tab',
    0x10: 'Q', 0x11: 'W', 0x12: 'E', 0x13: 'R', 0x14: 'T', 0x15: 'Y', 0x16: 'U', 0x17: 'I', 0x18: 'O', 0x19: 'P',
    0x1A: '[', 0x1B: ']', 0x1C: 'Enter', 0x1D: 'LCtrl',
    0x1E: 'A', 0x1F: 'S', 0x20: 'D', 0x21: 'F', 0x22: 'G', 0x23: 'H', 0x24: 'J', 0x25: 'K', 0x26: 'L',
    0x27: ';', 0x28: "'", 0x29: 'Grave', 0x2A: 'LShift', 0x2B: 'Backslash',
    0x2C: 'Z', 0x2D: 'X', 0x2E: 'C', 0x2F: 'V', 0x30: 'B', 0x31: 'N', 0x32: 'M',
    0x33: ',', 0x34: '.', 0x35: '/', 0x36: 'RShift', 0x37: 'NumMul', 0x38: 'LAlt', 0x39: 'Space', 0x3A: 'Caps',
    0x3B: 'F1', 0x3C: 'F2', 0x3D: 'F3', 0x3E: 'F4', 0x3F: 'F5', 0x40: 'F6', 0x41: 'F7', 0x42: 'F8', 0x43: 'F9', 0x44: 'F10',
    0x45: 'NumLk', 0x46: 'ScrLk',
    0x47: 'Num7', 0x48: 'Num8', 0x49: 'Num9', 0x4A: 'NumSub', 0x4B: 'Num4', 0x4C: 'Num5', 0x4D: 'Num6', 0x4E: 'NumAdd',
    0x4F: 'Num1', 0x50: 'Num2', 0x51: 'Num3', 0x52: 'Num0', 0x53: 'NumDot',
    0x56: 'IntlBackslash', 0x57: 'F11', 0x58: 'F12', 0x59: 'NumEq',
    0x64: 'F13', 0x65: 'F14', 0x66: 'F15', 0x67: 'F16', 0x68: 'F17', 0x69: 'F18', 0x6A: 'F19'
  };
  const SCAN_E0 = {
    0x1C: 'NumEnter', 0x1D: 'RCtrl', 0x35: 'NumDiv', 0x37: 'PrtSc', 0x38: 'RAlt',
    0x47: 'Home', 0x48: 'Up', 0x49: 'PgUp', 0x4B: 'Left', 0x4D: 'Right', 0x4F: 'End', 0x50: 'Down', 0x51: 'PgDn',
    0x52: 'Ins', 0x53: 'Del', 0x5B: 'LWin', 0x5C: 'RWin', 0x5D: 'Menu',
    0x20: 'Mute', 0x2E: 'VolDn', 0x30: 'VolUp', 0x22: 'Play', 0x19: 'Next', 0x10: 'Prev', 0x6C: 'Mail', 0x21: 'Calc', 0x32: 'WebHome'
  };
  // Touches qu'on reconnaît mieux par leur code virtuel.
  const VK = {
    0x13: 'Pause', 0x90: 'NumLk', 0x2C: 'PrtSc',
    0xAD: 'Mute', 0xAE: 'VolDn', 0xAF: 'VolUp', 0xB0: 'Next', 0xB1: 'Prev', 0xB3: 'Play', 0xB4: 'Mail', 0xB7: 'Calc', 0xAC: 'WebHome'
  };
  // Mode démonstration (Mac/Linux) : codes des touches du navigateur.
  const CODE = {
    Escape: 'Esc', Minus: '-', Equal: '=', Backspace: 'Bksp', Tab: 'Tab', BracketLeft: '[', BracketRight: ']',
    Backslash: 'Backslash', CapsLock: 'Caps', Semicolon: ';', Quote: "'", Enter: 'Enter', ShiftLeft: 'LShift', ShiftRight: 'RShift',
    Comma: ',', Period: '.', Slash: '/', ControlLeft: 'LCtrl', MetaLeft: 'LWin', AltLeft: 'LAlt', Space: 'Space', AltRight: 'RAlt',
    MetaRight: 'RWin', ContextMenu: 'Menu', ControlRight: 'RCtrl', Backquote: 'Grave', IntlBackslash: 'IntlBackslash',
    PrintScreen: 'PrtSc', ScrollLock: 'ScrLk', Pause: 'Pause', Insert: 'Ins', Home: 'Home', PageUp: 'PgUp', Delete: 'Del', End: 'End',
    PageDown: 'PgDn', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', NumLock: 'NumLk',
    NumpadDivide: 'NumDiv', NumpadMultiply: 'NumMul', NumpadSubtract: 'NumSub', NumpadAdd: 'NumAdd', NumpadEnter: 'NumEnter',
    NumpadDecimal: 'NumDot', NumpadEqual: 'NumEq', AudioVolumeMute: 'Mute', AudioVolumeDown: 'VolDn', AudioVolumeUp: 'VolUp',
    MediaPlayPause: 'Play', MediaTrackNext: 'Next', MediaTrackPrevious: 'Prev'
  };

  function fromRaw(ev) {
    if (VK[ev.vkey]) return VK[ev.vkey];
    const table = ev.e0 ? SCAN_E0 : SCAN;
    return table[ev.make] || null;
  }

  function fromCode(code) {
    if (CODE[code]) return CODE[code];
    let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
    m = /^Digit([0-9])$/.exec(code); if (m) return m[1];
    m = /^Numpad([0-9])$/.exec(code); if (m) return 'Num' + m[1];
    m = /^F([0-9]{1,2})$/.exec(code); if (m) return 'F' + m[1];
    return null;
  }

  function hex(n, width) {
    return n.toString(16).toUpperCase().padStart(width, '0');
  }

  // Le contraire de fromRaw : ce que Windows enverra pour cette touche du dessin.
  // Les touches du tableau VK sont reconnues par leur code virtuel, les autres par leur position.
  const BACK = {};
  Object.entries(SCAN).forEach(([m, id]) => { BACK[id] = { vk: 0, make: Number(m), e0: false }; });
  Object.entries(SCAN_E0).forEach(([m, id]) => { BACK[id] = { vk: 0, make: Number(m), e0: true }; });
  Object.entries(VK).forEach(([v, id]) => { BACK[id] = { vk: Number(v), make: 0, e0: false }; });
  // Touches qui n'arrivent pas comme des touches ordinaires (lues à part par Keyboard Bro).
  const SPECIAL = new Set(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'VolUp', 'VolDn', 'Mute', 'Play', 'Next', 'Prev', 'Stop', 'Calc', 'Mail', 'WebHome']);

  function toRaw(id) {
    const r = BACK[id] ? Object.assign({}, BACK[id]) : { vk: 0, make: 0, e0: false };
    r.special = SPECIAL.has(id) ? id : '';
    return r.vk || r.make || r.special ? r : null;
  }

  return { fromRaw, fromCode, toRaw, hex };
})();
