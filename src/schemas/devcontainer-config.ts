import { z } from 'zod'

/**
 * A mount entry in `devcontainer.json`. Devcontainer accepts both string
 * (`type=bind,source=...,target=...`) and object form. We model both and
 * preserve unknown keys for round-tripping.
 */
export const MountSchema = z.union([
  z.string(),
  z
    .object({
      type: z.enum(['bind', 'volume']),
      source: z.string(),
      target: z.string(),
      consistency: z.string().optional(),
    })
    .passthrough(),
])

export type Mount = z.infer<typeof MountSchema>

/**
 * Subset of the devcontainer.json spec that we manipulate. Unknown keys
 * are preserved via `passthrough` so we can edit and write back without
 * losing user-specific fields.
 */
export const DevcontainerConfigSchema = z
  .object({
    name: z.string().optional(),
    build: z
      .object({
        dockerfile: z.string().optional(),
        context: z.string().optional(),
        args: z.record(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    image: z.string().optional(),
    features: z.record(z.unknown()).optional(),
    runArgs: z.array(z.string()).optional(),
    mounts: z.array(MountSchema).optional(),
    containerEnv: z.record(z.string()).optional(),
    remoteEnv: z.record(z.string()).optional(),
    workspaceFolder: z.string().optional(),
    workspaceMount: z.string().optional(),
    remoteUser: z.string().optional(),
    initializeCommand: z.union([z.string(), z.array(z.string())]).optional(),
    postCreateCommand: z.union([z.string(), z.array(z.string())]).optional(),
    customizations: z.record(z.unknown()).optional(),
    init: z.boolean().optional(),
    updateRemoteUserUID: z.boolean().optional(),
  })
  .passthrough()

export type DevcontainerConfig = z.infer<typeof DevcontainerConfigSchema>
