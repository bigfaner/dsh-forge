// dispatch_task tool——循环入口壳（plugin-forge src/tools/dispatch-task.ts 直迁——proposal
// plugin-task-loop 任务 1.11；容器语义 slug 化：参数 slug 必填 + resume 可选，source_kind
// 全退役）。本壳职责仅三件：
// ① 参数契约：slug 必填（schema 强制，缺失即拒绝——无池级盲选形态，工具只承载循环语义：
//    启动 / 运行中状态摘要 / 挂起 re-entry 续接）；
// ② 守卫与自解释响应：同容器活循环归属拒绝（守卫行——归属 + 正确入口 stop_task_loop）、
//    owner 运行中重调返回状态摘要（非拒绝）、挂起循环响应必带挂起摘要（P3 模板同源——
//    renderP3）+ 接管集写点（非 owner 触达挂起循环 → takeoverSessions.add）；
// ③ 委托循环核心：无登记 → driver.start（会话级单活门控/同源独占由驱动器 start 兑现）；
//    挂起 → driver.resume（幂等续接不重开）。
//
// 「tool = 薄封装」：本文件零 better-sqlite3 / 零 SQL；池快照经域层 taskStats 现读。
// 旧插件 ForgeToolDeps/events/session 缝不迁移——sessionId/exec.agent 从 TaskToolExecFace
// 结构化子面取（faces.ts sessionId 官方 ToolRunContext 子面）。
import { poolOf } from "../dispatch-core/pool.js";
import { payloadOf, renderP3 } from "../loop/injection.js";
import type { LoopToolDeps } from "../loop/driver-face.js";
import { taskStats } from "../domain/tasks/list.js";
import type { ContainerRef, TasksVerbDeps } from "../domain/tasks/types.js";
import type { TaskToolDefinition, TaskToolExecFace } from "./faces.js";

const TOOL = "dispatch_task";

/** 独占拒绝指引（plugin-forge dispatch-core/exclusivity.ts LOOP_EXCLUSIVE_GUIDANCE 直迁——
 *  violations 行：wait/接管/观察三向，被拒调用方零猜测） */
const LOOP_EXCLUSIVE_GUIDANCE: readonly string[] = [
  "this source is owned by an active dispatch loop — do not become a second dispatcher for it (the loop claims, spawns and settles every task of the source itself)",
  "to take over, stop the loop first: stop_task_loop tool or /stop-dag-tasks in the session that started it (a suspended loop may be stopped by any session)",
  "observation stays available: read the source state (queryTask / GUI task tab) instead of dispatching into it",
];

// ─────────────────────────── 参数面（slug 必填——容器限定，无池级盲选） ───────────────────────────

/** agent 面参数：slug（容器 = slug 本身）+ resume 可选 */
export interface DispatchTaskToolArgs {
  /** 容器 slug（循环绑定的唯一容器） */
  readonly slug: string;
  /**
   * 显式 re-entry 确认（挂起冻结守卫——bug 8fb77b41）：挂起待裁决期间对 dispatch_task 的
   * 触碰零副作用（只回挂起摘要），携 resume=true 才续接循环——被唤醒模型回合的即时触碰
   * 不得绕过裁决冻结窗。
   */
  readonly resume?: boolean;
}

/** 参数防御性收窄（slug 必填非空；退役键 source_kind/source_slug 落未知键零效应） */
export function parseDispatchTaskArgs(args: unknown): DispatchTaskToolArgs {
  if (typeof args !== "object" || args === null) {
    throw new Error(`${TOOL}: arguments must be an object`);
  }
  const a = args as Record<string, unknown>;
  const slug = a.slug;
  if (typeof slug !== "string" || slug === "") {
    throw new Error(
      `${TOOL}: slug is required (container slug) — dispatch_task has no pool-wide mode; it starts/re-enters the dispatch loop of exactly one container`,
    );
  }
  const resume = typeof a.resume === "boolean" ? a.resume : undefined;
  return { slug, ...(resume !== undefined ? { resume } : {}) };
}

// ─────────────────────────── 结果与渲染（三态自解释——started/running/suspended） ───────────────────────────

/** 工具侧池快照（PoolSnapshot 扩展——readFailed 在场 = taskStats 读数失败，零值为兜底非实况） */
type ToolPoolSnapshot = {
  readonly pending: number;
  readonly inProgress: number;
  readonly blocked: number;
  readonly unmetPending: number;
  readonly gatedPending: number;
  readonly readFailed?: boolean;
};

