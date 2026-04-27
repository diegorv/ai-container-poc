import { dirname } from 'node:path'
import { CONTAINER_LABEL_KEY } from '@/config'
import { hostClaudeProjectsOf } from '@/core/paths'
import { type AbsolutePath, brandAs } from '@/core/security/brand'
import { operatorPath } from '@/core/security/path'
import { asSafeFilename } from '@/core/security/untrusted-input'
import { mapWorkspaceKey, resolveClaudeProjectsDir } from '@/core/sync/map-workspace-key'
import { safeDestPath } from '@/core/sync/safe-dest-path'
import { walkFiles } from '@/lib/walk-fs'
import type { ContainerInfo, Docker } from '@/ports/docker'
import type { FileSystem } from '@/ports/filesystem'
import type { Logger } from '@/ports/logger'
import type { Shell } from '@/ports/shell'
import type { CommandDeps } from '../deps'

export interface SyncArgs {
  filter?: string
  /** Skip the host-trust confirmation when true. */
  trusted?: boolean
}

interface MatchedContainer {
  info: ContainerInfo
  projectName: string
  folder: string
}

function matchesFilter(name: string, filter: string | undefined): boolean {
  if (!filter) return true
  return name.toLowerCase().includes(filter.toLowerCase())
}

/**
 * Project names are stitched into `-devcontainer-<name>` keys that
 * become directories under `~/.claude/projects` on the host. The label
 * is `Untrusted<>` because a malicious devcontainer.json could re-issue
 * it via `runArgs --label`. `asSafeFilename` returns a `SafeFilename`
 * brand or `undefined`; `safeDestPath` is the second layer of defence
 * at the actual filesystem write.
 */
function projectNameOf(info: ContainerInfo): string | undefined {
  const folder = info.labels[CONTAINER_LABEL_KEY]?.unsafe() ?? ''
  const candidate = folder.split('/').pop() ?? folder
  return asSafeFilename(candidate)
}

function folderOf(info: ContainerInfo): string {
  // Display only — `.unsafe()` is the audit point.
  return info.labels[CONTAINER_LABEL_KEY]?.unsafe() ?? ''
}

async function copyIfNewer(
  fs: FileSystem,
  source: AbsolutePath,
  dest: AbsolutePath,
): Promise<boolean> {
  const srcStat = await fs.stat(source)
  const destExists = await fs.exists(dest)
  if (destExists) {
    const destStat = await fs.stat(dest)
    if (srcStat.mtimeMs <= destStat.mtimeMs) return false
  }
  await fs.mkdir(brandAs<'absolute-path'>(dirname(dest)), { recursive: true })
  await fs.copy(source, dest)
  // suppress unused warning when destExists is referenced only above
  void destExists
  return true
}

async function syncOne(
  match: MatchedContainer,
  hostProjects: AbsolutePath,
  deps: { fs: FileSystem; docker: Docker; shell: Shell; logger: Logger },
): Promise<void> {
  const { info, projectName, folder } = match
  const claudeDir = resolveClaudeProjectsDir({ env: info.env, user: info.user })

  deps.logger.info(`=== ${projectName} (${info.state}) ===`)
  deps.logger.info(`  Host path:  ${folder}`)
  deps.logger.info(`  Container:  ${info.id.slice(0, 12)}`)

  const tmp = await mkTemp(deps.shell)
  try {
    try {
      await deps.docker.cp({ source: `${info.id}:${claudeDir}/.`, dest: `${tmp}/` })
    } catch {
      deps.logger.info('  No sessions found, skipping.')
      return
    }

    const files = await walkFiles(deps.fs, tmp)
    const sessions = files.filter((f) => f.path.endsWith('.jsonl'))
    if (sessions.length === 0) {
      deps.logger.info('  No sessions found, skipping.')
      return
    }
    deps.logger.info(`  Sessions:   ${sessions.length}`)

    const perKey = new Map<string, number>()
    let total = 0

    for (const file of files) {
      const segments = file.relativePath.split('/')
      const isTopLevelJsonl = segments.length === 1 && file.relativePath.endsWith('.jsonl')
      const key = isTopLevelJsonl ? `-devcontainer-${projectName}` : segments[0]
      if (key === undefined) continue
      const destKey = isTopLevelJsonl ? key : mapWorkspaceKey(key, projectName)
      const restPath = isTopLevelJsonl ? file.relativePath : segments.slice(1).join('/')
      // The container is untrusted: refuse to copy when key or restPath
      // would escape hostProjects via `..` or absolute path segments.
      const destPath = safeDestPath(hostProjects, destKey, restPath)
      if (destPath === undefined) {
        deps.logger.warn(`  Skipping path traversal attempt: ${file.relativePath}`)
        continue
      }
      const copied = await copyIfNewer(deps.fs, file.path, destPath)
      if (copied) {
        perKey.set(destKey, (perKey.get(destKey) ?? 0) + 1)
        total += 1
      }
    }

    for (const [key, count] of perKey) {
      deps.logger.info(`  Synced ${count} file(s) -> ${key}`)
    }
    deps.logger.info(`  Total: ${total} file(s) synced.`)
  } finally {
    await deps.fs.remove(tmp, { recursive: true, force: true })
  }
}

async function mkTemp(shell: Shell): Promise<AbsolutePath> {
  const r = await shell.exec('mktemp', ['-d'])
  if (r.exitCode !== 0) {
    throw new Error(`mktemp failed: ${r.stderr}`)
  }
  return operatorPath(r.stdout.trim())
}

/**
 * Ports `cmd_sync` from install.sh — copies Claude session files from
 * every devcontainer (running or stopped) to `$HOME/.claude/projects`,
 * with `-workspace` keys rewritten to `-devcontainer-<name>` so they
 * don't collide with the host's own keys.
 */
export async function sync(args: SyncArgs, deps: CommandDeps): Promise<void> {
  const { docker, env, logger, prompt } = deps
  const hostProjects = hostClaudeProjectsOf(env.HOME)

  if (!args.trusted) {
    logger.warn('This copies files from devcontainers to your host filesystem.')
    logger.warn('Only proceed if you trust the container contents.')
    logger.info('Use --trusted to skip this prompt.')
    if (!(await prompt.confirm('Continue?'))) {
      logger.info('Aborted.')
      return
    }
  }

  const containers = await docker.listContainers({
    label: CONTAINER_LABEL_KEY,
    all: true,
  })
  if (containers.length === 0) {
    throw new Error('No devcontainers found (running or stopped).')
  }

  const matches: MatchedContainer[] = []
  for (const info of containers) {
    const name = projectNameOf(info)
    if (name === undefined) {
      logger.warn(
        `Skipping container ${info.id.slice(0, 12)}: project label '${folderOf(info)}' is not a safe filename.`,
      )
      continue
    }
    if (!matchesFilter(name, args.filter)) continue
    matches.push({ info, projectName: name, folder: folderOf(info) })
  }

  if (matches.length === 0) {
    logger.error(`No devcontainers matching '${args.filter ?? ''}'.`)
    logger.info('Available:')
    for (const info of containers) {
      const name = projectNameOf(info) ?? '<invalid>'
      logger.info(`  - ${name} (${info.state})`)
    }
    throw new Error('no matching devcontainers')
  }

  logger.info('Discovered devcontainers:')
  for (const m of matches) {
    logger.info(`  - ${m.projectName} (${m.info.state}) ${m.folder}`)
  }

  for (const m of matches) {
    await syncOne(m, hostProjects, deps)
  }

  logger.success("Run '/insights' in Claude Code to include these sessions.")
}
