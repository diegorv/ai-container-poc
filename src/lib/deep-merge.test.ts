import { describe, expect, it } from 'vitest'
import { deepMerge } from './deep-merge'

describe('deepMerge', () => {
  it('returns override values for primitive keys', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 })
  })

  it('recursively merges nested objects', () => {
    const base = { x: { a: 1, b: 2 } }
    const override = { x: { b: 99, c: 3 } }
    expect(deepMerge(base, override)).toEqual({ x: { a: 1, b: 99, c: 3 } })
  })

  it('replaces arrays instead of concatenating them', () => {
    const base = { mounts: ['a', 'b'] }
    const override = { mounts: ['c'] }
    expect(deepMerge(base, override)).toEqual({ mounts: ['c'] })
  })

  it('does not mutate the inputs', () => {
    const base = { a: { b: 1 } }
    const override = { a: { c: 2 } }
    const result = deepMerge(base, override)
    expect(base).toEqual({ a: { b: 1 } })
    expect(override).toEqual({ a: { c: 2 } })
    expect(result).toEqual({ a: { b: 1, c: 2 } })
  })
})
