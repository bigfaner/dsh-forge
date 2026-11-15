// impl-checkpoint 三员工具面（bug a033636f——fix-8 单装工具族注册缝补件：plugin-forge
// src/tools/impl-checkpoint.ts 直迁改锚 task-loop 域面）。① checkpoints 域服务（本插件
// domain/checkpoints createCheckpointsService）薄封装：唯一约束 / wave_seq 规则 / append-only
// 全在域内承载，本壳只做参数防御收窄 + 路由 + 双渲染，零业务规则。跨容器清单 = 任务域
// listTasks 枚举容器后逐容器取流水（域查询按 slug 单容器——工具层组合，不复制域逻辑）。
// 任务域风格：域 typed 错误原样抛出（失败信封退役——query-task 同口径），render 纯投影。
import {
  type CheckpointMark,
  type CheckpointRow,
  type CheckpointSnapshots,
  type CheckpointsService,
} from "../domain/checkpoints/service.js";
import type { TaskCard } from "../domain/tasks/types.js";
import {
  optionalNonNegativeInteger,
  optionalStringArray,
  requireArgsObject,
  requiredEnum,
  requiredString,
} from "./args.js";
import type { TaskToolDefinition, TaskToolExecFace } from "./faces.js";

/** 标记词库（域 CheckpointMark 联合类型同源镜像——DDL CHECK / 服务端预检背书） */
export const CHECKPOINT_MARKS = [
  "first-pass-complete",
  "retro-done",
  "review-wave-N",
  "stabilized",
  "merged",
  "derived-to-child",
] as const;

/** 任务域清单消费面（跨容器枚举——listTasks 单法窄面） */
export interface TasksListFace {
  listTasks(q: { readonly projectKey: string }): Promise<readonly TaskCard[]>;
}

/** 三员共用 deps（域服务注入 + projectKey 解析缝——任务动词工具同形） */
export interface ImplCheckpointToolDeps {
  readonly checkpoints: CheckpointsService;
  readonly tasks: TasksListFace;
  readonly resolveProjectKey: (exec: TaskToolExecFace) => string;
}

// ─────────────────────────── 四项硬指标（纯投影） ───────────────────────────

/** 四项硬指标（相邻/首末标记帧差值派生——缺帧项键缺席） */
export interface CheckpointMetrics {
  readonly firstPassRate?: number;
  readonly reworkCommitRatio?: number;
  readonly reviewWaveCount: number;
  readonly fixDensity?: number;
}

/** 四项硬指标计算（纯投影——输入域时序流水，输出比率面；无帧/分母零的项键缺席） */
export function computeCheckpointMetrics(rows: readonly CheckpointRow[]): CheckpointMetrics {
  const firstPass = rows.find((r) => r.mark === "first-pass-complete");
  const terminal = rows.length > 0 ? rows[rows.length - 1]! : undefined;
  const ratio = (num: number, den: number): number | undefined => (den > 0 ? num / den : undefined);
  const firstPassRate = firstPass !== undefined && terminal !== undefined ? ratio(firstPass.tasksTotal, terminal.tasksTotal) : undefined;
  const reworkCommitRatio =
    firstPass !== undefined && terminal !== undefined ? ratio(terminal.commitsTotal - firstPass.commitsTotal, terminal.commitsTotal) : undefined;
  const fixDensity = terminal !== undefined ? ratio(terminal.fixesTotal, terminal.tasksTotal) : undefined;
  return {
    ...(firstPassRate !== undefined ? { firstPassRate } : {}),
    ...(reworkCommitRatio !== undefined ? { reworkCommitRatio } : {}),
    reviewWaveCount: rows.filter((r) => r.mark === "review-wave-N").length,
    ...(fixDensity !== undefined ? { fixDensity } : {}),
  };
}

