// delegate_expert 通道一委派工具测试（fix-1 agentPreset 通道重设计）：
// 结构镜像对照官方 dsh-tools register 门；行为面——组装内核 → startActivation
// 正门（request.agentPreset = expert-<key>，delivery = parent，parent/signal 透传，
// 接受点即结算返回 childId）、禁用/不存在 fail-loud、subagent/end 监听仅驱动面板。
// preset 行缺席/失败 = 该专家委派诚实降级（emitDiag warn + 请求面不携 agentPreset +
// 结果面 degradedNote），不阻载插件。

import { describe, expect, it, vi } from "vitest";
import type { SubagentActivationSpec } from "@deepseek-ai/dsh-subagent";
import {
  DELEGATE_EXPERT_TOOL_NAME,
  ExpertRunPanelState,
  FOLLOW_UP_GUIDANCE,
  createDelegateExpertTool,
  delegateLabel,
  observeSubagentEnd,
  type DelegateRunContext,
  type SubagentsStartFace,
} from "../host/dispatch/dispatch.js";
import { ExpertDisabledError, ExpertNotFoundError } from "../host/registry.js";
import type { ExpertEntry, ExpertsService } from "../host/registry.js";
import type { ExpertToolDefinition } from "../host/tools.js";

// ---------------------------------------------------------------------------
// 测试基建
// ---------------------------------------------------------------------------

function makeService(entries: ExpertEntry[]): ExpertsService {
  const byKey = new Map(entries.map((e) => [e.name, e]));
  const disabled = new Set(entries.filter((e) => !e.enabled).map((e) => e.name));
  return {
    get(key) {
      const hit = byKey.get(key);
      if (hit === undefined) throw new ExpertNotFoundError(key);
      if (disabled.has(key)) throw new ExpertDisabledError(key);
      return hit;
    },
    list(opts) {
      return entries.filter((e) => e.enabled || opts?.includeDisabled === true);
    },
    registerRoot() {},
    async setEnabled(key, enabled) {
      if (!byKey.has(key)) throw new ExpertNotFoundError(key);
      if (enabled) disabled.delete(key);
      else disabled.add(key);
    },
  };
}

const baseEntry: ExpertEntry = {
  name: "code-reviewer",
  title: "资深评审",
  description: "Runs code review on diffs and files.",
  personaMd: "## 职责\n\n评审代码。\n",
  tools: ["read", "grep"],
  skills: ["review"],
  origin: "user",
  enabled: true,
};

const parentAgent = { session: { id: "parent-session" } } as never;
const signal = new AbortController().signal;

function makeExec(overrides?: Partial<DelegateRunContext>): DelegateRunContext {
  return { agent: parentAgent, signal, ...overrides };
}

/** 捕获 startActivation 请求的 fake 正门（发布点即 resolve）。 */
function makeSubagents() {
  const specs: SubagentActivationSpec[] = [];
  let rejectNext: Error | undefined;
  const face: SubagentsStartFace = {
    async startActivation(spec) {
      if (rejectNext) throw rejectNext;
      specs.push(spec);
      return { childId: "child-1", messageId: "msg-1" } as never;
    },
  };
  return {
    face,
    specs,
    failNext(err: Error) {
      rejectNext = err;
    },
  };
}

function makeTool(
  entries: ExpertEntry[] = [baseEntry],
  opts?: {
    presetProbe?: () => Promise<readonly string[] | undefined>;
    diag?: (level: string, event: string, message: string) => void;
  },
) {
  const subagents = makeSubagents();
  const panel = new ExpertRunPanelState();
  const tool = createDelegateExpertTool({
    registry: makeService(entries),
    subagents: subagents.face,
    panel,
    provider: "spawn",
    ...(opts?.presetProbe !== undefined ? { presetProbe: opts.presetProbe } : {}),
    ...(opts?.diag !== undefined ? { diag: opts.diag as never } : {}),
  });
  return { tool, subagents, panel };
}

/** 官方 register 门镜像（tools.test.ts 同型——output 声明强制）。 */
function officialGate(def: ExpertToolDefinition): void {
  const output = def.output as unknown;
  if (output === null || typeof output !== "object" || typeof (output as { render?: unknown }).render !== "function") {
    throw new TypeError(`tool "${def.name}" must declare output { schema, render }`);
  }
}

// ---------------------------------------------------------------------------
// 结构与注册面
// ---------------------------------------------------------------------------

describe("delegate_expert 结构镜像", () => {
  it("动词+名词命名；output { schema, render } 声明齐备（官方 register 门）", () => {
    const { tool } = makeTool();
    expect(tool.name).toBe("delegate_expert");
    expect(() => officialGate(tool)).not.toThrow();
    expect(tool.parameters).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["expert", "task"]),
    });
  });

  it("output.render 产物携带已派发 + childId + 追问指引", () => {
    const { tool } = makeTool();
    const blocks = tool.output.render(
      {},
      { dispatched: true, expert: "code-reviewer", childId: "child-1", messageId: "msg-1" },
    );
    const joined = blocks.map((b) => b.text).join("\n");
    expect(joined).toContain("已派发");
    expect(joined).toContain("code-reviewer");
    expect(joined).toContain("child-1");
    expect(joined).toContain(FOLLOW_UP_GUIDANCE);
  });
});

