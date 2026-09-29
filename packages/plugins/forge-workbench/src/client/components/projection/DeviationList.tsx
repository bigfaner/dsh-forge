/**
 * The C8 偏差明细 fold's row list (M4 task 3.5; ui-design §Component C8 —
 * deviation:[偏差明细 N] → 展开折叠列表): one row per kernel
 * {@link DeviationRow} — 类型 Pill (改名/删除/乱序, the diff's three-class
 * vocabulary) + the kernel detail string as the 条目名 (12/18 secondary) —
 * each row tailed by its 处理建议 READ-ONLY line.
 *
 * Hard Rule (BIZ-006 偏差仅提示): the list renders ZERO interactive elements
 * — no button, no link, no reverse-write entry of any kind. The three advice
 * lines are the design's own copy verbatim:
 *   改名 →「下次对账按 dsh 侧新名重建索引」
 *   删除 →「快照重建后不再呈现该条目」
 *   乱序 →「按 dsh 侧实际顺序重排」
 * Convergence happens on the kernel's next reconcile — NEVER through this
 * surface (禁反向写; the ONLY projection retry action is the status row's
 * degraded-state [重试投影], BIZ-005).
 */
import type { ReactNode } from 'react'
import type { DeviationRow } from '../../ipc-types'
import type { WorkbenchKey } from '../../locale/en'

/** The deviation class → 类型 Pill label key (the diff's three classes). */
export const DEVIATION_TYPE_KEYS: Record<DeviationRow['type'], WorkbenchKey> = {
  renamed: 'projection.deviation.type.renamed',
  deleted: 'projection.deviation.type.deleted',
  reordered: 'projection.deviation.type.reordered',
}

/** The deviation class → 处理建议 copy key (ui-design C8 verbatim). */
export const DEVIATION_ADVICE_KEYS: Record<DeviationRow['type'], WorkbenchKey> = {
  renamed: 'projection.deviation.advice.renamed',
  deleted: 'projection.deviation.advice.deleted',
  reordered: 'projection.deviation.advice.reordered',
}

/** Inputs of {@link DeviationList}. */
export interface DeviationListProps {
  /** The locale seat (the plugin's bound `t`). */
  t: (key: WorkbenchKey) => string
  /** The kernel's live-materialized deviation rows (drift 时非空). */
  deviations: readonly DeviationRow[]
}

/** The fold's column (one row per deviation, full-bleed inside the meta card). */
const listStyle = {
  borderTop: '1px solid var(--dsh-border-color, CanvasText)',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  minWidth: 0,
  paddingTop: '6px',
} as const

/** One deviation row: the pill slot over the entry detail. */
const rowStyle = {
  alignItems: 'baseline',
  display: 'flex',
  gap: '8px',
  minWidth: 0,
} as const

/** 类型 Pill: 12/18 warn-tinted capsule (the StateDot pairing rule — the label carries the precision). */
const pillStyle = {
  border: '1px solid var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  borderRadius: '8px',
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '0 6px',
  whiteSpace: 'nowrap',
} as const

/** 条目名 = the kernel detail string (12/18 secondary, verbatim evidence). */
const detailStyle = {
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  fontSize: '12px',
  lineHeight: '18px',
  minWidth: 0,
  overflowWrap: 'anywhere',
} as const

/** 处理建议 (read-only): 12/18 secondary with the label prefix. */
const adviceStyle = {
  ...detailStyle,
  margin: 0,
  paddingLeft: '52px',
} as const

const ADVICE_LABEL_WIDTH_PREFIX = '—— '

/**
 * The deviation rows. An empty list renders nothing (the fold lives inside
 * the deviation-state row; an empty deviation set never reaches it).
 */
export function DeviationList(props: DeviationListProps): ReactNode {
  const { t, deviations } = props
  if (deviations.length === 0) return null
  return (
    <div data-dsh-forge-projection-deviations="" style={listStyle}>
      {deviations.map((row, index) => (
        <div key={`${row.type}-${index}`} data-dsh-forge-deviation-row={row.type}>
          <div style={rowStyle}>
            <span data-dsh-forge-deviation-pill="" style={pillStyle}>{t(DEVIATION_TYPE_KEYS[row.type])}</span>
            <span style={detailStyle}>{row.detail}</span>
          </div>
          {/* 处理建议 — read-only text, NEVER an action (BIZ-006). */}
          <p style={adviceStyle}>
            {`${t('projection.deviation.adviceLabel')}${ADVICE_LABEL_WIDTH_PREFIX}${t(DEVIATION_ADVICE_KEYS[row.type])}`}
          </p>
        </div>
      ))}
    </div>
  )
}
