#!/usr/bin/env python3

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image


REPO_ROOT = Path(r"C:\Users\Samjo\OneDrive\Documents\GitHub\samsdayzobjectfinder")

SOURCE_VIEWER_HTML = Path(r"P:\2026-03-20\chernarus_map_poc\chernarus_core32_world_viewer_chunked\index.html")
SOURCE_LOCATIONS = Path(r"P:\2026-03-20\chernarus_map_poc\chernarus_core32_world_viewer_chunked\locations.json")
SOURCE_TILE_PYRAMID = Path(r"P:\2026-03-20\chernarus_map_poc\chernarus_core32_tile_pyramid")
SOURCE_LAND_PACK = Path(r"P:\2026-03-20\world_object_export\chernarus_shape_variants\land_only_pack")
SOURCE_OBJECT_PACK = Path(r"P:\2026-03-20\world_object_export\chernarus_shape_variants\no_foliage_or_rocks_or_roads_pack")
SOURCE_DAYZ_OBJECTS = REPO_ROOT / "static" / "data" / "dayz_objects.json"
SOURCE_FOOTPRINTS = REPO_ROOT / "reports" / "land_model_footprints.json"
SOURCE_ROOF_AVERAGES = REPO_ROOT / "reports" / "land_roof_average_manifest.json"

OUT_PAGE_DIR = REPO_ROOT / "static" / "object-map-v2"
OUT_DATA_DIR = REPO_ROOT / "static" / "data" / "object-map-v2"
OUT_WORLDS_DIR = OUT_DATA_DIR / "worlds"
OUT_TILE_PYRAMID = OUT_DATA_DIR / "tile-pyramid"
OUT_LAND_PACK = OUT_DATA_DIR / "land_only_pack"
OUT_OBJECT_PACK = OUT_DATA_DIR / "object_pack"
OUT_LOCATIONS = OUT_DATA_DIR / "locations.json"
OUT_HTML = OUT_PAGE_DIR / "index.html"
SOURCE_WORLD_BUNDLES = {
    "livonia": Path(r"P:\DayZ Object Exports\worlds\enoch\site_bundle\data\object-map-v2\worlds\enoch"),
    "sakhal": Path(r"P:\DayZ Object Exports\worlds\sakhal\site_bundle\data\object-map-v2\worlds\sakhal"),
}


def replace_once(text: str, old: str, new: str) -> str:
    if old not in text:
        raise RuntimeError(f"Expected text not found: {old}")
    return text.replace(old, new, 1)


def copy_tree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def clean_p3d_name(shape_path: str | None) -> str:
    basename = Path(str(shape_path or "").replace("\\", "/")).name.strip()
    basename = basename.lstrip(",").strip()
    if not basename:
        return ""
    lowered = basename.lower()
    if lowered.startswith("unknown") or basename.startswith("*"):
        return ""
    return basename


def sanitize_manifest(pack_dir: Path) -> None:
    manifest_path = pack_dir / "manifest.json"
    if not manifest_path.exists():
        return
    payload = load_json(manifest_path)
    model_fields = payload.get("modelFields")
    if isinstance(model_fields, list):
        payload["modelFields"] = [field for field in model_fields if field != "bbox_source"]
    write_json(manifest_path, payload)


def recalc_chunk_bounds(placements: list[list]) -> dict[str, float | int]:
    xs = [float(row[2]) for row in placements]
    zs = [float(row[4]) for row in placements]
    return {
        "count": len(placements),
        "minX": min(xs),
        "maxX": max(xs),
        "minZ": min(zs),
        "maxZ": max(zs),
    }


