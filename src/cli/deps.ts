import type { AbsolutePath } from '@/core/security/brand'
import type { DevcontainerCli } from '@/ports/devcontainer'
import type { Docker } from '@/ports/docker'
import type { FileSystem } from '@/ports/filesystem'
import type { Logger } from '@/ports/logger'
import type { Prompt } from '@/ports/prompt'
import type { Shell } from '@/ports/shell'
import type { Env } from '@/schemas/env'

/**
 * Dependencies shared by every CLI command. The composition root
 * (`src/cli/index.ts`) builds this object once with real adapters; tests
 * build it with the in-memory fakes from `src/adapters/*`.
 */
export interface CommandDeps {
  fs: FileSystem
  docker: Docker
  devcontainer: DevcontainerCli
  shell: Shell
  logger: Logger
  prompt: Prompt
  /** Absolute path to the bundled templates folder (Dockerfile, .zshrc, …). */
  templatesDir: AbsolutePath
  env: Env
  /**
   * True when the operator passed `-v|--verbose`. Long-running commands
   * (`up`, `rebuild`) flip the underlying CLI from "buffer + parse" to
   * "stream stdio straight to the terminal" so the operator sees `docker
   * buildx` progress live instead of a blank spinner.
   */
  verbose: boolean
}
