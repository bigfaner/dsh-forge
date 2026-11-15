// dispatchPrompt 合成（core forge/tasks/prompt/compose.ts 直迁——plugin-task-loop 1.7 内联 +
// 简报形态重设计，code-design §简报形态：元数据表格前置 + 正文三段 markdown + `<resume>` 尾段）。
//
// 简报形态（渲染确定性约束——digest 幂等）：
//   · 元数据表格行序固定：TASK_ID → FLAGS → BLOCKERS → CONTEXT → COVERAGE →
//     E2E_BASELINE_RED → TEST_BASELINE；CONTEXT 键、影响范围组内路径、BLOCKERS 依赖项均
//     字母序；FLAGS 固定序（priority → fix-of → breaking）；缺省行省（纯函数）。
//   · 正文段：`## 任务目标`（brief 裸文本段）→ `## 验收条件`（逐字判据列表）→ `## 影响范围`
//     （scope 分组列表，组内字母序、缺组整组省）。
//   · `<resume>` 续跑段（fresh/stale 两态）置于文档尾部。
// slug 化退役面：SOURCE 行退役（容器即 slug——与 TASK_ID 冗余）；PHASE_SUMMARY 行退役
// （feature 相位机数据源已断）；VARS → CONTEXT 行两级更名终态；`<goal>` 包裹撤除。
// 定位铁律：纯函数禁 IO（BLOCKERS 等动态值由调用方领取瞬间取数注入）。
import { TASK_TYPES } from "@dsh-forge/contracts";
import type { TaskPrerequisiteSummary, TaskScope, TaskType } from "../types.js";

// ─────────────────────────── CATEGORY 映射 ───────────────────────────

/** 任务类别（submit-task 路由面） */
export type TaskCategory = "coding" | "doc" | "test" | "validation" | "gate" | "eval";

/** TaskType → 类别（编译期穷尽——加类型即编译红，逼映射裁决） */
export const TASK_CATEGORY_FOR_TYPE: Readonly<Record<TaskType, TaskCategory>> = {
  "coding-feature": "coding",
  "coding-enhancement": "coding",
  "coding-cleanup": "coding",
  "coding-refactor": "coding",
  "code-quality-simplify": "coding",
  "coding-fix": "coding",
  gate: "gate",
  doc: "doc",
  "doc-consolidate": "doc",
  "doc-drift": "doc",
  "doc-review": "doc",
  "doc-summary": "doc",
  "test-run": "test",
  "test-gen-contracts": "test",
  "test-gen-journeys": "test",
  "test-gen-scripts": "test",
  "validation-code": "validation",
  "validation-ux": "validation",
  "eval-contract": "eval",
  "eval-journey": "eval",
};

// ─────────────────────────── COVERAGE 解析 ───────────────────────────

/** COVERAGE 指令（percentage = 阈值百分比；maintain = 维持现状不新增测试） */
export type CoverageDirective = { strategy: "percentage"; target: number } | { strategy: "maintain" };

/**
 * 覆盖率指令解析（纯函数）：仅 coding 系产生指令；coding-cleanup / coding-refactor 恒
 * maintain；阈值三级优先的取数归调用方，本函数只做「值 + 类型 → 行文本指令」纯映射。
 */
export function resolveCoverage(taskType: TaskType, coverage?: number): CoverageDirective | undefined {
  if (TASK_CATEGORY_FOR_TYPE[taskType] !== "coding") return undefined;
  if (taskType === "coding-cleanup" || taskType === "coding-refactor") return { strategy: "maintain" };
  if (coverage === undefined) return undefined;
  return { strategy: "percentage", target: Math.round(coverage * 100) };
}

// ─────────────────────────── 合成输入（动态块键的注入面） ───────────────────────────

export interface DispatchPromptInput {
  /** 容器 slug（TASK_ID 组成部） */
  slug: string;
  /** 容器内局部键（数值顺延 / fix-N·disc-N） */
  localId: string;
  /** 任务标题（TITLE——文档首行 `# {title}`） */
  title?: string;
  /** 任务简报正文（`## 任务目标` 段——brief 列裸文本；db-only 任务 = worker 的定义正文） */
  brief?: string;
  /** 验收清单（`## 验收条件` 段——ac_json 数组逐行逐字；空数组省段） */
  acceptanceCriteria?: readonly string[];
  /** 受影响文件范围（`## 影响范围` 段——scope_json 分组渲染） */
  scope?: TaskScope;
  /** 附加上下文注入（CONTEXT 表格行——KEY=VALUE；键序字母序确定性渲染） */
  context?: Readonly<Record<string, string>>;
  taskType: TaskType;
  priority?: "P0" | "P1" | "P2";
  /** 覆盖率阈值小数（0–1；解析见 resolveCoverage） */
  coverage?: number;
  /** BLOCKERS 快照（前置依赖现状——领取瞬间取数注入；空数组省行） */
  blockers?: readonly TaskPrerequisiteSummary[];
  breaking?: boolean;
  /** fix 链源（FLAGS fix-of 标记；非 fix 任务缺席） */
  sourceTask?: { readonly slug: string; readonly localId: string };
  /** 续跑指针（领取瞬间探测证据位注入；缺席 = 首跑零段） */
  evidencePointer?: string;
  /** 证据效度态（true = 效度戳缺失/漂移——`<resume>` stale 规则段强制重跑） */
  evidenceStale?: boolean;
  /** e2e 红灯基线清单（E2E_BASELINE_RED 表格行；缺席/空数组省行） */
  e2eBaselineRedCases?: readonly string[];
  /** 测试基线两形态载荷（TEST_BASELINE 表格行；缺席入参省行） */
  testBaseline?: TestBaselineBrief;
}

