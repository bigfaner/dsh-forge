// 组装内核单元测试（fix-1 agentPreset 通道重设计）：
// compose(key, task) 产出 startActivation 请求组装半——agentPreset = 档案键原样
// （用户裁定 2026-11-24 移除 expert- 前缀；persona/白名单承载面迁入 preset 行，
// 见 preset-rows.test.ts）、model → agentOptions、task → prompt text 块；
// 禁用/不存在专家 fail-loud（业务错原样上抛，消息含键名）。
// 白名单平台求交语义（resolveToolAllow）保留原位——消费方迁往 ExpertPresetSync。

import { describe, expect, it } from "vitest";
import {
  createExpertComposer,
  resolveToolAllow,
  type ExpertSubagentRequest,
} from "../host/dispatch/compose.js";
import { ExpertDisabledError, ExpertNotFoundError } from "../host/registry.js";
import type { ExpertEntry, ExpertsService } from "../host/registry.js";

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

describe("compose 组装内核（agentPreset 通道）", () => {
  it("agentPreset = 档案键原样（官方 Child presets 注入通道承载专家身份）", async () => {
    const compose = createExpertComposer(makeService([baseEntry]));
    const request: ExpertSubagentRequest = await compose("code-reviewer", "评审 src/dispatch/compose.ts");
    expect(request.agentPreset).toBe("code-reviewer");
  });

  it("请求组装半不含 persona/toolFilter 键（rc.1 SubagentStartRequest 字段集已移除——承载面唯一 = preset 行）", async () => {
    const compose = createExpertComposer(makeService([baseEntry]));
    const request = await compose("code-reviewer", "t");
    expect("persona" in request).toBe(false);
    expect("toolFilter" in request).toBe(false);
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
    expect("agentOptions" in (await modelOnly("m", "t"))).toBe(false);
    // 只填 provider（缺 model）→ 整组省略
    const providerOnly = createExpertComposer(
      makeService([{ ...baseEntry, name: "r", provider: "anthropic" }]),
    );
    expect("agentOptions" in (await providerOnly("r", "t"))).toBe(false);
    // 两字段均缺省 → 整组省略（回落继承）
    const compose = createExpertComposer(makeService([baseEntry]));
    expect("agentOptions" in (await compose("code-reviewer", "t"))).toBe(false);
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
});

// ---------------------------------------------------------------------------
// 白名单平台求交（bug 3cb118cf / e3b045dc / c19eb719 家族——语义原位保留，
// 消费方 = preset 行构造期 ExpertPresetSync）
// ---------------------------------------------------------------------------

describe("resolveToolAllow 白名单求交", () => {
  const macTools = ["read", "grep", "edit", "bash"]; // Mac 真机注册面：无 pwsh，有 bash

  it("bug 3cb118cf: 白名单含 pwsh 且真机未注册 pwsh → 解析为在场的同族 shell（bash）", () => {
    expect(resolveToolAllow(["read", "pwsh"], macTools)).toEqual(["read", "bash"]);
  });

  it("白名单含真机不存在的非 shell 名时 fail-soft 剔除，不炸 restrict", () => {
    expect(resolveToolAllow(["read", "grep", "no-such-tool"], macTools)).toEqual(["read", "grep"]);
  });

  it("解析后为空集 fail-loud（全未知 = 档案配置错误）", () => {
    expect(() => resolveToolAllow(["no-such-tool", "another-missing"], macTools)).toThrow(
      /empty tool allow-list/,
    );
  });

  it("bug 92d642c2 同族：探针为子域投影（缺金丝雀 read）= 不可信——白名单原样承载不裁剪不炸", () => {
    expect(
      resolveToolAllow(["read", "grep"], [
        "delegate_expert", "recruit_expert", "update_expert", "rename_expert",
        "enable_expert", "disable_expert", "list_experts", "list_tools", "list_skills",
      ]),
    ).toEqual(["read", "grep"]);
  });

  it("无探针（面缺席）不裁剪——白名单原样承载", () => {
    expect(resolveToolAllow(["read", "pwsh"], undefined)).toEqual(["read", "pwsh"]);
  });

  it("bug c19eb719：排除集 7 枚 fail-soft 剔除；list_experts/delegate_expert 保留", () => {
    const excluded = [
      "list_tools", "list_skills", "recruit_expert",
      "update_expert", "rename_expert", "enable_expert", "disable_expert",
    ];
    expect(
      resolveToolAllow(["read", ...excluded, "delegate_expert", "list_experts"], [
        "read", ...excluded, "delegate_expert", "list_experts",
      ]),
    ).toEqual(["read", "delegate_expert", "list_experts"]);
  });
});
