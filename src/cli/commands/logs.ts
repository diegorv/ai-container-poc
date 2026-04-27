import { computeProjectId } from '@/core/project/compute-project-id'
import { operatorPath } from '@/core/security/path'
import { CliError } from '@/lib/cli-error'
import type { CommandDeps } from '../deps'

export interface LogsArgs {
  cwd: string
  /** Equivalent to `docker logs --follow`. */
  follow?: boolean
  /** Pass through to `docker logs --tail`. */
  tail?: number
}

/**
 * Streams (or snapshots) `docker logs` for the project's container.
 * Stdio is inherited so `--follow` works correctly with Ctrl-C.
 */
export async function logs(args: LogsArgs, deps: CommandDeps): Promise<number> {
  const { docker, shell } = deps
  const project = computeProjectId(operatorPath(args.cwd))
  const containers = await docker.listContainers({ label: project.containerLabel, all: true })
  const container = containers[0]
  if (!container) {
    throw new CliError(`No devcontainer found for ${args.cwd}.`, {
      suggestion: 'Start one with `mydevc up` (or `mydevc dot`) first.',
    })
  }
  const dockerArgs = ['logs']
  if (args.follow) dockerArgs.push('--follow')
  if (args.tail !== undefined) dockerArgs.push('--tail', String(args.tail))
  dockerArgs.push(container.id)
  const r = await shell.execInteractive('docker', dockerArgs)
  return r.exitCode
}
