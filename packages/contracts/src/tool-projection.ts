// 工具注册面投影/求交族（bug a5b12254 集中化裁决——expert-squad 与 plugin-forge 同根因
// 重复实现的「工具白名单 × 真机注册面求交」族单源；两包 e3b045dc 家族各炸一次、复发两次
// 的定谳路径：逐字重复 = 每张 bug 单修两处）。定位：中立域纯逻辑——回答「dsh 工具注册面 +
// agent-preset 分层装配面上有哪些名」，与专家档案/forge 任务矩阵无关；官方机械仅经
// type-only import（@deepseek-ai/dsh-agent-preset-registry，AGENTS §1.5）与注入的读取函数
// 触达，运行期零 cordis 依赖（插件可移植性 §1.3 无损）。
// 包域差异面经参数注入：排除集/空集异常类型归各消费包（expert-squad 传
// EXCLUDED_EXPERT_TOOL_NAMES + ExpertToolError；plugin-forge 不传排除集、默认 Error）；
// deriveWorkerToolFilter / essentials 断言 / resolveToolAllow 排除集语义不入本模块。
import type { AgentPresetRegistry } from '@deepseek-ai/dsh-agent-preset-registry'

/**
 * shell 工具名候选（跨平台同族：win32 注册 pwsh，其余平台注册 bash——dsh-tool-pwsh /
 * dsh-terminal-bash 平台 disabled 装配面；dsh-graph g-473 / 两包求交同口径）。
 */
export const SHELL_TOOL_CANDIDATES = ['bash', 'pwsh'] as const

/**
 * 平台确定性 shell 名兜底（bug a5b12254 附加要求）：探针不可信/缺席时 shell 同族名按
 * process.platform 判定（可注入参数，纯函数不裸读全局）——win32 → pwsh、其余平台 → bash，
 * 与官方装配面一致。仅作用于 SHELL_TOOL_CANDIDATES 内的名（不借兜底扩大裁剪面）。
 */
export function platformShellToolName(platform: string): 'bash' | 'pwsh' {
  return platform === 'win32' ? 'pwsh' : 'bash'
}

/**
 * 探针可信金丝雀（bug 92d642c2 真机定谳）：全局恒在的官方工具名。无参 schemas() 是
 * ScopedLayers global 单层投影——官方工具全随 preset 装 preset scope 层（bug e3b045dc），
 * global 层可能只剩子域工具。投影非空且不含金丝雀 = 子域采样，不可作裁剪/断言依据。
 */
export const PROBE_CANARY_TOOL = 'read'

/** 子域投影判定（纯函数）：非空且不含金丝雀 = 子域采样（不可信——不裁剪不断言）。 */
export function probeIsSubdomain(registered: readonly string[]): boolean {
  return registered.length > 0 && !registered.includes(PROBE_CANARY_TOOL)
}

/**
 * 工具目录读取函数子面（ToolRuntime.schemas(scope?)——缺 scope = global 单层视图，携
 * preset scope key = 该 preset 装配面视图；unknown 形状校验由 globalToolNamesOfToolsFace 承担）。
 */
export type ToolsSchemasReader = (
  scope?: object,
) => readonly { readonly name: string; readonly description?: string }[] | undefined

/** 官方 agentPresets 服务窄面（ctx.agentPresets——AgentPresetRegistry type-only import
 *  Pick 派生，AGENTS §1.5；list() 枚举全部 preset + acquireScope() 取 scope 租约）。 */
export type AgentPresetsFace = Pick<AgentPresetRegistry, 'list' | 'acquireScope'>

/** preset scope 租约子面（官方 acquireScope 返回 `{key: ScopeKey} & AsyncDisposable`
 *  的窄面——ScopeKey 为 opaque object（@deepseek-ai/dsh-scope），用后 dispose）。 */
export type PresetScopeLease = Awaited<ReturnType<AgentPresetsFace['acquireScope']>>

/**
 * 官方 tools 面 unknown 形状校验读取（两包各一份副本的合并单源）：结构化读
 * `tools.schemas(scope?)` 逐 schema 取 name（plugin-forge bug 989997bd / expert-squad
 * ToolsSchemasReader 同法）。任一环缺席/形状不符/调用抛错 = undefined（调用方回落
 * 不裁剪或 parent 探针）。
 */
