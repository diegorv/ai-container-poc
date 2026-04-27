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
   *
   * Adapters enforce that `command` and every entry of `args` contain no
   * NUL byte; `execve()` treats NUL as a string terminator, so an
   * unchecked NUL would silently truncate the argument and let an
   * attacker reshape the command line. Capability brands (`AbsolutePath`,
   * `SafeFilename`, `PosixUserName`, `SafeMountField`) all guarantee
   * absence of NUL by construction, so passing them is safe.
   */
  exec(command: string, args: readonly string[], options?: ShellOptions): Promise<ShellResult>

  /**
   * Runs a command with stdio inherited from the parent process. Used for
   * interactive flows like `mydevc shell` and `mydevc exec`. Same NUL
   * fence as `exec`.
   */
  execInteractive(
    command: string,
    args: readonly string[],
    options?: ShellOptions,
  ): Promise<{ exitCode: number }>

  /**
   * Returns the absolute path of the binary, or `null` if not found in PATH.
   */
  which(command: string): Promise<string | null>
}
