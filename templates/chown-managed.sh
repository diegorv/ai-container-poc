#!/usr/bin/env bash
# Hard-coded chown wrapper called by mydevc-init's fs:ownership step.
# Sudoers grants vscode NOPASSWD only on this script (not on /usr/bin/chown
# directly), so a malicious caller cannot pivot into chowning arbitrary
# host paths.
#
# Argument: one of the managed directories. The target uid:gid is read
# from /home/vscode itself, so the wrapper has no input we trust as a
# user/group string.

set -euo pipefail

ALLOWED=(
  "/home/vscode/.claude"
  "/commandhistory"
  "/home/vscode/.config/gh"
)

if [[ $# -ne 1 ]]; then
  echo "usage: chown-managed.sh <managed-dir>" >&2
  exit 2
fi

target="$1"

ok=0
for a in "${ALLOWED[@]}"; do
  if [[ "$target" == "$a" ]]; then
    ok=1
    break
  fi
done

if [[ "$ok" -ne 1 ]]; then
  echo "chown-managed.sh: refusing to chown '$target' (not in allowlist)" >&2
  exit 3
fi

uid=$(stat -c '%u' /home/vscode)
gid=$(stat -c '%g' /home/vscode)

exec /usr/bin/chown -R "${uid}:${gid}" "$target"
