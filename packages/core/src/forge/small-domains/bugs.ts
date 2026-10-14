// forge bug 域服务（fix-bug 第五小域）：registerBug/resolveBug/listBugs——两阶段落库
// 单表（bugs：登记 open → fixed｜unresolved 终态回填；不可改史，无审计表——终态行自身
// 即全史）。proposal「技术细节·持久化/工具面」两节为契约；contracts dto/bugs.ts（BugCard/
// ListBugsQuery）+ labels BUG_STATUSES 为词汇单源。
//
// git 解析径在 core 内承载（先例 forge/tasks/git-lookup.ts——execFile 注入 + 恒数组参 +
// 2s 超时 + ENOENT/失败同路 fail-soft；四域互禁 import 彼此，故本域自持注入面不引
// tasks/git-lookup——零第二语义，封闭子命令集不同：config/worktree/branch 均只读）：
// - 身份：git config user.name，缺席回退 user.email，双缺席回退 '(unknown)'（reporter
//   NOT NULL——git 可选环境依赖，登记不因身份缺席拒写）。
// - fixed 证据反查：以 agent 捕获的 commit_hash 为锚 `git worktree list --porcelain`
//   匹配 HEAD==hash → worktree + branch 短名；未命中（提交后分支又推进）回退
//   `git branch --contains <hash>` 取 branch、worktree 置空；双径全败 → 证据缺席照落。
//
// 状态机：open→fixed｜unresolved 单向（终态再迁移 ERR_BUG_ALREADY_RESOLVED 拒绝）；
// summary ≤50 字超长拒写（ERR_BUG_SUMMARY_TOO_LONG——校验先于写）；fixed 必带
// commit_hash（ERR_COMMIT_HASH_REQUIRED——并发安全：agent 原子提交后立即捕获，工具不自取
// HEAD）；unresolved 必带因（ERR_REASON_REQUIRED 复用——resolveBug 空 reason 同语义）。
// bugId 未命中 ERR_BUG_NOT_FOUND（404）。写动词闭包尾部 emitTasksChanged(projectId)
// （四域 emit 模式——子 tab 刷新依赖；事务提交后发射）。一切 SQL prepared statements。
import { randomUUID } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import type {
  BugCard,
  BugCommitFile,
  BugCommitFilesQuery,
  BugFileDiffQuery,
  BugStatus,
  ListBugsQuery,
} from '@dsh-forge/contracts'
import { BUG_STATUS_LABELS } from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import type { ForgeTaskEvents } from '../workspace/events.js'
import type { ForgeWorkspaceStore } from '../workspace/store.js'
import { ReasonRequiredError } from './errors.js'
import { matchesSearch, sortByActiveThenCreated } from './list-utils.js'

// ── git 解析径（只读封闭子命令集） ──

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

