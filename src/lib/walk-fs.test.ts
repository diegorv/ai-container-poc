import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { p } from '@/test-utils/path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_MAX_DEPTH, walkFiles } from './walk-fs'

describe('walkFiles', () => {
  it('yields every regular file recursively, with relative paths', async () => {
    const fs = createMemoryFs({
      '/root/a.txt': 'a',
      '/root/sub/b.txt': 'b',
      '/root/sub/deep/c.txt': 'c',
    })
    const entries = await walkFiles(fs, p('/root'))
    expect(entries.map((e) => e.relativePath).sort()).toEqual([
      'a.txt',
      'sub/b.txt',
      'sub/deep/c.txt',
    ])
  })

  it('returns [] for an empty directory', async () => {
    const fs = createMemoryFs()
    await fs.mkdir(p('/empty'), { recursive: true })
    expect(await walkFiles(fs, p('/empty'))).toEqual([])
  })

  it('throws when a tree is deeper than the default limit', async () => {
    const fs = createMemoryFs()
    let path = '/root'
    for (let i = 0; i <= DEFAULT_MAX_DEPTH + 1; i++) {
      path += `/d${i}`
    }
    await fs.mkdir(p(path), { recursive: true })
    await fs.writeFile(p(`${path}/leaf.txt`), 'x')
    await expect(walkFiles(fs, p('/root'))).rejects.toThrow(/depth exceeds/)
  })

  it('respects an explicit maxDepth', async () => {
    const fs = createMemoryFs({
      '/root/a.txt': 'a',
      '/root/d1/b.txt': 'b',
      '/root/d1/d2/c.txt': 'c',
    })
    // depth 0 = only direct children of /root; descending into d1 throws.
    await expect(walkFiles(fs, p('/root'), { maxDepth: 0 })).rejects.toThrow(/depth exceeds 0/)
  })

  it('allows depth equal to maxDepth', async () => {
    const fs = createMemoryFs({
      '/root/a.txt': 'a',
      '/root/d1/b.txt': 'b',
    })
    const entries = await walkFiles(fs, p('/root'), { maxDepth: 1 })
    expect(entries.map((e) => e.relativePath).sort()).toEqual(['a.txt', 'd1/b.txt'])
  })

  it('rejects negative or non-integer maxDepth', async () => {
    const fs = createMemoryFs({ '/root/a.txt': 'a' })
    await expect(walkFiles(fs, p('/root'), { maxDepth: -1 })).rejects.toThrow(
      /non-negative integer/,
    )
    await expect(walkFiles(fs, p('/root'), { maxDepth: 1.5 })).rejects.toThrow(
      /non-negative integer/,
    )
  })
})
