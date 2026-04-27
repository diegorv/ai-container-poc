import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { p } from '@/test-utils/path'
import { fileSystemContract } from './filesystem-contract'

fileSystemContract('memory-fs', async () => {
  const fs = createMemoryFs()
  await fs.mkdir(p('/work'), { recursive: true })
  return fs
})
