import { dirname } from 'node:path'
import { CONTAINER_LABEL_KEY } from '@/config'
import { mapWorkspaceKey, resolveClaudeProjectsDir } from '@/core/sync/map-workspace-key'
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

function projectNameOf(info: ContainerInfo): string {
  const folder = info.labels[CONTAINER_LABEL_KEY] ?? ''
  return folder.split('/').pop() ?? folder
}

async function copyIfNewer(fs: FileSystem, source: string, dest: string): Promise<boolean> {
  const srcStat = await fs.stat(source)
  const destExists = await fs.exists(dest)
  if (destExists) {
    const destStat = await fs.stat(dest)
    if (srcStat.mtimeMs <= destStat.mtimeMs) return false
  }
  await fs.mkdir(dirname(dest), { recursive: true })
  await fs.copy(source, dest)
  // suppress unused warning when destExists is referenced only above
  void destExists
  return true
}

async function syncOne(
  match: MatchedContainer,
  hostProjects: string,
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
      const destPath = `${hostProjects}/${destKey}/${restPath}`
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

async function mkTemp(shell: Shell): Promise<string> {
  const r = await shell.exec('mktemp', ['-d'])
  if (r.exitCode !== 0) {
    throw new Error(`mktemp failed: ${r.stderr}`)
  }
  return r.stdout.trim()
}

/**
 * Ports `cmd_sync` from install.sh — copies Claude session files from
 * every devcontainer (running or stopped) to `$HOME/.claude/projects`,
 * with `-workspace` keys rewritten to `-devcontainer-<name>` so they
 * don't collide with the host's own keys.
 */
export async function sync(args: SyncArgs, deps: CommandDeps): Promise<void> {
  const { docker, env, logger, prompt } = deps
  const home = env.HOME
  const hostProjects = `${home}/.claude/projects`

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
    if (!matchesFilter(name, args.filter)) continue
    matches.push({ info, projectName: name, folder: info.labels[CONTAINER_LABEL_KEY] ?? '' })
  }

  if (matches.length === 0) {
    logger.error(`No devcontainers matching '${args.filter ?? ''}'.`)
    logger.info('Available:')
    for (const info of containers) {
      logger.info(`  - ${projectNameOf(info)} (${info.state})`)
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
