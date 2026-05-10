import { joinPath, safeFilename } from '@/core/security/path'
import type { Step } from './step'

const LOCAL_SEG = safeFilename('.local')
const BIN_SEG = safeFilename('bin')
const CLAUDE_JAIL_SEG = safeFilename('claude-jail')

const SHIM_MODE = 0o755

const SHIM = `#!/bin/sh
# claude-jail — invoke \`claude\` under a tightened bubblewrap sandbox.
#
# Installed by mydevc-init's claude:sandbox step. Edit the source in
# src/container-init/steps/claude-sandbox.ts; this file is overwritten
# on every container rebuild / re-init.
#
# Defense-in-depth on top of mydevc's outer Docker container. The
# Docker container already isolates the host; this inner sandbox
# reduces what \`claude\` can see *inside* the container:
#   * \$PWD                                          rw  (the project)
#   * everything else /                              ro  (system tools)
#   * \$HOME/.claude/{credentials,.credentials}.json masked  (OAuth token hidden)
#   * \$HOME/.config/gh/hosts.yml                    masked  (gh token hidden)
#   * \$HOME/.aws .azure .gcp .ssh                   masked by tmpfs
#   * fresh /proc, /dev, /tmp; new pid/ipc/uts/user namespaces
#   * network kept (claude needs api.anthropic.com)
#
# settings.json, projects/, plugins/ under ~/.claude stay visible so
# bypassPermissions, mydevc sync, and plugins keep working in the jail.
#
# Env overrides:
#   CLAUDE_JAIL_DISABLE=1        bypass the jail; exec claude directly
#   CLAUDE_JAIL_REAL_BIN=PATH    override real-claude lookup
set -eu

if [ "\${CLAUDE_JAIL_DISABLE:-0}" = "1" ]; then
  exec claude "\$@"
fi

if ! command -v bwrap >/dev/null 2>&1; then
  echo "claude-jail: bubblewrap (bwrap) not installed; set CLAUDE_JAIL_DISABLE=1 to bypass" >&2
  exit 127
fi

REAL_CLAUDE="\${CLAUDE_JAIL_REAL_BIN:-}"
if [ -z "\$REAL_CLAUDE" ]; then
  for c in \\
      "\$HOME/.local/share/claude/bin/claude" \\
      "\$HOME/.claude/local/claude" \\
      "/usr/local/bin/claude"; do
    if [ -x "\$c" ]; then REAL_CLAUDE="\$c"; break; fi
  done
fi
# PATH fallback, with a recursion guard against ourselves.
if [ -z "\$REAL_CLAUDE" ]; then
  candidate="\$(command -v claude 2>/dev/null || true)"
  if [ -n "\$candidate" ] && [ "\$candidate" != "\$0" ]; then
    REAL_CLAUDE="\$candidate"
  fi
fi
if [ -z "\$REAL_CLAUDE" ] || [ ! -x "\$REAL_CLAUDE" ]; then
  echo "claude-jail: cannot locate the real claude binary" >&2
  echo "claude-jail: set CLAUDE_JAIL_REAL_BIN=/path/to/claude" >&2
  exit 127
fi

CWD="\$(pwd)"

exec bwrap \\
  --die-with-parent \\
  --unshare-user --unshare-ipc --unshare-uts --unshare-pid \\
  --hostname mydevc-claude-jail \\
  --ro-bind / / \\
  --proc /proc \\
  --dev /dev \\
  --tmpfs /tmp \\
  --bind "\$CWD" "\$CWD" \\
  --ro-bind-try /dev/null "\$HOME/.claude/credentials.json" \\
  --ro-bind-try /dev/null "\$HOME/.claude/.credentials.json" \\
  --ro-bind-try /dev/null "\$HOME/.config/gh/hosts.yml" \\
  --tmpfs "\$HOME/.aws" \\
  --tmpfs "\$HOME/.azure" \\
  --tmpfs "\$HOME/.gcp" \\
  --tmpfs "\$HOME/.ssh" \\
  --setenv HOME "\$HOME" \\
  --chdir "\$CWD" \\
  -- "\$REAL_CLAUDE" "\$@"
`

/**
 * Installs `~/.local/bin/claude-jail` — a `bwrap`-based wrapper that
 * runs the real `claude` binary with a tightened filesystem sandbox.
 * Opt-in: users invoke `claude-jail` instead of `claude` (or alias).
 *
 * The Docker container is already the primary security boundary. This
 * step adds a second, finer-grained boundary *inside* the container so
 * that even a fully-compromised `claude` process cannot read the
 * persistent OAuth token, `gh` auth, cloud credentials, or other
 * repositories that happen to live in the same workspace.
 *
 * Skipped silently when `bwrap` is not on PATH (so the step is a no-op
 * for any image that strips bubblewrap out of the base).
 *
 * If `bwrap` is present but the container's seccomp profile (or kernel)
 * blocks `unshare(CLONE_NEWUSER)` — Docker's default seccomp does
 * exactly this for non-root — the shim is still installed, but a
 * warning is logged so the operator isn't surprised when they run
 * `claude-jail` and hit "No permissions to create new namespace".
 * Installing it anyway means the operator can later relax the
 * profile (custom seccomp / `--security-opt`) without re-running init.
 */
export const claudeSandboxStep: Step = {
  name: 'claude:sandbox',
  async run({ fs, homeDir, logger, shell }) {
    if (!(await shell.which('bwrap'))) {
      return { ok: true, message: 'bubblewrap not installed, claude-jail skipped' }
    }

    // Cheapest probe that exercises the same syscall claude-jail will
    // need: ask bwrap to create a user namespace and exit immediately.
    // Exit 0 ⇒ namespaces are allowed; non-zero (typically with
    // "No permissions to create new namespace" on stderr) ⇒ blocked
    // by seccomp or kernel policy.
    const probe = await shell.exec('bwrap', ['--unshare-user', 'true'])
    const usernsBlocked = probe.exitCode !== 0

    const installDir = joinPath(homeDir, LOCAL_SEG, BIN_SEG)
    const installPath = joinPath(installDir, CLAUDE_JAIL_SEG)

    await fs.mkdir(installDir, { recursive: true })
    await fs.writeFile(installPath, SHIM)
    await fs.chmod(installPath, SHIM_MODE)

    if (usernsBlocked) {
      logger.warn(
        `claude-jail installed at ${installPath}, but the container blocks unprivileged user namespaces (Docker's default seccomp profile drops unshare(CLONE_NEWUSER), or the kernel doesn't allow it). Run \`claude\` directly for now; see README "Inner sandbox — claude-jail" to relax the policy if you really need it.`,
      )
      return {
        ok: true,
        message: `claude-jail installed at ${installPath} (kernel/seccomp blocks bwrap; use \`claude\` directly)`,
      }
    }

    return { ok: true, message: `claude-jail installed at ${installPath}` }
  },
}
