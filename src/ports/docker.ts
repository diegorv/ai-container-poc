export interface ContainerInfo {
  id: string
  name: string
  image: string
  labels: Record<string, string>
  state: string
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
