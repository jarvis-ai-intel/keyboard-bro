// =====================================================================
//  Exécution des macros
//
//  Quand une touche programmée est appuyée, le module « input » envoie
//  Event::Fire(nom, actions). Les actions partent ici, une macro à la fois,
//  dans leur propre fil d'exécution : l'interface et la lecture des claviers
//  ne sont jamais ralenties.
//
//  Actions (même format que keyboard-bro.json) :
//  - prog  : ouvrir un fichier ou un programme  { path, window: normal|max|min }
//  - url   : ouvrir une adresse                 { url, browser, browserPath, private }
//  - text  : coller ou taper du texte           { text, mode: paste|type }
//  - combo : faire une combinaison de touches   { keys: ["Ctrl", "S"] }
//  - wait  : attendre                           { kind: time|window, ms, window }
// =====================================================================

use serde_json::Value;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, OnceLock};

#[cfg(windows)]
mod windows;

type Notify = Box<dyn Fn(bool, String) + Send + Sync>;
static NOTIFY: OnceLock<Notify> = OnceLock::new();
static QUEUE: OnceLock<Mutex<Sender<(String, Vec<Value>)>>> = OnceLock::new();

/// `notify(ok, texte)` : message pour l'interface (erreur d'une macro, par exemple).
pub fn set_notify<F: Fn(bool, String) + Send + Sync + 'static>(f: F) {
    let _ = NOTIFY.set(Box::new(f));
}

fn notify(ok: bool, text: String) {
    if let Some(f) = NOTIFY.get() {
        f(ok, text);
    }
}

/// Met une macro dans la file. Elles partent une à la fois, dans l'ordre.
pub fn run(name: String, actions: Vec<Value>) {
    let q = QUEUE.get_or_init(|| {
        let (tx, rx) = channel::<(String, Vec<Value>)>();
        std::thread::Builder::new()
            .name("keyboard-bro-macros".into())
            .spawn(move || {
                #[cfg(windows)]
                windows::prepare_thread();
                for (name, actions) in rx {
                    run_now(&name, &actions);
                }
            })
            .ok();
        Mutex::new(tx)
    });
    if let Ok(tx) = q.lock() {
        let _ = tx.send((name, actions));
    }
}

fn run_now(name: &str, actions: &[Value]) {
    for (i, a) in actions.iter().enumerate() {
        if let Err(e) = run_action(a) {
            notify(false, format!("Macro « {name} », action {} : {e}", i + 1));
            return;
        }
    }
}

#[cfg(windows)]
fn run_action(a: &Value) -> Result<(), String> {
    windows::run_action(a)
}

#[cfg(not(windows))]
fn run_action(_a: &Value) -> Result<(), String> {
    Err("les macros marchent sous Windows seulement pour l'instant".into())
}

// ---------------------------------------------------------------------
//  Petits outils communs (testés plus bas)
// ---------------------------------------------------------------------

#[allow(dead_code)]
pub fn text_of<'a>(a: &'a Value, key: &str) -> &'a str {
    a.get(key).and_then(Value::as_str).unwrap_or("")
}