def sanitize_pack(pack_dir: Path) -> None:
    manifest_path = pack_dir / "manifest.json"
    models_path = pack_dir / "models.json"
    if not manifest_path.exists() or not models_path.exists():
        return

    manifest = load_json(manifest_path)
    model_payload = load_json(models_path)
    source_models = model_payload.get("models", [])

    old_to_new: dict[int, int] = {}
    sanitized_models: list[list] = []
    source_kind_by_model: dict[int, int] = {}
    for row in source_models:
        old_id = int(row[0])
        type_name = str(row[1] or "").strip()
        shape_path = str(row[3] or "").strip()
        clean_name = clean_p3d_name(shape_path)
        if not type_name.startswith("Land_") and not clean_name:
            continue
        new_row = list(row)
        new_id = len(sanitized_models)
        new_row[0] = new_id
        old_to_new[old_id] = new_id
        sanitized_models.append(new_row)
        source_kind_by_model[new_id] = int(new_row[4] or 0)

    model_payload["models"] = sanitized_models
    write_json(models_path, model_payload)

    total_rows = 0
    total_land = 0
    total_p3d = 0

    all_placements_path = manifest.get("allPlacementsPath")
    if all_placements_path:
      payload_path = pack_dir / Path(all_placements_path).name
      placement_payload = load_json(payload_path)
      sanitized = []
      for placement in placement_payload.get("placements", []):
          old_model_id = int(placement[1])
          if old_model_id not in old_to_new:
              continue
          new_placement = list(placement)
          new_placement[1] = old_to_new[old_model_id]
          sanitized.append(new_placement)
          total_rows += 1
          if source_kind_by_model[new_placement[1]] == 1:
              total_p3d += 1
          else:
              total_land += 1
      placement_payload["placements"] = sanitized
      write_json(payload_path, placement_payload)
    else:
      updated_chunks = []
      for chunk in manifest.get("chunks", []):
          chunk_path = pack_dir / Path(chunk["path"])
          chunk_payload = load_json(chunk_path)
          sanitized = []
          for placement in chunk_payload.get("placements", []):
              old_model_id = int(placement[1])
              if old_model_id not in old_to_new:
                  continue
              new_placement = list(placement)
              new_placement[1] = old_to_new[old_model_id]
              sanitized.append(new_placement)
              total_rows += 1
              if source_kind_by_model[new_placement[1]] == 1:
                  total_p3d += 1
              else:
                  total_land += 1
          chunk_payload["placements"] = sanitized
          write_json(chunk_path, chunk_payload)
          if sanitized:
              chunk_meta = dict(chunk)
              chunk_meta.update(recalc_chunk_bounds(sanitized))
              updated_chunks.append(chunk_meta)
      manifest["chunks"] = updated_chunks

    if isinstance(manifest.get("counts"), dict):
        manifest["counts"]["rows"] = total_rows
        manifest["counts"]["models"] = len(sanitized_models)
        manifest["counts"]["land"] = total_land
        manifest["counts"]["p3d"] = total_p3d

    write_json(manifest_path, manifest)


def average_png_color(path: Path | None):
    if not path or not path.exists():
        return None
    try:
        img = Image.open(path).convert("RGBA").resize((16, 16), Image.Resampling.BOX)
        pixels = [img.getpixel((x, y)) for y in range(img.height) for x in range(img.width)]
        weighted = [px for px in pixels if px[3] > 10]
        if not weighted:
            return None
        total_alpha = sum(px[3] for px in weighted)
        if total_alpha <= 0:
            return None
        return [
            round(sum(px[0] * px[3] for px in weighted) / total_alpha),
            round(sum(px[1] * px[3] for px in weighted) / total_alpha),
            round(sum(px[2] * px[3] for px in weighted) / total_alpha),
            round(sum(px[3] for px in weighted) / len(weighted)),
        ]
    except Exception:
        return None


def load_footprint_cache() -> dict[str, dict]:
    if not SOURCE_FOOTPRINTS.exists():
        return {}
    payload = load_json(SOURCE_FOOTPRINTS)
    return payload.get("footprints", {})


def load_roof_average_cache() -> dict[str, dict]:
    if not SOURCE_ROOF_AVERAGES.exists():
        return {}
    payload = load_json(SOURCE_ROOF_AVERAGES)
    return payload.get("previews", {})


def build_object_catalog_index() -> dict[str, dict]:
    rows = load_json(SOURCE_DAYZ_OBJECTS)
    index: dict[str, dict] = {}
    for row in rows:
        object_name = str(row.get("objectName") or "").strip()
        if object_name:
            index.setdefault(object_name.lower(), row)
        image = str(row.get("image") or "").strip()
        if image:
            path = str(row.get("path") or "").strip().replace("\\", "/").strip("/")
            if path:
                basename = object_name.lower()
                if basename:
                    index.setdefault(f"{path}/{basename}", row)
    return index


