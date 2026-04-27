# mydevc

Clean TypeScript reimplementation of the Trail of Bits `claude-code-devcontainer` fork. Provides two binaries:

- `mydevc` — host CLI for the devcontainer lifecycle (`template`, `up`, `shell`, `destroy`, …).
- `mydevc-init` — runs inside the container as `postCreateCommand` to configure the environment.

Architecture follows hexagonal ports & adapters with pure core and DI for commands. See `Arch.md` and `Conventions.md` for details.

## Status

Refactor in progress. The legacy bash/python implementation lives in `trial-of-bits-container-fork/` until the new TypeScript codebase reaches feature parity, after which it will be removed.

## Layout

```
src/
  cli/           # mydevc commands (presentation layer)
  core/          # pure logic (no IO)
  ports/         # interfaces
  adapters/      # real and fake implementations of ports
  schemas/       # zod schemas
  container-init/ # mydevc-init steps
  lib/           # generic utilities
templates/       # static resources (Dockerfile, devcontainer.json, .zshrc)
tests/
  unit/
  integration/
  e2e/
```

## Scripts

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm check        # biome + tsc + vitest
pnpm build        # tsup → dist/
```
