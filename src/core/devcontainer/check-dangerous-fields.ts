import type { DevcontainerConfig } from '@/schemas/devcontainer-config'
import { findDangerousMountPath } from './dangerous-mount-paths'
import { parseMount } from './manipulate-mounts'

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
 *
 * `homeDir` is consulted when auditing bind-mount sources so that mounts
 * pointing at SSH/cloud-credential dotfiles are flagged the same way
 * `mydevc mount` rejects them. A malicious container with write access
 * to the workspace can otherwise drop a `source=$HOME/.ssh,...` entry
 * into devcontainer.json and have it mounted on the next `up`.
 */
export function findDangerousFields(
  config: DevcontainerConfig,
  homeDir?: string,
): DangerousFieldFinding[] {
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

  for (const [index, mount] of (config.mounts ?? []).entries()) {
    let parsed: ReturnType<typeof parseMount>
    try {
      parsed = parseMount(mount)
    } catch (err) {
      findings.push({
        field: `mounts[${index}]`,
        reason: `unparseable mount: ${err instanceof Error ? err.message : String(err)}`,
      })
      continue
    }
    if (parsed.type !== 'bind' || !parsed.source) continue
    const danger = findDangerousMountPath(parsed.source, homeDir)
    if (danger) {
      findings.push({
        field: `mounts[${index}]`,
        reason: `bind mount source '${danger.path}' is unsafe: ${danger.reason}`,
      })
    }
  }

  return findings
}
