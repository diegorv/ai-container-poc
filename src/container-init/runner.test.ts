import { describe, expect, it } from 'vitest'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import { runSteps } from './runner'
import type { Step, StepContext } from './steps/step'

function ctx(): StepContext & { logger: ReturnType<typeof createMemoryLogger> } {
  return {
    fs: createMemoryFs(),
    shell: createFakeShell(),
    logger: createMemoryLogger(),
    homeDir: p('/h'),
    uid: 0,
    gid: 0,
    env: { HOME: p('/h') },
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

  it('times out a hung step and continues', async () => {
    const steps: Step[] = [
      {
        name: 'hang',
        run: () => new Promise(() => undefined),
      },
      { name: 'after', run: async () => ({ ok: true, message: 'after-ok' }) },
    ]
    const c = ctx()
    const r = await runSteps(steps, c, { stepTimeoutMs: 5 })
    expect(r).toEqual({ failed: 1, succeeded: 1 })
    expect(c.logger.has('error', 'timed out')).toBe(true)
    expect(c.logger.has('success', 'after-ok')).toBe(true)
  })

  it('honours stepTimeoutMs=0 as "no timeout"', async () => {
    const steps: Step[] = [
      {
        name: 'slow',
        run: async () => {
          await new Promise((r) => setTimeout(r, 10))
          return { ok: true, message: 'eventually' }
        },
      },
    ]
    const c = ctx()
    // 1ms would normally trip; 0 disables the guard.
    const r = await runSteps(steps, c, { stepTimeoutMs: 0 })
    expect(r).toEqual({ failed: 0, succeeded: 1 })
  })
})
