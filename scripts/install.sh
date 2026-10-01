#!/usr/bin/env bash
# Symlink this repo into OpenCode's global plugins directory (auto-discovery).
# No opencode.json edit required for the plugin to load; options then come
# from explicit `plugins` entries (global/project config) or ALLOWLIST_GATE_* env.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
TARGET="$CONFIG_DIR/plugins/allowlist-gate"

mkdir -p "$CONFIG_DIR/plugins"
if [[ -e "$TARGET" || -L "$TARGET" ]]; then
  echo "exists: $TARGET (remove it first or run plugin:uninstall)"
  exit 1
fi
ln -s "$REPO_DIR" "$TARGET"
echo "linked: $TARGET -> $REPO_DIR"
echo "Restart the OpenCode server (opencode service restart) to load it."
