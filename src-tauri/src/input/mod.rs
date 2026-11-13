// =====================================================================
//  Lecture des claviers — partie commune à tous les systèmes
//
//  Chaque système a sa propre façon de lire les claviers :
//  - Windows : « Raw Input » (fichier windows.rs), sans pilote ni droits d'administrateur.
//  - Mac et Linux : à venir (IOHIDManager sur Mac, evdev sur Linux).
//    En attendant, l'interface passe en mode démonstration.
//
//  Depuis la version 0.4, Windows bloque aussi les touches programmées du clavier
//  à macros (pour que F1 lance la macro au lieu de faire F1), et prévient le
//  cœur du programme quand une macro doit partir (Event::Fire).
// =====================================================================

use serde::{Deserialize, Serialize};

/// Un clavier physique branché à l'ordinateur.
#[derive(Clone, Debug, Serialize)]
pub struct Keyboard {
    /// Identifiant stable, utilisé par l'interface pour reconnaître ce clavier.
    pub id: String,
    /// Nom lisible (ex. « USB Keyboard », « Apple Keyboard »).
    pub name: String,
    /// Fabricant trouvé à partir du VID (ex. « Logitech »), vide si inconnu.
    pub vendor: String,
    /// Identifiants USB en hexadécimal (ex. « 046D » et « C326 »), vides pour un clavier virtuel.
    pub vid: String,
    pub pid: String,
    /// Nombre d'« interfaces clavier » de cet appareil (souvent 1 ou 2).
    pub interfaces: u32,
    /// true si l'appareil n'a pas de VID/PID (clavier virtuel, bureau à distance…).
    #[serde(rename = "virtual")]
    pub is_virtual: bool,
    /// Bluetooth ou USB, quand on peut le savoir.
    pub bus: String,
    /// Modèle reconnu, avec des touches spéciales (ex. « g710 »), vide sinon.
    pub model: String,
    /// true si c'est en fait une souris qui se présente aussi comme un clavier
    /// (pour ses boutons spéciaux). L'interface la met de côté.
    pub mouse: bool,
}

/// Une touche appuyée ou relâchée.
#[derive(Clone, Debug, Serialize)]
pub struct KeyEvent {
    /// Identifiant du clavier d'où vient la touche (voir Keyboard::id).
    pub device: String,
    /// Code de touche « virtuel » de Windows (VK).
    pub vkey: u16,
    /// Code de position de la touche (scan code).
    pub make: u16,
    pub e0: bool,
    pub e1: bool,
    /// true = appuyée, false = relâchée.
    pub down: bool,
    /// Nom de la touche quand elle ne vient pas du clavier « normal »
    /// (touches G1-G6, M1-M3, MR du G710, touches multimédia…).
    pub key: Option<String>,
    /// Description des codes pour le terminal (ex. « G710 · rapport 03 »).
    pub code: Option<String>,
    /// Nom de la macro déclenchée par cette touche (appuyée), s'il y en a une.
    pub fired: Option<String>,
    /// true = la touche a été cachée aux autres programmes (c'est une touche programmée).
    pub blocked: bool,
    /// Pourquoi la macro n'est pas partie (ex. « Keyboard Bro est la fenêtre active »).
    pub skipped: Option<String>,
}

/// Une touche programmée, envoyée par l'interface.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Debug, Deserialize)]
pub struct Binding {
    /// Clavier (voir Keyboard::id).
    pub device: String,
    /// Reconnaissance par code virtuel (Pause, Verr. Num, touches multimédia…), 0 sinon.
    #[serde(default)]
    pub vk: u16,
    /// Reconnaissance par position (scan code), la plupart des touches.
    #[serde(default)]
    pub make: u16,
    #[serde(default)]
    pub e0: bool,
    /// Touche spéciale lue autrement (« G1 », « VolUp »…), vide sinon.
    #[serde(default)]
    pub special: String,
    /// Nom affiché de la macro.
    #[serde(default)]
    pub name: String,
    /// Les actions, dans l'ordre (même format que keyboard-bro.json).
    #[serde(default)]
    pub actions: Vec<serde_json::Value>,
}

