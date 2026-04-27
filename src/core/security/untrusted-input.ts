/**
 * Validators that bridge `Untrusted<S>` (opaque, from a non-operator
 * source) to capability brands (`SafeFilename`, `PosixUserName`, …).
 * These are the *only* legitimate producers of capabilities — every
 * `as`-cast that brands a value lives behind `brandAs` in `brand.ts`.
 *
 * Two flavours of API:
 *
 * - `as*(input)` — returns the capability or `undefined`. Use when
 *   the caller wants to skip the offending entry with a warning.
 * - `assert*(field, input)` — throws `UntrustedInputError`. Use when
 *   continuing past invalid input would be unsafe (mount strings,
 *   command-grammar fields).
 *
 * Both flavours accept either an `Untrusted<S>` (the common case at the
 * boundary) or a raw string (used inside `core/security/` itself, e.g.
 * `parseStringMount` validating individual CSV fields). The runtime
 * behaviour is the same; the type is what forces the caller to decide.
 */

import {
  type HomeOrRootAbsolutePath,
  type PosixUserName,
  type SafeFilename,
  type SafeMountField,
  type Untrusted,
  brandAs,
} from './brand'

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
 * Characters reserved by Docker's `--mount` / `--volume` CSV grammar.
 * Inside a single field, any of these would let an attacker inject
 * extra fields that downstream parsers honour as their own.
 */
export const MOUNT_RESERVED_CHARS = [',', '=', '\0'] as const

/** Returns the underlying string of either an `Untrusted<>` or a raw string. */
function rawOf(input: Untrusted | string): string {
  return typeof input === 'string' ? input : input.unsafe()
}

// ─────────────────────────────────────────────────────────────────────
//  Predicates (use when you want to skip with a warning)
// ─────────────────────────────────────────────────────────────────────

export function asSafeFilename(input: Untrusted | string): SafeFilename | undefined {
  const value = rawOf(input)
  if (value === '' || value === '.' || value === '..') return undefined
  if (value.includes('\0')) return undefined
  if (!SAFE_FILENAME.test(value)) return undefined
  return brandAs<'safe-filename'>(value)
}

export function asPosixUserName(input: Untrusted | string): PosixUserName | undefined {
  const value = rawOf(input)
  if (value === '' || value === '.' || value === '..') return undefined
  if (value.includes('\0') || value.includes('..')) return undefined
  if (!POSIX_USER_NAME.test(value)) return undefined
  return brandAs<'posix-username'>(value)
}

export function asHomeOrRootAbsolutePath(
  input: Untrusted | string,
): HomeOrRootAbsolutePath | undefined {
  const value = rawOf(input)
  if (value === '' || value.includes('\0') || value.includes('..')) return undefined
  if (!HOME_OR_ROOT_ABSOLUTE.test(value)) return undefined
  return brandAs<'home-or-root-abs'>(value)
}

// ─────────────────────────────────────────────────────────────────────
//  Assertions (use when continuing past invalid input would be unsafe)
// ─────────────────────────────────────────────────────────────────────

export function assertNoNul(field: string, input: Untrusted | string): void {
  const value = rawOf(input)
  if (value.includes('\0')) {
    throw new UntrustedInputError(field, value, 'must not contain NUL bytes')
  }
}

export function assertNoMountReservedChars(
  field: string,
  input: Untrusted | string,
): SafeMountField {
  const value = rawOf(input)
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
  return brandAs<'safe-mount-field'>(value)
}

export function assertSafeFilename(field: string, input: Untrusted | string): SafeFilename {
  const result = asSafeFilename(input)
  if (!result) {
    throw new UntrustedInputError(field, rawOf(input), `must match ${SAFE_FILENAME}`)
  }
  return result
}

export function assertPosixUserName(field: string, input: Untrusted | string): PosixUserName {
  const result = asPosixUserName(input)
  if (!result) {
    throw new UntrustedInputError(field, rawOf(input), 'must be a POSIX-style user name')
  }
  return result
}
