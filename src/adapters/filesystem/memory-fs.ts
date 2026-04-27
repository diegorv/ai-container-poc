import { dirname, posix } from 'node:path'
import type { FileStat, FileSystem } from '@/ports/filesystem'

type Entry =
  | { type: 'file'; content: string; mode: number; uid: number; gid: number }
  | { type: 'dir'; mode: number; uid: number; gid: number }
  | { type: 'symlink'; target: string; mode: number; uid: number; gid: number }

export interface MemoryFsOptions {
  uid?: number
  gid?: number
}

export interface MemoryFs extends FileSystem {
  /** Returns a map of file paths to their string contents (files only). */
  snapshot(): Record<string, string>
}

const DEFAULT_DIR_MODE = 0o755
const DEFAULT_FILE_MODE = 0o644
const DEFAULT_SYMLINK_MODE = 0o777

function normalize(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`memory-fs: path must be absolute, got "${path}"`)
  }
  const norm = posix.normalize(path)
  return norm.length > 1 && norm.endsWith('/') ? norm.slice(0, -1) : norm
}

function enoent(path: string): NodeJS.ErrnoException {
  const e = new Error(`ENOENT: no such file or directory, '${path}'`) as NodeJS.ErrnoException
  e.code = 'ENOENT'
  return e
}

function eexist(path: string): NodeJS.ErrnoException {
  const e = new Error(`EEXIST: file already exists, '${path}'`) as NodeJS.ErrnoException
  e.code = 'EEXIST'
  return e
}

function eisdir(path: string): NodeJS.ErrnoException {
  const e = new Error(
    `EISDIR: illegal operation on a directory, '${path}'`,
  ) as NodeJS.ErrnoException
  e.code = 'EISDIR'
  return e
}

function enotdir(path: string): NodeJS.ErrnoException {
  const e = new Error(`ENOTDIR: not a directory, '${path}'`) as NodeJS.ErrnoException
  e.code = 'ENOTDIR'
  return e
}

