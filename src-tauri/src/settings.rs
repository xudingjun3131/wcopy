use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub launch_at_login: bool,
    pub max_items: i64,
    pub theme: String,
    pub clear_retains_favorites: bool,
    pub popup_position: String,
    pub popup_shortcut: String,
    /// 上一次窗口位置/尺寸（物理像素）。None 表示尚未保存过，按靠边停靠默认尺寸处理。
    #[serde(default)]
    pub window_bounds: Option<WindowBounds>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            launch_at_login: false,
            max_items: 200,
            theme: "light".to_string(),
            clear_retains_favorites: true,
            popup_position: "right".to_string(),
            popup_shortcut: "Ctrl+Shift+V".to_string(),
            window_bounds: None,
        }
    }
}

pub struct SettingsStore {
    pub path: PathBuf,
    pub data: Settings,
}

impl SettingsStore {
    pub fn new(dir: PathBuf) -> Self {
        let path = dir.join("settings.json");
        let mut data = Settings::default();
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(parsed) = serde_json::from_str::<Settings>(&raw) {
                data = parsed;
            }
        }
        SettingsStore { path, data }
    }

    pub fn save(&self) {
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(s) = serde_json::to_string_pretty(&self.data) {
            let _ = fs::write(&self.path, s);
        }
    }
}
