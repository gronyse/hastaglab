#!/usr/bin/env python3
from PIL import Image
from pathlib import Path

ASSETS_DIR = Path(__file__).resolve().parent
SRC_NAME = "android-icon-foreground.png"
OUT_NAMES = ["android-icon-foreground.png", "icon.png", "splash-icon.png"]
SCALE = 0.7

# Fixed blue color (robot body)
FIXED_BLUE_HEX = "#4A90E2"


def hex_to_rgba(hexstr):
    hexstr = hexstr.lstrip('#')
    lv = len(hexstr)
    if lv == 6:
        r = int(hexstr[0:2], 16)
        g = int(hexstr[2:4], 16)
        b = int(hexstr[4:6], 16)
        return (r, g, b, 255)
    raise ValueError("Unsupported hex color")


def main():
    src_path = ASSETS_DIR / SRC_NAME
    if not src_path.exists():
        print(f"Error: source file not found: {src_path}")
        return 2

    img = Image.open(src_path).convert("RGBA")
    w, h = img.size

    # Resize to 70%
    sw, sh = int(round(w * SCALE)), int(round(h * SCALE))
    resized = img.resize((sw, sh), resample=Image.LANCZOS)

    # Use fixed blue color instead of extracting from pixel
    bg_color = hex_to_rgba(FIXED_BLUE_HEX)

    # Create new image same size, filled with bg_color
    new = Image.new("RGBA", (w, h), bg_color)

    # Paste resized image centered
    pos = ((w - sw) // 2, (h - sh) // 2)
    new.paste(resized, pos, resized)

    # Save to output names (overwrite)
    for name in OUT_NAMES:
        out_path = ASSETS_DIR / name
        # Preserve metadata by saving PNG
        new.save(out_path, format="PNG")

    print("Success: updated files:\n  " + "\n  ".join(str(ASSETS_DIR / n) for n in OUT_NAMES))
    return 0

if __name__ == '__main__':
    import sys
    try:
        exit_code = main()
    except Exception as e:
        print("Error during processing:", e)
        exit_code = 1
    sys.exit(exit_code)
