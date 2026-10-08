// 20 类型模板族共享文本段（任务 2.2）——老 forge 21 模板（− fix-record-missed）跨类型
// 逐字重复的段落收敛单源：Spec Authority / Hard Rules 变体 / Step 1.5 扫描 / AC 校验 /
// 质量门表。平移改编三律：①伪标签清剿（<CRITICAL>/<IMPORTANT>/<TASK-CONSTRAINTS> →
// markdown 强调——标签集封闭于四枚，新增角括号标签 = 契约面变更）；②老 CLI 提交面
// （forge task submit/transition）→ M2 工具/技能面（submit-task skill、submitTask
// result=blocked）；③动态值引用（老 {{.TaskID}}/{{.TaskFile}} 占位）→ 指称
// `<task-context>` 键值行。人格段/约束块/动态块不在此（compose.ts 单源）。

/** 模板函数上下文（模板内文仅消费自然键——docs/features/<slug>/ 与 TASK_ID 指称；compose 传全量入参，结构兼容） */
export interface TypePolicyContext {
  slug: string
  localId: string
}

/** Spec Authority Enforcement（老 forge 各 coding/doc/gate/validation 模板 <CRITICAL> 段平移） */
export const SPEC_AUTHORITY = `Spec Authority Enforcement (CRITICAL):

The task definition's \`## Reference Files\` section lists authoritative specification sources.
You MUST:

1. Load each Reference File listed in \`## Reference Files\` immediately after reading the task definition. For entries with section anchors (e.g. \`file.md#Section-Title\`), read the full file and focus on the anchored section.
2. Treat these documents as the authoritative source of truth — when existing code conflicts with specifications in these documents, follow the specifications.
3. Priority when conflicts arise: task \`## Hard Rules\` > \`## Reference Files\` > existing code.
4. Output a confirmation after loading: "Loaded Reference Files: [list], treating them as authoritative sources."

If \`## Reference Files\` is empty or missing, output: "Reference Files empty — falling back to existing code and Hard Rules."

Conventions and business-rules loaded in Step 1 are reference guides — they may lag behind current code. Follow them when consistent with Reference Files, but do not treat them as authoritative overrides.

If a Reference File path does not exist: skip it silently and continue with the remaining files.

If a Reference File contains an internal contradiction (section A says X but section B says not-X), or if multiple Reference Files contradict each other: follow the more specific directive (within a single file) or the more recently updated file (across files). Output "SPEC CONTRADICTION: [description]" and document the choice.`

/** Hard Rules 段——通用变体（coding 系/doc） */
export const HARD_RULES_GENERIC = `If the task definition contains ## Hard Rules with MUST/MUST NOT directives (CRITICAL):
- Follow them exactly during the entire workflow
- Hard Rules override your default approach for any step they address
- Do not rationalize bypassing a Hard Rule based on "I know a better way"`

/** Hard Rules 段——fix 变体（范围/命令约束优先于最小化） */
export const HARD_RULES_FIX = `If the task definition contains ## Hard Rules with MUST/MUST NOT directives (CRITICAL):
- Respect file scope restrictions (MUST NOT touch X) even if touching X seems like a cleaner fix — scope restrictions take priority over minimality
- Respect command restrictions (MUST use X) even if you think Y is equivalent
- Hard Rules define the fix boundary — do not expand beyond it`

/** Hard Rules 段——gate/validation 变体（MUST = 通过判据，MUST NOT = 红线） */
export const HARD_RULES_GATE = `If the task definition contains ## Hard Rules with MUST/MUST NOT directives (CRITICAL):
- Treat every MUST as a pass/fail criterion — no partial credit
- Treat every MUST NOT as a red line — violation means the gate fails
- Hard Rules override your judgment about what constitutes "good enough"`

/** Step 1.5 五维扫描——执行/修复面（DIFFERS → 改随规范） */
export const SCAN_5DIM = `### Step 1.5: Spec-Code Conflict Scan

For each Reference File loaded in Step 1, scan existing code against spec requirements across five dimensions.

Read the code files that implement the requirements described in each Reference File, then output a per-dimension checklist:
SPEC-CODE SCAN:
- MUST/SHALL directives: [scanned | N/A] — [findings or "none found"]
- Architecture decisions: [scanned | N/A] — [findings or "none found"]
- Data flow patterns: [scanned | N/A] — [findings or "none found"]
- Interface contracts: [scanned | N/A] — [findings or "none found"]
- Naming conventions: [scanned | N/A] — [findings or "none found"]

For each finding, output:
  [spec section: "key requirement"]: existing code [MATCHES | DIFFERS | NOT YET IMPLEMENTED]
    - If DIFFERS: describe the specific difference and state "WILL FOLLOW SPEC"

If no Reference Files were loaded: output "SPEC-CODE SCAN: degraded mode — no spec sources, existing code + conventions as guide" and skip the per-dimension checklist.`

/** 五维扫描——gate/validation 变体（DIFFERS → 记验证发现而非改随） */
export const SCAN_5DIM_VALIDATION = `${SCAN_5DIM.replace(
  'describe the specific difference and state "WILL FOLLOW SPEC"',
  'describe the specific difference and record as a validation finding',
)}`

/** 五维扫描——简化扫描附加段（cleanup/refactor：目标不受规范辖制时跳过全扫） */
export const SCAN_SIMPLIFIED_SUFFIX = `**Simplified scan**: if Reference Files were loaded but none mention the files or modules being cleaned up or refactored, output "SPEC-CODE SCAN: simplified — target not governed by spec, conventions as guide" and skip the full scan.`

