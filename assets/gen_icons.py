from PIL import Image, ImageDraw
import os

def draw_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = size // 16
    r = size // 6

    # gradient-ish blue background
    for y in range(size):
        ratio = y / size
        r_val = int(0 + ratio * (0 - 0))
        g_val = int(120 + ratio * (90 - 120))
        b_val = int(212 + ratio * (158 - 212))
        draw.line([(0, y), (size, y)], fill=(r_val, g_val, b_val, 255))

    # rounded rect background (simulate gradient bg already drawn)
    # white clipboard body
    body_left = size // 4
    body_top = size // 5
    body_w = size // 2
    body_h = size * 3 // 5
    corner = size // 12
    draw.rounded_rectangle(
        [body_left, body_top, body_left + body_w, body_top + body_h],
        radius=corner,
        fill=(255, 255, 255, 245)
    )

    # lines
    line_y1 = body_top + body_h // 4
    line_y2 = body_top + body_h // 2
    line_y3 = body_top + body_h * 3 // 4
    line_color = (0, 120, 212, 255)
    line_w = body_w * 3 // 5
    line_left = body_left + (body_w - line_w) // 2
    draw.line([(line_left, line_y1), (line_left + line_w, line_y1)], fill=line_color, width=max(2, size // 32))
    draw.line([(line_left, line_y2), (line_left + line_w * 0.8, line_y2)], fill=line_color, width=max(2, size // 32))
    draw.line([(line_left, line_y3), (line_left + line_w * 0.5, line_y3)], fill=line_color, width=max(2, size // 32))

    # checkmark circle badge
    badge_r = size // 10
    badge_x = size - size // 8
    badge_y = size - size // 8
    draw.ellipse([badge_x - badge_r, badge_y - badge_r, badge_x + badge_r, badge_y + badge_r], fill=(76, 194, 255, 255))
    # check
    draw.line([(badge_x - badge_r // 2, badge_y), (badge_x, badge_y + badge_r // 2)], fill=(255, 255, 255, 255), width=max(2, size // 40))
    draw.line([(badge_x, badge_y + badge_r // 2), (badge_x + badge_r // 2, badge_y - badge_r // 2)], fill=(255, 255, 255, 255), width=max(2, size // 40))

    return img

base_dir = os.path.dirname(os.path.abspath(__file__))

# app icon
icon_512 = draw_icon(512)
icon_512.save(os.path.join(base_dir, 'icon.png'))

# tray icon
icon_32 = draw_icon(32)
icon_32.save(os.path.join(base_dir, 'tray-icon.png'))

# windows ico with multiple sizes
ico = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
images = [draw_icon(s) for s in [16, 24, 32, 48, 64, 128, 256]]
ico.save(os.path.join(base_dir, 'icon.ico'), format='ICO', sizes=[(i.width, i.height) for i in images], append_images=images)

print('Icons generated: icon.png, tray-icon.png, icon.ico')
