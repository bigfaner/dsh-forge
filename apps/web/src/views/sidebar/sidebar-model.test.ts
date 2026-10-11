// sidebar-model 单测 —— UF-1 项目树/会话列表派生（AC2：项目树读 forge:projects/list、
// 会话列表实时读 dsh 账本；AC5：空态判据输入）。纯函数面：快照进、视图行出、零持有。
import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '@dsh-forge/contracts'
import {
  buildSidebarTree,
  relativeTimeLabel,
  sessionDotState,
  sessionStatus,
  SIDEBAR_SESSION_WINDOW_MS,
  SIDEBAR_VIEW_DEFAULT,
  sidebarArchivedFilterOf,
  sidebarFilterOf,
  sidebarFlatFilterOf,
  sidebarFlatRowsOf,
  sidebarSectionLabelOf,
  sidebarSessionVisibility,
  sidebarViewOfPick,
  type LedgerSessionRow,
  type LedgerSessionsSnapshot,
  type LedgerWorkspacesSnapshot,
  type SidebarProjectNode,
  type SidebarSessionRow,
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

function workspaces(
  items: readonly { workspaceId: string; sessionIds: string[] }[],
  overrides: Partial<LedgerWorkspacesSnapshot> = {},
): LedgerWorkspacesSnapshot {
  return { items, ...overrides }
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

  it('M3.1 D3：项目节点携带 wsPath（canonical 路径——ProjectSummary 直投影，行悬停提示数据面）', () => {
    const out = buildSidebarTree({
      projects: [project('p1', 'w1', { wsPath: 'Z:/canonical/p1' }), project('p2', 'w2', { wsPath: 'Z:/canonical/p2' })],
      sessions: ledger([]),
      workspaces: workspaces([
        { workspaceId: 'w1', sessionIds: [] },
        { workspaceId: 'w2', sessionIds: [] },
      ]),
    })
    expect(out.tree.map((n) => n.wsPath)).toEqual(['Z:/canonical/p1', 'Z:/canonical/p2'])
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

  it('D45：置顶/归档成员位随行（registry 级集合镜像）+ 置顶行项目块内领先（最近置顶在前）', () => {
    const out = buildSidebarTree({
      projects: [project('p1', 'w1')],
      sessions: ledger([ledgerRow('s1'), ledgerRow('s2'), ledgerRow('s3'), ledgerRow('s4')]),
      workspaces: workspaces(
        [{ workspaceId: 'w1', sessionIds: ['s1', 's2', 's3', 's4'] }],
        // 置顶集 = 最近置顶在前（s3 后置顶 → 领先 s2）；归档集含 s4
        { pinnedSessionIds: ['s3', 's2'], archivedSessionIds: ['s4'] },
      ),
    })
    const rows = out.tree[0]!.sessions
    // 置顶领先（置顶集序）；非置顶行保持 workspace 排列序
    expect(rows.map((r) => r.sessionId)).toEqual(['s3', 's2', 's1', 's4'])
    expect(rows.map((r) => [r.sessionId, r.pinned, r.archived])).toEqual([
      ['s3', true, false],
      ['s2', true, false],
      ['s1', false, false],
      ['s4', false, true],
    ])
  })

  it('D45：置顶/归档集缺席 = 无标记无重排（面漂移/测试替身缺席容忍——快径原序）', () => {
    const out = buildSidebarTree({
      projects: [project('p1', 'w1')],
      sessions: ledger([ledgerRow('s1'), ledgerRow('s2')]),
      workspaces: workspaces([{ workspaceId: 'w1', sessionIds: ['s1', 's2'] }]),
    })
    expect(out.tree[0]!.sessions.map((r) => r.sessionId)).toEqual(['s1', 's2'])
    expect(out.tree[0]!.sessions.every((r) => !r.pinned && !r.archived)).toBe(true)
  })
})

describe('sidebarFilterOf（fix-6：UF-1 Validation 前缀/子串过滤——原型 renderProjects 同型）', () => {
  function row(sessionId: string, title: string): SidebarProjectNode['sessions'][number] {
    return { sessionId, title, status: 'idle', updatedAt: 1, pinned: false, archived: false }
  }

  const tree: SidebarProjectNode[] = [
    {
      projectId: 'p1',
      workspaceId: 'w1',
      name: '支付网关',
      wsPath: 'Z:/w/p1',
      archived: false,
      sessions: [row('s1', '登录修复'), row('s2', '索引重建')],
    },
    {
      projectId: 'p2',
      workspaceId: 'w2',
      name: '知识库',
      wsPath: 'Z:/w/p2',
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
      { projectId: 'p1', workspaceId: 'w1', name: '修复集', wsPath: 'Z:/w/p1', archived: false, sessions: [row('s1', '登录修复'), row('s2', 'TLS 修复')] },
    ]
    expect(sidebarFilterOf('修复', full)[0]).toBe(full[0])
  })

  it('大小写不敏感（原型 toLowerCase 同型）', () => {
    const mixed: SidebarProjectNode[] = [
      { projectId: 'p1', workspaceId: 'w1', name: 'Gateway', wsPath: 'Z:/w/p1', archived: false, sessions: [row('s1', 'TLS handshake')] },
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

  it('D41-① 同迁：hide 态可切回 default/only（三态菜单语义保持）', () => {
    const hidden = { groupBy: 'tree', archivedFilter: 'hide' } as const
    expect(sidebarViewOfPick(hidden, 'default')).toEqual({ groupBy: 'tree', archivedFilter: 'default' })
    expect(sidebarViewOfPick(hidden, 'only')).toEqual({ groupBy: 'tree', archivedFilter: 'only' })
  })
})

describe('SIDEBAR_VIEW_DEFAULT（D41-①：归档项目默认隐藏）', () => {
  it('缺省视图 = 按项目树 + 归档隐藏（archivedFilter = hide——三态菜单可切回 default/only）', () => {
    expect(SIDEBAR_VIEW_DEFAULT).toEqual({ groupBy: 'tree', archivedFilter: 'hide' })
  })
})

describe('sidebarSessionVisibility（D41-②：会话 24h 窗口切分——recent 默认可见 / older 折叠）', () => {
  const NOW = 1_700_000_000_000
  function row(sessionId: string, updatedAt: number, overrides: Partial<SidebarSessionRow> = {}): SidebarSessionRow {
    return { sessionId, title: `会话${sessionId}`, status: 'idle', updatedAt, pinned: false, archived: false, ...overrides }
  }

  it('窗口内（updatedAt ≥ now−24h）= recent，其余 = older（组内序 = 输入序不重排）', () => {
    const sessions = [row('a', NOW - 25 * HOUR), row('b', NOW - MIN), row('c', NOW - 2 * DAY), row('d', NOW)]
    const split = sidebarSessionVisibility(sessions, NOW)
    expect(split.recent.map((r) => r.sessionId)).toEqual(['b', 'd'])
    expect(split.older.map((r) => r.sessionId)).toEqual(['a', 'c'])
  })

  it('24h 边界值：updatedAt = now−24h 恰在窗口内（≥ 语义——可见）；差 1ms 出窗', () => {
    const edge = sidebarSessionVisibility([row('edge', NOW - SIDEBAR_SESSION_WINDOW_MS)], NOW)
    expect(edge.recent.map((r) => r.sessionId)).toEqual(['edge'])
    expect(edge.older).toEqual([])
    const out = sidebarSessionVisibility([row('out', NOW - SIDEBAR_SESSION_WINDOW_MS - 1)], NOW)
    expect(out.recent).toEqual([])
    expect(out.older.map((r) => r.sessionId)).toEqual(['out'])
  })

  it('空窗（无会话）→ 两组皆空', () => {
    expect(sidebarSessionVisibility([], NOW)).toEqual({ recent: [], older: [] })
  })

  it('全旧（全部窗口外）→ recent 空、older 全量原序（「更早（N）」N = older 长度）', () => {
    const sessions = [row('a', NOW - 2 * DAY), row('b', NOW - 3 * DAY)]
    const split = sidebarSessionVisibility(sessions, NOW)
    expect(split.recent).toEqual([])
    expect(split.older.map((r) => r.sessionId)).toEqual(['a', 'b'])
  })

  it('纯投影：全 recent 原引用返回（零派生）；输入冻结不突变（SC2 直读同型）', () => {
    const sessions = [row('a', NOW), row('b', NOW - MIN)]
    const split = sidebarSessionVisibility(sessions, NOW)
    expect(split.recent).toBe(sessions)
    expect(split.older).toEqual([])
    const frozen = Object.freeze(sessions.map((r) => ({ ...r })))
    expect(() => sidebarSessionVisibility(frozen, NOW)).not.toThrow()
  })

  it('D45：置顶行永不折叠（窗口外照常 recent——置顶 = 保持可见语义）', () => {
    const sessions = [row('a', NOW - 2 * DAY), row('p', NOW - 3 * DAY, { pinned: true }), row('b', NOW - 2 * DAY)]
    const split = sidebarSessionVisibility(sessions, NOW)
    expect(split.recent.map((r) => r.sessionId)).toEqual(['p'])
    expect(split.older.map((r) => r.sessionId)).toEqual(['a', 'b'])
  })
})

describe('sidebarArchivedFilterOf（归档过滤投影——D45 扩面：项目域 + 会话域双口径）', () => {
  function srow(sessionId: string, archived = false): SidebarSessionRow {
    return { sessionId, title: `行${sessionId}`, status: 'idle', updatedAt: 1, pinned: false, archived }
  }
  const tree: readonly SidebarProjectNode[] = [
    { projectId: 'p1', workspaceId: 'w1', name: '活跃', wsPath: 'Z:/w/p1', archived: false, sessions: [] },
    { projectId: 'p2', workspaceId: 'w2', name: '已归档', wsPath: 'Z:/w/p2', archived: true, sessions: [] },
  ]

  it('default = 原引用返回（现行行为——全显含归档弱化）', () => {
    expect(sidebarArchivedFilterOf('default', tree)).toBe(tree)
  })

  it('hide = 滤除归档项目；only = 仅归档项目', () => {
    expect(sidebarArchivedFilterOf('hide', tree).map((n) => n.projectId)).toEqual(['p1'])
    expect(sidebarArchivedFilterOf('only', tree).map((n) => n.projectId)).toEqual(['p2'])
  })

  it('D45 会话域：hide = 项目内归档会话行滤除（活跃项目混合行差集派生）', () => {
    const mixed: readonly SidebarProjectNode[] = [
      {
        projectId: 'p1',
        workspaceId: 'w1',
        name: '活跃',
        wsPath: 'Z:/w/p1',
        archived: false,
        sessions: [srow('s1'), srow('s2', true), srow('s3')],
      },
    ]
    expect(sidebarArchivedFilterOf('hide', mixed)[0]!.sessions.map((r) => r.sessionId)).toEqual(['s1', 's3'])
    // 全保留 = 节点原样引用（零派生——纯投影快径）
    expect(sidebarArchivedFilterOf('hide', mixed)[0]).not.toBe(mixed[0])
    const clean: readonly SidebarProjectNode[] = [
      { ...mixed[0]!, sessions: [srow('s1'), srow('s3')] },
    ]
    expect(sidebarArchivedFilterOf('hide', clean)[0]).toBe(clean[0])
  })

  it('D45 会话域：only = 项目内仅归档会话行（归档项目 + 归档行同口径）', () => {
    const withSessions: readonly SidebarProjectNode[] = [
      {
        projectId: 'p1',
        workspaceId: 'w1',
        name: '活跃',
        wsPath: 'Z:/w/p1',
        archived: false,
        sessions: [srow('s1'), srow('s2', true)],
      },
      {
        projectId: 'p2',
        workspaceId: 'w2',
        name: '归档',
        wsPath: 'Z:/w/p2',
        archived: true,
        sessions: [srow('s3'), srow('s4', true)],
      },
    ]
    const only = sidebarArchivedFilterOf('only', withSessions)
    expect(only.map((n) => n.projectId)).toEqual(['p2'])
    expect(only[0]!.sessions.map((r) => r.sessionId)).toEqual(['s4'])
    // hide：活跃项目滤归档行 + 归档项目整块离场
    const hide = sidebarArchivedFilterOf('hide', withSessions)
    expect(hide.map((n) => n.projectId)).toEqual(['p1'])
    expect(hide[0]!.sessions.map((r) => r.sessionId)).toEqual(['s1'])
  })
})

describe('sidebarFlatRowsOf / sidebarFlatFilterOf（平铺视图投影，fix-42）', () => {
  function frow(sessionId: string, title: string, status: SidebarSessionRow['status'], updatedAt: number, overrides: Partial<SidebarSessionRow> = {}): SidebarSessionRow {
    return { sessionId, title, status, updatedAt, pinned: false, archived: false, ...overrides }
  }
  const tree: readonly SidebarProjectNode[] = [
    {
      projectId: 'p1',
      workspaceId: 'w1',
      name: '支付网关',
      wsPath: 'Z:/w/p1',
      archived: false,
      sessions: [
        frow('s1', '登录修复', 'attention', 100),
        frow('s2', '索引重建', 'running', 300),
      ],
    },
    {
      projectId: 'p2',
      workspaceId: 'w2',
      name: '文档站',
      wsPath: 'Z:/w/p2',
      archived: false,
      sessions: [
        frow('s3', '文档补全', 'done', 200),
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
      pinned: false,
      archived: false,
    })
  })

  it('时序平手 → 稳定序（保留工作区序）', () => {
    const tie: readonly SidebarProjectNode[] = [
      {
        projectId: 'p1',
        workspaceId: 'w1',
        name: '甲',
        wsPath: 'Z:/w/p1',
        archived: false,
        sessions: [
          frow('a1', '行一', 'idle', 5),
          frow('a2', '行二', 'idle', 5),
        ],
      },
    ]
    expect(sidebarFlatRowsOf(tie).map((r) => r.sessionId)).toEqual(['a1', 'a2'])
  })

  it('D45：置顶行跨项目领先（置顶集序 = 最近置顶在前；非置顶行保持 updated 降序）', () => {
    const pinnedTree: readonly SidebarProjectNode[] = [
      {
        projectId: 'p1',
        workspaceId: 'w1',
        name: '支付网关',
        wsPath: 'Z:/w/p1',
        archived: false,
        sessions: [
          frow('s1', '登录修复', 'attention', 100),
          frow('s2', '索引重建', 'running', 300, { pinned: true }),
        ],
      },
      {
        projectId: 'p2',
        workspaceId: 'w2',
        name: '文档站',
        wsPath: 'Z:/w/p2',
        archived: false,
        sessions: [
          frow('s3', '文档补全', 'done', 200, { pinned: true }),
          frow('s4', '新页', 'idle', 400),
        ],
      },
    ]
    // 置顶两行领先（置顶行间 = 树迭代序——registry 置顶时序不进树，P1 逼近面）；
    // 非置顶行 updated 降序（s4 > s1）
    expect(sidebarFlatRowsOf(pinnedTree).map((r) => r.sessionId)).toEqual(['s2', 's3', 's4', 's1'])
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
