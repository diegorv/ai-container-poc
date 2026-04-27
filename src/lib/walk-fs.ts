import type { FileSystem } from '@/ports/filesystem'

export interface WalkEntry {
  /** Absolute path of the file. */
  path: string
  /** Path relative to the root passed to `walkFiles`. */
  relativePath: string
}

/**
 * Recursively yields every file (not directory, not symlink) under
 * `root`. Order within a directory is whatever `readdir` returns —
 * typically lexicographic on real filesystems and the memory-fs.
 */
export async function walkFiles(fs: FileSystem, root: string): Promise<WalkEntry[]> {
  const out: WalkEntry[] = []
  await walkInto(fs, root, '', out)
  return out
}

async function walkInto(
  fs: FileSystem,
  root: string,
  rel: string,
  out: WalkEntry[],
): Promise<void> {
  const dir = rel === '' ? root : `${root}/${rel}`
  const children = await fs.readdir(dir)
  for (const child of children) {
    const childPath = `${dir}/${child}`
    const childRel = rel === '' ? child : `${rel}/${child}`
    const stat = await fs.lstat(childPath)
    if (stat.isDirectory) {
      await walkInto(fs, root, childRel, out)
    } else if (stat.isFile) {
      out.push({ path: childPath, relativePath: childRel })
    }
  }
}
