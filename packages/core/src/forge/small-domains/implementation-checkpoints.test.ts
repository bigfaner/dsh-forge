// 机械①（forge-verification-hardening）第六小域测试——implementation_checkpoints 实现检查点
// 流水域三法（appendCheckpoint / ensureCheckpoint lazy 补标记 / listCheckpoints）。
// 表契约 = forge-verification-hardening proposal「实体设计」节：五类里程碑标记 + 关系标记
// derived-to-child；唯一约束 (proposal_id, mark, wave_seq) 仅作用于五类里程碑标记（partial
// unique index 行为面锁定）；append-only 触发器行为直查锁定。
import { afterEach, describe, expect, it } from 'vitest'
import { createCheckpointsService } from './implementation-checkpoints.js'
import { CheckpointAlreadyExistsError, CheckpointWaveSeqInvalidError } from './implementation-checkpoints.js'
import { createHarness, type SmallDomainHarness } from './harness.js'

/** 种 proposals 行（proposal_id FK 真值锚——implementation_checkpoints.proposal_id REFERENCES proposals(id)） */
function seedProposal(h: SmallDomainHarness, id: string): void {
  h.wsDb
    .prepare(
      `INSERT INTO proposals (id, slug, title, proposal_status, created_at, updated_at)
       VALUES (?, ?, ?, 'accepted', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    )
    .run(id, `slug-${id}`, `提案 ${id}`)
}

const SNAP = { tasksTotal: 3, commitsTotal: 5, fixesTotal: 1, evidenceDebtsTotal: 0 }

function makeService(h: SmallDomainHarness) {
  return createCheckpointsService({ store: h.store, events: h.events })
}

describe('appendCheckpoint：里程碑标记追加 + 唯一约束', () => {
  let h: SmallDomainHarness | undefined
  afterEach(() => h?.dispose())

  it('里程碑标记落行：全字段快照（五列 + base_commit_hash）+ created_at 落 ISO 时钟', async () => {
    h = createHarness()
    seedProposal(h, 'p1')
    const svc = makeService(h)
    const row = await svc.appendCheckpoint({
      projectId: h.projectId,
      proposalId: 'p1',
      mark: 'first-pass-complete',
      baseCommitHash: 'abc1234',
      snapshots: SNAP,
    })
    expect(row.proposalId).toBe('p1')
    expect(row.mark).toBe('first-pass-complete')
    expect(row.waveSeq).toBeUndefined() // 非 review-wave-N：wave_seq 键缺席
    expect(row.baseCommitHash).toBe('abc1234')
    expect(row.tasksTotal).toBe(3)
    expect(row.commitsTotal).toBe(5)
    expect(row.fixesTotal).toBe(1)
    expect(row.evidenceDebtsTotal).toBe(0)
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('同 (proposal_id, mark) 重复 append → CheckpointAlreadyExistsError 拒写（append-only 流水无重复里程碑）', async () => {
    h = createHarness()
    seedProposal(h, 'p1')
    const svc = makeService(h)
    const input = {
      projectId: h.projectId,
      proposalId: 'p1',
      mark: 'merged' as const,
      baseCommitHash: 'abc1234',
      snapshots: SNAP,
    }
    await svc.appendCheckpoint(input)
    await expect(svc.appendCheckpoint(input)).rejects.toBeInstanceOf(CheckpointAlreadyExistsError)
    // 零副作用：仍只有一行
    expect(await svc.listCheckpoints({ projectId: h.projectId, proposalId: 'p1' })).toHaveLength(1)
  })

  it('review-wave-N 同 wave_seq 重复 → 拒写；不同 wave_seq 各一行', async () => {
    h = createHarness()
    seedProposal(h, 'p1')
    const svc = makeService(h)
    const base = { projectId: h.projectId, proposalId: 'p1', baseCommitHash: 'abc1234', snapshots: SNAP }
    await svc.appendCheckpoint({ ...base, mark: 'review-wave-N', waveSeq: 2 })
    await expect(svc.appendCheckpoint({ ...base, mark: 'review-wave-N', waveSeq: 2 })).rejects.toBeInstanceOf(
      CheckpointAlreadyExistsError,
    )
    await svc.appendCheckpoint({ ...base, mark: 'review-wave-N', waveSeq: 3 })
    const rows = await svc.listCheckpoints({ projectId: h.projectId, proposalId: 'p1' })
    expect(rows.map((r) => r.waveSeq)).toEqual([2, 3])
  })

  it('review-wave-N 缺 wave_seq → 自动递增（max+1，首波 = 1）——多波递增路径', async () => {
    h = createHarness()
    seedProposal(h, 'p1')
    const svc = makeService(h)
    const base = { projectId: h.projectId, proposalId: 'p1', baseCommitHash: 'abc1234', snapshots: SNAP }
    const w1 = await svc.appendCheckpoint({ ...base, mark: 'review-wave-N' })
    const w2 = await svc.appendCheckpoint({ ...base, mark: 'review-wave-N' })
    const w3 = await svc.appendCheckpoint({ ...base, mark: 'review-wave-N' })
    expect([w1.waveSeq, w2.waveSeq, w3.waveSeq]).toEqual([1, 2, 3])
  })

  it('wave_seq 仅 review-wave-N 使用：其余标记带 wave_seq → CheckpointWaveSeqInvalidError 拒写', async () => {
    h = createHarness()
    seedProposal(h, 'p1')
    const svc = makeService(h)
    await expect(
      svc.appendCheckpoint({
        projectId: h.projectId,
        proposalId: 'p1',
        mark: 'stabilized',
        waveSeq: 1,
        baseCommitHash: 'abc1234',
        snapshots: SNAP,
      }),
    ).rejects.toBeInstanceOf(CheckpointWaveSeqInvalidError)
  })

  it('关系标记 derived-to-child 不受唯一约束：每派生一个提案落一行', async () => {
    h = createHarness()
    seedProposal(h, 'p1')
    const svc = makeService(h)
    const base = { projectId: h.projectId, proposalId: 'p1', baseCommitHash: 'abc1234', snapshots: SNAP }
    await svc.appendCheckpoint({ ...base, mark: 'derived-to-child' })
    await svc.appendCheckpoint({ ...base, mark: 'derived-to-child' })
    expect(await svc.listCheckpoints({ projectId: h.projectId, proposalId: 'p1' })).toHaveLength(2)
  })

  it('proposal_id 悬空引用拒写（FK 真值预检——零副作用）', async () => {
    h = createHarness()
    const svc = makeService(h)
    await expect(
      svc.appendCheckpoint({
        projectId: h.projectId,
        proposalId: 'p-ghost',
        mark: 'merged',
        baseCommitHash: 'abc1234',
        snapshots: SNAP,
      }),
    ).rejects.toThrow('p-ghost')
    expect(await svc.listCheckpoints({ projectId: h.projectId, proposalId: 'p-ghost' })).toHaveLength(0)
  })
})

describe('ensureCheckpoint：lazy 补标记（merged/stabilized 漏打兜底）', () => {
  let h: SmallDomainHarness | undefined
  afterEach(() => h?.dispose())

  it('缺席 → 追加（appended=true 返回新行）；在场 → no-op（appended=false，不重复落行）', async () => {
    h = createHarness()
    seedProposal(h, 'p1')
    const svc = makeService(h)
    const input = {
      projectId: h.projectId,
      proposalId: 'p1',
      mark: 'merged' as const,
      baseCommitHash: 'abc1234',
      snapshots: SNAP,
    }
    const first = await svc.ensureCheckpoint(input)
    expect(first.appended).toBe(true)
    expect(first.checkpoint?.mark).toBe('merged')
    const second = await svc.ensureCheckpoint(input)
    expect(second.appended).toBe(false)
    expect(second.checkpoint).toBeUndefined()
    expect(await svc.listCheckpoints({ projectId: h.projectId, proposalId: 'p1' })).toHaveLength(1)
  })
})

describe('listCheckpoints：按 proposal_id 时序查询 + 标记过滤', () => {
  let h: SmallDomainHarness | undefined
  afterEach(() => h?.dispose())

  it('时序输出（created_at 升序，同刻按 id 稳定）+ marks 过滤 + 跨提案隔离', async () => {
    h = createHarness()
    seedProposal(h, 'p1')
    seedProposal(h, 'p2')
    const svc = makeService(h)
    const base = { baseCommitHash: 'abc1234', snapshots: SNAP }
    // 人为控制落库时序：clock 注入不可用（服务内 ISO 时钟），以插入顺序 + 同毫秒 id 稳定序断言
    await svc.appendCheckpoint({ projectId: h.projectId, proposalId: 'p1', mark: 'first-pass-complete', ...base })
    await svc.appendCheckpoint({ projectId: h.projectId, proposalId: 'p1', mark: 'review-wave-N', waveSeq: 1, ...base })
    await svc.appendCheckpoint({ projectId: h.projectId, proposalId: 'p1', mark: 'merged', ...base })
    await svc.appendCheckpoint({ projectId: h.projectId, proposalId: 'p2', mark: 'merged', ...base })

    const all = await svc.listCheckpoints({ projectId: h.projectId, proposalId: 'p1' })
    expect(all.map((r) => r.mark)).toEqual(['first-pass-complete', 'review-wave-N', 'merged'])

    const wavesOnly = await svc.listCheckpoints({ projectId: h.projectId, proposalId: 'p1', marks: ['review-wave-N'] })
    expect(wavesOnly.map((r) => r.mark)).toEqual(['review-wave-N'])

    const p2 = await svc.listCheckpoints({ projectId: h.projectId, proposalId: 'p2' })
    expect(p2.map((r) => r.proposalId)).toEqual(['p2'])
  })
})

describe('append-only 纪律（DDL 触发器行为面）', () => {
  let h: SmallDomainHarness | undefined
  afterEach(() => h?.dispose())

  it('UPDATE/DELETE 直写 → 触发器 ABORT（流水只追加不可改写）', () => {
    h = createHarness()
    seedProposal(h, 'p1')
    h.wsDb
      .prepare(
        `INSERT INTO implementation_checkpoints
           (proposal_id, mark, wave_seq, created_at, base_commit_hash, tasks_total, commits_total, fixes_total, evidence_debts_total)
         VALUES ('p1', 'merged', NULL, '2026-01-01T00:00:00.000Z', 'abc1234', 1, 1, 0, 0)`,
      )
      .run()
    expect(() =>
      h!.wsDb.prepare(`UPDATE implementation_checkpoints SET tasks_total = 9`).run(),
    ).toThrow(/append-only violation/)
    expect(() => h!.wsDb.prepare(`DELETE FROM implementation_checkpoints`).run()).toThrow(/append-only violation/)
  })
})
