// dirKey 声明缝（forge-dirs-unification §2.2/§2.5——目录事实单源 = @dsh-forge/lib-path
// ForgeDirs 基座）：本体十条（FORGE_BASE_DIR_ENTRIES）为基座声明，第三方插件经根 scope
// `reflect.provide('dirKeys.<声明方>', entries)` 反向拉取合并——查询时现拉，不缓存不落注册表。
// 本模块只做三件事：
//   ① 基座声明常量 + 解析入口薄封装（resolveForgeDirs 直通 lib/path 单源）；
//   ② dirKeys.* 声明拉取缝（形状校验 fail-soft：malformed/forge.* 保留名/撞名跳过并 warn
//      ——诊断经装配期注入的 DirKeysPullDiagFace，不直落 console，AGENTS §7）；
//   ③ 工作区分区派生（workspacePartitionsOf——.forge 初始化与审计的分区/允许集由键表
//      派生，无独立目录清单常量；解析失败 warn 降级本体键集）。
// workspace/docs 相对派生 helpers 自 lib/path dir-segments 再导出（本域消费单入口）。
// 推式登记缝（服务键 forgeDirs 的 registerDirKeys/declareDirKeys/createDirKeyRegistry）
// 与独立目的地表（DIR_DESTINATIONS/ForgeDirDestinations/proposalDir）已删——forge_resolve_path
// 的枚举/参数/校验全部由带参条目派生（§2.3）。
import { FORGE_DIR_SEGMENT } from '@dsh-forge/contracts'
import { join } from 'node:path'
import {
  FORGE_BASE_DIR_ENTRIES,
  FORGE_DIR_KEYS,
  isValidDirParam,
  resolveForgeDirs,
  type ForgeDirDeclaration,
  type ForgeDirEntry,
  type ForgeDirSources,
} from '@dsh-forge/lib-path'

export { forgeDirOfWorkspace, docsRootOfForgeDir, workspaceDocsRoot } from '@dsh-forge/lib-path'

/** 本体键清单再导出（枚举/测试/界面派生单源——lib/path FORGE_DIR_KEYS） */
export { FORGE_DIR_KEYS }

/** forge 本体十条声明（基座单源直通——forge_dirs / dirFacts / init / audit 同一声明拉取的起点） */
export const FORGE_DIRS_BASE_DECLARATION: ForgeDirDeclaration = {
  source: 'forge 本体（@dsh-forge/lib-path）',
  entries: FORGE_BASE_DIR_ENTRIES,
}

// ─────────────────── dirKeys.* 反向拉取缝（跨 scope 装配形态的声明合并） ───────────────────

/**
 * 第三方声明约定服务名前缀：声明方插件在根 scope `reflect.provide('dirKeys.<declarer>', entries)`
 * 提供自己的目录条目对象（键 = 目录键，值 = ForgeDirEntry——plugin-forge 按会话隔离实例化、
 * 声明方为全局行——跨 scope 下推式注册均被隔离过滤，唯一可达方向 = 消费侧拉取）。
 */
export const DECLARED_DIR_KEYS_PREFIX = 'dirKeys.'

/** cordis reflect 面消费子面（反向拉取缝——props 枚举约定名 + get 取值） */
export interface ReflectDeclarePullFace {
  /** 已声明服务名表（ReflectService.props——根级单例，含全部已声明属性名） */
  readonly props?: Readonly<Record<string, unknown>>
  /** 按名取服务值（未隔离名解析至根 scope 实现） */
  get(name: string): unknown
}

/**
 * 拉取缝诊断发射面（注入闭包——本模块纯函数零依赖，不 import faces；形状兼容 ForgeDiagBase
 * 子集，装配点以 emit 桥接接线）。降级不静默：缺席 = 零发射，业务行为不变。
 */
export type DirKeysPullDiagFace = (payload: { readonly level: 'warn'; readonly event: string; readonly message: string }) => void

