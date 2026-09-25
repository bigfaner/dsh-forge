/**
 * The UF2 「阶段资产」 tab body, BUILD half (task 4.3, ui-design UF2 阶段资产
 * tab / page-map「StageAssetsTab → workbench.listStageAssets」): the grouped
 * asset cards the sixth tab renders — 按阶段分组, 自旧到新 (pipeline order:
 * prd → … → completed), each card r14 · bg-layer-2 · pad 14 with a header of
 * the stage Pill + the 12/18 生成时间 and the 目标/摘要 two read-only
 * sections (page-map: `stages/<stage>.md` 只读渲染 — frontmatter goal +
 * body summary, the 4.3 content-joined verb rows).
 *
 * Hard Rules honored here:
 *   - 严格只读: the card is a plain `<div>` — no onClick, no button, no edit
 *     affordance exists anywhere in this tree;
 *   - 渲染经 MarkdownView 白名单: both prose sections render through the ONE
 *     shared read-only renderer (task 5.2 — links inert, raw HTML/script
 *     degraded to literal text, images alt-only), so 渲染区无交互元素 holds
 *     by construction, adversarial asset content included.
 *
 * Body states (ui-design States): asset-loading 骨架 / asset-error + 重试 /
 * asset-empty 「尚无阶段资产」+ 说明 / populated cards. The reflux (updating
 * 态): stage_advanced events for THIS feature (≤5s, the face's own channel)
 * re-fire the list verb; a stage card that was not in the previous set
 * enters with the 0.2s fade (data marker + opacity transition) — 不打断
 * 滚动 (no scroll reset: the list renders in place).
 *
 * Inert discipline: an absent listStageAssets member renders NOTHING (the
 * read surface has no data plane — 4.4's assembly mounts this component with
 * the IPC-backed face; tests inject the mock twin).
 */
import { useEffect, useRef, useState } from 'react'
import type { FeatureStatus } from '../../../ipc-types'
import type { StageAssetRow } from '../../../ipc-types'
import type { StageFace } from '../../../contract'
import { FEATURE_STATUS_PHASE, featureStatusLabel } from '../../../i18n/feature-status'
import type { FeatureStatusTranslate } from '../../../i18n/feature-status'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { MarkdownView } from '../../../components/common/MarkdownView'
import { formatTimestamp } from '../../overview/format'

/** Inputs of {@link StageAssetsTab}. */
export interface StageAssetsTabProps {
  /** The locale seat (the shell's `t`). */
  readonly t: FeatureStatusTranslate
  /** The active project — the listStageAssets verb argument. */
  readonly projectId?: string | undefined
  /** The feature whose stage assets are browsed. */
  readonly featureSlug: string
  /** The stage face — an absent listStageAssets member renders nothing. */
  readonly face?: Partial<StageFace> | undefined
}

/** The cards column (the tab panel's inner flow). */
const listStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: 0,
} as const

/** ui-design 阶段卡 geometry: r14 · bg-layer-2 · pad 14. */
const cardStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  minWidth: 0,
  padding: '14px',
} as const

/** The card header: stage Pill + 生成时间 (12/18 次文字). */
const cardHeadStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '8px',
  minWidth: 0,
} as const

/** 阶段 Pill (the status vocabulary's own capsule — 词表直通 label). */
const stagePillStyle = {
  borderRadius: '8px',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  color: 'var(--dsw-alias-label-primary, inherit)',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0 6px',
  whiteSpace: 'nowrap',
} as const

const metaStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  marginLeft: 'auto',
  whiteSpace: 'nowrap',
} as const

/** One prose section: the 12/18 secondary label + the MarkdownView body. */
const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
} as const

const sectionLabelStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** 空态/错误 state card (the M2 state-card shape). */
const stateCardStyle = {
  alignItems: 'flex-start',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  minWidth: 0,
} as const

const stateTitleStyle = {
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '22px',
  margin: 0,
} as const

const stateBodyStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: 0,
  maxWidth: '420px',
} as const

/** md primary pill (the retry CTA — the docs-tab precedent). */
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

/** Skeleton gray blocks (the docs-tab loading shape). */
const skeletonBlockStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '16px',
} as const

/** The entering card's fade leg: opacity 0 → 1 over 0.2s (ui-design updating 态). */
const ENTER_TRANSITION = 'opacity 0.2s ease-out'
/** How long the entering marker stays armed (transition + slack, then cleanup). */
const ENTER_MARK_MS = 240
/** The committed-start delay so the transition has an opacity-0 first paint. */
const ENTER_RISE_MS = 20

/**
 * The stage-assets tab body. Pure presentation over the verb rows — the data
 * read, reflux subscription, and enter-fade bookkeeping live here; the mount
 * (the sixth tab behind the strip) is 4.4's.
 */
