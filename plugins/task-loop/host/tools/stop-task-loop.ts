// stop_task_loop tool（plugin-forge src/tools/stop-task-loop.ts 直迁——proposal
// plugin-task-loop 任务 1.11；slug 化：slug 可选 = 停本会话循环——byOwner(sessionId)，
// source_kind 全退役）。语义 = 请求停止该容器/本会话的派发循环：与 /stop-dag-tasks 双入口
// 同 registry 判活（同一驱动器 stopLoop——统一结束处理单源：在途 worker 取消、孤儿任务真化
// interrupted、收口叙述 + 结束通知、终态注销）。
// 作用域裁决：运行中仅 owner 可停（隔离纪律）；挂起态（awaiting-verdict）任意会话可停——
// 支撑其它会话接管。越权/无活循环拒绝并自解释（归属会话 + 正确入口）。
// sessionId 缺席（TaskToolExecFace 结构化子面无身份）= 自解释拒绝。
import type { TaskToolDefinition, TaskToolExecFace } from "./faces.js";
import type { LoopToolDeps } from "../loop/driver-face.js";

const TOOL = "stop_task_loop";

// ─────────────────────────── 参数面（slug 可选——缺席 = 停本会话自己的活循环） ───────────────────────────

export interface StopTaskLoopToolArgs {
  /** 目标容器 slug；缺席 = byOwner(本会话)——停自己发起的活循环 */
  readonly slug?: string;
}

/** 参数防御性收窄（slug 可选非空字符串） */
export function parseStopTaskLoopArgs(args: unknown): StopTaskLoopToolArgs {
  if (typeof args !== "object" || args === null) {
    throw new Error(`${TOOL}: arguments must be an object`);
  }
  const a = args as Record<string, unknown>;
  const slug = a.slug;
  if (slug === undefined) return {};
  if (typeof slug !== "string" || slug === "") {
    throw new Error(`${TOOL}: slug must be a non-empty container slug (omit it to stop this session's own active loop)`);
  }
  return { slug };
}

// ─────────────────────────── 结果与渲染（stopped 自解释） ───────────────────────────

export type StopTaskLoopResult = { readonly kind: "stopped"; readonly slug: string; readonly hadInFlight: boolean };

function renderStopTaskLoopResult(_args: unknown, value: unknown): readonly { readonly type: "text"; readonly text: string }[] {
  const v = value as StopTaskLoopResult;
  return [
    {
      type: "text",
      text: [
        `dispatch loop stopped for ${v.slug}`,
        v.hadInFlight
          ? "- the in-flight task was cancelled and marked interrupted (it will be recovered by a later loop run)"
          : "- no task was in flight",
        "- the loop is terminated (final state) — restart anytime with dispatch_task(slug)",
      ].join("\n"),
    },
  ];
}

// ─────────────────────────── tool 定义（判活 + 作用域裁决 + 委托 driver.stopLoop） ───────────────────────────

/** stop_task_loop 专用 deps */
export type StopTaskLoopToolDeps = {
  readonly loop: LoopToolDeps;
};

export function createStopTaskLoopTool(deps: StopTaskLoopToolDeps): TaskToolDefinition {
  return {
    name: TOOL,
    description:
      "Stop a dispatch loop: cancels the in-flight worker (the task is marked interrupted and recovered by a later loop run), runs the unified end handling and delivers the end notice — the same registry-based liveness and termination path as the /stop-dag-tasks instruction. Args: give slug to target that container's loop; omit it to stop the loop owned by THIS session. Scope: a RUNNING loop may only be stopped by its owner session; a SUSPENDED loop (awaiting verdict) may be stopped by ANY session (takeover support). A stop request from a non-owner on a running loop is rejected naming the owner session; with no active loop at all the call is rejected with guidance on how to start one.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Container slug (the container itself) to target that container's loop; omit to stop this session's own active loop.",
        },
      },
    },
    output: { schema: {}, render: renderStopTaskLoopResult },
    async execute(args: unknown, exec: TaskToolExecFace): Promise<StopTaskLoopResult> {
      const parsed = parseStopTaskLoopArgs(args);
      const sessionId = exec.sessionId;
      if (sessionId === undefined || sessionId === "") {
        // 会话身份缺席 = 自解释拒绝（owner 作用域裁决全依赖 sessionId）
        throw new Error(`${TOOL}: no session identity in tool execution context — stop_task_loop requires a sessionId (ToolRunContext) to resolve loop ownership`);
      }
      const { driver, registry } = deps.loop;
      const record = parsed.slug !== undefined ? registry.bySlug(parsed.slug) : registry.byOwner(sessionId);
      if (record === undefined) {
        // 无活循环：自解释拒绝（含启动入口）
        throw new Error(
          "stop rejected: there is no active dispatch loop" +
            (parsed.slug !== undefined ? ` for ${parsed.slug}` : " owned by this session") +
            " — loops end on their own when the container settles; start one with dispatch_task(slug) or /run-dag-tasks <slug>",
        );
      }
      const slug = record.source.slug;
      const stopped = await driver.stopLoop({ loopId: record.id, requesterSessionId: sessionId });
      if (!stopped.ok) {
        if (stopped.code === "forbidden") {
          // 越权拒绝（运行中非 owner）：自解释——归属会话 + 作用域规则 + 可行入口
          throw new Error(
            [
              `stop rejected: the dispatch loop for ${slug} is RUNNING and owned by session ${stopped.ownerSessionId} — only the owner session may stop a running loop`,
              "- a SUSPENDED loop (awaiting verdict) may be stopped by any session — this one is running; observe it with queryTask/taskStats instead",
              "- have the owner session stop it (stop_task_loop or /stop-dag-tasks), or wait for it to settle",
            ].join("\n"),
          );
        }
        throw new Error("stop rejected: the loop already reached a final state (concurrent stop/settle) — no action taken");
      }
      return { kind: "stopped", slug, hadInFlight: stopped.hadInFlight };
    },
  };
}
