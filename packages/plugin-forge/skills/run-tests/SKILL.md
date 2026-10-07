---
name: run-tests
description: Surface-level test orchestration for test-run tasks — detect the surface, run its just recipe sequence (dev, probe, per-journey test, teardown), and report results exactly as measured; never falsifies results, and failures settle blocked.
---

# Run Tests

**Core principle**: an orchestrator that detects the surface, runs its just recipes in
sequence, and reports results as measured. Surface resolution, server lifecycle, result
parsing, and reporting happen here — nothing else. Fixing, re-authoring tests, and
verdicts belong elsewhere (the invoking task and the fix chain).

**On-demand loading**: this skill's catalog row is resident in every worker, but its
content is meant to load only when a `test-run` task actually executes tests — non-test
tasks never load it. If you are reading this without a test-run task in hand, put it
back.

<HARD-GATE>
- Do not modify test script content.
- Do not skip failed tests or report them as passed — report exactly what ran.
- Do not "fix" tests during execution to make them pass. Test script bugs may be
  reported; altering assertions or logic to force a pass is falsification.
- Do not retry probe or restart dev after a probe failure within the same orchestration
  cycle (a new invocation after a task-layer fix decision is a new cycle).
- When running as a task (`type: test-run`): any failure settles
  `submitTask result=blocked` with the failing journeys and cases in the reason — never
  `success` with known failures. Surface-level failures are not fixed inline here; fix
  decisions belong to the invoking task.
</HARD-GATE>

## When to Use

- A `test-run` task was claimed (surface-level execution for a container), or
- The user asks to run the tests.

Skip with a clear statement — do not run something else — when the surface has no test
recipes or no journey scripts to run.

## Judgment Points (in order)

1. **Detect the surface** — take `SURFACE_KEY` / `SURFACE_TYPE` from the task context
   when present; otherwise read the justfile's surface groups. Scalar surfaces use the
   bare recipes (`dev`, `probe`, `test`, `teardown`); named surfaces prefix every recipe
   with `<surface-key>-`. Detection failing on both sources is a **blocking** error,
   not a retryable one: report it with recovery hints (task context, justfile, surface
   configuration) and stop.
2. **Discover journeys** — `tests/<journey>/` (single surface) or
   `tests/<surfaceKey>/<journey>/` (multi surface). No journeys found → report that
   journey tests require generated scripts and stop (blocking). Invoked as a task
   without an explicit journey scope → run every discovered journey.
3. **Check the environment** — recipes and their dependencies present and runnable. Not
   ready → abort as **retryable** (the environment may be repaired and the skill
   re-invoked); report diagnostics and repair suggestions only — no auto-fix.
4. **Execute the sequence** — full-lifecycle surfaces (web/api/mobile): `dev` once →
   `probe` (bounded retries, ~3) → per-journey `just <prefix>test <journey>` →
   `teardown` once. Simplified surfaces (cli/tui): the per-journey loop → `teardown`.
   Record each journey's result as it completes. Teardown is **mandatory — execute it
   even when an earlier step fails**.
5. **Report** — totals per journey (passed/failed/skipped), each failure with its error
   excerpt as evidence, and the sequence actually executed. Missing or empty result
   output → say so and attach the runner's console output; do not synthesize a report.

## Settlement (when running as a task)

Settle per the submit-task discipline:

- All green → `submitTask result=success` with the report as the summary.
- Any failure → `submitTask result=blocked`, reason naming the failing journeys and
  cases; a fix task may follow per the fix-chain protocol (canonical text in run-tasks).

There must be no test-script edits made to force a pass — so there are none to commit
from here.
