import { describe, expect, it } from 'vitest'
import { mapWorkspaceKey, resolveClaudeProjectsDir } from './map-workspace-key'

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
        env: ['PATH=/usr/bin', 'CLAUDE_CONFIG_DIR=/home/vscode/.claude'],
        user: 'vscode',
      }),
    ).toBe('/home/vscode/.claude/projects')
  })

  it('falls back to /home/<user>/.claude/projects', () => {
    expect(resolveClaudeProjectsDir({ env: [], user: 'vscode' })).toBe(
      '/home/vscode/.claude/projects',
    )
  })

  it('uses /root/.claude/projects for the root user', () => {
    expect(resolveClaudeProjectsDir({ env: [], user: 'root' })).toBe('/root/.claude/projects')
  })

  it('uses /root/.claude/projects when user is empty', () => {
    expect(resolveClaudeProjectsDir({ env: [] })).toBe('/root/.claude/projects')
  })
})
