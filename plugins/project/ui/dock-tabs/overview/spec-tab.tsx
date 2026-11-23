// G3 spec 子 tab 本体（overview-dockkit-alignment——对齐 apps/web 提案子 tab 形态）：
// 状态 chips 行（六态中文：草稿/送审中/已批准/进行中/待验收/已完成）+ 列表行（标题 +
// 状态 tag + 打开入口[打开新会话——onStartSession 缺席 = 不呈现，降级安全]）+ 行展开元数据
// （标识 slug / 档位 tiers / Goal·AC 计数 / 更新时间 / 文档区[detail 按需装载——doc 悬空态
// 呈现]）。SpecCardDto 字段面消费——mode/谱系/作者无等价物不映射（spec 裁定留痕）。
// 数据源 = forgeSpecs Typert namespace（overviewSpecsRpcFactory 单门——rpc.ts specs 切片）。
// 失败两支分开（spec AC）：typed 拒绝（spec 插件缺席 = namespace/方法缺席）→ 错误条 +
// emitDiag 面（forgeDiagEmit）error 留痕；身份未解析（host 半 ws null = ok([])）→ 静默
// 空态 + info 留痕。刷新 = 进入 tab 拉取（本组件仅在 spec 子 tab 激活时挂载——卸载即清态）
// + 搜索/手动刷新重取；⚠ 无 spec-changed 事件缝（forge:events 仅 tasks-changed——已核销
// rpc-channels 订阅面）→ spec 数据变更无推送重取，以手动刷新按钮兜底（声明注释即本段）。
// chips 过滤 = 客户端承载（forgeSpecs/list statusFilter 为单值参，多选并集不可表达——
// 提案域同款差异，非漂移）；搜索 = 服务端承载（list search 参透传——Hard Rule）。
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Tag, Tooltip, StateDot, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState, ErrorBar, isoTimeLabelZh } from '../../components.js'
import { forgeDiagEmit, type SpecCardDto, type SpecDetailDto } from '../../rpc.js'
import { overviewSpecsRpcFactory } from './overview-client.js'
import { hasActiveStatusFilter, isChipDisabled, searchQueryOf } from './overview-model.js'
import type { SessionOpenRequest } from './message-format.js'
import './overview.css'

/** Spec 六态值域（形状权威 = plugins/spec status-machines SPEC_STATES——行序 = 生命周期序） */
export const SPEC_STATUSES = [
  'draft',
  'awaiting_approval',
  'approved',
  'in_progress',
  'awaiting_acceptance',
  'completed',
] as const

export type SpecStatus = (typeof SPEC_STATUSES)[number]

/** 六态中文标签（spec AC 词汇：草稿/送审中/已批准/进行中/待验收/已完成） */
export const SPEC_STATUS_LABELS: Readonly<Record<SpecStatus, string>> = {
  draft: '草稿',
  awaiting_approval: '送审中',
  approved: '已批准',
  in_progress: '进行中',
  awaiting_acceptance: '待验收',
  completed: '已完成',
}

/** 状态 → 官方 StateDot 语义（官方无蓝/紫令牌——中性三档映射，提案子 tab 同款取舍） */
export const SPEC_STATUS_DOT: Readonly<Record<SpecStatus, 'idle' | 'warning' | 'ongoing' | 'done'>> = {
  draft: 'idle',
  awaiting_approval: 'warning',
  approved: 'done',
  in_progress: 'ongoing',
  awaiting_acceptance: 'warning',
  completed: 'done',
}

/** 状态 → 官方 Tag tone（行状态 tag 着色单源；spec 域零 danger 语义） */
export const SPEC_STATUS_TAG_TONE: Readonly<Record<SpecStatus, TagTone>> = {
  draft: 'neutral',
  awaiting_approval: 'info',
  approved: 'success',
  in_progress: 'neutral',
  awaiting_acceptance: 'info',
  completed: 'success',
}

/** 六态计数（无参全量行投影——chips 计数单源，不随搜索/过滤漂移） */
export function specStatusCounts(cards: readonly SpecCardDto[]): Record<SpecStatus, number> {
  const counts: Record<SpecStatus, number> = { draft: 0, awaiting_approval: 0, approved: 0, in_progress: 0, awaiting_acceptance: 0, completed: 0 }
  for (const card of cards) {
    const status = card.specStatus as SpecStatus
    if (status in counts) counts[status] += 1
  }
  return counts
}

