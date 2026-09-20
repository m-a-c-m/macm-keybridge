#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod checks;
mod config;
mod diagnostics;
mod engine;
mod hook;
mod radio;
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

pub const IDENTIFIER: &str = "es.miguelacm.keybridge";
const RADIO_ARG: &str = "--radio";
const CLEANUP_ARG: &str = "--cleanup";

#[derive(Clone, Copy)]
enum Pause {
    Until(Instant),
    Indefinite,
}

pub struct AppState {
    store: Store,
    config: RwLock<Config>,
    pause: Mutex<Option<Pause>>,
    elevated: bool,
    first_run: bool,
    tray_hint_shown: AtomicBool,
    autostart_stale: AtomicBool,
    radio_busy: Mutex<()>,
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
    events_seen: u64,
    ms_since_last_event: Option<u64>,
    elevated: bool,
    active_rules: usize,
    airplane: Option<bool>,
    autostart_stale: bool,
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
        blocking: state.effective_active() && engine::is_running(),
        blocked_count: engine::blocked_count(),
        hook_ok: engine::is_running(),
        events_seen: engine::seen_count(),
        ms_since_last_event: engine::ms_since_last_event(),
        elevated: state.elevated,
        active_rules: config.rules.iter().filter(|r| r.enabled).count(),
        airplane: system::airplane_mode(),
        autostart_stale: state.autostart_stale.load(Ordering::Relaxed),
    }
}

fn apply(app: &AppHandle) {
    let state = app.state::<AppState>();
    engine::set_active(state.effective_active());
    tray::refresh(app);
    let _ = app.emit("status", status(app));
}

