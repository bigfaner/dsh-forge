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

# Web e2e orchestration lane (run-tests skill). The app under test is the
# Electron desktop shell — Playwright launches it per-test via
# _electron.launch() with an isolated temp userData (workers: 1), so there
# is no shared dev server: web-dev/web-probe assert environment readiness
# only (Playwright + Electron present; full spec tree collects cleanly).
web-dev:
    pnpm exec playwright --version && node -e "console.log('electron', require(require.resolve('electron/package.json', { paths: ['./apps/desktop'] })).version)"

web-probe:
    pnpm exec playwright test --list > /dev/null && echo "probe: e2e spec collection OK"

# Run one journey's e2e specs, e.g. `just web-test task-session-execution-loop`.
# Journey names map 1:1 to directories under apps/desktop/e2e/.
web-test journey:
    pnpm exec playwright test apps/desktop/e2e/{{journey}}

# No shared state to clean: each fixture owns its temp userData / project
# dirs and removes them post-run (apps/desktop/e2e/helpers/fixture-app.ts).
web-teardown:
    echo "teardown: no-op (per-fixture temp dirs self-clean)"
