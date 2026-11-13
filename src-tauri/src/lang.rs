// =====================================================================
//  Langue des messages du cœur (erreurs des macros, démarrage, config…)
//
//  L'interface dit au cœur quelle langue elle affiche (commande set_language);
//  au lancement, on lit aussi « lang » dans keyboard-bro.json.
//  tr!("français {x}", "english {x}", "español {x}", "български {x}") choisit le bon texte.
// =====================================================================

use std::sync::atomic::{AtomicU8, Ordering};

/// 0 = français, 1 = anglais, 2 = espagnol, 3 = bulgare
static LANG: AtomicU8 = AtomicU8::new(0);

pub const FR: u8 = 0;
pub const EN: u8 = 1;
pub const ES: u8 = 2;
pub const BG: u8 = 3;

pub fn set(code: &str) {
    LANG.store(
        match code {
            "en" => EN,
            "es" => ES,
            "bg" => BG,
            _ => FR,
        },
        Ordering::Relaxed,
    );
}

pub fn current() -> u8 {
    LANG.load(Ordering::Relaxed)
}

/// Le texte dans la langue choisie.
pub fn pick(fr: String, en: String, es: String, bg: String) -> String {
    match current() {
        EN => en,
        ES => es,
        BG => bg,
        _ => fr,
    }
}

/// tr!("Bonjour {nom}", "Hello {nom}", "Hola {nom}", "Здравей {nom}") — comme format!, dans les 4 langues.
#[macro_export]
macro_rules! tr {
    ($fr:literal, $en:literal, $es:literal, $bg:literal $(,)?) => {
        $crate::lang::pick(format!($fr), format!($en), format!($es), format!($bg))
    };
}

#[tauri::command]
pub fn set_language(lang: String) {
    set(&lang);
}
