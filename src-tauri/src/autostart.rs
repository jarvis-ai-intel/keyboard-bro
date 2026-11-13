// =====================================================================
//  Démarrer Keyboard Bro avec l'ordinateur
//
//  Windows : une valeur « Keyboard Bro » dans le registre de l'UTILISATEUR
//            (HKCU\Software\Microsoft\Windows\CurrentVersion\Run).
//            Pas besoin d'être administrateur, rien pour les autres comptes.
//            Windows garde aussi un interrupteur dans le Gestionnaire des tâches
//            (onglet « Démarrage ») : s'il est désactivé là, on le dit.
//  Mac     : un petit fichier ~/Library/LaunchAgents/com.jarvis.keyboardbro.plist
//            (macOS le lit à chaque ouverture de session).
//  Linux   : ~/.config/autostart/keyboard-bro.desktop
//
//  Le programme est lancé avec « --au-demarrage » : il sait alors qu'il part
//  avec l'ordinateur et peut ouvrir sa fenêtre réduite (réglage dans keyboard-bro.json).
//
//  Le réglage n'est PAS gardé dans keyboard-bro.json : c'est le système qui sait
//  si c'est allumé (l'utilisateur peut aussi le changer dans le Gestionnaire des tâches
//  ou dans les Réglages du Mac).
// =====================================================================

use serde::Serialize;
use std::path::{Path, PathBuf};

/// Argument ajouté quand le système lance Keyboard Bro.
pub const ARG: &str = "--au-demarrage";

/// Keyboard Bro a-t-il été lancé par le système (ouverture de session) ?
pub fn started_at_login() -> bool {
    std::env::args().any(|a| a == ARG)
}

#[derive(Serialize)]
pub struct State {
    /// false = pas possible sur ce système (le message dit pourquoi).
    supported: bool,
    /// Le système va lancer Keyboard Bro à l'ouverture de session.
    enabled: bool,
    /// Windows : l'entrée existe, mais quelqu'un l'a désactivée dans le Gestionnaire des tâches.
    blocked: bool,
    /// L'entrée lance une AUTRE copie de Keyboard Bro (ex. une version portable ailleurs).
    other: Option<String>,
    message: Option<String>,
}

fn this_exe() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| tr!("chemin du programme introuvable ({e})", "program path not found ({e})", "no se encuentra la ruta del programa ({e})"))?;
    // Windows : current_exe() est déjà complet (canonicalize donnerait « \\?\C:\… »).
    // Mac / Linux : on suit les liens symboliques pour avoir le vrai chemin.
    if cfg!(windows) {
        Ok(exe)
    } else {
        Ok(exe.canonicalize().unwrap_or(exe))
    }
}

fn same_path(a: &Path, b: &Path) -> bool {
    if cfg!(windows) || cfg!(target_os = "macos") {
        a.display().to_string().to_lowercase() == b.display().to_string().to_lowercase()
    } else {
        a == b
    }
}

/// Pourquoi on refuse d'allumer (ex. Mac : programme lancé depuis Téléchargements sans être déplacé).
fn refuse_reason(exe: &Path) -> Option<String> {
    let s = exe.display().to_string();
    if cfg!(target_os = "macos") {
        if s.contains("/AppTranslocation/") {
            return Some(tr!("macOS fait tourner Keyboard Bro depuis un dossier temporaire. Glisse d'abord Keyboard Bro dans le dossier Applications, rouvre-le, puis allume l'interrupteur.", "macOS is running Keyboard Bro from a temporary folder. First drag Keyboard Bro into the Applications folder, reopen it, then turn the switch on.", "macOS está ejecutando Keyboard Bro desde una carpeta temporal. Primero arrastra Keyboard Bro a la carpeta Aplicaciones, vuelve a abrirlo y luego activa el interruptor."));
        }
        if s.starts_with("/Volumes/") {
            return Some(tr!("Keyboard Bro est ouvert directement depuis l'image disque. Glisse-le d'abord dans le dossier Applications, rouvre-le, puis allume l'interrupteur.", "Keyboard Bro is open straight from the disk image. First drag it into the Applications folder, reopen it, then turn the switch on.", "Keyboard Bro está abierto directamente desde la imagen de disco. Primero arrástralo a la carpeta Aplicaciones, vuelve a abrirlo y luego activa el interruptor."));
        }
    }
    None
}

