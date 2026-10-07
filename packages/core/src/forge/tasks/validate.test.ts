// 任务 2.5 测试 —— validateFeatureTasks（单 feature 子图五类检查：tech-design §Interface 1
// L114-118 + PRD §178 五类口径 + db-schema §6-8 liveness 三判据 + 老 forge validate.go
// 对拍）。断言面：① 相位派生不变量族（推导不动点 + slug 列 ≡ feature slug + 同容器边
// 服务不变量）/ ② 无环复核（完整路径首尾相接）/ ③ liveness（orphaned/
// stale/deadlock）/ ④ 记录链（in_progress 必有 claim、completed 必有 submit）/ ⑤ 拓扑可分层
// （phase order 新形态——数值 localId 主段 N≥2 须有更早阶段直接前置，fix-N/disc-N 豁免）；
// 子图限定（他 feature 破损不报）+ ValidateReport 形状（checked 计数 + taskRef 定位）。
// M3 2.1 增补：① 族扩两项——容器命中（source_id 必命中 source_kind 对应表·不变量 1）+
// 同容器边（task_edges 两端 source_id 相等·不变量 2 泛化，判据 = source_id 相等非子图
// 成员资格）——构造漂移样本可抓。
import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { TaskStatus } from '@dsh-forge/contracts'
import { createTasksHarness, seedEdge, seedFeature, seedRecord, seedTask } from './harness.js'
import { TasksFeatureNotFoundError } from './errors.js'
import { validateFeatureTasks } from './validate.js'

/** 直插越界 slug 行（slug 列 ≢ feature slug 场景——harness 种行恒守不变量，破坏须直写；
 *  M3 1.2：source 双列直写——slug 与 source 解析容器 slug 不一致即违规） */
