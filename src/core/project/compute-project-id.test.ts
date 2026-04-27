import { p } from '@/test-utils/path'
import { describe, expect, it } from 'vitest'
import { operatorPath } from '../security/path'
import { computeProjectId } from './compute-project-id'

describe('computeProjectId', () => {
  it('uses basename for project name and full path for label', () => {
    const id = computeProjectId(p('/Users/alice/code/my-project'))
    expect(id.projectName).toBe('my-project')
    expect(id.containerLabel).toBe('devcontainer.local_folder=/Users/alice/code/my-project')
    expect(id.workspaceFolder).toBe('/Users/alice/code/my-project')
  })

  it('relies on AbsolutePath construction to reject relative paths', () => {
    // The brand makes it impossible to construct without going through
    // operatorPath / literalPath, both of which reject relative paths.
    expect(() => operatorPath('relative/path')).toThrow(/must be an absolute path/)
  })
})
