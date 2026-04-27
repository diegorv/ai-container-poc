/**
 * Surface lifecycle commands that run **before** the host re-asserts
 * the firewall. When `--secure` is active, the firewall is applied by
 * the container's `postStartCommand` and re-asserted by the host
 * after `devcontainer up` returns. Anything in the lifecycle that
 * runs earlier — `initializeCommand` (host-side, but interesting),
 * `onCreateCommand`, `updateContentCommand`, `postCreateCommand` —
 * runs while the container still has unrestricted egress.
 *
 * That window is the documented gap a malicious dependency or an
 * attacker-controlled `devcontainer.json` could exploit to exfiltrate
 * during, say, `npm install --ignore-scripts=false` or a custom
 * `postCreateCommand` that fetches "setup" content. This pass does
 * not block the run — operators have legitimate uses for those hooks
 * — but emits a single warning per offending field so the operator
 * knows the exfil window exists.
 */

import type { DevcontainerConfig } from '@/schemas/devcontainer-config'

export interface FirewallWindowWarning {
  field: string
  reason: string
}

type PreFirewallField = 'onCreateCommand' | 'updateContentCommand' | 'postCreateCommand'

const PRE_FIREWALL_HOOKS: ReadonlyArray<{
  field: PreFirewallField
  description: string
}> = [
  { field: 'onCreateCommand', description: 'runs once on first creation, before postStartCommand' },
  {
    field: 'updateContentCommand',
    description: 'runs after content is updated, before postStartCommand',
  },
  { field: 'postCreateCommand', description: 'runs once after creation, before postStartCommand' },
]

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

/**
 * Returns one warning per pre-firewall lifecycle command present in
 * the config. Empty when the firewall is not in use (callers should
 * only invoke this when an allowlist is present) or when no
 * pre-firewall hooks are declared.
 */
export function findFirewallWindowWarnings(config: DevcontainerConfig): FirewallWindowWarning[] {
  const out: FirewallWindowWarning[] = []
  for (const { field, description } of PRE_FIREWALL_HOOKS) {
    if (isPresent(config[field])) {
      out.push({
        field,
        reason: `${field} ${description} — outbound network is unrestricted while it runs`,
      })
    }
  }
  if ((config.features ?? null) && Object.keys(config.features ?? {}).length > 0) {
    out.push({
      field: 'features',
      reason:
        'devcontainer features run during build/setup, before the firewall is enforced — pin and audit each feature you trust with unrestricted network',
    })
  }
  return out
}
