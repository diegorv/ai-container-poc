import type { Shell, ShellOptions, ShellResult } from '@/ports/shell'

export interface ShellInvocation {
  command: string
  args: string[]
  options: ShellOptions | undefined
  interactive: boolean
}

export type ShellResponder = (
  command: string,
  args: string[],
  options: ShellOptions | undefined,
) => Partial<ShellResult> | undefined

export interface FakeShell extends Shell {
  /** Every call recorded in the order it happened. */
  readonly calls: readonly ShellInvocation[]
  /** Register a binary as discoverable by `which`. */
  registerBinary(name: string, path: string): void
  /** Replace the canned-response function for `exec`/`execInteractive`. */
  setResponder(responder: ShellResponder): void
}

export interface FakeShellOptions {
  responder?: ShellResponder
  binaries?: Record<string, string>
  /** Default response when no responder matches. Defaults to exit 0, empty output. */
  defaultResult?: Partial<ShellResult>
}

export function createFakeShell(opts: FakeShellOptions = {}): FakeShell {
  const calls: ShellInvocation[] = []
  const binaries = new Map<string, string>(Object.entries(opts.binaries ?? {}))
  let responder: ShellResponder = opts.responder ?? (() => undefined)
  const defaults: ShellResult = {
    stdout: '',
    stderr: '',
    exitCode: 0,
    ...opts.defaultResult,
  }

  function record(
    command: string,
    args: string[],
    options: ShellOptions | undefined,
    interactive: boolean,
  ): ShellResult {
    calls.push({ command, args, options, interactive })
    const matched = responder(command, args, options)
    return { ...defaults, ...(matched ?? {}) }
  }

  return {
    calls,
    registerBinary(name, path) {
      binaries.set(name, path)
    },
    setResponder(next) {
      responder = next
    },
    async exec(command, args, options) {
      return record(command, args, options, false)
    },
    async execInteractive(command, args, options) {
      const r = record(command, args, options, true)
      return { exitCode: r.exitCode }
    },
    async which(command) {
      return binaries.get(command) ?? null
    },
  }
}
