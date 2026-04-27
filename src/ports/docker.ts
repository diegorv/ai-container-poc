export interface ContainerMount {
  type: 'volume' | 'bind' | string
  /** Volume name (when type === 'volume'). */
  name?: string
  /** Host source path (when type === 'bind'). */
  source?: string
  destination: string
}

export interface ContainerInfo {
  id: string
  name: string
  image: string
  labels: Record<string, string>
  state: string
  mounts: ContainerMount[]
  /** Raw `KEY=VALUE` env entries from the container config. */
  env: string[]
  /** Configured user (`Config.User` from docker inspect). */
  user: string
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
