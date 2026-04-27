import type { CommandDeps } from '../deps'

export interface ShellArgs {
  cwd: string
}

/** Ports `cmd_shell` from install.sh — `devcontainer exec ... zsh`. */
export async function shell(args: ShellArgs, deps: CommandDeps): Promise<number> {
  deps.logger.info('Opening shell in devcontainer…')
  const result = await deps.devcontainer.exec({
    workspaceFolder: args.cwd,
    command: ['zsh'],
    interactive: true,
  })
  return result.exitCode
}
