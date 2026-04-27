import { untrust, untrustRecord } from '@/core/security/brand'
import { CliError } from '@/lib/cli-error'
import type { ContainerInfo, Docker, DockerExecResult } from '@/ports/docker'
import type { Shell } from '@/ports/shell'
import {
  type DockerInspectContainer,
  DockerInspectContainerArraySchema,
  type DockerInspectVolume,
  DockerInspectVolumeArraySchema,
} from '@/schemas/docker-inspect'

function parseInspectContainersJson(stdout: string): DockerInspectContainer[] {
  // The daemon's contract is "always an array" — but a corrupt or
  // unexpected response should fail with a useful message at the
  // boundary, not as `undefined.Id` at a call site.
  const raw = JSON.parse(stdout)
  return DockerInspectContainerArraySchema.parse(raw)
}

function parseInspectVolumesJson(stdout: string): DockerInspectVolume[] {
  const raw = JSON.parse(stdout)
  return DockerInspectVolumeArraySchema.parse(raw)
}

function inspectToInfo(c: DockerInspectContainer): ContainerInfo {
  return {
    id: c.Id,
    name: (c.Name ?? '').replace(/^\//, ''),
    image: c.Config?.Image ?? c.Image ?? '',
    labels: untrustRecord(c.Config?.Labels ?? {}, 'docker.config.labels'),
    state: c.State?.Status ?? '',
    mounts: (c.Mounts ?? []).map((m) => ({
      type: m.Type ?? '',
      name: m.Name,
      source: m.Source,
      destination: m.Destination ?? '',
    })),
    env: (c.Config?.Env ?? []).map((e) => untrust(e, 'docker.config.env')),
    user: untrust(c.Config?.User ?? '', 'docker.config.user'),
  }
}

function parseInspectContainer(json: unknown): ContainerInfo {
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error('docker inspect returned no items')
  }
  return inspectToInfo(DockerInspectContainerArraySchema.parse(json)[0] as DockerInspectContainer)
}

function check(result: DockerExecResult, action: string): void {
  if (result.exitCode !== 0) {
    throw new Error(`docker ${action} failed (exit ${result.exitCode}): ${result.stderr.trim()}`)
  }
}

export function createCliDocker(shell: Shell): Docker {
  let checked = false
  async function ensureBinary(): Promise<void> {
    if (checked) return
    if (!(await shell.which('docker'))) {
      throw new CliError('docker not found on PATH.', {
        suggestion:
          'Install Docker Desktop, OrbStack, or Colima — see https://docker.com/products/docker-desktop',
      })
    }
    checked = true
  }
  // Wrap shell.exec so every docker invocation runs ensureBinary first
  // without sprinkling the call across every method below.
  const dockerExec = async (args: string[]): Promise<DockerExecResult> => {
    await ensureBinary()
    return shell.exec('docker', args)
  }
  return {
    async listContainers(filter) {
      const args = ['ps', '--format', '{{.ID}}']
      if (filter?.all !== false) args.splice(1, 0, '-a')
      if (filter?.label) args.push('--filter', `label=${filter.label}`)
      const list = await dockerExec(args)
      check(list, 'ps')
      const ids = list.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (ids.length === 0) return []
      const inspect = await dockerExec(['inspect', ...ids])
      check(inspect, 'inspect')
      return parseInspectContainersJson(inspect.stdout).map(inspectToInfo)
    },

    async inspectContainer(idOrName) {
      const r = await dockerExec(['inspect', idOrName])
      check(r, 'inspect')
      return parseInspectContainer(JSON.parse(r.stdout))
    },

    async stopContainer(id) {
      const r = await dockerExec(['stop', id])
      check(r, 'stop')
    },

    async removeContainer(id, options) {
      const args = ['rm']
      if (options?.force) args.push('-f')
      if (options?.volumes) args.push('-v')
      args.push(id)
      const r = await dockerExec(args)
      check(r, 'rm')
    },

    async listVolumes(filter) {
      const args = ['volume', 'ls', '--format', '{{.Name}}']
      if (filter?.name) args.push('--filter', `name=${filter.name}`)
      if (filter?.label) args.push('--filter', `label=${filter.label}`)
      const ls = await dockerExec(args)
      check(ls, 'volume ls')
      const names = ls.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (names.length === 0) return []
      const inspect = await dockerExec(['volume', 'inspect', ...names])
      check(inspect, 'volume inspect')
      return parseInspectVolumesJson(inspect.stdout).map((v) => ({
        name: v.Name,
        labels: v.Labels ?? {},
      }))
    },

    async removeVolume(name, options) {
      const args = ['volume', 'rm']
      if (options?.force) args.push('-f')
      args.push(name)
      const r = await dockerExec(args)
      check(r, 'volume rm')
    },

    async imageExists(name) {
      const r = await dockerExec(['image', 'inspect', name])
      return r.exitCode === 0
    },

    async removeImage(name, options) {
      const args = ['rmi']
      if (options?.force) args.push('-f')
      args.push(name)
      const r = await dockerExec(args)
      check(r, 'rmi')
    },

    async cp({ source, dest }) {
      // `--` separates positional args from flags so a hostile source/dest
      // starting with `-` cannot be re-interpreted as a docker cp flag.
      const r = await dockerExec(['cp', '--', source, dest])
      check(r, 'cp')
    },

    async exec(idOrName, command, options) {
      const args = ['exec']
      if (options?.user) args.push('--user', options.user)
      for (const [k, v] of Object.entries(options?.env ?? {})) {
        args.push('--env', `${k}=${v}`)
      }
      args.push(idOrName, ...command)
      const r = await dockerExec(args)
      return r
    },
  }
}

// Re-exported for tests / introspection.
export type { DockerInspectContainer, DockerInspectVolume }
