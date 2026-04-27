# CLAUDE.md

Operating notes for Claude Code (and other LLM agents) working in this repo.

## Project at a glance

- **`mydevc`** — TypeScript reimplementation of TrailOfBits' `claude-code-devcontainer`.
- Two binaries: `mydevc` (host CLI) and `mydevc-init` (runs inside the container).
- Hexagonal architecture (ports + adapters), DI for use cases. See `Arch.md` for the full design and `Conventions.md` for style.

## Layout

```
src/cli/commands/   — one file per subcommand
src/cli/index.ts    — composition root (real adapters)
src/cli/parser.ts   — argv → discriminated union
src/core/           — pure logic (no IO)
src/ports/          — interfaces (filesystem, docker, devcontainer, shell, logger, prompt)
src/adapters/       — real (node-fs, cli-docker, …) + fake (memory-fs, fake-docker, …)
src/schemas/        — zod schemas (devcontainer-config, env, project-info)
src/container-init/ — mydevc-init steps + runner + entry
src/lib/            — generic utilities (result, deep-merge, walk-fs, path-utils)
templates/          — Dockerfile, devcontainer.json, .zshrc, post-install-bootstrap.sh
tests/integration/  — contract tests (real ↔ fake adapter)
tests/e2e/          — built-binary smoke tests
```

## Working in this repo

- **Add a CLI command**: drop a file in `src/cli/commands/`, declare its `*Args` interface, take `CommandDeps` for dependencies, register it in `parser.ts` and `index.ts`. No central registry beyond those two.
- **Add a port method**: extend the interface in `src/ports/`, implement in **both** the real and fake adapter. The contract test under `tests/integration/` should grow a new case if behaviour matters across implementations.
- **Add a container-init step**: drop a file in `src/container-init/steps/` exporting a `Step`, then add it to the `STEPS` tuple in `src/container-init/index.ts`.

## Conventions reminders

- TypeScript strict, no `any`, no `as` unless unavoidable. Use `import type` for type-only imports.
- Zod at boundaries (`devcontainer.json`, `process.env`, anything from disk we don't control).
- Use `Result<T, E>` from `src/lib/result.ts` for expected failures; throw only for programming errors.
- Tests use the in-memory fakes in `src/adapters/*` — never `vi.mock`.

## Untrusted-input rules (security boundary)

This is an AI container — the container is fully untrusted and must not be able to influence the host through accidentally-unvalidated inputs. The architecture is described in `Arch.md` § "Security architecture"; the operational rules below are what you actually do day-to-day.

**The compiler enforces this, not docs.** Values from non-operator sources are typed `Untrusted<S>` and are not assignable to `string`. Capability brands (`SafeFilename`, `PosixUserName`, `HomeOrRootAbsolutePath`) are the only legitimate output of validators. If you forget to validate, the code does not compile.

### When you touch a Docker port output (`info.user`, `info.labels[k]`, `info.env[i]`)

- Path / command / filename use → call a validator from `src/core/security/untrusted-input.ts`. It returns a capability or `undefined`/throws.
- Display / log / equality only → unwrap with `.unsafe()`. Every `.unsafe()` is grep-able as an audit point — keep them rare.

### When you add a new untrusted source

1. Brand it as `Untrusted<S>` at the **port** type (e.g. `Readonly<Record<string, Untrusted<'docker.config.labels'>>>`).
2. Construct the value via `untrust(value, source)` in **both** the real and fake adapter (so test fixtures match production shape).
3. Pick or add a capability + validator in `src/core/security/`. New capability brands go in `brand.ts`; new validators go in `untrusted-input.ts`. Do not roll a regex at the call site.
4. Add a runtime test in `untrusted-input.test.ts` and a type-level proof in `brand.test-d.ts` if you added a new capability brand.

### What does *not* need branding

- `id`, `name`, `image`, `state` on `ContainerInfo` — Docker daemon controls their format.
- `args.cwd` and other operator-supplied CLI argv — operator is trusted.
- `templatesDir` and other paths bundled with the binary.
- Display strings, log messages.

Rule of thumb: **brand values that flow into security-sensitive sinks AND originate from a non-operator source.**

### Hard rules

- No `as` / `as unknown as` casts in `core/` or `cli/` outside `core/security/`. The single `brandAs<>` helper in `brand.ts` is where casts happen; everywhere else they are a security review event.
- No regex for input validation outside `core/security/`. Extend the module.
- No direct import of `node:fs` / `node:child_process` outside `adapters/` (already enforced for unrelated reasons).

### Phase 2 (planned)

`FileSystem` paths and `Shell` args will become capability-typed — sinks themselves will reject raw `string`. This closes the remaining gap where someone constructs a malicious path from string literals. Tracked in `Arch.md`.

## Commands

```bash
pnpm install
pnpm typecheck
pnpm lint           # biome --write
pnpm test           # vitest
pnpm build          # tsup → dist/
pnpm check          # biome + tsc + vitest run (run before commits)
```

## Behaviour to preserve

The TS port is intended to be **paridade 1:1** with the original bash + Python (now removed). When in doubt about behaviour, prefer matching the original install.sh / post_install.py semantics rather than introducing improvements. Notable subtle behaviours:

- `mydevc template` extracts user-defined mounts from existing `devcontainer.json` and merges them back after overwrite (`extractCustomMounts` / `mergeCustomMounts` in `src/core/devcontainer/manipulate-mounts.ts`).
- `mydevc up` and `rebuild` refuse to run when `runArgs` contains `SYS_ADMIN` (`checkNoSysAdmin`).
- `mydevc sync` rewrites the container-side `-workspace` Claude project key to `-devcontainer-<name>` on the host (`mapWorkspaceKey`).
- `mydevc destroy` removes both the base image and its `-uid` variant.

## Don't

- Don't reach for `node:fs` directly inside `core/` or `commands/` — go through the `FileSystem` port.
- Don't add `vi.mock` or `jest.mock`. The fakes are production code.
- Don't write tests that depend on the host's docker daemon outside of `tests/e2e/`.
