"""Generate the Brezn Agent mascot — cartoon pretzel with eyes + hands.

Pipeline (same hardening as the badge-regen script):
  1. Hit Pollinations FLUX with the prompt at fixed seeds; on each attempt
     verify HTTP 200, Content-Type image/*, PNG/JPEG magic bytes, and a
     minimum file size (> 5 KB). Retry with exponential backoff.
  2. Save the raw image to frontend/public/brezn-agent-raw.png.
  3. Chroma-key the background using perimeter-median sampling + colour
     distance threshold, then a soft Gaussian-blur AA pass on the alpha.
  4. Save the final transparent PNG to frontend/public/brezn-agent.png and
     delete the raw intermediate.

Usage:
    python scripts/generate-brezn-agent.py
"""
from __future__ import annotations

import io
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "frontend" / "public" / "brezn-agent.png"

PROMPT = (
    "A friendly cartoon mascot of a traditional Bavarian pretzel, drawn with "
    "the EXACT anatomy of a classic German pretzel knot. SHAPE: the pretzel "
    "rope forms a HEART-SHAPED silhouette with TWO LARGE UPPER LOOPS — one "
    "on the LEFT, one on the RIGHT — each curving outward from the top, "
    "then inward toward the centre. The two rope ends come down from the "
    "upper loops, CROSS OVER EACH OTHER TWICE in the centre to form a small "
    "X-shaped knot. After the double crossing, the two rope ends angle "
    "OUTWARD AND DOWN, terminating in TWO SLIGHTLY ROUNDED TAIL TIPS at the "
    "bottom-left and bottom-right of the figure. OPENINGS: there must be "
    "THREE clearly visible openings in the silhouette — a large upper-LEFT "
    "loop, a large upper-RIGHT loop, and a SMALL DIAMOND-SHAPED opening in "
    "the very centre where the rope crosses itself. COLOR: warm orange-brown "
    "baked-bread body, bold DARK-BROWN comic-book outline around every edge "
    "of the rope, darker brown shadow tones along the bottom of each rope "
    "segment, lighter golden highlights along the top. TEXTURE: WHITE SALT "
    "CRYSTALS shaped like small white teardrops or seeds, sprinkled "
    "generously across the surface. CHARACTER: two large round cartoon eyes "
    "peeking out from the two UPPER LOOPS — one eye centered inside the "
    "LEFT upper loop's opening, one eye centered inside the RIGHT upper "
    "loop's opening. A small smiling mouth at the bottom centre of the "
    "figure, between the two tail tips. STYLE: pure white background, "
    "generous margin around the pretzel, square 1:1 image, centred, facing "
    "forward, funny kid-cartoon sticker style, NOT photorealistic, NOT "
    "abstract."
)

SEEDS = [635, 642, 651, 663, 670]  # second retry — first batch missed the X-knot + eyes
MIN_BYTES = 5000
COLOUR_DISTANCE_THRESHOLD = 80
LOW_SAT_MAX_DELTA = 30
ALPHA_BLUR_RADIUS = 1.2


def _is_valid_image(data: bytes, content_type: str) -> tuple[bool, str]:
    if not content_type.startswith("image/"):
        return False, f"bad content-type: {content_type}"
    if len(data) < MIN_BYTES:
        return False, f"too small: {len(data)} bytes"
    # PNG magic
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return True, "png"
    # JPEG magic
    if data[:3] == b"\xff\xd8\xff":
        return True, "jpeg"
    return False, f"bad magic: {data[:8]!r}"


def fetch_with_retry() -> bytes:
    """Try each seed in sequence with exponential backoff. Raises on total failure."""
    encoded = urllib.parse.quote(PROMPT, safe="")
    last_err = "no attempt yet"
    for attempt, seed in enumerate(SEEDS):
        url = (
            f"https://image.pollinations.ai/prompt/{encoded}"
            f"?seed={seed}&width=1024&height=1024&model=flux&nologo=true"
        )
        try:
            print(f"  attempt {attempt + 1}/{len(SEEDS)} (seed={seed}) ... ", end="", flush=True)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                content_type = resp.headers.get("Content-Type", "")
                data = resp.read()
            ok, why = _is_valid_image(data, content_type)
            if ok:
                print(f"ok  {len(data)} B ({why})")
                return data
            print(f"FAIL {why}")
            last_err = why
        except Exception as e:
            print(f"FAIL {e}")
            last_err = str(e)
        # Exponential backoff: 1.5^attempt
        time.sleep(1.5 ** (attempt + 1))
    raise RuntimeError(f"All {len(SEEDS)} attempts failed. Last error: {last_err}")