/** 多选并集过滤（激活集空 = 全部；forgeSpecs/list statusFilter 单值参 → 客户端承载——见头注） */
export function filterSpecsByStatuses(cards: readonly SpecCardDto[], active: ReadonlySet<SpecStatus>): readonly SpecCardDto[] {
  if (active.size === 0) return cards
  return cards.filter((card) => active.has(card.specStatus as SpecStatus))
}

/** 展开元数据行集（纯投影——静态可测）：标识/档位/Goal·AC 计数/更新时间 + 文档区（detail 缺席 = 装载中） */
export function specMetaRows(card: SpecCardDto, now: number): readonly { readonly label: string; readonly value: string }[] {
  return [
    { label: '标识', value: card.slug },
    { label: '档位', value: card.tiers.length > 0 ? card.tiers.join('/') : '—' },
    { label: 'Goal·AC', value: `${card.goalCount} · ${card.acCount}` },
    { label: '更新', value: isoTimeLabelZh(card.updatedAt, now) },
  ]
}

/** 打开新会话预填（spec 渠道——无 mode 切换、不自动发送；现状上下文 = 标题 + slug + 状态） */
export function specSessionRequest(card: SpecCardDto): SessionOpenRequest {
  return {
    prefill: `spec：${card.title || card.slug}（${card.slug}）\n状态：${SPEC_STATUS_LABELS[card.specStatus as SpecStatus] ?? card.specStatus}\n我的意图：`,
  }
}

export interface SpecStatusChipsProps {
  readonly counts: Readonly<Record<SpecStatus, number>>
  readonly active: ReadonlySet<SpecStatus>
  readonly onToggle: (status: SpecStatus) => void
  readonly onClear?: () => void
  /** 手动刷新（无 spec-changed 事件缝的兜底入口——缺席 = 无刷新面） */
  readonly onRefresh?: () => void
  /** 刷新在途标注 */
  readonly busy?: boolean
}

/** 六态 chips 行（复用任务 chips dswf-ov-stchips 同族 CSS——锚独立 data-dswf-ov-spchip） */
export function SpecStatusChips({ counts, active, onToggle, onClear, onRefresh, busy }: SpecStatusChipsProps): ReactNode {
  const hasFilter = hasActiveStatusFilter(active)
  return (
    <div className="dswf-ov-stchips" role="group" aria-label="spec 状态过滤" data-dswf-ov-spchips="">
      {SPEC_STATUSES.map((status) => {
        const count = counts[status] ?? 0
        const disabled = isChipDisabled(count)
        const on = active.has(status)
        const cls = ['dswf-ov-stchip', on ? 'is-on' : '', disabled ? 'is-zero' : ''].filter(Boolean).join(' ')
        return (
          <button
            key={status}
            type="button"
            className={cls}
            data-dswf-ov-spchip={status}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => {
              onToggle(status)
            }}
          >
            <StateDot state={SPEC_STATUS_DOT[status]} size={8} />
            <span className="dswf-ov-stchip-label">{SPEC_STATUS_LABELS[status]}</span>
            <span className="dswf-ov-stchip-count">{count}</span>
          </button>
        )
      })}
      {hasFilter && onClear !== undefined ? (
        <button
          type="button"
          className="dswf-ov-stchip dswf-ov-stchip-clear"
          data-dswf-ov-spchip-clear=""
          onClick={onClear}
        >
          ✕ 重置
        </button>
      ) : null}
      {onRefresh !== undefined ? (
        // 无 spec-changed 事件缝——手动刷新兜底入口（头注声明）
        <button
          type="button"
          className="dswf-ov-stchip dswf-ov-stchip-clear"
          data-dswf-ov-sprefresh=""
          aria-busy={busy === true}
          onClick={onRefresh}
        >
          ⟳ 刷新
        </button>
      ) : null}
    </div>
  )
}

