// =====================================================================
//  Actions des macros sous Windows
//
//  - Ouvrir un programme / un fichier / une URL : ShellExecuteW (comme un double-clic).
//  - Coller du texte : le texte passe par le presse-papiers, puis Ctrl+V;
//    l'ancien contenu du presse-papiers est remis après.
//  - Taper du texte, combinaisons de touches : SendInput (touches simulées).
//  - Attendre une fenêtre : on regarde les titres des fenêtres ouvertes.
// =====================================================================

use super::{combo_key, expand, private_flag, text_of, ComboKey};
use serde_json::Value;
use std::mem::{size_of, zeroed};
use std::ptr::{null, null_mut};
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, SYSTEMTIME};
use windows_sys::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, CountClipboardFormats, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    SetClipboardData,
};
use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows_sys::Win32::System::SystemInformation::GetLocalTime;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    MapVirtualKeyW, SendInput, VkKeyScanW, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY,
    KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, MAPVK_VK_TO_VSC,
};
use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, EnumWindows, GetWindowTextW, IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow,
    ASFW_ANY, SW_RESTORE, SW_SHOWMAXIMIZED, SW_SHOWMINNOACTIVE, SW_SHOWNORMAL,
};

const CF_UNICODETEXT: u32 = 13;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Le fil des macros a besoin de COM pour certains fichiers (raccourcis .lnk, etc.).
pub fn prepare_thread() {
    unsafe {
        CoInitializeEx(null(), (COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) as u32);
    }
}

pub fn run_action(a: &Value) -> Result<(), String> {
    match text_of(a, "type") {
        "prog" => open_prog(a),
        "url" => open_url(a),
        "text" => insert_text(a),
        "combo" => combo(a),
        "wait" => wait(a),
        other => Err(tr!("action inconnue « {other} »", "unknown action “{other}”", "acción desconocida «{other}»")),
    }
}

// ---------------------------------------------------------------------
//  Ouvrir
// ---------------------------------------------------------------------

/// « %USERPROFILE%\Bureau » → « C:\Users\Jarvis\Bureau ».
fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        let Some(len) = rest[start + 1..].find('%') else { break };
        let name = &rest[start + 1..start + 1 + len];
        out.push_str(&rest[..start]);
        match std::env::var(name) {
            Ok(v) if !name.is_empty() => out.push_str(&v),
            _ => out.push_str(&rest[start..start + len + 2]),
        }
        rest = &rest[start + len + 2..];
    }
    out.push_str(rest);
    out
}

/// Windows ne laisse pas un programme en arrière-plan passer devant.
/// Une touche « vide » simulée (VK 0xE8, utilisée par aucun clavier) nous donne ce droit
/// pour un instant, et on le passe au programme qu'on ouvre.
fn allow_foreground() {
    unsafe {
        let inputs = [key_input(0xE8, 0, 0), key_input(0xE8, 0, KEYEVENTF_KEYUP)];
        SendInput(inputs.len() as u32, inputs.as_ptr(), size_of::<INPUT>() as i32);
        AllowSetForegroundWindow(ASFW_ANY);
    }
}

