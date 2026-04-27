/**
 * Discriminated union for expected failures. Use `Result` when a function
 * has a domain-level failure mode (validation, not-found, etc.). Use
 * `throw` only for programming errors or impossible conditions.
 *
 * See Conventions.md "Errors: Result type for expected failures".
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok

export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok

export function map<T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r
}

export function mapErr<T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error))
}

export function flatMap<T, U, E>(r: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return r.ok ? fn(r.value) : r
}

export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value
  throw r.error instanceof Error ? r.error : new Error(String(r.error))
}
