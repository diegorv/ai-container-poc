import { createFakeDevcontainer } from '@/adapters/devcontainer/fake-devcontainer'
import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import { describe, expect, it } from 'vitest'
import type { CommandDeps } from '../deps'
import { cp } from './cp'
import { mount } from './mount'

function buildDeps(): CommandDeps & {
  fs: ReturnType<typeof createMemoryFs>
  docker: ReturnType<typeof createFakeDocker>
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
    env: { HOME: p('/home/alice') },
    verbose: false,
  }
}

describe('mount command', () => {
  it('writes the new bind mount and recreates the container', async () => {
    const deps = buildDeps()
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(
      p('/proj/.devcontainer/devcontainer.json'),
      JSON.stringify({ name: 'sandbox', mounts: [] }),
    )
    await deps.fs.mkdir(p('/h/data'), { recursive: true })

    await mount({ cwd: '/proj', hostPath: '/h/data', containerPath: '/data' }, deps)

    const after = JSON.parse(await deps.fs.readFile(p('/proj/.devcontainer/devcontainer.json')))
    expect(after.mounts).toContain('source=/h/data,target=/data,type=bind')
    expect(deps.devcontainer.upCalls).toEqual([
      { workspaceFolder: '/proj', removeExistingContainer: true },
    ])
  })

  it('rejects when devcontainer.json is missing', async () => {
    const deps = buildDeps()
    await expect(
      mount({ cwd: '/proj', hostPath: '/x', containerPath: '/y' }, deps),
    ).rejects.toThrow(/No devcontainer\.json/)
  })

  it('rejects when host path does not exist', async () => {
    const deps = buildDeps()
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(
      p('/proj/.devcontainer/devcontainer.json'),
      JSON.stringify({ name: 'sandbox' }),
    )
    await expect(
      mount({ cwd: '/proj', hostPath: '/missing', containerPath: '/data' }, deps),
    ).rejects.toThrow(/Host path does not exist/)
  })

  it('rejects mounting the Docker socket without --allow-dangerous', async () => {
    const deps = buildDeps()
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(
      p('/proj/.devcontainer/devcontainer.json'),
      JSON.stringify({ name: 'sandbox' }),
    )
    await deps.fs.mkdir(p('/var/run'), { recursive: true })
    await deps.fs.writeFile(p('/var/run/docker.sock'), '')

    await expect(
      mount({ cwd: '/proj', hostPath: '/var/run/docker.sock', containerPath: '/sock' }, deps),
    ).rejects.toThrow(/Refusing to mount/)
  })

  it('allows the Docker socket when --allow-dangerous is set', async () => {
    const deps = buildDeps()
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(
      p('/proj/.devcontainer/devcontainer.json'),
      JSON.stringify({ name: 'sandbox', mounts: [] }),
    )
    await deps.fs.mkdir(p('/var/run'), { recursive: true })
    await deps.fs.writeFile(p('/var/run/docker.sock'), '')

    await mount(
      {
        cwd: '/proj',
        hostPath: '/var/run/docker.sock',
        containerPath: '/sock',
        allowDangerous: true,
      },
      deps,
    )
    const after = JSON.parse(await deps.fs.readFile(p('/proj/.devcontainer/devcontainer.json')))
    expect(after.mounts).toContain('source=/var/run/docker.sock,target=/sock,type=bind')
  })
})

describe('cp command', () => {
  it('runs docker cp from the running container to the host', async () => {
    const deps = buildDeps()
    deps.docker = createFakeDocker({
      containers: [
        {
          id: 'cid1',
          state: 'running',
          labels: { 'devcontainer.local_folder': '/proj' },
        },
      ],
    })
    await cp({ cwd: '/proj', containerPath: '/workspace/foo', hostPath: '/host/out' }, deps)
    expect(deps.docker.cpCalls).toEqual([{ source: 'cid1:/workspace/foo', dest: '/host/out' }])
  })

  it('errors when no container is found', async () => {
    const deps = buildDeps()
    await expect(cp({ cwd: '/proj', containerPath: '/x', hostPath: '/y' }, deps)).rejects.toThrow(
      /No running devcontainer/,
    )
  })

  it('rejects a containerPath that starts with -', async () => {
    const deps = buildDeps()
    await expect(
      cp({ cwd: '/proj', containerPath: '--archive', hostPath: '/host/out' }, deps),
    ).rejects.toThrow(/starts with '-'/)
  })

  it('rejects a hostPath that starts with -', async () => {
    const deps = buildDeps()
    await expect(
      cp({ cwd: '/proj', containerPath: '/workspace/foo', hostPath: '-rf' }, deps),
    ).rejects.toThrow(/starts with '-'/)
  })

  it('rejects a hostPath that contains ..', async () => {
    const deps = buildDeps()
    await expect(
      cp({ cwd: '/proj', containerPath: '/workspace/foo', hostPath: '../../etc/passwd' }, deps),
    ).rejects.toThrow(/contains '\.\.'/)
  })

  it('rejects a hostPath with .. in the middle', async () => {
    const deps = buildDeps()
    await expect(
      cp(
        { cwd: '/proj', containerPath: '/workspace/foo', hostPath: '/host/sub/../../escape' },
        deps,
      ),
    ).rejects.toThrow(/contains '\.\.'/)
  })

  it('does not reject a hostPath with .. inside a filename', async () => {
    const deps = buildDeps()
    deps.docker = createFakeDocker({
      containers: [
        { id: 'cid1', state: 'running', labels: { 'devcontainer.local_folder': '/proj' } },
      ],
    })
    await cp({ cwd: '/proj', containerPath: '/workspace/foo', hostPath: '/host/file..bak' }, deps)
    expect(deps.docker.cpCalls).toEqual([
      { source: 'cid1:/workspace/foo', dest: '/host/file..bak' },
    ])
  })
})
