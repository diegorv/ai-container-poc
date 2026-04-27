import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { describe, expect, it } from 'vitest'
import { walkFiles } from './walk-fs'

describe('walkFiles', () => {
  it('yields every regular file recursively, with relative paths', async () => {
    const fs = createMemoryFs({
      '/root/a.txt': 'a',
      '/root/sub/b.txt': 'b',
      '/root/sub/deep/c.txt': 'c',
    })
    const entries = await walkFiles(fs, '/root')
    expect(entries.map((e) => e.relativePath).sort()).toEqual([
      'a.txt',
      'sub/b.txt',
      'sub/deep/c.txt',
    ])
  })

  it('returns [] for an empty directory', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/empty', { recursive: true })
    expect(await walkFiles(fs, '/empty')).toEqual([])
  })
})
