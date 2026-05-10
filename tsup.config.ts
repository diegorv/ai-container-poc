import { defineConfig } from 'tsup'

// Two builds, sharing one outDir.
//
// 1. The host CLI keeps `execa` and `zod` external — operators install
//    mydevc via `pnpm install`, so node_modules is right there next
//    to dist/cli/index.js. Bundling them would inflate the tarball.
//
// 2. The in-container init binary is copied alone into the image at
//    `/opt/mydevc/container-init.js` (see templates/Dockerfile), with
//    no node_modules sibling. It must be self-contained, so `execa`
//    and `zod` are inlined via `noExternal`.
export default defineConfig([
  {
    name: 'cli',
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    target: 'node22',
    clean: true,
    dts: false,
    splitting: false,
    shims: false,
    outDir: 'dist',
  },
  {
    name: 'container-init',
    entry: { 'container-init/index': 'src/container-init/index.ts' },
    format: ['esm'],
    target: 'node22',
    clean: false,
    dts: false,
    splitting: false,
    shims: true,
    // execa transitively pulls in cross-spawn, which CJS-`require()`s
    // Node builtins (`child_process`). In ESM `require` doesn't exist;
    // tsup's __require polyfill throws unless `require` is bound first.
    // Inject createRequire at the top of the bundle so cross-spawn's
    // dynamic require resolves through Node's normal lookup at runtime.
    banner: {
      js: "import { createRequire as __mydevcCreateRequire } from 'node:module';\nconst require = __mydevcCreateRequire(import.meta.url);",
    },
    outDir: 'dist',
    noExternal: ['execa', 'zod'],
  },
])
