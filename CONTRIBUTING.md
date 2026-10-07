# Contributing to MACM KeyBridge

Thanks for taking the time. MACM KeyBridge is an MIT project maintained by one person, so focused issues and pull requests are the most useful thing you can send.

## Table of contents

- [Ways to help](#ways-to-help)
- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [Quality gate](#quality-gate)
- [Conventions](#conventions)
- [Pull requests](#pull-requests)
- [Safety rules](#safety-rules)
- [Adding a laptop to the key manual](#adding-a-laptop-to-the-key-manual)
- [Adding a translation](#adding-a-translation)
- [Licence](#licence)

## Ways to help

**Report a bug.** Open an [issue](https://github.com/m-a-c-m/macm-keybridge/issues) with your Windows version, your laptop model, what you did, what you expected and what happened. The diagnostic report (Diagnosis → *Save report to Desktop*) contains exactly the information needed; read it before pasting it, since it lists the keys you pressed during the guided test.

**Tell me about a keyboard.** Which keys fail, whether holding any other key rescues them, and what `Fn` does on your F-row. Measurements from other laptop models are genuinely useful: the airplane-mode key and the `Fn` row differ between manufacturers.

**Request a feature.** Describe the use case, not only the solution: "I need X because Y" is far more useful than "add X".

**Send a pull request.** Small and focused beats large and general.

## Development setup

Requirements: [Rust](https://rustup.rs) stable, [Node.js](https://nodejs.org) 20+, Visual Studio Build Tools 2022 with the C++ desktop workload, and the WebView2 Runtime (already on Windows 11).

```powershell
git clone https://github.com/m-a-c-m/macm-keybridge.git
cd macm-keybridge
npm install
npm run tauri dev
```

Release build:

```powershell
npm run tauri build
```

On machines with little free RAM, build with `CARGO_BUILD_JOBS=1` and `CARGO_PROFILE_RELEASE_LTO=thin`.

## Project layout

| Path | What lives there |
|---|---|
| `src-tauri/src/bridge.rs` | Pure blocking logic (no Win32), fully unit-tested. |
| `src-tauri/src/hook.rs` | `WH_KEYBOARD_LL` hook, event ring buffer, re-injection, stuck-key release. |
| `src-tauri/src/engine.rs` | Windowless engine process, JSON-lines IPC and the watchdog that respawns it. |
| `src-tauri/src/radio.rs` | SetupAPI: finds and enables/disables the airplane-mode HID collection. |
| `src-tauri/src/remap.rs` | Scancode Map: build, read, write, status. |
| `src-tauri/src/checks.rs` | Windows checks (Filter Keys, Sticky Keys, filter drivers, other remappers, BIOS). |
| `src-tauri/src/{system,tray,config,diagnostics}.rs` | Elevation, autostart, tray, settings, diagnostic report. |
| `src/views/`, `src/components/` | React interface. |
| `src/lib/guide.ts` | The key manual: one bilingual card per key. |
| `src/lib/i18n.ts` | Every user-facing string, Spanish and English. |
| `docs/PROYECTO.md` | Project documentation: problem, measurements, architecture, decisions, limits. **Read this first.** |

## Quality gate

Everything must pass before a pull request is merged:

```powershell
npx tsc --noEmit
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

New behaviour in the blocking logic needs a test. `bridge.rs` is deliberately free of Win32 calls so every case — held keys, repeats, the Copilot sequence, replays — can be tested without a keyboard.

## Conventions

- Rust formatted with `cargo fmt`; no new clippy warnings.
- TypeScript in strict mode, no `any`.
- Comments only when the *why* is not obvious from the code.
- User-facing strings always go through `src/lib/i18n.ts`; the Spanish and English maps must stay in sync (TypeScript enforces it) — except the key manual, whose cards carry both languages inline in `src/lib/guide.ts`.
- Plain language in the interface: *silence* a key, *swap* a key, *bridge key* only for the one you keep held. No jargon the person is not already using.
- Files use LF endings (`.gitattributes` enforces it).

## Pull requests

1. Fork and branch from `main`: `git checkout -b feat/my-change`.
2. Keep the change focused and update `docs/PROYECTO.md` when you change behaviour or learn something about the hardware.
3. Run the quality gate.
4. Open the pull request explaining what changes and why.

## Safety rules

These are hard requirements for any change:

- **Nothing happens to the system without the user asking.** Every system change is listed in the app and has an undo; `--cleanup` must keep undoing all of them.
- **The radio helper only touches radio devices** (hardware IDs containing `HID_DEVICE_UP:0001_U:000C`), and only ones KeyBridge itself disabled get re-enabled.
- **The Scancode Map is never silently overwritten** when another program owns it.
- **Held keys are always released** on pause, stop, exit and failure.
- **No keylogging.** Keystrokes may be counted and kept briefly in memory for the tester and the guided test; they are never written to disk except in the diagnostic report the user explicitly asks for.
- **No network calls and no telemetry**, ever.

## Adding a laptop to the key manual

`src/lib/guide.ts` describes what each key does on its own and with `Fn`. The `Fn` row varies between models, so changes there must be hedged ("usually…") or verified on the hardware you own. If your laptop sends airplane mode through a different HID usage, open an issue with the hardware IDs from Device Manager — that is the interesting part.

## Adding a translation

Copy the `en` map in `src/lib/i18n.ts`, translate the values, add the language code to the `Lang` type and to the picker in `src/views/Settings.tsx`, add the tray strings in `src-tauri/src/tray.rs`, and extend the `Text` type in `src/lib/guide.ts` for the key manual. Keep every `{placeholder}` exactly as it is.

## Licence

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
