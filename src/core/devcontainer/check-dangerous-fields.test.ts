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

  // Linux usernames are case-sensitive — `Vscode` and `VSCODE` are
  // distinct accounts that won't match the `vscode` user the
  // template's Dockerfile sets up. The check must reject anything
  // other than the literal `vscode` to avoid silently elevating to
  // (or being downgraded to) some other UID with whatever capabilities
  // the kernel decides.
  it.each([
    'Vscode',
    'VSCODE',
    'vscode ',
  ])('flags case- or whitespace-mismatched containerUser %s', (user) => {
    const findings = findDangerousFields({ containerUser: user })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.field).toBe('containerUser')
  })

  it.each([
    '0',
    '1000',
    'root',
    'admin',
    'node',
  ])('flags numeric or non-vscode containerUser %s', (user) => {
    const findings = findDangerousFields({ containerUser: user })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.field).toBe('containerUser')
  })

  it('flags an empty containerUser as not equal to vscode', () => {
    const findings = findDangerousFields({ containerUser: '' })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.field).toBe('containerUser')
  })

  // Cyrillic 'е' (U+0435) and 'с' (U+0441) look identical to Latin
  // 'e' and 'c'. A devcontainer.json that visually says "vscode"
  // could carry confusables and resolve to a different POSIX user
  // entirely. The strict equality check naturally rejects these.
  it('flags a containerUser with unicode confusables', () => {
    const findings = findDangerousFields({ containerUser: 'vsсоde' })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.field).toBe('containerUser')
  })

  it('accepts containerUser undefined (no override at all)', () => {
    expect(findDangerousFields({})).toEqual([])
  })

  it('flags a string bind mount whose source is /etc', () => {
    const findings = findDangerousFields({
      mounts: ['source=/etc,target=/host-etc,type=bind'],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.field).toBe('mounts[0]')
    expect(findings[0]?.reason).toMatch(/\/etc/)
  })

  it('flags a string bind mount whose source is the home SSH dir', () => {
    const findings = findDangerousFields(
      { mounts: ['source=/home/alice/.ssh,target=/x,type=bind'] },
      '/home/alice',
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.reason).toMatch(/credentials/)
  })

  it('accepts a benign bind mount under home', () => {
    expect(
      findDangerousFields(
        { mounts: ['source=/home/alice/work,target=/work,type=bind'] },
        '/home/alice',
      ),
    ).toEqual([])
  })

  it('accepts volume mounts (no host source)', () => {
    expect(findDangerousFields({ mounts: ['source=myvol,target=/data,type=volume'] })).toEqual([])
  })

  it('flags an object bind mount whose source is the docker socket', () => {
    const findings = findDangerousFields({
      mounts: [{ type: 'bind', source: '/var/run/docker.sock', target: '/x' }],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.field).toBe('mounts[0]')
  })
})
