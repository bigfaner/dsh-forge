// ForgeDirs 基座：目录键接口 + 基座键（forge.home）+ 运行期注册表（拓扑解析，成环/缺依赖/
// 撞名报错）+ slug/localId 参数校验。纯函数，不做 IO——三个运行时事实（ForgeDirSources）由
// 装配层注入。业务目录键归使用它的插件就近声明（接口声明合并 + dirKeys.<插件名> 登记），
// 基座不定义业务目录；forge_dirs / forge_resolve_path 只汇总各插件声明。
// 接口形状见 .forge/specs/forge-dirs-unification/spec.md §2.1、§2.2；注释随类型一并维护。
import { join } from 'node:path'

/** 三个不可再派生的运行时事实，由装配层注入 */
export interface ForgeDirSources {
  /** 官方 dshHomePath('forge') */
  dshHome: string
  /** 项目主检出 */
  projectRoot: string
  /** 当前工作区 */
  workspaceRoot: string
}

/** 三个运行时事实的键名（依赖闭包计算的「非目录键」判据单源） */
export const FORGE_DIR_SOURCE_KEYS: readonly (keyof ForgeDirSources)[] = ['dshHome', 'projectRoot', 'workspaceRoot']

/** 调用方传入的参数名 */
export type DirParam = 'slug' | 'localId'

/** 条目可以依赖别的目录键，或依赖上面三个事实 */
export type ForgeDirDep = keyof ForgeDirs | keyof ForgeDirSources

/**
 * 目录条目：声明依赖谁、要不要参数；resolve 里只拿到声明过的名字，且都已是字符串。
 * @typeParam Deps - 依赖清单（目录键或注入事实）
 * @typeParam Params - 参数清单；省略即无参目录
 */
export interface ForgeDirEntry<Deps extends readonly ForgeDirDep[], Params extends readonly DirParam[] = []> {
  /** 一句话语义；forge_dirs 输出与界面标签同源 */
  description: string
  /** 依赖：目录键由注册表先解析，事实由装配层注入；泛型参数 Deps 记录这份清单 */
  deps: Deps
  /** 参数：由调用方传入；省略即无参目录 */
  params?: Params
  /** deps 只有 deps 列出的依赖；params 只有 params 列出的参数 */
  resolve(deps: { [K in Deps[number]]: string }, params: { [K in Params[number]]: string }): string
}

/** ForgeDirs：基座键 + 各插件经声明合并追加的键（带插件前缀） */
export interface ForgeDirs {
  /** forge 根（多插件共同依赖的根锚，故留基座） */
  'forge.home': ForgeDirEntry<['dshHome']>
}

/** 基座键清单（运行期供枚举/审计用，不含插件键） */
export const FORGE_DIR_KEYS = ['forge.home'] as const satisfies readonly (keyof ForgeDirs)[]

const pathJoin = (...segments: readonly string[]): string => join(...segments)

/** 基座登记条目：forge_dirs / forge_resolve_path 与各消费面同源，不存第二份目录数据 */
export const FORGE_BASE_DIR_ENTRIES: {
  [K in keyof ForgeDirs]: ForgeDirs[K]
} = {
  'forge.home': {
    description: 'forge 根',
    deps: ['dshHome'],
    resolve: (deps) => pathJoin(deps.dshHome, 'forge'),
  },
}

// ---------------------------------------------------------------------------
// 参数校验
// ---------------------------------------------------------------------------

const DIR_PARAM_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** slug/localId 参数是否合法：不含路径分隔符与 `..`（fore-runner 正则排除二者） */
export function isValidDirParam(value: string): boolean {
  return DIR_PARAM_PATTERN.test(value)
}

/** 校验单个目录参数，不合法时抛错并点名参数名（forge_resolve_path 与 task-loop 落盘前同源调用） */
export function assertValidDirParam(name: DirParam, value: string): string {
  if (!isValidDirParam(value)) {
    throw new Error(`forge 目录参数不合法：${name}=${JSON.stringify(value)}（须匹配 ${DIR_PARAM_PATTERN.source}）`)
  }
  return value
}

// ---------------------------------------------------------------------------
// 运行期注册表
// ---------------------------------------------------------------------------

