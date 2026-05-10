/**
 * Lightweight argv parser for the `mydevc` CLI. Mirrors the dispatcher
 * in install.sh (lines 795-859) — distinct command names with a few
 * positional arguments each. Citty/yargs would work, but the surface is
 * small enough that hand-rolling keeps dependencies and bundle size
 * minimal.
 */
export type ParsedCommand =
  | { name: 'help' }
  | { name: 'template'; cwd: string; force: boolean; secure: boolean }
  | { name: 'dot'; cwd: string; force: boolean; secure: boolean }
  | { name: 'up'; cwd: string }
  | { name: 'rebuild'; cwd: string }
  | { name: 'down'; cwd: string }
  | { name: 'shell'; cwd: string }
  | { name: 'exec'; cwd: string; command: string[] }
  | { name: 'upgrade'; cwd: string }
  | {
      name: 'mount'
      hostPath: string
      containerPath: string
      readonly: boolean
      allowDangerous: boolean
      cwd: string
    }
  | { name: 'sync'; filter: string | undefined; trusted: boolean }
  | { name: 'cp'; containerPath: string; hostPath: string; cwd: string }
  | { name: 'destroy'; cwd: string; force: boolean }
  | { name: 'info'; cwd: string; json: boolean }
  | { name: 'logs'; cwd: string; follow: boolean; tail: number | undefined }
  | { name: 'ps' }
  | { name: 'validate'; cwd: string }
  | { name: 'completion'; shell: 'bash' | 'zsh' | 'fish' }
  | {
      name: 'clean'
      cwd: string
      container: boolean
      volumes: boolean
      images: boolean
      cache: boolean
      force: boolean
      dryRun: boolean
    }
  | { name: 'self-install' }
  | { name: 'update' }

export interface ParseContext {
  cwd: string
}

export type Verbosity = 'quiet' | 'normal' | 'verbose'

export interface GlobalFlags {
  verbosity: Verbosity
  argv: string[]
}

/**
 * Strips global flags (`--verbose`, `-v`, `--quiet`, `-q`) from `argv`
 * before command parsing so any command can be silenced or made chatty
 * without per-command boilerplate. `--verbose` wins over `--quiet` if
 * both are present.
 */
export function parseGlobalFlags(argv: readonly string[]): GlobalFlags {
  const out = [...argv]
  let verbose = false
  let quiet = false
  for (const flag of ['--verbose', '-v']) {
    const i = out.indexOf(flag)
    if (i !== -1) {
      out.splice(i, 1)
      verbose = true
    }
  }
  for (const flag of ['--quiet', '-q']) {
    const i = out.indexOf(flag)
    if (i !== -1) {
      out.splice(i, 1)
      quiet = true
    }
  }
  return {
    argv: out,
    verbosity: verbose ? 'verbose' : quiet ? 'quiet' : 'normal',
  }
}

function take(args: string[]): string | undefined {
  return args.shift()
}

function hasFlag(args: string[], flag: string): boolean {
  const i = args.indexOf(flag)
  if (i === -1) return false
  args.splice(i, 1)
  return true
}

export function parseArgs(argv: readonly string[], ctx: ParseContext): ParsedCommand {
  const args = [...argv]
  const head = take(args)
  if (head === undefined || head === 'help' || head === '--help' || head === '-h') {
    return { name: 'help' }
  }

  switch (head) {
    case '.': {
      const force = hasFlag(args, '-f')
      const secure = hasFlag(args, '--secure')
      return { name: 'dot', cwd: ctx.cwd, force, secure }
    }
    case 'template': {
      const force = hasFlag(args, '-f')
      const secure = hasFlag(args, '--secure')
      const dir = take(args) ?? '.'
      return { name: 'template', cwd: dir === '.' ? ctx.cwd : dir, force, secure }
    }
    case 'up':
      return { name: 'up', cwd: take(args) ?? ctx.cwd }
    case 'rebuild':
      return { name: 'rebuild', cwd: take(args) ?? ctx.cwd }
    case 'down':
      return { name: 'down', cwd: take(args) ?? ctx.cwd }
    case 'shell':
      return { name: 'shell', cwd: ctx.cwd }
    case 'exec': {
      // Match install.sh:824 — drop a leading `--` so users can write
      // `mydevc exec -- ls -la` to disambiguate flags from the command,
      // without `--` itself ending up in argv passed to the container.
      if (args[0] === '--') args.shift()
      return { name: 'exec', cwd: ctx.cwd, command: args }
    }
    case 'upgrade':
      return { name: 'upgrade', cwd: ctx.cwd }
    case 'mount': {
      const hostPath = take(args)
      const containerPath = take(args)
      if (!hostPath || !containerPath) {
        throw new Error('Usage: mydevc mount <host_path> <container_path> [--readonly]')
      }
      return {
        name: 'mount',
        hostPath,
        containerPath,
        readonly: hasFlag(args, '--readonly'),
        allowDangerous: hasFlag(args, '--allow-dangerous'),
        cwd: ctx.cwd,
      }
    }
    case 'sync': {
      const trusted = hasFlag(args, '--trusted')
      return { name: 'sync', filter: take(args), trusted }
    }
    case 'cp': {
      const containerPath = take(args)
      const hostPath = take(args)
      if (!containerPath || !hostPath) {
        throw new Error('Usage: mydevc cp <container_path> <host_path>')
      }
      return { name: 'cp', containerPath, hostPath, cwd: ctx.cwd }
    }
    case 'destroy':
      return { name: 'destroy', cwd: ctx.cwd, force: hasFlag(args, '-f') }
    case 'info':
      return { name: 'info', cwd: ctx.cwd, json: hasFlag(args, '--json') }
    case 'logs': {
      const follow = hasFlag(args, '-f') || hasFlag(args, '--follow')
      const tailIdx = args.indexOf('--tail')
      let tail: number | undefined
      if (tailIdx !== -1 && tailIdx + 1 < args.length) {
        const raw = args[tailIdx + 1]
        const parsed = raw === undefined ? Number.NaN : Number(raw)
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new Error('--tail expects a non-negative integer')
        }
        tail = parsed
        args.splice(tailIdx, 2)
      }
      return { name: 'logs', cwd: ctx.cwd, follow, tail }
    }
    case 'ps':
      return { name: 'ps' }
    case 'validate':
      return { name: 'validate', cwd: ctx.cwd }
    case 'completion': {
      const shell = take(args)
      if (shell !== 'bash' && shell !== 'zsh' && shell !== 'fish') {
        throw new Error('Usage: mydevc completion <bash|zsh|fish>')
      }
      return { name: 'completion', shell }
    }
    case 'clean':
      return {
        name: 'clean',
        cwd: ctx.cwd,
        container: hasFlag(args, '--container'),
        volumes: hasFlag(args, '--volumes'),
        images: hasFlag(args, '--images'),
        cache: hasFlag(args, '--cache'),
        force: hasFlag(args, '-f'),
        dryRun: hasFlag(args, '--dry-run'),
      }
    case 'self-install':
      return { name: 'self-install' }
    case 'update':
      return { name: 'update' }
    default:
      throw new Error(`Unknown command: ${head}. Run 'mydevc help' for the full list.`)
  }
}
