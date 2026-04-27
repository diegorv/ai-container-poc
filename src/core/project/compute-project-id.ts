import { basename } from 'node:path'
import { CONTAINER_LABEL_KEY } from '@/config'
import type { AbsolutePath } from '@/core/security/brand'
import type { ProjectInfo } from '@/schemas/project-info'

/**
 * Derives stable identifiers for a workspace folder. Mirrors what
 * `devcontainer up` does internally — the label `devcontainer.local_folder`
 * is set to the absolute workspace path, and the project name is the path's
 * basename. Both are used by the CLI to find a container belonging to a
 * given project.
 */
export function computeProjectId(workspaceFolder: AbsolutePath): ProjectInfo {
  const projectName = basename(workspaceFolder)
  return {
    workspaceFolder,
    projectName,
    containerLabel: `${CONTAINER_LABEL_KEY}=${workspaceFolder}`,
  }
}
