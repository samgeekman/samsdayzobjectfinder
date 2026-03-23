#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import math
import re
import struct
from collections import Counter
from functools import lru_cache
from pathlib import Path

from armaio.paa import PaaFile
from PIL import Image, ImageDraw


REPO_ROOT = Path(r"C:\Users\Samjo\OneDrive\Documents\GitHub\samsdayzobjectfinder")
CATALOG_ROOT = Path(r"P:\2026-03-17\dz_catalog_full")
MLOD_ROOT = Path(r"P:\2026-03-17\mlod")
DZ_ROOT = Path(r"P:\DZ")
OUTPUT_ROOT = REPO_ROOT / "static" / "data" / "object-map-v2" / "land_roof_average"
MANIFEST_PATH = REPO_ROOT / "reports" / "land_roof_average_manifest.json"
LAND_MODELS_PATHS = [
    REPO_ROOT / "static" / "data" / "object-map-v2" / "land_only_pack" / "models.json",
    REPO_ROOT / "static" / "data" / "object-map-v2" / "worlds" / "livonia" / "land_only_pack" / "models.json",
    REPO_ROOT / "static" / "data" / "object-map-v2" / "worlds" / "sakhal" / "land_only_pack" / "models.json",
]

RVMAT_TEXTURE_RE = re.compile(r'texture\s*=\s*"([^"]+)"', re.IGNORECASE)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def read_asciiz(data: bytes, offset: int):
    end = data.index(b"\x00", offset)
    return data[offset:end].decode("utf-8", "replace"), end + 1


def normalize_path(value: str | None) -> str:
    return str(value or "").strip().replace("\\", "/").lower()


def parse_mlod(path: Path):
    data = path.read_bytes()
    offset = 0
    if data[offset:offset + 4] != b"MLOD":
        raise ValueError("MLOD signature expected")
    offset += 4
    version, = struct.unpack_from("<I", data, offset)
    offset += 4
    if version != 257:
        raise ValueError(f"Unexpected MLOD version: {version}")
    n_lods, = struct.unpack_from("<I", data, offset)
    offset += 4

    lods = []
    for lod_index in range(n_lods):
        if data[offset:offset + 4] != b"P3DM":
            raise ValueError(f"P3DM signature expected at LOD {lod_index}")
        offset += 4
        version_a, version_b, n_points, n_normals, n_faces, _unk1 = struct.unpack_from("<6I", data, offset)
        offset += 24
        if version_a != 28 or version_b != 256:
            raise ValueError(f"Unexpected P3DM version at LOD {lod_index}: {version_a}/{version_b}")

        points = []
        for _ in range(n_points):
            x, y, z, flags = struct.unpack_from("<3fI", data, offset)
            offset += 16
            points.append((x, y, z, flags))

        normals = []
        for _ in range(n_normals):
            nx, ny, nz = struct.unpack_from("<3f", data, offset)
            offset += 12
            normals.append((nx, ny, nz))

        faces = []
        for _ in range(n_faces):
            number_of_vertices, = struct.unpack_from("<i", data, offset)
            offset += 4
            vertices = []
            for _slot in range(4):
                point_index, normal_index, u, v = struct.unpack_from("<2iff", data, offset)
                offset += 16
                vertices.append(
                    {
                        "point_index": point_index,
                        "normal_index": normal_index,
                        "u": u,
                        "v": v,
                    }
                )
            flags, = struct.unpack_from("<i", data, offset)
            offset += 4
            texture, offset = read_asciiz(data, offset)
            material, offset = read_asciiz(data, offset)
            faces.append(
                {
                    "number_of_vertices": number_of_vertices,
                    "vertices": vertices,
                    "flags": flags,
                    "texture": texture,
                    "material": material,
                }
            )

        if data[offset:offset + 4] != b"TAGG":
            raise ValueError(f"TAGG expected at LOD {lod_index}")
        offset += 4
        while True:
            _active = data[offset]
            offset += 1
            tag_name, offset = read_asciiz(data, offset)
            data_size, = struct.unpack_from("<I", data, offset)
            offset += 4
            if tag_name == "#EndOfFile#":
                break
            offset += data_size
        resolution, = struct.unpack_from("<f", data, offset)
        offset += 4
        lods.append(
            {
                "index": lod_index,
                "resolution": resolution,
                "points": points,
                "normals": normals,
                "faces": faces,
            }
        )
    return lods


