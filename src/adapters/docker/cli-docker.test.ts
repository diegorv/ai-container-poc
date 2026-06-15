import { describe, expect, it } from 'vitest'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { createCliDocker } from './cli-docker'

describe('cli-docker via fake-shell', () => {
  it('listContainers passes label filter and parses inspect output', async () => {
    const shell = createFakeShell({
      binaries: { docker: '/usr/bin/docker' },
      responder: (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'ps') {
          expect(args).toContain('--filter')
          expect(args).toContain('label=devcontainer.local_folder=/proj')
          return { stdout: 'abc123\n', exitCode: 0 }
        }
        if (cmd === 'docker' && args[0] === 'inspect') {
          return {
            stdout: JSON.stringify([
              {
                Id: 'abc123',
                Name: '/cool-name',
                Config: { Image: 'img', Labels: { foo: 'bar' } },
                State: { Status: 'running' },
              },
            ]),
            exitCode: 0,
          }
        }
        return undefined
      },
    })
    const docker = createCliDocker(shell)
    const list = await docker.listContainers({ label: 'devcontainer.local_folder=/proj' })
    expect(list).toHaveLength(1)
    const c = list[0]
    expect(c).toMatchObject({
      id: 'abc123',
      name: 'cool-name',
      image: 'img',
      state: 'running',
      mounts: [],
    })
    // Branded fields are unwrapped via .unsafe() — values match what the
    // adapter saw, the wrapper is a type-level boundary.
    expect(c?.labels.foo?.unsafe()).toBe('bar')
    expect(c?.env).toEqual([])
    expect(c?.user.unsafe()).toBe('')
  })

  it('removeContainer with force passes -f', async () => {
    const seen: (readonly string[])[] = []
    const shell = createFakeShell({
      binaries: { docker: '/usr/bin/docker' },
      responder: (cmd, args) => {
        if (cmd === 'docker') seen.push(args)
        return { stdout: '', exitCode: 0 }
      },
    })
    const docker = createCliDocker(shell)
    await docker.removeContainer('abc', { force: true })
    expect(seen).toEqual([['rm', '-f', 'abc']])
  })

  it('imageExists returns true on exit 0 and false otherwise', async () => {
    const shell = createFakeShell({
      binaries: { docker: '/usr/bin/docker' },
      responder: (_cmd, args) => {
        if (args[0] === 'image' && args[2] === 'present') {
          return { stdout: '[]', exitCode: 0 }
        }
        return { exitCode: 1, stderr: 'No such image' }
      },
    })
    const docker = createCliDocker(shell)
    expect(await docker.imageExists('present')).toBe(true)
    expect(await docker.imageExists('absent')).toBe(false)
  })

  it('exec forwards user and env flags', async () => {
    let captured: readonly string[] = []
    const shell = createFakeShell({
      binaries: { docker: '/usr/bin/docker' },
      responder: (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'exec') {
          captured = args
          return { stdout: 'ok', exitCode: 0 }
        }
        return undefined
      },
    })
    const docker = createCliDocker(shell)
    await docker.exec('container1', ['ls', '-la'], {
      user: 'vscode',
      env: { FOO: 'bar' },
    })
    expect(captured).toEqual([
      'exec',
      '--user',
      'vscode',
      '--env',
      'FOO=bar',
      'container1',
      'ls',
      '-la',
    ])
  })

  it('throws on non-zero exit with stderr context', async () => {
    const shell = createFakeShell({
      binaries: { docker: '/usr/bin/docker' },
      responder: () => ({ exitCode: 1, stderr: 'boom\n' }),
    })
    const docker = createCliDocker(shell)
    await expect(docker.stopContainer('x')).rejects.toThrow(/docker stop failed.*boom/)
  })

  it('throws CliError with a suggestion when docker is missing', async () => {
    const shell = createFakeShell({ responder: () => ({ exitCode: 0 }) })
    const docker = createCliDocker(shell)
    await expect(docker.listContainers()).rejects.toThrow(/docker not found on PATH/)
  })
})
