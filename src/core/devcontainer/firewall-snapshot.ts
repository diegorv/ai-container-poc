/**
 * Build the host-side snapshot of a project's firewall allowlist and
 * push it into the container at a path the container cannot influence.
 *
 * Why this exists:
 *
 * The source of truth — `.devcontainer/firewall-allowlist.txt` — lives
 * inside the workspace, which is shared with the container. Anything
 * with workspace write access (Claude on the host being persuaded by
 * untrusted output, an editor extension, a malicious dependency
 * dropping files during `npm install`) can swap entries for exfil
 * targets, and the next `mydevc up` would happily apply them.
 *
 * The snapshot flow narrows that:
 *
 * 1. **Parse + validate** the workspace file in TypeScript. Lines must
 *    be syntactically valid hostnames or IPs; anything else aborts the
 *    `up` instead of being silently dropped.
 * 2. **Render a canonical, comment-free copy** to
 *    `~/.mydevc/firewalls/<slug>/allowlist.txt` on the host. This file
 *    is operator-owned; the container has no path to it.
 * 3. **Push the canonical copy into the container** at
 *    `/etc/mydevc/firewall-allowlist.txt` via `docker cp` (host →
 *    container). `setup-firewall.sh` reads from there in preference
 *    to the workspace path.
 *
 * The result: `setup-firewall.sh` always sees a host-validated file.
 * If the workspace copy was tampered with between the validation pass
 * and the docker-cp pass, the worst case is a stale-but-still-valid
 * snapshot — never an unvalidated line reaching iptables.
 */

import { createHash } from 'node:crypto'
import { CONTAINER_LABEL_KEY } from '@/config'
import { devcontainerDirOf } from '@/core/paths'
import type { AbsolutePath } from '@/core/security/brand'
import {
  type FirewallAllowlistEntry,
  type FirewallAllowlistRejection,
  parseFirewallAllowlist,
  renderFirewallAllowlist,
} from '@/core/security/firewall-allowlist'
import { joinPath, literalPath, safeFilename } from '@/core/security/path'
import { CliError } from '@/lib/cli-error'
import type { Docker } from '@/ports/docker'
import type { FileSystem } from '@/ports/filesystem'
import type { Logger } from '@/ports/logger'

const ALLOWLIST_FILENAME = 'firewall-allowlist.txt'
const ALLOWLIST_FILENAME_SEG = safeFilename(ALLOWLIST_FILENAME)
const MYDEVC_DIR_SEG = safeFilename('.mydevc')
const FIREWALLS_DIR_SEG = safeFilename('firewalls')

/**
 * In-container destination for the validated allowlist. Owned by the
 * Docker daemon (so `vscode` cannot edit it), read by setup-firewall.sh.
 */
export const CONTAINER_ALLOWLIST_PATH = literalPath('/etc/mydevc/firewall-allowlist.txt')

/**
 * Build a filesystem-safe slug for the snapshot directory. Combines
 * the workspace basename (display) with a hash of the full path
 * (uniqueness). Two projects called `crypto` in different directories
 * never collide.
 */
export function snapshotSlugOf(workspaceFolder: AbsolutePath): string {
  const fullHash = createHash('sha256').update(workspaceFolder).digest('hex').slice(0, 12)
  const basename = workspaceFolder.split('/').pop() ?? ''
  const cleanedBase = basename.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  const baseSegment = cleanedBase.length > 0 ? cleanedBase.slice(0, 32) : 'project'
  return `${baseSegment}-${fullHash}`
}

/** `<home>/.mydevc/firewalls/<slug>/allowlist.txt` — operator-owned snapshot. */
export function hostSnapshotPath(home: AbsolutePath, workspaceFolder: AbsolutePath): AbsolutePath {
  const slug = safeFilename(snapshotSlugOf(workspaceFolder))
  return joinPath(home, MYDEVC_DIR_SEG, FIREWALLS_DIR_SEG, slug, ALLOWLIST_FILENAME_SEG)
}

/** `<workspace>/.devcontainer/firewall-allowlist.txt` — operator-edited source. */
export function workspaceAllowlistPath(workspaceFolder: AbsolutePath): AbsolutePath {
  return joinPath(devcontainerDirOf(workspaceFolder), ALLOWLIST_FILENAME_SEG)
}

export interface FirewallSnapshotDeps {
  docker: Docker
  fs: FileSystem
  logger: Logger
  /** Operator's home directory — used to anchor the snapshot path. */
  home: AbsolutePath
}

export interface FirewallSnapshotResult {
  /** Number of entries written to the snapshot. */
  readonly entryCount: number
  /** Host path of the canonical snapshot, for logging. */
  readonly snapshotPath: AbsolutePath
}

function formatRejections(
  source: AbsolutePath,
  rejected: readonly FirewallAllowlistRejection[],
): string {
  const lines = rejected.map((r) => `  line ${r.line}: ${r.reason} (raw: ${JSON.stringify(r.raw)})`)
  return `Refusing to apply firewall: ${rejected.length} invalid line(s) in ${source}:\n${lines.join('\n')}`
}

