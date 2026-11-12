// =====================================================================
//  Navigateurs installés (pour l'action « Ouvrir une URL »)
//
//  On regarde aux endroits où chaque navigateur s'installe normalement.
//  Rien n'est lancé ni modifié : on vérifie seulement si le fichier existe.
// =====================================================================

use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct Browser {
    id: &'static str,
    name: &'static str,
    path: String,
    installed: bool,
}

type Candidate = (&'static str, &'static str, Vec<PathBuf>);

fn env(key: &str) -> Option<PathBuf> {
    std::env::var_os(key).map(PathBuf::from)
}

fn under(base: &Option<PathBuf>, rel: &str) -> Option<PathBuf> {
    base.as_ref().map(|b| b.join(rel))
}

fn windows_candidates() -> Vec<Candidate> {
    let pf = env("ProgramFiles");
    let pf86 = env("ProgramFiles(x86)");
    let local = env("LOCALAPPDATA");
    let list = |items: Vec<Option<PathBuf>>| items.into_iter().flatten().collect::<Vec<_>>();
    vec![
        ("edge", "Microsoft Edge", list(vec![
            under(&pf86, r"Microsoft\Edge\Application\msedge.exe"),
            under(&pf, r"Microsoft\Edge\Application\msedge.exe"),
        ])),
        ("chrome", "Google Chrome", list(vec![
            under(&pf, r"Google\Chrome\Application\chrome.exe"),
            under(&pf86, r"Google\Chrome\Application\chrome.exe"),
            under(&local, r"Google\Chrome\Application\chrome.exe"),
        ])),
        ("firefox", "Mozilla Firefox", list(vec![
            under(&pf, r"Mozilla Firefox\firefox.exe"),
            under(&pf86, r"Mozilla Firefox\firefox.exe"),
        ])),
        ("brave", "Brave", list(vec![
            under(&pf, r"BraveSoftware\Brave-Browser\Application\brave.exe"),
            under(&local, r"BraveSoftware\Brave-Browser\Application\brave.exe"),
        ])),
        ("opera", "Opera", list(vec![under(&local, r"Programs\Opera\opera.exe")])),
        ("vivaldi", "Vivaldi", list(vec![
            under(&local, r"Vivaldi\Application\vivaldi.exe"),
            under(&pf, r"Vivaldi\Application\vivaldi.exe"),
        ])),
    ]
}

fn mac_candidates() -> Vec<Candidate> {
    let app = |name: &str| vec![PathBuf::from(format!("/Applications/{name}.app"))];
    vec![
        ("safari", "Safari", app("Safari")),
        ("chrome", "Google Chrome", app("Google Chrome")),
        ("firefox", "Mozilla Firefox", app("Firefox")),
        ("edge", "Microsoft Edge", app("Microsoft Edge")),
        ("brave", "Brave", app("Brave Browser")),
        ("opera", "Opera", app("Opera")),
        ("vivaldi", "Vivaldi", app("Vivaldi")),
    ]
}

fn linux_candidates() -> Vec<Candidate> {
    let bin = |name: &str| vec![PathBuf::from(format!("/usr/bin/{name}"))];
    vec![
        ("firefox", "Mozilla Firefox", bin("firefox")),
        ("chrome", "Google Chrome", bin("google-chrome")),
        ("chromium", "Chromium", bin("chromium")),
        ("brave", "Brave", bin("brave-browser")),
    ]
}

#[tauri::command]
pub fn list_browsers() -> Vec<Browser> {
    let candidates = if cfg!(windows) {
        windows_candidates()
    } else if cfg!(target_os = "macos") {
        mac_candidates()
    } else {
        linux_candidates()
    };
    candidates
        .into_iter()
        .map(|(id, name, paths)| {
            let found = paths.iter().find(|p| p.exists());
            Browser {
                id,
                name,
                path: found.or(paths.first()).map(|p| p.display().to_string()).unwrap_or_default(),
                installed: found.is_some(),
            }
        })
        .collect()
}
