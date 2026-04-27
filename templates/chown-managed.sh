#!/usr/bin/env bash
# Hard-coded chown wrapper called by mydevc-init's fs:ownership step.
# Sudoers grants vscode NOPASSWD only on this script (not on /usr/bin/chown
# directly), so a malicious caller cannot pivot into chowning arbitrary
# host paths.
#
# Argument: one of the managed directories. The target uid:gid is read
# from /home/vscode itself, so the wrapper has no input we trust as a
# user/group string.
#
# Symlink hardening: vscode owns /home/vscode and could swap a managed
# directory for a symlink to /etc (or any other path). chown follows
# symlinks by default and `-R` would traverse the link's target, handing
# vscode ownership of arbitrary host directories. We refuse if any
# component of the target is a symlink, and pass `-h --no-dereference`
# plus `-P` so even a race that lands a symlink mid-walk is treated as a
# link (no traversal, owner only set on the link node itself).

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

# Reject if the target itself is a symlink. lstat-style check via `-L`.
if [[ -L "$target" ]]; then
  echo "chown-managed.sh: refusing to chown '$target' (is a symlink)" >&2
  exit 4
fi

# Reject if any parent component is a symlink — `realpath` resolves them
# and we compare to the literal target. Anything different means an
# attacker spliced a symlink upstream of the leaf.
resolved=$(realpath -- "$target")
if [[ "$resolved" != "$target" ]]; then
  echo "chown-managed.sh: refusing to chown '$target' (resolves to '$resolved')" >&2
  exit 5
fi

uid=$(stat -c '%u' /home/vscode)
gid=$(stat -c '%g' /home/vscode)

# `-P` (POSIX): never follow symlinks during traversal. `-h`: act on the
# symlink itself, never the target — applies to any link encountered
# during the walk. `--` ends option parsing so a hostile $target can't be
# re-interpreted as a flag.
exec /usr/bin/chown -h -R -P -- "${uid}:${gid}" "$target"
