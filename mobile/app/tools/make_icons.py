"""Generate the app's icon, adaptive icon, splash and Android launcher assets.

Kept as a script rather than a one-off so the icon can be regenerated when the
brand changes, instead of being a set of binaries nobody can edit.

    python mobile/app/tools/make_icons.py

The mark is two overlapping circles — two people's plans overlapping, which is
the whole app — on white. The overlap is knocked out to white rather than
painted a third shade of teal: one colour plus the page is the only version
that still reads at 48px, and a three-tone mark turns to mud there.

Under it sits the name in Poppins ExtraBold. That is deliberately the same
typeface the app loads at runtime (FONTS.headingExtra in src/styles/fonts.js),
pulled from node_modules rather than a system font, so the icon and the drawer
header are demonstrably the same lettering instead of two near-misses.

The previous icon was a teal-gradient rounded square with a white "M". White is
now the background everywhere — app.json, the Android splash colour and these
bitmaps all have to agree, or the launch flashes the old teal before the JS
splash paints.
"""

import os

from PIL import Image, ImageChops, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
ASSETS = os.path.join(APP, "assets")
RES = os.path.join(APP, "android", "app", "src", "main", "res")

# ACCENTS.teal and LIGHT.text in mobile/app/src/styles/theme.js.
ACCENT = (13, 156, 138, 255)
INK = (44, 62, 80, 255)
WHITE = (255, 255, 255, 255)

# Android adaptive icons crop to a circle and are scaled up, so the lockup has
# to live inside the middle ~62% or the launcher will clip the wordmark first.
ADAPTIVE_SAFE = 0.62

# Everything is drawn at 4x and resampled down once. Pillow has no antialiased
# ellipse or text, and at icon sizes the raw edges are obvious.
SS = 4

# The brand font, taken from the app's own dependency so the two can never
# drift apart. Falling back to a system bold would silently ship a different
# logo on a machine that has not run `npm install`, so this is a hard failure.
FONT_PATH = os.path.join(
    APP, "node_modules", "@expo-google-fonts", "poppins",
    "800ExtraBold", "Poppins_800ExtraBold.ttf",
)


