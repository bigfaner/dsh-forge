// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// OverviewFrame/OverviewTab 单测 —— AC2/AC3/AC4/AC5 帧级结构：面板骨架（ov-head +
// sticky + 内容区）/三子 tab 内容分派/任务子 tab chips 与 3.6 装载槽/错误三态/摘要合成。
// OverviewTab 本体 = 状态 + effect 胶水（renderToStaticMarkup 不跑 effect——静态面仅断言
// 首装骨架形态）；数据装载与查询参断言归 overview-data.test。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { FeatureCard, TaskStatus } from '@dsh-forge/contracts'
import { initialOverviewFilter, type OverviewFilterState } from './overview-model.js'
import type { OverviewHeadBundle, OverviewListData } from './overview-data.js'
import { OverviewBugDialogMount, OverviewFrame, OverviewTab, openBugCardOf } from './OverviewTab.js'
import type { BugCard } from '@dsh-forge/contracts'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const CREATED = '2026-10-01T08:00:00.000Z'

const HEAD: OverviewHeadBundle = {
  projectName: 'demo',
  workspaceDir: 'Z:/ws/demo',
  forgeDir: 'Z:/ws/demo/.forge',
  features: [
    {
      featureId: 'fid-1',
      slug: 'm2-pipeline',
      title: 'M2 管线',
      featureStatus: 'in-progress',
      createdAt: CREATED,
      updatedAt: CREATED,
      byStatus: { pending: 2, in_progress: 0, completed: 3, blocked: 0, suspended: 0, interrupted: 0, skipped: 0, rejected: 0 },
      docCount: 4,
    },
  ],
  stats: {
    total: 5,
    byStatus: { pending: 2, in_progress: 0, completed: 3, blocked: 0, suspended: 0, interrupted: 0, skipped: 0, rejected: 0 },
    unmetPending: 0, gatedPending: 0,
  },
}

const BUGS_LIST: OverviewListData = {
  kind: 'bugs',
  bugs: [
    {
      bugId: 'b1',
      summary: '登录接口 500',
      bugDesc: 'd',
      triggerDesc: 't',
      expected: 'e',
      actual: 'a',
      errorType: 'api',
      bugStatus: 'open',
      reporter: 'faner',
      createdAt: CREATED,
      updatedAt: CREATED,
    },
  ],
  counts: { open: 3, fixed: 12, unresolved: 0 },
}

const handlers = {
  onSubtabChange: () => {},
  onSearchChange: () => {},
  onSortToggle: () => {},
  onToggleStatus: () => {},
  onClearStatuses: () => {},
  onToggleBugStatus: () => {},
  onClearBugStatuses: () => {},
  onToggleRow: () => {},
  onToggleHead: () => {},
  onRetry: () => {},
}

// 帧渲染分派路径测试缺省腿 = spec 子 tab（G3 前列路短路 null → 占位骨架）
const DEFAULT_FRAME_FILTER: OverviewFilterState = { ...initialOverviewFilter(), subtab: 'spec' }

const frame = (over: {
  filter?: OverviewFilterState
  head?: OverviewHeadBundle
  list?: OverviewListData
  phase?: 'loading' | 'ready' | 'error'
  error?: { message: string; uiState: 'error-bar' | 'banner' | 'empty-state' }
  renderTasksTab?: (ctx: unknown) => ReactNode
  onOpenBug?: (bugId: string) => void
}) =>
  renderToStaticMarkup(
    <OverviewFrame
      projectId="p-1"
      head={'head' in over ? over.head : HEAD}
      list={over.list}
      phase={over.phase ?? 'ready'}
      busy={false}
      error={over.error}
      filter={over.filter ?? DEFAULT_FRAME_FILTER}
      onOpenDoc={() => {}}
      now={NOW}
      {...handlers}
      {...(over.renderTasksTab === undefined ? {} : { renderTasksTab: over.renderTasksTab as never })}
      {...(over.onOpenBug === undefined ? {} : { onOpenBug: over.onOpenBug })}
    />,
  )