// ---------------------------------------------------------------------------
// 派发行为（agentPreset 注入通道）
// ---------------------------------------------------------------------------

describe("delegate_expert 派发", () => {
  it("组装内核 → startActivation：request.agentPreset = expert-<key>、delivery = parent、model → agentOptions、parent/signal 透传", async () => {
    const entry: ExpertEntry = { ...baseEntry, provider: "anthropic", model: "sonnet" };
    const { tool, subagents, panel } = makeTool([entry]);
    const result = (await tool.execute(
      { expert: "code-reviewer", task: "评审 dispatch.ts" },
      makeExec(),
    )) as { dispatched: boolean; childId: string; messageId: string; expert: string };

    expect(result).toEqual({
      dispatched: true,
      expert: "code-reviewer",
      childId: "child-1",
      messageId: "msg-1",
    });
    expect(subagents.specs).toHaveLength(1);
    const spec = subagents.specs[0]!;
    expect(spec.provider).toBe("spawn"); // 派发面由装配钉死
    expect(spec.label).toBe("评审 dispatch.ts");
    expect(spec.signal).toBe(signal);
    expect(spec.delivery).toBe("parent"); // 结算通知回父会话（模型可见）
    expect(spec.parent).toBe(parentAgent);
    expect(spec.agentPreset).toBe("expert-code-reviewer");
    expect(spec.agentOptions).toEqual({ provider: "anthropic", model: "sonnet" });
    expect(spec.prompt).toEqual([{ type: "text", text: "评审 dispatch.ts" }]);
    // 请求面零 persona/toolFilter 键（rc.5 字段集已移除——承载面唯一 = preset 行）
    expect("persona" in spec).toBe(false);
    expect("toolFilter" in spec).toBe(false);
    // 派发点写入面板 dispatched 行
    expect(panel.list()).toEqual([
      { childId: "child-1", expert: "code-reviewer", messageId: "msg-1" },
    ]);
  });

  it("model 缺省不携带 agentOptions 键", async () => {
    const { tool, subagents } = makeTool();
    await tool.execute({ expert: "code-reviewer", task: "t" }, makeExec());
    expect("agentOptions" in subagents.specs[0]!).toBe(false);
  });

  it("bug: spec 携带嵌套 request 字段（官方 0.2.2-rc.1 宿主正本形状——扁平 spec 使 startActivation 首行读 spec.request.maxDepth 即 TypeError）", async () => {
    const entry: ExpertEntry = { ...baseEntry, provider: "anthropic", model: "sonnet" };
    const { tool, subagents } = makeTool([entry]);
    await tool.execute({ expert: "code-reviewer", task: "嵌套形态" }, makeExec());
    const spec = subagents.specs[0]! as SubagentActivationSpec & {
      request?: { parent?: unknown; agentPreset?: string; agentOptions?: unknown; prompt?: unknown };
    };
    expect(spec.request).toBeDefined();
    expect(spec.request!.parent).toBe(parentAgent);
    expect(spec.request!.agentPreset).toBe("expert-code-reviewer");
    expect(spec.request!.agentOptions).toEqual({ provider: "anthropic", model: "sonnet" });
    expect(spec.request!.prompt).toEqual([{ type: "text", text: "嵌套形态" }]);
  });

  it("preset 在场探针含本专家 preset id = 正常携带 agentPreset", async () => {
    const { tool, subagents } = makeTool([baseEntry], {
      presetProbe: async () => ["preset-headhunter", "expert-code-reviewer"],
    });
    await tool.execute({ expert: "code-reviewer", task: "t" }, makeExec());
    expect(subagents.specs[0]!.agentPreset).toBe("expert-code-reviewer");
  });

  it("非法参数 fail-loud（ExpertToolError 语义——消息含原因）", async () => {
    const { tool } = makeTool();
    await expect(tool.execute({ expert: "code-reviewer" }, makeExec())).rejects.toThrow(
      /invalid arguments/,
    );
  });

  it("无调用 agent 上下文 fail-loud（parent 是官方请求必填面）", async () => {
    const { tool } = makeTool();
    await expect(
      tool.execute({ expert: "code-reviewer", task: "t" }, makeExec({ agent: undefined })),
    ).rejects.toThrow(/no calling agent context/);
  });
});

// ---------------------------------------------------------------------------
// 诚实降级：preset 行缺席/失败 = emitDiag warn + 不携 agentPreset，不阻载
// ---------------------------------------------------------------------------