/** 测试基线简报载荷（驱动器 claim 时现查合成；纯渲染零 IO） */
export interface TestBaselineBrief {
  readonly present: boolean;
  readonly path?: string;
  readonly recordedAt?: string;
}

// ─────────────────────────── 续跑规则段 ───────────────────────────

/** 断点续跑进度文件名（探测侧与落盘侧共享单点定义） */
export const RESUME_POINTER_FILE = "resume.md";

/** `<resume>` 续跑规则段（fresh 形态——路径只引用变量 `{forge.task_logs_dir}`） */
export const RESUME_SECTION = `<resume>
续跑说明：本段在场 = 本任务已有部分进度，进度文件为 {forge.task_logs_dir}/resume.md（效度域内的进度台账——其效度戳已与本轮效度域比对一致，可复用）。
1. 首步读取该文件：内容为「已完成 / 进行中 / 待办」三项；将未完成项转入 todo_write 后继续执行，不得重做已完成部分。
2. 同目录下按编号命名的子文件夹（如 001-login-fail/）为此前各轮产物：先核对内容，再决定沿用或重跑；未核对不得覆盖。
3. 遇到阻塞性问题时覆盖写入该文件，仅保留最新状态。
4. 本段缺席 = 首次执行：从零开始，并自第一轮起按上述方式维护该文件。
</resume>`;

/** `<resume>` stale 规则段（效度域漂移形态——证据降级历史记录，强制重跑） */
export const RESUME_STALE_SECTION = `<resume>
续跑说明：本任务存在历史进度文件 {forge.task_logs_dir}/resume.md，但其效度戳与当前效度域（HEAD commit / 基线签名）比对不一致——证据已跨效度域，不得复用。
1. 该文件降级为历史记录（只叙不判）：可读以了解此前做过什么，但其「已完成」声明一律不可信，不得据此跳过任何步骤或虚报进度。
2. 同目录编号子文件夹中的证据类产物（测试输出、截图、票据）一律重跑重取；代码结论须以当前树现读为准。
3. 从零建立 todo_write 待办并全量执行；结算前覆盖写入该文件，仅保留最新状态。
</resume>`;

// ─────────────────────────── 表格行/正文段渲染（纯函数） ───────────────────────────

/** FLAGS 行值：固定序 priority → fix-of → breaking；全缺省 = undefined（整行省） */
function renderFlags(input: DispatchPromptInput): string | undefined {
  const flags: string[] = [];
  if (input.priority !== undefined) flags.push(input.priority);
  if (input.sourceTask) flags.push(`fix-of ${input.sourceTask.slug}/${input.sourceTask.localId}`);
  if (input.breaking) flags.push("breaking");
  return flags.length > 0 ? flags.join(", ") : undefined;
}

/** CONTEXT 行值：`K1=V1; K2=V2`（键序字母序——同 context_json 恒同简报，digest 幂等；空对象省行） */
function renderContext(context: Readonly<Record<string, string>> | undefined): string | undefined {
  if (context === undefined) return undefined;
  const keys = Object.keys(context).sort();
  if (keys.length === 0) return undefined;
  return keys.map((k) => `${k}=${context[k]}`).join("; ");
}

/** E2E_BASELINE_RED 行值（红灯 spec 清单 + 机械判定规则；空清单省行） */
function renderE2eBaselineRed(red: readonly string[] | undefined): string | undefined {
  if (red === undefined || red.length === 0) return undefined
  return `${red.slice().sort().join("; ")}（基线红灯 = e2e 套件入场前既有失败，非本任务回归——比对归因，禁止顺手修复；双轨基线并存时以 E2E_BASELINE_RED 用例级清单优先，TEST_BASELINE 文档基线作补充归因参考）`
}