def choose_preview_lod(lods):
    visual = [lod for lod in lods if lod["resolution"] < 1_000_000 and lod["faces"]]
    if not visual:
        with_faces = [lod for lod in lods if lod["faces"]]
        return with_faces[0] if with_faces else None
    for lod in visual:
        if len(lod["points"]) <= 12000 and len(lod["faces"]) <= 8000:
            return lod
    return min(visual, key=lambda lod: (len(lod["faces"]), len(lod["points"]), lod["index"]))


def build_catalog_lookup() -> dict[str, dict]:
    payload = read_json(CATALOG_ROOT / "index.json")
    lookup: dict[str, dict] = {}
    for item in payload:
        source_rel = str(item.get("source_rel") or "").replace("\\", "/")
        if not source_rel:
            continue
        exact_shape = "dz/" + source_rel.replace("_mlod.p3d", ".p3d")
        lookup[normalize_path(exact_shape)] = item
    return lookup


def resolve_dz_path(texture_ref: str | None) -> Path | None:
    if not texture_ref:
        return None
    rel = str(texture_ref).replace("/", "\\")
    if rel.lower().startswith("dz\\"):
        rel = rel[3:]
    candidate = DZ_ROOT / rel
    return candidate if candidate.exists() else None


def score_rvmat_texture_ref(texture_ref: str) -> int:
    ref = texture_ref.lower()
    score = 0
    if not ref.endswith(".paa"):
        return -10_000
    if ref.startswith("#("):
        return -10_000
    if ref.endswith(("_co.paa", "_ca.paa")):
        score += 100
    if "roof" in ref:
        score += 45
    if "concrete" in ref:
        score += 25
    if "metal" in ref:
        score += 20
    if "grid" in ref:
        score += 10
    if "grass" in ref or "terrain" in ref:
        score -= 15
    if "mask" in ref:
        score -= 80
    if ref.endswith(("_mc.paa", "_ads.paa", "_as.paa", "_smdi.paa", "_dtsmdi.paa", "_nohq.paa")):
        score -= 60
    if "env_" in ref:
        score -= 40
    return score


def choose_rvmat_texture(material_ref: str | None) -> str | None:
    rvmat_path = resolve_dz_path(material_ref)
    if not rvmat_path:
        return None
    text = rvmat_path.read_text(encoding="utf-8", errors="replace")
    candidates = []
    for match in RVMAT_TEXTURE_RE.finditer(text):
        texture_ref = match.group(1).replace("/", "\\")
        score = score_rvmat_texture_ref(texture_ref)
        if score > -10_000:
            candidates.append((score, texture_ref))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (-item[0], item[1]))
    return candidates[0][1]


def face_texture_ref(face, material_texture_map: dict[str, str | None]) -> str | None:
    if face["texture"]:
        return face["texture"]
    material = face["material"]
    return material_texture_map.get(material)


