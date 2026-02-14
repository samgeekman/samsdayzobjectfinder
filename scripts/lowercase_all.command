#!/bin/zsh
cd "$(dirname "$0")/.." || exit 1

find ./static/images -depth -mindepth 1 -print0 | while IFS= read -r -d '' path; do
  base=${path##*/}
  dir=${path%/*}
  [[ "$dir" == "$path" ]] && dir="."
  lower=$(printf "%s" "$base" | tr '[:upper:]' '[:lower:]')
  [[ "$base" == "$lower" ]] && continue
  target="$dir/$lower"

  if [[ -e "$target" ]]; then
    src_inode=$(stat -f "%i" "$path" 2>/dev/null)
    tgt_inode=$(stat -f "%i" "$target" 2>/dev/null)
    if [[ "$src_inode" == "$tgt_inode" ]]; then
      tmp="$dir/.lowercase_tmp_${RANDOM}_$$"
      while [[ -e "$tmp" ]]; do tmp="$dir/.lowercase_tmp_${RANDOM}_$$"; done
      mv "$path" "$tmp" && mv "$tmp" "$target"
    else
      echo "CONFLICT: $path -> $target"
    fi
  else
    mv "$path" "$target"
  fi
done