describe('OverviewFrame 面板骨架（AC1/AC2）', () => {
  it('面板 = ov-head + sticky（三子 tab + 搜索 + 排序）+ 内容区三段锚', () => {
    const markup = frame({})
    expect(markup).toContain('data-dswf-ov-panel')
    expect(markup).toContain('data-dswf-ov-head')
    expect(markup).toContain('data-dswf-ov-sticky')
    expect(markup).toContain('data-dswf-ov-content')
    expect(markup).toContain('data-dswf-ov-searchrow')
    expect(markup).toContain('data-dswf-ov-sort')
  })

  it('ov-head 头内容（T1-head 裁决 2026-11-23）：项目名在场；无会话统计摘要行', () => {
    const markup = frame({})
    expect(markup).toContain('demo')
    expect(markup).not.toContain('dswf-ov-summary')
    expect(markup).not.toContain('会话 ·')
  })

  it('头路在途（head 缺席）= ov-head 不渲染，sticky 与内容区保持', () => {
    // 列路骨架腿 = bugs 子 tab（spec 子 tab G3 起自承载装载面——骨架归列路分派）
    const markup = frame({ head: undefined, phase: 'loading', filter: { ...initialOverviewFilter(), subtab: 'bugs' as const } })
    expect(markup).not.toContain('data-dswf-ov-head')
    expect(markup).toContain('data-dswf-ov-sticky')
    expect(markup).toContain('data-dswf-ov-skeleton') // 首装骨架
  })
})

describe('OverviewFrame 子 tab 结构（spec | 任务 | Bug 有序三枚）', () => {
  it('sticky 行 = spec → 任务 → Bug 有序三枚（data-dswf-ov-subtab 锚升序）', () => {
    const markup = frame({})
    const positions = ['spec', 'tasks', 'bugs'].map((v) => markup.indexOf(`data-dswf-ov-subtab="${v}"`))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(markup).not.toContain('data-dswf-ov-subtab="proposals"')
    expect(markup).not.toContain('data-dswf-ov-subtab="features"')
  })

  it('spec 子 tab：G3 本体自承载装载面（specpage 锚 + 静态装载中——零 features/提案渲染面）', () => {
    const markup = frame({})
    expect(markup).toContain('data-dswf-ov-specpage')
    expect(markup).not.toContain('data-dswf-ov-features')
    expect(markup).not.toContain('data-dswf-ov-phchips')
  })

  it('列路在途（busy）= aria-busy 内容区标注（旧行保持）', () => {
    const markup = renderToStaticMarkup(
      <OverviewFrame
        projectId="p-1"
        head={HEAD}
        list={BUGS_LIST}
        phase="ready"
        busy={true}
        error={undefined}
        filter={{ ...initialOverviewFilter(), subtab: 'bugs' as const }}
        onOpenDoc={() => {}}
        now={NOW}
        {...handlers}
      />,
    )
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('data-dswf-ov-bugpage') // 旧内容不掏空
  })
})

describe('OverviewFrame 任务子 tab（AC5——chips 过滤接口）', () => {
  it('缺省 = chips 过滤接口独占呈现（计数单源 head.stats）', () => {
    const filter = { ...initialOverviewFilter(), subtab: 'tasks' as const }
    const markup = frame({ filter })
    expect(markup).toContain('data-dswf-ov-stchips')
    expect(markup).toContain('待处理')
    expect(markup).toContain('>2</span>')
    // 0 计数禁用（属性序无关切片断言）
    const at = markup.indexOf('data-dswf-ov-stchip="suspended"')
    const suspendedChip = markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))
    expect(suspendedChip).toContain('disabled')
  })

  it('renderTasksTab 槽注入（3.6 消费）：ctx 携带 search/sort/statusFilter/stats/features + docsRoot（head 项目行推导）', () => {
    const filter: OverviewFilterState = {
      ...initialOverviewFilter(),
      subtab: 'tasks',
      search: '网关',
      sort: 'created',
      activeStatuses: new Set<TaskStatus>(['blocked']),
    }
    const markup = frame({
      filter,
      renderTasksTab: (ctx) => {
        const c = ctx as {
          search: string
          sort: string
          statusFilter: readonly TaskStatus[]
          stats: { byStatus: Record<string, number> }
          features: readonly FeatureCard[]
          projectId: string
          docsRoot?: string
        }
        return (
          <div data-dswf-test-slot="">
            {`${c.projectId}|${c.search}|${c.sort}|${c.statusFilter.join(',')}|${c.stats.byStatus.completed}|${c.features[0]?.slug ?? ''}|${c.docsRoot ?? ''}`}
          </div>
        )
      },
    })
    expect(markup).toContain('data-dswf-test-slot')
    expect(markup).toContain('p-1|网关|created|blocked|3|m2-pipeline|.forge/docs')
    expect(markup).not.toContain('data-dswf-ov-stchips') // 槽在场 = chips 由 3.6 组合（接口同源）
  })

  it('ctx.docsRoot 推导口径：HEAD 夹具 <ws>/.forge（正斜杠输入）→ `.forge/docs`；head 缺席 = 键缺席（回退缺省锚）', () => {
    let seen: string | undefined = '__unset__'
    frame({
      head: undefined,
      phase: 'loading',
      filter: { ...initialOverviewFilter(), subtab: 'tasks' as const },
      renderTasksTab: (ctx) => {
        seen = (ctx as { docsRoot?: string }).docsRoot
        return null
      },
    })
    expect(seen).toBeUndefined()
  })
})

