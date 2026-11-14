// bugs 域服务（plugin-project 1.11 归拢——code-design §5；本体自 core small-domains/bugs.ts
// 承袭，零语义改动）：registerBug/resolveBug/listBugs/getBug/findRecurrenceCandidates/
// aggregateByErrorType/commitFiles/fileDiff。存储 = project.db BugsRepo（行级读写门唯一持
// SQL——域内禁直持 SQL）；行级归属键 project_key NOT NULL（I5：派生失败拒写）；契约类型
// 单源 = lib/api dto/bugs（RegisterBugInput/ResolveBugInput/RegisterBugResult/
// BugRecurrenceScope）；服务缝契约 = lib/api ports BugsServicePort（tool = 薄封装消费）。
//
// 状态机：open→fixed｜unresolved 单向（终态再迁移 ERR_BUG_ALREADY_RESOLVED 拒绝——并发
// 窗口由 repo.resolveIfOpen 单语句守卫收口）；summary ≤50 字超长拒写；fixed 必带
// commit_hash（agent 原子提交后捕获，工具不自取 HEAD）；unresolved 必带因。
// recurrence_of：登记时一次写入；弱引用格式校验（parseBugRef 非法拒写）+ 事务外悬空预检
// 拒写（RED 锚⑤——bugs 无删除动词无 TOCTOU 窗口）；链根缺省。
// 写动词闭包尾部 notify（装配注入——子 tab 刷新依赖；缺席 = 零通知降级）。
// git 解析径（execFile 注入 + 恒数组参 + 2s 超时 + 失败同路 fail-soft）：
// - 身份：git config user.name 缺席回退 user.email 双缺席 '(unknown)'（reporter NOT NULL）；
// - fixed 证据反查：commit_hash 锚 porcelain 匹配 → 回退 branch --contains → 双败照落。
import { randomUUID } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import type {
  BugCard,
  BugCommitFile,
  BugCommitFilesQuery,
  BugErrorTypeAggregate,
  BugFileDiffQuery,
  BugRecurrenceCandidate,
  BugRecurrenceScope,
  GetBugQuery,
  GetBugResponse,
  ListBugsQuery,
  RegisterBugInput,
  RegisterBugResult,
  ResolveBugInput,
} from '@dsh-forge/contracts'
import { BUG_STATUS_LABELS } from '@dsh-forge/contracts'
import { emitDiagOrFallback, type DiagEventPayload } from '@dsh-forge/lib-diag'
import type { BugsRepo, BugResolvePatch } from '../db/repositories/bugs.js'
import type { BugRow } from '../db/row-types.js'
import {
  BugAlreadyResolvedError,
  BugCoverageDeclarationRequiredError,
  BugNotFoundError,
  BugProjectKeyRequiredError,
  BugRecurrenceDanglingError,
  BugRecurrenceInvalidError,
  BugSummaryTooLongError,
  CommitHashRequiredError,
  ReasonRequiredError,
} from './errors.js'
import {
  buildBugChainContext,
  findRecurrenceCandidatesOf,
  parseBugCoverageDeclaration,
  parseBugRef,
  projectBug,
} from './recurrence.js'

// ── git 解析径（只读封闭子命令集；core 同刻度承袭）──

/** git 只读子命令封闭集（本域用 config/worktree/branch/show——均只读语义） */
export const GIT_BUG_SUBCOMMANDS = ['config', 'worktree', 'branch', 'show'] as const

/** 只读查找超时（git-lookup 同刻度 2s） */
export const GIT_BUG_TIMEOUT_MS = 2000

/** commit hash 形校验（7-40 位十六进制——RPC 读面入参防脏） */
const COMMIT_HASH_RE = /^[0-9a-fA-F]{7,40}$/

/** diff 载荷上限（200KB——超大 diff 截断防护，UI 侧滚动呈现） */
export const BUG_DIFF_MAX_CHARS = 200_000

/** 双缺席身份占位（reporter/fixer NOT NULL——git 可选依赖 fail-soft 落值） */
export const GIT_IDENTITY_FALLBACK = '(unknown)'

/** execFile 注入面（恒 (command, args 数组, options, callback) 四参） */
export type GitExecFile = (
  command: string,
  args: readonly string[],
  options: { cwd: string; timeout: number },
  callback: (
    error: (Error & { code?: string | number | null }) | null,
    stdout: string,
    stderr: string,
  ) => void,
) => void