/** 工具结果三态（started/running/suspended；守卫与单活拒绝走抛错自解释） */
export type DispatchLoopResult =
  | { readonly kind: "started"; readonly loopId: string; readonly slug: string; readonly pool: ToolPoolSnapshot }
  | {
      readonly kind: "running";
      readonly slug: string;
      readonly ownerSessionId: string;
      readonly taskKey?: string;
      readonly pool: ToolPoolSnapshot;
    }
  | {
      readonly kind: "suspended";
      readonly loopId: string;
      readonly slug: string;
      /** 挂起摘要全文（P3 模板同源——挂起通知渲染失败的兜底读径） */
      readonly summary: string;
      /** 本次调用是否完成 re-entry（幂等续接；并发竞态 = false，零动作） */
      readonly resumed: boolean;
      /** resumed=false 时的拒绝码（驱动器 resume 原码透传——'aborted' = 挂起期循环已被叫停；
       *  'resume-not-requested' = 触碰未携 resume:true——挂起冻结守卫生效） */
      readonly resumeRejectedCode?: "no-active-loop" | "not-suspended" | "aborted" | "resume-not-requested";
      /** 非 owner 首触 = 已加入接管集 */
      readonly takenOver: boolean;
      readonly pool: ToolPoolSnapshot;
    }

/** 池行（无状态快照——继续/收工/fix 链观察判据；读数失败零值标注防误判容器已清空） */
function poolLine(pool: ToolPoolSnapshot): string {
  const base = `pending ${pool.pending} · in_progress ${pool.inProgress} · blocked ${pool.blocked} · unmet-pending ${pool.unmetPending}`;
  return pool.readFailed === true ? `${base} · ⚠ pool read FAILED (zero fallback — not actual counts)` : base;
}

/** 三态渲染（响应自解释：守卫/拒绝走抛错，其余语义在文本内） */
function renderDispatchLoopResult(_args: unknown, value: unknown): readonly { readonly type: "text"; readonly text: string }[] {
  const v = value as DispatchLoopResult;
  if (v.kind === "started") {
    return [
      {
        type: "text",
        text: [
          `dispatch loop started for ${v.slug} (loop ${v.loopId.slice(0, 8)})`,
          "- the loop claims ready tasks of this container, spawns in-process workers, settles them and keeps going automatically until no-task — claim/completion/end/suspension notices arrive in this session (no polling needed)",
          `- pool: ${poolLine(v.pool)}`,
          `- stop the loop when needed: stop_task_loop (slug='${v.slug}')`,
        ].join("\n"),
      },
    ];
  }
  if (v.kind === "running") {
    const lines = [
      `▸ dispatch loop already running for ${v.slug} (owner ${v.ownerSessionId} — this session) — status summary, no new loop started`,
      `- current task: ${v.taskKey ?? "between rounds (claim/spawn/settle cycle)"}`,
      `- pool: ${poolLine(v.pool)}`,
      "- do not start a second loop for this container; end/suspension notices arrive automatically — stop with stop_task_loop if needed",
    ];
    return [{ type: "text", text: lines.join("\n") }];
  }
  // suspended——响应必带挂起摘要（P3 兜底）；re-entry 需显式 resume:true（挂起冻结守卫）
  const lines = [
    v.summary,
    v.resumed
      ? `- re-entry accepted — the loop resumes from where it suspended (completed tasks are not re-run); pool: ${poolLine(v.pool)}`
      : v.resumeRejectedCode === "aborted"
        ? `- resume rejected (code 'aborted') — the loop was terminated while suspended and is gone (this is NOT a concurrent re-entry race); start a fresh loop with dispatch_task if needed; pool: ${poolLine(v.pool)}`
        : v.resumeRejectedCode === "resume-not-requested"
          ? `- re-entry NOT requested — the loop stays suspended (frozen, awaiting verdict); handle the task first, then re-enter with dispatch_task(slug, resume: true), or stop it with stop_task_loop; pool: ${poolLine(v.pool)}`
          : `- the loop already resumed (concurrent re-entry) — no action taken; pool: ${poolLine(v.pool)}`,
    ...(v.takenOver ? ["- you have joined the takeover set for this suspended loop — handle the task (addTask/updateTask/user verdict), then re-enter with dispatch_task(resume: true), or stop it with stop_task_loop"] : []),
  ];
  return [{ type: "text", text: lines.join("\n") }];
}

// ─────────────────────────── tool 定义（循环入口壳：守卫 + 委托循环核心） ───────────────────────────

/** dispatch_task 专用 deps */
export type DispatchTaskToolDeps = {
  readonly verbDeps: TasksVerbDeps;
  readonly resolveProjectKey: (exec: TaskToolExecFace) => string;
  readonly loop: LoopToolDeps;
};

/** 池快照现读（fail-soft——读面故障零值兜底 + readFailed 标注） */
async function poolSnapshotOf(deps: DispatchTaskToolDeps, projectKey: string, slug: string): Promise<ToolPoolSnapshot> {
  try {
    return poolOf(await taskStats(deps.verbDeps, { projectKey, slug }));
  } catch {
    return { pending: 0, inProgress: 0, blocked: 0, unmetPending: 0, gatedPending: 0, readFailed: true };
  }
}

/** 守卫拒绝（typed 错误抛出形——registry 统一转失败面；guidance 并入消息自解释） */
function rejectionOf(message: string, guidance: readonly string[]): never {
  throw new Error([message, ...guidance.map((line) => `- ${line}`)].join("\n"));
}

