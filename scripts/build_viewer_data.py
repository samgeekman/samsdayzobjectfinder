#!/usr/bin/env python3

from __future__ import annotations

import argparse
import binascii
import json
import math
import re
import shutil
import struct
import zlib
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

PATH_RE = re.compile(r'\["([^"]+\.p3d)"')
PLACEMENT_RE = re.compile(r"\[(\d+),\[(\-?\d+),(\-?\d+)\]\]")

SELECTABLE_PREFIXES = ("dz/structures/", "dz/structures_bliss/")
PLANT_PREFIXES = ("dz/plants/", "dz/plants_bliss/")
ROCK_PREFIXES = ("dz/rocks/", "dz/rocks_bliss/")
WATER_PREFIXES = ("dz/water/", "dz/water_bliss/")
ROAD_PREFIXES = ("dz/structures/roads/", "dz/structures_bliss/roads/")

GRID_SIZE = 1024
BACKDROP_MAX_EDGE = 4096
BACKDROP_TILE_SIZE = 512

LAYER_COLORS = {
    "plants": ((246, 240, 229), (86, 118, 60), 0.70),
    "structures": ((0, 0, 0), (173, 120, 76), 0.34),
    "rocks": ((0, 0, 0), (176, 171, 163), 0.16),
    "water": ((0, 0, 0), (112, 160, 188), 0.72),
}
SOLID_WATER_COLOR = (70, 131, 214)


def normalize_path(raw_path: str) -> str:
    return raw_path.replace("\\", "/")


def humanize(value: str) -> str:
    stem = Path(value).stem if value.endswith(".p3d") else value
    text = stem.replace("_", " ").replace("-", " ").strip()
    return " ".join(word.capitalize() for word in text.split())


def family_for_path(path: str) -> str | None:
    if not path.startswith(SELECTABLE_PREFIXES):
        return None
    parts = path.split("/")
    if len(parts) >= 3:
        return "/".join(parts[:3])
    return path


def layer_for_path(path: str) -> str | None:
    if path.startswith(PLANT_PREFIXES):
        return "plants"
    if path.startswith(ROAD_PREFIXES):
        return "roads"
    if path.startswith(SELECTABLE_PREFIXES):
        return "structures"
    if path.startswith(ROCK_PREFIXES):
        return "rocks"
    if path.startswith(WATER_PREFIXES):
        return "water"
    return None


def should_contribute_to_bounds(path: str) -> bool:
    layer = layer_for_path(path)
    return layer in {"plants", "structures", "rocks", "water"}


def stream_placements(source: Path):
    current_path = None
    with source.open("r", encoding="utf-16", errors="ignore", newline="") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            path_match = PATH_RE.search(line)
            if path_match:
                current_path = normalize_path(path_match.group(1))
                continue
            if current_path is None or ",[" not in line:
                continue
            point_match = PLACEMENT_RE.search(line)
            if point_match is None:
                continue
            yield current_path, int(point_match.group(2)), int(point_match.group(3))


def clamp(value: float, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, int(value)))


def to_cell_index(
    x: int,
    y: int,
    min_x: int,
    min_y: int,
    width: int,
    height: int,
    grid_size: int,
) -> int:
    norm_x = (x - min_x) / width if width else 0
    norm_y = (y - min_y) / height if height else 0
    cell_x = clamp(math.floor(norm_x * grid_size), 0, grid_size - 1)
    cell_y = clamp(math.floor(norm_y * grid_size), 0, grid_size - 1)
    return cell_y * grid_size + cell_x


def output_dimensions(width: int, height: int, max_edge: int) -> tuple[int, int]:
    if width >= height:
        output_width = max_edge
        output_height = max(1, round(height / width * max_edge))
    else:
        output_height = max_edge
        output_width = max(1, round(width / height * max_edge))
    return output_width, output_height


def normalize_grid(values: list[int]) -> list[float]:
    max_value = max(values) if values else 0
    if max_value <= 0:
        return [0.0] * len(values)
    scale = math.log(max_value + 1)
    return [math.log(value + 1) / scale if value > 0 else 0.0 for value in values]


def bilinear_sample(values: list[float], grid_size: int, gx: float, gy: float) -> float:
    x0 = clamp(math.floor(gx), 0, grid_size - 1)
    y0 = clamp(math.floor(gy), 0, grid_size - 1)
    x1 = min(grid_size - 1, x0 + 1)
    y1 = min(grid_size - 1, y0 + 1)
    tx = gx - x0
    ty = gy - y0

    top = values[y0 * grid_size + x0] * (1 - tx) + values[y0 * grid_size + x1] * tx
    bottom = values[y1 * grid_size + x0] * (1 - tx) + values[y1 * grid_size + x1] * tx
    return top * (1 - ty) + bottom * ty


def blend(base: tuple[float, float, float], color: tuple[int, int, int], alpha: float):
    return tuple(base[index] * (1 - alpha) + color[index] * alpha for index in range(3))


