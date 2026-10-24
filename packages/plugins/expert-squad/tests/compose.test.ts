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
  it("人设合成 persona 全文：name/title/简介/人设原文俱在且有序", () => {
    const compose = createExpertComposer(makeService([baseEntry]));
    const request: ExpertSubagentRequest = compose("code-reviewer", "评审 src/dispatch/compose.ts");
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

  it("tools → toolFilter 白名单（allow 形态，原样不二次过滤）", () => {
    const compose = createExpertComposer(makeService([baseEntry]));
    const request = compose("code-reviewer", "任务文本");
    expect(request.toolFilter).toEqual({ allow: ["read", "grep"] });
  });

  it("model → agentOptions.model；model 缺省不携带 agentOptions 键", () => {
    const withModel = createExpertComposer(
      makeService([{ ...baseEntry, name: "a", model: "sonnet" }]),
    );
    expect(withModel("a", "t").agentOptions).toEqual({ model: "sonnet" });
    const compose = createExpertComposer(makeService([baseEntry]));
    const request = compose("code-reviewer", "t");
    expect("agentOptions" in request).toBe(false);
  });

  it("task → prompt 单 text 块全文", () => {
    const compose = createExpertComposer(makeService([baseEntry]));
    const request = compose("code-reviewer", "评审 src/foo.ts 的 diff");
    expect(request.prompt).toEqual([{ type: "text", text: "评审 src/foo.ts 的 diff" }]);
  });

  it("不存在的键 fail-loud：ExpertNotFoundError 消息含键名", () => {
    const compose = createExpertComposer(makeService([baseEntry]));
    expect(() => compose("no-such-expert", "t")).toThrowError(
      new ExpertNotFoundError("no-such-expert"),
    );
  });

  it("禁用专家 fail-loud：ExpertDisabledError 消息含键名", () => {
    const compose = createExpertComposer(
      makeService([{ ...baseEntry, name: "disabled-one", enabled: false }]),
    );
    expect(() => compose("disabled-one", "t")).toThrowError(new ExpertDisabledError("disabled-one"));
  });
});
