import { findDangerousFields } from '@/core/devcontainer/check-dangerous-fields'
import { checkNoSysAdmin } from '@/core/devcontainer/check-no-sys-admin'
import { enforceFirewall } from '@/core/devcontainer/enforce-firewall'
import { findFirewallWindowWarnings } from '@/core/devcontainer/find-firewall-window-warnings'
import { findUnknownTopLevelFields } from '@/core/devcontainer/find-unknown-fields'
import { workspaceAllowlistPath } from '@/core/devcontainer/firewall-snapshot'
import { devcontainerJsonOf } from '@/core/paths'
import { operatorPath } from '@/core/security/path'
import { CliError } from '@/lib/cli-error'
import { DevcontainerConfigSchema } from '@/schemas/devcontainer-config'
import type { CommandDeps } from '../deps'

export interface RebuildArgs {
  cwd: string
}

/** Ports `cmd_rebuild` from install.sh — `up --remove-existing-container`. */
export async function rebuild(args: RebuildArgs, deps: CommandDeps): Promise<void> {
  const { devcontainer, docker, env, fs, logger } = deps
  const cwd = operatorPath(args.cwd)
  const dcJson = devcontainerJsonOf(cwd)

  if (await fs.exists(dcJson)) {
    const parsed = DevcontainerConfigSchema.parse(JSON.parse(await fs.readFile(dcJson)))
    const check = checkNoSysAdmin(parsed)
    if (!check.ok) {
      throw new CliError(
        `Unsafe runArgs entry '${check.offendingArg}' (${check.reason ?? 'rejected'}). Refusing to rebuild.`,
        {
          suggestion: `Remove '${check.offendingArg}' from runArgs in ${dcJson} and re-run.`,
        },
      )
    }
    const dangerous = findDangerousFields(parsed, env.HOME)
    if (dangerous.length > 0) {
      const f = dangerous[0]
      throw new CliError(`Dangerous devcontainer.json field: ${f?.reason}`, {
        suggestion: `Remove or correct '${f?.field}' in ${dcJson} and re-run.`,
      })
    }
    const unknown = findUnknownTopLevelFields(parsed)
    if (unknown.length > 0) {
      logger.warn(
        `devcontainer.json contains fields the audit does not understand: ${unknown.join(', ')}. They are passed to the runtime as-is.`,
      )
    }
    // Lifecycle hooks (`postCreateCommand`, `features`, …) run arbitrary
    // code with the container's network unrestricted. With `--secure` the
    // firewall lands *after* this window; without it the network is open
    // throughout. Warn either way so the operator knows the surface.
    const secure = await fs.exists(workspaceAllowlistPath(cwd))
    for (const w of findFirewallWindowWarnings(parsed)) {
      const prefix = secure ? 'Pre-firewall lifecycle' : 'Lifecycle hook (network is open)'
      logger.warn(`${prefix}: ${w.reason}`)
    }
  }

  await logger.withSpinner(`Rebuilding devcontainer in ${cwd}`, () =>
    devcontainer.up({ workspaceFolder: cwd, removeExistingContainer: true }),
  )

  await enforceFirewall(cwd, { docker, fs, logger, home: env.HOME })
}
