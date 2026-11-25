// preset-rows —— 专家档案 → agentPreset 行（官方正本核销 2026-11 fix-1；2026-11-25 白名单
// 落点迁 agent/created）：persona/工具行的注入通道 = agentPreset（subagent Child presets：
// in-process spawn 接受独立 agentPreset；preset 承载 = tools + prompt sections 声明式组合，
// agent-preset-registry README）。程序化注册正门 = AgentPresetRegistry.register(PresetDefinition)
// （definition.d.ts——declaring plugin owns the disposer）。本面钉住：
//   ① preset 行构造：id = 档案键原样（用户裁定 2026-11-24 移除 expert- 前缀）；persona =
//      dsh-persona 行 prefix（人设全文合成）；其后为模型工具行全集（tool-rows.ts 常量）——
//      白名单不在 preset 内落（preset scope 内 restrict 掩不到同层工具行）。
//   ② 装载期批量预注册 + 增删同步（ExpertPresetSync）：同指纹跳过、内容变更换代
//      （dispose 旧 + register 新）、撤销/禁用撤行、注册失败 diag warn 不炸同步。
//   ③ 白名单台账：reconcile 期求交存 LiveRow.allow，allowOf(key) 供 agent/created 监听器
//      同步读（监听器内不可 await——rejection 致宿主 fatal）。

import { describe, expect, it, vi } from "vitest";
import type { PresetDefinition } from "@deepseek-ai/dsh-agent-preset-registry";
import { EXPERT_PERSONA_ROW_NAME, ExpertPresetSync, buildExpertPresetDefinition, type PresetRegistryFace } from "../host/preset-rows.js";
import { EXPERT_TOOL_ROWS } from "../host/tool-rows.js";
import { ExpertDisabledError, ExpertNotFoundError } from "../host/registry.js";
import type { ExpertEntry, ExpertsService } from "../host/registry.js";

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

/** 捕获 register 定义的 fake registry 面（disposer 可核查撤行）。 */
function makePresets() {
  const registered: PresetDefinition[] = [];
  const disposed: string[] = [];
  const failNext: Array<{ id: string; error: Error }> = [];
  const face: PresetRegistryFace = {
    async register(definition) {
      const fail = failNext.find((f) => f.id === definition.id);
      if (fail) throw fail.error;
      registered.push(definition);
      return async () => {
        disposed.push(definition.id);
      };
    },
  };
  return { face, registered, disposed, fail(id: string, error: Error) { failNext.push({ id, error }); } };
}

const diag = vi.fn<(level: string, event: string, message: string) => void>();

function makeSync(overrides?: Partial<{ knownTools: () => readonly string[] }>) {
  const presets = makePresets();
  const sync = new ExpertPresetSync({
    presets: presets.face,
    diag: diag as never,
    ...(overrides?.knownTools !== undefined ? { knownTools: overrides.knownTools } : {}),
  });
  return { sync, presets };
}

// ---------------------------------------------------------------------------
// preset 行构造
// ---------------------------------------------------------------------------

describe("buildExpertPresetDefinition", () => {
  it("id = 档案键原样；name = title；description 透出", () => {
    const def = buildExpertPresetDefinition(baseEntry);
    expect(def.id).toBe("code-reviewer");
    expect(def.name).toBe("资深评审");
    expect(def.description).toBe("Runs code review on diffs and files.");
  });

  it("persona = dsh-persona 行 prefix 承载人设全文合成（身份头 + 人设原文）", () => {
    const def = buildExpertPresetDefinition(baseEntry);
    const persona = def.plugins.find((p) => p.name === EXPERT_PERSONA_ROW_NAME);
    expect(persona).toBeDefined();
    const prefix = (persona!.config as { prefix: string }).prefix;
    expect(prefix).toContain("code-reviewer");
    expect(prefix).toContain("资深评审");
    expect(prefix).toContain("Runs code review on diffs and files.");
    expect(prefix).toContain("## 职责");
    expect(prefix).toContain(baseEntry.personaMd.trimEnd());
  });

  it("行集 = persona + 模型工具行全集（逐行同 tool-rows 常量；白名单不在 preset 内落——无 restrict 行）", () => {
    const def = buildExpertPresetDefinition(baseEntry);
    expect(def.plugins).toHaveLength(1 + EXPERT_TOOL_ROWS.length);
    expect(def.plugins[0]!.name).toBe(EXPERT_PERSONA_ROW_NAME);
    expect(def.plugins.slice(1)).toEqual([...EXPERT_TOOL_ROWS]);
    expect(def.plugins.some((p) => p.name.includes("expert-restrict"))).toBe(false);
    expect(def.plugins.some((p) => p.config && "allow" in (p.config as object))).toBe(false);
  });

  it("工具行全部指向 @deepseek-ai/* 官方包（expert-squad 不依赖 forge——单装形态同样成立）", () => {
    const def = buildExpertPresetDefinition(baseEntry);
    for (const row of def.plugins.slice(1)) {
      expect(row.name).toMatch(/^@deepseek-ai\/dsh-tool-/);
    }
  });
});

