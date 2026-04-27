import type { DevcontainerConfig } from '@/schemas/devcontainer-config'

export interface SysAdminCheck {
  ok: boolean
  /** The runArgs entry that triggered the rejection, if any. */
  offendingArg?: string
  /** Why the entry was rejected (used in CLI error messages). */
  reason?: string
}

interface FlagPair {
  flag: string
  value: string
  /** The original runArgs index pair, for error reporting. */
  display: string
}

/**
 * Walks `runArgs` and yields normalised `--flag=value` pairs.
 * Both `--flag=value` and `--flag value` forms are handled, plus bare
 * flags (no value) like `--privileged`.
 */
function* iterFlags(runArgs: readonly string[]): Generator<FlagPair> {
  for (let i = 0; i < runArgs.length; i++) {
    const raw = runArgs[i] ?? ''
    if (!raw.startsWith('-')) continue
    const eq = raw.indexOf('=')
    if (eq !== -1) {
      yield { flag: raw.slice(0, eq), value: raw.slice(eq + 1), display: raw }
      continue
    }
    const next = runArgs[i + 1]
    if (next !== undefined && !next.startsWith('-')) {
      yield { flag: raw, value: next, display: `${raw} ${next}` }
      i += 1
      continue
    }
    yield { flag: raw, value: '', display: raw }
  }
}

const HOST_NAMESPACE_FLAGS = new Set([
  '--pid',
  '--ipc',
  '--uts',
  '--userns',
  '--cgroupns',
  '--network', // --network=host bypasses iptables OUTPUT entirely
  '--net', // legacy alias
])

const DANGEROUS_DEVICES = /^\/dev\/(kmsg|mem|kmem|cpu_dma_latency)$/i

const DANGEROUS_MOUNT_SOURCES = ['/var/run/docker.sock', '/run/docker.sock', '/var/lib/docker']

function reject(pair: FlagPair, reason: string): SysAdminCheck {
  return { ok: false, offendingArg: pair.display, reason }
}

function inspectMountSpec(spec: string): string | undefined {
  // `--volume=/host:/ct[:opts]` or `-v /host:/ct[:opts]`
  // also `--mount=type=bind,source=/host,target=/ct`
  const lower = spec.toLowerCase()
  if (lower.startsWith('type=')) {
    const sourceMatch = spec.match(/(?:^|,)source=([^,]+)/i)
    const source = sourceMatch?.[1] ?? ''
    if (source === '' || source === '/') return 'mounts host root'
    for (const dangerous of DANGEROUS_MOUNT_SOURCES) {
      if (source === dangerous) return `mounts the Docker socket (${dangerous})`
    }
    return undefined
  }
  // bind syntax
  const [source = ''] = spec.split(':')
  if (source === '/') return 'mounts host root'
  for (const dangerous of DANGEROUS_MOUNT_SOURCES) {
    if (source === dangerous) return `mounts the Docker socket (${dangerous})`
  }
  return undefined
}

/**
 * Returns `{ ok: false }` when any `runArgs` entry would defeat the
 * sandbox. The original install.sh only rejected SYS_ADMIN; this version
 * additionally rejects `--privileged`, `--cap-add=ALL`, host namespace
 * sharing, mounts of the Docker socket / host root via `-v` or `--mount`,
 * `seccomp=unconfined`, `apparmor=unconfined`, and access to dangerous
 * devices. The function name is preserved for backwards compatibility.
 */
export function checkNoSysAdmin(config: DevcontainerConfig): SysAdminCheck {
  const runArgs = config.runArgs ?? []

  for (const pair of iterFlags(runArgs)) {
    const flag = pair.flag

    if (flag === '--privileged') {
      return reject(pair, '--privileged grants every capability')
    }

    if (flag === '--cap-add') {
      const cap = pair.value.toUpperCase()
      if (cap === 'ALL' || cap.includes('SYS_ADMIN')) {
        return reject(pair, `--cap-add=${cap} would re-introduce SYS_ADMIN`)
      }
    }

    if (flag === '--security-opt') {
      const v = pair.value.toLowerCase().replace(/\s+/g, '')
      if (v.includes('seccomp=unconfined') || v.includes('seccomp:unconfined')) {
        return reject(pair, 'seccomp=unconfined disables the syscall filter')
      }
      if (v.includes('apparmor=unconfined') || v.includes('apparmor:unconfined')) {
        return reject(pair, 'apparmor=unconfined disables the MAC profile')
      }
    }

    if (HOST_NAMESPACE_FLAGS.has(flag) && pair.value.toLowerCase() === 'host') {
      return reject(pair, `${flag}=host shares the host namespace`)
    }

    if (flag === '--device' && DANGEROUS_DEVICES.test(pair.value)) {
      return reject(pair, `--device=${pair.value} exposes a sensitive device`)
    }

    if (flag === '--volume' || flag === '-v' || flag === '--mount') {
      const reason = inspectMountSpec(pair.value)
      if (reason) return reject(pair, reason)
    }
  }

  // Fallback: also catch raw substring SYS_ADMIN in any arg (e.g. inside
  // a `--security-opt` blob we didn't explicitly enumerate).
  const rawSysAdmin = runArgs.find((arg) => arg.includes('SYS_ADMIN'))
  if (rawSysAdmin) {
    return { ok: false, offendingArg: rawSysAdmin, reason: 'mentions SYS_ADMIN' }
  }

  return { ok: true }
}
