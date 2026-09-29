/**
 * The 项目概览 → feature sub-tab (M4 task 2.3, layout §4.4②): the M3 feature
 * 浏览面 re-homed into the pane as the DIRECTORY TREE the wireframe pins —
 * 隐藏 docs/features/ 前缀,直接从 slug 起, one expandable dir row per
 * feature carrying the manifest status VERBATIM + the done/total counters
 * (`in-progress 12/41`), with the feature's EXISTING doc kinds as file rows
 * whose click opens the DOC tab (§4.5; the kind 2.4 owns — the openTab seam
 * carries the identity today).
 *
 * 零缩水 discipline (Hard Rule): the M3 face's vocabulary rides VERBATIM —
 * featureStatusLabel (the manifest 词表直透, hyphen intact), docKindLabel +
 * FEATURE_DOC_KINDS order (the 文档 tab's canonical order, missing kinds
 * absent because the DTO lists only EXISTING kinds), and the DeviationBadge
 * the M3 FeatureCard renders (deviation stays visible in the pane). The
 * board load itself is OWNED by OverviewTab (the 概要信息区 shares it — one
 * read, header + pane); the pane renders the four states against that load.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { FeatureBoardData } from '../../../ipc-types'
import type { WorkbenchKey } from '../../../locale/en'
import { FEATURE_DOC_KINDS, docKindLabel, featureStatusLabel } from '../../../i18n/feature-status'
import { fillTemplate } from '../../overview/format'
import { DeviationBadge } from '../../features/stages/DeviationBadge'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import type { DocOpenInput } from '../OverviewTab'

/** The board's load phase (OverviewTab owns the read; the pane renders it). */
export type FeatureBoardPhase = 'loading' | 'ready' | 'load-error'

/** Inputs of {@link FeaturesPane}. */
export interface FeaturesPaneProps {
  /** The locale seat (the plugin's bound `t`). */
  t: (key: WorkbenchKey) => string
  /** The feature board (the shared read); undefined while loading. */
  board: FeatureBoardData | undefined
  /** The shared read's phase (loading 骨架 / load-error 重试卡 / ready). */
  phase: FeatureBoardPhase
  /** The shared read's retry seam (the error card's CTA). */
  onRetry: () => void
  /** The 点文档名开文档 tab seam (§4.5 — 2.4 owns the tab's interior). */
  onOpenDoc: (input: DocOpenInput) => void
  /**
   * The 互跳 focus (the 提案 pane's feature chip): switching here EXPANDS the
   * named feature's dir — the M3 badge-jump's pane form.
   */
  focusSlug?: string | undefined
}

/** The tree's column (the pane family's shared geometry). */
const rootStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
  padding: '10px 8px',
} as const

/** One tree row (dir or file) — the ProposalsPane twin. */
const rowStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  font: 'inherit',
  gap: '6px',
  minWidth: 0,
  padding: '6px 6px',
  textAlign: 'left',
} as const

/** The slug slot: 13/20 mono, 单行截断. */
const slugStyle = {
  flex: '1 1 auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '13px',
  lineHeight: '20px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** The file-name slot: 13/20 mono (the artifact 代码栈 treatment). */
const fileNameStyle = { ...slugStyle } as const

/** The dir's status + counters pill (12/18 capsule, nowrap). */
const statusStyle = {
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '8px',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0 6px',
  whiteSpace: 'nowrap',
} as const

const trailingStyle = {
  color: 'var(--dsw-alias-label-tertiary, rgb(129, 133, 140))',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  whiteSpace: 'nowrap',
} as const

const FILE_INDENT = '22px'

/** Shared card face for the non-data states (the M3 board page precedent). */
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

const cardTitleStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
} as const

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

const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '28px',
} as const

const auxStyle = {
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
  padding: '8px 6px',
} as const

/**
 * The feature directory tree. The FIRST dir rides expanded on a fresh board;
 * the 提案 pane's 互跳 EXPANDS its target (focusSlug, once per arrival).
 */
