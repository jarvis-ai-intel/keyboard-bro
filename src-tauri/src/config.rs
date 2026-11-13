// =====================================================================
//  Sauvegarde de la configuration (keyboard-bro.json)
//
//  Où est le fichier ?
//  1. À côté du programme, si le dossier du programme est modifiable
//     (version portable : tout reste dans le même dossier, rien ailleurs).
//  2. Sinon (ex. programme installé dans « Program Files », ou sur Mac),
//     dans le dossier de configuration de l'utilisateur.
//
//  Chaque sauvegarde écrit d'abord un fichier temporaire, puis le renomme :
//  une coupure de courant ne peut pas laisser un fichier à moitié écrit.
// =====================================================================

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const FILE: &str = "keyboard-bro.json";
const MAX_SIZE: u64 = 5_000_000;
static PATH: OnceLock<PathBuf> = OnceLock::new();

fn writable(dir: &Path) -> bool {
    let probe = dir.join(".keyboard-bro-test");
    match fs::write(&probe, b"ok") {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

fn config_path(app: &AppHandle) -> PathBuf {
    PATH.get_or_init(|| {
        // Sur Mac, le programme est dans un « paquet » .app : on n'écrit jamais dedans.
        if !cfg!(target_os = "macos") {
            if let Some(dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)) {
                let candidate = dir.join(FILE);
                if candidate.exists() || writable(&dir) {
                    return candidate;
                }
            }
        }
        let dir = app.path().app_config_dir().unwrap_or_else(|_| std::env::temp_dir());
        let _ = fs::create_dir_all(&dir);
        dir.join(FILE)
    })
    .clone()
}

fn check_json(text: &str) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(text)
        .map(|_| ())
        .map_err(|e| tr!("le fichier n'est pas du JSON valide ({e})", "the file is not valid JSON ({e})", "el archivo no es un JSON válido ({e})"))
}

fn write_safely(path: &Path, text: &str) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct Loaded {
    path: String,
    json: Option<String>,
    /// Si le fichier était abîmé : où on l'a mis de côté.
    recovered: Option<String>,
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> Loaded {
    let path = config_path(&app);
    let shown = path.display().to_string();
    let too_big = fs::metadata(&path).map(|m| m.len() > MAX_SIZE).unwrap_or(false);
    let text = if too_big { None } else { fs::read_to_string(&path).ok().filter(|t| !t.trim().is_empty()) };
    match text {
        Some(t) if check_json(&t).is_ok() => Loaded { path: shown, json: Some(t), recovered: None },
        Some(_) => {
            // Fichier abîmé : on le garde de côté (jamais effacé) et on repart à neuf.
            let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let aside = path.with_file_name(format!("keyboard-bro.abime-{stamp}.json"));
            let _ = fs::rename(&path, &aside);
            Loaded { path: shown, json: None, recovered: Some(aside.display().to_string()) }
        }
        None => Loaded { path: shown, json: None, recovered: None },
    }
}

/// Langue choisie dans les Réglages (« fr », « en », « es »), si elle est gardée.
pub fn saved_lang(app: &AppHandle) -> Option<String> {
    fs::read_to_string(config_path(app))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("lang").and_then(|l| l.as_str()).map(str::to_string))
}

/// Réglage « Ouvrir la fenêtre réduite » quand Keyboard Bro part avec l'ordinateur.
/// Oui par défaut (si le fichier n'existe pas ou ne le dit pas).
pub fn start_minimized(app: &AppHandle) -> bool {
    fs::read_to_string(config_path(app))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("startMinimized").and_then(|b| b.as_bool()))
        .unwrap_or(true)
}

#[tauri::command]
pub fn save_config(app: AppHandle, json: String) -> Result<String, String> {
    check_json(&json)?;
    let path = config_path(&app);
    write_safely(&path, &json)?;
    Ok(path.display().to_string())
}

/// Copie de sécurité avant d'importer une autre configuration.
#[tauri::command]
pub fn backup_config(app: AppHandle) -> Result<Option<String>, String> {
    let path = config_path(&app);
    if !path.exists() {
        return Ok(None);
    }
    let copy = path.with_file_name("keyboard-bro.avant-import.json");
    fs::copy(&path, &copy).map_err(|e| e.to_string())?;
    Ok(Some(copy.display().to_string()))
}

/// « Exporter une copie » : l'utilisateur a choisi le fichier dans la fenêtre « Enregistrer sous ».
#[tauri::command]
pub fn export_config(path: String, json: String) -> Result<(), String> {
    check_json(&json)?;
    fs::write(path, json).map_err(|e| e.to_string())
}

/// « Importer » : on lit le fichier choisi; l'interface vérifie ensuite que c'est bien une config Keyboard Bro.
#[tauri::command]
pub fn import_config(path: String) -> Result<String, String> {
    let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > MAX_SIZE {
        return Err(tr!("le fichier est trop gros pour être une configuration", "the file is too big to be a configuration", "el archivo es demasiado grande para ser una configuración"));
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    check_json(&text)?;
    Ok(text)
}
