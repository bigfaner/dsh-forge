import { describe, expect, it } from 'vitest'
import {
  buildProjectionPlan,
  buildRemovalPlan,
  diffProjection,
  type DeviationRow,
  type ProjectionExpectation,
  type WorkspaceSnapshotEntry,
} from '../src/main/workbench/projection/index.ts'

// 任务 3.1 — 投影 diff/plan 纯函数矩阵(tech-design §Interface 1/2 +
// §Testing Strategy·projection 行:diff 矩阵(四操作 + 三类偏差)/幂等重推)。
// 纯函数域:零 db 零 fs,全部用例为数据进出断言;单向纪律的结构面体现 =
// 本域没有任何以实况为权威的产出函数(偏差行/plan 均为期望 → 实况方向)。

function exp(overrides: Partial<ProjectionExpectation> & { projectId: string }): ProjectionExpectation {
  return {
    path: `/ws/${overrides.projectId}`,
    expectedTitle: overrides.projectId.toUpperCase(),
    orderIdx: 0,
    archived: false,
    pushedWorkspaceId: null,
    pushedTitle: null,
    pushedAt: null,
    lastError: null,
    ...overrides,
  }
}

function ws(workspaceId: string, path: string, title: string, orderIdx: number): WorkspaceSnapshotEntry {
  return { workspaceId, path, title, orderIdx }
}

function deviationsOf(rows: ReturnType<typeof diffProjection>['rows'], projectId: string): readonly DeviationRow[] {
  return rows.find(row => row.projectId === projectId)?.deviations ?? []
}

function verdictOf(rows: ReturnType<typeof diffProjection>['rows'], projectId: string): string {
  return rows.find(row => row.projectId === projectId)?.verdict ?? 'missing'
}

