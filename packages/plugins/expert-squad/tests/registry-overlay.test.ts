// 配置模型与服务取用面单测（proposal expert-squad-default-routing 1.1 / verification V1/V2/V5 收口）：
// 实例 ID 生成与透出（layer: 前缀 / 插件名前缀）、experts 配置叠加（agentOptions 整组
// 同给同缺、tools/skills 换源、reasoning 三级链）、disabled 禁用判定、悬空键诊断日志。

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpertsRegistry, type DiagEmit, type ExpertsConfigFace } from "../src/registry.js";
import type { ExpertRoot } from "../src/store/scan.js";
import { parseExpertFile } from "../src/store/frontmatter.js";

const tmpRoots: string[] = [];

afterAll(async () => {
  await Promise.all(tmpRoots.map((r) => rm(r, { recursive: true, force: true })));
});

function expertMd(overrides: {
  name?: string;
  title?: string;
  tools?: string[];
  skills?: string[];
  model?: string;
  provider?: string;
  reasoning?: string;
} = {}): string {
  const lines = [
    "---",
    `name: ${overrides.name ?? "code-reviewer"}`,
    `title: ${overrides.title ?? "资深评审"}`,
    "description: >-",
    "  Runs code review on diffs and files.",
    `tools: [${(overrides.tools ?? ["read", "edit", "grep"]).join(", ")}]`,
    `skills: [${(overrides.skills ?? ["review", "tsc"]).join(", ")}]`,
  ];
  if (overrides.model !== undefined) lines.push(`model: ${overrides.model}`);
  if (overrides.provider !== undefined) lines.push(`provider: ${overrides.provider}`);
  if (overrides.reasoning !== undefined) lines.push(`reasoning: ${overrides.reasoning}`);
  lines.push("---");
  return `${lines.join("\n")}\n## 职责\n\n评审代码。\n`;
}

let dir: string;
let project: string;
let roots: ExpertRoot[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "expert-squad-overlay-"));
  tmpRoots.push(dir);
  project = join(dir, "project");
  await mkdir(project);
  await writeFile(join(project, "code-reviewer.md"), expertMd());
  roots = [{ origin: "project", dir: project }];
});

interface RegistryDeps {
  config?: ExpertsConfigFace;
  diag?: DiagEmit;
}

async function makeRegistry(deps: RegistryDeps = {}) {
  const reg = new ExpertsRegistry({
    roots: () => roots,
    config: deps.config,
    diag: deps.diag,
  });
  await reg.refresh();
  return reg;
}

describe("实例 ID：装载时生成并经 list/get 透出", () => {
  it("project 层 = layer:project#键；user 层 = layer:user#键", async () => {
    const user = join(dir, "user");
    await mkdir(user);
    await writeFile(join(user, "test-runner.md"), expertMd({ name: "test-runner" }));
    roots = [
      { origin: "project", dir: project },
      { origin: "user", dir: user },
    ];
    const reg = await makeRegistry();
    expect(reg.get("code-reviewer").instanceId).toBe("layer:project#code-reviewer");
    expect(reg.get("test-runner").instanceId).toBe("layer:user#test-runner");
  });

  it("plugin 层 = 插件名#键（root.pluginName）；缺省回退 plugin 前缀", async () => {
    const builtin = join(dir, "builtin");
    await mkdir(builtin);
    await writeFile(join(builtin, "bug-hunter.md"), expertMd({ name: "bug-hunter" }));
    roots = [
      { origin: "project", dir: project },
      { origin: "plugin", dir: builtin, pluginName: "@dsh-forge/plugin-forge" },
    ];
    const reg = await makeRegistry();
    expect(reg.get("bug-hunter").instanceId).toBe("@dsh-forge/plugin-forge#bug-hunter");

    const anon = join(dir, "anon");
    await mkdir(anon);
    await writeFile(join(anon, "anon-expert.md"), expertMd({ name: "anon-expert" }));
    roots = [...roots, { origin: "plugin", dir: anon }];
    await reg.refresh();
    expect(reg.get("anon-expert").instanceId).toBe("plugin#anon-expert");
  });

  it("list 应答逐条携带 instanceId", async () => {
    const reg = await makeRegistry();
    const ids = reg.list().map((e) => [e.name, e.instanceId]);
    expect(ids).toEqual([["code-reviewer", "layer:project#code-reviewer"]]);
  });
});

