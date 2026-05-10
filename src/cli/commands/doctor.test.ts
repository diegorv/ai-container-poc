import { createFakeDevcontainer } from '@/adapters/devcontainer/fake-devcontainer'
import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { type ShellResponder, createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import { describe, expect, it } from 'vitest'
import type { CommandDeps } from '../deps'
import { doctor } from './doctor'

interface BuildOpts {
  shellResponder?: ShellResponder
  binaries?: Record<string, string>
  env?: Partial<CommandDeps['env']>
}

function buildDeps(opts: BuildOpts = {}): CommandDeps & {
  fs: ReturnType<typeof createMemoryFs>
  logger: ReturnType<typeof createMemoryLogger>
} {
  const env: CommandDeps['env'] = {
    HOME: p('/home/alice'),
    PATH: '/usr/local/bin:/usr/bin:/home/alice/.local/bin',
    SSH_AUTH_SOCK: '/tmp/ssh.sock',
    ...opts.env,
  }
  return {
    fs: createMemoryFs(),
    docker: createFakeDocker(),
    devcontainer: createFakeDevcontainer(),
    shell: createFakeShell({
      binaries: opts.binaries ?? {
        docker: '/usr/local/bin/docker',
        devcontainer: '/usr/local/bin/devcontainer',
      },
      responder: opts.shellResponder,
    }),
    logger: createMemoryLogger(),
    prompt: createScriptedPrompt(),
    templatesDir: p('/tpl'),
    containerInitBundle: p('/tpl/container-init.js'),
    env,
    verbose: false,
  }
}

const dockerOk: ShellResponder = (cmd, args) => {
  if (cmd === 'docker' && args.includes('info')) {
    return {
      stdout: JSON.stringify({
        ServerVersion: '29.0.0',
        NCPU: 8,
        MemTotal: 17_179_869_184,
        Name: 'orbstack',
      }),
      exitCode: 0,
    }
  }
  return undefined
}

describe('doctor command', () => {
  it('returns 0 when every check passes', async () => {
    const deps = buildDeps({ shellResponder: dockerOk })
    await deps.fs.mkdir(p('/home/alice'), { recursive: true })
    await deps.fs.writeFile(p('/home/alice/.gitconfig'), '[user]\n')

    const exit = await doctor({}, deps)

    expect(exit).toBe(0)
    expect(deps.logger.has('info', 'docker')).toBe(true)
    expect(deps.logger.has('info', '29.0.0')).toBe(true)
    expect(deps.logger.has('info', '8 CPU')).toBe(true)
    expect(deps.logger.has('info', '16.0 GB')).toBe(true)
    expect(deps.logger.has('info', 'orbstack')).toBe(true)
    expect(deps.logger.has('info', '/usr/local/bin/devcontainer')).toBe(true)
    expect(deps.logger.has('info', '~/.local/bin present')).toBe(true)
    expect(deps.logger.has('info', 'SSH_AUTH_SOCK=/tmp/ssh.sock')).toBe(true)
  })

  it('returns 1 when docker daemon is unreachable', async () => {
    const deps = buildDeps({
      shellResponder: (cmd) =>
        cmd === 'docker' ? { exitCode: 1, stderr: 'Cannot connect' } : undefined,
    })
    await deps.fs.mkdir(p('/home/alice'), { recursive: true })
    await deps.fs.writeFile(p('/home/alice/.gitconfig'), '[user]\n')

    const exit = await doctor({}, deps)

    expect(exit).toBe(1)
    expect(deps.logger.has('info', 'daemon not reachable')).toBe(true)
    expect(deps.logger.has('info', 'OrbStack')).toBe(true)
  })

  it('fails when devcontainer CLI is missing', async () => {
    const deps = buildDeps({
      shellResponder: dockerOk,
      // Drop devcontainer from the binaries map so which() returns null.
      binaries: { docker: '/usr/local/bin/docker' },
    })
    await deps.fs.mkdir(p('/home/alice'), { recursive: true })
    await deps.fs.writeFile(p('/home/alice/.gitconfig'), '[user]\n')

    const exit = await doctor({}, deps)

    expect(exit).toBe(1)
    expect(deps.logger.has('info', 'CLI not on PATH')).toBe(true)
    expect(deps.logger.has('info', '@devcontainers/cli')).toBe(true)
  })

  it('warns (does not fail) when ~/.gitconfig is missing', async () => {
    const deps = buildDeps({ shellResponder: dockerOk })
    // No gitconfig written.
    const exit = await doctor({}, deps)
    expect(exit).toBe(0)
    expect(deps.logger.has('info', '/home/alice/.gitconfig missing')).toBe(true)
  })

  it('warns when ~/.local/bin is not in PATH', async () => {
    const deps = buildDeps({
      shellResponder: dockerOk,
      env: { PATH: '/usr/local/bin:/usr/bin' },
    })
    await deps.fs.mkdir(p('/home/alice'), { recursive: true })
    await deps.fs.writeFile(p('/home/alice/.gitconfig'), '[user]\n')

    await doctor({}, deps)

    expect(deps.logger.has('info', 'not in PATH')).toBe(true)
    expect(deps.logger.has('info', '~/.zshrc')).toBe(true)
  })

  it('warns when SSH_AUTH_SOCK is not set', async () => {
    const deps = buildDeps({
      shellResponder: dockerOk,
      env: { SSH_AUTH_SOCK: undefined },
    })
    await deps.fs.mkdir(p('/home/alice'), { recursive: true })
    await deps.fs.writeFile(p('/home/alice/.gitconfig'), '[user]\n')

    await doctor({}, deps)

    expect(deps.logger.has('info', 'SSH_AUTH_SOCK not set')).toBe(true)
    expect(deps.logger.has('info', 'ssh-add')).toBe(true)
  })

  it('does not match a substring within a larger PATH segment', async () => {
    // `~/.local/bin-tool` must not satisfy `~/.local/bin`.
    const deps = buildDeps({
      shellResponder: dockerOk,
      env: { PATH: '/home/alice/.local/bin-tool:/usr/bin' },
    })
    await deps.fs.mkdir(p('/home/alice'), { recursive: true })
    await deps.fs.writeFile(p('/home/alice/.gitconfig'), '[user]\n')

    await doctor({}, deps)
    expect(deps.logger.has('info', 'not in PATH')).toBe(true)
  })
})
