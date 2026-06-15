import { describe, expect, it } from 'vitest'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import type { StepContext } from './step'
import { tmuxConfigStep } from './tmux-config'

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

describe('tmux-config step', () => {
  it('writes ~/.tmux.conf when missing', async () => {
    const c = await makeCtx()
    const r = await tmuxConfigStep.run(c)
    expect(r.ok).toBe(true)
    const conf = await c.fs.readFile(p('/home/vscode/.tmux.conf'))
    expect(conf).toContain('history-limit 200000')
    expect(conf).toContain('mouse on')
  })

  it('does not overwrite an existing config', async () => {
    const c = await makeCtx()
    await c.fs.writeFile(p('/home/vscode/.tmux.conf'), 'custom config')
    const r = await tmuxConfigStep.run(c)
    expect(r.ok).toBe(true)
    expect(await c.fs.readFile(p('/home/vscode/.tmux.conf'))).toBe('custom config')
  })
})
