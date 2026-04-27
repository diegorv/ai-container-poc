# TypeScript Refactoring: Proposed Structure

> Reimplementation of `claude-code-devcontainer` (TrailOfBits) in TypeScript with clean architecture, focused on testability without fragile mocks and clearly separated domains.

## Architectural philosophy

Three principles guide every decision:

**1. Pure core, IO at the edges**

Business logic (composing profiles, validating configs, generating Dockerfiles) is pure functions — takes input, returns output, no side effects. IO (reading files, calling docker, executing shell) is isolated in adapters. This makes the core 100% testable without any mock.

**2. Hexagonal (Ports & Adapters)**

Each external dependency (filesystem, docker, devcontainer CLI, shell) has an **interface** (port) and multiple **implementations** (adapters). In production we use the real one; in tests, an in-memory fake. No `vi.mock()`, no `jest.mock()`, no hacks.

**3. Commands as use cases**

Each CLI subcommand (`init`, `up`, `shell`, etc.) is an isolated use case that receives its dependencies via injection. Adding a new command = adding a new file. No touching parser or dispatcher.

-----

## Mapping from original code

|Original code                         |TypeScript equivalent                                  |
|--------------------------------------|-------------------------------------------------------|
|`install.sh` (parser + dispatcher)    |`src/cli/index.ts` + `src/cli/parser.ts`               |
|`install.sh` (cmd_template)           |`src/core/template/copy-template.ts`                   |
|`install.sh` (cmd_up, cmd_shell, etc.)|`src/cli/commands/*.ts`                                |
|`install.sh` (cmd_destroy)            |`src/cli/commands/destroy.ts` + `src/adapters/docker/*`|
|`install.sh` (cmd_self_install)       |Eliminated — `pnpm install -g` handles it              |
|`post_install.py` (configurations)    |`src/container-init/steps/*.ts`                        |
|`post_install.py` (orchestration)     |`src/container-init/runner.ts`                         |

New features (not in the original):

- Profile system → `src/core/compose/`
- `info` command (from ClaudeBox) → `src/cli/commands/info.ts`
- `clean` command with subopts → `src/cli/commands/clean.ts`

-----

## Folder structure

