import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { describe, expect, it } from 'vitest'
import { runSteps } from './runner'
import type { Step, StepContext } from './steps/step'

function ctx(): StepContext & { logger: ReturnType<typeof createMemoryLogger> } {
  return {
    fs: createMemoryFs(),
    shell: createFakeShell(),
    logger: createMemoryLogger(),
    homeDir: '/h',
    uid: 0,
    gid: 0,
    env: { HOME: '/h' },
  }
}

describe('runSteps', () => {
  it('counts ok and not-ok results separately', async () => {
    const steps: Step[] = [
      { name: 'a', run: async () => ({ ok: true, message: 'a-ok' }) },
      { name: 'b', run: async () => ({ ok: false, error: 'b-bad' }) },
      { name: 'c', run: async () => ({ ok: true, message: 'c-ok' }) },
    ]
    const c = ctx()
    const r = await runSteps(steps, c)
    expect(r).toEqual({ failed: 1, succeeded: 2 })
    expect(c.logger.has('error', 'b-bad')).toBe(true)
  })

  it('does not abort on a thrown error', async () => {
    const steps: Step[] = [
      {
        name: 'boom',
        run: async () => {
          throw new Error('kaboom')
        },
      },
      { name: 'after', run: async () => ({ ok: true, message: 'still here' }) },
    ]
    const c = ctx()
    const r = await runSteps(steps, c)
    expect(r).toEqual({ failed: 1, succeeded: 1 })
    expect(c.logger.has('error', 'kaboom')).toBe(true)
    expect(c.logger.has('success', 'still here')).toBe(true)
  })
})