export function StageAssetsTab(props: StageAssetsTabProps) {
  const listVerb = props.face?.listStageAssets
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [entries, setEntries] = useState<readonly StageAssetRow[]>([])
  const [retryNonce, setRetryNonce] = useState(0)
  // The reflux driver: stage_advanced for THIS feature re-fires the verb.
  const [refluxNonce, setRefluxNonce] = useState(0)
  // The enter-fade pair: which stage is entering, and has its first paint
  // (opacity 0) committed so the 0.2s transition runs.
  const [entering, setEntering] = useState<FeatureStatus | null>(null)
  const [risen, setRisen] = useState(false)
  const knownStagesRef = useRef<ReadonlySet<FeatureStatus> | null>(null)

  const projectIdRef = useRef(props.projectId)
  projectIdRef.current = props.projectId
  // The loaded-slug tracker: a slug switch resets the whole body (entries +
  // phase + the enter-fade baseline); a reflux/retry re-fire KEEPS the current
  // entries rendered (stale-while-revalidate — 不打断滚动, the ui-design
  // updating 态: existing cards stay, the new one fades in).
  const loadedSlugRef = useRef<string | null>(null)

  // The read (mount + slug switch + retry + reflux re-fire). The alive flag
  // drops stale resolutions (a slug switch mid-flight).
  useEffect(() => {
    if (listVerb === undefined) return
    let alive = true
    const slugChanged = loadedSlugRef.current !== props.featureSlug
    if (slugChanged) {
      loadedSlugRef.current = props.featureSlug
      knownStagesRef.current = null
      setEntries([])
      setPhase('loading')
    }
    listVerb(projectIdRef.current ?? '', props.featureSlug)
      .then((rows) => {
        if (!alive) return
        setEntries([...rows].sort((a, b) => FEATURE_STATUS_PHASE[a.stage] - FEATURE_STATUS_PHASE[b.stage]))
        setPhase('ready')
      })
      .catch(() => {
        if (!alive) return
        setPhase('error')
      })
    return () => { alive = false }
  }, [listVerb, props.featureSlug, retryNonce, refluxNonce])

  // The reflux subscription: stage_advanced matching this feature (≤5s on the
  // real chain — the batched channel) re-fires the read; the new-card enter
  // fade arms in the entries effect below. External-write reflux (提案列表同
  // 纪律):感知扫描的项目域 sync 事件同样重读 —— 外部会话新增的阶段资产
  // 须 ≤5s 呈现,无需重开面板。
  useEffect(() => {
    const subscribe = props.face?.subscribeEvents
    if (subscribe === undefined) return
    return subscribe((events) => {
      for (const event of events) {
        if (event.type === 'stage_advanced' && event.featureSlug === props.featureSlug) {
          setRefluxNonce(nonce => nonce + 1)
          continue
        }
        if (event.type === 'sync' && event.projectId === projectIdRef.current) {
          setRefluxNonce(nonce => nonce + 1)
        }
      }
    })
  }, [props.face, props.featureSlug])

  // Enter-fade bookkeeping: diff the stage set against the previous READY
  // commit's (the FIRST read completion of a slug only sets the baseline —
  // assets present at mount render in place, no fade); a stage that appears
  // in a LATER read completion (the reflux) mounts at opacity 0, rises over
  // 0.2s, then the marker clears. 不打断滚动: the column renders in place.
  useEffect(() => {
    if (phase !== 'ready') return
    const previous = knownStagesRef.current
    knownStagesRef.current = new Set(entries.map(entry => entry.stage))
    if (previous === null) return
    const fresh = entries.find(entry => !previous.has(entry.stage))
    if (fresh === undefined) return
    setEntering(fresh.stage)
    setRisen(false)
    const riser = setTimeout(() => { setRisen(true) }, ENTER_RISE_MS)
    const clearer = setTimeout(() => { setEntering(null); setRisen(false) }, ENTER_MARK_MS)
    return () => { clearTimeout(riser); clearTimeout(clearer) }
  }, [entries, phase])

  if (listVerb === undefined) return null

  return (
    <div data-dsh-forge-stage-assets="" style={listStyle}>
      {phase === 'loading' && (
        <div
          role="status"
          aria-label={props.t('features.stages.assets.loading')}
          data-dsh-forge-stage-assets-skeleton=""
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          {[0, 1, 2, 3].map(index => (
            <div
              key={index}
              aria-hidden="true"
              style={{ ...skeletonBlockStyle, width: index === 0 ? '40%' : '100%' }}
            />
          ))}
        </div>
      )}

      {phase === 'error' && (
        <div data-dsh-forge-stage-assets-error="" role="alert" style={stateCardStyle}>
          <h3 style={stateTitleStyle}>{props.t('features.stages.assets.error.title')}</h3>
          <div>
            <ChromeButton
              type="button"
              data-dsh-forge-stage-assets-retry=""
              style={primaryButtonStyle}
              onClick={() => { setRetryNonce(nonce => nonce + 1) }}
            >
              {props.t('features.stages.assets.error.retry')}
            </ChromeButton>
          </div>
        </div>
      )}

      {phase === 'ready' && entries.length === 0 && (
        <div data-dsh-forge-stage-assets-empty="" style={stateCardStyle}>
          <h3 style={stateTitleStyle}>{props.t('features.stages.assets.empty.title')}</h3>
          <p style={stateBodyStyle}>{props.t('features.stages.assets.empty.body')}</p>
        </div>
      )}

      {phase === 'ready' && entries.map((entry) => {
        const isEntering = entry.stage === entering
        return (
          <div
            key={entry.stage}
            data-dsh-forge-stage-asset={entry.stage}
            data-dsh-forge-asset-entering={isEntering ? 'true' : undefined}
            style={{
              ...cardStyle,
              ...(isEntering ? { opacity: risen ? '1' : '0', transition: ENTER_TRANSITION } : {}),
            }}
          >
            <div style={cardHeadStyle}>
              <span data-dsh-forge-stage-asset-pill={entry.stage} style={stagePillStyle}>
                {featureStatusLabel(entry.stage, props.t)}
              </span>
              {entry.generatedAt !== null && (
                <span title={entry.generatedAt} style={metaStyle}>
                  {formatTimestamp(entry.generatedAt)}
                </span>
              )}
            </div>
            <div style={sectionStyle}>
              <span aria-hidden="true" style={sectionLabelStyle}>{props.t('features.stages.assets.goal')}</span>
              <MarkdownView markdown={entry.goal ?? ''} />
            </div>
            <div style={sectionStyle}>
              <span aria-hidden="true" style={sectionLabelStyle}>{props.t('features.stages.assets.summary')}</span>
              <MarkdownView markdown={entry.summary ?? ''} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
