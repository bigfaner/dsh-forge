// doc 系模板 ×5（doc/doc-consolidate/doc-drift/doc-review/doc-summary）——老 forge 同名
// 模板平移（Spec Authority/四维扫描/AC 校验在 shared；技能类模板 M3 技能面承接，文本先置）。
import {
  AC_VALIDATION,
  SCAN_4DIM_DOC,
  SPEC_AUTHORITY,
  recordFields,
  skillInvocation,
  step1ReadSimple,
  type TypePolicyContext,
} from './shared.js'

const DOC_RECORD_FIELDS = ['referencedDocs', 'reviewStatus', 'docMetrics'] as const

export function doc(_ctx: TypePolicyContext): string {
  return `Objective: create or modify documentation.

## Workflow (4 Steps)

### Step 1: Read Task Definition

Read the task definition — the TITLE / DESCRIPTION / ACCEPTANCE_CRITERIA blocks embedded in the task-context block (a FILE path there, when present, points at the full definition file on disk).

Output: \`Step 1/4: Reading task definition... DONE\`

${SPEC_AUTHORITY}

${SCAN_4DIM_DOC}

### Step 2: Execute Document Work

Use Reference Files from Step 1 as the authoritative structure and content guide.

Identify task type (Create/Modify/Delete) and execute accordingly. Follow existing document style, ensure cross-references are accurate, and use consistent terminology.

Output: \`Step 2/4: Executing document work... DONE\`

### Step 3: Self-Check

${AC_VALIDATION}

Verify your documentation work against these criteria:

1. **Format**: Document structure follows project conventions (headings, sections, tables)
2. **Cross-references**: All internal links and references point to existing files or valid anchors
3. **Terminology consistency**: Terms are used consistently across all documents you created or modified
4. **Completeness**: All items described in the task's acceptance criteria are addressed

If any criterion fails, fix the issue before proceeding.

${recordFields(DOC_RECORD_FIELDS)}

Output: \`Step 3/4: Self-check... DONE\``
}

export function docConsolidate(_ctx: TypePolicyContext): string {
  return `Objective: consolidate specs in non-interactive mode. Do NOT wait for user confirmation. Proceed without stopping.

## Workflow (2 Steps)

${step1ReadSimple('what specs to consolidate')}

### Step 2: Consolidate Specs

${skillInvocation('Skill(skill="forge:consolidate-specs")')}

${recordFields(DOC_RECORD_FIELDS)}

Output: \`Step 2/2: Consolidating specs... DONE\``
}

export function docDrift(_ctx: TypePolicyContext): string {
  return `Objective: detect spec drift in non-interactive mode. Do NOT wait for user confirmation. Proceed without stopping.

## Workflow (2 Steps)

${step1ReadSimple('what specs to check for drift')}

### Step 2: Detect and Fix Spec Drift

${skillInvocation('Skill(skill="forge:consolidate-specs")')}

${recordFields(DOC_RECORD_FIELDS)}

Output: \`Step 2/2: Detecting spec drift... DONE\``
}

export function docSummary(ctx: TypePolicyContext): string {
  return `Objective: generate a phase summary.

## Workflow (2 Steps)

${step1ReadSimple('what the summary should cover')}

### Step 2: Generate Summary

Read all completed task records for this phase from \`docs/features/${ctx.slug}/tasks/records/\`.

Generate a phase summary document with these 5 sections:

1. **Tasks Completed** — one line per task describing what it did
2. **Key Decisions** — decisions prefixed with task ID (e.g., \`[1.1]\`)
3. **Types & Interfaces Changed** — table of type/interface changes and blast radius
4. **Conventions Established** — patterns future tasks must follow
5. **Deviations from Design** — where implementation diverged from tech-design

Write the summary to the record file specified in the task.

${recordFields(DOC_RECORD_FIELDS)}

Output: \`Step 2/2: Generating summary... DONE\``
}

export function docReview(ctx: TypePolicyContext): string {
  return `Objective: review documentation against pre-extracted acceptance criteria.

## Workflow (4 Steps)

### Step 1: Load Pre-Extracted AC

Read the task definition. The Acceptance Criteria Summary section is pre-extracted from all doc tasks — use it directly as the review baseline. Do NOT scan the tasks directory or read individual task .md files.

Output: \`Step 1/4: Loading pre-extracted acceptance criteria... DONE\`

${SPEC_AUTHORITY}

${SCAN_4DIM_DOC}

### Step 2: Discover Target Documents

Use Reference Files from Step 1 as the authoritative structure and content guide.

Discover target documents using an allowlist strategy — only scan the following directories for .md files:
- \`docs/features/${ctx.slug}/\` and all subdirectories (prd/, design/, testing/, etc.)
- \`docs/proposals/${ctx.slug}/\`

Do NOT scan the tasks/ directory, tasks/records/ directory, or any non-docs paths.

For each target document found:
1. Read the document content
2. Cross-reference against the pre-extracted AC from Step 1
3. List each AC item for verification

Output: \`Step 2/4: Discovering target documents and matching AC... DONE\`

### Step 3: Review and Fix

For each acceptance criterion from the pre-extracted AC:
1. Check whether the deliverable meets the AC
2. If not met: directly modify the document to fix the non-conformance
3. Record the result (pass or fixed)

Do not add content beyond what the AC requires. Fix only the specific gaps identified.

**SCOPE CONSTRAINT (IMPORTANT)** — You may ONLY modify files under the docs/ directory. Do NOT modify, create, or delete files in tasks/, tasks/records/, or any other non-docs path. Task definitions and execution records are not deliverables — never edit them.

Output: \`Step 3/4: Checking acceptance criteria and fixing non-conformances... DONE\`

### Step 4: Report Summary

${AC_VALIDATION}

Produce a summary report:
- Which ACs passed without changes
- Which ACs required fixes (and what was changed)
- Final status per doc task

${recordFields(['referencedDocs (docs/ paths only)', 'reviewStatus', 'docMetrics'])}

Output: \`Step 4/4: Review summary... DONE\``
}