```
mydevc/
├── src/
│   ├── cli/                          # Presentation layer
│   │   ├── index.ts                  # Binary entry point
│   │   ├── parser.ts                 # Argv parsing (Citty or cleye)
│   │   └── commands/                 # Each command = 1 file
│   │   │   ├── init.ts
│   │   │   ├── up.ts
│   │   │   ├── shell.ts
│   │   │   ├── exec.ts
│   │   │   ├── rebuild.ts
│   │   │   ├── destroy.ts
│   │   │   ├── info.ts
│   │   │   └── clean.ts
│   │
│   ├── core/                         # Pure logic (no IO)
│   │   ├── compose/
│   │   │   ├── compose-dockerfile.ts # Joins profiles into Dockerfile
│   │   │   └── compose-dockerfile.test.ts
│   │   ├── profile/
│   │   │   ├── list-profiles.ts
│   │   │   ├── validate-profile.ts
│   │   │   └── *.test.ts
│   │   └── project/
│   │       ├── compute-project-id.ts # Deterministic ID from path
│   │       ├── detect-language.ts    # Inspects project to suggest profiles
│   │       └── *.test.ts
│   │
│   ├── ports/                        # Interfaces (contracts)
│   │   ├── filesystem.ts
│   │   ├── docker.ts
│   │   ├── devcontainer.ts
│   │   ├── shell.ts
│   │   └── logger.ts
│   │
│   ├── adapters/                     # Port implementations
│   │   ├── filesystem/
│   │   │   ├── node-fs.ts            # Real (fs/promises)
│   │   │   └── memory-fs.ts          # In-memory fake
│   │   ├── docker/
│   │   │   ├── cli-docker.ts         # Real (subprocess)
│   │   │   └── fake-docker.ts        # Fake with in-memory state
│   │   ├── devcontainer/
│   │   │   ├── cli-devcontainer.ts   # @devcontainers/cli
│   │   │   └── fake-devcontainer.ts
│   │   ├── shell/
│   │   │   ├── execa-shell.ts        # Real (execa)
│   │   │   └── fake-shell.ts
│   │   └── logger/
│   │       ├── pino-logger.ts        # Real
│   │       └── memory-logger.ts      # Captures logs in array
│   │
│   ├── schemas/                      # Zod schemas (source of truth)
│   │   ├── profile.ts
│   │   ├── devcontainer-config.ts
│   │   ├── project-info.ts
│   │   └── env.ts
│   │
│   ├── container-init/               # Runs INSIDE the container
│   │   ├── index.ts                  # Entry point (separate binary)
│   │   ├── runner.ts                 # Orchestrates steps
│   │   └── steps/
│   │       ├── step.ts               # Step + StepResult interfaces
│   │       ├── claude-bypass.ts
│   │       ├── github-cli.ts
│   │       ├── git-config.ts
│   │       ├── git-delta.ts
│   │       ├── skills.ts
│   │       └── *.test.ts
│   │
│   ├── lib/                          # Generic utilities
│   │   ├── result.ts                 # Result<T, E> + helpers
│   │   ├── path-utils.ts
│   │   └── deep-merge.ts
│   │
│   └── config.ts                     # Constants, paths
│
├── templates/                        # Static resources (non-TS)
│   ├── Dockerfile.base
│   ├── devcontainer.json.template
│   ├── post-install-bootstrap.sh
│   ├── .zshrc
│   └── profiles/
│       ├── ml.dockerfile
│       ├── webdev.dockerfile
│       ├── embedded.dockerfile
│       └── ...
│
├── tests/
│   ├── unit/                         # Core tests (pure)
│   ├── integration/                  # Real adapters (filesystem, etc.)
│   └── e2e/                          # Boots a real container
│
├── package.json
├── tsconfig.json
├── biome.json
├── vitest.config.ts
└── README.md
```

-----

## Principles in detail

### 1. Ports are minimalist interfaces

Each port defines **only what the core actually uses**. Don’t copy the full `fs` or Docker API — only what’s needed.

```typescript
// src/ports/filesystem.ts
export interface FileSystem {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  readdir(path: string): Promise<string[]>
  copy(src: string, dest: string): Promise<void>
}
```

```typescript
// src/ports/docker.ts
export interface DockerClient {
  listContainers(filter?: { label?: string }): Promise<Container[]>
  removeContainer(id: string, options?: { force?: boolean }): Promise<void>
  listVolumes(filter?: { name?: string }): Promise<Volume[]>
  removeVolume(name: string): Promise<void>
  imageExists(name: string): Promise<boolean>
  systemDf(): Promise<SystemUsage>
}
```

### 2. Real adapter is “dumb” — just translates

```typescript
// src/adapters/filesystem/node-fs.ts
import { readFile, writeFile, mkdir, /* ... */ } from 'node:fs/promises'
import type { FileSystem } from '@/ports/filesystem'

export const nodeFs: FileSystem = {
  readFile: (path) => readFile(path, 'utf-8'),
  writeFile: (path, content) => writeFile(path, content),
  exists: async (path) => {
    try { await stat(path); return true } catch { return false }
  },
  mkdir: (path, options) => mkdir(path, options),
  readdir: (path) => readdir(path),
  copy: (src, dest) => cp(src, dest, { recursive: true }),
}
```

No logic. Just a bridge between interface and implementation.

### 3. Fake adapter is in-memory state

```typescript
// src/adapters/filesystem/memory-fs.ts
import type { FileSystem } from '@/ports/filesystem'

export function createMemoryFs(initial: Record<string, string> = {}): FileSystem & {
  snapshot(): Record<string, string>
} {
  const files = new Map<string, string>(Object.entries(initial))

  return {
    async readFile(path) {
      const content = files.get(path)
      if (content === undefined) throw new Error(`ENOENT: ${path}`)
      return content
    },
    async writeFile(path, content) {
      files.set(path, content)
    },
    async exists(path) {
      return files.has(path)
    },
    async mkdir() { /* no-op in memory */ },
    async readdir(path) {
      return [...files.keys()]
        .filter(p => p.startsWith(path + '/'))
        .map(p => p.slice(path.length + 1).split('/')[0])
    },
    async copy(src, dest) {
      const content = files.get(src)
      if (content !== undefined) files.set(dest, content)
    },
    snapshot: () => Object.fromEntries(files),
  }
}
```