/** 一个声明方（插件/基座）登记的目录条目；查询时现拉合并，不缓存 */
export interface ForgeDirDeclaration {
  /** 声明方名字（撞名报错时点名两方） */
  source: string
  /** 该声明方提供的条目（基座声明即基座键） */
  entries: Partial<ForgeDirs>
}

/** 注册表视角的松散条目形状（声明合并后的键类型在编译期已各自受检） */
interface ForgeDirEntryLoose {
  description: string
  deps: readonly ForgeDirDep[]
  params?: readonly DirParam[]
  resolve(deps: Record<string, string>, params: Record<string, string>): string
}

const asLoose = (entry: unknown): ForgeDirEntryLoose => entry as ForgeDirEntryLoose

/**
 * 第三方 dirKey 条目形状校验（forge-dirs-unification §2.2/§2.3 拉取缝单源——plugins/project
 * 与 plugins/task-loop 两条拉取缝共用，校验逻辑只有一份）：返回错误消息，undefined = 合格。
 * 键须带声明方前缀命名空间且不得占用 forge.* 保留名；条目须为对象且 description/deps/resolve
 * 完整（params 可选，仅 slug/localId 子集）。
 */
export function dirKeyEntryShapeError(key: string, entry: unknown): string | undefined {
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
 * 解析当次合并到的全部条目：按 deps 拓扑排序后逐键 resolve。
 * 成环报错并点名环上全部键；依赖缺席报错并点名缺席的键；同名键撞名报错并点名两个声明方——
 * 三种情况都抛错，不返回路径。参数缺席的带参条目跳过（无参形态调用，如 forge_dirs）；
 * 参数在场但不合法则抛错并点名不合法的参数。
 */
export function resolveForgeDirs(
  declarations: readonly ForgeDirDeclaration[],
  sources: ForgeDirSources,
  params: Readonly<Partial<Record<DirParam, string>>> = {},
): Record<string, string> {
  // 合并 + 撞名检测
  const sourcesOfKey = new Map<string, string[]>()
  const entries = new Map<string, ForgeDirEntryLoose>()
  for (const declaration of declarations) {
    for (const [key, entry] of Object.entries(declaration.entries)) {
      if (entry === undefined) continue
      const holders = sourcesOfKey.get(key)
      if (holders !== undefined) {
        throw new Error(
          `forge 目录键撞名：${key} 同时由声明方 ${holders.join('、')} 与 ${declaration.source} 提供，拒绝取先到者`,
        )
      }
      sourcesOfKey.set(key, [declaration.source])
      entries.set(key, asLoose(entry))
    }
  }

  const resolved = new Map<string, string>()
  /** 带参条目参数缺席的跳过标记（依赖它的条目连带跳过） */
  const SKIPPED = Symbol('skipped')

  const resolveKey = (key: string, stack: readonly string[]): string | typeof SKIPPED => {
    const cached = resolved.get(key)
    if (cached !== undefined) return cached
    const entry = entries.get(key)
    if (entry === undefined) {
      throw new Error(`forge 目录键依赖缺席：${key} 没有被任何声明方提供（需求链：${[...stack, key].join(' -> ')}）`)
    }
    if (stack.includes(key)) {
      const cycle = [...stack.slice(stack.indexOf(key)), key]
      throw new Error(`forge 目录键依赖成环：${cycle.join(' -> ')}`)
    }

    // 参数缺席的带参条目跳过；参数在场但不合法抛错点名
    const entryParams: Record<string, string> = {}
    for (const name of entry.params ?? []) {
      const value = params[name]
      if (value === undefined) return SKIPPED
      entryParams[name] = assertValidDirParam(name, value)
    }

    const deps: Record<string, string> = {}
    for (const dep of entry.deps) {
      const value =
        dep in sources ? sources[dep as keyof ForgeDirSources] : resolveKey(dep, [...stack, key])
      if (value === SKIPPED) return SKIPPED
      deps[dep] = value as string
    }
    const result = entry.resolve(deps, entryParams)
    resolved.set(key, result)
    return result
  }

  const errors: unknown[] = []
  for (const key of entries.keys()) {
    try {
      resolveKey(key, [])
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length > 0) throw errors[0]

  const result: Record<string, string> = {}
  for (const [key, value] of resolved) result[key] = value
  return result
}