def png_chunk(tag: bytes, data: bytes) -> bytes:
    checksum = binascii.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", checksum)


def write_png(path: Path, width: int, height: int, rgba: bytes) -> None:
    stride = width * 4
    raw = bytearray()
    for row in range(height):
        raw.append(0)
        start = row * stride
        raw.extend(rgba[start : start + stride])

    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png.extend(
        png_chunk(
            b"IHDR",
            struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0),
        )
    )
    png.extend(png_chunk(b"IDAT", zlib.compress(bytes(raw), level=9)))
    png.extend(png_chunk(b"IEND", b""))
    path.write_bytes(bytes(png))


def render_backdrop_rgba(
    normalized: dict[str, list[float]],
    output_width: int,
    output_height: int,
    solid_water: bool,
) -> bytes:
    image = bytearray(output_width * output_height * 4)

    for y in range(output_height):
        gy = 0 if output_height == 1 else y * (GRID_SIZE - 1) / (output_height - 1)
        for x in range(output_width):
            gx = 0 if output_width == 1 else x * (GRID_SIZE - 1) / (output_width - 1)
            color = tuple(float(value) for value in LAYER_COLORS["plants"][0])

            plant_density = bilinear_sample(normalized["plants"], GRID_SIZE, gx, gy)
            if plant_density > 0:
                color = blend(color, LAYER_COLORS["plants"][1], plant_density * LAYER_COLORS["plants"][2])

            structure_density = bilinear_sample(normalized["structures"], GRID_SIZE, gx, gy)
            if structure_density > 0:
                color = blend(
                    color,
                    LAYER_COLORS["structures"][1],
                    structure_density * LAYER_COLORS["structures"][2],
                )

            rock_density = bilinear_sample(normalized["rocks"], GRID_SIZE, gx, gy)
            if rock_density > 0:
                color = blend(color, LAYER_COLORS["rocks"][1], rock_density * LAYER_COLORS["rocks"][2])

            water_density = bilinear_sample(normalized["water"], GRID_SIZE, gx, gy)
            if water_density > 0:
                if solid_water and water_density >= 0.015:
                    color = tuple(float(value) for value in SOLID_WATER_COLOR)
                else:
                    color = blend(color, LAYER_COLORS["water"][1], water_density * LAYER_COLORS["water"][2])

            pixel = (y * output_width + x) * 4
            image[pixel] = round(color[0])
            image[pixel + 1] = round(color[1])
            image[pixel + 2] = round(color[2])
            image[pixel + 3] = 255

    return bytes(image)


def write_tiled_level(
    rgba: bytes,
    width: int,
    height: int,
    output_dir: Path,
    tile_size: int,
) -> dict[str, int]:
    cols = math.ceil(width / tile_size)
    rows = math.ceil(height / tile_size)
    stride = width * 4

    output_dir.mkdir(parents=True, exist_ok=True)

    for row in range(rows):
        tile_height = min(tile_size, height - row * tile_size)
        for col in range(cols):
            tile_width = min(tile_size, width - col * tile_size)
            tile = bytearray(tile_width * tile_height * 4)

            for tile_y in range(tile_height):
                src_y = row * tile_size + tile_y
                src_start = src_y * stride + col * tile_size * 4
                src_end = src_start + tile_width * 4
                dest_start = tile_y * tile_width * 4
                tile[dest_start : dest_start + tile_width * 4] = rgba[src_start:src_end]

            write_png(output_dir / f"r{row}-c{col}.png", tile_width, tile_height, bytes(tile))

    return {
        "width": width,
        "height": height,
        "cols": cols,
        "rows": rows,
    }


def backdrop_level_edges(max_edge: int, tile_size: int) -> list[int]:
    edge = min(tile_size, max_edge)
    edges = [edge]

    while edge < max_edge:
        edge = min(max_edge, edge * 2)
        if edge != edges[-1]:
            edges.append(edge)

    return edges


def render_backdrop_tiles(
    grids: dict[str, list[int]],
    bounds: dict[str, int],
    output_dir: Path,
    max_edge: int,
    tile_size: int,
    solid_water: bool,
) -> dict[str, object]:
    full_width, full_height = output_dimensions(bounds["width"], bounds["height"], max_edge)
    normalized = {
        name: normalize_grid(values)
        for name, values in grids.items()
        if name in ("plants", "structures", "rocks", "water")
    }
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    levels = []
    for level_index, edge in enumerate(backdrop_level_edges(max_edge, tile_size)):
        level_width, level_height = output_dimensions(bounds["width"], bounds["height"], edge)
        rgba = render_backdrop_rgba(normalized, level_width, level_height, solid_water)
        level_id = f"z{level_index}"
        level_dir = output_dir / level_id
        level_meta = write_tiled_level(rgba, level_width, level_height, level_dir, tile_size)
        levels.append(
            {
                "id": level_id,
                "path": f"./data/{output_dir.name}/{level_id}",
                **level_meta,
            }
        )

    return {
        "format": "tiled-png",
        "tileSize": tile_size,
        "width": full_width,
        "height": full_height,
        "levels": levels,
    }


