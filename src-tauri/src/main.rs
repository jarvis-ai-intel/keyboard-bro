// Keyboard Bro — point d'entrée.
// En version finale (release), aucune fenêtre de console noire ne s'ouvre sous Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    keyboard_bro_lib::run()
}