fn state() -> State {
    let exe = match this_exe() {
        Ok(p) => p,
        Err(e) => return State { supported: false, enabled: false, blocked: false, other: None, message: Some(e) },
    };
    match sys::read() {
        Err(e) => State { supported: false, enabled: false, blocked: false, other: None, message: Some(e) },
        Ok(None) => State { supported: true, enabled: false, blocked: false, other: None, message: refuse_reason(&exe) },
        Ok(Some(entry)) => {
            let other = entry
                .exe
                .as_ref()
                .filter(|p| !same_path(p, &exe))
                .map(|p| p.display().to_string());
            State { supported: true, enabled: !entry.blocked, blocked: entry.blocked, other, message: None }
        }
    }
}

/// Au démarrage : si l'entrée pointe vers un fichier qui n'existe plus
/// (ex. le .exe portable a été déplacé), on la refait avec le bon chemin.
pub fn refresh() {
    let Ok(exe) = this_exe() else { return };
    if let Ok(Some(entry)) = sys::read() {
        if let Some(old) = entry.exe {
            if !old.exists() && !same_path(&old, &exe) && refuse_reason(&exe).is_none() {
                let _ = sys::write(&exe);
            }
        }
    }
}

#[tauri::command]
pub fn autostart_state() -> State {
    state()
}

#[tauri::command]
pub fn set_autostart(on: bool) -> Result<State, String> {
    if on {
        let exe = this_exe()?;
        if let Some(why) = refuse_reason(&exe) {
            return Err(why);
        }
        sys::write(&exe)?;
    } else {
        sys::remove()?;
    }
    Ok(state())
}

/// Ce que le système a d'enregistré.
#[allow(dead_code)]
struct Entry {
    exe: Option<PathBuf>,
    blocked: bool,
}

// ---------------------------------------------------------------------
//  Windows : registre de l'utilisateur
// ---------------------------------------------------------------------
#[cfg(windows)]
mod sys {
    use super::{Entry, ARG};
    use std::path::{Path, PathBuf};
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
    use windows_sys::Win32::System::Registry::{
        RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_BINARY, REG_SZ, RRF_RT_REG_BINARY,
        RRF_RT_REG_SZ,
    };

    const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    const NAME: &str = "Keyboard Bro";

