#!/usr/bin/env python3
from __future__ import annotations

import json
import csv
import re
import secrets
import shutil
import subprocess
import sys
import unicodedata
from datetime import datetime, timezone
from collections import OrderedDict
from pathlib import Path, PurePosixPath
from typing import Dict, List, Optional, Tuple, Set

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
TYPES_BY_MAP_DIR = DATA_DIR / "types"
STATIC_TYPES_BY_MAP_DIR = STATIC_DATA_DIR / "types"
MAPGROUPPROTO_XML = DATA_DIR / "mapgroupproto-merged.xml"
STATIC_MAPGROUPPROTO_XML = STATIC_DATA_DIR / "mapgroupproto-merged.xml"
OVERRIDES_JSON = DATA_DIR / "object_overrides.json"
TOMBSTONES_JSON = DATA_DIR / "id_tombstones.json"
API_ROOT = STATIC_DIR / "api" / "v1"
API_IMAGE_BASE_URL = "https://samsobjectfinder.com"
MODELS_CSV_CANDIDATES = [
    BASE_DIR / "Task docs" / "models.csv",
    BASE_DIR / "Task Docs" / "models.csv",
]
BBOX_BY_ID_CANDIDATES = [
    DATA_DIR / "object_bbox_by_id.json",
    STATIC_DATA_DIR / "object_bbox_by_id.json",
    STATIC_DIR / "data" / "object_bbox_by_id.json",
    BASE_DIR / "public" / "data" / "object_bbox_by_id.json",
]
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
    builds_dir = DB_DIR / "builds"
    if builds_dir.exists():
        paths.extend(sorted(builds_dir.glob("*.json")))
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
    images = obj.get("images")
    if isinstance(images, list):
        normalized_images = []
        for item in images:
            if not isinstance(item, str):
                continue
            parts = PurePosixPath(item).parts
            normalized_images.append("/".join(part.lower() for part in parts))
        obj["images"] = normalized_images
    return obj


def parse_bool(value: object, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        key = value.strip().lower()
        if key in {"1", "true", "yes", "y", "on"}:
            return True
        if key in {"0", "false", "no", "n", "off"}:
            return False
    return default


def slugify_token(value: object, default: str = "build") -> str:
    text = str(value or "").strip()
    if not text:
        return default
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower()
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized)
    normalized = normalized.strip("_")
    return normalized or default


def load_preset_object_row(folder: Path) -> Optional[dict]:
    objects_path = folder / "objects.json"
    if not objects_path.exists():
        return None
    rows = load_objects(objects_path)
    if not rows:
        return None
    return dict(rows[0])


def to_editor_json_from_objects_payload(payload: dict) -> List[dict]:
    raw_objects = payload.get("Objects")
    if not isinstance(raw_objects, list):
        return []
    out: List[dict] = []
    for item in raw_objects:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        pos = item.get("pos")
        ypr = item.get("ypr")
        if not isinstance(pos, list) or len(pos) < 3:
            pos = [0, 0, 0]
        if not isinstance(ypr, list) or len(ypr) < 3:
            ypr = [0, 0, 0]
        scale = item.get("scale", 1.0)
        try:
            scale = float(scale)
        except (TypeError, ValueError):
            scale = 1.0
        out.append(
            {
                "Type": name,
                "DisplayName": name,
                "Position": [pos[0], pos[1], pos[2]],
                "Orientation": [ypr[0], ypr[1], ypr[2]],
                "Scale": scale,
                "AttachmentMap": {},
                "Model": "",
                "Flags": 30,
                "m_LowBits": 0,
                "m_HighBits": 0,
            }
        )
    return out


def is_editor_json_entry(item: object) -> bool:
    return isinstance(item, dict) and isinstance(item.get("Type"), str) and isinstance(item.get("Position"), list)


def to_editor_json_entries(payload: object) -> List[dict]:
    if isinstance(payload, dict) and isinstance(payload.get("Objects"), list):
        return to_editor_json_from_objects_payload(payload)
    if isinstance(payload, list):
        entries = [dict(item) for item in payload if is_editor_json_entry(item)]
        if entries:
            return entries
    return []


def to_rel_base_path(path: Path) -> str:
    return str(path.relative_to(BASE_DIR)).replace("\\", "/")


