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

/**
 * 平台独立单段连接（dir 已归一去尾分隔符，按既有风格判定分隔符：Windows 盘符/UNC → `\`，
 * POSIX → `/`——与 prompt docsRootOfForgeDir、core derive-dir joinHome 同构口径）。
 */
function joinSegment(base: string, segment: string): string {
  const dir = base.replace(/[\\/]+$/, '')
  const sep = /^[A-Za-z]:[\\/]/.test(dir) || dir.startsWith('\\\\') ? '\\' : '/'
  return `${dir}${sep}${segment}`
}

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
 */
export const DIR_KEY_REGISTRY: readonly DirKeyEntry[] = [
  {
    dirKey: 'forge.projectHome',
    description: '宿主任务库派生根（env DSH_FORGE_TASKS_HOME > userData/forge-workspaces，随宿主形态解析）',
    resolve: (ctx) => requireAnchor(ctx, 'projectHome'),
    declaredBy: 'plugin-forge',
  },
  {
    dirKey: 'forge.taskHome',
    description: '本工作区任务管线状态库（forge.db 四域状态与任务运行日志所在；deriveTaskStoreDir 产物）',
    resolve: (ctx) => requireAnchor(ctx, 'taskHome'),
    declaredBy: 'plugin-forge',
  },
  {
    dirKey: 'forge.docsRoot',
    description: '本工作区 forge 文档根（提案/探针/圆桌纪要/特性阶段文档树之父）',
    resolve: (ctx) => (ctx.docsRoot !== undefined && ctx.docsRoot !== '' ? ctx.docsRoot : joinSegment(requireAnchor(ctx, 'forgeDir'), 'docs')),
    declaredBy: 'plugin-forge',
  },
  {
    dirKey: 'forge.tmp',
    description: '临时文件统一区（用完即清，不入 git）',
    resolve: (ctx) => joinSegment(requireAnchor(ctx, 'forgeDir'), 'tmp'),
    declaredBy: 'plugin-forge',
  },
  {
    dirKey: 'forge.worktrees',
    description: '派发工作树区（任务终态后回收）',
    resolve: (ctx) => joinSegment(requireAnchor(ctx, 'forgeDir'), 'worktrees'),
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
    anchor: 'forge.docsRoot',
    template: 'proposals/{slug}/issues/{localId}',
    requires: ['slug', 'localId'],
  },
  {
    dest: 'taskLogs',
    description: '任务执行日志目录（= forge.task_logs_dir）',
    anchor: 'forge.taskHome',
    template: 'logs/{slug}/{localId}',
    requires: ['slug', 'localId'],
  },
  {
    dest: 'proposalDir',
    description: '提案文档目录（proposal.md 及配套之父）',
    anchor: 'forge.docsRoot',
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
    dir = joinSegment(dir, replaced)
  }
  return dir
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
