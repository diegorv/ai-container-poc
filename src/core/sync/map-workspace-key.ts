import { isHomeOrRootAbsolutePath, isPosixUserName } from '@/core/security/untrusted-input'

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
 * Resolves the absolute path of `~/.claude/projects` inside the
 * container, given its env vars and remote user. Mirrors
 * `sync_get_claude_projects_dir` in install.sh, plus security checks
 * delegated to `core/security/untrusted-input`:
 * - the env value must be a `/home/<user>/...` or `/root/...` path;
 * - `args.user` must look like a POSIX username.
 * Anything else falls back to `/root/.claude/projects`.
 */
export function resolveClaudeProjectsDir(args: {
  env?: readonly string[]
  user?: string
}): string {
  const claudeConfigDir = (args.env ?? [])
    .map((line) => line.match(/^CLAUDE_CONFIG_DIR=(.*)$/))
    .find((m): m is RegExpMatchArray => m !== null)?.[1]

  if (claudeConfigDir && isHomeOrRootAbsolutePath(claudeConfigDir)) {
    return `${claudeConfigDir}/projects`
  }

  const user = args.user ?? ''
  if (user === '' || user === 'root') return '/root/.claude/projects'
  if (!isPosixUserName(user)) return '/root/.claude/projects'
  return `/home/${user}/.claude/projects`
}
