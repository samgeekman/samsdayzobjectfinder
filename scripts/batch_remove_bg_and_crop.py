#!/usr/bin/env python3
"""Batch remove image backgrounds and crop to object bounds with padding."""

from __future__ import annotations

import argparse
import io
import os
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove


VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Remove background to transparent PNG and crop around the detected "
            "object while preserving folder structure."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("images/gear"),
        help="Input root directory (default: images/gear).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("images_cropped/gear"),
        help="Output root directory (default: images_cropped/gear).",
    )
    parser.add_argument(
        "--u2net-home",
        type=Path,
        default=Path(".cache/u2net"),
        help="Directory for rembg models (default: .cache/u2net).",
    )
    parser.add_argument(
        "--model",
        default="u2netp",
        help="rembg model name (default: u2netp).",
    )
    parser.add_argument(
        "--padding",
        type=float,
        default=0.05,
        help="Padding ratio around detected object bounds (default: 0.05).",
    )
    parser.add_argument(
        "--alpha-threshold",
        type=int,
        default=16,
        help=(
            "Ignore alpha values below this threshold when estimating crop bounds "
            "(default: 16)."
        ),
    )
    parser.add_argument(
        "--line-ratio",
        type=float,
        default=0.002,
        help=(
            "Minimum filled-pixel ratio per row/column to reject stray alpha noise "
            "(default: 0.002)."
        ),
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process only first N images for quick tests (default: 0 = all).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing output PNG files.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print per-file status.",
    )
    return parser.parse_args()


def gather_images(root: Path) -> list[Path]:
    if not root.exists():
        return []
    paths: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in VALID_EXTENSIONS:
            continue
        paths.append(path)
    paths.sort()
    return paths


def padded_bbox(bbox: tuple[int, int, int, int], width: int, height: int, ratio: float) -> tuple[int, int, int, int]:
    left, top, right, bottom = bbox
    obj_w = max(1, right - left)
    obj_h = max(1, bottom - top)
    pad = int(round(max(obj_w, obj_h) * max(0.0, ratio)))
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(width, right + pad)
    bottom = min(height, bottom + pad)
    return left, top, right, bottom


def estimate_noise_robust_bbox(alpha: Image.Image, alpha_threshold: int, line_ratio: float) -> tuple[int, int, int, int] | None:
    arr = np.array(alpha, dtype=np.uint8)
    if arr.ndim != 2:
        return None

    threshold = int(max(0, min(255, alpha_threshold)))
    mask = arr >= threshold
    if not np.any(mask):
        return None

    height, width = mask.shape
    min_cols = max(1, int(round(height * max(0.0, line_ratio))))
    min_rows = max(1, int(round(width * max(0.0, line_ratio))))

    row_hits = np.where(mask.sum(axis=1) >= min_rows)[0]
    col_hits = np.where(mask.sum(axis=0) >= min_cols)[0]

    if row_hits.size == 0 or col_hits.size == 0:
        return None

    top = int(row_hits[0])
    bottom = int(row_hits[-1]) + 1
    left = int(col_hits[0])
    right = int(col_hits[-1]) + 1
    return left, top, right, bottom


def process_image(
    image_path: Path,
    input_root: Path,
    output_root: Path,
    session: object,
    padding_ratio: float,
    alpha_threshold: int,
    line_ratio: float,
    overwrite: bool,
) -> tuple[str, str | None]:
    rel = image_path.relative_to(input_root)
    output_path = (output_root / rel).with_suffix(".png")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if output_path.exists() and not overwrite:
        return "skipped", None

    try:
        with Image.open(image_path) as src:
            rgba = src.convert("RGBA")
        src_buffer = io.BytesIO()
        rgba.save(src_buffer, format="PNG")

        result_bytes = remove(src_buffer.getvalue(), session=session)
        with Image.open(io.BytesIO(result_bytes)) as result:
            out_rgba = result.convert("RGBA")
            alpha = out_rgba.getchannel("A")
            bbox = estimate_noise_robust_bbox(
                alpha=alpha,
                alpha_threshold=alpha_threshold,
                line_ratio=line_ratio,
            ) or alpha.getbbox()
            if not bbox:
                return "failed", "empty alpha mask"
            crop_box = padded_bbox(bbox, out_rgba.width, out_rgba.height, padding_ratio)
            cropped = out_rgba.crop(crop_box)
            cropped.save(output_path, format="PNG", optimize=True)
        return "processed", None
    except Exception as exc:  # noqa: BLE001
        return "failed", str(exc)


def main() -> int:
    args = parse_args()
    input_root = args.input.resolve()
    output_root = args.output.resolve()
    model_dir = args.u2net_home.resolve()

    if not input_root.exists():
        print(f"Input directory not found: {input_root}")
        return 1

    model_dir.mkdir(parents=True, exist_ok=True)
    os.environ["U2NET_HOME"] = str(model_dir)

    images = gather_images(input_root)
    if args.limit and args.limit > 0:
        images = images[: args.limit]
    if not images:
        print(f"No supported images found in: {input_root}")
        return 1

    session = new_session(args.model)

    processed = 0
    skipped = 0
    failed = 0
    failures: list[str] = []
    total = len(images)

    for index, image_path in enumerate(images, start=1):
        status, error = process_image(
            image_path=image_path,
            input_root=input_root,
            output_root=output_root,
            session=session,
            padding_ratio=args.padding,
            alpha_threshold=args.alpha_threshold,
            line_ratio=args.line_ratio,
            overwrite=args.overwrite,
        )
        if status == "processed":
            processed += 1
        elif status == "skipped":
            skipped += 1
        else:
            failed += 1
            failures.append(f"{image_path}: {error or 'unknown error'}")

        if args.verbose:
            suffix = f" ({error})" if error else ""
            print(f"[{index}/{total}] {status}: {image_path}{suffix}")

    print(f"Input root : {input_root}")
    print(f"Output root: {output_root}")
    print(f"Model dir  : {model_dir}")
    print(f"Total      : {total}")
    print(f"Processed  : {processed}")
    print(f"Skipped    : {skipped}")
    print(f"Failed     : {failed}")
    if failures:
        print("\nFirst failures:")
        for line in failures[:10]:
            print(f"- {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
