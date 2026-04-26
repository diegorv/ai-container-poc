# Project Conventions

> This file is the source of truth for style, patterns, and architectural decisions.
> Optimized for both humans **and** LLMs (Claude Code, Cursor, etc.) to generate consistent code.

## Philosophy

- **Types first**: TypeScript strict, Zod at the boundaries. Runtime bugs should be nearly impossible.
- **Pragmatism**: a rule exists if it prevents a real class of bug or improves readability. Not dogma.
- **Consistency > personal preference**: predictable patterns beat local optimizations.
- **Explicit errors**: failures must be visible in the type or loud at runtime, never silent.

-----

## Stack

|Layer             |Tool               |
|------------------|-------------------|
|Runtime           |Node.js 22+ or Bun |
|Language          |TypeScript (strict)|
|Lint + Format     |Biome              |
|Runtime validation|Zod                |
|Tests             |Vitest             |
|Package manager   |pnpm               |

-----

## TypeScript

### Base tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,

    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,

    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Rules

- **No `any`.** Use `unknown` if the type is unknown and narrow it.
- **No `as` (type assertion) in production code**, except when the compiler genuinely cannot infer (rare). `as const` is fine.
- **`import type` when importing only types** — `verbatimModuleSyntax` enforces this.
- **Don’t write types manually when there’s a Zod schema.** Use `z.infer<typeof Schema>`.

```typescript
// ❌ Bad
const data = JSON.parse(raw) as User

// ✓ Good
const data = UserSchema.parse(JSON.parse(raw))
```

-----

## Lint + Format: Biome

### Base biome.json

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "linter": {
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "error",
        "noConsoleLog": "warn"
      },
      "style": {
        "useConst": "error",
        "useTemplate": "error",
        "noNonNullAssertion": "error"
      }
    }
  },
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded",
      "trailingCommas": "all"
    }
  }
}
```

### Commands

```bash
pnpm biome check --write .   # lint + format + fix
pnpm biome ci .              # check without modifying (CI)
```

-----

## Validation: Zod

Every external input passes through Zod. Internally, trust the types.

### Where to apply

|Input                               |Validate with Zod?        |
|------------------------------------|--------------------------|
|HTTP body                           |Yes                       |
|Query params                        |Yes                       |
|`process.env`                       |Yes                       |
|External API response               |Yes                       |
|JSON read from disk                 |Yes                       |
|Queue/IPC messages                  |Yes                       |
|Arguments between internal functions|No — TS already guarantees|

### Schema-first pattern

Schema is the source of truth. Type is derived.

```typescript
import { z } from 'zod'

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
  role: z.enum(['admin', 'user', 'guest']),
  createdAt: z.coerce.date(),
})

export type User = z.infer<typeof UserSchema>
```

### Env var validation

```typescript
// src/env.ts
import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

export const env = EnvSchema.parse(process.env)
```

App crashes at startup if env is invalid. Error message is descriptive.

-----

## Types and Patterns

### Discriminated unions > optional fields

When something has multiple states, model each state explicitly.

```typescript
// ❌ Bad — when do data and error coexist? When are they undefined?
type Result = {
  status: 'idle' | 'loading' | 'success' | 'error'
  data?: User
  error?: string
}

// ✓ Good — each case is complete and exhaustive
type Result =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: User }
  | { status: 'error'; error: string }
```

Bonus: `switch (state.status)` with exhaustive checking works perfectly.

### Errors: Result type for expected failures

For failures that are part of the flow (validation failed, resource not found, etc.), return a `Result`. Use `throw` only for programming errors or impossible conditions.

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

async function fetchUser(id: string): Promise<Result<User, 'NotFound' | 'NetworkError'>> {
  try {
    const res = await fetch(`/users/${id}`)
    if (res.status === 404) return { ok: false, error: 'NotFound' }
    if (!res.ok) return { ok: false, error: 'NetworkError' }
    const data = UserSchema.parse(await res.json())
    return { ok: true, value: data }
  } catch {
    return { ok: false, error: 'NetworkError' }
  }
}

// Usage
const result = await fetchUser('123')
if (!result.ok) {
  // handle error in a type-safe way
  return
}
// result.value is User here
```

### Catch always narrows

```typescript
try {
  await something()
} catch (err) {
  // err is unknown
  if (err instanceof ZodError) { /* ... */ }
  else if (err instanceof Error) { logger.error(err.message) }
  else { logger.error('Unknown error', { err }) }
}
```

### Branded types: use when confusion is real

Don’t force on every ID. Use when there’s a real risk of mixing them up (e.g., `userId` vs `accountId` in the same scope).