describe('projection diff — 四操作派生(AC-2/AC-3)', () => {
  it('注册(实况未知/null 快照):单 ensure op,verdict unprojected,零偏差', () => {
    const a = exp({ projectId: 'a', path: '/proj/a', expectedTitle: 'A' })
    const result = diffProjection([a], null)
    expect(result.plans).toEqual([{ projectId: 'a', ops: [{ kind: 'ensure', canonicalPath: '/proj/a', title: 'A' }] }])
    expect(result.rows).toEqual([{ projectId: 'a', verdict: 'unprojected', deviations: [] }])
  })

  it('稳态(实况与期望一致):空 ops plan,verdict match,零偏差', () => {
    const a = exp({ projectId: 'a', path: '/proj/a', expectedTitle: 'A', pushedWorkspaceId: 'ws-1', pushedTitle: 'A', pushedAt: '2026-09-29T00:00:00.000Z' })
    const snapshot = [ws('ws-1', '/proj/a', 'A', 0)]
    const result = diffProjection([a], snapshot)
    expect(result.plans).toEqual([{ projectId: 'a', ops: [] }])
    expect(result.rows).toEqual([{ projectId: 'a', verdict: 'match', deviations: [] }])
  })

  it('注册(实况未命中,从未推送):ensure op,零偏差(无从被手改)', () => {
    const a = exp({ projectId: 'a', path: '/proj/a' })
    const result = diffProjection([a], [ws('ws-user', '/elsewhere', 'User', 0)])
    expect(result.plans[0]?.ops).toEqual([{ kind: 'ensure', canonicalPath: '/proj/a', title: 'A' }])
    expect(deviationsOf(result.rows, 'a')).toEqual([])
    expect(verdictOf(result.rows, 'a')).toBe('unprojected')
  })

  it('改名(forge 侧改名未推完):rename op,零偏差(待推 ≠ 手改)', () => {
    const a = exp({ projectId: 'a', expectedTitle: 'New', pushedWorkspaceId: 'ws-1', pushedTitle: 'Old' })
    const snapshot = [ws('ws-1', '/ws/a', 'Old', 0)]
    const result = diffProjection([a], snapshot)
    expect(result.plans[0]?.ops).toEqual([{ kind: 'rename', workspaceId: 'ws-1', title: 'New' }])
    expect(deviationsOf(result.rows, 'a')).toEqual([])
    expect(verdictOf(result.rows, 'a')).toBe('unprojected')
  })

  it('删除(dsh 侧手删已推送 workspace):deleted 偏差 + ensure 重建 op', () => {
    const a = exp({ projectId: 'a', path: '/proj/a', pushedWorkspaceId: 'ws-1', pushedTitle: 'A' })
    const result = diffProjection([a], [])
    expect(deviationsOf(result.rows, 'a')).toEqual([
      { type: 'deleted', detail: 'workspace gone: pushed ws-1 at /proj/a no longer reported by dsh' },
    ])
    expect(verdictOf(result.rows, 'a')).toBe('drift')
    expect(result.plans[0]?.ops).toEqual([{ kind: 'ensure', canonicalPath: '/proj/a', title: 'A' }])
  })

  it('重排:实况子集相对序 ≠ 期望 → reorder op(仅 forge 子集,期望序)+ reordered 偏差', () => {
    const a = exp({ projectId: 'a', orderIdx: 0, pushedWorkspaceId: 'ws-a', pushedTitle: 'A' })
    const b = exp({ projectId: 'b', orderIdx: 1, pushedWorkspaceId: 'ws-b', pushedTitle: 'B' })
    // 实况:b 在 a 前(乱序);用户自有 workspace 混排其间(不动)。
    const snapshot = [ws('ws-user', '/own', 'User', 0), ws('ws-b', '/ws/b', 'B', 1), ws('ws-a', '/ws/a', 'A', 2)]
    const result = diffProjection([a, b], snapshot)
    expect(result.plans.map(plan => plan.projectId)).toEqual(['a', 'b'])
    for (const plan of result.plans) {
      expect(plan.ops).toEqual([{ kind: 'reorder', orderedIds: ['ws-a', 'ws-b'] }])
    }
    for (const projectId of ['a', 'b']) {
      expect(deviationsOf(result.rows, projectId)).toEqual([
        { type: 'reordered', detail: 'order drift: expected [ws-a, ws-b] vs dsh [ws-b, ws-a]' },
      ])
      expect(verdictOf(result.rows, projectId)).toBe('drift')
    }
  })

  it('重排(用户 workspace 插排其间,forge 子集相对序一致):零 reorder op 零偏差', () => {
    const a = exp({ projectId: 'a', orderIdx: 0, pushedWorkspaceId: 'ws-a', pushedTitle: 'A' })
    const b = exp({ projectId: 'b', orderIdx: 1, pushedWorkspaceId: 'ws-b', pushedTitle: 'B' })
    const snapshot = [ws('ws-a', '/ws/a', 'A', 0), ws('ws-user', '/own', 'User', 1), ws('ws-b', '/ws/b', 'B', 2)]
    const result = diffProjection([a, b], snapshot)
    expect(result.plans).toEqual([
      { projectId: 'a', ops: [] },
      { projectId: 'b', ops: [] },
    ])
    expect(result.rows.map(row => row.verdict)).toEqual(['match', 'match'])
  })
})