@lru_cache(maxsize=2048)
def paa_average_color(texture_ref: str | None):
    if not texture_ref:
        return (188, 184, 173, 220)
    paa_path = resolve_dz_path(texture_ref)
    if not paa_path:
        return (188, 184, 173, 220)
    try:
        paa = PaaFile.read_file(str(paa_path))
        if not paa.mipmaps:
            return (188, 184, 173, 220)
        arr = paa.mipmaps[0].decode(paa.format)
        img = Image.fromarray(arr, "RGBA").convert("RGBA")
        small = img.resize((8, 8), Image.Resampling.BOX)
        pixels = [small.getpixel((x, y)) for y in range(small.height) for x in range(small.width)]
        weighted = [px for px in pixels if px[3] > 10]
        if not weighted:
            return (188, 184, 173, 220)
        total_alpha = sum(px[3] for px in weighted)
        if total_alpha <= 0:
            return (188, 184, 173, 220)
        r = round(sum(px[0] * px[3] for px in weighted) / total_alpha)
        g = round(sum(px[1] * px[3] for px in weighted) / total_alpha)
        b = round(sum(px[2] * px[3] for px in weighted) / total_alpha)
        return (r, g, b, 220)
    except Exception:
        return (188, 184, 173, 220)


def vector_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def normalize(v):
    mag = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    if mag <= 1e-9:
        return (0.0, 0.0, 0.0)
    return (v[0] / mag, v[1] / mag, v[2] / mag)


def iter_top_triangles(lod, top_threshold: float):
    points = lod["points"]
    material_texture_map = {}
    for face in lod["faces"]:
        material = face["material"]
        if material and material not in material_texture_map:
            material_texture_map[material] = choose_rvmat_texture(material)

    for face in lod["faces"]:
        n = max(0, min(face["number_of_vertices"], 4))
        verts = []
        for vertex in face["vertices"][:n]:
            point_index = vertex["point_index"]
            if 0 <= point_index < len(points):
                px, py, pz, _flags = points[point_index]
                verts.append((px, py, pz))
        if len(verts) < 3:
            continue
        texture_ref = face_texture_ref(face, material_texture_map)
        for i in range(1, len(verts) - 1):
            tri = [verts[0], verts[i], verts[i + 1]]
            normal = normalize(cross(vector_sub(tri[1], tri[0]), vector_sub(tri[2], tri[0])))
            if normal[1] < top_threshold:
                continue
            yield {
                "points": tri,
                "normal_y": normal[1],
                "texture_ref": texture_ref,
            }


def render_preview(model_name: str, shape_path: str, tri_records: list[dict], out_path: Path, size: int):
    xs = [pt[0] for rec in tri_records for pt in rec["points"]]
    zs = [pt[2] for rec in tri_records for pt in rec["points"]]
    min_x, max_x = min(xs), max(xs)
    min_z, max_z = min(zs), max(zs)
    span_x = max(1e-6, max_x - min_x)
    span_z = max(1e-6, max_z - min_z)
    pad = max(10, round(size * 0.06))
    draw_span = max(span_x, span_z)
    scale = (size - pad * 2) / draw_span
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")

    def project(point):
        x, _y, z = point
        px = pad + (x - min_x) * scale
        py = size - pad - (z - min_z) * scale
        return (round(px, 2), round(py, 2))

    tri_records_sorted = sorted(
        tri_records,
        key=lambda rec: (sum(pt[1] for pt in rec["points"]) / 3.0, rec["normal_y"]),
    )
    color_usage = Counter()
    weighted_rgba = [0.0, 0.0, 0.0, 0.0]
    total_weight = 0.0
    for rec in tri_records_sorted:
        color = paa_average_color(rec["texture_ref"])
        color_usage[rec["texture_ref"] or "__fallback__"] += 1
        weight = max(0.05, float(rec.get("normal_y") or 0.0))
        weighted_rgba[0] += color[0] * weight
        weighted_rgba[1] += color[1] * weight
        weighted_rgba[2] += color[2] * weight
        weighted_rgba[3] += color[3] * weight
        total_weight += weight
        poly = [project(pt) for pt in rec["points"]]
        draw.polygon(poly, fill=color)

    # Simple outline for legibility.
    from_color = paa_average_color(None)
    outline = (max(0, from_color[0] - 50), max(0, from_color[1] - 50), max(0, from_color[2] - 50), 235)
    mask = img.getchannel("A")
    bbox = mask.getbbox()
    if bbox:
        edge = Image.new("RGBA", img.size, (0, 0, 0, 0))
        edge_draw = ImageDraw.Draw(edge, "RGBA")
        edge_draw.rectangle(bbox, outline=outline, width=1)
        img.alpha_composite(edge)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="PNG")
    average_color = (
        [round(channel / total_weight) for channel in weighted_rgba]
        if total_weight > 0
        else [188, 184, 173, 220]
    )
    return {
        "model": model_name,
        "shape_path": shape_path,
        "png": str(out_path),
        "size": size,
        "triangle_count": len(tri_records),
        "average_color": average_color,
        "bounds": [round(min_x, 3), round(min_z, 3), round(max_x, 3), round(max_z, 3)],
        "top_textures": [[key, count] for key, count in color_usage.most_common(8)],
    }


