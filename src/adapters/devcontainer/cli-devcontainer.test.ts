import { createFakeShell } from '@/adapters/shell/fake-shell'
import { describe, expect, it } from 'vitest'
import { createCliDevcontainer } from './cli-devcontainer'

const WITH_BIN = { devcontainer: '/usr/local/bin/devcontainer' }

describe('cli-devcontainer via fake-shell', () => {
  it('passes workspace-folder and parses container id from last JSON line', async () => {
    let capturedArgs: readonly string[] = []
    const shell = createFakeShell({
      binaries: WITH_BIN,
      responder: (cmd, args) => {
        if (cmd === 'devcontainer') {
          capturedArgs = args
          return {
            stdout: 'building...\n{"outcome":"success","containerId":"abc123"}\n',
            exitCode: 0,
          }
        }
        return undefined
      },
    })
    const dc = createCliDevcontainer(shell)
    const result = await dc.up({ workspaceFolder: '/proj' })
    expect(capturedArgs).toEqual(['up', '--workspace-folder', '/proj'])
    expect(result.containerId).toBe('abc123')
  })

  it('passes --remove-existing-container when requested', async () => {
    let capturedArgs: readonly string[] = []
    const shell = createFakeShell({
      binaries: WITH_BIN,
      responder: (cmd, args) => {
        if (cmd === 'devcontainer') {
          capturedArgs = args
          return { stdout: '{"outcome":"success","containerId":"x"}', exitCode: 0 }
        }
        return undefined
      },
    })
    const dc = createCliDevcontainer(shell)
    await dc.up({ workspaceFolder: '/proj', removeExistingContainer: true })
    expect(capturedArgs).toEqual([
      'up',
      '--workspace-folder',
      '/proj',
      '--remove-existing-container',
    ])
  })

  it('throws when devcontainer up exits non-zero', async () => {
    const shell = createFakeShell({
      binaries: WITH_BIN,
      responder: () => ({ exitCode: 2, stderr: 'oops' }),
    })
    const dc = createCliDevcontainer(shell)
    await expect(dc.up({ workspaceFolder: '/proj' })).rejects.toThrow(
      /devcontainer up failed.*oops/,
    )
  })

  it('throws CliError with a suggestion when the binary is missing', async () => {
    const shell = createFakeShell({
      // No binaries registered → which() returns null.
      responder: () => ({ exitCode: 0 }),
    })
    const dc = createCliDevcontainer(shell)
    await expect(dc.up({ workspaceFolder: '/proj' })).rejects.toThrow(/devcontainer CLI not found/)
  })

  it('exec interactive uses execInteractive on shell', async () => {
    const shell = createFakeShell({
      binaries: WITH_BIN,
      responder: () => ({ exitCode: 0 }),
    })
    const dc = createCliDevcontainer(shell)
    const r = await dc.exec({
      workspaceFolder: '/proj',
      command: ['zsh'],
      interactive: true,
    })
    expect(r.exitCode).toBe(0)
    expect(shell.calls.at(-1)).toMatchObject({
      command: 'devcontainer',
      args: ['exec', '--workspace-folder', '/proj', 'zsh'],
      interactive: true,
    })
  })
})
