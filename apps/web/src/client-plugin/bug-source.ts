// Bug 引用 source 纯模型（定位：模型——@ 补全菜单 Bug 组的候选投影 / 原子引用插入 /
// 结构化 serialize codec / 快照缓存 / 状态口径过滤——composer-bug-reference 提案 1.1）。
//
// bundle 自含纪律（client-plugin 经典 script 形状，open-session.ts 先例）：本文件零外部
// import——官方 input-trigger 契约面（InputTriggerSource/ReferenceCodec/InputTriggerCandidate/
// ReferenceInsert/PickOutcome）与 @dsh-forge/contracts 的 BugCard/ListBugsQuery 均以结构
// 同型镜像承载（结构化类型：contracts BugCard 直接赋形兼容）。
//
// 快照语义（提案共存约束③）：pick 时落 BugCard 快照；serialize 快照优先、现查回退、
// 末级回退 id+摘要最小块——永不抛错，规避官方「serialize 失败阻断发送」语义在 bug 已
// resolve、查询落空时的误伤。
//
// quoted=true（@" 引号路径态）一律空候选——引号态是文件路径专属语义（提案共存约束①）。
// 状态面包屑口径（all/open/fixed/unresolved）作为纯参数参与候选过滤（对应 bugs.list
// status 入参；默认 all + open 优先排序）。

/** BugStatus 词汇（镜像 contracts BugStatus） */
export type BugStatusMirror = 'open' | 'fixed' | 'unresolved'

/** BugCard 结构同型镜像（字段名 = contracts BugCard 投影键——serialize 键名单源） */
export interface BugCardSource {
  bugId: string
  summary: string
  bugDesc: string
  triggerDesc: string
  expected: string
  actual: string
  suspected?: string
  errorType?: string
  bugStatus: BugStatusMirror
  commitHash?: string
  worktree?: string
  branch?: string
  unresolvedReason?: string
  fixApproach?: string
  sourceTaskId?: string
  reportSessionId?: string
  fixSessionId?: string
  reporter: string
  fixer?: string
  createdAt: string
  updatedAt: string
}

/** listBugs 查询参镜像（镜像 contracts ListBugsQuery） */
export interface BugListQuerySource {
  projectId: string
  search?: string
  status?: BugStatusMirror[]
}

/** RPC 取数缝（注入函数递达——不直连 client.ts） */
export type BugListFn = (query: BugListQuerySource) => Promise<readonly BugCardSource[]>

/** 状态面包屑口径（all = 全部三态） */
export type BugStatusScope = 'all' | BugStatusMirror

/** 状态口径全集（面包屑顺序 = all/open/fixed/unresolved） */
export const BUG_STATUS_SCOPES: readonly BugStatusScope[] = ['all', 'open', 'fixed', 'unresolved']

/** 面包屑口径 → 显示名 */
export const BUG_SCOPE_LABELS: Readonly<Record<BugStatusScope, string>> = {
  all: '全部',
  open: 'open',
  fixed: 'fixed',
  unresolved: 'unresolved',
}

/** 菜单候选行结构同型镜像（镜像 InputTriggerCandidate 消费切片） */
export interface BugTriggerCandidate {
  readonly name: string
  readonly label?: string
  readonly description?: string
  readonly hint?: string
  readonly value?: string
}

/** 面包屑行结构同型镜像（镜像 InputTriggerCrumb） */
export interface BugTriggerCrumb {
  readonly label: string
  readonly value: string
  readonly current?: boolean
}

/** 原子引用插入结构同型镜像（镜像 ReferenceInsert） */
export interface BugReferenceInsert {
  readonly source: string
  readonly ref: string
  readonly label: string
  readonly clipboardText: string
}

/** pick 载荷结构同型镜像（镜像 InputTriggerPick 消费切片） */
export interface BugTriggerPick {
  readonly candidate: BugTriggerCandidate
  readonly session: { readonly sessionId: string }
  readonly position: 'leading' | 'inline'
  readonly via: 'menu' | 'space' | 'enter'
  readonly action: 'pick' | 'drill'
}

/** 候选请求结构同型镜像（镜像 CandidateRequest 消费切片） */
export interface BugCandidateRequest {
  readonly query: string
  readonly quoted?: boolean
  readonly position: 'leading' | 'inline'
  readonly drilled: boolean
  readonly signal: AbortSignal
}

