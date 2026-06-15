// Build the two binaries with esbuild directly. Replaces tsup, which pulled an
// unsigned `chokidar` into the dependency tree (only used for its --watch mode,
// which this project never runs). Mirrors the old tsup.config.ts exactly.
//
// 1. Host CLI: execa/zod/etc. stay EXTERNAL — operators install mydevc via
//    `pnpm install`, so node_modules sits next to dist/cli/index.js. Bundling
//    them would inflate the tarball.
// 2. In-container init: copied alone into the image at /opt/mydevc (see
//    templates/Dockerfile) with no node_modules sibling, so it must be
//    self-contained — execa + zod are inlined (no `external`).
//
// esbuild resolves the `@/*` path alias from tsconfig.json automatically.
import { rm } from 'node:fs/promises'
import { build } from 'esbuild'

const runtimeDeps = ['@devcontainers/cli', 'execa', 'jsonc-parser', 'zod']

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'info',
}

// tsup's cli build had `clean: true` — wipe dist once up front.
await rm('dist', { recursive: true, force: true })

await build({
  ...common,
  entryPoints: { 'cli/index': 'src/cli/index.ts' },
  outdir: 'dist',
  external: runtimeDeps,
})

await build({
  ...common,
  entryPoints: { 'container-init/index': 'src/container-init/index.ts' },
  outdir: 'dist',
  // execa transitively pulls in cross-spawn, which CJS-`require()`s Node builtins
  // (`child_process`). ESM has no `require`; bind one via createRequire so the
  // dynamic lookup resolves through Node's normal mechanism at runtime.
  banner: {
    js: "import { createRequire as __mydevcCreateRequire } from 'node:module';\nconst require = __mydevcCreateRequire(import.meta.url);",
  },
})
