// 提案子 tab 完整形态单测 —— 4.6 UF-1（AC1/AC6）：五态 chips 插入点（ov-sticky 之下、
// 列表之上）+ 父行行头动作集（mode chip 三态 / 状态 tag / 打开新会话 / ⋯）+ 展开摘要独行
// 与两列网格（标识|作者 / 模式|谱系 / 创建|裁决）+ 文档区 listProposalDocs + 预填请求组装
// （提案 mode/无溯源不切换 + 不自动发送）+ 多选并集过滤与过滤零命中空态。
// 对话框开合（点击链）归 e2e；对话框本体已归 4.2 组件测试。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FeatureCard, ProposalCard, ProposalDocRow, ProposalStatus, TaskStatus } from '@dsh-forge/contracts'
import {
  ProposalsTab,
  ProposalsTabBody,
  docPathInProposal,
  proposalLineage,
  proposalPrefillDocs,
  proposalPrefillRequest,
  proposalVerdict,
  proposalMenuItems,
  proposalMenuSelect,
} from './proposal-tab.js'
import { docsRootOf } from './message-format.js'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const CREATED = '2026-10-01T08:00:00.000Z'

function proposal(id: string, slug: string, status: ProposalStatus, decidedAt?: string, mode?: 'expedition' | 'blitz'): ProposalCard {
  return {
    proposalId: id,
    slug,
    title: `提案 ${slug}`,
    proposalStatus: status,
    relPath: `docs/proposals/${slug}/proposal.md`,
    author: 'faner',
    taskCount: 0,
    decidedAt,
    ...(mode !== undefined ? { mode } : {}),
    createdAt: CREATED,
    updatedAt: CREATED,
  }
}

function feature(slug: string, proposalSlug?: string): FeatureCard {
  return {
    featureId: `fid-${slug}`,
    slug,
    title: slug,
    featureStatus: 'in-progress',
    createdAt: CREATED,
    updatedAt: CREATED,
    byStatus: { pending: 1, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 } as Record<TaskStatus, number>,
    docCount: 2,
    proposalSlug,
  }
}

const P_REVIEW = proposal('pr-1', 'm2-pipeline', 'under-review', undefined, 'expedition')
const P_ACCEPTED = proposal('pr-2', 'legacy-import', 'accepted', '2026-10-03T08:00:00.000Z')
const P_BLITZ = proposal('pr-3', 'legacy-eval-retire', 'draft', undefined, 'blitz')
const PROPOSALS = [P_REVIEW, P_ACCEPTED, P_BLITZ]
const FEATURES = [feature('m2-pipeline', 'm2-pipeline')]

const DOCS: readonly ProposalDocRow[] = [
  { fileName: 'proposal.md', relPath: 'docs/proposals/m2-pipeline/proposal.md', title: '提案', status: '评审中' },
  { fileName: 'spike-notes.md', relPath: 'docs/proposals/m2-pipeline/spike-notes.md' },
]

const COUNTS: Record<ProposalStatus, number> = { draft: 1, 'under-review': 1, accepted: 1, rejected: 0, superseded: 0 }

const base = {
  projectId: 'p-1',
  proposals: PROPOSALS,
  counts: COUNTS,
  activeStatuses: new Set<ProposalStatus>(),
  onToggleStatus: () => {},
  onClearStatuses: () => {},
  features: FEATURES,
  openRows: new Set<string>(),
  onToggleRow: () => {},
  docsMap: new Map<string, readonly ProposalDocRow[]>([['m2-pipeline', DOCS]]),
  onOpenDoc: () => {},
  menuProposalId: null as string | null,
  onMenuOpenChange: () => {},
  now: NOW,
}

