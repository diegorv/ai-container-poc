import { createFakeDevcontainer } from '@/adapters/devcontainer/fake-devcontainer'
import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { describe, expect, it } from 'vitest'
import type { CommandDeps } from '../deps'
import { down } from './down'
import { exec } from './exec'
import { rebuild } from './rebuild'
import { shell } from './shell'
import { up } from './up'

interface BuildOptions {
  containers?: Parameters<typeof createFakeDocker>[0]
}

function buildDeps(opts: BuildOptions = {}): CommandDeps & {
  fs: ReturnType<typeof createMemoryFs>
  logger: ReturnType<typeof createMemoryLogger>
  devcontainer: ReturnType<typeof createFakeDevcontainer>
  docker: ReturnType<typeof createFakeDocker>
} {
  return {
    fs: createMemoryFs(),
    docker: createFakeDocker(opts.containers),
    devcontainer: createFakeDevcontainer(),
    shell: createFakeShell(),
    logger: createMemoryLogger(),
    prompt: createScriptedPrompt(),
    templatesDir: '/tpl',
    env: { HOME: '/home/alice' },
  }
}

describe('up', () => {
  it('calls devcontainer.up when devcontainer.json is absent', async () => {
    const deps = buildDeps()
    await up({ cwd: '/proj' }, deps)
    expect(deps.devcontainer.upCalls).toEqual([{ workspaceFolder: '/proj' }])
  })

  it('refuses to start when SYS_ADMIN is in runArgs', async () => {
    const deps = buildDeps()
    await deps.fs.mkdir('/proj/.devcontainer', { recursive: true })
    await deps.fs.writeFile(
      '/proj/.devcontainer/devcontainer.json',
      JSON.stringify({ runArgs: ['--cap-add=SYS_ADMIN'] }),
    )
    await expect(up({ cwd: '/proj' }, deps)).rejects.toThrow(/SYS_ADMIN/)
    expect(deps.devcontainer.upCalls).toHaveLength(0)
  })
})

describe('rebuild', () => {
  it('passes removeExistingContainer=true', async () => {
    const deps = buildDeps()
    await rebuild({ cwd: '/proj' }, deps)
    expect(deps.devcontainer.upCalls).toEqual([
      { workspaceFolder: '/proj', removeExistingContainer: true },
    ])
  })
})

describe('down', () => {
  it('stops every container matching the workspace label', async () => {
    const deps = buildDeps({
      containers: {
        containers: [
          { id: 'c1', labels: { 'devcontainer.local_folder': '/proj' } },
          { id: 'c2', labels: { 'devcontainer.local_folder': '/other' } },
        ],
      },
    })
    await down({ cwd: '/proj' }, deps)
    const c1 = await deps.docker.inspectContainer('c1')
    expect(c1.state).toBe('exited')
    const c2 = await deps.docker.inspectContainer('c2')
    expect(c2.state).toBe('running')
  })

  it('warns and exits cleanly when nothing matches', async () => {
    const deps = buildDeps()
    await down({ cwd: '/proj' }, deps)
    expect(deps.logger.has('warn', 'No running devcontainer')).toBe(true)
  })
})

describe('shell', () => {
  it('forwards interactive zsh to devcontainer.exec', async () => {
    const deps = buildDeps()
    await shell({ cwd: '/proj' }, deps)
    expect(deps.devcontainer.execCalls).toEqual([
      { workspaceFolder: '/proj', command: ['zsh'], interactive: true },
    ])
  })

  it('returns the exec exit code', async () => {
    const deps = buildDeps()
    deps.devcontainer.setNextExecExitCode(2)
    expect(await shell({ cwd: '/proj' }, deps)).toBe(2)
  })
})

describe('exec', () => {
  it('forwards the user command interactively', async () => {
    const deps = buildDeps()
    await exec({ cwd: '/proj', command: ['ls', '-la'] }, deps)
    expect(deps.devcontainer.execCalls).toEqual([
      { workspaceFolder: '/proj', command: ['ls', '-la'], interactive: true },
    ])
  })

  it('throws when no command is given', async () => {
    const deps = buildDeps()
    await expect(exec({ cwd: '/proj', command: [] }, deps)).rejects.toThrow(/missing command/)
  })
})
