// forge feature 域服务（任务 2.7；tech-design §Interface 2 全四法——ctx.forgeFeatures）。
// 定位：业务。三小域合并单目录承载（布局自由度注记——服务面四分是契约，文件布局非契约）。
//
// 四法面：
// - registerFeature：slug UNIQUE 冲突 → ERR_FEATURE_EXISTS（409）；proposalId 谱系 FK
//   预检未命中 → ERR_PROPOSAL_NOT_FOUND（校验先于写）；新行 feature_status 缺省 'prd'
//   （schema DEFAULT 同值——无文档无任务的推导机不动点）。
// - transitionFeature：人类纠偏面——reason 必带（ERR_REASON_REQUIRED）+ from≠to 同源校验
//   （ERR_INVALID_TRANSITION，assertDomainTransition 单源）；不做相位推导重算（人类即相位
//   权威——phase-deriver 消费侧清单不含 transitionFeature）。
// - upsertFeatureDoc：登记即推进（§6-28）——单事务内聚：slug→id 服务内解析（未命中
//   ERR_FEATURE_NOT_FOUND）→ 写时增量断言（受影响 feature 漂移防护——事务内先于写）→
//   doc 行 upsert（PK (feature_id, doc_kind)：加缺/覆写 rel_path；summary 非破坏——
//   COALESCE 保既有值）→ 相位重算（单调只进——经注入的 2.1 推导机单源纯函数）。
// - listFeatures：七态分布/文档统计/谱系水化 + search（slug/title/状态中英标签）+ sort
//   （active 活跃优先 | created 最新创建）。
//
// 写动词闭包尾部 emitTasksChanged(projectId)（Interface 1 写后事件四域覆盖面裁决——
// 事务提交后发射，同通道同载荷）。一切 SQL prepared statements（Hard Rule）。
// 相位推导机经 deps 注入（2.1 单源纯函数——四域互禁 import 彼此，故不直 import
// forge/tasks/phase-deriver，装配层（index.ts）注入同函数引用，零第二实现）。
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  FEATURE_STATUSES,
  TASK_STATUSES,
  type DocKind,
  type FeatureCard,
  type FeatureDocumentRow,
  type FeatureRow,
  type FeatureStatus,
  type ForgeFeaturesService,
  type RegisterFeatureInput,
  type TaskStatus,
  type TransitionFeatureInput,
  type UpsertFeatureDocInput,
} from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import type { ForgeTaskEvents } from '../workspace/events.js'
import type { ForgeWorkspaceStore } from '../workspace/store.js'
import {
  assertDomainTransition,
  FeatureExistsError,
  FeatureNotFoundError,
  ProposalNotFoundError,
  ReasonRequiredError,
} from './errors.js'
import { featureSearchKeys, matchesSearch, sortByActiveThenCreated } from './list-utils.js'

/**
 * 相位推导机注入面（2.1 单源纯函数的结构化最小面——deriveFeaturePhase /
 * assertPhaseInvariant 同引用；四域互禁 import 彼此，装配层注入消 import 边）。
 */
export interface PhaseDeriverPorts {
  /** 相位重算（deriveFeaturePhase——单调只进推进的单源计算） */
  readonly derivePhase: (input: {
    current: FeatureStatus
    docKinds: readonly DocKind[]
    taskStatuses: readonly TaskStatus[]
  }) => FeatureStatus
  /** 写时增量断言（assertPhaseInvariant——受影响 feature 漂移防护，事务内先于写） */
  readonly assertPhaseInvariant: (input: {
    featureStatus: FeatureStatus
    docKinds: readonly DocKind[]
    taskStatuses: readonly TaskStatus[]
    featureSlug?: string
  }) => void
}

export interface FeaturesServiceDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen） */
  readonly store: ForgeWorkspaceStore
  /** 写后事件发射器（装配单例——四域共享） */
  readonly events: ForgeTaskEvents
  /** 相位推导机注入（2.1 单源——见 PhaseDeriverPorts） */
  readonly phase: PhaseDeriverPorts
}

/** features 行存储形状（snake_case → DTO 映射唯一落点） */
interface FeatureStorageRow {
  id: string
  slug: string
  title: string
  feature_status: FeatureStatus
  summary: string | null
  proposal_id: string | null
  created_at: string
  updated_at: string
}

/** feature_documents 行存储形状 */
interface FeatureDocStorageRow {
  feature_id: string
  doc_kind: DocKind
  rel_path: string
  summary: string | null
  created_at: string
  updated_at: string
}

const SELECT_FEATURE = `SELECT id, slug, title, feature_status, summary, proposal_id, created_at, updated_at FROM features`

