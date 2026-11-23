// bug 四 tool 定义（plugin-project bug 写径/读径 agent tool 面——fix-bug 两阶段落库的
// 官方宿主挂载缝）：record_bug / resolve_bug 两写径 + get_bug / list_bugs 两读径，薄封装
// 消费本插件 forge.bugs 服务缝（BugsServicePort）。camelCase 旧定义（packages/plugin-forge
// src/tools/record-bug.ts 等）为旧宿主形态，本文件为官方 harness 迁移正本：
// - 注册名 snake_case（官方宿主注册名惯例——task-loop tools 同刻度；worker allowlist
//   WORKER_BUG_ESSENTIAL_TOOLS 三名词即本面 record_bug/resolve_bug/get_bug）。
// - 身份/归属解析下沉执行点：report/fix session id = 执行会话（键缺席降级缺席）；
//   projectId = 装配注入 resolver（cwd → projects 行派生）；reporter/fixer/证据反查
//   = 服务端 git 解析径（service.ts 承载）。
// - typed 服务错误原样抛出（harness tool error 面自解释——task-loop 工具族同口径；
//   失败 DTO 转写面为旧宿主 callToolFace 形态，本面不复制）。
// - source_task_id 注入径归 task-loop 派发上下文（worker 来源任务注册表），本插件
//   跨包不可达——键恒缺席（候选检索 container_slug 直比降级，standalone 同语义）。
import type { BugCard, BugsServicePort, GetBugResponse, RegisterBugResult } from "@dsh-forge/lib-api";
import { BUG_CARD_SUCCESS_SCHEMA } from "@dsh-forge/lib-api";
import { optionalString, requireArgsObject, requiredString } from "@dsh-forge/lib-api";
import type { BugToolExecFace, BugProjectIdResolver } from "./session.js";
import { optionalSessionId, requireProjectId, sessionContextOf } from "./session.js";

const BUG_STATUSES = ["open", "fixed", "unresolved"] as const;
const BUG_SORTS = ["active", "created"] as const;

/** 参数 schema（官方 enforced JSON Schema subset——task-loop 工具族同形状子集） */
export interface BugToolParametersSchema {
  readonly type: "object";
  readonly properties: Readonly<
    Record<string, { readonly type: string; readonly items?: { readonly type: string }; readonly description: string }>
  >;
  readonly required?: readonly string[];
}

/** 注册面 tool 定义（官方 ToolDefinition 消费字段子集——name/description/parameters/output/execute） */
export interface BugToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: BugToolParametersSchema;
  readonly output: {
    readonly schema: unknown;
    render(args: unknown, value: unknown): readonly { readonly type: "text"; readonly text: string }[];
  };
  execute(args: unknown, exec: BugToolExecFace): Promise<unknown>;
}

/** 工具面依赖缝：forge.bugs 服务惰性现查（AGENTS 1.6——调用期求值不缓存；装配降级态
 *  可返 undefined——执行点 typed 拒自解释）+ cwd → projectId */
export interface BugToolsDeps {
  readonly bugs: () => BugsServicePort | undefined;
  readonly resolveProjectId: BugProjectIdResolver;
}

/** 服务缝现查（降级态 = 明确拒——不静默） */
function bugsOf(deps: BugToolsDeps): BugsServicePort {
  const bugs = deps.bugs();
  if (bugs === undefined) throw new Error("bug ledger service unavailable (project bugs seam degraded)");
  return bugs;
}

/** 行文本投影助手（键值行——值缺席键省略） */
function kvOf(entries: readonly (readonly [string, string | undefined])[]): readonly string[] {
  return entries.filter(([, v]) => v !== undefined).map(([k, v]) => `- ${k}: ${v}`);
}

function cardLinesOf(c: BugCard): readonly string[] {
  return kvOf([
    ["bugId", c.bugId],
    ["status", c.bugStatus],
    ["errorType", c.errorType],
    ["suspected", c.suspected],
    ["commitHash", c.commitHash],
    ["fixer", c.fixer],
    ["recurrenceOf", c.recurrenceOf],
  ]);
}

// ── record_bug ──

const RECORD_BUG_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    card: BUG_CARD_SUCCESS_SCHEMA,
    errorTypeSuggestions: {
      type: "array",
      items: { type: "string" },
      description:
        "Distinct errorType labels already in the ledger (most frequent first, capped) — reference vocabulary only: reuse an existing close label; coin a new one only when none fits.",
    },
  },
  required: ["card", "errorTypeSuggestions"],
} as const;