/// État des macros, pour l'interface.
#[derive(Clone, Debug, Default, Serialize)]
pub struct MacroStatus {
    /// true = les touches programmées sont bien cachées aux autres programmes.
    pub blocking: bool,
    /// true = les macros sont allumées (pas « désactivées »).
    pub enabled: bool,
    /// Nombre de touches programmées actives.
    pub count: usize,
    /// Explication (surtout en cas de problème).
    pub message: String,
}

#[cfg_attr(not(windows), allow(dead_code))]
pub enum Event {
    Key(KeyEvent),
    Devices(Vec<Keyboard>),
    /// Une macro doit partir : son nom et ses actions.
    Fire(String, Vec<serde_json::Value>),
}

#[cfg(windows)]
mod windows;

#[cfg(windows)]
pub use self::windows::{g710_feature, list, macro_status, set_bindings, start};

#[cfg(windows)]
pub const LIVE: bool = true;

#[cfg(not(windows))]
pub const LIVE: bool = false;

#[cfg(not(windows))]
pub fn start<F: Fn(Event) + Send + Sync + 'static>(_sink: F) {}

#[cfg(not(windows))]
pub fn list() -> Vec<Keyboard> {
    Vec::new()
}

#[cfg(not(windows))]
pub fn set_bindings(_list: Vec<Binding>, _enabled: bool) {}

#[cfg(not(windows))]
pub fn macro_status() -> MacroStatus {
    MacroStatus { message: "Les macros marchent sous Windows seulement pour l'instant.".into(), ..Default::default() }
}

/// La touche `b` correspond-elle à ce que Windows a envoyé ?
#[allow(dead_code)]
pub fn matches(b: &Binding, make: u16, e0: bool, vk: u16) -> bool {
    if b.vk != 0 {
        vk == b.vk
    } else {
        b.make != 0 && make == b.make && e0 == b.e0
    }
}

#[cfg(not(windows))]
pub fn g710_feature(_device: &str, _report: &[u8]) -> Result<u32, String> {
    Err("disponible sous Windows seulement pour l'instant".into())
}

/// Modèles reconnus, qui ont des touches spéciales à lire autrement.
#[allow(dead_code)]
pub fn model_of(vid: &str, pid: &str) -> &'static str {
    match (vid, pid) {
        ("046D", "C24D") => "g710", // Logitech G710 et G710+
        _ => "",
    }
}

/// Nom d'une touche multimédia (page « Consumer » 0x0C du standard HID).
#[allow(dead_code)]
pub fn consumer_name(usage: u16) -> Option<&'static str> {
    Some(match usage {
        0xE9 => "VolUp",
        0xEA => "VolDn",
        0xE2 => "Mute",
        0xCD => "Play",
        0xB5 => "Next",
        0xB6 => "Prev",
        0xB7 => "Stop",
        0x192 => "Calc",
        0x18A => "Mail",
        0x223 => "WebHome",
        _ => return None,
    })
}

/// Touches spéciales du G710 dans son rapport 0x03 (4 octets), d'après le pilote Linux hid-lg-g15 :
/// bits 0-5 = G1-G6, bits 6-8 = M1-M3, bit 9 = MR.
#[allow(dead_code)]
pub const G710_KEYS: [&str; 10] = ["G1", "G2", "G3", "G4", "G5", "G6", "M1", "M2", "M3", "MR"];

#[allow(dead_code)]
pub fn g710_pressed(report: &[u8]) -> Option<u32> {
    if report.len() < 4 || report[0] != 0x03 {
        return None;
    }
    Some((report[1] & 0x3f) as u32 | (((report[2] & 0xf0) as u32) << 2) | (((report[3] & 0x07) as u32) << 10))
}

