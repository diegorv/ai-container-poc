export interface DevcontainerUpArgs {
  workspaceFolder: string
  removeExistingContainer?: boolean
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
