import { z } from 'zod'

/**
 * Information about a project / workspace folder that the CLI operates on.
 *
 * `containerLabel` mirrors the label `devcontainer.local_folder` that the
 * upstream `devcontainer up` command applies — it's the canonical way to
 * find a container belonging to a given workspace.
 */
export const ProjectInfoSchema = z.object({
  workspaceFolder: z.string().min(1),
  projectName: z.string().min(1),
  containerLabel: z.string().min(1),
})

export type ProjectInfo = z.infer<typeof ProjectInfoSchema>
