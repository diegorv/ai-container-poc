export interface ShellResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface ShellOptions {
  cwd?: string
  env?: Record<string, string>
  input?: string
  timeoutMs?: number
}

export interface Shell {
  /**
   * Runs a command and captures stdout/stderr. Does not throw on non-zero
   * exit — the caller decides what to do with the exit code.
   */
  exec(command: string, args: string[], options?: ShellOptions): Promise<ShellResult>

  /**
   * Runs a command with stdio inherited from the parent process. Used for
   * interactive flows like `mydevc shell` and `mydevc exec`.
   */
  execInteractive(
    command: string,
    args: string[],
    options?: ShellOptions,
  ): Promise<{ exitCode: number }>

  /**
   * Returns the absolute path of the binary, or `null` if not found in PATH.
   */
  which(command: string): Promise<string | null>
}