/** 生产 execFile（[...args] 拷贝入参——数组参字面锚） */
const defaultExecFile: GitExecFile = (command, args, options, callback) => {
  execFileCallback(command, [...args], options, callback)
}

/** git 单子命令运行（恒数组参零 shell 拼接；ENOENT/失败/超时同路 → null——可选依赖） */
function runGit(execFile: GitExecFile, cwd: string, args: readonly string[]): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile('git', args, { cwd, timeout: GIT_BUG_TIMEOUT_MS }, (error, stdout) => {
        resolve(error !== null || stdout === '' ? null : stdout)
      })
    } catch {
      resolve(null) // 注入面同步异常同路回退
    }
  })
}

/**
 * 身份解析（git config user.name，缺席回退 user.email，双缺席 '(unknown)'）。
 * 输出 trim 后取首行——config 值即单行。
 */
export async function resolveGitIdentity(execFile: GitExecFile, cwd: string): Promise<string> {
  for (const key of ['user.name', 'user.email']) {
    const out = await runGit(execFile, cwd, ['config', key])
    const line = out?.split('\n')[0]?.trim()
    if (line !== undefined && line !== '') return line
  }
  return GIT_IDENTITY_FALLBACK
}

/** fixed 证据（hash 锚定反查产物） */
export interface FixEvidence {
  readonly worktree?: string
  readonly branch?: string
}

/**
 * fixed 证据反查（commit_hash 锚）：
 * ① `git worktree list --porcelain` 空行分块，HEAD==hash（大小写不敏感 trim 比较）命中 →
 *    worktree + branch 短名；
 * ② 未命中 → `git branch --contains <hash>` 首非空行剥前缀 → branch、worktree 置空；
 * ③ 双径全败（git 缺席/hash 未知）→ 证据双缺（不拒写——fixed 行照落）。
 */
export async function resolveFixEvidence(
  execFile: GitExecFile,
  q: { readonly cwd: string; readonly commitHash: string },
): Promise<FixEvidence> {
  const hash = q.commitHash.trim().toLowerCase()
  const porcelain = await runGit(execFile, q.cwd, ['worktree', 'list', '--porcelain'])
  if (porcelain !== null) {
    let worktree: string | undefined
    let head: string | undefined
    let branch: string | undefined
    const flush = (): FixEvidence | null => {
      if (head !== undefined && head.toLowerCase() === hash) {
        return { worktree, ...(branch !== undefined ? { branch } : {}) }
      }
      return null
    }
    for (const line of porcelain.split('\n')) {
      if (line.startsWith('worktree ')) worktree = line.slice('worktree '.length).trim()
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length).trim()
      else if (line.startsWith('branch refs/heads/')) branch = line.slice('branch refs/heads/'.length).trim()
      else if (line.trim() === '') {
        const hit = flush()
        if (hit !== null) return hit
        worktree = head = branch = undefined
      }
    }
    const hit = flush() // 末块无尾空行
    if (hit !== null) return hit
  }
  // 回退：branch --contains（worktree 置空——提交后分支又推进的既定语义）
  const contains = await runGit(execFile, q.cwd, ['branch', '--contains', hash])
  const line = contains?.split('\n').find((l) => l.trim() !== '')
  const branchName = line?.replace(/^\*\s*/, '').trim()
  return branchName !== undefined && branchName !== '' ? { branch: branchName } : {}
}

// ── 服务面 ──

/** summary 字数上限（字 = Unicode 码点——全角汉字一字一计） */
export const BUG_SUMMARY_MAX_CHARS = 50

/** errorType 参考集合限量（词表收敛供 LLM 参考——高频优先；零机械归类） */
export const ERROR_TYPE_SUGGESTIONS_LIMIT = 20

