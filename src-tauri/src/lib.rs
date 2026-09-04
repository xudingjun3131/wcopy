mod settings;
mod store;

#[cfg(windows)]
mod win;

mod clipboard;

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::{json, Value};

use tauri::{
    Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow, WindowEvent,
};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

use crate::clipboard::RawClip;
use crate::settings::{Settings, WindowBounds};
use crate::store::ClipItem;

pub struct AppState {
    pub store: Mutex<store::Store>,
    pub settings: Mutex<settings::SettingsStore>,
    pub target_hwnd: Mutex<isize>,
    pub last_hash: Mutex<String>,
    pub capture_active: Mutex<bool>,
    /// 上次持久化窗口尺寸的时间戳（ms），用于节流写盘。
    pub last_bounds_save: Mutex<i64>,
    /// 最近一次窗口尺寸（物理像素，来自 Resized 事件载荷）。
    pub bounds_size: Mutex<Option<(i32, i32)>>,
    /// 最近一次窗口位置（物理像素，来自 Moved 事件载荷）。
    pub bounds_pos: Mutex<Option<(i32, i32)>>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn is_link(s: &str) -> bool {
    let t = s.trim_start();
    t.starts_with("http://") || t.starts_with("https://")
}

fn is_code(s: &str) -> bool {
    if !s.contains('\n') {
        return false;
    }
    let pat: &[char] = &['{', '}', ';', '=', '[', ']', '<', '>', '\\', '|', '`', '~'];
    s.chars().any(|c| pat.contains(&c))
}

/// Map a process name to a friendly label + emoji icon.
fn app_label(proc: &str) -> (String, String) {
    let p = proc.to_lowercase();
    let (name, icon): (&str, &str) = match p.as_str() {
        "notepad" => ("记事本", "📝"),
        "chrome" => ("Google Chrome", "🌐"),
        "msedge" => ("Microsoft Edge", "🌐"),
        "firefox" => ("Firefox", "🦊"),
        "code" => ("VS Code", "💻"),
        "explorer" => ("文件资源管理器", "📁"),
        "wechat" => ("微信", "💬"),
        "qq" => ("QQ", "🐧"),
        "dingtalk" => ("钉钉", "🔔"),
        "powershell" => ("PowerShell", "💻"),
        "windowsterminal" => ("Windows Terminal", "💻"),
        "idea64" => ("IntelliJ IDEA", "☕"),
        "" => ("未知应用", "📋"),
        _ => (proc, "📋"),
    };
    (name.to_string(), icon.to_string())
}

/// Decide item type + stored content from raw clipboard data.
fn classify(raw: &RawClip) -> (String, Value, Option<String>, i64) {
    if !raw.files.is_empty() {
        let arr: Vec<Value> = raw
            .files
            .iter()
            .map(|p| Value::String(p.to_string_lossy().to_string()))
            .collect();
        return ("file".to_string(), Value::Array(arr), None, 0);
    }
    if let Some(img) = &raw.image {
        if let Some(png) = clipboard::image_to_png(img) {
            let b64 = B64.encode(&png);
            let content = json!({
                "base64": b64,
                "width": img.width,
                "height": img.height,
                "size": png.len(),
            });
            return ("image".to_string(), content, None, 0);
        }
    }
    let text = raw.text.clone().unwrap_or_default();
    if text.is_empty() {
        return (String::new(), Value::Null, None, 0);
    }
    let html = raw.html.clone();
    let item_type = if is_link(&text) {
        "link"
    } else if is_code(&text) {
        "code"
    } else if html.is_some() {
        "rich"
    } else {
        "text"
    };
    let chars = text.chars().count() as i64;
    (item_type.to_string(), Value::String(text), html, chars)
}

fn position_window(app: &tauri::AppHandle, win: &WebviewWindow, pos: &str, force_dock: bool) {
    let monitor = win
        .current_monitor()
        .or_else(|_| app.primary_monitor())
        .ok()
        .flatten();
    let area = match &monitor {
        Some(m) => m.work_area(),
        None => return,
    };
    let state = app.state::<AppState>();
    let saved: Option<WindowBounds> = state.settings.lock().unwrap().data.window_bounds.clone();
    const MIN_W: i32 = 420;
    const MIN_H: i32 = 360;

    // 尺寸：有保存过则用保存的尺寸（夹紧到合法范围与屏幕内），否则按靠边停靠默认尺寸。
    let (mut w, mut h): (i32, i32) = match pos {
        "top" | "bottom" => (area.size.width as i32, 460),
        _ => (460, area.size.height as i32),
    };
    if let Some(b) = &saved {
        w = b.width.max(MIN_W).min(area.size.width as i32);
        h = b.height.max(MIN_H).min(area.size.height as i32);
    }

    // 位置：未强制停靠且保存的位置仍落在当前屏幕工作区内 -> 用保存的位置；
    // 否则按 popup_position 重新靠边停靠。
    let (x, y): (i32, i32) = {
        let use_saved = !force_dock
            && saved.as_ref().map_or(false, |b| {
                b.x >= area.position.x
                    && b.x + w <= area.position.x + area.size.width as i32
                    && b.y >= area.position.y
                    && b.y + h <= area.position.y + area.size.height as i32
            });
        if use_saved {
            let b = saved.as_ref().unwrap();
            (b.x, b.y)
        } else {
            match pos {
                "left" => (area.position.x, area.position.y),
                "right" => (area.position.x + area.size.width as i32 - w, area.position.y),
                "top" => (area.position.x, area.position.y),
                "bottom" => (area.position.x, area.position.y + area.size.height as i32 - h),
                _ => (area.position.x + area.size.width as i32 - w, area.position.y),
            }
        }
    };
    let _ = win.set_size(PhysicalSize::new(w as u32, h as u32));
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

/// 窗口尺寸/位置来自 on_window_event 的事件载荷（已是物理像素）。
/// 切勿在事件回调里调用 win.inner_size()/inner_position()/scale_factor()——
/// 这些会向事件循环发同步消息并等待回复，而回调本身就运行在事件循环线程上，
/// 会导致整个应用死锁（表现为「点击就卡死」）。
fn update_bounds_size(state: &AppState, w: i32, h: i32) {
    if w < 50 || h < 50 {
        return;
    }
    *state.bounds_size.lock().unwrap() = Some((w, h));
    maybe_save_bounds(state);
}

fn update_bounds_pos(state: &AppState, x: i32, y: i32) {
    *state.bounds_pos.lock().unwrap() = Some((x, y));
    maybe_save_bounds(state);
}

/// 合并最近一次尺寸与位置，节流（250ms）写盘；二者齐全才落库。
fn maybe_save_bounds(state: &AppState) {
    let now = now_ms();
    let mut last = state.last_bounds_save.lock().unwrap();
    if now - *last <= 250 {
        return;
    }
    *last = now;
    drop(last);
    let sz = *state.bounds_size.lock().unwrap();
    let pz = *state.bounds_pos.lock().unwrap();
    if let (Some((w, h)), Some((x, y))) = (sz, pz) {
        if w >= 50 && h >= 50 {
            {
                let mut s = state.settings.lock().unwrap();
                s.data.window_bounds = Some(WindowBounds { x, y, width: w, height: h });
                s.data.bounds_schema = 1;
            }
            state.settings.lock().unwrap().save();
        }
    }
}

fn toggle_popup(app: &tauri::AppHandle, state: &AppState) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
            return;
        }
        #[cfg(windows)]
        {
            *state.target_hwnd.lock().unwrap() = win::get_foreground_window();
        }
        let pos = state.settings.lock().unwrap().data.popup_position.clone();
        position_window(app, &win, &pos, false);
        let _ = win.show();
    }
}

