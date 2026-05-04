#!/usr/bin/env python3
"""Build a manifest of pattern entries from tirazain.com/archive.

This script walks the public archive index (5 paginated HTML pages) and
extracts per-pattern metadata (name, region, slug, URL, etc.) into
`resources/tirazain/manifest.json`. It does NOT download any pattern files
— those live in linked Google Drive folders and are downloaded separately
(by hand or with `gdown`/`rclone`).

USAGE
    pip install requests beautifulsoup4
    python3 scripts/scrape_tirazain_index.py

CONFIGURATION
    Set USER_AGENT below to something identifying YOU (your email, your
    project URL — anything a site admin can use to contact you if there's
    a problem). Anonymous scraping is impolite even when not blocked.

    Tirazain's robots.txt disallows specific AI bots (anthropic-ai,
    ClaudeBot, etc.) but does not block general non-AI crawlers. Running
    this script as a human, identifying yourself, with reasonable rate
    limits, is consistent with how the site is meant to be navigated.
    If you'd rather have explicit permission, email the site owner.

WHAT IT DOES
    1. Fetches archive pages 1..5 (URLs follow Squarespace's
       `?offset=` pagination convention).
    2. Parses each pattern card on the page. The exact CSS selectors
       depend on the Squarespace template; the script tries a few
       common shapes and prints diagnostic messages if it can't find
       cards. Adjust SELECTORS below if needed.
    3. For each card, optionally also fetches the detail page to extract
       region / arabicName / colors / stitch count / Drive folder URL.
       This is the slow part — controlled by FETCH_DETAILS.
    4. Writes the manifest to resources/tirazain/manifest.json.

The script is RESUMABLE: if the manifest already exists, it merges new
entries in. Re-running is cheap (5 index pages) but reading detail pages
hits ~1000 URLs, so it's polite to keep DELAY_DETAILS conservative.
"""

import json
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

# Third-party — install with: pip install requests beautifulsoup4
try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Missing dependencies. Run: pip install requests beautifulsoup4")
    sys.exit(1)

# ---------- Configuration ----------

BASE = "https://tirazain.com"
ARCHIVE = f"{BASE}/archive"
PAGES = [
    ARCHIVE,
    f"{ARCHIVE}?offset=201",
    f"{ARCHIVE}?offset=401",
    f"{ARCHIVE}?offset=601",
    f"{ARCHIVE}?offset=801",
]

# IMPORTANT: change this to identify YOURSELF. Including an email or a
# project URL is the polite minimum.
USER_AGENT = (
    "TatreezPlannerImporter/0.1 "
    "(+https://github.com/yourname/tatreez; muad.abdelhay@gmail.com)"
)

# Seconds between requests. 1.5s is conservative; tune if you want to be
# faster, but don't be aggressive.
DELAY_INDEX = 1.5
DELAY_DETAILS = 1.5

# Set False to only collect URLs/names from the index pages (fast).
# Set True to also fetch each detail page for full metadata (~1000 hits).
FETCH_DETAILS = True

# Where the manifest lives (relative to project root).
MANIFEST_PATH = Path("resources/tirazain/manifest.json")

# CSS selector candidates. Squarespace templates vary; the first one that
# returns >0 elements wins. Edit if your inspection shows a different shape.
INDEX_CARD_SELECTORS = [
    "a.summary-title-link",       # Squarespace summary-block items
    "a[href^='/archive/p/']",     # generic fallback
]

# ---------- Implementation ----------

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})


