# Compile gate for the test tree (gen-test-scripts Step 4): transpile +
# import every Playwright spec (collection only, no test execution) so a
# syntax/import error fails loudly before any run.
compile:
    pnpm exec playwright test --list

# Unit-test gate (forge quality gate for breaking tasks): the workspace vitest
# suite (root vitest.config.ts — tests/**, apps/*/tests, packages/*/tests).
# Playwright e2e stays a separate lane (`pnpm test:e2e`), not part of unit gate.
unit-test:
    pnpm exec vitest run