// ---------------------------------------------------------------------------
// ExpertPresetSync：装载期批量预注册 + 增删同步
// ---------------------------------------------------------------------------

describe("ExpertPresetSync.syncFrom", () => {
  it("装载期批量预注册：每位启用专家一行（register 按档案键幂等位）", async () => {
    const { sync, presets } = makeSync();
    const registry = makeService([baseEntry, { ...baseEntry, name: "merge-planner", title: "合并规划" }]);
    await sync.syncFrom(registry);
    expect(presets.registered.map((d) => d.id).sort()).toEqual(["code-reviewer", "merge-planner"]);
  });

  it("同指纹再同步零重注册（幂等短路）", async () => {
    const { sync, presets } = makeSync();
    const registry = makeService([baseEntry]);
    await sync.syncFrom(registry);
    await sync.syncFrom(registry);
    expect(presets.registered).toHaveLength(1);
  });

  it("档案内容变更 = 换代：dispose 旧行 + register 新行", async () => {
    const { sync, presets } = makeSync();
    const entry = { ...baseEntry }; // 拷贝——防 title 改写污染共享 baseEntry
    const registry = makeService([entry]);
    await sync.syncFrom(registry);
    entry.title = "首席评审";
    await sync.syncFrom(registry);
    expect(presets.disposed).toEqual(["code-reviewer"]);
    expect(presets.registered).toHaveLength(2);
    expect(presets.registered[1]!.name).toBe("首席评审");
  });

  it("仅工具声明变更也换代（allow 进指纹——否则加 pwsh 不生效）", async () => {
    const { sync, presets } = makeSync({ knownTools: () => ["read", "grep", "pwsh"] });
    // 入参用拷贝：makeService 持引用，直接改 baseEntry 会污染后续用例
    const entry = { ...baseEntry };
    const registry = makeService([entry]);
    await sync.syncFrom(registry);
    expect(sync.allowOf("code-reviewer")).toEqual(["read", "grep"]);
    entry.tools = ["read", "grep", "pwsh"];
    await sync.syncFrom(registry);
    expect(presets.disposed).toEqual(["code-reviewer"]);
    expect(sync.allowOf("code-reviewer")).toEqual(["read", "grep", "pwsh"]);
  });

  it("禁用/移除专家 = 撤行（dispose；不阻载同步）", async () => {
    const { sync, presets } = makeSync();
    const entries = [baseEntry];
    const registry = makeService(entries);
    await sync.syncFrom(registry);
    entries.splice(0, 1, { ...baseEntry, enabled: false });
    await sync.syncFrom(registry);
    expect(presets.disposed).toEqual(["code-reviewer"]);
    expect(presets.registered).toHaveLength(1);
  });

  it("注册失败 = diag warn + 不炸同步（后续专家照常注册、不阻载；失败者不进台账）", async () => {
    diag.mockClear();
    const { sync, presets } = makeSync();
    presets.fail("code-reviewer", new Error("mount failed"));
    const registry = makeService([baseEntry, { ...baseEntry, name: "merge-planner", title: "合并规划" }]);
    await expect(sync.syncFrom(registry)).resolves.toBeUndefined();
    expect(diag).toHaveBeenCalledWith("warn", expect.stringContaining("expert-squad-preset"), expect.stringContaining("code-reviewer"));
    expect(presets.registered.map((d) => d.id)).toContain("merge-planner");
    expect(sync.allowOf("code-reviewer")).toBeUndefined();
  });

  it("白名单求交：可信探针剔除未知名；解析空集 = warn 跳过不注册", async () => {
    diag.mockClear();
    const { sync, presets } = makeSync({ knownTools: () => ["read"] });
    const registry = makeService([
      { ...baseEntry, tools: ["read", "pwsh"] },
      { ...baseEntry, name: "no-tools", tools: ["missing-a", "missing-b"] },
    ]);
    await sync.syncFrom(registry);
    expect(sync.allowOf("code-reviewer")).toEqual(["read"]);
    expect(presets.registered.some((d) => d.id === "no-tools")).toBe(false);
    expect(sync.allowOf("no-tools")).toBeUndefined();
    expect(diag).toHaveBeenCalledWith("warn", expect.anything(), expect.stringContaining("no-tools"));
  });

  it("allowOf：非专家键 / 未注册 / undefined 入参 → undefined（监听器据此零动作）", async () => {
    const { sync } = makeSync();
    await sync.syncFrom(makeService([baseEntry]));
    expect(sync.allowOf("Forge")).toBeUndefined();
    expect(sync.allowOf("headhunter")).toBeUndefined();
    expect(sync.allowOf(undefined)).toBeUndefined();
    expect(sync.allowOf("code-reviewer")).toEqual(["read", "grep"]);
  });

  it("disposeAll 撤全部行并清台账（插件卸载级联）", async () => {
    const { sync, presets } = makeSync();
    await sync.syncFrom(makeService([baseEntry]));
    await sync.disposeAll();
    expect(presets.disposed).toEqual(["code-reviewer"]);
    expect(sync.allowOf("code-reviewer")).toBeUndefined();
    await sync.syncFrom(makeService([baseEntry]));
    expect(presets.registered).toHaveLength(2);
  });
});
