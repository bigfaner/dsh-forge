// 管理 tool 面测试（tech-design §7 tool 面 / AC）：结构镜像对照官方
// dsh-tools register 门（output {schema, render} 强制 + 受支持 JSON Schema
// 子集白名单），加行为面（recruit/update 写路径经 frontmatter 校验 fail-loud、
// 启停工作区隔离语义经真 ExpertsRegistry + 临时目录）。

import { mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EXPERT_TOOLS,
  ExpertToolError,
  createExpertTools,
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
  personaMd: "## 职责\nreview code\n",
};

// ---------------------------------------------------------------------------

describe("official dsh-tools register gate mirror", () => {
  it("5 工具带 output { schema, render } 通过官方 register 门镜像", () => {
    const official = officialRegistry();
    expect(() => registerExpertTools(official, { registry, userRoot: () => userRoot })).not.toThrow();
    expect(official.registered.map((d) => d.name).sort()).toEqual([...EXPERT_TOOLS].sort());
    expect([...EXPERT_TOOLS].sort()).toEqual([
      "disable_expert",
      "enable_expert",
      "list_experts",
      "recruit_expert",
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
      const sample = def.name === "list_experts" ? { experts: [] } : { name: "x", path: "p", enabled: true };
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

describe("enable_expert / disable_expert / list_experts", () => {
  beforeEach(async () => {
    await refresh();
    await makeTools().recruit_expert!.execute(RECRUIT_ARGS);
    await refresh();
  });

  it("disable → 默认列表隐藏、includeDisabled 可见 enabled=false；enable 恢复", async () => {
    const tools = makeTools();
    await tools.disable_expert!.execute({ name: "code-reviewer" });
    expect(registry.list().map((e) => e.name)).not.toContain("code-reviewer");
    const listed = (await tools.list_experts!.execute({ includeDisabled: true })) as {
      experts: { name: string; enabled: boolean }[];
    };
    expect(listed.experts.find((e) => e.name === "code-reviewer")?.enabled).toBe(false);
    await tools.enable_expert!.execute({ name: "code-reviewer" });
    expect(registry.list().map((e) => e.name)).toContain("code-reviewer");
  });

  it("不存在键 disable/enable → fail-loud", async () => {
    const tools = makeTools();
    await expect(tools.disable_expert!.execute({ name: "ghost" })).rejects.toThrow(/not found/);
    await expect(tools.enable_expert!.execute({ name: "ghost" })).rejects.toThrow(/not found/);
  });
});
