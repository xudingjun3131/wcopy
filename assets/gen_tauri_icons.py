"""Generate the Tauri icon set from the white logo (transparent bg + white content).

Produces the sizes tauri.conf.json references under bundle.icon, plus a 512 icon.png
used as the default window icon. Keeps the logo centered with padding on transparency.
"""
import os
import subprocess
from PIL import Image

base = os.path.dirname(os.path.abspath(__file__))
src = Image.open(os.path.join(base, "icon-taskbar.png")).convert("RGBA")
out_dir = os.path.join(base, "..", "src-tauri", "icons")
os.makedirs(out_dir, exist_ok=True)


def fit(size):
    """Return a square RGBA image of `size` with the logo centered (12% padding)."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = int(size * 0.12)
    box = size - pad * 2
    logo = src.copy()
    logo.thumbnail((box, box), Image.Resampling.LANCZOS)
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    return canvas


# Generate the PNG set used by tauri.conf.json bundle.icon
png_specs = [
    ("32x32.png", 32),
    ("128x128.png", 128),
    ("128x128@2x.png", 256),
    ("icon.png", 512),
]
for name, s in png_specs:
    fit(s).save(os.path.join(out_dir, name))
    print("wrote", name)


# Multi-resolution .ico
# Pillow 12's ICO writer ignores append_images and only saves the first frame,
# so we use ImageMagick when available; otherwise fall back to a single 256x256 frame.
ico_sizes = [16, 24, 32, 48, 64, 128, 256]
images = [fit(s) for s in ico_sizes]
ico_path = os.path.join(out_dir, "icon.ico")

tmp_files = []
try:
    for im in images:
        tmp = os.path.join(base, f"_tmp_tauri_icon_{im.width}x{im.height}.png")
        im.save(tmp)
        tmp_files.append(tmp)
    subprocess.run(["magick"] + tmp_files + [ico_path], check=True)
    print("wrote icon.ico (%s)" % ", ".join(f"{s}x{s}" for s in ico_sizes))
except Exception as e:
    print(f"WARNING: ImageMagick failed ({e}); falling back to single 256x256 Pillow ICO")
    images[-1].save(ico_path, format="ICO", sizes=[(images[-1].width, images[-1].height)])
    print("wrote icon.ico (256x256 only)")
finally:
    for tmp in tmp_files:
        try:
            os.remove(tmp)
        except FileNotFoundError:
            pass
