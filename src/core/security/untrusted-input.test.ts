import { describe, expect, it } from 'vitest'
import { untrust } from './brand'
import {
  asHomeOrRootAbsolutePath,
  asPosixUserName,
  asSafeFilename,
  assertNoMountReservedChars,
  assertNoNul,
  assertPosixUserName,
  assertSafeFilename,
  UntrustedInputError,
} from './untrusted-input'

const u = (v: string) => untrust(v, 'test')

describe('asSafeFilename', () => {
  it('accepts POSIX-friendly names and returns the branded value', () => {
    const out = asSafeFilename(u('crypto'))
    expect(out).toBe('crypto')
  })

  it('rejects empty, dot, dotdot, NUL, separators, oversized', () => {
    expect(asSafeFilename(u(''))).toBeUndefined()
    expect(asSafeFilename(u('.'))).toBeUndefined()
    expect(asSafeFilename(u('..'))).toBeUndefined()
    expect(asSafeFilename(u('a\0b'))).toBeUndefined()
    expect(asSafeFilename(u('a/b'))).toBeUndefined()
    expect(asSafeFilename(u('a b'))).toBeUndefined()
    expect(asSafeFilename(u('a'.repeat(129)))).toBeUndefined()
  })

  it('also accepts raw strings (for use inside core/security itself)', () => {
    expect(asSafeFilename('crypto')).toBe('crypto')
  })
})

describe('asPosixUserName', () => {
  it('accepts typical usernames', () => {
    expect(asPosixUserName(u('vscode'))).toBe('vscode')
    expect(asPosixUserName(u('_svc'))).toBe('_svc')
  })

  it('rejects path separators, .., NUL, leading digit', () => {
    expect(asPosixUserName(u('foo/bar'))).toBeUndefined()
    expect(asPosixUserName(u('..'))).toBeUndefined()
    expect(asPosixUserName(u('foo\0'))).toBeUndefined()
    expect(asPosixUserName(u('foo/../etc'))).toBeUndefined()
    expect(asPosixUserName(u('1foo'))).toBeUndefined()
  })
})

describe('asHomeOrRootAbsolutePath', () => {
  it('accepts /home/<user>/... and /root/...', () => {
    expect(asHomeOrRootAbsolutePath(u('/home/vscode/.claude'))).toBe('/home/vscode/.claude')
    expect(asHomeOrRootAbsolutePath(u('/root/.claude'))).toBe('/root/.claude')
  })

  it('rejects paths with .. or NUL', () => {
    expect(asHomeOrRootAbsolutePath(u('/home/vscode/../../etc'))).toBeUndefined()
    expect(asHomeOrRootAbsolutePath(u('/root/foo\0bar'))).toBeUndefined()
  })

  it('rejects paths outside /home or /root', () => {
    expect(asHomeOrRootAbsolutePath(u('/etc'))).toBeUndefined()
    expect(asHomeOrRootAbsolutePath(u('/var/run'))).toBeUndefined()
  })
})

describe('assertNoNul', () => {
  it('passes when there is no NUL', () => {
    expect(() => assertNoNul('field', u('safe'))).not.toThrow()
  })

  it('throws UntrustedInputError on NUL', () => {
    expect(() => assertNoNul('field', u('a\0b'))).toThrow(UntrustedInputError)
  })
})

describe('assertNoMountReservedChars', () => {
  it('rejects comma, equals, NUL', () => {
    expect(() => assertNoMountReservedChars('hostPath', u('a,b'))).toThrow(/CSV-reserved/)
    expect(() => assertNoMountReservedChars('hostPath', u('a=b'))).toThrow(/CSV-reserved/)
    expect(() => assertNoMountReservedChars('hostPath', u('a\0b'))).toThrow(/CSV-reserved/)
  })

  it('returns a SafeMountField for benign paths', () => {
    const out = assertNoMountReservedChars('hostPath', u('/home/x/data'))
    expect(out).toBe('/home/x/data')
  })
})

describe('assert* throwing variants', () => {
  it('include the field name and value in the message', () => {
    expect(() => assertSafeFilename('projectName', u('../evil'))).toThrow(/projectName/)
    expect(() => assertPosixUserName('user', u('foo/bar'))).toThrow(/user/)
  })
})