describe('ProposalsTabBody · 五态 chips 插入点与列表（AC1/AC6）', () => {
  it('五态 chips 行在列表之上（DOM 序——pschips 先于列表容器）+ 0 计数 disabled', () => {
    const markup = renderToStaticMarkup(<ProposalsTabBody {...base} />)
    const chipsAt = markup.indexOf('data-dswf-ov-pschips=""')
    const listAt = markup.indexOf('data-dswf-ov-proposals=""')
    expect(chipsAt).toBeGreaterThan(-1)
    expect(listAt).toBeGreaterThan(chipsAt) // 插入点：列表之上
    expect(markup).toContain('data-dswf-ov-pschip="under-review"')
    // 0 计数 disabled（rejected）
    const at = markup.indexOf('data-dswf-ov-pschip="rejected"')
    expect(markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))).toContain('disabled')
    // m3.1 D26：零过程注释文案——目录脚注（forge docs/proposals/ · 只读）零在场（字符串级断言）
    expect(markup).not.toContain(' · 只读')
    expect(markup).not.toContain('dswf-ov-footnote')
  })

  it('父行行头动作集：toggle 命中面 + mode chip（名称右侧）+ 状态 tag + 打开新会话 + ⋯', () => {
    const markup = renderToStaticMarkup(
      <ProposalsTabBody {...base} onOpenSession={() => {}} onVerdict={() => {}} onModeChange={() => {}} />,
    )
    expect(markup).toContain('data-dswf-ov-parent-toggle="prop:pr-1"')
    expect(markup).toContain('data-dswf-mode-chip="expedition"') // 有溯源可点快捷入口
    expect(markup).toContain('data-dswf-mode-chip="blitz"') // M3.1 D16 三态：突击琥珀
    expect(markup).toContain('data-dswf-mode-chip="unmarked"') // 无溯源 = 未标记不可点
    expect(markup).toContain('data-dswf-ov-opensession="m2-pipeline"')
    expect(markup).toContain('打开新会话')
    expect(markup).toContain('data-dswf-ov-more="pr-1"')
  })

  it('打开新会话入口缺席 = 按钮不呈现（SSR/非壳载体面）', () => {
    const markup = renderToStaticMarkup(<ProposalsTabBody {...base} onVerdict={() => {}} />)
    expect(markup).not.toContain('data-dswf-ov-opensession')
  })

  it('展开元数据：两列网格（标识|作者 / 模式|谱系 / 创建|裁决）+ 文档区「文档（N 篇）」', () => {
    const markup = renderToStaticMarkup(
      <ProposalsTabBody {...base} openRows={new Set(['prop:pr-1'])} />,
    )
    expect(markup).toContain('data-dswf-ov-meta="prop:pr-1"')
    // M3.1 D16 摘要独行：全宽行（is-full）先于两列网格；提案行数据面零 summary 字段
    // （Interface 3 权威——prefill 渠道同缺席）→ 原型 `pr.abstract || '—'` 的占位值
    const metaAt = markup.indexOf('data-dswf-ov-meta="prop:pr-1"')
    const fullAt = markup.indexOf('dswf-ov-fmeta-row is-full', metaAt)
    const gridAt = markup.indexOf('dswf-ov-fmeta-grid', metaAt)
    expect(fullAt).toBeGreaterThan(-1)
    expect(gridAt).toBeGreaterThan(fullAt)
    const summaryRow = markup.slice(fullAt, gridAt)
    expect(summaryRow).toContain('摘要')
    expect(summaryRow).toContain('—')
    expect(markup).toContain('dswf-ov-fmeta-grid')
    expect(markup).toContain('标识')
    expect(markup).toContain('m2-pipeline')
    expect(markup).toContain('作者')
    expect(markup).toContain('faner')
    expect(markup).toContain('模式')
    expect(markup).toContain('远征')
    expect(markup).toContain('谱系')
    expect(markup).toContain('创建')
    expect(markup).toContain('裁决')
    expect(markup).toContain('文档（2 篇）')
    // 文档行 = 相对提案目录路径 + [状态] + ›
    expect(markup).toContain('data-dswf-ov-doc="docs/proposals/m2-pipeline/proposal.md"')
    expect(markup).toContain('📄 proposal.md')
    expect(markup).toContain('[评审中]')
    expect(markup).toContain('📄 spike-notes.md') // 无状态括注
  })

  it('多选并集过滤：激活 accepted → 仅 accepted 行；零命中 = 空态 + 清过滤', () => {
    const markup = renderToStaticMarkup(
      <ProposalsTabBody {...base} activeStatuses={new Set<ProposalStatus>(['accepted'])} />,
    )
    expect(markup).toContain('提案 legacy-import')
    expect(markup).not.toContain('提案 m2-pipeline')
    expect(markup).not.toContain('提案 legacy-eval-retire')
    expect(markup).toContain('✕ 清过滤')
  })

  it('过滤零命中（rejected 激活但 0 计数不可点——构造空并集）= 空态呈现', () => {
    const markup = renderToStaticMarkup(
      <ProposalsTabBody
        {...base}
        proposals={[P_REVIEW]}
        activeStatuses={new Set<ProposalStatus>(['draft'])}
        counts={{ ...COUNTS, 'under-review': 0 }}
      />,
    )
    expect(markup).toContain('无匹配当前状态过滤的提案')
  })

  it('零提案 = 一等空态（chips 全 0 disabled）', () => {
    const markup = renderToStaticMarkup(
      <ProposalsTabBody {...base} proposals={[]} counts={{ draft: 0, 'under-review': 0, accepted: 0, rejected: 0, superseded: 0 }} />,
    )
    expect(markup).toContain('暂无提案')
    expect(markup).toContain('disabled')
  })
})