/** source 产物结构同型镜像（镜像 InputTriggerSource 的 Bug 组实现面） */
export interface BugReferenceSource {
  readonly trigger: '@'
  readonly name: string
  readonly order?: number
  candidates(
    session: { readonly sessionId: string },
    req: BugCandidateRequest,
  ): Promise<readonly BugTriggerCandidate[]>
  header?(session: { readonly sessionId: string }, req: { readonly query: string; readonly drilled: boolean }): readonly BugTriggerCrumb[] | undefined
  onPick(pick: BugTriggerPick): { readonly insert: BugReferenceInsert } | { readonly text: string } | 'handled' | undefined
  /** 当前状态口径（受控读口——测试与调用面） */
  bugStatusScope(): BugStatusScope
  /** 切换状态口径（crumb pick / 调用面） */
  setBugStatusScope(scope: BugStatusScope): void
  /** 引用 codec（clipboardText + serialize——官方 ReferenceCodec 同签名） */
  readonly codec: {
    clipboardText(ref: string): string
    serialize(ref: string, signal: AbortSignal): Promise<string>
  }
}

/** 引用前缀（ref = bug:<bugId>） */
export const BUG_REF_PREFIX = 'bug:'

/** bugId → ref */
export function bugRefOf(bugId: string): string {
  return `${BUG_REF_PREFIX}${bugId}`
}

/** ref → bugId（非 bug 引用 = undefined） */
export function bugIdOfRef(ref: string): string | undefined {
  return ref.startsWith(BUG_REF_PREFIX) ? ref.slice(BUG_REF_PREFIX.length) : undefined
}

/** 剪贴板投影：@[摘要](bug:<bugId>) */
export function clipboardTextOf(summary: string, bugId: string): string {
  return `@[${summary}](bug:${bugId})`
}

/** 状态口径纯过滤（all = 原样全列） */
export function filterBugsByScope(bugs: readonly BugCardSource[], scope: BugStatusScope): readonly BugCardSource[] {
  if (scope === 'all') return bugs
  return bugs.filter((bug) => bug.bugStatus === scope)
}

/**
 * BugCard → 结构化字段块（提案示例逐字段序：summary/bugStatus/errorType?/bugDesc/
 * triggerDesc/expected/actual/suspected?；可空字段缺席整行不出键；两空格缩进）。
 */
export function serializeBugCard(bug: BugCardSource): string {
  const lines: string[] = [`<bug bugId="${bug.bugId}">`]
  const field = (key: string, value: string | undefined): void => {
    if (value !== undefined && value !== '') lines.push(`  ${key}: ${value}`)
  }
  field('summary', bug.summary)
  field('bugStatus', bug.bugStatus)
  field('errorType', bug.errorType)
  field('bugDesc', bug.bugDesc)
  field('triggerDesc', bug.triggerDesc)
  field('expected', bug.expected)
  field('actual', bug.actual)
  field('suspected', bug.suspected)
  lines.push('</bug>')
  return lines.join('\n')
}

/** 末级回退最小块（id + 占位摘要——永不抛错口径的兜底形态） */
export function minimalBugBlock(bugId: string): string {
  return `<bug bugId="${bugId}">\n  summary: （bug 详情不可用）\n</bug>`
}

