// dispatch-core · 组装面单测（expert-squad-default-routing 1.2）：workerAgentOptionsOf
// 四级链全组合穷举（①experts 条目 × ②档案成对/单边 × ③defaultAgentOptions × ④父继承）
// + reasoning 三级合成。链规格正本 =
// proposal「优先级链」+ verification.md §0.3 first-def fold / V1-EX1 收口。
import { describe, expect, it } from "vitest";
import { workerAgentOptionsOf } from "../../host/dispatch-core/assemble.js";

/** ② 档案级四种形态（verification §1.2：成对 / 仅 model / 仅 provider / 无） */
const PROFILE_FORMS: Record<string, { provider?: string; model?: string } | undefined> = {
  paired: { provider: "pp", model: "pm" },
  "model-only": { model: "pm" },
  "provider-only": { provider: "pp" },
  none: undefined,
};

/** ① experts 条目（整组 agentOptions）有/无 */
const ENTRY_FORMS: Record<string, { provider?: string; model?: string } | undefined> = {
  entry: { provider: "ep", model: "em" },
  none: undefined,
};

/** ③ defaultAgentOptions 有/无 */
const DEFAULTS_FORMS: Record<string, { provider?: string; model?: string } | undefined> = {
  defaults: { provider: "dp", model: "dm" },
  none: undefined,
};

describe("workerAgentOptionsOf：四级链（含折叠应答消费烟测）", () => {
  it("折叠应答在场 = reasoning→effort 直映射；全级缺席（expert-squad 缺席）= undefined", () => {
    expect(
      workerAgentOptionsOf({ entry: { provider: "deepseek", model: "reasoner", reasoning: "high" } }),
    ).toEqual({ provider: "deepseek", model: "reasoner", reasoningEffort: "high" });
    expect(workerAgentOptionsOf({})).toBeUndefined();
  });
  for (const [entryName, entry] of Object.entries(ENTRY_FORMS)) {
    for (const [profileName, profile] of Object.entries(PROFILE_FORMS)) {
      for (const [defaultsName, defaults] of Object.entries(DEFAULTS_FORMS)) {
        it(`①${entryName} × ②${profileName} × ③${defaultsName}`, () => {
          expect(workerAgentOptionsOf({ entry, profile, defaults })).toEqual(
            // 期望矩阵按 first-def fold 手工推演（verification §1.2 同表）：
            // ① 在场 = 条目整组命中（ep/em）；① 缺席时 ② 成对命中（pp/pm）、
            // ② 单边/缺席回落 ③ 基座（dp/dm）；③ 也缺席 = ④ 父继承（undefined）。
            entry !== undefined
              ? { provider: "ep", model: "em" }
              : profileName === "paired"
                ? { provider: "pp", model: "pm" }
                : defaults !== undefined
                  ? { provider: "dp", model: "dm" }
                  : undefined,
          );
        });
      }
    }
  }

  it("V1-EX1 收口：① 仅 model 单边（不整组命中）→ model 位并入基座（② 或 ③ 的 provider）", () => {
    expect(workerAgentOptionsOf({ entry: { model: "em" }, defaults: { provider: "dp", model: "dm" } })).toEqual({
      provider: "dp",
      model: "em",
    });
    // 无任何基座 → 不成对回落父继承
    expect(workerAgentOptionsOf({ entry: { model: "em" } })).toBeUndefined();
  });

  it("全级缺席（expert-squad 缺席降级形态）= undefined（④ 父会话继承）", () => {
    expect(workerAgentOptionsOf({})).toBeUndefined();
  });
});

describe("workerAgentOptionsOf：reasoning 三级合成（① 条目 > ② 档案 frontmatter > ③ defaultAgentOptions > 不下发）", () => {
  it("三级同时在场 = ① 压倒", () => {
    expect(
      workerAgentOptionsOf({
        entry: { provider: "ep", model: "em", reasoning: "low" },
        profile: { provider: "pp", model: "pm", reasoning: "medium" },
        defaults: { provider: "dp", model: "dm", reasoning: "high" },
      }),
    ).toEqual({ provider: "ep", model: "em", reasoningEffort: "low" });
  });

  it("① 缺席 = ② frontmatter 生效；② 缺席 = ③ 生效", () => {
    expect(
      workerAgentOptionsOf({
        profile: { provider: "pp", model: "pm", reasoning: "medium" },
        defaults: { provider: "dp", model: "dm", reasoning: "high" },
      }),
    ).toEqual({ provider: "pp", model: "pm", reasoningEffort: "medium" });
    expect(
      workerAgentOptionsOf({
        defaults: { provider: "dp", model: "dm", reasoning: "high" },
      }),
    ).toEqual({ provider: "dp", model: "dm", reasoningEffort: "high" });
  });

  it("三级全缺 = 路由照常、不下发 effort（落模型默认档）", () => {
    expect(workerAgentOptionsOf({ profile: { provider: "pp", model: "pm" } })).toEqual({ provider: "pp", model: "pm" });
  });

  it("路由不成对（④ 父继承）时 reasoning 无生效位——整组省略", () => {
    expect(workerAgentOptionsOf({ defaults: { model: "dm", reasoning: "high" } })).toBeUndefined();
  });
});