export interface BugsServiceDeps {
  /** project.db bugs 行级读写门（域内唯一持 SQL——repositories 单点） */
  readonly bugs: BugsRepo
  /** 行级归属键派生缝（I5）：projectId → project_key；null/空 = 派生失败拒写。
   * b5707fe4 起支持异步派生（core 代 projectId 走 registry 官方锚兜底链——project-key.ts） */
  readonly resolveProjectKey: (projectId: string) => string | null | Promise<string | null>
  /** git 解析径 cwd（fixed 证据反查/身份解析——归属解析链供 main 行路径） */
  readonly resolveMainPath: (projectId: string) => string
  /** execFile 注入（测试桩受控成败——生产缺省 node:child_process） */
  readonly execFile?: GitExecFile
  /** 写动词闭包尾部通知缝（子 tab 刷新依赖——装配注入；缺席 = 零通知降级） */
  readonly notify?: (projectId: string) => void
  /** 失败路径诊断缝（clean-code-review P1-3——bugs 域零诊断站点收口；缺席 = 零 emit 纯增量）。
   *  装配注入 diag 单源（projects/errors.ts diag）；测试注入收集闭包。 */
  readonly onDiag?: ((payload: Omit<DiagEventPayload, 'process'>) => void) | undefined
}

/** bug 卡 search 键集（七字段任一命中——summary/bugDesc/triggerDesc/expected/actual/
 * errorType/suspected 位置；另携状态中英标签——列表标签命中同构） */
export function bugSearchKeys(card: BugCard): readonly string[] {
  return [
    card.summary,
    card.bugDesc,
    card.triggerDesc,
    card.expected,
    card.actual,
    ...(card.errorType !== undefined ? [card.errorType] : []),
    ...(card.suspected !== undefined ? [card.suspected] : []),
    BUG_STATUS_LABELS[card.bugStatus].zh,
    BUG_STATUS_LABELS[card.bugStatus].en,
  ]
}

// ── list 纯助手（三小域列表面共用口径——core list-utils 承袭，bug 域局部承载）──

/** search 匹配：大小写不敏感子串；空/纯空白 = 全量放行。 */
function matchesSearch(search: string | undefined, haystacks: readonly string[]): boolean {
  const q = (search ?? '').trim().toLowerCase()
  if (q === '') return true
  return haystacks.some((h) => h.toLowerCase().includes(q))
}

/** active/created 排序（纯函数，返回新数组）：created = created_at 降序 id 决胜；
 * active = 非终态在前、终态在后，两组内各按 created 降序 + id 决胜。 */
function sortByActiveThenCreated<T>(
  cards: readonly T[],
  keys: { active: 'active' | 'created'; isTerminal: (c: T) => boolean; createdAt: (c: T) => string; id: (c: T) => string },
): T[] {
  const byCreatedDesc = (a: T, b: T): number => {
    const ca = keys.createdAt(a)
    const cb = keys.createdAt(b)
    if (ca !== cb) return ca < cb ? 1 : -1 // 降序（字符串 ISO 比较）
    const ia = keys.id(a)
    const ib = keys.id(b)
    return ia < ib ? -1 : ia > ib ? 1 : 0
  }
  const copy = [...cards]
  if (keys.active === 'created') return copy.sort(byCreatedDesc)
  return copy.sort((a, b) => {
    const ta = keys.isTerminal(a) ? 1 : 0
    const tb = keys.isTerminal(b) ? 1 : 0
    if (ta !== tb) return ta - tb // 非终态（0）在前
    return byCreatedDesc(a, b)
  })
}

