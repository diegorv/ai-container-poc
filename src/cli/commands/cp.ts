import { computeProjectId } from '@/core/project/compute-project-id'
import { CliError } from '@/lib/cli-error'
import type { CommandDeps } from '../deps'

export interface CpArgs {
  cwd: string
  containerPath: string
  hostPath: string
}

function rejectFlagLike(label: string, value: string): void {
  if (value.startsWith('-')) {
    throw new CliError(`${label} starts with '-'; refuse to pass it as a docker cp argument.`, {
      suggestion: `Prefix the path with './' (e.g. './-weird-name') to disambiguate.`,
    })
  }
}

/**
 * Ports `cmd_cp` from install.sh. Looks up the running container by
 * label and runs `docker cp <container>:<src> <hostPath>`.
 */
export async function cp(args: CpArgs, deps: CommandDeps): Promise<void> {
  const { docker, logger } = deps
  rejectFlagLike('containerPath', args.containerPath)
  rejectFlagLike('hostPath', args.hostPath)
  const project = computeProjectId(args.cwd)
  const containers = await docker.listContainers({ label: project.containerLabel })
  const running = containers.find((c) => c.state === 'running') ?? containers[0]
  if (!running) {
    throw new CliError(`No running devcontainer found for ${args.cwd}.`, {
      suggestion: 'Start one with `mydevc up` (or `mydevc dot`) first.',
    })
  }
  logger.info(`Copying ${args.containerPath} → ${args.hostPath}`)
  await docker.cp({
    source: `${running.id}:${args.containerPath}`,
    dest: args.hostPath,
  })
  logger.success(`Copied ${args.containerPath} → ${args.hostPath}`)
}
