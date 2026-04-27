import { DEVCONTAINER_DIR, DEVCONTAINER_FILENAME } from '@/config'
import { extractCustomMounts, mergeCustomMounts } from '@/core/devcontainer/manipulate-mounts'
import { DevcontainerConfigSchema } from '@/schemas/devcontainer-config'
import type { CommandDeps } from '../deps'

export interface TemplateArgs {
  /** Absolute target directory; the project that should receive .devcontainer/. */
  cwd: string
  /** Skip the overwrite confirmation when true. */
  force?: boolean
}

const TEMPLATE_FILES = ['Dockerfile', 'devcontainer.json', '.zshrc'] as const

/**
 * Ports `cmd_template` from install.sh.
 *
 * 1. If `.devcontainer/` already exists, ask for confirmation (unless
 *    `force` is true). Custom (non-managed) mounts are extracted from
 *    the existing devcontainer.json so they survive the overwrite.
 * 2. Copy template files into `.devcontainer/`.
 * 3. Merge the preserved mounts back into the new devcontainer.json.
 */
export async function template(args: TemplateArgs, deps: CommandDeps): Promise<void> {
  const { fs, logger, prompt, templatesDir } = deps
  const targetDir = `${args.cwd}/${DEVCONTAINER_DIR}`
  const targetJson = `${targetDir}/${DEVCONTAINER_FILENAME}`

  let preservedMounts: ReturnType<typeof extractCustomMounts> = []

  if (await fs.exists(targetDir)) {
    logger.warn(`Devcontainer already exists at ${targetDir}`)
    if (!args.force) {
      const proceed = await prompt.confirm('Overwrite?')
      if (!proceed) {
        logger.info('Aborted.')
        return
      }
    }

    if (await fs.exists(targetJson)) {
      const raw = await fs.readFile(targetJson)
      const parsed = DevcontainerConfigSchema.parse(JSON.parse(raw))
      preservedMounts = extractCustomMounts(parsed.mounts)
      if (preservedMounts.length > 0) {
        logger.info(`Preserving ${preservedMounts.length} custom mount(s)…`)
      }
    }
  }

  await fs.mkdir(targetDir, { recursive: true })

  for (const file of TEMPLATE_FILES) {
    await fs.copy(`${templatesDir}/${file}`, `${targetDir}/${file}`)
  }

  if (preservedMounts.length > 0) {
    const raw = await fs.readFile(targetJson)
    const config = DevcontainerConfigSchema.parse(JSON.parse(raw))
    const merged = mergeCustomMounts(config.mounts, preservedMounts)
    await fs.writeFile(targetJson, `${JSON.stringify({ ...config, mounts: merged }, null, 2)}\n`)
    logger.info('Custom mounts restored.')
  }

  logger.success(`Template installed to ${targetDir}`)
}
