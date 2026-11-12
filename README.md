# Keyboard Bro

Transforme un deuxième clavier en clavier à macros : une touche peut lancer un programme, ouvrir un lien, coller du texte ou faire une combinaison de touches — pendant que ton clavier principal reste normal.

> **Version 0.1 (étape 1) — lecture seulement.** Keyboard Bro reconnaît chaque clavier branché et montre en direct quelles touches viennent de quel clavier. Rien n'est bloqué, rien n'est enregistré, rien n'est envoyé sur Internet. Les macros arrivent à l'étape 2.

## Télécharger

Onglet **Actions** du dépôt → dernière exécution réussie (✓ verte) → section **Artifacts** en bas de la page :

| Fichier | Pour qui |
|---|---|
| `KeyboardBro-Windows-x64` | la plupart des PC Windows 10 et 11 |
| `KeyboardBro-Windows-ARM64` | PC Windows sur puce ARM (Snapdragon, Surface Pro X…) |
| `KeyboardBro-Mac-puces-Apple` | Mac M1 à M4 (mode démonstration pour l'instant) |

Chaque archive Windows contient :
- `KeyboardBro-portable-….exe` : **version portable**, rien à installer, aucun droit d'administrateur;
- `Keyboard Bro_0.1.0_…-setup.exe` : installateur classique.

## Comment c'est fait

- **Cœur :** Rust (`src-tauri/`), avec [Tauri](https://tauri.app) pour la fenêtre.
- **Interface :** HTML, CSS et JavaScript sans dépendance (`ui/`).
- **Lecture des claviers sous Windows :** Raw Input (`src-tauri/src/input/windows.rs`), sans pilote ni droits d'administrateur.
- **Mac et Linux :** à venir (IOHIDManager sur Mac, evdev sur Linux).
- **Fabrication :** GitHub Actions (`.github/workflows/fabriquer.yml`) compile Windows x64, Windows ARM64 et Mac à chaque envoi de code.

## Compiler soi-même (facultatif)

Il faut [Rust](https://rustup.rs) et [Node.js](https://nodejs.org). Puis, dans ce dossier :

```
npm install
npx tauri dev      # lancer en mode développement
npx tauri build    # fabriquer la version finale
```

## Feuille de route

1. ✅ Squelette : onglets par clavier, dessin du clavier, terminal en direct
2. Actions : programme, URL, texte, combinaison, attente — sauvegarde automatique
3. Profils, importation AutoHotkey, étiquettes à imprimer, désactivation des macros
4. Connexion IA (MCP)
