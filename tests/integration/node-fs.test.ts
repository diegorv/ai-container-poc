import { mkdtemp, symlink as realSymlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nodeFs } from '@/adapters/filesystem/node-fs'
import type { FileSystem } from '@/ports/filesystem'
import { afterEach, beforeEach } from 'vitest'
import { fileSystemContract } from './filesystem-contract'

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'mydevc-fs-'))
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

/**
 * Wraps `nodeFs` so that the contract can use `/work/...` paths while the
 * real filesystem operates inside a per-test temp directory.
 */
function buildScopedNodeFs(): FileSystem {
  const map = (path: string): string => path.replace(/^\/work/, tempRoot)
  return {
    readFile: (p) => nodeFs.readFile(map(p)),
    writeFile: (p, c) => nodeFs.writeFile(map(p), c),
    exists: (p) => nodeFs.exists(map(p)),
    mkdir: (p, o) => nodeFs.mkdir(map(p), o),
    readdir: (p) => nodeFs.readdir(map(p)),
    copy: (s, d, o) => nodeFs.copy(map(s), map(d), o),
    remove: (p, o) => nodeFs.remove(map(p), o),
    stat: (p) => nodeFs.stat(map(p)),
    lstat: (p) => nodeFs.lstat(map(p)),
    realpath: (p) => nodeFs.realpath(map(p)),
    symlink: async (target, path) => {
      await realSymlink(map(target), map(path))
    },
    readlink: async (p) => {
      const linkValue = await nodeFs.readlink(map(p))
      return linkValue.startsWith(tempRoot) ? linkValue.replace(tempRoot, '/work') : linkValue
    },
    chmod: (p, m) => nodeFs.chmod(map(p), m),
  }
}

fileSystemContract('node-fs', async () => buildScopedNodeFs())
