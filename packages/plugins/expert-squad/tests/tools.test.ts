// 管理 tool 面测试（tech-design §7 tool 面 / AC）：结构镜像对照官方
// dsh-tools register 门（output {schema, render} 强制 + 受支持 JSON Schema
// 子集白名单），加行为面（recruit/update 写路径经 frontmatter 校验 fail-loud、
// 启停工作区隔离语义经真 ExpertsRegistry + 临时目录）。

import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EXCLUDED_EXPERT_TOOL_NAMES,
  EXPERT_TOOLS,
  ExpertToolError,
  createExpertTools,
  createKnownToolsProbe,
  registerExpertTools,
  type ExpertToolDefinition,
} from "../src/tools.js";
import { ExpertsRegistry } from "../src/registry.js";

// ---------------------------------------------------------------------------
// 官方 register 门镜像（dsh-tools lib/index.js assertSupportedJsonSchema 关键字
// 白名单面 + required ⊆ properties 规则 + output 声明强制）
// ---------------------------------------------------------------------------

const SUBSET_KEYWORDS = new Set([
  "type",
  "oneOf",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "description",
  "title",
  "default",
  "examples",
]);

function unsupportedKeywords(node: unknown, path = "schema"): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((entry, i) => unsupportedKeywords(entry, `${path}[${i}]`));
  }
  if (node === null || typeof node !== "object") return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (!SUBSET_KEYWORDS.has(key)) out.push(`${path}.${key}`);
    if (key === "type" && Array.isArray(value)) {
      out.push(`${path}.type must be a single type string (type arrays are not supported)`);
      continue;
    }
    if (key === "properties") {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        out.push(`${path}.properties must be an object of schemas`);
        continue;
      }
      for (const [name, schema] of Object.entries(value)) {
        out.push(...unsupportedKeywords(schema, `${path}.properties.${name}`));
      }
      continue;
    }
    if (key === "description" || key === "title" || key === "default" || key === "examples") continue;
    out.push(...unsupportedKeywords(value, `${path}.${key}`));
  }
  return out;
}

function requiredNotInProperties(node: unknown, path = "schema"): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((entry, i) => requiredNotInProperties(entry, `${path}[${i}]`));
  }
  if (node === null || typeof node !== "object") return [];
  const out: string[] = [];
  const record = node as Record<string, unknown>;
  const required = record.required;
  if (Array.isArray(required)) {
    const declared =
      record.properties !== null && typeof record.properties === "object" && !Array.isArray(record.properties)
        ? (record.properties as Record<string, unknown>)
        : {};
    for (const key of required) {
      if (typeof key === "string" && !(key in declared)) {
        out.push(`${path}.required names "${key}" which is not in properties`);
      }
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [name, schema] of Object.entries(value as Record<string, unknown>)) {
        out.push(...requiredNotInProperties(schema, `${path}.properties.${name}`));
      }
    } else if (key !== "description" && key !== "title" && key !== "default" && key !== "examples") {
      out.push(...requiredNotInProperties(value, `${path}.${key}`));
    }
  }
  return out;
}

interface OfficialDefinition {
  name: string;
  description: string;
  parameters: unknown;
  output?: { schema?: unknown; render?: unknown };
  execute(args: unknown): Promise<unknown>;
}

/** 官方 register 门镜像（dsh-tools register：output 闸 + schema 子集断言）。 */
function officialRegistry() {
  const registered: OfficialDefinition[] = [];
  return {
    registered,
    register(def: OfficialDefinition) {
      const output = def.output;
      if (
        output === undefined ||
        typeof output !== "object" ||
        typeof output.render !== "function"
      ) {
        throw new TypeError(`tool "${def.name}" must declare output { schema, render }`);
      }
      const violations = [...unsupportedKeywords(output.schema), ...requiredNotInProperties(output.schema)];
      if (violations.length > 0) {
        throw new Error(`tool "${def.name}" output.schema outside supported subset: ${violations.join("; ")}`);
      }
      registered.push(def);
    },
  };
}

// ---------------------------------------------------------------------------
// 夹具：临时 user root + 真 ExpertsRegistry
// ---------------------------------------------------------------------------

let dir: string;
let userRoot: string;
let registry: ExpertsRegistry;