fn emit_history(app: &tauri::AppHandle, state: &AppState) {
    let items = state.store.lock().unwrap().items.clone();
    let _ = app.emit("history-updated", items);
}

fn capture_tick(app: &tauri::AppHandle) {
    let raw = clipboard::read();
    if raw.is_empty() {
        return;
    }
    let (item_type, content, html, chars) = classify(&raw);
    if item_type.is_empty() {
        return;
    }
    let hash_src = match item_type.as_str() {
        "file" => raw
            .files
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join("|"),
        "image" => content
            .get("base64")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        _ => raw.text.clone().unwrap_or_default(),
    };
    let hash = store::Store::hash(&hash_src);
    let state = app.state::<AppState>();
    {
        let lh = state.last_hash.lock().unwrap();
        if *lh == hash {
            return;
        }
    }
    #[cfg(windows)]
    let proc = win::get_active_app_name();
    #[cfg(not(windows))]
    let proc = String::new();
    let (source, icon) = app_label(&proc);
    let time = now_ms();
    let item = ClipItem {
        id: format!("{}-{}", time, &hash[..8]),
        item_type,
        content,
        html,
        rtf: None,
        source,
        app_icon: icon,
        time,
        chars,
        favorite: false,
        pinned: false,
        hash: hash.clone(),
    };
    state.store.lock().unwrap().add(item);
    *state.last_hash.lock().unwrap() = hash;
    emit_history(app, &state);
}

