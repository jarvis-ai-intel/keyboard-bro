// =====================================================================
//  Keyboard Bro — le cœur du programme
//
//  Étape 1 (version 0.1) : LECTURE SEULEMENT.
//  - On reconnaît chaque clavier branché (nom, fabricant, VID/PID).
//  - On montre en direct les touches appuyées et de quel clavier elles viennent.
//  - Rien n'est bloqué, rien n'est enregistré sur le disque, rien n'est envoyé sur Internet.
//
//  L'interface (dossier « ui ») parle au cœur par deux moyens :
//  - des commandes : list_keyboards, platform_info;
//  - des événements : « kb-key » (une touche) et « kb-devices » (la liste des claviers a changé).
// =====================================================================

mod input;

use tauri::Emitter;

/// Liste des claviers branchés en ce moment.
#[tauri::command]
fn list_keyboards() -> Vec<input::Keyboard> {
    input::list()
}

/// Informations sur l'ordinateur, pour l'écran « À propos » et le mode démonstration.
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

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
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
        .invoke_handler(tauri::generate_handler![list_keyboards, platform_info])
        .run(tauri::generate_context!())
        .expect("Keyboard Bro n'a pas pu démarrer");
}