fn shell_open(file: &str, params: &str, show: i32) -> Result<(), String> {
    allow_foreground();
    let file_w = wide(file);
    let params_w = wide(params);
    let path = std::path::Path::new(file);
    let dir = if path.is_absolute() { path.parent().map(|p| p.to_string_lossy().to_string()) } else { None };
    let dir_w = dir.as_deref().map(wide);
    let r = unsafe {
        ShellExecuteW(
            null_mut(),
            wide("open").as_ptr(),
            file_w.as_ptr(),
            if params.is_empty() { null() } else { params_w.as_ptr() },
            dir_w.as_ref().map(|d| d.as_ptr()).unwrap_or(null()),
            show,
        )
    } as isize;
    if r > 32 {
        return Ok(());
    }
    Err(match r {
        2 => tr!("« {file} » est introuvable", "“{file}” can’t be found", "no se encuentra «{file}»"),
        3 => tr!("le dossier de « {file} » est introuvable", "the folder of “{file}” can’t be found", "no se encuentra la carpeta de «{file}»"),
        5 => tr!("Windows refuse d'ouvrir « {file} » (accès refusé)", "Windows refuses to open “{file}” (access denied)", "Windows se niega a abrir «{file}» (acceso denegado)"),
        8 => tr!("pas assez de mémoire", "not enough memory", "no hay suficiente memoria"),
        26 | 32 => tr!("« {file} » est déjà utilisé par un autre programme", "“{file}” is already in use by another program", "«{file}» ya está en uso por otro programa"),
        27 | 31 => tr!("aucun programme n'est choisi pour ouvrir « {file} »", "no program is set to open “{file}”", "no hay ningún programa elegido para abrir «{file}»"),
        _ => tr!("« {file} » n'a pas pu être ouvert (code {r})", "“{file}” couldn’t be opened (code {r})", "no se pudo abrir «{file}» (código {r})"),
    })
}

fn open_prog(a: &Value) -> Result<(), String> {
    let path = expand_env(text_of(a, "path").trim());
    if path.is_empty() {
        return Err(tr!("aucun programme choisi", "no program chosen", "no se eligió ningún programa"));
    }
    let show = match text_of(a, "window") {
        "max" => SW_SHOWMAXIMIZED,
        "min" => SW_SHOWMINNOACTIVE,
        _ => SW_SHOWNORMAL,
    };
    shell_open(&path, "", show)
}

fn open_url(a: &Value) -> Result<(), String> {
    let url = text_of(a, "url").trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(tr!("adresse invalide « {url} »", "invalid address “{url}”", "dirección no válida «{url}»"));
    }
    let browser = text_of(a, "browser");
    let exe = expand_env(text_of(a, "browserPath").trim());
    if browser.is_empty() || browser == "default" || exe.is_empty() {
        return shell_open(url, "", SW_SHOWNORMAL);
    }
    let private = a.get("private").and_then(Value::as_bool).unwrap_or(false);
    let quoted = format!("\"{}\"", url.replace('"', "%22"));
    let params = if private { format!("{} {}", private_flag(browser, &exe), quoted) } else { quoted };
    shell_open(&exe, &params, SW_SHOWNORMAL)
}

// ---------------------------------------------------------------------
//  Touches simulées
// ---------------------------------------------------------------------

fn key_input(vk: u16, scan: u16, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
    }
}

fn vk_input(vk: u16, ext: bool, up: bool) -> INPUT {
    let scan = unsafe { MapVirtualKeyW(vk as u32, MAPVK_VK_TO_VSC) } as u16;
    let mut flags = if ext { KEYEVENTF_EXTENDEDKEY } else { 0 };
    if up {
        flags |= KEYEVENTF_KEYUP;
    }
    key_input(vk, scan, flags)
}

fn send(inputs: &[INPUT]) -> Result<(), String> {
    if inputs.is_empty() {
        return Ok(());
    }
    let sent = unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), size_of::<INPUT>() as i32) };
    if sent as usize != inputs.len() {
        // Windows refuse les touches simulées vers un programme lancé en administrateur.
        return Err(tr!("Windows a refusé les touches simulées (la fenêtre active est peut-être un programme lancé en administrateur)", "Windows refused the simulated keys (the active window may be a program running as administrator)", "Windows rechazó las teclas simuladas (la ventana activa quizá sea un programa ejecutado como administrador)"));
    }
    Ok(())
}

fn tap(vk: u16, ext: bool) -> Result<(), String> {
    send(&[vk_input(vk, ext, false), vk_input(vk, ext, true)])
}

/// Appuie sur les touches dans l'ordre, puis les relâche dans l'ordre inverse.
fn press_together(keys: &[(u16, bool)]) -> Result<(), String> {
    let mut inputs: Vec<INPUT> = keys.iter().map(|&(vk, ext)| vk_input(vk, ext, false)).collect();
    inputs.extend(keys.iter().rev().map(|&(vk, ext)| vk_input(vk, ext, true)));
    send(&inputs)
}