def write_preset_editor_json(folder: Path, object_name: str, editor_json: List[dict]) -> str:
    if not editor_json:
        return ""
    out_dir = STATIC_DIR / "presets"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_name = f"{slugify_token(object_name or folder.name, default='build')}.json"
    out_path = out_dir / out_name
    out_path.write_text(json.dumps(editor_json, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return (Path("presets") / out_name).as_posix()


def discover_preset_artifacts(folder: Path) -> Dict[str, object]:
    import_json_path = ""
    editor_json: List[dict] = []
    copyable_path = ""
    dze_path = ""

    for dze_file in sorted(folder.glob("*.dze")):
        dze_path = to_rel_base_path(dze_file)
        break

    for file_path in sorted([p for p in folder.iterdir() if p.is_file()]):
        name_key = file_path.name.lower()
        if name_key == "objects.json":
            continue
        is_copyable_name = ("copyable" in name_key) or ("copy" in name_key and "paste" in name_key)

        if file_path.suffix.lower() == ".json":
            try:
                parsed = json.loads(file_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                parsed = None
            parsed_editor_json = to_editor_json_entries(parsed)
            if not editor_json and parsed_editor_json:
                editor_json = parsed_editor_json
                import_json_path = to_rel_base_path(file_path)
            if is_copyable_name and not copyable_path:
                copyable_path = to_rel_base_path(file_path)
            continue

        if file_path.suffix.lower() in {".txt", ".json"} and is_copyable_name and not copyable_path:
            copyable_path = to_rel_base_path(file_path)

    return {
        "editor_json": editor_json,
        "import_json_path": import_json_path,
        "copyable_path": copyable_path,
        "dze_path": dze_path,
    }


def discover_build_image_files(folder: Path) -> List[Path]:
    exts = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    candidates: List[Path] = []
    screenshots_dir = folder / "screenshots"
    if screenshots_dir.exists() and screenshots_dir.is_dir():
        candidates.extend(sorted([p for p in screenshots_dir.rglob("*") if p.is_file() and p.suffix.lower() in exts]))
    root_images = sorted(
        [
            p
            for p in folder.iterdir()
            if p.is_file()
            and p.suffix.lower() in exts
            and "copy and pasteable" not in p.name.lower()
        ]
    )
    candidates.extend(root_images)
    out: List[Path] = []
    seen = set()
    for image_path in candidates:
        key = str(image_path.resolve()).lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(image_path)
    return out


def copy_build_images(folder: Path, object_name: str, preferred_image: str = "") -> Tuple[str, List[str]]:
    source_images = discover_build_image_files(folder)
    preferred = preferred_image.strip()
    if preferred:
        preferred_candidates = [
            folder / preferred,
            BASE_DIR / preferred,
            STATIC_DIR / preferred,
            folder / Path(preferred).name,
            STATIC_DIR / "images" / "presets" / Path(preferred).name,
            STATIC_DIR / "presets" / Path(preferred).name,
        ]
        for pref in preferred_candidates:
            if pref.exists() and pref.is_file():
                source_images = [pref] + [img for img in source_images if img.resolve() != pref.resolve()]
                break

    if not source_images:
        return "", []

    folder_slug = slugify_token(folder.name, default="build")
    object_token = slugify_token(object_name, default="build")
    out_dir = STATIC_DIR / "presets"
    out_dir.mkdir(parents=True, exist_ok=True)

    out_rel_paths: List[str] = []
    for index, image_path in enumerate(source_images, start=1):
        ext = image_path.suffix.lower()
        out_ext = ".jpg" if ext in {".jpg", ".jpeg"} else ext
        out_name = f"{folder_slug}_{object_token}_{index}{out_ext}"
        out_path = out_dir / out_name
        shutil.copy2(image_path, out_path)
        rel = (Path("presets") / out_name).as_posix()
        out_rel_paths.append(rel)

    return out_rel_paths[0], out_rel_paths


def load_preset_rows_from_folders(presets_dir: Path) -> Tuple[List[dict], int]:
    rows: List[dict] = []
    folder_count = 0
    if not presets_dir.exists():
        return rows, folder_count
    for folder in sorted([p for p in presets_dir.iterdir() if p.is_dir()]):
        preset_row = load_preset_object_row(folder)
        if not preset_row:
            continue
        if parse_bool(preset_row.get("template"), default=False):
            continue
        artifacts = discover_preset_artifacts(folder)
        source_import_json_path = str(artifacts.get("import_json_path") or "").strip()
        source_copyable_path = str(artifacts.get("copyable_path") or "").strip()
        dze_path = str(artifacts.get("dze_path") or "").strip()
        object_id = str(preset_row.get("id", "")).strip()
        object_name = str(preset_row.get("objectName") or folder.name).strip()
        in_game_name = str(preset_row.get("inGameName") or object_name).strip()
        builder = str(preset_row.get("builder") or preset_row.get("author") or "samgeekman").strip()
        preferred_image = str(preset_row.get("image") or "").strip()
        image, image_list = copy_build_images(folder, object_name, preferred_image=preferred_image)
        if not image and preferred_image:
            image = preferred_image
            image_list = [preferred_image]
        search_tags = str(preset_row.get("searchTags") or "build").strip()
        default_path = "dz/builds/" + slugify_token(folder.name, default="build")
        path = str(preset_row.get("path") or default_path).strip()
        category = str(preset_row.get("category") or "Preset").strip()
        model_type = str(preset_row.get("modelType") or "Preset").strip()
        usable_on_console = parse_bool(preset_row.get("usableOnConsole"), default=True)
        editor_json = list(artifacts.get("editor_json") or [])
        static_editor_json_path = write_preset_editor_json(folder, object_name, editor_json)
        import_json_path = static_editor_json_path or source_import_json_path
        copyable_path = static_editor_json_path or source_copyable_path
        row = {
            "id": object_id,
            "objectName": object_name,
            "inGameName": in_game_name,
            "category": category,
            "modelType": model_type,
            "path": path,
            "usableOnConsole": usable_on_console,
            "searchTags": search_tags,
            "image": image,
            "images": image_list,
            "editorJson": editor_json,
            "builder": builder,
        }
        if import_json_path:
            row["presetImportJsonPath"] = import_json_path
        if copyable_path:
            row["presetCopyablePath"] = copyable_path
        if dze_path:
            row["presetDzePath"] = dze_path
        rows.append(normalize_object(row))
        folder_count += 1
    return rows, folder_count


def is_build_folder_object_file(path: Path) -> bool:
    if path.name != "objects.json":
        return False
    if path.parent.parent == DB_DIR / "presets":
        return True
    if path.parent.parent == DB_DIR / "builds":
        return True
    return False


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


def is_editor_build_row(obj: dict) -> bool:
    category = str(obj.get("category") or "").strip().lower()
    model_type = str(obj.get("modelType") or "").strip().lower()
    path = str(obj.get("path") or "").strip().lower()
    image = str(obj.get("image") or "").strip().lower()
    if "preset" in category or "build" in category:
        return True
    if "preset" in model_type or "build" in model_type:
        return True
    if path.startswith("dz/builds/"):
        return True
    if image.startswith("presets/"):
        return True
    return False


def generate_static_api(objects: List[dict]) -> Dict[str, int]:
    if API_ROOT.exists():
        shutil.rmtree(API_ROOT)
    API_ROOT.mkdir(parents=True, exist_ok=True)

    sorted_objects = sorted(
        [obj for obj in objects if not is_editor_build_row(obj)],
        key=lambda obj: str(obj.get("id", "")),
    )
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
            "image": str(row.get("image", "")).strip(),
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


def _as_float3(value: object) -> Optional[Tuple[float, float, float]]:
    if not isinstance(value, list) or len(value) != 3:
        return None
    out: List[float] = []
    for part in value:
        if not isinstance(part, (int, float)):
            return None
        out.append(float(part))
    return out[0], out[1], out[2]


def estimate_dimensions_from_tags(tags: object) -> Tuple[float, float, float]:
    text = tags.lower() if isinstance(tags, str) else ""
    if "huge" in text:
        return 8.0, 8.0, 8.0
    if "large" in text:
        return 4.5, 4.5, 4.5
    if "small" in text:
        return 1.2, 1.2, 1.2
    if "medium" in text:
        return 2.5, 2.5, 2.5
    return 2.5, 2.5, 2.5


def normalize_model_token(value: object) -> str:
    token = str(value or "").strip().lower()
    token = re.sub(r"\.[a-z0-9]+$", "", token)
    for prefix in ("land_", "staticobj_", "wreck_", "misc_", "house_"):
        if token.startswith(prefix):
            token = token[len(prefix) :]
    token = re.sub(r"[^a-z0-9]+", "", token)
    return token


def split_model_tokens(value: object) -> List[str]:
    token = str(value or "").strip()
    token = re.sub(r"\.[a-z0-9]+$", "", token, flags=re.IGNORECASE)
    token = re.sub(r"^(land_|staticobj_|wreck_|misc_|house_)", "", token, flags=re.IGNORECASE)
    # Split CamelCase and acronym boundaries so color/variant suffixes can be detected.
    token = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", token)
    token = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", token)
    token = token.lower()
    token = re.sub(r"[^a-z0-9]+", " ", token).strip()
    return [part for part in token.split(" ") if part]


VARIANT_TOKENS = {
    "black",
    "white",
    "blue",
    "green",
    "red",
    "yellow",
    "orange",
    "brown",
    "grey",
    "gray",
    "tan",
    "beige",
    "pink",
    "purple",
    "violet",
    "olive",
    "khaki",
    "camo",
    "woodland",
    "desert",
    "winter",
    "summer",
    "autumn",
    "fall",
    "dark",
    "light",
    "de",
    "chernarus",
    "livonia",
    "sakhal",
    "ttsko",
}


def base_variant_key(value: object) -> str:
    parts = split_model_tokens(value)
    kept = [part for part in parts if part not in VARIANT_TOKENS]
    chosen = kept if kept else parts
    return "".join(chosen)


def image_token(value: object) -> str:
    image = str(value or "").strip().lower()
    if not image:
        return ""
    base = PurePosixPath(image).name
    base = re.sub(r"\.(jpg|jpeg|png|webp)$", "", base)
    return normalize_model_token(base)


def path_family(value: object) -> str:
    path = str(value or "").strip().lower().strip("/")
    if not path:
        return ""
    parts = [part for part in path.split("/") if part]
    return "/".join(parts[:3])


def _has_bbox_vectors(obj: dict) -> bool:
    return (
        isinstance(obj.get("bboxMinVisual"), list)
        and len(obj["bboxMinVisual"]) == 3
        and isinstance(obj.get("bboxMaxVisual"), list)
        and len(obj["bboxMaxVisual"]) == 3
    )


def _append_index(index: Dict[str, List[dict]], key: str, obj: dict) -> None:
    if not key:
        return
    index.setdefault(key, []).append(obj)


def link_config_bbox_from_raw_p3d(objects: List[dict]) -> Dict[str, int]:
    donors = [
        obj
        for obj in objects
        if str(obj.get("modelType", "")).strip() == "Raw P3D" and _has_bbox_vectors(obj)
    ]
    if not donors:
        return {"linked_configs": 0, "by_exact_image": 0, "by_object_token": 0, "by_image_token": 0}

    by_exact_image: Dict[str, List[dict]] = {}
    by_object_token: Dict[str, List[dict]] = {}
    by_image_token: Dict[str, List[dict]] = {}
    for donor in donors:
        _append_index(by_exact_image, str(donor.get("image", "")).strip().lower(), donor)
        _append_index(by_object_token, normalize_model_token(donor.get("objectName")), donor)
        _append_index(by_image_token, image_token(donor.get("image")), donor)

    linked_configs = 0
    by_exact = 0
    by_obj_token = 0
    by_img_token = 0

    for obj in objects:
        if str(obj.get("modelType", "")).strip() != "Config":
            continue
        if _has_bbox_vectors(obj):
            continue

        obj_path_family = path_family(obj.get("path"))
        exact_candidates = by_exact_image.get(str(obj.get("image", "")).strip().lower(), [])
        object_token_candidates = by_object_token.get(normalize_model_token(obj.get("objectName")), [])
        image_token_candidates = by_image_token.get(image_token(obj.get("image")), [])

        donor: Optional[dict] = None
        link_method = ""
        if len(exact_candidates) == 1:
            donor = exact_candidates[0]
            link_method = "exact_image"
        if donor is None:
            same_family = [row for row in object_token_candidates if path_family(row.get("path")) == obj_path_family]
            if len(same_family) == 1:
                donor = same_family[0]
                link_method = "object_token_path_family"
        if donor is None:
            same_family = [row for row in image_token_candidates if path_family(row.get("path")) == obj_path_family]
            if len(same_family) == 1:
                donor = same_family[0]
                link_method = "image_token_path_family"
        if donor is None and len(object_token_candidates) == 1:
            donor = object_token_candidates[0]
            link_method = "object_token"
        if donor is None and len(image_token_candidates) == 1:
            donor = image_token_candidates[0]
            link_method = "image_token"
        if donor is None:
            continue

        bbmin = _as_float3(donor.get("bboxMinVisual"))
        bbmax = _as_float3(donor.get("bboxMaxVisual"))
        if bbmin is None or bbmax is None:
            continue

        obj["bboxMinVisual"] = [bbmin[0], bbmin[1], bbmin[2]]
        obj["bboxMaxVisual"] = [bbmax[0], bbmax[1], bbmax[2]]
        obj["dimensionsVisual"] = [bbmax[0] - bbmin[0], bbmax[1] - bbmin[1], bbmax[2] - bbmin[2]]
        obj["dimensionsSource"] = "bbox_linked_p3d"
        obj["bboxStatus"] = "linked_from_raw_p3d"
        obj["bboxLinkedFromId"] = str(donor.get("id", "")).strip()
        obj["bboxLinkedFromObject"] = str(donor.get("objectName", "")).strip()
        obj["bboxLinkMethod"] = link_method
        linked_configs += 1
        if link_method == "exact_image":
            by_exact += 1
        elif link_method in {"object_token_path_family", "object_token"}:
            by_obj_token += 1
        elif link_method in {"image_token_path_family", "image_token"}:
            by_img_token += 1

    return {
        "linked_configs": linked_configs,
        "by_exact_image": by_exact,
        "by_object_token": by_obj_token,
        "by_image_token": by_img_token,
    }


def load_bbox_by_id() -> Dict[str, dict]:
    path_used: Optional[Path] = None
    raw: Optional[object] = None
    for candidate in BBOX_BY_ID_CANDIDATES:
        loaded = load_json_file(candidate)
        if isinstance(loaded, dict):
            raw = loaded
            path_used = candidate
            break

    if not isinstance(raw, dict):
        print("Warning: bbox mapping not found; skipping dimension enrichment.")
        return {}

    index: Dict[str, dict] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or not key.strip():
            continue
        if not isinstance(value, dict):
            continue
        index[key.strip()] = value

    print(f"Loaded bbox mapping for {len(index)} IDs from {path_used}.")
    return index


def apply_bbox_dimensions(objects: List[dict]) -> Dict[str, int]:
    bbox_by_id = load_bbox_by_id()
    if not bbox_by_id:
        estimated_rows = 0
        for obj in objects:
            est = estimate_dimensions_from_tags(obj.get("searchTags"))
            obj["bboxStatus"] = "unmapped"
            obj["dimensionsVisual"] = [est[0], est[1], est[2]]
            obj["dimensionsSource"] = "estimated_tags"
            estimated_rows += 1
        return {
            "mapped_rows": 0,
            "rows_with_bbox": 0,
            "rows_with_dimensions": 0,
            "rows_missing_map": len(objects),
            "rows_estimated": estimated_rows,
        }

    mapped_rows = 0
    rows_with_bbox = 0
    rows_with_dimensions = 0
    rows_missing_map = 0
    rows_estimated = 0

    for obj in objects:
        object_id = str(obj.get("id", "")).strip()
        if not object_id:
            rows_missing_map += 1
            est = estimate_dimensions_from_tags(obj.get("searchTags"))
            obj["bboxStatus"] = "unmapped"
            obj["dimensionsVisual"] = [est[0], est[1], est[2]]
            obj["dimensionsSource"] = "estimated_tags"
            rows_estimated += 1
            continue
        bbox = bbox_by_id.get(object_id)
        if not isinstance(bbox, dict):
            rows_missing_map += 1
            est = estimate_dimensions_from_tags(obj.get("searchTags"))
            obj["bboxStatus"] = "unmapped"
            obj["dimensionsVisual"] = [est[0], est[1], est[2]]
            obj["dimensionsSource"] = "estimated_tags"
            rows_estimated += 1
            continue

        mapped_rows += 1
        status = bbox.get("bboxStatus")
        if isinstance(status, str) and status.strip():
            obj["bboxStatus"] = status.strip()

        bbmin = _as_float3(bbox.get("bboxMinVisual"))
        bbmax = _as_float3(bbox.get("bboxMaxVisual"))
        if bbmin is None or bbmax is None:
            continue

        obj["bboxMinVisual"] = [bbmin[0], bbmin[1], bbmin[2]]
        obj["bboxMaxVisual"] = [bbmax[0], bbmax[1], bbmax[2]]
        rows_with_bbox += 1

        size_x = bbmax[0] - bbmin[0]
        size_y = bbmax[1] - bbmin[1]
        size_z = bbmax[2] - bbmin[2]
        obj["dimensionsVisual"] = [size_x, size_y, size_z]
        obj["dimensionsSource"] = "bbox_visual"
        rows_with_dimensions += 1

    linked_stats = link_config_bbox_from_raw_p3d(objects)

    # Fill estimates for mapped rows that have status but no bbox vectors.
    for obj in objects:
        if "dimensionsVisual" in obj:
            continue
        est = estimate_dimensions_from_tags(obj.get("searchTags"))
        obj["dimensionsVisual"] = [est[0], est[1], est[2]]
        obj["dimensionsSource"] = "estimated_tags"
        rows_estimated += 1

    return {
        "mapped_rows": mapped_rows,
        "rows_with_bbox": rows_with_bbox + linked_stats["linked_configs"],
        "rows_with_dimensions": rows_with_dimensions + linked_stats["linked_configs"],
        "rows_missing_map": rows_missing_map,
        "rows_estimated": rows_estimated,
        "rows_linked_from_p3d": linked_stats["linked_configs"],
        "rows_linked_exact_image": linked_stats["by_exact_image"],
        "rows_linked_object_token": linked_stats["by_object_token"],
        "rows_linked_image_token": linked_stats["by_image_token"],
    }


def normalize_model_path(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    text = text.replace("\\", "/")
    text = re.sub(r"^[a-zA-Z]:", "", text)
    text = re.sub(r"/+", "/", text)
    if not text.startswith("/"):
        text = "/" + text
    return text.lower()


def resolve_models_csv_path() -> Optional[Path]:
    for candidate in MODELS_CSV_CANDIDATES:
        if candidate.exists():
            return candidate
    return None


def load_models_csv_links() -> Dict[str, object]:
    csv_path = resolve_models_csv_path()
    if not csv_path:
        return {
            "path": "",
            "classname_to_model": {},
            "blank_resolved_rows": 0,
            "rows_loaded": 0,
        }

    classname_to_model: Dict[str, str] = {}
    blank_resolved_rows = 0
    rows_loaded = 0
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if not isinstance(row, dict):
                continue
            classname = str(row.get("classname") or "").strip()
            if not classname:
                continue
            resolved_model = normalize_model_path(row.get("resolved_model"))
            if not resolved_model:
                blank_resolved_rows += 1
                continue
            classname_to_model[classname.lower()] = resolved_model
            rows_loaded += 1

    return {
        "path": str(csv_path),
        "classname_to_model": classname_to_model,
        "blank_resolved_rows": blank_resolved_rows,
        "rows_loaded": rows_loaded,
    }


def raw_object_model_path(row: dict) -> str:
    object_name = str(row.get("objectName") or "").strip()
    path = str(row.get("path") or "").strip()
    if not object_name:
        return ""
    return normalize_model_path(f"{path}/{object_name}")


def apply_compact_link_fields(objects: List[dict]) -> Dict[str, int]:
    by_id: Dict[str, dict] = {}
    for obj in objects:
        object_id = str(obj.get("id", "")).strip()
        if object_id:
            by_id[object_id] = obj

    for obj in objects:
        obj.pop("linked-p3d", None)
        obj.pop("linked-config", None)
        obj.pop("linked-variant", None)

    model_links = load_models_csv_links()
    classname_to_model = model_links["classname_to_model"]

    config_ids_by_classname: Dict[str, List[str]] = {}
    raw_ids_by_model_path: Dict[str, List[str]] = {}
    for obj in objects:
        object_id = str(obj.get("id", "")).strip()
        if not object_id:
            continue
        model_type = str(obj.get("modelType", "")).strip()
        if model_type == "Config":
            class_key = str(obj.get("objectName") or "").strip().lower()
            if class_key:
                config_ids_by_classname.setdefault(class_key, []).append(object_id)
        elif model_type == "Raw P3D":
            model_path = raw_object_model_path(obj)
            if model_path:
                raw_ids_by_model_path.setdefault(model_path, []).append(object_id)

    config_to_p3d: Dict[str, str] = {}
    config_model_groups: Dict[str, Set[str]] = {}
    unmatched_classname_rows = 0
    missing_raw_rows = 0
    ambiguous_raw_rows = 0

    for class_key, model_path in classname_to_model.items():
        config_ids = sorted(set(config_ids_by_classname.get(class_key, [])))
        if not config_ids:
            unmatched_classname_rows += 1
            continue
        config_model_groups.setdefault(model_path, set()).update(config_ids)
        raw_ids = sorted(set(raw_ids_by_model_path.get(model_path, [])))
        if len(raw_ids) == 1:
            donor_id = raw_ids[0]
            for cfg_id in config_ids:
                config_to_p3d[cfg_id] = donor_id
        elif len(raw_ids) == 0:
            missing_raw_rows += len(config_ids)
        else:
            ambiguous_raw_rows += len(config_ids)

    linked_variant_rows = 0
    for group_ids in config_model_groups.values():
        unique_group = sorted({obj_id for obj_id in group_ids if obj_id in by_id})
        if len(unique_group) <= 1:
            continue
        for obj_id in unique_group:
            others = [other_id for other_id in unique_group if other_id != obj_id]
            if not others:
                continue
            by_id[obj_id]["linked-variant"] = others
            linked_variant_rows += 1

    # Apply linked-p3d and build reverse linked-config.
    reverse_raw_to_configs: Dict[str, List[str]] = {}
    for cfg_id, donor_id in config_to_p3d.items():
        cfg = by_id.get(cfg_id)
        if not cfg:
            continue
        cfg["linked-p3d"] = donor_id
        reverse_raw_to_configs.setdefault(donor_id, []).append(cfg_id)

    linked_p3d_count = 0
    for obj in objects:
        if str(obj.get("modelType", "")).strip() == "Config" and isinstance(obj.get("linked-p3d"), str) and obj.get("linked-p3d"):
            linked_p3d_count += 1

    linked_config_count = 0
    for raw_id, config_ids in reverse_raw_to_configs.items():
        raw = by_id.get(raw_id)
        if not raw:
            continue
        unique = sorted({cfg_id for cfg_id in config_ids if cfg_id and cfg_id in by_id})
        if not unique:
            continue
        raw["linked-config"] = unique
        linked_config_count += 1

    # Trim heavy bbox payload/provenance to keep output size low.
    for obj in objects:
        for key in (
            "dimensionsSource",
            "bboxMinVisual",
            "bboxMaxVisual",
            "bboxStatus",
            "bboxLinkedFromId",
            "bboxLinkedFromObject",
            "bboxLinkMethod",
        ):
            if key in obj:
                del obj[key]

    return {
        "config_rows_with_linked_p3d": linked_p3d_count,
        "raw_rows_with_linked_config": linked_config_count,
        "config_rows_with_linked_variant": linked_variant_rows,
        "config_rows_linked_p3d_direct_bbox": 0,
        "config_rows_linked_p3d_direct_existing": 0,
        "config_rows_linked_p3d_inherited_from_variant": 0,
        "config_rows_linked_p3d_inherited_from_ingame": 0,
        "models_csv_rows_loaded": int(model_links["rows_loaded"]),
        "models_csv_blank_resolved_rows": int(model_links["blank_resolved_rows"]),
        "models_csv_unmatched_classname_rows": unmatched_classname_rows,
        "models_csv_missing_raw_rows": missing_raw_rows,
        "models_csv_ambiguous_raw_rows": ambiguous_raw_rows,
        "models_csv_path_used": str(model_links["path"] or ""),
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
    builds_dir = DB_DIR / "builds"
    presets_dir = DB_DIR / "presets"
    presets_file = DB_DIR / "presets.json"

    build_folder_rows: List[dict] = []
    build_folder_count = 0
    if builds_dir.exists():
        build_folder_rows, build_folder_count = load_preset_rows_from_folders(builds_dir)
    preset_folder_rows: List[dict] = []
    preset_folder_count = 0
    if presets_dir.exists():
        preset_folder_rows, preset_folder_count = load_preset_rows_from_folders(presets_dir)
    if build_folder_rows:
        all_objects.extend(build_folder_rows)
    elif preset_folder_rows:
        all_objects.extend(preset_folder_rows)
    elif presets_file.exists():
        all_objects.extend(normalize_object(obj) for obj in load_objects(presets_file))
    else:
        print(
            f"Warning: builds not found (folder format with objects.json + preset json) at {builds_dir} "
            f"or presets folder {presets_dir} "
            f"or legacy file {presets_file}"
        )

    object_files = sorted(DB_DIR.rglob("objects.json"))
    for obj_file in object_files:
        if is_build_folder_object_file(obj_file):
            continue
        objs = load_objects(obj_file)
        if not objs:
            continue
        all_objects.extend(normalize_object(obj) for obj in objs)

    all_objects, dedupe_stats = collapse_case_duplicates(all_objects)
    override_stats = apply_sidecar_overrides(all_objects)
    bbox_stats = apply_bbox_dimensions(all_objects)
    link_stats = apply_compact_link_fields(all_objects)
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
    if TYPES_BY_MAP_DIR.exists():
        if STATIC_TYPES_BY_MAP_DIR.exists():
            shutil.rmtree(STATIC_TYPES_BY_MAP_DIR)
        shutil.copytree(TYPES_BY_MAP_DIR, STATIC_TYPES_BY_MAP_DIR)
    else:
        print(f"Warning: types directory not found at {TYPES_BY_MAP_DIR}")
    if MAPGROUPPROTO_XML.exists():
        shutil.copyfile(MAPGROUPPROTO_XML, STATIC_MAPGROUPPROTO_XML)
    elif not STATIC_MAPGROUPPROTO_XML.exists():
        print(f"Warning: mapgroupproto-merged.xml not found at {MAPGROUPPROTO_XML}")

    print(
        f"Built {OUTPUT_JSON} with {len(all_objects)} objects "
        f"from {len(object_files)} files and {build_folder_count or preset_folder_count} build folders."
    )
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
        "Dimensions: "
        f"{bbox_stats['mapped_rows']} mapped, "
        f"{bbox_stats['rows_with_bbox']} with bbox, "
        f"{bbox_stats['rows_with_dimensions']} with dimensions, "
        f"{bbox_stats['rows_linked_from_p3d']} linked from raw p3d "
        f"(exact image {bbox_stats['rows_linked_exact_image']}, "
        f"object token {bbox_stats['rows_linked_object_token']}, "
        f"image token {bbox_stats['rows_linked_image_token']}), "
        f"{bbox_stats['rows_estimated']} estimated, "
        f"{bbox_stats['rows_missing_map']} without mapping."
    )
    print(
        "Links: "
        f"{link_stats['config_rows_with_linked_p3d']} config rows with linked-p3d, "
        f"{link_stats['raw_rows_with_linked_config']} raw rows with linked-config, "
        f"{link_stats['config_rows_with_linked_variant']} config rows with linked-variant "
        f"from models.csv ({link_stats['models_csv_rows_loaded']} mapped rows, "
        f"{link_stats['models_csv_blank_resolved_rows']} blank resolved_model rows ignored, "
        f"{link_stats['models_csv_unmatched_classname_rows']} unmatched classnames, "
        f"{link_stats['models_csv_missing_raw_rows']} missing raw-model matches, "
        f"{link_stats['models_csv_ambiguous_raw_rows']} ambiguous raw-model matches)."
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
