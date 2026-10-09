// 提案子 tab 完整形态（定位：业务——M3 4.6 UF-1：五态 chips 行[ov-sticky 之下、列表之上]
// + 提案父行[标题 + 名称右侧 mode chip + 中文状态 tag + 行头「打开新会话」+ ⋯ 菜单] +
// 展开元数据[两列网格 标识|作者 / 模式|谱系 / 创建|裁决 + 文档区 listProposalDocs]）。
// 组件半身（4.2/4.1）拼装：ProposalStatusChips（五态过滤）+ ModeChip（溯源三态；有溯源
// 可点 = 模式更改对话框快捷入口——唯一正门不分叉）+ ProposalVerdictDialog / ProposalModeDialog
// （⋯ 菜单挂线）+ formatPrefill（打开新会话预填——提案 mode/无溯源不切换、不自动发送）。
// 结构纪律：父行 = 多动作行（展开 toggle / mode chip / 打开新会话 / ⋯ 各自独立命中面——
// 零嵌套按钮）；文档区 = proposals.listDocs 只读扫描（提案文档不固定——proposal.md 之外
// 可挂任意 .md；docsMap 按需装载归 overview-data useProposalDocs）。
// 谱系（v7 ㉝）：superseded 取代链 + 成链 feature 关联（supersededBy/proposalSlug 反查）。
import { useCallback, useState, type ReactNode } from 'react'
import {
  PROPOSAL_STATUS_LABELS,
  type FeatureCard,
  type ProposalCard,
  type ProposalDocRow,
  type ProposalStatus,
  type TransitionProposalResult,
  type ProposalRow,
} from '@dsh-forge/contracts'
import { Menu, Tag, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState } from '../../components/index.js'
import { ModeChip } from '../../components/ModeChip.js'
import { isoTimeLabelZh } from '../../components/time-label.js'
import { preloadRpcClientFactory, type RpcClientFactory } from '../../rpc/index.js'
import { proposalRowKey } from './overview-model.js'
import { formatPrefill, type PrefillDocLine, type SessionOpenRequest } from './message-format.js'
import {
  ProposalStatusChips,
  PROPOSAL_STATUS_TAG_TONE,
  filterProposalsByStatuses,
} from './proposal-tab/ProposalStatusChips.js'
import { ProposalVerdictDialog, type VerdictProposalView } from './proposal-tab/ProposalVerdictDialog.js'
import { ProposalModeDialog, type ModeProposalView } from './proposal-tab/ProposalModeDialog.js'
import './overview.css'
import './proposal-tab/proposal-tab.css'
import './feature-tab/feature-tab.css'

/** 裁决行（decidedAt ? 「时间 → 状态」 : 评审中占位） */
export function proposalVerdict(proposal: ProposalCard, now: number): string {
  if (proposal.decidedAt === undefined) return '—（评审中）'
  return `${isoTimeLabelZh(proposal.decidedAt, now)} → ${PROPOSAL_STATUS_LABELS[proposal.proposalStatus].zh}`
}

/**
 * 谱系（v7 ㉝ 沿革与关联链）：superseded 取代链（→ 目标提案标题）+ 成链 feature 关联
 * （feature.proposalSlug 反查 → slug（状态））；两段以「；」连接；皆无 = —（无 feature）。
 */
export function proposalLineage(proposal: ProposalCard, features: readonly FeatureCard[]): string {
  const parts: string[] = []
  if (proposal.supersededBy !== undefined) parts.push(`取代链 → ${proposal.supersededBy}`)
  const children = features.filter((f) => f.proposalSlug === proposal.slug)
  if (children.length > 0) {
    parts.push(`成链 → ${children.map((f) => f.slug).join('，')}`)
  }
  if (parts.length === 0) return '—（无 feature）'
  return parts.join('；')
}

/** 相对提案目录真实路径（`docs/proposals/<slug>/` 前缀裁剪；非该前缀 = 原样——悬空容忍） */
export function docPathInProposal(relPath: string, slug: string): string {
  const prefix = `docs/proposals/${slug}/`
  return relPath.startsWith(prefix) ? relPath.slice(prefix.length) : relPath
}

/** 预填文档行（相对容器目录真实路径 + frontmatter 可选状态——数据约束 5） */
export function proposalPrefillDocs(docs: readonly ProposalDocRow[], slug: string): readonly PrefillDocLine[] {
  return docs.map((doc) => ({
    path: docPathInProposal(doc.relPath, slug),
    ...(doc.status !== undefined ? { status: doc.status } : {}),
  }))
}

