"""Chroma-key every badge-*.png in frontend/public/ to drop the
pale/white corners that creep in from AI-image-gen artifacts.

Strategy (same one used for the BREZN-letter regen in earlier passes):
  1. Read 1-pixel strips around all four edges of the image.
  2. Filter to low-saturation pixels (max(R,G,B) - min(R,G,B) < 30) so
     a saturated medal rim that happens to touch a corner can't be
     picked as the bg reference. Take the median of the survivors.
  3. For every pixel in the image, compute Euclidean colour distance
     to the bg reference. If < 80, set alpha = 0.
  4. 1.2 px Gaussian-blur AA pass on the alpha channel so the cut
     edges aren't aliased.
  5. Save back as PNG with alpha. Idempotent — re-keying an already-
     transparent image is a no-op for the medal pixels (they're far
     from the bg reference) and a tiny smoothing of the alpha edge.

Usage:
    python scripts/chromakey-badges.py
"""

from pathlib import Path
import glob
import sys

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "frontend" / "public"
COLOUR_DISTANCE_THRESHOLD = 80
LOW_SAT_MAX_DELTA = 30
ALPHA_BLUR_RADIUS = 1.2


def _perimeter_bg_ref(img):
    """Return an (R, G, B) tuple representing the background colour at
    the image edges. Filters out saturated pixels so a medal rim that
    touches a corner can't be picked as the reference.
    """
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
        return (255, 255, 255)  # default to white if nothing qualifies
    samples.sort()
    return samples[len(samples) // 2]


def _chromakey(img, bg_ref):
    """Return a new RGBA image with bg-distance pixels set to alpha=0."""
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
    # Soft AA on the alpha edges
    alpha = alpha.filter(ImageFilter.GaussianBlur(ALPHA_BLUR_RADIUS))
    rgba.putalpha(alpha)
    return rgba


def main():
    pattern = str(PUBLIC / "badge-*.png")
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"No badge PNGs found at {pattern}", file=sys.stderr)
        sys.exit(1)
    ok = 0
    failed = 0
    for path in files:
        try:
            img = Image.open(path)
            bg = _perimeter_bg_ref(img)
            keyed = _chromakey(img, bg)
            keyed.save(path, "PNG", optimize=True)
            ok += 1
            # ASCII-only output so Windows charmap consoles don't error
            print(f"  ok  {Path(path).name}  bg={bg}")
        except Exception as e:
            failed += 1
            print(f"  FAIL {Path(path).name}: {e}", file=sys.stderr)
    print(f"\nDone. ok={ok} failed={failed} total={len(files)}.")


if __name__ == "__main__":
    main()
