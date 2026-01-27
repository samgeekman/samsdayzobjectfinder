#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from pathlib import Path, PurePosixPath
from typing import List

BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "database"
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"
OUTPUT_JSON = DATA_DIR / "dayz_objects.json"
BACKUP_JSON = DATA_DIR / "dayz_objects_last_version.json"
DB_ZIP = STATIC_DIR / "dayz_objects_latest.zip"


def load_objects(path: Path) -> List[dict]:
    """Load an objects.json file as a list of dicts"""
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        print(f"Warning: failed to parse {path}: {exc}")
        return []
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = [data]
    else:
        items = []
    return [obj for obj in items if isinstance(obj, dict)]


def normalize_object(obj: dict) -> dict:
    """Normalize fields for consistent output."""
    image = obj.get("image")
    if isinstance(image, str):
        parts = PurePosixPath(image).parts
        obj["image"] = "/".join(part.lower() for part in parts)
    return obj


def export_database_zip() -> None:
    """Export the current database folder as a zip in the static root."""
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    if DB_ZIP.exists():
        DB_ZIP.unlink()
    shutil.make_archive(DB_ZIP.with_suffix("").as_posix(), "zip", root_dir=DB_DIR)


def main() -> None:
    if not DB_DIR.exists():
        raise SystemExit(f"Database folder not found: {DB_DIR}")

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    all_objects: List[dict] = []
    presets_dir = DB_DIR / "presets"
    presets_file = DB_DIR / "presets.json"

    if presets_dir.exists():
        preset_files = sorted(presets_dir.glob("*.json"))
        if preset_files:
            # Add presets to the beginning of the export to keep them prominent
            for preset_path in preset_files:
                all_objects.extend(normalize_object(obj) for obj in load_objects(preset_path))
        else:
            print(f"Warning: presets folder has no json files: {presets_dir}")
    elif presets_file.exists():
        # Backward compatibility: old single-file preset export
        all_objects.extend(normalize_object(obj) for obj in load_objects(presets_file))
    else:
        print(f"Warning: presets not found: {presets_dir} or {presets_file}")

    object_files = sorted(DB_DIR.rglob("objects.json"))

    for obj_file in object_files:
        objs = load_objects(obj_file)
        if not objs:
            continue
        all_objects.extend(normalize_object(obj) for obj in objs)

    # Backup previous export
    if OUTPUT_JSON.exists():
        shutil.copyfile(OUTPUT_JSON, BACKUP_JSON)

    OUTPUT_JSON.write_text(json.dumps(all_objects, indent=2, ensure_ascii=False))

    print(f"Built {OUTPUT_JSON} with {len(all_objects)} objects from {len(object_files)} files.")
    if OUTPUT_JSON.exists():
        print(f"Previous export saved to {BACKUP_JSON}.")

    export_database_zip()
    print(f"Database zip exported to {DB_ZIP}.")


if __name__ == "__main__":
    main()
