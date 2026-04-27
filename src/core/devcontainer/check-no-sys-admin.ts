import type { DevcontainerConfig } from '@/schemas/devcontainer-config'

export interface SysAdminCheck {
  ok: boolean
  /** The runArgs entry that contained SYS_ADMIN, if found. */
  offendingArg?: string
}

/**
 * Returns `{ ok: false }` when any `runArgs` entry mentions `SYS_ADMIN`.
 * Mirrors `check_no_sys_admin` in install.sh — adding SYS_ADMIN would
 * defeat the read-only `.devcontainer` mount that protects the host.
 */
export function checkNoSysAdmin(config: DevcontainerConfig): SysAdminCheck {
  const runArgs = config.runArgs ?? []
  const offending = runArgs.find((arg) => arg.includes('SYS_ADMIN'))
  if (offending) return { ok: false, offendingArg: offending }
  return { ok: true }
}
