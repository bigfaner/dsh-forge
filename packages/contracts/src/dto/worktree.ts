// @dsh-forge/contracts —— worktree/branch 管理 DTO。
// 通道族 forge:worktree/*（九通道：list/create/delete/ahead-behind/branches/checks/
// seal/select/resolve）的请求/响应载荷唯一源（三处一体：contracts → web/rpc
// → host ipc worktree-rpc；域实现 = packages/plugins/git-worktree——host ipc 装配透传）。
// 面分治：list/create/delete/ahead-behind/branches/checks = 管理域读+封闭写集（create/delete
// ——提案「数据源与命令面」）；seal = 封存判定快照（chip 失效态 / notice / composer 占位
// 数据源）；select = hero 选中树推送；resolve = 批量归属解析（host 身份归并单点）。
// 会话创建不经本族——官方 `session.create({ workspaceId })` 直通（移动端经
// forge:proxy/session-create 中继）；绑定 = header.cwd 推导（binding-derivation §2.1）。

/** worktree 清单条目（= 插件域 WorktreeEntry + 行渲染派生面） */
export interface WorktreeEntryDto {
  /** worktree 绝对路径（行稳定 id） */
  readonly path: string
  /** 检出分支短名（detached/bare = null） */
  readonly branch: string | null
  /** worktree 名（路径尾段） */
  readonly worktreeName: string
  /** 主 worktree 行（只展示、无删除入口） */
  readonly isMain: boolean
  /** 盘上在场性（existsSync 实存判定——git 清单 prune 前保留已删树陈旧行，不可作判据） */
  readonly present: boolean
  readonly detached: boolean
  readonly bare: boolean
  /**
   * 官方 workspace id（binding-derivation 流程 A——chip 双发数据源：session.create
   * {workspaceId} 硬前置）。list / create 返回均携带（present 行 resolveByPath 只读解析；
   * registry 缺席 / 降级面 / 盘上缺席行 = undefined 零注入）。
   */
  readonly workspaceId?: string
}

/** forge:worktree/list */
export interface WorktreeListRequest {
  /** 项目根（ws_path——ops 执行 cwd；非 git / 未注册 = isGit false 零清单） */
  readonly projectRoot: string
}
export interface WorktreeListResult {
  /** 能力位（身份归并层产出——UI 只消费；false = 全 UI 零注入） */
  readonly isGit: boolean
  /** 所配 worktree 存放目录（来源标记推断面；缺席 = 无标记） */
  readonly worktreeDir?: string
  readonly entries: readonly WorktreeEntryDto[]
}

/** forge:worktree/create（封闭写集①：fetch 前置 + worktree add -b 一体创建） */
export interface WorktreeCreateRequest {
  readonly projectRoot: string
  readonly branch: string
  /** 基准分支（默认 main 语义由 UI 层给值） */
  readonly base: string
  /** worktree 绝对路径 */
  readonly path: string
}
export interface WorktreeCreateResult {
  readonly entry: WorktreeEntryDto
}

/** forge:worktree/delete（封闭写集②：二次确认通过后 worktree remove） */
export interface WorktreeDeleteRequest {
  readonly projectRoot: string
  readonly path: string
}
export interface WorktreeDeleteResult {
  readonly removed: boolean
}

/** forge:worktree/ahead-behind（懒加载读面；无 upstream = counts null） */
export interface WorktreeAheadBehindRequest {
  readonly projectRoot: string
  readonly path: string
}
export interface WorktreeAheadBehindResult {
  readonly counts: { readonly ahead: number; readonly behind: number } | null
}

/** forge:worktree/branches（新建弹窗基准分支下拉 + 默认分支缺省值） */
export interface WorktreeBranchesRequest {
  readonly projectRoot: string
}
export interface WorktreeBranchesResult {
  readonly branches: readonly string[]
  readonly defaultBranch: string
}

/** forge:worktree/checks（删除二次确认状态清单三检查项数据源） */
export interface WorktreeChecksRequest {
  readonly projectRoot: string
  readonly path: string
}
export interface WorktreeChecksResult {
  /** 未提交变更计数（命中即拦截） */
  readonly dirtyCount: number
  /** 未 push 提交数（仅警示展示——可确认） */
  readonly aheadCount: number
  /** 挂靠会话数（命中即拦截） */
  readonly attachedSessions: number
}

