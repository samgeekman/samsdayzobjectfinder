#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import secrets
from collections import OrderedDict
from pathlib import Path, PurePosixPath
from typing import Dict, List, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "database"
ID_PREFIX = "dzobj_"
ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"
ID_LEN = 10
ID_RE = re.compile(r"^dzobj_[a-z0-9]{10}$")


def load_json_list(path: Path) -> List[dict]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON in {path}: {exc}") from exc
    if isinstance(raw, list):
        rows = raw
    elif isinstance(raw, dict):
        rows = [raw]
    else:
        rows = []
    return [row for row in rows if isinstance(row, dict)]


def normalize_image(obj: dict) -> None:
    image = obj.get("image")
    if isinstance(image, str):
        parts = PurePosixPath(image).parts
        obj["image"] = "/".join(part.lower() for part in parts)


def is_blank(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() in ("", "-")
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


def new_id(existing: set[str]) -> str:
    while True:
        candidate = ID_PREFIX + "".join(secrets.choice(ID_CHARS) for _ in range(ID_LEN))
        if candidate not in existing:
            return candidate


def choose_canonical(records: List[dict]) -> int:
    return max(
        range(len(records)),
        key=lambda idx: (
            image_match_score(records[idx]),
            object_richness_score(records[idx]),
            -uppercase_count(str(records[idx].get("objectName", ""))),
            str(records[idx].get("objectName", "")).lower(),
        ),
    )


def collapse_case_duplicates(rows: List[dict]) -> Tuple[List[dict], int]:
    grouped: "OrderedDict[Tuple[str, str], List[dict]]" = OrderedDict()
    for row in rows:
        grouped.setdefault(case_dedupe_key(row), []).append(row)

    collapsed: List[dict] = []
    removed = 0
    for records in grouped.values():
        if len(records) == 1:
            collapsed.append(records[0])
            continue
        removed += len(records) - 1
        canonical = records[choose_canonical(records)]
        merged = dict(canonical)
        for record in records:
            if record is canonical:
                continue
            merged = merge_records(merged, record)
            if is_blank(merged.get("id")) and isinstance(record.get("id"), str) and record.get("id").strip():
                merged["id"] = record["id"].strip()
        collapsed.append(merged)
    return collapsed, removed


def process_file(path: Path) -> Tuple[bool, int]:
    original_text = path.read_text(encoding="utf-8")
    rows = load_json_list(path)
    for row in rows:
        normalize_image(row)
    rows, removed = collapse_case_duplicates(rows)
    new_text = json.dumps(rows, indent=2, ensure_ascii=False) + "\n"
    changed = new_text != original_text
    if changed:
        path.write_text(new_text, encoding="utf-8")
    return changed, removed


def main() -> None:
    if not DB_DIR.exists():
        raise SystemExit(f"Database folder not found: {DB_DIR}")

    object_files = sorted(DB_DIR.rglob("objects.json"))
    preset_files = []
    presets_dir = DB_DIR / "presets"
    if presets_dir.exists():
        preset_files = sorted(presets_dir.glob("*.json"))
    presets_file = DB_DIR / "presets.json"
    if presets_file.exists():
        preset_files.append(presets_file)

    file_paths = object_files + preset_files
    changed_paths: set[Path] = set()
    removed_case_duplicates = 0
    for path in object_files:
        changed, removed = process_file(path)
        if changed:
            changed_paths.add(path)
        removed_case_duplicates += removed

    all_rows: List[Tuple[Path, List[dict]]] = []
    id_seen: set[str] = set()
    missing_ids = 0
    repaired_format = 0
    repaired_collisions = 0

    for path in file_paths:
        rows = load_json_list(path)
        file_changed = False
        for row in rows:
            current = row.get("id")
            if isinstance(current, str):
                current = current.strip()
            if not isinstance(current, str) or not current or not ID_RE.match(current):
                row["id"] = new_id(id_seen)
                id_seen.add(row["id"])
                file_changed = True
                if not current:
                    missing_ids += 1
                else:
                    repaired_format += 1
                continue
            if current in id_seen:
                row["id"] = new_id(id_seen)
                id_seen.add(row["id"])
                file_changed = True
                repaired_collisions += 1
            else:
                id_seen.add(current)
                row["id"] = current
        if file_changed:
            path.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            changed_paths.add(path)
        all_rows.append((path, rows))

    total_objects = sum(len(rows) for _, rows in all_rows)
    print(f"Scanned files: {len(file_paths)}")
    print(f"Total objects: {total_objects}")
    print(f"Files changed: {len(changed_paths)}")
    print(f"Case-duplicates removed: {removed_case_duplicates}")
    print(f"IDs added (missing): {missing_ids}")
    print(f"IDs repaired (invalid format): {repaired_format}")
    print(f"IDs repaired (global collisions): {repaired_collisions}")
    print(f"Unique IDs now tracked: {len(id_seen)}")


if __name__ == "__main__":
    main()
