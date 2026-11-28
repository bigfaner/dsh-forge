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
  DECLARED_DIR_KEYS_PREFIX,
  declaredDirKeys,
  declaredEntryOf,
  isValidDirParam,
  mergeDeclarations,
  collectDeclaredDirKeys,
  resolveDeclaredDirs,
  type ReflectDeclarePullFace,
} from "../dirs/anchors.js";
import { optionalString, requireArgsObject, requiredString } from "@dsh-forge/lib-api/tools/args";
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

// output.schema 受官方 tools.register 的 JSON Schema 方言约束（@deepseek-ai/dsh-tools
// assertSupportedJsonSchema）：type 只能是单个类型字符串（可空用 oneOf），object 节点必须显式
// 声明布尔 additionalProperties——违反即注册被拒、工具静默缺席（契约测试 forge-paths.schema.test.ts 钉住）。
const FORGE_DIRS_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { type: "boolean", description: "true = directory listing resolved." },
    paths: {
      type: "array",
      description:
        "Every declared directory key, in declaration order. Parameterless entries carry the resolved absolute dir; parameterized entries carry dir = null plus the params they require — resolve those with forge_resolve_path.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          dirKey: { type: "string", description: "Directory key (declared by its owning plugin)." },
          dir: {
            oneOf: [
              { type: "string", description: "Resolved absolute directory path (parameterless entries)." },
              { type: "null", description: "Parameterized entries carry null — resolve them with forge_resolve_path." },
            ],
          },
          params: { type: "array", items: { type: "string" }, description: "Required parameter names — present only on parameterized entries." },
          description: { type: "string", description: "One-line semantics, same source as the registry entry." },
        },
        required: ["dirKey", "dir", "description"],
      },
    },
  },
  required: ["ok", "paths"],
} as const;

/** forge_dirs 行（声明集派生——无参键带绝对路径，带参键值留空并列所需参数） */
interface ForgeDirsRow {
  readonly dirKey: string;
  readonly dir: string | null;
  readonly params?: readonly string[];
  readonly description: string;
}

function renderForgeDirs(_args: unknown, value: unknown): readonly { type: "text"; text: string }[] {
  const v = value as { ok: true; paths: readonly ForgeDirsRow[] };
  const resolvedCount = v.paths.filter((p) => p.dir !== null).length;
  const parameterizedCount = v.paths.length - resolvedCount;
  const head =
    parameterizedCount > 0 ? `✓ ${resolvedCount} dir(s) + ${parameterizedCount} parameterized` : `✓ ${resolvedCount} dir(s)`;
  const lines = v.paths.map((p) =>
    p.dir !== null
      ? `- ${p.dirKey}: ${p.dir} — ${p.description}`
      : `- ${p.dirKey}: (requires: ${(p.params ?? []).join(", ")}) → ${RESOLVE_TOOL} — ${p.description}`,
  );
  return [{ type: "text", text: [head, ...lines].join("\n") }];
}

