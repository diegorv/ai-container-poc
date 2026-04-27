import type { CommandDeps } from '../deps'

export interface UpgradeArgs {
  cwd: string
}

/**
 * Ports `cmd_upgrade` from install.sh — runs `claude update` inside the
 * running devcontainer. Stdio is inherited so the user sees claude's own
 * progress output.
 */
export async function upgrade(args: UpgradeArgs, deps: CommandDeps): Promise<number> {
  deps.logger.info('Upgrading Claude Code…')
  const result = await deps.devcontainer.exec({
    workspaceFolder: args.cwd,
    command: ['claude', 'update'],
    interactive: true,
  })
  if (result.exitCode === 0) deps.logger.success('Claude Code upgraded.')
  return result.exitCode
}
