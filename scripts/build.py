#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import secrets
import shutil
from datetime import datetime, timezone
from collections import OrderedDict
from pathlib import Path, PurePosixPath
from typing import Dict, List, Optional, Tuple

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
MAPGROUPPROTO_XML = DATA_DIR / "mapgroupproto-merged.xml"
STATIC_MAPGROUPPROTO_XML = STATIC_DATA_DIR / "mapgroupproto-merged.xml"
OVERRIDES_JSON = DATA_DIR / "object_overrides.json"
TOMBSTONES_JSON = DATA_DIR / "id_tombstones.json"
API_ROOT = STATIC_DIR / "api" / "v1"
API_IMAGE_BASE_URL = "https://samsobjectfinder.com"
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


def load_json_file(path: Path) -> Optional[object]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def get_row_id(row: dict) -> str:
    for key in ("id",):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def summarize_row(row: dict) -> dict:
    return {
        "objectName": row.get("objectName", ""),
        "inGameName": row.get("inGameName", ""),
        "category": row.get("category", ""),
        "path": row.get("path", ""),
        "image": row.get("image", ""),
    }


def previous_export_index() -> Dict[str, dict]:
    raw = load_json_file(OUTPUT_JSON)
    if not isinstance(raw, list):
        return {}
    index: Dict[str, dict] = {}
    for row in raw:
        if not isinstance(row, dict):
            continue
        row_id = get_row_id(row)
        if not row_id:
            continue
        index[row_id] = summarize_row(row)
    return index


