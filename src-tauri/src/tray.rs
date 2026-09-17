use crate::AppState;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

const TRAY_ID: &str = "keybridge";
const ICON_ON: &[u8] = include_bytes!("../icons/tray/on.png");
const ICON_OFF: &[u8] = include_bytes!("../icons/tray/off.png");

fn t(lang: &str, key: &str) -> &'static str {
    let es = lang != "en";
    match key {
        "on" => if es { "Puente activo" } else { "Bridge active" },
        "paused" => if es { "En pausa" } else { "Paused" },
        "off" => if es { "Puente desactivado" } else { "Bridge disabled" },
        "resume" => if es { "Reanudar" } else { "Resume" },
        "enable" => if es { "Activar puente" } else { "Enable bridge" },
        "pause" => if es { "Pausar" } else { "Pause" },
        "untilResume" => if es { "Hasta reanudar" } else { "Until resumed" },
        "open" => if es { "Abrir panel" } else { "Open panel" },
        "quit" => if es { "Salir" } else { "Quit" },
        _ => "",
    }
}

fn status_key(app: &AppHandle) -> &'static str {
    let state = app.state::<AppState>();
    if !state.config().active {
        "off"
    } else if state.is_paused() {
        "paused"
    } else {
        "on"
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let state = app.state::<AppState>();
    let lang = state.config().language;
    let status = status_key(app);
    let header = MenuItem::with_id(app, "status", format!("MACM KeyBridge · {}", t(&lang, status)), false, None::<&str>)?;
    let primary = match status {
        "on" => None,
        "paused" => Some(MenuItem::with_id(app, "resume", t(&lang, "resume"), true, None::<&str>)?),
        _ => Some(MenuItem::with_id(app, "enable", t(&lang, "enable"), true, None::<&str>)?),
    };
    let pause = Submenu::with_id(app, "pause", t(&lang, "pause"), status == "on")?;
    for minutes in [1, 5, 15, 60] {
        pause.append(&MenuItem::with_id(app, format!("pause:{minutes}"), format!("{minutes} min"), true, None::<&str>)?)?;
    }
    pause.append(&MenuItem::with_id(app, "pause:0", t(&lang, "untilResume"), true, None::<&str>)?)?;
    let open = MenuItem::with_id(app, "open", t(&lang, "open"), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", t(&lang, "quit"), true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&header, &sep1])?;
    if let Some(item) = &primary {
        menu.append(item)?;
    }
    menu.append_items(&[&pause, &sep2, &open, &quit])?;
    Ok(menu)
}

fn icon(app: &AppHandle) -> Option<Image<'static>> {
    Image::from_bytes(if status_key(app) == "on" { ICON_ON } else { ICON_OFF }).ok()
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&build_menu(app)?)
        .show_menu_on_left_click(false)
        .tooltip("MACM KeyBridge")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "resume" => crate::resume(app),
            "enable" => crate::set_enabled(app, true),
            "open" => crate::show_main(app),
            "quit" => app.exit(0),
            other => {
                if let Some(minutes) = other.strip_prefix("pause:").and_then(|m| m.parse::<u32>().ok()) {
                    crate::pause(app, minutes);
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                crate::show_main(tray.app_handle());
            }
        });
    if let Some(image) = icon(app) {
        builder = builder.icon(image);
    }
    builder.build(app)?;
    refresh(app);
    Ok(())
}

pub fn refresh(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    if let Ok(menu) = build_menu(app) {
        let _ = tray.set_menu(Some(menu));
    }
    let _ = tray.set_icon(icon(app));
    let lang = app.state::<AppState>().config().language;
    let _ = tray.set_tooltip(Some(format!("MACM KeyBridge · {}", t(&lang, status_key(app)))));
}
