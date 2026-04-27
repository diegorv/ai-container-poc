import { extractCustomMounts, mergeCustomMounts } from '@/core/devcontainer/manipulate-mounts'
import { devcontainerDirOf, devcontainerJsonOf } from '@/core/paths'
import { joinPath, operatorPath, safeFilename } from '@/core/security/path'
import { DevcontainerConfigSchema } from '@/schemas/devcontainer-config'
import type { CommandDeps } from '../deps'

export interface TemplateArgs {
  /** Absolute target directory; the project that should receive .devcontainer/. */
  cwd: string
  /** Skip the overwrite confirmation when true. */
  force?: boolean
  /**
   * When true, also copy `firewall-allowlist.txt` into `.devcontainer/`.
   * The container's `postStartCommand` will activate iptables based on it.
   */
  secure?: boolean
}

const TEMPLATE_FILES = [
  'Dockerfile',
  'devcontainer.json',
  '.zshrc',
  // Build-context files referenced by COPY directives in the Dockerfile.
  // They have to live next to the Dockerfile inside the user's
  // .devcontainer/ for `devcontainer up` (which uses .devcontainer/ as
  // the build context) to find them.
  'post-install-bootstrap.sh',
  'setup-firewall.sh',
  'chown-managed.sh',
  'sudoers.mydevc',
  '.dockerignore',
] as const
const FIREWALL_ALLOWLIST = 'firewall-allowlist.txt'

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
  const cwd = operatorPath(args.cwd)
  const targetDir = devcontainerDirOf(cwd)
  const targetJson = devcontainerJsonOf(cwd)

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
    const seg = safeFilename(file)
    await fs.copy(joinPath(templatesDir, seg), joinPath(targetDir, seg))
  }

  if (preservedMounts.length > 0) {
    const raw = await fs.readFile(targetJson)
    const config = DevcontainerConfigSchema.parse(JSON.parse(raw))
    const merged = mergeCustomMounts(config.mounts, preservedMounts)
    await fs.writeFile(targetJson, `${JSON.stringify({ ...config, mounts: merged }, null, 2)}\n`)
    logger.info('Custom mounts restored.')
  }

  if (args.secure) {
    const seg = safeFilename(FIREWALL_ALLOWLIST)
    const dest = joinPath(targetDir, seg)
    await fs.copy(joinPath(templatesDir, seg), dest)
    logger.info(`Firewall allowlist copied to ${dest}`)
  }

  logger.success(`Template installed to ${targetDir}`)
}
