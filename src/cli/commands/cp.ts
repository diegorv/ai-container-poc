import { computeProjectId } from '@/core/project/compute-project-id'
import { operatorPath } from '@/core/security/path'
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

function rejectParentTraversal(label: string, value: string): void {
  // `..` segments in a destination path are almost always a mistake — the
  // operator is trusted, but a typo'd `cp foo ../bar` from a deep cwd can
  // silently overwrite files far outside the visible workspace. Bail and
  // make them spell out an absolute path or rephrase without `..`.
  const segments = value.split(/[/\\]/).filter((s) => s.length > 0)
  if (segments.includes('..')) {
    throw new CliError(`${label} contains '..'; refuse to traverse parent directories.`, {
      suggestion: 'Pass an absolute path, or one that does not include `..`.',
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
  rejectParentTraversal('hostPath', args.hostPath)
  const project = computeProjectId(operatorPath(args.cwd))
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