function insertMisSluggedTask(db: Database.Database, featureId: string): void {
  db.prepare(
    `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, source_kind, source_id, mode, created_at, updated_at)
     VALUES ('t-rogue', 'other-feature', '1.2', '越界行', 'coding-feature', 'pending', 'feature', ?, 'expedition', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(featureId)
}

/** 种 proposal 行（突击容器合法容器行——容器命中判据的正例锚） */
function insertProposal(db: Database.Database, o: { id: string; slug: string }): void {
  db.prepare(
    `INSERT INTO proposals (id, slug, title, proposal_status, mode, created_at, updated_at)
     VALUES (?, ?, ?, 'accepted', 'blitz', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(o.id, o.slug, `提案 ${o.slug}`)
}

/** 直插突击容器任务（source_kind='proposal'——source_id 受控：合法提案 id / 悬空 id /
 *  feature id 三形态；harness seedTask 恒 feature 容器，容器漂移样本须直写） */
function insertProposalTask(
  db: Database.Database,
  o: { id: string; slug: string; localId: string; status?: TaskStatus; sourceId: string },
): void {
  db.prepare(
    `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, source_kind, source_id, mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'coding-feature', ?, 'proposal', ?, 'blitz', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(o.id, o.slug, o.localId, `任务 ${o.localId}`, o.status ?? 'pending', o.sourceId)
}

describe('validateFeatureTasks：单 feature 子图五类检查', () => {
  it('干净子图零违规 + checked 计数；他 feature 破损不报（子图限定——Hard Rule）', () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'tasks' })
      const t11 = seedTask(h.db, 'feat', '1.1', { status: 'completed' })
      seedRecord(h.db, t11, { verb: 'submit' })
      seedTask(h.db, 'feat', '2.1')
      seedEdge(h.db, 't-feat-2.1', t11)
      // 他 feature 破损（漂移 + 缺 submit）——不属本子图
      seedFeature(h.db, { slug: 'evil', status: 'prd' })
      seedTask(h.db, 'evil', '1.1', { status: 'completed' })

      const report = validateFeatureTasks({ store: h.store }, { projectId: h.projectId, featureSlug: 'feat' })
      expect(report.violations).toEqual([])
      expect(report.checked).toEqual({ featureSlug: 'feat', tasks: 2 })
    } finally {
      h.dispose()
    }
  })

  it('① 推导不动点：存储漂移 → phase-invariant（feature 级——无 taskRef）', () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'drift', status: 'prd' }) // 全终态应推导 completed
      const t = seedTask(h.db, 'drift', '1.1', { status: 'completed' })
      seedRecord(h.db, t, { verb: 'submit' })

      const report = validateFeatureTasks({ store: h.store }, { projectId: h.projectId, featureSlug: 'drift' })
      expect(report.violations).toHaveLength(1)
      const v = report.violations[0] as NonNullable<(typeof report.violations)[number]>
      expect(v.kind).toBe('phase-invariant')
      expect(v.taskRef).toBeUndefined() // feature 级违规缺省定位
      expect(v.message).toContain('存储 prd')
      expect(v.message).toContain('推导 completed')
    } finally {
      h.dispose()
    }
  })

  it('① 服务不变量：slug 列 ≢ feature slug → phase-invariant + taskRef 定位', () => {
    const h = createTasksHarness()
    try {
      const fid = seedFeature(h.db, { slug: 'feat', status: 'tasks' })
      seedTask(h.db, 'feat', '1.1')
      insertMisSluggedTask(h.db, fid)

      const report = validateFeatureTasks({ store: h.store }, { projectId: h.projectId, featureSlug: 'feat' })
      expect(report.checked).toEqual({ featureSlug: 'feat', tasks: 2 })
      const v = report.violations.find((x) => x.message.includes('slug 列'))
      expect(v?.kind).toBe('phase-invariant')
      expect(v?.taskRef).toEqual({ slug: 'other-feature', localId: '1.2' })
    } finally {
      h.dispose()
    }
  })

  it('① 服务不变量：跨 feature 边 → phase-invariant（waiter 定位 + prerequisite 自然键命名）', () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'tasks' })
      seedFeature(h.db, { slug: 'other' })
      const foreign = seedTask(h.db, 'other', '1.1', { status: 'completed' })
      seedTask(h.db, 'feat', '2.1')
      seedEdge(h.db, 't-feat-2.1', foreign)

      const report = validateFeatureTasks({ store: h.store }, { projectId: h.projectId, featureSlug: 'feat' })
      expect(report.violations).toHaveLength(1)
      const v = report.violations[0] as NonNullable<(typeof report.violations)[number]>
      expect(v.kind).toBe('phase-invariant')
      expect(v.taskRef).toEqual({ slug: 'feat', localId: '2.1' })
      expect(v.message).toContain('other/1.1')
    } finally {
      h.dispose()
    }
  })

  it('① archived 豁免：唯一不可推导态不误报', () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'arch', status: 'archived' }) // 有 pending 任务本应推导 tasks——archived 恒豁免
      seedTask(h.db, 'arch', '1.1')
      const report = validateFeatureTasks({ store: h.store }, { projectId: h.projectId, featureSlug: 'arch' })
      expect(report.violations).toEqual([])
    } finally {
      h.dispose()
    }
  })

  it('② 无环复核：seed 环 → cycle + 完整路径（首尾相接，自然键）', () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'cyc', status: 'tasks' })
      seedTask(h.db, 'cyc', '1.1')
      seedTask(h.db, 'cyc', '1.2')
      seedTask(h.db, 'cyc', '1.3')
      seedEdge(h.db, 't-cyc-1.1', 't-cyc-1.2')
      seedEdge(h.db, 't-cyc-1.2', 't-cyc-1.3')
      seedEdge(h.db, 't-cyc-1.3', 't-cyc-1.1')

      const report = validateFeatureTasks({ store: h.store }, { projectId: h.projectId, featureSlug: 'cyc' })
      expect(report.violations).toHaveLength(1)
      const v = report.violations[0] as NonNullable<(typeof report.violations)[number]>
      expect(v.kind).toBe('cycle')
      expect(v.taskRef).toBeDefined()
      expect(v.message).toContain('检测到依赖环')
      for (const key of ['cyc/1.1', 'cyc/1.2', 'cyc/1.3']) expect(v.message).toContain(key)
      const keys = v.message.split('：')[1]?.split(' → ') ?? []
      expect(keys[0]).toBe(keys[keys.length - 1]) // 首尾相接
    } finally {
      h.dispose()
    }
  })

  it('③ liveness 三判据：orphaned（无前置）/ stale（前置全满足）/ deadlock（无 pending·in_progress 前置）', () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'live', status: 'in-progress' })
      seedTask(h.db, 'live', '1.1', { status: 'blocked' }) // orphaned：无任何前置
      const done = seedTask(h.db, 'live', '1.2', { status: 'completed' })
      seedRecord(h.db, done, { verb: 'submit' })
      seedTask(h.db, 'live', '1.3', { status: 'blocked' }) // stale：前置全满足
      seedEdge(h.db, 't-live-1.3', done)
      const rej = seedTask(h.db, 'live', '1.4', { status: 'rejected' })
      seedTask(h.db, 'live', '1.5', { status: 'blocked' }) // deadlock：唯一前置 rejected
      seedEdge(h.db, 't-live-1.5', rej)

      const report = validateFeatureTasks({ store: h.store }, { projectId: h.projectId, featureSlug: 'live' })
      const liveness = report.violations.filter((v) => v.kind === 'liveness')
      expect(liveness).toHaveLength(3)
      expect(liveness.map((v) => v.taskRef?.localId).sort()).toEqual(['1.1', '1.3', '1.5'])
      expect(liveness.find((v) => v.taskRef?.localId === '1.1')?.message).toContain('orphaned')
      expect(liveness.find((v) => v.taskRef?.localId === '1.3')?.message).toContain('stale')
      expect(liveness.find((v) => v.taskRef?.localId === '1.5')?.message).toContain('deadlock')
    } finally {
      h.dispose()
    }
  })

  it('④ 记录链完整性：in_progress 必有 claim / completed 必有 submit（缺失即违规）', () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'rec', status: 'in-progress' })
      seedTask(h.db, 'rec', '1.1', { status: 'in_progress' }) // 缺 claim
      seedTask(h.db, 'rec', '1.2', { status: 'completed' }) // 缺 submit
      const okClaim = seedTask(h.db, 'rec', '1.3', { status: 'in_progress' })
      seedRecord(h.db, okClaim, { verb: 'claim' })
      const okSubmit = seedTask(h.db, 'rec', '1.4', { status: 'completed' })
      seedRecord(h.db, okSubmit, { verb: 'submit' })

      const report = validateFeatureTasks({ store: h.store }, { projectId: h.projectId, featureSlug: 'rec' })
      expect(report.violations).toHaveLength(2)
      expect(report.violations.every((v) => v.kind === 'record-chain')).toBe(true)
      expect(report.violations.map((v) => v.taskRef?.localId).sort()).toEqual(['1.1', '1.2'])
      expect(report.violations.find((v) => v.taskRef?.localId === '1.1')?.message).toContain('claim')
      expect(report.violations.find((v) => v.taskRef?.localId === '1.2')?.message).toContain('submit')
    } finally {
      h.dispose()
    }
  })

  it('⑤ 拓扑可分层：第 N 阶（N≥2）数值任务须有更早阶段直接前置；fix-N 非数值豁免', () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'topo', status: 'tasks' })
      const t11 = seedTask(h.db, 'topo', '1.1', { status: 'completed' })
      seedRecord(h.db, t11, { verb: 'submit' })
      seedTask(h.db, 'topo', '2.1') // 无前置 → 违规
      seedTask(h.db, 'topo', '2.2') // 有 1.x 前置 → 合规
      seedEdge(h.db, 't-topo-2.2', t11)
      seedTask(h.db, 'topo', 'fix-1') // 非数值 localId → 豁免

      const report = validateFeatureTasks({ store: h.store }, { projectId: h.projectId, featureSlug: 'topo' })
      expect(report.violations).toHaveLength(1)
      const v = report.violations[0] as NonNullable<(typeof report.violations)[number]>
      expect(v.kind).toBe('topology')
      expect(v.taskRef).toEqual({ slug: 'topo', localId: '2.1' })
      expect(v.message).toContain('更早阶段')
    } finally {
      h.dispose()
    }
  })

  it('M3 2.1 ① 扩展：容器命中漂移可抓（source_kind 对应表无行）+ 跨容器边同报', () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'tasks' })
      seedTask(h.db, 'feat', '2.1')
      // 悬空突击容器前置：source_id 无 proposals 行（多态引用无 DB FK——漂移面）
      insertProposalTask(h.db, { id: 't-blitz', slug: 'blitz-prop', localId: '1.1', sourceId: 'p-missing' })
      seedEdge(h.db, 't-feat-2.1', 't-blitz')

      const report = validateFeatureTasks({ store: h.store }, { projectId: h.projectId, featureSlug: 'feat' })
      expect(report.violations).toHaveLength(2)
      const miss = report.violations.find((v) => v.message.includes('容器未命中'))
      expect(miss?.kind).toBe('phase-invariant')
      expect(miss?.taskRef).toEqual({ slug: 'blitz-prop', localId: '1.1' })
      expect(miss?.message).toContain("source_kind='proposal'")
      expect(miss?.message).toContain("source_id='p-missing'")
      const edge = report.violations.find((v) => v.message.includes('跨容器边'))
      expect(edge?.kind).toBe('phase-invariant')
      expect(edge?.taskRef).toEqual({ slug: 'feat', localId: '2.1' })
      expect(edge?.message).toContain('blitz-prop/1.1')
    } finally {
      h.dispose()
    }
  })

  it('M3 2.1 ① 扩展：合法突击容器前置（proposals 行在场）→ 仅跨容器边一报，容器命中过', () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'tasks' })
      seedTask(h.db, 'feat', '2.1')
      insertProposal(h.db, { id: 'p-blitz', slug: 'blitz-prop' })
      insertProposalTask(h.db, { id: 't-blitz', slug: 'blitz-prop', localId: '1.1', sourceId: 'p-blitz' })
      seedEdge(h.db, 't-feat-2.1', 't-blitz')

      const report = validateFeatureTasks({ store: h.store }, { projectId: h.projectId, featureSlug: 'feat' })
      expect(report.violations).toHaveLength(1)
      expect(report.violations[0]?.message).toContain('跨容器边')
      expect(report.violations[0]?.message).not.toContain('容器未命中')
    } finally {
      h.dispose()
    }
  })

  it('M3 2.1 ① 扩展：kind 漂移行（source_kind=proposal ∧ source_id=feature id）→ 边合法不报 + 行容器未命中一报', () => {
    const h = createTasksHarness()
    try {
      const fid = seedFeature(h.db, { slug: 'feat', status: 'tasks' })
      seedTask(h.db, 'feat', '2.1')
      // 同 source_id（同容器边合法）但 kind 漂移——proposals 表无此 id → 容器未命中
      insertProposalTask(h.db, { id: 't-drift', slug: 'feat', localId: '1.1', sourceId: fid })
      seedEdge(h.db, 't-feat-2.1', 't-drift')

      const report = validateFeatureTasks({ store: h.store }, { projectId: h.projectId, featureSlug: 'feat' })
      expect(report.violations).toHaveLength(1)
      const v = report.violations[0] as NonNullable<(typeof report.violations)[number]>
      expect(v.kind).toBe('phase-invariant')
      expect(v.message).toContain('容器未命中')
      expect(v.message).not.toContain('跨容器边')
      expect(v.taskRef).toEqual({ slug: 'feat', localId: '1.1' })
    } finally {
      h.dispose()
    }
  })

  it('feature 未命中：ERR_FEATURE_NOT_FOUND（404——送校方 fail-soft 承接）', () => {
    const h = createTasksHarness()
    try {
      expect(() => validateFeatureTasks({ store: h.store }, { projectId: h.projectId, featureSlug: 'nope' })).toThrow(
        TasksFeatureNotFoundError,
      )
    } finally {
      h.dispose()
    }
  })
})
