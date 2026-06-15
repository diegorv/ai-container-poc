import { describe, expect, it } from 'vitest'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import { directoryOwnershipStep } from './directory-ownership'
import type { StepContext } from './step'

function ctx(uid = 1000): StepContext & {
  fs: ReturnType<typeof createMemoryFs>
  shell: ReturnType<typeof createFakeShell>
  logger: ReturnType<typeof createMemoryLogger>
} {
  return {
    fs: createMemoryFs({}, { uid }),
    shell: createFakeShell(),
    logger: createMemoryLogger(),
    homeDir: p('/home/vscode'),
    uid,
    gid: uid,
    env: { HOME: p('/home/vscode') },
  }
}

describe('directory-ownership step', () => {
  it('runs sudo chown on every existing dir whose uid differs from the current user', async () => {
    const c = ctx(1000)
    // Seed all three target dirs with uid=0 (root) so chown is needed for each.
    c.fs = createMemoryFs({}, { uid: 0 })
    await c.fs.mkdir(p('/home/vscode/.claude'), { recursive: true })
    await c.fs.mkdir(p('/commandhistory'), { recursive: true })
    await c.fs.mkdir(p('/home/vscode/.config/gh'), { recursive: true })

    const result = await directoryOwnershipStep.run(c)
    expect(result.ok).toBe(true)
    const cmds = c.shell.calls.filter((call) => call.command === 'sudo').map((s) => s.args)
    expect(cmds).toEqual([
      ['/opt/mydevc/chown-managed.sh', '/home/vscode/.claude'],
      ['/opt/mydevc/chown-managed.sh', '/commandhistory'],
      ['/opt/mydevc/chown-managed.sh', '/home/vscode/.config/gh'],
    ])
  })

  it('skips dirs that do not exist', async () => {
    const c = ctx()
    const result = await directoryOwnershipStep.run(c)
    expect(result.ok).toBe(true)
    expect(c.shell.calls.filter((s) => s.command === 'sudo')).toHaveLength(0)
  })

  it('continues after a chown failure', async () => {
    const c = ctx(1000)
    c.fs = createMemoryFs({}, { uid: 0 })
    await c.fs.mkdir(p('/home/vscode/.claude'), { recursive: true })
    await c.fs.mkdir(p('/commandhistory'), { recursive: true })
    c.shell.setResponder((cmd, args) => {
      if (cmd === 'sudo' && args.includes('/commandhistory')) {
        return { exitCode: 1, stderr: 'permission denied' }
      }
      return { exitCode: 0 }
    })
    const result = await directoryOwnershipStep.run(c)
    expect(result.ok).toBe(true)
    expect(c.logger.has('warn', 'could not fix ownership of /commandhistory')).toBe(true)
  })
})
