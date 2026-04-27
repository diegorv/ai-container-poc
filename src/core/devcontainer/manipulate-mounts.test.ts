import { describe, expect, it } from 'vitest'
import {
  addBindMount,
  extractCustomMounts,
  mergeCustomMounts,
  targetOfMount,
} from './manipulate-mounts'

describe('targetOfMount', () => {
  it('parses target= out of a string mount', () => {
    expect(targetOfMount('source=/h,target=/c,type=bind')).toBe('/c')
  })

  it('returns the target field of an object mount', () => {
    expect(targetOfMount({ type: 'bind', source: '/h', target: '/c' })).toBe('/c')
  })

  it('is undefined when no target= present', () => {
    expect(targetOfMount('source=/h,type=bind')).toBeUndefined()
  })
})

describe('extractCustomMounts', () => {
  it('drops template-managed targets and keeps user-added ones', () => {
    const mounts = [
      'source=cmdhist,target=/commandhistory,type=volume',
      'source=/h/data,target=/data,type=bind',
      'source=claude,target=/home/vscode/.claude,type=volume',
      { type: 'bind' as const, source: '/h/extra', target: '/opt/extra' },
    ]
    expect(extractCustomMounts(mounts)).toEqual([
      'source=/h/data,target=/data,type=bind',
      { type: 'bind', source: '/h/extra', target: '/opt/extra' },
    ])
  })

  it('returns [] for undefined input', () => {
    expect(extractCustomMounts(undefined)).toEqual([])
  })
})

describe('mergeCustomMounts', () => {
  it('appends new mounts to base', () => {
    const merged = mergeCustomMounts(
      ['source=/a,target=/x,type=bind'],
      ['source=/b,target=/y,type=bind'],
    )
    expect(merged).toEqual(['source=/a,target=/x,type=bind', 'source=/b,target=/y,type=bind'])
  })

  it('does not duplicate string mounts that already exist', () => {
    const merged = mergeCustomMounts(
      ['source=/a,target=/x,type=bind'],
      ['source=/a,target=/x,type=bind'],
    )
    expect(merged).toHaveLength(1)
  })

  it('treats mounts with the same target as duplicates', () => {
    const merged = mergeCustomMounts(
      ['source=/old,target=/x,type=bind'],
      [{ type: 'bind' as const, source: '/old', target: '/x' }],
    )
    expect(merged).toHaveLength(1)
  })
})

describe('addBindMount', () => {
  it('appends a new bind mount', () => {
    const out = addBindMount({
      mounts: undefined,
      hostPath: '/h/data',
      containerPath: '/data',
    })
    expect(out).toEqual(['source=/h/data,target=/data,type=bind'])
  })

  it('replaces an existing mount with the same target (idempotent)', () => {
    const out = addBindMount({
      mounts: ['source=/old,target=/data,type=bind'],
      hostPath: '/h/new',
      containerPath: '/data',
    })
    expect(out).toEqual(['source=/h/new,target=/data,type=bind'])
  })

  it('adds the readonly flag when requested', () => {
    const out = addBindMount({
      mounts: undefined,
      hostPath: '/h/cfg',
      containerPath: '/etc/cfg',
      readonly: true,
    })
    expect(out).toEqual(['source=/h/cfg,target=/etc/cfg,type=bind,readonly'])
  })

  it('preserves unrelated mounts', () => {
    const out = addBindMount({
      mounts: ['source=/h/a,target=/a,type=bind'],
      hostPath: '/h/b',
      containerPath: '/b',
    })
    expect(out).toEqual(['source=/h/a,target=/a,type=bind', 'source=/h/b,target=/b,type=bind'])
  })
})
