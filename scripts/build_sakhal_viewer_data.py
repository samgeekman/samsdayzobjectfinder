#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageFilter

import build_viewer_data as shared

GRID_COORD_SIZE = 256.0
DEFAULT_WORLD_SIZE = 15360
DEFAULT_IMAGE_INPUT = "sakhal mao.webp"
DEFAULT_JSON_INPUT = "sakhal.json"
SUPPORTED_TYPE_PREFIXES = ("land_", "static")


def average_color(colors: list[tuple[int, int, int]]) -> tuple[float, float, float]:
    total = len(colors) or 1
    return (
        sum(color[0] for color in colors) / total,
        sum(color[1] for color in colors) / total,
        sum(color[2] for color in colors) / total,
    )


def color_distance(a: tuple[int, int, int], b: tuple[float, float, float]) -> float:
    return math.sqrt(
        (a[0] - b[0]) ** 2 +
        (a[1] - b[1]) ** 2 +
        (a[2] - b[2]) ** 2
    )


def pixel_saturation(pixel: tuple[int, int, int]) -> int:
    return max(pixel) - min(pixel)


def classify_pixel(
    pixel: tuple[int, int, int],
    water_reference: tuple[float, float, float],
) -> str | None:
    r, g, b = pixel
    avg = (r + g + b) / 3
    saturation = pixel_saturation(pixel)
    water_distance = color_distance(pixel, water_reference)

    if (water_distance <= 24 and avg < 220) or (b >= g and (b - r) >= 6 and avg >= 150 and saturation <= 26):
        return "water"
    if g >= b + 4 and g >= r + 8 and g >= 135:
        return "plants"
    if avg >= 214 or (avg >= 188 and saturation <= 14):
        return "rocks"
    return None


def load_image_grids(image_path: Path, grid_size: int) -> dict[str, list[int]]:
    image = Image.open(image_path).convert("RGB")
    water_reference = average_color([
        image.getpixel((0, 0)),
        image.getpixel((image.width - 1, 0)),
        image.getpixel((0, image.height - 1)),
        image.getpixel((image.width - 1, image.height - 1)),
    ])
    reduced = image.resize((grid_size, grid_size), Image.Resampling.BILINEAR)
    softened = reduced.filter(ImageFilter.GaussianBlur(radius=1.2))

    grids = {
        "plants": [0] * (grid_size * grid_size),
        "structures": [0] * (grid_size * grid_size),
        "rocks": [0] * (grid_size * grid_size),
        "water": [0] * (grid_size * grid_size),
    }
    pixels = softened.load()
    for y in range(grid_size):
        for x in range(grid_size):
            layer = classify_pixel(pixels[x, y], water_reference)
            if layer is None:
                continue
            target_y = grid_size - 1 - y
            grids[layer][target_y * grid_size + x] = 1
    return grids


def should_include_icon(name: str, icon: dict[str, object]) -> bool:
    key = name.lower().strip()
    return key.startswith(SUPPORTED_TYPE_PREFIXES) and bool(icon.get("p"))


def icon_family(icon: dict[str, object]) -> str:
    usages = icon.get("u") or []
    if isinstance(usages, list) and usages:
        return str(usages[0]).strip().lower()
    fallback = str(icon.get("f") or "misc").strip().lower()
    return fallback or "misc"


def humanize_icon_name(name: str) -> str:
    return shared.humanize(name)


def grid_to_world_x(value_x: float, value_y: float, world_size: int) -> float:
    return ((value_x + GRID_COORD_SIZE) / GRID_COORD_SIZE) * world_size


def grid_to_world_y(value_x: float, value_y: float, world_size: int) -> float:
    return (value_y / GRID_COORD_SIZE) * world_size


def icon_match_keys(name: str) -> list[str]:
    base = name.lower().strip()
    keys = [base]
    if base.startswith("land_"):
        stem = base[5:]
        keys.extend([stem, stem + ".p3d"])
    elif base.startswith("static"):
        keys.append(base + ".p3d")
    deduped = []
    seen = set()
    for key in keys:
        normalized = key.strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped


def add_structure_density(
    grids: dict[str, list[int]],
    world_x: float,
    world_y: float,
    world_size: int,
    grid_size: int,
) -> None:
    index = shared.to_cell_index(
        int(world_x),
        int(world_y),
        0,
        0,
        world_size,
        world_size,
        grid_size,
    )
    grids["structures"][index] += 1


