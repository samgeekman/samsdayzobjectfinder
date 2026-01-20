#!/usr/bin/env python3
import argparse
import json
import os
import sys


DEFAULT_PATH_PREFIXES = ["dz/characters", "dz/gear", "dz/weapons"]
CLASS_NAME_KEYS = ("objectName", "className", "classname", "name")


def iter_json_files(paths):
    for path in paths:
        if os.path.isfile(path) and path.endswith(".json"):
            yield path
            continue
        if not os.path.isdir(path):
            continue
        for dirpath, _dirnames, filenames in os.walk(path):
            for filename in filenames:
                if filename.endswith(".json"):
                    yield os.path.join(dirpath, filename)


def normalize_path(value):
    if not isinstance(value, str):
        return ""
    return value.lstrip("/").replace("\\", "/")


def extract_class_names(json_path, path_prefixes):
    names = set()
    try:
        with open(json_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return names

    if not isinstance(payload, list):
        return names

    for entry in payload:
        if not isinstance(entry, dict):
            continue
        entry_path = normalize_path(entry.get("path", ""))
        if not any(entry_path.startswith(prefix) for prefix in path_prefixes):
            continue
        for key in CLASS_NAME_KEYS:
            value = entry.get(key)
            if isinstance(value, str) and value.strip():
                names.add(value.strip())
                break
    return names


def main():
    parser = argparse.ArgumentParser(
        description=(
            "List unique class names from JSON records that live under "
            "dz/characters, dz/gear, dz/weapons paths."
        )
    )
    parser.add_argument(
        "roots",
        nargs="*",
        default=["database"],
        help="Root directories to scan for .json files (default: database).",
    )
    parser.add_argument(
        "--paths",
        nargs="*",
        default=DEFAULT_PATH_PREFIXES,
        help="Path prefixes to include (default: dz/characters dz/gear dz/weapons).",
    )
    args = parser.parse_args()

    prefixes = [normalize_path(value) for value in args.paths if normalize_path(value)]
    if not prefixes:
        print("No valid path prefixes provided.", file=sys.stderr)
        return 1

    all_names = set()
    for json_file in iter_json_files(args.roots):
        all_names.update(extract_class_names(json_file, prefixes))

    for name in sorted(all_names, key=lambda value: value.casefold()):
        print(name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
