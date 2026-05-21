"""
Clock Out – App Icon & Splash Screen Generator
Requires: pip install Pillow numpy
Run:      python3 assets/generate_icon.py
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ── Palette ─────────────────────────────────────────────────────────────────
BG      = (6,   9,  20)
MINT    = (94, 231, 183)
BLUE    = (79, 163, 224)
WHITE   = (226, 234, 244)
MUTED   = (58,  79, 106)

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')

# ── Helpers ──────────────────────────────────────────────────────────────────
def lerp_color(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def make_gradient_layer(size, color_l, color_r):
    """Horizontal gradient RGBA layer."""
    arr = np.zeros((size, size, 4), dtype=np.uint8)
    xs  = np.linspace(0, 1, size)
    for c in range(3):
        arr[:, :, c] = (color_l[c] + (color_r[c] - color_l[c]) * xs).astype(np.uint8)
    arr[:, :, 3] = 255
    return Image.fromarray(arr, 'RGBA')

def make_moon_mask(size, moon_r, cut_r, cut_dx, cut_dy):
    """White crescent mask on black."""
    mask = Image.new('L', (size, size), 0)
    d    = ImageDraw.Draw(mask)
    cx, cy = size // 2, size // 2
    d.ellipse([cx - moon_r, cy - moon_r, cx + moon_r, cy + moon_r], fill=255)
    d.ellipse([
        cx - cut_r + cut_dx, cy - cut_r + cut_dy,
        cx + cut_r + cut_dx, cy + cut_r + cut_dy,
    ], fill=0)
    return mask

def add_glow(img, cx, cy, r, color, strength=0.35, passes=3):
    """Soft radial glow behind the moon."""
    glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d    = ImageDraw.Draw(glow)
    for i in range(passes, 0, -1):
        alpha = int(255 * strength * (i / passes) ** 2)
        rad   = int(r * (1 + 0.55 * i / passes))
        d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad],
                  fill=(*color, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=r * 0.28))
    return Image.alpha_composite(img, glow)

def add_wave(img, cx, wave_top, amplitude, wave_w, line_w, color, alpha=70):
    """Sine-wave sleep curve below the moon."""
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d     = ImageDraw.Draw(layer)
    x0    = cx - wave_w // 2
    x1    = cx + wave_w // 2
    # 1.5 full cycles
    pts   = []
    for px in range(x0, x1 + 1):
        t  = (px - x0) / max(1, x1 - x0)
        py = wave_top + int(math.sin(t * 1.5 * 2 * math.pi) * amplitude)
        pts.append((px, py))
    if len(pts) > 1:
        d.line(pts, fill=(*color, alpha), width=line_w)
    return Image.alpha_composite(img, layer)

def add_stars(img, size, count=18, seed=42):
    np.random.seed(seed)
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d     = ImageDraw.Draw(layer)
    cx, cy = size // 2, size // 2
    moon_r = int(size * 0.30)
    for _ in range(count):
        angle  = np.random.uniform(0, 2 * math.pi)
        dist   = np.random.uniform(moon_r * 1.15, size * 0.48)
        sx     = int(cx + math.cos(angle) * dist)
        sy     = int(cy + math.sin(angle) * dist)
        if 0 <= sx < size and 0 <= sy < size:
            r     = max(1, int(size * np.random.uniform(0.003, 0.008)))
            alpha = int(np.random.uniform(60, 180))
            d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(*WHITE, alpha))
    return Image.alpha_composite(img, layer)

# ── Core icon renderer ───────────────────────────────────────────────────────
def render_icon(size):
    img = Image.new('RGBA', (size, size), (*BG, 255))
    cx, cy = size // 2, size // 2

    # Scale factors
    moon_r  = int(size * 0.295)
    cut_r   = int(size * 0.255)
    cut_dx  = int(size * 0.110)
    cut_dy  = int(size * -0.045)

    # 1. Glow
    img = add_glow(img, cx, cy, moon_r, MINT, strength=0.22, passes=4)

    # 2. Gradient moon
    grad  = make_gradient_layer(size, MINT, BLUE)
    mask  = make_moon_mask(size, moon_r, cut_r, cut_dx, cut_dy)
    grad.putalpha(mask)
    img   = Image.alpha_composite(img, grad)

    # 3. Stars
    if size >= 60:
        img = add_stars(img, size)

    # 4. Sleep wave
    if size >= 40:
        wave_top = cy + moon_r + max(2, int(size * 0.065))
        amp      = max(2, int(size * 0.055))
        wave_w   = int(size * 0.50)
        lw       = max(1, size // 170)
        img      = add_wave(img, cx, wave_top, amp, wave_w, lw, MINT)

    return img.convert('RGB')

# ── Splash screen renderer ───────────────────────────────────────────────────
def find_font(size):
    candidates = [
        '/System/Library/Fonts/HelveticaNeue.ttc',
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/SFNSDisplay.ttf',
        '/System/Library/Fonts/SFNS.ttf',
        '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/Library/Fonts/Arial.ttf',
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()

def render_splash(w=1284, h=2778):
    img = Image.new('RGBA', (w, h), (*BG, 255))
    cx, cy_icon = w // 2, int(h * 0.38)

    # Icon area – same moon design
    icon_size = int(w * 0.72)
    icon      = render_icon(icon_size).convert('RGBA')
    icon_x    = cx - icon_size // 2
    icon_y    = cy_icon - icon_size // 2
    img.paste(icon, (icon_x, icon_y), icon)

    # Title
    title_size = int(w * 0.115)
    font_title = find_font(title_size)
    d          = ImageDraw.Draw(img)
    title_y    = cy_icon + icon_size // 2 + int(h * 0.038)
    bbox       = d.textbbox((0, 0), 'Clock Out', font=font_title)
    tw         = bbox[2] - bbox[0]
    d.text((cx - tw // 2, title_y), 'Clock Out', font=font_title, fill=(*WHITE, 255))

    # Tagline
    tag_size = int(w * 0.052)
    font_tag = find_font(tag_size)
    tag      = 'Sleep smarter. Wake better.'
    tag_bbox = d.textbbox((0, 0), tag, font=font_tag)
    tw2      = tag_bbox[2] - tag_bbox[0]
    tag_y    = title_y + title_size + int(h * 0.016)
    d.text((cx - tw2 // 2, tag_y), tag, font=font_tag, fill=(*MINT, 220))

    return img.convert('RGB')

# ── Output sizes ─────────────────────────────────────────────────────────────
ICON_SIZES = [
    ('icon.png',          1024),   # root – main App Store icon
    ('adaptive-icon.png', 1024),   # root – Android adaptive foreground
    ('images/icon.png',   1024),
    ('images/icon-180.png', 180),
    ('images/icon-167.png', 167),
    ('images/icon-152.png', 152),
    ('images/icon-120.png', 120),
    ('images/icon-87.png',   87),
    ('images/icon-80.png',   80),
    ('images/icon-76.png',   76),
    ('images/icon-60.png',   60),
    ('images/icon-58.png',   58),
    ('images/icon-40.png',   40),
    ('images/icon-29.png',   29),
    ('images/icon-20.png',   20),
]

def main():
    os.makedirs(os.path.join(ASSETS, 'images'), exist_ok=True)

    print('Generating icons...')
    cache = {}
    for filename, size in ICON_SIZES:
        if size not in cache:
            cache[size] = render_icon(size)
        out = os.path.join(ASSETS, filename)
        cache[size].save(out, 'PNG', optimize=True)
        print(f'  ✓  {filename}  ({size}×{size})')

    print('Generating splash screen...')
    splash = render_splash(1284, 2778)
    splash_path = os.path.join(ASSETS, 'splash.png')
    splash.save(splash_path, 'PNG', optimize=True)
    print(f'  ✓  splash.png  (1284×2778)')

    # Also write splash-icon (expo-splash-screen plugin logo slot)
    splash_icon = render_icon(512)
    splash_icon_path = os.path.join(ASSETS, 'images', 'splash-icon.png')
    splash_icon.save(splash_icon_path, 'PNG', optimize=True)
    print(f'  ✓  images/splash-icon.png  (512×512)')

    print('\nDone.')

if __name__ == '__main__':
    main()