def build_dataset(
    json_path: Path,
    image_path: Path,
    tiles_output: Path,
    output_path: Path,
    grid_size: int,
    max_edge: int,
    tile_size: int,
) -> dict[str, object]:
    source = json.loads(json_path.read_text())
    info = source.get("info") or {}
    icons = (source.get("markers") or {}).get("icons") or {}
    world_size = int(info.get("size") or DEFAULT_WORLD_SIZE)

    grids = load_image_grids(image_path, grid_size)
    family_counts: Counter[str] = Counter()
    family_types: defaultdict[str, set[str]] = defaultdict(set)
    types = []

    for name, icon in icons.items():
        if not isinstance(icon, dict) or not should_include_icon(name, icon):
            continue
        raw_points = icon.get("p") or []
        points = []
        for entry in raw_points:
            if not isinstance(entry, list) or not entry:
                continue
            coords = entry[0]
            if not isinstance(coords, list) or len(coords) < 2:
                continue
            coord_x = float(coords[0])
            coord_y = float(coords[1])
            world_x = round(grid_to_world_x(coord_x, coord_y, world_size), 2)
            world_y = round(grid_to_world_y(coord_x, coord_y, world_size), 2)
            points.extend((world_x, world_y))
            add_structure_density(grids, world_x, world_y, world_size, grid_size)
        if not points:
            continue
        family = icon_family(icon)
        family_counts[family] += len(points) // 2
        family_types[family].add(name)
        types.append(
            {
                "id": name,
                "path": name,
                "family": family,
                "label": humanize_icon_name(name),
                "count": len(points) // 2,
                "points": points,
                "matchKeys": icon_match_keys(name),
            }
        )

    bounds = {
        "minX": 0,
        "minY": 0,
        "maxX": world_size,
        "maxY": world_size,
        "width": world_size,
        "height": world_size,
    }
    backdrop = shared.render_backdrop_tiles(
        grids,
        bounds,
        tiles_output,
        max_edge,
        tile_size,
        True,
    )

    families = []
    for family, count in family_counts.most_common():
        families.append(
            {
                "id": family,
                "label": shared.humanize(family),
                "path": family,
                "count": count,
                "typeCount": len(family_types[family]),
            }
        )

    types.sort(key=lambda item: item["count"], reverse=True)

    dataset = {
        "meta": {
            "source": json_path.name,
            "imageSource": image_path.name,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "gridSize": grid_size,
            "worldSize": world_size,
            "backdropMaxEdge": max_edge,
            "backdropTileSize": tile_size,
            "backdropLevels": len(backdrop["levels"]),
            "selectableFamilies": len(families),
            "selectableTypes": len(types),
            "selectablePlacements": sum(item["count"] for item in types),
            "plantPlacements": sum(grids["plants"]),
            "roadPlacements": 0,
            "structurePlacements": sum(item["count"] for item in types),
            "rockPlacements": sum(grids["rocks"]),
            "waterPlacements": sum(grids["water"]),
            "solidWater": True,
            "hybridBackdrop": True,
        },
        "bounds": bounds,
        "backdrop": backdrop,
        "families": families,
        "types": types,
    }
    output_path.write_text(json.dumps(dataset, separators=(",", ":")), encoding="utf-8")
    return dataset


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build Sakhal viewer data from sakhal.json plus a stylized underlay derived from the map image."
    )
    parser.add_argument("--json-input", default=DEFAULT_JSON_INPUT)
    parser.add_argument("--image-input", default=DEFAULT_IMAGE_INPUT)
    parser.add_argument("-o", "--output", default="static/data/sakhal-viewer-data.json")
    parser.add_argument("--image-output", default="static/data/sakhal-backdrop-tiles")
    parser.add_argument("--grid-size", type=int, default=shared.GRID_SIZE)
    parser.add_argument("--backdrop-max-edge", type=int, default=shared.BACKDROP_MAX_EDGE)
    parser.add_argument("--tile-size", type=int, default=shared.BACKDROP_TILE_SIZE)
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    dataset = build_dataset(
        Path(args.json_input),
        Path(args.image_input),
        Path(args.image_output),
        output_path,
        args.grid_size,
        args.backdrop_max_edge,
        args.tile_size,
    )
    print(f"Wrote {output_path}")
    print(f"Wrote {args.image_output}")
    print(
        "Selectable types:",
        dataset["meta"]["selectableTypes"],
        "placements:",
        dataset["meta"]["selectablePlacements"],
    )


if __name__ == "__main__":
    main()
