import { defineConfig } from 'vitest/config'

// Baseline unit-test config for the dsh-forge workspace.
// Smoke tests live next to the sources (src/**/*.spec.ts / tests/**).
export default defineConfig({
  test: {
    include: [
      'tests/**/*.spec.ts',
      'apps/*/tests/**/*.spec.ts',
      'packages/*/tests/**/*.spec.ts',
      'packages/plugins/*/tests/**/*.spec.{ts,tsx}',
    ],
    environment: 'node',
  },
})
