import type { CommandDeps } from '../deps'

export interface ExecArgs {
  cwd: string
  command: string[]
}

/** Ports `cmd_exec` from install.sh — `devcontainer exec ... <cmd...>`. */
export async function exec(args: ExecArgs, deps: CommandDeps): Promise<number> {
  if (args.command.length === 0) {
    throw new Error('exec: missing command')
  }
  const result = await deps.devcontainer.exec({
    workspaceFolder: args.cwd,
    command: args.command,
    interactive: true,
  })
  return result.exitCode
}
