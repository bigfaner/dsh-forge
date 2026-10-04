// sidebar-model 单测 —— UF-1 项目树/会话列表派生（AC2：项目树读 forge:projects/list、
// 会话列表实时读 dsh 账本；AC5：空态判据输入）。纯函数面：快照进、视图行出、零持有。
import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '@dsh-forge/contracts'
import {
  buildSidebarTree,
  relativeTimeLabel,
  sessionDotState,
  sessionStatus,
  sidebarArchivedFilterOf,
  sidebarFilterOf,
  sidebarFlatFilterOf,
  sidebarFlatRowsOf,
  sidebarSectionLabelOf,
  sidebarViewOfPick,
  type LedgerSessionRow,
  type LedgerSessionsSnapshot,
  type LedgerWorkspacesSnapshot,
  type SidebarProjectNode,
} from './sidebar-model.js'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

function project(id: string, workspaceId: string, overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return { id, workspaceId, name: `项目${id}`, wsPath: `Z:/w/${id}`, archived: false, ...overrides }
}

function ledgerRow(id: string, overrides: Partial<LedgerSessionRow> = {}): LedgerSessionRow {
  return { id, displayTitle: `会话${id}`, updatedAt: Date.now() - 5 * MIN, ...overrides }
}

function ledger(rows: readonly LedgerSessionRow[], overrides: Partial<LedgerSessionsSnapshot> = {}): LedgerSessionsSnapshot {
  return {
    ids: rows.map((r) => r.id),
    byId: Object.fromEntries(rows.map((r) => [r.id, r])),
    phase: 'ready',
    ...overrides,
  }
}

function workspaces(items: readonly { workspaceId: string; sessionIds: string[] }[]): LedgerWorkspacesSnapshot {
  return { items }
}

describe('sessionStatus / sessionDotState（状态点四态）', () => {
  it('优先级：用户注意 > 完成提醒 > 进行中 > 静默', () => {
    expect(sessionStatus(ledgerRow('a', { pendingInteraction: { kind: 'question' }, running: true }))).toBe('attention')
    expect(sessionStatus(ledgerRow('b', { completed: true, running: false }))).toBe('done')
    expect(sessionStatus(ledgerRow('c', { running: true }))).toBe('running')
    expect(sessionStatus(ledgerRow('d'))).toBe('idle')
  })
  it('映射官方 StateDot 语义（warning/done/ongoing/idle）', () => {
    expect(sessionDotState('attention')).toBe('warning')
    expect(sessionDotState('done')).toBe('done')
    expect(sessionDotState('running')).toBe('ongoing')
    expect(sessionDotState('idle')).toBe('idle')
  })
})

describe('relativeTimeLabel（相对时间，官方桶化 + zh 文案）', () => {
  const now = 1_700_000_000_000
  it('五桶 + 刚刚', () => {
    expect(relativeTimeLabel(now - 30_000, now)).toBe('刚刚')
    expect(relativeTimeLabel(now - 5 * MIN, now)).toBe('5 分钟前')
    expect(relativeTimeLabel(now - 3 * HOUR, now)).toBe('3 小时前')
    expect(relativeTimeLabel(now - 2 * DAY, now)).toBe('2 天前')
    expect(relativeTimeLabel(now - 45 * DAY, now)).toBe('1 个月前')
    expect(relativeTimeLabel(now - 400 * DAY, now)).toBe('1 年前')
  })
})

