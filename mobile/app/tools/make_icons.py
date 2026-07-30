"""Generate the app's icon, adaptive icon, splash and Android launcher assets.

Kept as a script rather than a one-off so the icon can be regenerated when the
brand changes, instead of being a set of binaries nobody can edit.

The mark matches the drawer/auth logo the apps already draw at runtime: a
rounded square filled with the teal accent gradient and a white "M".

    python mobile/app/tools/make_icons.py
"""

import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
ASSETS = os.path.join(APP, "assets")
RES = os.path.join(APP, "android", "app", "src", "main", "res")

# ACCENTS.teal in mobile/app/src/styles/theme.js
ACCENT = (13, 156, 138)
ACCENT_STRONG = (10, 125, 110)

# Android adaptive icons crop to a circle and are scaled up, so the mark has to
# live inside the middle ~66% or the launcher will clip it.
ADAPTIVE_SAFE = 0.62

FONT_CANDIDATES = [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/calibrib.ttf",
]


def _font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def gradient(size):
    """A diagonal accent gradient, matching the CSS the web uses."""
    base = Image.new("RGB", (size, size))
    px = base.load()
    for y in range(size):
        for x in range(size):
            # 0..1 along the diagonal
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(
                round(ACCENT[i] + (ACCENT_STRONG[i] - ACCENT[i]) * t) for i in range(3)
            )
    return base


def rounded_mask(size, radius_ratio=0.225):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    return mask


def draw_m(img, box_size, offset=(0, 0)):
    """Centre a white M inside a box of box_size at offset."""
    d = ImageDraw.Draw(img)
    font = _font(int(box_size * 0.62))
    left, top, right, bottom = d.textbbox((0, 0), "M", font=font)
    x = offset[0] + (box_size - (right - left)) / 2 - left
    y = offset[1] + (box_size - (bottom - top)) / 2 - top
    d.text((x, y), "M", font=font, fill=(255, 255, 255, 255))


def icon(size):
    """Full-bleed rounded-square icon (iOS style / Play listing)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.paste(gradient(size), (0, 0), rounded_mask(size))
    draw_m(img, size)
    return img


def adaptive_foreground(size):
    """Android adaptive foreground: the mark only, on transparency."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * ADAPTIVE_SAFE)
    off = (size - inner) // 2
    tile = Image.new("RGBA", (inner, inner), (0, 0, 0, 0))
    tile.paste(gradient(inner), (0, 0), rounded_mask(inner))
    draw_m(tile, inner)
    img.paste(tile, (off, off), tile)
    return img


def legacy_launcher(size, round_icon=False):
    """The pre-adaptive launcher bitmaps Android still ships in mipmap-*."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    if round_icon:
        d.ellipse([0, 0, size - 1, size - 1], fill=255)
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.225), fill=255)
    img.paste(gradient(size), (0, 0), mask)
    draw_m(img, size)
    return img


def splash(width=1284, height=2778):
    """Centred mark on the brand background."""
    img = Image.new("RGBA", (width, height), ACCENT + (255,))
    mark = icon(int(min(width, height) * 0.34))
    img.paste(mark, ((width - mark.width) // 2, (height - mark.height) // 2), mark)
    return img


def main():
    os.makedirs(ASSETS, exist_ok=True)

    icon(1024).save(os.path.join(ASSETS, "icon.png"))
    adaptive_foreground(1024).save(os.path.join(ASSETS, "adaptive-icon.png"))
    splash().save(os.path.join(ASSETS, "splash.png"))
    icon(48).save(os.path.join(ASSETS, "favicon.png"))
    print("assets/: icon, adaptive-icon, splash, favicon")

    # Android ships the built launcher bitmaps directly; because this project
    # has a checked-in android/ directory, EAS uses these rather than
    # regenerating them from app.json.
    densities = {
        "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192,
    }
    for name, px in densities.items():
        folder = os.path.join(RES, "mipmap-" + name)
        if not os.path.isdir(folder):
            continue
        legacy_launcher(px).save(os.path.join(folder, "ic_launcher.webp"), "WEBP", lossless=True)
        legacy_launcher(px, round_icon=True).save(
            os.path.join(folder, "ic_launcher_round.webp"), "WEBP", lossless=True)
        fg = os.path.join(folder, "ic_launcher_foreground.webp")
        if os.path.exists(fg):
            adaptive_foreground(px * 2).save(fg, "WEBP", lossless=True)
        print("mipmap-%s: %dpx" % (name, px))


if __name__ == "__main__":
    main()