/** execFile 注入面（git-lookup.ts 同口径——恒 (command, args 数组, options, callback) 四参） */
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
export async function resolveGitIdentity(
  execFile: GitExecFile,
  cwd: string,
): Promise<string> {
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
 * ① `git worktree list --porcelain` 空行分块，块 = worktree <path> / HEAD <hash> /
 *    branch refs/heads/<name>；HEAD==hash（大小写不敏感 trim 比较）命中 → worktree + 短名；
 * ② 未命中 → `git branch --contains <hash>` 首非空行剥前缀（`* `/空白）→ branch、worktree 置空；
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

// ── typed errors（本域就近落位；错误码待 contracts 扩池对账——本域先字面锚定） ──

/** ERR_BUG_NOT_FOUND 附载 */
export interface BugNotFoundData {
  readonly projectId: string
  readonly bugId: string
}

/** bugId 未命中（404） */
export class BugNotFoundError extends Error {
  readonly code = 'ERR_BUG_NOT_FOUND' as const
  readonly data: BugNotFoundData

  constructor(data: BugNotFoundData) {
    super(`bug 未命中：${data.bugId}（project ${data.projectId}）`)
    this.name = 'BugNotFoundError'
    this.data = data
  }
}

/** ERR_BUG_SUMMARY_TOO_LONG 附载 */
export interface BugSummaryTooLongData {
  readonly summary: string
  readonly max: number
}

/** registerBug summary 超长拒写（≤50 字） */
export class BugSummaryTooLongError extends Error {
  readonly code = 'ERR_BUG_SUMMARY_TOO_LONG' as const
  readonly data: BugSummaryTooLongData

  constructor(data: BugSummaryTooLongData) {
    super(`summary 超长拒绝：${data.max} 字上限，实际 ${Array.from(data.summary).length} 字`)
    this.name = 'BugSummaryTooLongError'
    this.data = data
  }
}

/** ERR_BUG_ALREADY_RESOLVED 附载 */
export interface BugAlreadyResolvedData {
  readonly projectId: string
  readonly bugId: string
  readonly current: BugStatus
}

/** 终态再迁移拒绝（open→fixed｜unresolved 单向——不可改史） */
export class BugAlreadyResolvedError extends Error {
  readonly code = 'ERR_BUG_ALREADY_RESOLVED' as const
  readonly data: BugAlreadyResolvedData

  constructor(data: BugAlreadyResolvedData) {
    super(`bug 已终态（${data.current}），拒绝再迁移：${data.bugId}（project ${data.projectId}）`)
    this.name = 'BugAlreadyResolvedError'
    this.data = data
  }
}

/** ERR_COMMIT_HASH_REQUIRED 附载 */
export interface CommitHashRequiredData {
  readonly bugId: string
}

/** resolveBug(fixed) 缺 commit_hash（agent 原子提交后捕获——并发安全锚，工具不自取 HEAD） */
export class CommitHashRequiredError extends Error {
  readonly code = 'ERR_COMMIT_HASH_REQUIRED' as const
  readonly data: CommitHashRequiredData

  constructor(data: CommitHashRequiredData) {
    super(`resolveBug(fixed) 需要 commit_hash（agent 原子提交后捕获）：${data.bugId}`)
    this.name = 'CommitHashRequiredError'
    this.data = data
  }
}

// ── 服务面 ──

/** summary 字数上限（字 = Unicode 码点——全角汉字一字一计） */
export const BUG_SUMMARY_MAX_CHARS = 50

export interface BugsServiceDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen） */
  readonly store: ForgeWorkspaceStore
  /** 写后事件发射器（装配单例——五域共享） */
  readonly events: ForgeTaskEvents
  /** 工作区仓库根解析（git 解析径 cwd——生产 routing.wsPath 注入，测试夹具同径） */
  readonly resolveWsPath: (projectId: string) => string
  /** execFile 注入（测试桩受控成败——生产缺省 node:child_process） */
  readonly execFile?: GitExecFile
}

/** bugs 行存储形状（snake_case → DTO 映射唯一落点） */
interface BugStorageRow {
  id: string
  summary: string
  bug_desc: string
  trigger_desc: string
  expected: string
  actual: string
  suspected: string | null
  error_type: string | null
  bug_status: BugStatus
  commit_hash: string | null
  worktree: string | null
  branch: string | null
  unresolved_reason: string | null
  source_task_id: string | null
  report_session_id: string | null
  fix_session_id: string | null
  reporter: string
  fixer: string | null
  created_at: string
  updated_at: string
}

const SELECT_BUG =
  `SELECT id, summary, bug_desc, trigger_desc, expected, actual, suspected, error_type, bug_status,
          commit_hash, worktree, branch, unresolved_reason, source_task_id, report_session_id,
          fix_session_id, reporter, fixer, created_at, updated_at
   FROM bugs`

/** bugs 行 → BugCard DTO。NULL 列条件展开 = 键缺席（tool 返回面 lossless JSON 合规——
 *  features.ts toFeatureRow 同口径）；listBugs 为 RPC 面，键缺席式 undefined 访问语义不变 */