/** tool 定义工厂（forge_dirs——目录键发现面：全部声明键逐行，带参键标明所需参数） */
export function createForgeDirsTool(face: ForgePathsToolFace, resolveProjectId: BugProjectIdResolver): ForgePathToolDefinition {
  return {
    name: DIRS_TOOL,
    description:
      "Query forge directory facts — the single source of truth for directory paths and the discovery face for every declared directory key. Omit dirKey to list all declared keys: parameterless entries come with their absolute dir; parameterized entries list the params they need and are resolved with forge_resolve_path. Give dirKey for one entry. Read-only.",
    parameters: {
      type: "object",
      properties: {
        dirKey: { type: "string", description: "Directory key to look up (any key from the full listing); omitted = list all entries." },
      },
    },
    output: { schema: FORGE_DIRS_OUTPUT_SCHEMA, render: renderForgeDirs },
    async execute(args: unknown, exec: BugToolExecFace): Promise<unknown> {
      const parsed = parseForgeDirsArgs(args);
      const session = sessionContextOf(exec);
      const projectId = await requireProjectId(resolveProjectId, session);
      const declarations = face.declarations();
      const sources = await face.anchorsOf(projectId);
      // 无参形态解析：带参条目参数缺席被解析器跳过（不报错）——行集仍逐键列出
      const resolved = resolveDeclaredDirs(declarations, sources);
      const rowOf = (key: string): ForgeDirsRow => {
        const entry = declaredEntryOf(declarations, key)!;
        const params = entry.params ?? [];
        return params.length > 0
          ? { dirKey: key, dir: null, params, description: entry.description }
          : { dirKey: key, dir: resolved[key]!, description: entry.description };
      };
      const keys = declaredDirKeys(declarations);
      if (parsed.dirKey !== undefined) {
        if (declaredEntryOf(declarations, parsed.dirKey) === undefined) {
          throw new ForgeDirPathInvalidError(`unknown dirKey '${parsed.dirKey}' — legal keys: ${keys.join(", ")}`);
        }
        return { ok: true, paths: [rowOf(parsed.dirKey)] };
      }
      return { ok: true, paths: keys.map(rowOf) };
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
  additionalProperties: false,
  properties: {
    ok: { type: "boolean", description: "true = parameterized dir resolved." },
    dest: { type: "string", description: "The directory key that was resolved." },
    params: {
      type: "object",
      // 动态键（目的地声明的参数名）——方言要求 additionalProperties 为布尔，取 true
      additionalProperties: true,
      description: "The parameters this destination requires, with the values used (extra args are not echoed).",
    },
    dir: { type: "string", description: "Resolved absolute path of the directory key (params come from the entry declaration, not caller choice)." },
  },
  required: ["ok", "dest", "params", "dir"],
} as const;

function renderForgeResolvePath(_args: unknown, value: unknown): readonly { type: "text"; text: string }[] {
  const v = value as { ok: true; dest: string; params: Readonly<Record<string, string>>; dir: string };
  const params = Object.entries(v.params)
    .map(([name, val]) => `${name}=${val}`)
    .join(", ");
  return [
    {
      type: "text",
      text: [`✓ dir resolved`, `- dest: ${v.dest}`, ...(params === "" ? [] : [`- params: ${params}`]), `- dir: ${v.dir}`].join("\n"),
    },
  ];
}

/** 带参条目键清单（声明序——枚举/校验由条目自动生成的单点） */
function parameterizedKeysOf(declarations: readonly ForgeDirDeclaration[]): readonly string[] {
  return declaredDirKeys(declarations).filter((key) => (declaredEntryOf(declarations, key)!.params?.length ?? 0) > 0);
}

/** 「目的地（所需参数）」清单文案（声明集派生——注册期生成 dest 的枚举与描述，零手写键名） */
function describeDestinations(declarations: readonly ForgeDirDeclaration[]): string {
  return parameterizedKeysOf(declarations)
    .map((key) => `${key} (requires: ${declaredEntryOf(declarations, key)!.params!.join(", ")})`)
    .join("; ");
}

/** tool 定义工厂（forge_resolve_path——带参条目解析，枚举/参数/校验由条目生成） */
export function createForgeResolvePathTool(face: ForgePathsToolFace, resolveProjectId: BugProjectIdResolver): ForgePathToolDefinition {
  // 枚举与目的地清单在注册时从声明集生成（工具不感知任何插件——零手写键名）；执行期校验
  // 仍按当次声明集现算，注册后才装载的插件不会被错误拒绝或放行。
  const declared = face.declarations();
  const paramed = parameterizedKeysOf(declared);
  const destDescription =
    paramed.length > 0
      ? `Directory key with params — controlled enum generated from the declared entries: ${describeDestinations(declared)}. Unknown dest is rejected with the legal set.`
      : "Directory key with params — no parameterized directory key is currently declared; any dest is rejected with the (empty) legal set.";
  return {
    name: RESOLVE_TOOL,
    description: `Resolve a parameterized forge directory key to its absolute form. dest is a controlled enum generated from the declared entries with params; give slug/localId as the entry declares. The dependency chain (base dir of a parameterized key) resolves through the same registry — you cannot pick an anchor or pass a free-form path. Read-only.`,
    parameters: {
      type: "object",
      properties: {
        dest: {
          type: "string",
          ...(paramed.length > 0 ? { enum: [...paramed] } : {}),
          description: destDescription,
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
      const entry = declaredEntryOf(declarations, parsed.dest);
      if (entry === undefined || !parameterizedKeysOf(declarations).includes(parsed.dest)) {
        throw new ForgeDirPathInvalidError(`unknown dest '${parsed.dest}' — legal destinations: ${describeDestinations(declarations)}`);
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
      const used = Object.fromEntries(requires.map((name) => [name, parsed[name]!]));
      return { ok: true, dest: parsed.dest, params: used, dir: resolved[parsed.dest]! };
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

/** 双工具注册句柄（dispose = 卸载全撤回；refresh = 目录键声明变化后重注册，见下） */
export interface ForgePathsToolsHandle {
  dispose: () => void;
  /**
   * 目录键声明变化后重注册：forge_resolve_path 的 dest 枚举与描述按当次声明集重新生成
   * （带参目的地清单未变 = 不重注册，返回 false）。同名守卫只对非本插件持有的定义生效。
   */
  refresh: () => boolean;
}

/** 带参目的地清单签名（声明序——refresh 的变更判据） */
function destinationsSignatureOf(face: ForgePathsToolFace): string {
  return describeDestinations(face.declarations());
}

/** 双工具注册（官方 tools 缝——apply 期注册、unmount 撤回；零注册降级 = no-op 句柄）。
 *  同名守卫：逐工具现查 tools 面已存同名定义（tools.get）——先在者胜，本插件跳过并
 *  diag warn（不缓存——每次装配注册期现求值，跨插件服务在场性消费点现查口径）。 */
export function registerForgePathsTools(
  ctx: unknown,
  deps: { readonly face: ForgePathsToolFace; readonly resolveProjectId: BugProjectIdResolver },
  diag: (line: string, level?: "info" | "warn" | "error") => void,
): ForgePathsToolsHandle {
  const toolsFace = toolsFaceOf(ctx);
  const register = typeof toolsFace?.register === "function" ? toolsFace.register.bind(toolsFace) : undefined;
  if (register === undefined) {
    diag("[project] ctx.tools.register 缺席（官方 tools 缝缺失）——forge_dirs/forge_resolve_path 零注册（目录查询面对本宿主不可达，降级不阻载）", "warn");
    return { dispose: () => {}, refresh: () => false };
  }
  /** 本插件持有的注销器（按工具名——refresh 先撤旧再注册新，同名守卫对自有定义放行） */
  let owned = new Map<string, () => void>();
  const withdraw = (): void => {
    for (const dispose of owned.values()) {
      try {
        dispose();
      } catch {
        // 宿主注销面异常隔离——卸载收口不外抛
      }
    }
    owned = new Map();
  };
  const registerAll = (): void => {
    const definitions: readonly ForgePathToolDefinition[] = [
      createForgeDirsTool(deps.face, deps.resolveProjectId),
      createForgeResolvePathTool(deps.face, deps.resolveProjectId),
    ];
    for (const definition of definitions) {
      if (!owned.has(definition.name)) {
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
      }
      try {
        owned.set(definition.name, register(definition));
      } catch (cause) {
        diag(`[project] forge-paths tool register failed (${definition.name}): ${cause instanceof Error ? cause.message : String(cause)}`, "error");
      }
    }
    diag(`[project] forge-paths 双工具注册完成：${String(owned.size)}/2 员经官方 ctx.tools.register（unmount 全撤回）`, "info");
  };
  registerAll();
  let signature = destinationsSignatureOf(deps.face);
  let active = true;
  return {
    dispose: () => {
      active = false;
      withdraw();
    },
    refresh: (): boolean => {
      // 卸载后到达的声明变化事件不再重注册（晚到回调防护）
      if (!active) return false;
      const next = destinationsSignatureOf(deps.face);
      if (next === signature) return false;
      signature = next;
      withdraw();
      registerAll();
      return true;
    },
  };
}

/**
 * 目录键声明变化监听（官方 cordis `internal/service` 事件——服务提供与注销时各发一次，
 * 声明方在 apply 期 provide 的于其激活时点补发；载荷 = 服务名 + 当前值）。只对
 * `dirKeys.<声明方>` 约定名触发回调；同轮多个事件合并为一次回调（微任务合并）。
 * 事件面缺席/订阅抛 = 不监听零抛（fail-soft——工具仍可按注册期枚举工作）。
 * @returns 退订器（未订阅时 no-op）
 */
export function watchDirKeysDeclarations(ctx: unknown, onChange: () => void): () => void {
  const on = (ctx as { on?: (name: string, listener: (...args: unknown[]) => void) => unknown }).on;
  if (typeof on !== "function") return () => {};
  let scheduled = false;
  let subscribed = true;
  let listener: ((name: unknown) => void) | undefined;
  try {
    listener = (name: unknown): void => {
      if (!subscribed || typeof name !== "string" || !name.startsWith(DECLARED_DIR_KEYS_PREFIX)) return;
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (!subscribed) return; // 退订后排空的合并回调不再触发
        try {
          onChange();
        } catch {
          // 回调异常隔离——监听面不因单次刷新失败而失效
        }
      });
    };
    const off = on.call(ctx, "internal/service", listener);
    return () => {
      subscribed = false;
      if (typeof off === "function") void off();
    };
  } catch {
    return () => {};
  }
}