export function createMemoryFs(
  initial: Record<string, string> = {},
  options: MemoryFsOptions = {},
): MemoryFs {
  const uid = options.uid ?? 1000
  const gid = options.gid ?? 1000
  const entries = new Map<string, Entry>()
  entries.set('/', { type: 'dir', mode: DEFAULT_DIR_MODE, uid, gid })

  function ensureParents(path: string): void {
    const parent = dirname(path)
    if (parent === path) return
    if (!entries.has(parent)) {
      ensureParents(parent)
      entries.set(parent, { type: 'dir', mode: DEFAULT_DIR_MODE, uid, gid })
    }
  }

  function listChildren(prefix: string): string[] {
    const base = prefix === '/' ? '' : prefix
    const out = new Set<string>()
    for (const key of entries.keys()) {
      if (key === prefix) continue
      if (key.startsWith(`${base}/`)) {
        const rest = key.slice(base.length + 1)
        const child = rest.split('/')[0]
        if (child !== undefined && child.length > 0) out.add(child)
      }
    }
    return [...out].sort()
  }

  // Seed initial files (auto-creating parent dirs).
  for (const [rawPath, content] of Object.entries(initial)) {
    const path = normalize(rawPath)
    ensureParents(path)
    entries.set(path, { type: 'file', content, mode: DEFAULT_FILE_MODE, uid, gid })
  }

  const fs: MemoryFs = {
    async readFile(rawPath) {
      const path = normalize(rawPath)
      const entry = entries.get(path)
      if (!entry) throw enoent(path)
      if (entry.type !== 'file') throw eisdir(path)
      return entry.content
    },

    async writeFile(rawPath, content) {
      const path = normalize(rawPath)
      const existing = entries.get(path)
      if (existing && existing.type === 'dir') throw eisdir(path)
      const parent = dirname(path)
      const parentEntry = entries.get(parent)
      if (!parentEntry) throw enoent(parent)
      if (parentEntry.type !== 'dir') throw enotdir(parent)
      entries.set(path, { type: 'file', content, mode: DEFAULT_FILE_MODE, uid, gid })
    },

    async exists(rawPath) {
      return entries.has(normalize(rawPath))
    },

    async mkdir(rawPath, opts) {
      const path = normalize(rawPath)
      const recursive = opts?.recursive ?? false
      if (entries.has(path)) {
        if (recursive) return
        throw eexist(path)
      }
      if (recursive) {
        ensureParents(path)
      } else {
        const parent = dirname(path)
        if (!entries.has(parent)) throw enoent(parent)
      }
      entries.set(path, { type: 'dir', mode: DEFAULT_DIR_MODE, uid, gid })
    },

    async readdir(rawPath) {
      const path = normalize(rawPath)
      const entry = entries.get(path)
      if (!entry) throw enoent(path)
      if (entry.type !== 'dir') throw enotdir(path)
      return listChildren(path)
    },

    async copy(rawSrc, rawDest, opts) {
      const src = normalize(rawSrc)
      const dest = normalize(rawDest)
      const srcEntry = entries.get(src)
      if (!srcEntry) throw enoent(src)
      ensureParents(dest)
      if (srcEntry.type === 'file') {
        entries.set(dest, { ...srcEntry })
        return
      }
      if (srcEntry.type === 'dir') {
        if (opts?.recursive === false) throw eisdir(src)
        entries.set(dest, { ...srcEntry })
        const prefix = src === '/' ? '' : src
        for (const [key, value] of entries) {
          if (key !== src && key.startsWith(`${prefix}/`)) {
            const rel = key.slice(prefix.length)
            entries.set(`${dest === '/' ? '' : dest}${rel}`, { ...value })
          }
        }
      }
    },

    async remove(rawPath, opts) {
      const path = normalize(rawPath)
      const entry = entries.get(path)
      if (!entry) {
        if (opts?.force) return
        throw enoent(path)
      }
      if (entry.type === 'dir') {
        const children = listChildren(path)
        if (children.length > 0 && !opts?.recursive) {
          const e = new Error(`ENOTEMPTY: directory not empty, '${path}'`) as NodeJS.ErrnoException
          e.code = 'ENOTEMPTY'
          throw e
        }
        const prefix = path === '/' ? '' : path
        for (const key of [...entries.keys()]) {
          if (key === path || key.startsWith(`${prefix}/`)) entries.delete(key)
        }
        return
      }
      entries.delete(path)
    },

    async stat(rawPath) {
      // Follow symlinks like POSIX stat.
      let entry = entries.get(normalize(rawPath))
      let visited = 0
      while (entry?.type === 'symlink') {
        if (++visited > 32) throw new Error(`memory-fs: symlink loop at ${rawPath}`)
        entry = entries.get(normalize(entry.target))
      }
      if (!entry) throw enoent(rawPath)
      const size = entry.type === 'file' ? entry.content.length : 0
      const stat: FileStat = {
        isDirectory: entry.type === 'dir',
        isFile: entry.type === 'file',
        isSymlink: false,
        uid: entry.uid,
        gid: entry.gid,
        mode: entry.mode,
        size,
      }
      return stat
    },

    async lstat(rawPath) {
      const path = normalize(rawPath)
      const entry = entries.get(path)
      if (!entry) throw enoent(path)
      const size = entry.type === 'file' ? entry.content.length : 0
      const stat: FileStat = {
        isDirectory: entry.type === 'dir',
        isFile: entry.type === 'file',
        isSymlink: entry.type === 'symlink',
        uid: entry.uid,
        gid: entry.gid,
        mode: entry.mode,
        size,
      }
      return stat
    },

    async realpath(rawPath) {
      const path = normalize(rawPath)
      if (!entries.has(path)) throw enoent(path)
      return path
    },

    async symlink(target, rawPath) {
      const path = normalize(rawPath)
      if (entries.has(path)) throw eexist(path)
      ensureParents(path)
      entries.set(path, { type: 'symlink', target, mode: DEFAULT_SYMLINK_MODE, uid, gid })
    },

    async readlink(rawPath) {
      const path = normalize(rawPath)
      const entry = entries.get(path)
      if (!entry) throw enoent(path)
      if (entry.type !== 'symlink') {
        const e = new Error(`EINVAL: invalid argument, '${path}'`) as NodeJS.ErrnoException
        e.code = 'EINVAL'
        throw e
      }
      return entry.target
    },

    async chmod(rawPath, mode) {
      const path = normalize(rawPath)
      const entry = entries.get(path)
      if (!entry) throw enoent(path)
      entry.mode = mode
    },

    snapshot() {
      const out: Record<string, string> = {}
      for (const [path, entry] of entries) {
        if (entry.type === 'file') out[path] = entry.content
      }
      return out
    },
  }

  return fs
}
