import type { AbsolutePath } from '@/core/security/brand'

export interface FileStat {
  isDirectory: boolean
  isFile: boolean
  isSymlink: boolean
  uid: number
  gid: number
  mode: number
  size: number
  /** Last-modified time in milliseconds since epoch. */
  mtimeMs: number
}

/**
 * Filesystem port. Every method that takes a path takes `AbsolutePath`,
 * the capability brand produced by `core/security/path` factories
 * (`literalPath`, `operatorPath`, `joinPath`). A raw `string` does not
 * compile here — that is the structural enforcement of the security
 * boundary: paths cannot reach the disk without having been validated.
 *
 * `realpath` and `readlink` return `AbsolutePath` because their results
 * flow back into the same APIs.
 */
export interface FileSystem {
  readFile(path: AbsolutePath): Promise<string>
  writeFile(path: AbsolutePath, content: string): Promise<void>
  exists(path: AbsolutePath): Promise<boolean>
  mkdir(path: AbsolutePath, options?: { recursive?: boolean }): Promise<void>
  readdir(path: AbsolutePath): Promise<string[]>
  copy(src: AbsolutePath, dest: AbsolutePath, options?: { recursive?: boolean }): Promise<void>
  remove(path: AbsolutePath, options?: { recursive?: boolean; force?: boolean }): Promise<void>
  stat(path: AbsolutePath): Promise<FileStat>
  /** Like `stat` but does not follow symlinks. */
  lstat(path: AbsolutePath): Promise<FileStat>
  realpath(path: AbsolutePath): Promise<AbsolutePath>
  symlink(target: AbsolutePath, path: AbsolutePath): Promise<void>
  readlink(path: AbsolutePath): Promise<string>
  chmod(path: AbsolutePath, mode: number): Promise<void>
}
