// =====================================================================
//  Lecture des claviers sous Windows — « Raw Input »
//
//  Même technique que le prototype 1 (Détecteur), testé le 2026-11-10 :
//  - aucun pilote, aucun droit d'administrateur;
//  - chaque touche arrive avec l'identité du clavier d'où elle vient;
//  - les claviers branchés ou débranchés pendant que le programme roule sont détectés.
//
//  Une petite fenêtre invisible (« message-only ») reçoit les messages WM_INPUT
//  dans son propre fil d'exécution (thread), pour ne jamais ralentir l'interface.
//  Rien n'est bloqué : c'est de la lecture seulement.
// =====================================================================

use super::{parse_ids, vendor_name, Event, KeyEvent, Keyboard};
use std::collections::HashMap;
use std::mem::{size_of, zeroed};
use std::ptr::{null, null_mut};
use std::sync::{Mutex, OnceLock};

use windows_sys::Win32::Devices::DeviceAndDriverInstallation::{
    CM_Get_DevNode_PropertyW, CM_Get_Device_IDW, CM_Get_Parent, CM_Locate_DevNodeW,
    CM_LOCATE_DEVNODE_NORMAL, CR_SUCCESS,
};
use windows_sys::Win32::Devices::Properties::{
    DEVPKEY_Device_BusReportedDeviceDesc, DEVPKEY_Device_DeviceDesc, DEVPKEY_Device_FriendlyName,
    DEVPROPKEY, DEVPROP_TYPE_STRING,
};
use windows_sys::Win32::Foundation::{HANDLE, HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::Input::{
    GetRawInputData, GetRawInputDeviceInfoW, GetRawInputDeviceList, RegisterRawInputDevices,
    HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTDEVICELIST, RAWINPUTHEADER, RIDEV_DEVNOTIFY,
    RIDEV_INPUTSINK, RIDI_DEVICENAME, RID_INPUT, RIM_TYPEKEYBOARD,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
    TranslateMessage, HWND_MESSAGE, MSG, RI_KEY_BREAK, RI_KEY_E0, RI_KEY_E1, WM_INPUT,
    WM_INPUT_DEVICE_CHANGE, WNDCLASSW,
};

type Sink = Box<dyn Fn(Event) + Send + Sync>;

/// Où envoyer les événements (vers l'interface).
static SINK: OnceLock<Sink> = OnceLock::new();

/// Mémoire : poignée Windows d'une interface clavier → identifiant de notre clavier.
static GROUPS: OnceLock<Mutex<HashMap<usize, String>>> = OnceLock::new();

fn groups() -> &'static Mutex<HashMap<usize, String>> {
    GROUPS.get_or_init(|| Mutex::new(HashMap::new()))
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

    // Page 0x01 / usage 0x06 = « clavier ».
    // INPUTSINK : on reçoit les touches même quand Keyboard Bro n'est pas la fenêtre active.
    // DEVNOTIFY : on est prévenu quand un clavier est branché ou débranché.
    let device = RAWINPUTDEVICE {
        usUsagePage: 0x01,
        usUsage: 0x06,
        dwFlags: RIDEV_INPUTSINK | RIDEV_DEVNOTIFY,
        hwndTarget: hwnd,
    };
    if RegisterRawInputDevices(&device, 1, size_of::<RAWINPUTDEVICE>() as u32) == 0 {
        return;
    }

    send(Event::Devices(list()));

    let mut msg: MSG = zeroed();
    while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
}

unsafe extern "system" fn window_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_INPUT => on_input(lparam as HRAWINPUT),
        WM_INPUT_DEVICE_CHANGE => {
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
    if size == 0 || size > 4096 {
        return;
    }
    // Tampon aligné sur 8 octets (u64), comme l'exige la structure RAWINPUT.
    let mut buffer = vec![0u64; (size as usize + 7) / 8];
    if GetRawInputData(handle, RID_INPUT, buffer.as_mut_ptr().cast(), &mut size, header_size) == u32::MAX {
        return;
    }
    let raw = &*(buffer.as_ptr() as *const RAWINPUT);
    if raw.header.dwType != RIM_TYPEKEYBOARD {
        return;
    }
    let key = raw.data.keyboard;
    // 0xFF = morceau « fantôme » d'une séquence spéciale (ex. Pause, Impr. écran) : on l'ignore.
    if key.VKey == 0xFF {
        return;
    }
    let flags = key.Flags as u32;
    send(Event::Key(KeyEvent {
        device: group_of(raw.header.hDevice),
        vkey: key.VKey,
        make: key.MakeCode,
        e0: flags & RI_KEY_E0 != 0,
        e1: flags & RI_KEY_E1 != 0,
        down: flags & RI_KEY_BREAK == 0,
    }));
}

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
            // c'est notre groupe (toutes ses interfaces clavier = un seul clavier).
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
            let name = info.name.clone().unwrap_or_else(|| {
                if is_virtual {
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
