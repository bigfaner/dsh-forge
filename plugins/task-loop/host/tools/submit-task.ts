// submitTask tool（plugin-task-loop 1.11——packages/plugin-forge/src/tools/submit-task.ts
// 直迁 + 两处契约改造（提案裁决）：
// ① AC 入参单数组化：旧 ac_criteria/ac_met/ac_evidence 三平行数组退役 → 单参 ac_results
//    （[{criterion, met, evidence?}]，逐项形状校验）→ 域 submitTask acceptanceCriteria。
// ② runtime_face 更名：旧 runtime_surface 退役（入参被拒并指认新参）→ runtime_face；
//    runtime_evidence_face/artifacts/note 命名不变。
// disc 效度戳 / submitSettleDisplay / 事件缝是宿主装配面职责——工具不迁移（后续装配任务接）。
// 定位 = 域动词薄封装：submitTask（submit.ts，双门 + 单事务两写单源），本文件只做
// snake_case 入参收窄 + gate all-or-none 组合形状先证 + 结算要点文本投影。
import { submitTask, type SubmitTaskInput, type SubmitTaskResult } from "../domain/tasks/submit.js";
import type { TaskAcResult, TasksVerbDeps } from "../domain/tasks/types.js";
import {
  optionalBoolean,
  optionalFraction,
  optionalNonNegativeInteger,
  optionalString,
  optionalStringArray,
  requireArgsObject,
  requiredEnum,
  requiredString,
} from "./args.js";
import type { TaskToolDefinition, TaskToolExecFace } from "./faces.js";

const TOOL = "submit_task";

/** gate 平铺四参 → TaskGateReport（all-or-none + coverage 依赖门在场） */
export function gateOf(a: Record<string, unknown>, tool = TOOL): SubmitTaskInput["gate"] {
  const compile = optionalBoolean(a, "gate_compile", tool);
  const fmt = optionalBoolean(a, "gate_fmt", tool);
  const lint = optionalBoolean(a, "gate_lint", tool);
  const test = optionalBoolean(a, "gate_test", tool);
  const coverage = optionalFraction(a, "gate_coverage", tool);
  const present = [compile, fmt, lint, test].filter((v) => v !== undefined);
  if (present.length === 0) {
    if (coverage !== undefined) {
      throw new Error(`${tool}: gate_coverage requires the four gate results (gate_compile/fmt/lint/test)`);
    }
    return undefined;
  }
  if (present.length !== 4) {
    throw new Error(`${tool}: gate results are all-or-none — give gate_compile, gate_fmt, gate_lint and gate_test together`);
  }
  return {
    compile: compile === true,
    fmt: fmt === true,
    lint: lint === true,
    test: test === true,
    ...(coverage !== undefined ? { coverage } : {}),
  };
}

