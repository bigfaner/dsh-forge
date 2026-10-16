// fix-bug Bug 域 DTO（三既有子 tab 同构——proposals 面仿写）：
// BugStatus 词汇 / BugCard 列表卡 / ListBugsQuery 查询参 + BUGS_CHANNELS 负载映射。
// 载荷映射键 = channels.ts BUGS_CHANNELS 键——三处一体的 DTO 侧落点。
// recordBug/resolveBug 写动词不上 RPC（agent tool 专属——channels.ts 面分治纪律）。
// 定位铁律：纯类型与纯常量，零逻辑零依赖。
import { BUG_STATUSES, type BugStatus } from '../labels.js'

// 词汇面重导出（BugStatus 单源 labels.ts——DTO 侧统一出口）
export { BUG_STATUSES }
export type { BugStatus }

/**
 * Bug 列表卡（概览 Bug 子 tab 行 + BugDialog 详情弹框共载体——单表行全量投影：
 * 列表主行 = summary/bugStatus/errorType/createdAt，弹框 kv 区 = 五字段 + 证据 + 人员 +
 * 会话 pill + 来源任务标识；缺省键 = 对应列 NULL）。
 */
export interface BugCard {
  /** uuid 代理主键（回填引用锚——resolveBug 的 bug_id） */
  bugId: string
  /** 一句话摘要（≤50 字，登记时生成——列表主行 + search 命中面） */
  summary: string
  /** Bug：完整描述 */
  bugDesc: string
  /** Trigger：复现步骤/输入 */
  triggerDesc: string
  /** Expected：正确行为 */
  expected: string
  /** Actual：观察到的行为 */
  actual: string
  /** Suspected location（file:line——open 态续修线索，可空） */
  suspected?: string
  /** 错误类型（自由标注——统计维度备料，可空） */
  errorType?: string
  bugStatus: BugStatus
  /** fixed 证据三件（回填时写） */
  commitHash?: string
  worktree?: string
  branch?: string
  /** unresolved 原因（回填时写） */
  unresolvedReason?: string
  /** 修复方案总结（fixed 回填时写——采用了什么修法、为何此修法；一段话，台账审查面） */
  fixApproach?: string
  /** coding-fix 委托来源任务（uuid；standalone 路径缺席） */
  sourceTaskId?: string
  /** 发现会话（登记时写） */
  reportSessionId?: string
  /** 修复会话（fixed 回填时写） */
  fixSessionId?: string
  /** 发现者（git user.name，缺席回退 user.email） */
  reporter: string
  /** 修复者（fixed 回填时写） */
  fixer?: string
  /** 登记时刻（ISO-8601） */
  createdAt: string
  /** 回填时刻（未回填 = createdAt；ISO-8601） */
  updatedAt: string
  /**
   * 复发链前驱指针：本条登记时链上时间最近一条的 bug_id（链表式——读作「本条是 X 的复发」）。
   * 登记时写入、终态后不可改；链根缺省；指向的 bug_id 必须存在（悬空引用拒写）。
   */
  recurrenceOf?: string
}

/**
 * 链上下文投影（getBug 链区 + 列表链折叠共载体）：沿 recurrenceOf 前驱指针反向展开后的
 * 链快照——时间正序（链根在前），当前条位置由索引定位；孤条（无前驱无后继）不入投影。
 */
export interface BugChainContext {
  /** 链上全部条目（时间正序，链根 = [0]） */
  entries: BugCard[]
  /** 本条在链上序位（0-based；entries[currentIndex] = 本条） */
  currentIndex: number
  /** 链上条数 = entries.length（复发次数 = 链上条数 − 1，派生值不落字段） */
  length: number
  /** 链根 bug_id（= entries[0].bugId） */
  rootBugId: string
}

/**
 * listBugs 查询（主 agent 专属查询工具——服务端承载；sort 三既有子 tab 同构：
 * active = 活跃优先 / created = 最新创建）。
 */
export interface ListBugsQuery {
  projectId: string
  /**
   * 搜索词：关键词命中六字段任一（summary / bugDesc / triggerDesc / expected / actual /
   * errorType）即返回该行；缺省 = 不过滤。
   */
  search?: string
  /** 状态过滤 chips（空/缺省 = 全部三态） */
  status?: BugStatus[]
  /** 活跃优先 / 最新创建 */
  sort?: 'active' | 'created'
  /** 分页偏移（服务端排序后切片；缺省 = 0） */
  offset?: number
  /** 分页页大小（缺省 = 全量返回） */
  limit?: number
}

/** getBug 查询（主 + worker 面——按 bug_id 取单条全卡与链上下文） */
export interface GetBugQuery {
  projectId: string
  bugId: string
}

/** getBug 响应（全卡 + 链上下文；孤条 chain 缺席——单条 bug 弹框语言不变） */
export interface GetBugResponse {
  card: BugCard
  chain?: BugChainContext
}

/** commit 变更文件行（git show --name-status 解析——fixed 证据的变更内容呈现） */
export interface BugCommitFile {
  path: string
  /** git name-status 字母（A/M/D/R…；R 取新路径） */
  status: string
}

/** commitFiles 查询（变更文件清单——只读 git show，主仓 cwd 跨 worktree 同对象库） */
export interface BugCommitFilesQuery {
  projectId: string
  commitHash: string
}

/** fileDiff 查询（单文件 unified diff） */
export interface BugFileDiffQuery {
  projectId: string
  commitHash: string
  path: string
}

/** forge:bugs/* 请求负载（键 = BUGS_CHANNELS 键；recordBug/resolveBug 写动词不上 RPC；
 *  getBug = worker forge 面 agent tool 读径，不走 RPC——channels.ts 面分治纪律） */
export interface BugsChannelRequests {
  list: ListBugsQuery
  commitFiles: BugCommitFilesQuery
  fileDiff: BugFileDiffQuery
}

/** forge:bugs/* 响应负载（键 = BUGS_CHANNELS 键） */
export interface BugsChannelResponses {
  list: BugCard[]
  commitFiles: BugCommitFile[]
  fileDiff: { diff: string }
}