describe('projection diff — 三类偏差分类(AC-2)', () => {
  it('renamed:dsh 侧手改 title(基线 = 最近成功 push title)', () => {
    const a = exp({ projectId: 'a', path: '/proj/a', pushedWorkspaceId: 'ws-1', pushedTitle: 'A' })
    const result = diffProjection([a], [ws('ws-1', '/proj/a', 'A-manual', 0)])
    expect(deviationsOf(result.rows, 'a')).toEqual([
      { type: 'renamed', detail: "title drift: pushed 'A' vs dsh 'A-manual' (workspace ws-1 at /proj/a)" },
    ])
    expect(result.plans[0]?.ops).toEqual([{ kind: 'rename', workspaceId: 'ws-1', title: 'A' }])
  })

  it('renamed 不误报:forge 改名后实况仍为旧名 = 待推,非手改', () => {
    const a = exp({ projectId: 'a', expectedTitle: 'New', pushedWorkspaceId: 'ws-1', pushedTitle: 'Old' })
    const result = diffProjection([a], [ws('ws-1', '/ws/a', 'Old', 0)])
    expect(deviationsOf(result.rows, 'a')).toEqual([])
  })

  it('deleted 不误报:同 path 异 id = 删除重建复连(ensure 收养),非 deleted 偏差', () => {
    const a = exp({ projectId: 'a', path: '/proj/a', pushedWorkspaceId: 'ws-old', pushedTitle: 'A' })
    const result = diffProjection([a], [ws('ws-new', '/proj/a', 'A', 0)])
    expect(deviationsOf(result.rows, 'a')).toEqual([])
    expect(result.plans[0]?.ops).toEqual([{ kind: 'ensure', canonicalPath: '/proj/a', title: 'A' }])
    expect(verdictOf(result.rows, 'a')).toBe('unprojected')
  })

  it('reordered 仅判已推送成员:未收养成员乱序不产偏差,但 reorder op 仍收敛全子集', () => {
    const a = exp({ projectId: 'a', orderIdx: 0, pushedWorkspaceId: 'ws-a', pushedTitle: 'A' })
    const b = exp({ projectId: 'b', orderIdx: 1 }) // 从未推送(实况已在场,将被收编)
    const snapshot = [ws('ws-b', '/ws/b', 'B', 0), ws('ws-a', '/ws/a', 'A', 1)]
    const result = diffProjection([a, b], snapshot)
    expect(deviationsOf(result.rows, 'a')).toEqual([])
    expect(deviationsOf(result.rows, 'b')).toEqual([])
    // a:子集乱序待收敛(b 参与,无偏差);b:自身一致但共享待收敛 reorder op。
    expect(verdictOf(result.rows, 'a')).toBe('unprojected')
    expect(verdictOf(result.rows, 'b')).toBe('unprojected')
    for (const plan of result.plans) {
      expect(plan.ops).toEqual([{ kind: 'reorder', orderedIds: ['ws-a', 'ws-b'] }])
    }
  })

  it('偏差仅呈现(单向纪律):三类偏差同场共存,plan 方向恒为期望 → 实况', () => {
    const a = exp({ projectId: 'a', orderIdx: 0, path: '/proj/a', pushedWorkspaceId: 'ws-a', pushedTitle: 'A' })
    const b = exp({ projectId: 'b', orderIdx: 1, pushedWorkspaceId: 'ws-b', pushedTitle: 'B' })
    const c = exp({ projectId: 'c', orderIdx: 2, path: '/proj/c', pushedWorkspaceId: 'ws-c', pushedTitle: 'C' })
    // a:手改+乱序;b:乱序;c:被手删。
    const snapshot = [ws('ws-b', '/ws/b', 'B', 0), ws('ws-a', '/proj/a', 'A-manual', 1)]
    const result = diffProjection([a, b, c], snapshot)
    expect(deviationsOf(result.rows, 'a').map(row => row.type)).toEqual(['renamed', 'reordered'])
    expect(deviationsOf(result.rows, 'b').map(row => row.type)).toEqual(['reordered'])
    expect(deviationsOf(result.rows, 'c').map(row => row.type)).toEqual(['deleted'])
    expect(result.plans.map(plan => plan.projectId)).toEqual(['a', 'b', 'c'])
    // 收敛 op:ensure(c 重建)+ rename(a 复原名)+ reorder(全子集期望序)。
    expect(result.plans[0]?.ops).toEqual([
      { kind: 'rename', workspaceId: 'ws-a', title: 'A' },
      { kind: 'reorder', orderedIds: ['ws-a', 'ws-b'] },
    ])
    expect(result.plans[2]?.ops).toEqual([
      { kind: 'ensure', canonicalPath: '/proj/c', title: 'C' },
      { kind: 'reorder', orderedIds: ['ws-a', 'ws-b'] },
    ])
  })
})

