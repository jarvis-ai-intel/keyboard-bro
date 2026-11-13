// =====================================================================
//  Lecture des claviers sous Windows — « Raw Input »
//
//  Même technique que le prototype 1 (Détecteur), testé le 2026-11-10 :
//  - aucun pilote, aucun droit d'administrateur;
//  - chaque touche arrive avec l'identité du clavier d'où elle vient;
//  - les claviers branchés ou débranchés pendant que le programme roule sont détectés.
//
//  On écoute trois sortes de messages :
//  - les touches ordinaires (page HID 0x01, usage 0x06 « clavier »);
//  - les touches multimédia (page 0x0C « Consumer » : volume, lecture…);
//  - les messages propres aux fabricants (page 0xFF00), pour les touches G1-G6,
//    M1-M3 et MR du Logitech G710 / G710+.
//
//  Une petite fenêtre invisible (« message-only ») reçoit les messages WM_INPUT
//  dans son propre fil d'exécution (thread), pour ne jamais ralentir l'interface.
//
//  Blocage des touches programmées (version 0.4, même technique que le prototype 2) :
//  Raw Input dit QUEL clavier a envoyé la touche, mais ne peut pas l'arrêter.
//  Le petit DLL kbhook.dll (dossier « kbhook ») est chargé par Windows dans les
//  programmes qui reçoivent le clavier; pour chaque touche, il demande à cette
//  fenêtre invisible (message « KeyboardBro.Query.v1 ») s'il faut la cacher.
//  On retrouve la touche dans la liste des touches lues par Raw Input (même scan
//  code, même sens, moins d'une seconde) : si elle vient d'une touche programmée
//  du clavier à macros, on répond 1 (cachée). Sinon 0 : la touche passe.
// =====================================================================

use super::{
    consumer_name, g710_pressed, matches, model_of, parse_ids, vendor_name, Binding, Event, KeyEvent, Keyboard,
    MacroStatus, G710_KEYS,
};
use std::collections::{HashMap, HashSet, VecDeque};
use std::mem::{size_of, zeroed};
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use windows_sys::Win32::Devices::DeviceAndDriverInstallation::{
    CM_Get_DevNode_PropertyW, CM_Get_Device_IDW, CM_Get_Parent, CM_Locate_DevNodeW,
    CM_LOCATE_DEVNODE_NORMAL, CR_SUCCESS,
};
use windows_sys::Win32::Devices::HumanInterfaceDevice::{
    HidD_FreePreparsedData, HidD_GetPreparsedData, HidD_SetFeature, HidP_GetCaps, HidP_GetUsages, HidP_Input,
    HIDP_CAPS, HIDP_STATUS_SUCCESS,
};
use windows_sys::Win32::Devices::Properties::{
    DEVPKEY_Device_BusReportedDeviceDesc, DEVPKEY_Device_DeviceDesc, DEVPKEY_Device_FriendlyName,
    DEVPROPKEY, DEVPROP_TYPE_STRING,
};
use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, GENERIC_READ, GENERIC_WRITE, HANDLE, HWND, INVALID_HANDLE_VALUE, LPARAM, LRESULT, WPARAM,
};
use windows_sys::Win32::Storage::FileSystem::{CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING};
use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress, LoadLibraryW};
use windows_sys::Win32::System::Threading::GetCurrentProcessId;
use windows_sys::Win32::UI::Input::{
    GetRawInputData, GetRawInputDeviceInfoW, GetRawInputDeviceList, RegisterRawInputDevices,
    HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTDEVICELIST, RAWINPUTHEADER, RID_DEVICE_INFO,
    RIDEV_DEVNOTIFY, RIDEV_INPUTSINK, RIDEV_PAGEONLY, RIDI_DEVICEINFO, RIDI_DEVICENAME, RIDI_PREPARSEDDATA,
    RID_INPUT, RIM_TYPEHID, RIM_TYPEKEYBOARD, RIM_TYPEMOUSE,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    ChangeWindowMessageFilterEx, CreateWindowExW, DefWindowProcW, DispatchMessageW, GetForegroundWindow, GetMessageW,
    GetWindowThreadProcessId, PeekMessageW, RegisterClassW, RegisterWindowMessageW, SetWindowsHookExW, TranslateMessage,
    HOOKPROC, HWND_MESSAGE, MSG, MSGFLT_ALLOW, PM_REMOVE, RI_KEY_BREAK, RI_KEY_E0, RI_KEY_E1, WH_KEYBOARD, WM_INPUT,
    WM_INPUT_DEVICE_CHANGE, WNDCLASSW,
};

type Sink = Box<dyn Fn(Event) + Send + Sync>;

/// Où envoyer les événements (vers l'interface).
static SINK: OnceLock<Sink> = OnceLock::new();

/// Mémoire : poignée Windows d'une interface clavier → identifiant de notre clavier.
static GROUPS: OnceLock<Mutex<HashMap<usize, String>>> = OnceLock::new();

/// Mémoire des appareils HID (touches multimédia, messages du G710) déjà examinés.
static HIDS: OnceLock<Mutex<HashMap<usize, HidDevice>>> = OnceLock::new();