describe('OverviewFrame Bug 子 tab（fix-bug——列表视图）', () => {
  it('bugs 子 tab：三态 chips（列表之上）+ Bug 行（summary 左 + 错误类型 chip 右；无状态文字/无时间）', () => {
    const filter = { ...initialOverviewFilter(), subtab: 'bugs' as const }
    const markup = frame({ filter, list: BUGS_LIST })
    expect(markup).toContain('data-dswf-ov-bugpage')
    const stickyAt = markup.indexOf('data-dswf-ov-sticky=""')
    const chipsAt = markup.indexOf('data-dswf-ov-bschips=""')
    const listAt = markup.indexOf('data-dswf-ov-bugs=""')
    expect(chipsAt).toBeGreaterThan(stickyAt)
    expect(listAt).toBeGreaterThan(chipsAt)
    expect(markup).toContain('登录接口 500')
    expect(markup).toContain('data-dswf-ov-bugrow-type="api"')
    expect(markup).not.toContain('08:00') // 时间退场（状态文字同退——色归圆点）
  })

  it('搜索在场 + 空结果 = 无匹配空态（帧侧注入空标题）', () => {
    const filter = { ...initialOverviewFilter(), subtab: 'bugs' as const, search: 'zzz' }
    const markup = frame({ filter, list: { kind: 'bugs', bugs: [], counts: { open: 0, fixed: 0, unresolved: 0 } } })
    expect(markup).toContain('无匹配「zzz」的 Bug')
  })
})

describe('OverviewFrame 宽度填充（M3.1 D12——旧定宽管线显式否定断言）', () => {
  it('面板 = 弹性填满整 tab：零左缘拖拽手柄、零定宽内联样式、零分离手柄语义', () => {
    const markup = frame({})
    expect(markup).toContain('data-dswf-ov-wrap=""')
    expect(markup).toContain('data-dswf-ov-panel=""')
    // 旧管线否定断言（退役显式化）：手柄锚 / separator 语义 / aria 标注 / 拖拽提示文案零在场
    expect(markup).not.toContain('data-dswf-ov-resize')
    expect(markup).not.toContain('role="separator"')
    expect(markup).not.toContain('拖动调整概览宽度')
    // 定宽右贴形态否定：面板零内联 width 样式（弹性填充由 .dswf-ov-panel flex:1 承载）
    expect(markup).not.toContain('width:')
    // wrap 仅承载面板本体（flex-end 右贴 + 手柄叠缘布局退役——wrap 首元素子 = panel 直系）
    const wrapAt = markup.indexOf('data-dswf-ov-wrap=""')
    const panelAt = markup.indexOf('data-dswf-ov-panel=""')
    expect(wrapAt).toBeGreaterThan(-1)
    expect(panelAt).toBeGreaterThan(wrapAt)
    const wrapTagEnd = markup.indexOf('>', wrapAt)
    const firstChild = markup.slice(markup.indexOf('<div', wrapTagEnd), markup.indexOf('>', wrapTagEnd) + 200)
    expect(firstChild.startsWith('<div class="dswf-ov-panel"')).toBe(true) // 手柄位空缺（panel 即首子）
  })
})

describe('OverviewFrame 错误三态', () => {
  it('banner（库不可用）= 面板顶部错误条 + 重试', () => {
    const markup = frame({ error: { message: '工作区库打开失败', uiState: 'banner' } })
    expect(markup).toContain('data-dswf-ov-banner')
    expect(markup).toContain('工作区不可用')
    expect(markup).toContain('data-dswf-ov-retry')
  })

  it('error-bar（首装失败无旧内容）= 内容区错误条 + 重试', () => {
    // 列路错误条腿 = bugs 子 tab（spec 子 tab G3 起自承载错误相位——错误条归 SpecTab）
    const markup = frame({ filter: { ...initialOverviewFilter(), subtab: 'bugs' as const }, list: undefined, phase: 'error', error: { message: '传输失败', uiState: 'error-bar' } })
    expect(markup).toContain('data-dswf-ov-error')
    expect(markup).toContain('概览装载失败')
  })

  it('error-bar（列路失败旧行在场）= 错误条 + 旧列表同现', () => {
    const markup = frame({ filter: { ...initialOverviewFilter(), subtab: 'bugs' as const }, list: BUGS_LIST, error: { message: '列表失败', uiState: 'error-bar' } })
    expect(markup).toContain('列表装载失败')
    expect(markup).toContain('data-dswf-ov-bugpage')
  })
})