/** 登记相对时间（分级：刚刚/分钟/小时/天/月/年；非法时刻回退原串） */
export function relativeTime(iso: string, nowMs: number): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return iso
  const diff = nowMs - then
  if (diff < 60_000) return '刚刚'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`
  return `${Math.floor(months / 12)} 年前`
}

/** BugCard → 候选行投影（name=bugId / label=summary / description=状态·错误类型 / hint=相对时间） */
export function bugCandidateFrom(bug: BugCardSource, nowMs: number): BugTriggerCandidate {
  const description = bug.errorType !== undefined && bug.errorType !== '' ? `${bug.bugStatus} · ${bug.errorType}` : bug.bugStatus
  return {
    name: bug.bugId,
    label: bug.summary,
    description,
    hint: relativeTime(bug.createdAt, nowMs),
    value: bugRefOf(bug.bugId),
  }
}

/**
 * 候选集投影：状态口径过滤 + open 优先排序（stable——组内保持原序）+ 行投影。
 * 摘要关键词过滤走服务端 search 透传（非前端全量筛），此处不重复筛。
 */
export function bugCandidates(
  bugs: readonly BugCardSource[],
  options: { statusScope: BugStatusScope; nowMs: number },
): BugTriggerCandidate[] {
  const scoped = filterBugsByScope(bugs, options.statusScope)
  const open = scoped.filter((bug) => bug.bugStatus === 'open')
  const rest = scoped.filter((bug) => bug.bugStatus !== 'open')
  return [...open, ...rest].map((bug) => bugCandidateFrom(bug, options.nowMs))
}

/** 快照缓存（pick 时落 Map——serialize/clipboardText 快照优先） */
export type BugSnapshotCache = Map<string, BugCardSource>

/** 工厂依赖（projectId 解析 + RPC 注入缝 + 时钟注入——纯函数可测） */
export interface BugSourceDeps {
  /** 当前会话所属项目（接线面递达会话锚；未绑定 = undefined——Bug 组空候选 fail-soft。
   * 1.2 起 sessionId 可选入参：candidates 锚定会话精确解析，serialize 无会话位 = '' 走唯一项目兜底） */
  readonly projectId: (sessionId?: string) => string | undefined
  readonly listBugs: BugListFn
  /** 时钟（缺省 Date.now） */
  readonly now?: () => number
  /** 菜单组名（注册唯一性由官方 duplicate throw 守卫；缺省 'bug'） */
  readonly name?: string
}

/**
 * Bug 引用 source 工厂（纯模型——RPC 取数经 deps.listBugs 注入递达）。
 * candidates：quoted=true 空候选；projectId 缺席/listBugs 失败空候选 fail-soft；
 * query 透传 search、状态口径映射 status 入参。
 */
export function createBugReferenceSource(deps: BugSourceDeps): BugReferenceSource {
  const now = deps.now ?? (() => Date.now())
  const name = deps.name ?? 'bug'
  const snapshots: BugSnapshotCache = new Map()
  let scope: BugStatusScope = 'all'
  /** 最近一次 candidates 取数全卡（pick 时据此落全量快照） */
  let lastFetched: readonly BugCardSource[] = []

  function scopeQuery(): { status?: BugStatusMirror[] } {
    return scope === 'all' ? {} : { status: [scope] }
  }

  return {
    trigger: '@',
    name,
    order: 30,
    async candidates(session, req) {
      if (req.quoted === true) return []
      const projectId = deps.projectId(session.sessionId)
      if (projectId === undefined) return []
      let bugs: readonly BugCardSource[]
      try {
        const query: BugListQuerySource = { projectId, ...scopeQuery() }
        if (req.query !== '') query.search = req.query
        bugs = await deps.listBugs(query)
      } catch {
        return []
      }
      lastFetched = bugs
      return bugCandidates(bugs, { statusScope: 'all', nowMs: now() })
    },
    header(_session, _req) {
      return BUG_STATUS_SCOPES.map((value) => ({
        label: BUG_SCOPE_LABELS[value],
        value: `scope:${value}`,
        ...(value === scope ? { current: true } : {}),
      }))
    },
    onPick(pick) {
      if (pick.action === 'drill') {
        const scopeValue = pick.candidate.value
        if (scopeValue !== undefined && scopeValue.startsWith('scope:')) {
          const next = scopeValue.slice('scope:'.length)
          if ((BUG_STATUS_SCOPES as readonly string[]).includes(next)) scope = next as BugStatusScope
        }
        return 'handled'
      }
      const bugId = pick.candidate.name
      const summary = pick.candidate.label ?? bugId
      // pick 时落快照：候选来自最近取数全卡优先，缺席落最小卡（现查回退可补全）
      snapshots.set(bugId, lastFetched.find((bug) => bug.bugId === bugId) ?? {
        bugId,
        summary,
        bugDesc: '',
        triggerDesc: '',
        expected: '',
        actual: '',
        bugStatus: 'open',
        reporter: '',
        createdAt: '',
        updatedAt: '',
      })
      return {
        insert: {
          source: name,
          ref: bugRefOf(bugId),
          label: summary,
          clipboardText: clipboardTextOf(summary, bugId),
        },
      }
    },
    bugStatusScope() {
      return scope
    },
    setBugStatusScope(next) {
      scope = next
    },
    codec: {
      clipboardText(ref) {
        const bugId = bugIdOfRef(ref)
        if (bugId === undefined) return ''
        const summary = snapshots.get(bugId)?.summary
        return clipboardTextOf(summary !== undefined && summary !== '' ? summary : bugId, bugId)
      },
      async serialize(ref, _signal) {
        const bugId = bugIdOfRef(ref)
        if (bugId === undefined) return ''
        try {
          // 快照优先（全量卡——bugDesc 恒在即视为全卡）
          const snapshotted = snapshots.get(bugId)
          if (snapshotted !== undefined && snapshotted.bugDesc !== '') return serializeBugCard(snapshotted)
          // 现查回退（最小卡 / 无快照时补全字段块——serialize 无会话位，锚定走 ''）
          const projectId = deps.projectId('')
          if (projectId !== undefined) {
            const bugs = await deps.listBugs({ projectId })
            const found = bugs.find((bug) => bug.bugId === bugId)
            if (found !== undefined) {
              snapshots.set(bugId, found)
              return serializeBugCard(found)
            }
          }
          // 末级回退：id + 摘要最小块（摘要来自快照的 summary 或占位）
          return minimalBugBlock(bugId)
        } catch {
          return minimalBugBlock(bugId)
        }
      },
    },
  }
}
