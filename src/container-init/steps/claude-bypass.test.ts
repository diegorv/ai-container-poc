import { describe, expect, it } from 'vitest'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import { claudeBypassStep } from './claude-bypass'
import type { StepContext } from './step'

async function makeCtx(opts: {
  token?: string
  configDir?: string
  /** Pre-seed `.claude.json` (simulating what `claude -p` would have written). */
  preseed?: { path: string; content: string }
  withClaudeBin?: boolean
}): Promise<StepContext> {
  const fs = createMemoryFs()
  const shell = createFakeShell({
    binaries: opts.withClaudeBin === false ? {} : { claude: '/usr/local/bin/claude' },
    responder: () => ({ exitCode: 0 }),
  })
  if (opts.preseed) {
    const slash = opts.preseed.path.lastIndexOf('/')
    if (slash > 0) {
      await fs.mkdir(p(opts.preseed.path.slice(0, slash)), { recursive: true })
    }
    await fs.writeFile(p(opts.preseed.path), opts.preseed.content)
  }
  return {
    fs,
    shell,
    logger: createMemoryLogger(),
    homeDir: p('/home/vscode'),
    uid: 1000,
    gid: 1000,
    env: {
      HOME: p('/home/vscode'),
      ...(opts.token ? { CLAUDE_CODE_OAUTH_TOKEN: opts.token } : {}),
      ...(opts.configDir ? { CLAUDE_CONFIG_DIR: opts.configDir } : {}),
    },
  }
}

describe('claude-bypass step', () => {
  it('skips when no token is set', async () => {
    const result = await claudeBypassStep.run(await makeCtx({}))
    expect(result).toEqual({
      ok: true,
      message: expect.stringContaining('no CLAUDE_CODE_OAUTH_TOKEN'),
    })
  })

  it('errors when claude binary is missing', async () => {
    const result = await claudeBypassStep.run(await makeCtx({ token: 'tok', withClaudeBin: false }))
    expect(result.ok).toBe(false)
  })

  it('writes hasCompletedOnboarding=true into ~/.claude.json after claude -p', async () => {
    const c = await makeCtx({
      token: 'tok',
      preseed: {
        path: '/home/vscode/.claude.json',
        content: JSON.stringify({ existing: 'value' }),
      },
    })
    const result = await claudeBypassStep.run(c)
    expect(result.ok).toBe(true)
    const written = JSON.parse(await c.fs.readFile(p('/home/vscode/.claude.json')))
    expect(written.existing).toBe('value')
    expect(written.hasCompletedOnboarding).toBe(true)
  })

  it('uses CLAUDE_CONFIG_DIR for the .claude.json location', async () => {
    const c = await makeCtx({
      token: 'tok',
      configDir: '/opt/claude',
      preseed: { path: '/opt/claude/.claude.json', content: '{}' },
    })
    await claudeBypassStep.run(c)
    expect(await c.fs.exists(p('/opt/claude/.claude.json'))).toBe(true)
  })

  it('errors when claude does not produce the config file', async () => {
    const c = await makeCtx({ token: 'tok' })
    const result = await claudeBypassStep.run(c)
    expect(result.ok).toBe(false)
  })
})
