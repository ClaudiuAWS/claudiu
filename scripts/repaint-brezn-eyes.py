"""Repaint Brezn Agent eyes on the existing PNG with the updated draw_eyes
constants. Reuses the chroma-keyed pretzel body — no Pollinations call.

The new eye radius (60) fully contains the old (38) at the same centres, so
the smaller existing eye is completely overwritten by the bigger new eye.
No alpha erasure needed.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "frontend" / "public" / "brezn-agent.png"

EYE_RADIUS       = 60
EYE_OUTLINE_W    = 3
EYE_OUTLINE      = (26, 10, 5, 255)
SCLERA           = (255, 255, 255, 255)
PUPIL_RADIUS     = 26
PUPIL            = (26, 10, 5, 255)
HIGHLIGHT_RADIUS = 10
HIGHLIGHT        = (255, 255, 255, 255)
LEFT_EYE_CENTER  = (277, 274)
RIGHT_EYE_CENTER = (500, 228)

img = Image.open(OUT_PATH).convert("RGBA")
draw = ImageDraw.Draw(img)
for cx, cy in (LEFT_EYE_CENTER, RIGHT_EYE_CENTER):
    draw.ellipse(
        [(cx - EYE_RADIUS, cy - EYE_RADIUS), (cx + EYE_RADIUS, cy + EYE_RADIUS)],
        fill=SCLERA, outline=EYE_OUTLINE, width=EYE_OUTLINE_W,
    )
    pcx, pcy = cx + 8, cy + 10
    draw.ellipse(
        [(pcx - PUPIL_RADIUS, pcy - PUPIL_RADIUS), (pcx + PUPIL_RADIUS, pcy + PUPIL_RADIUS)],
        fill=PUPIL,
    )
    hcx, hcy = pcx - 8, pcy - 8
    draw.ellipse(
        [(hcx - HIGHLIGHT_RADIUS, hcy - HIGHLIGHT_RADIUS),
         (hcx + HIGHLIGHT_RADIUS, hcy + HIGHLIGHT_RADIUS)],
        fill=HIGHLIGHT,
    )

img.save(OUT_PATH, "PNG", optimize=True)
print(f"Repainted eyes on {OUT_PATH} ({OUT_PATH.stat().st_size} B)")
