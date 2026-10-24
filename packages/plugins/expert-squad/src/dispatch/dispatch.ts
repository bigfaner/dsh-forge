// dispatch/dispatch —— 通道一委派工具 delegate_expert（tech-design §5/§6 通道一时序
// / B2 钉死）：组装内核（compose.ts）→ 官方 ctx.subagents.startContinuable 正门。
// 接受点即结算：startContinuable 在子会话 inbox 接受首条 prompt 时即 resolve
// （dsh-subagent types/index.d.ts——"Resolves when the child's inbox accepts that
// prompt"），工具随即返回「已派发 + childId + 追问指引」，不等待子会话 turn——
// 成果经官方子会话记录可见、追问经 dsh-tool-subagent-control send_message
// （回复回会话流，continuation 同上下文）。白名单语义不在本层复刻：toolFilter
// 经官方创建窗口 scoped tools.restrict fail-closed 落地（同 doc：「the named
// tools vanish from the child's prompt AND refuse to execute」），本层只保证
// 请求面逐字承载档案白名单、不二次过滤不旁路；persona 逐字承载合成全文，子
// scope 注入唯一通道 = SubagentStartRequest.persona（官方注册为
// deployment:persona-prefix 前缀段并 shadow 部署 persona），本层不再经任何
// 其他缝注册人设段——无撞名（负向断言见 tests/dispatch.test.ts）。
// subagent/end 监听仅驱动面板状态（ExpertRunPanelState，供 fetch 路由面取数），
// 不写会话流：监听体内零 session emit、零 send、零 tool 调用。

import { z } from "zod";
import type {
  ContinuableStart,
  ContinuableStartSpec,
  SubagentRunEndInfo,
} from "@deepseek-ai/dsh-subagent";
import type { ExpertsService } from "../registry.js";
import {
  ExpertToolError,
  zToJSONSchema,
} from "../tools.js";
import type {
  ExpertToolDefinition,
  TextContentBlock,
  ToolRegisterFace,
} from "../tools.js";
import { createExpertComposer } from "./compose.js";

// ---------------------------------------------------------------------------
// faces（官方 ctx.subagents 结构最小面——md-mermaid faces 同法）
// ---------------------------------------------------------------------------

/** 派发 parent（官方 SubagentStartRequest.parent——exec.agent 同型）。 */
export type ParentAgent = ContinuableStartSpec["request"]["parent"];

/** 停止原因子面（end 事件载荷内字段）。 */
export type SubagentStopReason = SubagentRunEndInfo["stopReason"];

/** 官方 subagent 服务派发面（startContinuable 正门）。 */
export interface SubagentsStartFace {
  startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart>;
}

/** 官方 subagent 生命周期事件缝（仅消费 subagent/end）。 */
export interface SubagentEventsFace {
  /** 订阅 end 边；返回 disposer（cordis ctx.on 同型）。 */
  on(
    event: "subagent/end",
    listener: (info: SubagentRunEndInfo) => void,
  ): () => void;
}

/** 委派工具的执行上下文子面（官方 ToolRunContext 消费字段子面）。 */
export interface DelegateRunContext {
  /** 发起委派的 agent（= SubagentStartRequest.parent，缺席即 fail-loud）。 */
  readonly agent?: ParentAgent;
  /** 调用方取消信号（canonical 取消通道，原样透传 spec.signal）。 */
  readonly signal: AbortSignal;
}

// ---------------------------------------------------------------------------
// 面板运行状态（subagent/end 监听的唯一落点——纯 UI 数据，不进会话流）
// ---------------------------------------------------------------------------

/** 一次委派的面板状态行。 */
export interface ExpertRunPanelEntry {
  readonly childId: string;
  readonly expert: string;
  readonly messageId: string;
  /** end 边到达后记录的停止原因；在场 = 已结算。 */
  readonly stopReason?: SubagentStopReason;
}

/** 面板运行状态存储（dispatched 由工具写入、ended 仅由 end 监听写入）。 */
export class ExpertRunPanelState {
  private readonly runs = new Map<string, ExpertRunPanelEntry>();

  markDispatched(childId: string, expert: string, messageId: string): void {
    this.runs.set(childId, { childId, expert, messageId });
  }

  markEnded(childId: string, stopReason: SubagentStopReason): void {
    const hit = this.runs.get(childId);
    if (hit === undefined) return; // 非本插件派发的运行——面板不管
    this.runs.set(childId, { ...hit, stopReason });
  }

  list(): ExpertRunPanelEntry[] {
    return [...this.runs.values()];
  }
}

/**
 * 订阅 subagent/end → 仅写面板状态。返回 disposer（fiber 卸载即退订）。
 * 监听体契约：不进会话流（零 session 写、零 send、零 tool 调用）。
 */
