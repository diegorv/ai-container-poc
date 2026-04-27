import type { ContainerInfo, Docker, DockerExecResult, VolumeInfo } from '@/ports/docker'
import type { Shell } from '@/ports/shell'

interface DockerInspectContainer {
  Id: string
  Name?: string
  Config?: { Image?: string; Labels?: Record<string, string> | null }
  Image?: string
  State?: { Status?: string }
}

interface DockerInspectVolume {
  Name: string
  Labels?: Record<string, string> | null
}

function parseJsonLines<T>(stdout: string): T[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T)
}

function parseInspectContainer(json: unknown): ContainerInfo {
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error('docker inspect returned no items')
  }
  const c = json[0] as DockerInspectContainer
  return {
    id: c.Id,
    name: (c.Name ?? '').replace(/^\//, ''),
    image: c.Config?.Image ?? c.Image ?? '',
    labels: c.Config?.Labels ?? {},
    state: c.State?.Status ?? '',
  }
}

function parseInspectVolume(json: unknown): VolumeInfo {
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error('docker volume inspect returned no items')
  }
  const v = json[0] as DockerInspectVolume
  return { name: v.Name, labels: v.Labels ?? {} }
}

function check(result: DockerExecResult, action: string): void {
  if (result.exitCode !== 0) {
    throw new Error(`docker ${action} failed (exit ${result.exitCode}): ${result.stderr.trim()}`)
  }
}

export function createCliDocker(shell: Shell): Docker {
  return {
    async listContainers(filter) {
      const args = ['ps', '--format', '{{.ID}}']
      if (filter?.all !== false) args.splice(1, 0, '-a')
      if (filter?.label) args.push('--filter', `label=${filter.label}`)
      const list = await shell.exec('docker', args)
      check(list, 'ps')
      const ids = list.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (ids.length === 0) return []
      const inspect = await shell.exec('docker', ['inspect', ...ids])
      check(inspect, 'inspect')
      const parsed = JSON.parse(inspect.stdout) as DockerInspectContainer[]
      return parsed.map((c) => ({
        id: c.Id,
        name: (c.Name ?? '').replace(/^\//, ''),
        image: c.Config?.Image ?? c.Image ?? '',
        labels: c.Config?.Labels ?? {},
        state: c.State?.Status ?? '',
      }))
    },

    async inspectContainer(idOrName) {
      const r = await shell.exec('docker', ['inspect', idOrName])
      check(r, 'inspect')
      return parseInspectContainer(JSON.parse(r.stdout))
    },

    async stopContainer(id) {
      const r = await shell.exec('docker', ['stop', id])
      check(r, 'stop')
    },

    async removeContainer(id, options) {
      const args = ['rm']
      if (options?.force) args.push('-f')
      if (options?.volumes) args.push('-v')
      args.push(id)
      const r = await shell.exec('docker', args)
      check(r, 'rm')
    },

    async listVolumes(filter) {
      const args = ['volume', 'ls', '--format', '{{.Name}}']
      if (filter?.name) args.push('--filter', `name=${filter.name}`)
      if (filter?.label) args.push('--filter', `label=${filter.label}`)
      const ls = await shell.exec('docker', args)
      check(ls, 'volume ls')
      const names = ls.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (names.length === 0) return []
      const inspect = await shell.exec('docker', ['volume', 'inspect', ...names])
      check(inspect, 'volume inspect')
      const parsed = JSON.parse(inspect.stdout) as DockerInspectVolume[]
      return parsed.map((v) => ({ name: v.Name, labels: v.Labels ?? {} }))
    },

    async removeVolume(name, options) {
      const args = ['volume', 'rm']
      if (options?.force) args.push('-f')
      args.push(name)
      const r = await shell.exec('docker', args)
      check(r, 'volume rm')
    },

    async imageExists(name) {
      const r = await shell.exec('docker', ['image', 'inspect', name])
      return r.exitCode === 0
    },

    async removeImage(name, options) {
      const args = ['rmi']
      if (options?.force) args.push('-f')
      args.push(name)
      const r = await shell.exec('docker', args)
      check(r, 'rmi')
    },

    async cp({ source, dest }) {
      const r = await shell.exec('docker', ['cp', source, dest])
      check(r, 'cp')
    },

    async exec(idOrName, command, options) {
      const args = ['exec']
      if (options?.user) args.push('--user', options.user)
      for (const [k, v] of Object.entries(options?.env ?? {})) {
        args.push('--env', `${k}=${v}`)
      }
      args.push(idOrName, ...command)
      const r = await shell.exec('docker', args)
      return r
    },
  }
}

// Re-exported for tests / introspection.
export type { DockerInspectContainer, DockerInspectVolume }
export { parseInspectContainer, parseInspectVolume, parseJsonLines }
