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
    /// 窗口尺寸 schema 版本。保存合法的 window_bounds 时写为 1；旧版写入的脏数据无此字段（解析为 0），加载时作废。
    #[serde(default)]
    pub bounds_schema: u32,
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
            bounds_schema: 0,
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
        // 旧版（无 bounds_schema 字段，解析为 0）保存的 window_bounds 可能是被错误乘以
        // scale_factor 的脏数据，直接作废，下次启动回到靠边停靠。
        if data.bounds_schema != 1 {
            data.window_bounds = None;
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
