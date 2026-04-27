import { resolve, sep } from 'node:path'
import { type AbsolutePath, brandAs } from '@/core/security/brand'

/**
 * Returns the absolute destination path if `restPath` resolves inside
 * `baseDir`. Otherwise returns `undefined`. Used by `mydevc sync` to
 * defend against a malicious container delivering a session filename
 * containing `..` segments — without this check, the sync pass would
 * write the file outside `~/.claude/projects/`.
 *
 * The result is branded as `AbsolutePath`: it has been validated to
 * sit inside `baseDir`, so it is safe for `FileSystem.*` operations
 * downstream.
 */
export function safeDestPath(
  baseDir: AbsolutePath,
  key: string,
  restPath: string,
): AbsolutePath | undefined {
  if (key === '' || key === '.' || key === '..' || key.includes('/') || key.includes('\\')) {
    return undefined
  }
  const keyDir = resolve(baseDir, key)
  const candidate = resolve(keyDir, restPath)
  if (candidate === keyDir) return undefined
  if (!candidate.startsWith(`${keyDir}${sep}`)) return undefined
  return brandAs<'absolute-path'>(candidate)
}
