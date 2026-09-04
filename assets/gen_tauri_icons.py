"""Generate the Tauri icon set from the white logo (transparent bg + white content).

Produces the sizes tauri.conf.json references under bundle.icon, plus a 512 icon.png
used as the default window icon. Keeps the logo centered with padding on transparency.
"""
import os
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
    logo.thumbnail((box, box), Image.LANCZOS)
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    return canvas


for name, s in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256), ("icon.png", 512)]:
    fit(s).save(os.path.join(out_dir, name))
    print("wrote", name)

# Multi-resolution .ico
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
images = [fit(s) for s, _ in [(s, s) for s in [16, 24, 32, 48, 64, 128, 256]]]
images[0].save(
    os.path.join(out_dir, "icon.ico"),
    format="ICO",
    sizes=[(im.width, im.height) for im in images],
    append_images=images,
)
print("wrote icon.ico")