def build_model_counts(pack_dir: Path) -> dict[int, int]:
    manifest = load_json(pack_dir / "manifest.json")
    counts: dict[int, int] = {}
    all_placements_path = manifest.get("allPlacementsPath")
    if all_placements_path:
        placements_payload = load_json(pack_dir / Path(all_placements_path).name)
        for placement in placements_payload.get("placements", []):
            model_id = int(placement[1])
            counts[model_id] = counts.get(model_id, 0) + 1
        return counts
    for chunk in manifest.get("chunks", []):
        chunk_path = pack_dir / Path(chunk["path"])
        payload = load_json(chunk_path)
        for placement in payload.get("placements", []):
            model_id = int(placement[1])
            counts[model_id] = counts.get(model_id, 0) + 1
    return counts


def resolve_catalog_entry(model_row: list, catalog_index: dict[str, dict]) -> dict | None:
    type_name = str(model_row[1] or "").strip()
    shape_path = str(model_row[3] or "").strip().replace("\\", "/")
    basename = Path(shape_path).name if shape_path else ""
    parent_path = str(Path(shape_path).parent).replace("\\", "/") if shape_path else ""
    candidates = []
    if type_name:
        candidates.append(type_name.lower())
    if basename:
        candidates.append(basename.lower())
    if parent_path and basename:
        candidates.append(f"{parent_path}/{basename}".lower())
    for key in candidates:
        if key in catalog_index:
            return catalog_index[key]
    return None


def enrich_models(
    pack_dir: Path,
    catalog_index: dict[str, dict],
    footprint_cache: dict[str, dict],
    roof_average_cache: dict[str, dict],
) -> None:
    models_path = pack_dir / "models.json"
    payload = load_json(models_path)
    models = payload.get("models", [])
    counts = build_model_counts(pack_dir)
    for model_row in models:
        entry = resolve_catalog_entry(model_row, catalog_index)
        image = ""
        type_name = str(model_row[1] or "").strip()
        clean_shape_name = clean_p3d_name(model_row[3] if len(model_row) > 3 else "")
        label = type_name or clean_shape_name
        shape_path = str(model_row[3] or "").strip().replace("\\", "/").lower()
        footprint_entry = footprint_cache.get(shape_path)
        roof_entry = roof_average_cache.get(shape_path)
        if entry:
            image = str(entry.get("image") or "").strip()
        count = counts.get(int(model_row[0]), 0)
        while len(model_row) < 20:
            model_row.append(None)
        # Strip source metadata so it does not surface anywhere in the site payloads.
        model_row[11] = None
        model_row[12] = image
        model_row[13] = label
        model_row[14] = count
        model_row[15] = footprint_entry.get("points") if footprint_entry else None
        model_row[16] = None
        if roof_entry:
            roof_png = str(roof_entry.get("png") or "").replace("\\", "/")
            marker = "/static/"
            if marker in roof_png:
                roof_png = roof_png.split(marker, 1)[1]
            model_row[17] = f"/{roof_png.lstrip('/')}" if roof_png else None
            model_row[18] = roof_entry.get("bounds")
            model_row[19] = average_png_color(Path(str(roof_entry.get("png") or "")))
        else:
            model_row[17] = None
            model_row[18] = None
            model_row[19] = None
    write_json(models_path, payload)


