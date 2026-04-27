import type { Untrusted } from '@/core/security/brand'

export interface ContainerMount {
  type: 'volume' | 'bind' | string
  /** Volume name (when type === 'volume'). */
  name?: string
  /** Host source path (when type === 'bind'). */
  source?: string
  destination: string
}

/**
 * Information about a container as reported by `docker inspect`.
 *
 * Fields that originate inside the container's config (`labels`, `env`,
 * `user`) are typed as `Untrusted<S>` because the container fully
 * controls them — `containerEnv`/`runArgs --label`/`Dockerfile USER`
 * are all writeable by anything that can edit `devcontainer.json` or
 * the image. Consumers must validate via `core/security` before using
 * these in paths, commands, or filenames; see `Arch.md` § "Security
 * architecture" for the full design.
 *
 * `id`, `name`, `image`, `state`, and `mounts.*` come from the Docker
 * daemon and follow daemon-validated formats — they're plain strings.
 */
export interface ContainerInfo {
  id: string
  name: string
  image: string
  labels: Readonly<Record<string, Untrusted<'docker.config.labels'>>>
  state: string
  mounts: ContainerMount[]
  /** Raw `KEY=VALUE` env entries; container-controlled. */
  env: ReadonlyArray<Untrusted<'docker.config.env'>>
  /** `Config.User` (`Dockerfile USER` / `containerUser`); container-controlled. */
  user: Untrusted<'docker.config.user'>
}

export interface VolumeInfo {
  name: string
  labels: Record<string, string>
}

export interface DockerExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface Docker {
  listContainers(filter?: { label?: string; all?: boolean }): Promise<ContainerInfo[]>
  inspectContainer(idOrName: string): Promise<ContainerInfo>
  stopContainer(id: string): Promise<void>
  removeContainer(id: string, options?: { force?: boolean; volumes?: boolean }): Promise<void>
  listVolumes(filter?: { name?: string; label?: string }): Promise<VolumeInfo[]>
  removeVolume(name: string, options?: { force?: boolean }): Promise<void>
  imageExists(name: string): Promise<boolean>
  removeImage(name: string, options?: { force?: boolean }): Promise<void>

  /**
   * Equivalent to `docker cp`. Either `source` or `dest` must contain a
   * `containerId:/path` form; the other side is a host path.
   */
  cp(args: { source: string; dest: string }): Promise<void>

  exec(
    idOrName: string,
    command: string[],
    options?: { user?: string; env?: Record<string, string> },
  ): Promise<DockerExecResult>
}
