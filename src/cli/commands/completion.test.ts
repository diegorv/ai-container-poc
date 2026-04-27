import { describe, expect, it } from 'vitest'
import { completion } from './completion'

describe('completion command', () => {
  it('emits a bash completion script with the command list', () => {
    const out = completion({ shell: 'bash' })
    expect(out).toContain('_mydevc_complete')
    expect(out).toContain('complete -F _mydevc_complete mydevc')
    expect(out).toContain('template')
    expect(out).toContain('destroy')
    expect(out).toContain('--secure')
  })

  it('emits a zsh completion with #compdef header', () => {
    const out = completion({ shell: 'zsh' })
    expect(out).toContain('#compdef mydevc')
    expect(out).toContain('compdef _mydevc mydevc')
    expect(out).toContain('template')
  })

  it('emits fish per-subcommand completions', () => {
    const out = completion({ shell: 'fish' })
    expect(out).toContain('__fish_use_subcommand')
    expect(out).toContain('__fish_seen_subcommand_from')
    expect(out).toContain('mydevc')
  })

  it('throws CliError on unknown shell', () => {
    expect(() => completion({ shell: 'powershell' as never })).toThrow(/Unknown shell/)
  })
})
