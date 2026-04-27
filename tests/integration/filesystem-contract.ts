import type { FileSystem } from '@/ports/filesystem'
import { p } from '@/test-utils/path'
import { describe, expect, it } from 'vitest'

/**
 * Shared behavioural contract for any FileSystem implementation. Both the
 * real `nodeFs` (against a temp dir) and the in-memory fake must satisfy
 * it, guaranteeing that switching between them in tests is safe.
 */
export function fileSystemContract(name: string, build: () => Promise<FileSystem>): void {
  describe(`FileSystem contract — ${name}`, () => {
    it('writes and reads back a file', async () => {
      const fs = await build()
      await fs.writeFile(p('/work/hello.txt'), 'world')
      expect(await fs.readFile(p('/work/hello.txt'))).toBe('world')
    })

    it('exists is false for missing paths and true for written ones', async () => {
      const fs = await build()
      expect(await fs.exists(p('/work/missing.txt'))).toBe(false)
      await fs.writeFile(p('/work/present.txt'), 'x')
      expect(await fs.exists(p('/work/present.txt'))).toBe(true)
    })

    it('throws ENOENT when reading a missing file', async () => {
      const fs = await build()
      await expect(fs.readFile(p('/work/nope.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('mkdir recursive creates nested directories', async () => {
      const fs = await build()
      await fs.mkdir(p('/work/a/b/c'), { recursive: true })
      expect(await fs.exists(p('/work/a/b/c'))).toBe(true)
      const stat = await fs.stat(p('/work/a/b/c'))
      expect(stat.isDirectory).toBe(true)
    })

    it('readdir lists immediate children only', async () => {
      const fs = await build()
      await fs.mkdir(p('/work/dir'), { recursive: true })
      await fs.writeFile(p('/work/dir/a.txt'), '1')
      await fs.writeFile(p('/work/dir/b.txt'), '2')
      await fs.mkdir(p('/work/dir/sub'), { recursive: true })
      await fs.writeFile(p('/work/dir/sub/c.txt'), '3')
      const items = (await fs.readdir(p('/work/dir'))).sort()
      expect(items).toEqual(['a.txt', 'b.txt', 'sub'])
    })

    it('copy duplicates a file under a new path', async () => {
      const fs = await build()
      await fs.writeFile(p('/work/src.txt'), 'data')
      await fs.copy(p('/work/src.txt'), p('/work/dst.txt'))
      expect(await fs.readFile(p('/work/dst.txt'))).toBe('data')
      expect(await fs.exists(p('/work/src.txt'))).toBe(true)
    })

    it('copy recurses into directories by default', async () => {
      const fs = await build()
      await fs.mkdir(p('/work/from/inner'), { recursive: true })
      await fs.writeFile(p('/work/from/inner/x.txt'), 'X')
      await fs.copy(p('/work/from'), p('/work/to'))
      expect(await fs.readFile(p('/work/to/inner/x.txt'))).toBe('X')
    })

    it('remove with recursive deletes a populated directory', async () => {
      const fs = await build()
      await fs.mkdir(p('/work/trash/sub'), { recursive: true })
      await fs.writeFile(p('/work/trash/sub/x.txt'), 'x')
      await fs.remove(p('/work/trash'), { recursive: true })
      expect(await fs.exists(p('/work/trash'))).toBe(false)
    })

    it('remove with force=true is a no-op for missing paths', async () => {
      const fs = await build()
      await expect(fs.remove(p('/work/ghost'), { force: true })).resolves.toBeUndefined()
    })

    it('symlink and readlink round-trip', async () => {
      const fs = await build()
      await fs.mkdir(p('/work/links'), { recursive: true })
      await fs.writeFile(p('/work/links/target.txt'), 'tgt')
      await fs.symlink(p('/work/links/target.txt'), p('/work/links/alias'))
      expect(await fs.readlink(p('/work/links/alias'))).toBe('/work/links/target.txt')
      // lstat sees the link itself; stat follows it.
      const lstat = await fs.lstat(p('/work/links/alias'))
      expect(lstat.isSymlink).toBe(true)
      const stat = await fs.stat(p('/work/links/alias'))
      expect(stat.isFile).toBe(true)
    })
  })
}
