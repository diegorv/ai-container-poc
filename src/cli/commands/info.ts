import { DEVCONTAINER_DIR, DEVCONTAINER_FILENAME, UID_IMAGE_SUFFIX } from '@/config'
import { extractCustomMounts } from '@/core/devcontainer/manipulate-mounts'
import { computeProjectId } from '@/core/project/compute-project-id'
import type { Mount } from '@/schemas/devcontainer-config'
import { DevcontainerConfigSchema } from '@/schemas/devcontainer-config'
import type { CommandDeps } from '../deps'

export interface InfoArgs {
  cwd: string
  /** Emit machine-readable JSON instead of human-readable text. */
  json?: boolean
}

interface ContainerInfoSummary {
  id: string
  name: string
  state: string
  image: string
  hasUidImageVariant: boolean
  volumes: string[]
}

interface InfoSummary {
  workspaceFolder: string
  projectName: string
  containerLabel: string
  hasDevcontainerDir: boolean
  container: ContainerInfoSummary | null
  customMounts: Mount[]
}

async function collectSummary(args: InfoArgs, deps: CommandDeps): Promise<InfoSummary> {
  const { docker, fs } = deps
  const project = computeProjectId(args.cwd)
  const dcDir = `${args.cwd}/${DEVCONTAINER_DIR}`
  const dcJson = `${dcDir}/${DEVCONTAINER_FILENAME}`

  const summary: InfoSummary = {
    workspaceFolder: args.cwd,
    projectName: project.projectName,
    containerLabel: project.containerLabel,
    hasDevcontainerDir: await fs.exists(dcDir),
    container: null,
    customMounts: [],
  }

  if (!summary.hasDevcontainerDir) return summary

  const containers = await docker.listContainers({ label: project.containerLabel, all: true })
  const container = containers[0]
  if (container) {
    const baseImage = container.image.endsWith(UID_IMAGE_SUFFIX)
      ? container.image.slice(0, -UID_IMAGE_SUFFIX.length)
      : container.image
    summary.container = {
      id: container.id,
      name: container.name,
      state: container.state,
      image: baseImage,
      hasUidImageVariant: await docker.imageExists(`${baseImage}${UID_IMAGE_SUFFIX}`),
      volumes: container.mounts
        .filter((m) => m.type === 'volume' && typeof m.name === 'string')
        .map((m) => m.name as string),
    }
  }

  if (await fs.exists(dcJson)) {
    try {
      const parsed = DevcontainerConfigSchema.parse(JSON.parse(await fs.readFile(dcJson)))
      summary.customMounts = extractCustomMounts(parsed.mounts)
    } catch {
      // Leave customMounts empty if parsing fails.
    }
  }

  return summary
}

function printSummary(s: InfoSummary, deps: CommandDeps): void {
  const { logger } = deps
  logger.info(`Workspace:       ${s.workspaceFolder}`)
  logger.info(`Project name:    ${s.projectName}`)
  logger.info(`Container label: ${s.containerLabel}`)

  if (!s.hasDevcontainerDir) {
    logger.info('')
    logger.warn('No .devcontainer/ found in this workspace.')
    logger.info('Run `mydevc template` to install one.')
    return
  }

  if (!s.container) {
    logger.info('')
    logger.warn('No devcontainer found for this workspace.')
    logger.info('Run `mydevc up` (or `mydevc dot`) to create one.')
  } else {
    logger.info('')
    logger.info(`Container:       ${s.container.name} (${s.container.id.slice(0, 12)})`)
    logger.info(`Status:          ${s.container.state}`)
    logger.info(
      `Image:           ${s.container.image}${s.container.hasUidImageVariant ? ` (+ ${UID_IMAGE_SUFFIX})` : ''}`,
    )
    if (s.container.volumes.length > 0) {
      logger.info(`Volumes (${s.container.volumes.length}):`)
      for (const v of s.container.volumes) logger.info(`  - ${v}`)
    }
  }

  if (s.customMounts.length > 0) {
    logger.info('')
    logger.info(`Custom mounts (${s.customMounts.length}):`)
    for (const m of s.customMounts) {
      logger.info(`  - ${typeof m === 'string' ? m : `${m.source} → ${m.target} (${m.type})`}`)
    }
  }
}

/**
 * Prints a human-readable summary (default) or a JSON payload (`--json`)
 * describing the devcontainer for the given workspace.
 *
 * Returns the JSON string when `--json` is set so the dispatcher can
 * write it directly to stdout (separate from the logger's stderr stream).
 */
export async function info(args: InfoArgs, deps: CommandDeps): Promise<string | undefined> {
  const summary = await collectSummary(args, deps)
  if (args.json) {
    return JSON.stringify(summary, null, 2)
  }
  printSummary(summary, deps)
  return undefined
}
