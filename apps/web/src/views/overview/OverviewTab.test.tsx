// OverviewFrame/OverviewTab 单测 —— AC2/AC3/AC4/AC5 帧级结构：面板骨架（ov-head +
// sticky + 内容区）/三子 tab 内容分派/任务子 tab chips 与 3.6 装载槽/错误三态/摘要合成。
// OverviewTab 本体 = 状态 + effect 胶水（renderToStaticMarkup 不跑 effect——静态面仅断言
// 首装骨架形态）；数据装载与查询参断言归 overview-data.test。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { FeatureCard, ProposalCard, TaskStatus } from '@dsh-forge/contracts'
import { initialOverviewFilter, type OverviewFilterState } from './overview-model.js'
import type { OverviewHeadBundle, OverviewListData } from './overview-data.js'
import { OverviewFrame, OverviewTab } from './OverviewTab.js'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const CREATED = '2026-10-01T08:00:00.000Z'

const HEAD: OverviewHeadBundle = {
  projectName: 'demo',
  workspaceDir: 'Z:/ws/demo',
  forgeDir: 'Z:/ws/demo/.forge',
  knowledgeDir: 'Z:/ws/demo/.knowledge',
  taskStoreDir: 'C:/forge-home/demo@a1b2c3d4',
  features: [
    {
      featureId: 'fid-1',
      slug: 'm2-pipeline',
      title: 'M2 管线',
      featureStatus: 'in-progress',
      createdAt: CREATED,
      updatedAt: CREATED,
      byStatus: { pending: 2, in_progress: 0, completed: 3, blocked: 0, suspended: 0, skipped: 0, rejected: 0 },
      docCount: 4,
    },
  ],
  stats: {
    total: 5,
    byStatus: { pending: 2, in_progress: 0, completed: 3, blocked: 0, suspended: 0, skipped: 0, rejected: 0 },
  },
}

const PROPOSALS: readonly ProposalCard[] = [
  {
    proposalId: 'pr-1',
    slug: 'm2-pipeline',
    title: '提案 m2-pipeline',
    proposalStatus: 'under-review',
    relPath: 'docs/proposals/m2-pipeline/proposal.md',
    createdAt: CREATED,
    updatedAt: CREATED,
  },
]

const PROPOSALS_LIST: OverviewListData = { kind: 'proposals', proposals: PROPOSALS }
const FEATURES_LIST: OverviewListData = { kind: 'features', features: HEAD.features, proposals: PROPOSALS }

const handlers = {
  onSubtabChange: () => {},
  onSearchChange: () => {},
  onSortToggle: () => {},
  onToggleStatus: () => {},
  onClearStatuses: () => {},
  onToggleRow: () => {},
  onToggleHead: () => {},
  onRetry: () => {},
}

const frame = (over: {
  filter?: OverviewFilterState
  head?: OverviewHeadBundle
  list?: OverviewListData
  phase?: 'loading' | 'ready' | 'error'
  error?: { message: string; uiState: 'error-bar' | 'banner' | 'empty-state' }
  sessionCount?: number
  renderTasksTab?: (ctx: unknown) => ReactNode
}) =>
  renderToStaticMarkup(
    <OverviewFrame
      projectId="p-1"
      head={'head' in over ? over.head : HEAD}
      list={over.list}
      phase={over.phase ?? 'ready'}
      busy={false}
      error={over.error}
      filter={over.filter ?? initialOverviewFilter()}
      onOpenDoc={() => {}}
      now={NOW}
      {...handlers}
      {...(over.renderTasksTab === undefined ? {} : { renderTasksTab: over.renderTasksTab as never })}
      {...(over.sessionCount === undefined ? {} : { sessionCount: over.sessionCount })}
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

  it('ov-head 摘要合成：活跃 feature + 完成数（head bundle 单源）；会话计数注入位', () => {
    expect(frame({})).toContain('m2-pipeline · 3 完成')
    expect(frame({ sessionCount: 2 })).toContain('m2-pipeline · 2 会话 · 3 完成')
  })

  it('头路在途（head 缺席）= ov-head 不渲染，sticky 与内容区保持', () => {
    const markup = frame({ head: undefined, phase: 'loading' })
    expect(markup).not.toContain('data-dswf-ov-head')
    expect(markup).toContain('data-dswf-ov-sticky')
    expect(markup).toContain('data-dswf-ov-skeleton') // 首装骨架
  })
})

