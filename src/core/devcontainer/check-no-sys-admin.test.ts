import { describe, expect, it } from 'vitest'
import { checkNoSysAdmin } from './check-no-sys-admin'

describe('checkNoSysAdmin', () => {
  it('passes when runArgs is missing', () => {
    expect(checkNoSysAdmin({})).toEqual({ ok: true })
  })

  it('passes when runArgs has no SYS_ADMIN reference', () => {
    expect(checkNoSysAdmin({ runArgs: ['--cap-add=NET_ADMIN', '--init'] })).toEqual({
      ok: true,
    })
  })

  it('flags --cap-add=SYS_ADMIN', () => {
    const result = checkNoSysAdmin({ runArgs: ['--cap-add=SYS_ADMIN'] })
    expect(result.ok).toBe(false)
    expect(result.offendingArg).toBe('--cap-add=SYS_ADMIN')
  })

  it('flags any arg containing SYS_ADMIN', () => {
    const result = checkNoSysAdmin({ runArgs: ['--security-opt=apparmor:unconfined,SYS_ADMIN'] })
    expect(result.ok).toBe(false)
  })
})
