import { resolve } from 'node:path'

/**
 * Host paths that destroy or weaken the container sandbox if bind-mounted.
 * Includes the Docker socket (container escape), /etc and /usr (host
 * config / binaries), /proc and /sys (kernel state), the cloud-credentials
 * directories, and the user's home (private keys, all dotfiles).
 *
 * Reach for `--allow-dangerous` to override; the CLI displays the reason
 * before agreeing.
 */
const DANGEROUS_PREFIXES = [
  '/var/run/docker.sock',
  '/run/docker.sock',
  '/var/lib/docker',
  '/etc',
  '/proc',
  '/sys',
  '/dev',
  '/usr',
  '/boot',
  '/root',
] as const

const DANGEROUS_HOME_DIRS = ['.ssh', '.aws', '.gcp', '.azure', '.kube', '.docker'] as const

export interface DangerousPathFinding {
  path: string
  reason: string
}

/**
 * Returns a finding when `path` (already realpath-resolved by the
 * caller) matches a known-dangerous host location. Returns `undefined`
 * when the path is acceptable.
 */
export function findDangerousMountPath(
  path: string,
  homeDir: string | undefined,
): DangerousPathFinding | undefined {
  const resolved = resolve(path)

  if (resolved === '/') {
    return { path: resolved, reason: 'mounting host root exposes everything' }
  }

  for (const prefix of DANGEROUS_PREFIXES) {
    if (resolved === prefix || resolved.startsWith(`${prefix}/`)) {
      return { path: resolved, reason: `${prefix} is part of the host system / sandbox boundary` }
    }
  }

  if (homeDir && homeDir !== '') {
    if (resolved === homeDir) {
      return {
        path: resolved,
        reason:
          'mounting your entire home exposes SSH keys, dotfiles and tokens. Mount a specific subdirectory instead.',
      }
    }
    for (const sub of DANGEROUS_HOME_DIRS) {
      const dir = `${homeDir}/${sub}`
      if (resolved === dir || resolved.startsWith(`${dir}/`)) {
        return { path: resolved, reason: `${homeDir}/${sub} typically holds private credentials` }
      }
    }
  }

  return undefined
}
