import { CliError } from '@/lib/cli-error'

export type CompletionShell = 'bash' | 'zsh' | 'fish'

const COMMANDS = [
  'template',
  'up',
  'rebuild',
  'down',
  'shell',
  'exec',
  'upgrade',
  'mount',
  'sync',
  'cp',
  'destroy',
  'info',
  'logs',
  'ps',
  'validate',
  'clean',
  'self-install',
  'update',
  'completion',
  'doctor',
  'help',
] as const

const FLAGS_BY_COMMAND: Record<string, readonly string[]> = {
  template: ['-f', '--secure'],
  '.': ['-f', '--secure'],
  destroy: ['-f'],
  sync: ['--trusted'],
  mount: ['--readonly', '--allow-dangerous'],
  info: ['--json'],
  logs: ['-f', '--follow', '--tail'],
  clean: ['--container', '--volumes', '--images', '--cache', '-f', '--dry-run'],
  completion: ['bash', 'zsh', 'fish'],
  doctor: ['--json'],
}

function bash(): string {
  const cmds = COMMANDS.join(' ')
  return `# mydevc bash completion. Source from your ~/.bashrc:
#   source <(mydevc completion bash)
_mydevc_complete() {
  local cur prev cmd
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  cmd="\${COMP_WORDS[1]:-}"
  if [[ \$COMP_CWORD -eq 1 ]]; then
    COMPREPLY=( \$(compgen -W "${cmds}" -- "\$cur") )
    return 0
  fi
  case "\$cmd" in
    template|.) COMPREPLY=( \$(compgen -W "-f --secure" -- "\$cur") ) ;;
    destroy)    COMPREPLY=( \$(compgen -W "-f" -- "\$cur") ) ;;
    sync)       COMPREPLY=( \$(compgen -W "--trusted" -- "\$cur") ) ;;
    mount)      COMPREPLY=( \$(compgen -W "--readonly --allow-dangerous" -- "\$cur") ) ;;
    info)       COMPREPLY=( \$(compgen -W "--json" -- "\$cur") ) ;;
    logs)       COMPREPLY=( \$(compgen -W "-f --follow --tail" -- "\$cur") ) ;;
    clean)      COMPREPLY=( \$(compgen -W "--container --volumes --images --cache -f --dry-run" -- "\$cur") ) ;;
    completion) COMPREPLY=( \$(compgen -W "bash zsh fish" -- "\$cur") ) ;;
  esac
}
complete -F _mydevc_complete mydevc
`
}

function zsh(): string {
  const cmdLines = COMMANDS.map((c) => `    '${c}'`).join('\n')
  const flagCases = Object.entries(FLAGS_BY_COMMAND)
    .map(
      ([cmd, flags]) =>
        `        ${cmd}) _values 'flags' ${flags.map((f) => `'${f}'`).join(' ')} ;;`,
    )
    .join('\n')
  return `#compdef mydevc
# mydevc zsh completion. Source from your ~/.zshrc (after compinit):
#   source <(mydevc completion zsh)
_mydevc() {
  local -a commands
  commands=(
${cmdLines}
  )
  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi
  case "\${words[2]}" in
${flagCases}
  esac
}
compdef _mydevc mydevc
`
}

function fish(): string {
  const cmdComplete = COMMANDS.map(
    (c) => `complete -c mydevc -n '__fish_use_subcommand' -a '${c}'`,
  ).join('\n')
  const flagCompletes: string[] = []
  for (const [cmd, flags] of Object.entries(FLAGS_BY_COMMAND)) {
    for (const flag of flags) {
      const opt = flag.startsWith('--') ? `-l ${flag.slice(2)}` : `-s ${flag.slice(1)}`
      const subcmd = cmd === '.' ? '.' : cmd
      flagCompletes.push(`complete -c mydevc -n '__fish_seen_subcommand_from ${subcmd}' ${opt}`)
    }
  }
  return `# mydevc fish completion. Drop into:
#   ~/.config/fish/completions/mydevc.fish
${cmdComplete}
${flagCompletes.join('\n')}
`
}

const GENERATORS: Record<CompletionShell, () => string> = {
  bash,
  zsh,
  fish,
}

export interface CompletionArgs {
  shell: CompletionShell
}

/**
 * Emits a shell completion script to stdout. The dispatcher writes the
 * returned string verbatim so users can `source <(mydevc completion zsh)`
 * without an intermediate file.
 */
export function completion(args: CompletionArgs): string {
  const generator = GENERATORS[args.shell]
  if (!generator) {
    throw new CliError(`Unknown shell: ${args.shell}`, {
      suggestion: 'Pass one of: bash, zsh, fish.',
    })
  }
  return generator()
}
