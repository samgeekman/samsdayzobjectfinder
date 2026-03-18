#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/quick_crop_app.py "$@"
