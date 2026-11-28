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
// 1.2 增强（overview-dockkit-alignment）：文档区目录列举——spec.md 本体行保留既有文档入口，
// 其余条目逐行呈现（文件行：文件名 + 格式 tag + 查看入口；子目录行：目录 tag、无查看入口
// ——listDir 契约扩展后混合入列，经 DirEntry.kind 分流）。数据源 = forgeDirs.facts workspaceRoot
// 锚定 + forgeFs.listDir 列 relPath 所在目录（既有 @Remote 零新端点）；列举失败 = fail-soft
// 单行降级 + diag 留痕（不阻断元数据区渲染）。查看通道官方唯一径（2.8 用户裁决
// 2026-11-24：文档打开沿用官方渠道）：文档行/目录列举文件点击 = onOpenDoc → 官方
// documentpreview（ctx.sidebarRight.openResource + sessionFileAddress——内置 markdown/
// html/文本/图片/pdf/office 渲染，按后缀自动选渲染器）；全部文件同一通道，无分流降级。
// ⚠ forgeFs 键归属与 f5 联动声明（判定留痕）：目录锚定用 forgeDirs.facts 的 workspaceRoot
// ——主根项目形态下 .forge/specs 归主根；worktree 检出形态的同构错位（主根 vs worktree
// .forge 归属）归 f5-task-key-family 聚合修口，本任务只做联动声明不重复修。
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { DirListing } from '@dsh-forge/lib-api/dto/fs'
import { Tag, Tooltip, StateDot, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState, ErrorBar, isoTimeLabelZh } from '../../components.js'
import { createForgeRpcClient, forgeDiagEmit, type ForgeRpcClient, type SpecCardDto, type SpecDetailDto } from '../../rpc.js'
import { overviewSpecsRpcFactory } from './overview-client.js'
import {
  SPEC_FILE_FORMAT_LABELS,
  absSpecDirOf,
  hasActiveStatusFilter,
  isChipDisabled,
  joinSpecFileRel,
  searchQueryOf,
  specDocDirOf,
  specFileFormatOf,
  specForgeDocRelOf,
} from './overview-model.js'
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
  /** 目录列举/根锚定消费切片（forgeFs.listDir + forgeDirs.facts——缺省 ui rpc 真身；注入 = 测试面） */
  readonly makeRpc?: () => Pick<ForgeRpcClient, 'fs' | 'dirs'>
  /** 相对时间基准（缺省 Date.now()——测试注入固定值） */
  readonly now?: number
}

/** spec 目录列举态（单文件区——fail-soft 三支：在途/降级/条目集） */
type SpecDirListState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ok'; readonly entries: readonly { readonly name: string; readonly rel: string; readonly kind?: 'dir' | 'file' }[] }

/**
 * spec 子 tab（进入 tab 拉取——本组件仅 spec 子 tab 激活期挂载，子 tab 切换卸载即清态；
 * 搜索/手动刷新 = nonce 重取；详情按行展开按需装载并按 slug 缓存）。
 */
