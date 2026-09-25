import { configDefaults, defineConfig } from 'vitest/config'

// Baseline unit-test config for the dsh-forge workspace.
// Smoke tests live next to the sources (src/**/*.spec.ts / tests/**).
// The Playwright lane under tests/e2e/specs is EXCLUDED here (task 6.2): it
// runs via `pnpm test:e2e` / `just web-test-m3`, never under vitest — while
// the fast lane's base self-check (tests/e2e/*.spec.ts, no /specs/) stays.
export default defineConfig({
  test: {
    include: [
      'tests/**/*.spec.ts',
      'apps/*/tests/**/*.spec.ts',
      'packages/*/tests/**/*.spec.ts',
      'packages/plugins/*/tests/**/*.spec.{ts,tsx}',
    ],
    exclude: [...configDefaults.exclude, 'tests/e2e/specs/**'],
    environment: 'node',
  },
})