describe("delegate_expert preset 缺席诚实降级", () => {
  it("探针返回的名册不含本专家 preset = warn + 请求面不携 agentPreset + 结果面 degradedNote", async () => {
    const diag = vi.fn<(level: string, event: string, message: string) => void>();
    const { tool, subagents } = makeTool([baseEntry], {
      presetProbe: async () => ["preset-headhunter"], // 专家 preset 行缺席（装载失败/未同步）
      diag: diag as never,
    });
    const result = (await tool.execute(
      { expert: "code-reviewer", task: "t" },
      makeExec(),
    )) as { dispatched: boolean; degradedNote?: string };
    expect(result.dispatched).toBe(true);
    expect(result.degradedNote).toContain("expert-code-reviewer");
    expect("agentPreset" in subagents.specs[0]!).toBe(false);
    expect(diag).toHaveBeenCalledWith(
      "warn",
      expect.stringContaining("expert-squad-preset"),
      expect.stringContaining("expert-code-reviewer"),
    );
  });

  it("探针缺席（agentPresets 面不可用）= 无校验直派（携带 agentPreset，官方启动时 fail-loud）", async () => {
    const { tool, subagents } = makeTool([baseEntry], {
      presetProbe: async () => undefined,
    });
    await tool.execute({ expert: "code-reviewer", task: "t" }, makeExec());
    expect(subagents.specs[0]!.agentPreset).toBe("expert-code-reviewer");
  });

  it("无探针（deps 未接）= 同直派（兼容非宿主调用方）", async () => {
    const { tool, subagents } = makeTool();
    await tool.execute({ expert: "code-reviewer", task: "t" }, makeExec());
    expect(subagents.specs[0]!.agentPreset).toBe("expert-code-reviewer");
  });
});

// ---------------------------------------------------------------------------
// 负向：禁用 fail-loud / 不存在 fail-loud
// ---------------------------------------------------------------------------

describe("delegate_expert 负向用例", () => {
  it("禁用专家 fail-loud：ExpertDisabledError 原样上抛，不产生派发", async () => {
    const { tool, subagents } = makeTool([{ ...baseEntry, enabled: false }]);
    await expect(
      tool.execute({ expert: "code-reviewer", task: "t" }, makeExec()),
    ).rejects.toThrow(new ExpertDisabledError("code-reviewer"));
    expect(subagents.specs).toHaveLength(0);
  });

  it("不存在的键 fail-loud：ExpertNotFoundError 原样上抛", async () => {
    const { tool } = makeTool();
    await expect(
      tool.execute({ expert: "no-such", task: "t" }, makeExec()),
    ).rejects.toThrow(new ExpertNotFoundError("no-such"));
  });
});

// ---------------------------------------------------------------------------
// subagent/end 监听：仅驱动面板状态（不进会话流）
// ---------------------------------------------------------------------------

describe("subagent/end 监听", () => {
  it("end 边仅写面板 stopReason；非本插件派发的运行不落面板", () => {
    const panel = new ExpertRunPanelState();
    panel.markDispatched("child-1", "code-reviewer", "msg-1");
    const listeners: Array<(info: { id: string; stopReason: string }) => void> = [];
    const events = {
      on(_event: "subagent/end", listener: (info: { id: string; stopReason: string }) => void) {
        listeners.push(listener);
        return () => {
          listeners.splice(listeners.indexOf(listener), 1);
        };
      },
    };
    const dispose = observeSubagentEnd(events, panel);
    expect(listeners).toHaveLength(1);

    listeners[0]!({ id: "child-1", stopReason: "completed" });
    expect(panel.list()).toEqual([
      { childId: "child-1", expert: "code-reviewer", messageId: "msg-1", stopReason: "completed" },
    ]);

    // 非本插件派发 → 面板零反应
    listeners[0]!({ id: "stranger-child", stopReason: "completed" });
    expect(panel.list()).toHaveLength(1);

    dispose();
    expect(listeners).toHaveLength(0); // disposer 退订
  });

  it("activation 无 inbox 消息 id（messageId 缺席）= 面板行空串兜底（dispatch 侧 `?? \"\"`）", async () => {
    const subagents = makeSubagents();
    subagents.face.startActivation = async () => ({ childId: "child-2" }) as never;
    const panel = new ExpertRunPanelState();
    const tool = createDelegateExpertTool({
      registry: makeService([baseEntry]),
      subagents: subagents.face,
      panel,
      provider: "spawn",
    });
    await tool.execute({ expert: "code-reviewer", task: "t" }, makeExec());
    expect(panel.list()).toEqual([
      { childId: "child-2", expert: "code-reviewer", messageId: "" },
    ]);
  });
});

describe("delegateLabel", () => {
  it("取任务首行；超长截短带省略号", () => {
    expect(delegateLabel("第一行\n第二行")).toBe("第一行");
    const long = "x".repeat(80);
    expect(delegateLabel(long)).toBe(`${"x".repeat(57)}...`);
  });
});

// 名称锚定（防漂移——工具名即模型面契约）
describe("工具名锚定", () => {
  it("DELEGATE_EXPERT_TOOL_NAME 恒为 delegate_expert", () => {
    expect(DELEGATE_EXPERT_TOOL_NAME).toBe("delegate_expert");
  });
});
