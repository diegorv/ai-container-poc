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

/**
 * Reflects whether `--secure` mode is wired up for this workspace.
 * `configured`: a `firewall-allowlist.txt` is present in `.devcontainer/`,
 * so `setup-firewall.sh` will lock egress on every container start.
 * `entryCount` is the count of valid host/IP/CIDR lines (comments and
 * blank lines stripped) — surfaces a syntax error in the allowlist as
 * a 0 even when the file exists.
 */
export const FirewallSummarySchema = z.object({
  configured: z.boolean(),
  entryCount: z.number().int().nonnegative(),
  allowlistPath: z.string().nullable(),
})

export type FirewallSummary = z.infer<typeof FirewallSummarySchema>

export const InfoSummarySchema = z.object({
  workspaceFolder: z.string(),
  projectName: z.string(),
  containerLabel: z.string(),
  hasDevcontainerDir: z.boolean(),
  container: ContainerInfoSummarySchema.nullable(),
  customMounts: z.array(MountSchema),
  firewall: FirewallSummarySchema,
})

export type InfoSummary = z.infer<typeof InfoSummarySchema>
