/**
 * Type-level proofs that the brand layer can't be silently bypassed.
 * Any failure here means the security boundary regressed; the runtime
 * tests in `untrusted-input.test.ts` cover validator behaviour, this
 * file covers what the *compiler* enforces.
 *
 * Vitest's `expectTypeOf` is the assertion tool; the checks run as
 * part of `pnpm typecheck` (no test body required).
 */

import { expectTypeOf, test } from 'vitest'
import {
  type AbsolutePath,
  type HomeOrRootAbsolutePath,
  type PosixUserName,
  type SafeFilename,
  type Untrusted,
  untrust,
} from './brand'
import { joinPath, literalPath, safeFilename } from './path'
import { asHomeOrRootAbsolutePath, asPosixUserName, asSafeFilename } from './untrusted-input'

test('Untrusted is not assignable to string', () => {
  const value = untrust('foo', 'test')
  // The whole point: an untrusted value must not flow into a `string`
  // slot without explicit unwrap or validation.
  expectTypeOf(value).not.toEqualTypeOf<string>()
  expectTypeOf<Untrusted<'test'>>().not.toMatchTypeOf<string>()
})

test('string is not assignable to Untrusted (no implicit narrowing)', () => {
  expectTypeOf<string>().not.toMatchTypeOf<Untrusted>()
})

test('capability brands are subtypes of string (drop in at sinks)', () => {
  expectTypeOf<SafeFilename>().toMatchTypeOf<string>()
  expectTypeOf<PosixUserName>().toMatchTypeOf<string>()
  expectTypeOf<HomeOrRootAbsolutePath>().toMatchTypeOf<string>()
})

test('capability brands are not interchangeable with each other', () => {
  expectTypeOf<SafeFilename>().not.toMatchTypeOf<PosixUserName>()
  expectTypeOf<PosixUserName>().not.toMatchTypeOf<SafeFilename>()
  expectTypeOf<HomeOrRootAbsolutePath>().not.toMatchTypeOf<SafeFilename>()
})

test('plain string is not assignable to a capability brand', () => {
  expectTypeOf<string>().not.toMatchTypeOf<SafeFilename>()
  expectTypeOf<string>().not.toMatchTypeOf<PosixUserName>()
})

test('validators return capability | undefined', () => {
  expectTypeOf(asSafeFilename).returns.toEqualTypeOf<SafeFilename | undefined>()
  expectTypeOf(asPosixUserName).returns.toEqualTypeOf<PosixUserName | undefined>()
  expectTypeOf(asHomeOrRootAbsolutePath).returns.toEqualTypeOf<HomeOrRootAbsolutePath | undefined>()
})

test('validators accept Untrusted<S> for any S', () => {
  const fromUser = untrust('vscode', 'docker.config.user')
  const fromEnv = untrust('/home/vscode/.claude', 'docker.config.env')
  // No type error — validators are source-agnostic.
  expectTypeOf(asPosixUserName).toBeCallableWith(fromUser)
  expectTypeOf(asHomeOrRootAbsolutePath).toBeCallableWith(fromEnv)
})

test('Untrusted preserves provenance in the type', () => {
  const v = untrust('x', 'docker.config.user')
  expectTypeOf(v).toEqualTypeOf<Untrusted<'docker.config.user'>>()
})

test('AbsolutePath is a string subtype but not interchangeable with other capabilities', () => {
  expectTypeOf<AbsolutePath>().toMatchTypeOf<string>()
  expectTypeOf<AbsolutePath>().not.toMatchTypeOf<SafeFilename>()
  expectTypeOf<SafeFilename>().not.toMatchTypeOf<AbsolutePath>()
  expectTypeOf<string>().not.toMatchTypeOf<AbsolutePath>()
})

test('joinPath demands SafeFilename segments — raw strings are rejected', () => {
  const base = literalPath('/opt')
  // SafeFilename arg compiles:
  expectTypeOf(joinPath).toBeCallableWith(base, safeFilename('a'))
  // The signature is `(base: AbsolutePath, ...segs: SafeFilename[])`,
  // so a raw `string` segment doesn't satisfy the parameter type.
  expectTypeOf(joinPath).parameters.toEqualTypeOf<[AbsolutePath, ...SafeFilename[]]>()
})

test('literalPath returns AbsolutePath', () => {
  expectTypeOf(literalPath).returns.toEqualTypeOf<AbsolutePath>()
})
