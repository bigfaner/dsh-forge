---
name: submit-task
description: Use after completing a task to create its execution record and update task status.
user-invocable: false
metadata:
  argument-hint: "[task-id]"
---

# Submit Task

## Common Fields

All categories share these fields:

| Field                | Type                          | Required    | Description                                                |
| -------------------- | ----------------------------- | ----------- | ---------------------------------------------------------- |
| `taskId`             | string                        | auto        | Omit or match the CLI argument — CLI validates consistency |
| `status`             | `"completed"` \| `"blocked"`  | required    | Task outcome                                               |
| `summary`            | string                        | required    | What was accomplished                                      |
| `filesCreated`       | string[]                      | optional    | Files created during execution                             |
| `filesModified`      | string[]                      | optional    | Files modified during execution                            |
| `acceptanceCriteria` | `Array<{criterion, met}>`     | recommended | Criteria with pass/fail                                    |
| `notes`              | string                        | optional    | Additional observations                                    |

## Common Rules

- **Priority hierarchy**: Category-specific rules (from `data/record-format-*.md` files) override Common Rules when they conflict. Common Rules provide the baseline; category-specific rules refine or replace them per task type.
- `acceptanceCriteria` with any `met: false` entry is rejected for `completed` status — use `blocked` instead.
- `testsPassed`, `testsFailed`, `coverage` are coding-only (conditional on `status: completed`; omit when `status: blocked`). Do NOT include them in doc, test, validation, or gate records.

## File Locations

| Location                                         | Purpose                     |
| ------------------------------------------------ | --------------------------- |
| `docs/features/<slug>/tasks/process/record.json` | In-progress (not committed) |
| `docs/features/<slug>/tasks/records/*.md`        | Final record (committed)    |

## Step 1: Determine Record Format

<HARD-RULE>
You MUST read the category-specific format file before writing record.json.
</HARD-RULE>

The `TASK_CATEGORY` field is in your task prompt. Use that value to locate the format file.

The format files are located in the `data/` directory alongside this SKILL.md. Read the file at:

```
data/record-format-{TASK_CATEGORY}.md
```

This is a path **relative to this SKILL.md's directory** (`resources/skills/submit-task/`). The agent resolves it from the skill file location, not from the project root.

**Fallback:** If `TASK_CATEGORY` is not in your context, run the dsh tool `forge_task_query` (filter by the feature) and locate `<TASK_ID>` in the result to retrieve it. Do NOT skip reading a format file.

> `code-quality.simplify` maps to the `coding` category — use `record-format-coding.md`.

## Step 2: Write record.json

Use the JSON example from your category's format file as the template. Combine common fields with category-specific fields.

## Step 3: Write the record markdown, then submit via dsh tool

1. Write the final record markdown to `docs/features/<slug>/tasks/records/<task-file-stem>.md` (the stem of the task's own `.md` file), rendered from the record.json content: frontmatter (`status`, `started`, `completed`, `time_spent`) + `## Summary` + `## Changes` (Files Created / Files Modified / Key Decisions) sections.

2. Invoke the dsh tool `forge_task_submit` with the task's board address:

```
forge_task_submit { taskKey: <TASK_ID>, recordPath: "docs/features/<slug>/tasks/records/<task-file-stem>.md" }
```

<EXTREMELY-IMPORTANT>
You MUST write the record markdown AND invoke the `forge_task_submit` dsh tool. No exceptions.

ONLY ALLOWED PATHS: `docs/features/<slug>/tasks/process/record.json` (working file, not committed) → `docs/features/<slug>/tasks/records/<task-file-stem>.md` (final record, committed)
</EXTREMELY-IMPORTANT>

## Forbidden Operations

| Operation                              | Why Forbidden                            |
| -------------------------------------- | ---------------------------------------- |
| Skipping Steps 1–2, writing `records/*.md` directly | Bypasses the category record-format rules |
| Direct edit to `index.json`            | State becomes inconsistent               |
| `forge_task_transition` to `completed` | Use `forge_task_submit` to complete      |
| Wrong record path                      | Working file belongs in `process/`; final record in `records/` |

## Type Reclassification

Reclassify **only** when the task's recorded type in `index.json` objectively mismatches the work performed. The following concrete conditions warrant reclassification:

| Condition | Example | Reclassify to |
|-----------|---------|---------------|
| Task type is `coding` but all changes are non-compilable (no source code files modified) | Task typed `coding` but only `.md`, `.sql`, `.yaml`, `.json` files were changed | `doc` |
| Task type is `doc` but the work required and produced code changes | Task typed `doc` but implementation revealed a code fix was needed | `coding` (or `coding.fix` if a fix task) |
| Task type is `coding.fix` but the root cause was not a code bug (e.g., config error, environment issue) | Fix task resolved by updating `settings.json` | `coding.cleanup` or the appropriate actual type |
| Task type implies testing but no test files were created or modified | — | Do NOT reclassify — report as `blocked` instead |

**Do NOT reclassify** for: minor scope differences, subjective quality judgments, or "the work was easier than expected." Reclassification is for category-level mismatches, not granularity differences.

When reclassifying, process according to the **actual type** and include a `typeReclassification` block:

```json
{
  "typeReclassification": {
    "originalType": "coding.fix",
    "actualType": "coding.cleanup",
    "reason": "Root cause was test state leak between runs, not a code bug"
  }
}
```

The original type in `index.json` is **not** changed.

## Recovery (when `forge_task_submit` fails)

1. Fix `record.json`, re-render the record markdown, and re-run `forge_task_submit` for `<TASK_ID>`
2. If stuck: run the dsh tool `forge_task_add` with type `<derived-fix-type>`, title `Fix: submit failed`, `<TASK_ID>`'s local key in `blockers` (block-source: the source task stays blocked until the fix resolves), and a description carrying `SOURCE_FILES="<affected-files>"`, `TEST_SCRIPT="<test-path>"`, `TEST_RESULTS="<test-output>"`, and `Submit failed: <error>`

**Fix-Type Derivation**: extract `TASK_CATEGORY` from your task prompt context and map:
- `doc`, `eval` → `doc.fix`
- `coding`, `test`, `validation`, `gate` → `coding.fix`
