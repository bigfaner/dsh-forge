// dirKey 数据源（forge-dirs-query-tool §2.1/§2.2——目录口径代码化单一事实源）。
// 定位：键注册表 + 同构解析器族——纯函数零 IO，运行时事实（projectHome/taskHome/forgeDir/
// docsRoot/slug/localId）经 ForgePathsResolveContext 注入，解析器只消费上层产物、派生链
// 单向无环（projectHome → taskHome；forgeDir → docsRoot/tmp/worktrees；锚 + slug/localId
// → 目的地）。带 IO 的只有装配层（faces.createForgePathsAnchors——经既有 projects 服务
// getProject/deriveTaskStoreDir 解析注入，本模块零涉及）。
// declare merge（§2.2）：第三方插件经 cordis 服务键 forgeDirs 的 registerDirKeys 注册面
// 声明自己的目录键，forge 合并进注册表、forgeDirs/forgeResolvePath 全量可见；forge.* 前缀
// 保留给 forge 本体（第三方占用即拒），同名互撞 fail-loud 点名两方，前缀归属由声明方自选。
// 受控面拒绝（未知 dirKey/dest、目的地 requires 缺参）的工具面 typed 承载 =
// ERR_DIR_PATH_INVALID（contracts errors.ts——tools/forge-paths.ts）。
// §2.8 散点收编：段名与平台独立连接单源 = contracts forge-dir-segments（本模块消费）；
// dossier/taskLogs 目的地派生导出（dossierIssuesDirOf/taskLogsDirOf）= 程序内拼接点
// 的单点消费位（settle 回收 / recurrence 探测 / 运行时任务目录同径）。
import { FORGE_DIR_SEGMENT } from '@dsh-forge/contracts'
import { joinDirSegment } from '@dsh-forge/path-key'

/** 解析上下文（唯一带 IO 的装配层构造——解析器族只读本形状，单测只需构造 ctx） */
export interface ForgePathsResolveContext {
  /** 宿主任务库派生根（env DSH_FORGE_TASKS_HOME > userData/forge-workspaces，随宿主形态解析） */
  readonly projectHome?: string
  /** 本工作区任务管线状态库（deriveTaskStoreDir 产物） */
  readonly taskHome?: string
  /** 本工作区 .forge 目录（workspaceRoot/.forge） */
  readonly forgeDir?: string
  /** 本工作区 forge 文档根（缺省由 forgeDir 派生 .forge/docs） */
  readonly docsRoot?: string
  /** 目的地解析参：容器 slug */
  readonly slug?: string
  /** 目的地解析参：任务 localId */
  readonly localId?: string
}

/** 目录键注册项（锚键与 declare merge 第三方键同形——description 与工具输出同源生成） */
export interface DirKeyEntry {
  /** 目录键（forge.* 本体命名空间 / 第三方插件前缀命名空间） */
  readonly dirKey: string
  /** 一句话语义（forgeDirs 输出 description 同源） */
  readonly description: string
  /** 同构解析器（纯函数零 IO——同入参同出参） */
  resolve(ctx: ForgePathsResolveContext): string
  /** 声明方标识（forge 本体 = 'plugin-forge'；第三方 = 插件名——同名互撞点名两方用） */
  readonly declaredBy?: string
}

/** 目的地键（requires 参名——slug/localId） */
export type DirDestRequire = 'slug' | 'localId'

/** 目的地注册项（锚绑定与相对模板在注册表单点——调用方不可指定锚、不可传自由路径） */
export interface DirDestinationEntry {
  /** 目的地名（forgeResolvePath dest 受控枚举成员） */
  readonly dest: string
  /** 一句话语义 */
  readonly description: string
  /** 锚键（DIR_KEY_REGISTRY 成员名——单点绑定，调用方无锚选择面） */
  readonly anchor: string
  /** 相对模板（{slug}/{localId} 占位——锚下派生路径，无自由路径面） */
  readonly template: string
  /** 必参清单（缺席 = typed 拒绝并指明缺参） */
  readonly requires: readonly DirDestRequire[]
}

// 平台独立单段连接单源 = path-key joinDirSegment（本地零副本）。

/** 锚键缺席的装配缺口（fail-loud——宿主装配恒给，缺席即装配 bug 不静默） */
function requireAnchor(ctx: ForgePathsResolveContext, key: 'projectHome' | 'taskHome' | 'forgeDir'): string {
  const v = ctx[key]
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`forge-paths: anchor prerequisite missing from resolve context: ${key}`)
  }
  return v
}

/**
 * 锚键注册表（forge 本体五键——只收稳定锚：无参、即查即得；带参派生路径不设键，
 * 经 DIR_DESTINATIONS 目的地解析）。派生链单向无环：
 * projectHome → taskHome；forgeDir → docsRoot/tmp/worktrees。
 * dirKey 命名格式（用户裁决）：forge.{snake_case}——点前缀 = 命名空间，段内蛇形。
 */
