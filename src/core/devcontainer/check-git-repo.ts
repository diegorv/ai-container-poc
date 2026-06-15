import type { DevcontainerConfig } from '@/schemas/devcontainer-config'
import { parseMount } from './manipulate-mounts'

/**
 * The template bind-mounts the workspace's `.git/config` and
 * `.git/hooks` so the host's git config and hooks apply inside the
 * container. Docker requires a bind source to exist *before* the
 * container starts, so such a config can only run in a git repository.
 */
// `\${localWorkspaceFolder}` is the literal devcontainer variable the
// template writes, not a JS template placeholder — hence the escape.
const WORKSPACE_GIT_DIR = `\${localWorkspaceFolder}/.git`

function referencesWorkspaceGit(source: string | undefined): boolean {
  if (source === undefined) return false
  return source === WORKSPACE_GIT_DIR || source.startsWith(`${WORKSPACE_GIT_DIR}/`)
}

/**
 * True when the devcontainer config bind-mounts something under the
 * workspace's `.git` directory. When it does, starting the container
 * requires the workspace to be a git repository — otherwise Docker
 * aborts with a cryptic "bind source path does not exist" error.
 * Detecting the requirement here lets `up`/`rebuild` fail early with an
 * actionable message (run `git init`) instead.
 *
 * Malformed mounts are ignored — the dedicated audits surface those.
 */
export function requiresGitRepo(config: DevcontainerConfig): boolean {
  const mounts = config.mounts
  if (!mounts) return false
  return mounts.some((mount) => {
    try {
      const parsed = parseMount(mount)
      return parsed.type === 'bind' && referencesWorkspaceGit(parsed.source)
    } catch {
      return false
    }
  })
}
