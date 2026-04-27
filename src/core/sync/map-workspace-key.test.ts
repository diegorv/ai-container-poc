import { untrust } from '@/core/security/brand'
import { describe, expect, it } from 'vitest'
import { mapWorkspaceKey, resolveClaudeProjectsDir } from './map-workspace-key'

const ue = (v: string) => untrust(v, 'docker.config.env')
const uu = (v: string) => untrust(v, 'docker.config.user')

describe('mapWorkspaceKey', () => {
  it('rewrites -workspace to -devcontainer-<project>', () => {
    expect(mapWorkspaceKey('-workspace', 'crypto')).toBe('-devcontainer-crypto')
  })

  it('passes other keys through unchanged', () => {
    expect(mapWorkspaceKey('-Users-alice-code', 'crypto')).toBe('-Users-alice-code')
  })
})

describe('resolveClaudeProjectsDir', () => {
  it('uses CLAUDE_CONFIG_DIR when set', () => {
    expect(
      resolveClaudeProjectsDir({
        env: [ue('PATH=/usr/bin'), ue('CLAUDE_CONFIG_DIR=/home/vscode/.claude')],
        user: uu('vscode'),
      }),
    ).toBe('/home/vscode/.claude/projects')
  })

  it('falls back to /home/<user>/.claude/projects', () => {
    expect(resolveClaudeProjectsDir({ env: [], user: uu('vscode') })).toBe(
      '/home/vscode/.claude/projects',
    )
  })

  it('uses /root/.claude/projects for the root user', () => {
    expect(resolveClaudeProjectsDir({ env: [], user: uu('root') })).toBe('/root/.claude/projects')
  })

  it('uses /root/.claude/projects when user is empty', () => {
    expect(resolveClaudeProjectsDir({ env: [] })).toBe('/root/.claude/projects')
  })

  it('ignores CLAUDE_CONFIG_DIR when it points outside /home/<user> or /root', () => {
    expect(
      resolveClaudeProjectsDir({ env: [ue('CLAUDE_CONFIG_DIR=/etc')], user: uu('vscode') }),
    ).toBe('/home/vscode/.claude/projects')
    expect(
      resolveClaudeProjectsDir({ env: [ue('CLAUDE_CONFIG_DIR=/var/run')], user: uu('vscode') }),
    ).toBe('/home/vscode/.claude/projects')
  })

  it('ignores CLAUDE_CONFIG_DIR with .. segments', () => {
    expect(
      resolveClaudeProjectsDir({
        env: [ue('CLAUDE_CONFIG_DIR=/home/vscode/../../etc')],
        user: uu('vscode'),
      }),
    ).toBe('/home/vscode/.claude/projects')
  })

  it('accepts /root subpaths', () => {
    expect(
      resolveClaudeProjectsDir({ env: [ue('CLAUDE_CONFIG_DIR=/root/.claude')], user: uu('root') }),
    ).toBe('/root/.claude/projects')
  })

  it('rejects user with .. and falls back to /root', () => {
    expect(resolveClaudeProjectsDir({ env: [], user: uu('..') })).toBe('/root/.claude/projects')
    expect(resolveClaudeProjectsDir({ env: [], user: uu('foo/../etc') })).toBe(
      '/root/.claude/projects',
    )
  })

  it('rejects user with path separators or unusual chars', () => {
    expect(resolveClaudeProjectsDir({ env: [], user: uu('foo/bar') })).toBe(
      '/root/.claude/projects',
    )
    expect(resolveClaudeProjectsDir({ env: [], user: uu('foo bar') })).toBe(
      '/root/.claude/projects',
    )
    expect(resolveClaudeProjectsDir({ env: [], user: uu('foo\0bar') })).toBe(
      '/root/.claude/projects',
    )
  })
})
