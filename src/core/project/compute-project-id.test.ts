import { describe, expect, it } from 'vitest'
import { computeProjectId } from './compute-project-id'

describe('computeProjectId', () => {
  it('uses basename for project name and full path for label', () => {
    const id = computeProjectId('/Users/alice/code/my-project')
    expect(id.projectName).toBe('my-project')
    expect(id.containerLabel).toBe('devcontainer.local_folder=/Users/alice/code/my-project')
    expect(id.workspaceFolder).toBe('/Users/alice/code/my-project')
  })

  it('throws on relative paths', () => {
    expect(() => computeProjectId('relative/path')).toThrow(/must be absolute/)
  })
})
