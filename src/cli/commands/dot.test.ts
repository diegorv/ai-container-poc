import { createFakeDevcontainer } from '@/adapters/devcontainer/fake-devcontainer'
import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import { describe, expect, it } from 'vitest'
import type { CommandDeps } from '../deps'
import { dot } from './dot'

describe('dot command', () => {
  it('runs template then up against the same workspace folder', async () => {
    const fs = createMemoryFs()
    await fs.mkdir(p('/tpl'), { recursive: true })
    await fs.writeFile(p('/tpl/Dockerfile'), 'FROM x\n')
    await fs.writeFile(
      p('/tpl/devcontainer.json'),
      JSON.stringify({ name: 'sandbox', runArgs: ['--cap-add=NET_ADMIN'] }),
    )
    await fs.writeFile(p('/tpl/.zshrc'), 'PS1=$\n')
    await fs.writeFile(p('/tpl/post-install-bootstrap.sh'), '#!/usr/bin/env bash\n')
    await fs.writeFile(p('/tpl/setup-firewall.sh'), '#!/usr/bin/env bash\n')
    await fs.writeFile(p('/tpl/chown-managed.sh'), '#!/usr/bin/env bash\n')
    await fs.writeFile(p('/tpl/sudoers.mydevc'), '# sudoers\n')
    await fs.writeFile(p('/tpl/.dockerignore'), '.git\n')
    await fs.mkdir(p('/proj'), { recursive: true })

    const devcontainer = createFakeDevcontainer()
    const deps: CommandDeps = {
      fs,
      docker: createFakeDocker(),
      devcontainer,
      shell: createFakeShell(),
      logger: createMemoryLogger(),
      prompt: createScriptedPrompt(),
      templatesDir: p('/tpl'),
      env: { HOME: p('/home/alice') },
      verbose: false,
    }

    await dot({ cwd: '/proj' }, deps)

    expect(await fs.exists(p('/proj/.devcontainer/Dockerfile'))).toBe(true)
    expect(devcontainer.upCalls).toEqual([{ workspaceFolder: '/proj' }])
  })
})
