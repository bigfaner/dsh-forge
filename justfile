# Compile gate for the test tree (gen-test-scripts Step 4): transpile +
# import every Playwright spec (collection only, no test execution) so a
# syntax/import error fails loudly before any run.
compile:
    pnpm exec playwright test --list
