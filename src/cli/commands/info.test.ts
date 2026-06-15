import { describe, expect, it } from 'vitest'
import { createFakeDevcontainer } from '@/adapters/devcontainer/fake-devcontainer'
import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { p } from '@/test-utils/path'
import type { CommandDeps } from '../deps'
import { info } from './info'

function buildDeps(
  docker: ReturnType<typeof createFakeDocker> = createFakeDocker(),
): CommandDeps & {
  fs: ReturnType<typeof createMemoryFs>
  docker: ReturnType<typeof createFakeDocker>
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
    containerInitBundle: p('/tpl/container-init.js'),
    env: { HOME: p('/home/alice') },
    verbose: false,
  }
}

describe('info command', () => {
  it('warns when .devcontainer/ is missing', async () => {
    const deps = buildDeps()
    await info({ cwd: '/proj' }, deps)
    expect(deps.logger.has('warn', 'No .devcontainer/')).toBe(true)
    expect(deps.logger.has('info', 'mydevc template')).toBe(true)
  })

  it('warns when devcontainer exists but no container is running', async () => {
    const deps = buildDeps()
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(p('/proj/.devcontainer/devcontainer.json'), '{}')
    await info({ cwd: '/proj' }, deps)
    expect(deps.logger.has('warn', 'No devcontainer found')).toBe(true)
  })

  it('reports container state, image, and volumes', async () => {
    const docker = createFakeDocker({
      containers: [
        {
          id: 'abc123def4567',
          name: 'focused_einstein',
          image: 'vsc-crypto',
          state: 'running',
          labels: { 'devcontainer.local_folder': '/proj' },
          mounts: [
            { type: 'volume', name: 'cmdhist', destination: '/commandhistory' },
            { type: 'volume', name: 'claudevol', destination: '/home/vscode/.claude' },
            { type: 'bind', source: '/h/g', destination: '/home/vscode/.gitconfig' },
          ],
        },
      ],
    })
    const deps = buildDeps(docker)
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(p('/proj/.devcontainer/devcontainer.json'), '{}')

    await info({ cwd: '/proj' }, deps)

    expect(deps.logger.has('info', 'focused_einstein')).toBe(true)
    expect(deps.logger.has('info', 'abc123def456')).toBe(true)
    expect(deps.logger.has('info', 'running')).toBe(true)
    expect(deps.logger.has('info', 'Volumes (2)')).toBe(true)
    expect(deps.logger.has('info', 'cmdhist')).toBe(true)
    expect(deps.logger.has('info', 'claudevol')).toBe(true)
  })

  it('detects the -uid image variant', async () => {
    const docker = createFakeDocker({
      containers: [
        {
          id: 'cid',
          image: 'vsc-crypto',
          labels: { 'devcontainer.local_folder': '/proj' },
          state: 'exited',
        },
      ],
      images: ['vsc-crypto', 'vsc-crypto-uid'],
    })
    const deps = buildDeps(docker)
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(p('/proj/.devcontainer/devcontainer.json'), '{}')
    await info({ cwd: '/proj' }, deps)
    expect(deps.logger.has('info', '-uid')).toBe(true)
  })

  it('returns a JSON string when --json is passed (no logger output)', async () => {
    const docker = createFakeDocker({
      containers: [
        {
          id: 'abc123def4567',
          name: 'cool',
          image: 'vsc-crypto-uid',
          state: 'running',
          labels: { 'devcontainer.local_folder': '/proj' },
          mounts: [{ type: 'volume', name: 'cmdhist', destination: '/commandhistory' }],
        },
      ],
      images: ['vsc-crypto', 'vsc-crypto-uid'],
    })
    const deps = buildDeps(docker)
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(
      p('/proj/.devcontainer/devcontainer.json'),
      JSON.stringify({ mounts: ['source=/h/data,target=/data,type=bind'] }),
    )
    const out = await info({ cwd: '/proj', json: true }, deps)
    expect(out).toBeTypeOf('string')
    const parsed = JSON.parse(out as string)
    expect(parsed.projectName).toBe('proj')
    expect(parsed.container.id).toBe('abc123def4567')
    expect(parsed.container.image).toBe('vsc-crypto')
    expect(parsed.container.hasUidImageVariant).toBe(true)
    expect(parsed.container.volumes).toEqual(['cmdhist'])
    expect(parsed.customMounts).toEqual(['source=/h/data,target=/data,type=bind'])
    // Logger stays silent when --json so the JSON on stdout is the only output.
    expect(deps.logger.messages).toHaveLength(0)
  })

  it('lists custom mounts from devcontainer.json', async () => {
    const docker = createFakeDocker({
      containers: [
        {
          id: 'cid',
          labels: { 'devcontainer.local_folder': '/proj' },
          state: 'running',
        },
      ],
    })
    const deps = buildDeps(docker)
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(
      p('/proj/.devcontainer/devcontainer.json'),
      JSON.stringify({
        mounts: [
          'source=cmdhist,target=/commandhistory,type=volume',
          'source=/h/data,target=/data,type=bind',
        ],
      }),
    )
    await info({ cwd: '/proj' }, deps)
    expect(deps.logger.has('info', 'Custom mounts (1)')).toBe(true)
    expect(deps.logger.has('info', 'source=/h/data,target=/data,type=bind')).toBe(true)
  })

  it('reports firewall = not configured when allowlist is absent', async () => {
    const deps = buildDeps()
    // Need .devcontainer/ for the rest of the summary to render — the
    // firewall line lives at the bottom of the body, not the early-out.
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(p('/proj/.devcontainer/devcontainer.json'), '{}')
    await info({ cwd: '/proj' }, deps)
    expect(deps.logger.has('info', 'Firewall:        not configured')).toBe(true)
  })

  it('reports firewall = active and counts entries', async () => {
    const deps = buildDeps()
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(
      p('/proj/.devcontainer/firewall-allowlist.txt'),
      [
        '# allowlist',
        'api.anthropic.com',
        'github.com',
        '',
        '# inline comment dropped',
        'registry.npmjs.org   # node deps',
      ].join('\n'),
    )
    await info({ cwd: '/proj' }, deps)
    expect(deps.logger.has('info', 'Firewall:        active (3 hosts allowlisted)')).toBe(true)
  })

  it('exposes firewall status in --json', async () => {
    const deps = buildDeps()
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(p('/proj/.devcontainer/firewall-allowlist.txt'), 'api.anthropic.com\n')
    const out = await info({ cwd: '/proj', json: true }, deps)
    const parsed = JSON.parse(out as string)
    expect(parsed.firewall).toEqual({
      configured: true,
      entryCount: 1,
      allowlistPath: '/proj/.devcontainer/firewall-allowlist.txt',
    })
  })
})