/** Step 1.5 四维扫描——文档面（doc/doc-review） */
export const SCAN_4DIM_DOC = `### Step 1.5: Spec-Code Conflict Scan

For each Reference File loaded in Step 1, scan existing documents against spec requirements across four dimensions.

Read the documents that address the requirements in each Reference File, then output a per-dimension checklist:
SPEC-CODE SCAN:
- Required document structure: [scanned | N/A] — [findings or "none found"]
- Mandatory sections: [scanned | N/A] — [findings or "none found"]
- Naming conventions: [scanned | N/A] — [findings or "none found"]
- Content constraints: [scanned | N/A] — [findings or "none found"]

For each finding, output:
  [spec section: "key requirement"]: existing document [MATCHES | DIFFERS | NOT YET IMPLEMENTED]
    - If DIFFERS: describe the specific difference and state "WILL FOLLOW SPEC"

If no Reference Files were loaded: output "SPEC-CODE SCAN: skipped — no spec sources loaded" and skip the per-dimension checklist.`

/** AC 逐项校验（老 <IMPORTANT> 段平移——各类 Step 终检共用） */
export const AC_VALIDATION = `**IMPORTANT** — Validate each AC item before other checks: output [AC-N] PASS/FAIL with evidence and spec source.
If any FAIL, address before proceeding. If no AC defined, output "No AC defined — skipping per-item validation."`

/** 完整质量门表（gate/validation-code：含 unit-test 全量步——终局门语义，严于 <constraints> 定向序列） */
export const GATE_QUALITY_TABLE = `Then run the quality gate — execute in strict sequential order:

\`\`\`bash
just compile
just fmt
just lint
just unit-test
\`\`\`

All must pass.

| Failed step | Action |
|---|---|
| \`compile\` | Fix compilation errors, retry from compile |
| \`fmt\` | non-blocking warning — fix fmt issues only in files you modified; pre-existing drift is not your responsibility |
| \`lint\` | Self-fix (max 1 retry); if still failing, follow failure triage in the constraints block |
| \`unit-test\` | Fix failing tests, retry from compile |`

/** 检索先行纪律（老 coding 系中文段逐字平移） */
export const SEARCH_BEFORE_EDIT = `在修改任何文件前，先用 Grep/Glob 搜索所有需要修改的位置，收集完整清单后再执行修改。禁止边搜边改。`

/**
 * Step 1 通用读序（老 coding 系/gate/validation 的 conventions 检查 + 任务定义读取 + 相位摘要）。
 * @param totalSteps 工作流总步数（输出行 `Step 1/N`）
 * @param readNote 任务定义读取目的补充句（如 fix 的错误语境三问）
 */
export function step1Read(totalSteps: number, readNote?: string): string {
  return `### Step 1: Read Task Definition

Check \`docs/conventions/\` and \`docs/business-rules/\` for project-specific knowledge relevant to this task.
Read each file's YAML frontmatter \`domains\` field to determine relevance.
Load files whose domains match keywords from the task definition.
If no files match, skip — no matching convention files for this task.

Then read the task definition: the TITLE / DESCRIPTION / ACCEPTANCE_CRITERIA blocks embedded in the task-context block are the task specification — work from them directly; a FILE path there (when present) points at the full definition file on disk for anything not embedded.${readNote !== undefined ? ` ${readNote}` : ''}

If PHASE_SUMMARY is present in the task-context block, read that file for key decisions and conventions from the previous phase.

Output: \`Step 1/${totalSteps}: Reading task definition... DONE\``
}

/** Step 1 简化读序（技能驱动型 2 步模板：doc 系技能类/test 系/eval 系） */
export function step1ReadSimple(purpose: string): string {
  return `### Step 1: Read Task Definition

Read the task definition — the TITLE / DESCRIPTION / ACCEPTANCE_CRITERIA blocks embedded in the task-context block (a FILE path there, when present, points at the full definition file on disk) — to understand ${purpose}.

If PHASE_SUMMARY is present in the task-context block, read that file for context from the previous phase.

Output: \`Step 1/2: Reading task definition... DONE\``
}

/** Record Fields 尾段（submit-task 技能装载面——类型专属字段清单） */
export function recordFields(fields: readonly string[]): string {
  return `## Record Fields

When submitting via the submit-task skill, populate these record fields:
${fields.map((f) => `- **${f}**`).join('\n')}`
}

/** 技能调用块 */
export function skillInvocation(signature: string): string {
  return `Invoke the skill:

\`\`\`
${signature}
\`\`\``
}

/** 定向检查步（coding 系 Step 终段：AC 校验 + <constraints> 质量门序列引用） */
export function targetedChecksStep(stepNo: number, totalSteps: number, doneLabel: string): string {
  return `### Step ${stepNo}/${totalSteps}: Static Checks + Targeted Tests

${AC_VALIDATION}

Run the quality gate sequence from the constraints block — targeted tests scoped to the files or packages you modified.

Output: \`Step ${stepNo}/${totalSteps}: ${doneLabel}... DONE\``
}

/** coding 系 Record Fields 三件（testsPassed/testsFailed/coverage） */
export const CODING_RECORD_FIELDS = ['testsPassed', 'testsFailed', 'coverage'] as const