/** tool 定义工厂（循环入口壳——循环逻辑零保留，主链全在 loop 驱动器） */
export function createDispatchTaskTool(deps: DispatchTaskToolDeps): TaskToolDefinition {
  return {
    name: TOOL,
    description:
      "Start or re-enter the dispatch loop for ONE container — slug is REQUIRED (no pool-wide mode). It is the same loop core as the /run-dag-tasks instruction: claims ready tasks, spawns in-process workers, settles them, keeps going until no-task; notices arrive as messages — no job channel (no run_in_background/job_output/job_kill). A session runs at most one loop at a time. A suspended loop stays frozen; responses always carry the suspension summary; only resume: true re-enters (idempotent re-entry). Starting injects the collaboration-protocol section into your system prompt next turn. Stop with stop_task_loop.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Container slug — REQUIRED: the container itself whose ready tasks the loop claims, dispatches and settles.",
        },
        resume: {
          type: "boolean",
          description: "Set true ONLY to explicitly re-enter a SUSPENDED loop after handling its blocked task (suspension freeze guard — a plain touch never resumes; running/new loops ignore this flag).",
        },
      },
      required: ["slug"],
    },
    output: { schema: {}, render: renderDispatchLoopResult },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<DispatchLoopResult> {
      const parsed = parseDispatchTaskArgs(args);
      const sessionId = exec.sessionId;
      if (sessionId === undefined || sessionId === "") {
        // 会话身份缺席 = 自解释拒绝（owner 归属/接管集/作用域裁决全依赖 sessionId）
        throw new Error(`${TOOL}: no session identity in tool execution context — dispatch_task requires a sessionId (ToolRunContext) to attribute the loop owner`);
      }
      const projectKey = deps.resolveProjectKey(exec);
      const slug = parsed.slug;
      const { driver, registry } = deps.loop;
      const pool = await poolSnapshotOf(deps, projectKey, slug);
      const source: ContainerRef = { slug };

      // 容器活循环分流（守卫/摘要/re-entry——三态自解释）
      const record = registry.bySlug(slug);
      if (record !== undefined) {
        if (record.suspended !== undefined) {
          // 挂起态：响应必带挂起摘要（P3 模板同源——丢失兜底读径）；非 owner 首触 = 接管集
          // 唯一工具侧写点。挂起冻结守卫（bug 8fb77b41）：触碰零副作用——仅携 resume:true
          // 的显式 re-entry 才续接（幂等续接不重开）。
          const isOwner = record.ownerSessionId === sessionId;
          if (!isOwner) record.takeoverSessions.add(sessionId);
          // 摘要先取（P3 同源挂起摘要）——resume 清 record.suspended 后载荷投影即失真
          const payload = payloadOf(record);
          if (parsed.resume !== true) {
            // 冻结守卫生效：循环保持挂起，仅回摘要 + 续跑指引
            return {
              kind: "suspended",
              loopId: record.id,
              slug,
              summary: renderP3(payload),
              resumed: false,
              resumeRejectedCode: "resume-not-requested",
              takenOver: !isOwner,
              pool,
            };
          }
          const resumed = driver.resume({ loopId: record.id });
          return {
            kind: "suspended",
            loopId: record.id,
            slug,
            summary: renderP3(payload),
            resumed: resumed.ok,
            ...(resumed.ok ? {} : { resumeRejectedCode: resumed.code }),
            takenOver: !isOwner,
            pool,
          };
        }
        if (record.ownerSessionId === sessionId) {
          // owner 运行中重调：状态摘要（非拒绝——无第二循环产生）
          return {
            kind: "running",
            slug,
            ownerSessionId: record.ownerSessionId,
            ...(record.inFlight !== undefined ? { taskKey: record.inFlight.taskKey } : {}),
            pool,
          };
        }
        // 守卫拒绝（他人循环）：活循环归属 + 正确入口（stop_task_loop/观察）
        rejectionOf(
          `dispatch rejected: task source ${slug} is owned by an active dispatch loop (loop ${record.id}, owner session ${record.ownerSessionId}) — exclusive until the loop settles`,
          LOOP_EXCLUSIVE_GUIDANCE,
        );
      }

      // 无登记 → 启动循环（会话单活/同源独占门控在 driver.start 兑现——双入口同源）；
      // worktree = 发起会话检出（cwd 钉定归属——worker 会话 cwd 钉定源）
      const started = await driver.start({
        source,
        ownerSessionId: sessionId,
        parent: exec.agent,
        projectId: projectKey,
      });
      if (!started.ok) {
        if (started.code === "owner-active") {
          rejectionOf(started.message, started.guidance);
        }
        // loop-active（守卫读数与 start 之间的竞态窗口）——同守卫拒绝径
        rejectionOf(started.message, LOOP_EXCLUSIVE_GUIDANCE);
      }
      return { kind: "started", loopId: started.loopId, slug, pool };
    },
  };
}
