/**
 * Maps a Claude Code project key from container-side to host-side.
 *
 * Claude stores per-project sessions under `~/.claude/projects/<key>`.
 * Inside the devcontainer, the workspace lives at `/workspace`, so the
 * key is `-workspace`. On the host, sessions from a devcontainer must
 * not collide with the host's own keys, so we rename `-workspace` to
 * `-devcontainer-<projectName>`.
 *
 * Mirrors the per-key logic inside `sync_one_container` in install.sh.
 */
export function mapWorkspaceKey(containerKey: string, projectName: string): string {
  if (containerKey === '-workspace') return `-devcontainer-${projectName}`
  return containerKey
}

/**
 * Allowlist of container paths the host will trust for the
 * `${claudeDir}/projects` value when reading from a container's env.
 * The container is treated as untrusted; without this check, a
 * malicious `CLAUDE_CONFIG_DIR=/etc` would have host-side `docker cp`
 * extract /etc into a tmp dir and feed its `.jsonl` files into
 * `~/.claude/projects/`.
 */
const ALLOWED_CLAUDE_DIR = /^\/(home\/[A-Za-z0-9_.-]+|root)(\/[A-Za-z0-9_.-]+)*$/

/**
 * Resolves the absolute path of `~/.claude/projects` inside the
 * container, given its env vars and remote user. Mirrors
 * `sync_get_claude_projects_dir` in install.sh, plus a security check:
 * the env value must be an absolute path under `/home/<user>/` or
 * `/root/`, with no `..` segments. Anything else falls back to the
 * derived-from-user default.
 */
export function resolveClaudeProjectsDir(args: {
  env?: readonly string[]
  user?: string
}): string {
  const claudeConfigDir = (args.env ?? [])
    .map((line) => line.match(/^CLAUDE_CONFIG_DIR=(.*)$/))
    .find((m): m is RegExpMatchArray => m !== null)?.[1]

  if (
    claudeConfigDir &&
    claudeConfigDir.length > 0 &&
    !claudeConfigDir.includes('..') &&
    ALLOWED_CLAUDE_DIR.test(claudeConfigDir)
  ) {
    return `${claudeConfigDir}/projects`
  }

  const user = args.user ?? ''
  if (user === '' || user === 'root') return '/root/.claude/projects'
  return `/home/${user}/.claude/projects`
}