/**
 * 打开新会话请求（提案渠道·UF-1.4）：mode = 提案溯源（无溯源不切换——registry 默认远征）；
 * prefill = formatPrefill 现状上下文（@path 首行 → 名称 → 摘要? → 状态 → 文档清单 →
 * 「我的意图：」空位）；**不自动发送**（预填渠道恒 autosend 缺省——v13 裁决）。
 * docsRoot = @ 锚文档根（项目行推导注入；缺席 = `docs` 缺省锚）。
 */
export function proposalPrefillRequest(
  proposal: ProposalCard,
  docs: readonly ProposalDocRow[],
  docsRoot?: string,
): SessionOpenRequest {
  return {
    ...(proposal.mode !== undefined ? { mode: proposal.mode } : {}),
    prefill: formatPrefill(
      {
        kind: 'proposal',
        slug: proposal.slug,
        title: proposal.title,
        proposalStatus: proposal.proposalStatus,
        ...(docsRoot !== undefined ? { docsRoot } : {}),
      },
      proposalPrefillDocs(docs, proposal.slug),
    ),
  }
}

/** ⋯ 菜单行 id 派发（verdict/mode/open 三前缀——未知 = 无派发） */
export function proposalMenuSelect(
  id: string,
  handlers: {
    readonly onVerdict: ((proposal: ProposalCard) => void) | undefined
    readonly onModeChange: ((proposal: ProposalCard) => void) | undefined
    readonly onOpenSession: ((proposal: ProposalCard) => void) | undefined
    readonly proposals: readonly ProposalCard[]
  },
): void {
  const sep = id.indexOf(':')
  if (sep <= 0) return
  const action = id.slice(0, sep)
  const proposal = handlers.proposals.find((p) => p.proposalId === id.slice(sep + 1))
  if (proposal === undefined) return
  if (action === 'verdict') handlers.onVerdict?.(proposal)
  else if (action === 'mode') handlers.onModeChange?.(proposal)
  else if (action === 'open') handlers.onOpenSession?.(proposal)
}

/** ⋯ 菜单行集（评审流转… / 更改模式…[仅已标记——未标记入口守卫] / 打开新会话） */
export function proposalMenuItems(proposal: ProposalCard, opts: { readonly modeEntry: boolean }): readonly MenuEntry[] {
  const items: MenuEntry[] = [
    { id: `verdict:${proposal.proposalId}`, label: <span className="dswf-ov-mrow">评审流转…</span> },
  ]
  if (opts.modeEntry) {
    items.push({ id: `mode:${proposal.proposalId}`, label: <span className="dswf-ov-mrow">更改模式…</span> })
  }
  items.push({ id: `open:${proposal.proposalId}`, label: <span className="dswf-ov-mrow">打开新会话</span> })
  return items
}

