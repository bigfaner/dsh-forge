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
}

/**
 * listBugs 查询（服务端承载——search 命中 summary 主行面；status 状态 chips 过滤；
 * sort 三既有子 tab 同构：active = 活跃优先 / created = 最新创建）。
 */
export interface ListBugsQuery {
  projectId: string
  /** 搜索词（summary 匹配；缺省 = 不过滤） */
  search?: string
  /** 状态过滤 chips（空/缺省 = 全部三态） */
  status?: BugStatus[]
  /** 活跃优先 / 最新创建 */
  sort?: 'active' | 'created'
}

/** forge:bugs/* 请求负载（键 = BUGS_CHANNELS 键；recordBug/resolveBug 写动词不上 RPC） */
export interface BugsChannelRequests {
  list: ListBugsQuery
}

/** forge:bugs/* 响应负载（键 = BUGS_CHANNELS 键） */
export interface BugsChannelResponses {
  list: BugCard[]
}
