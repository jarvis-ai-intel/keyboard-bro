// =====================================================================
//  Keyboard Bro — kbhook.dll
//
//  Même principe que le prototype 2 (testé le 2026-11-10) :
//  Windows charge ce petit DLL dans les programmes qui reçoivent le clavier.
//  Pour chaque touche, il demande à Keyboard Bro : « est-ce une touche
//  programmée du clavier à macros ? ». Si oui, la touche est bloquée (le
//  programme ne la voit pas). Sinon, ou si Keyboard Bro ne répond pas en
//  100 ms, la touche passe normalement.
//
//  Ce DLL ne lit, ne garde et n'envoie rien d'autre.
// =====================================================================
#![allow(non_snake_case)]

use std::ptr::null_mut;
use std::sync::atomic::{AtomicIsize, AtomicU32, Ordering};
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, FindWindowExW, IsWindow, RegisterWindowMessageW, SendMessageTimeoutW, HC_ACTION,
    HWND_MESSAGE, SMTO_ABORTIFHUNG,
};

/// Fenêtre invisible de Keyboard Bro (classe « KeyboardBroRawInput »).
static HOST: AtomicIsize = AtomicIsize::new(0);
/// Message « KeyboardBro.Query.v1 ».
static QUERY: AtomicU32 = AtomicU32::new(0);

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe fn host() -> HWND {
    let h = HOST.load(Ordering::Relaxed) as HWND;
    if !h.is_null() && IsWindow(h) != 0 {
        return h;
    }
    let class = wide("KeyboardBroRawInput");
    let found = FindWindowExW(HWND_MESSAGE, null_mut(), class.as_ptr(), std::ptr::null());
    HOST.store(found as isize, Ordering::Relaxed);
    found
}

#[no_mangle]
pub unsafe extern "system" fn KbbKeyboardProc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let mut msg = QUERY.load(Ordering::Relaxed);
        if msg == 0 {
            let name = wide("KeyboardBro.Query.v1");
            msg = RegisterWindowMessageW(name.as_ptr());
            QUERY.store(msg, Ordering::Relaxed);
        }
        let h = host();
        if !h.is_null() && msg != 0 {
            let mut answer: usize = 0;
            // 100 ms au maximum : si Keyboard Bro ne répond pas, la touche passe.
            if SendMessageTimeoutW(h, msg, wparam, lparam, SMTO_ABORTIFHUNG, 100, &mut answer) != 0 && answer == 1 {
                return 1; // touche bloquée
            }
        }
    }
    CallNextHookEx(null_mut(), code, wparam, lparam)
}
