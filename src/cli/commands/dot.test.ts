import { createFakeDevcontainer } from '@/adapters/devcontainer/fake-devcontainer'
import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { describe, expect, it } from 'vitest'
import type { CommandDeps } from '../deps'
import { dot } from './dot'

describe('dot command', () => {
  it('runs template then up against the same workspace folder', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/tpl', { recursive: true })
    await fs.writeFile('/tpl/Dockerfile', 'FROM x\n')
    await fs.writeFile(
      '/tpl/devcontainer.json',
      JSON.stringify({ name: 'sandbox', runArgs: ['--cap-add=NET_ADMIN'] }),
    )
    await fs.writeFile('/tpl/.zshrc', 'PS1=$\n')
    await fs.mkdir('/proj', { recursive: true })

    const devcontainer = createFakeDevcontainer()
    const deps: CommandDeps = {
      fs,
      docker: createFakeDocker(),
      devcontainer,
      shell: createFakeShell(),
      logger: createMemoryLogger(),
      prompt: createScriptedPrompt(),
      templatesDir: '/tpl',
      env: { HOME: '/home/alice' },
    }

    await dot({ cwd: '/proj' }, deps)

    expect(await fs.exists('/proj/.devcontainer/Dockerfile')).toBe(true)
    expect(devcontainer.upCalls).toEqual([{ workspaceFolder: '/proj' }])
  })
})
