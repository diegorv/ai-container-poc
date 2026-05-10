export interface DevcontainerUpArgs {
  workspaceFolder: string
  removeExistingContainer?: boolean
  /**
   * When true, the adapter inherits stdio from the parent process so the
   * operator sees `docker buildx` / lifecycle output live. The
   * containerId in the return value is then unavailable (`''`) — the
   * caller must not rely on it. Defaults to false (buffered + parsed).
   */
  stream?: boolean
}

export interface DevcontainerExecArgs {
  workspaceFolder: string
  command: string[]
  /** When true, inherit stdio from the parent process. */
  interactive?: boolean
}

export interface DevcontainerCli {
  up(args: DevcontainerUpArgs): Promise<{ containerId: string }>
  exec(args: DevcontainerExecArgs): Promise<{ exitCode: number }>
}