describe('谱系/裁决纯函数（AC1）', () => {
  it('proposalLineage：成链 feature 关联 + supersededBy 取代链；皆无 = —', () => {
    expect(proposalLineage(P_REVIEW, FEATURES)).toBe('成链 → m2-pipeline')
    expect(proposalLineage(P_ACCEPTED, FEATURES)).toBe('—（无 feature）')
    expect(proposalLineage({ ...P_ACCEPTED, supersededBy: 'pr-9' }, FEATURES)).toBe('取代链 → pr-9')
    expect(proposalLineage({ ...P_REVIEW, supersededBy: 'pr-9' }, FEATURES)).toBe('取代链 → pr-9；成链 → m2-pipeline')
  })

  it('proposalVerdict：裁决时刻 → 状态（相对时刻 + 中文状态）；未裁决 = 评审中占位', () => {
    expect(proposalVerdict(P_ACCEPTED, NOW)).toContain('→ 已接受')
    expect(proposalVerdict(P_REVIEW, NOW)).toBe('—（评审中）')
  })
})

describe('预填请求组装（AC1——提案 mode/无溯源不切换 + 不自动发送）', () => {
  it('有溯源：mode 透传 + formatPrefill 现状上下文（@path 首行 → 名称 → 状态 → 文档清单 → 意图空位）', () => {
    const request = proposalPrefillRequest(P_REVIEW, DOCS)
    expect(request.mode).toBe('expedition')
    expect(request.autosend).toBeUndefined() // 预填不自动发送（v13 裁决）
    expect(request.prefill).toContain('@docs/proposals/m2-pipeline/')
    expect(request.prefill).toContain('名称：提案 m2-pipeline')
    expect(request.prefill).toContain('状态：评审中')
    expect(request.prefill).toContain('· proposal.md（评审中）')
    expect(request.prefill).toContain('· spike-notes.md')
    expect(request.prefill.endsWith('我的意图：')).toBe(true)
    expect(request.prefill).not.toContain('模式') // 不含模式（由会话预设承载）
  })

  it('无溯源：mode 键缺席（不切换——registry 默认）', () => {
    const request = proposalPrefillRequest(P_ACCEPTED, [])
    expect('mode' in request).toBe(false)
    expect(request.prefill).toContain('已生成文档：')
  })

  it('docsRoot 注入（第三参——项目行推导）：夹具 <ws>/.forge → 首行 `@.forge/docs/proposals/<slug>/`；缺席回退 @docs', () => {
    const docsRoot = docsRootOf('Z:\\project\\dsh', 'Z:\\project\\dsh\\.forge')
    expect(docsRoot).toBe('.forge/docs')
    const request = proposalPrefillRequest(P_REVIEW, DOCS, docsRoot)
    expect(request.prefill.split('\n')[0]).toBe('@.forge/docs/proposals/m2-pipeline/')
    expect(request.prefill).toContain('名称：提案 m2-pipeline') // 其余行不受锚前缀影响
    const fallback = proposalPrefillRequest(P_REVIEW, DOCS)
    expect(fallback.prefill.split('\n')[0]).toBe('@docs/proposals/m2-pipeline/')
  })

  it('docPathInProposal：前缀裁剪；非该前缀原样（悬空容忍）', () => {
    expect(docPathInProposal('docs/proposals/ui-polish/proposal.md', 'ui-polish')).toBe('proposal.md')
    expect(docPathInProposal('docs/features/x/proposal.md', 'ui-polish')).toBe('docs/features/x/proposal.md')
  })

  it('proposalPrefillDocs：状态在场/缺席两态', () => {
    const docs = proposalPrefillDocs(DOCS, 'm2-pipeline')
    expect(docs[0]).toEqual({ path: 'proposal.md', status: '评审中' })
    expect(docs[1]).toEqual({ path: 'spike-notes.md' })
  })
})

