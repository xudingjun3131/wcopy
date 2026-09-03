from PIL import Image
import os

# 源 Logo：用户从剪贴板给出的原图（蓝青色“敢客 / itgank.com”+ 深色圆角底板）
SOURCE_LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logo-source.png')
base_dir = os.path.dirname(os.path.abspath(__file__))


def recolor_to_white(img):
    """把 Logo 中不透明的彩色内容（蓝青色“敢客 / itgank”）转成纯白，
    深色圆角底板视为背景改为透明，最终得到：透明背景 + 白色 Logo 内容。"""
    rgba = img.convert('RGBA')
    px = rgba.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            if a < 10:
                continue  # 原本就透明，保持
            # 蓝青色/偏亮的内容线 -> 白色；深色底板（接近中性暗色）-> 透明
            if max(r, g, b) > 60:
                px[x, y] = (255, 255, 255, a)
            else:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def make_icon(size, src):
    # 先缩放到目标尺寸，保持比例居中裁剪/填充
    src_ratio = src.width / src.height
    dst_ratio = 1.0
    if src_ratio > dst_ratio:
        new_h = size
        new_w = int(size * src_ratio)
    else:
        new_w = size
        new_h = int(size / src_ratio)
    resized = src.resize((new_w, new_h), Image.LANCZOS)
    # 居中裁剪成方形
    left = (resized.width - size) // 2
    top = (resized.height - size) // 2
    icon = resized.crop((left, top, left + size, top + size))
    return icon


def main():
    src = Image.open(SOURCE_LOGO)
    white_logo = recolor_to_white(src)

    # 任务栏按钮图标（BrowserWindow.icon）
    taskbar_512 = make_icon(512, white_logo)
    taskbar_512.save(os.path.join(base_dir, 'icon-taskbar.png'))

    # 任务栏按钮 ICO 多分辨率
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = [make_icon(s, white_logo) for s in sizes]
    ico = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    ico.save(
        os.path.join(base_dir, 'icon-taskbar.ico'),
        format='ICO',
        sizes=[(i.width, i.height) for i in images],
        append_images=images
    )

    # 系统托盘图标（右下角通知区域）
    tray_32 = make_icon(32, white_logo)
    tray_32.save(os.path.join(base_dir, 'tray-icon.png'))

    print('Generated icon-taskbar.png, icon-taskbar.ico, tray-icon.png from white logo')


if __name__ == '__main__':
    main()
