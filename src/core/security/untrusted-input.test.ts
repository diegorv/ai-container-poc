import { describe, expect, it } from 'vitest'
import {
  UntrustedInputError,
  assertNoMountReservedChars,
  assertNoNul,
  assertPosixUserName,
  assertSafeFilename,
  isHomeOrRootAbsolutePath,
  isPosixUserName,
  isSafeFilename,
} from './untrusted-input'

describe('isSafeFilename', () => {
  it('accepts POSIX-friendly names', () => {
    expect(isSafeFilename('crypto')).toBe(true)
    expect(isSafeFilename('my-project_2.0')).toBe(true)
  })

  it('rejects empty, dot and dotdot', () => {
    expect(isSafeFilename('')).toBe(false)
    expect(isSafeFilename('.')).toBe(false)
    expect(isSafeFilename('..')).toBe(false)
  })

  it('rejects NUL and path separators', () => {
    expect(isSafeFilename('a\0b')).toBe(false)
    expect(isSafeFilename('a/b')).toBe(false)
    expect(isSafeFilename('a b')).toBe(false)
  })

  it('rejects names longer than 128 chars', () => {
    expect(isSafeFilename('a'.repeat(128))).toBe(true)
    expect(isSafeFilename('a'.repeat(129))).toBe(false)
  })
})

describe('isPosixUserName', () => {
  it('accepts typical POSIX usernames', () => {
    expect(isPosixUserName('vscode')).toBe(true)
    expect(isPosixUserName('_svc')).toBe(true)
  })

  it('rejects path separators, .., and NUL', () => {
    expect(isPosixUserName('foo/bar')).toBe(false)
    expect(isPosixUserName('..')).toBe(false)
    expect(isPosixUserName('foo\0')).toBe(false)
    expect(isPosixUserName('foo/../etc')).toBe(false)
  })

  it('rejects names starting with a digit (POSIX restriction)', () => {
    expect(isPosixUserName('1foo')).toBe(false)
  })
})

describe('isHomeOrRootAbsolutePath', () => {
  it('accepts /home/<user>/...', () => {
    expect(isHomeOrRootAbsolutePath('/home/vscode/.claude')).toBe(true)
  })

  it('accepts /root and subpaths', () => {
    expect(isHomeOrRootAbsolutePath('/root')).toBe(true)
    expect(isHomeOrRootAbsolutePath('/root/.claude')).toBe(true)
  })

  it('rejects paths with .. or NUL', () => {
    expect(isHomeOrRootAbsolutePath('/home/vscode/../../etc')).toBe(false)
    expect(isHomeOrRootAbsolutePath('/root/foo\0bar')).toBe(false)
  })

  it('rejects paths outside /home or /root', () => {
    expect(isHomeOrRootAbsolutePath('/etc')).toBe(false)
    expect(isHomeOrRootAbsolutePath('/var/run')).toBe(false)
  })
})

describe('assertNoNul', () => {
  it('passes when there is no NUL', () => {
    expect(() => assertNoNul('field', 'safe')).not.toThrow()
  })

  it('throws UntrustedInputError on NUL', () => {
    expect(() => assertNoNul('field', 'a\0b')).toThrow(UntrustedInputError)
  })
})

describe('assertNoMountReservedChars', () => {
  it('rejects comma, equals, and NUL', () => {
    expect(() => assertNoMountReservedChars('hostPath', 'a,b')).toThrow(/CSV-reserved/)
    expect(() => assertNoMountReservedChars('hostPath', 'a=b')).toThrow(/CSV-reserved/)
    expect(() => assertNoMountReservedChars('hostPath', 'a\0b')).toThrow(/CSV-reserved/)
  })

  it('passes for benign paths', () => {
    expect(() => assertNoMountReservedChars('hostPath', '/home/x/data')).not.toThrow()
  })
})

describe('assertSafeFilename / assertPosixUserName', () => {
  it('throws with field name and value in the message', () => {
    expect(() => assertSafeFilename('projectName', '../evil')).toThrow(/projectName/)
    expect(() => assertPosixUserName('user', 'foo/bar')).toThrow(/user/)
  })
})
