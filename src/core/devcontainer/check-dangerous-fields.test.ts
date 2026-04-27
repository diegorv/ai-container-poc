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
