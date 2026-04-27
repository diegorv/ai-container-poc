import { describe, expect, it } from 'vitest'
import {
  addBindMount,
  extractCustomMounts,
  mergeCustomMounts,
  parseStringMount,
  targetOfMount,
} from './manipulate-mounts'

describe('targetOfMount', () => {
  it('parses target= out of a string mount', () => {
    expect(targetOfMount('source=/h,target=/c,type=bind')).toBe('/c')
  })

  it('returns the target field of an object mount', () => {
    expect(targetOfMount({ type: 'bind', source: '/h', target: '/c' })).toBe('/c')
  })

  it('is undefined when the mount is malformed (e.g. no target=)', () => {
    expect(targetOfMount('source=/h,type=bind')).toBeUndefined()
  })
})

describe('parseStringMount', () => {
  it('parses a basic bind mount', () => {
    const p = parseStringMount('source=/h,target=/c,type=bind')
    expect(p.type).toBe('bind')
    expect(p.source).toBe('/h')
    expect(p.target).toBe('/c')
    expect(p.readonly).toBe(false)
  })

  it('detects readonly flag in either form', () => {
    expect(parseStringMount('target=/c,type=volume,readonly').readonly).toBe(true)
    expect(parseStringMount('target=/c,type=volume,ro').readonly).toBe(true)
  })

  it('rejects NUL bytes', () => {
    expect(() => parseStringMount('target=/c\0evil,type=bind,source=/h')).toThrow(/NUL/)
  })

  it('rejects duplicate target= (the cross-boundary injection vector)', () => {
    expect(() => parseStringMount('source=/h,target=/safe,target=/etc,type=bind')).toThrow(
      /duplicate key 'target'/,
    )
  })

  it('rejects duplicate source= and type=', () => {
    expect(() => parseStringMount('source=/a,source=/b,target=/c,type=bind')).toThrow(/duplicate/)
    expect(() => parseStringMount('target=/c,type=bind,type=volume')).toThrow(/duplicate/)
  })

  it('rejects empty / trailing fields', () => {
    expect(() => parseStringMount('source=/h,target=/c,type=bind,')).toThrow(/empty field/)
    expect(() => parseStringMount(',source=/h,target=/c,type=bind')).toThrow(/empty field/)
  })

  it('rejects unknown bare flags (must have a value)', () => {
    expect(() => parseStringMount('source=/h,target=/c,type=bind,evil')).toThrow(/missing a value/)
  })

  it('rejects missing or invalid type=', () => {
    expect(() => parseStringMount('source=/h,target=/c')).toThrow(/invalid or missing type/)
    expect(() => parseStringMount('source=/h,target=/c,type=overlay')).toThrow(
      /invalid or missing type/,
    )
  })

  it('rejects missing target=', () => {
    expect(() => parseStringMount('source=/h,type=bind')).toThrow(/missing target/)
  })

  it('accepts destination= and dst= as target aliases', () => {
    expect(parseStringMount('source=/h,destination=/c,type=bind').target).toBe('/c')
    expect(parseStringMount('source=/h,dst=/c,type=bind').target).toBe('/c')
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

  it('throws when hostPath contains a comma (CSV injection)', () => {
    expect(() =>
      addBindMount({
        mounts: undefined,
        hostPath: '/tmp/x,readonly,target=/etc',
        containerPath: '/data',
      }),
    ).toThrow(/CSV-reserved/)
  })

  it('throws when containerPath contains a comma or =', () => {
    expect(() =>
      addBindMount({
        mounts: undefined,
        hostPath: '/h',
        containerPath: '/c,readonly',
      }),
    ).toThrow(/CSV-reserved/)
    expect(() =>
      addBindMount({
        mounts: undefined,
        hostPath: '/h',
        containerPath: '/c=foo',
      }),
    ).toThrow(/CSV-reserved/)
  })
})
