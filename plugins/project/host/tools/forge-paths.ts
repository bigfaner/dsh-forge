// forge_dirs + forge_resolve_path 双 agent 只读查询工具（plugin-project 挂载缝——官方宿主
// 目录事实查询面）：输出完全由注册表条目派生（@dsh-forge/lib-path ForgeDirs 基座声明 +
// dirKeys.* 反向拉取声明——resolveForgeDirs 单源解析），本文件只做参数收窄 / 受控面
// typed 拒绝 / 官方 tools 缝注册，工具内不存在第二份目录数据。
// - forge_dirs：无参条目查询（dirKey 可选/缺省全量——逐条取条目 resolve 与 description；
//   含第三方键经声明拉取缝现查合并）。
// - forge_resolve_path：带参条目解析（枚举、所需参数与校验由条目自动生成，dest 即条目键名，
//   基目录取自被依赖条目的解析结果——resolveForgeDirs 拓扑解析）。
// - 受控面拒绝（未知 dirKey/dest、缺参、参数不合法）= typed ERR_DIR_PATH_INVALID 拒绝并
//   列举法集/点名所缺或不合法参数（ForgeDirPathInvalidError——contracts errors.ts 词表）。
// - 装配期同名守卫：现查 tools 面已存同名定义即跳过 + diag warn（先在者胜，不缓存）；
//   声明拉取缝降级经 onDeclareDiag warn 留痕（AGENTS 1.6/§7）。
import type { ForgeDirDeclaration, ForgeDirSources } from "@dsh-forge/lib-path";
import {
  declaredDirKeys,
  declaredEntryOf,
  isValidDirParam,
  mergeDeclarations,
  collectDeclaredDirKeys,
  resolveDeclaredDirs,
  type ReflectDeclarePullFace,
} from "../dirs/anchors.js";
import { optionalString, requireArgsObject, requiredString } from "@dsh-forge/lib-api";
import type { BugProjectIdResolver, BugToolExecFace } from "./session.js";
import type { BugToolParametersSchema } from "./bug-tools.js";
import { requireProjectId, sessionContextOf } from "./session.js";

const DIRS_TOOL = "forge_dirs";
const RESOLVE_TOOL = "forge_resolve_path";

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

/** 双工具共消费面（装配注入——三事实解析缝 + 声明集现查） */
export interface ForgePathsToolFace {
  /** projectId → 三运行时事实（dirs/self-anchors 装配缝产物） */
  anchorsOf(projectId: string): Promise<ForgeDirSources>;
  /** 声明集现查（基座键 + project 条目 + dirKeys.* 拉取声明——每次调用现拉不缓存） */
  declarations(): readonly ForgeDirDeclaration[];
}

/** 声明拉取诊断发射面载荷（anchors.ts DirKeysPullDiagFace 同形） */
export type ForgePathsDeclareDiag = (payload: { readonly level: "warn"; readonly event: string; readonly message: string }) => void;

/**
 * 双工具消费面构造（装配单点——index.ts 消费）：reflect 取法闭包惰性现查（检测永不
 * 缓存），declarations() 逐调用枚举 dirKeys.* 约定声明并与本体声明合并。
 */
export function createForgePathsToolFace(input: {
  readonly anchorsOf: ForgePathsToolFace["anchorsOf"];
  /** reflect 现查取法（缺席 = 声明拉取缝零贡献零抛） */
  readonly reflectOf: () => ReflectDeclarePullFace | undefined;
  readonly onDeclareDiag?: ForgePathsDeclareDiag;
}): ForgePathsToolFace {
  return {
    anchorsOf: input.anchorsOf,
    declarations: () => mergeDeclarations(collectDeclaredDirKeys(input.reflectOf(), input.onDeclareDiag)),
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

// ── forge_dirs ──

/** agent 面参数（dirKey 可选——缺省全量无参条目清单） */
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
    ok: { type: "boolean", description: "true = directory listing resolved." },
    paths: {
      type: "array",
      description: "Entries: dirKey + absolute dir + description (base forge.* entries plus declared third-party keys), each derived from its registry entry resolve + description.",
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
      text: [`✓ ${v.paths.length} dir(s)`, ...v.paths.map((p) => `- ${p.dirKey}: ${p.dir} — ${p.description}`)].join("\n"),
    },
  ];
}

