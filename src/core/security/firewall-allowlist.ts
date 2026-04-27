/**
 * Validates and renders the firewall allowlist on the host before it
 * reaches `setup-firewall.sh` inside the container.
 *
 * Why this lives in `core/security/`:
 *
 * The allowlist file lives at `.devcontainer/firewall-allowlist.txt`
 * inside the workspace. The workspace is mounted into the container,
 * which means *anything* that can write into the workspace (Claude
 * Code on the host being persuaded by container output, an editor
 * extension, a careless `git pull` of a malicious branch) can change
 * which destinations the firewall lets out. The next `mydevc up` /
 * `rebuild` then re-applies the modified rules.
 *
 * Two failure modes we defend against here:
 *
 * 1. **Content drift** — entries are silently swapped for exfil
 *    destinations. The validator can't tell `evil.com` apart from
 *    `github.com`, but it can produce a deterministic, auditable file
 *    whose lines are strictly hostnames or IPs (no comments, no
 *    surprise whitespace, no surrogate characters). The host CLI
 *    snapshots this canonical form into a path the container cannot
 *    influence.
 *
 * 2. **Command-grammar smuggling** — a line like `evil.com; iptables
 *    -F OUTPUT` would be passed to `iptables -d "$line"` as a single
 *    arg today (so it'd error out in iptables itself), but reasoning
 *    about that safety end-to-end across two languages is fragile. A
 *    strict whitelist of hostname / IPv4 / IPv6 syntax cuts the
 *    attack surface to exactly what iptables expects, no more.
 *
 * The grammar is intentionally narrower than RFC 1123 / RFC 4291 —
 * we accept what `iptables -d` actually resolves: dotted hostnames,
 * dotted-quad IPv4, and `[a-fA-F0-9:]+` IPv6 with optional `/<mask>`
 * suffix. Underscores in DNS labels are accepted because some
 * SRV-style hostnames legitimately contain them.
 */

const COMMENT_OR_BLANK = /^\s*(?:#.*)?$/

/** RFC 1123 host label, plus underscore (used by some SRV records). */
const HOST_LABEL = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?$/

/** A label made entirely of digits — disallowed at the TLD position so
 *  `999.0.0.1` (a malformed IPv4) does not silently succeed as a "hostname". */
const ALL_DIGITS = /^[0-9]+$/

/** Optional CIDR suffix `/0..32` (IPv4) or `/0..128` (IPv6). */
const CIDR_SUFFIX = /^\/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-8])$/

/** Hostname: 1+ labels separated by `.`, total length ≤ 253. */
function isHostname(value: string): boolean {
  if (value.length === 0 || value.length > 253) return false
  if (value.endsWith('.')) return false
  const labels = value.split('.')
  if (!labels.every((label) => HOST_LABEL.test(label))) return false
  // Reject "looks like an IP but isn't" — every label numeric, but the
  // value didn't pass `isIPv4`. Without this, `999.0.0.1` would slip
  // through as a "hostname" even though no DNS server would ever
  // resolve it.
  if (labels.every((l) => ALL_DIGITS.test(l))) return false
  return true
}

/** Dotted-quad IPv4. Each octet 0..255, no leading zeros beyond `0`. */
function isIPv4(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  for (const part of parts) {
    if (part.length === 0 || part.length > 3) return false
    if (!/^[0-9]+$/.test(part)) return false
    if (part.length > 1 && part.startsWith('0')) return false
    const n = Number(part)
    if (n > 255) return false
  }
  return true
}

/**
 * IPv6 with optional `::` compression and optional embedded IPv4 in
 * the last 32 bits. Conservative: rejects zone IDs (`%eth0`) since
 * `iptables -d` does not honour them.
 */