/// Trouve « VID_046D » et « PID_C326 » dans un chemin d'appareil Windows.
#[allow(dead_code)]
pub fn parse_ids(path: &str) -> (String, String) {
    let up = path.to_ascii_uppercase();
    let grab = |tag: &str| -> String {
        up.find(tag)
            .map(|i| up[i + tag.len()..].chars().take(4).collect::<String>())
            .filter(|s| s.len() == 4 && s.chars().all(|c| c.is_ascii_hexdigit()))
            .unwrap_or_default()
    };
    // Bluetooth : « VID&0205AC_PID&0256 » → on garde les 4 derniers chiffres du VID.
    let mut vid = grab("VID_");
    let mut pid = grab("PID_");
    if vid.is_empty() {
        if let Some(i) = up.find("VID&") {
            let rest: String = up[i + 4..].chars().take_while(|c| c.is_ascii_hexdigit()).collect();
            if rest.len() >= 4 {
                vid = rest[rest.len() - 4..].to_string();
            }
        }
    }
    if pid.is_empty() {
        if let Some(i) = up.find("PID&") {
            let rest: String = up[i + 4..].chars().take_while(|c| c.is_ascii_hexdigit()).collect();
            if rest.len() >= 4 {
                pid = rest[..4].to_string();
            }
        }
    }
    (vid, pid)
}

/// Fabricants de claviers courants, à partir du VID (identifiant USB du fabricant).
#[allow(dead_code)]
pub fn vendor_name(vid: &str) -> &'static str {
    match vid {
        "046D" => "Logitech",
        "05AC" => "Apple",
        "045E" => "Microsoft",
        "413C" => "Dell",
        "03F0" => "HP",
        "17EF" => "Lenovo",
        "1532" => "Razer",
        "1B1C" => "Corsair",
        "046A" => "Cherry",
        "04D9" => "Holtek",
        "258A" => "Sinowealth",
        "3434" => "Keychron",
        "0B05" => "ASUS",
        "1038" => "SteelSeries",
        "0951" => "HyperX",
        "04F2" => "Chicony",
        "1C4F" => "SiGma Micro",
        "320F" => "Glorious",
        "1EA7" => "Sharkoon",
        "24AE" => "Rapoo",
        "1A2C" => "China Resource Semico",
        "0C45" => "Microdia",
        "2516" => "Cooler Master",
        "1E7D" => "Roccat",
        "3151" => "Akko",
        "4E53" => "Souris / clavier générique",
        _ => "",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_usb() {
        let p = r"\\?\HID#VID_046D&PID_C326&MI_00#7&2a1b3c&0&0000#{884b96c3-56ef-11d1-bc8c-00a0c91405dd}";
        assert_eq!(parse_ids(p), ("046D".into(), "C326".into()));
    }

    #[test]
    fn ids_bluetooth() {
        let p = r"\\?\HID#{00001124-0000-1000-8000-00805f9b34fb}_VID&000205ac_PID&0256&Col01#9&1&0&0000#{884b96c3}";
        assert_eq!(parse_ids(p), ("05AC".into(), "0256".into()));
    }

    #[test]
    fn g710_report() {
        // G1 + M2 appuyées
        let bits = g710_pressed(&[0x03, 0b0000_0001, 0b0010_0000, 0]).unwrap();
        let names: Vec<_> = (0..10).filter(|b| bits & (1 << b) != 0).map(|b| G710_KEYS[b]).collect();
        assert_eq!(names, vec!["G1", "M2"]);
        assert_eq!(g710_pressed(&[0x02, 1, 0, 0]), None);
    }

    #[test]
    fn binding_match() {
        let mk = |vk, make, e0| Binding { device: "x".into(), vk, make, e0, special: String::new(), name: String::new(), actions: vec![] };
        // F1 : scan 0x3B
        assert!(matches(&mk(0, 0x3B, false), 0x3B, false, 0x70));
        assert!(!matches(&mk(0, 0x3B, false), 0x3B, true, 0x70));
        // Pause : par code virtuel
        assert!(matches(&mk(0x13, 0, false), 0x45, false, 0x13));
        assert!(!matches(&mk(0x13, 0, false), 0x45, false, 0x90));
        // Rien de programmé
        assert!(!matches(&mk(0, 0, false), 0, false, 0));
    }

    #[test]
    fn ids_virtual() {
        assert_eq!(parse_ids(r"\\?\Root#RDP_KBD#0000#{884b96c3}"), (String::new(), String::new()));
    }
}
