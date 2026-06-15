/**
 * Constructors and composers for `AbsolutePath` — the capability
 * brand demanded by the `FileSystem` port. This module is the *sole*
 * legitimate producer of `AbsolutePath` values; every `as`-cast that
 * brands a path lives behind `brandAs` here, so a security review
 * focuses on this file plus `untrusted-input.ts`.
 *
 * Three legitimate sources of an `AbsolutePath`:
 *
 * 1. `literalPath('/opt/mydevc/setup-firewall.sh')` — for absolute
 *    paths hard-coded in the binary. Reviewer's job to ensure the
 *    argument is a literal at the call site.
 *
 * 2. `operatorPath(args.cwd)` — for paths supplied by the operator
 *    (CLI argv, `$HOME` from the operator's shell). Validates that
 *    the value is absolute and contains no NUL byte. The operator is
 *    trusted to point anywhere they have permission for; we only
 *    block obviously-malformed input.
 *
 * 3. `joinPath(base, ...segments)` — composition. Every segment must
 *    be a `SafeFilename` (validated capability) or a literal segment
 *    wrapped via `safeFilename('subdir')`. There is no overload that
 *    accepts a raw `string` segment — that's the whole point.
 */

import { resolve as nodeResolve } from 'node:path'
import { type AbsolutePath, brandAs, type SafeFilename } from './brand'
import { asSafeFilename, UntrustedInputError } from './untrusted-input'

/**
 * Brand a string-literal absolute path as `AbsolutePath`. Convention:
 * the argument MUST be a string literal known at compile time. No
 * runtime variable should ever flow into this function — that's what
 * `operatorPath` and `joinPath` exist for.
 *
 * The runtime check is minimal (absolute + no NUL) so misuse with
 * variables fails loudly instead of silently mis-branding.
 */
export function literalPath(literal: string): AbsolutePath {
  if (literal === '' || !literal.startsWith('/')) {
    throw new UntrustedInputError('literalPath', literal, 'must be an absolute path')
  }
  if (literal.includes('\0')) {
    throw new UntrustedInputError('literalPath', literal, 'must not contain NUL bytes')
  }
  return brandAs<'absolute-path'>(literal)
}

/**
 * Brand an operator-supplied absolute path. Use for `args.cwd` (CLI
 * argv) and `env.HOME` (operator's shell environment). Throws on
 * invalid input — the operator is trusted to point anywhere, but they
 * are not trusted to feed us a NUL byte or a relative path masquerading
 * as absolute.
 */
export function operatorPath(value: string): AbsolutePath {
  if (value === '' || !value.startsWith('/')) {
    throw new UntrustedInputError('operatorPath', value, 'must be an absolute path')
  }
  if (value.includes('\0')) {
    throw new UntrustedInputError('operatorPath', value, 'must not contain NUL bytes')
  }
  // `node:path.resolve` collapses any `..` the operator typed. The
  // result is still operator-trusted; the resolve is just so downstream
  // code never sees a literal `..` segment.
  return brandAs<'absolute-path'>(nodeResolve(value))
}

/**
 * Wrap a string-literal path component as `SafeFilename`. Throws if
 * the literal is not a safe filename (POSIX charset, no separators,
 * no `.`/`..`/NUL). Convention: literal arguments only — `joinPath`
 * is the typed composer for runtime values.
 */
export function safeFilename(literal: string): SafeFilename {
  const validated = asSafeFilename(literal)
  if (!validated) {
    throw new UntrustedInputError('safeFilename', literal, 'is not a safe filename')
  }
  return validated
}

/**
 * Compose an `AbsolutePath` from a base and zero or more validated
 * segments. Every segment must be a `SafeFilename`; this means
 * literal segments need `safeFilename('foo')` and runtime values
 * need to have come out of a validator (`asSafeFilename`,
 * `asPosixUserName` happens to be a SafeFilename too — same shape).
 *
 * Output is normalised via `node:path.resolve`, so `..` and `.`
 * segments somehow smuggled in (impossible given the input types,
 * but cheap insurance) collapse before the path leaves the function.
 *
 * Defense in depth: even though the inputs are branded, we still
 * verify that the resolved path stays under `base`. A SafeFilename
 * cannot legally contain `..` — but a programmer could one day
 * widen the brand definition, so the runtime check guards against
 * that drift.
 */
export function joinPath(base: AbsolutePath, ...segments: SafeFilename[]): AbsolutePath {
  if (segments.length === 0) return base
  const joined = nodeResolve(base, ...segments)
  if (!joined.startsWith(`${base}/`) && joined !== base) {
    throw new UntrustedInputError(
      'joinPath',
      segments.join('/'),
      `would escape base '${base}' (resolved to '${joined}')`,
    )
  }
  return brandAs<'absolute-path'>(joined)
}

/**
 * Read the underlying string of an `AbsolutePath`. Most code does NOT
 * need this — capabilities are `string` subtypes and pass directly to
 * any string-accepting API. Use only when you genuinely need a `string`
 * type for an external API that won't accept the brand.
 */
export function pathString(path: AbsolutePath): string {
  return path
}
