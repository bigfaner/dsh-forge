// forgeDirs + forgeResolvePath 双 agent 只读查询工具（plugin-project 挂载缝——官方宿主
// 目录事实查询面；参照主检出 packages/plugin-forge/src/tools/forge-paths.ts 形态平移，
// 零拷贝字面：数据源 = host/dirs/anchors.ts 注册表单源（DIR_KEY_REGISTRY 五键 +
// DIR_DESTINATIONS 目的地 + resolveDestination 解析器），本文件只做参数收窄 / 受控面
// typed 拒绝 / 官方 tools 缝注册）。
// - forgeDirs：锚级查询（dirKey 可选/缺省全量——含 declare merge 第三方键经反向拉取缝
//   collectDeclaredDirKeys 现查合并；输出 = dirKey + dir（绝对路径）+ description，
//   与注册表同源生成零二次维护）。
// - forgeResolvePath：目的地解析（dest 受控枚举 + slug/localId 按 requires——锚绑定与
//   相对模板在注册表单点，无锚选择面无自由路径面）。
// - 受控面拒绝（未知 dirKey/dest、requires 缺参）= typed ERR_DIR_PATH_INVALID 拒绝并
//   列举法集（ForgeDirPathInvalidError——contracts errors.ts 同名词表）。
// - 装配期同名守卫：现查 tools 面已存同名定义即跳过 + diag warn（先在者胜，不缓存）；
//   declare 拉取缝降级经 onDeclareDiag warn 留痕（AGENTS 1.6/§7）。
import type { DirDestinationEntry, DirKeyEntry, ForgePathsResolveContext, ReflectDeclarePullFace } from "../dirs/anchors.js";
import { DIR_DESTINATIONS, DIR_KEY_REGISTRY, collectDeclaredDirKeys, resolveDestination } from "../dirs/anchors.js";
import { optionalString, requireArgsObject, requiredString } from "@dsh-forge/lib-api";
import type { BugProjectIdResolver, BugToolExecFace } from "./session.js";
import type { BugToolParametersSchema } from "./bug-tools.js";
import { requireProjectId, sessionContextOf } from "./session.js";

const DIRS_TOOL = "forgeDirs";
const RESOLVE_TOOL = "forgeResolvePath";

/** 注册面 tool 定义（官方 ToolDefinition 消费字段子集——bug-tools 同形） */
export interface ForgePathToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: BugToolParametersSchema;
  readonly output: {
    readonly schema: unknown;
    render(args: unknown, value: unknown): readonly { readonly type: "text"; readonly text: string }[];
  };
  execute(args: unknown, exec: BugToolExecFace): Promise<unknown>;
}

/** 双工具共消费面（装配注入——anchors.ts 注册表单源 + declare 拉取缝现查） */
export interface ForgePathsToolFace {
  /** projectId → 锚四键（dirs/self-anchors 装配缝产物） */
  anchorsOf(projectId: string): Promise<Pick<ForgePathsResolveContext, "projectHome" | "taskHome" | "forgeDir" | "docsRoot">>;
  /** 本体注册表键（anchors.ts DIR_KEY_REGISTRY 单源直读） */
  dirKeys(): readonly DirKeyEntry[];
  /**
   * 反向拉取第三方声明（现查不缓存——AGENTS 1.6）：枚举根 scope `dirKeys.*` 约定名
   * 现取声明数组，与 dirKeys() 按 dirKey 去重合并；降级径经构造时 onDeclareDiag warn 留痕。
   */
  declaredDirKeys?(): readonly DirKeyEntry[];
}

/** declare 拉取诊断发射面载荷（anchors.ts DirKeysPullDiagFace 同形） */
export type ForgePathsDeclareDiag = (payload: { readonly level: "warn"; readonly event: string; readonly message: string }) => void;

/**
 * 双工具消费面构造（装配单点——index.ts 消费）：reflect 取法闭包惰性现查（检测永不
 * 缓存），declaredDirKeys() 逐调用枚举 dirKeys.* 约定声明并与本体键去重。
 */
