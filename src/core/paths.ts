/**
 * Common path-construction helpers. Centralises the `safeFilename(...)`
 * wrapping of well-known constants from `config.ts` so commands don't
 * repeat the boilerplate. Each exported function takes an
 * `AbsolutePath` (the workspace root, the user's home, etc.) and
 * returns a derived `AbsolutePath`.
 *
 * The wrapped segments are validated *at module load time* — if a
 * constant in `config.ts` is ever set to something unsafe, the
 * binary will fail to boot rather than ship a vulnerability.
 */

import { CLAUDE_PROJECTS_SUBDIR, DEVCONTAINER_DIR, DEVCONTAINER_FILENAME } from '@/config'
import type { AbsolutePath } from '@/core/security/brand'
import { joinPath, safeFilename } from '@/core/security/path'

const DEVCONTAINER_DIR_SEG = safeFilename(DEVCONTAINER_DIR)
const DEVCONTAINER_FILENAME_SEG = safeFilename(DEVCONTAINER_FILENAME)
const DOT_CLAUDE_SEG = safeFilename('.claude')
const PROJECTS_SEG = safeFilename(CLAUDE_PROJECTS_SUBDIR)
const GIT_DIR_SEG = safeFilename('.git')
const GIT_CONFIG_SEG = safeFilename('config')

/** `<cwd>/.devcontainer` */
export function devcontainerDirOf(cwd: AbsolutePath): AbsolutePath {
  return joinPath(cwd, DEVCONTAINER_DIR_SEG)
}

/** `<cwd>/.devcontainer/devcontainer.json` */
export function devcontainerJsonOf(cwd: AbsolutePath): AbsolutePath {
  return joinPath(cwd, DEVCONTAINER_DIR_SEG, DEVCONTAINER_FILENAME_SEG)
}

/** `<home>/.claude/projects` — host-side Claude project store. */
export function hostClaudeProjectsOf(home: AbsolutePath): AbsolutePath {
  return joinPath(home, DOT_CLAUDE_SEG, PROJECTS_SEG)
}

/** `<cwd>/.git/config` — present iff the workspace is a git repo. */
export function gitConfigOf(cwd: AbsolutePath): AbsolutePath {
  return joinPath(cwd, GIT_DIR_SEG, GIT_CONFIG_SEG)
}
