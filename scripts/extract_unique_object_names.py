#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "dayz_objects.json"
REPORTS_DIR = BASE_DIR / "reports"
OUTPUT_CSV = REPORTS_DIR / "unique_object_names.csv"

NAME_KEYS = ("objectName", "name", "Name")


def get_name(obj: dict) -> str | None:
    for key in NAME_KEYS:
        val = obj.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


def main() -> None:
    if not DATA_PATH.exists():
        raise SystemExit(f"Missing source file: {DATA_PATH}")

    data = json.loads(DATA_PATH.read_text())
    if isinstance(data, dict):
        items = [data]
    else:
        items = data

    names: set[str] = set()
    for obj in items:
        if not isinstance(obj, dict):
            continue
        name = get_name(obj)
        if name:
            names.add(name)

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    with OUTPUT_CSV.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["objectName"])
        for name in sorted(names, key=lambda s: s.lower()):
            writer.writerow([name])

    print(f"Wrote {len(names)} unique names to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
