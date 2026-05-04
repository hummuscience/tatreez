#!/usr/bin/env python3
"""Download pattern files from the Drive folders linked in the manifest.

Reads `resources/tirazain/manifest.json` (built by
`scrape_tirazain_index.py`), and for each entry with a `driveUrl`, uses
`rclone` to fetch the contents of the Google Drive folder into
`resources/tirazain/<slug>/`.

By default this filters to `.oxs` + `.png` files only — the planner
doesn't use the machine embroidery formats (`.dst`, `.pes`, `.pcs`,
`.pdf`, `.chart`). Toggle ALL_FORMATS below if you want everything.

USAGE
    # One-time setup (see RCLONE_SETUP.md or my earlier walkthrough):
    rclone config        # create a remote named "gdrive" with Drive scope

    python3 scripts/download_tirazain_files.py

The script is RESUMABLE: it skips slugs whose folder already contains
`pattern.oxs`. Re-run after a network failure or after adding more
entries to the manifest.

Why rclone instead of gdown:
  - Drive's "viewer" links don't always work with gdown.
  - rclone respects Drive API quotas more gracefully.
  - --tpslimit gives us deterministic rate limiting.
"""

import json
import re
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Optional, Tuple

# ---------- Configuration ----------

MANIFEST_PATH = Path("resources/tirazain/manifest.json")
ARCHIVE_DIR = Path("resources/tirazain")

# rclone remote name (matches what you typed for `name>` in `rclone config`).
RCLONE_REMOTE = "gdrive"

# File extensions to keep. The planner only uses .oxs (chart data) and
# .png (preview thumbnail). Set ALL_FORMATS=True to skip filtering.
KEEP_EXTENSIONS = {".oxs", ".png"}
ALL_FORMATS = False

# Seconds between folder downloads. Drive's per-user quota is generous
# (~1000 reqs/100s); the per-folder rclone startup cost dwarfs this delay.
# 0.5s is courteous without dragging out a 1000-pattern run.
DELAY_BETWEEN_FOLDERS = 0.5

# rclone API rate limit (transactions per second), per worker. Drive
# allows ~10/sec per user; with PARALLEL_WORKERS workers each capped at
# this, the total stays under quota.
RCLONE_TPS_LIMIT = "4"

# Number of rclone copy commands to run concurrently. Each spends most
# of its time waiting on Drive responses, so 3 workers triple throughput
# without saturating the API. Set to 1 to disable parallelism.
PARALLEL_WORKERS = 3


def canonical_name(filename: str) -> Optional[str]:
    """Map an arbitrary filename to the planner's expected name.

    Returns None if the file should be discarded.
    """
    lower = filename.lower()
    if lower.endswith(".oxs"):
        return "pattern.oxs"
    if lower.endswith(".png"):
        return "thumb.png"
    return filename if ALL_FORMATS else None


# ---------- Implementation ----------


FOLDER_ID_RE = re.compile(r"/folders/([a-zA-Z0-9_-]+)")


def extract_folder_id(drive_url: str) -> Optional[str]:
    """Pull the Drive folder ID out of a share URL.

    Tirazain links look like:
        https://drive.google.com/drive/u/1/folders/<ID>?usp=sharing
        https://drive.google.com/drive/folders/<ID>

    Returns the ID or None if we can't find one.
    """
    m = FOLDER_ID_RE.search(drive_url)
    if not m:
        return None
    return m.group(1)


