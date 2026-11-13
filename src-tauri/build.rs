// Préparation avant la compilation de Keyboard Bro.
//
// Sous Windows, on fabrique d'abord le petit DLL de blocage (dossier « kbhook »)
// pour la même machine (x64 ou ARM64). Il est ensuite rangé DANS le programme :
// Keyboard Bro reste un seul fichier .exe portable.

use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    build_hook();
    tauri_build::build()
}

fn build_hook() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let hook_dir = manifest_dir.join("../kbhook");
    println!("cargo:rerun-if-changed={}", hook_dir.join("src/lib.rs").display());
    println!("cargo:rerun-if-changed={}", hook_dir.join("Cargo.toml").display());

    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let dest = out.join("kbhook.dll");
    let target = std::env::var("TARGET").unwrap_or_default();
    if !target.contains("windows") {
        // Mac / Linux : pas de DLL (fichier vide, jamais utilisé).
        std::fs::write(&dest, b"").unwrap();
        return;
    }

    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".into());
    let target_dir = out.join("kbhook-target");
    let status = Command::new(cargo)
        .args(["build", "--release", "--target", &target, "--manifest-path"])
        .arg(hook_dir.join("Cargo.toml"))
        .arg("--target-dir")
        .arg(&target_dir)
        // Le DLL ne doit dépendre d'aucune autre DLL (il est chargé dans d'autres programmes).
        .env("CARGO_ENCODED_RUSTFLAGS", "-Ctarget-feature=+crt-static")
        .env_remove("RUSTFLAGS")
        .env_remove("CARGO_TARGET_DIR")
        .env_remove("CARGO_BUILD_TARGET")
        .status()
        .expect("impossible de lancer cargo pour fabriquer kbhook.dll");
    assert!(status.success(), "la fabrication de kbhook.dll a échoué");

    let built: PathBuf = Path::new(&target_dir).join(&target).join("release").join("kbhook.dll");
    std::fs::copy(&built, &dest).unwrap_or_else(|e| panic!("kbhook.dll introuvable ({}): {e}", built.display()));
}
