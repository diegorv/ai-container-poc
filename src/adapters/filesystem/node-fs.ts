import {
  constants,
  chmod,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import type { FileStat, FileSystem } from '@/ports/filesystem'

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return false
    throw err
  }
}

function toFileStat(s: Awaited<ReturnType<typeof stat>>): FileStat {
  return {
    isDirectory: s.isDirectory(),
    isFile: s.isFile(),
    isSymlink: s.isSymbolicLink(),
    uid: Number(s.uid),
    gid: Number(s.gid),
    mode: Number(s.mode),
    size: Number(s.size),
    mtimeMs: Number(s.mtimeMs),
  }
}

export const nodeFs: FileSystem = {
  readFile: (path) => readFile(path, 'utf-8'),
  writeFile: (path, content) => writeFile(path, content, 'utf-8'),
  exists,
  mkdir: (path, options) => mkdir(path, options).then(() => undefined),
  readdir: (path) => readdir(path),
  copy: (src, dest, options) => cp(src, dest, { recursive: options?.recursive ?? true }),
  remove: (path, options) =>
    rm(path, { recursive: options?.recursive ?? false, force: options?.force ?? false }),
  stat: async (path) => toFileStat(await stat(path)),
  lstat: async (path) => toFileStat(await lstat(path)),
  realpath: (path) => realpath(path),
  symlink: (target, path) => symlink(target, path),
  readlink: (path) => readlink(path),
  chmod: (path, mode) => chmod(path, mode),
}

// Re-export the constants object so callers can use semantic mode flags
// without importing from node:fs directly.
export const fsConstants = constants
