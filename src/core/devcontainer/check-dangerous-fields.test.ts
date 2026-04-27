import { describe, expect, it } from 'vitest'
import { findDangerousFields } from './check-dangerous-fields'

describe('findDangerousFields', () => {
  it('passes on an empty config', () => {
    expect(findDangerousFields({})).toEqual([])
  })

  it('flags privileged: true', () => {
    const findings = findDangerousFields({ privileged: true })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.field).toBe('privileged')
  })

  it('ignores privileged: false', () => {
    expect(findDangerousFields({ privileged: false })).toEqual([])
  })

  it('flags seccomp=unconfined and apparmor=unconfined', () => {
    expect(
      findDangerousFields({ securityOpt: ['seccomp=unconfined', 'apparmor=unconfined'] }),
    ).toHaveLength(2)
  })

  it('flags no-new-privileges:false and label:disable', () => {
    expect(
      findDangerousFields({ securityOpt: ['no-new-privileges:false', 'label:disable'] }),
    ).toHaveLength(2)
  })

  it('flags containerUser override to root', () => {
    const findings = findDangerousFields({ containerUser: 'root' })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.field).toBe('containerUser')
  })

  it('accepts containerUser=vscode (template default)', () => {
    expect(findDangerousFields({ containerUser: 'vscode' })).toEqual([])
  })
})
