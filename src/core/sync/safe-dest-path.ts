import { resolve, sep } from 'node:path'

/**
 * Returns the absolute destination path if `restPath` resolves inside
 * `baseDir`. Otherwise returns `undefined`. Used by `mydevc sync` to
 * defend against a malicious container delivering a session filename
 * containing `..` segments — without this check, the sync pass would
 * write the file outside `~/.claude/projects/`.
 */
export function safeDestPath(baseDir: string, key: string, restPath: string): string | undefined {
  if (key === '' || key === '.' || key === '..' || key.includes('/') || key.includes('\\')) {
    return undefined
  }
  const keyDir = resolve(baseDir, key)
  const candidate = resolve(keyDir, restPath)
  if (candidate === keyDir) return undefined
  if (!candidate.startsWith(`${keyDir}${sep}`)) return undefined
  return candidate
}
