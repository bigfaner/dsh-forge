// taskDetail——任务域读面详情法（任务 2.6；tech-design §Interface 1 taskDetail「全量水化」）。
// 定位：业务（forge/tasks 子域）——只读 prepared statements 零事件；唯一异步面 = actualFiles
// 的 git 只读查找（files_json 缺省 → commit 回填，git-lookup.ts 单文件审计面）。
//
// 载荷构成（TaskDetail = TaskCard 全量 + 深字段——Interface 1 承重字段表）：
//   · records 时间线（RECORDS_BY_TASK_SQL 与 queryTask include.records 同源单份）；
//   · prerequisites（复用 list.ts 副行水化）/ waitingOnMe（后继摘要——恢复钩子反查面读侧）；
//   · sessions 双源分型（readTaskSessions 与 queryTask include.sessions 同源单份）；
//   · actualFiles：submit 记录 files_json（新→旧首个在场者）→ 缺省走 commit git 查找 →
//     双缺省 []；git ENOENT/失败同路回退记录语（单元素——git-lookup.ts Hard Rule）；
//   · allowedTransitions = transitionTargets(current, 'human')（Interface 10 纯函数单源——
//     UI 转移对话框选项集与服务端校验零漂移）；
//   · refs 水化：taskDesc/vars 声明锚点（正斜杠相对路径 token）→ feature_documents ∪
//     proposals docRel 匹配——命中 = 链接态（title = proposals.title ∣ feature_documents.
//     summary），未命中 = 置灰（resolved=false——文档移除/改名后的诚实呈现）。
import type Database from 'better-sqlite3'
import type { TaskDetail, TaskDetailQuery, TaskDocRef, TaskPrerequisiteSummary } from '@dsh-forge/contracts'
import type { ForgeWorkspaceStore } from '../workspace/store.js'
import { listCommitFiles, type GitExecFile } from './git-lookup.js'
import { hydrateTaskCards } from './list.js'
import { hydrateTaskContainer, readTaskRecords, readTaskSessions, resolveTaskById, toTaskSnapshot } from './query.js'
import { transitionTargets } from './state-machine.js'

/** 详情读装配依赖（service.ts 装配面结构传入） */
export interface TasksDetailDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen） */
  readonly store: ForgeWorkspaceStore
  /** projectId → 工作区仓库根（git 只读查找 cwd——装配层 routing.wsPath 注入） */
  readonly resolveWsPath: (projectId: string) => string
  /** git 只读执行注入（缺席 = 生产 execFile——git-lookup.ts defaultExecFile） */
  readonly git?: { readonly execFile?: GitExecFile }
}

/** submit 记录 files/commit 级联读（新 → 旧——files_json 优先于 commit 查找） */
const SUBMIT_PAYLOAD_SQL = `SELECT files_json, commit_hash FROM task_records
  WHERE task_id = ? AND verb = 'submit' ORDER BY id DESC`

/** 声明锚点 token（正斜杠相对路径 + 文件扩展名——≥1 段分隔；docRel 正斜杠约定同口径） */
const DOC_ANCHOR_RE = /[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]+/g

/** taskDesc + vars 值声明锚点提取（首现序去重——desc 先于 vars，vars 按键序） */
export function extractDocAnchors(row: { task_desc: string | null; vars_json: string | null }): string[] {
  const texts: string[] = []
  if (row.task_desc !== null) texts.push(row.task_desc)
  if (row.vars_json !== null) {
    let vars: unknown
    try {
      vars = JSON.parse(row.vars_json) as unknown
    } catch {
      vars = undefined // 畸形 vars_json 不拖垮读面（refs 退化为 desc 锚点）
    }
    if (vars !== null && typeof vars === 'object') {
      for (const key of Object.keys(vars as Record<string, unknown>).sort()) {
        const value = (vars as Record<string, unknown>)[key]
        if (typeof value === 'string') texts.push(value)
      }
    }
  }
  const seen = new Set<string>()
  const anchors: string[] = []
  for (const text of texts) {
    for (const match of text.matchAll(DOC_ANCHOR_RE)) {
      if (!seen.has(match[0])) {
        seen.add(match[0])
        anchors.push(match[0])
      }
    }
  }
  return anchors
}