fn groups() -> &'static Mutex<HashMap<usize, String>> {
    GROUPS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn hids() -> &'static Mutex<HashMap<usize, HidDevice>> {
    HIDS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn send(event: Event) {
    if let Some(sink) = SINK.get() {
        sink(event);
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn from_wide(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

/// Démarre l'écoute des claviers dans un fil d'exécution séparé.
pub fn start<F: Fn(Event) + Send + Sync + 'static>(sink: F) {
    let _ = SINK.set(Box::new(sink));
    std::thread::Builder::new()
        .name("keyboard-bro-raw-input".into())
        .spawn(|| unsafe { message_loop() })
        .ok();
}

unsafe fn message_loop() {
    let instance = GetModuleHandleW(null());
    let class_name = wide("KeyboardBroRawInput");

    let mut class: WNDCLASSW = zeroed();
    class.lpfnWndProc = Some(window_proc);
    class.hInstance = instance;
    class.lpszClassName = class_name.as_ptr();
    RegisterClassW(&class);

    let hwnd = CreateWindowExW(
        0,
        class_name.as_ptr(),
        null(),
        0,
        0,
        0,
        0,
        0,
        HWND_MESSAGE,
        null_mut(),
        instance,
        null(),
    );
    if hwnd.is_null() {
        return;
    }

    let item = size_of::<RAWINPUTDEVICE>() as u32;
    // Page 0x01 / usage 0x06 = « clavier ».
    // INPUTSINK : on reçoit les touches même quand Keyboard Bro n'est pas la fenêtre active.
    // DEVNOTIFY : on est prévenu quand un clavier est branché ou débranché.
    let keyboard = RAWINPUTDEVICE {
        usUsagePage: 0x01,
        usUsage: 0x06,
        dwFlags: RIDEV_INPUTSINK | RIDEV_DEVNOTIFY,
        hwndTarget: hwnd,
    };
    if RegisterRawInputDevices(&keyboard, 1, item) == 0 {
        set_status(false, tr!("Windows a refusé de laisser lire les claviers.", "Windows refused to let the keyboards be read.", "Windows no permitió leer los teclados.", "Windows не позволи клавиатурите да бъдат четени."));
        return;
    }
    // Facultatifs (si Windows refuse, les touches ordinaires marchent quand même) :
    // touches multimédia, et messages propres aux fabricants (touches G du G710).
    let extras = [
        RAWINPUTDEVICE { usUsagePage: 0x0C, usUsage: 0x01, dwFlags: RIDEV_INPUTSINK, hwndTarget: hwnd },
        RAWINPUTDEVICE { usUsagePage: 0xFF00, usUsage: 0x00, dwFlags: RIDEV_INPUTSINK | RIDEV_PAGEONLY, hwndTarget: hwnd },
    ];
    for extra in extras.iter() {
        RegisterRawInputDevices(extra, 1, item);
    }

    send(Event::Devices(list()));

    // Blocage des touches programmées (le DLL demande à cette fenêtre).
    match install_hook(hwnd) {
        Ok(()) => set_status(true, String::new()),
        Err(e) => set_status(false, e),
    }

    let mut msg: MSG = zeroed();
    while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
}

unsafe extern "system" fn window_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let query = QUERY.load(Ordering::Relaxed);
    if query != 0 && msg == query {
        return on_query(hwnd, wparam, lparam);
    }
    match msg {
        WM_INPUT => on_input(lparam as HRAWINPUT),
        WM_INPUT_DEVICE_CHANGE => {
            if let Ok(mut h) = hids().lock() {
                h.clear();
            }
            send(Event::Devices(list()));
            return 0;
        }
        _ => {}
    }
    // Obligatoire après WM_INPUT : Windows libère ainsi les données de la touche.
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

unsafe fn on_input(handle: HRAWINPUT) {
    let header_size = size_of::<RAWINPUTHEADER>() as u32;
    let mut size: u32 = 0;
    GetRawInputData(handle, RID_INPUT, null_mut(), &mut size, header_size);
    if size == 0 || size > 16384 {
        return;
    }
    // Tampon aligné sur 8 octets (u64), comme l'exige la structure RAWINPUT.
    let mut buffer = vec![0u64; (size as usize + 7) / 8];
    if GetRawInputData(handle, RID_INPUT, buffer.as_mut_ptr().cast(), &mut size, header_size) == u32::MAX {
        return;
    }
    let raw = &*(buffer.as_ptr() as *const RAWINPUT);
    if raw.header.dwType == RIM_TYPEHID {
        on_hid(raw, size as usize);
        return;
    }
    if raw.header.dwType != RIM_TYPEKEYBOARD {
        return;
    }
    let key = raw.data.keyboard;
    // 0xFF = morceau « fantôme » d'une séquence spéciale (ex. Pause, Impr. écran) : on l'ignore.
    if key.VKey == 0xFF {
        return;
    }
    let flags = key.Flags as u32;
    let device = group_of(raw.header.hDevice);
    let e0 = flags & RI_KEY_E0 != 0;
    let down = flags & RI_KEY_BREAK == 0;
    let d = decide(&device, Some((key.MakeCode, e0, key.VKey)), None, down);
    remember(key.MakeCode, e0, key.VKey, down, d.blocked);
    send(Event::Key(KeyEvent {
        device,
        vkey: key.VKey,
        make: key.MakeCode,
        e0,
        e1: flags & RI_KEY_E1 != 0,
        down,
        key: None,
        code: None,
        fired: d.fired,
        blocked: d.blocked,
        skipped: d.skipped,
    }));
}

// ---------------------------------------------------------------------
//  Touches programmées : quelle macro, faut-il cacher la touche ?
// ---------------------------------------------------------------------

struct Engine {
    enabled: bool,
    list: Vec<Binding>,
    /// Touches programmées tenues enfoncées (pour ignorer la répétition automatique).
    held: HashSet<(String, u16, bool, u16, String)>,
    /// Dernier départ de chaque macro (une touche multimédia arrive parfois deux fois).
    last: HashMap<usize, Instant>,
}

static ENGINE: OnceLock<Mutex<Engine>> = OnceLock::new();
static STATUS: OnceLock<Mutex<MacroStatus>> = OnceLock::new();

fn engine() -> &'static Mutex<Engine> {
    ENGINE.get_or_init(|| Mutex::new(Engine { enabled: true, list: Vec::new(), held: HashSet::new(), last: HashMap::new() }))
}

fn status_cell() -> &'static Mutex<MacroStatus> {
    STATUS.get_or_init(|| Mutex::new(MacroStatus { message: "Démarrage…".into(), ..Default::default() }))
}

