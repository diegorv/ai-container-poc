import { describe, expect, it } from 'vitest'
import { CliError } from './cli-error'
import { parseJsonc } from './parse-jsonc'

describe('parseJsonc', () => {
  it('parses plain JSON unchanged', () => {
    expect(parseJsonc('{"a": 1, "b": [2, 3]}', '<test>')).toEqual({ a: 1, b: [2, 3] })
  })

  it('accepts // line comments', () => {
    const src = `{
      // line comment
      "name": "sandbox" // trailing
    }`
    expect(parseJsonc(src, '<test>')).toEqual({ name: 'sandbox' })
  })

  it('accepts /* block */ comments', () => {
    const src = `{
      /* block comment */
      "name": "sandbox"
    }`
    expect(parseJsonc(src, '<test>')).toEqual({ name: 'sandbox' })
  })

  it('accepts trailing commas in objects and arrays', () => {
    const src = `{
      "items": [1, 2, 3,],
      "name": "sandbox",
    }`
    expect(parseJsonc(src, '<test>')).toEqual({ items: [1, 2, 3], name: 'sandbox' })
  })

  it('throws CliError on syntax errors with the source path', () => {
    const src = '{ "name": '
    let caught: unknown
    try {
      parseJsonc(src, '/projects/x/.devcontainer/devcontainer.json')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(CliError)
    expect((caught as CliError).message).toContain('/projects/x/.devcontainer/devcontainer.json')
    expect((caught as CliError).suggestion).toMatch(/JSONC/)
  })

  it('does not accept single-quoted strings (JSON5, not JSONC)', () => {
    expect(() => parseJsonc("{ 'name': 'sandbox' }", '<test>')).toThrow(CliError)
  })
})
