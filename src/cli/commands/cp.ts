import { computeProjectId } from '@/core/project/compute-project-id'
import type { CommandDeps } from '../deps'

export interface CpArgs {
  cwd: string
  containerPath: string
  hostPath: string
}

/**
 * Ports `cmd_cp` from install.sh. Looks up the running container by
 * label and runs `docker cp <container>:<src> <hostPath>`.
 */
export async function cp(args: CpArgs, deps: CommandDeps): Promise<void> {
  const { docker, logger } = deps
  const project = computeProjectId(args.cwd)
  const containers = await docker.listContainers({ label: project.containerLabel })
  const running = containers.find((c) => c.state === 'running') ?? containers[0]
  if (!running) {
    throw new Error(`No running devcontainer found for ${args.cwd}`)
  }
  logger.info(`Copying ${args.containerPath} → ${args.hostPath}`)
  await docker.cp({
    source: `${running.id}:${args.containerPath}`,
    dest: args.hostPath,
  })
  logger.success(`Copied ${args.containerPath} → ${args.hostPath}`)
}
