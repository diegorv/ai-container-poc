import { z } from 'zod'
import { MountSchema } from './devcontainer-config'

/**
 * Stable schema for `mydevc info --json` output. Pinning the shape with
 * Zod makes the JSON contract explicit: scripts that pipe into jq can
 * rely on field names and types, and a regression in this file fails
 * the test suite before it reaches downstream consumers.
 */
export const ContainerInfoSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  image: z.string(),
  hasUidImageVariant: z.boolean(),
  volumes: z.array(z.string()),
})

export type ContainerInfoSummary = z.infer<typeof ContainerInfoSummarySchema>

export const InfoSummarySchema = z.object({
  workspaceFolder: z.string(),
  projectName: z.string(),
  containerLabel: z.string(),
  hasDevcontainerDir: z.boolean(),
  container: ContainerInfoSummarySchema.nullable(),
  customMounts: z.array(MountSchema),
})

export type InfoSummary = z.infer<typeof InfoSummarySchema>
