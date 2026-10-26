// registry 单元测试（tech-design §7 / AD1 / AD2 / §10.1）：experts 取用 API
// fail-loud 错误语义（get 不存在/禁用抛业务错含键名）、list 默认只返回启用、
// registerRoot 追加内置层、setEnabled 工作区隔离启停、热刷新后 get 立即可见。

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import { ExpertsRegistry } from "../src/registry.js";
import type { ExpertsStateFace } from "../src/registry.js";
import { resolvePluginExpertsRoot, type ExpertRoot } from "../src/store/scan.js";

const tmpRoots: string[] = [];

afterAll(async () => {
  await Promise.all(tmpRoots.map((r) => rm(r, { recursive: true, force: true })));
});

function expertMd(overrides: {
  name?: string;
  title?: string;
  description?: string;
  tools?: string[];
  skills?: string[];
  model?: string;
  persona?: string;
} = {}): string {
  const frontmatterLines = [
    "---",
    `name: ${overrides.name ?? "code-reviewer"}`,
    `title: ${overrides.title ?? "资深评审"}`,
    "description: >-",
    `  ${overrides.description ?? "Runs code review on diffs and files."}`,
    `tools: [${(overrides.tools ?? ["read", "edit", "grep"]).join(", ")}]`,
    `skills: [${(overrides.skills ?? ["review", "tsc"]).join(", ")}]`,
  ];
  if (overrides.model !== undefined) frontmatterLines.push(`model: ${overrides.model}`);
  frontmatterLines.push("---");
  const persona = overrides.persona ?? "## 职责\n\n评审代码。\n";
  return `${frontmatterLines.join("\n")}\n${persona}`;
}

/** 内存启停状态（ExpertsStateFace 结构最小面——registry 不依赖 storage 装配）。 */
function makeMemState(): ExpertsStateFace & { calls: string[] } {
  const disabled = new Set<string>();
  return {
    calls: [],
    async isDisabled(_ws, id) {
      return disabled.has(id);
    },
    async setEnabled(ws, id, enabled) {
      this.calls.push(`${ws}:${id}:${enabled}`);
      if (enabled) disabled.delete(id);
      else disabled.add(id);
    },
  };
}

let dir: string;
let roots: ExpertRoot[];
let state: ReturnType<typeof makeMemState>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "expert-squad-registry-"));
  tmpRoots.push(dir);
  const project = join(dir, "project");
  await mkdir(project);
  await writeFile(join(project, "code-reviewer.md"), expertMd());
  await writeFile(join(project, "test-runner.md"), expertMd({ name: "test-runner", title: "测试跑手" }));
  roots = [{ origin: "project", dir: project }];
  state = makeMemState();
});

async function makeRegistry(extra?: { workspace?: string }) {
  const reg = new ExpertsRegistry({
    roots: () => roots,
    state,
    workspace: extra?.workspace ?? "C:\\ws\\a",
  });
  await reg.refresh();
  return reg;
}

