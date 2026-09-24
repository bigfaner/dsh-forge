/**
 * The UF5 提案行列表, BUILD half (task 5.4, ui-design UF5 列表视图):
 * the list view the 5.5 ProposalsPage mounts into the proposals tab — one
 * row per ProposalSummary over the ProposalFace seam (状态 Pill + slug
 * 14/22 单行截断 + feature 徽标(品牌蓝 ghost Pill,无关联不渲染)+ 作者/
 * created 12/18 次文字), the 排序 control (created/slug/状态, 默认 created
 * 倒序 = the kernel's own baseline), and the board's state machine:
 * loading 骨架 / empty 空态卡 + 文档根路径说明(mono) / error 重试卡 /
 * docsLost 仓外路径失效引导(重新指向/移除 seams, 同 M2 UF4 口径) /
 * populated / updating(回流).
 *
 * 回流 (ui-design States updating + AC4): the reflux rides the project-
 * scoped `sync` pushes over the face's shared channel — every scan
 * completion re-fires loadBoard with the loaded board kept rendered while
 * the re-read is in flight (不打断焦点/滚动); NEW or status-changed rows
 * carry the transient flow mark (0.2s fade-in budget) and ONE aggregated
 * polite announcement lands in the aria-live region (批量回流聚合为一条
 * 计数播报). Foreign projects' events never reload this board.
 *
 * Hard Rules honored here:
 *   - 全页面零状态写入口 (SC6): the row's whole interaction surface is
 *     navigation (row → detail seam, feature badge → jump seam); no edit /
 *     transition / delete affordance exists anywhere in this file;
 *   - 色谱与 label 经 ProposalStatusPill 的唯一词表 (no second copy);
 *   - feature 徽标 NULL = 不渲染 (管线早期正常态).
 *
 * 组件不注册 tab/路由 (Implementation Notes): the enter-detail and
 * feature-jump seams are callbacks the 5.5 page routes into the view-key
 * machine; the breadcrumb return contract = the page keeps THIS component
 * mounted while the detail subview is open (the FeaturesPage precedent),
 * so the board data and the page-level scroll survive the round trip by
 * construction — 返回不重拉 (asserted at component level in the spec).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { ProposalBoardData, ProposalSummary } from '../../ipc-types'
import type { ProposalFace } from '../../contract'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { fillTemplate } from '../overview/format'
import { createMockProposalsFace } from '../../mocks/workbench'
import {
  ProposalStatusPill,
  PROPOSAL_STATUSES,
  proposalStatusLabel,
  type ProposalTranslate,
} from './ProposalStatusPill'

/** Inputs of {@link ProposalList}. */
export interface ProposalListProps {
  /** The locale seat (the shell's `t`). */
  t: ProposalTranslate
  /** The active project — the loadBoard verb argument. */
  projectId?: string | undefined
  /**
   * The proposals face — absent members fall back to the build-stage mock
   * (a pure READ face, the feature-board-face discipline; 5.5 injects the
   * IPC face).
   */
  face?: Partial<ProposalFace> | undefined
  /**
   * 仓外路径失效 (assembly-derived, the OverviewPage lostProjectIds 口径):
   * true renders the 不可访问 guidance card with the repoint/remove seams —
   * the ui-design UF5 error 态's 仓外 leg (同 M2 UF4).
   */
  docsLost?: boolean | undefined
  /** The lost card's 重新指向 seam (5.5 routes it to the wizard edit mode). */
  onRepoint?: (() => void) | undefined
  /** The lost card's 移除项目 seam (5.5 routes it to the overview remove flow). */
  onRemove?: (() => void) | undefined
  /** The enter-detail seam (row click/Enter → the page's detail subview). */
  onOpenProposal?: ((slug: string) => void) | undefined
  /**
   * The feature-jump seam (badge click → Feature tab 对应详情, 面包屑记录
   * 来路可返 — 5.5's tab 编排; asserted at component level via callback).
   */
  onOpenFeature?: ((featureSlug: string) => void) | undefined
}

/** The sort keys (ui-design UF5 排序: created / slug / 状态). */
type ProposalSortKey = 'created' | 'slug' | 'status'

