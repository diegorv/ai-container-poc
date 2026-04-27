import { describe, expect, it } from 'vitest'
import { CliError } from './cli-error'

describe('CliError', () => {
  it('exposes message and suggestion', () => {
    const e = new CliError('boom', { suggestion: 'try X' })
    expect(e.message).toBe('boom')
    expect(e.suggestion).toBe('try X')
    expect(e.name).toBe('CliError')
    expect(e instanceof Error).toBe(true)
  })

  it('suggestion is undefined by default', () => {
    expect(new CliError('boom').suggestion).toBeUndefined()
  })

  it('forwards cause when provided', () => {
    const cause = new Error('inner')
    const e = new CliError('outer', { cause })
    expect(e.cause).toBe(cause)
  })
})