describe("get：fail-loud 错误语义（AD1）", () => {
  it("存在且启用 → 返回 ExpertRecord 全字段", async () => {
    const reg = await makeRegistry();
    const record = reg.get("code-reviewer");
    expect(record).toMatchObject({
      name: "code-reviewer",
      title: "资深评审",
      description: "Runs code review on diffs and files.",
      personaMd: "## 职责\n\n评审代码。",
      tools: ["read", "edit", "grep"],
      skills: ["review", "tsc"],
      model: undefined,
      origin: "project",
      enabled: true,
    });
    // updatedAt = 来源文件 mtime（ISO 串；面板更新时间页脚数据源）
    expect(record.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("可选 model 字段在档案载明时透传", async () => {
    roots = [{ origin: "project", dir: roots[0]!.dir }];
    await writeFile(join(roots[0]!.dir, "modelled.md"), expertMd({ name: "modelled", model: "sonnet" }));
    const reg = await makeRegistry();
    expect(reg.get("modelled").model).toBe("sonnet");
  });

  it("不存在的键 → 抛业务错，消息含键名", async () => {
    const reg = await makeRegistry();
    expect(() => reg.get("no-such-expert")).toThrowError(/expert not found: no-such-expert/);
  });

  it("已禁用 → 抛业务错，消息含键名与 disabled 状态", async () => {
    await state.setEnabled("C:\\ws\\a", "code-reviewer", false);
    const reg = await makeRegistry();
    expect(() => reg.get("code-reviewer")).toThrowError(/expert disabled: code-reviewer/);
  });
});

describe("list：默认只返回启用（includeDisabled 显式开启才含禁用）", () => {
  it("禁用项默认不可见，includeDisabled 可见且 enabled=false", async () => {
    await state.setEnabled("C:\\ws\\a", "test-runner", false);
    const reg = await makeRegistry();

    const enabledOnly = reg.list();
    expect(enabledOnly.map((r) => r.name)).toEqual(["code-reviewer"]);

    const all = reg.list({ includeDisabled: true });
    expect(all.map((r) => [r.name, r.enabled])).toEqual([
      ["code-reviewer", true],
      ["test-runner", false],
    ]);
  });
});

describe("registerRoot：追加内置层 root（plugin 层）", () => {
  it("新 root 内档案注册后可见；低层被 project 遮蔽（AD3）", async () => {
    const builtin = join(dir, "builtin");
    await mkdir(builtin);
    await writeFile(join(builtin, "code-reviewer.md"), expertMd({ title: "内置版评审" }));
    await writeFile(join(builtin, "builtin-only.md"), expertMd({ name: "builtin-only" }));

    const reg = await makeRegistry();
    reg.registerRoot(undefined as unknown as Context, builtin);
    await reg.refresh();

    expect(reg.get("builtin-only").origin).toBe("plugin");
    // 同键跨层：project > plugin，遮蔽生效
    expect(reg.get("code-reviewer").origin).toBe("project");
    expect(reg.get("code-reviewer").title).toBe("资深评审");
  });
});

describe("listLayered：展示层全层列表（1.60 用户裁决——同键全层可见）", () => {
  it("同键返回全部层条目：effective 位标记胜出层；组内生效首张、其后 origin 高→低", async () => {
    const user = join(dir, "user");
    const plugin = join(dir, "plugin");
    await mkdir(user);
    await mkdir(plugin);
    await writeFile(join(user, "code-reviewer.md"), expertMd({ title: "用户版评审" }));
    await writeFile(join(plugin, "code-reviewer.md"), expertMd({ title: "内置版评审" }));
    roots = [
      { origin: "project", dir: join(dir, "project") },
      { origin: "user", dir: user },
      { origin: "plugin", dir: plugin },
    ];
    const reg = await makeRegistry();

    const layered = reg.listLayered().filter((r) => r.name === "code-reviewer");
    expect(layered.map((r) => [r.origin, r.effective, r.title])).toEqual([
      ["project", true, "资深评审"],
      ["user", false, "用户版评审"],
      ["plugin", false, "内置版评审"],
    ]);
  });

  it("生效条目沿用 list 启停可见性（禁用默认不可见）；被遮蔽条目恒在场", async () => {
    const user = join(dir, "user");
    await mkdir(user);
    await writeFile(join(user, "code-reviewer.md"), expertMd({ title: "用户版评审" }));
    roots = [
      { origin: "project", dir: join(dir, "project") },
      { origin: "user", dir: user },
    ];
    await state.setEnabled("C:\\ws\\a", "code-reviewer", false);
    const reg = await makeRegistry();

    // 生效条目沿用 list 启停可见性（禁用默认不可见——生效位恒标最高层，启用与否不改层位）；
    // 被遮蔽条目恒在场（展示层全量）
    expect(reg.listLayered().filter((r) => r.name === "code-reviewer").map((r) => [r.origin, r.effective])).toEqual([
      ["user", false],
    ]);
    const all = reg.listLayered({ includeDisabled: true }).filter((r) => r.name === "code-reviewer");
    expect(all.map((r) => [r.origin, r.effective, r.enabled])).toEqual([
      ["project", true, false],
      ["user", false, false],
    ]);
  });

  it("取用面零改动：listLayered 不影响 get/list 语义", async () => {
    const reg = await makeRegistry();
    expect(reg.get("code-reviewer").origin).toBe("project");
    expect(reg.list()).toHaveLength(2);
  });
});

describe("setEnabled：启停切换（工作区隔离走 state face，AD2）", () => {
  it("禁用后 get 抛错、启用恢复", async () => {
    const reg = await makeRegistry();
    await reg.setEnabled("code-reviewer", false);
    expect(() => reg.get("code-reviewer")).toThrowError(/expert disabled: code-reviewer/);

    await reg.setEnabled("code-reviewer", true);
    expect(reg.get("code-reviewer").enabled).toBe(true);
    // 透传到 state face（工作区隔离键由 state 承担）
    expect(state.calls).toContain("C:\\ws\\a:code-reviewer:false");
    expect(state.calls).toContain("C:\\ws\\a:code-reviewer:true");
  });

  it("对不存在键 setEnabled → fail-loud", async () => {
    const reg = await makeRegistry();
    await expect(reg.setEnabled("no-such-expert", false)).rejects.toThrowError(
      /expert not found: no-such-expert/,
    );
  });

  it("无 state（降级内存态）：禁用仅在本次 registry 生命周期内生效", async () => {
    const reg = new ExpertsRegistry({ roots: () => roots });
    await reg.refresh();
    await reg.setEnabled("code-reviewer", false);
    expect(() => reg.get("code-reviewer")).toThrowError(/expert disabled/);
    await reg.setEnabled("code-reviewer", true);
    expect(reg.get("code-reviewer").enabled).toBe(true);
  });
});

describe("热刷新：索引整体换代后 get 立即可见新内容", () => {
  it("档案内容变更 → refresh 后 get 返回新内容（远小于 5s 预算）", async () => {
    const reg = await makeRegistry();
    expect(reg.get("code-reviewer").title).toBe("资深评审");

    await writeFile(
      join(roots[0]!.dir, "code-reviewer.md"),
      expertMd({ title: "改版评审", description: "Updated description." }),
    );
    const t0 = Date.now();
    await reg.refresh(); // 模拟 watch 失效回调触发的整体换代
    expect(Date.now() - t0).toBeLessThan(5000);
    const record = reg.get("code-reviewer");
    expect(record.title).toBe("改版评审");
    expect(record.description).toBe("Updated description.");
  });

  it("禁用状态在换代后保持（启停不随档案重扫丢失）", async () => {
    const reg = await makeRegistry();
    await reg.setEnabled("code-reviewer", false);
    await reg.refresh();
    expect(() => reg.get("code-reviewer")).toThrowError(/expert disabled/);
  });

  it("换代后新增档案立即可 get", async () => {
    const reg = await makeRegistry();
    await writeFile(join(roots[0]!.dir, "fresh.md"), expertMd({ name: "fresh" }));
    await reg.refresh();
    expect(reg.get("fresh").name).toBe("fresh");
  });
});

describe("plugin 内置层自证（随包 experts/）", () => {
  it("resolvePluginExpertsRoot 指向包内 experts 目录且 code-reviewer 样例可扫描", async () => {
    const reg = new ExpertsRegistry({
      roots: () => [{ origin: "plugin", dir: resolvePluginExpertsRoot() }],
    });
    await reg.refresh();
    const record = reg.get("code-reviewer");
    expect(record.origin).toBe("plugin");
    expect(record.personaMd.length).toBeGreaterThan(0);
  });
});