/** 条目形状校验（fail-soft 拉取缝用——返回错误消息或 undefined = 合格） */
function entryShapeError(key: string, entry: unknown): string | undefined {
  if (key === '' || !key.includes('.')) return `目录键 '${key}' 须带声明方前缀命名空间（如 'knowledge.root'）`
  if (key.startsWith('forge.')) return `目录键 '${key}' 占用 forge.* 保留命名空间（本体权威 = @dsh-forge/lib-path）`
  const e = entry as { description?: unknown; deps?: unknown; params?: unknown; resolve?: unknown } | null
  if (e === null || typeof e !== 'object') return '条目须为对象（description/deps/resolve）'
  if (typeof e.description !== 'string' || e.description.trim() === '') return `条目 '${key}' description 须为非空字符串`
  if (!Array.isArray(e.deps) || e.deps.length === 0 || !e.deps.every((d) => typeof d === 'string')) {
    return `条目 '${key}' deps 须为非空字符串数组`
  }
  if (e.params !== undefined && (!Array.isArray(e.params) || !e.params.every((p) => p === 'slug' || p === 'localId'))) {
    return `条目 '${key}' params 须为 'slug'/'localId' 子集`
  }
  if (typeof e.resolve !== 'function') return `条目 '${key}' resolve 须为函数`
  return undefined
}

/**
 * 反向拉取第三方目录键声明（AGENTS 1.6 在场性现查——每个消费点现查，检测结果不缓存）：
 * 枚举 reflect.props 中 `dirKeys.` 前缀约定名，逐名现取条目对象（键 = 目录键），
 * 逐条形状校验（malformed 跳过不抛——查询面 fail-soft；声明方装配质量由其自测把关）；
 * forge.* 保留名与跨声明方撞名键跳过（先到者胜 + warn 留痕，不取先到不遮蔽报错语义——
 * 拉取缝是 fail-soft 合并面，硬失败留给 resolveForgeDirs 的查询期撞名报错）。
 * reflect 缺席 / 读取抛 / 约定名无值 = 该名零贡献零抛——降级径经 onDiag warn 留痕。
 */
export function collectDeclaredDirKeys(
  reflect: ReflectDeclarePullFace | undefined,
  onDiag?: DirKeysPullDiagFace,
): readonly ForgeDirDeclaration[] {
  const collected: ForgeDirDeclaration[] = []
  const knownSource = new Map<string, string>(FORGE_DIR_KEYS.map((key) => [key, 'forge 本体']))
  const props = reflect?.props
  if (props === undefined) {
    if (reflect !== undefined) {
      onDiag?.({ level: 'warn', event: 'forge-dirs-declare', message: '声明拉取缝降级：reflect 在场但 props 名表缺席，第三方 dirKeys.* 声明不可枚举' })
    }
    return collected
  }
  let conventionNames = 0
  for (const name of Object.keys(props)) {
    if (!name.startsWith(DECLARED_DIR_KEYS_PREFIX)) continue
    conventionNames += 1
    let value: unknown
    try {
      value = reflect?.get(name)
    } catch (error) {
      onDiag?.({ level: 'warn', event: 'forge-dirs-declare', message: `声明拉取缝降级：约定名 ${name} 取值抛（${error instanceof Error ? error.message : String(error)}），该名零贡献` })
      continue
    }
    if (value === null || typeof value !== 'object') {
      onDiag?.({ level: 'warn', event: 'forge-dirs-declare', message: `声明拉取缝降级：约定名 ${name} 取值非对象（条目集形态 = Record<目录键, ForgeDirEntry>），该名零贡献` })
      continue
    }
    const entries: Record<string, ForgeDirEntry<readonly never[], readonly never[]>> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const shapeError = entryShapeError(key, entry)
      if (shapeError !== undefined) {
        onDiag?.({ level: 'warn', event: 'forge-dirs-declare', message: `声明拉取缝降级：约定名 ${name} 条目 malformed 跳过（${shapeError}）` })
        continue
      }
      if (knownSource.has(key)) {
        onDiag?.({ level: 'warn', event: 'forge-dirs-declare', message: `声明拉取缝降级：目录键 ${key} 与既有声明撞名（${knownSource.get(key)} 已声明）——先到者胜出，${name} 该键跳过` })
        continue
      }
      knownSource.set(key, name)
      entries[key] = entry as ForgeDirEntry<readonly never[], readonly never[]>
    }
    if (Object.keys(entries).length > 0) collected.push({ source: name, entries })
    else {
      onDiag?.({ level: 'warn', event: 'forge-dirs-declare', message: `声明拉取缝零产出：约定名 ${name} 无一条可用条目（取值非对象/malformed/保留名/撞名）` })
    }
  }
  return collected
}

