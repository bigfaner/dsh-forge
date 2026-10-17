// installSessionCreateWrap——W3 体验层主径（提案 session-binding-guarantee §W3）：
// 装配期对官方 sessions 服务对象做 create 属性替换（host interceptRequiredBinding 同配方，
// dispose 恢复）。资格门 = 全新创建（无 sessionId）∧ workspaceId/cwd 命中注册项目行；
// 改道 = forge:worktree/sessionCreate 预铸采纳（git 与否的实质判定在 host doSessionCreate
// 逐次现跑——判非 git 抛错 → fail-open 回官方原流）；响应契约保真 = 返回预铸 Y（官方前端
// retain/open/草稿/回执原生对位，chip 出生即挂）。
//
// 三条铁律：
//   ① 内部零触碰——wrap 只有整调用改道与原样透传两种动作，不读/不改官方 createOrAdopt 分支；
//   ② 判定逐次独立——每次创建现查项目行，零缓存（git 项目可变非 git、行可增删）；
//   ③ fail-open 透传——original 永不落改道 try 域：官方自身错误原样上抛（不吞不重调），
//      改道链任何异常（项目行现查失败 / host 判非 git / RPC 失败）= 官方原流（guard 兜底）。
//
// bundle 自含纪律（client-plugin 经典 script 形状）：本文件零运行时 import——官方/contracts
// 面以结构同型镜像窄接口承载（open-session.ts / plugin.ts 先例）。

/** 官方 sessions.create 调用参窄面（UiWorkspaceService 三触点消费切片镜像） */
export interface SessionCreateCallOpts {
  readonly workspaceId?: string
  readonly cwd?: string
  /** 在场 = adopt 径（官方 reuseBlank 复用采纳）——wrap 直通零改道 */
  readonly sessionId?: string
}

/** 官方 create 方法窄面（属性替换的对象属性——调用期属性查找全命中） */
export type SessionCreateMethod = (opts?: SessionCreateCallOpts) => Promise<string>

/** forge:worktree/session-create 通道字面量（contracts WORKTREE_CHANNELS.sessionCreate 同源镜像） */
export const SESSION_CREATE_CHANNEL = 'forge:worktree/session-create'

/** 项目行窄形状（contracts ProjectSummary 消费切片：workspaceId + wsPath + archived） */
export interface ForgeProjectRowSlice {
  readonly workspaceId?: unknown
  readonly wsPath?: unknown
  readonly archived?: unknown
}

/** 项目行现查返回（forge:projects/list 行集——形状漂移容忍，由本模块正规化剔除） */
export type ProjectRowsSnapshot = readonly unknown[]

/** wrap 依赖（注入面——生产 = 页内 RPC 传输镜像，测试 = spy） */
export interface SessionCreateWrapDeps {
  /** 预铸采纳单门（forge:worktree/session-create——信封拆装由装配面承担；拒绝/异常 = reject） */
  readonly sessionCreate: (worktreePath: string) => Promise<string>
  /** 注册项目行现查（每次创建现拉零缓存——列表 RPC 逐次 fresh） */
  readonly projectRows: () => Promise<ProjectRowsSnapshot>
  /** fail-open 诊断行（缺省 console.warn——e2e/诊断消费） */
  readonly warn?: (message: string) => void
}

/** 路径归一（跨源比较键：反斜杠→斜杠 + 小写 + 去尾斜杠——worktree 选中记忆键同判） */
function normPath(value: string): string {
  const slashed = value.replaceAll('\\', '/')
  const trimmed = slashed.length > 1 && slashed.endsWith('/') ? slashed.slice(0, -1) : slashed
  return trimmed.toLowerCase()
}

