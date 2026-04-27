import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli/index.ts', 'src/container-init/index.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  dts: false,
  splitting: false,
  shims: false,
  outDir: 'dist',
})
