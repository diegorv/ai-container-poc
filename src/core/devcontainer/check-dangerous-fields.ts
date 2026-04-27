import type { DevcontainerConfig } from '@/schemas/devcontainer-config'

export interface DangerousFieldFinding {
  field: string
  reason: string
}

const SECURITY_OPT_REJECT = [
  /seccomp[=:]\s*unconfined/i,
  /apparmor[=:]\s*unconfined/i,
  /label[=:]\s*disable/i,
  /no-new-privileges[=:]\s*false/i,
]

/**
 * Returns every top-level devcontainer.json field that would weaken the
 * sandbox. Complements `checkNoSysAdmin` (which inspects `runArgs`):
 * the devcontainers spec also accepts `privileged` and `securityOpt`
 * directly, plus a `containerUser` override that can elevate to root.
 */
export function findDangerousFields(config: DevcontainerConfig): DangerousFieldFinding[] {
  const findings: DangerousFieldFinding[] = []

  if (config.privileged === true) {
    findings.push({
      field: 'privileged',
      reason: '`"privileged": true` grants every capability and disables seccomp/apparmor',
    })
  }

  for (const opt of config.securityOpt ?? []) {
    for (const pattern of SECURITY_OPT_REJECT) {
      if (pattern.test(opt)) {
        findings.push({
          field: `securityOpt[${opt}]`,
          reason: `'${opt}' disables a kernel-level isolation primitive`,
        })
        break
      }
    }
  }

  if (config.containerUser !== undefined && config.containerUser !== 'vscode') {
    findings.push({
      field: 'containerUser',
      reason: `containerUser='${config.containerUser}' overrides the non-root vscode user`,
    })
  }

  return findings
}
