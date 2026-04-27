import type { Shell, ShellOptions, ShellResult } from '@/ports/shell'
import { execa } from 'execa'

interface ExecaCallOptions {
  cwd?: string
  env?: Record<string, string>
  input?: string
  timeout?: number
  reject: boolean
  stdio?: 'inherit'
}

function toExecaOptions(options: ShellOptions | undefined, reject: boolean): ExecaCallOptions {
  return {
    cwd: options?.cwd,
    env: options?.env,
    input: options?.input,
    timeout: options?.timeoutMs,
    reject,
  }
}

export const execaShell: Shell = {
  async exec(command, args, options): Promise<ShellResult> {
    const result = await execa(command, args, toExecaOptions(options, false))
    return {
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : '',
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : 1,
    }
  },

  async execInteractive(command, args, options): Promise<{ exitCode: number }> {
    const result = await execa(command, args, {
      ...toExecaOptions(options, false),
      stdio: 'inherit',
    })
    return { exitCode: typeof result.exitCode === 'number' ? result.exitCode : 1 }
  },

  async which(command): Promise<string | null> {
    const result = await execa('which', [command], { reject: false })
    if (result.exitCode !== 0) return null
    const out = typeof result.stdout === 'string' ? result.stdout.trim() : ''
    return out.length > 0 ? out : null
  },
}