fn set_status(blocking: bool, message: String) {
    if let Ok(mut s) = status_cell().lock() {
        s.blocking = blocking;
        s.message = message;
    }
}

/// L'interface envoie la liste des touches programmées (et si les macros sont allumées).
pub fn set_bindings(list: Vec<Binding>, enabled: bool) {
    if let Ok(mut e) = engine().lock() {
        let keep: Vec<Binding> = list.into_iter().filter(|b| !b.actions.is_empty()).collect();
        e.enabled = enabled;
        e.list = keep;
        e.held.clear();
        e.last.clear();
    }
}

pub fn macro_status() -> MacroStatus {
    let mut s = status_cell().lock().map(|s| s.clone()).unwrap_or_default();
    if let Ok(e) = engine().lock() {
        s.enabled = e.enabled;
        s.count = e.list.len();
    }
    s
}

#[derive(Default)]
struct Decision {
    fired: Option<String>,
    blocked: bool,
    skipped: Option<String>,
}

/// Keyboard Bro lui-même est-il la fenêtre active ? (on ne lance pas de macro dans sa propre fenêtre)
unsafe fn own_window_active() -> bool {
    let fg = GetForegroundWindow();
    if fg.is_null() {
        return false;
    }
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(fg, &mut pid);
    pid == GetCurrentProcessId()
}

/// `raw` = touche ordinaire (scan, E0, VK); `special` = touche lue autrement (« G1 », « VolUp »…).
unsafe fn decide(device: &str, raw: Option<(u16, bool, u16)>, special: Option<&str>, down: bool) -> Decision {
    let mut out = Decision::default();
    if device == "simule" {
        return out;
    }
    let fire = {
        let Ok(mut e) = engine().lock() else { return out };
        if !e.enabled {
            return out;
        }
        let found = e.list.iter().position(|b| {
            b.device == device
                && (raw.map(|(m, x, v)| matches(b, m, x, v)).unwrap_or(false)
                    || special.map(|n| !b.special.is_empty() && b.special == n).unwrap_or(false))
        });
        let Some(i) = found else { return out };
        // Une touche spéciale (G1, multimédia) n'a pas de message clavier à cacher.
        out.blocked = raw.is_some();
        let (m, x, v) = raw.unwrap_or((0, false, 0));
        let id = (device.to_string(), m, x, v, special.unwrap_or("").to_string());
        if !down {
            e.held.remove(&id);
            return out;
        }
        if !e.held.insert(id) {
            return out; // répétition automatique : la touche reste cachée, la macro ne repart pas
        }
        let now = Instant::now();
        if e.last.get(&i).map(|t| now.duration_since(*t) < Duration::from_millis(150)).unwrap_or(false) {
            return out;
        }
        e.last.insert(i, now);
        let b = &e.list[i];
        let name = if b.name.trim().is_empty() { "Macro".to_string() } else { b.name.clone() };
        (name, b.actions.clone())
    };
    out.fired = Some(fire.0.clone());
    if own_window_active() {
        out.skipped = Some(tr!("Keyboard Bro est la fenêtre active", "Keyboard Bro is the active window", "Keyboard Bro es la ventana activa", "Keyboard Bro е активният прозорец"));
    } else {
        send(Event::Fire(fire.0, fire.1));
    }
    out
}

// ---------------------------------------------------------------------
//  Questions du DLL : « faut-il cacher cette touche ? »
// ---------------------------------------------------------------------

/// Message « KeyboardBro.Query.v1 ».
static QUERY: AtomicU32 = AtomicU32::new(0);

struct Seen {
    make: u16,
    e0: bool,
    vk: u16,
    down: bool,
    block: bool,
    at: Instant,
    used: bool,
}

static SEEN: OnceLock<Mutex<VecDeque<Seen>>> = OnceLock::new();

fn seen() -> &'static Mutex<VecDeque<Seen>> {
    SEEN.get_or_init(|| Mutex::new(VecDeque::with_capacity(64)))
}