describe('buildSidebarTree（项目树派生）', () => {
  it('项目序 = RPC 返回序；会话 = workspace 归属序 ∩ 账本（AC2）', () => {
    const out = buildSidebarTree({
      projects: [project('p1', 'w1'), project('p2', 'w2')],
      sessions: ledger([
        ledgerRow('s1', { updatedAt: 1 }),
        ledgerRow('s2', { updatedAt: 2 }),
        ledgerRow('s3', { updatedAt: 3 }),
      ]),
      workspaces: workspaces([
        { workspaceId: 'w1', sessionIds: ['s2', 's1'] },
        { workspaceId: 'w2', sessionIds: ['s3'] },
      ]),
    })
    expect(out.tree.map((n) => n.projectId)).toEqual(['p1', 'p2'])
    expect(out.tree[0]!.sessions.map((r) => r.sessionId)).toEqual(['s2', 's1'])
    expect(out.tree[1]!.sessions.map((r) => r.sessionId)).toEqual(['s3'])
    expect(out.tree[0]!.sessions[0]!.title).toBe('会话s2')
  })

  it('账本缺行的成员跳过；workspace 缺席 = 空会话项目；未注册 workspace 的会话不入树', () => {
    const out = buildSidebarTree({
      projects: [project('p1', 'w1')],
      // s-dead 在 workspace 成员表里但账本 byId 无行（缺行跳过）
      sessions: ledger([ledgerRow('s1'), ledgerRow('orphan')]),
      workspaces: workspaces([
        { workspaceId: 'w1', sessionIds: ['s1', 's-dead'] },
        { workspaceId: 'w-unregistered', sessionIds: ['orphan'] },
      ]),
    })
    expect(out.tree).toHaveLength(1)
    expect(out.tree[0]!.sessions.map((r) => r.sessionId)).toEqual(['s1'])
  })

  it('子代理行不入顶层；空白会话仅显示被选中者（官方浏览器口径）', () => {
    const out = buildSidebarTree({
      projects: [project('p1', 'w1')],
      sessions: ledger(
        [
          ledgerRow('s1'),
          ledgerRow('child', { parentId: 's1' }),
          ledgerRow('blank-a', { blank: true }),
          ledgerRow('blank-cur', { blank: true }),
        ],
        { current: 'blank-cur' },
      ),
      workspaces: workspaces([{ workspaceId: 'w1', sessionIds: ['s1', 'child', 'blank-a', 'blank-cur'] }]),
    })
    expect(out.tree[0]!.sessions.map((r) => r.sessionId)).toEqual(['s1', 'blank-cur'])
    expect(out.currentSessionId).toBe('blank-cur')
  })

  it('phase pending → loading 骨架相位；current 缺席 → null', () => {
    const out = buildSidebarTree({
      projects: [project('p1', 'w1')],
      sessions: ledger([], { phase: 'pending' }),
      workspaces: { items: [] },
    })
    expect(out.loading).toBe(true)
    expect(out.currentSessionId).toBeNull()
  })
})

