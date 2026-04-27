import { createFakeDevcontainer } from '@/adapters/devcontainer/fake-devcontainer'
import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { describe, expect, it } from 'vitest'
import type { CommandDeps } from '../deps'
import { validate } from './validate'

function buildDeps(): CommandDeps & {
  fs: ReturnType<typeof createMemoryFs>
  logger: ReturnType<typeof createMemoryLogger>
} {
  return {
    fs: createMemoryFs(),
    docker: createFakeDocker(),
    devcontainer: createFakeDevcontainer(),
    shell: createFakeShell(),
    logger: createMemoryLogger(),
    prompt: createScriptedPrompt(),
    templatesDir: '/tpl',
    env: { HOME: '/home/alice' },
  }
}

describe('validate command', () => {
  it('errors when no devcontainer.json exists', async () => {
    await expect(validate({ cwd: '/proj' }, buildDeps())).rejects.toThrow(/No devcontainer\.json/)
  })

  it('errors with parser context when JSON is malformed', async () => {
    const deps = buildDeps()
    await deps.fs.mkdir('/proj/.devcontainer', { recursive: true })
    await deps.fs.writeFile('/proj/.devcontainer/devcontainer.json', '{ not json')
    await expect(validate({ cwd: '/proj' }, deps)).rejects.toThrow(/not valid JSON/)
  })

  it('errors when runArgs contains SYS_ADMIN', async () => {
    const deps = buildDeps()
    await deps.fs.mkdir('/proj/.devcontainer', { recursive: true })
    await deps.fs.writeFile(
      '/proj/.devcontainer/devcontainer.json',
      JSON.stringify({ runArgs: ['--cap-add=SYS_ADMIN'] }),
    )
    await expect(validate({ cwd: '/proj' }, deps)).rejects.toThrow(/SYS_ADMIN/)
  })

  it('reports schema issues when fields have wrong types', async () => {
    const deps = buildDeps()
    await deps.fs.mkdir('/proj/.devcontainer', { recursive: true })
    await deps.fs.writeFile(
      '/proj/.devcontainer/devcontainer.json',
      JSON.stringify({ runArgs: 'should be array', mounts: 42 }),
    )
    await expect(validate({ cwd: '/proj' }, deps)).rejects.toThrow(/schema validation/)
  })

  it('logs success on a valid devcontainer.json', async () => {
    const deps = buildDeps()
    await deps.fs.mkdir('/proj/.devcontainer', { recursive: true })
    await deps.fs.writeFile(
      '/proj/.devcontainer/devcontainer.json',
      JSON.stringify({ name: 'sandbox', runArgs: ['--cap-add=NET_ADMIN'] }),
    )
    await validate({ cwd: '/proj' }, deps)
    expect(deps.logger.has('success', 'is valid')).toBe(true)
  })
})