/// Garde la touche lue par Raw Input, pour répondre au DLL dans un instant.
fn remember(make: u16, e0: bool, vk: u16, down: bool, block: bool) {
    let Ok(mut q) = seen().lock() else { return };
    let now = Instant::now();
    while q.front().map(|s| q.len() >= 64 || now.duration_since(s.at) > Duration::from_secs(2)).unwrap_or(false) {
        q.pop_front();
    }
    q.push_back(Seen { make, e0, vk, down, block, at: now, used: false });
}

/// `wparam` = code virtuel (VK), `lparam` = scan code, E0 et sens, comme Windows les donne au DLL.
unsafe fn on_query(hwnd: HWND, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    // D'abord, lire les touches que Raw Input a déjà en attente pour nous.
    let mut m: MSG = zeroed();
    let mut guard = 0;
    while guard < 64 && PeekMessageW(&mut m, hwnd, WM_INPUT, WM_INPUT, PM_REMOVE) != 0 {
        DispatchMessageW(&m);
        guard += 1;
    }
    let lp = lparam as usize;
    let scan = ((lp >> 16) & 0xFF) as u16;
    let e0 = (lp >> 24) & 1 == 1;
    let down = (lp >> 31) & 1 == 0;
    let vk = (wparam & 0xFFFF) as u16;
    let Ok(mut q) = seen().lock() else { return 0 };
    let now = Instant::now();
    let fresh = |s: &Seen| !s.used && s.down == down && now.duration_since(s.at) < Duration::from_secs(1);
    // 1er essai : même position (scan code + E0). 2e essai : même code virtuel.
    let mut found = q.iter().position(|s| fresh(s) && s.make == scan && s.e0 == e0);
    if found.is_none() && vk != 0 {
        found = q.iter().position(|s| fresh(s) && s.vk == vk);
    }
    let Some(i) = found else { return 0 };
    let hit = (q[i].make, q[i].e0, q[i].down, q[i].block);
    q[i].used = true;
    // Les copies plus vieilles de la même touche ne serviront plus.
    for s in q.iter_mut().take(i) {
        if !s.used && s.make == hit.0 && s.e0 == hit.1 && s.down == hit.2 {
            s.used = true;
        }
    }
    if hit.3 {
        1
    } else {
        0
    }
}


// ---------------------------------------------------------------------
//  Appareils HID : touches multimédia et touches G du G710
// ---------------------------------------------------------------------

enum HidKind {
    /// Messages propres au G710 (page 0xFF00) : G1-G6, M1-M3, MR.
    G710,
    /// Touches multimédia (page 0x0C), avec la « description » HID pour les décoder.
    Consumer(Vec<u64>),
    /// Autre appareil : on l'ignore.
    Ignore,
}

struct HidDevice {
    kind: HidKind,
    group: String,
    /// G710 : touches appuyées au dernier message (un bit par touche).
    last_bits: u32,
    /// Multimédia : touches appuyées au dernier message.
    last_usages: Vec<u16>,
}

/// Fabricant, produit, page et usage d'un appareil HID.
unsafe fn hid_info(device: HANDLE) -> Option<(u16, u16, u16, u16)> {
    let mut info: RID_DEVICE_INFO = zeroed();
    info.cbSize = size_of::<RID_DEVICE_INFO>() as u32;
    let mut size = info.cbSize;
    if GetRawInputDeviceInfoW(device, RIDI_DEVICEINFO, (&mut info as *mut RID_DEVICE_INFO).cast(), &mut size) == u32::MAX {
        return None;
    }
    if info.dwType != RIM_TYPEHID {
        return None;
    }
    let h = info.Anonymous.hid;
    Some((h.dwVendorId as u16, h.dwProductId as u16, h.usUsagePage, h.usUsage))
}

/// « Description » HID d'un appareil (nécessaire pour décoder ses messages).
unsafe fn preparsed(device: HANDLE) -> Option<Vec<u64>> {
    let mut size: u32 = 0;
    GetRawInputDeviceInfoW(device, RIDI_PREPARSEDDATA, null_mut(), &mut size);
    if size == 0 || size > 65536 {
        return None;
    }
    let mut buf = vec![0u64; (size as usize + 7) / 8];
    if GetRawInputDeviceInfoW(device, RIDI_PREPARSEDDATA, buf.as_mut_ptr().cast(), &mut size) == u32::MAX {
        return None;
    }
    Some(buf)
}

unsafe fn examine(device: HANDLE) -> HidDevice {
    let ignore = HidDevice { kind: HidKind::Ignore, group: String::new(), last_bits: 0, last_usages: Vec::new() };
    let Some((vid, pid, page, usage)) = hid_info(device) else { return ignore };
    let kind = if page == 0xFF00 && model_of(&format!("{vid:04X}"), &format!("{pid:04X}")) == "g710" {
        HidKind::G710
    } else if page == 0x0C && usage == 0x01 {
        match preparsed(device) {
            Some(p) => HidKind::Consumer(p),
            None => return ignore,
        }
    } else {
        return ignore;
    };
    let Some(path) = device_path(device) else { return ignore };
    let (v, p) = parse_ids(&path);
    HidDevice { kind, group: group_id(&path, &v, &p), last_bits: 0, last_usages: Vec::new() }
}

unsafe fn special(device: &str, name: Option<&str>, down: bool, code: String) -> Event {
    let d = match name {
        Some(n) => decide(device, None, Some(n), down),
        None => Decision::default(),
    };
    Event::Key(KeyEvent {
        device: device.to_string(),
        vkey: 0,
        make: 0,
        e0: false,
        e1: false,
        down,
        key: name.map(str::to_string),
        code: Some(code),
        fired: d.fired,
        blocked: d.blocked,
        skipped: d.skipped,
    })
}

