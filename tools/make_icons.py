# App icon: violet gradient tile with a white serif W and a small amber sparkle (matches the in-app brand mark).
from PIL import Image, ImageDraw, ImageFont
def icon(size, out, pad=0.0):
    S = 1024
    top, bot = (0x8C, 0x63, 0xE6), (0x5E, 0x3A, 0xB0)
    im = Image.new('RGB', (S, S))
    px = im.load()
    for y in range(S):
        for x in range(S):
            t = min(1, max(0, (x * 0.35 + y * 0.65) / S))
            px[x, y] = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype('/System/Library/Fonts/NewYork.ttf', 640)
    bb = d.textbbox((0, 0), 'W', font=f)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((S - w) / 2 - bb[0], (S - h) / 2 - bb[1] + 10), 'W', font=f, fill='#FFFFFF')
    cx, cy, r = 800, 230, 70
    d.polygon([(cx, cy - r), (cx + r * .28, cy - r * .28), (cx + r, cy), (cx + r * .28, cy + r * .28), (cx, cy + r), (cx - r * .28, cy + r * .28), (cx - r, cy), (cx - r * .28, cy - r * .28)], fill='#F2B05A')
    if pad:
        bg = Image.new('RGB', (S, S), bot); sm = im.resize((int(S * (1 - pad)),) * 2, Image.LANCZOS)
        bg.paste(sm, ((S - sm.width) // 2,) * 2); im = bg
    im.resize((size, size), Image.LANCZOS).save(out)
icon(180, 'icons/apple-touch-icon.png'); icon(192, 'icons/icon-192.png'); icon(512, 'icons/icon-512.png'); icon(512, 'icons/icon-maskable-512.png', pad=0.18)
print('ok')