Identical behavior to the interface, without touching disk. Tests are **fast and deterministic**.

### 4. Commands receive ports via injection

```typescript
// src/cli/commands/init.ts
import type { FileSystem } from '@/ports/filesystem'
import type { DevcontainerCli } from '@/ports/devcontainer'
import type { Logger } from '@/ports/logger'
import { composeDockerfile } from '@/core/compose/compose-dockerfile'
import { listProfiles } from '@/core/profile/list-profiles'

export interface InitDeps {
  fs: FileSystem
  devcontainer: DevcontainerCli
  logger: Logger
  templatesDir: string
}

export interface InitArgs {
  cwd: string
  profiles: string[]
  secure?: boolean
}

export async function init(args: InitArgs, deps: InitDeps): Promise<void> {
  const { fs, devcontainer, logger, templatesDir } = deps
  const targetDir = `${args.cwd}/.devcontainer`

  if (await fs.exists(targetDir)) {
    throw new Error(`${targetDir} already exists. Use rebuild or destroy first.`)
  }

  await fs.mkdir(targetDir, { recursive: true })

  // Pure logic — testable without deps
  const dockerfile = await composeDockerfile({
    templateDir: templatesDir,
    profiles: args.profiles,
    fs,
  })

  await fs.writeFile(`${targetDir}/Dockerfile`, dockerfile)
  await fs.copy(`${templatesDir}/devcontainer.json`, `${targetDir}/devcontainer.json`)
  await fs.copy(`${templatesDir}/.zshrc`, `${targetDir}/.zshrc`)

  if (args.secure) {
    await fs.copy(`${templatesDir}/firewall-allowlist.txt`, `${targetDir}/firewall-allowlist.txt`)
  }

  logger.info(`✓ Devcontainer created at ${targetDir}`)
  logger.info(`  Profiles: ${args.profiles.join(', ') || '(none)'}`)

  await devcontainer.up({ workspaceFolder: args.cwd })
  logger.info('✓ Container running. Use `mydevc shell` to enter.')
}
```

In production, `index.ts` creates real deps and passes them to each command. In tests, passes the fakes.

### 5. Tests become trivial

```typescript
// src/cli/commands/init.test.ts
import { describe, it, expect } from 'vitest'
import { init } from './init'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'
import { createFakeDevcontainer } from '@/adapters/devcontainer/fake-devcontainer'
import { createMemoryLogger } from '@/adapters/logger/memory-logger'

describe('init command', () => {
  it('creates .devcontainer/ with composed Dockerfile', async () => {
    const fs = createMemoryFs({
      '/templates/Dockerfile.base': 'FROM ubuntu:24.04\n# === PROFILES ===',
      '/templates/profiles/ml.dockerfile': 'RUN pip install torch',
      '/templates/devcontainer.json': '{}',
      '/templates/.zshrc': 'export PS1="$"',
    })
    const devcontainer = createFakeDevcontainer()
    const logger = createMemoryLogger()

    await init(
      { cwd: '/proj', profiles: ['ml'] },
      { fs, devcontainer, logger, templatesDir: '/templates' }
    )

    const snapshot = fs.snapshot()
    expect(snapshot['/proj/.devcontainer/Dockerfile']).toContain('torch')
    expect(devcontainer.upCalls).toHaveLength(1)
    expect(devcontainer.upCalls[0].workspaceFolder).toBe('/proj')
    expect(logger.messages).toContainEqual(
      expect.objectContaining({ level: 'info', msg: expect.stringContaining('Container running') })
    )
  })

  it('fails if .devcontainer/ already exists', async () => {
    const fs = createMemoryFs({ '/proj/.devcontainer/Dockerfile': 'old' })

    await expect(
      init(
        { cwd: '/proj', profiles: [] },
        { fs, devcontainer: createFakeDevcontainer(), logger: createMemoryLogger(), templatesDir: '/t' }
      )
    ).rejects.toThrow('already exists')
  })
})
```

