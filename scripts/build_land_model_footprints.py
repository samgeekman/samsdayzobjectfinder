#!/usr/bin/env python3

from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path
from PIL import Image, ImageDraw


REPO_ROOT = Path(r"C:\Users\Samjo\OneDrive\Documents\GitHub\samsdayzobjectfinder")
CATALOG_ROOT = Path(r"P:\2026-03-17\dz_catalog_full")
OUTPUT_PATH = REPO_ROOT / "reports" / "land_model_footprints.json"
LAND_MODELS_PATHS = [
    REPO_ROOT / "static" / "data" / "object-map-v2" / "land_only_pack" / "models.json",
    REPO_ROOT / "static" / "data" / "object-map-v2" / "worlds" / "livonia" / "land_only_pack" / "models.json",
    REPO_ROOT / "static" / "data" / "object-map-v2" / "worlds" / "sakhal" / "land_only_pack" / "models.json",
]


def normalize_path(value: str | None) -> str:
    return str(value or "").strip().replace("\\", "/").lower()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def build_catalog_lookup() -> dict[str, dict]:
    payload = load_json(CATALOG_ROOT / "index.json")
    lookup: dict[str, dict] = {}
    for item in payload:
      source_rel = str(item.get("source_rel") or "").replace("\\", "/")
      obj_rel = str(item.get("obj_rel") or "").replace("\\", "/")
      if not source_rel or not obj_rel:
          continue
      exact_shape = "dz/" + source_rel.replace("_mlod.p3d", ".p3d")
      lookup[normalize_path(exact_shape)] = item
    return lookup


def parse_obj(path: Path) -> tuple[list[tuple[float, float, float]], list[tuple[int, int, int]]]:
    vertices: list[tuple[float, float, float]] = []
    triangles: list[tuple[int, int, int]] = []
    with path.open("r", encoding="utf-8", errors="ignore") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("v "):
                _, xs, ys, zs = line.split()[:4]
                vertices.append((float(xs), float(ys), float(zs)))
                continue
            if not line.startswith("f "):
                continue
            parts = line.split()[1:]
            face: list[int] = []
            for part in parts:
                token = part.split("/")[0]
                if not token:
                    continue
                face.append(int(token) - 1)
            if len(face) < 3:
                continue
            for idx in range(1, len(face) - 1):
                triangles.append((face[0], face[idx], face[idx + 1]))
    return vertices, triangles


def polygon_area(points: list[tuple[float, float]]) -> float:
    if len(points) < 3:
        return 0.0
    area = 0.0
    for idx, (x1, y1) in enumerate(points):
        x2, y2 = points[(idx + 1) % len(points)]
        area += x1 * y2 - x2 * y1
    return area / 2.0


