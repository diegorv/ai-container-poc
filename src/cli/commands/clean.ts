import { UID_IMAGE_SUFFIX } from '@/config'
import { computeProjectId } from '@/core/project/compute-project-id'
import type { CommandDeps } from '../deps'

export interface CleanArgs {
  cwd: string
  /** Remove the project's container (stops it first if running). */
  container?: boolean
  /** Remove the project's docker volumes. */
  volumes?: boolean
  /** Remove the project's image (and its `-uid` variant if present). */
  images?: boolean
  /** Run `docker builder prune -f` to drop the build cache. */
  cache?: boolean
  /** Skip the confirmation prompt. */
  force?: boolean
  /** Print what would be removed without doing it. */
  dryRun?: boolean
}

interface Discovered {
  containerId?: string
  containerName?: string
  containerState?: string
  volumes: string[]
  baseImage?: string
  uidImage?: string
}

async function discover(deps: CommandDeps, label: string): Promise<Discovered> {
  const all = await deps.docker.listContainers({ label, all: true })
  const c = all[0]
  if (!c) return { volumes: [] }
  const volumes = c.mounts
    .filter((m) => m.type === 'volume' && typeof m.name === 'string')
    .map((m) => m.name as string)
  const baseImage = c.image.endsWith(UID_IMAGE_SUFFIX)
    ? c.image.slice(0, -UID_IMAGE_SUFFIX.length)
    : c.image
  return {
    containerId: c.id,
    containerName: c.name,
    containerState: c.state,
    volumes,
    baseImage,
    uidImage: `${baseImage}${UID_IMAGE_SUFFIX}`,
  }
}

/**
 * Per-project granular cleanup. Pick which resources to drop via flags;
 * unlike `destroy`, nothing is removed unless explicitly selected. Useful
 * to free disk (`--images`, `--cache`) without losing the container's
 * persistent volumes, or to start over without rebuilding the image.
 */
export async function clean(args: CleanArgs, deps: CommandDeps): Promise<void> {
  const { docker, logger, prompt, shell } = deps
  const wantContainer = args.container === true
  const wantVolumes = args.volumes === true
  const wantImages = args.images === true
  const wantCache = args.cache === true

  if (!wantContainer && !wantVolumes && !wantImages && !wantCache) {
    throw new Error(
      'clean: pick at least one of --container, --volumes, --images, --cache (or use `mydevc destroy` for everything).',
    )
  }

  const project = computeProjectId(args.cwd)
  const found = await discover(deps, project.containerLabel)

  const plan: string[] = []
  if (wantContainer && found.containerId) {
    plan.push(
      `container ${found.containerName ?? found.containerId} (${found.containerState ?? 'unknown'})`,
    )
  }
  if (wantVolumes && found.volumes.length > 0) {
    for (const v of found.volumes) plan.push(`volume ${v}`)
  }
  if (wantImages && found.baseImage) {
    plan.push(`image ${found.baseImage}`)
    if (found.uidImage && (await docker.imageExists(found.uidImage))) {
      plan.push(`image ${found.uidImage}`)
    }
  }
  if (wantCache) plan.push('docker builder cache')

  if (plan.length === 0) {
    logger.info('Nothing to clean for this workspace.')
    return
  }

  if (args.dryRun) {
    logger.info('Dry run — would remove:')
    for (const item of plan) logger.info(`  - ${item}`)
    return
  }

  logger.warn('The following resources will be removed:')
  for (const item of plan) logger.info(`  - ${item}`)

  if (!args.force) {
    if (!(await prompt.confirm('Continue?'))) {
      logger.info('Aborted.')
      return
    }
  }

  if (wantContainer && found.containerId) {
    if (found.containerState === 'running') {
      logger.info('Stopping container…')
      try {
        await docker.stopContainer(found.containerId)
      } catch {
        // best-effort
      }
    }
    logger.info('Removing container…')
    try {
      await docker.removeContainer(found.containerId, { force: true })
    } catch {
      // best-effort
    }
  }

  if (wantVolumes) {
    for (const v of found.volumes) {
      logger.info(`Removing volume: ${v}`)
      try {
        await docker.removeVolume(v, { force: true })
      } catch {
        // best-effort
      }
    }
  }

  if (wantImages && found.baseImage) {
    if (await docker.imageExists(found.baseImage)) {
      logger.info(`Removing image: ${found.baseImage}`)
      try {
        await docker.removeImage(found.baseImage, { force: true })
      } catch {
        // best-effort
      }
    }
    if (found.uidImage && (await docker.imageExists(found.uidImage))) {
      logger.info(`Removing image: ${found.uidImage}`)
      try {
        await docker.removeImage(found.uidImage, { force: true })
      } catch {
        // best-effort
      }
    }
  }

  if (wantCache) {
    logger.info('Pruning docker builder cache…')
    const r = await shell.exec('docker', ['builder', 'prune', '-f'])
    if (r.exitCode !== 0) {
      logger.warn(`docker builder prune failed: ${r.stderr.trim()}`)
    }
  }

  logger.success('Clean complete.')
}
