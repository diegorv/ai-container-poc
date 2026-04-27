import type { FileSystem } from '@/ports/filesystem'
import type { Logger } from '@/ports/logger'
import type { Shell } from '@/ports/shell'
import type { Env } from '@/schemas/env'

export interface StepContext {
  fs: FileSystem
  shell: Shell
  logger: Logger
  homeDir: string
  uid: number
  gid: number
  env: Env
}

export type StepResult = { ok: true; message: string } | { ok: false; error: string }

export interface Step {
  readonly name: string
  run(ctx: StepContext): Promise<StepResult>
}