beforeEach(() => {
  dir = join(tmpdir(), `expert-squad-tools-${Date.now()}-${Math.random()}`);
  userRoot = join(dir, "experts-user");
  mkdirSync(userRoot, { recursive: true });
  registry = new ExpertsRegistry({ roots: () => [{ origin: "user", dir: userRoot }], workspace: dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function refresh(): Promise<void> {
  await registry.refresh();
}

function makeTools(): Record<string, ExpertToolDefinition> {
  const tools = createExpertTools({ registry, userRoot: () => userRoot });
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}

const RECRUIT_ARGS = {
  name: "code-reviewer",
  title: "资深评审",
  description: "Runs code review on diffs and files.",
  tools: ["read", "grep"],
  skills: ["review"],
  target: "user",
  personaMd: "## 职责\nreview code\n",
};

// ---------------------------------------------------------------------------

describe("official dsh-tools register gate mirror", () => {
  it("8 工具带 output { schema, render } 通过官方 register 门镜像", () => {
    const official = officialRegistry();
    expect(() => registerExpertTools(official, { registry, userRoot: () => userRoot })).not.toThrow();
    expect(official.registered.map((d) => d.name).sort()).toEqual([...EXPERT_TOOLS].sort());
    expect([...EXPERT_TOOLS].sort()).toEqual([
      "disable_expert",
      "enable_expert",
      "list_experts",
      "list_skills",
      "list_tools",
      "recruit_expert",
      "rename_expert",
      "update_expert",
    ]);
  });

  it("parameters 也落在受支持子集内（无 $schema/minLength/anyOf/type 数组）", () => {
    const official = officialRegistry();
    registerExpertTools(official, { registry, userRoot: () => userRoot });
    for (const def of official.registered) {
      expect([...unsupportedKeywords(def.parameters), ...requiredNotInProperties(def.parameters)], `tool ${def.name}`).toEqual([]);
    }
  });

  it("每工具 render 是纯投影：返回 text 内容块", async () => {
    await refresh();
    const tools = makeTools();
    for (const def of Object.values(tools)) {
      expect(typeof def.output.render).toBe("function");
      const sample =
        def.name === "list_experts"
          ? { experts: [] }
          : def.name === "list_tools"
            ? { tools: [] }
            : def.name === "list_skills"
              ? { skills: [] }
              : def.name === "rename_expert"
                ? { name: "x", path: "p" }
                : { name: "x", path: "p", enabled: true };
      const blocks = def.output.render({}, sample);
      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0].type).toBe("text");
      expect(typeof blocks[0].text).toBe("string");
    }
  });
});

describe("recruit_expert — 写路径经 frontmatter 校验", () => {
  it("合法建档：写盘 + 刷新后 list 可见", async () => {
    await refresh();
    const tools = makeTools();
    const result = (await tools.recruit_expert!.execute(RECRUIT_ARGS)) as { name: string; path: string };
    expect(result.name).toBe("code-reviewer");
    const file = join(userRoot, "code-reviewer.md");
    expect(existsSync(file)).toBe(true);
    await refresh();
    expect(registry.list({ includeDisabled: true }).map((e) => e.name)).toContain("code-reviewer");
    expect(registry.get("code-reviewer").title).toBe("资深评审");
  });

  it("撞名（同名档案已存在）→ fail-loud", async () => {
    await refresh();
    const tools = makeTools();
    await tools.recruit_expert!.execute(RECRUIT_ARGS);
    await expect(tools.recruit_expert!.execute(RECRUIT_ARGS)).rejects.toThrow(/already exists/);
  });

  it("人设含裸 {{ → 校验拒绝", async () => {
    await refresh();
    const tools = makeTools();
    await expect(
      tools.recruit_expert!.execute({ ...RECRUIT_ARGS, name: "bad-one", personaMd: "use {{user}} here" }),
    ).rejects.toThrow();
    expect(existsSync(join(userRoot, "bad-one.md"))).toBe(false);
  });

  it("非法键名（非英文键）→ fail-loud", async () => {
    await refresh();
    const tools = makeTools();
    await expect(tools.recruit_expert!.execute({ ...RECRUIT_ARGS, name: "bad name!" })).rejects.toThrow(ExpertToolError);
  });

  // 归属层询问裁决（用户 2026-10-31）：target 必填——缺席 = 参数错误（逼迫调用方先问用户）
  it("target 缺席 → 参数错误（HR 须先询问用户归属层再建档）", async () => {
    await refresh();
    const tools = makeTools();
    const { target: _omit, ...noTarget } = RECRUIT_ARGS;
    await expect(tools.recruit_expert!.execute(noTarget)).rejects.toThrow(/recruit_expert/);
    expect(existsSync(join(userRoot, "code-reviewer.md"))).toBe(false);
  });

  it("target=project：写入 projectRoot 目录（非 user 根）", async () => {
    await refresh();
    const projectDir = join(dir, "experts-project");
    mkdirSync(projectDir, { recursive: true });
    const tools = Object.fromEntries(
      createExpertTools({
        registry,
        userRoot: () => userRoot,
        projectRoot: () => projectDir,
      }).map((t) => [t.name, t]),
    );
    const result = (await tools.recruit_expert!.execute({ ...RECRUIT_ARGS, target: "project" })) as {
      path: string;
    };
    expect(result.path.startsWith(projectDir)).toBe(true);
    expect(existsSync(join(projectDir, "code-reviewer.md"))).toBe(true);
    expect(existsSync(join(userRoot, "code-reviewer.md"))).toBe(false);
  });

  it("target=project 但宿主 cwd 非项目根（projectRoot=null）→ fail-loud 引导回落 user", async () => {
    await refresh();
    const tools = Object.fromEntries(
      createExpertTools({
        registry,
        userRoot: () => userRoot,
        projectRoot: () => null,
      }).map((t) => [t.name, t]),
    );
    await expect(tools.recruit_expert!.execute({ ...RECRUIT_ARGS, target: "project" })).rejects.toThrow(
      /project layer unavailable/,
    );
    expect(existsSync(join(userRoot, "code-reviewer.md"))).toBe(false);
  });
});

// 工具级 description 双层口径（T4：描述须与 target 参数 user/project 双层语义一致，
// 包内断言防 plugin-forge 跨包测试依赖——圆桌 m5）
describe("recruit_expert — 工具级 description 双层口径", () => {
  it("描述为 target 双层口径（layer chosen by target），不再声称恒写 user root", () => {
    const desc = makeTools().recruit_expert!.description;
    expect(desc).toContain(
      "writes a validated expert .md archive into the layer chosen by target (user or project)",
    );
    expect(desc).not.toContain("into the user experts root");
  });

  it("描述含 rename_expert 迁移出路提示（key immutable + separate migration path）", () => {
    const desc = makeTools().recruit_expert!.description;
    expect(desc).toContain("immutable after creation");
    expect(desc).toContain("rename_expert offers a separate migration path");
  });
});

describe("update_expert — name 建档后不可改 + 不存在键 fail-loud", () => {
  beforeEach(async () => {
    await refresh();
    await makeTools().recruit_expert!.execute(RECRUIT_ARGS);
    await refresh();
  });

  it("改 title/description：校验通过并写盘", async () => {
    const tools = makeTools();
    const result = (await tools.update_expert!.execute({ ...RECRUIT_ARGS, title: "首席评审" })) as { name: string };
    expect(result.name).toBe("code-reviewer");
    await refresh();
    expect(registry.get("code-reviewer").title).toBe("首席评审");
  });

  it("改 name（指向不存在的新键）→ fail-loud（name 建档后不可改，改键即找不到档案）", async () => {
    const tools = makeTools();
    await expect(tools.update_expert!.execute({ ...RECRUIT_ARGS, name: "renamed" })).rejects.toThrow(/not found/);
  });

  it("不存在的键 → fail-loud", async () => {
    const tools = makeTools();
    await expect(
      tools.update_expert!.execute({ ...RECRUIT_ARGS, name: "ghost", title: "x", description: "y", tools: ["read"], personaMd: "p" }),
    ).rejects.toThrow(/not found/);
  });
});

describe("rename_expert — 同层原子迁移", () => {
  beforeEach(async () => {
    await refresh();
    await makeTools().recruit_expert!.execute(RECRUIT_ARGS);
    await refresh();
  });

  it("成功迁移：旧键文件消失、新键文件在场，frontmatter 字段原样继承且 name 同步新键", async () => {
    const tools = makeTools();
    const result = (await tools.rename_expert!.execute({ from: "code-reviewer", to: "diff-keeper" })) as {
      name: string;
      path: string;
    };
    expect(result.name).toBe("diff-keeper");
    expect(result.path).toBe(join(userRoot, "diff-keeper.md"));
    expect(existsSync(join(userRoot, "code-reviewer.md"))).toBe(false);
    expect(existsSync(join(userRoot, "diff-keeper.md"))).toBe(true);
    // registry 已 refresh：list 面新键可见、旧键消失（所见即所得）
    expect(registry.list({ includeDisabled: true }).map((e) => e.name)).toContain("diff-keeper");
    expect(registry.list({ includeDisabled: true }).map((e) => e.name)).not.toContain("code-reviewer");
    // 字段原样继承 + name 同步
    const fresh = registry.get("diff-keeper");
    expect(fresh.title).toBe("资深评审");
    expect(fresh.description).toBe("Runs code review on diffs and files.");
    expect(fresh.tools).toEqual(["read", "grep"]);
    expect(fresh.skills).toEqual(["review"]);
    expect(fresh.personaMd).toContain("review code");
  });

  it("撞名（新键已有档案）→ fail-loud 且不留半迁移产物", async () => {
    const tools = makeTools();
    await tools.recruit_expert!.execute({ ...RECRUIT_ARGS, name: "diff-keeper", title: "占位" });
    await expect(tools.rename_expert!.execute({ from: "code-reviewer", to: "diff-keeper" })).rejects.toThrow(
      /already exists/,
    );
    expect(existsSync(join(userRoot, "code-reviewer.md"))).toBe(true);
  });

  it("新键非法（EXPERT_KEY 正则）→ 参数闸 fail-loud", async () => {
    const tools = makeTools();
    await expect(tools.rename_expert!.execute({ from: "code-reviewer", to: "Bad Key!" })).rejects.toThrow(
      ExpertToolError,
    );
    expect(existsSync(join(userRoot, "code-reviewer.md"))).toBe(true);
  });

  it("旧键不存在 → fail-loud 且无新文件", async () => {
    const tools = makeTools();
    await expect(tools.rename_expert!.execute({ from: "ghost", to: "phantom" })).rejects.toThrow(/not found/);
    expect(existsSync(join(userRoot, "phantom.md"))).toBe(false);
  });

  // bug 0a295590：plugin 层走真遮蔽迁移——plugin 原档案为内容源、新键写 user 层、
  // 内置只读文件零触碰（对齐面板 update 来源保持裁决：plugin 层回落 user 层覆写）。
  it("plugin 层：新键落 user 层、plugin 原文件未动、刷新后新键遮蔽生效", async () => {
    const pluginDir = join(dir, "experts-plugin");
    mkdirSync(pluginDir, { recursive: true });
    // 清除 beforeEach 铺的 user 层同名档案——保证该键唯一定位 plugin 层
    rmSync(join(userRoot, "code-reviewer.md"));
    const pluginFile = join(pluginDir, "code-reviewer.md");
    writeFileSync(
      pluginFile,
      [
        "---",
        "name: code-reviewer",
        'title: "内置评审"',
        'description: "Built-in reviewer."',
        "tools:",
        "  - read",
        "---",
        "## 职责\nbuilt-in review\n",
      ].join("\n"),
      "utf8",
    );
    const layeredRegistry = new ExpertsRegistry({
      roots: () => [
        { origin: "plugin", dir: pluginDir },
        { origin: "user", dir: userRoot },
      ],
      workspace: dir,
    });
    await layeredRegistry.refresh();
    const tools = Object.fromEntries(
      createExpertTools({
        registry: layeredRegistry,
        userRoot: () => userRoot,
      }).map((t) => [t.name, t]),
    );
    const result = (await tools.rename_expert!.execute({ from: "code-reviewer", to: "diff-keeper" })) as {
      name: string;
      path: string;
    };
    // 新键落 user 层
    expect(result.path).toBe(join(userRoot, "diff-keeper.md"));
    expect(existsSync(join(userRoot, "diff-keeper.md"))).toBe(true);
    // plugin 层只读原文件零触碰
    expect(existsSync(pluginFile)).toBe(true);
    expect(readFileSync(pluginFile, "utf8")).toContain("name: code-reviewer");
    // 字段继承 + name 同步新键
    expect(readFileSync(join(userRoot, "diff-keeper.md"), "utf8")).toContain("name: diff-keeper");
    expect(readFileSync(join(userRoot, "diff-keeper.md"), "utf8")).toContain("built-in review");
    // 刷新后新键在场（user 层遮蔽落点生效）；plugin 旧键文件未删、仍在其层在场（遮蔽语义零删除）
    await layeredRegistry.refresh();
    const listed = layeredRegistry.list({ includeDisabled: true });
    expect(listed.find((e) => e.name === "diff-keeper")?.origin).toBe("user");
    expect(listed.find((e) => e.name === "code-reviewer")?.origin).toBe("plugin");
    rmSync(pluginDir, { recursive: true, force: true });
  });

  it("迁移恒在原归属层内：project 层档案迁入 projectRoot 落点（不落 user 层）", async () => {
    const projectDir = join(dir, "experts-project");
    mkdirSync(projectDir, { recursive: true });
    const layeredRegistry = new ExpertsRegistry({
      roots: () => [
        { origin: "project", dir: projectDir },
        { origin: "user", dir: userRoot },
      ],
      workspace: dir,
    });
    await layeredRegistry.refresh();
    const tools = Object.fromEntries(
      createExpertTools({
        registry: layeredRegistry,
        userRoot: () => userRoot,
        projectRoot: () => projectDir,
      }).map((t) => [t.name, t]),
    );
    await tools.recruit_expert!.execute({ ...RECRUIT_ARGS, target: "project" });
    await layeredRegistry.refresh();
    const result = (await tools.rename_expert!.execute({ from: "code-reviewer", to: "diff-keeper" })) as {
      path: string;
    };
    expect(result.path.startsWith(projectDir)).toBe(true);
    expect(existsSync(join(projectDir, "code-reviewer.md"))).toBe(false);
    expect(existsSync(join(projectDir, "diff-keeper.md"))).toBe(true);
    expect(existsSync(join(userRoot, "diff-keeper.md"))).toBe(false);
    await layeredRegistry.refresh();
    const listed = layeredRegistry.list({ includeDisabled: true });
    expect(listed.find((e) => e.name === "diff-keeper")?.origin).toBe("project");
  });
});

describe("enable_expert / disable_expert / list_experts", () => {
  beforeEach(async () => {
    await refresh();
    await makeTools().recruit_expert!.execute(RECRUIT_ARGS);
    await refresh();
  });

  it("disable → list_experts 不含该项；enable 恢复可见（render 带 title+description）", async () => {
    const tools = makeTools();
    const listed0 = (await tools.list_experts!.execute({})) as {
      experts: { name: string; title: string; description: string }[];
    };
    expect(listed0.experts.find((e) => e.name === "code-reviewer")).toBeTruthy();
    await tools.disable_expert!.execute({ name: "code-reviewer" });
    expect(registry.list().map((e) => e.name)).not.toContain("code-reviewer");
    const listed = (await tools.list_experts!.execute({})) as { experts: { name: string }[] };
    expect(listed.experts.map((e) => e.name)).not.toContain("code-reviewer");
    await tools.enable_expert!.execute({ name: "code-reviewer" });
    expect(registry.list().map((e) => e.name)).toContain("code-reviewer");
    // render 投影：一行一专家，name — title：description（人岗匹配零二次查询）
    const blocks = tools.list_experts!.output.render({}, listed0);
    const rendered = (blocks[0] as { text: string }).text;
    expect(rendered).toContain("- code-reviewer — 资深评审：");
  });

  it("不存在键 disable/enable → fail-loud", async () => {
    const tools = makeTools();
    await expect(tools.disable_expert!.execute({ name: "ghost" })).rejects.toThrow(/not found/);
    await expect(tools.enable_expert!.execute({ name: "ghost" })).rejects.toThrow(/not found/);
  });
});

describe("list_tools / list_skills — 白名单键名取数面", () => {
  const SCHEMAS = [
    { name: "recruit_expert", description: "Recruit a new expert." },
    { name: "read", description: "Read a file." },
  ];

  it("list_tools 经注入 schemas face 现查返回 name+description（含 expert 管理工具自身）", async () => {
    let calls = 0;
    const tools = Object.fromEntries(
      createExpertTools({
        registry,
        userRoot: () => userRoot,
        toolsSchemas: () => {
          calls++;
          return SCHEMAS;
        },
      }).map((t) => [t.name, t]),
    );
    const result = (await tools.list_tools!.execute({})) as {
      tools: { name: string; description: string; source: string }[];
    };
    expect(result.tools).toEqual(
      SCHEMAS.map((s) => ({ name: s.name, description: s.description, source: "global" })),
    );
    // 每次调用现查（不 memoize）
    await tools.list_tools!.execute({});
    expect(calls).toBe(2);
    const rendered = (tools.list_tools!.output.render({}, result)[0] as { text: string }).text;
    expect(rendered).toContain("- recruit_expert — Recruit a new expert.");
  });

  it("list_tools 取数面缺席 → fail-soft {tools:[]} 且 render 注记", async () => {
    const tools = Object.fromEntries(
      createExpertTools({ registry, userRoot: () => userRoot, toolsSchemas: () => undefined }).map((t) => [
        t.name,
        t,
      ]),
    );
    const result = (await tools.list_tools!.execute({})) as { tools: unknown[]; note?: string };
    expect(result.tools).toEqual([]);
    const rendered = (tools.list_tools!.output.render({}, result)[0] as { text: string }).text;
    expect(rendered).toContain("absent");
  });

  it("list_skills 在场：经 skills face list({cwd}) 求值（调用点现查）", async () => {
    const listed: { cwd: string }[] = [];
    const face = {
      list: async (opts: { cwd: string }) => {
        listed.push(opts);
        return [{ name: "review", description: "Review skill." }];
      },
    };
    const tools = Object.fromEntries(
      createExpertTools({
        registry,
        userRoot: () => userRoot,
        skills: () => face,
      }).map((t) => [t.name, t]),
    );
    const result = (await tools.list_skills!.execute({})) as {
      skills: { name: string; description: string }[];
    };
    expect(result.skills).toEqual([{ name: "review", description: "Review skill.", source: "global" }]);
    expect(listed).toEqual([{ cwd: process.cwd() }]);
  });

  it("list_skills 缺席 → fail-soft {skills:[]} 且返回文本注明服务缺席，不抛错", async () => {
    const tools = Object.fromEntries(
      createExpertTools({ registry, userRoot: () => userRoot, skills: () => undefined }).map((t) => [
        t.name,
        t,
      ]),
    );
    const result = (await tools.list_skills!.execute({})) as { skills: unknown[]; note?: string };
    expect(result.skills).toEqual([]);
    const rendered = (tools.list_skills!.output.render({}, result)[0] as { text: string }).text;
    expect(rendered).toContain("absent");
  });

  it("list_skills 调用异常 → fail-soft {skills:[]} 注记 unavailable", async () => {
    const tools = Object.fromEntries(
      createExpertTools({
        registry,
        userRoot: () => userRoot,
        skills: () => ({
          list: async () => {
            throw new Error("boom");
          },
        }),
      }).map((t) => [t.name, t]),
    );
    const result = (await tools.list_skills!.execute({})) as { skills: unknown[]; note?: string };
    expect(result.skills).toEqual([]);
    expect(result.note).toContain("unavailable");
  });
});

// ---------------------------------------------------------------------------
// list_tools / list_skills 全模式并集（bug 6337a936）：全局视图 + 逐 preset scope
// 视图并集去重；agentPresets 租约 try/finally dispose；缺席/形状不符降级注明。
// ---------------------------------------------------------------------------

/** agentPresets face 伪造（bug 66e1bd5d 同步官方租约形状：`{key} & AsyncDisposable`，
 *  仅 Symbol.asyncDispose、无 dispose()——记录租约 key 与 asyncDispose 释放次数）。 */
const keyOf = (id: string): object => ({ preset: id });
function makePresetFace(ids: string[], opts?: { releaseThrows?: (id: string) => boolean }) {
  const events: { acquired: object[]; disposed: object[] } = { acquired: [], disposed: [] };
  const keys = Object.fromEntries(ids.map((id) => [id, keyOf(id)]));
  return {
    events,
    keys,
    face: {
      list: async () => ids.map((id) => ({ id })),
      acquireScope: async (id?: string) => {
        const presetId = id ?? "default";
        const key = keys[presetId] ?? keyOf(presetId);
        events.acquired.push(key);
        return {
          key,
          [Symbol.asyncDispose]: async () => {
            if (opts?.releaseThrows?.(presetId) === true) throw new Error("release boom");
            events.disposed.push(key);
          },
        };
      },
    },
  };
}

describe("list_tools / list_skills — 全模式并集视图（bug 6337a936）", () => {
  it("list_tools 并集 = 全局视图 + 逐 preset scope 视图，按 name 去重（description 取先见者），租约用后 dispose", async () => {
    const presets = makePresetFace(["hr", "dev"]);
    const calls: (string | undefined)[] = [];
    const tools = Object.fromEntries(
      createExpertTools({
        registry,
        userRoot: () => userRoot,
        toolsSchemas: (scope?: object) => {
          calls.push(scope);
          if (scope === undefined) return [{ name: "read", description: "global read" }];
          if (scope === presets.keys.hr)
            return [{ name: "read", description: "hr read" }, { name: "summon", description: "hr summon" }];
          return [{ name: "shell", description: "dev shell" }];
        },
        agentPresets: () => presets.face,
      }).map((t) => [t.name, t]),
    );
    const result = (await tools.list_tools!.execute({})) as {
      tools: { name: string; description: string }[];
      note?: string;
    };
    // 并集去重：read 取全局（先见者）；hr 独有 summon、dev 独有 shell 均并入
    expect(result.tools).toEqual([
      { name: "read", description: "global read", source: "global" },
      { name: "summon", description: "hr summon", source: "hr" },
      { name: "shell", description: "dev shell", source: "dev" },
    ]);
    expect(result.note).toBeUndefined();
    // 每 preset 各取一次 scope 租约（schemas 携 scope key 现查）
    expect(calls).toEqual([undefined, presets.keys.hr, presets.keys.dev]);
    // 租约用后 dispose（try/finally）
    expect(presets.events.disposed).toEqual([presets.keys.hr, presets.keys.dev]);
  });

  it("list_tools：scope 视图读取抛错不外溢，租约仍 dispose，结果降级为已得并集 + note", async () => {
    const presets = makePresetFace(["broken"]);
    const tools = Object.fromEntries(
      createExpertTools({
        registry,
        userRoot: () => userRoot,
        toolsSchemas: (scope?: object) => {
          if (scope !== undefined) throw new Error("boom");
          return [{ name: "read", description: "global read" }];
        },
        agentPresets: () => presets.face,
      }).map((t) => [t.name, t]),
    );
    const result = (await tools.list_tools!.execute({})) as {
      tools: { name: string }[];
      note?: string;
    };
    expect(result.tools).toEqual([{ name: "read", description: "global read", source: "global" }]);
    expect(result.note).toContain("broken");
    expect(presets.events.disposed).toEqual([presets.keys.broken]);
  });

  it("list_skills 并集 = 全局层 + 逐 preset scope 层（skills.list 携 cwd+scope），租约用后 dispose", async () => {
    const presets = makePresetFace(["hr"]);
    const calls: { cwd: string; scope?: string }[] = [];
    const tools = Object.fromEntries(
      createExpertTools({
        registry,
        userRoot: () => userRoot,
        skills: () => ({
          list: async (opts: { cwd: string; scope?: object }) => {
            calls.push(opts);
            if (opts.scope === undefined) return [{ name: "review", description: "global review" }];
            return [{ name: "review", description: "hr review" }, { name: "roundtable", description: "hr roundtable" }];
          },
        }),
        agentPresets: () => presets.face,
      }).map((t) => [t.name, t]),
    );
    const result = (await tools.list_skills!.execute({})) as {
      skills: { name: string; description: string }[];
      note?: string;
    };
    expect(result.skills).toEqual([
      { name: "review", description: "global review", source: "global" },
      { name: "roundtable", description: "hr roundtable", source: "hr" },
    ]);
    expect(result.note).toBeUndefined();
    expect(calls).toEqual([
      { cwd: process.cwd() },
      { cwd: process.cwd(), scope: presets.keys.hr },
    ]);
    expect(presets.events.disposed).toEqual([presets.keys.hr]);
  });

  it("agentPresets 缺席 → 降级仅全局视图 + note 注明（list_tools 与 list_skills 同径），不抛错", async () => {
    const skillCalls: unknown[] = [];
    const tools = Object.fromEntries(
      createExpertTools({
        registry,
        userRoot: () => userRoot,
        toolsSchemas: () => [{ name: "read", description: "global read" }],
        skills: () => ({
          list: async (opts: unknown) => {
            skillCalls.push(opts);
            return [{ name: "review", description: "global review" }];
          },
        }),
      }).map((t) => [t.name, t]),
    );
    const toolsResult = (await tools.list_tools!.execute({})) as { tools: { name: string; description?: string }[]; note?: string };
    expect(toolsResult.tools).toEqual([{ name: "read", description: "global read", source: "global" }]);
    expect(toolsResult.note).toContain("agentPresets");
    const skillsResult = (await tools.list_skills!.execute({})) as { skills: { name: string }[]; note?: string };
    expect(skillsResult.skills).toEqual([{ name: "review", description: "global review", source: "global" }]);
    expect(skillsResult.note).toContain("agentPresets");
    expect(skillCalls).toEqual([{ cwd: process.cwd() }]);
    const rendered = (tools.list_tools!.output.render({}, toolsResult)[0] as { text: string }).text;
    expect(rendered).toContain("agentPresets");
  });

  it("agentPresets 形状不符（list/acquireScope 非函数）→ 同缺席降级", async () => {
    const tools = Object.fromEntries(
      createExpertTools({
        registry,
        userRoot: () => userRoot,
        toolsSchemas: () => [{ name: "read", description: "global read" }],
        agentPresets: () => ({ list: "not-a-function", acquireScope: () => {} }) as never,
      }).map((t) => [t.name, t]),
    );
    const result = (await tools.list_tools!.execute({})) as { tools: { name: string; description?: string }[]; note?: string };
    expect(result.tools).toEqual([{ name: "read", description: "global read", source: "global" }]);
    expect(result.note).toContain("agentPresets");
  });

  it("bug 66e1bd5d: asyncDispose 抛错不影响并集——释放失败记 note，不外溢不掩盖取数结果", async () => {
    const presets = makePresetFace(["hr", "dev"], { releaseThrows: (id) => id === "hr" });
    const tools = Object.fromEntries(
      createExpertTools({
        registry,
        userRoot: () => userRoot,
        toolsSchemas: (scope?: object) => {
          if (scope === undefined) return [{ name: "read", description: "global read" }];
          if (scope === presets.keys.hr) return [{ name: "summon", description: "hr summon" }];
          return [{ name: "shell", description: "dev shell" }];
        },
        agentPresets: () => presets.face,
      }).map((t) => [t.name, t]),
    );
    const result = (await tools.list_tools!.execute({})) as {
      tools: { name: string; description: string }[];
      note?: string;
    };
    // hr 释放抛错不影响其取数结果——并集完整
    expect(result.tools).toEqual([
      { name: "read", description: "global read", source: "global" },
      { name: "summon", description: "hr summon", source: "hr" },
      { name: "shell", description: "dev shell", source: "dev" },
    ]);
    // 释放失败记 note（点名 hr），dev 正常释放不记
    expect(result.note).toContain("release failed");
    expect(result.note).toContain("hr");
    expect(presets.events.disposed).toEqual([presets.keys.dev]);
  });
  it("并集条目透出条目级来源（bug c19eb719）：global 层 = 'global'、preset 层 = preset id；同名先见者保留来源", async () => {
    const presets = makePresetFace(["hr", "dev"]);
    const tools = Object.fromEntries(
      createExpertTools({
        registry,
        userRoot: () => userRoot,
        toolsSchemas: (scope?: object) =>
          scope === undefined
            ? [{ name: "read" }]
            : scope === presets.keys.hr
              ? [{ name: "read" }, { name: "summon" }]
              : [{ name: "shell" }, { name: "read" }],
        agentPresets: () => presets.face,
      }).map((t) => [t.name, t]),
    );
    const result = (await tools.list_tools!.execute({})) as {
      tools: { name: string; source: string }[];
    };
    expect(result.tools).toEqual([
      { name: "read", description: "", source: "global" }, // 同名先见者（global）保留来源
      { name: "summon", description: "", source: "hr" },
      { name: "shell", description: "", source: "dev" },
    ]);
  });

  it("EXCLUDED_EXPERT_TOOL_NAMES 排除集（bug c19eb719 最终口径）：7 枚管理/取数工具；list_experts/delegate_expert 保留", () => {
    expect([...EXCLUDED_EXPERT_TOOL_NAMES].sort()).toEqual([
      "disable_expert",
      "enable_expert",
      "list_skills",
      "list_tools",
      "recruit_expert",
      "rename_expert",
      "update_expert",
    ]);
    expect(EXCLUDED_EXPERT_TOOL_NAMES).not.toContain("list_experts");
    expect(EXCLUDED_EXPERT_TOOL_NAMES).not.toContain("delegate_expert");
  });
});

// ---------------------------------------------------------------------------
// createKnownToolsProbe：delegate_expert 白名单求交探针（bug e3b045dc）——
// 无参 schemas() 是 ScopedLayers global 单层投影（官方工具装在 preset scope 层，
// 恰好只剩 expert 域 10 枚）→ 探针改接全模式并集面（bug 6337a936 同径）。
// ---------------------------------------------------------------------------

describe("createKnownToolsProbe — 白名单求交探针接全模式并集（bug e3b045dc）", () => {
  it("探针返回跨 preset 并集：global 层（仅 expert 域工具）∪ preset scope 层（read/write 等官方工具），含金丝雀 read", async () => {
    const presets = makePresetFace(["expedition"]);
    const probe = createKnownToolsProbe(
      (scope?: object) => {
        if (scope === undefined)
          return [{ name: "delegate_expert" }, { name: "list_tools" }]; // global 层投影（实测形态）
        return [{ name: "read" }, { name: "write" }, { name: "edit" }, { name: "pwsh" }];
      },
      () => presets.face,
    );
    const known = await probe();
    expect(known).toEqual(["delegate_expert", "list_tools", "read", "write", "edit", "pwsh"]);
    // 租约用后 dispose（不泄漏 preset scope 租约）
    expect(presets.events.disposed).toEqual([presets.keys.expedition]);
  });

  it("agentPresets 缺席 → fail-soft 降级仅 global 层名（金丝雀防护兜底路径）", async () => {
    const probe = createKnownToolsProbe(
      () => [{ name: "delegate_expert" }],
      () => undefined,
    );
    const known = await probe();
    expect(known).toEqual(["delegate_expert"]);
  });

  it("schemas 面缺席且 agentPresets 缺席 → 空数组（compose 侧空集 = 不裁剪）", async () => {
    const probe = createKnownToolsProbe(() => undefined, () => undefined);
    expect(await probe()).toEqual([]);
  });

  it("消费点现查禁 memoize：每次调用重新取数（preset 装配换代后探针跟随）", async () => {
    let globalView: readonly { name: string }[] = [{ name: "read" }];
    const probe = createKnownToolsProbe(() => globalView, () => undefined);
    expect(await probe()).toEqual(["read"]);
    globalView = [{ name: "read" }, { name: "bash" }];
    expect(await probe()).toEqual(["read", "bash"]);
  });
});
