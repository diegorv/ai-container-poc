import { createFakeDevcontainer } from '@/adapters/devcontainer/fake-devcontainer'
import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { describe, expect, it } from 'vitest'
import type { CommandDeps } from '../deps'
import { clean } from './clean'

function buildDeps(
  docker: ReturnType<typeof createFakeDocker> = createFakeDocker(),
  prompt = createScriptedPrompt([true]),
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
    prompt,
    templatesDir: '/tpl',
    env: { HOME: '/home/alice' },
  }
}

const fullProject = () =>
  createFakeDocker({
    containers: [
      {
        id: 'c1',
        name: 'cool',
        image: 'sandbox-uid',
        state: 'running',
        labels: { 'devcontainer.local_folder': '/proj' },
        mounts: [
          { type: 'volume', name: 'cmdhist', destination: '/commandhistory' },
          { type: 'volume', name: 'claudevol', destination: '/home/vscode/.claude' },
        ],
      },
    ],
    volumes: [{ name: 'cmdhist' }, { name: 'claudevol' }],
    images: ['sandbox', 'sandbox-uid'],
  })

describe('clean command', () => {
  it('errors when no flag is selected', async () => {
    const deps = buildDeps()
    await expect(clean({ cwd: '/proj' }, deps)).rejects.toThrow(/pick at least one/)
  })

  it('reports nothing to clean when no resources match', async () => {
    const deps = buildDeps()
    await clean({ cwd: '/proj', container: true, volumes: true, images: true }, deps)
    expect(deps.logger.has('info', 'Nothing to clean')).toBe(true)
  })

  it('--volumes removes only the docker volumes, leaves container/images', async () => {
    const docker = fullProject()
    const deps = buildDeps(docker)
    await clean({ cwd: '/proj', volumes: true, force: true }, deps)
    expect([...docker.removedVolumes()].sort()).toEqual(['claudevol', 'cmdhist'])
    expect(docker.removedContainers()).toEqual([])
    expect(docker.removedImages()).toEqual([])
  })

  it('--images removes both base and -uid variants, leaves container/volumes', async () => {
    const docker = fullProject()
    const deps = buildDeps(docker)
    await clean({ cwd: '/proj', images: true, force: true }, deps)
    expect([...docker.removedImages()].sort()).toEqual(['sandbox', 'sandbox-uid'])
    expect(docker.removedContainers()).toEqual([])
    expect(docker.removedVolumes()).toEqual([])
  })

  it('--container removes the container only and stops it first when running', async () => {
    const docker = fullProject()
    const deps = buildDeps(docker)
    await clean({ cwd: '/proj', container: true, force: true }, deps)
    expect(docker.removedContainers()).toEqual(['c1'])
    expect(docker.removedVolumes()).toEqual([])
    expect(docker.removedImages()).toEqual([])
  })

  it('--cache runs docker builder prune', async () => {
    const deps = buildDeps()
    let captured: string[] = []
    deps.shell.setResponder((cmd, args) => {
      if (cmd === 'docker') {
        captured = args
        return { exitCode: 0 }
      }
      return undefined
    })
    await clean({ cwd: '/proj', cache: true, force: true }, deps)
    expect(captured).toEqual(['builder', 'prune', '-f'])
  })

  it('--dry-run lists what would be removed without doing it', async () => {
    const docker = fullProject()
    const deps = buildDeps(docker)
    await clean({ cwd: '/proj', container: true, volumes: true, dryRun: true }, deps)
    expect(deps.logger.has('info', 'Dry run')).toBe(true)
    expect(docker.removedContainers()).toEqual([])
    expect(docker.removedVolumes()).toEqual([])
  })

  it('aborts when prompt is declined', async () => {
    const docker = fullProject()
    const deps = buildDeps(docker, createScriptedPrompt([false]))
    await clean({ cwd: '/proj', volumes: true }, deps)
    expect(docker.removedVolumes()).toEqual([])
    expect(deps.logger.has('info', 'Aborted')).toBe(true)
  })
})
