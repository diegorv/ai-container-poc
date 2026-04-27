import { DEVCONTAINER_DIR, DEVCONTAINER_FILENAME } from '@/config'
import { findDangerousFields } from '@/core/devcontainer/check-dangerous-fields'
import { checkNoSysAdmin } from '@/core/devcontainer/check-no-sys-admin'
import { CliError } from '@/lib/cli-error'
import { DevcontainerConfigSchema } from '@/schemas/devcontainer-config'
import type { CommandDeps } from '../deps'

export interface ValidateArgs {
  cwd: string
}

/**
 * Loads `.devcontainer/devcontainer.json` and runs every guard mydevc
 * applies elsewhere (Zod schema, SYS_ADMIN check). Useful in project CI
 * to catch a malformed file before someone tries to `mydevc up`.
 *
 * Exits non-zero (via thrown CliError) on any failure so the command
 * plugs into shell pipelines without extra parsing.
 */
export async function validate(args: ValidateArgs, deps: CommandDeps): Promise<void> {
  const { fs, logger } = deps
  const dcDir = `${args.cwd}/${DEVCONTAINER_DIR}`
  const dcJson = `${dcDir}/${DEVCONTAINER_FILENAME}`

  if (!(await fs.exists(dcJson))) {
    throw new CliError(`No devcontainer.json at ${dcJson}.`, {
      suggestion: 'Run `mydevc template` to install one.',
    })
  }

  const raw = await fs.readFile(dcJson)
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err) {
    throw new CliError(`devcontainer.json is not valid JSON: ${(err as Error).message}`)
  }

  const parsed = DevcontainerConfigSchema.safeParse(json)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n')
    throw new CliError(
      `devcontainer.json failed schema validation (${parsed.error.issues.length} issue${
        parsed.error.issues.length === 1 ? '' : 's'
      }):\n${issues}`,
    )
  }

  const sys = checkNoSysAdmin(parsed.data)
  if (!sys.ok) {
    throw new CliError(
      `runArgs contains an unsafe entry '${sys.offendingArg}' (${sys.reason ?? 'rejected'}).`,
      { suggestion: `Remove '${sys.offendingArg}' from runArgs in ${dcJson}.` },
    )
  }

  const dangerous = findDangerousFields(parsed.data)
  if (dangerous.length > 0) {
    const lines = dangerous.map((d) => `  - ${d.field}: ${d.reason}`).join('\n')
    throw new CliError(
      `devcontainer.json contains ${dangerous.length} dangerous field(s):\n${lines}`,
      { suggestion: `Remove the offending fields from ${dcJson}.` },
    )
  }

  logger.success(`devcontainer.json at ${dcJson} is valid.`)
}
