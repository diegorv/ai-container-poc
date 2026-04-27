import type { LogLevel, Logger } from '@/ports/logger'

const ANSI = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
} as const

interface LevelStyle {
  color: string
  prefix: string
}

const STYLES: Record<LogLevel, LevelStyle> = {
  debug: { color: ANSI.gray, prefix: '·' },
  info: { color: ANSI.blue, prefix: '›' },
  success: { color: ANSI.green, prefix: '✓' },
  warn: { color: ANSI.yellow, prefix: '!' },
  error: { color: ANSI.red, prefix: '✗' },
}

export interface PrettyLoggerOptions {
  /** Force-enable or force-disable colors. Defaults to `process.stderr.isTTY`. */
  color?: boolean
  /** Minimum level to print (debug | info | warn | error). Defaults to `info`. */
  level?: LogLevel
}

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  success: 20,
  warn: 30,
  error: 40,
}

/**
 * Tiny CLI logger that writes to stderr. Adds ANSI colors and a per-level
 * glyph when stderr is a TTY, plain text otherwise (so piping
 * `mydevc ... 2>log.txt` stays readable). Intentionally has no
 * dependencies — pino-pretty is overkill for a single-process CLI and
 * would push us past the bundle-size budget.
 */
export function createPrettyLogger(options: PrettyLoggerOptions = {}): Logger {
  const useColor = options.color ?? process.stderr.isTTY === true
  const minLevel = ORDER[options.level ?? 'info']

  function write(level: LogLevel, msg: string): void {
    if (ORDER[level] < minLevel) return
    const style = STYLES[level]
    if (useColor) {
      process.stderr.write(`${style.color}${style.prefix}${ANSI.reset} ${msg}\n`)
    } else {
      process.stderr.write(`[${level}] ${msg}\n`)
    }
  }

  return {
    debug: (m) => write('debug', m),
    info: (m) => write('info', m),
    success: (m) => write('success', m),
    warn: (m) => write('warn', m),
    error: (m) => write('error', m),
  }
}