const MONTHS: [&str; 12] = [
    "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/// Le texte final : {date}, {heure} et {presse-papiers} remplacés.
/// Retourne aussi combien de caractères il faut reculer pour {curseur}.
#[allow(dead_code)]
pub fn expand(text: &str, y: u16, mo: u16, d: u16, h: u16, mi: u16, clipboard: &str) -> (String, usize) {
    let month = MONTHS.get((mo.max(1) - 1) as usize).copied().unwrap_or("");
    let t = text
        .replace("\r\n", "\n")
        .replace("{date}", &format!("{d} {month} {y}"))
        .replace("{heure}", &format!("{h:02} h {mi:02}"))
        .replace("{presse-papiers}", &clipboard.replace("\r\n", "\n"));
    match t.find("{curseur}") {
        Some(pos) => {
            let after = t[pos + "{curseur}".len()..].replace("{curseur}", "");
            let back = after.chars().count();
            (format!("{}{}", &t[..pos], after), back)
        }
        None => (t, 0),
    }
}

/// Une touche d'une combinaison : code virtuel de Windows + « touche étendue ».
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum ComboKey {
    Vk(u16, bool),
    /// Un caractère à trouver selon la langue du clavier (ex. « = », « [ »).
    Char(char),
}

/// Nom affiché dans Keyboard Bro → touche. Accepte les noms de la liste des raccourcis
/// et les noms écrits sur le dessin des claviers (PC et Mac).
#[allow(dead_code)]
pub fn combo_key(name: &str) -> Option<ComboKey> {
    use ComboKey::{Char, Vk};
    let n = name.trim();
    let low = n.to_lowercase();
    let k = match low.as_str() {
        "ctrl" | "control" | "contrôle" => Vk(0x11, false),
        "alt" | "option" => Vk(0x12, false),
        "maj" | "shift" | "⇧" => Vk(0x10, false),
        "win" | "cmd ⌘" | "cmd" | "⌘" => Vk(0x5B, true),
        "échap" | "esc" | "escape" => Vk(0x1B, false),
        "entrée" | "enter" | "return" | "entr" => Vk(0x0D, false),
        "espace" | "space" => Vk(0x20, false),
        "tab" => Vk(0x09, false),
        "retour arr." | "delete" | "bksp" | "backspace" => Vk(0x08, false),
        "suppr" | "del" => Vk(0x2E, true),
        "inser" | "ins" => Vk(0x2D, true),
        "origine" | "orig" | "home" => Vk(0x24, true),
        "fin" | "end" => Vk(0x23, true),
        "page préc." | "pgpr" | "pgup" => Vk(0x21, true),
        "page suiv." | "pgsv" | "pgdn" => Vk(0x22, true),
        "↑" => Vk(0x26, true),
        "↓" => Vk(0x28, true),
        "←" => Vk(0x25, true),
        "→" => Vk(0x27, true),
        "impr. écran" | "impr" | "prtsc" => Vk(0x2C, true),
        "arrêt défil" | "défil" => Vk(0x91, false),
        "pause" => Vk(0x13, false),
        "verr. maj" | "⇪" => Vk(0x14, false),
        "verr" | "verr. num" => Vk(0x90, true),
        "menu" => Vk(0x5D, true),
        "lecture/pause" | "lect" => Vk(0xB3, true),
        "piste suiv." | "suiv" => Vk(0xB0, true),
        "piste préc." | "préc" => Vk(0xB1, true),
        "stop" => Vk(0xB2, true),
        "volume +" | "vol +" => Vk(0xAF, true),
        "volume −" | "volume -" | "vol −" | "vol -" => Vk(0xAE, true),
        "muet" => Vk(0xAD, true),
        "calc" => Vk(0xB7, true),
        "mail" => Vk(0xB4, true),
        "web" => Vk(0xAC, true),
        "+" => Vk(0xBB, false),
        "-" | "−" => Vk(0xBD, false),
        "." => Vk(0xBE, false),
        "," => Vk(0xBC, false),
        "*" => Vk(0x6A, false),
        "`" => Vk(0xC0, false),
        "\\" => Vk(0xDC, false),
        "<" => Vk(0xE2, false),
        _ => {
            if let Some(rest) = low.strip_prefix("pavé ") {
                return match rest {
                    "+" => Some(Vk(0x6B, false)),
                    "-" | "−" => Some(Vk(0x6D, false)),
                    "*" => Some(Vk(0x6A, false)),
                    "/" => Some(Vk(0x6F, true)),
                    "." | "," => Some(Vk(0x6E, false)),
                    "entrée" | "entr" => Some(Vk(0x0D, true)),
                    d if d.len() == 1 && d.as_bytes()[0].is_ascii_digit() => Some(Vk(0x60 + (d.as_bytes()[0] - b'0') as u16, false)),
                    _ => None,
                };
            }
            if let Some(num) = low.strip_prefix('f').and_then(|r| r.parse::<u16>().ok()) {
                if (1..=24).contains(&num) {
                    return Some(Vk(0x70 + num - 1, false));
                }
            }
            let mut chars = n.chars();
            let (Some(c), None) = (chars.next(), chars.next()) else { return None };
            if c.is_ascii_alphabetic() {
                Vk(c.to_ascii_uppercase() as u16, false)
            } else if c.is_ascii_digit() {
                Vk(c as u16, false)
            } else {
                Char(c)
            }
        }
    };
    Some(k)
}

/// Options « navigation privée » de chaque navigateur, d'après le nom de son programme.
#[allow(dead_code)]
pub fn private_flag(browser: &str, path: &str) -> &'static str {
    let b = format!("{} {}", browser, path).to_lowercase();
    if b.contains("firefox") {
        "-private-window"
    } else if b.contains("msedge") || b.contains("edge") {
        "--inprivate"
    } else if b.contains("opera") {
        "--private"
    } else {
        "--incognito" // Chrome, Brave, Vivaldi et les autres navigateurs basés sur Chromium
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn variables() {
        let (t, back) = expand("Bonjour,\r\n{curseur}\nLe {date} à {heure}", 2026, 11, 12, 8, 5, "x");
        assert_eq!(t, "Bonjour,\n\nLe 12 novembre 2026 à 08 h 05");
        assert_eq!(back, "\nLe 12 novembre 2026 à 08 h 05".chars().count());
        assert_eq!(expand("[{presse-papiers}]", 2026, 1, 1, 0, 0, "copié").0, "[copié]");
        assert_eq!(expand("rien", 2026, 1, 1, 0, 0, "").1, 0);
    }

    #[test]
    fn combos() {
        assert_eq!(combo_key("Ctrl"), Some(ComboKey::Vk(0x11, false)));
        assert_eq!(combo_key("Maj"), Some(ComboKey::Vk(0x10, false)));
        assert_eq!(combo_key("s"), Some(ComboKey::Vk(0x53, false)));
        assert_eq!(combo_key("F13"), Some(ComboKey::Vk(0x7C, false)));
        assert_eq!(combo_key("Impr. écran"), Some(ComboKey::Vk(0x2C, true)));
        assert_eq!(combo_key("Pavé 7"), Some(ComboKey::Vk(0x67, false)));
        assert_eq!(combo_key("Volume −"), Some(ComboKey::Vk(0xAE, true)));
        assert_eq!(combo_key("="), Some(ComboKey::Char('=')));
        assert_eq!(combo_key("Fxyz"), None);
        assert_eq!(combo_key(""), None);
    }

    #[test]
    fn private() {
        assert_eq!(private_flag("firefox", ""), "-private-window");
        assert_eq!(private_flag("edge", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"), "--inprivate");
        assert_eq!(private_flag("chrome", ""), "--incognito");
    }
}
