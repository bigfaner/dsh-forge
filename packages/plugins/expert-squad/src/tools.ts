// 管理 tool 面（tech-design §7 tool 面 / D1 全局注册）：5 管理 + list 取用，
// 动词+名词命名。每工具声明 output { schema, render }（官方 dsh-tools register
// 门强制，annotutor tools.ts 先例）；参数/结果 zod schema 经受支持子集净化——
// 裸 zod 产物带 $schema/minLength/anyOf/type 数组等子集外关键字会被官方 register
// 门拒绝；净化只放宽模型面形状描述，处理器内校验仍是唯一强制闸。
// 写路径（recruit/update）经 store/frontmatter 校验（parseExpertFile /
// validateExpertUpdate）：必填字段、禁裸 {{、name 建档后不可改、撞名 fail-loud。

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import type { ExpertsRegistry } from "./registry.js";
import { parseExpertFile, validateExpertUpdate, type ExpertReasoning } from "./store/frontmatter.js";

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
  provider: z.string().optional().describe("Optional dispatch provider preference (paired with model at dispatch)"),
  // 归属层必填（用户裁决：召唤建档须先询问用户放哪层）——缺席即参数错误，
  // 逼迫调用方（HR 会话）先经 ask-user 确认再建档。
  target: z
    .enum(["user", "project"])
    .describe(
      "Archive layer. ASK THE USER which layer before calling: " +
        '"user" = 跨项目共享（$DSH_HOME/experts，角标「用户」）；' +
        '"project" = 本项目共享（项目根 .dsh/experts，角标「项目」）',
    ),
  personaMd: z
    .string()
    .min(1)
    .describe("Persona markdown body (sections like 职责/边界/信条); bare {{ is not allowed"),
});

// update_expert 同形但无 target——编辑恒写回原层（来源保持），不换层
const updateParams = recruitParams.omit({ target: true });

// rename_expert（同层原子迁移）：from/to 均走 EXPERT_KEY 正则——新键即新档键，
// 合法性在参数闸前置校验；撞名/旧键缺席在处理器内 fail-loud。
const renameParams = z.object({
  from: EXPERT_KEY.describe("Existing expert key to rename"),
  to: EXPERT_KEY.describe("New expert key (lowercase english, must not collide with an existing key)"),
});

const enableParams = z.object({
  name: z.string().min(1).describe("Existing expert key to enable"),
});

const disableParams = z.object({
  name: z.string().min(1).describe("Existing expert key to disable"),
});

// list_experts 无参数——返回体恒不含禁用专家（用户裁决：禁用项对取用面不可见）。
const listParams = z.object({});

const recruitResult = z.object({
  name: z.string(),
  path: z.string(),
});

const updateResult = z.object({
  name: z.string(),
  path: z.string(),
});

const renameResult = z.object({
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
    }),
  ),
});

// list_tools / list_skills（猎头核销 recruit/update 白名单键名的取数面）：
// name+description 投影；note = 数据面缺席/异常时的 fail-soft 说明位（缺席不抛错）。
const listToolsResult = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
    }),
  ),
  note: z.string().optional(),
});

const listSkillsResult = z.object({
  skills: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
    }),
  ),
  note: z.string().optional(),
});

/** 工具目录读取函数子面（ToolRuntime.schemas(scope?)——缺 scope 全局视图，携
 *  preset scope key = 该 preset 装配面视图；bug 6337a936 全模式并集取数面）。 */
export type ToolsSchemasReader = (
  scope?: object,
) => readonly { readonly name: string; readonly description?: string }[] | undefined;

/** 技能目录读取函数子面（ctx.skills.list({cwd, scope?})——AGENTS 1.6 调用点现查不 memoize）。 */
export interface SkillsListFace {
  list(opts: { cwd: string; scope?: object }): Promise<readonly { name: string; description?: string }[]>;
}

