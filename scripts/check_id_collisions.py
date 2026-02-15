#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import List

BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "database"
ID_RE = re.compile(r"^dzobj_[a-z0-9]{10}$")


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


def load_rows(path: Path) -> List[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict):
        raw = [raw]
    if not isinstance(raw, list):
        return []
    return [row for row in raw if isinstance(row, dict)]


def main() -> int:
    missing = []
    invalid = []
    duplicate = []
    seen = {}

    for path in source_json_files():
        try:
            rows = load_rows(path)
        except json.JSONDecodeError as exc:
            print(f"ERROR invalid JSON: {path}: {exc}")
            return 1
        for idx, row in enumerate(rows):
            row_id = row.get("id")
            if not isinstance(row_id, str) or not row_id.strip():
                missing.append((path, idx, row.get("objectName")))
                continue
            row_id = row_id.strip()
            if not ID_RE.match(row_id):
                invalid.append((path, idx, row_id))
                continue
            if row_id in seen:
                duplicate.append((row_id, seen[row_id], (path, idx, row.get("objectName"))))
            else:
                seen[row_id] = (path, idx, row.get("objectName"))

    if missing or invalid or duplicate:
        print("ID collision guard failed.")
        print(f"missing={len(missing)} invalid={len(invalid)} duplicate={len(duplicate)}")
        for path, idx, name in missing[:20]:
            print(f"MISSING id: {path}:{idx+1} objectName={name}")
        for path, idx, row_id in invalid[:20]:
            print(f"INVALID id: {path}:{idx+1} id={row_id}")
        for row_id, a, b in duplicate[:20]:
            print(
                "DUPLICATE id: "
                f"{row_id} at {a[0]}:{a[1]+1} and {b[0]}:{b[1]+1}"
            )
        return 1

    print(f"ID collision guard passed: {len(seen)} IDs checked.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