    fn w(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Lit une valeur (texte ou octets) dans HKCU. None = elle n'existe pas.
    fn get(key: &str, name: &str, flags: u32) -> Result<Option<Vec<u8>>, String> {
        let (k, n) = (w(key), w(name));
        let mut size: u32 = 0;
        let err = unsafe { RegGetValueW(HKEY_CURRENT_USER, k.as_ptr(), n.as_ptr(), flags, null_mut(), null_mut(), &mut size) };
        if err == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if err != ERROR_SUCCESS {
            return Err(tr!("lecture du registre impossible (erreur {err})", "couldn’t read the registry (error {err})", "no se pudo leer el registro (error {err})"));
        }
        let mut buf = vec![0u8; size as usize + 2];
        let mut size = buf.len() as u32;
        let err = unsafe {
            RegGetValueW(HKEY_CURRENT_USER, k.as_ptr(), n.as_ptr(), flags, null_mut(), buf.as_mut_ptr().cast(), &mut size)
        };
        if err == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if err != ERROR_SUCCESS {
            return Err(tr!("lecture du registre impossible (erreur {err})", "couldn’t read the registry (error {err})", "no se pudo leer el registro (error {err})"));
        }
        buf.truncate(size as usize);
        Ok(Some(buf))
    }

    fn set(key: &str, name: &str, kind: u32, data: &[u8]) -> Result<(), String> {
        let (k, n) = (w(key), w(name));
        let err = unsafe { RegSetKeyValueW(HKEY_CURRENT_USER, k.as_ptr(), n.as_ptr(), kind, data.as_ptr().cast(), data.len() as u32) };
        if err == ERROR_SUCCESS {
            Ok(())
        } else {
            Err(tr!("écriture dans le registre impossible (erreur {err}) — une règle de l'ordinateur (ex. au travail) bloque peut-être les programmes au démarrage", "couldn’t write to the registry (error {err}) — a computer policy (e.g. at work) may be blocking startup programs", "no se pudo escribir en el registro (error {err}) — quizá una regla de la computadora (p. ej. en el trabajo) bloquea los programas de inicio"))
        }
    }

    fn delete(key: &str, name: &str) -> Result<(), String> {
        let (k, n) = (w(key), w(name));
        let err = unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, k.as_ptr(), n.as_ptr()) };
        if err == ERROR_SUCCESS || err == ERROR_FILE_NOT_FOUND {
            Ok(())
        } else {
            Err(tr!("suppression dans le registre impossible (erreur {err})", "couldn’t delete from the registry (error {err})", "no se pudo borrar del registro (error {err})"))
        }
    }

    /// « "C:\…\KeyboardBro.exe" --au-demarrage » → C:\…\KeyboardBro.exe
    fn exe_of(command: &str) -> Option<PathBuf> {
        let c = command.trim();
        let path = if let Some(rest) = c.strip_prefix('"') {
            rest.split('"').next()?.to_string()
        } else {
            c.split(" --").next()?.trim().to_string()
        };
        (!path.is_empty()).then(|| PathBuf::from(path))
    }

    pub fn read() -> Result<Option<Entry>, String> {
        let Some(raw) = get(RUN, NAME, RRF_RT_REG_SZ)? else { return Ok(None) };
        let wide: Vec<u16> = raw.chunks_exact(2).map(|b| u16::from_le_bytes([b[0], b[1]])).take_while(|&c| c != 0).collect();
        let command = String::from_utf16_lossy(&wide);
        // Gestionnaire des tâches › Démarrage : 1er octet pair = activé, impair = désactivé.
        let blocked = matches!(get(APPROVED, NAME, RRF_RT_REG_BINARY), Ok(Some(b)) if b.first().is_some_and(|x| x & 1 == 1));
        Ok(Some(Entry { exe: exe_of(&command), blocked }))
    }

    pub fn write(exe: &Path) -> Result<(), String> {
        // Guillemets : le chemin peut contenir des espaces (ex. « Mes documents »).
        let command = format!("\"{}\" {}", exe.display(), ARG);
        let data: Vec<u8> = w(&command).iter().flat_map(|c| c.to_le_bytes()).collect();
        set(RUN, NAME, REG_SZ, &data)?;
        // Si l'utilisateur l'avait désactivé dans le Gestionnaire des tâches, on le réactive
        // (il vient de cocher la case : c'est ce qu'il veut).
        if matches!(get(APPROVED, NAME, RRF_RT_REG_BINARY), Ok(Some(_))) {
            let _ = set(APPROVED, NAME, REG_BINARY, &[2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        }
        Ok(())
    }

    pub fn remove() -> Result<(), String> {
        delete(RUN, NAME)?;
        let _ = delete(APPROVED, NAME);
        Ok(())
    }
}

// ---------------------------------------------------------------------
//  Mac : LaunchAgent  ·  Linux : fichier .desktop
// ---------------------------------------------------------------------
#[cfg(not(windows))]
mod sys {
    use super::{Entry, ARG};
    use std::fs;
    use std::path::{Path, PathBuf};

    fn home() -> Result<PathBuf, String> {
        std::env::var_os("HOME").map(PathBuf::from).ok_or_else(|| tr!("dossier de l'utilisateur introuvable", "user folder not found", "no se encuentra la carpeta del usuario"))
    }

    #[cfg(target_os = "macos")]
    fn file() -> Result<PathBuf, String> {
        Ok(home()?.join("Library/LaunchAgents/com.jarvis.keyboardbro.plist"))
    }

    #[cfg(not(target_os = "macos"))]
    fn file() -> Result<PathBuf, String> {
        let base = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).map_or_else(|| home().map(|h| h.join(".config")), Ok)?;
        Ok(base.join("autostart/keyboard-bro.desktop"))
    }

    #[cfg(target_os = "macos")]
    fn xml(s: &str) -> String {
        s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
    }
    fn unxml(s: &str) -> String {
        s.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    }

    #[cfg(target_os = "macos")]
    fn content(exe: &Path) -> String {
        format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
<plist version=\"1.0\">\n<dict>\n\
  <key>Label</key>\n  <string>com.jarvis.keyboardbro</string>\n\
  <key>ProgramArguments</key>\n  <array>\n    <string>{}</string>\n    <string>{}</string>\n  </array>\n\
  <key>RunAtLoad</key>\n  <true/>\n\
  <key>ProcessType</key>\n  <string>Interactive</string>\n\
</dict>\n</plist>\n",
            xml(&exe.display().to_string()),
            ARG
        )
    }

    #[cfg(not(target_os = "macos"))]
    fn content(exe: &Path) -> String {
        let quoted = exe.display().to_string().replace('\\', "\\\\").replace('"', "\\\"");
        format!(
            "[Desktop Entry]\nType=Application\nName=Keyboard Bro\nExec=\"{quoted}\" {ARG}\nX-GNOME-Autostart-enabled=true\n"
        )
    }

    fn exe_of(text: &str) -> Option<PathBuf> {
        if cfg!(target_os = "macos") {
            let after = text.split("<key>ProgramArguments</key>").nth(1)?;
            let inner = after.split("<string>").nth(1)?.split("</string>").next()?;
            Some(PathBuf::from(unxml(inner.trim())))
        } else {
            let line = text.lines().find(|l| l.starts_with("Exec="))?;
            let cmd = line.trim_start_matches("Exec=");
            let Some(rest) = cmd.strip_prefix('"') else {
                return Some(PathBuf::from(cmd.split(' ').next()?));
            };
            // Entre guillemets : \" = un guillemet, \\ = une barre oblique inversée.
            let mut path = String::new();
            let mut chars = rest.chars();
            while let Some(c) = chars.next() {
                match c {
                    '\\' => path.push(chars.next()?),
                    '"' => break,
                    _ => path.push(c),
                }
            }
            Some(PathBuf::from(path))
        }
    }

    pub fn read() -> Result<Option<Entry>, String> {
        let f = file()?;
        match fs::read_to_string(&f) {
            Ok(text) => {
                let blocked = text.lines().any(|l| l.trim() == "Hidden=true" || l.trim() == "X-GNOME-Autostart-enabled=false");
                Ok(Some(Entry { exe: exe_of(&text), blocked }))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => {
                let f = f.display();
                Err(tr!("lecture de {f} impossible ({e})", "couldn’t read {f} ({e})", "no se pudo leer {f} ({e})"))
            }
        }
    }

    pub fn write(exe: &Path) -> Result<(), String> {
        let f = file()?;
        if let Some(dir) = f.parent() {
            fs::create_dir_all(dir).map_err(|e| {
                let d = dir.display();
                tr!("création de {d} impossible ({e})", "couldn’t create {d} ({e})", "no se pudo crear {d} ({e})")
            })?;
        }
        let tmp = f.with_extension("tmp");
        let failed = |e: std::io::Error| {
            let f = f.display();
            tr!("écriture de {f} impossible ({e})", "couldn’t write {f} ({e})", "no se pudo escribir {f} ({e})")
        };
        fs::write(&tmp, content(exe)).map_err(failed)?;
        fs::rename(&tmp, &f).map_err(failed)
    }

    pub fn remove() -> Result<(), String> {
        let f = file()?;
        match fs::remove_file(&f) {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => {
                let f = f.display();
                Err(tr!("suppression de {f} impossible ({e})", "couldn’t delete {f} ({e})", "no se pudo borrar {f} ({e})"))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aller_retour() {
        let dir = std::env::temp_dir().join(format!("kb-autostart-{}", std::process::id()));
        std::env::set_var("XDG_CONFIG_HOME", &dir);
        std::env::set_var("HOME", &dir);
        assert!(sys::read().unwrap().is_none());
        let exe = PathBuf::from("/tmp/Mes programmes/Keyboard \"Bro\" & co");
        sys::write(&exe).unwrap();
        let e = sys::read().unwrap().unwrap();
        assert_eq!(e.exe.unwrap(), exe);
        assert!(!e.blocked);
        sys::remove().unwrap();
        assert!(sys::read().unwrap().is_none());
        sys::remove().unwrap();
        let _ = std::fs::remove_dir_all(dir);
    }
}
