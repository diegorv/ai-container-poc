import { describe, expect, it } from 'vitest'
import { parseArgs, parseGlobalFlags } from './parser'

const ctx = { cwd: '/proj' }

describe('parseArgs', () => {
  it('returns help for empty argv', () => {
    expect(parseArgs([], ctx)).toEqual({ name: 'help' })
  })

  it('maps "." to dot command in cwd', () => {
    expect(parseArgs(['.'], ctx)).toEqual({
      name: 'dot',
      cwd: '/proj',
      force: false,
      secure: false,
    })
  })

  it('parses dot --secure', () => {
    expect(parseArgs(['.', '--secure'], ctx)).toEqual({
      name: 'dot',
      cwd: '/proj',
      force: false,
      secure: true,
    })
  })

  it('parses template with -f flag', () => {
    expect(parseArgs(['template', '-f', '/elsewhere'], ctx)).toEqual({
      name: 'template',
      cwd: '/elsewhere',
      force: true,
      secure: false,
    })
  })

  it('parses template --secure', () => {
    expect(parseArgs(['template', '--secure'], ctx)).toEqual({
      name: 'template',
      cwd: '/proj',
      force: false,
      secure: true,
    })
  })

  it('treats template . as cwd', () => {
    expect(parseArgs(['template', '.'], ctx)).toEqual({
      name: 'template',
      cwd: '/proj',
      force: false,
      secure: false,
    })
  })

  it('parses exec with arbitrary command tail', () => {
    expect(parseArgs(['exec', 'ls', '-la'], ctx)).toEqual({
      name: 'exec',
      cwd: '/proj',
      command: ['ls', '-la'],
    })
  })

  it('strips a leading -- from exec command (matches install.sh:824)', () => {
    expect(parseArgs(['exec', '--', 'ls', '-la'], ctx)).toEqual({
      name: 'exec',
      cwd: '/proj',
      command: ['ls', '-la'],
    })
  })

  it('only strips one leading -- from exec', () => {
    expect(parseArgs(['exec', '--', '--', 'echo', 'hi'], ctx)).toEqual({
      name: 'exec',
      cwd: '/proj',
      command: ['--', 'echo', 'hi'],
    })
  })

  it('parses mount with readonly flag', () => {
    expect(parseArgs(['mount', '/h/data', '/data', '--readonly'], ctx)).toEqual({
      name: 'mount',
      hostPath: '/h/data',
      containerPath: '/data',
      readonly: true,
      allowDangerous: false,
      cwd: '/proj',
    })
  })

  it('parses mount with --allow-dangerous flag', () => {
    expect(parseArgs(['mount', '/var/run/docker.sock', '/sock', '--allow-dangerous'], ctx)).toEqual(
      {
        name: 'mount',
        hostPath: '/var/run/docker.sock',
        containerPath: '/sock',
        readonly: false,
        allowDangerous: true,
        cwd: '/proj',
      },
    )
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

  it('parses info', () => {
    expect(parseArgs(['info'], ctx)).toEqual({ name: 'info', cwd: '/proj', json: false })
  })

  it('parses info --json', () => {
    expect(parseArgs(['info', '--json'], ctx)).toEqual({
      name: 'info',
      cwd: '/proj',
      json: true,
    })
  })

  it('parses clean with multiple selection flags', () => {
    expect(parseArgs(['clean', '--volumes', '--images', '--dry-run'], ctx)).toEqual({
      name: 'clean',
      cwd: '/proj',
      container: false,
      volumes: true,
      images: true,
      cache: false,
      force: false,
      dryRun: true,
    })
  })

  it('parses clean -f for unattended runs', () => {
    expect(parseArgs(['clean', '--container', '-f'], ctx)).toEqual({
      name: 'clean',
      cwd: '/proj',
      container: true,
      volumes: false,
      images: false,
      cache: false,
      force: true,
      dryRun: false,
    })
  })

  it('throws on unknown command', () => {
    expect(() => parseArgs(['banana'], ctx)).toThrow(/Unknown command: banana/)
  })
})

describe('parseGlobalFlags', () => {
  it('strips --verbose and reports verbose', () => {
    expect(parseGlobalFlags(['up', '--verbose', '/proj'])).toEqual({
      argv: ['up', '/proj'],
      verbosity: 'verbose',
    })
  })

  it('strips -q and reports quiet', () => {
    expect(parseGlobalFlags(['-q', 'destroy'])).toEqual({
      argv: ['destroy'],
      verbosity: 'quiet',
    })
  })

  it('verbose wins when both are passed', () => {
    expect(parseGlobalFlags(['--quiet', '--verbose', 'up']).verbosity).toBe('verbose')
  })

  it('returns "normal" when neither is set', () => {
    expect(parseGlobalFlags(['up']).verbosity).toBe('normal')
  })
})
