# Draws the app icon: ink-blue square, serif "W", three dots in the der/die/das colours.
from PIL import Image, ImageDraw, ImageFont
import sys
def icon(size, out, pad=0.0):
    S = 1024
    im = Image.new('RGB', (S, S), '#2E4A6F')
    d = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype('/System/Library/Fonts/NewYork.ttf', 600)
        f.set_variation_by_axes([700, 600]) if hasattr(f, 'set_variation_by_axes') else None
    except Exception:
        f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Georgia Bold.ttf', 600)
    scale = 1 - pad
    txt = 'W'
    bb = d.textbbox((0, 0), txt, font=f)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((S - w) / 2 - bb[0], (S - h) / 2 - bb[1] - 70), txt, font=f, fill='#FFFDF8')
    r, gap, y = 46, 150, 790
    for i, c in enumerate(['#4F86DB', '#E0596E', '#3BAA78']):
        x = S / 2 + (i - 1) * gap
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    if pad:
        bg = Image.new('RGB', (S, S), '#2E4A6F')
        small = im.resize((int(S * scale), int(S * scale)), Image.LANCZOS)
        bg.paste(small, ((S - small.width) // 2, (S - small.height) // 2)); im = bg
    im.resize((size, size), Image.LANCZOS).save(out)
icon(180, 'icons/apple-touch-icon.png')
icon(192, 'icons/icon-192.png')
icon(512, 'icons/icon-512.png')
icon(512, 'icons/icon-maskable-512.png', pad=0.18)
print('ok')