/** 行正规化（非对象/缺键/空串剔除；archived 排除） */
function normalizeRow(row: unknown): { workspaceId: string; wsPath: string } | null {
  if (row === null || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  const workspaceId = record['workspaceId']
  const wsPath = record['wsPath']
  if (record['archived'] === true) return null
  if (typeof workspaceId !== 'string' || workspaceId === '') return null
  if (typeof wsPath !== 'string' || wsPath === '') return null
  return { workspaceId, wsPath }
}

/**
 * 目标树逐次判定（零缓存核心段，纯函数）：workspaceId → 注册项目 ws_path；只有 cwd →
 * cwd 命中注册行 ws_path（未注册 = null = 官方原流，非 forge/非 git 项目零行为差异）。
 * git 与否不在客户端预判——host doSessionCreate 逐次现跑实质判定。任何不命中 = null。
 */
export async function treeOf(
  opts: SessionCreateCallOpts | undefined,
  rows: ProjectRowsSnapshot,
): Promise<string | null> {
  if (opts === undefined) return null
  if (opts.sessionId !== undefined && opts.sessionId !== '') return null
  const normalized = rows.map(normalizeRow)
  const workspaceId = typeof opts.workspaceId === 'string' && opts.workspaceId !== '' ? opts.workspaceId : undefined
  if (workspaceId !== undefined) {
    return normalized.find((row) => row !== null && row.workspaceId === workspaceId)?.wsPath ?? null
  }
  const cwd = typeof opts.cwd === 'string' && opts.cwd !== '' ? opts.cwd : undefined
  if (cwd !== undefined) {
    const key = normPath(cwd)
    const match = normalized.find((row) => row !== null && normPath(row.wsPath) === key)
    return match !== null && match !== undefined ? cwd : null
  }
  return null
}

/**
 * 装配期安装（插件 apply() 内 sessions 到手后恰一次）：留底官方原方法 → 影子替换 →
 * 返回 dispose（恢复原方法，host interceptRequiredBinding 同配方；幂等）。
 * create 面缺席（上游面漂移）= 零安装零抛（no-op dispose——fail-soft，其余登记行不受累）。
 */
export function installSessionCreateWrap(
  sessions: { create?: SessionCreateMethod },
  deps: SessionCreateWrapDeps,
): () => void {
  const original = (sessions as unknown as Record<string, unknown>)['create']
  if (typeof original !== 'function') return () => {}
  const bound = (original as SessionCreateMethod).bind(sessions)
  const warn = deps.warn ?? ((message: string): void => console.warn(message))
  const wrapped = async (opts?: SessionCreateCallOpts): Promise<string> => {
    // ① adopt 径直通：带 sessionId = 官方复用采纳既有会话，改道无意义（try 域之外）
    if (opts?.sessionId !== undefined && opts.sessionId !== '') return bound(opts)
    // ② 目标树逐次独立判定（零缓存）：现查项目行；异常/不命中 = null = 官方原流
    let tree: string | null = null
    try {
      tree = await treeOf(opts, await deps.projectRows())
    } catch {
      tree = null
    }
    if (tree === null) return bound(opts)
    // ③ 改道预铸（try 域只罩改道链——original 永不落入）：git 判定与模式随档在 host
    //    doSessionCreate 逐次现跑；G3 互斥与 guard/arm 共享同树 blank 产物，零双建
    try {
      const sessionId = await deps.sessionCreate(tree)
      if (typeof sessionId !== 'string' || sessionId === '') {
        throw new Error('sessionCreate 产物缺 sessionId（形状漂移）')
      }
      return sessionId
    } catch (cause) {
      // ④ fail-open：改道链任何异常（host 判非 git / RPC 失败 / 产物漂移）= 官方原流
      //    （降级态 = 现状世界，host guard 首条消息兜底）
      warn(`[dswf-client] sessions.create 改道预铸失败（fail-open 官方原流）：${String(cause)}`)
      return bound(opts)
    }
  }
  ;(sessions as unknown as Record<string, unknown>)['create'] = wrapped
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    ;(sessions as unknown as Record<string, unknown>)['create'] = original
  }
}
