import { DEVCONTAINER_DIR, DEVCONTAINER_FILENAME } from '@/config'
import { findDangerousFields } from '@/core/devcontainer/check-dangerous-fields'
import { checkNoSysAdmin } from '@/core/devcontainer/check-no-sys-admin'
import { enforceFirewall } from '@/core/devcontainer/enforce-firewall'
import { CliError } from '@/lib/cli-error'
import { DevcontainerConfigSchema } from '@/schemas/devcontainer-config'
import type { CommandDeps } from '../deps'

export interface UpArgs {
  cwd: string
}

/**
 * Ports `cmd_up` from install.sh. Validates that no sandbox-defeating
 * `runArgs` entry has snuck into devcontainer.json, then asks the
 * devcontainer CLI to bring the container up.
 */
export async function up(args: UpArgs, deps: CommandDeps): Promise<void> {
  const { devcontainer, docker, fs, logger } = deps
  const dcJson = `${args.cwd}/${DEVCONTAINER_DIR}/${DEVCONTAINER_FILENAME}`

  if (await fs.exists(dcJson)) {
    const parsed = DevcontainerConfigSchema.parse(JSON.parse(await fs.readFile(dcJson)))
    const check = checkNoSysAdmin(parsed)
    if (!check.ok) {
      throw new CliError(
        `Unsafe runArgs entry '${check.offendingArg}' (${check.reason ?? 'rejected'}). Refusing to start.`,
        {
          suggestion: `Remove '${check.offendingArg}' from runArgs in ${dcJson} and re-run.`,
        },
      )
    }
    const dangerous = findDangerousFields(parsed)
    if (dangerous.length > 0) {
      const f = dangerous[0]
      throw new CliError(`Dangerous devcontainer.json field: ${f?.reason}`, {
        suggestion: `Remove or correct '${f?.field}' in ${dcJson} and re-run.`,
      })
    }
  }

  await logger.withSpinner(`Starting devcontainer in ${args.cwd}`, () =>
    devcontainer.up({ workspaceFolder: args.cwd }),
  )

  // Don't trust the in-container postStartCommand to apply the firewall
  // — a malicious devcontainer.json could override it. Re-run from the
  // host and abort if the script fails.
  await enforceFirewall(args.cwd, { docker, fs, logger })
}