export const DIR_KEY_REGISTRY: readonly DirKeyEntry[] = [
  {
    dirKey: 'forge.project_home',
    description: '宿主任务库派生根（env DSH_FORGE_TASKS_HOME > userData/forge-workspaces，随宿主形态解析）',
    resolve: (ctx) => requireAnchor(ctx, 'projectHome'),
    declaredBy: 'plugin-forge',
  },
  {
    dirKey: 'forge.task_home',
    description: '本工作区任务管线状态库（forge.db 四域状态与任务运行日志所在；deriveTaskStoreDir 产物）',
    resolve: (ctx) => requireAnchor(ctx, 'taskHome'),
    declaredBy: 'plugin-forge',
  },
  {
    dirKey: 'forge.docs_root',
    description: '本工作区 forge 文档根（提案/探针/圆桌纪要/特性阶段文档树之父）',
    resolve: (ctx) => (ctx.docsRoot !== undefined && ctx.docsRoot !== '' ? ctx.docsRoot : joinDirSegment(requireAnchor(ctx, 'forgeDir'), 'docs')),
    declaredBy: 'plugin-forge',
  },
  {
    dirKey: 'forge.tmp',
    description: '临时文件统一区（用完即清，不入 git）',
    resolve: (ctx) => joinDirSegment(requireAnchor(ctx, 'forgeDir'), 'tmp'),
    declaredBy: 'plugin-forge',
  },
  {
    dirKey: 'forge.worktrees',
    description: '派发工作树区（任务终态后回收）',
    resolve: (ctx) => joinDirSegment(requireAnchor(ctx, 'forgeDir'), 'worktrees'),
    declaredBy: 'plugin-forge',
  },
]

/**
 * 目的地注册表（受控枚举初始集三员——带 slug/localId 的高频派生路径，锚绑定单点）。
 */
export const DIR_DESTINATIONS: readonly DirDestinationEntry[] = [
  {
    dest: 'dossier',
    description: '提案卷宗目录（T3 建模报告探测位 / settle 回收位）',
    anchor: 'forge.docs_root',
    template: 'proposals/{slug}/issues/{localId}',
    requires: ['slug', 'localId'],
  },
  {
    dest: 'taskLogs',
    description: '任务执行日志目录（= forge.task_logs_dir）',
    anchor: 'forge.task_home',
    template: 'logs/{slug}/{localId}',
    requires: ['slug', 'localId'],
  },
  {
    dest: 'proposalDir',
    description: '提案文档目录（proposal.md 及配套之父）',
    anchor: 'forge.docs_root',
    template: 'proposals/{slug}',
    requires: ['slug'],
  },
]

/** 目的地解析（纯函数：锚键解析 → 模板占位替换 → 逐段平台独立连接） */
export function resolveDestination(
  dest: DirDestinationEntry,
  anchors: Pick<ForgePathsResolveContext, 'projectHome' | 'taskHome' | 'forgeDir' | 'docsRoot'>,
  params: Pick<ForgePathsResolveContext, 'slug' | 'localId'>,
): string {
  const anchorEntry = DIR_KEY_REGISTRY.find((e) => e.dirKey === dest.anchor)
  if (anchorEntry === undefined) {
    throw new Error(`forge-paths: destination ${dest.dest} anchors unknown dirKey ${dest.anchor}（注册表内部不一致）`)
  }
  let dir = anchorEntry.resolve(anchors)
  for (const segment of dest.template.split('/')) {
    const replaced = segment.replace(/\{slug\}/g, params.slug ?? '').replace(/\{localId\}/g, params.localId ?? '')
    dir = joinDirSegment(dir, replaced)
  }
  return dir
}

// ───────────────────────── §2.8 散点收编派生导出（程序内拼接点单点消费位） ─────────────────────────

/** 段名常量再导出（contracts 单源词汇——plugin-forge 消费面单一入口） */
export { FORGE_DIR_SEGMENT } from '@dsh-forge/contracts'

/** forgeDir → 文档根（forgeDir/docs——prompt 管线段等消费） */
export function docsRootOfForgeDir(forgeDir: string): string {
  return joinDirSegment(forgeDir, 'docs')
}

/** 工作区根 → forge 目录（workspaceRoot/.forge） */
export function forgeDirOfWorkspace(wsPath: string): string {
  return joinDirSegment(wsPath, FORGE_DIR_SEGMENT)
}

/** 工作区根 → 文档根（workspaceRoot/.forge/docs——两段派生链） */
export function workspaceDocsRoot(wsPath: string): string {
  return docsRootOfForgeDir(forgeDirOfWorkspace(wsPath))
}

