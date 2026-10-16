// @dsh-forge/contracts —— worktree/branch 管理 DTO（worktree-branch-management fix-2）。
// 通道族 forge:worktree/*（九通道）的请求/响应载荷唯一源（三处一体：contracts → web/rpc
// → host ipc worktree-rpc；域实现 = packages/plugins/git-worktree——host ipc 装配透传）。
// 面分治：list/create/delete/ahead-behind/branches/checks = 管理域读+封闭写集（create/delete
// ——提案「数据源与命令面」）；attach = 挂靠事件唯一写入口的 UI 调用点；session-create =
// 建会话 meta.cwd 注入（sessionController.create({cwd}) 单门）；seal = 封存判定快照
// （chip 失效态 / notice / composer 占位三通道数据源）。

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
  /** 盘上在场性（git worktree list 派生——恒 true；保留字段对齐 UI 行模型） */
  readonly present: boolean
  readonly detached: boolean
  readonly bare: boolean
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

/** forge:worktree/attach（挂靠事件唯一写入口的 UI 调用点——选择控件确认时） */
export interface WorktreeAttachRequest {
  readonly sessionId: string
  readonly worktreePath: string
  /** 分支（清单行携带；缺省 = host 自查 worktree list） */
  readonly branch?: string
}
export interface WorktreeAttachResult {
  readonly attached: true
  readonly branch: string
  readonly seq: number
}

/**
 * forge:worktree/session-create（1.16 预铸采纳配方——单 RPC 原子）：
 * host 预铸会话（persistence.create 自铸 id + worktreePath cwd 头 → 初始句柄写挂靠事件
 * seq 0 → close）→ controller.create({sessionId, cwd}) 官方 adopt/resume——写句柄生命
 * 周期零交叠，单写者铁律满足（活会话上不再另开写句柄）。
 */
export interface WorktreeSessionCreateRequest {
  /** 挂靠 worktree 绝对路径（预铸 SessionHeader.cwd 定死——官方 adopt 校验 header.cwd 相等） */
  readonly worktreePath: string
}
export interface WorktreeSessionCreateResult {
  readonly sessionId: string
  /** 挂靠分支（host 自查 worktree list——预铸挂靠事件内同一值） */
  readonly branch: string
}

/** forge:worktree/seal（封存判定快照——会话头 chip / notice / composer 占位数据源） */
export interface WorktreeSealRequest {
  readonly sessionId: string
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
}
