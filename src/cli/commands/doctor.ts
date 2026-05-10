import { joinPath, pathString, safeFilename } from '@/core/security/path'
import type { CommandDeps } from '../deps'

export interface DoctorArgs {
  /** Emit machine-readable JSON instead of human-readable text. */
  json?: boolean
}

export type DoctorStatus = 'ok' | 'warn' | 'fail'

export interface DoctorCheck {
  /** Short identifier shown on the left of the row. */
  name: string
  status: DoctorStatus
  /** One-line detail (version, path, value). */
  detail: string
  /** Hint for fixing a `warn` or `fail`; absent on `ok`. */
  suggestion?: string
}

const GITCONFIG_SEG = safeFilename('.gitconfig')
const LOCAL_SEG = safeFilename('.local')
const BIN_SEG = safeFilename('bin')

interface DockerInfo {
  ServerVersion?: string
  NCPU?: number
  MemTotal?: number
  Name?: string
  OperatingSystem?: string
}

async function checkDocker(deps: CommandDeps): Promise<DoctorCheck> {
  try {
    const r = await deps.shell.exec('docker', ['info', '--format', '{{json .}}'])
    if (r.exitCode !== 0) {
      return {
        name: 'docker',
        status: 'fail',
        detail: 'daemon not reachable',
        suggestion:
          'Start Docker Desktop / OrbStack / Colima. On macOS, `open -a OrbStack` or `colima start`.',
      }
    }
    const info = JSON.parse(r.stdout) as DockerInfo
    const version = info.ServerVersion ?? 'unknown'
    const cpus = info.NCPU ?? 0
    const memGB = info.MemTotal ? (info.MemTotal / 1024 ** 3).toFixed(1) : '?'
    const flavour = info.Name ? `, ${info.Name}` : ''
    return {
      name: 'docker',
      status: 'ok',
      detail: `${version} (${cpus} CPU, ${memGB} GB${flavour})`,
    }
  } catch (err) {
    return {
      name: 'docker',
      status: 'fail',
      detail: `docker not on PATH (${(err as Error).message})`,
      suggestion: 'Install Docker Desktop, OrbStack, or Colima and ensure `docker` is on PATH.',
    }
  }
}

async function checkDevcontainerCli(deps: CommandDeps): Promise<DoctorCheck> {
  const path = await deps.shell.which('devcontainer')
  if (!path) {
    return {
      name: 'devcontainer',
      status: 'fail',
      detail: 'CLI not on PATH',
      suggestion:
        'Install via `npm install -g @devcontainers/cli`, or reinstall mydevc so the bundled binary is exposed.',
    }
  }
  return { name: 'devcontainer', status: 'ok', detail: path }
}

function checkNodeVersion(): DoctorCheck {
  const raw = process.versions.node
  const major = Number(raw.split('.')[0])
  if (!Number.isInteger(major) || major < 22) {
    return {
      name: 'node',
      status: 'fail',
      detail: `v${raw} (need ≥ 22)`,
      suggestion: 'Upgrade Node — `fnm install 22 && fnm default 22` or `brew upgrade node`.',
    }
  }
  return { name: 'node', status: 'ok', detail: `v${raw}` }
}

async function checkGitconfig(deps: CommandDeps): Promise<DoctorCheck> {
  const path = joinPath(deps.env.HOME, GITCONFIG_SEG)
  if (!(await deps.fs.exists(path))) {
    return {
      name: 'gitconfig',
      status: 'warn',
      detail: `${path} missing`,
      suggestion:
        'Set up git identity: `git config --global user.name "..."` and `user.email`. Without it the read-only mount inside the container points at nothing.',
    }
  }
  return { name: 'gitconfig', status: 'ok', detail: pathString(path) }
}

function checkLocalBinOnPath(deps: CommandDeps): DoctorCheck {
  const localBin = joinPath(deps.env.HOME, LOCAL_SEG, BIN_SEG)
  const path = deps.env.PATH ?? ''
  // Match exact segments, not substrings — "/foo/.local/bin-tool" must
  // not satisfy "$HOME/.local/bin".
  const segments = path.split(':').filter((s) => s.length > 0)
  if (!segments.includes(pathString(localBin))) {
    return {
      name: 'PATH',
      status: 'warn',
      detail: `${pathString(localBin)} not in PATH`,
      suggestion:
        'Add `export PATH="$HOME/.local/bin:$PATH"` to ~/.zshrc (or ~/.bashrc) so `mydevc self-install` works without a shell restart.',
    }
  }
  return { name: 'PATH', status: 'ok', detail: '~/.local/bin present' }
}

function checkSshAgent(deps: CommandDeps): DoctorCheck {
  const sock = deps.env.SSH_AUTH_SOCK
  if (!sock) {
    return {
      name: 'ssh-agent',
      status: 'warn',
      detail: 'SSH_AUTH_SOCK not set',
      suggestion:
        'Start ssh-agent and add a key (`eval "$(ssh-agent -s)" && ssh-add`) so `git push` from inside the container can authenticate without copying the key in.',
    }
  }
  return { name: 'ssh-agent', status: 'ok', detail: `SSH_AUTH_SOCK=${sock}` }
}

const GLYPH: Record<DoctorStatus, string> = { ok: '✓', warn: '⚠', fail: '✗' }

function rowText(check: DoctorCheck, nameWidth: number): string {
  return `${GLYPH[check.status]} ${check.name.padEnd(nameWidth)}  ${check.detail}`
}

/**
 * Runs a flat list of pre-flight checks. Surfaces the same problems
 * users hit on first install (docker not running, devcontainer CLI
 * missing, ~/.local/bin not in PATH, no ssh-agent) but as one command
 * with concrete suggestions instead of seven different error
 * messages spread across `up`, `self-install`, etc.
 *
 * Return code mirrors the worst status:
 *   - all `ok`/`warn`  → 0 (warnings don't fail CI by default)
 *   - any `fail`        → 1
 */
export async function doctor(args: DoctorArgs, deps: CommandDeps): Promise<number> {
  const checks: DoctorCheck[] = [
    await checkDocker(deps),
    await checkDevcontainerCli(deps),
    checkNodeVersion(),
    await checkGitconfig(deps),
    checkLocalBinOnPath(deps),
    checkSshAgent(deps),
  ]

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ checks }, null, 2)}\n`)
  } else {
    const nameWidth = checks.reduce((w, c) => Math.max(w, c.name.length), 0)
    for (const check of checks) {
      deps.logger.info(rowText(check, nameWidth))
      if (check.suggestion) {
        deps.logger.info(`  → ${check.suggestion}`)
      }
    }
  }

  return checks.some((c) => c.status === 'fail') ? 1 : 0
}