describe('OverviewFrame 子 tab 内容分派（AC4）', () => {
  it('proposals 子 tab（默认）：提案父行 + 文档行 + 谱系源（head.features）接线', () => {
    const markup = frame({ list: PROPOSALS_LIST })
    expect(markup).toContain('data-dswf-ov-proposals')
    expect(markup).toContain('data-dswf-ov-doc="docs/proposals/m2-pipeline/proposal.md"')
  })

  it('features 子 tab：feature 父行 + 来源提案（list.proposals）接线', () => {
    const filter = { ...initialOverviewFilter(), subtab: 'features' as const }
    const markup = frame({ filter, list: FEATURES_LIST })
    expect(markup).toContain('data-dswf-ov-features')
    expect(markup).toContain('m2-pipeline')
  })

  it('搜索在场 + 空结果 = 无匹配空态（服务端过滤——空标题由帧侧注入）', () => {
    const filter = { ...initialOverviewFilter(), search: '不存在' }
    const empty: OverviewListData = { kind: 'proposals', proposals: [] }
    const markup = frame({ filter, list: empty })
    expect(markup).toContain('无匹配「不存在」的提案')
  })

  it('列路在途（busy）= aria-busy 内容区标注（旧行保持）', () => {
    const markup = renderToStaticMarkup(
      <OverviewFrame
        projectId="p-1"
        head={HEAD}
        list={PROPOSALS_LIST}
        phase="ready"
        busy={true}
        error={undefined}
        filter={initialOverviewFilter()}
        onOpenDoc={() => {}}
        now={NOW}
        {...handlers}
      />,
    )
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('data-dswf-ov-proposals') // 旧内容不掏空
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

  it('renderTasksTab 槽注入（3.6 消费）：ctx 携带 search/sort/statusFilter/stats/features', () => {
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
        }
        return (
          <div data-dswf-test-slot="">
            {`${c.projectId}|${c.search}|${c.sort}|${c.statusFilter.join(',')}|${c.stats.byStatus.completed}|${c.features[0]?.slug ?? ''}`}
          </div>
        )
      },
    })
    expect(markup).toContain('data-dswf-test-slot')
    expect(markup).toContain('p-1|网关|created|blocked|3|m2-pipeline')
    expect(markup).not.toContain('data-dswf-ov-stchips') // 槽在场 = chips 由 3.6 组合（接口同源）
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
    const markup = frame({ list: undefined, phase: 'error', error: { message: '传输失败', uiState: 'error-bar' } })
    expect(markup).toContain('data-dswf-ov-error')
    expect(markup).toContain('概览装载失败')
  })

  it('error-bar（列路失败旧行在场）= 错误条 + 旧列表同现', () => {
    const markup = frame({ list: PROPOSALS_LIST, error: { message: '列表失败', uiState: 'error-bar' } })
    expect(markup).toContain('列表装载失败')
    expect(markup).toContain('data-dswf-ov-proposals')
  })
})

describe('OverviewTab（状态 + 装载胶水——静态首装面）', () => {
  it('首装 = 面板骨架 + 骨架屏（effect 不跑——数据装载归 overview-data 单测与 e2e）', () => {
    const markup = renderToStaticMarkup(
      <OverviewTab projectId="p-1" makeClient={(() => ({}) as never)} now={NOW} />,
    )
    expect(markup).toContain('data-dswf-ov-panel')
    expect(markup).toContain('data-dswf-ov-sticky')
    expect(markup).toContain('data-dswf-ov-skeleton')
    expect(markup).not.toContain('data-dswf-ov-head')
  })
})