describe("experts 配置叠加：get() 返回前生效", () => {
  it("① 条目 agentOptions 整组（provider+model 成对）整组命中", async () => {
    const reg = await makeRegistry({
      config: {
        experts: () => ({
          "layer:project#code-reviewer": {
            agentOptions: { provider: "deepseek-official", model: "deepseek-reasoner" },
          },
        }),
      },
    });
    const entry = reg.get("code-reviewer");
    expect(entry.provider).toBe("deepseek-official");
    expect(entry.model).toBe("deepseek-reasoner");
  });

  it("仅配 model：不整组命中，model 位并入全局默认基座（V1-EX1）", async () => {
    const reg = await makeRegistry({
      config: {
        defaultAgentOptions: () => ({ provider: "deepseek-official", model: "deepseek-flash" }),
        experts: () => ({
          "layer:project#code-reviewer": { agentOptions: { model: "deepseek-reasoner" } },
        }),
      },
    });
    const entry = reg.get("code-reviewer");
    expect(entry.provider).toBe("deepseek-official");
    expect(entry.model).toBe("deepseek-reasoner");
  });

  it("档案 provider+model 成对优先于 defaultAgentOptions（② > ③）", async () => {
    await writeFile(
      join(project, "code-reviewer.md"),
      expertMd({ provider: "profile-p", model: "profile-m" }),
    );
    const reg = await makeRegistry({
      config: {
        defaultAgentOptions: () => ({ provider: "default-p", model: "default-m" }),
      },
    });
    const entry = reg.get("code-reviewer");
    expect(entry.provider).toBe("profile-p");
    expect(entry.model).toBe("profile-m");
  });

  it("① 缺条目时档案成对覆盖默认：成对在场取档案，否则回落默认", async () => {
    await writeFile(join(project, "code-reviewer.md"), expertMd({ model: "solo-model" }));
    const reg = await makeRegistry({
      config: { defaultAgentOptions: () => ({ provider: "default-p", model: "default-m" }) },
    });
    // 档案不成对 → defaultAgentOptions 整组兜底
    expect(reg.get("code-reviewer").provider).toBe("default-p");
    expect(reg.get("code-reviewer").model).toBe("default-m");

    await writeFile(
      join(project, "code-reviewer.md"),
      expertMd({ provider: "profile-p", model: "profile-m" }),
    );
    await reg.refresh();
    // 档案成对 → 整组生效
    expect(reg.get("code-reviewer").provider).toBe("profile-p");
  });

  it("reasoning 三级链：① 条目 > ② 档案 frontmatter > ③ defaultAgentOptions > 缺省不下发", async () => {
    const config: ExpertsConfigFace = {
      defaultAgentOptions: () => ({ reasoning: "high" }),
      experts: () => ({
        "layer:project#code-reviewer": { agentOptions: { reasoning: "low" } },
      }),
    };
    const reg = await makeRegistry({ config });
    expect(reg.get("code-reviewer").reasoning).toBe("low"); // ①

    const regNoEntry = await makeRegistry({
      config: {
        defaultAgentOptions: () => ({ reasoning: "high" }),
        experts: () => ({}),
      },
    });
    await writeFile(join(project, "code-reviewer.md"), expertMd({ reasoning: "medium" }));
    await regNoEntry.refresh();
    expect(regNoEntry.get("code-reviewer").reasoning).toBe("medium"); // ② > ③

    await writeFile(join(project, "code-reviewer.md"), expertMd());
    const regDefault = await makeRegistry({
      config: { defaultAgentOptions: () => ({ reasoning: "high" }) },
    });
    expect(regDefault.get("code-reviewer").reasoning).toBe("high"); // ③

    const regNone = await makeRegistry({});
    expect(regNone.get("code-reviewer").reasoning).toBeUndefined(); // ④ 不下发
  });

  it("tools/skills 换源：条目在场取条目，缺席回落档案", async () => {
    const reg = await makeRegistry({
      config: {
        experts: () => ({
          "layer:project#code-reviewer": { tools: ["read", "grep"], skills: ["review"] },
        }),
      },
    });
    const entry = reg.get("code-reviewer");
    expect(entry.tools).toEqual(["read", "grep"]);
    expect(entry.skills).toEqual(["review"]);
  });

  it("空壳条目等价无配置（V5）", async () => {
    const reg = await makeRegistry({
      config: { experts: () => ({ "layer:project#code-reviewer": {} }) },
    });
    const entry = reg.get("code-reviewer");
    expect(entry.provider).toBeUndefined();
    expect(entry.model).toBeUndefined();
    expect(entry.tools).toEqual(["read", "edit", "grep"]);
    expect(entry.enabled).toBe(true);
  });

  it("list 应答同径叠加", async () => {
    const reg = await makeRegistry({
      config: {
        experts: () => ({
          "layer:project#code-reviewer": {
            agentOptions: { provider: "p1", model: "m1" },
            tools: ["read"],
          },
        }),
      },
    });
    const entry = reg.list().find((e) => e.name === "code-reviewer")!;
    expect(entry.provider).toBe("p1");
    expect(entry.model).toBe("m1");
    expect(entry.tools).toEqual(["read"]);
  });
});