describe('projection diff — 执行序与幂等(AC-2/AC-3)', () => {
  it('plan ops 序 = ensure → rename → reorder(delete 独立成 plan);plans 按 sort_order 升序', () => {
    const b = exp({ projectId: 'b', orderIdx: 5, path: '/proj/b', pushedWorkspaceId: 'ws-b-old', pushedTitle: 'B', expectedTitle: 'B2' })
    const a = exp({ projectId: 'a', orderIdx: 0, path: '/proj/a', pushedWorkspaceId: 'ws-a-old', pushedTitle: 'A' })
    // 两项目均触发复连 ensure + title 收敛 rename + 子集乱序 reorder。
    const snapshot = [ws('ws-b-new', '/proj/b', 'B', 0), ws('ws-a-new', '/proj/a', 'A-old', 1)]
    const result = diffProjection([b, a], snapshot) // 乱序输入 → 产物仍按 sort_order
    expect(result.plans.map(plan => plan.projectId)).toEqual(['a', 'b'])
    expect(result.plans[0]?.ops).toEqual([
      { kind: 'ensure', canonicalPath: '/proj/a', title: 'A' },
      { kind: 'rename', workspaceId: 'ws-a-new', title: 'A' },
      { kind: 'reorder', orderedIds: ['ws-a-new', 'ws-b-new'] },
    ])
    expect(result.plans[1]?.ops).toEqual([
      { kind: 'ensure', canonicalPath: '/proj/b', title: 'B2' },
      { kind: 'rename', workspaceId: 'ws-b-new', title: 'B2' },
      { kind: 'reorder', orderedIds: ['ws-a-new', 'ws-b-new'] },
    ])
  })

  it('幂等全量重推:同输入(含乱序输入数组)两次 diff 产物深度相等', () => {
    const a = exp({ projectId: 'a', orderIdx: 0, pushedWorkspaceId: 'ws-a', pushedTitle: 'A' })
    const b = exp({ projectId: 'b', orderIdx: 1, pushedWorkspaceId: 'ws-b', pushedTitle: 'B' })
    const snapshot = [ws('ws-b', '/ws/b', 'B-manual', 0), ws('ws-a', '/ws/a', 'A', 1)]
    const first = diffProjection([a, b], snapshot)
    const second = diffProjection([b, a], snapshot)
    expect(second).toEqual(first)
    const third = diffProjection([a, b], snapshot)
    expect(third).toEqual(first)
  })

  it('单命中子集不产 reorder op(<2 无相对序可言)', () => {
    const a = exp({ projectId: 'a', pushedWorkspaceId: 'ws-a', pushedTitle: 'A' })
    const result = diffProjection([a], [ws('ws-a', '/ws/a', 'A', 3)])
    expect(result.plans[0]?.ops).toEqual([])
  })
})

describe('projection diff — 归档语义(AC-5,必答⑤)', () => {
  it('archived=1:零 plan 零偏差零迁移(verdict archived),期望不变', () => {
    const active = exp({ projectId: 'a', orderIdx: 0, pushedWorkspaceId: 'ws-a', pushedTitle: 'A' })
    const archived = exp({ projectId: 'z', orderIdx: 1, path: '/proj/z', pushedWorkspaceId: 'ws-z', pushedTitle: 'Z', archived: true })
    // 归档项目 workspace 在实况中消失(手删)也不产生偏差/op:归档不对账。
    const result = diffProjection([active, archived], [ws('ws-a', '/ws/a', 'A', 0)])
    expect(result.plans.map(plan => plan.projectId)).toEqual(['a'])
    expect(result.plans[0]?.ops).toEqual([])
    expect(result.rows).toEqual([
      { projectId: 'a', verdict: 'match', deviations: [] },
      { projectId: 'z', verdict: 'archived', deviations: [] },
    ])
  })

  it('buildProjectionPlan 对 archived 项目恒零 op(即使实况乱序/消失)', () => {
    const archived = exp({ projectId: 'z', path: '/proj/z', pushedWorkspaceId: 'ws-z', pushedTitle: 'Z', archived: true, orderIdx: 0 })
    const partner = exp({ projectId: 'a', orderIdx: 1, pushedWorkspaceId: 'ws-a', pushedTitle: 'A' })
    const snapshot = [ws('ws-a', '/ws/a', 'A', 0)]
    expect(buildProjectionPlan([archived, partner], snapshot, 'z')).toEqual({ projectId: 'z', ops: [] })
  })
})