function renderRecordBug(_args: unknown, value: unknown): readonly { type: "text"; text: string }[] {
  const v = value as RegisterBugResult;
  return [
    {
      type: "text",
      text: [
        `✓ Bug registered (open) — ${v.card.summary}`,
        ...cardLinesOf(v.card),
        ...(v.errorTypeSuggestions.length > 0 ? [`- errorTypeSuggestions (reuse first): ${v.errorTypeSuggestions.join(", ")}`] : []),
      ].join("\n"),
    },
  ];
}

function createRecordBugTool(deps: BugToolsDeps): BugToolDefinition {
  return {
    name: "record_bug",
    description:
      "Register a bug in the forge bug ledger (lands an open record and returns its bug_id). Submit semantic fields only: a one-line summary (max 50 chars — longer is rejected), the five Bug Summary fields (bug_desc / trigger_desc / expected / actual; suspected location and error_type optional), and an optional recurrence_of predecessor bug_id when this is a recurrence of a known problem (omit on first occurrence; use list_bugs to find candidates). error_type discipline: the response carries errorTypeSuggestions — reuse an existing semantically-close label first; coin a new label only when none fits; avoid synonym variants. Identity and repo state are resolved server-side (reporter from git config, report session from the executing session). Use at diagnosis time per the fix-bug flow; backfill the outcome later via resolve_bug.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One-line summary, max 50 chars; longer summaries are rejected." },
        bug_desc: { type: "string", description: "Bug: full description of the defect." },
        trigger_desc: { type: "string", description: "Trigger: reproduction steps / input." },
        expected: { type: "string", description: "Expected: correct behavior." },
        actual: { type: "string", description: "Actual: observed behavior." },
        suspected: { type: "string", description: "Suspected location (file:line) — optional repair lead for open records." },
        error_type: { type: "string", description: "Free-form error type label — optional stats dimension. Reuse an existing ledger label first; avoid synonym variants." },
        recurrence_of: { type: "string", description: "Recurrence-chain predecessor bug_id of the SAME problem (omit on first occurrence; dangling reference is rejected)." },
      },
      required: ["summary", "bug_desc", "trigger_desc", "expected", "actual"],
    },
    output: { schema: RECORD_BUG_OUTPUT_SCHEMA, render: renderRecordBug },
    async execute(args: unknown, exec: BugToolExecFace): Promise<RegisterBugResult> {
      const a = requireArgsObject(args, "record_bug");
      const session = sessionContextOf(exec);
      const projectId = await requireProjectId(deps.resolveProjectId, session);
      const suspected = optionalString(a, "suspected", "record_bug");
      const errorType = optionalString(a, "error_type", "record_bug");
      const recurrenceOf = optionalString(a, "recurrence_of", "record_bug");
      const sessionId = optionalSessionId(session);
      return bugsOf(deps).registerBug({
        projectId,
        summary: requiredString(a, "summary", "record_bug"),
        bugDesc: requiredString(a, "bug_desc", "record_bug"),
        triggerDesc: requiredString(a, "trigger_desc", "record_bug"),
        expected: requiredString(a, "expected", "record_bug"),
        actual: requiredString(a, "actual", "record_bug"),
        ...(suspected !== undefined ? { suspected } : {}),
        ...(errorType !== undefined ? { errorType } : {}),
        ...(recurrenceOf !== undefined ? { recurrenceOf } : {}),
        ...(sessionId !== undefined ? { reportSessionId: sessionId } : {}),
      });
    },
  };
}

// ── resolve_bug ──

const RESOLVE_BUG_OUTPUT_SCHEMA = {
  type: "object",
  properties: { card: BUG_CARD_SUCCESS_SCHEMA },
  required: ["card"],
} as const;

function renderResolveBug(_args: unknown, value: unknown): readonly { type: "text"; text: string }[] {
  const v = value as BugCard;
  return [{ type: "text", text: [`✓ Bug backfilled (${v.bugStatus}) — ${v.summary}`, ...cardLinesOf(v)].join("\n") }];
}