/** tool 定义工厂（forge_dirs——无参条目查询，dirKey 可选/缺省全量） */
export function createForgeDirsTool(face: ForgePathsToolFace, resolveProjectId: BugProjectIdResolver): ForgePathToolDefinition {
  return {
    name: DIRS_TOOL,
    description:
      "Query forge directory facts — the single source of truth for directory paths. Omit dirKey to list all parameterless entries (dirKey + absolute dir + description, including third-party keys declared via the dirKeys.* convention); give dirKey for one entry. Parameterized dirs (declared by the plugin that owns them, e.g. spec.dir / spec.dossier_dir / task_loop.runtime_dir / task_loop.task_dir, and any declared ones) use forge_resolve_path instead. Read-only.",
    parameters: {
      type: "object",
      properties: {
        dirKey: { type: "string", description: "Optional directory key to look up (e.g. project.runtime_dir); omitted = list all parameterless dirs." },
      },
    },
    output: { schema: FORGE_DIRS_OUTPUT_SCHEMA, render: renderForgeDirs },
    async execute(args: unknown, exec: BugToolExecFace): Promise<unknown> {
      const parsed = parseForgeDirsArgs(args);
      const session = sessionContextOf(exec);
      const projectId = await requireProjectId(resolveProjectId, session);
      const declarations = face.declarations();
      const sources = await face.anchorsOf(projectId);
      const resolved = resolveDeclaredDirs(declarations, sources);
      // 输出 = 无参条目（带参条目参数缺席被解析器跳过——§2.3 forge_dirs 口径）
      const keys = declaredDirKeys(declarations).filter((key) => key in resolved);
      if (parsed.dirKey !== undefined) {
        const entry = declaredEntryOf(declarations, parsed.dirKey);
        if (entry === undefined) {
          throw new ForgeDirPathInvalidError(`unknown dirKey '${parsed.dirKey}' — legal keys: ${declaredDirKeys(declarations).join(", ")}`);
        }
        return { ok: true, paths: [{ dirKey: parsed.dirKey, dir: resolved[parsed.dirKey]!, description: entry.description }] };
      }
      return { ok: true, paths: keys.map((key) => ({ dirKey: key, dir: resolved[key]!, description: declaredEntryOf(declarations, key)!.description })) };
    },
  };
}

// ── forge_resolve_path ──

/** agent 面参数（dest 必填 + slug/localId 按条目 params） */
export interface ForgeResolvePathToolArgs {
  readonly dest: string;
  readonly slug?: string;
  readonly localId?: string;
}

/** 参数防御性收窄（dest 词表校验落执行点——枚举单源 = 带参条目键） */
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
    ok: { type: "boolean", description: "true = parameterized dir resolved." },
    dir: { type: "string", description: "Resolved absolute path of the directory key (params come from the entry declaration, not caller choice)." },
  },
  required: ["ok", "dir"],
} as const;

function renderForgeResolvePath(_args: unknown, value: unknown): readonly { type: "text"; text: string }[] {
  const v = value as { ok: true; dir: string };
  return [{ type: "text", text: [`✓ dir resolved`, `- dir: ${v.dir}`].join("\n") }];
}

/** 带参条目键清单（声明序——枚举/校验由条目自动生成的单点） */
function parameterizedKeysOf(declarations: readonly ForgeDirDeclaration[]): readonly string[] {
  return declaredDirKeys(declarations).filter((key) => (declaredEntryOf(declarations, key)!.params?.length ?? 0) > 0);
}

/** tool 定义工厂（forge_resolve_path——带参条目解析，枚举/参数/校验由条目生成） */
export function createForgeResolvePathTool(face: ForgePathsToolFace, resolveProjectId: BugProjectIdResolver): ForgePathToolDefinition {
  return {
    name: RESOLVE_TOOL,
    description: `Resolve a parameterized forge directory key to its absolute form. dest is a controlled enum auto-generated from the declared entries with params; give slug/localId as the entry declares. The dependency chain (base dir of a parameterized key) resolves through the same registry — you cannot pick an anchor or pass a free-form path. Read-only.`,
    parameters: {
      type: "object",
      properties: {
        dest: {
          type: "string",
          description: `Directory key with params — controlled enum generated from the registry at call time (e.g. spec.dir (requires slug); spec.dossier_dir (requires slug, localId)). Unknown dest is rejected with the legal set.`,
        },
        slug: { type: "string", description: "Container slug (feature directory name or proposal slug) — required by entries listing slug." },
        localId: { type: "string", description: "Task local id (e.g. 1.1 / fix-1) — required by entries listing localId." },
      },
      required: ["dest"],
    },
    output: { schema: FORGE_RESOLVE_PATH_OUTPUT_SCHEMA, render: renderForgeResolvePath },
    async execute(args: unknown, exec: BugToolExecFace): Promise<unknown> {
      const parsed = parseForgeResolvePathArgs(args);
      const session = sessionContextOf(exec);
      const projectId = await requireProjectId(resolveProjectId, session);
      const declarations = face.declarations();
      const paramed = parameterizedKeysOf(declarations);
      const entry = declaredEntryOf(declarations, parsed.dest);
      if (entry === undefined || !paramed.includes(parsed.dest)) {
        throw new ForgeDirPathInvalidError(
          `unknown dest '${parsed.dest}' — legal destinations: ${paramed
            .map((key) => `${key} (requires: ${declaredEntryOf(declarations, key)!.params!.join(", ")})`)
            .join("; ")}`,
        );
      }
      const requires = entry.params ?? [];
      const missing = requires.filter((r) => parsed[r] === undefined);
      if (missing.length > 0) {
        throw new ForgeDirPathInvalidError(`${parsed.dest} requires: ${requires.join(", ")} (missing: ${missing.join(", ")})`);
      }
      for (const name of requires) {
        if (!isValidDirParam(parsed[name]!)) {
          throw new ForgeDirPathInvalidError(`forge 目录参数不合法：${name}=${JSON.stringify(parsed[name])}（不得含路径分隔符或 '..'）`);
        }
      }
      const sources = await face.anchorsOf(projectId);
      const resolved = resolveDeclaredDirs(declarations, sources, { slug: parsed.slug, localId: parsed.localId });
      return { ok: true, dir: resolved[parsed.dest]! };
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
    diag("[project] ctx.tools.register 缺席（官方 tools 缝缺失）——forge_dirs/forge_resolve_path 零注册（目录查询面对本宿主不可达，降级不阻载）", "warn");
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
