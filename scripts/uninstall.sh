#!/usr/bin/env bash
# Remove the symlink created by install.sh.
set -euo pipefail

CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
TARGET="$CONFIG_DIR/plugins/allowlist-gate"

if [[ -L "$TARGET" ]]; then
  rm "$TARGET"
  echo "removed: $TARGET"
elif [[ -e "$TARGET" ]]; then
  echo "not a symlink, refusing to remove: $TARGET" >&2
  exit 1
else
  echo "nothing to remove: $TARGET"
fi
