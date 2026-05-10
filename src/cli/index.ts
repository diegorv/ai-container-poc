#!/usr/bin/env node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCliDevcontainer } from '@/adapters/devcontainer/cli-devcontainer'
import { createCliDocker } from '@/adapters/docker/cli-docker'
import { nodeFs } from '@/adapters/filesystem/node-fs'
import { createPrettyLogger } from '@/adapters/logger/pretty-logger'
import { ttyPrompt } from '@/adapters/prompt/tty-prompt'
import { execaShell } from '@/adapters/shell/execa-shell'
import type { AbsolutePath } from '@/core/security/brand'
import { operatorPath } from '@/core/security/path'
import { CliError } from '@/lib/cli-error'
import { EnvSchema } from '@/schemas/env'
import { clean } from './commands/clean'
import { completion } from './commands/completion'
import { cp } from './commands/cp'
import { destroy } from './commands/destroy'
import { doctor } from './commands/doctor'
import { dot } from './commands/dot'
import { down } from './commands/down'
import { exec } from './commands/exec'
import { HELP_TEXT } from './commands/help'
import { info } from './commands/info'
import { logs } from './commands/logs'
import { mount } from './commands/mount'
import { ps } from './commands/ps'
import { rebuild } from './commands/rebuild'
import { selfInstall } from './commands/self-install'
import { shell } from './commands/shell'
import { sync } from './commands/sync'
import { template } from './commands/template'
import { up } from './commands/up'
import { update } from './commands/update'
import { upgrade } from './commands/upgrade'
import { validate } from './commands/validate'
import type { CommandDeps } from './deps'
import { type ParsedCommand, type Verbosity, parseArgs, parseGlobalFlags } from './parser'

function resolveTemplatesDir(): AbsolutePath {
  // dist/cli/index.js → templates/ at repo root in production.
  // src/cli/index.ts → templates/ at repo root via tsx in dev.
  const here = dirname(fileURLToPath(import.meta.url))
  return operatorPath(resolve(here, '..', '..', 'templates'))
}

function resolveContainerInitBundle(): AbsolutePath {
  // dist/cli/index.js     → ../container-init/index.js
  // src/cli/index.ts (tsx) → ../../dist/container-init/index.js
  // We resolve through the repo root so both modes hit the same
  // built bundle. The file must exist at template-time; `pnpm build`
  // produces it.
  const here = dirname(fileURLToPath(import.meta.url))
  return operatorPath(resolve(here, '..', '..', 'dist', 'container-init', 'index.js'))
}

function buildDeps(verbosity: Verbosity): CommandDeps {
  const env = EnvSchema.parse(process.env)
  const docker = createCliDocker(execaShell)
  const devcontainer = createCliDevcontainer(execaShell)
  const level = verbosity === 'verbose' ? 'debug' : verbosity === 'quiet' ? 'error' : 'info'
  return {
    fs: nodeFs,
    docker,
    devcontainer,
    shell: execaShell,
    logger: createPrettyLogger({ level }),
    prompt: ttyPrompt,
    templatesDir: resolveTemplatesDir(),
    containerInitBundle: resolveContainerInitBundle(),
    env,
    verbose: verbosity === 'verbose',
  }
}

function currentBinaryPath(): AbsolutePath {
  return operatorPath(fileURLToPath(import.meta.url))
}

function repoRootDir(): AbsolutePath {
  // dist/cli/index.js or src/cli/index.ts → repo root is two parents up.
  return operatorPath(resolve(dirname(currentBinaryPath()), '..', '..'))
}

async function dispatch(cmd: ParsedCommand, deps: CommandDeps): Promise<number> {
  switch (cmd.name) {
    case 'help':
      process.stdout.write(HELP_TEXT)
      return 0
    case 'template':
      await template(cmd, deps)
      return 0
    case 'dot':
      await dot(cmd, deps)
      return 0
    case 'up':
      await up(cmd, deps)
      return 0
    case 'rebuild':
      await rebuild(cmd, deps)
      return 0
    case 'down':
      await down(cmd, deps)
      return 0
    case 'shell':
      return shell(cmd, deps)
    case 'exec':
      return exec(cmd, deps)
    case 'mount':
      await mount(cmd, deps)
      return 0
    case 'sync':
      await sync(cmd, deps)
      return 0
    case 'cp':
      await cp(cmd, deps)
      return 0
    case 'destroy':
      await destroy(cmd, deps)
      return 0
    case 'info': {
      const json = await info(cmd, deps)
      if (json !== undefined) process.stdout.write(`${json}\n`)
      return 0
    }
    case 'logs':
      return logs(cmd, deps)
    case 'ps':
      await ps({}, deps)
      return 0
    case 'validate':
      await validate(cmd, deps)
      return 0
    case 'completion':
      process.stdout.write(completion(cmd))
      return 0
    case 'clean':
      await clean(cmd, deps)
      return 0
    case 'upgrade':
      return upgrade(cmd, deps)
    case 'self-install':
      await selfInstall({ sourceBin: currentBinaryPath() }, deps)
      return 0
    case 'update':
      await update({ sourceDir: repoRootDir() }, deps)
      return 0
    case 'doctor':
      return doctor(cmd, deps)
  }
}

async function main(): Promise<void> {
  const { argv, verbosity } = parseGlobalFlags(process.argv.slice(2))
  const cmd = parseArgs(argv, { cwd: process.cwd() })
  const deps = buildDeps(verbosity)
  const code = await dispatch(cmd, deps)
  if (code !== 0) process.exit(code)
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`mydevc: ${message}\n`)
  if (err instanceof CliError && err.suggestion) {
    process.stderr.write(`Try: ${err.suggestion}\n`)
  }
  process.exit(1)
})