export function observeSubagentEnd(
  events: SubagentEventsFace,
  panel: ExpertRunPanelState,
): () => void {
  return events.on("subagent/end", (info) => {
    panel.markEnded(info.id, info.stopReason);
  });
}

// ---------------------------------------------------------------------------
// delegate_expert 工具
// ---------------------------------------------------------------------------

export const DELEGATE_EXPERT_TOOL_NAME = "delegate_expert" as const;

const delegateParams = z.object({
  expert: z
    .string()
    .min(1)
    .describe("Expert key to delegate to (see list_experts)"),
  task: z.string().min(1).describe("Full task text delivered as the child's first message"),
});

const delegateResult = z.object({
  dispatched: z.literal(true),
  expert: z.string(),
  childId: z.string(),
  messageId: z.string(),
});

export type DelegateToolResult = z.output<typeof delegateResult>;

/** 追问指引（B2：工具结果携带——追问经 send_message，回复回会话流）。 */
export const FOLLOW_UP_GUIDANCE =
  "已派发，成果将由子会话异步产出并出现在会话流中。" +
  "追问请继续对该专家说话或经 subagent send_message 发送（回复回会话流，continuation 同上下文）。";

/** 工厂依赖面。 */
export interface DelegateToolDeps {
  /** 取用 API（服务键 experts——禁用/不存在在此 fail-loud，AD1）。 */
  readonly registry: ExpertsService;
  /** 官方 subagent 服务（startContinuable 正门）。 */
  readonly subagents: SubagentsStartFace;
  /** 面板运行状态（派发点写入 dispatched 行）。 */
  readonly panel: ExpertRunPanelState;
  /** 派发 provider 名（in-process 才落地 toolFilter——派发面由装配钉死）。 */
  readonly provider: string;
}

const text = (t: string): TextContentBlock => ({ type: "text", text: t });

/** 任务首行截短为创建标签（官方 label：短描述，持久化为子会话创建标牌）。 */
export function delegateLabel(task: string): string {
  const firstLine = task.trim().split(/\r?\n/, 1)[0] ?? "";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

/**
 * 工厂：delegate_expert 工具定义（不注册——注册走 registerDelegateExpertTool）。
 * execute：组装内核取档案（禁用/不存在 fail-loud 原样上抛）→ startContinuable →
 * 接受点即结算返回 childId。
 */
export function createDelegateExpertTool(deps: DelegateToolDeps): ExpertToolDefinition {
  const compose = createExpertComposer(deps.registry);

  const tool: ExpertToolDefinition = {
    name: DELEGATE_EXPERT_TOOL_NAME,
    description:
      "Delegate a task to a registered expert: composes the expert's persona, tool whitelist and model preference and starts a durable continuable child subagent. Settles at acceptance (returns childId); the child's output streams into the session afterwards. Follow-ups go through subagent send_message.",
    parameters: zToJSONSchema(delegateParams, "input"),
    output: {
      schema: zToJSONSchema(delegateResult, "output"),
      render: (_args, value) => {
        const r = value as DelegateToolResult;
        return [text(`已派发给 ${r.expert}（childId=${r.childId}）。${FOLLOW_UP_GUIDANCE}`)];
      },
    },
    async execute(args: unknown, exec?: DelegateRunContext) {
      const parsed = delegateParams.safeParse(args);
      if (!parsed.success) {
        throw new ExpertToolError(
          `${DELEGATE_EXPERT_TOOL_NAME}: invalid arguments — ${parsed.error.issues
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; ")}`,
        );
      }
      if (exec?.agent === undefined) {
        throw new ExpertToolError(
          `${DELEGATE_EXPERT_TOOL_NAME}: no calling agent context — delegation requires a parent agent`,
        );
      }
      const { expert, task } = parsed.data;
      const parent = exec.agent;
      const signal = exec.signal;
      const request = compose(expert, task); // 不存在/禁用 → ExpertAccessError 原样上抛（AD1）
      const spec: ContinuableStartSpec = {
        provider: deps.provider,
        label: delegateLabel(task),
        request: {
          parent,
          prompt: request.prompt as [TextContentBlock],
          persona: request.persona,
          toolFilter: request.toolFilter,
          ...(request.agentOptions !== undefined ? { agentOptions: request.agentOptions } : {}),
        },
        signal,
      };
      const start = await deps.subagents.startContinuable(spec); // 接受点即结算（B2）
      deps.panel.markDispatched(start.childId, expert, start.messageId);
      const result = delegateResult.parse({
        dispatched: true,
        expert,
        childId: start.childId,
        messageId: start.messageId,
      });
      return result;
    },
  };
  return tool;
}

/** 注册 delegate_expert（官方 tools.register 正门——插件宿主半 apply 内全局调用，D1）。 */
export function registerDelegateExpertTool(
  registryFace: ToolRegisterFace,
  deps: DelegateToolDeps,
): void {
  registryFace.register(createDelegateExpertTool(deps));
}
