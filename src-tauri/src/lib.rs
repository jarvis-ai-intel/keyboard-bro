// =====================================================================
//  Keyboard Bro — le cœur du programme
//
//  Version 0.2 :
//  - lecture des claviers (nom, fabricant, VID/PID, touches en direct);
//  - configuration des touches (étapes 1-2-3), sauvegardée dans keyboard-bro.json;
//  - les touches ne déclenchent PAS encore leurs actions : rien n'est bloqué.
//
//  L'interface (dossier « ui ») parle au cœur par :
//  - des commandes (list_keyboards, load_config, save_config, list_browsers…);
//  - des événements : « kb-key » (une touche) et « kb-devices » (la liste des claviers a changé).
// =====================================================================

mod browsers;
mod config;
mod input;

use tauri::{Emitter, Manager, PhysicalSize};

/// Taille maximale de la fenêtre, en vrais pixels de l'écran.
/// 1888 × 960 à l'intérieur ≈ 1900 × 1000 avec la barre de titre.
const MAX_W: u32 = 1888;
const MAX_H: u32 = 960;
const MIN_W: u32 = 900;
const MIN_H: u32 = 560;

/// Liste des claviers branchés en ce moment.
#[tauri::command]
fn list_keyboards() -> Vec<input::Keyboard> {
    input::list()
}

/// Informations sur l'ordinateur.
#[tauri::command]
fn platform_info() -> serde_json::Value {
    serde_json::json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "version": env!("CARGO_PKG_VERSION"),
        // true = on lit vraiment les claviers (Windows). false = mode démonstration (Mac/Linux pour l'instant).
        "live": input::LIVE,
    })
}

/// Taille de départ : la plus grande possible sans dépasser MAX_W × MAX_H ni l'écran.
fn size_window(app: &tauri::App) {
    let Some(win) = app.get_webview_window("main") else { return };
    let monitor = win.current_monitor().ok().flatten().or_else(|| win.primary_monitor().ok().flatten());
    if let Some(m) = monitor {
        let screen = m.size();
        let w = MAX_W.min((screen.width as f64 * 0.96) as u32).max(MIN_W.min(screen.width));
        let h = MAX_H.min((screen.height as f64 * 0.90) as u32).max(MIN_H.min(screen.height));
        let _ = win.set_size(PhysicalSize::new(w, h));
    }
    let _ = win.set_min_size(Some(PhysicalSize::new(MIN_W, MIN_H)));
    let _ = win.set_max_size(Some(PhysicalSize::new(MAX_W, MAX_H)));
    let _ = win.center();
    let _ = win.show();
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            size_window(app);
            let handle = app.handle().clone();
            input::start(move |event| match event {
                input::Event::Key(key) => {
                    let _ = handle.emit("kb-key", key);
                }
                input::Event::Devices(list) => {
                    let _ = handle.emit("kb-devices", list);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_keyboards,
            platform_info,
            config::load_config,
            config::save_config,
            config::backup_config,
            config::export_config,
            config::import_config,
            browsers::list_browsers,
        ])
        .run(tauri::generate_context!())
        .expect("Keyboard Bro n'a pas pu démarrer");
}
