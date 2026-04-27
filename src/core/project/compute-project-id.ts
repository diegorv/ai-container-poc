import { basename } from 'node:path'
import { CONTAINER_LABEL_KEY } from '@/config'
import type { ProjectInfo } from '@/schemas/project-info'

/**
 * Derives stable identifiers for a workspace folder. Mirrors what
 * `devcontainer up` does internally — the label `devcontainer.local_folder`
 * is set to the absolute workspace path, and the project name is the path's
 * basename. Both are used by the CLI to find a container belonging to a
 * given project.
 */
export function computeProjectId(workspaceFolder: string): ProjectInfo {
  if (!workspaceFolder.startsWith('/')) {
    throw new Error(`workspaceFolder must be absolute, got "${workspaceFolder}"`)
  }
  const projectName = basename(workspaceFolder)
  return {
    workspaceFolder,
    projectName,
    containerLabel: `${CONTAINER_LABEL_KEY}=${workspaceFolder}`,
  }
}