def _perimeter_bg_ref(img: Image.Image) -> tuple[int, int, int]:
    """Median of low-saturation perimeter pixels — same as chromakey-badges.py."""
    w, h = img.size
    px = img.load()
    samples = []
    for x in range(w):
        for y in (0, h - 1):
            r, g, b = px[x, y][:3]
            if max(r, g, b) - min(r, g, b) < LOW_SAT_MAX_DELTA:
                samples.append((r, g, b))
    for y in range(h):
        for x in (0, w - 1):
            r, g, b = px[x, y][:3]
            if max(r, g, b) - min(r, g, b) < LOW_SAT_MAX_DELTA:
                samples.append((r, g, b))
    if not samples:
        return (255, 255, 255)
    samples.sort()
    return samples[len(samples) // 2]


def chromakey(img: Image.Image) -> Image.Image:
    """Set pixels within distance THRESHOLD of the bg reference to alpha 0."""
    bg = _perimeter_bg_ref(img)
    print(f"  bg sampled: {bg}")
    w, h = img.size
    rgba = img.convert("RGBA")
    alpha = Image.new("L", (w, h), 255)
    rgba_px = rgba.load()
    alpha_px = alpha.load()
    br, bgc, bb = bg
    threshold_sq = COLOUR_DISTANCE_THRESHOLD * COLOUR_DISTANCE_THRESHOLD
    for y in range(h):
        for x in range(w):
            r, g, b, _ = rgba_px[x, y]
            dr = r - br
            dg = g - bgc
            db = b - bb
            if (dr * dr + dg * dg + db * db) < threshold_sq:
                alpha_px[x, y] = 0
    alpha = alpha.filter(ImageFilter.GaussianBlur(ALPHA_BLUR_RADIUS))
    rgba.putalpha(alpha)
    return rgba


def main() -> int:
    print("Generating Brezn Agent mascot ...")
    try:
        data = fetch_with_retry()
    except Exception as e:
        print(f"FATAL: {e}", file=sys.stderr)
        return 1

    print("Chroma-keying background ...")
    img = Image.open(io.BytesIO(data))
    keyed = chromakey(img)

    print("Painting eyes ...")
    keyed = draw_eyes(keyed)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    keyed.save(OUT_PATH, "PNG", optimize=True)
    print(f"Saved: {OUT_PATH}  ({OUT_PATH.stat().st_size} B)")
    return 0


# ─── Eye-painting step ───────────────────────────────────────────────────
# Pollinations FLUX traded "eyes" for "shape accuracy" when given an
# anatomy-heavy prompt — it skipped the cartoon-eye instructions. So we
# paint the eyes deterministically via PIL AFTER chroma-key (which turns
# the white bg + interior of the upper loops transparent). The eyes
# survive because they're drawn at alpha=255 over the transparent
# regions and no second chroma-key pass runs.
#
# Coordinates are tuned for the current seed-635 pretzel (768x768). If
# we regen with a different seed, the loop positions shift and these
# need re-tuning. The alpha-channel analysis snippet that found these
# values lives in the commit history.

EYE_RADIUS       = 38
EYE_OUTLINE_W    = 3
EYE_OUTLINE      = (26, 10, 5, 255)    # dark brown matching the pretzel edge
SCLERA           = (255, 255, 255, 255)
PUPIL_RADIUS     = 16
PUPIL            = (26, 10, 5, 255)
HIGHLIGHT_RADIUS = 6
HIGHLIGHT        = (255, 255, 255, 255)

LEFT_EYE_CENTER  = (277, 274)
RIGHT_EYE_CENTER = (500, 228)


def draw_eyes(img: Image.Image) -> Image.Image:
    """Paint two cartoon eyes inside the upper loops of the pretzel."""
    out = img.convert("RGBA").copy()
    draw = ImageDraw.Draw(out)
    for cx, cy in (LEFT_EYE_CENTER, RIGHT_EYE_CENTER):
        # Sclera (white round with dark outline)
        draw.ellipse(
            [(cx - EYE_RADIUS, cy - EYE_RADIUS), (cx + EYE_RADIUS, cy + EYE_RADIUS)],
            fill=SCLERA, outline=EYE_OUTLINE, width=EYE_OUTLINE_W,
        )
        # Pupil slightly down-right of centre for a "looking forward" feel
        pcx, pcy = cx + 5, cy + 6
        draw.ellipse(
            [(pcx - PUPIL_RADIUS, pcy - PUPIL_RADIUS), (pcx + PUPIL_RADIUS, pcy + PUPIL_RADIUS)],
            fill=PUPIL,
        )
        # Highlight dot upper-left of pupil — cartoon polish
        hcx, hcy = pcx - 5, pcy - 5
        draw.ellipse(
            [(hcx - HIGHLIGHT_RADIUS, hcy - HIGHLIGHT_RADIUS),
             (hcx + HIGHLIGHT_RADIUS, hcy + HIGHLIGHT_RADIUS)],
            fill=HIGHLIGHT,
        )
    return out


if __name__ == "__main__":
    raise SystemExit(main())
