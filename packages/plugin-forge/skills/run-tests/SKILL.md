---
name: run-tests
description: Surface-level test orchestration — detect the surface, run its just recipe sequence (dev, probe, per-journey test, teardown), parse and report results faithfully. Never falsifies results; when run as a task, any failure settles blocked via the fix chain.
---

# Run Tests

**Core principle**: an orchestrator that detects the surface, runs its just recipes in
sequence, and reports results as measured. It handles surface resolution, server
lifecycle, result parsing, and reporting — nothing else.

<HARD-GATE>
- Do not modify test script content.
- Do not skip failed tests or report them as passed — report exactly what ran.
- Do not "fix" tests during execution to make them pass.
- Do not retry probe or restart dev after a probe failure within the same orchestration
  cycle (a new invocation after a task-layer fix decision is a new cycle).
- When running as a task (`type: test-run`): any failure settles
  `submitTask result=blocked` with the failing journeys and cases in the reason — never
  `success` with known failures. Surface-level failures are not fixed inline here; fix
  decisions belong to the invoking task.
</HARD-GATE>

## When to Use

- A `test-run` task was claimed (surface-level execution for a feature), or
- The user asks to run the tests.

Skip with a clear statement — do not run something else — when the surface has no test
recipes or no journey scripts to run.

## Workflow

```
1. Detect surface → 2. Discover journeys → 3. Environment check → 4. Execute sequence → 5. Report
```

### Step 1: Detect Surface

Take `SURFACE_KEY` / `SURFACE_TYPE` from the task context when present; otherwise read
the justfile's surface groups. Determine the recipe prefix:

| Surface shape | recipe-prefix | Recipes |
|---|---|---|
| Scalar (no key) | (empty) | `dev`, `probe`, `test`, `teardown` |
| Named (key `admin-panel`) | `admin-panel-` | `admin-panel-dev`, `admin-panel-test`, … |

Surface info unavailable from both sources → report the detection failure with recovery
hints (check task context, justfile, surface configuration) and stop — a blocking error,
not a retryable one.

### Step 2: Discover Journeys

List the journey groups under `tests/` — single surface: `tests/<journey>/`; multi
surface: `tests/<surfaceKey>/<journey>/`. No journeys found → report that journey tests
require generated scripts and stop (blocking). When invoked as a task without an
explicit journey scope, run every discovered journey.

### Step 3: Environment Check

Verify the recipes and their dependencies are present and runnable. On failure, report
diagnostics and repair suggestions only — no auto-fix. Not ready → abort (retryable:
the environment may be repaired and the skill re-invoked).

### Step 4: Execute Sequence

Full lifecycle surfaces (web/api/mobile): `dev` once → `probe` (bounded retries, ~3) →
per-journey `just <prefix>test <journey>` → `teardown` once. Simplified surfaces
(cli/tui): the per-journey loop → `teardown`.

- Record each journey's result as it completes.
- Teardown is **mandatory — execute it even when an earlier step fails**.

### Step 5: Report

Report totals per journey (passed/failed/skipped), each failure with its error excerpt
as evidence, and the sequence actually executed. Missing or empty result output → say
so and attach the runner's console output; do not synthesize a report.

## Settlement (when running as a task)

Settle per the submit-task discipline:

- All green → `submitTask result=success` with the report as the summary.
- Any failure → `submitTask result=blocked`, reason naming the failing journeys and
  cases; a fix task may follow per the fix-chain protocol (canonical text in run-tasks).

There must be no test-script edits made to force a pass — so there are none to commit
from here.
