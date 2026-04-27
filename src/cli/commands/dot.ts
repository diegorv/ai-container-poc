import type { CommandDeps } from '../deps'
import { template } from './template'
import { up } from './up'

export interface DotArgs {
  cwd: string
  force?: boolean
}

/**
 * Ports `cmd_dot` from install.sh — runs `template` then `up` in the
 * current directory. Equivalent to `devc .` in the bash CLI.
 */
export async function dot(args: DotArgs, deps: CommandDeps): Promise<void> {
  await template(args, deps)
  await up({ cwd: args.cwd }, deps)
}
