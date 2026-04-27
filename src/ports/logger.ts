export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success'

export interface Logger {
  debug(msg: string): void
  info(msg: string): void
  success(msg: string): void
  warn(msg: string): void
  error(msg: string): void
  /**
   * Runs `fn` and shows a spinner under `message` on TTY stderr until it
   * settles. On non-TTY streams it just logs start/end so CI logs stay
   * grep-able. The spinner is replaced by ✓ on success or ✗ on failure;
   * the underlying error is rethrown so callers can react.
   */
  withSpinner<T>(message: string, fn: () => Promise<T>): Promise<T>
}
