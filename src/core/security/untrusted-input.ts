/**
 * Single source of truth for "what does a *safe* string from the
 * container look like". Every boundary point that consumes
 * container-controlled data (env vars, labels, devcontainer.json fields,
 * filenames extracted via `docker cp`) should validate through one of
 * these helpers instead of growing its own regex. Centralising the
 * patterns means a security review only has to read this file to know
 * the full set of rules, and adding a new rule (e.g. forbidding a new
 * unicode class) is a one-line edit instead of a hunt across modules.
 *
 * Conventions:
 * - `assert*` throws a `UntrustedInputError` on failure — use at internal
 *   boundaries where the input was already pre-screened.
 * - `is*` returns a boolean — use at the host/container seam where you
 *   want to skip the offending entry with a warning instead of aborting.
 * - All assertions reject NUL bytes unconditionally; null is a classic
 *   path-truncation vector and no legitimate field should ever contain
 *   one.
 */

export class UntrustedInputError extends Error {
  constructor(
    readonly field: string,
    readonly value: string,
    readonly rule: string,
  ) {
    super(`untrusted input '${field}' rejected: ${rule} (got '${value}')`)
    this.name = 'UntrustedInputError'
  }
}

const POSIX_USER_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/

/**
 * Filenames the host will create on disk (e.g. `~/.claude/projects/<key>`)
 * — POSIX charset only, length-capped, no `.`/`..`/empty.
 */
const SAFE_FILENAME = /^[A-Za-z0-9_.-]{1,128}$/

/**
 * Absolute paths the host will accept under a user's home or `/root`,
 * with no `..` segments. Mirrors the original `ALLOWED_CLAUDE_DIR`.
 */
const HOME_OR_ROOT_ABSOLUTE = /^\/(home\/[A-Za-z0-9_.-]+|root)(\/[A-Za-z0-9_.-]+)*$/

/**
 * Characters that are reserved by Docker's `--mount` / `--volume` CSV
 * grammar. Any of these inside a single field would let an attacker
 * inject extra fields that downstream parsers would honour.
 */
export const MOUNT_RESERVED_CHARS = [',', '=', '\0'] as const

export function isSafeFilename(value: string): boolean {
  if (value === '' || value === '.' || value === '..') return false
  if (value.includes('\0')) return false
  return SAFE_FILENAME.test(value)
}

export function isPosixUserName(value: string): boolean {
  if (value === '' || value === '.' || value === '..') return false
  if (value.includes('\0') || value.includes('..')) return false
  return POSIX_USER_NAME.test(value)
}

export function isHomeOrRootAbsolutePath(value: string): boolean {
  if (value === '' || value.includes('\0') || value.includes('..')) return false
  return HOME_OR_ROOT_ABSOLUTE.test(value)
}

export function assertNoNul(field: string, value: string): void {
  if (value.includes('\0')) {
    throw new UntrustedInputError(field, value, 'must not contain NUL bytes')
  }
}

/**
 * Throws when `value` contains a character that would let it inject
 * extra fields into a Docker `--mount` / `--volume` CSV grammar.
 */
export function assertNoMountReservedChars(field: string, value: string): void {
  for (const ch of MOUNT_RESERVED_CHARS) {
    if (value.includes(ch)) {
      const display = ch === '\0' ? 'NUL' : `'${ch}'`
      throw new UntrustedInputError(
        field,
        value,
        `must not contain Docker CSV-reserved character ${display}`,
      )
    }
  }
}

export function assertSafeFilename(field: string, value: string): void {
  if (!isSafeFilename(value)) {
    throw new UntrustedInputError(field, value, `must match ${SAFE_FILENAME}`)
  }
}

export function assertPosixUserName(field: string, value: string): void {
  if (!isPosixUserName(value)) {
    throw new UntrustedInputError(field, value, 'must be a POSIX-style user name')
  }
}
