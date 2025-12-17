#!/usr/bin/env python3
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Dict, List

from build import DB_DIR, DATA_DIR, load_objects

COUNT_FILE = DATA_DIR / "object_count.txt"


def accumulate_counts(counts: Dict[Path, int], leaf_dir: Path, count: int) -> None:
    dir_path = leaf_dir
    while True:
        counts[dir_path] += count
        if dir_path == DB_DIR:
            break
        if DB_DIR not in dir_path.parents:
            break
        dir_path = dir_path.parent


def build_simple_counts(counts: Dict[Path, int]) -> List[str]:
    lines: List[str] = []
    for path, cnt in sorted(counts.items(), key=lambda x: str(x[0])):
        rel = path.relative_to(DB_DIR)
        rel_str = str(rel) if str(rel) != "." else "."
        lines.append(f"{rel_str} {cnt}")
    return lines


def main() -> None:
    if not DB_DIR.exists():
        raise SystemExit(f"Database folder not found: {DB_DIR}")

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    counts: Dict[Path, int] = defaultdict(int)
    object_files = sorted(DB_DIR.rglob("objects.json"))

    for obj_file in object_files:
        objs = load_objects(obj_file)
        if not objs:
            continue
        accumulate_counts(counts, obj_file.parent, len(objs))

    count_lines = build_simple_counts(counts)
    COUNT_FILE.write_text("\n".join(count_lines))

    print(f"Wrote folder counts to {COUNT_FILE}.")


if __name__ == "__main__":
    main()