fn parse_code(p: &str) -> Option<Code> {
    let u = p.to_ascii_uppercase();
    if let Some(ch) = u.chars().next() {
        if ch.is_ascii_alphabetic() && u.len() == 1 {
            return match ch {
                'A' => Some(Code::KeyA),
                'B' => Some(Code::KeyB),
                'C' => Some(Code::KeyC),
                'D' => Some(Code::KeyD),
                'E' => Some(Code::KeyE),
                'F' => Some(Code::KeyF),
                'G' => Some(Code::KeyG),
                'H' => Some(Code::KeyH),
                'I' => Some(Code::KeyI),
                'J' => Some(Code::KeyJ),
                'K' => Some(Code::KeyK),
                'L' => Some(Code::KeyL),
                'M' => Some(Code::KeyM),
                'N' => Some(Code::KeyN),
                'O' => Some(Code::KeyO),
                'P' => Some(Code::KeyP),
                'Q' => Some(Code::KeyQ),
                'R' => Some(Code::KeyR),
                'S' => Some(Code::KeyS),
                'T' => Some(Code::KeyT),
                'U' => Some(Code::KeyU),
                'V' => Some(Code::KeyV),
                'W' => Some(Code::KeyW),
                'X' => Some(Code::KeyX),
                'Y' => Some(Code::KeyY),
                'Z' => Some(Code::KeyZ),
                _ => None,
            };
        }
    }
    match u.as_str() {
        "0" | "DIGIT0" => Some(Code::Digit0),
        "1" | "DIGIT1" => Some(Code::Digit1),
        "2" | "DIGIT2" => Some(Code::Digit2),
        "3" | "DIGIT3" => Some(Code::Digit3),
        "4" | "DIGIT4" => Some(Code::Digit4),
        "5" | "DIGIT5" => Some(Code::Digit5),
        "6" | "DIGIT6" => Some(Code::Digit6),
        "7" | "DIGIT7" => Some(Code::Digit7),
        "8" | "DIGIT8" => Some(Code::Digit8),
        "9" | "DIGIT9" => Some(Code::Digit9),
        "F1" => Some(Code::F1),
        "F2" => Some(Code::F2),
        "F3" => Some(Code::F3),
        "F4" => Some(Code::F4),
        "F5" => Some(Code::F5),
        "F6" => Some(Code::F6),
        "F7" => Some(Code::F7),
        "F8" => Some(Code::F8),
        "F9" => Some(Code::F9),
        "F10" => Some(Code::F10),
        "F11" => Some(Code::F11),
        "F12" => Some(Code::F12),
        _ => None,
    }
}

fn parse_shortcut(s: &str) -> Option<Shortcut> {
    let mut mods = Modifiers::empty();
    let mut key = None;
    for part in s.split('+') {
        let p = part.trim();
        if p.is_empty() {
            continue;
        }
        match p.to_ascii_uppercase().as_str() {
            "CTRL" | "CONTROL" | "COMMANDORCONTROL" | "COMMAND" => mods |= Modifiers::CONTROL,
            "ALT" | "OPTION" => mods |= Modifiers::ALT,
            "SHIFT" => mods |= Modifiers::SHIFT,
            "META" | "SUPER" | "WIN" => mods |= Modifiers::SUPER,
            _ => key = parse_code(p),
        }
    }
    let k = key?;
    Some(Shortcut::new(Some(mods), k))
}

fn register_popup_shortcut(app: &tauri::AppHandle) {
    let cur = app
        .state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .data
        .popup_shortcut
        .clone();
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if let Some(sc) = parse_shortcut(&cur) {
        let _ = gs.on_shortcut(sc, |app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                let state = app.state::<AppState>();
                let capture = *state.capture_active.lock().unwrap();
                if capture {
                    return;
                }
                toggle_popup(app, &state);
            }
        });
    }
}

fn build_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "显示 wcopy", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::new(app)?;
    menu.append(&show)?;
    menu.append(&quit)?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("no default window icon")?;
    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let pos = app.state::<AppState>().settings.lock().unwrap().data.popup_position.clone();
                    position_window(app, &w, &pos, false);
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                let state = app.state::<AppState>();
                toggle_popup(app, &state);
            }
        })
        .build(app)?;
    Ok(())
}

// ===================== Tauri commands =====================

#[tauri::command]
fn get_history(state: State<AppState>) -> Vec<ClipItem> {
    state.store.lock().unwrap().items.clone()
}

#[tauri::command]
fn delete_item(app: tauri::AppHandle, state: State<AppState>, id: String) {
    state.store.lock().unwrap().delete(&id);
    emit_history(&app, &state);
}

#[tauri::command]
fn toggle_favorite(app: tauri::AppHandle, state: State<AppState>, id: String) {
    state.store.lock().unwrap().toggle_favorite(&id);
    emit_history(&app, &state);
}

#[tauri::command]
fn toggle_pin(app: tauri::AppHandle, state: State<AppState>, id: String) {
    state.store.lock().unwrap().toggle_pin(&id);
    emit_history(&app, &state);
}

#[tauri::command]
fn clear_history(app: tauri::AppHandle, state: State<AppState>) {
    state.store.lock().unwrap().clear();
    emit_history(&app, &state);
}

