#!/usr/bin/env python3
"""Build mapgrouppos + mapgroupproto proxy entries from Editor JSON placements.

Primary use-case:
- Table type: StaticObj_Misc_Table_Market
- Item type(s): BandageDressing

This converts world-space placements into local proxy offsets relative to each
table's transform, so the same result can spawn through CLE mapgroupproto
dispatch instead of direct Editor JSON objects.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


def to_float3(value: object, default: Tuple[float, float, float]) -> Tuple[float, float, float]:
    if isinstance(value, list) and len(value) >= 3:
        out: List[float] = []
        for idx in range(3):
            try:
                out.append(float(value[idx]))
            except (TypeError, ValueError):
                out.append(default[idx])
        return out[0], out[1], out[2]
    return default


def normalize_type_name(value: object) -> str:
    return str(value or "").strip()


def parse_editor_objects(path: Path) -> List[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise SystemExit(f"Expected a JSON array at {path}")
    return [row for row in raw if isinstance(row, dict)]


def yaw_rad_from_orientation(orientation: Tuple[float, float, float]) -> float:
    # DayZ orientation in this dataset has yaw in the 3rd slot.
    return math.radians(float(orientation[2]))


def world_delta_to_local_xy(
    dx: float,
    dz: float,
    table_yaw_rad: float,
) -> Tuple[float, float]:
    # local = R(-yaw) * world_delta
    c = math.cos(table_yaw_rad)
    s = math.sin(table_yaw_rad)
    lx = c * dx + s * dz
    lz = -s * dx + c * dz
    return lx, lz


def nearest_table_index(
    item_pos: Tuple[float, float, float],
    tables: List[dict],
    max_distance_2d: float,
) -> Optional[int]:
    best_idx: Optional[int] = None
    best_d2 = float("inf")
    max_d2 = max_distance_2d * max_distance_2d
    for idx, table in enumerate(tables):
        tx, _, tz = table["pos"]
        dx = item_pos[0] - tx
        dz = item_pos[2] - tz
        d2 = dx * dx + dz * dz
        if d2 > max_d2:
            continue
        if d2 < best_d2:
            best_d2 = d2
            best_idx = idx
    return best_idx


def format_triplet(values: Iterable[float], decimals: int = 6) -> str:
    return " ".join(f"{float(v):.{decimals}f}" for v in values)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Path to Editor JSON (array of objects).",
    )
    parser.add_argument(
        "--table-type",
        default="StaticObj_Misc_Table_Market",
        help="Object Type used as the table anchor.",
    )
    parser.add_argument(
        "--item-types",
        default="BandageDressing",
        help="Comma-separated item types to turn into proxies.",
    )
    parser.add_argument(
        "--group-prefix",
        default="TraderTable",
        help="Prefix for generated group names.",
    )
    parser.add_argument(
        "--max-distance",
        type=float,
        default=3.0,
        help="Maximum 2D distance (meters) to attach an item to the nearest table.",
    )
    parser.add_argument(
        "--usage",
        default="Town",
        help="Usage tag for generated mapgroupproto groups.",
    )
    parser.add_argument(
        "--category",
        default="medical",
        help="Container category for generated mapgroupproto groups.",
    )
    parser.add_argument(
        "--out-pos",
        type=Path,
        default=Path("docs/generated_trader_mapgrouppos.xml"),
        help="Output path for mapgrouppos snippet.",
    )
    parser.add_argument(
        "--out-proto",
        type=Path,
        default=Path("docs/generated_trader_mapgroupproto.xml"),
        help="Output path for mapgroupproto snippet.",
    )
    args = parser.parse_args()

    rows = parse_editor_objects(args.input)
    table_type = normalize_type_name(args.table_type)
    item_types = {normalize_type_name(x) for x in str(args.item_types).split(",") if normalize_type_name(x)}
    if not table_type:
        raise SystemExit("table-type cannot be empty")
    if not item_types:
        raise SystemExit("item-types cannot be empty")

    tables: List[Dict[str, object]] = []
    for row in rows:
        if normalize_type_name(row.get("Type")) != table_type:
            continue
        pos = to_float3(row.get("Position"), (0.0, 0.0, 0.0))
        ori = to_float3(row.get("Orientation"), (0.0, 0.0, 0.0))
        tables.append(
            {
                "type": table_type,
                "pos": pos,
                "ori": ori,
                "yaw_rad": yaw_rad_from_orientation(ori),
                "items": [],
            }
        )

    if not tables:
        raise SystemExit(f"No table entries found for Type='{table_type}'")

    unmatched = 0
    for row in rows:
        item_type = normalize_type_name(row.get("Type"))
        if item_type not in item_types:
            continue
        item_pos = to_float3(row.get("Position"), (0.0, 0.0, 0.0))
        item_ori = to_float3(row.get("Orientation"), (0.0, 0.0, 0.0))
        table_idx = nearest_table_index(item_pos, tables, args.max_distance)
        if table_idx is None:
            unmatched += 1
            continue
        table = tables[table_idx]
        tx, ty, tz = table["pos"]
        dx = item_pos[0] - tx
        dy = item_pos[1] - ty
        dz = item_pos[2] - tz
        lx, lz = world_delta_to_local_xy(dx, dz, float(table["yaw_rad"]))
        tor = table["ori"]
        local_rpy = (
            item_ori[0] - tor[0],
            item_ori[1] - tor[1],
            item_ori[2] - tor[2],
        )
        table["items"].append(
            {
                "type": item_type,
                "pos_local": (lx, dy, lz),
                "rpy_local": local_rpy,
            }
        )

    # Keep only tables that actually got items.
    tables = [t for t in tables if t["items"]]
    if not tables:
        raise SystemExit("No matching item placements were attached to tables.")

    pos_lines: List[str] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>', "<map>"]
    proto_lines: List[str] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', "<prototype>"]

    for idx, table in enumerate(tables, start=1):
        group_name = f"{args.group_prefix}_{idx}"
        pos = table["pos"]
        ori = table["ori"]
        lootmax = len(table["items"])
        pos_lines.append(
            f'    <group name="{group_name}" pos="{format_triplet(pos)}" rpy="{format_triplet(ori)}" a="0.0" />'
        )

        proto_lines.append(f'    <group name="{group_name}" lootmax="{lootmax}">')
        proto_lines.append(f'        <usage name="{args.usage}" />')
        proto_lines.append(f'        <container name="loot" lootmax="{lootmax}">')
        proto_lines.append(f'            <category name="{args.category}" />')
        proto_lines.append("        </container>")
        proto_lines.append("        <dispatch>")
        for item in table["items"]:
            proto_lines.append(
                '            <proxy type="{type}" pos="{pos}" rpy="{rpy}" />'.format(
                    type=item["type"],
                    pos=format_triplet(item["pos_local"]),
                    rpy=format_triplet(item["rpy_local"]),
                )
            )
        proto_lines.append("        </dispatch>")
        proto_lines.append("    </group>")

    pos_lines.append("</map>")
    proto_lines.append("</prototype>")

    args.out_pos.parent.mkdir(parents=True, exist_ok=True)
    args.out_proto.parent.mkdir(parents=True, exist_ok=True)
    args.out_pos.write_text("\n".join(pos_lines) + "\n", encoding="utf-8")
    args.out_proto.write_text("\n".join(proto_lines) + "\n", encoding="utf-8")

    print(f"Wrote {args.out_pos} ({len(tables)} group(s)).")
    print(f"Wrote {args.out_proto} ({len(tables)} group(s)).")
    if unmatched:
        print(f"Unmatched items skipped (outside --max-distance): {unmatched}")


if __name__ == "__main__":
    main()
