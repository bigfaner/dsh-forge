// coding 系模板 ×6（coding-feature/enhancement/cleanup/refactor + code-quality-simplify +
// coding-fix）——老 forge 同名模板平移（人格段/原则/约束块/质量门序列已抽出至 compose/shared，
// 此处只留类型专属工作流）。目标行承载老模板人格句的类型语义（"implementing a new feature"）。
import {
  CODING_RECORD_FIELDS,
  HARD_RULES_FIX,
  HARD_RULES_GENERIC,
  SCAN_5DIM,
  SCAN_SIMPLIFIED_SUFFIX,
  SEARCH_BEFORE_EDIT,
  SPEC_AUTHORITY,
  recordFields,
  step1Read,
  targetedChecksStep,
  type TypePolicyContext,
} from './shared.js'

export function codingFeature(_ctx: TypePolicyContext): string {
  return `Objective: implement a new feature.

## Workflow (4 Steps)

${step1Read(4)}

${SPEC_AUTHORITY}

${HARD_RULES_GENERIC}

${SCAN_5DIM}

${SEARCH_BEFORE_EDIT}

### Step 2: TDD Implementation

Apply SPEC-CODE SCAN results — for any DIFFERS finding, follow spec over existing code. Reference Files from Step 1 are authoritative.

If a COVERAGE line is present in the task-context block, it states the coverage strategy and target — stop adding tests once the target is reached.

First, extract test requirements from the task's Acceptance Criteria. Each checkbox item maps to one or more test cases. List them before writing any code.

Then follow the TDD cycle for each requirement:

\`\`\`
RED      → Write failing test first
GREEN    → Implement minimal code to pass
REFACTOR → Clean up while keeping tests green
\`\`\`

Output: \`Step 2/4: Implementing... DONE (N new tests)\`

${targetedChecksStep(3, 4, 'Verifying (coverage: N%)')}

${recordFields(CODING_RECORD_FIELDS)}`
}

export function codingEnhancement(_ctx: TypePolicyContext): string {
  return `Objective: enhance an existing feature.

## Workflow (4 Steps)

${step1Read(4)}

${SPEC_AUTHORITY}

${HARD_RULES_GENERIC}

${SCAN_5DIM}

${SEARCH_BEFORE_EDIT}

### Step 2: TDD Implementation

Apply SPEC-CODE SCAN results — for any DIFFERS finding, follow spec over existing code. Reference Files from Step 1 are authoritative.

If a COVERAGE line is present in the task-context block, it states the coverage strategy and target — stop adding tests once the target is reached.

First, extract test requirements from the task's Acceptance Criteria. Each checkbox item maps to one or more test cases. List them before writing any code.

Then follow the TDD cycle for each enhancement requirement:

\`\`\`
RED      → Write failing test that captures the desired behavior improvement
GREEN    → Implement minimal code to pass
REFACTOR → Clean up while keeping tests green
\`\`\`

Review existing tests for the code being enhanced. Ensure new behavior does not break existing tests.

Output: \`Step 2/4: Implementing... DONE (N new tests)\`

${targetedChecksStep(3, 4, 'Verifying (coverage: N%)')}

${recordFields(CODING_RECORD_FIELDS)}`
}

export function codingCleanup(_ctx: TypePolicyContext): string {
  return `Objective: clean up technical debt and remove dead code.

## Workflow (4 Steps)

${step1Read(4)}

${SPEC_AUTHORITY}

${HARD_RULES_GENERIC}

${SCAN_5DIM}

${SCAN_SIMPLIFIED_SUFFIX}

${SEARCH_BEFORE_EDIT}

### Step 2: Make Improvements

Apply SPEC-CODE SCAN results — for any DIFFERS finding, follow spec over existing code. Reference Files from Step 1 are authoritative.

If a COVERAGE line with strategy maintain is present in the task-context block, keep existing coverage — it is not a mandate to write new tests.

Apply the cleanup changes described in the task definition. This may include:
- Removing dead code, unused declarations, or obsolete files
- Fixing existing tests
- Improving code clarity without changing behavior

Do not write new failing tests first — cleanup work is verified by the existing test suite staying green.

Output: \`Step 2/4: Improving... DONE\`

${targetedChecksStep(3, 4, 'Verifying (coverage: N%)')}

${recordFields(CODING_RECORD_FIELDS)}`
}