const SORT_KEYS: readonly ProposalSortKey[] = ['created', 'slug', 'status']

/** How long a reflux-marked row keeps its flow highlight (the board precedent). */
const FLOW_MARK_MS = 1500
/** The flow fade-in transition (ui-design updating: 0.2s). */
const FLOW_TRANSITION = 'background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
/** The reflux fill (the task board's updating highlight twin). */
const FLOW_BACKGROUND = 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))'

const rootStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: 0,
} as const

/** Shared card face for the non-data states (the board page precedent). */
const cardStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  padding: '14px',
} as const

const errorCardStyle = {
  ...cardStyle,
  border: '1.5px solid var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
} as const

const emptyCardStyle = {
  ...cardStyle,
  alignItems: 'center',
  border: '1px dashed var(--dsh-border-color, CanvasText)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '48px 14px',
  textAlign: 'center',
} as const

const lostCardStyle = {
  ...errorCardStyle,
  alignItems: 'center',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
} as const

const cardTitleStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
} as const

const cardBodyStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  maxWidth: '420px',
} as const

/** md primary pill (the retry CTA — the board page precedent). */
const primaryButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '18px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  height: '36px',
  padding: '0 16px',
} as const

/** sm ghost pill (the lost card's secondary actions). */
const ghostButtonStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'var(--dsw-alias-label-primary, inherit)',
  cursor: 'pointer',
  font: 'inherit',
  height: '28px',
  padding: '0 12px',
} as const

/** 文档根路径说明: mono 12/18 (an ID/path — the 代码栈 treatment). */
const monoPathStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  overflowWrap: 'anywhere',
} as const

/** Skeleton gray rows (ui-design loading 态: 灰行骨架). */
const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '32px',
} as const

/** The toolbar row: 标题 + 只读说明 + 排序 (margin-left auto). */
const toolbarStyle = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px',
} as const

const toolbarTitleStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
} as const

const toolbarHintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** The rows card (ui-design 列表容器): r14 · bg-layer-2. */
const listCardStyle = {
  ...cardStyle,
  padding: '6px 0',
} as const

/** One row: r14 hover interactive-bg-hover (host CSS) — cursor + flex here. */
const rowStyle = {
  alignItems: 'center',
  borderRadius: '8px',
  cursor: 'pointer',
  display: 'flex',
  gap: '8px',
  margin: '0 6px',
  minWidth: 0,
  padding: '10px 8px',
} as const