def ensure_sidecar_overrides_file() -> None:
    if OVERRIDES_JSON.exists():
        return
    OVERRIDES_JSON.write_text(
        json.dumps({"byId": {}}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def load_overrides_by_id() -> Dict[str, dict]:
    ensure_sidecar_overrides_file()
    raw = load_json_file(OVERRIDES_JSON)
    if isinstance(raw, dict):
        if "byId" in raw and isinstance(raw.get("byId"), dict):
            return {k: v for k, v in raw["byId"].items() if isinstance(v, dict)}
        return {k: v for k, v in raw.items() if isinstance(v, dict)}
    return {}


def apply_sidecar_overrides(objects: List[dict]) -> Dict[str, int]:
    overrides = load_overrides_by_id()
    if not overrides:
        return {"applied": 0, "unknown_ids": 0}

    by_id = {str(obj.get("id", "")).strip(): obj for obj in objects if isinstance(obj.get("id"), str)}
    applied = 0
    unknown = 0
    for row_id, patch in overrides.items():
        target = by_id.get(row_id)
        if target is None:
            unknown += 1
            continue
        for key, value in patch.items():
            if key == "id":
                continue
            target[key] = value
        applied += 1
    return {"applied": applied, "unknown_ids": unknown}


def update_id_tombstones(previous_index: Dict[str, dict], current_objects: List[dict]) -> Dict[str, int]:
    current_ids = {
        str(obj.get("id", "")).strip()
        for obj in current_objects
        if isinstance(obj.get("id"), str) and obj.get("id").strip()
    }
    removed_ids = sorted(row_id for row_id in previous_index.keys() if row_id not in current_ids)

    raw = load_json_file(TOMBSTONES_JSON)
    if not isinstance(raw, list):
        raw = []
    tombstones = [row for row in raw if isinstance(row, dict)]
    existing_ids = {
        str(row.get("id", "")).strip()
        for row in tombstones
        if isinstance(row.get("id"), str) and row.get("id").strip()
    }

    added = 0
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    for row_id in removed_ids:
        if row_id in existing_ids:
            continue
        details = previous_index.get(row_id, {})
        tombstones.append(
            {
                "id": row_id,
                "removedAt": now,
                "lastKnown": details,
            }
        )
        existing_ids.add(row_id)
        added += 1

    tombstones.sort(key=lambda item: str(item.get("id", "")))
    TOMBSTONES_JSON.write_text(json.dumps(tombstones, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"removed_in_build": len(removed_ids), "new_tombstones": added, "total_tombstones": len(tombstones)}


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
        obj["id"] = object_id
        if "objectId" in obj:
            del obj["objectId"]
    return len(seen_ids)


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build_image_url(image_path: object) -> str:
    if not isinstance(image_path, str):
        return ""
    cleaned = image_path.strip()
    if not cleaned:
        return ""
    return f"{API_IMAGE_BASE_URL.rstrip('/')}/{cleaned.lstrip('/')}"


def generate_static_api(objects: List[dict]) -> Dict[str, int]:
    if API_ROOT.exists():
        shutil.rmtree(API_ROOT)
    API_ROOT.mkdir(parents=True, exist_ok=True)

    sorted_objects = sorted(objects, key=lambda obj: str(obj.get("id", "")))
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    api_objects: List[dict] = []
    for obj in sorted_objects:
        row = dict(obj)
        row["imageUrl"] = build_image_url(row.get("image"))
        api_objects.append(row)

    object_names = sorted(
        [
            {
                "id": str(row.get("id", "")).strip(),
                "objectName": str(row.get("objectName", "")).strip(),
            }
            for row in api_objects
            if not is_blank(row.get("id")) and not is_blank(row.get("objectName"))
        ],
        key=lambda item: (item["objectName"].lower(), item["id"]),
    )
    ingame_objects = [
        {
            "id": str(row.get("id", "")).strip(),
            "objectName": str(row.get("objectName", "")).strip(),
            "inGameName": str(row.get("inGameName", "")).strip(),
        }
        for row in api_objects
        if str(row.get("modelType", "")).strip() == "Config"
        and not is_blank(row.get("id"))
        and not is_blank(row.get("inGameName"))
        and not is_blank(row.get("objectName"))
    ]

    write_json(API_ROOT / "objects.full.json", api_objects)
    write_json(API_ROOT / "object-names.json", object_names)
    write_json(API_ROOT / "objects.ingame.json", ingame_objects)

    write_json(
        API_ROOT / "meta.json",
        {
            "apiVersion": "v1",
            "schemaVersion": 1,
            "generatedAt": generated_at,
            "objectCount": len(api_objects),
            "objectNameCount": len(object_names),
            "inGameObjectCount": len(ingame_objects),
            "endpoints": {
                "meta": "/api/v1/meta.json",
                "fullDataset": "/api/v1/objects.full.json",
                "objectNames": "/api/v1/object-names.json",
                "inGameObjects": "/api/v1/objects.ingame.json",
            },
        },
    )

    # Integrity checks for generated API.
    meta_raw = load_json_file(API_ROOT / "meta.json")
    if not isinstance(meta_raw, dict):
        raise SystemExit("API validation failed: meta.json is not valid JSON object.")
    if int(meta_raw.get("objectCount", -1)) != len(api_objects):
        raise SystemExit("API validation failed: meta.objectCount mismatch.")
    full_raw = load_json_file(API_ROOT / "objects.full.json")
    if not isinstance(full_raw, list) or len(full_raw) != len(api_objects):
        raise SystemExit("API validation failed: objects.full.json missing or mismatched count.")
    names_raw = load_json_file(API_ROOT / "object-names.json")
    if not isinstance(names_raw, list) or len(names_raw) != len(object_names):
        raise SystemExit("API validation failed: object-names.json missing or mismatched count.")
    ingame_raw = load_json_file(API_ROOT / "objects.ingame.json")
    if not isinstance(ingame_raw, list) or len(ingame_raw) != len(ingame_objects):
        raise SystemExit("API validation failed: objects.ingame.json missing or mismatched count.")
    return {
        "full_rows": len(api_objects),
        "name_rows": len(object_names),
        "ingame_rows": len(ingame_objects),
    }


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

    previous_index = previous_export_index()
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
    override_stats = apply_sidecar_overrides(all_objects)
    unique_ids = ensure_explicit_ids(all_objects)
    tombstone_stats = update_id_tombstones(previous_index, all_objects)
    api_stats = generate_static_api(all_objects)

    if OUTPUT_JSON.exists():
        shutil.copyfile(OUTPUT_JSON, BACKUP_JSON)

    OUTPUT_JSON.write_text(json.dumps(all_objects, indent=2, ensure_ascii=False))
    shutil.copyfile(OUTPUT_JSON, STATIC_OUTPUT_JSON)
    if TYPES_XML.exists():
        shutil.copyfile(TYPES_XML, STATIC_TYPES_XML)
    else:
        print(f"Warning: types_aggregated.xml not found at {TYPES_XML}")
    if MAPGROUPPROTO_XML.exists():
        shutil.copyfile(MAPGROUPPROTO_XML, STATIC_MAPGROUPPROTO_XML)
    elif not STATIC_MAPGROUPPROTO_XML.exists():
        print(f"Warning: mapgroupproto-merged.xml not found at {MAPGROUPPROTO_XML}")

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
    print(
        "Overrides: "
        f"{override_stats['applied']} applied, "
        f"{override_stats['unknown_ids']} unknown IDs."
    )
    print(
        "Tombstones: "
        f"{tombstone_stats['new_tombstones']} newly added "
        f"({tombstone_stats['removed_in_build']} removed this build, "
        f"{tombstone_stats['total_tombstones']} total)."
    )
    print(
        "API: "
        f"{api_stats['full_rows']} full rows, "
        f"{api_stats['name_rows']} object names, "
        f"{api_stats['ingame_rows']} in-game rows."
    )
    print(f"Validated explicit object IDs: {unique_ids}.")
    if OUTPUT_JSON.exists():
        print(f"Previous export saved to {BACKUP_JSON}.")
    print(f"Copied export to {STATIC_OUTPUT_JSON}.")

    export_database_zip()
    print(f"Database zip exported to {DB_ZIP}.")


if __name__ == "__main__":
    main()
