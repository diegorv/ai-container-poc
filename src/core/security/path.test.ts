import { describe, expect, it } from 'vitest'
import { joinPath, literalPath, operatorPath, pathString, safeFilename } from './path'
import { UntrustedInputError } from './untrusted-input'

describe('literalPath', () => {
  it('brands well-formed absolute paths', () => {
    expect(literalPath('/opt/mydevc/setup-firewall.sh')).toBe('/opt/mydevc/setup-firewall.sh')
    expect(literalPath('/')).toBe('/')
  })

  it('rejects relative paths', () => {
    expect(() => literalPath('opt/foo')).toThrow(UntrustedInputError)
    expect(() => literalPath('./foo')).toThrow(UntrustedInputError)
    expect(() => literalPath('')).toThrow(UntrustedInputError)
  })

  it('rejects NUL bytes', () => {
    expect(() => literalPath('/opt/foo\0bar')).toThrow(/NUL/)
  })
})

describe('operatorPath', () => {
  it('brands absolute paths and normalises ..', () => {
    expect(operatorPath('/home/alice')).toBe('/home/alice')
    expect(operatorPath('/home/alice/../bob')).toBe('/home/bob')
  })

  it('rejects relative or empty', () => {
    expect(() => operatorPath('relative')).toThrow(UntrustedInputError)
    expect(() => operatorPath('')).toThrow(UntrustedInputError)
  })

  it('rejects NUL', () => {
    expect(() => operatorPath('/home/alice\0/evil')).toThrow(/NUL/)
  })
})

describe('safeFilename', () => {
  it('brands valid filenames', () => {
    expect(safeFilename('subdir')).toBe('subdir')
    expect(safeFilename('my-project_2.0')).toBe('my-project_2.0')
  })

  it('rejects invalid filenames', () => {
    expect(() => safeFilename('a/b')).toThrow(UntrustedInputError)
    expect(() => safeFilename('..')).toThrow(UntrustedInputError)
    expect(() => safeFilename('')).toThrow(UntrustedInputError)
    expect(() => safeFilename('with space')).toThrow(UntrustedInputError)
  })
})

describe('joinPath', () => {
  it('joins a base with safe segments', () => {
    const base = literalPath('/opt/mydevc')
    const out = joinPath(base, safeFilename('templates'), safeFilename('Dockerfile'))
    expect(out).toBe('/opt/mydevc/templates/Dockerfile')
  })

  it('returns the base when no segments are given', () => {
    const base = literalPath('/opt')
    expect(joinPath(base)).toBe('/opt')
  })

  it('preserves the AbsolutePath type chainably', () => {
    const base = literalPath('/home/alice')
    const dir = joinPath(base, safeFilename('.claude'))
    const file = joinPath(dir, safeFilename('settings.json'))
    expect(file).toBe('/home/alice/.claude/settings.json')
  })

  it('refuses to construct a path outside the base (defense in depth)', () => {
    // This isn't reachable through the public API because `safeFilename`
    // rejects `..`, but the runtime guard is the safety net for any
    // future widening of the brand definition.
    const base = literalPath('/home/alice')
    // Bypass the validator to simulate a regression in the brand:
    const sneaky = '..' as unknown as ReturnType<typeof safeFilename>
    expect(() => joinPath(base, sneaky)).toThrow(/escape base/)
  })
})

describe('pathString', () => {
  it('returns the same string the brand wraps', () => {
    const p = literalPath('/opt/foo')
    expect(pathString(p)).toBe('/opt/foo')
  })
})