export interface SpecTabProps {
  readonly projectId: string
  /** 搜索关键词原文（服务端承载——list search 参透传） */
  readonly search?: string
  /** 文档行点击（dock 开 tab——装配接线；缺席 = 文档行静态呈现） */
  readonly onOpenDoc?: (docRel: string) => void
  /** 打开新会话通道（装配注入 openSessionWithPreset——缺席 = 行头按钮不呈现，降级安全） */
  readonly onStartSession?: (request: SessionOpenRequest) => void
  /** forgeSpecs 消费切片（缺省 overviewSpecsRpcFactory 真身；注入 = 测试面） */
  readonly makeSpecsClient?: typeof overviewSpecsRpcFactory
  /** 相对时间基准（缺省 Date.now()——测试注入固定值） */
  readonly now?: number
}

/**
 * spec 子 tab（进入 tab 拉取——本组件仅 spec 子 tab 激活期挂载，子 tab 切换卸载即清态；
 * 搜索/手动刷新 = nonce 重取；详情按行展开按需装载并按 slug 缓存）。
 */
export function SpecTab({ projectId, search, onOpenDoc, onStartSession, makeSpecsClient = overviewSpecsRpcFactory, now }: SpecTabProps): ReactNode {
  const at = now ?? Date.now()
  const [load, setLoad] = useState<{ kind: 'loading' } | { kind: 'ready'; cards: readonly SpecCardDto[] } | { kind: 'error'; message: string }>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [nonce, setNonce] = useState(0)
  const [activeStatuses, setActiveStatuses] = useState<ReadonlySet<SpecStatus>>(new Set())
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set())
  const [details, setDetails] = useState<ReadonlyMap<string, SpecDetailDto>>(new Map())
  const seqRef = useRef(0)

  // 列路：mount / projectId / search / 手动刷新 nonce（序号守卫——快速切换不串台）
  useEffect(() => {
    const seq = ++seqRef.current
    const client = makeSpecsClient()
    setBusy(true)
    void client
      .list({ projectId, ...(searchQueryOf(search ?? '') !== undefined ? { search: searchQueryOf(search ?? '') } : {}) })
      .then((cards) => {
        if (seq !== seqRef.current) return
        setBusy(false)
        if (cards.length === 0) {
          // 静默空态（含 host 半身份未解析 ws null = ok([]) 径——诊断 info 留痕，UI 零错误面）
          forgeDiagEmit(`[spec-tab] forgeSpecs/list ok([])——空态呈现（projectId=${projectId}${searchQueryOf(search ?? '') !== undefined ? ` search=${search}` : ''}）`)
        }
        setLoad({ kind: 'ready', cards })
      })
      .catch((cause: unknown) => {
        if (seq !== seqRef.current) return
        setBusy(false)
        // typed 拒绝（spec 插件缺席/通道不可达）→ 错误条 + emitDiag 面 error 留痕
        const message = cause instanceof Error ? cause.message : String(cause)
        forgeDiagEmit(`[spec-tab] forgeSpecs/list typed 拒绝——错误条呈现（projectId=${projectId}）：${message}`)
        setLoad({ kind: 'error', message })
      })
  }, [projectId, search, nonce, makeSpecsClient])

  const handleToggleStatus = useCallback((status: SpecStatus): void => {
    setActiveStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }, [])
  const handleClearStatuses = useCallback((): void => {
    setActiveStatuses(new Set())
  }, [])
  const handleRefresh = useCallback((): void => {
    setNonce((n) => n + 1)
  }, [])
  const handleToggleRow = useCallback((slug: string): void => {
    setOpenRows((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }, [])

  // 详情按需装载（展开行触发——按 slug 缓存；失败 fail-soft 空 meta + emitDiag 面 warn 留痕）
  useEffect(() => {
    if (load.kind !== 'ready') return
    for (const slug of openRows) {
      if (details.has(slug)) continue
      const client = makeSpecsClient()
      void client
        .detail({ projectId, slug })
        .then((detail) => {
          setDetails((prev) => new Map(prev).set(slug, detail))
        })
        .catch((cause: unknown) => {
          forgeDiagEmit(`[spec-tab] forgeSpecs/detail 失败（slug=${slug}）：${cause instanceof Error ? cause.message : String(cause)}`)
        })
    }
  }, [load, openRows, details, projectId, makeSpecsClient])

  if (load.kind === 'error') {
    return (
      <div className="dswf-ov-proposalpage" data-dswf-ov-specpage="">
        <ErrorBar
          className="dswf-ov-error"
          message={`spec 列表装载失败：${load.message}`}
          retryClassName="dswf-ov-retry"
          onRetry={handleRefresh}
          anchor="data-dswf-ov-spec-error"
          retryAnchor="data-dswf-ov-spec-retry"
        />
      </div>
    )
  }

  if (load.kind !== 'ready') {
    return (
      <div className="dswf-ov-proposalpage" data-dswf-ov-specpage="" aria-busy="true">
        <div className="dswf-ov-empty">装载中…</div>
      </div>
    )
  }

  const counts = specStatusCounts(load.cards)
  const visible = filterSpecsByStatuses(load.cards, activeStatuses)
  const hasFilter = activeStatuses.size > 0
  return (
    <div className="dswf-ov-proposalpage" data-dswf-ov-specpage="">
      <SpecStatusChips
        counts={counts}
        active={activeStatuses}
        onToggle={handleToggleStatus}
        onClear={handleClearStatuses}
        onRefresh={handleRefresh}
        {...(busy ? { busy: true } : {})}
      />
      {visible.length === 0 ? (
        <EmptyState
          className="dswf-ov-empty"
          title={hasFilter ? '无匹配当前状态过滤的 spec' : '暂无 spec'}
          description={hasFilter ? '调整或清除过滤后重试' : 'spec 由 agent 会话经 spec 管线产生'}
        />
      ) : (
        <div className="dswf-ov-list" data-dswf-ov-specs="">
          {visible.map((card) => {
            const open = openRows.has(card.slug)
            const detail = details.get(card.slug)
            return (
              <div className="dswf-ov-item" key={card.slug}>
                <div className={open ? 'dswf-ov-parent is-open' : 'dswf-ov-parent'} data-dswf-ov-spec-parent={card.slug}>
                  <Tooltip label={card.title} portal>
                    <button
                      type="button"
                      className="dswf-ov-parent-toggle"
                      aria-expanded={open}
                      data-dswf-ov-spec-toggle={card.slug}
                      onClick={() => {
                        handleToggleRow(card.slug)
                      }}
                    >
                      <span className="dswf-ov-caret" aria-hidden="true">
                        {open ? '▾' : '▸'}
                      </span>
                      <span className="dswf-ov-parent-title">{card.title || card.slug}</span>
                    </button>
                  </Tooltip>
                  <Tag tone={SPEC_STATUS_TAG_TONE[card.specStatus as SpecStatus] ?? 'neutral'} className="dswf-ov-parent-chip">
                    {SPEC_STATUS_LABELS[card.specStatus as SpecStatus] ?? card.specStatus}
                  </Tag>
                  {onStartSession !== undefined ? (
                    <Tooltip label="打开新会话（spec 现状上下文预填·不发送）" portal>
                      <button
                        type="button"
                        className="dswf-ov-act"
                        data-dswf-ov-spec-open={card.slug}
                        onClick={() => {
                          onStartSession(specSessionRequest(card))
                        }}
                      >
                        打开新会话
                      </button>
                    </Tooltip>
                  ) : null}
                </div>
                {open ? (
                  <div className="dswf-ov-meta" data-dswf-ov-spec-meta={card.slug}>
                    {specMetaRows(card, at).map((row) => (
                      <div className="dswf-ov-meta-row" key={row.label}>
                        <span className="dswf-ov-meta-k">{row.label}</span>
                        <span className="dswf-ov-meta-v">{row.value}</span>
                      </div>
                    ))}
                    {/* 文档区（SpecDetailDto doc 悬空态现算呈现——detail 装载失败/在途 = 占位） */}
                    <div className="dswf-ov-meta-row" data-dswf-ov-spec-doc={card.slug}>
                      <span className="dswf-ov-meta-k">文档</span>
                      {detail?.doc === undefined ? (
                        <span className="dswf-ov-meta-v">{detail === undefined ? '…' : '—'}</span>
                      ) : (
                        <button
                          type="button"
                          className="dswf-ov-act"
                          data-dswf-ov-spec-doc-open={detail.doc.relPath}
                          onClick={() => {
                            onOpenDoc?.(detail.doc!.relPath)
                          }}
                        >
                          {`📄 ${detail.doc.relPath}${detail.doc.dangling ? '（悬空）' : ''}`}
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