def _wordmark(target_width, colour=INK, text="Metz"):
    """The name, tightly cropped, scaled so its ink is exactly target_width.

    Fitting by measurement rather than by a chosen point size keeps the
    wordmark locked to the mark's width at every output size, which is what
    makes the lockup look drawn rather than assembled.
    """
    if not os.path.exists(FONT_PATH):
        raise SystemExit(
            "Poppins ExtraBold not found at %s — run `npm install` in "
            "mobile/app first; the icon uses the app's own brand font."
            % FONT_PATH
        )

    # Two measure-and-correct passes: the first ratio is close, the second
    # absorbs the rounding to an integer point size.
    size = max(8, int(target_width / 2))
    for _ in range(2):
        font = ImageFont.truetype(FONT_PATH, size)
        left, _, right, _ = font.getbbox(text)
        width = right - left
        if width <= 0:
            break
        size = max(8, int(round(size * target_width / width)))

    font = ImageFont.truetype(FONT_PATH, size)
    # Draw on a canvas with room for overshoot and descenders, then crop to the
    # ink itself so callers position by what is visible, not by the em box.
    pad = size
    scratch = Image.new("RGBA", (int(target_width) + 2 * pad, size * 2 + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(scratch).text((pad, pad), text, font=font, fill=colour)
    return scratch.crop(scratch.getbbox())


def _lockup(size, safe=1.0, with_word=True):
    """Centred mark (+ wordmark) on transparency, `size`x`size`."""
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    box = big * safe

    # With the name under it the mark has to give up height; alone it can fill
    # the box, which is what the favicon and the tiny launcher bitmaps want.
    radius = box * (0.18 if with_word else 0.31)
    mark_w, mark_h = 3 * radius, 2 * radius
    gap = mark_h * 0.30

    word = _wordmark(mark_w) if with_word else None
    total_h = mark_h + gap + word.height if word else mark_h

    left = (big - mark_w) / 2
    top = (big - total_h) / 2

    # Two circles overlapping by one radius: union 3r wide, 2r tall.
    a = [left, top, left + 2 * radius, top + 2 * radius]
    b = [left + radius, top, left + 3 * radius, top + 2 * radius]
    mask_a = Image.new("L", (big, big), 0)
    mask_b = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask_a).ellipse(a, fill=255)
    ImageDraw.Draw(mask_b).ellipse(b, fill=255)

    img.paste(ACCENT, (0, 0), ImageChops.lighter(mask_a, mask_b))
    # The lens is opaque white, not transparent: on the adaptive foreground the
    # layer underneath is the white background colour anyway, and punching a
    # hole would let a themed-icon launcher show wallpaper through the middle.
    img.paste(WHITE, (0, 0), ImageChops.darker(mask_a, mask_b))

    if word:
        img.paste(word, (int((big - word.width) / 2), int(top + mark_h + gap)), word)

    return img.resize((size, size), Image.LANCZOS)


def _plate(size, radius_ratio=0.225, circle=False):
    """The white background the lockup sits on, with transparent corners."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size * SS, size * SS), 0)
    d = ImageDraw.Draw(mask)
    if circle:
        d.ellipse([0, 0, size * SS - 1, size * SS - 1], fill=255)
    else:
        d.rounded_rectangle(
            [0, 0, size * SS - 1, size * SS - 1],
            radius=int(size * SS * radius_ratio), fill=255)
    img.paste(WHITE, (0, 0), mask.resize((size, size), Image.LANCZOS))
    return img


def icon(size, with_word=True, circle=False):
    """Full-bleed rounded-square icon (iOS style / Play listing)."""
    img = _plate(size, circle=circle)
    mark = _lockup(size, safe=0.74, with_word=with_word)
    img.alpha_composite(mark)
    return img


def adaptive_foreground(size):
    """Android adaptive foreground: the lockup only, on transparency."""
    return _lockup(size, safe=ADAPTIVE_SAFE, with_word=True)


def splash(width=1284, height=2778):
    """Centred lockup on white — the same white app.json and colors.xml use."""
    img = Image.new("RGBA", (width, height), WHITE)
    lock = _lockup(min(width, height), safe=0.62, with_word=True)
    img.alpha_composite(lock, ((width - lock.width) // 2, (height - lock.height) // 2))
    return img


def main():
    os.makedirs(ASSETS, exist_ok=True)

    icon(1024).save(os.path.join(ASSETS, "icon.png"))
    adaptive_foreground(1024).save(os.path.join(ASSETS, "adaptive-icon.png"))
    splash().save(os.path.join(ASSETS, "splash.png"))
    # A browser tab renders this at 16px. Four letters cannot survive that, so
    # the favicon is the mark on its own rather than an unreadable smudge.
    icon(48, with_word=False).save(os.path.join(ASSETS, "favicon.png"))
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
        # mdpi/hdpi are too small for a four-letter wordmark to be anything but
        # grey fuzz, so those densities get the mark alone. The cutoff is where
        # the cap height stops clearing ~9px.
        word = px >= 96
        icon(px, with_word=word).save(
            os.path.join(folder, "ic_launcher.webp"), "WEBP", lossless=True)
        icon(px, with_word=word, circle=True).save(
            os.path.join(folder, "ic_launcher_round.webp"), "WEBP", lossless=True)
        fg = os.path.join(folder, "ic_launcher_foreground.webp")
        if os.path.exists(fg):
            adaptive_foreground(px * 2).save(fg, "WEBP", lossless=True)
        print("mipmap-%s: %dpx%s" % (name, px, "" if word else " (mark only)"))


if __name__ == "__main__":
    main()