function isIPv6(value: string): boolean {
  if (value.length === 0) return false
  if (!/^[0-9A-Fa-f:.]+$/.test(value)) return false
  // Reject more than one `::` compression marker.
  const compressionMarkers = value.split('::').length - 1
  if (compressionMarkers > 1) return false

  // Split into the head/tail around `::` (or treat the whole thing as
  // head when no `::` is present).
  const [headRaw, tailRaw] = compressionMarkers === 1 ? value.split('::') : [value, undefined]
  const head = (headRaw ?? '') === '' ? [] : (headRaw ?? '').split(':')
  const tail = tailRaw === undefined || tailRaw === '' ? [] : tailRaw.split(':')
  const groups = [...head, ...tail]
  if (groups.length === 0 && compressionMarkers !== 1) return false

  // Last group may be a dotted-quad IPv4 (covers ::ffff:1.2.3.4).
  let hexGroups = groups
  const last = groups[groups.length - 1]
  if (last?.includes('.')) {
    if (!isIPv4(last)) return false
    hexGroups = groups.slice(0, -1)
    // IPv4 occupies 32 bits ≡ 2 groups.
    const expected = compressionMarkers === 1 ? null : 6
    if (expected !== null && hexGroups.length !== expected) return false
  } else if (compressionMarkers !== 1 && groups.length !== 8) {
    return false
  }

  for (const g of hexGroups) {
    if (g.length === 0 || g.length > 4) return false
    if (!/^[0-9A-Fa-f]+$/.test(g)) return false
  }
  return true
}

export interface FirewallAllowlistEntry {
  /** Original line number in the source file (1-indexed). */
  readonly line: number
  /** The validated value (hostname, IPv4, IPv6, optionally with CIDR). */
  readonly value: string
}

export interface FirewallAllowlistRejection {
  readonly line: number
  readonly raw: string
  readonly reason: string
}

export interface FirewallAllowlistParse {
  readonly entries: readonly FirewallAllowlistEntry[]
  readonly rejected: readonly FirewallAllowlistRejection[]
}

/**
 * Parses an allowlist file. Comments and blank lines are dropped.
 * Each non-empty line must be a hostname, IPv4, or IPv6 (with optional
 * `/mask` suffix); anything else lands in `rejected` so the caller can
 * surface a single error listing every offending line.
 */
export function parseFirewallAllowlist(content: string): FirewallAllowlistParse {
  const entries: FirewallAllowlistEntry[] = []
  const rejected: FirewallAllowlistRejection[] = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? ''
    if (raw.includes('\0')) {
      rejected.push({ line: i + 1, raw, reason: 'contains NUL byte' })
      continue
    }
    if (COMMENT_OR_BLANK.test(raw)) continue
    // Strip trailing `# comment` so users can annotate inline.
    const noComment = raw.replace(/\s+#.*$/, '')
    const trimmed = noComment.trim()
    if (trimmed === '') continue

    let host = trimmed
    let cidr = ''
    const slashIdx = trimmed.indexOf('/')
    if (slashIdx !== -1) {
      host = trimmed.slice(0, slashIdx)
      cidr = trimmed.slice(slashIdx)
    }

    if (cidr !== '' && !CIDR_SUFFIX.test(cidr)) {
      rejected.push({ line: i + 1, raw, reason: `invalid CIDR mask '${cidr}'` })
      continue
    }

    const isIp = isIPv4(host) || isIPv6(host)
    const isHost = !isIp && isHostname(host)
    if (!isIp && !isHost) {
      rejected.push({ line: i + 1, raw, reason: 'not a valid hostname or IP address' })
      continue
    }
    if (cidr !== '' && isHost) {
      rejected.push({ line: i + 1, raw, reason: 'CIDR mask only allowed with IP literal' })
      continue
    }

    entries.push({ line: i + 1, value: `${host}${cidr}` })
  }
  return { entries, rejected }
}

/**
 * Renders a sanitized allowlist file. The output format is intentionally
 * minimal and stable: a banner, then one entry per line. No comments
 * propagate from the source — the host snapshot is a derived artifact,
 * not a place for human notes.
 */
export function renderFirewallAllowlist(entries: readonly FirewallAllowlistEntry[]): string {
  const header =
    '# Generated by mydevc. Edit .devcontainer/firewall-allowlist.txt and re-run mydevc up.\n'
  const body = entries.map((e) => e.value).join('\n')
  return entries.length === 0 ? header : `${header}${body}\n`
}
