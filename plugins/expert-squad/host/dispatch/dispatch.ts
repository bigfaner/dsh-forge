// dispatch/dispatch —— 通道一委派工具 delegate_expert（fix-1 agentPreset 通道重
// 设计）：组装内核（compose.ts）→ 官方 ctx.subagents.startActivation 正门
// （dsh-subagent 0.2.2-rc.1——startContinuable/ContinuableStartSpec 已移除，
// SubagentStartRequest.persona/toolFilter 字段同步移除）。专家 persona 与工具
// 白名单的注入通道 = request.agentPreset（官方正本核销：subagent README:63-65
// Child presets 段——in-process spawn 接受独立 agentPreset，无选择继承父组合；
// preset 承载 = tools + prompt sections 声明式组合，agent-preset-registry README；
// preset 行由 host/preset-rows.ts 装载期批量预注册 + 增删同步）。
//
// 结算语义：startActivation 在 provider 发布子会话（child 存在）时即 resolve，
// 工具随即返回「已派发 + childId + 追问指引」，不等待子会话 turn——成果经官方
// 子会话记录可见（delivery: "parent" = 结算通知回父会话模型面）、追问经
// dsh-tool-subagent-control send_message（回复回会话流）。白名单 fail-closed 语义
// 不在本层复刻：由 preset 行内 expert-restrict 行经官方 ctx.tools.restrict 落地。
//
// 诚实降级：presetProbe 名册（可用 preset id 集）不含本专家 preset id = 该专家
// preset 行缺席/装载失败——emitDiag warn + 请求面不携 agentPreset（回落父组合）
// + 结果面 degradedNote 明示，不阻载派发、不阻载插件。
//
// subagent/end 监听仅驱动面板状态（ExpertRunPanelState，供 fetch 路由面取数），
// 不写会话流：监听体内零 session emit、零 send、零 tool 调用。

import { z } from "zod";
import type {
  SubagentActivationSpec,
  SubagentRunEndInfo,
  SubagentRuntime,
} from "@deepseek-ai/dsh-subagent";
import type { ExpertsService } from "../registry.js";
import type { DiagEmit } from "../registry.js";
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
export type ParentAgent = SubagentActivationSpec["parent"];

/** 停止原因子面（end 事件载荷内字段）。 */
export type SubagentStopReason = SubagentRunEndInfo["stopReason"];

/** 官方 subagent 服务派发面（startActivation 正门——type-only Pick 自官方 SubagentRuntime 单源，不手抄签名）。 */
export type SubagentsStartFace = Pick<SubagentRuntime, "startActivation">;

/** preset 在场探针面：返回可用 preset id 集（broken 行剔除）；undefined = 探针缺席（agentPresets 面不可用），无校验直派。 */
export type PresetProbe = () =>
  | readonly string[]
  | undefined
  | Promise<readonly string[] | undefined>;

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
  degradedNote: z.string().optional(),
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
  /** 官方 subagent 服务（startActivation 正门）。 */
  readonly subagents: SubagentsStartFace;
  /** 面板运行状态（派发点写入 dispatched 行）。 */
  readonly panel: ExpertRunPanelState;
  /** 派发 provider 名（in-process 才支持 agentPreset——派发面由装配钉死）。 */
  readonly provider: string;
  /** preset 在场探针（可用 preset id 名册，每派发现调禁 memoize——AGENTS 1.6）；
   *  缺席 = 无校验直派（agentPreset 恒携带，官方启动时对未知 id fail-loud）。 */
  readonly presetProbe?: PresetProbe;
  /** 诊断发射面（preset 缺席降级 warn——AGENTS §7 不静默）；缺席 = 降级仅结果面明示。 */
  readonly diag?: DiagEmit;
}

const text = (t: string): TextContentBlock => ({ type: "text", text: t });

/** 任务首行截短为创建标签（官方 label：短描述，持久化为子会话创建标牌）。 */
export function delegateLabel(task: string): string {
  const firstLine = task.trim().split(/\r?\n/, 1)[0] ?? "";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

/**
 * 工厂：delegate_expert 工具定义（不注册——注册走 registerDelegateExpertTool）。
 * execute：组装内核取档案（禁用/不存在 fail-loud 原样上抛）→ preset 在场探针 →
 * startActivation → 接受点即结算返回 childId。
 */
export function createDelegateExpertTool(deps: DelegateToolDeps): ExpertToolDefinition {
  const compose = createExpertComposer(deps.registry);

  const tool: ExpertToolDefinition = {
    name: DELEGATE_EXPERT_TOOL_NAME,
    description:
      "Delegate a task to a registered expert: starts a child subagent bound to the expert's preset (persona + tool whitelist composed by the expert-squad plugin) with the task as its first message. Settles at acceptance (returns childId); the child's output streams into the session afterwards. Follow-ups go through subagent send_message.",
    parameters: zToJSONSchema(delegateParams, "input"),
    output: {
      schema: zToJSONSchema(delegateResult, "output"),
      render: (_args, value) => {
        const r = value as DelegateToolResult;
        const note = r.degradedNote !== undefined ? `（降级：${r.degradedNote}）` : "";
        return [text(`已派发给 ${r.expert}（childId=${r.childId}）。${note}${FOLLOW_UP_GUIDANCE}`)];
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
      const request = await compose(expert, task); // 不存在/禁用 → ExpertAccessError 原样上抛（AD1）
      // preset 在场探针（每派发现调，禁 memoize）：名册不含本专家 preset id =
      // preset 行缺席/装载失败 → 诚实降级（warn + 不携 agentPreset + degradedNote）。
      let presetApplied = true;
      let degradedNote: string | undefined;
      const roster = await deps.presetProbe?.();
      if (roster !== undefined && !roster.includes(request.agentPreset)) {
        presetApplied = false;
        degradedNote = `专家 preset「${request.agentPreset}」缺席或装载失败——本次委派未携带该专家 persona 与工具白名单（回落父组合）`;
        deps.diag?.(
          "warn",
          "expert-squad-preset-absent",
          `delegate_expert 诚实降级：${degradedNote}（expert=${expert}）`,
        );
      }
      // Root cause: 官方 dsh-subagent 0.2.2-rc.1（DSH Desktop 宿主装载正本）的
      // SubagentActivationSpec 要求嵌套 request 字段——扁平 spec 使 startActivation
      // 首行 assertSubagentMaxDepth(spec.request.maxDepth) 读 undefined 即 TypeError；
      // 0.2.2-rc.5 类型面又回到扁平。双形态并载：顶层字段喂 rc.5 线宿主、嵌套 request
      // 喂 rc.1 线宿主（两线运行期均为结构读取，多余键互不干扰）。类型锚 = 本仓 rc.5
      // 声明（无 request 键），故嵌套键经一次显式断言并载。
      const activationRequest = {
        prompt: request.prompt as [TextContentBlock],
        parent,
        ...(presetApplied ? { agentPreset: request.agentPreset } : {}),
        ...(request.agentOptions !== undefined ? { agentOptions: request.agentOptions } : {}),
      };
      const spec = {
        provider: deps.provider,
        label: delegateLabel(task),
        signal,
        delivery: "parent",
        ...activationRequest,
        request: activationRequest,
      } as SubagentActivationSpec;
      const start = await deps.subagents.startActivation(spec); // 发布点即结算
      deps.panel.markDispatched(start.childId, expert, start.messageId ?? "");
      const result = delegateResult.parse({
        dispatched: true,
        expert,
        childId: start.childId,
        messageId: start.messageId ?? "",
        ...(degradedNote !== undefined ? { degradedNote } : {}),
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
