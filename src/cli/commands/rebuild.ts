import { DEVCONTAINER_DIR, DEVCONTAINER_FILENAME } from '@/config'
import { checkNoSysAdmin } from '@/core/devcontainer/check-no-sys-admin'
import { CliError } from '@/lib/cli-error'
import { DevcontainerConfigSchema } from '@/schemas/devcontainer-config'
import type { CommandDeps } from '../deps'

export interface RebuildArgs {
  cwd: string
}

/** Ports `cmd_rebuild` from install.sh — `up --remove-existing-container`. */
export async function rebuild(args: RebuildArgs, deps: CommandDeps): Promise<void> {
  const { devcontainer, fs, logger } = deps
  const dcJson = `${args.cwd}/${DEVCONTAINER_DIR}/${DEVCONTAINER_FILENAME}`

  if (await fs.exists(dcJson)) {
    const parsed = DevcontainerConfigSchema.parse(JSON.parse(await fs.readFile(dcJson)))
    const check = checkNoSysAdmin(parsed)
    if (!check.ok) {
      throw new CliError(
        `SYS_ADMIN detected in runArgs (${check.offendingArg}). This defeats the read-only .devcontainer mount; refusing to rebuild.`,
        {
          suggestion: `Remove the SYS_ADMIN entry from runArgs in ${dcJson} and re-run.`,
        },
      )
    }
  }

  await logger.withSpinner(`Rebuilding devcontainer in ${args.cwd}`, () =>
    devcontainer.up({ workspaceFolder: args.cwd, removeExistingContainer: true }),
  )
}
