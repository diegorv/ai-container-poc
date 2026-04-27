import type {
  DevcontainerCli,
  DevcontainerExecArgs,
  DevcontainerUpArgs,
} from '@/ports/devcontainer'

export interface FakeDevcontainer extends DevcontainerCli {
  readonly upCalls: readonly DevcontainerUpArgs[]
  readonly execCalls: readonly DevcontainerExecArgs[]
  setNextContainerId(id: string): void
  setNextExecExitCode(code: number): void
}

export interface FakeDevcontainerOptions {
  containerId?: string
  execExitCode?: number
}

export function createFakeDevcontainer(options: FakeDevcontainerOptions = {}): FakeDevcontainer {
  const upCalls: DevcontainerUpArgs[] = []
  const execCalls: DevcontainerExecArgs[] = []
  let containerId = options.containerId ?? 'fake-container-id'
  let execExitCode = options.execExitCode ?? 0

  return {
    upCalls,
    execCalls,
    setNextContainerId(id) {
      containerId = id
    },
    setNextExecExitCode(code) {
      execExitCode = code
    },
    async up(args) {
      upCalls.push(args)
      return { containerId }
    },
    async exec(args) {
      execCalls.push(args)
      return { exitCode: execExitCode }
    },
  }
}
