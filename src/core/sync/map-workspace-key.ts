import type { Untrusted } from '@/core/security/brand'
import { asHomeOrRootAbsolutePath, asPosixUserName } from '@/core/security/untrusted-input'

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
 * `sync_get_claude_projects_dir` in install.sh.
 *
 * Both `env` and `user` come from the container's `Config` and are
 * therefore `Untrusted<>`. The function validates both via
 * `core/security/untrusted-input` — `CLAUDE_CONFIG_DIR` must be under
 * `/home/<user>/` or `/root/` with no `..`, and `user` must look like a
 * POSIX username. Anything else falls back to `/root/.claude/projects`.
 */
export function resolveClaudeProjectsDir(args: {
  env?: ReadonlyArray<Untrusted<'docker.config.env'>>
  user?: Untrusted<'docker.config.user'>
}): string {
  const claudeConfigDirRaw = (args.env ?? [])
    .map((line) => line.unsafe().match(/^CLAUDE_CONFIG_DIR=(.*)$/))
    .find((m): m is RegExpMatchArray => m !== null)?.[1]

  if (claudeConfigDirRaw !== undefined) {
    const validated = asHomeOrRootAbsolutePath(claudeConfigDirRaw)
    if (validated) return `${validated}/projects`
  }

  const userRaw = args.user?.unsafe() ?? ''
  if (userRaw === '' || userRaw === 'root') return '/root/.claude/projects'
  const validatedUser = asPosixUserName(userRaw)
  if (!validatedUser) return '/root/.claude/projects'
  return `/home/${validatedUser}/.claude/projects`
}
