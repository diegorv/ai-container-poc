#!/usr/bin/env node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCliDevcontainer } from '@/adapters/devcontainer/cli-devcontainer'
import { createCliDocker } from '@/adapters/docker/cli-docker'
import { nodeFs } from '@/adapters/filesystem/node-fs'
import { createPinoLogger } from '@/adapters/logger/pino-logger'
import { ttyPrompt } from '@/adapters/prompt/tty-prompt'
import { execaShell } from '@/adapters/shell/execa-shell'
import { EnvSchema } from '@/schemas/env'
import { clean } from './commands/clean'
import { cp } from './commands/cp'
import { destroy } from './commands/destroy'
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
import type { CommandDeps } from './deps'
import { type ParsedCommand, parseArgs } from './parser'

function resolveTemplatesDir(): string {
  // dist/cli/index.js → templates/ at repo root in production.
  // src/cli/index.ts → templates/ at repo root via tsx in dev.
  const here = dirname(fileURLToPath(import.meta.url))
  return resolve(here, '..', '..', 'templates')
}

function buildDeps(): CommandDeps {
  const env = EnvSchema.parse(process.env)
  const docker = createCliDocker(execaShell)
  const devcontainer = createCliDevcontainer(execaShell)
  return {
    fs: nodeFs,
    docker,
    devcontainer,
    shell: execaShell,
    logger: createPinoLogger(),
    prompt: ttyPrompt,
    templatesDir: resolveTemplatesDir(),
    env,
  }
}

function currentBinaryPath(): string {
  return fileURLToPath(import.meta.url)
}

function repoRootDir(): string {
  // dist/cli/index.js or src/cli/index.ts → repo root is two parents up.
  return resolve(dirname(currentBinaryPath()), '..', '..')
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
  }
}

async function main(): Promise<void> {
  const cmd = parseArgs(process.argv.slice(2), { cwd: process.cwd() })
  const deps = buildDeps()
  const code = await dispatch(cmd, deps)
  if (code !== 0) process.exit(code)
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`mydevc: ${message}\n`)
  process.exit(1)
})