function toFeatureRow(row: FeatureStorageRow): FeatureRow {
  return {
    featureId: row.id,
    slug: row.slug,
    title: row.title,
    featureStatus: row.feature_status,
    summary: row.summary ?? undefined,
    proposalId: row.proposal_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toFeatureDocumentRow(row: FeatureDocStorageRow): FeatureDocumentRow {
  return {
    featureId: row.feature_id,
    docKind: row.doc_kind,
    relPath: row.rel_path,
    summary: row.summary ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** registerFeature UNIQUE(features.slug) 违例判据（better-sqlite3 SqliteError code + 指名列） */
function isUniqueSlugViolation(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    (cause as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    cause.message.includes('features.slug')
  )
}

/** feature 相位聚合读取（推导机输入快照——事务内单源读） */
function readPhaseInput(
  db: Database.Database,
  featureId: string,
): { docKinds: DocKind[]; taskStatuses: TaskStatus[] } {
  const docKinds = db
    .prepare<unknown[], { doc_kind: DocKind }>(`SELECT doc_kind FROM feature_documents WHERE feature_id = ?`)
    .all(featureId)
    .map((r) => r.doc_kind)
  const taskStatuses = db
    .prepare<unknown[], { task_status: TaskStatus }>(`SELECT task_status FROM tasks WHERE feature_id = ?`)
    .all(featureId)
    .map((r) => r.task_status)
  return { docKinds, taskStatuses }
}

/** Interface 2：core · forge feature 域服务面（ctx.forgeFeatures） */
export function createFeaturesService(deps: FeaturesServiceDeps): ForgeFeaturesService {
  return {
    async registerFeature(input: RegisterFeatureInput): Promise<FeatureRow> {
      const db = deps.store.ensureOpen(input.projectId)
      // 谱系 FK 预检（校验先于写）：typed 404 优于裸 FK 约束错
      if (input.proposalId !== undefined) {
        const proposal = db.prepare<unknown[], { id: string }>(`SELECT id FROM proposals WHERE id = ?`).get(input.proposalId)
        if (proposal === undefined) {
          throw new ProposalNotFoundError({ projectId: input.projectId, proposalId: input.proposalId })
        }
      }
      const featureId = randomUUID()
      const now = new Date().toISOString()
      let row: FeatureStorageRow
      try {
        row = withTransaction(db, () => {
          db.prepare(
            `INSERT INTO features (id, slug, title, feature_status, summary, proposal_id, created_at, updated_at)
             VALUES (?, ?, ?, 'prd', ?, ?, ?, ?)`,
          ).run(featureId, input.slug, input.title, input.summary ?? null, input.proposalId ?? null, now, now)
          return db
            .prepare<unknown[], FeatureStorageRow>(`${SELECT_FEATURE} WHERE id = ?`)
            .get(featureId) as FeatureStorageRow
        })
      } catch (cause) {
        if (isUniqueSlugViolation(cause)) {
          throw new FeatureExistsError({ projectId: input.projectId, slug: input.slug })
        }
        throw cause
      }
      deps.events.emitTasksChanged(input.projectId)
      return toFeatureRow(row)
    },

    async transitionFeature(input: TransitionFeatureInput): Promise<FeatureRow> {
      const db = deps.store.ensureOpen(input.projectId)
      const row = withTransaction(db, () => {
        const current = db
          .prepare<unknown[], FeatureStorageRow>(`${SELECT_FEATURE} WHERE id = ?`)
          .get(input.featureId)
        if (current === undefined) {
          throw new FeatureNotFoundError({ projectId: input.projectId, featureId: input.featureId })
        }
        if (input.reason.trim() === '') {
          throw new ReasonRequiredError({ verb: 'transitionFeature' })
        }
        assertDomainTransition('feature', FEATURE_STATUSES, current.feature_status, input.toStatus)
        db.prepare(`UPDATE features SET feature_status = ?, updated_at = ? WHERE id = ?`).run(
          input.toStatus,
          new Date().toISOString(),
          input.featureId,
        )
        return db
          .prepare<unknown[], FeatureStorageRow>(`${SELECT_FEATURE} WHERE id = ?`)
          .get(input.featureId) as FeatureStorageRow
      })
      deps.events.emitTasksChanged(input.projectId)
      return toFeatureRow(row)
    },

    async upsertFeatureDoc(input: UpsertFeatureDocInput): Promise<FeatureDocumentRow> {
      const db = deps.store.ensureOpen(input.projectId)
      const docRow = withTransaction(db, () => {
        // slug→id 服务内解析（Interface 2 注记——调用方不持 id）
        const feature = db
          .prepare<unknown[], { id: string; slug: string; feature_status: FeatureStatus }>(
            `SELECT id, slug, feature_status FROM features WHERE slug = ?`,
          )
          .get(input.featureSlug)
        if (feature === undefined) {
          throw new FeatureNotFoundError({ projectId: input.projectId, featureSlug: input.featureSlug })
        }
        // 写时增量断言（漂移防护——事务内先于写，受影响 feature；漂移即整体回滚）
        const snapshot = readPhaseInput(db, feature.id)
        deps.phase.assertPhaseInvariant({
          featureStatus: feature.feature_status,
          docKinds: snapshot.docKinds,
          taskStatuses: snapshot.taskStatuses,
          featureSlug: feature.slug,
        })
        const now = new Date().toISOString()
        // PK (feature_id, doc_kind) upsert：rel_path 覆写（登记即最新位置）；summary 非破坏
        // （COALESCE——后到 upsert 缺省摘要不抹既有值，行此后稳定精神）
        db.prepare(
          `INSERT INTO feature_documents (feature_id, doc_kind, rel_path, summary, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(feature_id, doc_kind) DO UPDATE SET
             rel_path = excluded.rel_path,
             summary = COALESCE(excluded.summary, summary),
             updated_at = excluded.updated_at`,
        ).run(feature.id, input.docKind, input.relPath, input.summary ?? null, now, now)
        // 登记即推进：相位重算（单调只进——推导机单源；archived 豁免/taskDerived 覆盖均在其内）
        const after = readPhaseInput(db, feature.id)
        const derived = deps.phase.derivePhase({
          current: feature.feature_status,
          docKinds: after.docKinds,
          taskStatuses: after.taskStatuses,
        })
        if (derived !== feature.feature_status) {
          db.prepare(`UPDATE features SET feature_status = ?, updated_at = ? WHERE id = ?`).run(
            derived,
            now,
            feature.id,
          )
        }
        return db
          .prepare<unknown[], FeatureDocStorageRow>(
            `SELECT feature_id, doc_kind, rel_path, summary, created_at, updated_at FROM feature_documents
             WHERE feature_id = ? AND doc_kind = ?`,
          )
          .get(feature.id, input.docKind) as FeatureDocStorageRow
      })
      deps.events.emitTasksChanged(input.projectId)
      return toFeatureDocumentRow(docRow)
    },

    async listFeatures(q: { projectId: string; search?: string; sort?: 'active' | 'created' }): Promise<FeatureCard[]> {
      const db = deps.store.ensureOpen(q.projectId)
      const rows = db.prepare<unknown[], FeatureStorageRow>(`${SELECT_FEATURE}`).all()
      // 聚合水化（单遍分组）：任务七态分布 + 文档统计 + 谱系 slug
      const statusCounts = new Map<string, Map<TaskStatus, number>>()
      for (const r of db
        .prepare<unknown[], { feature_id: string; task_status: TaskStatus; n: number }>(
          `SELECT feature_id, task_status, COUNT(*) AS n FROM tasks GROUP BY feature_id, task_status`,
        )
        .all()) {
        let per = statusCounts.get(r.feature_id)
        if (per === undefined) statusCounts.set(r.feature_id, (per = new Map()))
        per.set(r.task_status, r.n)
      }
      const docCounts = new Map(
        db
          .prepare<unknown[], { feature_id: string; n: number }>(
            `SELECT feature_id, COUNT(*) AS n FROM feature_documents GROUP BY feature_id`,
          )
          .all()
          .map((r) => [r.feature_id, r.n] as const),
      )
      const proposalSlugs = new Map(
        db
          .prepare<unknown[], { fid: string; pslug: string }>(
            `SELECT f.id AS fid, p.slug AS pslug FROM features f JOIN proposals p ON p.id = f.proposal_id`,
          )
          .all()
          .map((r) => [r.fid, r.pslug] as const),
      )
      const cards: FeatureCard[] = rows.map((row) => {
        const per = statusCounts.get(row.id)
        const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, per?.get(s) ?? 0])) as Record<TaskStatus, number>
        return {
          ...toFeatureRow(row),
          byStatus,
          docCount: docCounts.get(row.id) ?? 0,
          proposalSlug: proposalSlugs.get(row.id),
        }
      })
      const filtered = cards.filter((c) =>
        matchesSearch(q.search, featureSearchKeys(c.slug, c.title, c.featureStatus)),
      )
      return sortByActiveThenCreated(filtered, {
        active: q.sort ?? 'active',
        isTerminal: (c) => c.featureStatus === 'completed' || c.featureStatus === 'archived',
        createdAt: (c) => c.createdAt,
        id: (c) => c.featureId,
      })
    },
  }
}