function toBugCard(row: BugStorageRow): BugCard {
  return {
    bugId: row.id,
    summary: row.summary,
    bugDesc: row.bug_desc,
    triggerDesc: row.trigger_desc,
    expected: row.expected,
    actual: row.actual,
    ...(row.suspected !== null ? { suspected: row.suspected } : {}),
    ...(row.error_type !== null ? { errorType: row.error_type } : {}),
    bugStatus: row.bug_status,
    ...(row.commit_hash !== null ? { commitHash: row.commit_hash } : {}),
    ...(row.worktree !== null ? { worktree: row.worktree } : {}),
    ...(row.branch !== null ? { branch: row.branch } : {}),
    ...(row.unresolved_reason !== null ? { unresolvedReason: row.unresolved_reason } : {}),
    ...(row.source_task_id !== null ? { sourceTaskId: row.source_task_id } : {}),
    ...(row.report_session_id !== null ? { reportSessionId: row.report_session_id } : {}),
    ...(row.fix_session_id !== null ? { fixSessionId: row.fix_session_id } : {}),
    reporter: row.reporter,
    ...(row.fixer !== null ? { fixer: row.fixer } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** registerBug 入参（agent/tool 提交语义字段；身份/会话由工具面自取后透传） */
export interface RegisterBugInput {
  readonly projectId: string
  readonly summary: string
  readonly bugDesc: string
  readonly triggerDesc: string
  readonly expected: string
  readonly actual: string
  readonly suspected?: string
  readonly errorType?: string
  readonly sourceTaskId?: string
  readonly reportSessionId?: string
}

/** resolveBug 入参（outcome 两终态择一；fixed 必带 commit_hash / unresolved 必带因） */
export interface ResolveBugInput {
  readonly projectId: string
  readonly bugId: string
  readonly outcome: 'fixed' | 'unresolved'
  /** fixed：agent 原子提交后 `git rev-parse HEAD` 捕获（并发安全） */
  readonly commitHash?: string
  /** unresolved：HARD-GATE 停机原因 */
  readonly unresolvedReason?: string
  readonly fixSessionId?: string
}

/** bug 卡 search 键集（summary 主行 + error_type + 状态中英标签——searchPlaceholder 同构） */
export function bugSearchKeys(card: BugCard): readonly string[] {
  return [
    card.summary,
    ...(card.errorType !== undefined ? [card.errorType] : []),
    BUG_STATUS_LABELS[card.bugStatus].zh,
    BUG_STATUS_LABELS[card.bugStatus].en,
  ]
}

/** Interface：core · forge bug 域服务面（装配注入——recordBug/resolveBug 工具消费 + listBugs RPC） */
export function createBugsService(deps: BugsServiceDeps) {
  const execFile = deps.execFile ?? defaultExecFile
  return {
    /** 登记 → open 行（summary ≤50 字超长拒写；reporter 经 git 解析——写前 await） */
    async registerBug(input: RegisterBugInput): Promise<BugCard> {
      const summary = input.summary.trim()
      if (Array.from(summary).length > BUG_SUMMARY_MAX_CHARS) {
        throw new BugSummaryTooLongError({ summary, max: BUG_SUMMARY_MAX_CHARS })
      }
      const db = deps.store.ensureOpen(input.projectId)
      const cwd = deps.resolveWsPath(input.projectId)
      const reporter = await resolveGitIdentity(execFile, cwd)
      const bugId = randomUUID()
      const now = new Date().toISOString()
      withTransaction(db, () => {
        db.prepare(
          `INSERT INTO bugs (id, summary, bug_desc, trigger_desc, expected, actual, suspected, error_type,
                             bug_status, source_task_id, report_session_id, reporter, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
        ).run(
          bugId,
          summary,
          input.bugDesc,
          input.triggerDesc,
          input.expected,
          input.actual,
          input.suspected ?? null,
          input.errorType ?? null,
          input.sourceTaskId ?? null,
          input.reportSessionId ?? null,
          reporter,
          now,
          now,
        )
      })
      deps.events.emitTasksChanged(input.projectId)
      const row = db.prepare<unknown[], BugStorageRow>(`${SELECT_BUG} WHERE id = ?`).get(bugId) as BugStorageRow
      return toBugCard(row)
    },

    /** 终态回填（open→fixed｜unresolved 单向；fixed 走 hash 锚定证据反查） */
    async resolveBug(input: ResolveBugInput): Promise<BugCard> {
      const db = deps.store.ensureOpen(input.projectId)
      let row: BugStorageRow
      if (input.outcome === 'unresolved') {
        const reason = (input.unresolvedReason ?? '').trim()
        if (reason === '') {
          throw new ReasonRequiredError({ verb: 'resolveBug' })
        }
        row = withTransaction(db, () => {
          const current = db
            .prepare<unknown[], BugStorageRow>(`${SELECT_BUG} WHERE id = ?`)
            .get(input.bugId)
          if (current === undefined) {
            throw new BugNotFoundError({ projectId: input.projectId, bugId: input.bugId })
          }
          if (current.bug_status !== 'open') {
            throw new BugAlreadyResolvedError({
              projectId: input.projectId,
              bugId: input.bugId,
              current: current.bug_status,
            })
          }
          const now = new Date().toISOString()
          db.prepare(
            `UPDATE bugs SET bug_status = 'unresolved', unresolved_reason = ?, updated_at = ? WHERE id = ?`,
          ).run(reason, now, input.bugId)
          return db.prepare<unknown[], BugStorageRow>(`${SELECT_BUG} WHERE id = ?`).get(input.bugId) as BugStorageRow
        })
      } else {
        const commitHash = (input.commitHash ?? '').trim()
        if (commitHash === '') {
          throw new CommitHashRequiredError({ bugId: input.bugId })
        }
        // 证据反查在写前（git 解析径 async——事务外执行，零事务内 IO）
        const current = db.prepare<unknown[], BugStorageRow>(`${SELECT_BUG} WHERE id = ?`).get(input.bugId)
        if (current === undefined) {
          throw new BugNotFoundError({ projectId: input.projectId, bugId: input.bugId })
        }
        if (current.bug_status !== 'open') {
          throw new BugAlreadyResolvedError({
            projectId: input.projectId,
            bugId: input.bugId,
            current: current.bug_status,
          })
        }
        const evidence = await resolveFixEvidence(execFile, {
          cwd: deps.resolveWsPath(input.projectId),
          commitHash,
        })
        const fixer = await resolveGitIdentity(execFile, deps.resolveWsPath(input.projectId))
        const now = new Date().toISOString()
        row = withTransaction(db, () => {
          // 事务内复检终态（证据/身份 await 窗口的并发防护——非 open 即拒并整体回滚）
          const latest = db.prepare<unknown[], BugStorageRow>(`${SELECT_BUG} WHERE id = ?`).get(input.bugId)
          if (latest === undefined) {
            throw new BugNotFoundError({ projectId: input.projectId, bugId: input.bugId })
          }
          if (latest.bug_status !== 'open') {
            throw new BugAlreadyResolvedError({
              projectId: input.projectId,
              bugId: input.bugId,
              current: latest.bug_status,
            })
          }
          db.prepare(
            `UPDATE bugs SET bug_status = 'fixed', commit_hash = ?, worktree = ?, branch = ?,
                             fix_session_id = ?, fixer = ?, updated_at = ? WHERE id = ?`,
          ).run(
            commitHash,
            evidence.worktree ?? null,
            evidence.branch ?? null,
            input.fixSessionId ?? null,
            fixer,
            now,
            input.bugId,
          )
          return db.prepare<unknown[], BugStorageRow>(`${SELECT_BUG} WHERE id = ?`).get(input.bugId) as BugStorageRow
        })
      }
      deps.events.emitTasksChanged(input.projectId)
      return toBugCard(row)
    },

    /** 列表读面（服务端承载：search + status 过滤 + active|created 排序——三既有子 tab 同构） */
    async listBugs(q: ListBugsQuery): Promise<BugCard[]> {
      const db = deps.store.ensureOpen(q.projectId)
      const cards = (db.prepare<unknown[], BugStorageRow>(`${SELECT_BUG}`).all() as BugStorageRow[]).map(toBugCard)
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
      })
    },

    /** commit 变更文件清单（fixed 证据读面——git show --name-status；主仓 cwd 跨 worktree
     *  同对象库。git 缺席/失败/hash 形脏 = 空集 fail-soft——呈现面降级不炸） */
    async commitFiles(q: BugCommitFilesQuery): Promise<BugCommitFile[]> {
      if (!COMMIT_HASH_RE.test(q.commitHash)) return []
      const out = await runGit(execFile, deps.resolveWsPath(q.projectId), [
        'show',
        '--name-status',
        '--format=',
        q.commitHash,
      ])
      if (out === null) return []
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
      const out = await runGit(execFile, deps.resolveWsPath(q.projectId), [
        'show',
        '--format=',
        q.commitHash,
        '--',
        q.path,
      ])
      if (out === null) return { diff: '' }
      return { diff: out.length > BUG_DIFF_MAX_CHARS ? `${out.slice(0, BUG_DIFF_MAX_CHARS)}\n…（已截断）` : out }
    },
  }
}
