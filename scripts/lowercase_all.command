#!/bin/zsh

# Finder-launched .command files can have a minimal PATH.
export PATH="/usr/bin:/bin:/usr/sbin:/sbin"

cd "$(dirname "$0")/.." || exit 1

/usr/bin/find ./static/images -depth -mindepth 1 -print0 | while IFS= read -r -d '' path; do
  base=${path##*/}
  dir=${path%/*}
  [[ "$dir" == "$path" ]] && dir="."
  lower=$(printf "%s" "$base" | /usr/bin/tr '[:upper:]' '[:lower:]')
  [[ "$base" == "$lower" ]] && continue
  target="$dir/$lower"

  if [[ -e "$target" ]]; then
    src_inode=$(/usr/bin/stat -f "%i" "$path" 2>/dev/null)
    tgt_inode=$(/usr/bin/stat -f "%i" "$target" 2>/dev/null)
    if [[ "$src_inode" == "$tgt_inode" ]]; then
      tmp="$dir/.lowercase_tmp_${RANDOM}_$$"
      while [[ -e "$tmp" ]]; do tmp="$dir/.lowercase_tmp_${RANDOM}_$$"; done
      /bin/mv "$path" "$tmp" && /bin/mv "$tmp" "$target"
    else
      echo "CONFLICT: $path -> $target"
    fi
  else
    /bin/mv "$path" "$target"
  fi
done
