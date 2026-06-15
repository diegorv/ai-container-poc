import type { Logger, LogLevel } from '@/ports/logger'

export interface LogEntry {
  level: LogLevel
  message: string
}

export interface MemoryLogger extends Logger {
  readonly messages: readonly LogEntry[]
  has(level: LogLevel, substring: string): boolean
  clear(): void
}

/**
 * Captures log calls in an in-memory array. Used in tests to assert what
 * a command emitted without parsing real stdout.
 */
export function createMemoryLogger(): MemoryLogger {
  const messages: LogEntry[] = []
  const push = (level: LogLevel, message: string): void => {
    messages.push({ level, message })
  }

  async function withSpinner<T>(message: string, fn: () => Promise<T>): Promise<T> {
    push('info', message)
    try {
      const result = await fn()
      push('success', message)
      return result
    } catch (err) {
      push('error', message)
      throw err
    }
  }

  return {
    messages,
    debug: (m) => push('debug', m),
    info: (m) => push('info', m),
    success: (m) => push('success', m),
    warn: (m) => push('warn', m),
    error: (m) => push('error', m),
    withSpinner,
    has: (level, substring) =>
      messages.some((e) => e.level === level && e.message.includes(substring)),
    clear: () => {
      messages.length = 0
    },
  }
}
