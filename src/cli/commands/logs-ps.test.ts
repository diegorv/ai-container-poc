import { createFakeDevcontainer } from '@/adapters/devcontainer/fake-devcontainer'
import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import { describe, expect, it } from 'vitest'
import type { CommandDeps } from '../deps'
import { logs } from './logs'
import { ps } from './ps'

function buildDeps(
  docker: ReturnType<typeof createFakeDocker> = createFakeDocker(),
): CommandDeps & {
  docker: ReturnType<typeof createFakeDocker>
  shell: ReturnType<typeof createFakeShell>
  logger: ReturnType<typeof createMemoryLogger>
} {
  return {
    fs: createMemoryFs(),
    docker,
    devcontainer: createFakeDevcontainer(),
    shell: createFakeShell(),
    logger: createMemoryLogger(),
    prompt: createScriptedPrompt(),
    templatesDir: p('/tpl'),
    env: { HOME: p('/home/alice') },
  }
}

describe('logs command', () => {
  it('errors when no container exists for the workspace', async () => {
    const deps = buildDeps()
    await expect(logs({ cwd: '/proj' }, deps)).rejects.toThrow(/No devcontainer found/)
  })

  it('runs `docker logs <id>` for a snapshot read', async () => {
    const docker = createFakeDocker({
      containers: [{ id: 'cid1', labels: { 'devcontainer.local_folder': '/proj' } }],
    })
    const deps = buildDeps(docker)
    deps.shell.setResponder(() => ({ exitCode: 0 }))
    await logs({ cwd: '/proj' }, deps)
    expect(deps.shell.calls).toEqual([
      expect.objectContaining({ command: 'docker', args: ['logs', 'cid1'], interactive: true }),
    ])
  })

  it('passes --follow and --tail through', async () => {
    const docker = createFakeDocker({
      containers: [{ id: 'cid1', labels: { 'devcontainer.local_folder': '/proj' } }],
    })
    const deps = buildDeps(docker)
    deps.shell.setResponder(() => ({ exitCode: 0 }))
    await logs({ cwd: '/proj', follow: true, tail: 100 }, deps)
    expect(deps.shell.calls.at(-1)).toMatchObject({
      command: 'docker',
      args: ['logs', '--follow', '--tail', '100', 'cid1'],
    })
  })
})

describe('ps command', () => {
  it('reports nothing when no devcontainers exist', async () => {
    const deps = buildDeps()
    await ps({}, deps)
    expect(deps.logger.has('info', 'No devcontainers found')).toBe(true)
  })

  it('lists every labelled container as one aligned row', async () => {
    const docker = createFakeDocker({
      containers: [
        {
          id: 'aaaaaaaaaaaa1234',
          state: 'running',
          image: 'vsc-crypto',
          labels: { 'devcontainer.local_folder': '/Users/alice/code/crypto' },
        },
        {
          id: 'bbbbbbbbbbbb5678',
          state: 'exited',
          image: 'vsc-sandbox',
          labels: { 'devcontainer.local_folder': '/Users/alice/code/sandbox' },
        },
      ],
    })
    const deps = buildDeps(docker)
    await ps({}, deps)
    expect(deps.logger.has('info', 'PROJECT')).toBe(true)
    expect(deps.logger.has('info', 'crypto')).toBe(true)
    expect(deps.logger.has('info', 'sandbox')).toBe(true)
    expect(deps.logger.has('info', 'aaaaaaaaaaaa')).toBe(true)
    expect(deps.logger.has('info', 'vsc-crypto')).toBe(true)
  })
})
