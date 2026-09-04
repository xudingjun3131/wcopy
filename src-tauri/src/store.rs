use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::clipboard;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClipItem {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub content: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rtf: Option<String>,
    pub source: String,
    #[serde(default)]
    pub app_icon: String,
    pub time: i64,
    pub chars: i64,
    pub favorite: bool,
    pub pinned: bool,
    pub hash: String,
    /// 缩略图（base64 PNG，最长边 ≤ 400px）。仅在 UI 列表里用作预览，
    /// 避免前端把整屏截图按原分辨率解码进 DOM 导致内存暴涨。写回剪贴板
    /// 时仍用 content.base64 里的原图，因此原图清晰度不丢失。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumb: Option<String>,
}

pub struct Store {
    pub path: PathBuf,
    pub max_items: usize,
    pub items: Vec<ClipItem>,
}

impl Store {
    pub fn new(dir: PathBuf, max_items: usize) -> Self {
        let mut s = Store {
            path: dir.join("history.json"),
            max_items,
            items: Vec::new(),
        };
        s.load();
        s
    }

    fn load(&mut self) {
        if let Ok(raw) = fs::read_to_string(&self.path) {
            if let Ok(v) = serde_json::from_str::<Vec<ClipItem>>(&raw) {
                self.items = v;
            }
        }
    }

    pub(crate) fn save(&self) {
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(s) = serde_json::to_string_pretty(&self.items) {
            let _ = fs::write(&self.path, s);
        }
    }

    pub fn hash(content: &str) -> String {
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        h.update(content.as_bytes());
        let out = h.finalize();
        let mut s = String::new();
        for b in &out[..8] {
            s.push_str(&format!("{:02x}", b));
        }
        s
    }

    /// Adds an item. If the most recent item has the same hash, just refresh its time
    /// (so re-copying the same thing doesn't create a duplicate).
    pub fn add(&mut self, item: ClipItem) -> ClipItem {
        // 图片项：顺手生成一张缩略图缓存，UI 列表只用缩略图，避免整屏截图
        // 按原分辨率解码进 DOM（多张截图即可吃掉上百 MB 内存）。
        let mut item = item;
        if item.item_type == "image" {
            if let Some(b64) = item.content.get("base64").and_then(|v| v.as_str()) {
                item.thumb = clipboard::make_thumb(b64, 400);
            }
        }
        if let Some(last) = self.items.first() {
            if last.hash == item.hash {
                let mut updated = last.clone();
                updated.time = item.time;
                self.items[0] = updated.clone();
                self.save();
                return updated;
            }
        }
        if self.items.len() >= self.max_items {
            if let Some(oldest) = self
                .items
                .iter()
                .filter(|i| !i.favorite && !i.pinned)
                .last()
                .cloned()
            {
                self.items.retain(|i| i.id != oldest.id);
            }
        }
        self.items.insert(0, item.clone());
        self.save();
        item
    }

    pub fn delete(&mut self, id: &str) {
        self.items.retain(|i| i.id != id);
        self.save();
    }

    pub fn toggle_favorite(&mut self, id: &str) -> Option<ClipItem> {
        let idx = self.items.iter().position(|i| i.id == id)?;
        self.items[idx].favorite = !self.items[idx].favorite;
        self.save();
        Some(self.items[idx].clone())
    }

    pub fn toggle_pin(&mut self, id: &str) -> Option<ClipItem> {
        let idx = self.items.iter().position(|i| i.id == id)?;
        self.items[idx].pinned = !self.items[idx].pinned;
        self.save();
        Some(self.items[idx].clone())
    }

    /// Clears history but keeps favorites and pinned items.
    pub fn clear(&mut self) {
        self.items.retain(|i| i.favorite || i.pinned);
        self.save();
    }

    pub fn enforce_max_items(&mut self) {
        while self.items.len() > self.max_items {
            let removable: Vec<String> = self
                .items
                .iter()
                .filter(|i| !i.favorite && !i.pinned)
                .map(|i| i.id.clone())
                .collect();
            if removable.is_empty() {
                break;
            }
            let oldest = removable.last().unwrap().clone();
            self.items.retain(|i| i.id != oldest);
        }
        self.save();
    }
}