export function FeaturesPane(props: FeaturesPaneProps): ReactNode {
  const t = props.t
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [seeded, setSeeded] = useState(false)

  // A settled fresh board seeds the FIRST dir (the §4.4② wireframe's ▾ row);
  // a reflux refresh keeps the user's set (the ProposalsPane twin). A project
  // switch is a NEW mount (the host re-keys the tab per project).
  useEffect(() => {
    if (props.phase !== 'ready' || props.board === undefined || seeded) return
    setSeeded(true)
    setExpanded(props.board.features.length > 0 ? new Set([props.board.features[0]!.slug]) : new Set())
  }, [props.phase, props.board, seeded])

  // The 互跳 focus: expand the named feature once per arrival (the same slug
  // jumping twice re-expands only if the user collapsed it in between).
  useEffect(() => {
    if (props.focusSlug === undefined) return
    setExpanded(previous => (previous.has(props.focusSlug ?? '') ? previous : new Set([...previous, props.focusSlug ?? ''])))
  }, [props.focusSlug])

  const toggleDir = (slug: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  return (
    <div data-dsh-forge-overview-features="" style={rootStyle}>
      {props.phase === 'loading' && (
        <div role="status" aria-label={t('features.loading')} data-dsh-forge-overview-features-skeleton="">
          {[0, 1, 2].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
        </div>
      )}

      {props.phase === 'load-error' && (
        <div data-dsh-forge-overview-features-error="" role="alert" style={errorCardStyle}>
          <h3 style={cardTitleStyle}>{t('features.loadError.title')}</h3>
          <div>
            <ChromeButton
              type="button"
              data-dsh-forge-overview-features-retry=""
              style={primaryButtonStyle}
              onClick={props.onRetry}
            >
              {t('features.loadError.retry')}
            </ChromeButton>
          </div>
        </div>
      )}

      {props.phase === 'ready' && props.board !== undefined && props.board.features.length === 0 && (
        <p data-dsh-forge-overview-features-empty="" style={auxStyle}>{t('features.empty.title')}</p>
      )}

      {props.phase === 'ready' && props.board !== undefined && props.board.features.map((feature) => {
        const open = expanded.has(feature.slug)
        // 词表直透 + the DTO's OWN counters (never recomputed — the M3 card's
        // judgment discipline); `in-progress 12/41` is the wireframe's form.
        const statusText = `${featureStatusLabel(feature.status, t)} ${fillTemplate(t('features.progress'), {
          completed: String(feature.taskCompleted),
          total: String(feature.taskTotal),
        })}`
        return (
          <div key={feature.slug} data-dsh-forge-overview-feature-dir-group={feature.slug}>
            <button
              type="button"
              data-dsh-forge-overview-feature-dir={feature.slug}
              aria-expanded={open ? 'true' : 'false'}
              style={rowStyle}
              onClick={() => { toggleDir(feature.slug) }}
            >
              <span aria-hidden="true" style={{ flex: '0 0 auto', fontSize: '10px' }}>{open ? '▾' : '▸'}</span>
              <span title={feature.slug} style={slugStyle}>{`${feature.slug}/`}</span>
              <span data-dsh-forge-overview-feature-status={feature.slug} title={statusText} style={statusStyle}>
                {statusText}
              </span>
              <DeviationBadge t={t} deviated={feature.deviated} />
            </button>
            {open && (
              <div role="group" aria-label={feature.slug} style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: FILE_INDENT }}>
                {/* CANONICAL doc-kind order (the M3 文档 tab's); the DTO lists
                    only the kinds that EXIST — a missing kind is absent, the
                    M3 disabled-tab matrix's pane form. */}
                {FEATURE_DOC_KINDS.filter(kind => feature.docKinds.includes(kind)).map((kind) => {
                  const label = docKindLabel(kind, t)
                  return (
                    <button
                      key={kind}
                      type="button"
                      data-dsh-forge-overview-doc={`features/${feature.slug}/${kind}`}
                      title={t('rightbar.overview.doc.open')}
                      style={rowStyle}
                      onClick={() => {
                        props.onOpenDoc({
                          path: `docs/features/${feature.slug}/${kind}`,
                          displayName: `${feature.slug}/${label}`,
                        })
                      }}
                    >
                      <span title={label} style={fileNameStyle}>{label}</span>
                      <span aria-hidden="true" style={trailingStyle}>⟶ {t('rightbar.overview.doc.open')}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
