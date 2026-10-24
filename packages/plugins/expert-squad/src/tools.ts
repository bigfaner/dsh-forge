// 管理 tool 面（tech-design §7 tool 面 / D1 全局注册）：4 管理 + list 取用，
// 动词+名词命名。每工具声明 output { schema, render }（官方 dsh-tools register
// 门强制，annotutor tools.ts 先例）；参数/结果 zod schema 经受支持子集净化——
// 裸 zod 产物带 $schema/minLength/anyOf/type 数组等子集外关键字会被官方 register
// 门拒绝；净化只放宽模型面形状描述，处理器内校验仍是唯一强制闸。
// 写路径（recruit/update）经 store/frontmatter 校验（parseExpertFile /
// validateExpertUpdate）：必填字段、禁裸 {{、name 建档后不可改、撞名 fail-loud。

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import type { ExpertsRegistry } from "./registry.js";
import { parseExpertFile, validateExpertUpdate } from "./store/frontmatter.js";

// ---------------------------------------------------------------------------
// faces（官方 dsh-tools ToolDefinition 消费字段子面——md-mermaid faces.ts 同法）
// ---------------------------------------------------------------------------

/** 官方 ContentBlock 的文本块子面（output.render 产物）。 */
export interface TextContentBlock {
  readonly type: "text";
  readonly text: string;
}

/** 官方 register 门消费的 tool 定义子面。 */
export interface ExpertToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: unknown;
  readonly output: {
    readonly schema: unknown;
    render(args: unknown, value: unknown): readonly TextContentBlock[];
  };
  execute(args: unknown, exec?: unknown): Promise<unknown>;
}

/** dsh tools 服务子面（官方 ToolRuntime.register——全局注册即用，D1）。 */
export interface ToolRegisterFace {
  register(definition: ExpertToolDefinition): unknown;
}

// ---------------------------------------------------------------------------
// typed error（fail-loud——非法输入一律 ExpertToolError，消息含键名/路径）
// ---------------------------------------------------------------------------

export class ExpertToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpertToolError";
  }
}

// ---------------------------------------------------------------------------
// 参数/结果 zod schemas（处理器内强制闸 + schema 声明单源）
// ---------------------------------------------------------------------------

/** 英文键正本（建档后不可改的档案键——文件名同键）。 */
const EXPERT_KEY = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "expert key must be a lowercase english key (a-z, 0-9, -)");

const recruitParams = z.object({
  name: EXPERT_KEY.describe("Expert key (lowercase english, unique, immutable after creation)"),
  title: z.string().min(1).describe("Short title shown in selection UI"),
  description: z.string().min(1).describe("What this expert does (selection basis, <=120 chars advised)"),
  tools: z.array(z.string()).min(1).describe("Tool whitelist keys mapped to toolFilter at dispatch"),
  skills: z.array(z.string()).optional().describe("Optional skill tags"),
  model: z.string().optional().describe("Optional dispatch model preference"),
  personaMd: z
    .string()
    .min(1)
    .describe("Persona markdown body (sections like 职责/边界/信条); bare {{ is not allowed"),
});

const updateParams = recruitParams; // 同形：name 即建档键（改键即找不到档案——不可改）

const enableParams = z.object({
  name: z.string().min(1).describe("Existing expert key to enable"),
});

const disableParams = z.object({
  name: z.string().min(1).describe("Existing expert key to disable"),
});

const listParams = z.object({
  includeDisabled: z.boolean().optional().describe("Include disabled experts (default: enabled only)"),
});

const recruitResult = z.object({
  name: z.string(),
  path: z.string(),
});

const updateResult = z.object({
  name: z.string(),
  path: z.string(),
});

const enableResult = z.object({
  name: z.string(),
  enabled: z.literal(true),
});

const disableResult = z.object({
  name: z.string(),
  enabled: z.literal(false),
});