/** slug 14/22 mono, 单行截断 (同 M2 任务标题口径). */
const slugStyle = {
  flex: '1 1 auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '14px',
  lineHeight: '22px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** feature 徽标: 品牌蓝 ghost Pill(可点,aria-label 具名). */
const featureBadgeStyle = {
  background: 'transparent',
  border: '1px solid var(--dsw-alias-link, rgb(65, 118, 230))',
  borderRadius: '8px',
  color: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  cursor: 'pointer',
  flex: '0 0 auto',
  font: 'inherit',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  maxWidth: '220px',
  overflow: 'hidden',
  padding: '0 6px',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** 作者/created 12/18 次文字 (created = mono date token). */
const metaStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  whiteSpace: 'nowrap',
} as const

const createdStyle = {
  ...metaStyle,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const

/** The visually-hidden live region (the prototype's flow-live twin). */
const liveStyle = {
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const

/** The sort menu card (r20 — ui-design 菜单卡, the ToolbarMenu twin). */
const menuStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
  display: 'flex',
  flexDirection: 'column',
  padding: '4px',
  position: 'absolute',
  right: '0',
  top: 'calc(100% + 4px)',
  zIndex: 200,
} as const

/** The sort menu's trigger + rows (sm ghost — the toolbar control twin). */
const controlButtonStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'var(--dsw-alias-label-primary, inherit)',
  cursor: 'pointer',
  flex: '0 0 auto',
  font: 'inherit',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '4px 12px',
} as const

const menuItemStyle = {
  ...controlButtonStyle,
  borderColor: 'transparent',
  textAlign: 'left',
  whiteSpace: 'nowrap',
} as const

const SORT_LABEL_KEYS: Record<ProposalSortKey, WorkbenchKey> = {
  created: 'proposals.sort.created',
  slug: 'proposals.sort.slug',
  status: 'proposals.sort.status',
}

/**
 * The 排序 menu (the TaskToolbar.ToolbarMenu contract small): trigger with
 * aria-haspopup, arrow/Escape/Tab keyboard handling, outside-mousedown close.
 */
function SortMenu(props: {
  t: ProposalTranslate
  sort: ProposalSortKey
  onSortChange: (sort: ProposalSortKey) => void
}) {
  const { t, sort, onSortChange } = props
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onDocumentMouseDown = (event: MouseEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    return () => { document.removeEventListener('mousedown', onDocumentMouseDown) }
  }, [open])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    } else if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      const current = items.findIndex(element => element === document.activeElement)
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(current + step + items.length) % items.length]?.focus()
    }
  }

  return (
    <div ref={wrapRef} style={{ marginLeft: 'auto', position: 'relative' }} onKeyDown={onKeyDown}>
      <ChromeButton
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        data-dsh-forge-menu-trigger="proposal-sort"
        style={controlButtonStyle}
        onClick={() => { setOpen(!open) }}
      >
        {`${t('proposals.sort.label')}: ${t(SORT_LABEL_KEYS[sort])}`}
        <span aria-hidden="true"> ▾</span>
      </ChromeButton>
      {open && (
        <div ref={menuRef} role="menu" aria-label={t('proposals.sort.label')} style={menuStyle}>
          {SORT_KEYS.map(key => (
            <ChromeButton
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={sort === key ? 'true' : 'false'}
              data-dsh-forge-proposal-sort={key}
              style={menuItemStyle}
              onClick={() => {
                onSortChange(key)
                setOpen(false)
                triggerRef.current?.focus()
              }}
            >
              <span aria-hidden="true" style={{ visibility: sort === key ? 'visible' : 'hidden' }}>✓ </span>
              {t(SORT_LABEL_KEYS[key])}
            </ChromeButton>
          ))}
        </div>
      )}
    </div>
  )
}

/** Sort one board copy by the active key (ties → the kernel baseline index). */
function sortProposals(rows: readonly ProposalSummary[], sort: ProposalSortKey): readonly ProposalSummary[] {
  const baseline = new Map(rows.map((row, index) => [row.slug, index]))
  const sorted = [...rows]
  if (sort === 'slug') {
    sorted.sort((a, b) =>
      a.slug.localeCompare(b.slug)
      || (baseline.get(a.slug) ?? 0) - (baseline.get(b.slug) ?? 0))
  } else if (sort === 'status') {
    const rank = (status: string): number => {
      const index = (PROPOSAL_STATUSES as readonly string[]).indexOf(status)
      return index === -1 ? PROPOSAL_STATUSES.length : index
    }
    sorted.sort((a, b) =>
      rank(a.status) - rank(b.status)
      || (baseline.get(a.slug) ?? 0) - (baseline.get(b.slug) ?? 0))
  }
  // 'created' = the kernel's own baseline order verbatim (created 倒序).
  return sorted
}

/**
 * The proposal list view. Renders nothing but the skeleton until the first
 * loadBoard settles; a failed first load shows the error card + retry.
 */
