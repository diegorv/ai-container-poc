import type { Step } from './step'

/**
 * Ports `fix_directory_ownership` from post_install.py — when a mounted
 * volume comes with root ownership, this re-`chown`s it (via passwordless
 * sudo) to the current user. Failures are non-fatal.
 */
export const directoryOwnershipStep: Step = {
  name: 'fs:ownership',
  async run({ fs, homeDir, logger, shell, uid, gid }) {
    const dirs = [`${homeDir}/.claude`, '/commandhistory', `${homeDir}/.config/gh`]
    const fixed: string[] = []

    for (const dir of dirs) {
      if (!(await fs.exists(dir))) continue
      const stat = await fs.stat(dir)
      if (stat.uid === uid) continue
      const r = await shell.exec('sudo', ['chown', '-R', `${uid}:${gid}`, dir])
      if (r.exitCode !== 0) {
        logger.warn(`could not fix ownership of ${dir}: ${r.stderr.trim()}`)
        continue
      }
      fixed.push(dir)
    }

    return {
      ok: true,
      message: fixed.length === 0 ? 'no ownership changes needed' : `chown ${fixed.join(', ')}`,
    }
  },
}
