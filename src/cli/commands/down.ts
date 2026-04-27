import { computeProjectId } from '@/core/project/compute-project-id'
import { operatorPath } from '@/core/security/path'
import type { CommandDeps } from '../deps'

export interface DownArgs {
  cwd: string
}

/**
 * Ports `cmd_down` from install.sh. Looks up the project's container by
 * the `devcontainer.local_folder` label and stops it. No-op (with a
 * warning) when no container is running for the workspace.
 */
export async function down(args: DownArgs, deps: CommandDeps): Promise<void> {
  const { docker, logger } = deps
  const project = computeProjectId(operatorPath(args.cwd))

  logger.info('Stopping devcontainer…')
  const containers = await docker.listContainers({ label: project.containerLabel })
  if (containers.length === 0) {
    logger.warn(`No running devcontainer found for ${args.cwd}`)
    return
  }
  for (const c of containers) {
    await docker.stopContainer(c.id)
  }
  logger.success('Devcontainer stopped.')
}