describe("disabled 禁用判定：experts 条目布尔位（来源级）", () => {
  it("get() 对配置禁用实例 fail-loud（ExpertDisabledError）", async () => {
    const reg = await makeRegistry({
      config: { experts: () => ({ "layer:project#code-reviewer": { disabled: true } }) },
    });
    expect(() => reg.get("code-reviewer")).toThrowError(/expert disabled: code-reviewer/);
  });

  it("list 默认不可见；includeDisabled 可见且 enabled=false", async () => {
    const reg = await makeRegistry({
      config: { experts: () => ({ "layer:project#code-reviewer": { disabled: true } }) },
    });
    expect(reg.list().map((e) => e.name)).toEqual([]);
    const all = reg.list({ includeDisabled: true });
    expect(all.map((e) => [e.name, e.enabled])).toEqual([["code-reviewer", false]]);
  });

  it("disabled: false 显式位不禁用；配置禁用与工作区启停或运算合并", async () => {
    const reg = await makeRegistry({
      config: { experts: () => ({ "layer:project#code-reviewer": { disabled: false } }) },
    });
    expect(reg.get("code-reviewer").enabled).toBe(true);
  });
});

describe("悬空键：emitDiag error 日志（点名键，无 UI 面）", () => {
  it("配置在场档案缺席 → diag error 点名键；每代快照每键至多一次", async () => {
    const diag = vi.fn();
    const reg = await makeRegistry({
      config: {
        experts: () => ({
          "layer:project#gone": { disabled: true },
          "layer:project#code-reviewer": { disabled: true },
        }),
      },
      diag,
    });
    reg.list();
    reg.list();
    const calls = diag.mock.calls.filter(([, , m]) => String(m).includes("gone"));
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe("error");
    expect(String(calls[1 - 1]![2])).toContain("layer:project#gone");
    // 在场键不误报
    expect(diag.mock.calls.some(([, , m]) => String(m).includes("code-reviewer"))).toBe(false);
  });

  it("被遮蔽层在场算在场（不误报）", async () => {
    const builtin = join(dir, "builtin");
    await mkdir(builtin);
    await writeFile(join(builtin, "code-reviewer.md"), expertMd({ title: "内置版" }));
    roots = [
      { origin: "project", dir: project },
      { origin: "plugin", dir: builtin, pluginName: "@x/pkg" },
    ];
    const diag = vi.fn();
    const reg = await makeRegistry({
      config: { experts: () => ({ "@x/pkg#code-reviewer": { disabled: true } }) },
      diag,
    });
    reg.list();
    expect(diag).not.toHaveBeenCalled();
  });

  it("快照空代（未刷新）不判悬空（V4-EX2）", () => {
    const diag = vi.fn();
    const reg = new ExpertsRegistry({
      roots: () => roots,
      config: { experts: () => ({ "layer:project#gone": {} }) },
      diag,
    });
    reg.list();
    expect(diag).not.toHaveBeenCalled();
  });

  it("换代后档案恢复 → 不再报悬空；再次消失 → 重新报", async () => {
    const diag = vi.fn();
    const reg = await makeRegistry({
      config: { experts: () => ({ "layer:project#gone": {} }) },
      diag,
    });
    reg.list();
    expect(diag).toHaveBeenCalledTimes(1);
    // 档案恢复（键回到在场）
    await writeFile(join(project, "gone.md"), expertMd({ name: "gone" }));
    await reg.refresh();
    reg.list();
    expect(diag).toHaveBeenCalledTimes(1);
    // 再次消失 → 新一代重新报
    await rm(join(project, "gone.md"));
    await reg.refresh();
    reg.list();
    expect(diag).toHaveBeenCalledTimes(2);
  });
});

describe("同层同键多份：root 注册序先者优先（V1-EX2 稳定契约）", () => {
  it("两个 plugin root 注册同键 → 先注册的胜出，后者跳过并 warning", async () => {
    const first = join(dir, "first");
    const second = join(dir, "second");
    await mkdir(first);
    await mkdir(second);
    await writeFile(join(first, "code-reviewer.md"), expertMd({ title: "先注册版" }));
    await writeFile(join(second, "code-reviewer.md"), expertMd({ title: "后注册版" }));
    roots = [
      { origin: "plugin", dir: first, pluginName: "@a/first" },
      { origin: "plugin", dir: second, pluginName: "@b/second" },
    ];
    const reg = await makeRegistry();
    expect(reg.get("code-reviewer").title).toBe("先注册版");
    expect(reg.get("code-reviewer").instanceId).toBe("@a/first#code-reviewer");
    expect(reg.warnings.some((w) => w.includes("code-reviewer"))).toBe(true);
  });
});

describe("frontmatter：可选 reasoning 字段（low|medium|high）", () => {
  it("合法值解析透传；非法值拒绝；缺省不携带", () => {
    const ok = parseExpertFile("x.md", expertMd({ reasoning: "high" }));
    expect(ok.ok && ok.record.reasoning).toBe("high");

    const bad = parseExpertFile("x.md", expertMd({ reasoning: "ultra" }));
    expect(bad.ok).toBe(false);
    expect(bad.ok ? "" : bad.reason).toContain("reasoning");

    const absent = parseExpertFile("x.md", expertMd());
    expect(absent.ok && absent.record.reasoning).toBeUndefined();
  });
});
