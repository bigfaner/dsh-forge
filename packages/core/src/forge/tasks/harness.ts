// forge/tasks 域测试共享夹具（任务 2.3）——add/query 测试共用的装配底盘：临时目录 +
// ForgeWorkspaceStore（resolveDir 注入固定目录——tasks 动词消费面 = store 单参，中央路由
// 属装配层由 service-assembly 覆盖）+ 事件 spy + 种行助手。四域互禁 import 彼此
// （Hard Rule）——不共用 small-domains/harness.ts（三小域私有夹具），同构就近落位。
// 本文件不进任何生产 import 图（testutil 同口径）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import type { TaskEdgeOrigin, TasksChangedEvent, TaskStatus, TaskType } from '@dsh-forge/contracts'
import type { ForgeTaskEvents } from '../workspace/events.js'
import { createWorkspaceStore, type ForgeWorkspaceStore } from '../workspace/store.js'

/** 事件 spy（emitTasksChanged 记账 + onTasksChanged 结构兼容——断言面 = emitted 清单） */
export interface EventSpy extends ForgeTaskEvents {
  readonly emitted: TasksChangedEvent[]
}

export interface TasksHarness {
  /** services 一切方法路由键（固定桩 id——resolveDir 恒同目录） */
  readonly projectId: string
  /** 每工作区任务库惰性句柄 */
  readonly store: ForgeWorkspaceStore
  /** 事件 spy（写动词发射断言） */
  readonly events: EventSpy
  /** 工作区库句柄（= store.ensureOpen(projectId)——种行/读行直用） */
  readonly db: Database.Database
  dispose(): void
}

/** 起夹具：临时根 + store（固定派生目录）+ events spy */
export function createTasksHarness(): TasksHarness {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-tasks-'))
  const projectId = 'test-project'
  const store = createWorkspaceStore({ resolveDir: () => join(root, 'ws-db') })
  const emitted: TasksChangedEvent[] = []
  const events: EventSpy = {
    emitted,
    emitTasksChanged(pid: string): void {
      emitted.push({ projectId: pid })
    },
    onTasksChanged(): () => void {
      return () => undefined
    },
  }
  const db = store.ensureOpen(projectId)
  return {
    projectId,
    store,
    events,
    db,
    dispose(): void {
      store.dispose()
      rmSync(root, { recursive: true, force: true })
    },
  }
}

/** 种 feature 行（直写库——受控初值：漂移/相位场景） */
export function seedFeature(
  db: Database.Database,
  o: { slug: string; status?: string; createdAt?: string },
): string {
  const id = `f-${o.slug}`
  const ts = o.createdAt ?? '2026-01-01T00:00:00.000Z'
  db.prepare(
    `INSERT INTO features (id, slug, title, feature_status, summary, proposal_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`,
  ).run(id, o.slug, `特性 ${o.slug}`, o.status ?? 'prd', ts, ts)
  return id
}

/** 种 proposal 行（直写库——受控初值：mode 溯源可空；2.4 容器双轨夹具） */
export function seedProposal(
  db: Database.Database,
  o: { slug: string; mode?: string | null },
): string {
  const id = `p-${o.slug}`
  const ts = '2026-01-01T00:00:00.000Z'
  db.prepare(
    `INSERT INTO proposals (id, slug, title, proposal_status, mode, created_at, updated_at)
     VALUES (?, ?, ?, 'accepted', ?, ?, ?)`,
  ).run(id, o.slug, `提案 ${o.slug}`, o.mode ?? null, ts, ts)
  return id
}

/** 种 task 行（同域直写——受控初值：状态/类型/谱系；slug ≡ 容器 slug 不变量沿袭。
 *  M3 1.2：source 双列 + mode 快照——与 addTask 写路径同形（feature 容器恒 'expedition'）。
 *  M3 2.4：kind='proposal' → source_id 解析自 proposals、mode 缺省 NULL（受控覆盖 o.mode）） */
export function seedTask(
  db: Database.Database,
  containerSlug: string,
  localId: string,
  o: {
    status?: TaskStatus
    type?: TaskType
    sourceTaskId?: string | null
    createdAt?: string
    kind?: 'feature' | 'proposal'
    mode?: string | null
  } = {},
): string {
  const id = `t-${containerSlug}-${localId}`
  const ts = o.createdAt ?? '2026-01-01T00:00:00.000Z'
  const kind = o.kind ?? 'feature'
  const sourceTable = kind === 'feature' ? 'features' : 'proposals'
  const mode = kind === 'feature' ? 'expedition' : (o.mode ?? null)
  db.prepare(
    `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, source_task_id,
       source_kind, source_id, mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM ${sourceTable} WHERE slug = ?), ?, ?, ?)`,
  ).run(
    id,
    containerSlug,
    localId,
    `任务 ${localId}`,
    o.type ?? 'coding-feature',
    o.status ?? 'pending',
    o.sourceTaskId ?? null,
    kind,
    containerSlug,
    mode,
    ts,
    ts,
  )
  return id
}

/** 种边行（task_id=等待方 ← prerequisite_id=前置方；直写受控初态——环构造/双源场景） */
export function seedEdge(
  db: Database.Database,
  waiterId: string,
  prerequisiteId: string,
  origin: TaskEdgeOrigin = 'manual',
): void {
  db.prepare(
    `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
     VALUES (?, ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(waiterId, prerequisiteId, origin)
}

/** 种挂接行（task_session_links——claim 唯一写源未落地（2.4），读面直写受控初态） */
export function seedLink(db: Database.Database, taskId: string, sessionId: string): void {
  db.prepare(
    `INSERT INTO task_session_links (task_id, session_id, created_at, updated_at)
     VALUES (?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(taskId, sessionId)
}

/** 种 record 行（append-only 审计——files/gate JSON 受控负载；verb 开放传参；2.6 增 createdAt
 *  受控项——实际耗时（首 claim → 末 submit 时差）断言基准） */
export function seedRecord(
  db: Database.Database,
  taskId: string,
  o: {
    verb?: string
    from?: string
    to?: string
    reason?: string
    summary?: string
    filesJson?: string
    gateJson?: string
    digest?: string
    actor?: string
    sessionId?: string
    createdAt?: string
  } = {},
): void {
  const ts = o.createdAt ?? '2026-01-01T00:00:00.000Z'
  db.prepare(
    `INSERT INTO task_records (task_id, verb, from_status, to_status, reason, summary, files_json,
       gate_json, commit_hash, dispatch_digest, actor, session_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
  ).run(
    taskId,
    o.verb ?? 'add',
    o.from ?? null,
    o.to ?? null,
    o.reason ?? null,
    o.summary ?? null,
    o.filesJson ?? null,
    o.gateJson ?? null,
    o.digest ?? null,
    o.actor ?? 'plugin-tool',
    o.sessionId ?? null,
    ts,
    ts,
  )
}