export function codingFix(_ctx: TypePolicyContext): string {
  return `Objective: fix compilation errors, test failures, and verification issues.

## Workflow (5 Steps)

${step1Read(
  5,
  'Analyze error messages to understand: 1. Error type (compilation, test, lint, type) 2. Affected files/modules 3. Likely root cause.',
)}

${SPEC_AUTHORITY}

${HARD_RULES_FIX}

${SCAN_5DIM}

### Step 2: Locate

Apply SPEC-CODE SCAN results — for any DIFFERS finding, follow spec over existing code. Reference Files from Step 1 are authoritative.

Read failing files and related tests. Understand the full context before making changes.

Output: \`Step 2/5: Locating affected code... DONE\`

### Step 3: Fix

If a COVERAGE line is present in the task-context block, write targeted fix tests; stop adding once the target is reached.

Apply minimal fix. Preserve existing functionality. Do not refactor unrelated code.

For E2E test failures:
- Read failing test + corresponding source code
- Compare test's expected behavior vs actual behavior
- Modify source or test to align expectations with reality
- Do NOT start dev server or run e2e tests

Output: \`Step 3/5: Fixing errors... DONE\`

${targetedChecksStep(4, 5, 'Verifying')}

${recordFields(CODING_RECORD_FIELDS)}`
}

