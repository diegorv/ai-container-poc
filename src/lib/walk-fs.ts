import type { AbsolutePath } from '@/core/security/brand'
import { brandAs } from '@/core/security/brand'
import type { FileSystem } from '@/ports/filesystem'

export interface WalkEntry {
  /** Absolute path of the file. */
  path: AbsolutePath
  /** Path relative to the root passed to `walkFiles`. */
  relativePath: string
}

export interface WalkOptions {
  /**
   * Maximum directory depth to descend into, counted from `root` (0 =
   * yield only direct children). Defaults to {@link DEFAULT_MAX_DEPTH}
   * to keep a hostile or pathological tree from blowing the stack or
   * OOMing the process. Throws if a deeper directory is encountered.
   */
  maxDepth?: number
}

/**
 * Default depth limit. Picked so that realistic project trees (Claude
 * session directories, monorepos) fit comfortably while a poisoned
 * `~/.claude/projects/` mounted from a compromised container can't
 * push us into unbounded recursion.
 */
export const DEFAULT_MAX_DEPTH = 32

/**
 * Recursively yields every file (not directory, not symlink) under
 * `root`. Order within a directory is whatever `readdir` returns —
 * typically lexicographic on real filesystems and the memory-fs.
 *
 * The returned `path` is `AbsolutePath`. Each segment from `readdir`
 * is the kernel's view of a directory entry; we don't re-validate
 * because the parent path is already an `AbsolutePath` and the child
 * names cannot contain `/` by POSIX. NUL is also impossible — the
 * kernel rejects it at file creation.
 */
export async function walkFiles(
  fs: FileSystem,
  root: AbsolutePath,
  options?: WalkOptions,
): Promise<WalkEntry[]> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH
  if (maxDepth < 0 || !Number.isInteger(maxDepth)) {
    throw new Error(`walkFiles: maxDepth must be a non-negative integer, got ${maxDepth}`)
  }
  const out: WalkEntry[] = []
  await walkInto(fs, root, '', 0, maxDepth, out)
  return out
}

async function walkInto(
  fs: FileSystem,
  root: AbsolutePath,
  rel: string,
  depth: number,
  maxDepth: number,
  out: WalkEntry[],
): Promise<void> {
  const dir = rel === '' ? root : brandAs<'absolute-path'>(`${root}/${rel}`)
  const children = await fs.readdir(dir)
  for (const child of children) {
    const childPath = brandAs<'absolute-path'>(`${dir}/${child}`)
    const childRel = rel === '' ? child : `${rel}/${child}`
    const stat = await fs.lstat(childPath)
    if (stat.isDirectory) {
      if (depth >= maxDepth) {
        throw new Error(
          `walkFiles: directory depth exceeds ${maxDepth} at ${childPath}; refusing to recurse further.`,
        )
      }
      await walkInto(fs, root, childRel, depth + 1, maxDepth, out)
    } else if (stat.isFile) {
      out.push({ path: childPath, relativePath: childRel })
    }
  }
}
