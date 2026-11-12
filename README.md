# Keyboard Bro

Transforme un deuxième clavier en clavier à macros : une touche peut lancer un programme, ouvrir un lien, coller du texte ou faire une combinaison de touches — pendant que ton clavier principal reste normal.

> **Version 0.3 — configuration + Logitech G710+.** Keyboard Bro reconnaît chaque clavier branché, montre en direct quelles touches viennent de quel clavier, et permet de programmer les touches (étapes 1-2-3) : ouvrir un programme, une URL, coller du texte, faire une combinaison de touches, attendre. La configuration est sauvegardée automatiquement dans `keyboard-bro.json`. **Les touches ne déclenchent pas encore leurs actions** et rien n'est bloqué : ça arrive à la prochaine version. Rien n'est envoyé sur Internet.

## Télécharger

Onglet **Actions** du dépôt → dernière exécution réussie (✓ verte) → section **Artifacts** en bas de la page :

| Fichier | Pour qui |
|---|---|
| `KeyboardBro-Windows-x64` | la plupart des PC Windows 10 et 11 |
| `KeyboardBro-Windows-ARM64` | PC Windows sur puce ARM (Snapdragon, Surface Pro X…) |
| `KeyboardBro-Mac-puces-Apple` | Mac M1 à M4 (mode démonstration pour l'instant) |

La configuration est gardée dans `keyboard-bro.json`, à côté du programme (version portable) ou dans le dossier de l'utilisateur si le dossier du programme n'est pas modifiable.

Chaque archive Windows contient :
- `KeyboardBro-portable-….exe` : **version portable**, rien à installer, aucun droit d'administrateur;
- `Keyboard Bro_0.3.0_…-setup.exe` : installateur classique.

## Claviers avec touches spéciales

- **Logitech G710 / G710+** (VID 046D, PID C24D) : touches G1 à G6, banques M1/M2/M3 (les touches G ont d'autres actions dans chaque banque, le voyant suit) et MR, lues sans le logiciel de Logitech. Le bouton « Séparer les touches G » empêche G1-G6 de taper aussi 1 à 6 (même commande que le pilote Linux `hid-lg-g15`). Pour revenir comme avant : débrancher et rebrancher le clavier.
- **Touches multimédia** (volume, lecture, piste suivante…) de tous les claviers.

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
2. ✅ Configuration : étapes 1-2-3, fenêtres d'actions, sauvegarde automatique, export/import, clavier principal verrouillé ou non
2b. Exécution des actions + blocage des touches du clavier à macros
3. Profils, importation AutoHotkey, étiquettes à imprimer, désactivation des macros
4. Connexion IA (MCP)
