import { CliError } from '@/lib/cli-error'
import type {
  DevcontainerCli,
  DevcontainerExecArgs,
  DevcontainerUpArgs,
} from '@/ports/devcontainer'
import type { Shell } from '@/ports/shell'

interface DevcontainerUpJson {
  outcome?: 'success' | 'error'
  containerId?: string
  message?: string
  description?: string
}

export interface CliDevcontainerOptions {
  /** Override the binary name; defaults to `devcontainer`. */
  binary?: string
}

export function createCliDevcontainer(
  shell: Shell,
  options: CliDevcontainerOptions = {},
): DevcontainerCli {
  const bin = options.binary ?? 'devcontainer'
  let checked = false

  async function ensureBinary(): Promise<void> {
    if (checked) return
    const path = await shell.which(bin)
    if (!path) {
      throw new CliError(`devcontainer CLI not found on PATH (looking for "${bin}").`, {
        suggestion:
          'Install it with `npm install -g @devcontainers/cli`, or install mydevc globally so the bundled binary is on PATH.',
      })
    }
    checked = true
  }

  return {
    async up(args: DevcontainerUpArgs): Promise<{ containerId: string }> {
      await ensureBinary()
      const cmd = ['up', '--workspace-folder', args.workspaceFolder]
      if (args.removeExistingContainer) cmd.push('--remove-existing-container')
      const result = await shell.exec(bin, cmd)
      if (result.exitCode !== 0) {
        throw new Error(`devcontainer up failed (exit ${result.exitCode}): ${result.stderr}`)
      }
      const lastLine = result.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .at(-1)
      let containerId = ''
      if (lastLine) {
        try {
          const parsed = JSON.parse(lastLine) as DevcontainerUpJson
          if (parsed.outcome === 'error') {
            throw new Error(parsed.message ?? 'devcontainer up reported failure')
          }
          containerId = parsed.containerId ?? ''
        } catch (err) {
          if (err instanceof SyntaxError) containerId = ''
          else throw err
        }
      }
      return { containerId }
    },

    async exec(args: DevcontainerExecArgs): Promise<{ exitCode: number }> {
      await ensureBinary()
      const argv = ['exec', '--workspace-folder', args.workspaceFolder, ...args.command]
      if (args.interactive) {
        return shell.execInteractive(bin, argv)
      }
      const r = await shell.exec(bin, argv)
      return { exitCode: r.exitCode }
    },
  }
}
