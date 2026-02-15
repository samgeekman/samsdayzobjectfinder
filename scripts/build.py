#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import secrets
import shutil
from collections import OrderedDict
from pathlib import Path, PurePosixPath
from typing import Dict, List, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "database"
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"
OUTPUT_JSON = DATA_DIR / "dayz_objects.json"
BACKUP_JSON = DATA_DIR / "dayz_objects_last_version.json"
STATIC_DATA_DIR = STATIC_DIR / "data"
STATIC_OUTPUT_JSON = STATIC_DATA_DIR / "dayz_objects.json"
DB_ZIP = STATIC_DIR / "dayz_objects_latest.zip"
TYPES_XML = DATA_DIR / "types_aggregated.xml"
STATIC_TYPES_XML = STATIC_DATA_DIR / "types_aggregated.xml"
ID_RE = re.compile(r"^dzobj_[a-z0-9]{10}$")
ID_PREFIX = "dzobj_"
ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"
ID_LEN = 10


def load_objects(path: Path) -> List[dict]:
    """Load an objects.json file as a list of dicts."""
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


def source_json_files() -> List[Path]:
    paths: List[Path] = []
    presets_dir = DB_DIR / "presets"
    if presets_dir.exists():
        paths.extend(sorted(presets_dir.glob("*.json")))
    presets_file = DB_DIR / "presets.json"
    if presets_file.exists():
        paths.append(presets_file)
    paths.extend(sorted(DB_DIR.rglob("objects.json")))
    return paths


def new_id(existing: set[str]) -> str:
    while True:
        candidate = ID_PREFIX + "".join(secrets.choice(ID_CHARS) for _ in range(ID_LEN))
        if candidate not in existing:
            return candidate


def ensure_source_ids() -> Dict[str, int]:
    stats = {
        "files_touched": 0,
        "ids_added_missing": 0,
        "ids_repaired_invalid": 0,
        "ids_repaired_duplicate": 0,
    }
    seen_ids: set[str] = set()

    for path in source_json_files():
        original_text = path.read_text(encoding="utf-8")
        rows = load_objects(path)
        changed = False
        for row in rows:
            current = row.get("id")
            if isinstance(current, str):
                current = current.strip()
            if not isinstance(current, str) or not current:
                row["id"] = new_id(seen_ids)
                seen_ids.add(row["id"])
                stats["ids_added_missing"] += 1
                changed = True
                continue
            if not ID_RE.match(current):
                row["id"] = new_id(seen_ids)
                seen_ids.add(row["id"])
                stats["ids_repaired_invalid"] += 1
                changed = True
                continue
            if current in seen_ids:
                row["id"] = new_id(seen_ids)
                seen_ids.add(row["id"])
                stats["ids_repaired_duplicate"] += 1
                changed = True
                continue
            row["id"] = current
            seen_ids.add(current)

        if changed:
            path.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            stats["files_touched"] += 1

    return stats