**Zero `vi.mock()`. Zero `jest.spyOn()`.** Tests are behavior-synchronous, fast (no disk), and the code under test is the same that runs in production.

### 6. Core is pure functions

```typescript
// src/core/compose/compose-dockerfile.ts
import type { FileSystem } from '@/ports/filesystem'

export interface ComposeArgs {
  templateDir: string
  profiles: string[]
  fs: FileSystem
}

const PLACEHOLDER = '# === PROFILES ==='

export async function composeDockerfile({ templateDir, profiles, fs }: ComposeArgs): Promise<string> {
  const template = await fs.readFile(`${templateDir}/Dockerfile.base`)

  if (profiles.length === 0) {
    return template.replace(PLACEHOLDER, '')
  }

  const fragments: string[] = []
  for (const name of profiles) {
    const path = `${templateDir}/profiles/${name}.dockerfile`
    if (!(await fs.exists(path))) {
      throw new Error(`Profile '${name}' not found at ${path}`)
    }
    const content = await fs.readFile(path)
    fragments.push(`# === Profile: ${name} ===\n${content}`)
  }

  return template.replace(PLACEHOLDER, fragments.join('\n\n'))
}
```

Receives `fs` as a dependency. In tests, pass `memoryFs`. No global mock.

-----

## Refactored container-init

What was `post_install.py` becomes testable and extensible:

```typescript
// src/container-init/steps/step.ts
export interface Step {
  readonly name: string
  run(ctx: StepContext): Promise<StepResult>
}

export interface StepContext {
  fs: FileSystem
  shell: Shell
  logger: Logger
  homeDir: string
}

export type StepResult =
  | { ok: true; message: string }
  | { ok: false; error: string }
```

```typescript
// src/container-init/steps/claude-bypass.ts
import type { Step } from './step'

export const claudeBypassStep: Step = {
  name: 'claude:bypass',
  async run({ fs, homeDir }) {
    const settingsPath = `${homeDir}/.claude/settings.json`
    await fs.mkdir(`${homeDir}/.claude`, { recursive: true })

    const existing = await fs.exists(settingsPath)
      ? JSON.parse(await fs.readFile(settingsPath))
      : {}

    const updated = { ...existing, bypassPermissions: true }
    await fs.writeFile(settingsPath, JSON.stringify(updated, null, 2))

    return { ok: true, message: `bypassPermissions=true at ${settingsPath}` }
  },
}
```

```typescript
// src/container-init/runner.ts
import type { Step, StepContext } from './steps/step'