/** TEST_BASELINE 行值（两形态载荷纯渲染；缺席入参省行） */
export function renderTestBaseline(brief: TestBaselineBrief | undefined): string | undefined {
  if (brief === undefined) return undefined;
  if (!brief.present) return "无既有失败清单，遇失败默认按新回归上报";
  const when = brief.recordedAt !== undefined ? `（基线时点：${brief.recordedAt}）` : "";
  return `${brief.path}${when}（既有失败清单正本——遇失败先比对区分既有失败与新回归；双轨基线并存时以 E2E_BASELINE_RED 用例级清单优先，TEST_BASELINE 文档基线作补充归因参考）`;
}

/** AC 条目单行化（换行折叠空格——机械提取无歧义，criterion 交叉校验同源） */
function singleLine(criterion: string): string {
  return criterion.replace(/\s*\r?\n\s*/g, " ");
}

/** `## 影响范围` 段（scope 分组列表——组内路径字母序、缺组整组省；未声明整段省） */
function renderScopeSection(scope: TaskScope | undefined): string | undefined {
  if (scope === undefined) return undefined;
  const groups: string[] = [];
  for (const key of ["created", "modified", "removed"] as const) {
    const arr = scope[key];
    if (arr === undefined || arr.length === 0) continue;
    groups.push(...arr.slice().sort().map((p) => `- ${key}: ${p}`));
  }
  if (groups.length === 0) return undefined;
  return ["## 影响范围", "", ...groups].join("\n");
}

/**
 * 简报全文（形态 = 元数据表格前置 + TITLE 首行 + 正文三段 + `<resume>` 尾段）：
 * 元数据表格（TASK_ID → FLAGS → BLOCKERS → CONTEXT → COVERAGE → E2E_BASELINE_RED →
 * TEST_BASELINE，缺省行省）→ `# {title}`（缺席省）→ `## 任务目标` → `## 验收条件` →
 * `## 影响范围` → `<resume>`（evidencePointer 在场才注入）。
 */
export function renderTaskContext(input: DispatchPromptInput): string {
  const coverage = resolveCoverage(input.taskType, input.coverage);
  const flags = renderFlags(input);
  const context = renderContext(input.context);
  const e2eBaselineRedCases = renderE2eBaselineRed(input.e2eBaselineRedCases);
  const testBaseline = renderTestBaseline(input.testBaseline);
  const blockers =
    input.blockers !== undefined && input.blockers.length > 0
      ? input.blockers
          .slice()
          .sort((a, b) => `${a.slug}/${a.localId}`.localeCompare(`${b.slug}/${b.localId}`))
          .map((b) => `${b.localId} ${b.taskStatus}`)
          .join("; ")
      : undefined;

  const metaRows: string[] = ["| 键 | 值 |", "|---|---|"];
  metaRows.push(`| TASK_ID | ${input.slug}/${input.localId} |`);
  if (flags !== undefined) metaRows.push(`| FLAGS | ${flags} |`);
  if (blockers !== undefined) metaRows.push(`| BLOCKERS | ${blockers} |`);
  if (context !== undefined) metaRows.push(`| CONTEXT | ${context} |`);
  if (coverage !== undefined) {
    metaRows.push(`| COVERAGE | ${coverage.strategy === "maintain" ? "maintain" : `percentage ${coverage.target}%`} |`);
  }
  if (e2eBaselineRedCases !== undefined) metaRows.push(`| E2E_BASELINE_RED | ${e2eBaselineRedCases} |`);
  if (testBaseline !== undefined) metaRows.push(`| TEST_BASELINE | ${testBaseline} |`);

  const sections: string[] = [metaRows.join("\n")];

  const body: string[] = [];
  if (input.title !== undefined) body.push(`# ${input.title}`, "");
  if (input.brief !== undefined && input.brief.trim() !== "") {
    body.push("## 任务目标", "", input.brief, "");
  }
  if (input.acceptanceCriteria !== undefined && input.acceptanceCriteria.length > 0) {
    body.push("## 验收条件", "", ...input.acceptanceCriteria.map((ac) => `- ${singleLine(ac)}`), "");
  }
  const scopeSection = renderScopeSection(input.scope);
  if (scopeSection !== undefined) body.push(scopeSection, "");
  if (body.length > 0) sections.push(body.join("\n").trimEnd());

  let doc = sections.join("\n\n");
  if (input.evidencePointer !== undefined) {
    doc += `\n\n${input.evidenceStale === true ? RESUME_STALE_SECTION : RESUME_SECTION}`;
  }
  return doc;
}

/**
 * dispatchPrompt 合成（纯函数零 IO）：任务级简报全文直出；digest 由调用方经
 * dispatchDigest(全文) 取值（claimTask 落 claim record）。
 */
export function composeDispatchPrompt(input: DispatchPromptInput): string {
  if (!TASK_TYPES.includes(input.taskType)) {
    throw new Error(`dispatchPrompt: unknown task type: ${String(input.taskType)}`);
  }
  return renderTaskContext(input);
}
