#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod config;
mod hook;
mod system;
mod tray;

use config::{Config, Store};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, RwLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;

#[derive(Clone, Copy)]
enum Pause {
    Until(Instant),
    Indefinite,
}

pub struct AppState {
    store: Store,
    config: RwLock<Config>,
    pause: Mutex<Option<Pause>>,
    hook_ok: AtomicBool,
    elevated: bool,
    first_run: bool,
    tray_hint_shown: AtomicBool,
}

impl AppState {
    pub fn config(&self) -> Config {
        self.config.read().map(|c| c.clone()).unwrap_or_default()
    }
    pub fn is_paused(&self) -> bool {
        self.pause.lock().map(|p| p.is_some()).unwrap_or(false)
    }
    fn effective_active(&self) -> bool {
        self.config().active && !self.is_paused()
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    enabled: bool,
    paused: bool,
    pause_remaining_secs: Option<u64>,
    blocking: bool,
    blocked_count: u64,
    hook_ok: bool,
    elevated: bool,
    active_rules: usize,
    airplane: Option<bool>,
}

fn status(app: &AppHandle) -> Status {
    let state = app.state::<AppState>();
    let config = state.config();
    let pause = state.pause.lock().ok().and_then(|p| *p);
    Status {
        enabled: config.active,
        paused: pause.is_some(),
        pause_remaining_secs: match pause {
            Some(Pause::Until(t)) => Some(t.saturating_duration_since(Instant::now()).as_secs()),
            _ => None,
        },
        blocking: state.effective_active() && state.hook_ok.load(Ordering::Relaxed),
        blocked_count: hook::blocked_count(),
        hook_ok: state.hook_ok.load(Ordering::Relaxed),
        elevated: state.elevated,
        active_rules: config.rules.iter().filter(|r| r.enabled).count(),
        airplane: system::airplane_mode(),
    }
}

fn apply(app: &AppHandle) {
    let state = app.state::<AppState>();
    hook::set_active(state.effective_active());
    tray::refresh(app);
    let _ = app.emit("status", status(app));
}

fn persist(app: &AppHandle, mutate: impl FnOnce(&mut Config)) {
    let state = app.state::<AppState>();
    let snapshot = match state.config.write() {
        Ok(mut config) => {
            mutate(&mut config);
            config.clone()
        }
        Err(_) => return,
    };
    let _ = state.store.save(&snapshot);
}

pub fn set_enabled(app: &AppHandle, on: bool) {
    persist(app, |c| c.active = on);
    if let Ok(mut pause) = app.state::<AppState>().pause.lock() {
        *pause = None;
    }
    apply(app);
}

pub fn pause(app: &AppHandle, minutes: u32) {
    let value = match minutes.min(24 * 60) {
        0 => Pause::Indefinite,
        m => Pause::Until(Instant::now() + Duration::from_secs(m as u64 * 60)),
    };
    if let Ok(mut pause) = app.state::<AppState>().pause.lock() {
        *pause = Some(value);
    }
    apply(app);
}

pub fn resume(app: &AppHandle) {
    if let Ok(mut pause) = app.state::<AppState>().pause.lock() {
        *pause = None;
    }
    apply(app);
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    if app.state::<AppState>().config().notifications {
        let _ = app.notification().builder().title(title).body(body).show();
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let Some(window_config) = app.config().app.windows.iter().find(|w| w.label == "main").cloned() else {
        return;
    };
    if let Ok(builder) = WebviewWindowBuilder::from_config(app, &window_config) {
        let _ = builder.build();
    }
}

fn register_hotkey(app: &AppHandle, hotkey: Option<&str>) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();
    match hotkey {
        Some(h) => shortcuts.register(h).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

fn spawn_pause_watch(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(500));
        let expired = app
            .state::<AppState>()
            .pause
            .lock()
            .map(|p| matches!(*p, Some(Pause::Until(t)) if Instant::now() >= t))
            .unwrap_or(false);
        if expired {
            resume(&app);
        }
    });
}

// Lenovo-style Fn hotkeys toggle airplane mode through the HID radio collection, which no
// keyboard hook can see, so the only defence is to notice the switch and bring radios back.
fn spawn_radio_guard(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_airplane = system::airplane_mode();
        let mut snapshot = system::radio_snapshot();
        let mut last_snapshot = Instant::now();
        loop {
            std::thread::sleep(Duration::from_millis(600));
            let airplane = system::airplane_mode();
            let state = app.state::<AppState>();
            let guarding = state.config().radio_guard && state.effective_active();
            if airplane == Some(false) && last_snapshot.elapsed() > Duration::from_secs(5) {
                snapshot = system::radio_snapshot();
                last_snapshot = Instant::now();
            }
            if guarding && last_airplane == Some(false) && airplane == Some(true) {
                if let Some(previous) = &snapshot {
                    let lang = state.config().language;
                    let restored = system::restore_radios(previous);
                    let es = lang != "en";
                    let body = match (restored, es) {
                        (0, true) => "Se activó el modo avión con el puente puesto y no se pudo revertir. Desactívalo desde la barra de tareas.",
                        (0, false) => "Airplane mode was switched on while the bridge was active and could not be reverted. Turn it off from the taskbar.",
                        (_, true) => "Modo avión accidental detectado: Wi-Fi y Bluetooth reactivados. Pausa KeyBridge si querías activarlo.",
                        (_, false) => "Accidental airplane mode detected: Wi-Fi and Bluetooth restored. Pause KeyBridge if you meant it.",
                    };
                    notify(&app, "MACM KeyBridge", body);
                    let _ = app.emit("status", status(&app));
                }
            }
            last_airplane = airplane;
        }
    });
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bootstrap {
    config: Config,
    status: Status,
    version: String,
    first_run: bool,
    hotkey_error: Option<String>,
}