/** 快照面收窄（snapshots 入参对象——四计数非负整数，缺省零） */
function snapshotsInputOf(a: Record<string, unknown>, tool: string): CheckpointSnapshots {
  const raw = a["snapshots"];
  if (raw === undefined) return { tasksTotal: 0, commitsTotal: 0, fixesTotal: 0, evidenceDebtsTotal: 0 };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${tool}: snapshots must be an object of non-negative integer counters`);
  }
  const s = raw as Record<string, unknown>;
  return {
    tasksTotal: optionalNonNegativeInteger(s, "tasksTotal", tool) ?? 0,
    commitsTotal: optionalNonNegativeInteger(s, "commitsTotal", tool) ?? 0,
    fixesTotal: optionalNonNegativeInteger(s, "fixesTotal", tool) ?? 0,
    evidenceDebtsTotal: optionalNonNegativeInteger(s, "evidenceDebtsTotal", tool) ?? 0,
  };
}

/** 可选正整数（wave_seq——review-wave-N 专用） */
function optionalPositiveInteger(a: Record<string, unknown>, key: string, tool: string): number | undefined {
  const v = a[key];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    throw new Error(`${tool}: ${key} must be a positive integer`);
  }
  return v;
}

/** mark 元素词表收窄 */
function optionalMarkArray(a: Record<string, unknown>, key: string, tool: string): CheckpointMark[] | undefined {
  const raw = optionalStringArray(a, key, tool);
  if (raw === undefined) return undefined;
  return raw.map((e) => {
    if (!(CHECKPOINT_MARKS as readonly string[]).includes(e)) {
      throw new Error(`${tool}: ${key} must only contain [${CHECKPOINT_MARKS.join(", ")}]`);
    }
    return e as CheckpointMark;
  });
}

/** render 纯文本单行投影 */
function textOf(text: string): readonly { readonly type: "text"; readonly text: string }[] {
  return [{ type: "text", text }];
}

// ─────────────────────────── record_impl_checkpoint ───────────────────────────

const RECORD_TOOL = "record_impl_checkpoint";

/** 参数防御性收窄 */
export function parseRecordImplCheckpointArgs(args: unknown): {
  slug: string;
  mark: CheckpointMark;
  waveSeq?: number;
  baseCommitHash: string;
  snapshots: CheckpointSnapshots;
} {
  const a = requireArgsObject(args, RECORD_TOOL);
  const waveSeq = optionalPositiveInteger(a, "wave_seq", RECORD_TOOL);
  return {
    slug: requiredString(a, "slug", RECORD_TOOL),
    mark: requiredEnum(a, "mark", CHECKPOINT_MARKS, RECORD_TOOL),
    ...(waveSeq !== undefined ? { waveSeq } : {}),
    baseCommitHash: requiredString(a, "base_commit_hash", RECORD_TOOL),
    snapshots: snapshotsInputOf(a, RECORD_TOOL),
  };
}

/** record tool 定义工厂（域 appendCheckpoint 薄封装——typed 错误域内抛出） */
export function createRecordImplCheckpointTool(deps: ImplCheckpointToolDeps): TaskToolDefinition {
  return {
    name: RECORD_TOOL,
    description:
      "Append an implementation checkpoint mark row for a container (main agent only; append-only ledger). Args: slug (container slug), mark (first-pass-complete / retro-done / review-wave-N / stabilized / merged / derived-to-child), base_commit_hash (container branch HEAD at mark time), optional wave_seq (review-wave-N only — omit to auto-increment), optional snapshots counters (default zero). Milestone marks are unique per (container, mark, wave_seq); duplicates are rejected. Zero business rules here — validation and persistence live in the checkpoints domain.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Container slug the checkpoint attaches to." },
        mark: { type: "string", description: "Checkpoint mark — one of the five milestone marks plus derived-to-child." },
        wave_seq: { type: "number", description: "Wave number, review-wave-N only (positive integer; omit = auto-increment max+1)." },
        base_commit_hash: { type: "string", description: "Container branch HEAD commit hash at mark time." },
        snapshots: {
          type: "object",
          description:
            "Optional counters at mark time (tasksTotal/commitsTotal/fixesTotal/evidenceDebtsTotal, non-negative integers; default zero) — the four hard metrics are frame differences of these counters.",
        },
      },
      required: ["slug", "mark", "base_commit_hash"],
    },
    output: {
      schema: {},
      render: (_args, value) => {
        const { checkpoint } = value as { checkpoint: CheckpointRow };
        const bits = [`- ${checkpoint.mark}${checkpoint.waveSeq !== undefined ? `#${String(checkpoint.waveSeq)}` : ""}`];
        bits.push(`  container: ${checkpoint.slug}`);
        bits.push(`  base commit: ${checkpoint.baseCommitHash}`);
        bits.push(
          `  snapshots: tasks=${String(checkpoint.tasksTotal)} commits=${String(checkpoint.commitsTotal)} fixes=${String(checkpoint.fixesTotal)} evidenceDebts=${String(checkpoint.evidenceDebtsTotal)}`,
        );
        return textOf(["✓ checkpoint recorded", ...bits].join("\n"));
      },
    },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<{ checkpoint: CheckpointRow }> {
      const parsed = parseRecordImplCheckpointArgs(args);
      const projectKey = deps.resolveProjectKey(exec);
      const checkpoint = await deps.checkpoints.appendCheckpoint({
        projectKey,
        containerSlug: parsed.slug,
        mark: parsed.mark,
        ...(parsed.waveSeq !== undefined ? { waveSeq: parsed.waveSeq } : {}),
        baseCommitHash: parsed.baseCommitHash,
        snapshots: parsed.snapshots,
      });
      return { checkpoint };
    },
  };
}

// ─────────────────────────── query_impl_checkpoint ───────────────────────────

const QUERY_TOOL = "query_impl_checkpoint";

/** 参数防御性收窄 */
export function parseQueryImplCheckpointArgs(args: unknown): { slug: string; marks?: readonly CheckpointMark[] } {
  const a = requireArgsObject(args, QUERY_TOOL);
  const marks = optionalMarkArray(a, "marks", QUERY_TOOL);
  return { slug: requiredString(a, "slug", QUERY_TOOL), ...(marks !== undefined ? { marks } : {}) };
}

/** query tool 定义工厂（时序查 + 标记过滤 + 四项硬指标现算） */
export function createQueryImplCheckpointTool(deps: ImplCheckpointToolDeps): TaskToolDefinition {
  return {
    name: QUERY_TOOL,
    description:
      "Query one container's implementation checkpoint timeline in chronological order (main agent only), with optional mark filtering (subset of the six marks) and the four hard metrics computed from the frames: firstPassRate (first-pass tasks / terminal tasks), reworkCommitRatio (post-first-pass commit share), reviewWaveCount (review-wave-N rows), fixDensity (fix tasks / tasks). Metrics items without their required frames are omitted.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Container slug whose checkpoint timeline to read." },
        marks: { type: "array", items: { type: "string" }, description: "Mark filter (subset of the six marks); empty or omitted = all." },
      },
      required: ["slug"],
    },
    output: {
      schema: {},
      render: (_args, value) => {
        const { checkpoints, metrics } = value as { checkpoints: readonly CheckpointRow[]; metrics: CheckpointMetrics };
        const lines = checkpoints.map((c) => {
          const seq = c.waveSeq !== undefined ? `#${String(c.waveSeq)}` : "";
          return `- ${c.createdAt} ${c.mark}${seq} @${c.baseCommitHash.slice(0, 12)} (tasks=${String(c.tasksTotal)} commits=${String(c.commitsTotal)} fixes=${String(c.fixesTotal)} debts=${String(c.evidenceDebtsTotal)})`;
        });
        if (lines.length === 0) lines.push("(no checkpoints)");
        const m: string[] = [];
        if (metrics.firstPassRate !== undefined) m.push(`firstPassRate=${metrics.firstPassRate.toFixed(3)}`);
        if (metrics.reworkCommitRatio !== undefined) m.push(`reworkCommitRatio=${metrics.reworkCommitRatio.toFixed(3)}`);
        m.push(`reviewWaveCount=${String(metrics.reviewWaveCount)}`);
        if (metrics.fixDensity !== undefined) m.push(`fixDensity=${metrics.fixDensity.toFixed(3)}`);
        lines.push(`metrics: ${m.join(" / ")}`);
        return textOf([`✓ ${String(checkpoints.length)} checkpoint(s)`, ...lines].join("\n"));
      },
    },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<{ checkpoints: readonly CheckpointRow[]; metrics: CheckpointMetrics }> {
      const parsed = parseQueryImplCheckpointArgs(args);
      const projectKey = deps.resolveProjectKey(exec);
      const checkpoints = await deps.checkpoints.listCheckpoints({
        projectKey,
        slug: parsed.slug,
        ...(parsed.marks !== undefined ? { marks: parsed.marks } : {}),
      });
      return { checkpoints, metrics: computeCheckpointMetrics(checkpoints) };
    },
  };
}