def fetch(url: str) -> str:
    """GET a URL with retry on transient errors."""
    for attempt in range(3):
        try:
            r = session.get(url, timeout=30)
            r.raise_for_status()
            return r.text
        except requests.RequestException as e:
            if attempt == 2:
                raise
            wait = 5 * (attempt + 1)
            print(f"  retry {attempt + 1}/3 after {wait}s: {e}", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("unreachable")


def slug_from_url(url: str) -> str:
    """Extract the slug from /archive/p/<slug> URLs."""
    parts = url.split("/archive/p/", 1)
    if len(parts) != 2:
        return ""
    return parts[1].split("?")[0].split("#")[0].strip("/")


def parse_index_page(html: str, page_url: str) -> list[dict[str, Any]]:
    """Extract pattern cards from one archive page."""
    soup = BeautifulSoup(html, "html.parser")
    cards: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    for selector in INDEX_CARD_SELECTORS:
        anchors = soup.select(selector)
        if not anchors:
            continue
        for a in anchors:
            href_raw = a.get("href")
            href = href_raw if isinstance(href_raw, str) else None
            if not href or "/archive/p/" not in href:
                continue
            full = urljoin(page_url, href)
            if full in seen_urls:
                continue
            seen_urls.add(full)
            slug = slug_from_url(full)
            if not slug:
                continue
            name = a.get_text(strip=True) or slug
            cards.append({"slug": slug, "name": name, "url": full})
        if cards:
            return cards

    print(
        f"  WARN: no pattern cards found on {page_url} — "
        f"selectors {INDEX_CARD_SELECTORS} all returned 0 elements. "
        f"Inspect the page in a browser and update INDEX_CARD_SELECTORS.",
        file=sys.stderr,
    )
    return []


def parse_detail_page(html: str, _slug: str) -> dict[str, Any]:
    """Extract metadata from one /archive/p/<slug> page.

    Tirazain detail pages typically include:
      - product title (the canonical name)
      - region tag (Ramallah, Hebron, Gaza, Jerusalem, ...)
      - color count
      - stitch count
      - "Download Files" link to a Google Drive folder
      - Arabic name (sometimes in the description body)

    We do best-effort extraction — these fields are nice-to-have, the
    URL alone is enough to make the manifest useful.
    """
    soup = BeautifulSoup(html, "html.parser")
    out: dict[str, Any] = {}

    # Title — try Squarespace product title first
    title = soup.select_one("h1.ProductItem-details-title, h1.product-title, h1")
    if title:
        out["name"] = title.get_text(strip=True)

    # Drive folder link
    for a in soup.select("a[href*='drive.google.com']"):
        href_raw = a.get("href", "")
        href = href_raw if isinstance(href_raw, str) else ""
        if "/folders/" in href:
            out["driveUrl"] = href.split("?")[0]
            break

    # Body text — scan for region/arabic/colors/stitches via heuristics
    body_text = soup.get_text(" ", strip=True)
    import re

    # Region: look for explicit "Region:" or known region words
    m = re.search(r"Region\s*[:\-]\s*([A-Za-z][A-Za-z ]{2,30})", body_text)
    if m:
        out["region"] = m.group(1).strip()
    else:
        for region in (
            "Ramallah", "Hebron", "Gaza", "Jerusalem", "Bethlehem",
            "Jaffa", "Nazareth", "Nablus", "Galilee",
        ):
            if region in body_text:
                out["region"] = region
                break

    # Arabic name: any RTL-script substring of length 2..40
    rtl = re.findall(r"[؀-ۿ][؀-ۿ ]{1,40}", body_text)
    if rtl:
        # Pick the shortest (most likely to be just the name, not a paragraph)
        candidate = min(rtl, key=len).strip()
        if 2 <= len(candidate) <= 40:
            out["arabicName"] = candidate

    # Colors / stitches
    m = re.search(r"(\d+)\s+colors?", body_text, re.I)
    if m:
        out["colors"] = int(m.group(1))
    m = re.search(r"([\d,]+)\s+stitches?", body_text, re.I)
    if m:
        out["stitchCount"] = int(m.group(1).replace(",", ""))

    return out


def main() -> None:
    project_root = Path(__file__).resolve().parent.parent
    manifest_path = project_root / MANIFEST_PATH
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    # Load existing manifest so we can merge / resume
    existing: dict[str, dict[str, Any]] = {}
    if manifest_path.exists():
        try:
            for entry in json.loads(manifest_path.read_text()):
                if entry.get("slug"):
                    existing[entry["slug"]] = entry
            print(f"Loaded {len(existing)} existing entries from {manifest_path}")
        except json.JSONDecodeError:
            print(f"WARN: existing manifest is not valid JSON, starting fresh")

    # Stage 1 — index pass
    all_cards: list[dict[str, Any]] = []
    for i, page in enumerate(PAGES, start=1):
        print(f"[{i}/{len(PAGES)}] fetching {page}")
        html = fetch(page)
        cards = parse_index_page(html, page)
        print(f"  found {len(cards)} cards")
        all_cards.extend(cards)
        time.sleep(DELAY_INDEX)

    # Deduplicate (same pattern can appear on multiple offset pages if
    # the offset boundaries shift between requests).
    by_slug: dict[str, dict[str, Any]] = {}
    for c in all_cards:
        by_slug.setdefault(c["slug"], c)
    print(f"\nIndex pass found {len(by_slug)} unique patterns")

    # Stage 2 — detail pages (optional)
    if FETCH_DETAILS:
        new_slugs = [s for s in by_slug if s not in existing or "driveUrl" not in existing.get(s, {})]
        print(f"\nFetching detail pages for {len(new_slugs)} patterns…")
        for i, slug in enumerate(new_slugs, start=1):
            url = by_slug[slug]["url"]
            print(f"  [{i}/{len(new_slugs)}] {slug}")
            try:
                html = fetch(url)
                details = parse_detail_page(html, slug)
                by_slug[slug].update(details)
            except requests.RequestException as e:
                print(f"    failed: {e}", file=sys.stderr)
            time.sleep(DELAY_DETAILS)

    # Merge with existing entries (existing data wins for fields we can't
    # rediscover, e.g. manual corrections)
    for slug, data in by_slug.items():
        if slug in existing:
            merged = {**data, **existing[slug]}
            existing[slug] = merged
        else:
            existing[slug] = data

    # Sort entries by slug for deterministic output
    out_list = sorted(existing.values(), key=lambda e: e.get("slug", ""))
    manifest_path.write_text(json.dumps(out_list, indent=2, ensure_ascii=False) + "\n")
    print(f"\nWrote {manifest_path} with {len(out_list)} entries")


if __name__ == "__main__":
    main()
