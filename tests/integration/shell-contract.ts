import type { Shell } from '@/ports/shell'
import { describe, expect, it } from 'vitest'

/**
 * Behavioural contract for any Shell implementation. The fake exposes a
 * smaller surface (you can pre-register binaries / canned responses) but
 * its observable behaviour must match the real one for the cases below.
 */
export function shellContract(name: string, build: () => Promise<Shell>): void {
  describe(`Shell contract — ${name}`, () => {
    it('captures stdout from a successful command', async () => {
      const shell = await build()
      const r = await shell.exec('echo', ['hello'])
      expect(r.exitCode).toBe(0)
      expect(r.stdout.trim()).toBe('hello')
    })

    it('does not throw on a non-zero exit', async () => {
      const shell = await build()
      const r = await shell.exec('sh', ['-c', 'exit 3'])
      expect(r.exitCode).toBe(3)
    })

    it('captures stderr separately', async () => {
      const shell = await build()
      const r = await shell.exec('sh', ['-c', 'echo oops 1>&2'])
      expect(r.stderr.trim()).toBe('oops')
    })

    it('which returns null for missing binaries', async () => {
      const shell = await build()
      expect(await shell.which('some-binary-that-does-not-exist-xyz')).toBeNull()
    })

    it('which returns a path for known binaries', async () => {
      const shell = await build()
      const path = await shell.which('sh')
      expect(path).toBeTruthy()
    })
  })
}
