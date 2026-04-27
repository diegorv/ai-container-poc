import { describe, expect, it } from 'vitest'
import { ensureAbsolute, expandHome } from './path-utils'

describe('expandHome', () => {
  it('returns HOME when path is exactly ~', () => {
    expect(expandHome('~', '/home/alice')).toBe('/home/alice')
  })

  it('expands ~/foo to HOME/foo', () => {
    expect(expandHome('~/foo/bar', '/home/alice')).toBe('/home/alice/foo/bar')
  })

  it('leaves absolute paths untouched', () => {
    expect(expandHome('/etc/hosts', '/home/alice')).toBe('/etc/hosts')
  })

  it('does not expand ~ in the middle of the path', () => {
    expect(expandHome('foo/~/bar', '/home/alice')).toBe('foo/~/bar')
  })
})

describe('ensureAbsolute', () => {
  it('keeps an absolute path as-is', () => {
    expect(ensureAbsolute('/tmp/x', '/proj')).toBe('/tmp/x')
  })

  it('resolves a relative path against cwd', () => {
    expect(ensureAbsolute('foo/bar', '/proj')).toBe('/proj/foo/bar')
  })
})
