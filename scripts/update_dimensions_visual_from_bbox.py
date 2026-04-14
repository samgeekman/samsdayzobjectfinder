#!/usr/bin/env python3
"""
Update dimensionsVisual from model_bbox_size_index.json.

Rules:
- For modelType raw p3d/p3d rows, set dimensionsVisual from bbox index by
  matching object/model stem.
- For modelType config rows with linked-p3d, copy dimensionsVisual from the
  linked p3d row in the same file.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


def normalize_model_stem(value: object) -> str:
    text = str(value or "").strip().lower().replace("\\", "/")
    if not text:
        return ""
    text = text.split("/")[-1].strip()
    text = text.replace(" .p3d", ".p3d").strip()
    if text.endswith(".p3d"):
        text = text[:-4]
    return text.strip()


def parse_size(raw: object) -> Optional[List[float]]:
    if not isinstance(raw, list) or len(raw) < 3:
        return None
    try:
        return [float(raw[0]), float(raw[1]), float(raw[2])]
    except (TypeError, ValueError):
        return None


def load_bbox_index(path: Path) -> Tuple[Dict[str, List[float]], int]:
    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    if not isinstance(payload, list):
        raise ValueError(f"{path} must contain a JSON list")

    index: Dict[str, List[float]] = {}
    conflict_count = 0
    for row in payload:
        if not isinstance(row, dict):
            continue
        key = normalize_model_stem(row.get("object_name"))
        size = parse_size(row.get("size"))
        if not key or size is None:
            continue
        prev = index.get(key)
        if prev is not None:
            # Keep first-seen value for deterministic output.
            if tuple(round(x, 6) for x in prev) != tuple(round(x, 6) for x in size):
                conflict_count += 1
            continue
        index[key] = size
    return index, conflict_count


def is_p3d_row(row: dict) -> bool:
    model_type = str(row.get("modelType") or "").strip().lower()
    return model_type in {"raw p3d", "p3d"}


def is_config_row(row: dict) -> bool:
    model_type = str(row.get("modelType") or "").strip().lower()
    return model_type == "config"


def resolve_bbox_size_for_row(row: dict, bbox_index: Dict[str, List[float]]) -> Optional[List[float]]:
    candidates: List[str] = []

    name_key = normalize_model_stem(row.get("objectName"))
    if name_key:
        candidates.append(name_key)

    path_key = normalize_model_stem(row.get("path"))
    if path_key:
        candidates.append(path_key)

    seen = set()
    for key in candidates:
        if not key or key in seen:
            continue
        seen.add(key)
        size = bbox_index.get(key)
        if size is not None:
            return size
    return None


def same_size(a: object, b: Iterable[float]) -> bool:
    if not isinstance(a, list) or len(a) < 3:
        return False
    try:
        return tuple(round(float(a[i]), 6) for i in range(3)) == tuple(round(float(v), 6) for v in list(b)[:3])
    except (TypeError, ValueError):
        return False


def update_file(path: Path, bbox_index: Dict[str, List[float]]) -> dict:
    with path.open("r", encoding="utf-8") as f:
        rows = json.load(f)
    if not isinstance(rows, list):
        raise ValueError(f"{path} must contain a JSON list")

    id_to_row = {str(r.get("id")): r for r in rows if isinstance(r, dict) and r.get("id")}

    stats = {
        "rows_total": len(rows),
        "p3d_total": 0,
        "p3d_matched": 0,
        "p3d_unmatched": 0,
        "p3d_updated": 0,
        "config_total": 0,
        "config_linked": 0,
        "config_linked_missing_target": 0,
        "config_propagated": 0,
    }

    for row in rows:
        if not isinstance(row, dict):
            continue
        if not is_p3d_row(row):
            continue
        stats["p3d_total"] += 1
        size = resolve_bbox_size_for_row(row, bbox_index)
        if size is None:
            stats["p3d_unmatched"] += 1
            continue
        stats["p3d_matched"] += 1
        if not same_size(row.get("dimensionsVisual"), size):
            row["dimensionsVisual"] = size
            stats["p3d_updated"] += 1

    for row in rows:
        if not isinstance(row, dict):
            continue
        if not is_config_row(row):
            continue
        stats["config_total"] += 1
        linked_id = str(row.get("linked-p3d") or "").strip()
        if not linked_id:
            continue
        stats["config_linked"] += 1
        target = id_to_row.get(linked_id)
        if not isinstance(target, dict):
            stats["config_linked_missing_target"] += 1
            continue
        target_size = target.get("dimensionsVisual")
        parsed_target_size = parse_size(target_size)
        if parsed_target_size is None:
            stats["config_linked_missing_target"] += 1
            continue
        if not same_size(row.get("dimensionsVisual"), parsed_target_size):
            row["dimensionsVisual"] = parsed_target_size
            stats["config_propagated"] += 1

    with path.open("w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2)
        f.write("\n")

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Update dimensionsVisual from bbox index and linked-p3d relations.")
    parser.add_argument(
        "--bbox-index",
        default="model_bbox_size_index.json",
        help="Path to model_bbox_size_index.json",
    )
    parser.add_argument(
        "--targets",
        nargs="+",
        default=[
            "data/dayz_objects.json",
            "static/data/dayz_objects.json",
            "static/api/v1/objects.full.json",
        ],
        help="JSON files to update",
    )
    args = parser.parse_args()

    bbox_path = Path(args.bbox_index)
    bbox_index, conflict_count = load_bbox_index(bbox_path)
    print(f"bbox_index: {bbox_path} usable_keys={len(bbox_index)} conflicts_skipped={conflict_count}")

    for target in args.targets:
        path = Path(target)
        stats = update_file(path, bbox_index)
        print(f"\nupdated: {path}")
        for key in [
            "rows_total",
            "p3d_total",
            "p3d_matched",
            "p3d_unmatched",
            "p3d_updated",
            "config_total",
            "config_linked",
            "config_linked_missing_target",
            "config_propagated",
        ]:
            print(f"  {key}={stats[key]}")


if __name__ == "__main__":
    main()