function createResolveBugTool(deps: BugToolsDeps): BugToolDefinition {
  return {
    name: "resolve_bug",
    description:
      "Backfill the terminal state of a registered bug (open → fixed | unresolved, one-way). For 'fixed': commit_hash is required — capture it right after the fix+tests atomic commit (git rev-parse HEAD — the concurrency-safe anchor; the server reverse-looks-up worktree/branch from it) and provide fix_approach (what was fixed and why this approach — the ledger review surface). For 'unresolved': unresolved_reason is required (the reason the bug could not be reproduced — HARD-GATE stop). Fixer identity is resolved server-side. Use after the fix lands per the fix-bug flow, referencing the bug_id returned by record_bug.",
    parameters: {
      type: "object",
      properties: {
        bug_id: { type: "string", description: "Bug id returned by record_bug." },
        outcome: { type: "string", description: "'fixed' | 'unresolved'." },
        commit_hash: { type: "string", description: "fixed: atomic commit hash (git rev-parse HEAD right after the commit)." },
        unresolved_reason: { type: "string", description: "unresolved: why the bug could not be reproduced / fixed (HARD-GATE stop reason)." },
        fix_approach: { type: "string", description: "fixed: adopted fix approach summary (what was fixed, why this approach; recurrence families additionally need the coverage: / anchor: protocol lines)." },
      },
      required: ["bug_id", "outcome"],
    },
    output: { schema: RESOLVE_BUG_OUTPUT_SCHEMA, render: renderResolveBug },
    async execute(args: unknown, exec: BugToolExecFace): Promise<BugCard> {
      const a = requireArgsObject(args, "resolve_bug");
      const session = sessionContextOf(exec);
      const projectId = await requireProjectId(deps.resolveProjectId, session);
      const outcome = requiredString(a, "outcome", "resolve_bug");
      if (outcome !== "fixed" && outcome !== "unresolved") {
        throw new Error("resolve_bug: outcome must be one of [fixed, unresolved]");
      }
      const commitHash = optionalString(a, "commit_hash", "resolve_bug");
      const unresolvedReason = optionalString(a, "unresolved_reason", "resolve_bug");
      const fixApproach = optionalString(a, "fix_approach", "resolve_bug");
      const sessionId = optionalSessionId(session);
      return bugsOf(deps).resolveBug({
        projectId,
        bugId: requiredString(a, "bug_id", "resolve_bug"),
        outcome,
        ...(commitHash !== undefined ? { commitHash } : {}),
        ...(unresolvedReason !== undefined ? { unresolvedReason } : {}),
        ...(fixApproach !== undefined ? { fixApproach } : {}),
        ...(sessionId !== undefined ? { fixSessionId: sessionId } : {}),
      });
    },
  };
}

// ── get_bug ──

const GET_BUG_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    card: BUG_CARD_SUCCESS_SCHEMA,
    chain: {
      type: "object",
      properties: {
        entries: { type: "array", items: { type: "object" }, description: "Chain entries in chronological order (chain root first)." },
        currentIndex: { type: "number", description: "This bug's 0-based position on the chain." },
        length: { type: "number", description: "Chain length (recurrence count = length - 1)." },
        rootBugId: { type: "string", description: "Chain root bug_id." },
      },
      required: ["entries", "currentIndex", "length", "rootBugId"],
    },
  },
  required: ["card"],
} as const;

function renderGetBug(_args: unknown, value: unknown): readonly { type: "text"; text: string }[] {
  const v = value as GetBugResponse;
  const chain =
    v.chain === undefined
      ? []
      : [`- chain: length ${v.chain.length}, position ${v.chain.currentIndex}, root ${v.chain.rootBugId}`];
  return [{ type: "text", text: [`✓ Bug fetched — ${v.card.summary}`, ...cardLinesOf(v.card), ...chain].join("\n") }];
}

function createGetBugTool(deps: BugToolsDeps): BugToolDefinition {
  return {
    name: "get_bug",
    description:
      "Fetch one bug by bug_id: the full BugCard plus its recurrence-chain context (when the bug sits on a chain — chronological entries, this bug position, chain length, root bug_id). Coding-fix workers use it for deep chain inspection before record_bug (to pick the correct recurrence_of predecessor) and to read prior fix approaches; the main agent uses it for ledger deep-dives. Unknown bug_id is rejected.",
    parameters: {
      type: "object",
      properties: { bug_id: { type: "string", description: "Bug id (from list_bugs rows, record_bug results, or dispatch brief chain candidates)." } },
      required: ["bug_id"],
    },
    output: { schema: GET_BUG_OUTPUT_SCHEMA, render: renderGetBug },
    async execute(args: unknown, exec: BugToolExecFace): Promise<GetBugResponse> {
      const a = requireArgsObject(args, "get_bug");
      const session = sessionContextOf(exec);
      const projectId = await requireProjectId(deps.resolveProjectId, session);
      return bugsOf(deps).getBug({ projectId, bugId: requiredString(a, "bug_id", "get_bug") });
    },
  };
}