fn persist(app: &AppHandle, mutate: impl FnOnce(&mut Config)) -> Config {
    let state = app.state::<AppState>();
    let snapshot = match state.config.write() {
        Ok(mut config) => {
            mutate(&mut config);
            config.clone()
        }
        Err(_) => return state.config(),
    };
    let _ = state.store.save(&snapshot);
    snapshot
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

fn lang_text(app: &AppHandle, es: &'static str, en: &'static str) -> &'static str {
    if app.state::<AppState>().config().language == "en" {
        en
    } else {
        es
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RadioStatus {
    devices: Vec<radio::RadioDevice>,
    blocked: bool,
    reenabled: bool,
}

fn radio_status_of(config: &Config) -> RadioStatus {
    let devices = radio::list();
    let reenabled = config.radio_block && devices.iter().any(|d| d.enabled);
    RadioStatus { devices, blocked: config.radio_block, reenabled }
}

fn change_radio(ids: &[String], enable: bool, elevated: bool) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    if elevated {
        radio::set_enabled(ids, enable);
        return Ok(());
    }
    let mut args = vec![RADIO_ARG, if enable { "enable" } else { "disable" }];
    args.extend(ids.iter().map(String::as_str));
    system::run_self_elevated(&args).map(|_| ())
}

fn radio_block_on(app: &AppHandle) -> Result<RadioStatus, String> {
    let state = app.state::<AppState>();
    let _busy = state.radio_busy.lock().map_err(|e| e.to_string())?;
    let targets: Vec<String> = radio::list().into_iter().filter(|d| d.enabled).map(|d| d.id).collect();
    change_radio(&targets, false, state.elevated)?;
    let now_disabled: Vec<String> =
        radio::list().into_iter().filter(|d| !d.enabled && targets.contains(&d.id)).map(|d| d.id).collect();
    if now_disabled.len() < targets.len() {
        let _ = change_radio(&now_disabled, true, state.elevated);
        return Err("device change failed".into());
    }
    let config = persist(app, |c| {
        c.radio_block = true;
        for id in now_disabled {
            if !c.radio_disabled_ids.contains(&id) {
                c.radio_disabled_ids.push(id);
            }
        }
    });
    Ok(radio_status_of(&config))
}

fn radio_block_off(app: &AppHandle) -> Result<RadioStatus, String> {
    let state = app.state::<AppState>();
    let _busy = state.radio_busy.lock().map_err(|e| e.to_string())?;
    let ours = state.config().radio_disabled_ids;
    let targets: Vec<String> = radio::list().into_iter().filter(|d| !d.enabled && ours.contains(&d.id)).map(|d| d.id).collect();
    change_radio(&targets, true, state.elevated)?;
    let still_disabled: Vec<String> = radio::list().into_iter().filter(|d| !d.enabled && ours.contains(&d.id)).map(|d| d.id).collect();
    let config = persist(app, |c| {
        c.radio_disabled_ids = still_disabled.clone();
        c.radio_block = !still_disabled.is_empty();
    });
    if !still_disabled.is_empty() {
        return Err("device change failed".into());
    }
    Ok(radio_status_of(&config))
}

fn startup_checks(app: AppHandle) {
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let stale = system::repair_autostart(state.elevated);
        state.autostart_stale.store(stale, Ordering::Relaxed);
        let config = state.config();
        if radio_status_of(&config).reenabled {
            if state.elevated && radio_block_on(&app).is_ok() {
                return;
            }
            let body = lang_text(
                &app,
                "Una actualización de Windows o de drivers ha reactivado la tecla de modo avión del teclado. Abre KeyBridge > Ajustes para volver a anularla.",
                "A Windows or driver update re-enabled the keyboard airplane-mode key. Open KeyBridge > Settings to block it again.",
            );
            notify(&app, "MACM KeyBridge", body);
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
    let mut config = config.validate()?;
    let state = app.state::<AppState>();
    let previous = state.config();
    config.radio_block = previous.radio_block;
    config.radio_disabled_ids = previous.radio_disabled_ids.clone();
    if previous.pause_hotkey != config.pause_hotkey {
        if let Err(e) = register_hotkey(&app, config.pause_hotkey.as_deref()) {
            let _ = register_hotkey(&app, previous.pause_hotkey.as_deref());
            return Err(format!("hotkey: {e}"));
        }
    }
    state.store.save(&config)?;
    engine::set_rules(&config.rules);
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
    engine::set_inspect(on);
}

#[tauri::command]
fn take_events() -> Vec<hook::Observed> {
    engine::take_events()
}

#[tauri::command]
async fn get_autostart() -> String {
    system::autostart_mode().to_string()
}

#[tauri::command]
async fn set_autostart(app: AppHandle, mode: String) -> Result<String, String> {
    let result = system::set_autostart(&mode).map(str::to_string);
    app.state::<AppState>().autostart_stale.store(false, Ordering::Relaxed);
    result
}

#[tauri::command]
fn relaunch_admin(app: AppHandle) -> Result<(), String> {
    system::relaunch_as_admin()?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
async fn system_checks() -> Vec<checks::Check> {
    checks::run()
}

#[tauri::command]
async fn apply_fix(fix: String) -> Result<Vec<checks::Check>, String> {
    match fix.as_str() {
        "filterKeys" => checks::set_filter_keys(false)?,
        "stickyKeys" => checks::set_sticky_keys(false)?,
        _ => return Err("unknown fix".into()),
    }
    Ok(checks::run())
}

#[tauri::command]
async fn radio_status(app: AppHandle) -> RadioStatus {
    radio_status_of(&app.state::<AppState>().config())
}

#[tauri::command]
async fn radio_set_blocked(app: AppHandle, blocked: bool) -> Result<RadioStatus, String> {
    if blocked {
        radio_block_on(&app)
    } else {
        radio_block_off(&app)
    }
}

#[tauri::command]
async fn undo_all(app: AppHandle) -> Result<(), String> {
    let radio = radio_block_off(&app).err();
    let autostart = system::remove_autostart().err();
    app.state::<AppState>().autostart_stale.store(false, Ordering::Relaxed);
    match (radio, autostart) {
        (None, None) => Ok(()),
        (r, a) => Err([r, a].into_iter().flatten().collect::<Vec<_>>().join("; ")),
    }
}

#[tauri::command]
async fn export_diagnostics(app: AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    let report = diagnostics::Report {
        version: app.package_info().version.to_string(),
        elevated: state.elevated,
        hook_ok: engine::is_running(),
        blocking: state.effective_active(),
        config: state.config(),
        radios: radio::list(),
        autostart: system::autostart_mode(),
        events: engine::history(),
    };
    let dir = app.path().desktop_dir().or_else(|_| app.path().document_dir()).map_err(|e| e.to_string())?;
    diagnostics::write(&report, &dir)
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let store = Store::new(&handle.path().app_config_dir()?);
    let first_run = !store.exists();
    let config = store.load();
    if first_run {
        let _ = store.save(&config);
    }
    let start_hidden = std::env::args().any(|a| a == system::MINIMIZED_ARG) || (config.start_minimized && config.onboarded);

    let hook_result = engine::start();
    engine::set_rules(&config.rules);

    app.manage(AppState {
        store,
        config: RwLock::new(config.clone()),
        pause: Mutex::new(None),
        elevated: system::is_elevated(),
        first_run,
        tray_hint_shown: AtomicBool::new(start_hidden),
        autostart_stale: AtomicBool::new(false),
        radio_busy: Mutex::new(()),
    });

    let _ = register_hotkey(&handle, config.pause_hotkey.as_deref());
    tray::create(&handle)?;
    apply(&handle);
    spawn_pause_watch(handle.clone());
    startup_checks(handle.clone());

    if let Err(e) = hook_result {
        let body = format!("No se pudo instalar el hook de teclado / keyboard hook failed: {e}");
        notify(&handle, "MACM KeyBridge", &body);
    }
    if !start_hidden {
        show_main(&handle);
    }
    Ok(())
}

fn radio_helper(args: &[String]) -> i32 {
    let enable = args.first().map(String::as_str) == Some("enable");
    let ids = args.get(1..).unwrap_or_default();
    radio::set_enabled(ids, enable);
    let pending = radio::list().into_iter().filter(|d| ids.contains(&d.id) && d.enabled != enable).count();
    pending as i32
}

// Invoked by the uninstaller: reverts every system change KeyBridge made.
fn cleanup_helper() -> i32 {
    let Some(dir) = Store::default_dir() else { return 0 };
    let store = Store::new(&dir);
    let mut config = store.load();
    let to_enable: Vec<String> =
        radio::list().into_iter().filter(|d| !d.enabled && config.radio_disabled_ids.contains(&d.id)).map(|d| d.id).collect();
    let needs_admin = !to_enable.is_empty() || system::has_admin_task();
    if needs_admin && !system::is_elevated() {
        return match system::run_self_elevated(&[CLEANUP_ARG]) {
            Ok(code) => code as i32,
            Err(_) => 1,
        };
    }
    radio::set_enabled(&to_enable, true);
    let failed = system::remove_autostart().is_err();
    config.radio_block = false;
    config.radio_disabled_ids.clear();
    let _ = store.save(&config);
    failed as i32
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some(engine::ENGINE_ARG) => std::process::exit(engine::run_child()),
        Some(RADIO_ARG) => std::process::exit(radio_helper(&args[1..])),
        Some(CLEANUP_ARG) => std::process::exit(cleanup_helper()),
        _ => {}
    }
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
                    if state.is_paused() {
                        resume(app);
                        notify(app, "MACM KeyBridge", lang_text(app, "Puente reanudado", "Bridge resumed"));
                    } else {
                        pause(app, 0);
                        notify(app, "MACM KeyBridge", lang_text(app, "Puente en pausa", "Bridge paused"));
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(setup)
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                engine::set_inspect(false);
                let app = window.app_handle();
                let state = app.state::<AppState>();
                if !state.tray_hint_shown.swap(true, Ordering::SeqCst) {
                    let body = lang_text(
                        app,
                        "KeyBridge sigue funcionando desde la bandeja del sistema (junto al reloj).",
                        "KeyBridge keeps working from the system tray (next to the clock).",
                    );
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
            take_events,
            get_autostart,
            set_autostart,
            relaunch_admin,
            system_checks,
            apply_fix,
            radio_status,
            radio_set_blocked,
            undo_all,
            export_diagnostics,
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
    app.run(|_handle, event| match event {
        RunEvent::ExitRequested { code: None, api, .. } => api.prevent_exit(),
        RunEvent::Exit => engine::shutdown(),
        _ => {}
    });
}
