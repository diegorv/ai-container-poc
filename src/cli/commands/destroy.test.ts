import { createFakeDevcontainer } from '@/adapters/devcontainer/fake-devcontainer'
import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import { describe, expect, it } from 'vitest'
import type { CommandDeps } from '../deps'
import { destroy } from './destroy'

function buildDeps(
  docker: ReturnType<typeof createFakeDocker>,
  prompt = createScriptedPrompt([true, true]),
): CommandDeps & {
  docker: ReturnType<typeof createFakeDocker>
  logger: ReturnType<typeof createMemoryLogger>
} {
  return {
    fs: createMemoryFs(),
    docker,
    devcontainer: createFakeDevcontainer(),
    shell: createFakeShell(),
    logger: createMemoryLogger(),
    prompt,
    templatesDir: p('/tpl'),
    containerInitBundle: p('/tpl/container-init.js'),
    env: { HOME: p('/home/alice') },
    verbose: false,
  }
}

describe('destroy command', () => {
  it('is a no-op when no container matches the workspace', async () => {
    const docker = createFakeDocker()
    const deps = buildDeps(docker)
    await destroy({ cwd: '/proj' }, deps)
    expect(deps.logger.has('info', 'No devcontainer found')).toBe(true)
    expect(docker.removedContainers()).toEqual([])
  })

  it('aborts when the user declines the running-container prompt', async () => {
    const docker = createFakeDocker({
      containers: [
        {
          id: 'c1',
          image: 'sandbox',
          state: 'running',
          labels: { 'devcontainer.local_folder': '/proj' },
          mounts: [{ type: 'volume', name: 'cmdhist', destination: '/commandhistory' }],
        },
      ],
    })
    const deps = buildDeps(docker, createScriptedPrompt([false]))
    await destroy({ cwd: '/proj' }, deps)
    expect(docker.removedContainers()).toEqual([])
    expect(deps.logger.has('info', 'Aborted')).toBe(true)
  })

  it('removes container, volumes and both image variants when confirmed', async () => {
    const docker = createFakeDocker({
      containers: [
        {
          id: 'c1',
          image: 'sandbox-uid',
          state: 'exited',
          labels: { 'devcontainer.local_folder': '/proj' },
          mounts: [
            { type: 'volume', name: 'cmdhist', destination: '/commandhistory' },
            { type: 'volume', name: 'claudevol', destination: '/home/vscode/.claude' },
            { type: 'bind', source: '/h/g', destination: '/home/vscode/.gitconfig' },
          ],
        },
      ],
      volumes: [{ name: 'cmdhist' }, { name: 'claudevol' }],
      images: ['sandbox', 'sandbox-uid'],
    })
    const deps = buildDeps(docker, createScriptedPrompt([true]))
    await destroy({ cwd: '/proj' }, deps)
    expect(docker.removedContainers()).toEqual(['c1'])
    expect([...docker.removedVolumes()].sort()).toEqual(['claudevol', 'cmdhist'])
    expect([...docker.removedImages()].sort()).toEqual(['sandbox', 'sandbox-uid'])
  })

  it('skips prompts entirely when force=true', async () => {
    const docker = createFakeDocker({
      containers: [
        {
          id: 'c1',
          image: 'sandbox',
          state: 'running',
          labels: { 'devcontainer.local_folder': '/proj' },
          mounts: [],
        },
      ],
      images: ['sandbox'],
    })
    const deps = buildDeps(docker, createScriptedPrompt([]))
    await destroy({ cwd: '/proj', force: true }, deps)
    expect(docker.removedContainers()).toEqual(['c1'])
    expect(deps.prompt).toBeDefined()
  })
})
