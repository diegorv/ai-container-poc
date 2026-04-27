#!/usr/bin/env bash
# Bootstrap that the devcontainer's postCreateCommand invokes.
# Locates the bundled `mydevc-init` binary and runs it. Kept as a thin
# wrapper so the image only ever depends on `node` (no extra Python).

set -euo pipefail

if command -v mydevc-init >/dev/null 2>&1; then
  exec mydevc-init
fi

# Fallback: try a well-known location (used during local development).
if [[ -x /opt/mydevc/dist/container-init/index.js ]]; then
  exec node /opt/mydevc/dist/container-init/index.js
fi

echo "[mydevc] mydevc-init not found on PATH" >&2
exit 1