/** preset scope 租约子面（官方 acquireScope 返回 `{key: ScopeKey} & AsyncDisposable`
 *  的窄面——ScopeKey 为 opaque object（@deepseek-ai/dsh-scope），用后 dispose）。 */
export interface PresetScopeLease {
  readonly key: object;
  dispose(): unknown;
}

/** 官方 agentPresets 服务窄面（ctx.agentPresets——@deepseek-ai/dsh-agent-preset-registry
 *  AgentPresetRegistry.list()/acquireScope() 正门；全模式并集枚举缝）。 */
export interface AgentPresetsFace {
  list(): Promise<readonly { readonly id: string }[]>;
  acquireScope(id?: string): Promise<PresetScopeLease>;
}

/** 目录条目（name+description 投影——并集去重单元）。 */
interface CatalogEntry {
  name: string;
  description: string;
}

/** 并集去重合并（按 name 去重，description 取先见者——全局视图先入即全局优先）。 */
function mergeCatalog(merged: Map<string, CatalogEntry>, rows: readonly { name: string; description?: string }[] | undefined): void {
  for (const row of rows ?? []) {
    if (!merged.has(row.name)) merged.set(row.name, { name: row.name, description: row.description ?? "" });
  }
}

/** agentPresets face 形状校验（缺席/list-acquireScope 非函数 = 不可用，取用点现查）。 */
function readAgentPresetsFace(face: AgentPresetsFace | undefined): AgentPresetsFace | undefined {
  return face !== undefined &&
    typeof face.list === "function" &&
    typeof face.acquireScope === "function"
    ? face
    : undefined;
}

const PRESETS_ABSENT_NOTE =
  "preset scope views unavailable (agentPresets absent or malformed) — global view only";

/** 全模式并集取数（bug 6337a936）：全局视图先入，逐 preset acquireScope 租约内取
 *  scope 视图合并；单 preset 失败不外溢（记 note 部分并集），租约 try/finally dispose。 */
async function unionAcrossPresets(
  readGlobal: () => readonly { name: string; description?: string }[] | undefined,
  readScoped: (scope: object) => readonly { name: string; description?: string }[] | undefined | Promise<readonly { name: string; description?: string }[] | undefined>,
  agentPresets: AgentPresetsFace | undefined,
): Promise<{ entries: CatalogEntry[]; note?: string }> {
  const merged = new Map<string, CatalogEntry>();
  mergeCatalog(merged, readGlobal());
  const presets = readAgentPresetsFace(agentPresets);
  if (presets === undefined) {
    return { entries: [...merged.values()], note: PRESETS_ABSENT_NOTE };
  }
  let ids: string[];
  let note: string | undefined;
  try {
    ids = (await presets.list())
      .map((preset) => preset.id)
      .filter((id): id is string => typeof id === "string");
  } catch {
    return { entries: [...merged.values()], note: "agentPresets unavailable — global view only" };
  }
  const failed: string[] = [];
  for (const id of ids) {
    let lease: PresetScopeLease | undefined;
    try {
      lease = await presets.acquireScope(id);
      mergeCatalog(merged, await readScoped(lease.key));
    } catch {
      failed.push(id);
    } finally {
      try {
        lease?.dispose();
      } catch {
        // dispose 失败不掩盖取数结果（租约释放属官方回收面，非本工具职责）
      }
    }
  }
  if (failed.length > 0) note = `preset scope views failed: ${failed.join(", ")} — partial union`;
  return { entries: [...merged.values()], note };
}

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

export interface ArchiveFields {
  name: string;
  title: string;
  description: string;
  tools: string[];
  skills?: string[];
  model?: string;
  provider?: string;
  reasoning?: ExpertReasoning;
}

