import os
import time
import requests
from boto3 import Session
from constants import AWS_REGION, CLOUDFRONT_DOMAIN

S3_BUCKET = "claudiu-frontend"
S3_PREFIX = "players"

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.sofascore.com/",
    "Origin": "https://www.sofascore.com",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "same-site",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Connection": "keep-alive",
}


def _make_http_session():
    """Warm up a requests session with sofascore.com cookies."""
    s = requests.Session()
    s.headers.update(_HEADERS)
    try:
        s.get("https://www.sofascore.com/", timeout=15)
        time.sleep(0.3)
    except Exception:
        pass
    return s


def upload_player_images(players: dict) -> None:
    """
    Download each player's photo from SofaScore img CDN and upload to S3.
    Updates player['imageUrl'] in-place to the CloudFront URL.
    Players with imageUrl=None are left unchanged (number circle fallback).
    """
    _profile = os.environ.get("AWS_PROFILE") or "hackathon"
    boto_session = Session(profile_name=_profile, region_name=AWS_REGION)
    s3 = boto_session.client("s3")
    http = _make_http_session()

    uploaded = 0
    skipped = 0
    failed = 0

    for player_id, player in players.items():
        src_url = player.get("imageUrl")
        if not src_url:
            skipped += 1
            continue

        s3_key = f"{S3_PREFIX}/{player_id}.jpg"
        cf_url = f"https://{CLOUDFRONT_DOMAIN}/{s3_key}"

        # Skip download if already in S3 — makes the script idempotent
        try:
            s3.head_object(Bucket=S3_BUCKET, Key=s3_key)
            player["imageUrl"] = cf_url
            skipped += 1
            continue
        except Exception:
            pass  # Not in S3 yet — fall through to download

        try:
            resp = http.get(src_url, timeout=10)
            resp.raise_for_status()
            s3.put_object(
                Bucket=S3_BUCKET,
                Key=s3_key,
                Body=resp.content,
                ContentType="image/jpeg",
                CacheControl="max-age=31536000",
            )
            player["imageUrl"] = cf_url
            uploaded += 1
        except Exception:
            # Keep original src_url — browser <img> tags can load it directly
            # even when server-side download is blocked (no CORS enforcement on img).
            failed += 1

    if failed:
        print(f"  [WARN] {failed} images not cached to S3 (SofaScore blocks server-side; browser will load them directly)")
    print(f"  [OK] {uploaded} uploaded, {skipped} already in S3, {len([p for p in players.values() if not p.get('imageUrl')])} no photo")
