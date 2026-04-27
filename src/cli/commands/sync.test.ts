import { createFakeDevcontainer } from '@/adapters/devcontainer/fake-devcontainer'
import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { createScriptedPrompt } from '@/adapters/prompt/scripted-prompt'
import { createFakeShell } from '@/adapters/shell/fake-shell'
import { describe, expect, it } from 'vitest'
import type { CommandDeps } from '../deps'
import { sync } from './sync'

const TMP = '/tmp/sync-test'

interface SyncFakeOpts {
  /** Map of "source -> { destPath: content }" used to populate after docker cp. */
  cpResponses: Record<string, Record<string, string>>
}

function buildSyncDeps(opts: SyncFakeOpts): CommandDeps & {
  fs: ReturnType<typeof createMemoryFs>
  docker: ReturnType<typeof createFakeDocker>
  logger: ReturnType<typeof createMemoryLogger>
} {
  const fs = createMemoryFs()
  const shell = createFakeShell({
    responder: (cmd, args) => {
      if (cmd === 'mktemp' && args[0] === '-d') {
        return { stdout: `${TMP}\n`, exitCode: 0 }
      }
      return undefined
    },
  })
  const docker = createFakeDocker({
    containers: [
      {
        id: 'cid-crypto',
        labels: { 'devcontainer.local_folder': '/Users/alice/code/crypto' },
        state: 'running',
        env: ['CLAUDE_CONFIG_DIR=/home/vscode/.claude'],
        user: 'vscode',
      },
    ],
    cpHandler: async ({ source, dest }) => {
      const seeded = opts.cpResponses[source]
      if (!seeded) return
      // dest like `${TMP}/`. Strip trailing slash for join.
      const root = dest.endsWith('/') ? dest.slice(0, -1) : dest
      for (const [rel, content] of Object.entries(seeded)) {
        await fs.mkdir(
          `${root}${rel.includes('/') ? `/${rel.split('/').slice(0, -1).join('/')}` : ''}`,
          {
            recursive: true,
          },
        )
        await fs.writeFile(`${root}/${rel}`, content)
      }
    },
  })
  return {
    fs,
    docker,
    devcontainer: createFakeDevcontainer(),
    shell,
    logger: createMemoryLogger(),
    prompt: createScriptedPrompt([true]),
    templatesDir: '/tpl',
    env: { HOME: '/home/alice' },
  }
}

describe('sync command', () => {
  it('throws when no devcontainers are present', async () => {
    const deps: CommandDeps = {
      fs: createMemoryFs(),
      docker: createFakeDocker(),
      devcontainer: createFakeDevcontainer(),
      shell: createFakeShell(),
      logger: createMemoryLogger(),
      prompt: createScriptedPrompt([true]),
      templatesDir: '/tpl',
      env: { HOME: '/home/alice' },
    }
    await expect(sync({ trusted: true }, deps)).rejects.toThrow(/No devcontainers found/)
  })

  it('aborts when the trust prompt is declined', async () => {
    const deps = buildSyncDeps({ cpResponses: {} })
    deps.prompt = createScriptedPrompt([false])
    await sync({}, deps)
    expect(deps.docker.cpCalls).toEqual([])
  })

  it('rewrites -workspace key to -devcontainer-<name> on the host', async () => {
    const deps = buildSyncDeps({
      cpResponses: {
        'cid-crypto:/home/vscode/.claude/projects/.': {
          '-workspace/sess1.jsonl': '{"a":1}',
        },
      },
    })
    await sync({ trusted: true }, deps)
    expect(
      await deps.fs.readFile('/home/alice/.claude/projects/-devcontainer-crypto/sess1.jsonl'),
    ).toBe('{"a":1}')
  })

  it('preserves non-workspace project keys verbatim', async () => {
    const deps = buildSyncDeps({
      cpResponses: {
        'cid-crypto:/home/vscode/.claude/projects/.': {
          '-Users-alice-code-other/sess.jsonl': '{}',
        },
      },
    })
    await sync({ trusted: true }, deps)
    expect(
      await deps.fs.readFile('/home/alice/.claude/projects/-Users-alice-code-other/sess.jsonl'),
    ).toBe('{}')
  })

  it('filters by case-insensitive name substring', async () => {
    const deps = buildSyncDeps({ cpResponses: {} })
    deps.docker.addContainer({
      id: 'cid-other',
      labels: { 'devcontainer.local_folder': '/Users/alice/code/other' },
      state: 'running',
      env: [],
      user: 'vscode',
    })
    await expect(sync({ trusted: true, filter: 'banana' }, deps)).rejects.toThrow(
      /no matching devcontainers/,
    )
  })
})