#[tauri::command]
fn write_item(state: State<AppState>, id: String) -> bool {
    let item = state
        .store
        .lock()
        .unwrap()
        .items
        .iter()
        .find(|i| i.id == id)
        .cloned();
    match item {
        Some(it) => clipboard::write(&it),
        None => false,
    }
}

#[tauri::command]
fn paste_item(app: tauri::AppHandle, state: State<AppState>, id: String) -> bool {
    let ok = write_item(State::clone(&state), id);
    if !ok {
        return false;
    }
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
    #[cfg(windows)]
    {
        let hwnd = *state.target_hwnd.lock().unwrap();
        if hwnd != 0 {
            win::send_ctrl_v(hwnd);
        }
    }
    true
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Settings {
    state.settings.lock().unwrap().data.clone()
}

#[tauri::command]
fn set_settings(app: tauri::AppHandle, state: State<AppState>, patch: Value) -> Settings {
    let mut s = state.settings.lock().unwrap();
    if let Some(v) = patch.get("launchAtLogin").and_then(|v| v.as_bool()) {
        s.data.launch_at_login = v;
    }
    if let Some(v) = patch.get("maxItems").and_then(|v| v.as_i64()) {
        s.data.max_items = v;
    }
    if let Some(v) = patch.get("theme").and_then(|v| v.as_str()) {
        s.data.theme = v.to_string();
    }
    if let Some(v) = patch.get("clearRetainsFavorites").and_then(|v| v.as_bool()) {
        s.data.clear_retains_favorites = v;
    }
    if let Some(v) = patch.get("popupPosition").and_then(|v| v.as_str()) {
        s.data.popup_position = v.to_string();
    }
    if let Some(v) = patch.get("popupShortcut").and_then(|v| v.as_str()) {
        s.data.popup_shortcut = v.to_string();
    }
    s.save();

    if patch.get("launchAtLogin").is_some() {
        if s.data.launch_at_login {
            let _ = app.autolaunch().enable();
        } else {
            let _ = app.autolaunch().disable();
        }
    }
    if patch.get("maxItems").is_some() {
        let new_max = s.data.max_items.max(1) as usize;
        let mut store = state.store.lock().unwrap();
        store.max_items = new_max;
        store.enforce_max_items();
    }
    if patch.get("popupPosition").is_some() {
        if let Some(win) = app.get_webview_window("main") {
            if win.is_visible().unwrap_or(false) {
                position_window(&app, &win, &s.data.popup_position, true);
            }
        }
    }
    if patch.get("popupShortcut").is_some() {
        register_popup_shortcut(&app);
    }
    s.data.clone()
}

#[tauri::command]
fn capture_popup_shortcut(app: tauri::AppHandle, active: bool) {
    let cur = app
        .state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .data
        .popup_shortcut
        .clone();
    let gs = app.global_shortcut();
    if active {
        if let Some(sc) = parse_shortcut(&cur) {
            let _ = gs.unregister(sc);
        }
    } else {
        register_popup_shortcut(&app);
    }
}

#[tauri::command]
fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn close_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn minimize_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.minimize();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // 第二次启动时不要把实例拉起来，而是把已存在的窗口提到最前。
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();
            let settings_store = settings::SettingsStore::new(data_dir.clone());
            let max_items = settings_store.data.max_items.max(1) as usize;
            let store = store::Store::new(data_dir.clone(), max_items);
            app.manage(AppState {
                store: Mutex::new(store),
                settings: Mutex::new(settings_store),
                target_hwnd: Mutex::new(0),
                last_hash: Mutex::new(String::new()),
                capture_active: Mutex::new(false),
                last_bounds_save: Mutex::new(0),
                bounds_size: Mutex::new(None),
                bounds_pos: Mutex::new(None),
            });
            register_popup_shortcut(&app.handle());
            build_tray(app)?;
            {
                let state = app.state::<AppState>();
                let s = state.settings.lock().unwrap();
                if s.data.launch_at_login {
                    let _ = app.autolaunch().enable();
                }
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(500));
                capture_tick(&handle);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_history,
            delete_item,
            toggle_favorite,
            toggle_pin,
            clear_history,
            write_item,
            paste_item,
            get_settings,
            set_settings,
            capture_popup_shortcut,
            get_version,
            close_window,
            minimize_window
        ])
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                    // 关闭前确保最新尺寸已落盘。
                    let state = window.state::<AppState>();
                    state.settings.lock().unwrap().save();
                }
                WindowEvent::Resized(size) => {
                    let state = window.state::<AppState>();
                    update_bounds_size(state.inner(), size.width as i32, size.height as i32);
                }
                WindowEvent::Moved(pos) => {
                    let state = window.state::<AppState>();
                    update_bounds_pos(state.inner(), pos.x, pos.y);
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running wcopy");
}