/** 合并声明视图（本体在前 + 拉取声明追加——逐查询现算，不落注册表） */
export function mergeDeclarations(pulled: readonly ForgeDirDeclaration[]): readonly ForgeDirDeclaration[] {
  return [FORGE_DIRS_BASE_DECLARATION, ...pulled]
}

/** 已声明键清单（声明序——本体十条在前、第三方按拉取序追加） */
export function declaredDirKeys(declarations: readonly ForgeDirDeclaration[]): readonly string[] {
  const keys: string[] = []
  for (const declaration of declarations) keys.push(...Object.keys(declaration.entries))
  return keys
}

/** 按键查条目（缺席 = undefined——调用方决定拒绝形态） */
export function declaredEntryOf(
  declarations: readonly ForgeDirDeclaration[],
  key: string,
): ForgeDirEntry<readonly never[], readonly never[]> | undefined {
  for (const declaration of declarations) {
    const entry = (declaration.entries as Record<string, unknown>)[key]
    if (entry !== undefined) return entry as ForgeDirEntry<readonly never[], readonly never[]>
  }
  return undefined
}

/** 解析当次声明集（直通 lib/path 单源——成环/缺依赖/撞名报错与参数校验同源） */
export function resolveDeclaredDirs(
  declarations: readonly ForgeDirDeclaration[],
  sources: ForgeDirSources,
  params: Readonly<Partial<Record<'slug' | 'localId', string>>> = {},
): Record<string, string> {
  return resolveForgeDirs(declarations, sources, params)
}

/** 参数合法性判读（lib/path 单源再导出——forge_resolve_path typed 拒绝预检用） */
export { isValidDirParam }

// ─────────────────── 工作区分区派生（.forge 初始化与审计的键表派生单点） ───────────────────

const toPosix = (p: string): string => p.replaceAll('\\', '/')

/**
 * 工作区分区派生（AC：.forge 初始化与审计的目录清单由 ForgeDirs 键表派生，无独立清单常量）：
 * 以 {workspaceRoot, dshHome:'', projectRoot:''} 注入解析全部声明键，取解析结果中落在
 * `{workspaceRoot}/{FORGE_DIR_SEGMENT}/` 下的键为分区（.forge 前缀 posix 相对路径，声明序）。
 * 解析失败 = warn 降级本体键集（本体工作区键只依赖 workspaceRoot，恒可解析）；
 * 工作区外键（如 knowledge.root = {workspaceRoot}/.knowledge）不入分区。
 */
export function workspacePartitionsOf(
  workspaceRoot: string,
  declarations: readonly ForgeDirDeclaration[],
  onDiag?: DirKeysPullDiagFace,
): readonly string[] {
  const sources: ForgeDirSources = { dshHome: '', projectRoot: '', workspaceRoot }
  let resolved: Record<string, string>
  try {
    resolved = resolveForgeDirs(declarations, sources)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    onDiag?.({ level: 'warn', event: 'forge-dirs-declare', message: `目录键解析降级（${message}）——回退本体键集派生分区` })
    resolved = resolveForgeDirs([FORGE_DIRS_BASE_DECLARATION], sources)
  }
  const prefix = toPosix(join(workspaceRoot, FORGE_DIR_SEGMENT)) + '/'
  const partitions: string[] = []
  for (const [key, abs] of Object.entries(resolved)) {
    void key
    const rel = toPosix(abs)
    if (!rel.startsWith(prefix)) continue
    partitions.push(FORGE_DIR_SEGMENT + '/' + rel.slice(prefix.length))
  }
  return partitions
}