describe('OverviewTab（状态 + 装载胶水——静态首装面）', () => {
  it('首装 = 面板骨架 + 任务子 tab（门关期默认——effect 不跑；数据装载归 overview-data 单测与 e2e）', () => {
    const markup = renderToStaticMarkup(
      <OverviewTab projectId="p-1" makeClient={(() => ({})) as never} now={NOW} />,
    )
    expect(markup).toContain('data-dswf-ov-panel')
    expect(markup).toContain('data-dswf-ov-sticky')
    expect(markup).toContain('data-dswf-ov-subtab="tasks"')
    expect(markup).toContain('data-dswf-ov-subtab="spec"')
    expect(markup).not.toContain('data-dswf-ov-subtab="proposals"')
    expect(markup).not.toContain('data-dswf-ov-subtab="features"')
    expect(markup).not.toContain('data-dswf-ov-head')
    // fix-bug 收尾：BugDialog 挂载位在场但首装无选中 = 不渲染（零弹框锚）
    expect(markup).not.toContain('data-dswf-ov-bdialog')
  })
})

describe('BugDialog 挂载接线（fix-bug 收尾——onOpenBug → 开合 → 注入面）', () => {
  const BUG_B1: BugCard = {
    bugId: 'b1',
    summary: '登录接口 500',
    bugDesc: 'd',
    triggerDesc: 't',
    expected: 'e',
    actual: 'a',
    errorType: 'api',
    bugStatus: 'open',
    reporter: 'faner',
    reportSessionId: 'sess-r',
    createdAt: CREATED,
    updatedAt: CREATED,
  }
  const BUGS_LIST_B1: OverviewListData = { kind: 'bugs', bugs: [BUG_B1], counts: { open: 1, fixed: 0, unresolved: 0 } }

  it('openBugCardOf 开合投影：bugs 列表命中 bugId → 卡片；无选中/列表缺席/非 bugs 列表 → undefined（onClose 复位 = 无选中不渲染）', () => {
    expect(openBugCardOf(BUGS_LIST_B1, 'b1')?.bugId).toBe('b1')
    expect(openBugCardOf(BUGS_LIST_B1, null)).toBeUndefined()
    expect(openBugCardOf(BUGS_LIST_B1, 'miss')).toBeUndefined()
    expect(openBugCardOf(undefined, 'b1')).toBeUndefined()
    expect(openBugCardOf(BUGS_LIST, 'b2')).toBeUndefined()
  })

  it('选中即开：OverviewBugDialogMount 渲染 BugDialog（bdialog 锚 + bugId 标注）', () => {
    const markup = renderToStaticMarkup(
      <OverviewBugDialogMount list={BUGS_LIST_B1} openBugId="b1" onClose={() => {}} />,
    )
    expect(markup).toContain('data-dswf-ov-bdialog=""')
    expect(markup).toContain('data-dswf-ov-bdialog-id="b1"')
  })

  it('注入面（ShellHost 递达——任务抽屉同缝）：sessionTitleOf 命中 + onOpenSession = 会话 pill 可点击（会话名呈现）', () => {
    const markup = renderToStaticMarkup(
      <OverviewBugDialogMount
        list={BUGS_LIST_B1}
        openBugId="b1"
        onClose={() => {}}
        onOpenSession={() => {}}
        sessionTitleOf={(id) => (id === 'sess-r' ? '修复登录会话' : undefined)}
      />,
    )
    expect(markup).toContain('data-dswf-ov-bsess')
    expect(markup).toContain('修复登录会话')
  })

  it('注入面缺席 = 键缺席不递达（fail-soft——BugDialog 侧回退非交互）', () => {
    const markup = renderToStaticMarkup(
      <OverviewBugDialogMount list={BUGS_LIST_B1} openBugId="b1" onClose={() => {}} />,
    )
    expect(markup).toContain('sess-r') // pill 仍呈现（文本形态）
    expect(markup).not.toContain('data-dswf-ov-bsess="') // 非 pill 呈现——sessionTitleOf/onOpenSession 键缺席
  })

  it('行点击缝递达：帧 onOpenBug 在场 = Bug 行整行可点（role=button）；缺席 = 静态行（回归钉）', () => {
    const at = (markup: string): number => markup.indexOf('data-dswf-ov-bugrow="b1"')
    const withSeam = frame({ filter: { ...initialOverviewFilter(), subtab: 'bugs' as const }, list: BUGS_LIST, onOpenBug: () => {} })
    expect(withSeam.slice(withSeam.lastIndexOf('<div', at(withSeam)), withSeam.indexOf('>', at(withSeam)))).toContain('role="button"')
    const withoutSeam = frame({ filter: { ...initialOverviewFilter(), subtab: 'bugs' as const }, list: BUGS_LIST })
    expect(withoutSeam.slice(withoutSeam.lastIndexOf('<div', at(withoutSeam)), withoutSeam.indexOf('>', at(withoutSeam)))).not.toContain('role="button"')
  })
})
