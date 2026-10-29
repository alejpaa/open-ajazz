"""Genera la fuente del icono de la app (formato macOS) y el icono template del tray.

Uso:  python tools/icons/make_icons.py        (requiere Pillow)
      npx tauri icon tools/icons/app-icon.png
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).parent
SS = 4  # supersampling para bordes suaves

logo = Image.open(HERE / "logo.png").convert("RGBA")


def app_icon():
    # Rejilla de macOS: lienzo 1024, placa de 824 centrada, radio ~185.
    size, plate, radius, logo_w = 1024, 824, 185, 500
    off = (size - plate) // 2
    big = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))

    # sombra suave bajo la placa, como los iconos del sistema
    shadow = Image.new("RGBA", big.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [off * SS, (off + 10) * SS, (off + plate) * SS, (off + plate + 10) * SS],
        radius * SS, fill=(0, 0, 0, 90))
    big = Image.alpha_composite(big, shadow.filter(ImageFilter.GaussianBlur(14 * SS)))

    # placa con degradado vertical oscuro neutro
    grad = Image.new("RGBA", (1, 256))
    for y in range(256):
        v = round(44 - 18 * y / 255)
        grad.putpixel((0, y), (v, v, v + 2, 255))
    grad = grad.resize((plate * SS, plate * SS), Image.BILINEAR)
    mask = Image.new("L", grad.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, plate * SS - 1, plate * SS - 1], radius * SS, fill=255)
    big.paste(grad, (off * SS, off * SS), mask)

    out = big.resize((size, size), Image.LANCZOS)
    mark = logo.resize((logo_w, logo_w), Image.LANCZOS)
    out.alpha_composite(mark, ((size - logo_w) // 2, (size - logo_w) // 2 + 6))
    out.save(HERE / "app-icon.png")


def tray_icon():
    # Template de macOS: solo cuenta el canal alfa (negro sobre transparente).
    # macOS escala el icono a la altura de la barra: el margen transparente
    # lo iguala en tamaño a los iconos del sistema.
    size, glyph = 64, 44
    alpha = Image.new("L", (size, size), 0)
    off = (size - glyph) // 2
    alpha.paste(logo.getchannel("A").resize((glyph, glyph), Image.LANCZOS), (off, off))
    tray = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tray.putalpha(alpha)
    tray.save(HERE.parent.parent / "src-tauri" / "icons" / "tray-template.png")


app_icon()
tray_icon()