export function serializeExpertMd(fields: ArchiveFields, personaMd: string): string {
  const data: Record<string, unknown> = {
    name: fields.name,
    title: fields.title,
    description: fields.description,
    tools: fields.tools,
  };
  if (fields.skills !== undefined) data.skills = fields.skills;
  if (fields.model !== undefined) data.model = fields.model;
  if (fields.provider !== undefined) data.provider = fields.provider;
  if (fields.reasoning !== undefined) data.reasoning = fields.reasoning;
  return matter.stringify(personaMd, data);
}

// ---------------------------------------------------------------------------
// 5 工具（全局注册即用——D1）
// ---------------------------------------------------------------------------

export const EXPERT_TOOLS = [
  "recruit_expert",
  "update_expert",
  "rename_expert",
  "enable_expert",
  "disable_expert",
  "list_experts",
  "list_tools",
  "list_skills",
] as const;

export type ExpertToolName = (typeof EXPERT_TOOLS)[number];

export interface ExpertToolsDeps {
  /** 取用 API（服务键 experts 的 registry 实例）。 */
  readonly registry: ExpertsRegistry;
  /** 可写 user 层专家目录（recruit/update 落盘点；返回绝对路径）。 */
  readonly userRoot: () => string;
  /** 可写 project 层 experts 目录（recruit target="project" 落盘点；
   *  返回 null = 宿主 cwd 非项目根（打包形态）——project 目标不可用。 */
  readonly projectRoot?: () => string | null;
  /** 工具目录读取函数（ToolRuntime.schemas() 全局视图；缺席 fail-soft）。 */
  readonly toolsSchemas?: ToolsSchemasReader;
  /** 技能目录读取函数（每次 execute 现查返回 skills face——跨插件服务不 memoize）。 */
  readonly skills?: () => SkillsListFace | undefined;
  /** 官方 agentPresets 服务取数面（每次 execute 现查——全模式并集枚举缝；缺席降级仅全局视图）。 */
  readonly agentPresets?: () => AgentPresetsFace | undefined;
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

/** 工厂：8 枚管理/取数 tool 定义（不注册——注册走 registerExpertTools）。 */
export function createExpertTools(deps: ExpertToolsDeps): ExpertToolDefinition[] {
  const { registry, userRoot } = deps;

  /** 建档落点解析（target 必填——调用方须先询问用户归属层）。 */
  const recruitRootOf = (target: "user" | "project"): string => {
    if (target === "user") return userRoot();
    const projectDir = deps.projectRoot?.() ?? null;
    if (projectDir === null) {
      throw new ExpertToolError(
        'recruit_expert: project layer unavailable (host cwd is not a project root) — ask the user and use target "user"',
      );
    }
    return projectDir;
  };

  const recruitTool: ExpertToolDefinition = {
    name: "recruit_expert",
    description:
      "Recruit (create) a new expert profile: writes a validated expert .md archive into the user experts root. The key must be a lowercase english key and is immutable after creation; the persona body must not contain bare {{.",
    parameters: zToJSONSchema(recruitParams, "input"),
    output: {
      schema: zToJSONSchema(recruitResult, "output"),
      render: (_args, value) => [
        text(
          `expert recruited: ${(value as { name: string }).name} (${(value as { path: string }).path}) — usable now via list_experts / delegate_expert`,
        ),
      ],
    },
    async execute(args) {
      const p = parseArgs("recruit_expert", recruitParams, args);
      const rootDir = recruitRootOf(p.target);
      const file = join(rootDir, `${p.name}.md`);
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
      await registry.refresh(); // 所见即所得：返回时点快照已含新档案（不等 watch 异步失效）
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
      await registry.refresh(); // 所见即所得：返回时点快照已含新内容（不等 watch 异步失效）
      return updateResult.parse({ name: p.name, path: file });
    },
  };

  const renameTool: ExpertToolDefinition = {
    name: "rename_expert",
    description:
      "Rename an expert key by an atomic same-layer migration (old key file is removed, a new key file is born; the immutable-after-creation rule is NOT relaxed — this is a separate migration path). The archive stays in its original layer (project → project root, user/plugin → user root); all fields and the persona body are carried over unchanged except name.",
    parameters: zToJSONSchema(renameParams, "input"),
    output: {
      schema: zToJSONSchema(renameResult, "output"),
      render: (_args, value) => [
        text(`expert renamed: ${(value as { name: string }).name} (${(value as { path: string }).path})`),
      ],
    },
    async execute(args) {
      const p = parseArgs("rename_expert", renameParams, args);
      // 迁移恒在原归属层内（与面板 update 来源保持裁决同则）：project → projectRoot
      // 落点（缺席报错引导 user 层），user/plugin → userRoot（遮蔽语义——plugin 层
      // 随包只读，迁移回落 user 层覆写）。
      const origin = registry
        .list({ includeDisabled: true })
        .find((entry) => entry.name === p.from)?.origin;
      const rootDir =
        origin === "project"
          ? (() => {
              const projectDir = deps.projectRoot?.() ?? null;
              if (projectDir === null) {
                throw new ExpertToolError(
                  `rename_expert: expert ${p.from} lives in the project layer but the project root is unavailable (host cwd is not a project root) — cannot migrate; consider recreating via recruit_expert`,
                );
              }
              return projectDir;
            })()
          : userRoot();
      const oldFile = join(rootDir, `${p.from}.md`);
      const newFile = join(rootDir, `${p.to}.md`);
      if (!existsSync(oldFile)) {
        throw new ExpertToolError(
          `rename_expert: expert not found: ${p.from} (${oldFile}) — use list_experts to inspect available keys`,
        );
      }
      if (existsSync(newFile)) {
        throw new ExpertToolError(
          `rename_expert: target key already exists: ${p.to} (${newFile}) — pick another key`,
        );
      }
      // 读旧文件原内容 → 仅 name 换新键，其余字段与 personaMd 原样。
      const oldContent = readExisting(oldFile);
      const parsed = parseExpertFile(oldFile, oldContent);
      if (!parsed.ok) throw new ExpertToolError(`rename_expert: ${parsed.reason}`);
      const rec = parsed.record;
      const content = serializeExpertMd(
        {
          name: p.to,
          title: rec.title,
          description: rec.description,
          tools: rec.tools,
          skills: rec.skills,
          model: rec.model,
          provider: rec.provider,
          reasoning: rec.reasoning,
        },
        rec.personaMd,
      );
      // 写新文件前经 parseExpertFile 全量校验门（必填/裸 {{），不过不落盘。
      const verdict = parseExpertFile(newFile, content);
      if (!verdict.ok) throw new ExpertToolError(`rename_expert: ${verdict.reason}`);
      writeFileSync(newFile, content, "utf8");
      rmSync(oldFile);
      await registry.refresh(); // 所见即所得：list 面新键可见、旧键消失
      return renameResult.parse({ name: p.to, path: newFile });
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
      "List available experts with selection fields (title/description/tools) and origin; disabled experts are not included.",
    parameters: zToJSONSchema(listParams, "input"),
    output: {
      schema: zToJSONSchema(listResult, "output"),
      render: (_args, value) => {
        const experts = (value as { experts: { name: string; title: string; description: string }[] }).experts;
        if (experts.length === 0) return [text("experts: (none)")];
        const lines = experts.map((e) => `- ${e.name} — ${e.title}：${e.description}`);
        return [text(`experts (${experts.length}):\n${lines.join("\n")}`)];
      },
    },
    async execute(args) {
      parseArgs("list_experts", listParams, args);
      const experts = registry.list().map((e) => ({
        name: e.name,
        title: e.title,
        description: e.description,
        tools: e.tools,
        skills: e.skills,
        origin: e.origin,
      }));
      return listResult.parse({ experts });
    },
  };

  const listToolsTool: ExpertToolDefinition = {
    name: "list_tools",
    description:
      "List globally registered tools (name + description) usable as recruit/update tool whitelist keys.",
    parameters: zToJSONSchema(listParams, "input"),
    output: {
      schema: zToJSONSchema(listToolsResult, "output"),
      render: (_args, value) => {
        const v = value as { tools: { name: string; description: string }[]; note?: string };
        const lines = v.tools.map((t) => `- ${t.name}${t.description ? ` — ${t.description}` : ""}`);
        const head = v.note ? `tools: ${v.note}` : `tools (${v.tools.length}):`;
        return [text(v.tools.length === 0 ? head : `${head}\n${lines.join("\n")}`)];
      },
    },
    async execute(args) {
      parseArgs("list_tools", listParams, args);
      const read = deps.toolsSchemas;
      if (read === undefined) {
        return listToolsResult.parse({ tools: [], note: "tools catalog absent" });
      }
      // 全模式并集（bug 6337a936）：全局视图 + 逐 preset scope 视图（租约内取数，
      // 用后 dispose）；agentPresets 缺席/形状不符降级仅全局视图 + note 注明。
      const global = read();
      if (global === undefined) {
        return listToolsResult.parse({ tools: [], note: "tools catalog absent" });
      }
      const { entries, note } = await unionAcrossPresets(
        () => global,
        (scope) => read(scope),
        deps.agentPresets?.(),
      );
      return listToolsResult.parse({ tools: entries, ...(note !== undefined ? { note } : {}) });
    },
  };

  const listSkillsTool: ExpertToolDefinition = {
    name: "list_skills",
    description:
      "List available skills (name + description) usable as recruit/update skill tags. Returns skills:[] with a note when the skills service is absent.",
    parameters: zToJSONSchema(listParams, "input"),
    output: {
      schema: zToJSONSchema(listSkillsResult, "output"),
      render: (_args, value) => {
        const v = value as { skills: { name: string; description: string }[]; note?: string };
        const lines = v.skills.map((s) => `- ${s.name}${s.description ? ` — ${s.description}` : ""}`);
        const head = v.note ? `skills: ${v.note}` : `skills (${v.skills.length}):`;
        return [text(v.skills.length === 0 ? head : `${head}\n${lines.join("\n")}`)];
      },
    },
    async execute(args) {
      parseArgs("list_skills", listParams, args);
      const face = deps.skills?.(); // 调用点现查（AGENTS 1.6——检测结果不 memoize）
      if (face === undefined || typeof face.list !== "function") {
        return listSkillsResult.parse({ skills: [], note: "skills service absent" });
      }
      // 全模式并集（bug 6337a936，与 list_tools 同径）：全局层先入 + 逐 preset
      // scope 层（skills.list 携 cwd+scope，租约内取数用后 dispose）；缺席降级注明。
      const globalRows = await face.list({ cwd: process.cwd() }).catch(() => undefined);
      if (globalRows === undefined) {
        return listSkillsResult.parse({ skills: [], note: "skills service unavailable" });
      }
      const { entries, note } = await unionAcrossPresets(
        () => globalRows,
        async (scope) => await face.list({ cwd: process.cwd(), scope }),
        deps.agentPresets?.(),
      );
      return listSkillsResult.parse({ skills: entries, ...(note !== undefined ? { note } : {}) });
    },
  };

  return [recruitTool, updateTool, renameTool, enableTool, disableTool, listTool, listToolsTool, listSkillsTool];
}

/** 读既有档案键（update/rename 的旧键锚点——解析失败如实上抛原始原因）。 */
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
      `expert archive not readable: ${file} — ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

/** 注册 8 枚管理/取数 tool（官方 register 正门——插件宿主半 apply 内全局调用，D1）。 */
export function registerExpertTools(registryFace: ToolRegisterFace, deps: ExpertToolsDeps): void {
  for (const tool of createExpertTools(deps)) {
    registryFace.register(tool);
  }
}