export function createForgePathsToolFace(input: {
  readonly anchorsOf: ForgePathsToolFace["anchorsOf"];
  /** reflect 现查取法（缺席 = declare 拉取缝零贡献零抛） */
  readonly reflectOf: () => ReflectDeclarePullFace | undefined;
  readonly onDeclareDiag?: ForgePathsDeclareDiag;
}): ForgePathsToolFace {
  return {
    anchorsOf: input.anchorsOf,
    dirKeys: () => DIR_KEY_REGISTRY,
    declaredDirKeys: () => {
      const known = DIR_KEY_REGISTRY.map((e) => e.dirKey);
      return collectDeclaredDirKeys(input.reflectOf(), known, input.onDeclareDiag);
    },
  };
}

/** 受控面 typed 拒绝（code = contracts ERR_DIR_PATH_INVALID；message 携带法集/缺参） */
export class ForgeDirPathInvalidError extends Error {
  readonly code = "ERR_DIR_PATH_INVALID" as const;
  constructor(message: string) {
    super(message);
    this.name = "ForgeDirPathInvalidError";
  }
}

/** 合并视图（本体注册表在前 + declare 拉取声明追加去重——既有键胜出，逐查询现算不落注册表） */
function mergedDirKeyEntries(face: ForgePathsToolFace): readonly DirKeyEntry[] {
  const registryEntries = face.dirKeys();
  const known = new Set(registryEntries.map((e) => e.dirKey));
  return [...registryEntries, ...(face.declaredDirKeys?.() ?? []).filter((e) => !known.has(e.dirKey))];
}

// ── forgeDirs ──

/** agent 面参数（dirKey 可选——缺省全量锚清单） */
export interface ForgeDirsToolArgs {
  readonly dirKey?: string;
}

/** 参数防御性收窄 */
export function parseForgeDirsArgs(args: unknown): ForgeDirsToolArgs {
  const a = requireArgsObject(args, DIRS_TOOL);
  const dirKey = optionalString(a, "dirKey", DIRS_TOOL);
  return dirKey === undefined ? {} : { dirKey };
}

const FORGE_DIRS_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean", description: "true = anchor directory listing resolved." },
    paths: {
      type: "array",
      description: "Anchor entries: dirKey + absolute dir + description (merged registry: forge.* anchors plus declared third-party keys).",
      items: {
        type: "object",
        properties: {
          dirKey: { type: "string", description: "Directory key (forge.* namespace or a declared plugin-prefixed key)." },
          dir: { type: "string", description: "Resolved absolute directory path." },
          description: { type: "string", description: "One-line semantics, same source as the registry entry." },
        },
        required: ["dirKey", "dir", "description"],
      },
    },
  },
  required: ["ok", "paths"],
} as const;

function renderForgeDirs(_args: unknown, value: unknown): readonly { type: "text"; text: string }[] {
  const v = value as { ok: true; paths: readonly { dirKey: string; dir: string; description: string }[] };
  return [
    {
      type: "text",
      text: [`✓ ${v.paths.length} dir anchor(s)`, ...v.paths.map((p) => `- ${p.dirKey}: ${p.dir} — ${p.description}`)].join("\n"),
    },
  ];
}