/** 目的地注册表查项（dest 受控枚举成员——缺席即注册表内部不一致，fail-loud） */
function dirDestinationOf(dest: string): DirDestinationEntry {
  const entry = DIR_DESTINATIONS.find((e) => e.dest === dest)
  if (entry === undefined) {
    throw new Error(`forge-paths: destination ${dest} missing from DIR_DESTINATIONS（注册表内部不一致）`)
  }
  return entry
}

/**
 * 工作区根 → 提案卷宗 issues 目录（dossier 目的地解析器单点消费——锚/模板绑定在
 * DIR_DESTINATIONS 注册表；settle 结算回收与 recurrence-faces 建模报告探测共消费，
 * 双探测位同径）。对平台原生拼写的 wsPath，与 node:path
 * join(ws, '.forge', 'docs', 'proposals', slug, 'issues', localId) 逐字节等价。
 */
export function dossierIssuesDirOf(wsPath: string, slug: string, localId: string): string {
  return resolveDestination(
    dirDestinationOf('dossier'),
    { forgeDir: joinDirSegment(wsPath, FORGE_DIR_SEGMENT) },
    { slug, localId },
  )
}

/**
 * 任务库根 → 任务执行日志目录（taskLogs 目的地解析器单点消费——= forge.task_logs_dir）。
 * 对平台原生拼写的 taskHome，与 node:path join(taskHome, 'logs', slug, localId) 逐字节等价。
 */
export function taskLogsDirOf(taskHome: string, slug: string, localId: string): string {
  return resolveDestination(dirDestinationOf('taskLogs'), { taskHome }, { slug, localId })
}

/** forgeDirs 服务键面（declare merge 注册面——第三方插件 inject 声明消费） */
export interface ForgeDirsServiceFace {
  /** 声明第三方目录键（校验通过合并进注册表；forge.* 占用/同名互撞 = fail-loud 拒绝） */
  registerDirKeys(entries: readonly DirKeyEntry[]): void
}

/** 合并注册表（forge 本体五键 + declare merge 第三方键——forgeDirs 全量查询数据源） */
export interface DirKeyRegistry {
  /** 现读全量键清单（本体在前、第三方按声明序追加） */
  entries(): readonly DirKeyEntry[]
  /** 注册面（ForgeDirsServiceFace 同形） */
  registerDirKeys(entries: readonly DirKeyEntry[]): void
}

/** 第三方目录键声明的形状校验（fail-loud：一条即抛，点名问题项） */
function validateDeclareEntry(entry: DirKeyEntry, index: number): void {
  if (typeof entry.dirKey !== 'string' || entry.dirKey.trim() === '') {
    throw new Error(`forgeDirs registerDirKeys: entries[${index}] dirKey must be a non-empty string`)
  }
  if (entry.dirKey.startsWith('forge.')) {
    throw new Error(
      `forgeDirs registerDirKeys: dirKey '${entry.dirKey}' rejected — the 'forge.*' namespace is reserved for plugin-forge itself; declare your own plugin prefix instead`,
    )
  }
  const prefix = entry.dirKey.split('.')[0]
  if (prefix === '' || !entry.dirKey.includes('.')) {
    throw new Error(
      `forgeDirs registerDirKeys: dirKey '${entry.dirKey}' rejected — third-party keys must carry a plugin prefix chosen by the declarer (e.g. 'knowledge.root')`,
    )
  }
  if (typeof entry.description !== 'string' || entry.description.trim() === '') {
    throw new Error(`forgeDirs registerDirKeys: entries[${index}] (${entry.dirKey}) description must be a non-empty string`)
  }
  if (typeof entry.resolve !== 'function') {
    throw new Error(`forgeDirs registerDirKeys: entries[${index}] (${entry.dirKey}) resolve must be a function`)
  }
}

/** 建合并注册表（装配单例——服务键 registerDirKeys 与 forgeDirs 工具共消费同一实例） */
export function createDirKeyRegistry(): DirKeyRegistry {
  const merged = new Map<string, DirKeyEntry>(DIR_KEY_REGISTRY.map((e) => [e.dirKey, e]))
  return {
    entries: () => [...merged.values()],
    registerDirKeys(entries) {
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i]!
        validateDeclareEntry(entry, i)
        const existing = merged.get(entry.dirKey)
        if (existing !== undefined) {
          // 同名 fail-loud 点名两方（不遮蔽不覆盖——前缀归属由声明方自负，撞名由此兜底）
          throw new Error(
            `forgeDirs registerDirKeys: dirKey '${entry.dirKey}' already declared by ${existing.declaredBy ?? '<unknown>'}; duplicate declaration from ${entry.declaredBy ?? '<unknown>'} rejected`,
          )
        }
        merged.set(entry.dirKey, entry)
      }
    },
  }
}