export function ProposalList(props: ProposalListProps) {
  const t = props.t
  // Build-stage default face: one isolated mock twin per mount (the 5.5
  // assembly spreads the IPC-backed members over it).
  const [defaultFace] = useState(() => createMockProposalsFace())
  const face: ProposalFace = { ...defaultFace, ...props.face }
  const faceRef = useRef(face)
  faceRef.current = face

  const [phase, setPhase] = useState<'loading' | 'ready' | 'load-error'>('loading')
  const [board, setBoard] = useState<ProposalBoardData | undefined>(undefined)
  const [sort, setSort] = useState<ProposalSortKey>('created')
  const [flowSlugs, setFlowSlugs] = useState<ReadonlySet<string>>(new Set())
  const [announcement, setAnnouncement] = useState<string | undefined>(undefined)
  const hasLoaded = useRef(false)
  const boardRef = useRef<ProposalBoardData | undefined>(undefined)
  boardRef.current = board
  const projectIdRef = useRef(props.projectId)
  projectIdRef.current = props.projectId
  const flowTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])

  const load = async (): Promise<void> => {
    try {
      const next = await faceRef.current.loadBoard(projectIdRef.current ?? '')
      hasLoaded.current = true
      setBoard(next)
      setPhase('ready')
    } catch {
      // A failed FIRST load has nothing to render — the retry card; a failed
      // refresh keeps the last good board (不打断).
      if (!hasLoaded.current) setPhase('load-error')
    }
  }

  // Initial load + the project-switch reload: a projectId change is a FRESH
  // board session (the FeaturesPage discipline).
  useEffect(() => {
    hasLoaded.current = false
    setBoard(undefined)
    setPhase('loading')
    void load()
    // The face identity is fixed for the component's life (the page precedents).
  }, [props.projectId])

  // The 回流 channel (AC4): project-scoped `sync` pushes re-fire the board
  // verb; the loaded board stays rendered while the re-read is in flight.
  // NEW/status-changed rows take the transient flow mark + ONE aggregated
  // polite announcement. Foreign projects never reload this board.
  useEffect(() => {
    const subscribe = faceRef.current.subscribeEvents
    if (subscribe === undefined) return
    return subscribe((events) => {
      const mine = projectIdRef.current === undefined
        || events.some(event => event.type === 'sync' && event.projectId === projectIdRef.current)
      if (!mine) return
      void (async () => {
        const previous = boardRef.current
        try {
          const next = await faceRef.current.loadBoard(projectIdRef.current ?? '')
          hasLoaded.current = true
          setBoard(next)
          setPhase('ready')
          if (previous !== undefined) {
            const prevBySlug = new Map(previous.proposals.map(row => [row.slug, row]))
            const changed = next.proposals
              .filter(row => {
                const prev = prevBySlug.get(row.slug)
                return prev === undefined || prev.status !== row.status || prev.updatedAt !== row.updatedAt
              })
              .map(row => row.slug)
            if (changed.length > 0) {
              setFlowSlugs(new Set(changed))
              setAnnouncement(fillTemplate(t('proposals.updated.announce'), { count: String(changed.length) }))
              for (const timer of flowTimers.current) clearTimeout(timer)
              flowTimers.current = [setTimeout(() => {
                setFlowSlugs(new Set())
                setAnnouncement(undefined)
              }, FLOW_MARK_MS)]
            }
          }
        } catch {
          // A failed refresh keeps the last good board (the sync-retry path).
        }
      })()
    })
    // Subscribe once for the component's life (the board page precedent).
  }, [])

  // Unmount hygiene: drop the in-flight flow timers.
  useEffect(() => () => {
    for (const timer of flowTimers.current) clearTimeout(timer)
  }, [])

  const rows = useMemo(
    () => board === undefined ? [] : sortProposals(board.proposals, sort),
    [board, sort],
  )

  const openProposal = (slug: string): void => { props.onOpenProposal?.(slug) }

  const onRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, slug: string): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openProposal(slug)
    }
  }

  return (
    <div data-dsh-forge-proposal-board="" aria-busy={phase === 'loading' ? 'true' : 'false'} style={rootStyle}>
      {props.docsLost === true && (
        <div data-dsh-forge-proposal-lost="" role="alert" style={lostCardStyle}>
          <h3 style={cardTitleStyle}>{t('proposals.lost.title')}</h3>
          <p style={cardBodyStyle}>{t('proposals.lost.body')}</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ChromeButton
              type="button"
              data-dsh-forge-proposal-lost-repoint=""
              style={primaryButtonStyle}
              onClick={() => { props.onRepoint?.() }}
            >
              {t('proposals.lost.repoint')}
            </ChromeButton>
            <ChromeButton
              type="button"
              data-dsh-forge-proposal-lost-remove=""
              style={ghostButtonStyle}
              onClick={() => { props.onRemove?.() }}
            >
              {t('proposals.lost.remove')}
            </ChromeButton>
          </div>
        </div>
      )}

      {props.docsLost !== true && phase === 'loading' && (
        <div
          role="status"
          aria-label={t('proposals.loading')}
          data-dsh-forge-proposal-skeleton=""
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          {[0, 1, 2, 3].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
        </div>
      )}

      {props.docsLost !== true && phase === 'load-error' && (
        <div data-dsh-forge-proposal-error="" role="alert" style={errorCardStyle}>
          <h3 style={cardTitleStyle}>{t('proposals.loadError.title')}</h3>
          <div>
            <ChromeButton
              type="button"
              data-dsh-forge-proposal-retry=""
              style={primaryButtonStyle}
              onClick={() => {
                setPhase('loading')
                void load()
              }}
            >
              {t('proposals.loadError.retry')}
            </ChromeButton>
          </div>
        </div>
      )}

      {props.docsLost !== true && phase === 'ready' && board !== undefined && board.proposals.length === 0 && (
        <div data-dsh-forge-proposal-empty="" style={emptyCardStyle}>
          <h3 style={cardTitleStyle}>{t('proposals.empty.title')}</h3>
          <p style={cardBodyStyle}>{t('proposals.empty.body')}</p>
          <span data-dsh-forge-proposal-root="" title={board.proposalsRoot} style={monoPathStyle}>
            {board.proposalsRoot}
          </span>
        </div>
      )}

      {props.docsLost !== true && phase === 'ready' && board !== undefined && board.proposals.length > 0 && (
        <>
          <div data-dsh-forge-proposal-toolbar="" style={toolbarStyle}>
            <h3 style={toolbarTitleStyle}>{t('proposals.title')}</h3>
            <span style={toolbarHintStyle}>{t('proposals.readonly')}</span>
            <SortMenu t={t} sort={sort} onSortChange={setSort} />
          </div>
          <div data-dsh-forge-proposal-rows="" role="list" aria-label={t('proposals.title')} style={listCardStyle}>
            {rows.map(row => {
              const flowing = flowSlugs.has(row.slug)
              return (
                <div
                  key={row.slug}
                  role="listitem"
                  tabIndex={0}
                  data-dsh-forge-proposal-row={row.slug}
                  data-dsh-forge-proposal-flow={flowing ? '' : undefined}
                  aria-label={fillTemplate(t('proposals.row.openDetail'), {
                    slug: row.slug,
                    status: proposalStatusLabel(row.status, t),
                    author: row.author ?? '—',
                    created: row.created ?? '',
                  })}
                  style={{
                    ...rowStyle,
                    transition: FLOW_TRANSITION,
                    ...(flowing ? { backgroundColor: FLOW_BACKGROUND } : {}),
                  }}
                  onClick={() => { openProposal(row.slug) }}
                  onKeyDown={event => { onRowKeyDown(event, row.slug) }}
                >
                  <ProposalStatusPill status={row.status} t={t} />
                  <span title={row.slug} style={slugStyle}>{row.slug}</span>
                  {row.featureSlug !== null && (
                    <ChromeButton
                      type="button"
                      data-dsh-forge-proposal-feature-jump={row.featureSlug}
                      aria-label={fillTemplate(t('proposals.row.featureJump'), { slug: row.featureSlug })}
                      title={row.featureSlug}
                      style={featureBadgeStyle}
                      onClick={event => {
                        event.stopPropagation()
                        props.onOpenFeature?.(row.featureSlug ?? '')
                      }}
                      onKeyDown={event => {
                        // The badge owns Enter/Space itself (jsdom fires no
                        // synthetic click) and never leaks them to the row.
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          event.stopPropagation()
                          props.onOpenFeature?.(row.featureSlug ?? '')
                        }
                      }}
                    >
                      {`→ ${row.featureSlug}`}
                    </ChromeButton>
                  )}
                  <span style={metaStyle}>{row.author ?? '—'}</span>
                  <span title={row.created ?? undefined} style={createdStyle}>{row.created ?? ''}</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      <span aria-live="polite" data-dsh-forge-proposal-live="" style={liveStyle}>{announcement ?? ''}</span>
    </div>
  )
}