def is_blank(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() in ("", "-")
    return False


def normalize_object(obj: dict) -> dict:
    """Normalize fields for consistent output."""
    obj = dict(obj)
    image = obj.get("image")
    if isinstance(image, str):
        parts = PurePosixPath(image).parts
        obj["image"] = "/".join(part.lower() for part in parts)
    return obj


def split_tags(tags: str) -> List[str]:
    return [part.strip() for part in tags.split(",") if part.strip()]


def merge_search_tags(primary: str, secondary: str) -> str:
    if not primary:
        return secondary
    if not secondary:
        return primary
    ordered: List[str] = []
    seen = set()
    for tag in split_tags(primary) + split_tags(secondary):
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(tag)
    return ", ".join(ordered)


def object_richness_score(obj: dict) -> int:
    score = 0
    for value in obj.values():
        if isinstance(value, str):
            if not is_blank(value):
                score += 1
        elif value is not None:
            score += 1
    return score


def uppercase_count(value: str) -> int:
    return sum(1 for ch in value if ch.isupper())


def image_match_score(obj: dict) -> int:
    object_name = str(obj.get("objectName", "")).strip().lower()
    image = str(obj.get("image", "")).strip().lower()
    if not object_name or not image:
        return 0
    object_token = "".join(ch for ch in object_name if ch.isalnum())
    image_token = "".join(ch for ch in PurePosixPath(image).stem if ch.isalnum())
    if not object_token or not image_token:
        return 0
    if object_token in image_token:
        return 3
    if image_token in object_token:
        return 2
    return 0


def case_dedupe_key(obj: dict) -> Tuple[str, str]:
    path = str(obj.get("path", "")).strip().lower()
    object_name = str(obj.get("objectName", "")).strip().lower()
    return path, object_name


def merge_records(primary: dict, secondary: dict) -> dict:
    merged = dict(primary)
    for key, value in secondary.items():
        if key in {"objectName", "path", "image", "id"}:
            continue
        if key == "searchTags":
            first = merged.get("searchTags", "")
            first_str = first if isinstance(first, str) else ""
            second_str = value if isinstance(value, str) else ""
            merged["searchTags"] = merge_search_tags(first_str, second_str)
            continue
        if key == "usableOnConsole":
            if isinstance(value, bool):
                merged["usableOnConsole"] = bool(merged.get("usableOnConsole", False)) or value
            continue
        if key not in merged or is_blank(merged.get(key)):
            if not is_blank(value):
                merged[key] = value
    return merged


def collapse_case_duplicates(objects: List[dict]) -> Tuple[List[dict], Dict[str, int]]:
    grouped: "OrderedDict[Tuple[str, str], List[dict]]" = OrderedDict()
    for obj in objects:
        grouped.setdefault(case_dedupe_key(obj), []).append(obj)

    collapsed: List[dict] = []
    groups_collapsed = 0
    rows_removed = 0

    for records in grouped.values():
        if len(records) == 1:
            collapsed.append(records[0])
            continue

        groups_collapsed += 1
        rows_removed += len(records) - 1

        canonical_index = max(
            range(len(records)),
            key=lambda idx: (
                image_match_score(records[idx]),
                object_richness_score(records[idx]),
                -uppercase_count(str(records[idx].get("objectName", ""))),
                str(records[idx].get("objectName", "")).lower(),
            ),
        )
        merged = dict(records[canonical_index])
        for idx, record in enumerate(records):
            if idx == canonical_index:
                continue
            merged = merge_records(merged, record)
            if is_blank(merged.get("id")) and isinstance(record.get("id"), str) and record.get("id").strip():
                merged["id"] = record["id"].strip()
        collapsed.append(merged)

    return collapsed, {
        "groups_collapsed": groups_collapsed,
        "rows_removed": rows_removed,
    }


def ensure_explicit_ids(objects: List[dict]) -> int:
    seen_ids = set()
    for idx, obj in enumerate(objects):
        raw_id = obj.get("id")
        if not isinstance(raw_id, str) or not raw_id.strip():
            raise SystemExit(
                "Missing required source ID at row "
                f"{idx}: objectName={obj.get('objectName')} path={obj.get('path')}. "
                "Run scripts/sync_database_ids.py to backfill IDs."
            )
        object_id = raw_id.strip()
        if not ID_RE.match(object_id):
            raise SystemExit(
                f"Invalid ID format '{object_id}' at row {idx}: "
                "expected pattern dzobj_[a-z0-9]{10}."
            )
        if object_id in seen_ids:
            raise SystemExit(
                f"Duplicate ID '{object_id}' at row {idx}: "
                f"objectName={obj.get('objectName')} path={obj.get('path')}."
            )
        seen_ids.add(object_id)
        obj["objectId"] = object_id
    return len(seen_ids)


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
    STATIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

    id_stats = ensure_source_ids()

    all_objects: List[dict] = []
    presets_dir = DB_DIR / "presets"
    presets_file = DB_DIR / "presets.json"

    if presets_dir.exists():
        preset_files = sorted(presets_dir.glob("*.json"))
        if preset_files:
            for preset_path in preset_files:
                all_objects.extend(normalize_object(obj) for obj in load_objects(preset_path))
        else:
            print(f"Warning: presets folder has no json files: {presets_dir}")
    elif presets_file.exists():
        all_objects.extend(normalize_object(obj) for obj in load_objects(presets_file))
    else:
        print(f"Warning: presets not found: {presets_dir} or {presets_file}")

    object_files = sorted(DB_DIR.rglob("objects.json"))
    for obj_file in object_files:
        objs = load_objects(obj_file)
        if not objs:
            continue
        all_objects.extend(normalize_object(obj) for obj in objs)

    all_objects, dedupe_stats = collapse_case_duplicates(all_objects)
    unique_ids = ensure_explicit_ids(all_objects)

    if OUTPUT_JSON.exists():
        shutil.copyfile(OUTPUT_JSON, BACKUP_JSON)

    OUTPUT_JSON.write_text(json.dumps(all_objects, indent=2, ensure_ascii=False))
    shutil.copyfile(OUTPUT_JSON, STATIC_OUTPUT_JSON)
    if TYPES_XML.exists():
        shutil.copyfile(TYPES_XML, STATIC_TYPES_XML)
    else:
        print(f"Warning: types_aggregated.xml not found at {TYPES_XML}")

    print(f"Built {OUTPUT_JSON} with {len(all_objects)} objects from {len(object_files)} files.")
    print(
        "ID sync: "
        f"{id_stats['ids_added_missing']} added, "
        f"{id_stats['ids_repaired_invalid']} repaired invalid, "
        f"{id_stats['ids_repaired_duplicate']} repaired duplicate "
        f"across {id_stats['files_touched']} files."
    )
    print(
        "Case-duplicate merge: "
        f"{dedupe_stats['groups_collapsed']} groups, "
        f"{dedupe_stats['rows_removed']} rows removed."
    )
    print(f"Validated explicit object IDs: {unique_ids}.")
    if OUTPUT_JSON.exists():
        print(f"Previous export saved to {BACKUP_JSON}.")
    print(f"Copied export to {STATIC_OUTPUT_JSON}.")

    export_database_zip()
    print(f"Database zip exported to {DB_ZIP}.")


if __name__ == "__main__":
    main()