// ── list_bugs ──

const LIST_BUGS_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    cards: { type: "array", items: { type: "object" }, description: "Matching bug cards in service order (active-first by default)." },
  },
  required: ["cards"],
} as const;

function renderListBugs(_args: unknown, value: unknown): readonly { type: "text"; text: string }[] {
  const cards = (value as { cards: BugCard[] }).cards;
  const lines =
    cards.length === 0
      ? ["(no matching bugs)"]
      : cards.map((c) => `- ${c.bugId} [${c.bugStatus}] ${c.summary}${c.errorType !== undefined ? ` (${c.errorType})` : ""}`);
  return [{ type: "text", text: [`✓ ${cards.length} bug(s) matched`, ...lines].join("\n") }];
}

function createListBugsTool(deps: BugToolsDeps): BugToolDefinition {
  return {
    name: "list_bugs",
    description:
      "List bug ledger cards (main agent read face). search does case-insensitive substring matching over the seven text fields (summary / bug_desc / trigger_desc / expected / actual / error_type / suspected location) plus status labels; status filters by open/fixed/unresolved; sort = active (non-terminal first) | created (newest first); offset/limit paginate server-side after sorting. Use to survey the ledger and to find recurrence-chain candidates before record_bug (pass the found bug_id as recurrence_of).",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Free-text keyword (substring hit on any of the seven text fields); omitted = no filter." },
        status: { type: "array", items: { type: "string" }, description: "Status chips filter (subset of open/fixed/unresolved); empty or omitted = all." },
        sort: { type: "string", description: "active = non-terminal first / created = newest first." },
        offset: { type: "number", description: "Pagination offset (default 0)." },
        limit: { type: "number", description: "Page size (omitted = full result)." },
      },
    },
    output: { schema: LIST_BUGS_OUTPUT_SCHEMA, render: renderListBugs },
    async execute(args: unknown, exec: BugToolExecFace): Promise<{ cards: BugCard[] }> {
      const a = requireArgsObject(args, "list_bugs");
      const session = sessionContextOf(exec);
      const projectId = await requireProjectId(deps.resolveProjectId, session);
      const search = optionalString(a, "search", "list_bugs");
      const rawStatus = a["status"];
      if (rawStatus !== undefined && (!Array.isArray(rawStatus) || rawStatus.some((e) => typeof e !== "string" || !(BUG_STATUSES as readonly string[]).includes(e)))) {
        throw new Error("list_bugs: status must only contain [open, fixed, unresolved]");
      }
      const sort = optionalString(a, "sort", "list_bugs");
      if (sort !== undefined && !(BUG_SORTS as readonly string[]).includes(sort)) {
        throw new Error("list_bugs: sort must be one of [active, created]");
      }
      const offset = a["offset"];
      const limit = a["limit"];
      for (const [key, v] of [["offset", offset], ["limit", limit]] as const) {
        if (v !== undefined && (typeof v !== "number" || !Number.isInteger(v) || v < 0)) {
          throw new Error(`list_bugs: ${key} must be a non-negative integer`);
        }
      }
      const cards = await bugsOf(deps).listBugs({
        projectId,
        ...(search !== undefined ? { search } : {}),
        ...(rawStatus !== undefined ? { status: rawStatus as (typeof BUG_STATUSES)[number][] } : {}),
        ...(sort !== undefined ? { sort: sort as (typeof BUG_SORTS)[number] } : {}),
        ...(offset !== undefined ? { offset: offset as number } : {}),
        ...(limit !== undefined ? { limit: limit as number } : {}),
      });
      return { cards };
    },
  };
}

/** bug 工具族装配（四员单源——注册缝逐枚消费） */
export function createBugTools(deps: BugToolsDeps): readonly BugToolDefinition[] {
  return [createRecordBugTool(deps), createResolveBugTool(deps), createGetBugTool(deps), createListBugsTool(deps)];
}
