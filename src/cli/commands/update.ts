import type { CommandDeps } from '../deps'

export interface UpdateArgs {
  /** Repository directory to pull from. Defaults to `process.cwd()`. */
  sourceDir: string
}

/**
 * Ports `cmd_update` from install.sh — `git -C <dir> pull --ff-only`,
 * reporting whether the SHA changed.
 */
export async function update(args: UpdateArgs, deps: CommandDeps): Promise<void> {
  const { logger, shell } = deps
  logger.info('Updating mydevc…')

  const isRepo = await shell.exec('git', [
    '-C',
    args.sourceDir,
    'rev-parse',
    '--is-inside-work-tree',
  ])
  if (isRepo.exitCode !== 0) {
    throw new Error(`Not a git repository: ${args.sourceDir}. Re-clone the project to update.`)
  }

  const before = await shell.exec('git', ['-C', args.sourceDir, 'rev-parse', 'HEAD'])
  if (before.exitCode !== 0) {
    throw new Error(`git rev-parse failed: ${before.stderr.trim()}`)
  }

  const pull = await shell.exec('git', ['-C', args.sourceDir, 'pull', '--ff-only'])
  if (pull.exitCode !== 0) {
    throw new Error(`git pull failed: ${pull.stderr.trim()}`)
  }

  const after = await shell.exec('git', ['-C', args.sourceDir, 'rev-parse', 'HEAD'])
  const beforeSha = before.stdout.trim()
  const afterSha = after.stdout.trim()
  if (beforeSha === afterSha) {
    logger.success('Already up to date')
  } else {
    logger.success(`Updated from ${beforeSha.slice(0, 7)} to ${afterSha.slice(0, 7)}`)
  }
}