def build_html() -> str:
    source_html_path = OUT_HTML if OUT_HTML.exists() else SOURCE_VIEWER_HTML
    html = source_html_path.read_text(encoding="utf-8")
    if "Chernarus Area Viewer" in html:
        html = replace_once(html, "Chernarus Area Viewer", "Object Map V2")
    html = html.replace(
        "This version does not auto-load objects. Draw an area, then load just that rectangle. Sat tiles remain metadata-placed in world space.",
        "Object Map V2 is area-select first. Land_ objects preload for context, mixed Land_ + p3d objects load on demand for the selected area, and export uses the Editor-safe placement format.",
    )
    if ".map-topbar" not in html:
        html = html.replace(
            "</style>",
            """
    .shell {
      display: block;
      min-height: 100vh;
      position: relative;
    }
    .viewer {
      min-height: 100vh;
    }
    .sidebar {
      position: absolute;
      top: 14px;
      left: 14px;
      z-index: 4;
      width: min(320px, calc(100vw - 28px));
      max-height: calc(100vh - 28px);
      overflow: auto;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: rgba(246,241,232,0.9);
      backdrop-filter: blur(8px);
      box-shadow: 0 10px 28px rgba(19,32,40,0.18);
    }
    .sidebar h1,
    .sidebar > p {
      display: none;
    }
    .sidebar .control:first-of-type,
    .sidebar .stat:first-of-type {
      margin-top: 0;
    }
    @media (max-width: 900px) {
      .sidebar {
        width: min(280px, calc(100vw - 28px));
        max-height: min(58vh, calc(100vh - 28px));
      }
      .hud {
        right: 10px;
        top: 10px;
      }
    }
  </style>
""",
        )
    html = html.replace(
        "../chernarus_core32_tile_pyramid/manifest.json",
        "../data/object-map-v2/tile-pyramid/manifest.json",
    )
    html = html.replace(
        "../../world_object_export/chernarus_shape_variants/land_only_pack/manifest.json",
        "../data/object-map-v2/land_only_pack/manifest.json",
    )
    html = html.replace(
        "../../world_object_export/chernarus_shape_variants/no_foliage_or_rocks_or_roads_pack/manifest.json",
        "../data/object-map-v2/object_pack/manifest.json",
    )
    html = html.replace(
        "./locations.json",
        "../data/object-map-v2/locations.json",
    )

    # First repo pass stays on the lighter sat pyramid only; raw close-zoom tiles are synced separately later.
    html = html.replace(
        'const rawTileManifestUrl = "../chernarus_core32_world_viewer/core32_tile_manifest.json";',
        'const rawTileManifestUrl = null;',
    )
    html = html.replace(
        'const rawTileManifestBaseUrl = new URL(rawTileManifestUrl, window.location.href);\n    rawTileManifestBaseUrl.pathname = rawTileManifestBaseUrl.pathname.replace(/[^/]+$/, "");',
        'const rawTileManifestBaseUrl = null;',
    )
    html = html.replace(
        "if (scale >= 0.22 && renderRawTiles()) return;",
        "if (false && scale >= 0.22 && renderRawTiles()) return;",
    )
    html = html.replace(
        "      loadJson(rawTileManifestUrl),\n",
        "      Promise.resolve(null),\n",
    )
    html = html.replace(
        "      rawTileManifest = rawManifest;\n",
        "      rawTileManifest = rawManifest || null;\n",
    )
    return html


def main() -> None:
    OUT_PAGE_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUT_WORLDS_DIR.mkdir(parents=True, exist_ok=True)

    copy_tree(SOURCE_TILE_PYRAMID, OUT_TILE_PYRAMID)
    copy_tree(SOURCE_LAND_PACK, OUT_LAND_PACK)
    copy_tree(SOURCE_OBJECT_PACK, OUT_OBJECT_PACK)
    shutil.copy2(SOURCE_LOCATIONS, OUT_LOCATIONS)
    for world_key, source_dir in SOURCE_WORLD_BUNDLES.items():
        if source_dir.exists():
            copy_tree(source_dir, OUT_WORLDS_DIR / world_key)

    catalog_index = build_object_catalog_index()
    footprint_cache = load_footprint_cache()
    roof_average_cache = load_roof_average_cache()

    packs_to_process = [
        OUT_LAND_PACK,
        OUT_OBJECT_PACK,
    ]
    for world_key in SOURCE_WORLD_BUNDLES.keys():
        world_root = OUT_WORLDS_DIR / world_key
        packs_to_process.extend([
            world_root / "land_only_pack",
            world_root / "object_pack",
        ])

    for pack_dir in packs_to_process:
        if not pack_dir.exists():
            continue
        sanitize_pack(pack_dir)
        sanitize_manifest(pack_dir)
        enrich_models(pack_dir, catalog_index, footprint_cache, roof_average_cache)

    OUT_HTML.write_text(build_html(), encoding="utf-8")

    print(f"Wrote {OUT_HTML}")
    print(f"Copied {OUT_TILE_PYRAMID}")
    print(f"Copied {OUT_LAND_PACK}")
    print(f"Copied {OUT_OBJECT_PACK}")
    print(f"Copied {OUT_LOCATIONS}")


if __name__ == "__main__":
    main()
