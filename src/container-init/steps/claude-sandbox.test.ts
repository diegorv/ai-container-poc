import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import { describe, expect, it } from 'vitest'
import { claudeSandboxStep } from './claude-sandbox'
import type { StepContext } from './step'

async function makeCtx(opts: { withBwrap?: boolean } = {}): Promise<StepContext> {
  const fs = createMemoryFs()
  await fs.mkdir(p('/home/vscode'), { recursive: true })
  const shell = createFakeShell({
    binaries: opts.withBwrap === false ? {} : { bwrap: '/usr/bin/bwrap' },
  })
  return {
    fs,
    shell,
    logger: createMemoryLogger(),
    homeDir: p('/home/vscode'),
    uid: 1000,
    gid: 1000,
    env: { HOME: p('/home/vscode') },
  }
}

describe('claude-sandbox step', () => {
  it('installs claude-jail at ~/.local/bin/claude-jail when bwrap is present', async () => {
    const c = await makeCtx()
    const r = await claudeSandboxStep.run(c)
    expect(r.ok).toBe(true)

    const path = p('/home/vscode/.local/bin/claude-jail')
    expect(await c.fs.exists(path)).toBe(true)

    const content = await c.fs.readFile(path)
    expect(content.startsWith('#!/bin/sh')).toBe(true)
    expect(content).toContain('exec bwrap')
    expect(content).toContain('--ro-bind / /')
    expect(content).toContain('--bind "$CWD" "$CWD"')
    expect(content).toContain('--tmpfs "$HOME/.claude"')
    expect(content).toContain('CLAUDE_JAIL_DISABLE')
  })

  it('marks the shim executable (mode 0o755)', async () => {
    const c = await makeCtx()
    await claudeSandboxStep.run(c)
    const stat = await c.fs.stat(p('/home/vscode/.local/bin/claude-jail'))
    expect(stat.mode & 0o777).toBe(0o755)
  })

  it('creates ~/.local/bin if it does not yet exist', async () => {
    const c = await makeCtx()
    expect(await c.fs.exists(p('/home/vscode/.local/bin'))).toBe(false)
    const r = await claudeSandboxStep.run(c)
    expect(r.ok).toBe(true)
    expect(await c.fs.exists(p('/home/vscode/.local/bin'))).toBe(true)
  })

  it('overwrites an existing claude-jail (idempotent across rebuilds)', async () => {
    const c = await makeCtx()
    await c.fs.mkdir(p('/home/vscode/.local/bin'), { recursive: true })
    await c.fs.writeFile(p('/home/vscode/.local/bin/claude-jail'), '#!/bin/sh\n# stale\n')
    const r = await claudeSandboxStep.run(c)
    expect(r.ok).toBe(true)
    const content = await c.fs.readFile(p('/home/vscode/.local/bin/claude-jail'))
    expect(content).toContain('exec bwrap')
    expect(content).not.toContain('# stale')
  })

  it('is a silent no-op when bwrap is missing', async () => {
    const c = await makeCtx({ withBwrap: false })
    const r = await claudeSandboxStep.run(c)
    expect(r).toEqual({
      ok: true,
      message: expect.stringContaining('bubblewrap not installed'),
    })
    expect(await c.fs.exists(p('/home/vscode/.local/bin/claude-jail'))).toBe(false)
  })
})