describe('⋯ 菜单（AC1——评审流转/更改模式/打开新会话）', () => {
  it('行集：已标记 = 三项；未标记 = 更改模式缺席（入口守卫）', () => {
    const marked = proposalMenuItems(P_REVIEW, { modeEntry: true })
    expect(marked.map((entry) => entry.id)).toEqual(['verdict:pr-1', 'mode:pr-1', 'open:pr-1'])
    const unmarked = proposalMenuItems(P_ACCEPTED, { modeEntry: false })
    expect(unmarked.map((entry) => entry.id)).toEqual(['verdict:pr-2', 'open:pr-2'])
  })

  it('proposalMenuSelect：三前缀派发；未知 id = 无派发', () => {
    const calls: string[] = []
    proposalMenuSelect('verdict:pr-1', {
      onVerdict: (p) => calls.push(`v:${p.proposalId}`),
      onModeChange: (p) => calls.push(`m:${p.proposalId}`),
      onOpenSession: (p) => calls.push(`o:${p.proposalId}`),
      proposals: PROPOSALS,
    })
    proposalMenuSelect('mode:pr-2', {
      onVerdict: undefined,
      onModeChange: (p) => calls.push(`m:${p.proposalId}`),
      onOpenSession: undefined,
      proposals: PROPOSALS,
    })
    proposalMenuSelect('open:ghost', { onVerdict: undefined, onModeChange: undefined, onOpenSession: (p) => calls.push(`o:${p.proposalId}`), proposals: PROPOSALS })
    expect(calls).toEqual(['v:pr-1', 'm:pr-2'])
  })
})

describe('ProposalsTab 装载壳（静态首帧——对话框关闭态）', () => {
  it('首帧 = chips + 列表 + 行头动作（对话框缺席——开合归交互面/e2e）', () => {
    const markup = renderToStaticMarkup(
      <ProposalsTab {...base} makeClient={() => ({}) as never} onStartSession={() => {}} />,
    )
    expect(markup).toContain('data-dswf-ov-pschips')
    expect(markup).toContain('data-dswf-ov-proposals')
    expect(markup).toContain('data-dswf-ov-opensession')
    expect(markup).not.toContain('data-dswf-ov-vd') // 裁决对话框关
    expect(markup).not.toContain('data-dswf-ov-md') // 模式对话框关
  })
})