describe('sidebarFilterOf（fix-6：UF-1 Validation 前缀/子串过滤——原型 renderProjects 同型）', () => {
  function row(sessionId: string, title: string): SidebarProjectNode['sessions'][number] {
    return { sessionId, title, status: 'idle', updatedAt: 1 }
  }

  const tree: SidebarProjectNode[] = [
    {
      projectId: 'p1',
      workspaceId: 'w1',
      name: '支付网关',
      archived: false,
      sessions: [row('s1', '登录修复'), row('s2', '索引重建')],
    },
    {
      projectId: 'p2',
      workspaceId: 'w2',
      name: '知识库',
      archived: false,
      sessions: [row('s3', '文档补全')],
    },
  ]

  it('空/纯空白查询 = 不过滤（原树原样引用返回）', () => {
    expect(sidebarFilterOf('', tree)).toBe(tree)
    expect(sidebarFilterOf('   ', tree)).toBe(tree)
  })

  it('项目名前缀命中 → 项目在场，会话行仍按标题过滤（原型同型：非命中会话滤除）', () => {
    const visible = sidebarFilterOf('支付', tree)
    expect(visible.map((n) => n.projectId)).toEqual(['p1'])
    expect(visible[0]!.sessions).toEqual([]) // 会话标题不含「支付」→ 滤除（视图层呈现「无匹配会话」）
  })

  it('会话标题子串命中 → 项目在场且仅留命中行', () => {
    const visible = sidebarFilterOf('重建', tree)
    expect(visible.map((n) => n.projectId)).toEqual(['p1'])
    expect(visible[0]!.sessions.map((r) => r.sessionId)).toEqual(['s2'])
  })

  it('项目名与会话全命中 → 节点原样引用（零改写零分配——纯投影）', () => {
    const full: SidebarProjectNode[] = [
      { projectId: 'p1', workspaceId: 'w1', name: '修复集', archived: false, sessions: [row('s1', '登录修复'), row('s2', 'TLS 修复')] },
    ]
    expect(sidebarFilterOf('修复', full)[0]).toBe(full[0])
  })

  it('大小写不敏感（原型 toLowerCase 同型）', () => {
    const mixed: SidebarProjectNode[] = [
      { projectId: 'p1', workspaceId: 'w1', name: 'Gateway', archived: false, sessions: [row('s1', 'TLS handshake')] },
    ]
    expect(sidebarFilterOf('gate', mixed).map((n) => n.projectId)).toEqual(['p1'])
    expect(sidebarFilterOf('HAND', mixed)[0]!.sessions.map((r) => r.sessionId)).toEqual(['s1'])
  })

  it('全不命中 → 空（视图层呈现行内空提示）', () => {
    expect(sidebarFilterOf('不存在', tree)).toEqual([])
  })

  it('选中态不变（PRD UF-1 Validation）：过滤隐藏当前选中会话行不重置锚——currentSessionId 与过滤正交', () => {
    const built = buildSidebarTree({
      projects: [project('p1', 'w1', { name: '支付网关' })],
      sessions: ledger(
        [ledgerRow('s1', { displayTitle: '登录修复' }), ledgerRow('s2', { displayTitle: '索引重建' })],
        { current: 's1' },
      ),
      workspaces: workspaces([{ workspaceId: 'w1', sessionIds: ['s1', 's2'] }]),
    })
    const visible = sidebarFilterOf('索引', built.tree)
    expect(visible[0]!.sessions.map((r) => r.sessionId)).toEqual(['s2']) // 选中行 s1 被滤除
    expect(built.currentSessionId).toBe('s1') // 锚不重置——清过滤即恢复可见
  })

  it('零改写纪律：过滤是纯投影，不触碰输入树（Object.freeze 防突变——SC2 直读同型）', () => {
    const frozen = Object.freeze(
      tree.map((n) => ({ ...n, sessions: Object.freeze([...n.sessions]) })),
    )
    expect(() => sidebarFilterOf('支付', frozen)).not.toThrow()
    expect(frozen[0]!.sessions).toHaveLength(2) // 原树原样
  })
})

// ── fix-42：视图态（官方 ViewOptionsMenu P1 裁剪——groupBy 二值 + archivedFilter 三态） ──

describe('sidebarViewOfPick（视图菜单项 id → 视图态投影）', () => {
  const view = { groupBy: 'tree', archivedFilter: 'default' } as const

  it('分组项：tree/flat → groupBy 翻转', () => {
    expect(sidebarViewOfPick(view, 'flat')).toEqual({ groupBy: 'flat', archivedFilter: 'default' })
    expect(sidebarViewOfPick({ ...view, groupBy: 'flat' }, 'tree')).toEqual({
      groupBy: 'tree',
      archivedFilter: 'default',
    })
  })

  it('归档项：default/hide/only → archivedFilter 翻转', () => {
    expect(sidebarViewOfPick(view, 'hide')).toEqual({ groupBy: 'tree', archivedFilter: 'hide' })
    expect(sidebarViewOfPick(view, 'only')).toEqual({ groupBy: 'tree', archivedFilter: 'only' })
  })

  it('非选项 id（separator/label/未知）→ 原引用返回（态机层免触发判据）', () => {
    expect(sidebarViewOfPick(view, 'view-group')).toBe(view)
    expect(sidebarViewOfPick(view, 'view-archived-separator')).toBe(view)
    expect(sidebarViewOfPick(view, 'anything')).toBe(view)
  })

  it('同值重选 → 原引用返回（免重渲染）', () => {
    expect(sidebarViewOfPick(view, 'tree')).toBe(view)
    expect(sidebarViewOfPick(view, 'default')).toBe(view)
  })
})

