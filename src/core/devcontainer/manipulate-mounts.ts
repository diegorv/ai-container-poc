import { assertNoMountReservedChars, assertNoNul } from '@/core/security/untrusted-input'
import type { Mount } from '@/schemas/devcontainer-config'

/**
 * Mount targets that the upstream template manages. When extracting
 * "custom" mounts to preserve across a `template` overwrite, mounts
 * pointing at any of these paths are dropped — they're re-introduced by
 * the new template anyway.
 */
const MANAGED_TARGETS = [
  '/commandhistory',
  '/home/vscode/.claude',
  '/home/vscode/.config/gh',
  '/home/vscode/.gitconfig',
  '/workspace/.devcontainer',
] as const

export interface ParsedStringMount {
  type: 'bind' | 'volume' | 'tmpfs'
  source?: string
  target: string
  readonly: boolean
  /** All fields the user wrote, in insertion order. */
  fields: ReadonlyMap<string, string | true>
}

const KNOWN_BARE_FLAGS = new Set(['readonly', 'ro', 'volume-nocopy'])

/**
 * Parses a Docker `--mount`-style CSV string into its canonical fields,
 * throwing if the input is ambiguous or contains characters that would
 * let an attacker re-shape the spec downstream.
 *
 * The string form is what a malicious container can drop into a
 * workspace-side `devcontainer.json`. Docker's grammar has no escape
 * mechanism, so a single repeated `target=` or an embedded NUL would
 * silently change which host path gets mounted. Parsing strictly here
 * means downstream consumers (extract/merge/audit) work from a single
 * unambiguous interpretation.
 */
export function parseStringMount(raw: string): ParsedStringMount {
  assertNoNul('mount', raw)
  const fields = new Map<string, string | true>()
  for (const part of raw.split(',')) {
    if (part === '') {
      throw new Error(`mount '${raw}' has an empty field (consecutive or trailing comma)`)
    }
    const eq = part.indexOf('=')
    const key = eq < 0 ? part : part.slice(0, eq)
    const value: string | true = eq < 0 ? true : part.slice(eq + 1)
    if (key === '') {
      throw new Error(`mount '${raw}' has a field with empty key`)
    }
    if (fields.has(key)) {
      throw new Error(`mount '${raw}' has duplicate key '${key}'`)
    }
    if (value === true && !KNOWN_BARE_FLAGS.has(key)) {
      throw new Error(`mount '${raw}' field '${key}' is missing a value`)
    }
    fields.set(key, value)
  }
  const type = fields.get('type')
  if (type !== 'bind' && type !== 'volume' && type !== 'tmpfs') {
    throw new Error(`mount '${raw}' has invalid or missing type=`)
  }
  const target = fields.get('target') ?? fields.get('destination') ?? fields.get('dst')
  if (typeof target !== 'string' || target === '') {
    throw new Error(`mount '${raw}' is missing target=`)
  }
  const source = fields.get('source') ?? fields.get('src')
  return {
    type,
    source: typeof source === 'string' ? source : undefined,
    target,
    readonly: fields.has('readonly') || fields.has('ro'),
    fields,
  }
}

export interface ResolvedMount {
  type: 'bind' | 'volume' | 'tmpfs'
  source?: string
  target: string
  readonly: boolean
}

/** Returns the parsed form of either string- or object-form mount. */
function parseMount(mount: Mount): ResolvedMount {
  if (typeof mount === 'string') {
    const p = parseStringMount(mount)
    return { type: p.type, source: p.source, target: p.target, readonly: p.readonly }
  }
  return {
    type: mount.type === 'bind' || mount.type === 'volume' ? mount.type : 'volume',
    source: mount.source,
    target: mount.target,
    readonly: false,
  }
}

function targetOfMount(mount: Mount): string | undefined {
  try {
    return parseMount(mount).target
  } catch {
    return undefined
  }
}

function isManagedTarget(target: string | undefined): boolean {
  if (!target) return false
  return (MANAGED_TARGETS as readonly string[]).includes(target)
}

/**
 * Extracts the user-defined mounts (i.e. anything not pointing at one of
 * the template-managed targets). These are the mounts to preserve across
 * a `template` overwrite.
 *
 * Mirrors `extract_mounts_to_file` in install.sh.
 */
export function extractCustomMounts(mounts: readonly Mount[] | undefined): Mount[] {
  if (!mounts) return []
  return mounts.filter((m) => !isManagedTarget(targetOfMount(m)))
}

/**
 * Returns the input list with `extra` appended, deduplicated by
 * structural identity (string: literal equality; object: target match).
 *
 * Mirrors `merge_mounts_from_file` in install.sh, including the `unique`
 * jq filter at the end.
 */
export function mergeCustomMounts(
  base: readonly Mount[] | undefined,
  extra: readonly Mount[],
): Mount[] {
  const out: Mount[] = [...(base ?? [])]
  for (const candidate of extra) {
    const candidateTarget = targetOfMount(candidate)
    const exists = out.some((existing) => {
      if (typeof existing === 'string' && typeof candidate === 'string') {
        return existing === candidate
      }
      const existingTarget = targetOfMount(existing)
      return existingTarget !== undefined && existingTarget === candidateTarget
    })
    if (!exists) out.push(candidate)
  }
  return out
}

export interface AddBindMountArgs {
  mounts: readonly Mount[] | undefined
  hostPath: string
  containerPath: string
  readonly?: boolean
}

/**
 * Adds (or replaces) a bind mount. Any existing mount whose target equals
 * `containerPath` is removed first, so calling this with the same target
 * twice is idempotent — matching `update_devcontainer_mounts` in install.sh.
 *
 * Rejects paths containing characters that are reserved by Docker's
 * `--volume` CSV grammar (`,`, `=`, NUL). A `hostPath` like
 * `/tmp/x,readonly,target=/etc` would otherwise inject extra fields
 * and silently rewrite the spec. Linux filesystems allow these
 * characters in filenames, so the check is necessary even though such
 * names are rare.
 */
export function addBindMount(args: AddBindMountArgs): Mount[] {
  const { hostPath, containerPath } = args
  assertNoMountReservedChars('hostPath', hostPath)
  assertNoMountReservedChars('containerPath', containerPath)
  const filtered = (args.mounts ?? []).filter((m) => targetOfMount(m) !== containerPath)
  const parts = [`source=${hostPath}`, `target=${containerPath}`, 'type=bind']
  if (args.readonly) parts.push('readonly')
  filtered.push(parts.join(','))
  return filtered
}

// Exposed for tests / debugging.
export { isManagedTarget, MANAGED_TARGETS, parseMount, targetOfMount }