export function createBugsService(deps: BugsServiceDeps) {
  const execFile = deps.execFile ?? defaultExecFile
  /** 失败路径 warn 留痕（P1-3——git 解析径 fail-soft 吞错面统一诊断出口；fire-and-forget）。
   *  发射面 = lib-diag emitDiagOrFallback 单源（缝缺席 console 按级兜底——诊断不静默；
   *  四域互禁边界约束下不经 projects/errors.ts 桥）。 */
  const emit = (event: 'bug-git-identity' | 'bug-git-evidence', message: string): void => {
    emitDiagOrFallback(deps.onDiag, { event, level: 'warn', message })
  }
  /** 归属圈定（I5）：projectId → project_key；派生失败拒写/拒读（行级归属键 NOT NULL） */
  const keyOf = async (projectId: string): Promise<string> => {
    const k = await deps.resolveProjectKey(projectId)
    if (k === null || k === '') throw new BugProjectKeyRequiredError({ projectId })
    return k
  }
  const byId = (rows: readonly BugRow[], id: string): BugRow | undefined => rows.find((r) => r.id === id)
  /** errorType 参考集合（词表收敛 T1）：distinct errorType——高频优先、同频词面升序、限量；
   * 空白词不计；只读聚合零机械归类。 */
  const suggestions = (projectKey: string): readonly string[] => {
    const counts = new Map<string, number>()
    for (const r of deps.bugs.listByProject(projectKey)) {
      const t = (r.errorType ?? '').trim()
      if (t === '') continue
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => (a[1] === b[1] ? (a[0] < b[0] ? -1 : 1) : b[1] - a[1]))
      .slice(0, ERROR_TYPE_SUGGESTIONS_LIMIT)
      .map(([t]) => t)
  }
  /** 定位本行（404 + 归属圈定守卫——单库多项目下他项目 bugId 不穿透） */
  const locate = async (projectId: string, bugId: string): Promise<{ key: string; row: BugRow }> => {
    const key = await keyOf(projectId)
    const row = byId(deps.bugs.listByProject(key), bugId)
    if (row === undefined) throw new BugNotFoundError({ projectId, bugId })
    return { key, row }
  }
  return {
    /** 登记 → open 行 + errorType 参考集合（summary ≤50 字；I5 归属键派生失败拒写；
     * recurrence_of 弱引用格式校验 + 事务外悬空预检拒写；reporter 经 git 解析——写前 await） */
    async registerBug(input: RegisterBugInput): Promise<RegisterBugResult> {
      const summary = input.summary.trim()
      if (Array.from(summary).length > BUG_SUMMARY_MAX_CHARS) {
        throw new BugSummaryTooLongError({ summary, max: BUG_SUMMARY_MAX_CHARS })
      }
      const projectKey = await keyOf(input.projectId)
      const cwd = deps.resolveMainPath(input.projectId)
      const reporter = await resolveGitIdentity(execFile, cwd)
      if (reporter === GIT_IDENTITY_FALLBACK) {
        emit('bug-git-identity', `git 身份双缺席（config user.name/user.email 皆不可用）——reporter 落占位 ${GIT_IDENTITY_FALLBACK}：projectId=${input.projectId}`)
      }
      const recurrenceOfRaw = input.recurrenceOf?.trim() || undefined
      if (recurrenceOfRaw !== undefined) {
        // 弱引用格式校验先于在场性预检（非法形制直接拒写——零 IO）；悬空引用事务外预检拒写
        //（bugs 无删除动词无 TOCTOU 窗口——校验先于写零副作用）
        const ref = parseBugRef(recurrenceOfRaw)
        if (ref === null) throw new BugRecurrenceInvalidError({ recurrenceOf: recurrenceOfRaw })
        if (!deps.bugs.exists(ref)) throw new BugRecurrenceDanglingError({ recurrenceOf: ref })
      }
      const bugId = randomUUID()
      const now = new Date().toISOString()
      const row: BugRow = {
        id: bugId,
        projectKey,
        summary,
        bugDesc: input.bugDesc,
        triggerDesc: input.triggerDesc,
        expected: input.expected,
        actual: input.actual,
        suspected: input.suspected ?? null,
        errorType: input.errorType ?? null,
        bugStatus: 'open',
        commitHash: null,
        worktree: null,
        branch: null,
        unresolvedReason: null,
        fixApproach: null,
        sourceTaskId: input.sourceTaskId?.trim() || null,
        recurrenceOf: recurrenceOfRaw ?? null,
        // container_slug：project.db 无 tasks 表（两表制）——登记径反查缺席列留空（投影降级，
        // standalone 同语义；候选检索走迁移回填的列直比）
        containerSlug: null,
        reportSessionId: input.reportSessionId ?? null,
        fixSessionId: null,
        fixer: null,
        reporter,
        createdAt: now,
        updatedAt: now,
      }
      deps.bugs.insert(row)
      deps.notify?.(input.projectId)
      return { card: projectBug(deps.bugs.get(bugId)!), errorTypeSuggestions: suggestions(projectKey) }
    },

    /** 终态回填（open→fixed｜unresolved 单向；fixed 走 hash 锚定证据反查；并发窗口由
     * repo.resolveIfOpen 单语句守卫收口——非 open 零行更新即拒） */
    async resolveBug(input: ResolveBugInput): Promise<BugCard> {
      if (input.outcome === 'unresolved') {
        const reason = (input.unresolvedReason ?? '').trim()
        if (reason === '') throw new ReasonRequiredError({ verb: 'resolveBug' })
        const { row } = await locate(input.projectId, input.bugId)
        if (row.bugStatus !== 'open') {
          throw new BugAlreadyResolvedError({ projectId: input.projectId, bugId: input.bugId, current: row.bugStatus })
        }
        const patch: BugResolvePatch = { bugStatus: 'unresolved', unresolvedReason: reason, updatedAt: new Date().toISOString() }
        if (!deps.bugs.resolveIfOpen(input.bugId, patch)) {
          // 并发窗口收口：零行更新 = 他方已终态——按库内现值拒绝
          throw new BugAlreadyResolvedError({ projectId: input.projectId, bugId: input.bugId, current: deps.bugs.get(input.bugId)?.bugStatus ?? 'open' })
        }
        deps.notify?.(input.projectId)
        return projectBug(deps.bugs.get(input.bugId)!)
      }
      const commitHash = (input.commitHash ?? '').trim()
      if (commitHash === '') throw new CommitHashRequiredError({ bugId: input.bugId })
      const { row } = await locate(input.projectId, input.bugId)
      if (row.bugStatus !== 'open') {
        throw new BugAlreadyResolvedError({ projectId: input.projectId, bugId: input.bugId, current: row.bugStatus })
      }
      // T4 覆盖声明闸门：复发家族（recurrence_of 在场）fixed 必携协议两段——presence + 锚
      // 字符串登记（零文件 IO；锚有效性预检归 tool 旁挂侧）。校验先于证据反查与写——缺席
      // 拒写零副作用。
      if (row.recurrenceOf !== null) {
        const parsed = parseBugCoverageDeclaration(input.fixApproach)
        const missing: ('declaration' | 'anchor')[] = []
        if (parsed.declaration === undefined) missing.push('declaration')
        if (parsed.anchor === undefined) missing.push('anchor')
        if (missing.length > 0) {
          throw new BugCoverageDeclarationRequiredError({ bugId: input.bugId, missing })
        }
      }
      // 证据反查在写前（git 解析径 async——零事务内 IO）
      const evidence = await resolveFixEvidence(execFile, { cwd: deps.resolveMainPath(input.projectId), commitHash })
      if (Object.keys(evidence).length === 0) {
        emit('bug-git-evidence', `fixed 证据反查双径全败（worktree porcelain + branch --contains）——fixed 行照落、证据双缺：bugId=${input.bugId} commitHash=${commitHash}`)
      }
      const fixer = await resolveGitIdentity(execFile, deps.resolveMainPath(input.projectId))
      if (fixer === GIT_IDENTITY_FALLBACK) {
        emit('bug-git-identity', `git 身份双缺席（config user.name/user.email 皆不可用）——fixer 落占位 ${GIT_IDENTITY_FALLBACK}：bugId=${input.bugId}`)
      }
      const patch: BugResolvePatch = {
        bugStatus: 'fixed',
        commitHash,
        worktree: evidence.worktree,
        branch: evidence.branch,
        fixApproach: input.fixApproach?.trim() || undefined,
        fixer,
        fixSessionId: input.fixSessionId,
        updatedAt: new Date().toISOString(),
      }
      if (!deps.bugs.resolveIfOpen(input.bugId, patch)) {
        // 并发窗口收口：零行更新 = 他方已终态——按库内现值拒绝
        throw new BugAlreadyResolvedError({ projectId: input.projectId, bugId: input.bugId, current: deps.bugs.get(input.bugId)?.bugStatus ?? 'open' })
      }
      deps.notify?.(input.projectId)
      return projectBug(deps.bugs.get(input.bugId)!)
    },

    /** 列表读面（服务端承载：search + status 过滤 + active|created 排序——三既有子 tab 同构） */
    async listBugs(q: ListBugsQuery): Promise<BugCard[]> {
      const key = await keyOf(q.projectId)
      const cards = deps.bugs.listByProject(key).map(projectBug)
      const filtered = cards.filter(
        (c) =>
          (q.status === undefined || q.status.length === 0 || q.status.includes(c.bugStatus)) &&
          matchesSearch(q.search, bugSearchKeys(c)),
      )
      return sortByActiveThenCreated(filtered, {
        active: q.sort ?? 'active',
        isTerminal: (c) => c.bugStatus !== 'open', // fixed|unresolved 均终态——open 活跃优先
        createdAt: (c) => c.createdAt,
        id: (c) => c.bugId,
      }).slice(Math.max(q.offset ?? 0, 0), q.limit === undefined ? undefined : Math.max(q.offset ?? 0, 0) + q.limit)
    },

    /** 台账 recurrence 候选只读聚合（claim 同缝守卫 / T2 交叉校验 / triage 两信号 / add-fix
     * vars 共同消费 face——container_slug 列直比口径，纯算法归 recurrence.ts） */
    async findRecurrenceCandidates(projectId: string, scope: BugRecurrenceScope): Promise<readonly BugRecurrenceCandidate[]> {
      const key = await keyOf(projectId)
      return findRecurrenceCandidatesOf(deps.bugs.listByProject(key), scope)
    },

    /**
     * errorType 聚合读法（recurrence-signal-tiering 聚合统计）：按 errorType 分组全史计数
     * {total, open, fixed, lastSeenAt}（unresolved 计入 total 不入单列）；lastSeenAt = 组内
     * 最新 updated_at。排序 = total 降序、同频词面升序。空/纯空白 errorType 不入组。
     */
    async aggregateByErrorType(projectId: string): Promise<readonly BugErrorTypeAggregate[]> {
      const key = await keyOf(projectId)
      const groups = new Map<string, { total: number; open: number; fixed: number; lastSeenAt: string }>()
      for (const r of deps.bugs.listByProject(key)) {
        const t = (r.errorType ?? '').trim()
        if (t === '') continue
        const g = groups.get(t) ?? { total: 0, open: 0, fixed: 0, lastSeenAt: r.updatedAt }
        g.total += 1
        if (r.bugStatus === 'open') g.open += 1
        if (r.bugStatus === 'fixed') g.fixed += 1
        if (r.updatedAt > g.lastSeenAt) g.lastSeenAt = r.updatedAt
        groups.set(t, g)
      }
      return [...groups.entries()]
        .map(([errorType, g]) => ({ errorType, total: g.total, open: g.open, fixed: g.fixed, lastSeenAt: g.lastSeenAt }))
        .sort((a, b) => (a.total === b.total ? (a.errorType < b.errorType ? -1 : 1) : b.total - a.total))
    },

    /**
     * 单条全卡读法（主 + worker 面）：BugCard 全量 + 链上下文（行为保持承袭——纯算法归
     * recurrence.ts buildBugChainContext）；孤条 chain 缺席（单条 bug 弹框语言不变）。
     */
    async getBug(q: GetBugQuery): Promise<GetBugResponse> {
      const key = await keyOf(q.projectId)
      return buildBugChainContext(deps.bugs.listByProject(key), q)
    },

    /** commit 变更文件清单（fixed 证据读面——git show --name-status；git 缺席/失败/hash 形脏
     * = 空集 fail-soft——呈现面降级不炸） */
    async commitFiles(q: BugCommitFilesQuery): Promise<BugCommitFile[]> {
      if (!COMMIT_HASH_RE.test(q.commitHash)) return []
      const out = await runGit(execFile, deps.resolveMainPath(q.projectId), ['show', '--name-status', '--format=', q.commitHash])
      if (out === null) {
        emit('bug-git-evidence', `git show --name-status 失败——变更文件清单归空 fail-soft：projectId=${q.projectId} commitHash=${q.commitHash}`)
        return []
      }
      return out
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => {
          const parts = line.split('\t')
          return { status: (parts[0] ?? '').trim(), path: (parts[parts.length - 1] ?? '').trim() }
        })
        .filter((f) => f.path !== '')
    },

    /** 单文件 unified diff（git show -- <path>；200KB 截断防护；fail-soft 空串同上） */
    async fileDiff(q: BugFileDiffQuery): Promise<{ diff: string }> {
      if (!COMMIT_HASH_RE.test(q.commitHash) || q.path.includes('..') || q.path.startsWith('/')) {
        return { diff: '' }
      }
      const out = await runGit(execFile, deps.resolveMainPath(q.projectId), [
        'show',
        '--format=',
        q.commitHash,
        '--',
        q.path,
      ])
      if (out === null) {
        emit('bug-git-evidence', `git show（单文件 diff）失败——diff 归空 fail-soft：projectId=${q.projectId} commitHash=${q.commitHash} path=${q.path}`)
        return { diff: '' }
      }
      return { diff: out.length > BUG_DIFF_MAX_CHARS ? `${out.slice(0, BUG_DIFF_MAX_CHARS)}\n…（已截断）` : out }
    },
  }
}