unsafe fn on_hid(raw: &RAWINPUT, total: usize) {
    let device = raw.header.hDevice;
    if device.is_null() {
        return;
    }
    let hid = &raw.data.hid;
    let each = hid.dwSizeHid as usize;
    let count = hid.dwCount as usize;
    let header = size_of::<RAWINPUTHEADER>() + 8; // en-tête + dwSizeHid + dwCount
    if each == 0 || count == 0 || header + each * count > total {
        return;
    }
    let base = hid.bRawData.as_ptr();

    let mut events = Vec::new();
    {
        let Ok(mut map) = hids().lock() else { return };
        let entry = map.entry(device as usize).or_insert_with(|| examine(device));
        for i in 0..count {
            let report = std::slice::from_raw_parts(base.add(i * each), each);
            match &entry.kind {
                HidKind::Ignore => return,
                HidKind::G710 => {
                    let Some(bits) = g710_pressed(report) else { continue };
                    let changed = (bits ^ entry.last_bits) & 0x3ff;
                    for (b, name) in G710_KEYS.iter().enumerate() {
                        if changed & (1 << b) != 0 {
                            let down = bits & (1 << b) != 0;
                            events.push(special(&entry.group, Some(name), down, format!("G710 · rapport 03 · bit {b}")));
                        }
                    }
                    entry.last_bits = bits;
                }
                HidKind::Consumer(desc) => {
                    let mut usages = [0u16; 32];
                    let mut len = usages.len() as u32;
                    let status = HidP_GetUsages(
                        HidP_Input,
                        0x0C,
                        0,
                        usages.as_mut_ptr(),
                        &mut len,
                        desc.as_ptr() as isize,
                        report.as_ptr() as *mut u8,
                        each as u32,
                    );
                    // Un message d'une autre partie de l'appareil : on n'y touche pas.
                    if status != HIDP_STATUS_SUCCESS {
                        continue;
                    }
                    let now: Vec<u16> = usages[..(len as usize).min(usages.len())].iter().copied().filter(|&u| u != 0).collect();
                    for &u in now.iter().filter(|u| !entry.last_usages.contains(u)) {
                        events.push(special(&entry.group, consumer_name(u), true, format!("multimédia 0x{u:03X}")));
                    }
                    for &u in entry.last_usages.iter().filter(|u| !now.contains(u)) {
                        events.push(special(&entry.group, consumer_name(u), false, format!("multimédia 0x{u:03X}")));
                    }
                    entry.last_usages = now;
                }
            }
        }
    }
    for e in events {
        send(e);
    }
}

// ---------------------------------------------------------------------
//  Installation du DLL de blocage
// ---------------------------------------------------------------------

/// Le DLL est rangé dans le programme (voir build.rs), puis copié dans
/// %LOCALAPPDATA%\com.jarvis.keyboardbro au démarrage : Windows a besoin d'un vrai fichier.
static HOOK_DLL: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/kbhook.dll"));

fn fnv(bytes: &[u8]) -> u32 {
    let mut h: u32 = 0x811c9dc5;
    for b in bytes {
        h ^= *b as u32;
        h = h.wrapping_mul(0x01000193);
    }
    h
}

fn extract_dll() -> Result<std::path::PathBuf, String> {
    if HOOK_DLL.is_empty() {
        return Err(tr!("le DLL de blocage manque dans cette version", "the blocking DLL is missing from this version", "falta la DLL de bloqueo en esta versión", "DLL файлът за блокиране липсва в тази версия"));
    }
    let base = std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from).unwrap_or_else(std::env::temp_dir);
    let dir = base.join("com.jarvis.keyboardbro");
    std::fs::create_dir_all(&dir).map_err(|e| { let d = dir.display(); tr!("dossier {d} impossible à créer ({e})", "couldn’t create folder {d} ({e})", "no se pudo crear la carpeta {d} ({e})", "папката {d} не може да бъде създадена ({e})") })?;
    let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
    let name = format!("kbhook-{}-{}-{:08x}.dll", env!("CARGO_PKG_VERSION"), arch, fnv(HOOK_DLL));
    let path = dir.join(&name);
    let same = std::fs::read(&path).map(|b| b == HOOK_DLL).unwrap_or(false);
    if !same {
        let tmp = dir.join(format!("{name}.tmp"));
        std::fs::write(&tmp, HOOK_DLL).map_err(|e| tr!("copie du DLL impossible ({e})", "couldn’t copy the DLL ({e})", "no se pudo copiar la DLL ({e})", "DLL файлът не може да бъде копиран ({e})"))?;
        std::fs::rename(&tmp, &path).map_err(|e| tr!("copie du DLL impossible ({e})", "couldn’t copy the DLL ({e})", "no se pudo copiar la DLL ({e})", "DLL файлът не може да бъде копиран ({e})"))?;
    }
    // Ménage : les DLL des anciennes versions (ceux encore utilisés par un programme restent là).
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let n = entry.file_name().to_string_lossy().to_string();
            if n.starts_with("kbhook-") && n != name {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
    Ok(path)
}

