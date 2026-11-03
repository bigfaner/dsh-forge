// 组装内核单元测试（tech-design §5 dispatch/compose.ts / §4 AD4 / §10.1）：
// compose(key, task) 产出合法 SubagentStartRequest 结构子面——人设合成 persona
// 全文（name/title/简介/人设原文）、tools → toolFilter、model → agentOptions、
// task → prompt text 块；禁用/不存在专家 fail-loud（业务错原样上抛，消息含键名）。

import { describe, expect, it } from "vitest";
import { createExpertComposer, type ExpertSubagentRequest } from "../src/dispatch/compose.js";
import { ExpertDisabledError, ExpertNotFoundError } from "../src/registry.js";
import type { ExpertEntry, ExpertsService } from "../src/registry.js";

/** 内存取用服务（ExpertsService 结构最小面——compose 不依赖 registry 装配）。 */
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
  personaMd: "## 职责\n\n评审代码。\n\n## 边界\n\n不改业务逻辑。\n",
  tools: ["read", "grep"],
  skills: ["review", "tsc"],
  origin: "user",
  enabled: true,
};

describe("compose 组装内核", () => {
  it("人设合成 persona 全文：name/title/简介/人设原文俱在且有序", async () => {
    const compose = createExpertComposer(makeService([baseEntry]));
    const request: ExpertSubagentRequest = await compose("code-reviewer", "评审 src/dispatch/compose.ts");
    expect(request.persona).toContain("code-reviewer");
    expect(request.persona).toContain("资深评审");
    expect(request.persona).toContain("Runs code review on diffs and files.");
    expect(request.persona).toContain("## 职责");
    expect(request.persona).toContain("评审代码。");
    expect(request.persona).toContain("## 边界");
    // 合成有序：身份头（岗位/键/简介）在前，人设原文在后
    const idxName = request.persona.indexOf("code-reviewer");
    const idxTitle = request.persona.indexOf("资深评审");
    const idxDesc = request.persona.indexOf("Runs code review on diffs and files.");
    const idxPersona = request.persona.indexOf("## 职责");
    expect(idxTitle).toBeLessThan(idxName);
    expect(idxName).toBeLessThan(idxDesc);
    expect(idxDesc).toBeLessThan(idxPersona);
    // 人设原文逐字保留（不截断、不转义）
    expect(request.persona).toContain(baseEntry.personaMd.trimEnd());
  });

  it("tools → toolFilter 白名单（allow 形态，原样不二次过滤）", async () => {
    const compose = createExpertComposer(makeService([baseEntry]));
    const request = await compose("code-reviewer", "任务文本");
    expect(request.toolFilter).toEqual({ allow: ["read", "grep"] });
  });

  it("agentOptions 三态：provider+model 成对在场才携带；只填其一或缺省整组省略", async () => {
    // 成对在场 → agentOptions {provider, model}
    const paired = createExpertComposer(
      makeService([{ ...baseEntry, name: "p", model: "sonnet", provider: "anthropic" }]),
    );
    expect((await paired("p", "t")).agentOptions).toEqual({ provider: "anthropic", model: "sonnet" });
    // 只填 model（缺 provider）→ 整组省略
    const modelOnly = createExpertComposer(
      makeService([{ ...baseEntry, name: "m", model: "sonnet" }]),
    );
    expect("agentOptions" in (await modelOnly("m", "t"))).toBe(false).toBe(false);
    // 只填 provider（缺 model）→ 整组省略
    const providerOnly = createExpertComposer(
      makeService([{ ...baseEntry, name: "r", provider: "anthropic" }]),
    );
    expect("agentOptions" in (await providerOnly("r", "t"))).toBe(false).toBe(false);
    // 两字段均缺省 → 整组省略（回落继承）
    const compose = createExpertComposer(makeService([baseEntry]));
    expect("agentOptions" in (await compose("code-reviewer", "t"))).toBe(false).toBe(false);
  });

  it("task → prompt 单 text 块全文", async () => {
    const compose = createExpertComposer(makeService([baseEntry]));
    const request = await compose("code-reviewer", "评审 src/foo.ts 的 diff");
    expect(request.prompt).toEqual([{ type: "text", text: "评审 src/foo.ts 的 diff" }]);
  });

  it("不存在的键 fail-loud：ExpertNotFoundError 消息含键名", async () => {
    const compose = createExpertComposer(makeService([baseEntry]));
    await expect(compose("no-such-expert", "t")).rejects.toThrowError(
      new ExpertNotFoundError("no-such-expert"),
    );
  });

  it("禁用专家 fail-loud：ExpertDisabledError 消息含键名", async () => {
    const compose = createExpertComposer(
      makeService([{ ...baseEntry, name: "disabled-one", enabled: false }]),
    );
    await expect(compose("disabled-one", "t")).rejects.toThrowError(new ExpertDisabledError("disabled-one"));
  });

  it("bug 92d642c2 同族：探针为子域投影（缺官方金丝雀 read）= 不可信——白名单原样承载不裁剪不炸", async () => {
    // 真机退化装配链实测形态：knownTools 仅 9 枚 expert 域工具（零官方工具）——
    // 档案 allow（read/grep）与其求交为空集，旧逻辑 ExpertToolError 炸委派。
    const compose = createExpertComposer(makeService([baseEntry]), () => [
      "delegate_expert", "recruit_expert", "update_expert", "rename_expert",
      "enable_expert", "disable_expert", "list_experts", "list_tools", "list_skills",
    ]);
    const request = await compose("code-reviewer", "t");
    expect(request.toolFilter.allow).toEqual(["read", "grep"]); // 白名单原样承载
  });

  it("可信探针（含金丝雀 read）求交语义不变：未知名剔除、命中保留", async () => {
    const compose = createExpertComposer(makeService([baseEntry]), () => [
      "read", "write", "pwsh", "submitTask", "delegate_expert",
    ]);
    const request = await compose("code-reviewer", "t");
    expect(request.toolFilter.allow).toEqual(["read"]); // grep 未注册 → fail-soft 剔除
  });

  it("bug c19eb719：排除集 7 枚 fail-soft 剔除（同未知名口径，不炸）；list_experts/delegate_expert 保留", async () => {
    const excluded = [
      "list_tools", "list_skills", "recruit_expert",
      "update_expert", "rename_expert", "enable_expert", "disable_expert",
    ];
    const compose = createExpertComposer(
      makeService([{ ...baseEntry, tools: ["read", ...excluded, "delegate_expert", "list_experts"] }]),
      () => ["read", ...excluded, "delegate_expert", "list_experts"],
    );
    const request = await compose("code-reviewer", "t");
    expect(request.toolFilter.allow).toEqual(["read", "delegate_expert", "list_experts"]);
  });

  it("bug e3b045dc: 异步探针（全模式并集面）被正确 await——跨 preset 并集含金丝雀，求交生效不炸", async () => {
    // 宿主实测形态：global 层仅 expert 域工具，官方工具在 preset scope 层——
    // 探针经 unionAcrossPresets 异步返回并集（含 read）。
    const compose = createExpertComposer(makeService([baseEntry]), async () => [
      "delegate_expert", "list_tools", // global 层
      "read", "write", "edit", "grep", "glob", "pwsh", "todo_write", // preset 层
    ]);
    const request = await compose("code-reviewer", "t");
    expect(request.toolFilter.allow).toEqual(["read", "grep"]); // 并集可信 → 求交生效
  });

  it("bug e3b045dc: 异步探针返回空并集（面缺席）→ 不裁剪原样承载（fail-soft）", async () => {
    const compose = createExpertComposer(makeService([baseEntry]), async () => []);
    const request = await compose("code-reviewer", "t");
    expect(request.toolFilter.allow).toEqual(["read", "grep"]);
  });
});