/** tool 定义工厂（forgeDirs——锚级查询，dirKey 可选/缺省全量） */
export function createForgeDirsTool(face: ForgePathsToolFace, resolveProjectId: BugProjectIdResolver): ForgePathToolDefinition {
  return {
    name: DIRS_TOOL,
    description:
      "Query forge directory anchors — the single source of truth for directory facts. Omit dirKey to list all anchors (dirKey + absolute dir + description, including third-party keys declared via the dirKeys.* convention); give dirKey for one entry. Derived paths (dossier/taskLogs/proposalDir) use forgeResolvePath instead. Read-only.",
    parameters: {
      type: "object",
      properties: {
        dirKey: { type: "string", description: "Optional anchor key to look up (e.g. forge.task_home); omitted = list all anchors." },
      },
    },
    output: { schema: FORGE_DIRS_OUTPUT_SCHEMA, render: renderForgeDirs },
    async execute(args: unknown, exec: BugToolExecFace): Promise<unknown> {
      const parsed = parseForgeDirsArgs(args);
      const session = sessionContextOf(exec);
      const projectId = await requireProjectId(resolveProjectId, session);
      const anchors = await face.anchorsOf(projectId);
      const entries = mergedDirKeyEntries(face);
      if (parsed.dirKey !== undefined) {
        const entry = entries.find((e) => e.dirKey === parsed.dirKey);
        if (entry === undefined) {
          throw new ForgeDirPathInvalidError(`unknown dirKey '${parsed.dirKey}' — legal keys: ${entries.map((e) => e.dirKey).join(", ")}`);
        }
        return { ok: true, paths: [{ dirKey: entry.dirKey, dir: entry.resolve(anchors), description: entry.description }] };
      }
      return { ok: true, paths: entries.map((e) => ({ dirKey: e.dirKey, dir: e.resolve(anchors), description: e.description })) };
    },
  };
}

// ── forgeResolvePath ──

/** agent 面参数（dest 必填 + slug/localId 按 requires） */
export interface ForgeResolvePathToolArgs {
  readonly dest: string;
  readonly slug?: string;
  readonly localId?: string;
}

/** 参数防御性收窄（dest 词表校验落执行点——枚举单源 DIR_DESTINATIONS） */
export function parseForgeResolvePathArgs(args: unknown): ForgeResolvePathToolArgs {
  const a = requireArgsObject(args, RESOLVE_TOOL);
  return {
    dest: requiredString(a, "dest", RESOLVE_TOOL),
    slug: optionalString(a, "slug", RESOLVE_TOOL),
    localId: optionalString(a, "localId", RESOLVE_TOOL),
  };
}

const FORGE_RESOLVE_PATH_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean", description: "true = destination path resolved." },
    dir: { type: "string", description: "Resolved absolute path of the destination (anchor binding and relative template live in the registry, not in caller args)." },
  },
  required: ["ok", "dir"],
} as const;

function renderForgeResolvePath(_args: unknown, value: unknown): readonly { type: "text"; text: string }[] {
  const v = value as { ok: true; dir: string };
  return [{ type: "text", text: [`✓ destination resolved`, `- dir: ${v.dir}`].join("\n") }];
}

/** tool 定义工厂（forgeResolvePath——目的地解析，受控枚举 + slug/localId） */
export function createForgeResolvePathTool(face: ForgePathsToolFace, resolveProjectId: BugProjectIdResolver): ForgePathToolDefinition {
  return {
    name: RESOLVE_TOOL,
    description: `Resolve a concrete forge destination path to its absolute form. dest is a controlled enum (${DIR_DESTINATIONS.map((d: DirDestinationEntry) => `${d.dest} (${d.requires.join("+")})`).join(", ")}); give slug/localId as the destination requires. The anchor binding and relative template live in the registry — you cannot pick an anchor or pass a free-form path. Read-only.`,
    parameters: {
      type: "object",
      properties: {
        dest: {
          type: "string",
          description: `Destination name — controlled enum: ${DIR_DESTINATIONS.map((d: DirDestinationEntry) => `${d.dest} (requires ${d.requires.join("+")})`).join(", ")}. Unknown dest is rejected with the legal set.`,
        },
        slug: { type: "string", description: "Container slug (feature directory name or proposal slug) — required by destinations listing slug." },
        localId: { type: "string", description: "Task local id (e.g. 1.1 / fix-1) — required by destinations listing localId." },
      },
      required: ["dest"],
    },
    output: { schema: FORGE_RESOLVE_PATH_OUTPUT_SCHEMA, render: renderForgeResolvePath },
    async execute(args: unknown, exec: BugToolExecFace): Promise<unknown> {
      const parsed = parseForgeResolvePathArgs(args);
      const session = sessionContextOf(exec);
      const projectId = await requireProjectId(resolveProjectId, session);
      const dest = DIR_DESTINATIONS.find((d) => d.dest === parsed.dest);
      if (dest === undefined) {
        throw new ForgeDirPathInvalidError(
          `unknown dest '${parsed.dest}' — legal destinations: ${DIR_DESTINATIONS.map((d) => `${d.dest} (requires: ${d.requires.join(", ")})`).join("; ")}`,
        );
      }
      const missing = dest.requires.filter((r) => parsed[r] === undefined);
      if (missing.length > 0) {
        throw new ForgeDirPathInvalidError(`${dest.dest} requires: ${dest.requires.join(", ")} (missing: ${missing.join(", ")})`);
      }
      const anchors = await face.anchorsOf(projectId);
      const dir = resolveDestination(dest, anchors, { slug: parsed.slug, localId: parsed.localId });
      return { ok: true, dir };
    },
  };
}