unsafe fn install_hook(hwnd: HWND) -> Result<(), String> {
    let query = RegisterWindowMessageW(wide("KeyboardBro.Query.v1").as_ptr());
    if query == 0 {
        return Err(tr!("Windows a refusé le message de blocage", "Windows refused the blocking message", "Windows rechazó el mensaje de bloqueo", "Windows отказа съобщението за блокиране"));
    }
    QUERY.store(query, Ordering::Relaxed);
    // Les programmes « protégés » (ex. navigateurs) ont le droit de nous poser la question.
    ChangeWindowMessageFilterEx(hwnd, query, MSGFLT_ALLOW, null_mut());

    let path = extract_dll()?;
    let module = LoadLibraryW(wide(&path.to_string_lossy()).as_ptr());
    if module.is_null() {
        let code = GetLastError();
        return Err(tr!("le DLL de blocage n'a pas pu être chargé (erreur {code}). Un antivirus le bloque peut-être.", "the blocking DLL couldn’t be loaded (error {code}). An antivirus may be blocking it.", "no se pudo cargar la DLL de bloqueo (error {code}). Quizá un antivirus la bloquea.", "DLL файлът за блокиране не можа да се зареди (грешка {code}). Може би антивирусна програма го блокира."));
    }
    let Some(proc_addr) = GetProcAddress(module, b"KbbKeyboardProc\0".as_ptr()) else {
        return Err(tr!("le DLL de blocage est incomplet", "the blocking DLL is incomplete", "la DLL de bloqueo está incompleta", "DLL файлът за блокиране е непълен"));
    };
    let proc: HOOKPROC = std::mem::transmute(proc_addr);
    let hook = SetWindowsHookExW(WH_KEYBOARD, proc, module, 0);
    if hook.is_null() {
        let code = GetLastError();
        return Err(tr!("Windows a refusé le blocage des touches (erreur {code}).", "Windows refused to block the keys (error {code}).", "Windows rechazó el bloqueo de teclas (error {code}).", "Windows отказа блокирането на клавишите (грешка {code})."));
    }
    Ok(())
}

// ---------------------------------------------------------------------
//  Commandes envoyées au G710 (rapports de configuration « feature »)
//  - 0x09 rempli de zéros : les touches G cessent de taper 1 à 6
//    (c'est ce que fait le pilote Linux hid-lg-g15 au démarrage);
//  - 0x06 + masque : voyants M1 (0x10), M2 (0x20), M3 (0x40), MR (0x80).
//  Aucun droit d'administrateur : c'est une partie « fabricant » du clavier,
//  que Windows laisse ouvrir normalement.
// ---------------------------------------------------------------------

