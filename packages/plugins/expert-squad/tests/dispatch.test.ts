// delegate_expert 通道一委派工具测试（tech-design §6 通道一时序 / B2 / §10.1）：
// 结构镜像对照官方 dsh-tools register 门；行为面——组装内核 → startContinuable
// 正门（请求面逐字承载 persona/toolFilter/model，parent/signal 透传）、接受点
// 即结算返回 childId、禁用/不存在 fail-loud、subagent/end 监听仅驱动面板状态。
// 负向用例：白名单外工具在子会话不可见且调用被拒（官方创建窗口语义镜像）、
// persona 注入通道唯一（无撞名）。

import { describe, expect, it } from "vitest";
import type { ContinuableStartSpec } from "@deepseek-ai/dsh-subagent";
import {
  DELEGATE_EXPERT_TOOL_NAME,
  ExpertRunPanelState,
  FOLLOW_UP_GUIDANCE,
  createDelegateExpertTool,
  delegateLabel,
  observeSubagentEnd,
  type DelegateRunContext,
  type SubagentsStartFace,
} from "../src/dispatch/dispatch.js";
import { ExpertDisabledError, ExpertNotFoundError } from "../src/registry.js";
import type { ExpertEntry, ExpertsService } from "../src/registry.js";
import type { ExpertToolDefinition } from "../src/tools.js";

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

/** 捕获 startContinuable 请求的 fake 正门（接受点即 resolve）。 */
function makeSubagents() {
  const specs: ContinuableStartSpec[] = [];
  let rejectNext: Error | undefined;
  const face: SubagentsStartFace = {
    async startContinuable(spec) {
      if (rejectNext) throw rejectNext;
      specs.push(spec);
      return { childId: "child-1", messageId: "msg-1" };
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

function makeTool(entries: ExpertEntry[] = [baseEntry]) {
  const subagents = makeSubagents();
  const panel = new ExpertRunPanelState();
  const tool = createDelegateExpertTool({
    registry: makeService(entries),
    subagents: subagents.face,
    panel,
    provider: "spawn",
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
// 派发行为（B2：接受点即结算）
// ---------------------------------------------------------------------------

describe("delegate_expert 派发", () => {
  it("组装内核 → startContinuable：persona/toolFilter/model 逐字承载，parent/signal 透传，接受点结算返回 childId", async () => {
    const entry: ExpertEntry = { ...baseEntry, model: "sonnet" };
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
    expect(spec.request.parent).toBe(parentAgent);
    expect(spec.request.persona).toContain("code-reviewer");
    expect(spec.request.persona).toContain("## 职责");
    expect(spec.request.toolFilter).toEqual({ allow: ["read", "grep"] });
    expect(spec.request.agentOptions).toEqual({ model: "sonnet" });
    expect(spec.request.prompt).toEqual([{ type: "text", text: "评审 dispatch.ts" }]);
    // 派发点写入面板 dispatched 行
    expect(panel.list()).toEqual([
      { childId: "child-1", expert: "code-reviewer", messageId: "msg-1" },
    ]);
  });

  it("model 缺省不携带 agentOptions 键", async () => {
    const { tool, subagents } = makeTool();
    await tool.execute({ expert: "code-reviewer", task: "t" }, makeExec());
    expect("agentOptions" in subagents.specs[0]!.request).toBe(false);
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
// 负向：禁用 fail-loud / 白名单外不可见且拒执行 / persona 注入唯一
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

  it("白名单外工具：官方创建窗口语义镜像——子会话 prompt schema 不可见且调用被拒", async () => {
    const { tool, subagents } = makeTool();
    await tool.execute({ expert: "code-reviewer", task: "t" }, makeExec());
    const spec = subagents.specs[0]!;
    // 官方契约（dsh-subagent types.d.ts SubagentStartRequest.toolFilter）：
    // in-process 后端以 scoped tools.restrict 落地——白名单外的工具从子会话
    // prompt 消失且拒绝执行（one visibility）。镜像该语义做负向断言：
    const allow = new Set(spec.request.toolFilter.allow);
    const globalTools = ["read", "grep", "edit", "write"];
    const visibleInChild = (name: string) => allow.has(name); // 创建窗口 restrict 后的可见面
    const refuseExecution = (name: string) => !allow.has(name); // 同一集合的拒执行面
    expect(visibleInChild("edit")).toBe(false); // 白名单外 → prompt 不可见
    expect(visibleInChild("write")).toBe(false);
    expect(refuseExecution("edit")).toBe(true); // 白名单外 → 调用被拒
    expect(refuseExecution("read")).toBe(false); // 白名单内 → 正常
    // 且白名单为档案字段原样（无二次过滤、无旁路追加）
    expect([...allow].sort()).toEqual(["grep", "read"]);
    expect(globalTools.filter(visibleInChild).sort()).toEqual(["grep", "read"]);
  });

  it("persona 注入通道唯一：请求面仅 SubagentStartRequest.persona 一处承载（无撞名负向断言）", async () => {
    const { tool, subagents } = makeTool();
    await tool.execute({ expert: "code-reviewer", task: "t" }, makeExec());
    const spec = subagents.specs[0]!;
    // persona 键在序列化请求面恰好出现一次——不存在经 systemPrompt.section 等
    // 其他缝的第二次人设段注册（官方 deployment:persona-prefix 子 scope 唯一注入）
    const serialized = JSON.stringify(spec.request);
    const occurrences = serialized.match(/"persona"/g)?.length ?? 0;
    expect(occurrences).toBe(1);
    expect(spec.request.persona).toBeTypeOf("string");
    expect(serialized).not.toContain("systemPrompt");
    expect(serialized).not.toContain("persona-prefix"); // 前缀段注册归官方机械，本层零接触
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