/**
 * 第三方声明 fail-soft 包装（AGENTS 1.6 在场性现查——检测永不缓存）：每次现查 forgeDirs
 * 服务面（注入方传入读取闭包），在场且 registerDirKeys 为函数才声明；forge 缺席环境
 * （未装 plugin-forge）= 零生效零抛。声明校验失败原样外抛（声明方装配期 fail-loud）。
 */
export function declareDirKeys(readForgeDirs: () => unknown, entries: readonly DirKeyEntry[]): void {
  let service: unknown
  try {
    service = readForgeDirs()
  } catch {
    return // 服务未就绪（inject proxy 抛 cannot get property）= 缺席，零生效零抛
  }
  const register = (service as { registerDirKeys?: unknown } | undefined)?.registerDirKeys
  if (typeof register !== 'function') return
  ;(register as (e: readonly DirKeyEntry[]) => void).call(service, entries)
}

// ─────────────────── 反向拉取缝（bug 04d445f4——跨 scope 装配形态的 declare merge） ───────────────────

/**
 * 第三方声明约定服务名前缀：声明方插件在根 scope `reflect.provide('dirKeys.<declarer>', entries)`
 * 提供自己的目录键数组（plugin-forge 按会话隔离实例化、声明方为全局行——跨 scope 下推式注册
 * （reflect.get / internal/service 事件）均被隔离过滤，唯一可达方向 = 消费侧拉取）。
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
 * 拉取缝诊断发射面（注入闭包——本模块纯函数零依赖，不 import faces.ts；形状兼容
 * ForgeDiagBase 子集，装配点（index.ts）以 `(p) => emitForgeDiag(diag, p)` 接线）。
 * fail-soft 降级不再静默（bug 0520cbaf）：缺席 = 零发射，业务行为不变。
 */
export type DirKeysPullDiagFace = (payload: { readonly level: 'warn'; readonly event: string; readonly message: string }) => void

/**
 * 反向拉取第三方目录键声明（AGENTS 1.6 在场性现查——每个消费点现查，检测结果不缓存）：
 * 枚举 reflect.props 中 `dirKeys.` 前缀约定名，逐名现取服务值（数组形态的 DirKeyEntry 集），
 * 逐条形状校验（malformed 跳过不抛——查询工具面 fail-soft；声明方装配质量由其自测把关），
 * 与既有键集（本体 + 推式注册）按 dirKey 去重（既有键胜出——推式/拉取双缝同键不双列）。
 * reflect 缺席 / 读取抛 / 约定名无值 = 该名零贡献零抛——降级径经 onDiag warn 留痕
 * （bug 0520cbaf：静默降级零可观测不可接受）。
 */
export function collectDeclaredDirKeys(
  reflect: ReflectDeclarePullFace | undefined,
  known: readonly string[],
  onDiag?: DirKeysPullDiagFace,
): readonly DirKeyEntry[] {
  const knownSet = new Set(known)
  const collected: DirKeyEntry[] = []
  const props = reflect?.props
  if (props === undefined) {
    if (reflect !== undefined) onDiag?.({ level: 'warn', event: 'forge-dirs-declare', message: '反向拉取缝降级：reflect 在场但 props 名表缺席，第三方 dirKeys.* 声明不可枚举' })
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
      onDiag?.({ level: 'warn', event: 'forge-dirs-declare', message: `反向拉取缝降级：约定名 ${name} 取值抛（${error instanceof Error ? error.message : String(error)}），该名零贡献` })
      continue
    }
    if (!Array.isArray(value)) continue
    for (const entry of value) {
      try {
        validateDeclareEntry(entry as DirKeyEntry, 0)
      } catch (error) {
        onDiag?.({
          level: 'warn',
          event: 'forge-dirs-declare',
          message: `反向拉取缝降级：约定名 ${name} 声明 malformed 跳过（${error instanceof Error ? error.message : String(error)}）`,
        })
        continue // malformed 声明跳过——查询面 fail-soft，不让单条坏声明砸掉 forgeDirs 全量查询
      }
      if (knownSet.has((entry as DirKeyEntry).dirKey)) continue
      knownSet.add((entry as DirKeyEntry).dirKey)
      collected.push(entry as DirKeyEntry)
    }
  }
  if (conventionNames > 0 && collected.length === 0) {
    onDiag?.({ level: 'warn', event: 'forge-dirs-declare', message: `反向拉取缝零产出：reflect.props 存在 ${conventionNames} 个 dirKeys.* 约定名但无一条可用声明（取值 undefined/非数组/malformed/既有键去重）` })
  }
  return collected
}