unsafe fn set_feature(path: &str, report: &[u8]) -> bool {
    let name = wide(path);
    let mut file = CreateFileW(name.as_ptr(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, null(), OPEN_EXISTING, 0, null_mut());
    if file == INVALID_HANDLE_VALUE {
        file = CreateFileW(name.as_ptr(), 0, FILE_SHARE_READ | FILE_SHARE_WRITE, null(), OPEN_EXISTING, 0, null_mut());
    }
    if file == INVALID_HANDLE_VALUE {
        return false;
    }
    let mut ok = false;
    let mut desc: isize = 0;
    if HidD_GetPreparsedData(file, &mut desc) != 0 {
        let mut caps: HIDP_CAPS = zeroed();
        let length = if HidP_GetCaps(desc, &mut caps) == HIDP_STATUS_SUCCESS { caps.FeatureReportByteLength as usize } else { 0 };
        HidD_FreePreparsedData(desc);
        if length >= report.len() {
            let mut buf = vec![0u8; length];
            buf[..report.len()].copy_from_slice(report);
            ok = HidD_SetFeature(file, buf.as_ptr().cast(), length as u32) != 0;
        }
    }
    CloseHandle(file);
    ok
}

/// Envoie un rapport de configuration à toutes les parties « fabricant » du G710 `device`.
/// Retourne combien l'ont accepté.
pub fn g710_feature(device: &str, report: &[u8]) -> Result<u32, String> {
    unsafe {
        let item_size = size_of::<RAWINPUTDEVICELIST>() as u32;
        let mut count: u32 = 0;
        GetRawInputDeviceList(null_mut(), &mut count, item_size);
        let mut items: Vec<RAWINPUTDEVICELIST> = vec![zeroed(); count as usize];
        let got = GetRawInputDeviceList(items.as_mut_ptr(), &mut count, item_size);
        if got == u32::MAX {
            return Err(tr!("liste des appareils illisible", "device list unreadable", "lista de dispositivos ilegible", "списъкът с устройства не може да бъде прочетен"));
        }
        items.truncate(got as usize);
        let mut found = 0;
        let mut accepted = 0;
        for item in items.iter().filter(|d| d.dwType == RIM_TYPEHID) {
            let Some((vid, pid, page, _)) = hid_info(item.hDevice) else { continue };
            if page != 0xFF00 || model_of(&format!("{vid:04X}"), &format!("{pid:04X}")) != "g710" {
                continue;
            }
            let Some(path) = device_path(item.hDevice) else { continue };
            let (v, p) = parse_ids(&path);
            if group_id(&path, &v, &p) != device {
                continue;
            }
            found += 1;
            if set_feature(&path, report) {
                accepted += 1;
            }
        }
        if found == 0 {
            Err(tr!("aucune partie « fabricant » du G710 trouvée (le logiciel de Logitech la garde peut-être pour lui)", "no “vendor” part of the G710 found (Logitech’s software may be keeping it for itself)", "no se encontró la parte «fabricante» del G710 (quizá el programa de Logitech la reserva para sí)", "не е намерена частта „производител“ на G710 (може би програмата на Logitech я пази за себе си)"))
        } else if accepted == 0 {
            Err(tr!("le clavier a refusé la commande", "the keyboard refused the command", "el teclado rechazó el comando", "клавиатурата отказа командата"))
        } else {
            Ok(accepted)
        }
    }
}

// ---------------------------------------------------------------------
//  Identification des claviers
// ---------------------------------------------------------------------

/// Identifiant de notre clavier pour une poignée Windows.
unsafe fn group_of(device: HANDLE) -> String {
    // Poignée vide = touches simulées par un logiciel (ex. un autre outil de macros).
    if device.is_null() {
        return "simule".into();
    }
    if let Some(id) = groups().lock().ok().and_then(|g| g.get(&(device as usize)).cloned()) {
        return id;
    }
    // Clavier jamais vu : on refait la liste (et on prévient l'interface).
    let keyboards = list();
    send(Event::Devices(keyboards));
    groups()
        .lock()
        .ok()
        .and_then(|g| g.get(&(device as usize)).cloned())
        .unwrap_or_else(|| format!("inconnu-{:x}", device as usize))
}

unsafe fn device_path(device: HANDLE) -> Option<String> {
    let mut chars: u32 = 0;
    GetRawInputDeviceInfoW(device, RIDI_DEVICENAME, null_mut(), &mut chars);
    if chars == 0 || chars > 2048 {
        return None;
    }
    let mut buf = vec![0u16; chars as usize + 1];
    if GetRawInputDeviceInfoW(device, RIDI_DEVICENAME, buf.as_mut_ptr().cast(), &mut chars) == u32::MAX {
        return None;
    }
    Some(from_wide(&buf))
}

/// « \\?\HID#VID_046D&PID_C326&MI_00#7&abc&0&0000#{guid} » → « HID\VID_046D&PID_C326&MI_00\7&abc&0&0000 »
fn instance_id(path: &str) -> String {
    let trimmed = path.trim_start_matches(r"\\?\").trim_start_matches(r"\??\");
    let parts: Vec<&str> = trimmed.split('#').collect();
    if parts.len() >= 3 {
        format!("{}\\{}\\{}", parts[0], parts[1], parts[2])
    } else {
        trimmed.replace('#', "\\")
    }
}

unsafe fn node_of(instance: &str) -> Option<u32> {
    let id = wide(instance);
    let mut node: u32 = 0;
    if CM_Locate_DevNodeW(&mut node, id.as_ptr(), CM_LOCATE_DEVNODE_NORMAL) == CR_SUCCESS {
        Some(node)
    } else {
        None
    }
}

unsafe fn parent_of(node: u32) -> Option<u32> {
    let mut parent: u32 = 0;
    if CM_Get_Parent(&mut parent, node, 0) == CR_SUCCESS {
        Some(parent)
    } else {
        None
    }
}

unsafe fn node_id(node: u32) -> Option<String> {
    let mut buf = vec![0u16; 512];
    if CM_Get_Device_IDW(node, buf.as_mut_ptr(), buf.len() as u32, 0) == CR_SUCCESS {
        Some(from_wide(&buf))
    } else {
        None
    }
}

unsafe fn property(node: u32, key: &DEVPROPKEY) -> Option<String> {
    let mut kind: u32 = 0;
    let mut buf = vec![0u8; 1024];
    let mut size = buf.len() as u32;
    if CM_Get_DevNode_PropertyW(node, key, &mut kind, buf.as_mut_ptr(), &mut size, 0) != CR_SUCCESS
        || kind != DEVPROP_TYPE_STRING
    {
        return None;
    }
    let words: Vec<u16> = buf[..size as usize]
        .chunks_exact(2)
        .map(|b| u16::from_le_bytes([b[0], b[1]]))
        .collect();
    let text = from_wide(&words).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

/// Les noms génériques de Windows (« Périphérique clavier PIH », « HID Keyboard Device »…)
/// ne disent rien à l'utilisateur : on cherche un meilleur nom ailleurs.
fn is_generic(name: &str) -> bool {
    let n = name.to_lowercase();
    ["pih", "hid keyboard", "hid-compliant", "conforme hid", "périphérique d'entrée usb", "usb input device", "périphérique d’entrée usb"]
        .iter()
        .any(|g| n.contains(g))
}

struct Details {
    name: Option<String>,
    group: Option<String>,
    bus: String,
}

/// Nom du produit et appareil « parent » (pour regrouper les interfaces d'un même clavier).
unsafe fn details(path: &str) -> Details {
    let mut out = Details { name: None, group: None, bus: String::new() };
    let Some(node) = node_of(&instance_id(path)) else { return out };

    let mut candidates: Vec<String> = Vec::new();
    let mut current = Some(node);
    for _ in 0..4 {
        let Some(n) = current else { break };
        for key in [&DEVPKEY_Device_BusReportedDeviceDesc, &DEVPKEY_Device_FriendlyName, &DEVPKEY_Device_DeviceDesc] {
            if let Some(text) = property(n, key) {
                candidates.push(text);
            }
        }
        if let Some(id) = node_id(n) {
            let up = id.to_ascii_uppercase();
            if out.bus.is_empty() {
                if up.starts_with("USB\\") {
                    out.bus = "USB".into();
                } else if up.starts_with("BTHLE") || up.starts_with("BTHENUM") || up.contains("BTHLEDEVICE") {
                    out.bus = "Bluetooth".into();
                }
            }
            // Appareil USB complet (pas une de ses « interfaces » MI_xx), ou appareil Bluetooth :
            // c'est notre groupe (toutes ses interfaces = un seul clavier).
            let whole_usb = up.starts_with("USB\\") && !up.contains("&MI_");
            let bluetooth = up.starts_with("BTHLE\\") || up.starts_with("BTHENUM\\");
            if out.group.is_none() && (whole_usb || bluetooth) {
                out.group = Some(id);
            }
        }
        current = parent_of(n);
    }
    out.name = candidates.into_iter().find(|c| !is_generic(c));
    out
}

/// Identifiant d'un clavier : l'appareil USB/Bluetooth complet, pour que toutes ses parties
/// (touches ordinaires, multimédia, touches G) soient reconnues comme le même clavier.
unsafe fn group_id(path: &str, vid: &str, pid: &str) -> String {
    if vid.is_empty() {
        return format!("virtuel:{}", instance_id(path).to_ascii_lowercase());
    }
    details(path)
        .group
        .map(|g| g.to_ascii_lowercase())
        .unwrap_or_else(|| format!("{}:{}", vid, pid).to_ascii_lowercase())
}

/// Liste des claviers branchés. Les interfaces d'un même appareil sont regroupées.
pub fn list() -> Vec<Keyboard> {
    unsafe {
        let item_size = size_of::<RAWINPUTDEVICELIST>() as u32;
        let mut count: u32 = 0;
        GetRawInputDeviceList(null_mut(), &mut count, item_size);
        if count == 0 {
            return Vec::new();
        }
        let mut items: Vec<RAWINPUTDEVICELIST> = vec![zeroed(); count as usize];
        let got = GetRawInputDeviceList(items.as_mut_ptr(), &mut count, item_size);
        if got == u32::MAX {
            return Vec::new();
        }
        items.truncate(got as usize);

        let mut keyboards: Vec<Keyboard> = Vec::new();
        let mut map: HashMap<usize, String> = HashMap::new();

        // Appareils qui ont aussi une partie « souris » (même appareil USB / Bluetooth).
        let mut pointers: std::collections::HashSet<String> = std::collections::HashSet::new();
        for item in items.iter().filter(|d| d.dwType == RIM_TYPEMOUSE) {
            let Some(path) = device_path(item.hDevice) else { continue };
            let (v, p) = parse_ids(&path);
            if !v.is_empty() {
                pointers.insert(group_id(&path, &v, &p));
            }
        }

        for item in items.iter().filter(|d| d.dwType == RIM_TYPEKEYBOARD) {
            let Some(path) = device_path(item.hDevice) else { continue };
            let (vid, pid) = parse_ids(&path);
            let info = details(&path);
            let is_virtual = vid.is_empty();
            let id = if is_virtual {
                format!("virtuel:{}", instance_id(&path).to_ascii_lowercase())
            } else {
                info.group
                    .clone()
                    .map(|g| g.to_ascii_lowercase())
                    .unwrap_or_else(|| format!("{}:{}", vid, pid).to_ascii_lowercase())
            };
            map.insert(item.hDevice as usize, id.clone());

            if let Some(existing) = keyboards.iter_mut().find(|k| k.id == id) {
                existing.interfaces += 1;
                if existing.name.is_empty() {
                    if let Some(n) = info.name.clone() {
                        existing.name = n;
                    }
                }
                continue;
            }
            let vendor = vendor_name(&vid).to_string();
            let model = model_of(&vid, &pid).to_string();
            // Une souris qui se dit aussi clavier : son nom dit « mouse » / « souris »,
            // ou elle a une partie souris et aucun nom de produit propre.
            let says_mouse = info.name.as_ref().map(|n| {
                let n = n.to_lowercase();
                n.contains("mouse") || n.contains("souris")
            }).unwrap_or(false);
            let mouse = !is_virtual && (says_mouse || (pointers.contains(&id) && info.name.is_none()));
            let name = info.name.clone().unwrap_or_else(|| {
                if model == "g710" {
                    "Logitech G710+".into()
                } else if is_virtual {
                    if path.to_ascii_uppercase().contains("RDP") {
                        "Clavier du bureau à distance".into()
                    } else {
                        "Clavier virtuel".into()
                    }
                } else if !vendor.is_empty() {
                    format!("Clavier {}", vendor)
                } else {
                    "Clavier USB".into()
                }
            });
            keyboards.push(Keyboard {
                id,
                name,
                vendor,
                vid,
                pid,
                interfaces: 1,
                is_virtual,
                bus: info.bus,
                model,
                mouse,
            });
        }

        if let Ok(mut g) = groups().lock() {
            *g = map;
        }
        // Les vrais claviers d'abord, les claviers virtuels à la fin.
        keyboards.sort_by_key(|k| k.is_virtual);
        keyboards
    }
}
