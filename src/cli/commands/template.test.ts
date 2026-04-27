import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { describe, expect, it } from 'vitest'
import type { CommandDeps } from '../deps'
import { template } from './template'

function buildDeps(fs: ReturnType<typeof createMemoryFs>): CommandDeps {
  return {
    fs,
    docker: {} as never,
    devcontainer: {} as never,
    shell: {} as never,
    logger: createMemoryLogger(),
    prompt: createScriptedPrompt(),
    templatesDir: '/tpl',
    env: { HOME: '/home/alice' },
  }
}

const TEMPLATE_DOCKERFILE = 'FROM ubuntu:24.04\n'
const TEMPLATE_DEVCONTAINER = JSON.stringify({
  name: 'Sandbox',
  mounts: [
    'source=cmdhist,target=/commandhistory,type=volume',
    'source=claudevol,target=/home/vscode/.claude,type=volume',
  ],
})
const TEMPLATE_ZSHRC = 'export PS1="$ "\n'

function seedTemplates(fs: ReturnType<typeof createMemoryFs>): void {
  fs.writeFile('/tpl/Dockerfile', TEMPLATE_DOCKERFILE)
  fs.writeFile('/tpl/devcontainer.json', TEMPLATE_DEVCONTAINER)
  fs.writeFile('/tpl/.zshrc', TEMPLATE_ZSHRC)
}

describe('template command', () => {
  it('creates .devcontainer/ with the three template files on a fresh project', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/proj', { recursive: true })
    await fs.mkdir('/tpl', { recursive: true })
    seedTemplates(fs)
    const deps = buildDeps(fs)

    await template({ cwd: '/proj' }, deps)

    expect(await fs.readFile('/proj/.devcontainer/Dockerfile')).toBe(TEMPLATE_DOCKERFILE)
    expect(await fs.readFile('/proj/.devcontainer/.zshrc')).toBe(TEMPLATE_ZSHRC)
    expect(JSON.parse(await fs.readFile('/proj/.devcontainer/devcontainer.json')).name).toBe(
      'Sandbox',
    )
  })

  it('aborts when overwrite is rejected and leaves files intact', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/tpl', { recursive: true })
    seedTemplates(fs)
    await fs.mkdir('/proj/.devcontainer', { recursive: true })
    await fs.writeFile('/proj/.devcontainer/devcontainer.json', '{"name":"old"}')

    const deps = buildDeps(fs)
    deps.prompt = createScriptedPrompt([false])

    await template({ cwd: '/proj' }, deps)

    expect(JSON.parse(await fs.readFile('/proj/.devcontainer/devcontainer.json')).name).toBe('old')
  })

  it('preserves custom mounts across overwrite when force=true', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/tpl', { recursive: true })
    seedTemplates(fs)
    await fs.mkdir('/proj/.devcontainer', { recursive: true })
    const existing = {
      name: 'old',
      mounts: [
        'source=/h/old,target=/commandhistory,type=volume',
        'source=/h/data,target=/data,type=bind',
      ],
    }
    await fs.writeFile('/proj/.devcontainer/devcontainer.json', JSON.stringify(existing))

    const deps = buildDeps(fs)
    await template({ cwd: '/proj', force: true }, deps)

    const after = JSON.parse(await fs.readFile('/proj/.devcontainer/devcontainer.json'))
    // Template's managed mounts come back as-is.
    expect(after.mounts).toContain('source=cmdhist,target=/commandhistory,type=volume')
    // Custom mount was preserved.
    expect(after.mounts).toContain('source=/h/data,target=/data,type=bind')
  })
})
