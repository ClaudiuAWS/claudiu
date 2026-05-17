"""Repair the existing badge-*.png files by filling INTERIOR transparent holes.

Background:
  The previous chroma-key (scripts/chromakey-badges.py) set ANY near-white
  pixel to alpha=0 — including the white highlights baked into the
  metallic medal rims. The result: many badges show with massive voids
  where the rim should be.

Fix:
  PIL preserves RGB channels even on alpha=0 pixels, so we can recover
  the rim by walking the alpha channel from the four corners (BFS through
  alpha==0 cells). Any alpha==0 pixel NOT reached by that flood is
  "interior" — surrounded by opaque medal pixels on every side — and we
  set its alpha back to 255 while keeping its original RGB intact.

This is idempotent: running it twice on the same file is a no-op (no
new interior holes appear after the first pass).

Usage:
    python scripts/repair-badge-holes.py
"""
from __future__ import annotations

import glob
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "frontend" / "public"


def repair(img: Image.Image) -> tuple[Image.Image, int]:
    """Return (repaired_image, pixels_restored)."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()

    # is_transparent: row-major flat array — faster than list-of-lists for BFS.
    n = w * h
    is_t = bytearray(n)
    for y in range(h):
        row_off = y * w
        for x in range(w):
            if px[x, y][3] == 0:
                is_t[row_off + x] = 1

    visited = bytearray(n)
    q: deque[int] = deque()
    # Seed the BFS from the four corner pixels (only if they're transparent;
    # otherwise the bg keying didn't reach the corners and the file is fine).
    for cx, cy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        idx = cy * w + cx
        if is_t[idx]:
            q.append(idx)
            visited[idx] = 1
    # Also seed from a 1-pixel border ring so badges that the chroma-key
    # only edge-feathered (rather than corner-cleared) still drain properly.
    for x in range(w):
        for y in (0, h - 1):
            idx = y * w + x
            if is_t[idx] and not visited[idx]:
                q.append(idx)
                visited[idx] = 1
    for y in range(h):
        for x in (0, w - 1):
            idx = y * w + x
            if is_t[idx] and not visited[idx]:
                q.append(idx)
                visited[idx] = 1

    while q:
        idx = q.popleft()
        y, x = divmod(idx, w)
        # 4-neighbour traversal
        if x > 0:
            n_idx = idx - 1
            if is_t[n_idx] and not visited[n_idx]:
                visited[n_idx] = 1
                q.append(n_idx)
        if x < w - 1:
            n_idx = idx + 1
            if is_t[n_idx] and not visited[n_idx]:
                visited[n_idx] = 1
                q.append(n_idx)
        if y > 0:
            n_idx = idx - w
            if is_t[n_idx] and not visited[n_idx]:
                visited[n_idx] = 1
                q.append(n_idx)
        if y < h - 1:
            n_idx = idx + w
            if is_t[n_idx] and not visited[n_idx]:
                visited[n_idx] = 1
                q.append(n_idx)

    # Restore alpha on transparent-but-not-reached pixels (interior holes).
    restored = 0
    for y in range(h):
        row_off = y * w
        for x in range(w):
            idx = row_off + x
            if is_t[idx] and not visited[idx]:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 255)
                restored += 1
    return rgba, restored


def main() -> int:
    pattern = str(PUBLIC / "badge-*.png")
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"No badge PNGs at {pattern}", file=sys.stderr)
        return 1

    ok = 0
    skipped = 0
    for path in files:
        try:
            img = Image.open(path)
            keyed, restored = repair(img)
            if restored == 0:
                print(f"  -  {Path(path).name}  no interior holes")
                skipped += 1
                continue
            keyed.save(path, "PNG", optimize=True)
            pct = 100.0 * restored / (img.size[0] * img.size[1])
            print(f"  ok {Path(path).name}  restored {restored} px ({pct:.1f}% of canvas)")
            ok += 1
        except Exception as e:
            print(f"  FAIL {Path(path).name}: {e}", file=sys.stderr)
    print(f"\nDone. repaired={ok} unchanged={skipped} total={len(files)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