def rclone_available() -> bool:
    """Check that rclone is installed and the configured remote exists."""
    if not shutil.which("rclone"):
        print("rclone is not on $PATH. Install it from https://rclone.org/install/")
        return False
    try:
        out = subprocess.run(
            ["rclone", "listremotes"],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        print(f"`rclone listremotes` failed: {e}")
        return False
    if f"{RCLONE_REMOTE}:" not in out.stdout:
        print(
            f"rclone has no remote named '{RCLONE_REMOTE}'. "
            f"Run `rclone config` to create one (Storage: drive, scope: drive.readonly), "
            f"or change RCLONE_REMOTE at the top of this script."
        )
        print(f"Available remotes: {out.stdout.strip() or '(none)'}")
        return False
    return True


def download_folder(folder_id: str, dest_dir: Path) -> bool:
    """Copy a Drive folder by ID into dest_dir using rclone.

    Uses --drive-root-folder-id so we don't need the folder to be in our
    own Drive — it works for any folder we can access via share link.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        "rclone",
        "copy",
        "--drive-root-folder-id",
        folder_id,
        f"{RCLONE_REMOTE}:",
        str(dest_dir),
        "--tpslimit",
        RCLONE_TPS_LIMIT,
        "--tpslimit-burst",
        RCLONE_TPS_LIMIT,
        "--retries",
        "3",
        "--low-level-retries",
        "3",
        "--stats",
        "0",  # quieter output
    ]
    try:
        result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    except OSError as e:
        print(f"    rclone exec failed: {e}", file=sys.stderr)
        return False
    if result.returncode != 0:
        # Print just the relevant tail of stderr (rclone is verbose)
        tail = result.stderr.strip().splitlines()[-5:]
        for line in tail:
            print(f"    rclone: {line}", file=sys.stderr)
        return False
    return True


def normalize_files(dest_dir: Path) -> None:
    """Filter and rename files in dest_dir per KEEP_EXTENSIONS / canonical_name.

    rclone may preserve a subdirectory structure if the Drive folder has
    nested folders. We flatten anything one level deep before filtering.
    """
    # Flatten one level: move files from any subdirectory into dest_dir.
    for child in list(dest_dir.iterdir()):
        if child.is_dir():
            for f in child.rglob("*"):
                if f.is_file():
                    target = dest_dir / f.name
                    if not target.exists():
                        f.rename(target)
            shutil.rmtree(child, ignore_errors=True)

    # Filter and rename
    for f in list(dest_dir.iterdir()):
        if not f.is_file():
            continue
        if not ALL_FORMATS and f.suffix.lower() not in KEEP_EXTENSIONS:
            f.unlink()
            continue
        new_name = canonical_name(f.name)
        if new_name is None:
            f.unlink()
            continue
        if new_name != f.name:
            target = dest_dir / new_name
            if target.exists() and target != f:
                # Already have a canonical version — drop the duplicate
                f.unlink()
            else:
                f.rename(target)


def already_done(slug_dir: Path) -> bool:
    """A slug is 'done' once its pattern.oxs is present."""
    return (slug_dir / "pattern.oxs").exists()


def main() -> None:
    project_root = Path(__file__).resolve().parent.parent
    manifest_path = project_root / MANIFEST_PATH
    archive_dir = project_root / ARCHIVE_DIR

    if not rclone_available():
        sys.exit(1)

    if not manifest_path.exists():
        print(f"No manifest at {manifest_path}. Run scrape_tirazain_index.py first.")
        sys.exit(1)

    entries = json.loads(manifest_path.read_text())
    if not entries:
        print("Manifest is empty.")
        return

    todo: List[Tuple[str, str, Path]] = []
    skipped_no_url = 0
    skipped_no_id = 0
    skipped_done = 0
    for entry in entries:
        slug = entry.get("slug")
        drive_url = entry.get("driveUrl")
        if not slug:
            continue
        if not drive_url:
            skipped_no_url += 1
            continue
        folder_id = extract_folder_id(drive_url)
        if not folder_id:
            skipped_no_id += 1
            print(f"  WARN: {slug}: can't parse folder ID from {drive_url}")
            continue
        slug_dir = archive_dir / slug
        if already_done(slug_dir):
            skipped_done += 1
            continue
        todo.append((slug, folder_id, slug_dir))

    print(
        f"Manifest: {len(entries)} entries, "
        f"{skipped_done} already downloaded, "
        f"{skipped_no_url} missing driveUrl, "
        f"{skipped_no_id} bad URL, "
        f"{len(todo)} to fetch"
    )

    if not todo:
        return

    failed: List[str] = []
    completed_count = 0
    print_lock = threading.Lock()

    def process_one(idx: int, slug: str, folder_id: str, slug_dir: Path) -> Optional[str]:
        """Download + normalize one pattern. Returns the slug on failure, None on success."""
        nonlocal completed_count
        with print_lock:
            print(f"[{idx}/{len(todo)}] {slug}  (folder {folder_id})")
        ok = download_folder(folder_id, slug_dir)
        if not ok:
            return slug
        normalize_files(slug_dir)
        if not (slug_dir / "pattern.oxs").exists():
            with print_lock:
                print(f"    WARN: no .oxs file in {slug_dir}", file=sys.stderr)
        with print_lock:
            completed_count += 1
            if completed_count % 10 == 0:
                print(f"  → {completed_count}/{len(todo)} complete")
        return None

    if PARALLEL_WORKERS <= 1:
        for i, (slug, folder_id, slug_dir) in enumerate(todo, start=1):
            err = process_one(i, slug, folder_id, slug_dir)
            if err:
                failed.append(err)
            time.sleep(DELAY_BETWEEN_FOLDERS)
    else:
        with ThreadPoolExecutor(max_workers=PARALLEL_WORKERS) as pool:
            futures = []
            for i, (slug, folder_id, slug_dir) in enumerate(todo, start=1):
                futures.append(pool.submit(process_one, i, slug, folder_id, slug_dir))
                # Stagger submissions slightly so we don't issue 3 OAuth
                # token requests at once on startup.
                time.sleep(DELAY_BETWEEN_FOLDERS / PARALLEL_WORKERS)
            for fut in as_completed(futures):
                err = fut.result()
                if err:
                    failed.append(err)

    print(f"\nDone. {len(todo) - len(failed)} succeeded, {len(failed)} failed.")
    if failed:
        print("Failed slugs (re-run to retry):")
        for s in failed:
            print(f"  {s}")


if __name__ == "__main__":
    main()
