import { describe, expect, it } from 'vitest'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import { gitConfigStep } from './git-config'
import type { StepContext } from './step'

async function makeCtx(): Promise<StepContext> {
  const fs = createMemoryFs()
  await fs.mkdir(p('/home/vscode'), { recursive: true })
  return {
    fs,
    shell: createFakeShell(),
    logger: createMemoryLogger(),
    homeDir: p('/home/vscode'),
    uid: 1000,
    gid: 1000,
    env: { HOME: p('/home/vscode') },
  }
}

describe('git-config step', () => {
  it('writes the global gitignore and the local gitconfig', async () => {
    const c = await makeCtx()
    const r = await gitConfigStep.run(c)
    expect(r.ok).toBe(true)

    const ignore = await c.fs.readFile(p('/home/vscode/.gitignore_global'))
    expect(ignore).toContain('node_modules/')
    expect(ignore).toContain('.ruff_cache/')
    expect(ignore).toContain('.claude/')

    const gitconfig = await c.fs.readFile(p('/home/vscode/.gitconfig.local'))
    expect(gitconfig).toContain('path = /home/vscode/.gitconfig')
    expect(gitconfig).toContain('excludesfile = /home/vscode/.gitignore_global')
    expect(gitconfig).toContain('pager = delta')
    expect(gitconfig).toContain('navigate = true')
  })
})
