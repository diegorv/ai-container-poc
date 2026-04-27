import { createFakeDocker } from '@/adapters/docker/fake-docker'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'
import { p } from '@/test-utils/path'
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
  return { fs, docker, logger: createMemoryLogger(), home: p('/home/alice') }
}

describe('enforceFirewall', () => {
  it('is a no-op when no firewall allowlist is present', async () => {
    const deps = buildDeps()
    await enforceFirewall(p('/proj'), deps)
    expect(deps.docker.execCalls).toHaveLength(0)
    expect(deps.docker.cpCalls).toHaveLength(0)
  })

  it('snapshots the allowlist to host and pushes it into the container', async () => {
    const deps = buildDeps({ stdout: 'Active with 2 destinations.' })
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(
      p('/proj/.devcontainer/firewall-allowlist.txt'),
      '# header\ngithub.com\napi.anthropic.com\n',
    )

    await enforceFirewall(p('/proj'), deps)

    // Host snapshot was written, sanitised, and chmod'd to 0o600.
    const snapshotKeys = Object.keys(deps.fs.snapshot()).filter((k) =>
      k.includes('/home/alice/.mydevc/firewalls/'),
    )
    expect(snapshotKeys).toHaveLength(1)
    const snapshotContent = await deps.fs.readFile(p(snapshotKeys[0] ?? ''))
    expect(snapshotContent).toContain('github.com\n')
    expect(snapshotContent).toContain('api.anthropic.com\n')
    expect(snapshotContent).not.toContain('# header')

    // docker cp pushed the snapshot to /etc/mydevc/firewall-allowlist.txt.
    expect(deps.docker.cpCalls).toEqual([
      {
        source: snapshotKeys[0],
        dest: 'cid-foo:/etc/mydevc/firewall-allowlist.txt',
      },
    ])

    // setup-firewall.sh is invoked with the in-container snapshot path,
    // not the workspace path the container could mutate.
    const script = deps.docker.execCalls.find((c) => c.command[0] === 'sudo')
    expect(script?.command).toEqual([
      'sudo',
      '/opt/mydevc/setup-firewall.sh',
      '/etc/mydevc/firewall-allowlist.txt',
    ])
  })

  it('refuses to apply the firewall when any line is invalid', async () => {
    const deps = buildDeps()
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(
      p('/proj/.devcontainer/firewall-allowlist.txt'),
      'github.com\nevil.com; iptables -F\n',
    )

    await expect(enforceFirewall(p('/proj'), deps)).rejects.toThrow(/Refusing to apply firewall/)
    // Nothing was pushed and nothing was exec'd against the container.
    expect(deps.docker.cpCalls).toHaveLength(0)
    expect(deps.docker.execCalls).toHaveLength(0)
  })

  it('stops the container and throws when the firewall script fails', async () => {
    const deps = buildDeps({ exitCode: 1, stderr: 'iptables: command not found' })
    await deps.fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await deps.fs.writeFile(p('/proj/.devcontainer/firewall-allowlist.txt'), 'github.com\n')

    await expect(enforceFirewall(p('/proj'), deps)).rejects.toThrow(/setup-firewall.sh failed/)
    const after = await deps.docker.inspectContainer('cid-foo')
    expect(after.state).toBe('exited')
  })

  it('throws when no container exists for the workspace', async () => {
    const fs = createMemoryFs()
    await fs.mkdir(p('/proj/.devcontainer'), { recursive: true })
    await fs.writeFile(p('/proj/.devcontainer/firewall-allowlist.txt'), 'github.com\n')
    const deps = {
      fs,
      docker: createFakeDocker(),
      logger: createMemoryLogger(),
      home: p('/home/alice'),
    }
    await expect(enforceFirewall(p('/proj'), deps)).rejects.toThrow(/no container was found/)
  })
})