/** ac_results 单数组逐项形状校验（criterion 非空文本 / met bool / evidence 可选 string） */
export function acResultsOf(a: Record<string, unknown>, tool = TOOL): TaskAcResult[] | undefined {
  const raw = a["ac_results"];
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${tool}: ac_results must be a non-empty array of {criterion, met, evidence?} items when given`);
  }
  return raw.map((item, i) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`${tool}: ac_results[${i}] must be an object {criterion, met, evidence?}`);
    }
    const it = item as Record<string, unknown>;
    const criterion = it["criterion"];
    if (typeof criterion !== "string" || criterion.trim() === "") {
      throw new Error(`${tool}: ac_results[${i}].criterion must be a non-empty string (verbatim criterion text from the task definition)`);
    }
    const met = it["met"];
    if (typeof met !== "boolean") {
      throw new Error(`${tool}: ac_results[${i}].met must be a boolean`);
    }
    const evidence = it["evidence"];
    if (evidence !== undefined && (typeof evidence !== "string" || evidence === "")) {
      throw new Error(`${tool}: ac_results[${i}].evidence must be a non-empty string when given (test/command + result; long output goes to disk, pass only the path)`);
    }
    return { criterion, met, ...(evidence !== undefined ? { evidence } : {}) };
  });
}

/** tool 定义工厂（deps 注入 verbDeps——域结算动词薄封装） */
export function createSubmitTaskTool(deps: {
  readonly verbDeps: TasksVerbDeps;
  readonly resolveProjectKey: (exec: TaskToolExecFace) => string;
}): TaskToolDefinition {
  return {
    name: TOOL,
    // 工具级瘦身（照旧口径）：必留 = 双径约束 / ac_results 单数组 / evidence_debt / coverage fraction。
    description:
      "Submit the outcome of a claimed task (slug + local_id). result=success requires a one-line summary and four gate booleans (gate_compile/fmt/lint/test; optional gate_coverage fraction); tasks with acceptance_criteria also need gate.test passing, and ac_results ([{criterion, met, evidence?}] — criterion verbatim from the task definition, one item per criterion in order; any met=false rejects) verifies each criterion one-for-one. result=blocked requires the reason; a blocked card may settle directly via result=success when no fix task is warranted. evidence_debt_suite+evidence_debt_specs (success only) declare owed real-machine e2e evidence when implementation + unit tests are green: the card settles now and a dependent test-run debt task is auto-created — never stay blocked on missing e2e evidence. coverage is a record-side 0-1 fraction complementing gate_coverage.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Container slug of the task being submitted (feature directory name or proposal slug)." },
        local_id: { type: "string", description: "Local id of the task being submitted." },
        result: { type: "string", description: "'success' or 'blocked'." },
        reason: { type: "string", description: "Why the task is blocked (required for result=blocked)." },
        block_classification_kind: {
          type: "string",
          description:
            "Root-cause classification of the blocker (required for result=blocked — the T2 classification gate rejects a blocked submit without it): 'new-problem' (first occurrence) or 'same-family-recurrence' (recurrence of a known problem; self-reported semantic classification — no mechanical matching).",
        },
        block_classification_recurrence_of: {
          type: "string",
          description:
            "Predecessor bug_id from the ledger recurrence chain (same-family-recurrence only; self-reported initial judgment — the review round may correct chain membership).",
        },
        summary: { type: "string", description: "One-line result sentence (required for result=success)." },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Actually changed files (flat union), forward-slash paths; when files_created/files_modified are given this must equal their union.",
        },
        files_created: {
          type: "array",
          items: { type: "string" },
          description: "Files created by this task (grouped; stored as files_json {created, modified}).",
        },
        files_modified: {
          type: "array",
          items: { type: "string" },
          description: "Files modified by this task (grouped; stored as files_json {created, modified}).",
        },
        ac_results: {
          type: "array",
          description:
            "Acceptance-criterion verification results as ONE array (retires the old ac_criteria/ac_met/ac_evidence parallel arrays): each item {criterion: verbatim criterion text from the task definition, met: boolean, evidence?: one-line proof (test/command + result; long output goes to disk, pass only the path)}. Same count and order as the definition; any met=false on result=success rejects.",
        },
        key_decisions: { type: "array", items: { type: "string" }, description: "Key decisions (up to 3), split out of the summary." },
        tests_passed: { type: "number", description: "Number of tests passed." },
        tests_failed: { type: "number", description: "Number of tests failed." },
        coverage: { type: "number", description: "Record-side coverage fraction 0-1 (complements gate_coverage)." },
        notes: { type: "string", description: "Free-form notes." },
        gate_compile: { type: "boolean", description: "Quality gate: compile passed (give all four together)." },
        gate_fmt: { type: "boolean", description: "Quality gate: formatting passed." },
        gate_lint: { type: "boolean", description: "Quality gate: lint passed." },
        gate_test: { type: "boolean", description: "Quality gate: tests passed." },
        gate_coverage: { type: "number", description: "Coverage fraction 0-1 (optional, with the gate booleans)." },
        commit_hash: { type: "string", description: "Commit hash containing the change." },
        evidence_debt_suite: {
          type: "string",
          description: "e2e evidence-debt suite name (e.g. 'e2e') — declare when implementation + unit tests are green but real-machine e2e assertion evidence is still owed. Settlement records the implementation phase and the loop auto-creates a dependent test-run debt task (the card is no longer blocked on missing e2e evidence).",
        },
        evidence_debt_specs: {
          type: "array",
          items: { type: "string" },
          description: "Spec paths the owed e2e assertions cover (forward slashes) — required with evidence_debt_suite.",
        },
        evidence_debt_note: { type: "string", description: "What evidence is owed and why (optional, with the debt pair)." },
        runtime_face: {
          type: "array",
          items: { type: "string" },
          description:
            "Runtime assembly surface declaration (mandatory-evidence-domain input): faces the deliverable touches at runtime — common examples ui/api/cli/tui/desktop/web-server/mq (non-exhaustive; anything with a runtime assembly face qualifies, e.g. browser-extension, mobile-app, cron, db-migration); 'library'/'sdk'/'pure-logic'/'docs' declare the exempt domain — the exemption presupposes no subprocess/network side effects of its own; multiple faces take the strictest ('highest') interpretation. On result=success, a declared runtime_face requires either runtime_evidence_face+runtime_evidence_artifacts (evidence done) or evidence_debt (debt declared); without either, the submit is rejected.",
        },
        runtime_evidence_face: {
          type: "string",
          description: "Real-machine evidence primary face (with runtime_evidence_artifacts) — the runtime face the end consumer perceives; the alternative to evidence_debt (both together = ERR_RUNTIME_EVIDENCE_CONFLICT).",
        },
        runtime_evidence_artifacts: {
          type: "array",
          items: { type: "string" },
          description: "Real-machine forensic artifact paths (screenshots/logs/trace, archived on disk) — required with runtime_evidence_face.",
        },
        runtime_evidence_note: { type: "string", description: "Evidence method and environment notes (optional, with the evidence pair)." },
      },
      required: ["slug", "local_id", "result"],
    },
    output: {
      schema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          status: { type: "string", description: "Task status after the submit (completed or blocked)." },
          restored: { type: "array", items: { type: "object" }, description: "slug/localId natural keys auto-restored by the recovery hook (source tasks whose fix completed)." },
          recurrenceAdvisories: { type: "array", items: { type: "object" }, description: "T2 recurrence advisories (blocked submit cross-check — soft signals, not rejections; present only when triggered)." },
        },
        required: ["taskId", "status", "restored"],
      },
      render: (_args, value): readonly { readonly type: "text"; readonly text: string }[] => {
        const v = value as SubmitTaskResult;
        const lines = [
          `- taskId: ${v.taskId}`,
          ...v.restored.map((r) => `- restored: ${r.slug}/${r.localId} (source unblocked)`),
          ...(v.recurrenceAdvisories ?? []).map((adv) => `- advisory[${adv.kind}]: ${adv.message}`),
        ];
        return [{ type: "text", text: [`✓ Task submitted — ${v.status}`, ...lines].join("\n") }];
      },
    },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<SubmitTaskResult> {
      const a = requireArgsObject(args, TOOL);
      // 旧 runtime_surface 入参被拒（更名裁决——fail-loud 指认新参，零静默兼容）
      if (a["runtime_surface"] !== undefined) {
        throw new Error(`${TOOL}: runtime_surface was renamed to runtime_face (same semantics — resend the faces array as runtime_face)`);
      }
      const result = requiredEnum(a, "result", ["success", "blocked"] as const, TOOL);
      const gate = gateOf(a, TOOL);
      const acResults = acResultsOf(a, TOOL);
      const classificationKind = optionalString(a, "block_classification_kind", TOOL);
      const classificationRecurrenceOf = optionalString(a, "block_classification_recurrence_of", TOOL);
      if (classificationKind !== undefined && classificationKind !== "new-problem" && classificationKind !== "same-family-recurrence") {
        throw new Error(`${TOOL}: block_classification_kind must be 'new-problem' | 'same-family-recurrence'`);
      }
      if (classificationKind === undefined && classificationRecurrenceOf !== undefined) {
        throw new Error(`${TOOL}: block_classification_recurrence_of requires block_classification_kind`);
      }
      const debtSuite = optionalString(a, "evidence_debt_suite", TOOL);
      const debtSpecsRaw = optionalStringArray(a, "evidence_debt_specs", TOOL);
      const debtSpecs = debtSpecsRaw !== undefined && debtSpecsRaw.length > 0 ? debtSpecsRaw : undefined;
      const debtNote = optionalString(a, "evidence_debt_note", TOOL);
      if (debtSuite !== undefined || debtSpecs !== undefined) {
        if (debtSuite === undefined || debtSpecs === undefined) {
          throw new Error(`${TOOL}: evidence_debt_suite and a non-empty evidence_debt_specs must be given together`);
        }
      } else if (debtNote !== undefined) {
        throw new Error(`${TOOL}: evidence_debt_note requires evidence_debt_suite and evidence_debt_specs`);
      }
      const evFace = optionalString(a, "runtime_evidence_face", TOOL);
      const evArtifactsRaw = optionalStringArray(a, "runtime_evidence_artifacts", TOOL);
      const evArtifacts = evArtifactsRaw !== undefined && evArtifactsRaw.length > 0 ? evArtifactsRaw : undefined;
      const evNote = optionalString(a, "runtime_evidence_note", TOOL);
      if (evFace !== undefined || evArtifacts !== undefined) {
        if (evFace === undefined || evArtifacts === undefined) {
          throw new Error(`${TOOL}: runtime_evidence_face and a non-empty runtime_evidence_artifacts must be given together`);
        }
      } else if (evNote !== undefined) {
        throw new Error(`${TOOL}: runtime_evidence_note requires runtime_evidence_face and runtime_evidence_artifacts`);
      }
      const runtimeFace = optionalStringArray(a, "runtime_face", TOOL);
      if (runtimeFace !== undefined && runtimeFace.length === 0) {
        throw new Error(`${TOOL}: runtime_face must be a non-empty array when given`);
      }
      const input: SubmitTaskInput = {
        projectKey: deps.resolveProjectKey(exec),
        taskRef: { slug: requiredString(a, "slug", TOOL), localId: requiredString(a, "local_id", TOOL) },
        result,
        ...(optionalString(a, "reason", TOOL) !== undefined ? { reason: optionalString(a, "reason", TOOL) } : {}),
        ...(classificationKind !== undefined
          ? {
              blockClassification: {
                kind: classificationKind as "new-problem" | "same-family-recurrence",
                ...(classificationRecurrenceOf !== undefined ? { recurrenceOf: classificationRecurrenceOf } : {}),
              },
            }
          : {}),
        ...(optionalString(a, "summary", TOOL) !== undefined ? { summary: optionalString(a, "summary", TOOL) } : {}),
        ...(optionalStringArray(a, "files", TOOL) !== undefined ? { files: optionalStringArray(a, "files", TOOL) } : {}),
        ...(optionalStringArray(a, "files_created", TOOL) !== undefined ? { filesCreated: optionalStringArray(a, "files_created", TOOL) } : {}),
        ...(optionalStringArray(a, "files_modified", TOOL) !== undefined ? { filesModified: optionalStringArray(a, "files_modified", TOOL) } : {}),
        ...(acResults !== undefined ? { acceptanceCriteria: acResults } : {}),
        ...(optionalStringArray(a, "key_decisions", TOOL) !== undefined ? { keyDecisions: optionalStringArray(a, "key_decisions", TOOL) } : {}),
        ...(optionalNonNegativeInteger(a, "tests_passed", TOOL) !== undefined ? { testsPassed: optionalNonNegativeInteger(a, "tests_passed", TOOL) } : {}),
        ...(optionalNonNegativeInteger(a, "tests_failed", TOOL) !== undefined ? { testsFailed: optionalNonNegativeInteger(a, "tests_failed", TOOL) } : {}),
        ...(optionalFraction(a, "coverage", TOOL) !== undefined ? { coverage: optionalFraction(a, "coverage", TOOL) } : {}),
        ...(optionalString(a, "notes", TOOL) !== undefined ? { notes: optionalString(a, "notes", TOOL) } : {}),
        ...(gate !== undefined ? { gate } : {}),
        ...(optionalString(a, "commit_hash", TOOL) !== undefined ? { commitHash: optionalString(a, "commit_hash", TOOL) } : {}),
        ...(debtSuite !== undefined && debtSpecs !== undefined
          ? { evidenceDebt: { suite: debtSuite, specs: debtSpecs, ...(debtNote !== undefined ? { note: debtNote } : {}) } }
          : {}),
        ...(runtimeFace !== undefined ? { runtimeFace } : {}),
        ...(evFace !== undefined && evArtifacts !== undefined
          ? { runtimeEvidence: { face: evFace, artifacts: evArtifacts, ...(evNote !== undefined ? { note: evNote } : {}) } }
          : {}),
      };
      return submitTask(deps.verbDeps, input);
    },
  };
}
