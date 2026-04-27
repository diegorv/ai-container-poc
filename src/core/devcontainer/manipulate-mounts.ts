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

/**
 * Returns the `target=...` value embedded in a mount string.
 * Returns undefined if the mount is an object (already typed) or if no
 * target= is found.
 */
function targetOfStringMount(mount: string): string | undefined {
  // Match `target=...` up to the next comma or end of string.
  const match = mount.match(/(?:^|,)target=([^,]+)/)
  return match?.[1]
}

function targetOfMount(mount: Mount): string | undefined {
  if (typeof mount === 'string') return targetOfStringMount(mount)
  return mount.target
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
 */
export function addBindMount(args: AddBindMountArgs): Mount[] {
  const { hostPath, containerPath } = args
  const filtered = (args.mounts ?? []).filter((m) => targetOfMount(m) !== containerPath)
  const parts = [`source=${hostPath}`, `target=${containerPath}`, 'type=bind']
  if (args.readonly) parts.push('readonly')
  filtered.push(parts.join(','))
  return filtered
}

// Exposed for tests / debugging.
export { isManagedTarget, MANAGED_TARGETS, targetOfMount }
