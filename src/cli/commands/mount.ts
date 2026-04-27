import { DEVCONTAINER_DIR, DEVCONTAINER_FILENAME } from '@/config'
import { addBindMount } from '@/core/devcontainer/manipulate-mounts'
import { DevcontainerConfigSchema } from '@/schemas/devcontainer-config'
import type { CommandDeps } from '../deps'

export interface MountArgs {
  cwd: string
  hostPath: string
  containerPath: string
  readonly?: boolean
}

/**
 * Ports `cmd_mount` from install.sh. Validates the host path exists,
 * adds (or replaces) the bind mount in `.devcontainer/devcontainer.json`,
 * then recreates the container so the new mount takes effect.
 */
export async function mount(args: MountArgs, deps: CommandDeps): Promise<void> {
  const { devcontainer, fs, logger } = deps
  const dcJson = `${args.cwd}/${DEVCONTAINER_DIR}/${DEVCONTAINER_FILENAME}`

  if (!(await fs.exists(dcJson))) {
    throw new Error(`No devcontainer.json at ${dcJson}. Run 'mydevc template' first.`)
  }

  if (!(await fs.exists(args.hostPath))) {
    throw new Error(`Host path does not exist: ${args.hostPath}`)
  }
  const resolvedHost = await fs.realpath(args.hostPath)

  const raw = await fs.readFile(dcJson)
  const config = DevcontainerConfigSchema.parse(JSON.parse(raw))
  const updatedMounts = addBindMount({
    mounts: config.mounts,
    hostPath: resolvedHost,
    containerPath: args.containerPath,
    readonly: args.readonly,
  })
  await fs.writeFile(dcJson, `${JSON.stringify({ ...config, mounts: updatedMounts }, null, 2)}\n`)

  logger.info(`Adding mount: ${resolvedHost} → ${args.containerPath}`)
  logger.info('Recreating container with new mount…')
  await devcontainer.up({ workspaceFolder: args.cwd, removeExistingContainer: true })
  logger.success(`Mount added: ${resolvedHost} → ${args.containerPath}`)
}
