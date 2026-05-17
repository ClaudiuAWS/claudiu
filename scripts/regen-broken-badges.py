"""Regenerate the 14 badge PNGs whose metallic rims were destroyed by the
prior chroma-key. Uses Pollinations FLUX for fresh artwork + an
edge-connected chroma-key (BFS from corners only) so interior white
highlights stay opaque this time.

Why a new script instead of editing chromakey-badges.py:
  The old chromakey-badges.py keys ALL near-bg pixels (including those
  inside the medal) which is what caused the rim damage. The edge-flood
  approach here ONLY keys pixels reachable from the four image corners
  via background-coloured cells — interior rim highlights stay intact.

Operates over a curated list (the 14 badges that audit identified as
<30% opaque). The other 19 OK badges are left alone so the user-approved
First Strike / Sharp Shooter / etc. aesthetic isn't accidentally
disturbed.

Usage:
    python scripts/regen-broken-badges.py
"""
from __future__ import annotations

import io
import sys
import time
import urllib.parse
import urllib.request
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "frontend" / "public"

MIN_BYTES = 5 * 1024
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
COLOUR_DISTANCE_THRESHOLD = 80
LOW_SAT_MAX_DELTA = 30
ALPHA_BLUR_RADIUS = 1.2

# Per-badge silhouettes + tier + seed. Seeds 300-313 are unused above, so a
# re-run gets a fresh roll without colliding with prior batches.
BADGES = [
    {"id": "reflex_master",   "tier": "gold",   "seed": 300,
     "illust": "a lightning bolt striking a goalkeeper's outstretched glove"},
    {"id": "first_win",       "tier": "bronze", "seed": 301,
     "illust": "a tall trophy with rays of light radiating behind it"},
    {"id": "team_builder",    "tier": "bronze", "seed": 302,
     "illust": "three football players standing shoulder-to-shoulder in formation"},
    {"id": "comeback_win",    "tier": "silver", "seed": 303,
     "illust": "a phoenix rising from flames with wings spread wide"},
    {"id": "weekend_warrior", "tier": "silver", "seed": 304,
     "illust": "a wall calendar with Saturday and Sunday squares highlighted, a small football overlay"},
    {"id": "late_winner",     "tier": "gold",   "seed": 305,
     "illust": "a stadium clock showing 89 minutes and a football crossing the goal line"},
    {"id": "comeback_goal",   "tier": "silver", "seed": 306,
     "illust": "a football breaking through a wall of defenders"},
    {"id": "win_streak_3",    "tier": "silver", "seed": 307,
     "illust": "three medal stars connected in a row above a crown"},
    {"id": "veteran_10",      "tier": "gold",   "seed": 308,
     "illust": "a large Roman numeral X with crossed footballs behind it"},
    {"id": "win_streak_5",    "tier": "gold",   "seed": 309,
     "illust": "a laurel wreath surrounding the numeral 5"},
    {"id": "goalkeeper_5",    "tier": "silver", "seed": 310,
     "illust": "a fortress wall made of five goalkeeper gloves stacked together"},
    {"id": "quiz_perfect_5",  "tier": "gold",   "seed": 311,
     "illust": "a graduation cap with a question mark sash and the numeral 5"},
    {"id": "veteran_50",      "tier": "gold",   "seed": 312,
     "illust": "a large Roman numeral L with a laurel wreath surrounding it"},
    {"id": "keeper_hero",     "tier": "silver", "seed": 313,
     "illust": "a goalkeeper in a dramatic diving save pose with arms outstretched"},
]


def rim_colour(tier: str) -> str:
    return {
        "bronze": "copper-bronze metallic polished",
        "silver": "polished silver metallic",
        "gold":   "polished gold metallic",
    }.get(tier, "copper-bronze metallic polished")


def build_prompt(badge: dict) -> str:
    rim = rim_colour(badge["tier"])
    illust = badge["illust"]
    return (
        f"Circular cartoon medal badge, {rim} rim with polished highlight on the inside edge, "
        f"deep burgundy radial gradient interior fading to near-black at the centre, "
        f"a white silhouette illustration of {illust} centred on the dark interior, "
        f"no text anywhere on the badge, isolated on a pure white background with a small margin "
        f"around the medal, flat vector illustration style, sharp clean edges, "
        f"the medal fully contained inside the square canvas."
    )