/**
 * forge/binding-mismatch 载荷（binding-derivation §2.6——branch 漂移推送，经
 * /remote/forge-stream 镜像目录逐帧推送；mobile banner 触发源）。
 * drifted = true 触发（实时 branch ≠ 留痕 branch）；false 消除（切回）。
 */
export interface ForgeBindingMismatchEvent {
  readonly sessionId: string
  /** 会话 cwd（= 绑定 worktree 路径，header.cwd 推导） */
  readonly cwd: string
  /** 留痕 branch（forge/worktree-bind 创建时刻快照） */
  readonly bindBranch: string
  /** 实时 branch（host 解析面） */
  readonly branch: string
  readonly drifted: boolean
}

/** forge:worktree/seal（封存判定快照——会话头 chip / notice / composer 占位数据源） */
export interface WorktreeSealRequest {
  readonly sessionId: string
  /** 会话 cwd（host 必绑拦截判读的 cwd 探测缝——web 已知时随请求携带；缺席 = host 自探） */
  readonly cwd?: string
}
export interface WorktreeSealResult {
  /** 能力位（会话 cwd 归并产出；false = chip/notice/占位全零注入） */
  readonly isGit: boolean
  readonly sealed: boolean
  /** 挂靠绑定（无挂靠事件 = null——chip 零注入） */
  readonly binding: { readonly worktreePath: string; readonly branch: string } | null
  /** 归并项目根（ahead/behind 懒加载 cwd；无绑定 = 缺席） */
  readonly projectRoot?: string
  readonly worktreeName?: string
  /** ahead/behind 实时解析（host 解析面单点——worktree-ops aheadBehind；branch 落空 /
   *  无 upstream = null 零注入）。chip §2.3.1 内联展示数据源（随 seal 通道一次带回） */
  readonly aheadBehind?: { readonly ahead: number; readonly behind: number } | null
  /**
   * branch 漂移（binding-derivation §2.2——实时 branch ≠ forge/worktree-bind 留痕 branch）：
   * chat-view warning banner 数据源（判定随渲染现算；留痕缺席/惰性补写刚落 = null 不警示）。
   */
  readonly branchDrift?: { readonly bindBranch: string; readonly branch: string } | null
  /** 已退役（binding-derivation §2.1）：seal 改 header.cwd 推导后不再产出 blank 事件判读
   *  ——消费面回落账本 isBlank；字段保留 = 旧 web bundle 兼容读面 */
  readonly blank?: boolean
}

/**
 * forge:worktree/select（1.30 重路由的选中树推送缝）：hero 选中态变更时 web fire-and-forget
 * 推送——host 必绑拦截拒绝后重路由目标 = 该项目最近选中树（缺席回退会话 cwd 树）。
 */
export interface WorktreeSelectRequest {
  readonly projectRoot: string
  /** 选中 worktree 路径；缺席 = 清除该项目选中记忆（取消/失败路径） */
  readonly path?: string
}
export interface WorktreeSelectResult {
  readonly ok: true
}

/**
 * forge:worktree/selected（host 唯一事实源读面——bug 9eb9d6cb 后续收敛）：读该项目
 * host 侧选中记忆（select 推送的读镜像）。hero chip 回填唯一事实源——web sessionStorage
 * 记忆已退役（漂移源拆除）；host 重启后记忆为空 = 无记忆（web 走锚定链回填）。
 */
export interface WorktreeSelectedRequest {
  readonly projectRoot: string
}
export interface WorktreeSelectedResult {
  /** 选中树路径；undefined = 无记忆（重启后/未点选过） */
  readonly path?: string
}

/**
 * forge:worktree/resolve（批量归属解析——身份归并单点）：路径集 → 各自归属项目
 * （identity resolveProject：git common-dir 锚 + 主树行必胜仲裁 + 归档行跳过，
 * 与 hero 编排/必绑拦截同一归属判断基础设施）。未解析（非 git/未注册）不出现在结果。
 */
export interface WorktreeResolveRequest {
  readonly paths: readonly string[]
}
export interface WorktreeResolveEntry {
  readonly path: string
  readonly projectId: string
  readonly projectRoot: string
  readonly projectName: string
}
export interface WorktreeResolveResult {
  readonly resolved: readonly WorktreeResolveEntry[]
}
