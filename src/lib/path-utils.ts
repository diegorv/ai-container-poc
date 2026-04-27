import { isAbsolute, resolve } from 'node:path'

/**
 * Replaces a leading `~` with the given home directory. Mirrors what bash
 * does implicitly. Returns the path unchanged when it doesn't start with
 * `~`.
 */
export function expandHome(path: string, home: string): string {
  if (path === '~') return home
  if (path.startsWith('~/')) return `${home}/${path.slice(2)}`
  return path
}

/**
 * Converts a path to absolute form, anchored on `cwd` if it's relative.
 */
export function ensureAbsolute(path: string, cwd: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path)
}