def build_dataset(
    source: Path,
    tiles_output: Path,
    grid_size: int,
    max_edge: int,
    tile_size: int,
    solid_water: bool,
) -> dict[str, object]:
    min_x = math.inf
    min_y = math.inf
    max_x = -math.inf
    max_y = -math.inf

    totals = Counter()
    family_counts = Counter()
    family_types = defaultdict(set)
    type_counts = Counter()

    placements = list(stream_placements(source))
    for path, x, y in placements:
        layer = layer_for_path(path)
        if layer:
            totals[layer] += 1

        if should_contribute_to_bounds(path):
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)

        family = family_for_path(path)
        if family is None:
            continue
        type_counts[path] += 1
        family_counts[family] += 1
        family_types[family].add(path)

    if math.isinf(min_x):
        raise ValueError(f"No placements found in {source}")

    width = max(1, int(max_x - min_x + 1))
    height = max(1, int(max_y - min_y + 1))

    grids = {
        "plants": [0] * (grid_size * grid_size),
        "structures": [0] * (grid_size * grid_size),
        "rocks": [0] * (grid_size * grid_size),
        "water": [0] * (grid_size * grid_size),
    }
    type_points: dict[str, list[int]] = {path: [] for path in type_counts}

    for path, x, y in placements:
        layer = layer_for_path(path)
        if layer in grids and should_contribute_to_bounds(path):
            index = to_cell_index(x, y, int(min_x), int(min_y), width, height, grid_size)
            grids[layer][index] += 1

        if path in type_points:
            type_points[path].extend((x, y))

    bounds = {
        "minX": int(min_x),
        "minY": int(min_y),
        "maxX": int(max_x),
        "maxY": int(max_y),
        "width": width,
        "height": height,
    }
    backdrop = render_backdrop_tiles(grids, bounds, tiles_output, max_edge, tile_size, solid_water)

    families = []
    for family, count in family_counts.most_common():
        families.append(
            {
                "id": family,
                "label": humanize(family.split("/")[-1]),
                "path": family,
                "count": count,
                "typeCount": len(family_types[family]),
            }
        )

    types = []
    for path, count in type_counts.most_common():
        family = family_for_path(path)
        types.append(
            {
                "id": path,
                "path": path,
                "family": family,
                "label": humanize(path),
                "count": count,
                "points": type_points[path],
            }
        )

    return {
        "meta": {
            "source": source.name,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "gridSize": grid_size,
            "backdropMaxEdge": max_edge,
            "backdropTileSize": tile_size,
            "solidWater": solid_water,
            "backdropLevels": len(backdrop["levels"]),
            "selectableFamilies": len(families),
            "selectableTypes": len(types),
            "selectablePlacements": sum(type_counts.values()),
            "plantPlacements": totals["plants"],
            "roadPlacements": totals["roads"],
            "structurePlacements": sum(type_counts.values()),
            "rockPlacements": totals["rocks"],
            "waterPlacements": totals["water"],
        },
        "bounds": bounds,
        "backdrop": backdrop,
        "families": families,
        "types": types,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a compact dataset and tiled backdrop pyramid for the lightweight map viewer."
    )
    parser.add_argument("source")
    parser.add_argument(
        "-o",
        "--output",
        required=True,
        help="Output JSON path.",
    )
    parser.add_argument(
        "--image-output",
        required=True,
        help="Backdrop tile output directory.",
    )
    parser.add_argument(
        "--grid-size",
        type=int,
        default=GRID_SIZE,
        help="Square density grid size used to derive the backdrop image.",
    )
    parser.add_argument(
        "--backdrop-max-edge",
        type=int,
        default=BACKDROP_MAX_EDGE,
        help="Maximum width or height of the generated backdrop image.",
    )
    parser.add_argument(
        "--tile-size",
        type=int,
        default=BACKDROP_TILE_SIZE,
        help="Tile edge size for generated backdrop tiles.",
    )
    parser.add_argument(
        "--solid-water",
        action="store_true",
        help="Render water cells as a solid blue overlay instead of density blending.",
    )
    args = parser.parse_args()

    source = Path(args.source)
    output = Path(args.output)
    tiles_output = Path(args.image_output)
    output.parent.mkdir(parents=True, exist_ok=True)

    dataset = build_dataset(
        source,
        tiles_output,
        args.grid_size,
        args.backdrop_max_edge,
        args.tile_size,
        args.solid_water,
    )
    output.write_text(json.dumps(dataset, separators=(",", ":")), encoding="utf-8")

    print(f"Wrote {output}")
    print(f"Wrote {tiles_output}")
    print(
        "Selectable types:",
        dataset["meta"]["selectableTypes"],
        "placements:",
        dataset["meta"]["selectablePlacements"],
    )


if __name__ == "__main__":
    main()