export function globalToolNamesOfToolsFace(tools: unknown, scope?: object): readonly string[] | undefined {
  if (typeof tools !== 'object' || tools === null) return undefined
  const schemas = (tools as { schemas?: unknown }).schemas
  if (typeof schemas !== 'function') return undefined
  let projected: unknown
  try {
    projected = (schemas as (this: unknown, scope?: object) => unknown).call(tools, scope)
  } catch {
    return undefined
  }
  if (!Array.isArray(projected)) return undefined
  const names: string[] = []
  for (const schema of projected) {
    if (typeof schema !== 'object' || schema === null) return undefined
    const name = (schema as { name?: unknown }).name
    if (typeof name !== 'string') return undefined
    names.push(name)
  }
  return names
}

/** 目录条目（name+description 投影——并集去重单元；source = 条目级来源标注，bug
 *  c19eb719：global 层条目 "global"、preset 层条目 preset id，同名先见者保留来源）。 */
export interface CatalogEntry {
  name: string
  description: string
  source: string
}

/** 并集去重合并（按 name 去重，description/source 取先见者——全局视图先入即全局优先）。 */
function mergeCatalog(
  merged: Map<string, CatalogEntry>,
  rows: readonly { name: string; description?: string }[] | undefined,
  source: string,
): void {
  for (const row of rows ?? []) {
    if (!merged.has(row.name))
      merged.set(row.name, { name: row.name, description: row.description ?? '', source })
  }
}

/** agentPresets face 形状校验（缺席/list-acquireScope 非函数 = 不可用，取用点现查）。 */
function readAgentPresetsFace(face: AgentPresetsFace | undefined): AgentPresetsFace | undefined {
  return face !== undefined &&
    typeof face.list === 'function' &&
    typeof face.acquireScope === 'function'
    ? face
    : undefined
}

const PRESETS_ABSENT_NOTE =
  'preset scope views unavailable (agentPresets absent or malformed) — global view only'

/**
 * 全模式并集取数（bug 6337a936 / e3b045dc 家族核心，expert-squad tools.ts 平移）：
 * 全局视图先入（source="global"），逐 preset acquireScope 租约内取 scope 视图合并
 * （source=preset id）；单 preset 失败不外溢（记 note 部分并集），租约 try/finally 经
 * 官方 asyncDispose 机械释放（bug 66e1bd5d——租约形 `{key} & AsyncDisposable`，无
 * dispose()），单租约释放失败记 note 不外溢。agentPresets 缺席 = global 单层 + note。
 */
export async function unionAcrossPresets(
  readGlobal: () => readonly { name: string; description?: string }[] | undefined,
  readScoped: (
    scope: object,
  ) => readonly { name: string; description?: string }[] | undefined | Promise<readonly { name: string; description?: string }[] | undefined>,
  agentPresets: AgentPresetsFace | undefined,
): Promise<{ entries: CatalogEntry[]; note?: string }> {
  const merged = new Map<string, CatalogEntry>()
  mergeCatalog(merged, readGlobal(), 'global')
  const presets = readAgentPresetsFace(agentPresets)
  if (presets === undefined) {
    return { entries: [...merged.values()], note: PRESETS_ABSENT_NOTE }
  }
  let ids: string[]
  let note: string | undefined
  try {
    ids = (await presets.list())
      .map((preset) => preset.id)
      .filter((id): id is string => typeof id === 'string')
  } catch {
    return { entries: [...merged.values()], note: 'agentPresets unavailable — global view only' }
  }
  const failed: string[] = []
  const releaseFailed: string[] = []
  for (const id of ids) {
    let lease: PresetScopeLease | undefined
    try {
      lease = await presets.acquireScope(id)
      mergeCatalog(merged, await readScoped(lease.key), id)
    } catch {
      failed.push(id)
    } finally {
      if (lease !== undefined) {
        try {
          await lease[Symbol.asyncDispose]()
        } catch (error) {
          // 单租约释放失败不掩盖取数结果——记 note（点名 preset），不外溢
          releaseFailed.push(`${id} (${error instanceof Error ? error.message : String(error)})`)
        }
      }
    }
  }
  if (failed.length > 0) note = `preset scope views failed: ${failed.join(', ')} — partial union`
  if (releaseFailed.length > 0) {
    note = [note, `preset scope lease release failed: ${releaseFailed.join(', ')}`]
      .filter((part) => part !== undefined)
      .join('; ')
  }
  return { entries: [...merged.values()], note }
}