/** 提案文档区（v18 ㉚「文档（N 篇）」——提案文档不固定；行 = 📄 相对路径 [状态] › 整行可点） */
function ProposalDocList({
  docs,
  slug,
  onOpenDoc,
}: {
  readonly docs: readonly ProposalDocRow[]
  readonly slug: string
  readonly onOpenDoc: (docRel: string) => void
}): ReactNode {
  return (
    <div className="dswf-ov-dgroups" data-dswf-ov-pdocs={slug}>
      <div className="dswf-ov-docs-head">{`文档（${docs.length} 篇）`}</div>
      {docs.map((doc) => (
        <button
          type="button"
          className="dswf-ov-drow"
          key={doc.relPath}
          data-dswf-ov-doc={doc.relPath}
          title={doc.relPath}
          onClick={() => {
            onOpenDoc(doc.relPath)
          }}
        >
          <span className="dswf-ov-drow-path">{`📄 ${docPathInProposal(doc.relPath, slug)}`}</span>
          {doc.status === undefined ? null : <span className="dswf-ov-drow-state">{`[${doc.status}]`}</span>}
          <span className="dswf-ov-drow-arrow" aria-hidden="true">
            ›
          </span>
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────── 纯渲染体（静态全相位可测） ───────────────────────────

export interface ProposalsTabBodyProps {
  /** 提案列表（服务端 search/sort 后——五态并集过滤叠加在本层） */
  readonly proposals: readonly ProposalCard[]
  /** 五态计数（头路无参聚合单源——不随搜索漂移） */
  readonly counts: Readonly<Record<ProposalStatus, number>>
  /** 五态激活集（受控——帧侧 toggle 持有；子 tab 切换清空） */
  readonly activeStatuses: ReadonlySet<ProposalStatus>
  readonly onToggleStatus: (status: ProposalStatus) => void
  /** 清过滤（缺席 = 无清入口面） */
  readonly onClearStatuses?: () => void
  /** 谱系反查源（无参 feature 列——头路装载） */
  readonly features: readonly FeatureCard[]
  /** 父行展开键集（受控——帧侧 openRows） */
  readonly openRows: ReadonlySet<string>
  readonly onToggleRow: (key: string) => void
  /** 展开行文档（slug → proposals.listDocs 行集——按需装载） */
  readonly docsMap: ReadonlyMap<string, readonly ProposalDocRow[]>
  /** 文档行点击（docRel = proposals.rel_path；dock 开 tab） */
  readonly onOpenDoc: (docRel: string) => void
  /** 行头「打开新会话」（缺席 = 按钮不呈现——SSR/非壳载体面） */
  readonly onOpenSession?: (proposal: ProposalCard, docs: readonly ProposalDocRow[]) => void
  /** ⋯ 菜单 → 评审流转对话框（缺席 = 菜单项缺） */
  readonly onVerdict?: (proposal: ProposalCard) => void
  /** ⋯ / mode chip → 模式更改对话框（缺席 = 快捷入口不可点 + 菜单项缺） */
  readonly onModeChange?: (proposal: ProposalCard) => void
  /** ⋯ 菜单开合（受控——装载壳单菜单互斥） */
  readonly menuProposalId: string | null
  readonly onMenuOpenChange: (proposalId: string | null) => void
  /** 空态标题（缺省「暂无提案」；搜索在场由帧侧注入「无匹配…」） */
  readonly emptyTitle?: string
  /** 相对时间基准（缺省 Date.now()——测试注入固定值） */
  readonly now?: number
}

/** 提案子 tab 纯渲染体（五态 chips + 父行行头动作集 + 展开两列网格 + 文档区） */
export function ProposalsTabBody({
  proposals,
  counts,
  activeStatuses,
  onToggleStatus,
  onClearStatuses,
  features,
  openRows,
  onToggleRow,
  docsMap,
  onOpenDoc,
  onOpenSession,
  onVerdict,
  onModeChange,
  menuProposalId,
  onMenuOpenChange,
  emptyTitle,
  now,
}: ProposalsTabBodyProps): ReactNode {
  const at = now ?? Date.now()
  const visible = filterProposalsByStatuses(proposals, activeStatuses)
  const hasFilter = activeStatuses.size > 0
  if (visible.length === 0) {
    return (
      <div className="dswf-ov-proposalpage" data-dswf-ov-proposalpage="">
        <ProposalStatusChips counts={counts} active={activeStatuses} onToggle={onToggleStatus} {...(onClearStatuses !== undefined ? { onClear: onClearStatuses } : {})} />
        <EmptyState
          className="dswf-ov-empty"
          title={hasFilter ? '无匹配当前状态过滤的提案' : (emptyTitle ?? '暂无提案')}
          description={hasFilter ? '调整或清除过滤后重试' : '提案由 agent 会话经 createProposal 产生'}
        />
      </div>
    )
  }
  return (
    <div className="dswf-ov-proposalpage" data-dswf-ov-proposalpage="">
      {/* 五态 chips 行——ov-sticky 之下、列表之上（UF-1 插入点锚） */}
      <ProposalStatusChips counts={counts} active={activeStatuses} onToggle={onToggleStatus} {...(onClearStatuses !== undefined ? { onClear: onClearStatuses } : {})} />
      <div className="dswf-ov-list" data-dswf-ov-proposals="">
        {visible.map((proposal) => {
          const key = proposalRowKey(proposal.proposalId)
          const open = openRows.has(key)
          const docs = docsMap.get(proposal.slug) ?? []
          const hasMenu = onVerdict !== undefined || onModeChange !== undefined || onOpenSession !== undefined
          return (
            <div className="dswf-ov-item" key={proposal.proposalId}>
              <div className={open ? 'dswf-ov-parent is-open' : 'dswf-ov-parent'} data-dswf-ov-parent={key}>
                <button
                  type="button"
                  className="dswf-ov-parent-toggle"
                  aria-expanded={open}
                  title={proposal.title}
                  data-dswf-ov-parent-toggle={key}
                  onClick={() => {
                    onToggleRow(key)
                  }}
                >
                  <span className="dswf-ov-caret" aria-hidden="true">
                    {open ? '▾' : '▸'}
                  </span>
                  <span className="dswf-ov-parent-title">{proposal.title || proposal.slug}</span>
                </button>
                <ModeChip
                  mode={proposal.mode}
                  {...(proposal.mode !== undefined && onModeChange !== undefined
                    ? { onOpenChangeMode: () => onModeChange(proposal) }
                    : {})}
                />
                <Tag tone={PROPOSAL_STATUS_TAG_TONE[proposal.proposalStatus]} className="dswf-ov-parent-chip">
                  {PROPOSAL_STATUS_LABELS[proposal.proposalStatus].zh}
                </Tag>
                {onOpenSession !== undefined ? (
                  <button
                    type="button"
                    className="dswf-ov-act"
                    data-dswf-ov-opensession={proposal.slug}
                    title="打开新会话（自动切提案模式 + 现状上下文预填·不发送）"
                    onClick={() => {
                      onOpenSession(proposal, docs)
                    }}
                  >
                    打开新会话
                  </button>
                ) : null}
                {hasMenu ? (
                  <Menu
                    open={menuProposalId === proposal.proposalId}
                    portal
                    side="bottom"
                    items={proposalMenuItems(proposal, { modeEntry: proposal.mode !== undefined && onModeChange !== undefined })}
                    selectedId={undefined}
                    selection="fill"
                    listClassName="dswf-ov-menu"
                    onClose={() => {
                      onMenuOpenChange(null)
                    }}
                    onSelect={(id) => {
                      onMenuOpenChange(null)
                      proposalMenuSelect(id, { onVerdict, onModeChange, onOpenSession: onOpenSession === undefined ? undefined : (p) => onOpenSession(p, docsMap.get(p.slug) ?? []), proposals })
                    }}
                    anchor={
                      <button
                        type="button"
                        className="dswf-ov-more"
                        data-dswf-ov-more={proposal.proposalId}
                        aria-label="提案行操作"
                        aria-haspopup="menu"
                        aria-expanded={menuProposalId === proposal.proposalId}
                        title="行操作"
                        onClick={() => {
                          onMenuOpenChange(menuProposalId === proposal.proposalId ? null : proposal.proposalId)
                        }}
                      >
                        ⋯
                      </button>
                    }
                  />
                ) : null}
              </div>
              {open ? (
                <div className="dswf-ov-meta" data-dswf-ov-meta={key}>
                  {/* 摘要行缺席：contracts ProposalRow 无 summary 字段（Interface 3 数据形状权威）——
                      提案摘要在文档 tab（DocContent.summary）承载，行级不重复 */}
                  <div className="dswf-ov-fmeta-grid">
                    <div className="dswf-ov-fmeta-row">
                      <span className="dswf-ov-fmeta-k">标识</span>
                      <span className="dswf-ov-fmeta-v" title={proposal.slug}>
                        {proposal.slug}
                      </span>
                    </div>
                    <div className="dswf-ov-fmeta-row">
                      <span className="dswf-ov-fmeta-k">作者</span>
                      <span className="dswf-ov-fmeta-v">{proposal.author ?? '—'}</span>
                    </div>
                    <div className="dswf-ov-fmeta-row">
                      <span className="dswf-ov-fmeta-k">模式</span>
                      <span className="dswf-ov-fmeta-v">
                        {proposal.mode === undefined ? '未标记' : proposal.mode === 'expedition' ? '远征' : '突击'}
                      </span>
                    </div>
                    <div className="dswf-ov-fmeta-row">
                      <span className="dswf-ov-fmeta-k">谱系</span>
                      <span className="dswf-ov-fmeta-v">{proposalLineage(proposal, features)}</span>
                    </div>
                    <div className="dswf-ov-fmeta-row">
                      <span className="dswf-ov-fmeta-k">创建</span>
                      <span className="dswf-ov-fmeta-v" title={proposal.createdAt}>
                        {isoTimeLabelZh(proposal.createdAt, at)}
                      </span>
                    </div>
                    <div className="dswf-ov-fmeta-row">
                      <span className="dswf-ov-fmeta-k">裁决</span>
                      <span className="dswf-ov-fmeta-v">{proposalVerdict(proposal, at)}</span>
                    </div>
                  </div>
                  <ProposalDocList docs={docs} slug={proposal.slug} onOpenDoc={onOpenDoc} />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────── 装载壳（对话框开合 + 动作接线） ───────────────────────────

export interface ProposalsTabProps {
  /** 当前项目 id（对话框 rpc 面） */
  readonly projectId: string
  /** 提案列表（服务端 search/sort 后） */
  readonly proposals: readonly ProposalCard[]
  /** 五态计数（头路无参聚合单源） */
  readonly counts: Readonly<Record<ProposalStatus, number>>
  /** 五态激活集（受控——帧侧持有） */
  readonly activeStatuses: ReadonlySet<ProposalStatus>
  readonly onToggleStatus: (status: ProposalStatus) => void
  readonly onClearStatuses?: () => void
  /** 谱系反查源（无参 feature 列——头路装载） */
  readonly features: readonly FeatureCard[]
  readonly openRows: ReadonlySet<string>
  readonly onToggleRow: (key: string) => void
  /** 展开行文档（slug → proposals.listDocs 行集——overview-data useProposalDocs 注入） */
  readonly docsMap: ReadonlyMap<string, readonly ProposalDocRow[]>
  readonly onOpenDoc: (docRel: string) => void
  /** 打开新会话通道（装配注入——openSessionWithPreset；缺席 = 行头按钮不呈现） */
  readonly onStartSession?: (request: SessionOpenRequest) => void
  /** @ 锚文档根（帧侧 head 项目行推导——docsRootOf；缺席 = `docs` 缺省锚） */
  readonly docsRoot?: string
  readonly emptyTitle?: string
  readonly now?: number
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

/**
 * 提案子 tab 装载壳：⋯ 菜单开合 + 两对话框受控（开弹行为；成功关闭——快照呈现归
 * 写推送事件订阅重取[TECH-rpc-007]，本层零显式刷新）+ 打开新会话组装
 * （proposalPrefillRequest——提案 mode/无溯源不切换 + 预填不发送）。
 */
export function ProposalsTab({
  projectId,
  proposals,
  counts,
  activeStatuses,
  onToggleStatus,
  onClearStatuses,
  features,
  openRows,
  onToggleRow,
  docsMap,
  onOpenDoc,
  onStartSession,
  docsRoot,
  emptyTitle,
  now,
  makeClient = preloadRpcClientFactory,
}: ProposalsTabProps): ReactNode {
  const [menuProposalId, setMenuProposalId] = useState<string | null>(null)
  const [verdictTarget, setVerdictTarget] = useState<VerdictProposalView | undefined>(undefined)
  const [modeTarget, setModeTarget] = useState<ModeProposalView | undefined>(undefined)

  const handleOpenSession = useCallback(
    (proposal: ProposalCard, docs: readonly ProposalDocRow[]): void => {
      onStartSession?.(proposalPrefillRequest(proposal, docs, docsRoot))
    },
    [onStartSession, docsRoot],
  )
  const handleVerdict = useCallback((proposal: ProposalCard): void => {
    setVerdictTarget({ ...proposal, mode: proposal.mode })
  }, [])
  const handleModeChange = useCallback((proposal: ProposalCard): void => {
    // 入口守卫：未标记提案不可更改（mode chip 未标记态不可点 + ⋯ 菜单项缺席——双保险）
    if (proposal.mode === undefined) return
    setModeTarget({ ...proposal, mode: proposal.mode })
  }, [])
  const handleVerdictDone = useCallback((_result: TransitionProposalResult): void => {
    // 成链/流转快照呈现 = 事件订阅重取（chained feature 即时出现——流程 1）；此处仅关闭
    setVerdictTarget(undefined)
  }, [])
  const handleModeDone = useCallback((_row: ProposalRow): void => {
    // mode chip 即时反映 = 事件订阅重取（proposals 写推送链）；此处仅关闭
    setModeTarget(undefined)
  }, [])

  return (
    <>
      <ProposalsTabBody
        proposals={proposals}
        counts={counts}
        activeStatuses={activeStatuses}
        onToggleStatus={onToggleStatus}
        {...(onClearStatuses !== undefined ? { onClearStatuses } : {})}
        features={features}
        openRows={openRows}
        onToggleRow={onToggleRow}
        docsMap={docsMap}
        onOpenDoc={onOpenDoc}
        {...(onStartSession !== undefined ? { onOpenSession: handleOpenSession } : {})}
        onVerdict={handleVerdict}
        onModeChange={handleModeChange}
        menuProposalId={menuProposalId}
        onMenuOpenChange={setMenuProposalId}
        {...(emptyTitle !== undefined ? { emptyTitle } : {})}
        {...(now !== undefined ? { now } : {})}
      />
      {verdictTarget !== undefined ? (
        <ProposalVerdictDialog
          projectId={projectId}
          proposal={verdictTarget}
          candidates={proposals.map((p) => ({ proposalId: p.proposalId, title: p.title }))}
          onCancel={() => {
            setVerdictTarget(undefined)
          }}
          onDone={handleVerdictDone}
          makeClient={makeClient}
        />
      ) : null}
      {modeTarget !== undefined ? (
        <ProposalModeDialog
          projectId={projectId}
          proposal={modeTarget}
          onCancel={() => {
            setModeTarget(undefined)
          }}
          onDone={handleModeDone}
          makeClient={makeClient}
        />
      ) : null}
    </>
  )
}