def fetch_with_retry(prompt: str, seed: int, max_attempts: int = 3) -> bytes:
    encoded = urllib.parse.quote(prompt, safe="")
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?seed={seed}&width=1024&height=1024&model=flux&nologo=true"
    )
    last_err: Exception | str = "no attempts yet"
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
            if not (data.startswith(PNG_MAGIC) or data[:3] == b"\xff\xd8\xff"):
                raise RuntimeError("bad magic bytes")
            return data
        except Exception as e:
            last_err = e
            wait = 1.5 ** attempt
            print(f"    attempt {attempt} failed: {e}; retrying in {wait:.1f}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"all {max_attempts} attempts failed: {last_err}")


def _perimeter_bg_ref(img: Image.Image) -> tuple[int, int, int]:
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


def edge_chromakey(img: Image.Image) -> tuple[Image.Image, tuple[int, int, int]]:
    """Edge-connected chroma-key: BFS from corners through near-bg pixels.
    Only pixels REACHABLE from the four image corners via near-bg cells get
    alpha=0. Interior near-white pixels (rim highlights, salt specks)
    stay opaque.
    """
    rgba = img.convert("RGBA")
    w, h = rgba.size
    bg = _perimeter_bg_ref(rgba)
    br, bgc, bb = bg
    threshold_sq = COLOUR_DISTANCE_THRESHOLD * COLOUR_DISTANCE_THRESHOLD

    # First pass — build is_bg mask: True where pixel colour is within
    # distance of the bg reference. Stored as a flat bytearray for speed.
    rgba_px = rgba.load()
    n = w * h
    is_bg = bytearray(n)
    for y in range(h):
        row_off = y * w
        for x in range(w):
            r, g, b, _ = rgba_px[x, y]
            dr = r - br
            dg = g - bgc
            db = b - bb
            if (dr * dr + dg * dg + db * db) < threshold_sq:
                is_bg[row_off + x] = 1

    # Second pass — BFS-flood from all four corners + the 1-pixel border
    # ring through cells where is_bg is True. Visited cells become alpha=0.
    visited = bytearray(n)
    q: deque[int] = deque()
    # Seed from full border so any chroma-keyable bg pixel touching the
    # edge starts the flood — robust against tiny "leak" gaps in the
    # corners themselves.
    for x in range(w):
        for y in (0, h - 1):
            idx = y * w + x
            if is_bg[idx] and not visited[idx]:
                visited[idx] = 1
                q.append(idx)
    for y in range(h):
        for x in (0, w - 1):
            idx = y * w + x
            if is_bg[idx] and not visited[idx]:
                visited[idx] = 1
                q.append(idx)

    while q:
        idx = q.popleft()
        y, x = divmod(idx, w)
        if x > 0:
            n_idx = idx - 1
            if is_bg[n_idx] and not visited[n_idx]:
                visited[n_idx] = 1
                q.append(n_idx)
        if x < w - 1:
            n_idx = idx + 1
            if is_bg[n_idx] and not visited[n_idx]:
                visited[n_idx] = 1
                q.append(n_idx)
        if y > 0:
            n_idx = idx - w
            if is_bg[n_idx] and not visited[n_idx]:
                visited[n_idx] = 1
                q.append(n_idx)
        if y < h - 1:
            n_idx = idx + w
            if is_bg[n_idx] and not visited[n_idx]:
                visited[n_idx] = 1
                q.append(n_idx)

    # Build the alpha mask: 0 where visited (edge-reachable bg), 255 elsewhere.
    alpha = Image.new("L", (w, h), 255)
    alpha_px = alpha.load()
    for y in range(h):
        row_off = y * w
        for x in range(w):
            if visited[row_off + x]:
                alpha_px[x, y] = 0
    # Soft AA on the alpha edges
    alpha = alpha.filter(ImageFilter.GaussianBlur(ALPHA_BLUR_RADIUS))
    rgba.putalpha(alpha)
    return rgba, bg


def main() -> int:
    ok = 0
    failed = 0
    for badge in BADGES:
        out_path = PUBLIC / f"badge-{badge['id'].replace('_', '-')}.png"
        try:
            prompt = build_prompt(badge)
            print(f"  Generating {badge['id']} (seed={badge['seed']}) ...")
            data = fetch_with_retry(prompt, badge["seed"])
            img = Image.open(io.BytesIO(data))
            keyed, bg = edge_chromakey(img)
            keyed.save(str(out_path), "PNG", optimize=True)
            size_b = out_path.stat().st_size
            print(f"    ok  {out_path.name}  bg={bg}  size={size_b} B")
            ok += 1
        except Exception as e:
            print(f"    FAIL {badge['id']}: {e}", file=sys.stderr)
            failed += 1
    print(f"\nDone. ok={ok} failed={failed} total={len(BADGES)}.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