/** 在册文档注册面（feature_documents ∪ proposals 的 docRel → 标题映射） */
function readDocRegistry(db: Database.Database): Map<string, string | undefined> {
  const registry = new Map<string, string | undefined>()
  for (const p of db
    .prepare<unknown[], { rel_path: string; title: string }>(
      `SELECT rel_path, title FROM proposals WHERE rel_path IS NOT NULL`,
    )
    .all()) {
    registry.set(p.rel_path, p.title)
  }
  for (const d of db
    .prepare<unknown[], { rel_path: string; summary: string | null }>(
      `SELECT rel_path, summary FROM feature_documents`,
    )
    .all()) {
    if (!registry.has(d.rel_path)) registry.set(d.rel_path, d.summary ?? undefined)
  }
  return registry
}

/** refs 水化：声明锚点 → docRel 匹配（命中链接态 + 标题；未命中置灰） */
function resolveDocRefs(db: Database.Database, row: { task_desc: string | null; vars_json: string | null }): TaskDocRef[] {
  const registry = readDocRegistry(db)
  return extractDocAnchors(row).map((docRel) => ({
    docRel,
    resolved: registry.has(docRel),
    title: registry.get(docRel), // 未命中方缺省（置灰面无标题）
  }))
}

/** actualFiles 级联（submit 记录新 → 旧，单记录内 files_json → commit 查找；双缺省下行；
 *  git ENOENT/失败回退记录语——listCommitFiles Hard Rule 同路） */
async function resolveActualFiles(
  deps: TasksDetailDeps,
  db: Database.Database,
  q: TaskDetailQuery,
  taskId: string,
): Promise<string[]> {
  const submits = db
    .prepare<unknown[], { files_json: string | null; commit_hash: string | null }>(SUBMIT_PAYLOAD_SQL)
    .all(taskId)
  for (const s of submits) {
    if (s.files_json !== null) {
      let files: unknown
      try {
        files = JSON.parse(s.files_json) as unknown
      } catch {
        files = undefined // 畸形负载 → 本记录降级 commit 面（下行不中断）
      }
      if (Array.isArray(files) && files.every((f) => typeof f === 'string')) return files as string[]
    }
    if ((s.commit_hash ?? '').trim() !== '') {
      return listCommitFiles(deps.git ?? {}, {
        cwd: deps.resolveWsPath(q.projectId),
        commitHash: s.commit_hash as string,
      })
    }
  }
  return []
}

/** Interface 1 taskDetail：全量水化（UI/RPC 面恒 taskId——resolveTaskById 未命中 ERR_TASK_NOT_FOUND） */
export async function taskDetail(deps: TasksDetailDeps, q: TaskDetailQuery): Promise<TaskDetail> {
  const db = deps.store.ensureOpen(q.projectId)
  const row = resolveTaskById(db, q.projectId, q.taskId)
  const snapshot = toTaskSnapshot(row)
  const card = hydrateTaskCards(db, [row])[0]
  if (card === undefined) {
    throw new Error(`TaskCard 水化缺席（不可达——单行恒单卡）：${row.id}`) // fail-loud（同域口径）
  }
  const waitingOnMe = db
    .prepare<unknown[], TaskPrerequisiteSummary>(
      `SELECT t.slug AS slug, t.local_id AS localId, t.task_status AS taskStatus
       FROM task_edges e JOIN tasks t ON t.id = e.task_id
       WHERE e.prerequisite_id = ? ORDER BY t.slug, t.local_id`,
    )
    .all(row.id)
  return {
    ...card,
    container: hydrateTaskContainer(db, row),
    taskDesc: snapshot.taskDesc,
    vars: snapshot.vars,
    coverage: snapshot.coverage,
    complexity: snapshot.complexity,
    surfaceKey: snapshot.surfaceKey,
    surfaceType: snapshot.surfaceType,
    blockedReason: snapshot.blockedReason,
    breaking: snapshot.breaking,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    records: readTaskRecords(db, row.id),
    waitingOnMe,
    sessions: readTaskSessions(db, row),
    actualFiles: await resolveActualFiles(deps, db, q, row.id),
    allowedTransitions: transitionTargets(row.task_status, 'human'),
    refs: resolveDocRefs(db, row),
  }
}