fn combo(a: &Value) -> Result<(), String> {
    let names: Vec<String> = a
        .get("keys")
        .and_then(Value::as_array)
        .map(|v| v.iter().filter_map(|k| k.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    if names.is_empty() {
        return Err(tr!("combinaison vide", "empty combination", "combinación vacía"));
    }
    let mut keys: Vec<(u16, bool)> = Vec::new();
    for n in &names {
        match combo_key(n) {
            Some(ComboKey::Vk(vk, ext)) => keys.push((vk, ext)),
            Some(ComboKey::Char(c)) => {
                let r = unsafe { VkKeyScanW(c as u16) };
                if r == -1 {
                    return Err(tr!("la touche « {c} » n'existe pas sur ce clavier", "the “{c}” key doesn’t exist on this keyboard", "la tecla «{c}» no existe en este teclado"));
                }
                let (vk, shifts) = ((r & 0xFF) as u16, ((r >> 8) & 0xFF) as u8);
                if shifts & 1 != 0 && !keys.contains(&(0x10, false)) {
                    keys.push((0x10, false));
                }
                if shifts & 2 != 0 && !keys.contains(&(0x11, false)) {
                    keys.push((0x11, false));
                }
                if shifts & 4 != 0 && !keys.contains(&(0x12, false)) {
                    keys.push((0x12, false));
                }
                keys.push((vk, false));
            }
            None => return Err(tr!("touche inconnue « {n} »", "unknown key “{n}”", "tecla desconocida «{n}»")),
        }
    }
    press_together(&keys)?;
    std::thread::sleep(Duration::from_millis(40));
    Ok(())
}

// ---------------------------------------------------------------------
//  Texte
// ---------------------------------------------------------------------

struct Clipboard;

impl Clipboard {
    /// Le presse-papiers est parfois occupé par un autre programme : on réessaie un peu.
    fn open() -> Option<Clipboard> {
        for _ in 0..25 {
            if unsafe { OpenClipboard(null_mut()) } != 0 {
                return Some(Clipboard);
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        None
    }

    fn text(&self) -> Option<String> {
        unsafe {
            if IsClipboardFormatAvailable(CF_UNICODETEXT) == 0 {
                return None;
            }
            let h = GetClipboardData(CF_UNICODETEXT);
            if h.is_null() {
                return None;
            }
            let p = GlobalLock(h) as *const u16;
            if p.is_null() {
                return None;
            }
            let mut len = 0usize;
            while *p.add(len) != 0 && len < 50_000_000 {
                len += 1;
            }
            let s = String::from_utf16_lossy(std::slice::from_raw_parts(p, len));
            GlobalUnlock(h);
            Some(s)
        }
    }

    fn set_text(&self, text: &str) -> bool {
        unsafe {
            let w = wide(text);
            let h = GlobalAlloc(GMEM_MOVEABLE, w.len() * 2);
            if h.is_null() {
                return false;
            }
            let p = GlobalLock(h) as *mut u16;
            if p.is_null() {
                return false;
            }
            std::ptr::copy_nonoverlapping(w.as_ptr(), p, w.len());
            GlobalUnlock(h);
            EmptyClipboard();
            !SetClipboardData(CF_UNICODETEXT, h).is_null()
        }
    }

    fn clear(&self) {
        unsafe {
            EmptyClipboard();
        }
    }

    /// true = il y a autre chose que du texte (image, fichiers copiés…).
    fn has_other_than_text(&self) -> bool {
        unsafe { CountClipboardFormats() > 0 && IsClipboardFormatAvailable(CF_UNICODETEXT) == 0 }
    }
}

impl Drop for Clipboard {
    fn drop(&mut self) {
        unsafe {
            CloseClipboard();
        }
    }
}

fn type_text(text: &str) -> Result<(), String> {
    for c in text.chars() {
        match c {
            '\n' => tap(0x0D, false)?,
            '\t' => tap(0x09, false)?,
            '\r' => {}
            _ => {
                let mut buf = [0u16; 2];
                let mut inputs = Vec::new();
                for unit in c.encode_utf16(&mut buf).iter() {
                    inputs.push(key_input(0, *unit, KEYEVENTF_UNICODE));
                    inputs.push(key_input(0, *unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
                }
                send(&inputs)?;
            }
        }
        std::thread::sleep(Duration::from_millis(4));
    }
    Ok(())
}

fn insert_text(a: &Value) -> Result<(), String> {
    let raw = text_of(a, "text");
    let mut now: SYSTEMTIME = unsafe { zeroed() };
    unsafe { GetLocalTime(&mut now) };
    let (old, other) = match Clipboard::open() {
        Some(c) => (c.text(), c.has_other_than_text()),
        None => (None, false),
    };
    let (text, back) = expand(raw, now.wYear, now.wMonth, now.wDay, now.wHour, now.wMinute, old.as_deref().unwrap_or(""));

    // Une image ou des fichiers dans le presse-papiers : on tape le texte pour ne pas les perdre.
    if text_of(a, "mode") == "type" || other {
        type_text(&text)?;
    } else {
        {
            let Some(c) = Clipboard::open() else { return Err(tr!("le presse-papiers est occupé par un autre programme", "the clipboard is busy with another program", "el portapapeles está ocupado por otro programa")) };
            if !c.set_text(&text.replace('\n', "\r\n")) {
                return Err(tr!("impossible de mettre le texte dans le presse-papiers", "couldn’t put the text on the clipboard", "no se pudo poner el texto en el portapapeles"));
            }
        }
        std::thread::sleep(Duration::from_millis(30));
        press_together(&[(0x11, false), (0x56, false)])?; // Ctrl + V
        // Laisser au programme le temps de lire le presse-papiers avant de le remettre comme avant.
        std::thread::sleep(Duration::from_millis(350));
        if let Some(c) = Clipboard::open() {
            match &old {
                Some(t) => {
                    c.set_text(t);
                }
                None => c.clear(),
            }
        }
    }
    for _ in 0..back.min(5000) {
        tap(0x25, true)?; // ←
    }
    Ok(())
}

// ---------------------------------------------------------------------
//  Attendre
// ---------------------------------------------------------------------

struct Search {
    words: String,
    found: HWND,
}

unsafe extern "system" fn each_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let search = &mut *(lparam as *mut Search);
    if IsWindowVisible(hwnd) == 0 {
        return 1;
    }
    let mut buf = [0u16; 512];
    let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
    if n > 0 && String::from_utf16_lossy(&buf[..n as usize]).to_lowercase().contains(&search.words) {
        search.found = hwnd;
        return 0; // trouvée : on arrête
    }
    1
}

fn find_window(words: &str) -> Option<HWND> {
    let mut s = Search { words: words.to_lowercase(), found: null_mut() };
    unsafe { EnumWindows(Some(each_window), &mut s as *mut Search as LPARAM) };
    if s.found.is_null() {
        None
    } else {
        Some(s.found)
    }
}

fn wait(a: &Value) -> Result<(), String> {
    if text_of(a, "kind") == "window" {
        let name = text_of(a, "window").trim();
        if name.is_empty() {
            return Ok(());
        }
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(10) {
            if let Some(hwnd) = find_window(name) {
                // La fenêtre est là : on la met devant, pour que la suite (texte, touches) y aille.
                allow_foreground();
                unsafe {
                    if IsIconic(hwnd) != 0 {
                        ShowWindow(hwnd, SW_RESTORE);
                    }
                    SetForegroundWindow(hwnd);
                }
                std::thread::sleep(Duration::from_millis(150));
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        // Pas trouvée après 10 secondes : on continue quand même (comme promis dans la fenêtre « Attendre »).
        return Ok(());
    }
    let ms = a.get("ms").and_then(Value::as_u64).unwrap_or(0).min(600_000);
    std::thread::sleep(Duration::from_millis(ms));
    Ok(())
}
