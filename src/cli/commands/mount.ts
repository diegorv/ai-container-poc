import { findDangerousMountPath } from '@/core/devcontainer/dangerous-mount-paths'
import { addBindMount } from '@/core/devcontainer/manipulate-mounts'
import { devcontainerJsonOf } from '@/core/paths'
import { operatorPath } from '@/core/security/path'
import { CliError } from '@/lib/cli-error'
import { hasJsoncSyntax } from '@/lib/jsonc-detect'
import { parseJsonc } from '@/lib/parse-jsonc'
import { DevcontainerConfigSchema } from '@/schemas/devcontainer-config'
import type { CommandDeps } from '../deps'

export interface MountArgs {
  cwd: string
  hostPath: string
  containerPath: string
  readonly?: boolean
  /** Override the host-path denylist (Docker socket, /etc, ~/.ssh, …). */
  allowDangerous?: boolean
}

/**
 * Ports `cmd_mount` from install.sh. Validates the host path exists,
 * adds (or replaces) the bind mount in `.devcontainer/devcontainer.json`,
 * then recreates the container so the new mount takes effect.
 */
export async function mount(args: MountArgs, deps: CommandDeps): Promise<void> {
  const { devcontainer, env, fs, logger } = deps
  const cwd = operatorPath(args.cwd)
  const dcJson = devcontainerJsonOf(cwd)

  if (!(await fs.exists(dcJson))) {
    throw new CliError(`No devcontainer.json at ${dcJson}.`, {
      suggestion: 'Run `mydevc template` to install one.',
    })
  }

  const hostPath = operatorPath(args.hostPath)
  if (!(await fs.exists(hostPath))) {
    throw new CliError(`Host path does not exist: ${hostPath}`)
  }
  const resolvedHost = await fs.realpath(hostPath)

  const danger = findDangerousMountPath(resolvedHost, env.HOME)
  if (danger && !args.allowDangerous) {
    throw new CliError(`Refusing to mount ${danger.path}: ${danger.reason}.`, {
      suggestion:
        'If you really need this mount, re-run with `--allow-dangerous`. Read the README "What you almost never want to mount" table first.',
    })
  }

  const raw = await fs.readFile(dcJson)
  if (hasJsoncSyntax(raw)) {
    logger.warn(
      `${dcJson} appears to use JSONC (comments / trailing commas). Rewriting it will drop them. Consider editing the file manually if you want to preserve formatting.`,
    )
  }
  const config = DevcontainerConfigSchema.parse(parseJsonc(raw, dcJson))
  const updatedMounts = addBindMount({
    mounts: config.mounts,
    hostPath: resolvedHost,
    containerPath: args.containerPath,
    readonly: args.readonly,
  })
  await fs.writeFile(dcJson, `${JSON.stringify({ ...config, mounts: updatedMounts }, null, 2)}\n`)

  logger.info(`Adding mount: ${resolvedHost} → ${args.containerPath}`)
  await logger.withSpinner('Recreating container with new mount', () =>
    devcontainer.up({ workspaceFolder: cwd, removeExistingContainer: true }),
  )
  logger.success(`Mount added: ${resolvedHost} → ${args.containerPath}`)
}
