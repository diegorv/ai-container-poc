import { describe, expect, it } from 'vitest'
import { parseArgs } from './parser'

const ctx = { cwd: '/proj' }

describe('parseArgs', () => {
  it('returns help for empty argv', () => {
    expect(parseArgs([], ctx)).toEqual({ name: 'help' })
  })

  it('maps "." to dot command in cwd', () => {
    expect(parseArgs(['.'], ctx)).toEqual({ name: 'dot', cwd: '/proj', force: false })
  })

  it('parses template with -f flag', () => {
    expect(parseArgs(['template', '-f', '/elsewhere'], ctx)).toEqual({
      name: 'template',
      cwd: '/elsewhere',
      force: true,
    })
  })

  it('treats template . as cwd', () => {
    expect(parseArgs(['template', '.'], ctx)).toEqual({
      name: 'template',
      cwd: '/proj',
      force: false,
    })
  })

  it('parses exec with arbitrary command tail', () => {
    expect(parseArgs(['exec', 'ls', '-la'], ctx)).toEqual({
      name: 'exec',
      cwd: '/proj',
      command: ['ls', '-la'],
    })
  })

  it('parses mount with readonly flag', () => {
    expect(parseArgs(['mount', '/h/data', '/data', '--readonly'], ctx)).toEqual({
      name: 'mount',
      hostPath: '/h/data',
      containerPath: '/data',
      readonly: true,
      cwd: '/proj',
    })
  })

  it('throws helpful error on missing mount args', () => {
    expect(() => parseArgs(['mount', '/h/data'], ctx)).toThrow(/Usage: mydevc mount/)
  })

  it('parses sync with --trusted and a filter', () => {
    expect(parseArgs(['sync', '--trusted', 'crypto'], ctx)).toEqual({
      name: 'sync',
      filter: 'crypto',
      trusted: true,
    })
  })

  it('parses destroy -f', () => {
    expect(parseArgs(['destroy', '-f'], ctx)).toEqual({
      name: 'destroy',
      cwd: '/proj',
      force: true,
    })
  })

  it('throws on unknown command', () => {
    expect(() => parseArgs(['banana'], ctx)).toThrow(/Unknown command: banana/)
  })
})
