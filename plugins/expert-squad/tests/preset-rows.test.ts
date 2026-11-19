// preset-rows —— 专家档案 → agentPreset 行（官方正本核销 2026-11 fix-1）：
// persona/工具白名单的注入通道 = agentPreset（subagent README:63-65 Child presets：
// in-process spawn 接受独立 agentPreset；preset 承载 = tools + prompt sections +
// skills 声明式组合，agent-preset-registry README）。程序化注册正门 =
// AgentPresetRegistry.register(PresetDefinition)（definition.d.ts——declaring plugin
// owns the disposer）。本面钉住：
//   ① preset 行构造：id = expert-<key>；persona = dsh-persona 行 prefix（人设全文
//      合成，与旧 SubagentStartRequest.persona 语义逐字等价）；白名单 = expert-restrict
//      行 config.allow（ctx.tools.restrict fail-closed 平台落地）。
//   ② 装载期批量预注册 + 增删同步（ExpertPresetSync）：同指纹跳过、内容变更换代
//      （dispose 旧 + register 新）、撤销/禁用撤行、注册失败 diag warn 不炸同步。

import { describe, expect, it, vi } from "vitest";
import type { PresetDefinition } from "@deepseek-ai/dsh-agent-preset-registry";
import {
  EXPERT_PERSONA_ROW_NAME,
  EXPERT_RESTRICT_ROW_NAME,
  ExpertPresetSync,
  buildExpertPresetDefinition,
  type PresetRegistryFace,
} from "../host/preset-rows.js";
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
  it("id = expert-<key>；name = title；description 透出", () => {
    const def = buildExpertPresetDefinition(baseEntry, ["read", "grep"]);
    expect(def.id).toBe("expert-code-reviewer");
    expect(def.name).toBe("资深评审");
    expect(def.description).toBe("Runs code review on diffs and files.");
  });

  it("persona = dsh-persona 行 prefix 承载人设全文合成（身份头 + 人设原文）", () => {
    const def = buildExpertPresetDefinition(baseEntry, ["read"]);
    const persona = def.plugins.find((p) => p.name === EXPERT_PERSONA_ROW_NAME);
    expect(persona).toBeDefined();
    const prefix = (persona!.config as { prefix: string }).prefix;
    expect(prefix).toContain("code-reviewer");
    expect(prefix).toContain("资深评审");
    expect(prefix).toContain("Runs code review on diffs and files.");
    expect(prefix).toContain("## 职责");
    expect(prefix).toContain(baseEntry.personaMd.trimEnd());
  });

  it("白名单 = expert-restrict 行 config.allow 原样承载（fail-closed 平台语义归 restrict）", () => {
    const def = buildExpertPresetDefinition(baseEntry, ["read", "grep"]);
    const restrict = def.plugins.find((p) => p.name === EXPERT_RESTRICT_ROW_NAME);
    expect(restrict).toBeDefined();
    expect((restrict!.config as { allow: string[] }).allow).toEqual(["read", "grep"]);
  });

  it("恰两行：persona + expert-restrict（无其他 prompt 段缝——注入通道唯一）", () => {
    const def = buildExpertPresetDefinition(baseEntry, ["read"]);
    expect(def.plugins).toHaveLength(2);
    const names = def.plugins.map((p) => p.name);
    expect(names).toEqual([EXPERT_PERSONA_ROW_NAME, EXPERT_RESTRICT_ROW_NAME]);
  });
});

// ---------------------------------------------------------------------------
// ExpertPresetSync：装载期批量预注册 + 增删同步
// ---------------------------------------------------------------------------

describe("ExpertPresetSync.syncFrom", () => {
  it("装载期批量预注册：每位启用专家一行（register 按 expert-<key> 幂等位）", async () => {
    const { sync, presets } = makeSync();
    const registry = makeService([
      baseEntry,
      { ...baseEntry, name: "merge-planner", title: "合并规划" },
    ]);
    await sync.syncFrom(registry);
    expect(presets.registered.map((d) => d.id).sort()).toEqual([
      "expert-code-reviewer",
      "expert-merge-planner",
    ]);
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
    const registry = makeService([baseEntry]);
    await sync.syncFrom(registry);
    registry.get("code-reviewer").title = "首席评审";
    await sync.syncFrom(registry);
    expect(presets.disposed).toEqual(["expert-code-reviewer"]);
    expect(presets.registered).toHaveLength(2);
    expect(presets.registered[1]!.name).toBe("首席评审");
  });

  it("禁用/移除专家 = 撤行（dispose；不阻载同步）", async () => {
    const { sync, presets } = makeSync();
    const entries = [baseEntry];
    const registry = makeService(entries);
    await sync.syncFrom(registry);
    entries.splice(0, 1, { ...baseEntry, enabled: false });
    await sync.syncFrom(registry);
    expect(presets.disposed).toEqual(["expert-code-reviewer"]);
    expect(presets.registered).toHaveLength(1);
  });

  it("注册失败 = diag warn + 不炸同步（后续专家照常注册、不阻载）", async () => {
    diag.mockClear();
    const { sync, presets } = makeSync();
    presets.fail("expert-code-reviewer", new Error("mount failed"));
    const registry = makeService([
      baseEntry,
      { ...baseEntry, name: "merge-planner", title: "合并规划" },
    ]);
    await expect(sync.syncFrom(registry)).resolves.toBeUndefined();
    expect(diag).toHaveBeenCalledWith(
      "warn",
      expect.stringContaining("expert-squad-preset"),
      expect.stringContaining("code-reviewer"),
    );
    expect(presets.registered.map((d) => d.id)).toContain("expert-merge-planner");
  });

  it("白名单求交：可信探针剔除未知名；解析空集 = warn 跳过不注册（不注册空白名单行）", async () => {
    diag.mockClear();
    const { sync, presets } = makeSync({ knownTools: () => ["read"] });
    const registry = makeService([
      { ...baseEntry, tools: ["read", "pwsh"] },
      { ...baseEntry, name: "no-tools", tools: ["missing-a", "missing-b"] },
    ]);
    await sync.syncFrom(registry);
    const def = presets.registered.find((d) => d.id === "expert-code-reviewer");
    expect((def!.plugins[1]!.config as { allow: string[] }).allow).toEqual(["read"]);
    expect(presets.registered.some((d) => d.id === "expert-no-tools")).toBe(false);
    expect(diag).toHaveBeenCalledWith(
      "warn",
      expect.anything(),
      expect.stringContaining("no-tools"),
    );
  });

  it("disposeAll 撤全部行（插件卸载级联）", async () => {
    const { sync, presets } = makeSync();
    await sync.syncFrom(makeService([baseEntry]));
    await sync.disposeAll();
    expect(presets.disposed).toEqual(["expert-code-reviewer"]);
    // 再同步 = 重注册（disposeAll 后台账已清）
    await sync.syncFrom(makeService([baseEntry]));
    expect(presets.registered).toHaveLength(2);
  });
});