// ── 官方 tools 缝注册（装配期同名守卫——先在者胜） ──

/** 官方 tools 缝防御读取（register + get 两子面——get 承担同名守卫现查；inject 门由 index.ts "tools" 声明承担） */
function toolsFaceOf(ctx: unknown): { register?(definition: unknown): () => void; get?(name: string): unknown } | undefined {
  try {
    const face = (ctx as { tools?: unknown }).tools;
    return face !== null && typeof face === "object" ? (face as { register?(d: unknown): () => void; get?(name: string): unknown }) : undefined;
  } catch {
    return undefined;
  }
}

/** 双工具注册（官方 tools 缝——apply 期注册、unmount 撤回；零注册降级 = no-op disposer）。
 *  同名守卫：逐工具现查 tools 面已存同名定义（tools.get）——先在者胜，本插件跳过并
 *  diag warn（不缓存——每次装配注册期现求值，跨插件服务在场性消费点现查口径）。 */
export function registerForgePathsTools(
  ctx: unknown,
  deps: { readonly face: ForgePathsToolFace; readonly resolveProjectId: BugProjectIdResolver },
  diag: (line: string, level?: "info" | "warn" | "error") => void,
): { dispose: () => void } {
  const toolsFace = toolsFaceOf(ctx);
  const register = typeof toolsFace?.register === "function" ? toolsFace.register.bind(toolsFace) : undefined;
  if (register === undefined) {
    diag("[project] ctx.tools.register 缺席（官方 tools 缝缺失）——forgeDirs/forgeResolvePath 零注册（目录查询面对本宿主不可达，降级不阻载）", "warn");
    return { dispose: () => {} };
  }
  const definitions: readonly ForgePathToolDefinition[] = [
    createForgeDirsTool(deps.face, deps.resolveProjectId),
    createForgeResolvePathTool(deps.face, deps.resolveProjectId),
  ];
  const disposers: (() => void)[] = [];
  for (const definition of definitions) {
    // 同名守卫现查（先在者胜——官方宿主可能已有同名注册，跳过不覆盖）
    let existing: unknown;
    try {
      existing = toolsFace?.get?.(definition.name);
    } catch {
      existing = undefined;
    }
    if (existing !== undefined && existing !== null) {
      diag(`[project] tool '${definition.name}' 已存在同名定义——先在者胜，本插件跳过注册（forge-paths 目录查询面让位）`, "warn");
      continue;
    }
    try {
      disposers.push(register(definition));
    } catch (cause) {
      diag(`[project] forge-paths tool register failed (${definition.name}): ${cause instanceof Error ? cause.message : String(cause)}`, "error");
    }
  }
  diag(`[project] forge-paths 双工具注册完成：${String(disposers.length)}/2 员经官方 ctx.tools.register（unmount 全撤回）`, "info");
  return {
    dispose: () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          // 宿主注销面异常隔离——卸载收口不外抛
        }
      }
    },
  };
}