describe('projection diff — 存量收数与复连(AC-1/AC-6)', () => {
  it('adopted(从未推送但实况同名在场):零 op,verdict match(pending 存量收数径)', () => {
    const stock = exp({ projectId: 's', path: '/proj/s', expectedTitle: 'S' })
    const result = diffProjection([stock], [ws('ws-s', '/proj/s', 'S', 0)])
    expect(result.plans).toEqual([{ projectId: 's', ops: [] }])
    expect(result.rows).toEqual([{ projectId: 's', verdict: 'match', deviations: [] }])
  })

  it('adopted 但异名:零偏差(无推送基线),rename op 待收敛,verdict unprojected', () => {
    const stock = exp({ projectId: 's', path: '/proj/s', expectedTitle: 'S' })
    const result = diffProjection([stock], [ws('ws-s', '/proj/s', 'User title', 0)])
    expect(deviationsOf(result.rows, 's')).toEqual([])
    expect(result.plans[0]?.ops).toEqual([{ kind: 'rename', workspaceId: 'ws-s', title: 'S' }])
    expect(verdictOf(result.rows, 's')).toBe('unprojected')
  })

  it('buildRemovalPlan:实况 path 命中优先(复连安全),回退 pushedWorkspaceId,皆无则空', () => {
    const pushed = exp({ projectId: 'a', path: '/proj/a', pushedWorkspaceId: 'ws-old' })
    expect(buildRemovalPlan(pushed, [ws('ws-new', '/proj/a', 'A', 0)]).ops).toEqual([{ kind: 'delete', workspaceId: 'ws-new' }])
    expect(buildRemovalPlan(pushed, null).ops).toEqual([{ kind: 'delete', workspaceId: 'ws-old' }])
    expect(buildRemovalPlan(pushed, []).ops).toEqual([{ kind: 'delete', workspaceId: 'ws-old' }])
    const virgin = exp({ projectId: 'b', path: '/proj/b' })
    expect(buildRemovalPlan(virgin, null).ops).toEqual([])
  })

  it('buildProjectionPlan 未知 projectId → 显式 Error', () => {
    expect(() => buildProjectionPlan([], null, 'ghost')).toThrow(/unknown project ghost/)
  })
})

describe('projection diff — path 匹配键(平台折叠,projects-identity 单源)', () => {
  it('精确 path 命中(分隔符由调用方规范;键折叠同 toComparableKey)', () => {
    const a = exp({ projectId: 'a', path: '/proj/a', pushedWorkspaceId: 'ws-1', pushedTitle: 'A' })
    expect(diffProjection([a], [ws('ws-1', '/proj/a', 'A', 0)]).rows[0]?.verdict).toBe('match')
    expect(diffProjection([a], [ws('ws-1', '/proj/other', 'A', 0)]).rows[0]?.verdict).not.toBe('match')
  })

  it.skipIf(process.platform !== 'win32')('win32 大小写折叠:异体写法同 path 匹配', () => {
    const a = exp({ projectId: 'a', path: 'C:/Proj/A', pushedWorkspaceId: 'ws-1', pushedTitle: 'A' })
    expect(diffProjection([a], [ws('ws-1', 'c:/proj/a', 'A', 0)]).rows[0]?.verdict).toBe('match')
  })
})
