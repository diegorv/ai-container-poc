import { describe, expect, it } from 'vitest'
import { requiresGitRepo } from './check-git-repo'

// `\${localWorkspaceFolder}` / `\${localEnv:...}` are the literal
// devcontainer variables, not JS template placeholders — hence the
// escapes (and template literals, to keep biome's noTemplateCurlyInString
// rule meaningful for genuine mistakes).
describe('requiresGitRepo', () => {
  it('is false when there are no mounts', () => {
    expect(requiresGitRepo({})).toBe(false)
    expect(requiresGitRepo({ mounts: [] })).toBe(false)
  })

  it('is true for the template .git/config bind mount', () => {
    expect(
      requiresGitRepo({
        mounts: [
          `source=\${localWorkspaceFolder}/.git/config,target=/workspace/.git/config,type=bind,readonly`,
        ],
      }),
    ).toBe(true)
  })

  it('is true for the template .git/hooks bind mount', () => {
    expect(
      requiresGitRepo({
        mounts: [
          `source=\${localWorkspaceFolder}/.git/hooks,target=/workspace/.git/hooks,type=bind,readonly`,
        ],
      }),
    ).toBe(true)
  })

  it('is true for an object-form .git bind mount', () => {
    expect(
      requiresGitRepo({
        mounts: [
          { source: `\${localWorkspaceFolder}/.git`, target: '/workspace/.git', type: 'bind' },
        ],
      }),
    ).toBe(true)
  })

  it('is false for non-git workspace mounts', () => {
    expect(
      requiresGitRepo({
        mounts: [
          `source=\${localWorkspaceFolder}/node_modules,target=/workspace/node_modules,type=bind`,
          `source=\${localEnv:HOME}/.gitconfig,target=/home/vscode/.gitconfig,type=bind,readonly`,
        ],
      }),
    ).toBe(false)
  })

  it('does not match a sibling like .github', () => {
    expect(
      requiresGitRepo({
        mounts: [`source=\${localWorkspaceFolder}/.github,target=/workspace/.github,type=bind`],
      }),
    ).toBe(false)
  })

  it('ignores a .git volume mount (no host bind source)', () => {
    expect(
      requiresGitRepo({
        mounts: ['source=somevol,target=/workspace/.git,type=volume'],
      }),
    ).toBe(false)
  })

  it('ignores malformed mounts', () => {
    expect(requiresGitRepo({ mounts: ['this is not a valid mount'] })).toBe(false)
  })
})