#[tauri::command]
fn bootstrap(app: AppHandle) -> Bootstrap {
    let state = app.state::<AppState>();
    let config = state.config();
    let hotkey_error = register_hotkey(&app, config.pause_hotkey.as_deref()).err();
    Bootstrap {
        config,
        status: status(&app),
        version: app.package_info().version.to_string(),
        first_run: state.first_run,
        hotkey_error,
    }
}

#[tauri::command]
fn get_status(app: AppHandle) -> Status {
    status(&app)
}

#[tauri::command]
fn save_config(app: AppHandle, config: Config) -> Result<Config, String> {
    let config = config.validate()?;
    let state = app.state::<AppState>();
    let previous = state.config();
    if previous.pause_hotkey != config.pause_hotkey {
        if let Err(e) = register_hotkey(&app, config.pause_hotkey.as_deref()) {
            let _ = register_hotkey(&app, previous.pause_hotkey.as_deref());
            return Err(format!("hotkey: {e}"));
        }
    }
    state.store.save(&config)?;
    hook::set_rules(&config.rules);
    if let Ok(mut current) = state.config.write() {
        *current = config.clone();
    }
    apply(&app);
    Ok(config)
}

#[tauri::command]
fn set_active(app: AppHandle, on: bool) -> Status {
    set_enabled(&app, on);
    status(&app)
}

#[tauri::command]
fn pause_for(app: AppHandle, minutes: u32) -> Status {
    pause(&app, minutes);
    status(&app)
}

#[tauri::command]
fn resume_now(app: AppHandle) -> Status {
    resume(&app);
    status(&app)
}

#[tauri::command]
fn set_inspect(on: bool) {
    hook::set_inspect(on);
}

#[tauri::command]
async fn get_autostart() -> String {
    system::autostart_mode().to_string()
}

#[tauri::command]
async fn set_autostart(mode: String) -> Result<String, String> {
    system::set_autostart(&mode).map(str::to_string)
}

#[tauri::command]
fn relaunch_admin(app: AppHandle) -> Result<(), String> {
    system::relaunch_as_admin()?;
    app.exit(0);
    Ok(())
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let store = Store::new(&handle.path().app_config_dir()?);
    let first_run = !store.exists();
    let config = store.load();
    if first_run {
        let _ = store.save(&config);
    }
    let start_hidden = std::env::args().any(|a| a == system::MINIMIZED_ARG) || config.start_minimized;

    let (tx, rx) = std::sync::mpsc::channel::<hook::Observed>();
    let hook_result = hook::start(tx);
    hook::set_rules(&config.rules);

    app.manage(AppState {
        store,
        config: RwLock::new(config.clone()),
        pause: Mutex::new(None),
        hook_ok: AtomicBool::new(hook_result.is_ok()),
        elevated: system::is_elevated(),
        first_run,
        tray_hint_shown: AtomicBool::new(start_hidden),
    });

    let forward = handle.clone();
    std::thread::spawn(move || {
        for event in rx {
            let _ = forward.emit("key", event);
        }
    });

    let _ = register_hotkey(&handle, config.pause_hotkey.as_deref());
    tray::create(&handle)?;
    apply(&handle);
    spawn_pause_watch(handle.clone());
    spawn_radio_guard(handle.clone());

    if let Err(e) = hook_result {
        let body = format!("No se pudo instalar el hook de teclado / keyboard hook failed: {e}");
        notify(&handle, "MACM KeyBridge", &body);
    }
    if !start_hidden {
        show_main(&handle);
    }
    Ok(())
}

fn main() {
    system::wait_for_previous_instance();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let state = app.state::<AppState>();
                    if !state.config().active {
                        return;
                    }
                    let lang = state.config().language;
                    if state.is_paused() {
                        resume(app);
                        notify(app, "MACM KeyBridge", if lang == "en" { "Bridge resumed" } else { "Puente reanudado" });
                    } else {
                        pause(app, 0);
                        notify(app, "MACM KeyBridge", if lang == "en" { "Bridge paused" } else { "Puente en pausa" });
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(setup)
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                hook::set_inspect(false);
                let app = window.app_handle();
                let state = app.state::<AppState>();
                if !state.tray_hint_shown.swap(true, Ordering::SeqCst) {
                    let lang = state.config().language;
                    let body = if lang == "en" {
                        "KeyBridge keeps working from the system tray."
                    } else {
                        "KeyBridge sigue funcionando desde la bandeja del sistema."
                    };
                    notify(app, "MACM KeyBridge", body);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            get_status,
            save_config,
            set_active,
            pause_for,
            resume_now,
            set_inspect,
            get_autostart,
            set_autostart,
            relaunch_admin,
        ])
        .build(tauri::generate_context!());

    let app = match app {
        Ok(app) => app,
        Err(e) => {
            eprintln!("failed to start MACM KeyBridge: {e}");
            std::process::exit(1);
        }
    };

    // Closing the panel destroys its WebView to free memory; the hook and tray keep running.
    app.run(|_handle, event| {
        if let RunEvent::ExitRequested { code: None, api, .. } = event {
            api.prevent_exit();
        }
    });
}
