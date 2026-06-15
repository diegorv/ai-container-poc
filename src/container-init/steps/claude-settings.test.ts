import { describe, expect, it } from 'vitest'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import { claudeSettingsStep } from './claude-settings'
import type { StepContext } from './step'

function ctx(env: Record<string, string> = {}): StepContext {
  return {
    fs: createMemoryFs(),
    shell: createFakeShell(),
    logger: createMemoryLogger(),
    homeDir: p('/home/vscode'),
    uid: 1000,
    gid: 1000,
    env: { HOME: p('/home/vscode'), ...env },
  }
}

describe('claude-settings step', () => {
  it('writes bypassPermissions=true into a fresh settings.json', async () => {
    const c = ctx()
    const r = await claudeSettingsStep.run(c)
    expect(r.ok).toBe(true)
    const written = JSON.parse(await c.fs.readFile(p('/home/vscode/.claude/settings.json')))
    expect(written.permissions.defaultMode).toBe('bypassPermissions')
  })

  it('preserves unrelated settings when updating an existing file', async () => {
    const c = ctx()
    await c.fs.mkdir(p('/home/vscode/.claude'), { recursive: true })
    await c.fs.writeFile(
      p('/home/vscode/.claude/settings.json'),
      JSON.stringify({ theme: 'dark', permissions: { defaultMode: 'strict' } }),
    )
    await claudeSettingsStep.run(c)
    const written = JSON.parse(await c.fs.readFile(p('/home/vscode/.claude/settings.json')))
    expect(written.theme).toBe('dark')
    expect(written.permissions.defaultMode).toBe('bypassPermissions')
  })

  it('respects CLAUDE_CONFIG_DIR', async () => {
    const c = ctx({ CLAUDE_CONFIG_DIR: '/opt/claude' })
    await claudeSettingsStep.run(c)
    expect(await c.fs.exists(p('/opt/claude/settings.json'))).toBe(true)
  })
})
