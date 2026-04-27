import { describe, expect, it } from 'vitest'
import { err, flatMap, isErr, isOk, map, mapErr, ok, unwrap } from './result'

describe('Result helpers', () => {
  it('ok and err produce the right discriminant', () => {
    const a = ok(1)
    expect(a.ok).toBe(true)
    if (a.ok) expect(a.value).toBe(1)

    const b = err('nope')
    expect(b.ok).toBe(false)
    if (!b.ok) expect(b.error).toBe('nope')
  })

  it('isOk / isErr narrow the type', () => {
    const r = ok(2)
    expect(isOk(r)).toBe(true)
    expect(isErr(r)).toBe(false)
    expect(isOk(err('x'))).toBe(false)
    expect(isErr(err('x'))).toBe(true)
  })

  it('map transforms only the value side', () => {
    expect(map(ok(2), (n) => n + 1)).toEqual({ ok: true, value: 3 })
    expect(map(err('e'), (n: number) => n + 1)).toEqual({ ok: false, error: 'e' })
  })

  it('mapErr transforms only the error side', () => {
    expect(mapErr(err(1), (n) => `e${n}`)).toEqual({ ok: false, error: 'e1' })
    expect(mapErr(ok(2), (n: number) => `e${n}`)).toEqual({ ok: true, value: 2 })
  })

  it('flatMap chains successful results', () => {
    expect(flatMap(ok(2), (n) => ok(n * 10))).toEqual({ ok: true, value: 20 })
    expect(flatMap(ok(2), () => err('boom'))).toEqual({ ok: false, error: 'boom' })
    expect(flatMap(err('x'), (n: number) => ok(n))).toEqual({ ok: false, error: 'x' })
  })

  it('unwrap returns value on ok and throws on err', () => {
    expect(unwrap(ok(5))).toBe(5)
    expect(() => unwrap(err(new Error('boom')))).toThrow('boom')
    expect(() => unwrap(err('plain string'))).toThrow('plain string')
  })
})
