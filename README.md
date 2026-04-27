# mydevc

> A sandboxed development environment for running Claude Code with `bypassPermissions` safely enabled. TypeScript reimplementation of the [Trail of Bits](https://www.trailofbits.com/) `claude-code-devcontainer` fork, with hexagonal architecture (ports & adapters) and DI-friendly use cases.

Two binaries:

- **`mydevc`** — host CLI (template, up, shell, sync, destroy, …).
- **`mydevc-init`** — runs inside the container as `postCreateCommand`.

The original bash + Python + Docker implementation has been replaced by typed TypeScript end-to-end. Same surface area, same templates, no behavioural drift.

## Why use this?

Running Claude with `bypassPermissions` on your host is risky — it can execute any command without confirmation. This devcontainer provides **filesystem isolation** so you get unrestricted Claude without putting your host at risk.

Designed for security audits, untrusted repositories, multi-repo engagements, and experimental work where you want Claude to modify code freely inside a disposable container.

## Prerequisites

- **Docker runtime** (one of):
  - [Docker Desktop](https://docker.com/products/docker-desktop) (running)
  - [OrbStack](https://orbstack.dev/)
  - [Colima](https://github.com/abiosoft/colima): `brew install colima docker && colima start`
- **Node.js 22+** for `mydevc` itself.

The `devcontainer` CLI is a runtime dependency of mydevc and ships in `dependencies` — `pnpm install` (or any global install of mydevc) pulls it automatically. mydevc verifies both `devcontainer` and `docker` are on `PATH` on the first call that needs them and throws a clear error with a fix suggestion otherwise, so you'll never see a raw `ENOENT` from execa.

## Install

```bash
git clone <this-repo> ~/.mydevc
cd ~/.mydevc
pnpm install
pnpm build
node dist/cli/index.js self-install   # symlinks mydevc into ~/.local/bin
```

After `self-install`, `mydevc` is available in any directory.

## Quick start

```bash
git clone <untrusted-repo>
cd untrusted-repo
mydevc .         # template + up
mydevc shell     # zsh inside the container
```

VS Code / Cursor: install the Dev Containers extension, run `mydevc template` (or copy `templates/` manually into `.devcontainer/`), then "Reopen in Container".

## Usage patterns — trusted vs. untrusted code

The right setup depends on how much you trust the code Claude is going to touch. The two scenarios below cover the common extremes; pick the one that matches what you're about to do.

### Scenario 1 — `~/dev` for personal repos (high trust)

Your own repos under a single parent directory. Use the **shared-workspace pattern**: one container, one set of persistent volumes (shell history, Claude config, `gh` auth) reused across every repo. No `--secure` — full network access is fine for your own code.

#### One-time setup

```bash
cd ~/dev
mydevc template      # creates ~/dev/.devcontainer/
# (optional) edit .devcontainer/devcontainer.json to add custom mounts
mydevc up
# or both at once:
mydevc dot
```

#### Day-to-day

```bash
mydevc shell                  # /workspace == ~/dev inside the container
# inside:
cd my-personal-project
claude
exit                          # or Ctrl-D

mydevc info                   # state at a glance
mydevc logs -f                # tail container logs
mydevc sync                   # bring Claude sessions back to the host for /insights
```

Stop / resume between work sessions:

```bash
mydevc down                   # stop, keep all volumes
mydevc up                     # start back up, history + Claude + gh intact
```

Rebuild from a clean image (after editing the Dockerfile, say):

```bash
mydevc rebuild                # volumes preserved
```

Add an extra host folder when you need it:

```bash
mydevc mount ~/notes /notes
```

**What you gain:** SSH agent works (keys stay on the host), host `~/.gitconfig` is read inside, `gh` and `claude` auth persist across every repo. Zero friction.

**What to remember:** everything under `~/dev` is visible to the container — and therefore to Claude. If a repo holds something sensitive (`.env` with prod credentials), Claude can read it.

### Scenario 2 — open-source repo you don't trust

Use the **per-project pattern** plus `--secure`. The container, its volumes and image are born and die with that one repo. Network is locked down to a small allowlist.

#### Onboarding the repo

```bash
git clone https://github.com/sketchy/repo /tmp/sandbox/repo
cd /tmp/sandbox/repo

# 1. If the repo ships its own .devcontainer/, vet it before touching it.
#    `validate` rejects SYS_ADMIN in runArgs and any malformed config.
mydevc validate || exit 1

# 2. Install template + bring up with the firewall active.
mydevc . --secure
```

The default allowlist (`/.devcontainer/firewall-allowlist.txt`) only permits Anthropic API, GitHub, npm, PyPI and the Claude installer. Everything else is `DROP`.

#### Working inside

```bash
mydevc shell
# inside:
claude

# If the project's deps need another registry (e.g. Rust):
exit
echo 'crates.io' >> .devcontainer/firewall-allowlist.txt
echo 'static.crates.io' >> .devcontainer/firewall-allowlist.txt
mydevc rebuild        # or: mydevc down && mydevc up — postStartCommand re-applies iptables
```

#### Visibility

```bash
mydevc info                                 # state overview
mydevc info --json | jq '.customMounts'     # confirm nothing sensitive is mounted
mydevc logs                                 # any suspicious activity from the container
mydevc ps                                   # if you have several sandboxes running
```

#### Tear-down

```bash
exit
mydevc destroy -f         # container + volumes + image (and -uid variant). No traces left.
```

If you want to inspect the volumes before deleting them:

```bash
mydevc clean --container --volumes -f --dry-run    # preview
mydevc clean --container -f                        # kill only the container, keep volumes for inspection
```

#### Rules of thumb to keep the isolation intact

| ❌ Avoid | ✅ Do |
|---|---|
| `mydevc mount ~/ /mnt/home` | `mydevc mount /tmp/dropbox /drop --readonly` (neutral path, read-only when possible) |
| Adding `--cap-add=SYS_ADMIN` to `runArgs` | `mydevc validate` rejects it — let it reject |
| Sharing volumes via the shared-workspace pattern | One fresh container per repo (`mydevc destroy` wipes everything at once) |
| Editing `.devcontainer/devcontainer.json` from a repo without reading it | Run `mydevc validate` first; review mounts and `runArgs` |
| Trusting `~/.gitconfig` if it has a malicious `[includeIf "gitdir:..."]` | It's read-only inside the container, but it can still redirect git config — audit yours |

#### Throwaway-sandbox shortcut

```bash
# In your ~/.zshrc / ~/.bashrc:
yolo-clone() {
  local name=$(basename "$1" .git)
  git clone "$1" "/tmp/sandbox/$name" \
    && cd "/tmp/sandbox/$name" \
    && mydevc . --secure \
    && mydevc shell
}

# Then:
yolo-clone https://github.com/sketchy/repo
# … explore, exit when done
mydevc destroy -f && cd ~ && rm -rf /tmp/sandbox/repo
```

### Side-by-side comparison

| | Scenario 1 (`~/dev`) | Scenario 2 (untrusted) |
|---|---|---|
| Pattern | Shared workspace | Per-project |
| Where `.devcontainer/` lives | `~/dev/.devcontainer/` | inside each repo |
| `--secure` | No (open network) | **Always** |
| Extra mounts | Freely | Minimal, `--readonly` when possible |
| State across sessions | Yes (volumes preserve history, Claude, gh) | Yes, until you `destroy` it |
| Typical shutdown | `mydevc down` (resume later) | `mydevc destroy -f` |
| `mydevc validate` | Optional (you trust the source) | Before `up` on every new repo |
| `mydevc sync` | Useful — aggregated `/insights` | Usually skip — sessions die with the sandbox |

The key split: **trust → share persistence; untrusted → disposable container, firewall on, mounts minimal**.

## Headless auth (optional)

```bash
claude setup-token
export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
mydevc rebuild
```

`mydevc-init`'s `claude:bypass` step seeds `~/.claude.json` so Claude starts without the onboarding wizard ([anthropics/claude-code#8938](https://github.com/anthropics/claude-code/issues/8938)).

## Commands

Every command accepts the global `-v|--verbose` (debug-level logs) and `-q|--quiet` (errors only) flags before the subcommand.

```
mydevc .                      Install template + start container in current dir
mydevc template [dir]         Copy devcontainer template into directory
mydevc up [dir]               Start the devcontainer
mydevc rebuild [dir]          Rebuild (preserves persistent volumes)
mydevc down [dir]             Stop the devcontainer
mydevc shell                  Open zsh in the running container
mydevc exec <cmd>             Run a command in the running container
mydevc upgrade                Run `claude update` inside the container
mydevc mount <host> <ct>      Add a host→container bind mount
mydevc sync [filter]          Sync Claude sessions from devcontainers to host
mydevc cp <ct> <host>         Copy a path from container to host
mydevc destroy [-f]           Remove container, volumes and images
mydevc info [--json]          Show project state (container, image, volumes, mounts)
mydevc logs [-f] [--tail N]   Tail / follow `docker logs` for the project's container
mydevc ps                     List every devcontainer across the host
mydevc validate               Validate .devcontainer/devcontainer.json (Zod + SYS_ADMIN)
mydevc clean [flags]          Granular cleanup: --container --volumes --images --cache
mydevc self-install           Symlink mydevc into ~/.local/bin
mydevc update                 git pull this repo
mydevc completion <shell>     Print bash/zsh/fish completion script to stdout
mydevc help                   Show this help
```

> Use `mydevc destroy` to clean up everything at once — `docker rm` directly leaves orphaned volumes and images that mydevc won't be able to find later. Use `mydevc clean` for granular cleanup that keeps part of the state (e.g. drop the image to free disk while keeping the container's persistent volumes).

### Inspecting state — `mydevc info`

Quickly see what's running for the current workspace:

```
$ mydevc info
Workspace:       /Users/alice/code/crypto
Project name:    crypto
Container label: devcontainer.local_folder=/Users/alice/code/crypto

Container:       focused_einstein (abc123def456)
Status:          running
Image:           vsc-crypto (+ -uid)
Volumes (3):
  - devc-crypto-bashhistory-1234
  - devc-crypto-config-1234
  - devc-crypto-gh-1234

Custom mounts (1):
  - source=/Users/alice/data,target=/data,type=bind
```

Different empty states for "no `.devcontainer/`" vs "no container created yet" point you at the right next command.

For scripts, `mydevc info --json` emits the same data on stdout as a JSON document. Pipe it into `jq` and friends:

```bash
$ mydevc info --json | jq -r '.container.state'
running
```

### Looking around — `mydevc logs` and `mydevc ps`

```bash
mydevc logs                  # snapshot of `docker logs` for the project
mydevc logs -f               # follow (Ctrl-C to stop)
mydevc logs --tail 200       # pass --tail through to docker
mydevc ps                    # one row per devcontainer, across all workspaces
```

`ps` is handy when juggling several projects — it shows every container labelled with `devcontainer.local_folder` regardless of where you ran the command from.

### Granular cleanup — `mydevc clean`

`destroy` is all-or-nothing. `clean` is à la carte:

```
mydevc clean --volumes -f       # drop just the docker volumes (keep image + container)
mydevc clean --images           # rebuild from scratch on next `up` without losing data
mydevc clean --cache            # docker builder prune -f
mydevc clean --container        # remove container only (volumes survive)
mydevc clean --container --volumes --images --dry-run    # preview what would be removed
```

Selecting nothing is an error (use `destroy` if you want everything). The `--cache` flag is global, the others are per-project.

### Validating `devcontainer.json` — `mydevc validate`

Plug into a project's CI to catch malformed devcontainer configs before someone tries to `mydevc up`:

```bash
mydevc validate
# ✓ devcontainer.json at /…/devcontainer.json is valid.

# On failure (exit 1):
# mydevc: devcontainer.json failed schema validation (2 issues):
#   - runArgs: Expected array, received string
#   - mounts: Expected array, received number
```

The check runs the same Zod schema mydevc applies internally plus the `SYS_ADMIN`-in-`runArgs` guard.

### Shell completion

```bash
source <(mydevc completion bash)             # in ~/.bashrc
source <(mydevc completion zsh)              # in ~/.zshrc, after compinit
mydevc completion fish > ~/.config/fish/completions/mydevc.fish
```

Each script knows the full command list and per-command flags (`--secure`, `--json`, `--tail`, `--dry-run`, etc.).

### Verbosity

Two global flags control logger output, available before any subcommand:

```bash
mydevc -v rebuild        # debug logs + spinner internals
mydevc --quiet destroy   # only print failures
```

Defaults to info-level. `--verbose` wins if both are passed.

## Session sync for `/insights`

Claude Code's `/insights` reads from `~/.claude/projects/` on the host. Sessions inside devcontainer volumes are invisible. `mydevc sync` copies session logs from every devcontainer (running or stopped) to the host, with the container-side key `-workspace` rewritten to `-devcontainer-<project>` so they don't collide with host keys.

```bash
mydevc sync               # all devcontainers
mydevc sync crypto        # filter by project name
mydevc sync --trusted     # skip the trust prompt
```

## File sharing

```bash
mydevc mount ~/drop /drop                # read-write
mydevc mount ~/secrets /secrets --readonly
```

The mount is added to `devcontainer.json` and the container is recreated. Custom mounts are preserved across `mydevc template` updates.

> Mount narrowly. Every mounted path is writable from the container unless `--readonly`, which undermines the isolation.

## Security model

| | |
|---|---|
| **Sandboxed** | Filesystem (host files inaccessible), processes, package installations |
| **Network**   | Full outbound by default; opt-in iptables allowlist via `--secure` (see below) |
| **Not sandboxed** | Git identity (`~/.gitconfig` mounted read-only), SSH agent (forwarded socket — keys stay on host), Docker socket (not mounted) |

The container is the sandbox: `bypassPermissions` is auto-configured, so Claude runs commands without confirmation, but everything happens inside the container's filesystem.

`SYS_ADMIN` in `runArgs` is rejected by `mydevc up`/`rebuild` because it would defeat the read-only `.devcontainer/` mount that prevents a compromised process from injecting commands into `devcontainer.json`.

### Network isolation — `--secure`

Pass `--secure` to `template` or `.` to drop `firewall-allowlist.txt` into `.devcontainer/`. The container's `postStartCommand` then runs `setup-firewall.sh` on every start, applying iptables rules that:

- Drop all OUTPUT traffic by default.
- Allow loopback (`lo`).
- Allow DNS (UDP+TCP port 53).
- Allow each hostname listed in `firewall-allowlist.txt` (resolved at rule-add time).

```bash
mydevc . --secure              # template + up with the firewall active
mydevc template --secure       # just drop the allowlist; up later
```

Without `--secure`, the allowlist file isn't present and `setup-firewall.sh` is a no-op — the container has unrestricted outbound access. To toggle later, just add or remove `.devcontainer/firewall-allowlist.txt` and re-run `mydevc rebuild` (or `mydevc down && mydevc up`).

The default allowlist covers Anthropic API, GitHub, npm, PyPI, and the Claude installer. Edit `.devcontainer/firewall-allowlist.txt` to add/remove hosts. Hostnames are resolved once at rule-add time, so prefer endpoints with stable DNS.

## Architecture

See [`Arch.md`](./Arch.md) and [`Conventions.md`](./Conventions.md) for the full rationale.

```
src/
  cli/              # mydevc commands (presentation layer + composition root)
    commands/       # one file per subcommand
    parser.ts       # argv → discriminated union
    index.ts        # builds real deps, dispatches
  core/             # IO-free logic
    project/        # compute-project-id
    devcontainer/   # manipulate-mounts, check-no-sys-admin
    sync/           # map-workspace-key
  ports/            # filesystem, docker, devcontainer, shell, logger, prompt
  adapters/         # real (node-fs, cli-docker, …) + fake (memory-fs, fake-docker, …)
  schemas/          # zod schemas for devcontainer.json, env, project info
  container-init/   # mydevc-init steps + runner + entry
    steps/          # claude-bypass, claude-settings, tmux-config,
                    # directory-ownership, git-config
  lib/              # generic utilities (result, deep-merge, walk-fs,
                    # path-utils, cli-error)
  config.ts         # invariant constants
templates/          # Dockerfile, devcontainer.json, .zshrc, .dockerignore,
                    # post-install-bootstrap.sh, setup-firewall.sh,
                    # firewall-allowlist.txt
tests/
  integration/      # contract tests (real adapter ↔ memory fake)
  e2e/              # built-binary smoke tests
```

Pure core, IO at the edges, fakes in production code (no `vi.mock`). Adding a command means adding a file under `src/cli/commands/`.

## Scripts

```bash
pnpm install
pnpm typecheck
pnpm lint                 # biome check --write
pnpm test                 # vitest
pnpm test:unit            # src/**
pnpm test:integration     # tests/integration
pnpm test:e2e             # tests/e2e (rebuilds dist/ on every run)
pnpm test:coverage        # vitest run --coverage
pnpm build                # tsup → dist/
pnpm check                # biome + tsc + vitest run
```

GitHub Actions runs the same checks plus:

- `pnpm audit --audit-level=high` — fails on known high/critical vulns in installed deps.
- Bundle-size budget — `dist/cli/index.js` < 60KB, `dist/container-init/index.js` < 20KB.
- v8 coverage with thresholds (lines/funcs/statements ≥ 85%, branches ≥ 75%); the `coverage/` folder is uploaded as an artifact.
- `actions/dependency-review-action` on PRs — blocks new dependencies with high vulns or licenses outside the allow-list.
- When `renovate.json` changes — `renovate-config-validator`.

CLI output is auto-styled: when stderr is a TTY, `mydevc` prints colored level glyphs and shows a spinner during long ops (`up`, `rebuild`, `mount`). When piped or redirected (`2>log.txt`, CI), the output collapses to `[level] message` lines and the spinner becomes plain start/done log entries.

## Container details

| Component | Details |
|---|---|
| Base | Ubuntu 24.04, Node.js 22, Python 3.13 (via uv), zsh + Oh My Zsh |
| User | `vscode` (passwordless sudo), `WORKDIR=/workspace` |
| Tools | `rg`, `fd`, `tmux`, `fzf`, `delta`, `iptables`, `ipset`, `bubblewrap`, `ast-grep` |
| Persistent volumes | `/commandhistory`, `/home/vscode/.claude`, `/home/vscode/.config/gh` |
| Read-only host mounts | `~/.gitconfig`, `.devcontainer/`, `.git/config`, `.git/hooks` |
| Auto-configured | `bypassPermissions=true`, `~/.tmux.conf`, `~/.gitconfig.local` (with delta), Anthropic + Trail of Bits skills |

Persistent volumes survive `mydevc rebuild` so your shell history, Claude config, and `gh` login persist between rebuilds. `mydevc destroy` removes them all.

## Troubleshooting

### `devcontainer` CLI not found

```bash
npm install -g @devcontainers/cli
```

### Container won't start

1. Check Docker is running.
2. `mydevc rebuild`
3. `docker logs $(docker ps -lq)`

### gh CLI auth not persisting

```bash
sudo chown -R $(id -u):$(id -g) ~/.config/gh
```

This is what `mydevc-init`'s `fs:ownership` step does automatically — but only if it runs before you try to authenticate.

## Credit

Built on the work of the original Trail of Bits team: <https://github.com/trailofbits/claude-code-devcontainer>. Refer to the upstream repository for canonical bash + Python implementation.