export async function runSteps(steps: Step[], ctx: StepContext): Promise<{ failed: number }> {
  let failed = 0

  for (const step of steps) {
    ctx.logger.info(`▶ ${step.name}`)
    try {
      const result = await step.run(ctx)
      if (result.ok) {
        ctx.logger.info(`✓ ${step.name}: ${result.message}`)
      } else {
        ctx.logger.error(`✗ ${step.name}: ${result.error}`)
        failed++
      }
    } catch (err) {
      ctx.logger.error(`✗ ${step.name}: ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }
  }

  return { failed }
}
```

Step tests are equally trivial — pass `memoryFs` and `memoryLogger`, verify the filesystem snapshot afterwards.

-----

## Test layers

### Unit (`tests/unit/` or co-located `*.test.ts`)

- Tests **pure core** and **commands** with fake adapters.
- Runs in milliseconds.
- High coverage (>90%) without pain.

### Integration (`tests/integration/`)

- Tests **real adapters** against real resources (temporary filesystem, simple shell commands).
- Verifies that real adapter and fake have equivalent behavior.
- Typically a “contract test” for each adapter:

```typescript
import { contractTestForFileSystem } from './filesystem-contract'
import { nodeFs } from '@/adapters/filesystem/node-fs'
import { createMemoryFs } from '@/adapters/filesystem/memory-fs'

contractTestForFileSystem('node-fs', () => nodeFs)
contractTestForFileSystem('memory-fs', () => createMemoryFs())
```

Same suite of tests runs against both. Ensures that if it passes for the fake, it passes for the real.

### E2E (`tests/e2e/`)

- Boots a real container, runs commands, verifies result.
- Runs in CI, slow, but provides real confidence.
- Few tests, high value.

-----

## Composition root: where everything connects

```typescript
// src/cli/index.ts
#!/usr/bin/env node
import { parseArgs } from './parser'
import { nodeFs } from '@/adapters/filesystem/node-fs'
import { cliDocker } from '@/adapters/docker/cli-docker'
import { cliDevcontainer } from '@/adapters/devcontainer/cli-devcontainer'
import { execaShell } from '@/adapters/shell/execa-shell'
import { pinoLogger } from '@/adapters/logger/pino-logger'
import { TEMPLATES_DIR } from '@/config'
import * as commands from './commands'

async function main() {
  const cmd = parseArgs(process.argv.slice(2))

  // Composition root: create real deps once
  const deps = {
    fs: nodeFs,
    docker: cliDocker,
    devcontainer: cliDevcontainer,
    shell: execaShell,
    logger: pinoLogger,
    templatesDir: TEMPLATES_DIR,
  }

  switch (cmd.name) {
    case 'init':    return commands.init(cmd.args, deps)
    case 'up':      return commands.up(cmd.args, deps)
    case 'shell':   return commands.shell(cmd.args, deps)
    case 'destroy': return commands.destroy(cmd.args, deps)
    case 'info':    return commands.info(cmd.args, deps)
    case 'clean':   return commands.clean(cmd.args, deps)
    /* ... */
    default: throw new Error(`Unknown command: ${cmd.name}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
```

This file is the **only** place that knows about real adapters. Everything else lives against interfaces.

-----

## Package structure

### `package.json`

```json
{
  "name": "mydevc",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "mydevc": "./dist/cli/index.js",
    "mydevc-init": "./dist/container-init/index.js"
  },
  "exports": "./dist/index.js",
  "files": ["dist", "templates"],
  "scripts": {
    "dev": "tsx src/cli/index.ts",
    "build": "tsup",
    "test": "vitest",
    "test:unit": "vitest run --dir tests/unit src",
    "test:integration": "vitest run --dir tests/integration",
    "test:e2e": "vitest run --dir tests/e2e",
    "lint": "biome check --write .",
    "typecheck": "tsc --noEmit",
    "check": "biome check . && tsc --noEmit && vitest run"
  },
  "dependencies": {
    "@devcontainers/cli": "^0.x",
    "citty": "^0.x",
    "execa": "^9.x",
    "pino": "^9.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.x",
    "@types/node": "^22.x",
    "tsup": "^8.x",
    "tsx": "^4.x",
    "typescript": "^5.x",
    "vitest": "^2.x"
  }
}
```

### `tsup.config.ts` (build)

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli/index.ts', 'src/container-init/index.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  dts: false,
  splitting: false,
  shims: false,
})
```

Two entry points: `mydevc` (host CLI) and `mydevc-init` (binary that runs inside the container).

-----

## Key points that differentiate this structure vs the original

1. **Each file has a single purpose.** `compose-dockerfile.ts` does one thing. `init.ts` does one thing. There’s no “giant file with 15 functions”.
1. **Tests don’t use `vi.mock`.** Fake adapters are production code (live in `src/adapters/*/memory-*.ts`), substituted via DI. More predictable, refactorable.
1. **Core is 100% pure.** The `core/` folder imports nothing from Node — only types. Can run in browser, Deno, Bun, with no changes.
1. **Zod schemas centralized in `src/schemas/`.** When structure changes, it changes in one place.
1. **Adding a command = adding a file.** No editing parser, dispatcher, or central registry. Convention over configuration.
1. **Container-init mirrors the CLI.** Same Step structure, same DI pattern, same tests — just runs inside the container.
1. **Commands return, don’t `process.exit()`.** Process exit lives only in the entry point. Commands throw errors, entry point catches and converts to exit code.

-----

## Migration plan

Total estimate: **~25 hours**, spread over 3-4 weeks working evenings.

### Week 1: Foundation (8h)

1. Project setup: `pnpm init`, `tsconfig`, `biome`, `vitest`, `tsup` (1h)
1. Define ports (interfaces) and domain types with Zod (2h)
1. Implement real and fake adapters for `filesystem` and `logger` (2h)
1. Implement real and fake adapters for `docker`, `devcontainer`, `shell` (3h)

**Milestone:** can write a test with fakes that validates composition.

### Week 2: CLI core (8h)

1. Implement `composeDockerfile` in `core/compose/` with tests (1h)
1. Implement `init`, `up`, `shell`, `destroy` commands with tests (4h)
1. Create args parser with Citty (1h)
1. Composition root in `cli/index.ts` (1h)
1. Build with tsup, test locally (1h)

**Milestone:** `mydevc init python` works end-to-end.

### Week 3: New features (5h)

1. Complete profile system with tests (2h)
1. `info` command (1h)
1. `clean` command with subopts (1h)
1. `--secure` mode with firewall (1h)

**Milestone:** features the original doesn’t have are running.

### Week 4: Container-init + polish (4h)

1. Migrate `post_install.py` to TS steps (2h)
1. Bootstrap script that invokes `mydevc-init` inside the container (30min)
1. Minimal e2e suite (1h)
1. README + CONVENTIONS.md (30min)

**Milestone:** complete system, tested, documented.

-----

## Why it’s worth the investment

Compared to keeping the current bash:

|                            |Original bash                 |TypeScript clean        |
|----------------------------|------------------------------|------------------------|
|Adding command              |~30 min, fragile              |~10 min, with test      |
|Refactoring                 |High risk                     |Reliable (types + tests)|
|Onboarding (you in 6 months)|“what does this do?”          |Clear conventions       |
|Adding complex feature      |Painful                       |Direct                  |
|Quoting/escaping bugs       |Common                        |Non-existent            |
|Descriptive errors          |“command not found at line 42”|Stack trace + context   |

For a 50-line wrapper, bash pays off. For what this project will become (~1500-2000 lines with the features you want), TypeScript pays back in **less than 1 month of use**.

-----

*This document is alive. When an architectural decision changes, update here before propagating to code.*

-----

## Security architecture: untrusted-input by construction

`mydevc` runs containers that execute LLM-generated code. The container is fully untrusted: it controls its own filesystem (including the bind-mounted workspace), env vars, labels, and `Config.User`. Anything the host CLI consumes from those sources must not, by accident, become a path component, a command argument, a mount target, or a filename on the host.

Convention-based validation (“remember to call the helper”) failed once already — gaps were found during audit. This section describes the **structural** approach: types make insecure use impossible, validators are the only legitimate bridge, sinks are the natural choke point.

### Layers

```
┌───────────────────────────────────────────────────────────┐
│ 1. SOURCE (Port output)                                   │
│    Docker.inspectContainer() returns                       │
│      { user: Untrusted<'docker.config.user'>,             │
│        labels: Record<string, Untrusted<...>>,            │
│        env: Untrusted<...>[] }                            │
│    Only adapters can construct Untrusted<>.               │
└───────────────────────────────────────────────────────────┘
                          ↓
┌───────────────────────────────────────────────────────────┐
│ 2. BRIDGE (Validator — single legitimate path)            │
│    asPosixUserName(Untrusted) -> PosixUserName | undef.   │
│    asSafeFilename(Untrusted)  -> SafeFilename  | undef.   │
│    Validators are pure, total, and the only producers of   │
│    capability brands. Live in core/security/.              │
└───────────────────────────────────────────────────────────┘
                          ↓
┌───────────────────────────────────────────────────────────┐
│ 3. CAPABILITY (validated value)                           │
│    SafeFilename, PosixUserName, AbsolutePathUnder<P>,     │
│    SafeMountField. Each brand encodes one invariant.      │
│    Capabilities are subtypes of string — can be passed     │
│    to existing string-accepting APIs (Phase 1).            │
└───────────────────────────────────────────────────────────┘
                          ↓
┌───────────────────────────────────────────────────────────┐
│ 4. SINK (constrained API — Phase 2)                       │
│    FileSystem.writeFile(path: AbsolutePath, ...)          │
│    Shell.exec(cmd: SafeShellArg, args: SafeShellArg[])    │
│    Sinks demand capability brands; raw strings rejected.  │
└───────────────────────────────────────────────────────────┘
```

### What `Untrusted<S>` looks like

```typescript
// src/core/security/brand.ts
declare const UNTRUSTED: unique symbol

export interface Untrusted<S extends string = string> {
  readonly [UNTRUSTED]: { readonly source: S }
  /**
   * Returns the raw string. ONLY for display, logging, equality. Any
   * use that decides an effect (path, command, filename) must go
   * through a validator instead. Greppable: every `.unsafe()` is an
   * audit point.
   */
  unsafe(): string
}

export function untrust<S extends string>(value: string, source: S): Untrusted<S>
```

Critically, `Untrusted<S>` is **not** a subtype of `string`. The following won't compile:

```typescript
const path = `/home/${info.user}/.claude`  // ❌ info.user is not a string
fs.writeFile(`${dir}/${info.labels.foo}`, …)  // ❌ same
```

Only two things compile:

```typescript
// (a) Display path: explicit unwrap, easy to spot in review
logger.info(`Container ${info.user.unsafe()} skipped`)

// (b) Effect path: validate first
const u = asPosixUserName(info.user)
if (!u) { logger.warn('skip'); return }
const path = `/home/${u}/.claude`           // u is PosixUserName (string subtype)
```

### Capability brands

Capabilities **are** subtypes of `string`, by design. After validation, the value is safe to pass to any existing string-accepting API:

```typescript
type SafeFilename = string & { readonly __brand: 'safe-filename' }
type PosixUserName = string & { readonly __brand: 'posix-username' }
type AbsolutePathUnder<P extends string> =
  string & { readonly __brand: 'abs-path'; readonly __under: P }
```

This is intentional asymmetry. `Untrusted` is opaque (forces unwrap). `SafeFilename` is a string subtype (drops in at sinks). The validator is the *only* function that produces a capability — so wherever a capability shows up, you know it was validated.

### Adapter quarantine

Only `src/adapters/` can call `untrust()`. Specifically, `cli-docker.ts` calls it for every value coming out of `docker inspect`:

```typescript
function inspectToInfo(c: DockerInspectContainer): ContainerInfo {
  return {
    id: c.Id,                                 // Docker validates format
    name: (c.Name ?? '').replace(/^\//, ''),
    image: c.Config?.Image ?? c.Image ?? '',
    labels: brandLabels(c.Config?.Labels ?? {}),
    env: (c.Config?.Env ?? []).map((e) => untrust(e, 'docker.config.env')),
    user: untrust(c.Config?.User ?? '', 'docker.config.user'),
    // ...
  }
}
```

`fake-docker.ts` uses the same `untrust()` so test fixtures are typed identically — no special path that only exists in tests.

### What is **not** branded (and why)

- `id`, `name`, `image`, `state` on `ContainerInfo`. Docker daemon validates their formats; we trust the daemon. They’re used for display and as docker CLI args (passed via array, no shell concat).
- `args.cwd` and other CLI argv values. The operator running `mydevc` is trusted by definition — they have shell access on the host already. We don’t treat their argv as adversarial.
- `templatesDir` and other paths bundled with the binary.
- Display strings, log messages, error text. Branding these would be noise.

The rule: **brand values that flow into security-sensitive sinks AND originate from a non-operator source.** Everything else stays plain.

### Phases of enforcement

**Phase 1 (Untrusted at source).** Branded `Untrusted<S>` on Docker port outputs (`info.user`, `info.labels`, `info.env`). Validators in `core/security/untrusted-input` are the only legitimate path from `Untrusted` to a capability brand (`SafeFilename`, `PosixUserName`, `HomeOrRootAbsolutePath`). Forgetting to validate is a compile error: `Untrusted<>` is opaque and not assignable to `string`.

**Phase 2 (sinks demand capabilities).** The `FileSystem` port now requires `AbsolutePath` for every method that takes a path. Construction goes through `core/security/path`:
- `literalPath('/opt/mydevc/...')` for hardcoded paths bundled with the binary,
- `operatorPath(args.cwd)` for CLI argv and `$HOME` (operator-trusted, validates absolute + no NUL, normalises `..`),
- `joinPath(base, ...segs: SafeFilename[])` for composition — segments must be capability-typed.

`EnvSchema` brands `HOME` at parse time, so `env.HOME` is `AbsolutePath` everywhere downstream. `CommandDeps.templatesDir` is `AbsolutePath`. `core/paths.ts` exposes `devcontainerJsonOf(cwd)`, `devcontainerDirOf(cwd)`, `hostClaudeProjectsOf(home)` so the common compositions stay readable.

Result: an interpolation like ``` `${env.HOME}/.claude/projects/${info.user}` ``` does not compile. `info.user` is `Untrusted` (not a string), `env.HOME` is `AbsolutePath` (a string subtype, but template-literal output is plain string and won't satisfy a sink that wants `AbsolutePath`).

**Phase 2 — Shell args.** The `Shell` port keeps `args: readonly string[]` (no shell concatenation possible — execa-style `execve()`), with a runtime fence at the adapter that asserts no NUL byte. `Untrusted<>` cannot be passed because it is not a `string`; capability brands (`SafeFilename` etc.) all guarantee no NUL by construction. The fence is defense in depth for raw string literals.

### What remains plain `string`

- `args.cwd` and similar CLI argv values until the command brands them (one `operatorPath(args.cwd)` per command entry).
- Display strings, log messages, error text, JSON payloads.
- Docker container ids, image names, label keys — daemon-controlled formats.
- `info.id`, `info.name`, `info.image`, `info.state` on `ContainerInfo` — daemon-validated.

### No-escape mechanisms

- **No `as` in core/cli except inside `core/security/`.** That single module has the casts that produce branded values. Reviewers focus there.
- **No direct import of `node:fs` / `node:child_process` outside adapters.** Already enforced by CLAUDE.md and project conventions.
- **Type tests** (`*.test-d.ts`) prove that:
  - `info.user` cannot be assigned to `string`,
  - `asPosixUserName('foo')` (raw string) does not compile — input must be `Untrusted<>`,
  - capability brands are not interchangeable (`SafeFilename` ≠ `PosixUserName`).
- **Defense in depth at sinks.** Even with branded inputs, `safeDestPath` still uses `path.resolve` + prefix check. Two independent layers of protection.

### Adding a new untrusted source

When a new field crosses host ↔ container — e.g., a new label, a new file extracted by `docker cp`, a new env var:

1. Brand it as `Untrusted<S>` at the port (and adapters).
2. Add a capability brand + validator in `core/security/` if no existing one fits. Capability brands encode invariants (“safe POSIX filename”, “absolute path under `/home/<user>`”), not field origins.
3. Consumers compile-fail until they call the validator. That’s the win.
4. If the value is only used for display, `.unsafe()` is the audit point — every occurrence is a one-line review.

### Limits

- This is a TypeScript-level guarantee. A determined attacker with code-execution on the host obviously bypasses it. The purpose is to eliminate **accidental** misuse — the dominant failure mode for security bugs.
- `as`-casts are not blocked by the compiler, only by the lint/review process. Treat any new `as` outside `core/security/` as a security review event.
- This does not protect against **logic bugs** in the validators themselves. `untrusted-input.test.ts` is the fence around that.

### References

- Trusted Types (DOM/TC39): `TrustedHTML` etc — same shape, browser-side.
- Refined types (F\*, Liquid Haskell): the static-analysis ideal this approximates.
- Object-capability security (E, SES, Caja): the broader pattern of authority-by-reference. `mydevc`’s DI of port objects is already capability-shaped; branded values extend that to data.
