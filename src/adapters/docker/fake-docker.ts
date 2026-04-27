import type { ContainerInfo, Docker, DockerExecResult, VolumeInfo } from '@/ports/docker'

export interface FakeContainerSeed {
  id: string
  name?: string
  image?: string
  labels?: Record<string, string>
  state?: string
}

export interface FakeVolumeSeed {
  name: string
  labels?: Record<string, string>
}

export interface FakeDockerCpInvocation {
  source: string
  dest: string
}

export interface FakeDockerExecInvocation {
  idOrName: string
  command: string[]
  user?: string
  env?: Record<string, string>
}

export type FakeExecResponder = (
  inv: FakeDockerExecInvocation,
) => Partial<DockerExecResult> | undefined

export interface FakeDockerOptions {
  containers?: FakeContainerSeed[]
  volumes?: FakeVolumeSeed[]
  images?: string[]
  execResponder?: FakeExecResponder
}

export interface FakeDocker extends Docker {
  readonly cpCalls: readonly FakeDockerCpInvocation[]
  readonly execCalls: readonly FakeDockerExecInvocation[]
  addContainer(c: FakeContainerSeed): void
  addVolume(v: FakeVolumeSeed): void
  addImage(name: string): void
  removedContainers(): readonly string[]
  removedVolumes(): readonly string[]
  removedImages(): readonly string[]
}

function seedToInfo(seed: FakeContainerSeed): ContainerInfo {
  return {
    id: seed.id,
    name: seed.name ?? seed.id,
    image: seed.image ?? '',
    labels: seed.labels ?? {},
    state: seed.state ?? 'running',
  }
}

function seedToVolume(seed: FakeVolumeSeed): VolumeInfo {
  return { name: seed.name, labels: seed.labels ?? {} }
}

export function createFakeDocker(opts: FakeDockerOptions = {}): FakeDocker {
  const containers = new Map<string, ContainerInfo>()
  const volumes = new Map<string, VolumeInfo>()
  const images = new Set<string>(opts.images ?? [])
  const cpCalls: FakeDockerCpInvocation[] = []
  const execCalls: FakeDockerExecInvocation[] = []
  const removedContainers: string[] = []
  const removedVolumes: string[] = []
  const removedImages: string[] = []
  const responder = opts.execResponder ?? (() => undefined)

  for (const c of opts.containers ?? []) containers.set(c.id, seedToInfo(c))
  for (const v of opts.volumes ?? []) volumes.set(v.name, seedToVolume(v))

  function matchesLabel(labels: Record<string, string>, expr: string | undefined): boolean {
    if (!expr) return true
    const eqIdx = expr.indexOf('=')
    if (eqIdx === -1) return Object.prototype.hasOwnProperty.call(labels, expr)
    const key = expr.slice(0, eqIdx)
    const value = expr.slice(eqIdx + 1)
    return labels[key] === value
  }

  return {
    cpCalls,
    execCalls,

    addContainer(c) {
      containers.set(c.id, seedToInfo(c))
    },
    addVolume(v) {
      volumes.set(v.name, seedToVolume(v))
    },
    addImage(name) {
      images.add(name)
    },
    removedContainers: () => removedContainers,
    removedVolumes: () => removedVolumes,
    removedImages: () => removedImages,

    async listContainers(filter) {
      return [...containers.values()].filter((c) => matchesLabel(c.labels, filter?.label))
    },

    async inspectContainer(idOrName) {
      const c =
        containers.get(idOrName) ?? [...containers.values()].find((x) => x.name === idOrName)
      if (!c) throw new Error(`fake-docker: container "${idOrName}" not found`)
      return c
    },

    async stopContainer(id) {
      const c = containers.get(id)
      if (!c) throw new Error(`fake-docker: container "${id}" not found`)
      containers.set(id, { ...c, state: 'exited' })
    },

    async removeContainer(id, _options) {
      if (!containers.has(id)) {
        throw new Error(`fake-docker: container "${id}" not found`)
      }
      containers.delete(id)
      removedContainers.push(id)
    },

    async listVolumes(filter) {
      return [...volumes.values()].filter((v) => {
        if (filter?.name && !v.name.includes(filter.name)) return false
        if (filter?.label && !matchesLabel(v.labels, filter.label)) return false
        return true
      })
    },

    async removeVolume(name, _options) {
      if (!volumes.has(name)) {
        throw new Error(`fake-docker: volume "${name}" not found`)
      }
      volumes.delete(name)
      removedVolumes.push(name)
    },

    async imageExists(name) {
      return images.has(name)
    },

    async removeImage(name, _options) {
      if (!images.has(name)) {
        throw new Error(`fake-docker: image "${name}" not found`)
      }
      images.delete(name)
      removedImages.push(name)
    },

    async cp({ source, dest }) {
      cpCalls.push({ source, dest })
    },

    async exec(idOrName, command, options) {
      const inv: FakeDockerExecInvocation = {
        idOrName,
        command,
        user: options?.user,
        env: options?.env,
      }
      execCalls.push(inv)
      const matched = responder(inv)
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
        ...(matched ?? {}),
      }
    },
  }
}