describe('sidebarArchivedFilterOf（归档过滤投影）', () => {
  const tree: readonly SidebarProjectNode[] = [
    { projectId: 'p1', workspaceId: 'w1', name: '活跃', archived: false, sessions: [] },
    { projectId: 'p2', workspaceId: 'w2', name: '已归档', archived: true, sessions: [] },
  ]

  it('default = 原引用返回（现行行为——全显含归档弱化）', () => {
    expect(sidebarArchivedFilterOf('default', tree)).toBe(tree)
  })

  it('hide = 滤除归档项目；only = 仅归档项目', () => {
    expect(sidebarArchivedFilterOf('hide', tree).map((n) => n.projectId)).toEqual(['p1'])
    expect(sidebarArchivedFilterOf('only', tree).map((n) => n.projectId)).toEqual(['p2'])
  })

  it('会话行随项目行同进退（P1 无会话级归档口径）', () => {
    const withSessions: readonly SidebarProjectNode[] = [
      {
        projectId: 'p1',
        workspaceId: 'w1',
        name: '活跃',
        archived: false,
        sessions: [
          { sessionId: 's1', title: '行', status: 'idle', updatedAt: 1 },
        ],
      },
      {
        projectId: 'p2',
        workspaceId: 'w2',
        name: '归档',
        archived: true,
        sessions: [
          { sessionId: 's2', title: '行', status: 'idle', updatedAt: 2 },
        ],
      },
    ]
    expect(sidebarArchivedFilterOf('hide', withSessions)[0]!.sessions.map((r) => r.sessionId)).toEqual(['s1'])
    expect(sidebarArchivedFilterOf('only', withSessions)[0]!.sessions.map((r) => r.sessionId)).toEqual(['s2'])
  })
})

describe('sidebarFlatRowsOf / sidebarFlatFilterOf（平铺视图投影，fix-42）', () => {
  const tree: readonly SidebarProjectNode[] = [
    {
      projectId: 'p1',
      workspaceId: 'w1',
      name: '支付网关',
      archived: false,
      sessions: [
        { sessionId: 's1', title: '登录修复', status: 'attention', updatedAt: 100 },
        { sessionId: 's2', title: '索引重建', status: 'running', updatedAt: 300 },
      ],
    },
    {
      projectId: 'p2',
      workspaceId: 'w2',
      name: '文档站',
      archived: false,
      sessions: [
        { sessionId: 's3', title: '文档补全', status: 'done', updatedAt: 200 },
      ],
    },
  ]

  it('摊平跨项目 + updatedAt 降序（官方 FlatList updated 序同型）+ projectName 随行', () => {
    const rows = sidebarFlatRowsOf(tree)
    expect(rows.map((r) => r.sessionId)).toEqual(['s2', 's3', 's1'])
    expect(rows[0]).toEqual({
      projectId: 'p1',
      projectName: '支付网关',
      sessionId: 's2',
      title: '索引重建',
      status: 'running',
      updatedAt: 300,
    })
  })

  it('时序平手 → 稳定序（保留工作区序）', () => {
    const tie: readonly SidebarProjectNode[] = [
      {
        projectId: 'p1',
        workspaceId: 'w1',
        name: '甲',
        archived: false,
        sessions: [
          { sessionId: 'a1', title: '行一', status: 'idle', updatedAt: 5 },
          { sessionId: 'a2', title: '行二', status: 'idle', updatedAt: 5 },
        ],
      },
    ]
    expect(sidebarFlatRowsOf(tie).map((r) => r.sessionId)).toEqual(['a1', 'a2'])
  })

  it('过滤：空查询原引用；标题/项目名命中；全不命中空集', () => {
    const rows = sidebarFlatRowsOf(tree)
    expect(sidebarFlatFilterOf('  ', rows)).toBe(rows)
    expect(sidebarFlatFilterOf('索引', rows).map((r) => r.sessionId)).toEqual(['s2'])
    expect(sidebarFlatFilterOf('文档站', rows).map((r) => r.sessionId)).toEqual(['s3']) // 项目名命中 → 全行在场
    expect(sidebarFlatFilterOf('不存在', rows)).toEqual([])
  })
})

describe('sidebarSectionLabelOf（段头标签——官方 groupBy 切换同型）', () => {
  it('tree → 「项目」/ flat → 「会话」', () => {
    expect(sidebarSectionLabelOf({ groupBy: 'tree', archivedFilter: 'default' })).toBe('项目')
    expect(sidebarSectionLabelOf({ groupBy: 'flat', archivedFilter: 'default' })).toBe('会话')
  })
})
