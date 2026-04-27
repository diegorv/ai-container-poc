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
import { dot } from './commands/dot'
import { down } from './commands/down'
import { exec } from './commands/exec'
import { rebuild } from './commands/rebuild'
import { shell } from './commands/shell'
import { template } from './commands/template'
import { up } from './commands/up'
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

const HELP_TEXT = `Usage: mydevc <command> [options]

Commands:
    .                      Install template + start container in current dir
    template [dir]         Copy devcontainer template into directory
    up [dir]               Start the devcontainer
    rebuild [dir]          Rebuild the devcontainer (preserves volumes)
    down [dir]             Stop the devcontainer
    shell                  Open zsh in the running container
    exec <cmd> [args...]   Run a command in the running container
    upgrade                Upgrade Claude Code inside the container
    mount <host> <ct>      Add a host→container bind mount
    sync [filter]          Sync Claude sessions from devcontainers to host
    cp <ct> <host>         Copy a path from the container to the host
    destroy [-f]           Remove container, volumes and images
    self-install           Symlink mydevc into ~/.local/bin
    update                 Pull the latest mydevc from git
    help                   Show this help message
`

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
    case 'upgrade':
    case 'mount':
    case 'sync':
    case 'cp':
    case 'destroy':
    case 'self-install':
    case 'update':
      throw new Error(`Command "${cmd.name}" not yet implemented (lands in a later phase).`)
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
