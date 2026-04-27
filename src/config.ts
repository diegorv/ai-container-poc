/**
 * Constants shared across CLI and core. Anything that varies per project /
 * per user lives elsewhere (env, args, etc.); this file is for invariants.
 */

/** Container label that the upstream `devcontainer up` applies. */
export const CONTAINER_LABEL_KEY = 'devcontainer.local_folder'

/** Subdir under `~/.claude` where Claude Code stores per-project session data. */
export const CLAUDE_PROJECTS_SUBDIR = 'projects'

/** Default user inside the container (matches the Microsoft devcontainers base). */
export const DEFAULT_REMOTE_USER = 'vscode'

/** Default workspace folder inside the container. */
export const DEFAULT_WORKSPACE_FOLDER = '/workspace'

/** Folder name (relative to project root) holding the devcontainer config. */
export const DEVCONTAINER_DIR = '.devcontainer'

/** Filename for the devcontainer config inside the project. */
export const DEVCONTAINER_FILENAME = 'devcontainer.json'

/** Image label suffix for the variant that bakes in the host UID. */
export const UID_IMAGE_SUFFIX = '-uid'