export function SpecTab({ projectId, search, onOpenDoc, onStartSession, makeSpecsClient = overviewSpecsRpcFactory, makeRpc = () => createForgeRpcClient(), now }: SpecTabProps): ReactNode {
  const at = now ?? Date.now()
  const [load, setLoad] = useState<{ kind: 'loading' } | { kind: 'ready'; cards: readonly SpecCardDto[] } | { kind: 'error'; message: string }>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [nonce, setNonce] = useState(0)
  const [activeStatuses, setActiveStatuses] = useState<ReadonlySet<SpecStatus>>(new Set())
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set())
  const [details, setDetails] = useState<ReadonlyMap<string, SpecDetailDto>>(new Map())
  const [dirLists, setDirLists] = useState<ReadonlyMap<string, SpecDirListState>>(new Map())
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

  // 文档区目录列举（1.2——detail.doc 在场且非悬空触发；forgeDirs.facts workspaceRoot 锚定 +
  // forgeFs.listDir 列 relPath 所在目录；失败 fail-soft 单行降级 + diag 留痕，不阻断元数据区）
  // 读取路径闭环（评审 D 观察②判定留痕）：列举与读取同源——forgeDirs.facts workspaceRoot 是
  // forgeDir（= workspaceRoot/.forge）派生单源（host self-anchors joinDirSegment 链），
  // docs.read 守卫基准 canonical(forge_dir)（可达 realpath / 不可达词法 resolve）与
  // listDir 入参 resolve(workspaceRoot)/… 在 worktree 检出形态（真实目录、零 junction）
  // 下逐点重合：读 = resolve(canonical(forge_dir), docRel)，列 = resolve(workspaceRoot, dirRel)
  // 同一 .forge 子树——读写同源成立。dev junction 形态（realpath ≠ 词法）不在取证范围。
  useEffect(() => {
    if (load.kind !== 'ready') return
    const client = makeRpc()
    for (const slug of openRows) {
      const doc = details.get(slug)?.doc
      if (doc === undefined || doc.dangling || dirLists.has(slug)) continue
      setDirLists((prev) => new Map(prev).set(slug, { kind: 'loading' as const }))
      const dirRel = specDocDirOf(doc.relPath)
      void (async () => {
        const facts = await client.dirs.facts(projectId)
        const root = facts.find((row) => row.dirKey === 'workspaceRoot')?.dir ?? null
        if (root === null) throw new Error('workspaceRoot 解析缺席')
        return await client.fs.listDir(absSpecDirOf(root, dirRel))
      })()
        .then((listing: DirListing) => {
          const docBase = doc.relPath.replaceAll('\\', '/').split('/').pop() ?? ''
          const entries = listing.entries
            .filter((entry) => entry.name !== docBase && entry.name !== 'spec.md')
            .map((entry) => ({ name: entry.name, rel: joinSpecFileRel(dirRel, entry.name), kind: entry.kind }))
          setDirLists((prev) => new Map(prev).set(slug, { kind: 'ok' as const, entries }))
        })
        .catch((cause: unknown) => {
          const message = cause instanceof Error ? cause.message : String(cause)
          forgeDiagEmit(`[spec-tab] spec 目录列举失败（slug=${slug}）——单行降级：${message}`)
          setDirLists((prev) => new Map(prev).set(slug, { kind: 'error' as const, message }))
        })
    }
  }, [load, openRows, details, dirLists, projectId, makeRpc])

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
                            onOpenDoc?.(specForgeDocRelOf(detail.doc!.relPath))
                          }}
                        >
                          {`📄 ${detail.doc.relPath}${detail.doc.dangling ? '（悬空）' : ''}`}
                        </button>
                      )}
                    </div>
                    {/* 其余文件逐行呈现（1.2——spec.md 本体行保留既有入口不重复；格式分流查看通道） */}
                    {detail?.doc !== undefined && !detail.doc.dangling && dirLists.has(card.slug) ? (
                      <div className="dswf-ov-meta-row" data-dswf-ov-spec-files={card.slug}>
                        <span className="dswf-ov-meta-k">文件</span>
                        <span className="dswf-ov-meta-v" data-dswf-ov-spec-files-list="">
                          {(() => {
                            const files = dirLists.get(card.slug)!
                            if (files.kind === 'loading') return '…'
                            if (files.kind === 'error') return '目录列举失败（降级呈现）'
                            if (files.entries.length === 0) return '—'
                            return files.entries.map((entry) => {
                              const isDir = entry.kind === 'dir'
                              const fmt = specFileFormatOf(entry.name)
                              return (
                                <span className="dswf-ov-spec-file" key={entry.rel} data-dswf-ov-spec-file={entry.rel}>
                                  <span className="dswf-ov-spec-file-name">{entry.name}</span>
                                  {/* 类型 tag：文件 = 格式 tag（既有口径）；子目录 = 目录 tag（无查看入口）。
                                      文件查看入口不分流——全部走 onOpenDoc（官方渠道按后缀选渲染器） */}
                                  {isDir ? (
                                    <Tag tone="neutral">目录</Tag>
                                  ) : (
                                    <Tag tone="neutral">{SPEC_FILE_FORMAT_LABELS[fmt]}</Tag>
                                  )}
                                  {isDir ? null : (
                                    <button
                                      type="button"
                                      className="dswf-ov-act"
                                      data-dswf-ov-spec-file-open={entry.rel}
                                      onClick={() => {
                                        onOpenDoc?.(specForgeDocRelOf(entry.rel))
                                      }}
                                    >
                                      查看
                                    </button>
                                  )}
                                </span>
                              )
                            })
                          })()}
                        </span>
                      </div>
                    ) : null}
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
