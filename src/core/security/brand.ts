/**
 * Type-system primitives for the security boundary between host and
 * container. See `Arch.md` § "Security architecture" for the full
 * picture; this file is the foundation those layers stand on.
 *
 * Two kinds of brand:
 *
 * 1. `Untrusted<S>` — opaque wrapper around a string that came from a
 *    non-operator source (container env, labels, Config.User, files
 *    extracted via `docker cp`). Not assignable to `string`. Forces
 *    callers to either validate (`asPosixUserName`, `asSafeFilename`,
 *    …) or explicitly unwrap via `.unsafe()` for display-only paths.
 *
 * 2. Capability brands (`SafeFilename`, `PosixUserName`,
 *    `AbsolutePathUnder<P>`, …) — string subtypes produced *only* by
 *    validators in `core/security/`. Where a capability appears in
 *    code, the reader knows it was validated. Capabilities drop into
 *    existing `string`-accepting APIs without ceremony.
 *
 * The asymmetry is intentional: untrusted is opaque (so misuse is a
 * compile error), capabilities are transparent (so legitimate use is
 * frictionless).
 */

/**
 * Runtime symbol that backs the `Untrusted<>` phantom field. The type
 * is `unique symbol` so it's nominal at the type level; the value is a
 * real `Symbol` so the wrapper actually has a property at runtime.
 */
const UNTRUSTED: unique symbol = Symbol('untrusted')
declare const CAPABILITY_BRAND: unique symbol

/**
 * Opaque wrapper for a string value that originated from an untrusted
 * source. The phantom field carries provenance for error messages and
 * audit; the lack of a string supertype is what makes this useful — the
 * compiler will reject template literals, equality with strings, path
 * concatenation, etc.
 *
 * Construct only via `untrust()` (adapters) or via tests that mirror
 * adapter shape. Do not cast plain strings to `Untrusted` outside that
 * narrow boundary.
 */
export interface Untrusted<S extends string = string> {
  readonly [UNTRUSTED]: { readonly source: S }
  /**
   * Returns the raw string. ONLY for display, logging, equality
   * comparison, or substring matching where the value never reaches a
   * security-sensitive sink. Any use that decides an effect (path,
   * command, filename, mount field) must go through a validator
   * (`asSafeFilename`, `asPosixUserName`, …) instead.
   *
   * Greppable on purpose: every `.unsafe()` is an audit point.
   */
  unsafe(): string
}

/**
 * Sole constructor for `Untrusted<S>`. Lives in this file (not an
 * adapter) so the test fakes can also produce `Untrusted` values
 * without a special back-door — both real and fake adapters use this
 * same constructor.
 *
 * The act of *creating* an `Untrusted` is harmless. Security comes
 * from the act of *consuming* it: the only legitimate consumers are
 * the validators, which return a capability brand. Anything else has
 * to call `.unsafe()`, which is reviewable.
 */
export function untrust<S extends string>(value: string, source: S): Untrusted<S> {
  return Object.freeze({
    [UNTRUSTED]: Object.freeze({ source }),
    unsafe: () => value,
  })
}

/**
 * Convenience for adapters branding a whole record of untrusted
 * strings (e.g. container labels). Preserves keys, brands values.
 */
export function untrustRecord<S extends string>(
  values: Record<string, string>,
  source: S,
): Record<string, Untrusted<S>> {
  const out: Record<string, Untrusted<S>> = {}
  for (const [k, v] of Object.entries(values)) {
    out[k] = untrust(v, source)
  }
  return out
}

/**
 * Brand template for capability types. A capability is a `string`
 * subtype tagged with a phantom brand string; it asserts that the
 * value satisfies a specific invariant. Producers live in
 * `core/security/`; consumers can rely on the invariant without
 * re-validating.
 */
export type Capability<B extends string> = string & {
  readonly [CAPABILITY_BRAND]: B
}

/** Filename-safe POSIX charset, length-capped, no `.`/`..`/NUL/path-sep. */
export type SafeFilename = Capability<'safe-filename'>

/** POSIX user name (e.g. `vscode`, `_svc`). No `..`, no path separators. */
export type PosixUserName = Capability<'posix-username'>

/** Absolute path rooted at `/home/<user>` or `/root` (allowlist for sync). */
export type HomeOrRootAbsolutePath = Capability<'home-or-root-abs'>

/** Single Docker `--mount`/`--volume` CSV field with no reserved chars. */
export type SafeMountField = Capability<'safe-mount-field'>

/**
 * Internal escape hatch for the security module. Lives here so every
 * `as`-cast that produces a capability is grep-able as `brandAs(`.
 * Outside `core/security/`, treat any call to this as a review event.
 */
export function brandAs<B extends string>(value: string): Capability<B> {
  return value as Capability<B>
}
