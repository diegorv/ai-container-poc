import { DEVCONTAINER_DIR, DEVCONTAINER_FILENAME, UID_IMAGE_SUFFIX } from '@/config'
import { extractCustomMounts } from '@/core/devcontainer/manipulate-mounts'
import { computeProjectId } from '@/core/project/compute-project-id'
import { DevcontainerConfigSchema } from '@/schemas/devcontainer-config'
import type { CommandDeps } from '../deps'

export interface InfoArgs {
  cwd: string
}

/**
 * Prints a human-readable summary of the devcontainer for the given
 * workspace: container state, image (with `-uid` variant detection),
 * docker volumes attached, and any custom mounts declared in
 * `.devcontainer/devcontainer.json`.
 */
export async function info(args: InfoArgs, deps: CommandDeps): Promise<void> {
  const { docker, fs, logger } = deps
  const project = computeProjectId(args.cwd)
  const dcDir = `${args.cwd}/${DEVCONTAINER_DIR}`
  const dcJson = `${dcDir}/${DEVCONTAINER_FILENAME}`

  logger.info(`Workspace:       ${args.cwd}`)
  logger.info(`Project name:    ${project.projectName}`)
  logger.info(`Container label: ${project.containerLabel}`)

  if (!(await fs.exists(dcDir))) {
    logger.info('')
    logger.warn('No .devcontainer/ found in this workspace.')
    logger.info('Run `mydevc template` to install one.')
    return
  }

  const containers = await docker.listContainers({ label: project.containerLabel, all: true })
  const container = containers[0]

  if (!container) {
    logger.info('')
    logger.warn('No devcontainer found for this workspace.')
    logger.info('Run `mydevc up` (or `mydevc dot`) to create one.')
  } else {
    const image = container.image
    const baseImage = image.endsWith(UID_IMAGE_SUFFIX)
      ? image.slice(0, -UID_IMAGE_SUFFIX.length)
      : image
    const uidImage = `${baseImage}${UID_IMAGE_SUFFIX}`
    const hasUidVariant = await docker.imageExists(uidImage)

    logger.info('')
    logger.info(`Container:       ${container.name} (${container.id.slice(0, 12)})`)
    logger.info(`Status:          ${container.state}`)
    logger.info(`Image:           ${baseImage}${hasUidVariant ? ` (+ ${UID_IMAGE_SUFFIX})` : ''}`)

    const volumes = container.mounts
      .filter((m) => m.type === 'volume' && typeof m.name === 'string')
      .map((m) => m.name as string)
    if (volumes.length > 0) {
      logger.info(`Volumes (${volumes.length}):`)
      for (const v of volumes) logger.info(`  - ${v}`)
    }
  }

  if (await fs.exists(dcJson)) {
    try {
      const parsed = DevcontainerConfigSchema.parse(JSON.parse(await fs.readFile(dcJson)))
      const custom = extractCustomMounts(parsed.mounts)
      if (custom.length > 0) {
        logger.info('')
        logger.info(`Custom mounts (${custom.length}):`)
        for (const m of custom) {
          logger.info(`  - ${typeof m === 'string' ? m : `${m.source} → ${m.target} (${m.type})`}`)
        }
      }
    } catch {
      logger.warn(`Could not parse ${dcJson} (skipping mounts summary).`)
    }
  }
}
