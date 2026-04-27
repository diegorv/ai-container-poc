/**
 * Error thrown by CLI commands when the failure has a known recovery path
 * the user can act on. The dispatcher in src/cli/index.ts catches these
 * and prints `Try: <suggestion>` underneath the error message.
 *
 * Plain `Error` is still fine for unexpected/programming failures.
 */
export class CliError extends Error {
  readonly suggestion: string | undefined
  constructor(message: string, options: { suggestion?: string; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'CliError'
    this.suggestion = options.suggestion
  }
}