def remove_collinear(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(points) < 4:
        return points[:]
    cleaned: list[tuple[float, float]] = []
    total = len(points)
    for idx in range(total):
        prev = points[idx - 1]
        curr = points[idx]
        nxt = points[(idx + 1) % total]
        cross = (curr[0] - prev[0]) * (nxt[1] - curr[1]) - (curr[1] - prev[1]) * (nxt[0] - curr[0])
        if abs(cross) < 1e-9:
            continue
        cleaned.append(curr)
    return cleaned if len(cleaned) >= 3 else points[:]


def rdp(points: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    if len(points) < 3:
        return points[:]

    def point_line_distance(point, start, end) -> float:
        if start == end:
            return math.dist(point, start)
        px, py = point
        x1, y1 = start
        x2, y2 = end
        numerator = abs((y2 - y1) * px - (x2 - x1) * py + x2 * y1 - y2 * x1)
        denominator = math.hypot(y2 - y1, x2 - x1)
        return numerator / denominator

    max_distance = 0.0
    index = 0
    start = points[0]
    end = points[-1]
    for idx in range(1, len(points) - 1):
        distance = point_line_distance(points[idx], start, end)
        if distance > max_distance:
            index = idx
            max_distance = distance
    if max_distance <= epsilon:
        return [start, end]
    left = rdp(points[: index + 1], epsilon)
    right = rdp(points[index:], epsilon)
    return left[:-1] + right


def simplify_loop(loop: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    if len(loop) < 4:
        return loop[:]
    working = remove_collinear(loop)
    if len(working) < 4:
        return working
    closed = working + [working[0]]
    simplified = rdp(closed, epsilon)
    if simplified and simplified[0] == simplified[-1]:
        simplified = simplified[:-1]
    simplified = remove_collinear(simplified)
    return simplified if len(simplified) >= 3 else working


def mask_to_outer_loop(mask: Image.Image, min_x: float, max_z: float, cell: float, pad: int) -> list[list[float]]:
    pixels = mask.load()
    width, height = mask.size
    occupied = {
        (x, y)
        for y in range(height)
        for x in range(width)
        if pixels[x, y] > 0
    }
    if not occupied:
        return []

    edges: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    for x, y in occupied:
        if (x, y - 1) not in occupied:
            edges[(x, y)].append((x + 1, y))
        if (x + 1, y) not in occupied:
            edges[(x + 1, y)].append((x + 1, y + 1))
        if (x, y + 1) not in occupied:
            edges[(x + 1, y + 1)].append((x, y + 1))
        if (x - 1, y) not in occupied:
            edges[(x, y + 1)].append((x, y))

    loops: list[list[tuple[int, int]]] = []
    while edges:
        start = next(iter(edges))
        current = start
        loop = [current]
        while True:
            next_points = edges.get(current)
            if not next_points:
                break
            nxt = next_points.pop(0)
            if not next_points:
                edges.pop(current, None)
            current = nxt
            if current == start:
                break
            loop.append(current)
        if len(loop) >= 3:
            loops.append(loop)

    if not loops:
        return []

    def grid_to_local(point: tuple[int, int]) -> tuple[float, float]:
        gx, gy = point
        lx = min_x + (gx - pad) * cell
        lz = max_z - (gy - pad) * cell
        return (round(lx, 3), round(lz, 3))

    local_loops = [[grid_to_local(point) for point in loop] for loop in loops]
    outer = max(local_loops, key=lambda pts: abs(polygon_area(pts)))
    if polygon_area(outer) < 0:
        outer = list(reversed(outer))
    simplified = simplify_loop(outer, epsilon=max(cell * 1.35, 0.18))
    return [[round(x, 3), round(z, 3)] for x, z in simplified]


def build_mask(vertices: list[tuple[float, float, float]], triangles: list[tuple[int, int, int]]) -> tuple[Image.Image, float, float, float, int]:
    xs = [vertex[0] for vertex in vertices]
    zs = [vertex[2] for vertex in vertices]
    min_x = min(xs)
    max_x = max(xs)
    min_z = min(zs)
    max_z = max(zs)
    width = max_x - min_x
    depth = max_z - min_z
    cell = min(0.25, max(0.08, max(width, depth) / 280.0))
    pad = 3
    img_w = max(8, int(math.ceil(width / cell)) + pad * 2 + 1)
    img_h = max(8, int(math.ceil(depth / cell)) + pad * 2 + 1)
    image = Image.new("L", (img_w, img_h), 0)
    draw = ImageDraw.Draw(image)

    def project(point: tuple[float, float, float]) -> tuple[float, float]:
        x, _, z = point
        px = (x - min_x) / cell + pad
        py = (max_z - z) / cell + pad
        return (px, py)

    for a, b, c in triangles:
        polygon = [project(vertices[a]), project(vertices[b]), project(vertices[c])]
        draw.polygon(polygon, fill=255)

    return image, min_x, max_z, cell, pad


def build_footprint_for_obj(obj_path: Path) -> dict | None:
    vertices, triangles = parse_obj(obj_path)
    if not vertices or not triangles:
        return None
    mask, min_x, max_z, cell, pad = build_mask(vertices, triangles)
    outer = mask_to_outer_loop(mask, min_x, max_z, cell, pad)
    if len(outer) < 3:
        return None
    return {
        "points": outer,
        "source": "obj_silhouette",
        "cell": round(cell, 3),
        "pointCount": len(outer),
        "obj": str(obj_path),
    }


def target_shape_paths() -> set[str]:
    targets: set[str] = set()
    for models_path in LAND_MODELS_PATHS:
        if not models_path.exists():
            continue
        payload = load_json(models_path)
        for model in payload.get("models", []):
            type_name = str(model[1] if len(model) > 1 else "").strip()
            shape_path = normalize_path(model[3] if len(model) > 3 else "")
            if not type_name.startswith("Land_") or not shape_path:
                continue
            targets.add(shape_path)
    return targets


def main() -> None:
    catalog_lookup = build_catalog_lookup()
    targets = target_shape_paths()
    results: dict[str, dict] = {}
    missing: list[str] = []
    for shape_path in sorted(targets):
        item = catalog_lookup.get(shape_path)
        if not item:
            missing.append(shape_path)
            continue
        obj_rel = item.get("obj_rel")
        if not obj_rel:
            missing.append(shape_path)
            continue
        obj_path = CATALOG_ROOT / str(obj_rel)
        if not obj_path.exists():
            missing.append(shape_path)
            continue
        footprint = build_footprint_for_obj(obj_path)
        if footprint:
            results[shape_path] = footprint
        else:
            missing.append(shape_path)
    payload = {
        "count": len(results),
        "missingCount": len(missing),
        "footprints": results,
        "missing": missing,
    }
    save_json(OUTPUT_PATH, payload)
    print(f"Wrote {OUTPUT_PATH} with {len(results)} footprints; missing {len(missing)}")


if __name__ == "__main__":
    main()
