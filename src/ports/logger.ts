export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success'

export interface Logger {
  debug(msg: string): void
  info(msg: string): void
  success(msg: string): void
  warn(msg: string): void
  error(msg: string): void
}
