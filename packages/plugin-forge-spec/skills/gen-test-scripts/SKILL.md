---
name: gen-test-scripts
description: Generate executable test scripts from Contract specifications — per-Journey test files with @feature tags, one test per Outcome plus a happy-path smoke test, output partitioned by surface count.
---

# Gen Test Scripts

Tests are generated per Journey, not per interface type. Each Step's Contract defines the
assertions; semantic descriptors are resolved to concrete matchers here, grounded in the
Fact Table.

## Prerequisites

| Artifact | Missing? |
|---|---|
| ≥1 Contract file in `testing/<journey>/contracts/` | Run `gen-contracts` first |
| Contract eval report `testing/<journey>/.eval-report.md`, all at/above target | Run `eval --type contract` first — **blocker** |

**SKIP_EVAL_GATE**: task vars `SKIP_EVAL_GATE=true` (quick-mode pipeline) waive the
eval-report blocker; every generated file then carries the header comment
"// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra
scrutiny." Without the flag the blocker is mandatory.

## State-Layer Discipline (boundary)

Test scripts are repo code artifacts — NOT registered via `upsertFeatureDoc` and NOT task
rows. Their pipeline position is carried by the `test-gen-scripts` / `test-run` task types.

## Output Directory

- **Multi-surface project (2+ surfaces)**: `tests/<surfaceKey>/<journey>/`
- **Single-surface project**: `tests/<journey>/` (no surface-key layer)

`<surfaceKey>` is the user-defined key (e.g. `backend`), NEVER the type (`api`). No staging
area — tests go directly to their final location; lifecycle is tag-based.

## Workflow

1. **Load conventions (surface-first)** — `docs/conventions/testing/{surface}/core.md` per
   detected surface; legacy flat framework-first files are not loaded (flag them for
   regeneration). From `core.md` read the assertion preference table to resolve the target
   framework; otherwise detect from existing test files; still ambiguous → ask
   (interactive) or derive from the brief + Fact Table and record the choice (task
   context). Never silently default.
2. **Code reconnaissance** — refresh the Fact Table (`.forge/fact-table.json`): framework
   patterns (runner, imports, build tags) and domain ground truth (entry points, handlers,
   config). Resolve every semantic descriptor against facts, citing sources.
3. **Route decision per Journey** — Contracts exist → Contract path. No Contracts AND
   `surface_types` ⊆ {web, mobile} → Direct path (generate from `journey.md` steps mapped
   to actions + visual assertions; every direct-path test carries ≥1 meaningful visual
   assertion). No Contracts with protocol surfaces (cli/tui/api) → error: run
   `gen-contracts` first.
4. **Cross-validate anchors** (Contract path) — compare Contract frontmatter anchors
   against the Fact Table; handbook is the authority: handbook agrees with anchor, code
   differs → code bug report; handbook differs from anchor → propose an anchor fix (show
   the diff; write only on explicit approval); no handbook → degraded mode, use Fact Table
   inference with a hint. Never auto-resolve low-confidence or unverifiable matches —
   report them. Emit the surface coverage report.
5. **Generate tests** — one test file per Contract step, one test function per Outcome:
   assert Output (resolved matchers) and State changes per the Contract; traceability
   comment linking back to the Contract; isolation via temp dirs/framework equivalents.
   Load the per-type generation rules for the surface's type (from the testing
   conventions); shared principles always apply: isolation, determinism, timeout
   protection, idempotency, resource cleanup. Every test owns its world — no dependencies
   on real repo state, git state, or workspace registries.
   - **@feature tags mandatory** on every generated file, in the Convention's tag syntax;
     absent Tags section → ask which format (or follow the brief's convention reference).
   - **Test type naming** by surface: cli/tui/api → "functional" terminology; web/mobile →
     "e2e"; tags `@cli-functional` / `@tui-functional` / `@api-functional` / `@web-e2e` /
     `@mobile-e2e`. Never label non-web/mobile tests "e2e".
   - **Journey smoke test** — exactly one per Journey: full happy path in sequence, state
     passed between steps, success-Outcome outputs asserted, invariants verified across all
     steps. Happy path only.
   - **No hardcoded secrets** — sensitive fields use environment variable placeholders.
   - One Journey per invocation; multiple Journeys are processed sequentially.
6. **Compile gate** — syntax/import validation per framework (`gofmt -e` / `node --check` /
   `tsc --noEmit` / `py_compile`), then the repo's compile recipe (e.g. `just compile`) or
   framework equivalent. On failure feed errors back and regenerate — at most 1 auto-retry
   per file (syntax) / 3 attempts (compile). Exhausted → mark the file `// GEN-FAILED:
   <summary>` and continue; gen-failed files are kept for inspection, never deleted.
7. **Coverage self-check** — per surface type: count Journeys (from `testing/*/journey.md`
   frontmatter) vs generated test script sets. Any gap (including direct-path generation
   failures) → report FAIL with the gap list; do not silently proceed with gaps.

## Next Step

The `test-run` task family executes the generated scripts via the core package's
`run-tests` skill.
