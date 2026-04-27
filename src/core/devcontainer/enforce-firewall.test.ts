import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { describe, expect, it } from 'vitest'
import { enforceFirewall } from './enforce-firewall'

function buildDeps(opts: { exitCode?: number; stderr?: string; stdout?: string } = {}) {
  const fs = createMemoryFs()
  const docker = createFakeDocker({
    containers: [
      {
        id: 'cid-foo',
        labels: { 'devcontainer.local_folder': '/proj' },
        state: 'running',
      },
    ],
    execResponder: (inv) =>
      inv.command[0] === 'sudo' && inv.command[1] === '/opt/mydevc/setup-firewall.sh'
        ? { exitCode: opts.exitCode ?? 0, stderr: opts.stderr ?? '', stdout: opts.stdout ?? '' }
        : undefined,
  })
  return { fs, docker, logger: createMemoryLogger() }
}

describe('enforceFirewall', () => {
  it('is a no-op when no firewall allowlist is present', async () => {
    const deps = buildDeps()
    await enforceFirewall('/proj', deps)
    expect(deps.docker.execCalls).toHaveLength(0)
  })

  it('runs setup-firewall.sh when the allowlist is present', async () => {
    const deps = buildDeps({ stdout: 'Active with 5 destinations.' })
    await deps.fs.mkdir('/proj/.devcontainer', { recursive: true })
    await deps.fs.writeFile('/proj/.devcontainer/firewall-allowlist.txt', 'github.com\n')

    await enforceFirewall('/proj', deps)

    expect(deps.docker.execCalls).toEqual([
      {
        idOrName: 'cid-foo',
        command: ['sudo', '/opt/mydevc/setup-firewall.sh'],
        user: undefined,
        env: undefined,
      },
    ])
  })

  it('stops the container and throws when the firewall script fails', async () => {
    const deps = buildDeps({ exitCode: 1, stderr: 'iptables: command not found' })
    await deps.fs.mkdir('/proj/.devcontainer', { recursive: true })
    await deps.fs.writeFile('/proj/.devcontainer/firewall-allowlist.txt', 'github.com\n')

    await expect(enforceFirewall('/proj', deps)).rejects.toThrow(/setup-firewall.sh failed/)
    const after = await deps.docker.inspectContainer('cid-foo')
    expect(after.state).toBe('exited')
  })

  it('throws when no container exists for the workspace', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/proj/.devcontainer', { recursive: true })
    await fs.writeFile('/proj/.devcontainer/firewall-allowlist.txt', 'github.com\n')
    const deps = {
      fs,
      docker: createFakeDocker(),
      logger: createMemoryLogger(),
    }
    await expect(enforceFirewall('/proj', deps)).rejects.toThrow(/no container was found/)
  })
})
