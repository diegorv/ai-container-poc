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

/**
 * Capabilities that defeat the sandbox if granted via `--cap-add`. The
 * original check only rejected `SYS_ADMIN` and `ALL`; this list extends
 * the denylist to every capability with a documented container-escape or
 * host-tampering use case.
 *
 * Not denied: `NET_ADMIN` (needed for the firewall script), `NET_RAW`,
 * `CHOWN`, `SETUID`, `SETGID`, `SETPCAP` — common runtime needs that do
 * not, on their own, break out of the namespace.
 */
const DENIED_CAPABILITIES = new Set([
  'ALL',
  'SYS_ADMIN', // mount(), pivot_root, unshare — classic escape primitive
  'SYS_PTRACE', // attach to host processes when sharing PID ns or via /proc tricks
  'SYS_MODULE', // load arbitrary kernel modules
  'SYS_BOOT', // reboot the host
  'SYS_RAWIO', // /dev/mem, ioperm, iopl
  'SYS_TIME', // set the host clock
  'MKNOD', // create device nodes; combined with disk access = host fs read
  'DAC_READ_SEARCH', // bypass file-read DAC checks
  'DAC_OVERRIDE', // bypass r/w DAC checks
  'LINUX_IMMUTABLE', // strip immutable / append-only attrs on host bind mounts
  'BPF', // load arbitrary BPF programs
  'PERFMON', // perf_event_open on host
  'AUDIT_CONTROL', // disable host audit subsystem
  'AUDIT_READ', // read kernel audit log
  'SYSLOG', // read kernel printk buffer (KASLR leaks)
])

/**
 * Devices on the host whose names give read or write access to memory,
 * raw block storage, or kernel state. Any of these via `--device=` is a
 * straight path to host compromise.
 */
const DANGEROUS_DEVICES =
  /^\/dev\/(kmsg|mem|kmem|port|cpu_dma_latency|sd[a-z][0-9]*|hd[a-z][0-9]*|nvme[0-9]+(n[0-9]+(p[0-9]+)?)?|vd[a-z][0-9]*|xvd[a-z][0-9]*|loop[0-9]+(p[0-9]+)?|nbd[0-9]+|md[0-9]+|dm-[0-9]+|mapper\/.+|disk\/.+|block\/.+|sg[0-9]+|sr[0-9]+)$/i

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
      // Docker accepts comma-separated lists in a single `--cap-add` arg.
      // Tokenise so `--cap-add=NET_ADMIN,SYS_PTRACE` is caught.
      const caps = pair.value
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
      for (const cap of caps) {
        // Strip `CAP_` prefix — docker accepts both `SYS_ADMIN` and `CAP_SYS_ADMIN`.
        const normalised = cap.startsWith('CAP_') ? cap.slice(4) : cap
        if (DENIED_CAPABILITIES.has(normalised)) {
          return reject(pair, `--cap-add=${cap} grants a sandbox-escape capability`)
        }
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

    if (flag === '--device') {
      // Docker `--device=<host>[:<container>[:<perms>]]` — only the host
      // path matters for danger classification.
      const hostDevice = pair.value.split(':')[0] ?? ''
      if (DANGEROUS_DEVICES.test(hostDevice)) {
        return reject(pair, `--device=${pair.value} exposes a sensitive device`)
      }
    }

    if (flag === '--device-cgroup-rule') {
      // Any cgroup rule lets the container access devices directly,
      // sidestepping `--device`'s allowlist semantics.
      return reject(pair, '--device-cgroup-rule grants direct device access')
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