/**
 * 全模式并集名表探针（bug e3b045dc / a5b12254——求交基准不接 global 单层投影）：
 * global 视图 ∪ 逐 preset acquireScope 租约内 scope 视图的名表。global 读取失败
 * （tools 面缺席/形状漂移）= undefined（调用方回落 parent 探针/不裁剪）；agentPresets
 * 缺席 fail-soft 降级 global 单层。消费点现查禁 memoize（AGENTS §1.6）——本工厂返回
 * 的探针每次调用都重新取数。
 */
export function createUnionToolNamesProbe(
  read: ToolsSchemasReader,
  agentPresets: () => AgentPresetsFace | undefined,
): () => Promise<readonly string[] | undefined> {
  return async () => {
    const global = read()
    if (global === undefined || !Array.isArray(global)) return undefined
    const { entries } = await unionAcrossPresets(() => global, (scope) => read(scope), agentPresets())
    return entries.map((entry) => entry.name)
  }
}

/** intersectToolNames 参数化差异面（包域语义注入缝——集中不抹平行为差异） */
export interface IntersectToolNamesOptions {
  /** 前置排除集（expert-squad EXCLUDED_EXPERT_TOOL_NAMES——所有分支恒生效，含无探针分支） */
  readonly excluded?: readonly string[]
  /** 空集 fail-loud 异常工厂（默认 Error；expert-squad 注入 ExpertToolError 包装） */
  readonly emptyError?: (message: string) => Error
  /**
   * 探针缺席/不可信（子域投影）时的 shell 同族平台兜底（bug a5b12254 附加要求）：
   * win32 → pwsh、其余 → bash（platformShellToolName）。仅作用于 SHELL_TOOL_CANDIDATES
   * 名，其余名原样放行；缺省 = 不兜底（探针缺席时白名单原样承载，既有语义）。
   */
  readonly platform?: string
}

/**
 * 白名单/allow 名表与真机注册面求交（两包求交核心单源——bug 3cb118cf / e3b045dc /
 * a5b12254）：
 * - 排除集前置剔除（opts.excluded——所有分支恒生效）；
 * - 探针缺席/空/子域投影（不可信）→ 不裁剪；opts.platform 在场时 shell 同族名兜底
 *   解析为平台确定名（pwsh 落 Mac 得 bash——spawn 不炸）；
 * - 探针可信 → 已知名保序保留；shell 同族名解析为在场候选者；其余未知名 fail-soft 剔除
 *   （dsh-tools restrict() 未知名硬抛错，逐字透传跨机档案必拆 spawn——dsh-graph g-473 口径）；
 * - 解析后空集（入表非空全未知 = 档案配置错误）→ fail-loud（opts.emptyError 工厂）。
 */
export function intersectToolNames(
  rawNames: readonly string[],
  registered?: readonly string[],
  opts?: IntersectToolNamesOptions,
): string[] {
  const excluded = opts?.excluded
  const allow = excluded === undefined ? [...rawNames] : rawNames.filter((name) => !excluded.includes(name))
  const trusted =
    registered !== undefined && registered.length > 0 && !probeIsSubdomain(registered)
  if (!trusted) {
    const platform = opts?.platform
    if (platform === undefined) return allow
    const preferred = platformShellToolName(platform)
    const resolved: string[] = []
    for (const name of allow) {
      const mapped = (SHELL_TOOL_CANDIDATES as readonly string[]).includes(name) ? preferred : name
      if (!resolved.includes(mapped)) resolved.push(mapped)
    }
    return resolved
  }
  const present = new Set<string>(registered)
  const resolved: string[] = []
  for (const name of allow) {
    if (present.has(name)) {
      resolved.push(name)
      continue
    }
    if ((SHELL_TOOL_CANDIDATES as readonly string[]).includes(name)) {
      const sibling = SHELL_TOOL_CANDIDATES.find((c) => c !== name && present.has(c))
      if (sibling !== undefined) resolved.push(sibling)
    }
  }
  if (allow.length > 0 && resolved.length === 0) {
    const message =
      `tools resolve to empty tool allow-list against registered tools [${[...present].sort().join(', ')}]; ` +
      `input: [${allow.join(', ')}]`
    throw (opts?.emptyError ?? ((m: string) => new Error(m)))(message)
  }
  return resolved
}
