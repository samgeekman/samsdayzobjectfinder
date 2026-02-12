#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

def main() -> None:
    root = Path(__file__).resolve().parent.parent / "static" / "images"
    if not root.exists():
        raise SystemExit(f"Images folder not found: {root}")

    # Rename files first (deepest paths) to avoid parent changes mid-walk.
    file_paths = sorted(
        [p for p in root.rglob("*") if p.is_file()],
        key=lambda p: len(p.as_posix()),
        reverse=True,
    )
    for path in file_paths:
        lower_name = path.name.lower()
        if path.name == lower_name:
            continue
        target = path.with_name(lower_name)
        if target.exists():
            print(f"Warning: target exists, skipping file rename: {path} -> {target}")
            continue
        # Two-step rename for case-insensitive filesystems.
        tmp = path.with_name(lower_name + ".__tmp__")
        if tmp.exists():
            print(f"Warning: temp exists, skipping file rename: {path} -> {tmp}")
            continue
        path.rename(tmp)
        tmp.rename(target)

    # Then rename directories from deepest to shallowest.
    dir_paths = sorted(
        [p for p in root.rglob("*") if p.is_dir()],
        key=lambda p: len(p.as_posix()),
        reverse=True,
    )
    for path in dir_paths:
        lower_name = path.name.lower()
        if path.name == lower_name:
            continue
        target = path.with_name(lower_name)
        if target.exists():
            print(f"Warning: target exists, skipping dir rename: {path} -> {target}")
            continue
        # Two-step rename for case-insensitive filesystems.
        tmp = path.with_name(lower_name + ".__tmp__")
        if tmp.exists():
            print(f"Warning: temp exists, skipping dir rename: {path} -> {tmp}")
            continue
        path.rename(tmp)
        tmp.rename(target)

    print("Done lowercasing image paths.")


if __name__ == "__main__":
    main()