// ─────────────────────────── list_impl_checkpoints ───────────────────────────

const LIST_TOOL = "list_impl_checkpoints";

/** 参数防御性收窄（mark 词表过滤可选） */
export function parseListImplCheckpointsArgs(args: unknown): { marks?: readonly CheckpointMark[] } {
  const a = requireArgsObject(args, LIST_TOOL);
  const marks = optionalMarkArray(a, "marks", LIST_TOOL);
  return marks === undefined ? {} : { marks };
}

/** list tool 定义工厂（跨容器清单——任务域枚举容器后逐容器取流水） */
export function createListImplCheckpointsTool(deps: ImplCheckpointToolDeps): TaskToolDefinition {
  return {
    name: LIST_TOOL,
    description:
      "List implementation checkpoints across all task containers in the project (main agent only): per-container chronological rows annotated with container slug. Cross-container survey face — use for trend comparison across containers; single-container timeline + metrics go through query_impl_checkpoint.",
    parameters: {
      type: "object",
      properties: {
        marks: { type: "array", items: { type: "string" }, description: "Mark filter (subset of the six marks); empty or omitted = all." },
      },
    },
    output: {
      schema: {},
      render: (_args, value) => {
        const { checkpoints } = value as { checkpoints: readonly CheckpointRow[] };
        const lines =
          checkpoints.length === 0
            ? ["(no checkpoints)"]
            : checkpoints.map((c) => {
                const seq = c.waveSeq !== undefined ? `#${String(c.waveSeq)}` : "";
                return `- ${c.slug} ${c.createdAt} ${c.mark}${seq} @${c.baseCommitHash.slice(0, 12)}`;
              });
        return textOf([`✓ ${String(checkpoints.length)} checkpoint(s) across containers`, ...lines].join("\n"));
      },
    },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<{ checkpoints: readonly CheckpointRow[] }> {
      parseListImplCheckpointsArgs(args);
      const projectKey = deps.resolveProjectKey(exec);
      const cards = await deps.tasks.listTasks({ projectKey });
      const slugs = [...new Set(cards.map((t) => t.slug))];
      const grouped = await Promise.all(
        slugs.map(async (slug) => {
          try {
            return await deps.checkpoints.listCheckpoints({ projectKey, slug });
          } catch {
            return [] as readonly CheckpointRow[];
          }
        }),
      );
      return { checkpoints: grouped.flat() };
    },
  };
}