```typescript
type UserId = string & { readonly __brand: 'UserId' }

const toUserId = (s: string): UserId => s as UserId
```

-----

## Naming

|Type            |Convention                    |Example                    |
|----------------|------------------------------|---------------------------|
|Variables       |camelCase                     |`userName`                 |
|Booleans        |`is/has/can/should`           |`isActive`, `hasPermission`|
|Functions       |camelCase, verb               |`getUser`, `createOrder`   |
|Async           |same pattern (no Async suffix)|`fetchUser`                |
|Types/Interfaces|PascalCase                    |`User`, `OrderState`       |
|Zod schemas     |PascalCase + `Schema`         |`UserSchema`               |
|Constants       |SCREAMING_SNAKE               |`MAX_RETRIES`              |
|Files           |kebab-case                    |`user-service.ts`          |
|React components|PascalCase                    |`UserCard.tsx`             |

### Events in past tense, commands in imperative

```typescript
// Commands (intent to do something)
type CreateUser = { /* ... */ }
type PlaceOrder = { /* ... */ }

// Events (something that happened)
type UserCreated = { /* ... */ }
type OrderPlaced = { /* ... */ }
```

-----

## Folder structure

```
src/
├── schemas/        # Zod schemas — source of truth for data shapes
├── lib/            # Pure utilities, no domain dependencies
├── services/       # Business logic
├── api/            # HTTP endpoints, handlers
├── db/             # Database access
├── env.ts          # Env var validation
└── index.ts        # Entry point
```

### Imports

Use path aliases. No `../../../`.

```typescript
// ❌
import { UserSchema } from '../../../schemas/user'

// ✓
import { UserSchema } from '@/schemas/user'
```

Import order (Biome organizes automatically):

1. External libraries
1. Internal aliases (`@/`)
1. Relative (`./`)

-----

## Tests

- **Vitest** as runner.
- Co-locate: `user.ts` + `user.test.ts` in the same folder.
- Test pattern: `describe('what it is') > it('what it does')`.
- No unnecessary filesystem/network mocks — use temp dirs and MSW.

```typescript
import { describe, it, expect } from 'vitest'

describe('UserSchema', () => {
  it('validates correct user', () => {
    const result = UserSchema.safeParse({ /* ... */ })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = UserSchema.safeParse({ email: 'not-an-email' })
    expect(result.success).toBe(false)
  })
})
```

-----

## Comments

- **Explain “why”, not “what”.** The code already shows the what.
- **JSDoc on public APIs** (exported functions, public types).
- **`TODO`/`FIXME`** with context: `// TODO(#123): refactor when migrating to v2`.

```typescript
// ❌ Bad — repeats the code
// Iterates over users
for (const user of users) { /* ... */ }

// ✓ Good — explains decision
// Process in batches because the API rate-limits at 100 req/min
for (const batch of chunk(users, 50)) { /* ... */ }
```

-----

## Git

- **Conventional commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- **Imperative mood messages**: “add user validation”, not “added”.
- **Atomic commits**: one logical change per commit.
- **Branch naming**: `feat/short-name`, `fix/short-name`.

-----

## Notes for LLMs (Claude Code, Cursor, etc.)

When generating or modifying code in this project:

1. **Never use `any`.** If the type is unknown, use `unknown` and narrow.
1. **All external input requires a Zod schema.** Don’t trust `JSON.parse`.
1. **Define schemas in `src/schemas/`** and derive types with `z.infer`.
1. **For expected failures, return `Result<T, E>`.** Don’t throw.
1. **Use discriminated unions** instead of optional fields for states.
1. **Imports with `@/`**, not long relative paths.
1. **`import type` for type imports.**
1. **Before creating a new file**, check if there’s already an appropriate structure.
1. **Run `pnpm biome check --write` and `pnpm tsc --noEmit`** before considering it done.
1. **Add a test for logic changes.** Doesn’t need 100% coverage, but critical cases yes.

### When in doubt

- **About architecture**: ask before creating a new abstraction.
- **About new dependency**: ask before installing.
- **About breaking convention**: ask and justify.
- **About `any` or `as`**: practically never. If you think it’s necessary, there’s almost always a better alternative.

-----

## Quick setup

```bash
# Clone and install
pnpm install

# Checks
pnpm biome check .         # lint + format
pnpm tsc --noEmit          # typecheck
pnpm test                  # tests

# All at once
pnpm check                 # script: biome + tsc + test
```

Recommended `package.json` scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest",
    "lint": "biome check --write .",
    "typecheck": "tsc --noEmit",
    "check": "biome check . && tsc --noEmit && vitest run"
  }
}
```

-----

*Last updated: keep this file alive. When a convention changes, update here before propagating to code.*
