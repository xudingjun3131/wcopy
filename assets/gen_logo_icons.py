from PIL import Image
import os
import subprocess
import sys

# 源 Logo：用户从剪贴板给出的原图（蓝青色“敢客 / itgank.com”+ 深色圆角底板）
SOURCE_LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logo-source.png')
base_dir = os.path.dirname(os.path.abspath(__file__))


def recolor_to_white(img):
    """把 Logo 中不透明的彩色内容转成纯白，深色圆角底板改为透明。

    最终得到：透明背景 + 白色 Logo 内容。保留原 alpha 梯度，
    让白色笔画边缘的抗锯齿不被破坏。
    """
    rgba = img.convert('RGBA')
    px = rgba.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            if a < 10:
                continue  # 原本就透明，保持
            # 通过亮度区分前景彩色文字/笔画 与 深色底板：
            # 深色底板 max(r,g,b) 很低（< 70），前景文字明显更亮。
            if max(r, g, b) > 70:
                px[x, y] = (255, 255, 255, a)
            else:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def make_icon(size, src):
    """保持比例缩放到目标尺寸，居中裁剪成方形。"""
    src_ratio = src.width / src.height
    dst_ratio = 1.0
    if src_ratio > dst_ratio:
        new_h = size
        new_w = int(size * src_ratio)
    else:
        new_w = size
        new_h = int(size / src_ratio)
    resized = src.resize((new_w, new_h), Image.Resampling.LANCZOS)
    left = (resized.width - size) // 2
    top = (resized.height - size) // 2
    return resized.crop((left, top, left + size, top + size))


def write_ico_with_imagemagick(images, out_path):
    """用 ImageMagick 把多张 PNG 合并成多分辨率 ICO。

    Pillow 12 的 ICO writer 有 bug（append_images 失效），生成的 ICO
    只有第一帧，Windows 放大后会模糊。ImageMagick 能稳定生成多帧 ICO。
    """
    tmp_files = []
    sizes = []
    try:
        for im in images:
            tmp = os.path.join(base_dir, f"_tmp_icon_{im.width}x{im.height}.png")
            im.save(tmp)
            tmp_files.append(tmp)
            sizes.append(im.width)
        cmd = ["magick"] + tmp_files + [out_path]
        subprocess.run(cmd, check=True)
    except Exception as e:
        print(f"WARNING: ImageMagick ICO generation failed ({e}); falling back to single-frame 256x256 Pillow ICO")
        # Fallback：至少保留最大尺寸，避免 16x16 单帧被强行放大
        images[-1].save(out_path, format='ICO', sizes=[(images[-1].width, images[-1].height)])
    finally:
        for tmp in tmp_files:
            try:
                os.remove(tmp)
            except FileNotFoundError:
                pass


def main():
    src = Image.open(SOURCE_LOGO)
    white_logo = recolor_to_white(src)

    # 1) 主图标源：512x512 白色透明，供 Tauri bundle / 安装程序使用
    icon_512 = make_icon(512, white_logo)
    icon_512.save(os.path.join(base_dir, 'icon.png'))

    # 2) 标题栏 logo：完整 logo 保持比例缩放到 256px 宽（不裁剪），
    #    在 20x20 显示时仍有 ~12x 超采样，拒绝模糊。
    logo = white_logo.copy()
    logo.thumbnail((256, 256), Image.Resampling.LANCZOS)
    # 居中放到透明画布上，四周留 4% 边距，避免贴边被裁
    pad_x = max(1, int(logo.width * 0.04))
    pad_y = max(1, int(logo.height * 0.04))
    canvas_w = logo.width + pad_x * 2
    canvas_h = logo.height + pad_y * 2
    logo_canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    logo_canvas.paste(logo, (pad_x, pad_y), logo)
    logo_canvas.save(os.path.join(base_dir, 'logo.png'))

    # 3) 任务栏按钮图标：512x512 + 多分辨率 ICO
    taskbar_512 = make_icon(512, white_logo)
    taskbar_512.save(os.path.join(base_dir, 'icon-taskbar.png'))

    sizes = [16, 24, 32, 48, 64, 128, 256]
    taskbar_images = [make_icon(s, white_logo) for s in sizes]
    write_ico_with_imagemagick(taskbar_images, os.path.join(base_dir, 'icon-taskbar.ico'))

    # 4) 系统托盘图标：32x32 PNG
    tray_32 = make_icon(32, white_logo)
    tray_32.save(os.path.join(base_dir, 'tray-icon.png'))

    print('Generated from white logo:')
    print('  - icon.png (512x512)')
    print('  - logo.png (%dx%d)' % logo_canvas.size)
    print('  - icon-taskbar.png (512x512)')
    print('  - icon-taskbar.ico (%s)' % ', '.join(f'{s}x{s}' for s in sizes))
    print('  - tray-icon.png (32x32)')


if __name__ == '__main__':
    main()
