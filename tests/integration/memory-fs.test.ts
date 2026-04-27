import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { fileSystemContract } from './filesystem-contract'

fileSystemContract('memory-fs', async () => {
  const fs = createMemoryFs()
  await fs.mkdir('/work', { recursive: true })
  return fs
})
