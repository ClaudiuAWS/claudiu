"""Regenerate the 5 cumulative-counter badges in First Strike's style.

The .jpg badges (Sharp Shooter, Safe Hands, The Wall, From the Spot,
Penalty Expert) shipped as busy shield illustrations with embedded
text and visible white backgrounds. Replace them with clean round
medals matching badge-striker-1.png (First Strike).

Pipeline per badge:
  1. Generate via Pollinations FLUX (image.pollinations.ai).
  2. Validate: HTTP 200, Content-Type image/*, magic bytes, > 5 KB.
  3. Retry with exponential backoff (3 attempts) on validation fail.
  4. Save to frontend/public/<id>.png.
  5. Run chromakey-badges.py-style post-process on the new PNG so
     the pure-white bg becomes transparent.

Usage:
    python scripts/regen-counter-badges.py
"""

from pathlib import Path
import time
import urllib.parse
import urllib.request
import sys

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "frontend" / "public"

COLOUR_DISTANCE_THRESHOLD = 80
LOW_SAT_MAX_DELTA = 30
ALPHA_BLUR_RADIUS = 1.2
MIN_BYTES = 5 * 1024
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


BADGES = [
    {
        "id":       "badge-striker-5",
        "tier":     "silver",
        "illust":   "a football striker mid-shot with three small stars trailing behind him, dynamic kicking motion",
        "seed":     201,
    },
    {
        "id":       "badge-goalkeeper-1",
        "tier":     "bronze",
        "illust":   "a goalkeeper crouched low with arms outstretched, ball just landing in their gloves",
        "seed":     202,
    },
    {
        "id":       "badge-goalkeeper-5",
        "tier":     "silver",
        "illust":   "a goalkeeper diving full-stretch across the frame, fingertips deflecting the ball",
        "seed":     203,
    },
    {
        "id":       "badge-penalty-1",
        "tier":     "bronze",
        "illust":   "a football resting on the penalty spot, faint goal frame silhouette behind",
        "seed":     204,
    },
    {
        "id":       "badge-penalty-5",
        "tier":     "silver",
        "illust":   "a football striker planting their foot beside the ball on the penalty spot, blurring forward motion",
        "seed":     205,
    },
]


def rim_colour(tier):
    return {
        "bronze": "copper-bronze metallic",
        "silver": "polished silver metallic",
        "gold":   "polished gold metallic",
    }.get(tier, "copper-bronze metallic")


def build_prompt(badge):
    rim = rim_colour(badge["tier"])
    illustration = badge["illust"]
    return (
        f"Circular cartoon medal badge, {rim} rim with polished highlight on the inside edge, "
        f"deep burgundy radial gradient interior fading to near-black at the centre, "
        f"a white silhouette illustration of {illustration} centred on the dark interior, "
        f"no text anywhere on the badge, isolated on a pure white background with a small margin "
        f"around the medal, flat vector illustration style, sharp clean edges, "
        f"the medal fully contained inside the square canvas."
    )


def fetch_with_retry(prompt, seed, max_attempts=3):
    """Hit Pollinations FLUX, validate the response, retry with backoff."""
    encoded = urllib.parse.quote(prompt, safe="")
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?seed={seed}&width=1024&height=1024&model=flux&nologo=true"
    )
    last_err = None
    for attempt in range(1, max_attempts + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                status = r.status
                ctype = r.headers.get("Content-Type", "")
                data = r.read()
            if status != 200:
                raise RuntimeError(f"HTTP {status}")
            if not ctype.startswith("image/"):
                raise RuntimeError(f"bad content-type {ctype!r}")
            if len(data) < MIN_BYTES:
                raise RuntimeError(f"too small ({len(data)} B)")
            # Magic bytes — accept PNG or JPEG (Pollinations sometimes
            # returns JPEG even when nominally PNG; we'll re-encode below).
            if not (data.startswith(PNG_MAGIC) or data[:3] == b"\xff\xd8\xff"):
                raise RuntimeError(f"bad magic bytes")
            return data
        except Exception as e:
            last_err = e
            wait = 1.5 ** attempt
            print(f"    attempt {attempt} failed: {e}; retrying in {wait:.1f}s",
                  file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"all {max_attempts} attempts failed: {last_err}")


def _perimeter_bg_ref(img):
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


def chromakey(img, bg_ref):
    w, h = img.size
    rgba = img.convert("RGBA")
    alpha = Image.new("L", (w, h), 255)
    rgba_px = rgba.load()
    alpha_px = alpha.load()
    br, bg, bb = bg_ref
    threshold_sq = COLOUR_DISTANCE_THRESHOLD * COLOUR_DISTANCE_THRESHOLD
    for y in range(h):
        for x in range(w):
            r, g, b, _ = rgba_px[x, y]
            dr = r - br
            dg = g - bg
            db = b - bb
            if (dr * dr + dg * dg + db * db) < threshold_sq:
                alpha_px[x, y] = 0
    alpha = alpha.filter(ImageFilter.GaussianBlur(ALPHA_BLUR_RADIUS))
    rgba.putalpha(alpha)
    return rgba


def main():
    import io
    ok = 0
    failed = 0
    for badge in BADGES:
        path = PUBLIC / f"{badge['id']}.png"
        try:
            prompt = build_prompt(badge)
            print(f"  Generating {badge['id']} (seed={badge['seed']}) ...")
            data = fetch_with_retry(prompt, badge["seed"])
            img = Image.open(io.BytesIO(data))
            bg = _perimeter_bg_ref(img)
            keyed = chromakey(img, bg)
            keyed.save(str(path), "PNG", optimize=True)
            ok += 1
            print(f"    ok  {path.name}  bg={bg}  size={path.stat().st_size} B")
        except Exception as e:
            failed += 1
            print(f"    FAIL {badge['id']}: {e}", file=sys.stderr)
    print(f"\nDone. ok={ok} failed={failed} total={len(BADGES)}.")


if __name__ == "__main__":
    main()
