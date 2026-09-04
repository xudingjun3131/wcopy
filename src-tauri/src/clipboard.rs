use std::path::PathBuf;

use arboard::{Clipboard, ImageData};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;

use crate::store::ClipItem;

/// Read current clipboard contents (cross-platform via arboard).
/// Note: arboard 3.x can only GET text/image and SET text/image/html; it cannot
/// read HTML or file lists back, so `html`/`files` are populated only for items
/// restored from stored history (legacy), not from a live capture.
pub struct RawClip {
    pub text: Option<String>,
    pub html: Option<String>,
    pub image: Option<ImageData<'static>>,
    pub files: Vec<PathBuf>,
}

impl RawClip {
    pub fn empty() -> Self {
        RawClip {
            text: None,
            html: None,
            image: None,
            files: Vec::new(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.text.is_none() && self.html.is_none() && self.image.is_none() && self.files.is_empty()
    }
}

pub fn read() -> RawClip {
    let mut cb = match Clipboard::new() {
        Ok(c) => c,
        Err(_) => return RawClip::empty(),
    };
    let text = cb.get_text().ok();
    let image = cb.get_image().ok().map(|img| arboard::ImageData {
        width: img.width,
        height: img.height,
        bytes: std::borrow::Cow::Owned(img.bytes.into_owned()),
    });
    RawClip {
        text,
        html: None,
        image,
        files: Vec::new(),
    }
}

fn rgb_to_rgba(rgb: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(rgb.len() / 3 * 4);
    for p in rgb.chunks(3) {
        out.push(p[0]);
        out.push(p[1]);
        out.push(p[2]);
        out.push(255);
    }
    out
}

/// Encode arboard ImageData (RGBA) into a PNG byte buffer.
pub fn image_to_png(img: &ImageData) -> Option<Vec<u8>> {
    let mut buf = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut buf, img.width as u32, img.height as u32);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().ok()?;
        w.write_image_data(&img.bytes).ok()?;
    }
    Some(buf)
}

/// Decode a PNG byte buffer into arboard ImageData (RGBA).
pub fn png_to_image_data(bytes: &[u8]) -> Option<ImageData<'static>> {
    let decoder = png::Decoder::new(bytes);
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0; reader.output_buffer_size()];
    reader.next_frame(&mut buf).ok()?;
    let info = reader.info();
    let channels = info.color_type.samples();
    let n = info.width as usize * info.height as usize * channels;
    let rgba = match info.color_type {
        png::ColorType::Rgba => buf[..n].to_vec(),
        png::ColorType::Rgb => rgb_to_rgba(&buf[..n]),
        _ => return None,
    };
    Some(ImageData {
        width: info.width as usize,
        height: info.height as usize,
        bytes: std::borrow::Cow::Owned(rgba),
    })
}

/// Write a stored clip item back to the system clipboard.
pub fn write(item: &ClipItem) -> bool {
    let mut cb = match Clipboard::new() {
        Ok(c) => c,
        Err(_) => return false,
    };
    match item.item_type.as_str() {
        "image" => {
            if let Some(obj) = item.content.get("base64").and_then(|v| v.as_str()) {
                if let Ok(bytes) = B64.decode(obj) {
                    if let Some(img) = png_to_image_data(&bytes) {
                        return cb.set_image(img).is_ok();
                    }
                }
            }
            false
        }
        "file" => {
            // arboard 3.x cannot write a file list, so fall back to the path text.
            let text = item
                .content
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str())
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();
            if text.is_empty() {
                return false;
            }
            cb.set_text(text).is_ok()
        }
        _ => {
            let text = item
                .content
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_default();
            if let Some(html) = &item.html {
                cb.set_html(html.clone(), Some(text.clone())).is_ok()
            } else {
                cb.set_text(text).is_ok()
            }
        }
    }
}
