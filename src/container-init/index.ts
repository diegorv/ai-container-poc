#!/usr/bin/env node
import { nodeFs } from '@/adapters/filesystem/node-fs'
import { createPrettyLogger } from '@/adapters/logger/pretty-logger'
import { execaShell } from '@/adapters/shell/execa-shell'
import { EnvSchema } from '@/schemas/env'
import { runSteps } from './runner'
import { claudeBypassStep } from './steps/claude-bypass'
import { claudeSandboxStep } from './steps/claude-sandbox'
import { claudeSettingsStep } from './steps/claude-settings'
import { directoryOwnershipStep } from './steps/directory-ownership'
import { gitConfigStep } from './steps/git-config'
import type { StepContext } from './steps/step'
import { tmuxConfigStep } from './steps/tmux-config'

const STEPS = [
  claudeBypassStep,
  claudeSettingsStep,
  claudeSandboxStep,
  tmuxConfigStep,
  directoryOwnershipStep,
  gitConfigStep,
] as const

async function main(): Promise<void> {
  const env = EnvSchema.parse(process.env)
  const logger = createPrettyLogger()
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0
  const gid = typeof process.getgid === 'function' ? process.getgid() : 0

  const ctx: StepContext = {
    fs: nodeFs,
    shell: execaShell,
    logger,
    homeDir: env.HOME,
    uid,
    gid,
    env,
  }

  logger.info('▶ mydevc-init: starting post-create configuration')
  const result = await runSteps(STEPS, ctx)
  logger.info(`mydevc-init: ${result.succeeded} succeeded, ${result.failed} failed`)
  if (result.failed > 0) process.exit(1)
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`mydevc-init: ${message}\n`)
  process.exit(1)
})
