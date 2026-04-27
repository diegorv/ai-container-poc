import type { Logger } from '@/ports/logger'
import pino from 'pino'

interface PinoLoggerOptions {
  level?: 'debug' | 'info' | 'warn' | 'error'
}

/**
 * Production logger backed by `pino` with a pretty colored prefix per level.
 * Mirrors the colored `log_info`/`log_success`/`log_warn`/`log_error`
 * helpers from install.sh.
 */
export function createPinoLogger(options: PinoLoggerOptions = {}): Logger {
  const base = pino({
    level: options.level ?? 'info',
    transport: {
      target: 'pino/file',
      options: { destination: 2 },
    },
  })

  return {
    debug: (msg) => base.debug(msg),
    info: (msg) => base.info(msg),
    success: (msg) => base.info({ tag: 'success' }, msg),
    warn: (msg) => base.warn(msg),
    error: (msg) => base.error(msg),
  }
}
