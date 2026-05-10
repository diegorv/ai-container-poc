import { createFakeDevcontainer } from '@/adapters/devcontainer/fake-devcontainer'
import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import { describe, expect, it } from 'vitest'
import type { CommandDeps } from '../deps'
import { selfInstall } from './self-install'
import { update } from './update'
import { upgrade } from './upgrade'

function buildDeps(env: Record<string, string> = {}): CommandDeps & {
  fs: ReturnType<typeof createMemoryFs>
  shell: ReturnType<typeof createFakeShell>
  logger: ReturnType<typeof createMemoryLogger>
  devcontainer: ReturnType<typeof createFakeDevcontainer>
} {
  return {
    fs: createMemoryFs(),
    docker: createFakeDocker(),
    devcontainer: createFakeDevcontainer(),
    shell: createFakeShell(),
    logger: createMemoryLogger(),
    prompt: createScriptedPrompt(),
    templatesDir: p('/tpl'),
    env: { HOME: p('/home/alice'), ...env },
    verbose: false,
  }
}

describe('upgrade command', () => {
  it('runs claude update interactively', async () => {
    const deps = buildDeps()
    await upgrade({ cwd: '/proj' }, deps)
    expect(deps.devcontainer.execCalls).toEqual([
      { workspaceFolder: '/proj', command: ['claude', 'update'], interactive: true },
    ])
  })

  it('returns the exec exit code', async () => {
    const deps = buildDeps()
    deps.devcontainer.setNextExecExitCode(1)
    expect(await upgrade({ cwd: '/proj' }, deps)).toBe(1)
  })
})

describe('self-install command', () => {
  it('symlinks the binary into ~/.local/bin and warns when not on PATH', async () => {
    const deps = buildDeps({ PATH: '/usr/bin' })
    await selfInstall({ sourceBin: p('/srv/mydevc/dist/cli/index.js') }, deps)
    expect(await deps.fs.readlink(p('/home/alice/.local/bin/mydevc'))).toBe(
      '/srv/mydevc/dist/cli/index.js',
    )
    expect(deps.logger.has('warn', 'is not in your PATH')).toBe(true)
  })

  it('does not warn when the install dir is already in PATH', async () => {
    const deps = buildDeps({ PATH: '/home/alice/.local/bin:/usr/bin' })
    await selfInstall({ sourceBin: p('/srv/mydevc') }, deps)
    expect(deps.logger.has('warn', 'is not in your PATH')).toBe(false)
  })

  it('replaces an existing symlink (ln -sf semantics)', async () => {
    const deps = buildDeps({ PATH: '/home/alice/.local/bin' })
    await deps.fs.mkdir(p('/home/alice/.local/bin'), { recursive: true })
    await deps.fs.symlink(p('/old/path'), p('/home/alice/.local/bin/mydevc'))
    await selfInstall({ sourceBin: p('/new/path') }, deps)
    expect(await deps.fs.readlink(p('/home/alice/.local/bin/mydevc'))).toBe('/new/path')
  })
})

describe('update command', () => {
  it('reports "already up to date" when SHA does not change', async () => {
    const deps = buildDeps()
    deps.shell.setResponder((cmd, args) => {
      if (cmd !== 'git') return undefined
      if (args.includes('--is-inside-work-tree')) return { exitCode: 0 }
      if (args.includes('rev-parse')) return { exitCode: 0, stdout: 'abcdef1234567\n' }
      if (args.includes('pull')) return { exitCode: 0, stdout: 'Already up to date.\n' }
      return undefined
    })
    await update({ sourceDir: '/srv/mydevc' }, deps)
    expect(deps.logger.has('success', 'Already up to date')).toBe(true)
  })

  it('reports SHA delta when pull moved HEAD', async () => {
    let calls = 0
    const deps = buildDeps()
    deps.shell.setResponder((cmd, args) => {
      if (cmd !== 'git') return undefined
      if (args.includes('--is-inside-work-tree')) return { exitCode: 0 }
      if (args.includes('rev-parse') && args.includes('HEAD')) {
        calls++
        return { exitCode: 0, stdout: calls === 1 ? 'aaaaaaaa\n' : 'bbbbbbbb\n' }
      }
      if (args.includes('pull')) return { exitCode: 0 }
      return undefined
    })
    await update({ sourceDir: '/srv/mydevc' }, deps)
    expect(deps.logger.has('success', 'Updated from aaaaaaa to bbbbbbb')).toBe(true)
  })

  it('throws when the directory is not a git repo', async () => {
    const deps = buildDeps()
    deps.shell.setResponder((_cmd, args) => {
      if (args.includes('--is-inside-work-tree')) return { exitCode: 128, stderr: 'fatal' }
      return undefined
    })
    await expect(update({ sourceDir: '/srv/mydevc' }, deps)).rejects.toThrow(/Not a git repository/)
  })

  it('throws when git pull fails', async () => {
    const deps = buildDeps()
    deps.shell.setResponder((_cmd, args) => {
      if (args.includes('--is-inside-work-tree')) return { exitCode: 0 }
      if (args.includes('rev-parse')) return { exitCode: 0, stdout: 'sha\n' }
      if (args.includes('pull')) return { exitCode: 1, stderr: 'merge conflict' }
      return undefined
    })
    await expect(update({ sourceDir: '/srv/mydevc' }, deps)).rejects.toThrow(
      /git pull failed.*merge conflict/,
    )
  })
})
