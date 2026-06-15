import { describe, expect, it } from 'vitest'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { p } from '@/test-utils/path'
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
    templatesDir: p('/tpl'),
    containerInitBundle: p('/tpl/container-init.js'),
    env: { HOME: p('/home/alice') },
    verbose: false,
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

const TEMPLATE_FIREWALL = '# allowlist\napi.anthropic.com\ngithub.com\n'
const CONTAINER_INIT_BUNDLE = '#!/usr/bin/env node\nconsole.log("init")\n'

function seedTemplates(fs: ReturnType<typeof createMemoryFs>): void {
  fs.writeFile(p('/tpl/Dockerfile'), TEMPLATE_DOCKERFILE)
  fs.writeFile(p('/tpl/devcontainer.json'), TEMPLATE_DEVCONTAINER)
  fs.writeFile(p('/tpl/.zshrc'), TEMPLATE_ZSHRC)
  fs.writeFile(p('/tpl/firewall-allowlist.txt'), TEMPLATE_FIREWALL)
  fs.writeFile(p('/tpl/post-install-bootstrap.sh'), '#!/usr/bin/env bash\n')
  fs.writeFile(p('/tpl/setup-firewall.sh'), '#!/usr/bin/env bash\n')
  fs.writeFile(p('/tpl/chown-managed.sh'), '#!/usr/bin/env bash\n')
  fs.writeFile(p('/tpl/sudoers.mydevc'), '# sudoers\n')
  fs.writeFile(p('/tpl/.dockerignore'), '.git\n')
  fs.writeFile(p('/tpl/container-init.js'), CONTAINER_INIT_BUNDLE)
}

describe('template command', () => {
  it('creates .devcontainer/ with the three template files on a fresh project', async () => {
    const fs = createMemoryFs()
    await fs.mkdir(p('/proj'), { recursive: true })
    await fs.mkdir(p('/tpl'), { recursive: true })
    seedTemplates(fs)
    const deps = buildDeps(fs)

    await template({ cwd: '/proj' }, deps)

    expect(await fs.readFile(p('/proj/.devcontainer/Dockerfile'))).toBe(TEMPLATE_DOCKERFILE)
    expect(await fs.readFile(p('/proj/.devcontainer/.zshrc'))).toBe(TEMPLATE_ZSHRC)
    expect(JSON.parse(await fs.readFile(p('/proj/.devcontainer/devcontainer.json'))).name).toBe(
      'Sandbox',
    )
  })

  it('aborts when overwrite is rejected and leaves files intact', async () => {
    const fs = createMemoryFs()
    await fs.mkdir(p('/tpl'), { recursive: true })
    seedTemplates(fs)
    await fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await fs.writeFile(p('/proj/.devcontainer/devcontainer.json'), '{"name":"old"}')

    const deps = buildDeps(fs)
    deps.prompt = createScriptedPrompt([false])

    await template({ cwd: '/proj' }, deps)

    expect(JSON.parse(await fs.readFile(p('/proj/.devcontainer/devcontainer.json'))).name).toBe(
      'old',
    )
  })

  it('preserves custom mounts across overwrite when force=true', async () => {
    const fs = createMemoryFs()
    await fs.mkdir(p('/tpl'), { recursive: true })
    seedTemplates(fs)
    await fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    const existing = {
      name: 'old',
      mounts: [
        'source=/h/old,target=/commandhistory,type=volume',
        'source=/h/data,target=/data,type=bind',
      ],
    }
    await fs.writeFile(p('/proj/.devcontainer/devcontainer.json'), JSON.stringify(existing))

    const deps = buildDeps(fs)
    await template({ cwd: '/proj', force: true }, deps)

    const after = JSON.parse(await fs.readFile(p('/proj/.devcontainer/devcontainer.json')))
    // Template's managed mounts come back as-is.
    expect(after.mounts).toContain('source=cmdhist,target=/commandhistory,type=volume')
    // Custom mount was preserved.
    expect(after.mounts).toContain('source=/h/data,target=/data,type=bind')
  })

  it('does not copy firewall-allowlist.txt by default', async () => {
    const fs = createMemoryFs()
    await fs.mkdir(p('/proj'), { recursive: true })
    await fs.mkdir(p('/tpl'), { recursive: true })
    seedTemplates(fs)
    await template({ cwd: '/proj' }, buildDeps(fs))
    expect(await fs.exists(p('/proj/.devcontainer/firewall-allowlist.txt'))).toBe(false)
  })

  it('copies firewall-allowlist.txt when secure=true', async () => {
    const fs = createMemoryFs()
    await fs.mkdir(p('/proj'), { recursive: true })
    await fs.mkdir(p('/tpl'), { recursive: true })
    seedTemplates(fs)
    await template({ cwd: '/proj', secure: true }, buildDeps(fs))
    expect(await fs.readFile(p('/proj/.devcontainer/firewall-allowlist.txt'))).toBe(
      TEMPLATE_FIREWALL,
    )
  })

  it('copies the mydevc-init bundle into .devcontainer/dist/container-init/', async () => {
    const fs = createMemoryFs()
    await fs.mkdir(p('/proj'), { recursive: true })
    await fs.mkdir(p('/tpl'), { recursive: true })
    seedTemplates(fs)
    await template({ cwd: '/proj' }, buildDeps(fs))
    // Dockerfile's `COPY dist/container-init/index.js` resolves
    // against .devcontainer/ as the build context.
    expect(await fs.readFile(p('/proj/.devcontainer/dist/container-init/index.js'))).toBe(
      CONTAINER_INIT_BUNDLE,
    )
  })

  it('throws a CliError when the bundle is missing', async () => {
    const fs = createMemoryFs()
    await fs.mkdir(p('/proj'), { recursive: true })
    await fs.mkdir(p('/tpl'), { recursive: true })
    seedTemplates(fs)
    // Remove just the bundle to simulate a not-yet-built repo.
    await fs.remove(p('/tpl/container-init.js'))
    await expect(template({ cwd: '/proj' }, buildDeps(fs))).rejects.toThrow(
      /mydevc-init bundle not found/,
    )
  })
})
