// =====================================================================
//  Lecture des claviers — partie commune à tous les systèmes
//
//  Chaque système a sa propre façon de lire les claviers :
//  - Windows : « Raw Input » (fichier windows.rs), sans pilote ni droits d'administrateur.
//  - Mac et Linux : à venir (IOHIDManager sur Mac, evdev sur Linux).
//    En attendant, l'interface passe en mode démonstration.
// =====================================================================

use serde::Serialize;

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
}

#[cfg_attr(not(windows), allow(dead_code))]
pub enum Event {
    Key(KeyEvent),
    Devices(Vec<Keyboard>),
}

#[cfg(windows)]
mod windows;

#[cfg(windows)]
pub use self::windows::{list, start};

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
    fn ids_virtual() {
        assert_eq!(parse_ids(r"\\?\Root#RDP_KBD#0000#{884b96c3}"), (String::new(), String::new()));
    }
}