def build_previews(limit: int | None, model_filter: str | None, size: int, top_threshold: float):
    land_models = []
    seen_shape_paths: set[str] = set()
    for models_path in LAND_MODELS_PATHS:
        if not models_path.exists():
            continue
        payload = read_json(models_path)
        for row in payload.get("models", []):
            type_name = str(row[1] if len(row) > 1 else "").strip()
            shape_path = normalize_path(row[3] if len(row) > 3 else "")
            if not type_name.startswith("Land_") or not shape_path or shape_path in seen_shape_paths:
                continue
            land_models.append(row)
            seen_shape_paths.add(shape_path)
    catalog_lookup = build_catalog_lookup()
    results = {}
    missing = []
    processed = 0

    for row in land_models:
        model_name = row[1]
        shape_path = normalize_path(row[3])
        if model_filter and model_filter.lower() not in model_name.lower() and model_filter.lower() not in shape_path:
            continue
        catalog_item = catalog_lookup.get(shape_path)
        if not catalog_item:
            missing.append({"model": model_name, "shape_path": shape_path, "reason": "catalog_missing"})
            continue
        mlod_path = MLOD_ROOT / str(catalog_item["source_rel"])
        try:
            lods = parse_mlod(mlod_path)
            lod = choose_preview_lod(lods)
            if not lod:
                missing.append({"model": model_name, "shape_path": shape_path, "reason": "lod_missing"})
                continue
            tri_records = list(iter_top_triangles(lod, top_threshold=top_threshold))
            if not tri_records:
                missing.append({"model": model_name, "shape_path": shape_path, "reason": "no_top_faces"})
                continue
            rel_dir = Path(*shape_path.split("/")[1:-1]) if "/" in shape_path else Path("misc")
            out_path = OUTPUT_ROOT / rel_dir / f"{model_name.lower()}_roof_avg.png"
            results[shape_path] = render_preview(model_name, shape_path, tri_records, out_path, size=size)
            processed += 1
        except Exception as ex:
            missing.append({"model": model_name, "shape_path": shape_path, "reason": str(ex)})
        if limit and processed >= limit:
            break

    payload = {
        "count": len(results),
        "missingCount": len(missing),
        "previews": results,
        "missing": missing,
        "settings": {
            "size": size,
            "top_threshold": top_threshold,
            "source": str(CATALOG_ROOT),
        },
    }
    write_json(MANIFEST_PATH, payload)
    return payload


def main():
    parser = argparse.ArgumentParser(description="Build average-color roof previews for Land_ models from P-drive MLODs.")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--model", type=str, default=None)
    parser.add_argument("--size", type=int, default=256)
    parser.add_argument("--top-threshold", type=float, default=0.45)
    args = parser.parse_args()

    payload = build_previews(
        limit=args.limit,
        model_filter=args.model,
        size=args.size,
        top_threshold=args.top_threshold,
    )
    print(f"Built {payload['count']} roof previews; missing {payload['missingCount']}")
    print(MANIFEST_PATH)


if __name__ == "__main__":
    main()