const listResult = z.object({
  experts: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      description: z.string(),
      tools: z.array(z.string()),
      skills: z.array(z.string()),
      origin: z.string(),
      enabled: z.boolean(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// zod → 受支持 JSON Schema 子集净化（annotutor tools.ts 先例）
// ---------------------------------------------------------------------------

/** 受支持子集约束关键字（官方 dsh-tools assertSupportedJsonSchema 白名单面）。 */
const CONSTRAINT_KEYS = new Set([
  "type",
  "oneOf",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
]);
/** 受支持子集注解关键字——值须原样保留（任意 JSON 数据，不按 schema 走）。 */
const ANNOTATION_KEYS = new Set(["description", "title", "default", "examples"]);

function toSupportedJsonSchema(node: unknown): unknown {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(toSupportedJsonSchema);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (ANNOTATION_KEYS.has(key)) {
      out[key] = value;
      continue;
    }
    if (key === "properties") {
      out.properties = sanitizeProperties(value);
      continue;
    }
    if (key === "type" && Array.isArray(value)) {
      // zod 可空标量发 type 数组；子集只收单 type 或 oneOf——转 oneOf 分支
      const types = value.filter((t): t is string => typeof t === "string");
      if (types.length >= 2) out.oneOf = types.map((t) => ({ type: t }));
      else if (types.length === 1) out.type = types[0];
      continue;
    }
    if (key === "anyOf") {
      const branches = (Array.isArray(value) ? value : []).map(toSupportedJsonSchema);
      if (branches.length >= 2) out.oneOf = branches;
      else Object.assign(out, branches[0] ?? {});
      continue;
    }
    if (!CONSTRAINT_KEYS.has(key)) continue;
    out[key] = toSupportedJsonSchema(value);
  }
  return out;
}

function sanitizeProperties(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(value)) {
    const clean = toSupportedJsonSchema(schema);
    if (clean !== null && typeof clean === "object") out[name] = clean;
  }
  return out;
}

/** zod → 官方 register 门受支持子集 JSON Schema（工具面共用净化单点）。 */
export function zToJSONSchema(schema: z.ZodType, io: "input" | "output"): unknown {
  return toSupportedJsonSchema(z.toJSONSchema(schema, { io }));
}

// ---------------------------------------------------------------------------
// 档案序列化（写路径——写盘前经 frontmatter 校验，校验不过不落盘）
// ---------------------------------------------------------------------------

interface ArchiveFields {
  name: string;
  title: string;
  description: string;
  tools: string[];
  skills?: string[];
  model?: string;
}

function serializeExpertMd(fields: ArchiveFields, personaMd: string): string {
  const data: Record<string, unknown> = {
    name: fields.name,
    title: fields.title,
    description: fields.description,
    tools: fields.tools,
  };
  if (fields.skills !== undefined) data.skills = fields.skills;
  if (fields.model !== undefined) data.model = fields.model;
  return matter.stringify(personaMd, data);
}

// ---------------------------------------------------------------------------
// 5 工具（全局注册即用——D1）
// ---------------------------------------------------------------------------

export const EXPERT_TOOLS = [
  "recruit_expert",
  "update_expert",
  "enable_expert",
  "disable_expert",
  "list_experts",
] as const;

export type ExpertToolName = (typeof EXPERT_TOOLS)[number];

export interface ExpertToolsDeps {
  /** 取用 API（服务键 experts 的 registry 实例）。 */
  readonly registry: ExpertsRegistry;
  /** 可写 user 层专家目录（recruit/update 落盘点；返回绝对路径）。 */
  readonly userRoot: () => string;
}

const text = (t: string): TextContentBlock => ({ type: "text", text: t });

/** zod parse 统一归一 ExpertToolError（fail-loud——错误消息含 zod 具体原因）。 */
function parseArgs<T extends z.ZodType>(tool: string, schema: T, args: unknown): z.output<T> {
  const r = schema.safeParse(args);
  if (!r.success) {
    throw new ExpertToolError(
      `${tool}: invalid arguments — ${r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`,
    );
  }
  return r.data;
}

/** 工厂：5 枚管理 tool 定义（不注册——注册走 registerExpertTools）。 */
export function createExpertTools(deps: ExpertToolsDeps): ExpertToolDefinition[] {
  const { registry, userRoot } = deps;

  const recruitTool: ExpertToolDefinition = {
    name: "recruit_expert",
    description:
      "Recruit (create) a new expert profile: writes a validated expert .md archive into the user experts root. The key must be a lowercase english key and is immutable after creation; the persona body must not contain bare {{.",
    parameters: zToJSONSchema(recruitParams, "input"),
    output: {
      schema: zToJSONSchema(recruitResult, "output"),
      render: (_args, value) => [
        text(`expert recruited: ${(value as { name: string }).name} (${(value as { path: string }).path})`),
      ],
    },
    async execute(args) {
      const p = parseArgs("recruit_expert", recruitParams, args);
      const file = join(userRoot(), `${p.name}.md`);
      if (existsSync(file)) {
        throw new ExpertToolError(
          `recruit_expert: expert already exists: ${p.name} (${file}) — use update_expert to modify`,
        );
      }
      // 写路径前置校验：序列化产物经 frontmatter 全量校验（必填/裸 {{ /字段形状），
      // 不过即 fail-loud 且不落盘。
      const content = serializeExpertMd(p, p.personaMd);
      const verdict = parseExpertFile(file, content);
      if (!verdict.ok) throw new ExpertToolError(`recruit_expert: ${verdict.reason}`);
      writeFileSync(file, content, "utf8");
      return recruitResult.parse({ name: p.name, path: file });
    },
  };

  const updateTool: ExpertToolDefinition = {
    name: "update_expert",
    description:
      "Update an existing expert profile in the user experts root. The expert key cannot be renamed after creation; content is re-validated by the same frontmatter gate (required fields, no bare {{).",
    parameters: zToJSONSchema(updateParams, "input"),
    output: {
      schema: zToJSONSchema(updateResult, "output"),
      render: (_args, value) => [
        text(`expert updated: ${(value as { name: string }).name} (${(value as { path: string }).path})`),
      ],
    },
    async execute(args) {
      const p = parseArgs("update_expert", updateParams, args);
      const file = join(userRoot(), `${p.name}.md`);
      if (!existsSync(file)) {
        throw new ExpertToolError(
          `update_expert: expert not found: ${p.name} (${file}) — only user-layer experts are writable; use recruit_expert to create`,
        );
      }
      const existing = readExistingName(file);
      const content = serializeExpertMd(p, p.personaMd);
      // 注册期 update 校验：内容照常校验 + name 不可改约束（错误含旧键/新键/路径）。
      const verdict = validateExpertUpdate(existing, file, content);
      if (!verdict.ok) throw new ExpertToolError(`update_expert: ${verdict.reason}`);
      writeFileSync(file, content, "utf8");
      return updateResult.parse({ name: p.name, path: file });
    },
  };

  const enableTool: ExpertToolDefinition = {
    name: "enable_expert",
    description:
      "Enable a previously disabled expert (workspace-scoped). Fails loudly if the key does not exist.",
    parameters: zToJSONSchema(enableParams, "input"),
    output: {
      schema: zToJSONSchema(enableResult, "output"),
      render: (_args, value) => [text(`expert enabled: ${(value as { name: string }).name}`)],
    },
    async execute(args) {
      const p = parseArgs("enable_expert", enableParams, args);
      await registry.setEnabled(p.name, true);
      return enableResult.parse({ name: p.name, enabled: true });
    },
  };

  const disableTool: ExpertToolDefinition = {
    name: "disable_expert",
    description:
      "Disable an expert (workspace-scoped): hidden from default list and rejected at dispatch. Fails loudly if the key does not exist.",
    parameters: zToJSONSchema(disableParams, "input"),
    output: {
      schema: zToJSONSchema(disableResult, "output"),
      render: (_args, value) => [text(`expert disabled: ${(value as { name: string }).name}`)],
    },
    async execute(args) {
      const p = parseArgs("disable_expert", disableParams, args);
      await registry.setEnabled(p.name, false);
      return disableResult.parse({ name: p.name, enabled: false });
    },
  };

  const listTool: ExpertToolDefinition = {
    name: "list_experts",
    description:
      "List available experts with selection fields (title/description/tools) and enabled state; disabled experts are hidden unless includeDisabled is set.",
    parameters: zToJSONSchema(listParams, "input"),
    output: {
      schema: zToJSONSchema(listResult, "output"),
      render: (_args, value) => {
        const experts = (value as { experts: { name: string; enabled: boolean }[] }).experts;
        return [
          text(
            `experts: ${experts.map((e) => `${e.name}${e.enabled ? "" : " (disabled)"}`).join(", ") || "(none)"}`,
          ),
        ];
      },
    },
    async execute(args) {
      const p = parseArgs("list_experts", listParams, args);
      const experts = registry.list({ includeDisabled: p.includeDisabled }).map((e) => ({
        name: e.name,
        title: e.title,
        description: e.description,
        tools: e.tools,
        skills: e.skills,
        origin: e.origin,
        enabled: e.enabled,
      }));
      return listResult.parse({ experts });
    },
  };

  return [recruitTool, updateTool, enableTool, disableTool, listTool];
}

/** 读既有档案键（update 的旧键锚点——解析失败如实上抛原始原因）。 */
function readExistingName(file: string): string {
  const content = readExisting(file);
  const parsed = parseExpertFile(file, content);
  if (!parsed.ok) throw new ExpertToolError(`update_expert: ${parsed.reason}`);
  return parsed.record.name;
}

function readExisting(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch (cause) {
    throw new ExpertToolError(
      `update_expert: expert not readable: ${file} — ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

/** 注册 5 枚管理 tool（官方 register 正门——插件宿主半 apply 内全局调用，D1）。 */
export function registerExpertTools(registryFace: ToolRegisterFace, deps: ExpertToolsDeps): void {
  for (const tool of createExpertTools(deps)) {
    registryFace.register(tool);
  }
}
