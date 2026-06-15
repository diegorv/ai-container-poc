import { execa } from 'execa'
import { assertNoNul } from '@/core/security/untrusted-input'
import type { Shell, ShellOptions, ShellResult } from '@/ports/shell'

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

/**
 * Asserts no argument contains a NUL byte before reaching `execve()`.
 * NUL is a C-string terminator: if smuggled into an argument, downstream
 * code parsing the command line silently sees a truncated value. This
 * is a runtime fence — the type system already keeps `Untrusted<>` from
 * being passed here, but raw string literals from inside the codebase
 * that *could* one day come from an unvalidated source pass through.
 */
function assertSafeArgs(command: string, args: readonly string[]): void {
  assertNoNul('shell.command', command)
  for (let i = 0; i < args.length; i++) {
    assertNoNul(`shell.args[${i}]`, args[i] ?? '')
  }
}

export const execaShell: Shell = {
  async exec(command, args, options): Promise<ShellResult> {
    assertSafeArgs(command, args)
    const result = await execa(command, [...args], toExecaOptions(options, false))
    return {
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : '',
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : 1,
    }
  },

  async execInteractive(command, args, options): Promise<{ exitCode: number }> {
    assertSafeArgs(command, args)
    const result = await execa(command, [...args], {
      ...toExecaOptions(options, false),
      stdio: 'inherit',
    })
    return { exitCode: typeof result.exitCode === 'number' ? result.exitCode : 1 }
  },

  async which(command): Promise<string | null> {
    assertNoNul('shell.command', command)
    const result = await execa('which', [command], { reject: false })
    if (result.exitCode !== 0) return null
    const out = typeof result.stdout === 'string' ? result.stdout.trim() : ''
    return out.length > 0 ? out : null
  },
}