export function codingRefactor(_ctx: TypePolicyContext): string {
  return `Objective: restructure code without changing its external behavior.

External behavior = function signatures, return types, observable output, and test assertion values.

## Pre-check

Before starting, verify all three conditions:
1. \`git status\` is clean (no uncommitted changes) — refactoring requires a clean starting state for safe rollback
2. Targeted tests pass — run the project's test command on affected packages/modules. Refactoring on a red test suite is undefined behavior (you can't verify "no behavior change" if the baseline is already broken)
3. If current branch is main/trunk, output a warning but allow (team conventions vary)

If check 1 or 2 fails, submit result=blocked with reason "refactor verification failed" and output the reason. Do NOT proceed — the dispatcher will handle re-claim after the issue is resolved.

## Workflow (5 Steps)

${step1Read(5)}

${SPEC_AUTHORITY}

${HARD_RULES_GENERIC}

${SCAN_5DIM}

${SCAN_SIMPLIFIED_SUFFIX}

${SEARCH_BEFORE_EDIT}

### Step 2: Impact Mapping

Apply SPEC-CODE SCAN results — for any DIFFERS finding, follow spec over existing code. Reference Files from Step 1 are authoritative.

Before writing any code, determine the full scope of changes.

1. **Classify the refactor** — per sub-operation:
   - **Structural**: rename, move, re-export, signature change, constant extraction, decompose parameter
   - **Behavioral**: extract function, inline variable, simplify conditional
   - A task may contain multiple sub-operations — classify each independently and apply the corresponding strategy. Execute structural sub-operations first, then behavioral.

2. **Map the impact**:
   - Use \`grep -rl\` to list ALL files referencing the symbols being changed
   - Identify affected syntactic layers:
     1. Source identifiers (constant/type/function names)
     2. String literals in source code (type checks, string comparisons)
     3. Test data structures (field values in test fixtures)
     4. Test assertions (expected values, substring checks)
     5. Config files (JSON, YAML, TOML references)
   - Output the complete file list and layer breakdown

3. **For behavioral refactors**: list the functions to modify and their callers. Impact is typically local.

4. **Dynamic coupling scan** — before any refactor, detect non-obvious coupling that breaks silently:
   - Reflection or metaprogramming calls referencing symbol names as strings
   - Dynamic dispatch based on type names
   - String-based type comparisons (e.g., \`if obj.Type == "feature"\`)
   - Generated code that references the old name — if affected files are generated artifacts, trace back to the code generator and modify its logic instead of editing generated output directly

   If found, add those to the migration plan. These compile fine but fail at runtime or in tests.

5. **Sanity check** — assess whether this refactor is worth doing:
   - Is it likely to reduce total lines of code or complexity?
   - Is the scope proportional to the benefit? (Renaming 200 files for a cosmetic name improvement is probably not worth it.)
   - If the answer is "no" to either, output \`REFACTOR_LOW_VALUE: [reason]\` and proceed only if the task definition explicitly requires it.

6. **Impact Declaration** — before any code changes, classify every affected test as PRESERVE or EVOLVE:

   Analyze the tests identified in step 2 (syntactic layers 3-4: test data structures, test assertions). For each test that the refactor will touch or affect, determine whether its expected behavior will change.

   Output a structured declaration:

   \`\`\`
   IMPACT_DECLARATION:
   - test: [fully qualified test function name]
     classification: PRESERVE | EVOLVE
     reason: [why this test is PRESERVE or EVOLVE]
     expected_change: [only for EVOLVE — what assertion/value will change and to what]  (EVOLVE only)
   \`\`\`

   **Classification rules:**
   - **PRESERVE**: Test verifies behavior that must remain unchanged by this refactor. Failure means regression.
   - **EVOLVE**: Test verifies behavior that this refactor intentionally changes. Failure is expected; update test assertions to match new behavior.

   **EVOLVE validation:**
   - Every EVOLVE entry MUST have both \`reason\` and \`expected_change\` filled in.
   - If reason is empty, vague (e.g., "test needs update"), or expected_change is missing: reclassify as PRESERVE.
   - Over-declaring EVOLVE to avoid pauses is a misuse — EVOLVE is for intentional behavioral shifts only.

   **No tests affected?** Output: \`IMPACT_DECLARATION: no tests in scope — all changes are non-behavioral\`

Output: \`Step 2/5: Impact mapping... DONE (type: [structural|behavioral], files: N, layers: [list], dynamic_coupling: [none|found: details], impact_declaration: [N PRESERVE / N EVOLVE])\`

### Step 3: Refactor

Coverage strategy (COVERAGE line in the task-context block, maintain) applies only if you need to verify existing coverage levels — not a mandate to write new tests. Do not chase high coverage.

Incremental compile strategy: After modifying one file, run \`just compile\` immediately. If it passes, continue to the next file. If it fails, fix the current file before touching others.

**Universal constraints:**
- External behavior must remain unchanged (except for EVOLVE-classified tests)
- If a test assertion needs changes:
  1. Check the IMPACT_DECLARATION from Step 2
  2. If the test is classified as **EVOLVE**: update the test assertion to match the new behavior. This is an expected change — proceed without alarm.
  3. If the test is classified as **PRESERVE** or **not declared**: output \`BEHAVIOR_CHANGE_DETECTED: [description]\` and skip that specific change. Continue with the rest.
- Do not write new failing tests — refactoring is verified by existing tests staying green (PRESERVE) or updated assertions being correct (EVOLVE)

**Structural refactors: Add -> Migrate -> Remove**

The goal is to keep the codebase compilable at every intermediate step. Never delete the old name until all callers are migrated.

**Phase A — Add new alongside old:**
- Add the new constant/type/function
- Create an alias: old name -> new name (e.g., Go: \`const OldName = NewName\`, TS: \`export { New as Old }\`, Python: \`OldName = NewName\`)
- Before adding alias, check for circular dependency and module-boundary issues:
  - If old and new are in different modules/packages, verify no circular import
  - If the module has explicit export lists, update them accordingly
  - Be aware that re-export aliases may affect bundler optimization (tree-shaking)
- If circular dependency detected: place alias in a thin shim module, or skip alias and migrate all callers in one batch instead
- Run quick verification: \`just compile\` and run targeted tests on affected packages/modules
- All tests must pass — old code is untouched, new code coexists

**Phase B — Migrate callers in small batches:**
- Group affected files into batches (see batch sizing below)
- Per batch: update references from old name to new name across all syntactic layers in those files
- After each batch: \`just compile\` and run targeted tests on affected packages/modules
- If a batch fails: fix within the batch and retry. Max 3 retries per batch.
- Continue to next batch only after current batch passes

**Batch sizing (adaptive):**
- Total affected files <= 10: batch all in one group
- Total > 10 and all changes are simple text replacements (no dynamic coupling): batch 15-20 files
- Otherwise: batch 3-5 files

**Phase B failure recovery:**
If max retries exhausted at batch N:
1. Run \`git diff --stat\` to assess scope of changes
2. If partial migration compiles (\`just compile\` passes) -> report as "partially migrated at batch N/M" with remaining file list. Aliases keep code valid.
3. If partial migration has broken imports -> \`git checkout\` the failed batch files and report as "blocked at batch N" with the error details

Replacement order within each file: longest identifier first -> shortest last (avoids partial matches).

**Phase C — Remove old aliases:**
- Once all callers are migrated, delete the old alias/redirect
- Run \`just compile\` to confirm no remaining references
- If compile fails: grep for old name, fix remaining references, retry

**Behavioral refactors**

Proceed incrementally — make one change, verify, make the next.
- After each logical change: \`just compile\` and run targeted tests on affected packages/modules
- Max 3 retries per failure. If still failing, stop and report.

Output: \`Step 3/5: Refactoring... DONE\`

### Step 4: Static Checks + Targeted Tests

${targetedChecksStep(4, 5, 'Verifying (coverage: N%)')}

Coverage is informational for refactoring — output the number but do not gate on it. If coverage drops >2%, investigate and report.

Max 3 retries at this step. If still failing after 3 attempts, stop and report the task as blocked with details of the last failure.

${recordFields(CODING_RECORD_FIELDS)}`
}

export function codeQualitySimplify(_ctx: TypePolicyContext): string {
  return `Objective: run scoped code-quality cleanup via the clean-code skill.

## Hard constraints

- MUST invoke \`Skill(skill="forge:clean-code")\` to perform scoped code cleanup
- MUST NOT manually rewrite code — the skill handles scope detection, cleanup, and quality gate

## Workflow (2 Steps)

### Step 1: Read Task Definition

Read the task definition — the TITLE / DESCRIPTION / ACCEPTANCE_CRITERIA blocks embedded in the task-context block (a FILE path there, when present, points at the full definition file on disk) — to understand the code to clean up.

If PHASE_SUMMARY is present in the task-context block, read that file for context from the previous phase.

Output: \`Step 1/2: Reading task definition... DONE\`

### Step 2: Clean Code

Invoke the skill:

\`\`\`
Skill(skill="forge:clean-code")
\`\`\`

Output: \`Step 2/2: Cleaning code... DONE\``
}
