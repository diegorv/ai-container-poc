import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        // Composition root and stub-style entry points: assembled at runtime,
        // exercised by the e2e bundle test rather than unit-tested directly.
        'src/cli/index.ts',
        'src/container-init/index.ts',
        // Interface-only files (no runtime code): nothing to exercise.
        'src/ports/**/*.ts',
        'src/container-init/steps/step.ts',
        // Schemas consumed only at the composition root (env validation,
        // project-info type alias). DevcontainerConfigSchema stays counted.
        'src/schemas/env.ts',
        'src/schemas/project-info.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 75,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
