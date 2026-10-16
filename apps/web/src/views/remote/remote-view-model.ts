// 手机受限视图模型（定位：业务——mobile-remote-approval 1.3 的纯派生层）。
// 数据单源纪律：进度只来自 forge:remote/progress 只读通道（1.1——服务端直读 forgeTasks
// listTasks/taskStats），本模块零缓存零副本，只做行分组/排序/相位派生。
// 待审批语义（低风险假设，提案验收 3 承载）：progress 通道无审批读面（1.1 契约 approval
// 仅决策转发、产品不自持审批状态）→ 待审批项 = taskStatus 'blocked'（阻塞等待人工处置），
// 高亮置顶；正式审批请求高亮面待 1.4 审批桥接落地后由通道扩面承接，本层排序键单点替换。

import { TASK_STATUSES, type RemoteProgressSnapshot, type TaskCard, type TaskStatus } from '@dsh-forge/contracts'

/** 受限视图行带（待审批高亮置顶 / 进行中派发 / 其余） */
export type RemoteRowBand = 'approval' | 'active' | 'rest'

/** 受限视图行（任务卡 + 带——渲染层零再判读） */
export interface RemoteListRow {
  readonly band: RemoteRowBand
  readonly task: TaskCard
}

/** 非终态带归属（blocked = 待审批高亮组；in_progress = 进行中派发；其余 = rest） */
function bandOf(status: TaskStatus): RemoteRowBand {
  if (status === 'blocked') return 'approval'
  if (status === 'in_progress') return 'active'
  return 'rest'
}

/**
 * 进度快照 → 受限视图行序（纯派生）：blocked（待审批）置顶带、in_progress 次带、其余殿后；
 * 各带内按自然键 `slug/localId`（slug 稳定、localId 数值序——TaskCard 无时间戳字段）。
 * 快照缺席/畸形 = 空行集（空态面）。
 */
export function remoteListRowsOf(snapshot: RemoteProgressSnapshot | undefined): RemoteListRow[] {
  const tasks = snapshot?.tasks
  if (!Array.isArray(tasks)) return []
  const rank: Record<RemoteRowBand, number> = { approval: 0, active: 1, rest: 2 }
  const keyOf = (task: TaskCard): string => `${task.slug}/${String(task.localId).padStart(8, '0')}`
  return [...tasks]
    .map((task): RemoteListRow => ({ band: bandOf(task.taskStatus), task }))
    .sort((a, b) => {
      if (rank[a.band] !== rank[b.band]) return rank[a.band] - rank[b.band]
      return keyOf(b.task).localeCompare(keyOf(a.task))
    })
}

/**
 * fix-30 ④：多项目进度快照合并（纯派生）：任务拼接 + stats 逐字段求和（七态全键）。
 * 缺席项跳过；全缺席 = undefined（数据面失败语义保持）；空项目集 = 零快照（空态呈现）。
 * Root cause: 受限视图此前锚定 projects/list 首项（created_at 最旧且含 archived）为唯一
 * projectId 查 progress——多项目场景查错库，桌面有任务手机恒「暂无任务」。
 */
export function mergeRemoteSnapshots(
  snapshots: readonly (RemoteProgressSnapshot | undefined)[],
): RemoteProgressSnapshot | undefined {
  const present = snapshots.filter((s): s is RemoteProgressSnapshot => s !== undefined)
  if (snapshots.length === 0) {
    return {
      tasks: [],
      stats: {
        total: 0,
        byStatus: Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>,
        unmetPending: 0,
      },
    }
  }
  if (present.length === 0) return undefined
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>
  let unmetPending = 0
  let total = 0
  for (const snapshot of present) {
    for (const status of TASK_STATUSES) {
      byStatus[status] += snapshot.stats?.byStatus?.[status] ?? 0
    }
    unmetPending += snapshot.stats?.unmetPending ?? 0
    total += snapshot.stats?.total ?? 0
  }
  return { tasks: present.flatMap((snapshot) => snapshot.tasks ?? []), stats: { total, byStatus, unmetPending } }
}

/**
 * 受限单页入口判定：URL 查询参数 `forgeRemote=1`（手机浏览器书签/桌面向导生成的入口形态；
 * 独立单页 = 无侧栏/dock/对话，经 main.ts 分支直挂——不进官方壳）。
 */
export function isRestrictedRemoteViewLocation(location: { search: string; hash: string }): boolean {
  return /(?:^\?|&)(?:forgeRemote=1)(?:&|$)/.test(location.search)
}

/**
 * fix-18 ⑤ 受限单页入口 cookie 读数缝：`dswf_forge_remote=1`（/pair 与 /pair/verify 成功面
 * Set-Cookie——host child.ts REMOTE_VIEW_COOKIE 单源）。官方 BrowserAuth 对携 token 的
 * GET / 铸会话 cookie 后 303 重定向到 "./"，查询串（forgeRemote=1）被结构性剥除——分支位
 * 改经第一方 cookie 跨重定向存活，本谓词与 isRestrictedRemoteViewLocation 并联消费
 * （main.ts 分支）。严格 =1 判定（他值/前缀相似键不命中）。
 */
export function isRestrictedRemoteViewCookie(cookie: string): boolean {
  return /(?:^|;\s*)dswf_forge_remote=1(?:;|$)/.test(cookie)
}

/**
 * fix-22 诊断日志面②：web 入口分流判定读数（纯派生——命中分支 + 双谓词各自命中位，
 * main.ts 落判定行用）。两谓词并联消费，判定只读不改变 main.ts 分支语义。
 */
export function remoteViewDecisionOf(
  location: { search: string; hash: string },
  cookie: string,
): { branch: 'restricted' | 'shell'; viaLocation: boolean; viaCookie: boolean } {
  const viaLocation = isRestrictedRemoteViewLocation(location)
  const viaCookie = isRestrictedRemoteViewCookie(cookie)
  return { branch: viaLocation || viaCookie ? 'restricted' : 'shell', viaLocation, viaCookie }
}

/**
 * fix-22 诊断日志面②：决策行文本（单行——控制字符剥离 + 260 字符上限，宿主侧
 * sanitizeLogLine 二次消毒兜底）。带 search/hash 读数与 referrer（BrowserAuth 303 带
 * no-referrer——referrer 空值本身即兑现链证据位）。
 */
export function remoteViewDecisionLine(
  decision: ReturnType<typeof remoteViewDecisionOf>,
  location: { search: string; hash: string },
  referrer: string,
): string {
  const oneLine = (value: string): string => value.replace(/[\r\n\t\0]+/g, ' ')
  const raw = `branch=${decision.branch} viaLocation=${decision.viaLocation} viaCookie=${decision.viaCookie} search=${oneLine(location.search)} hash=${oneLine(location.hash)} referrer=${oneLine(referrer)}`
  return raw.length > 260 ? raw.slice(0, 260) : raw
}
