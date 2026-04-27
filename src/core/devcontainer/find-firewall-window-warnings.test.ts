import { describe, expect, it } from 'vitest'
import { findFirewallWindowWarnings } from './find-firewall-window-warnings'

describe('findFirewallWindowWarnings', () => {
  it('warns about postCreateCommand', () => {
    const out = findFirewallWindowWarnings({ postCreateCommand: 'npm install' })
    expect(out).toHaveLength(1)
    expect(out[0]?.field).toBe('postCreateCommand')
  })

  it('warns about onCreateCommand and updateContentCommand', () => {
    const out = findFirewallWindowWarnings({
      onCreateCommand: ['./bootstrap.sh'],
      updateContentCommand: 'npm ci',
    })
    expect(out.map((w) => w.field).sort()).toEqual(['onCreateCommand', 'updateContentCommand'])
  })

  it('does not warn about postStartCommand or postAttachCommand (post-firewall)', () => {
    expect(findFirewallWindowWarnings({ postStartCommand: 'echo hi' })).toEqual([])
    expect(findFirewallWindowWarnings({ postAttachCommand: 'echo hi' })).toEqual([])
  })

  it('warns about devcontainer features', () => {
    const out = findFirewallWindowWarnings({
      features: { 'ghcr.io/devcontainers/features/github-cli:1': {} },
    })
    expect(out.map((w) => w.field)).toContain('features')
  })

  it('treats an empty postCreateCommand as absent', () => {
    expect(findFirewallWindowWarnings({ postCreateCommand: '' })).toEqual([])
    expect(findFirewallWindowWarnings({ postCreateCommand: [] })).toEqual([])
    expect(findFirewallWindowWarnings({ postCreateCommand: {} })).toEqual([])
  })

  it('treats empty features map as absent', () => {
    expect(findFirewallWindowWarnings({ features: {} })).toEqual([])
  })

  it('returns nothing for an empty config', () => {
    expect(findFirewallWindowWarnings({})).toEqual([])
  })
})
