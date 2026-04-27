import type { AbsolutePath } from '@/core/security/brand'
import { joinPath, safeFilename } from '@/core/security/path'
import type { CommandDeps } from '../deps'

const LOCAL_SEG = safeFilename('.local')
const BIN_SEG = safeFilename('bin')
const MYDEVC_SEG = safeFilename('mydevc')

export interface SelfInstallArgs {
  /** Path to the existing `mydevc` binary that will be linked into PATH. */
  sourceBin: AbsolutePath
  /** Override `$HOME` (mostly for tests). */
  homeDir?: AbsolutePath
  /** Override the install directory; defaults to `<home>/.local/bin`. */
  installDir?: AbsolutePath
}

/**
 * Ports `cmd_self_install` from install.sh — symlinks the current binary
 * into `~/.local/bin/mydevc` and warns if that directory isn't on PATH.
 */
export async function selfInstall(args: SelfInstallArgs, deps: CommandDeps): Promise<void> {
  const { env, fs, logger } = deps
  const home = args.homeDir ?? env.HOME
  const installDir = args.installDir ?? joinPath(home, LOCAL_SEG, BIN_SEG)
  const installPath = joinPath(installDir, MYDEVC_SEG)

  await fs.mkdir(installDir, { recursive: true })

  // ln -sf: remove an existing entry first so the symlink replaces it.
  if (await fs.exists(installPath)) {
    await fs.remove(installPath, { force: true })
  }
  await fs.symlink(args.sourceBin, installPath)
  logger.success(`Installed 'mydevc' to ${installPath}`)

  const path = env.PATH ?? ''
  if (!`:${path}:`.includes(`:${installDir}:`)) {
    logger.warn(`${installDir} is not in your PATH`)
    logger.info('Add this to your shell profile:')
    logger.info(`    export PATH="${installDir}:$PATH"`)
  }
}
