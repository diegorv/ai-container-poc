import type { AbsolutePath } from '@/core/security/brand'
import { brandAs } from '@/core/security/brand'
import type { FileSystem } from '@/ports/filesystem'

export interface WalkEntry {
  /** Absolute path of the file. */
  path: AbsolutePath
  /** Path relative to the root passed to `walkFiles`. */
  relativePath: string
}

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
export async function walkFiles(fs: FileSystem, root: AbsolutePath): Promise<WalkEntry[]> {
  const out: WalkEntry[] = []
  await walkInto(fs, root, '', out)
  return out
}

async function walkInto(
  fs: FileSystem,
  root: AbsolutePath,
  rel: string,
  out: WalkEntry[],
): Promise<void> {
  const dir = rel === '' ? root : brandAs<'absolute-path'>(`${root}/${rel}`)
  const children = await fs.readdir(dir)
  for (const child of children) {
    const childPath = brandAs<'absolute-path'>(`${dir}/${child}`)
    const childRel = rel === '' ? child : `${rel}/${child}`
    const stat = await fs.lstat(childPath)
    if (stat.isDirectory) {
      await walkInto(fs, root, childRel, out)
    } else if (stat.isFile) {
      out.push({ path: childPath, relativePath: childRel })
    }
  }
}