// ─────────────────────────── 模块④：deriveWorkerToolFilter 路由档位收敛 ───────────────────────────

import type { TaskType } from "@dsh-forge/contracts";
import type { WorkerRouteProfile } from "../../host/faces.js";
import {
  deriveWorkerToolFilter,
  WORKER_PIPELINE_ESSENTIAL_TOOLS,
  WORKER_BUG_ESSENTIAL_TOOLS,
  WORKER_EXPERT_RELEASABLE_DENY,
} from "../../host/dispatch-core/assemble.js";

const TASK_TYPE = "coding-fix" as TaskType;

const expertRoute = (tools?: readonly string[]): WorkerRouteProfile => ({
  kind: "expert",
  ...(tools !== undefined ? { toolFilter: { allow: [...tools], deny: [] } } : {}),
});

describe("deriveWorkerToolFilter：路由档位收敛注入（模块④）", () => {
  it("generic 档：allow = 管线必备用具集（submitTask + todo_write）；bug 三动词缺席剔除 + diag warn 留痕", () => {
    const diags: { level: string; event: string; message: string }[] = [];
    const out = deriveWorkerToolFilter(TASK_TYPE, { kind: "generic" }, undefined, undefined, {
      diag: (d) => diags.push({ level: d.level, event: d.event, message: d.message }),
    });
    expect(out.allow).toEqual([...WORKER_PIPELINE_ESSENTIAL_TOOLS]);
    expect(out.allow).not.toContain("addTask");
    expect(out.deny).toContain("queryTask");
    expect(out.deny).toContain("dispatchTask");
    const warn = diags.find((d) => d.level === "warn" && d.event === "worker-route");
    expect(warn?.message).toContain("recordBug");
    expect(warn?.message).toContain("剔除");
  });

  it("bug 三动词跨域条件段：bugsPresent 现查命中 → 三动词并入 allow + 零 warn", () => {
    const diags: unknown[] = [];
    const out = deriveWorkerToolFilter(TASK_TYPE, { kind: "generic" }, undefined, undefined, {
      bugsPresent: () => true,
      diag: (d) => diags.push(d),
    });
    expect(out.allow).toEqual([...WORKER_PIPELINE_ESSENTIAL_TOOLS, ...WORKER_BUG_ESSENTIAL_TOOLS]);
    expect(diags).toHaveLength(0);
  });

  it("现查不缓存：bugsPresent 每次调用期求值（结果翻面即生效）", () => {
    let present = false;
    let calls = 0;
    const opts = { bugsPresent: () => (calls += 1, present) };
    const a = deriveWorkerToolFilter(TASK_TYPE, { kind: "generic" }, undefined, undefined, opts);
    expect(a.allow).not.toContain("getBug");
    present = true;
    const b = deriveWorkerToolFilter(TASK_TYPE, { kind: "generic" }, undefined, undefined, opts);
    expect(b.allow).toContain("getBug");
    expect(calls).toBe(2);
  });

  it("expert 档：allow = 档案 tools ∪ 管线必备（并集公式原样，addTask 不保底）", () => {
    const out = deriveWorkerToolFilter(TASK_TYPE, expertRoute(["read", "custom-lint"]));
    for (const name of ["read", "custom-lint", ...WORKER_PIPELINE_ESSENTIAL_TOOLS]) {
      expect(out.allow, `allow 保底 ${name}`).toContain(name);
    }
    expect(out.allow).not.toContain("addTask");
    expect(out.deny).toContain("queryTask");
  });

  it("deny 矩阵两档位同构（generic 与 expert 输出同一 deny 集）", () => {
    const generic = deriveWorkerToolFilter(TASK_TYPE, { kind: "generic" });
    const expert = deriveWorkerToolFilter(TASK_TYPE, expertRoute(["read"]));
    expect(expert.deny).toEqual(generic.deny);
  });

  it("档案可放行面：expert 档 tools 携带 knowledge 双 tool → 从 deny 剔除；generic 恒 deny", () => {
    const released = deriveWorkerToolFilter(TASK_TYPE, expertRoute(["read", ...WORKER_EXPERT_RELEASABLE_DENY]));
    for (const name of WORKER_EXPERT_RELEASABLE_DENY) expect(released.deny).not.toContain(name);
    const generic = deriveWorkerToolFilter(TASK_TYPE, { kind: "generic" });
    for (const name of WORKER_EXPERT_RELEASABLE_DENY) expect(generic.deny).toContain(name);
  });

  it("essentials 在场断言（bug e6669a50-G2）：探针在场缺必备 → fail-loud", () => {
    expect(() =>
      deriveWorkerToolFilter(TASK_TYPE, { kind: "generic" }, ["read", "submitTask"]),
    ).toThrowError(/pipeline essential tools not registered/);
  });

  it("探针可信门：子域投影（缺金丝雀 read）回落不裁剪不断言（deny 全表不与投影求交）", () => {
    const untrimmed = deriveWorkerToolFilter(TASK_TYPE, { kind: "generic" });
    const out = deriveWorkerToolFilter(TASK_TYPE, { kind: "generic" }, ["write", "bash"]);
    expect(out.allow).toEqual(untrimmed.allow);
    expect(out.deny).toEqual(untrimmed.deny); // 子域投影被金丝雀门拒收——双面均未与其求交
  });
});