/**
 * Parse the workspace allowlist and write the validated, canonical
 * form to the host snapshot path. Throws `CliError` when any line is
 * syntactically invalid — silently dropping malformed lines would
 * preserve a feeling of safety while letting an attacker turn lines
 * into noise.
 */
export async function writeHostSnapshot(
  workspaceFolder: AbsolutePath,
  deps: { fs: FileSystem; home: AbsolutePath },
): Promise<{ entries: readonly FirewallAllowlistEntry[]; snapshotPath: AbsolutePath }> {
  const source = workspaceAllowlistPath(workspaceFolder)
  const raw = await deps.fs.readFile(source)
  const parsed = parseFirewallAllowlist(raw)
  if (parsed.rejected.length > 0) {
    throw new CliError(formatRejections(source, parsed.rejected), {
      suggestion: `Edit ${source} so every non-comment line is a hostname or IP.`,
    })
  }

  const snapshotPath = hostSnapshotPath(deps.home, workspaceFolder)
  // `joinPath` already anchored under deps.home; just ensure the
  // directory exists before writing the file.
  const snapshotDir = joinPath(
    deps.home,
    MYDEVC_DIR_SEG,
    FIREWALLS_DIR_SEG,
    safeFilename(snapshotSlugOf(workspaceFolder)),
  )
  await deps.fs.mkdir(snapshotDir, { recursive: true })
  await deps.fs.writeFile(snapshotPath, renderFirewallAllowlist(parsed.entries))
  // The snapshot may contain destinations the container should not be
  // able to enumerate even if it had read access to the workspace.
  // 0o600 = operator-only; defence in depth.
  await deps.fs.chmod(snapshotPath, 0o600)

  return { entries: parsed.entries, snapshotPath }
}

/**
 * Push the host snapshot into the running container at
 * `/etc/mydevc/firewall-allowlist.txt`. Uses `docker cp` (root inside
 * the container) so the file is root-owned and read-only for vscode —
 * the container cannot reach back and edit it.
 */
export async function pushSnapshotToContainer(args: {
  containerId: string
  snapshotPath: AbsolutePath
  deps: { docker: Docker }
}): Promise<void> {
  const { containerId, snapshotPath, deps } = args
  // Ensure the destination directory exists. `mkdir -p` is idempotent
  // and -m 0755 leaves it world-readable so vscode-uid can stat the
  // tree (the file itself is locked down below).
  const mkdir = await deps.docker.exec(containerId, ['mkdir', '-p', '/etc/mydevc'], {
    user: 'root',
  })
  if (mkdir.exitCode !== 0) {
    throw new Error(`mkdir /etc/mydevc failed: ${mkdir.stderr.trim() || mkdir.stdout.trim()}`)
  }
  await deps.docker.cp({ source: snapshotPath, dest: `${containerId}:${CONTAINER_ALLOWLIST_PATH}` })
  // Lock down ownership and mode. `chmod 0444` so even root inside the
  // container has to go through a deliberate chmod to overwrite, and
  // `chown root:root` so vscode (the unprivileged user Claude runs as)
  // cannot edit even if it gains write to /etc/mydevc.
  const chown = await deps.docker.exec(
    containerId,
    ['chown', 'root:root', CONTAINER_ALLOWLIST_PATH],
    { user: 'root' },
  )
  if (chown.exitCode !== 0) {
    throw new Error(`chown failed: ${chown.stderr.trim() || chown.stdout.trim()}`)
  }
  const chmod = await deps.docker.exec(containerId, ['chmod', '0444', CONTAINER_ALLOWLIST_PATH], {
    user: 'root',
  })
  if (chmod.exitCode !== 0) {
    throw new Error(`chmod failed: ${chmod.stderr.trim() || chmod.stdout.trim()}`)
  }
}

/**
 * Top-level snapshot orchestration. Called from `up` / `rebuild` after
 * `devcontainer up` has produced a container. Picks the running
 * container for the workspace, validates + snapshots the allowlist,
 * pushes it inside the container. Returns the count for logging.
 *
 * No-op when the workspace allowlist is absent (the documented "no
 * firewall" signal).
 */
export async function snapshotAndPushFirewallAllowlist(
  workspaceFolder: AbsolutePath,
  deps: FirewallSnapshotDeps,
): Promise<FirewallSnapshotResult | undefined> {
  const source = workspaceAllowlistPath(workspaceFolder)
  if (!(await deps.fs.exists(source))) return undefined

  const { entries, snapshotPath } = await writeHostSnapshot(workspaceFolder, {
    fs: deps.fs,
    home: deps.home,
  })

  const containers = await deps.docker.listContainers({
    label: `${CONTAINER_LABEL_KEY}=${workspaceFolder}`,
    all: true,
  })
  const running = containers.find((c) => c.state === 'running') ?? containers[0]
  if (!running) {
    throw new Error(
      'Refusing to continue: --secure firewall allowlist is present but no container was found.',
    )
  }

  await pushSnapshotToContainer({
    containerId: running.id,
    snapshotPath,
    deps: { docker: deps.docker },
  })

  return { entryCount: entries.length, snapshotPath }
}
