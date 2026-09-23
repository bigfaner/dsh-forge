/**
 * The UF3 card-surface family (task 1.6, ui-design 显式迁移 · 项目卡追加):
 *
 *   - {@link MigrationPill} — the card-corner migration marker. Two variants
 *     (task 1.6 / page-map / approved prototype): `migratable` = the warn
 *     「可迁移」 pill (index.json detected, SQLite authority not yet), and
 *     `migrated` = the success 「已迁移 · SQLite」 pill. Both carry the full
 *     label as their accessible name plus a hover tooltip (the prototype's
 *     title contract).
 *
 *   - {@link MigrationEntryButton} — the card's 「迁移」 sm ghost action
 *     (M2 card-action geometry, ProjectCard's action twin). Renders ONLY
 *     while migratable (the done state retires the entry — ui-design), and
 *     the entry-guard (MigrateGuard.ts) disables it with the 在跑编排
 *     tooltip; clicking hands the flow to the confirm dialog (1.7 wires the
 *     click into MigrationDialogs).
 *
 * These components deliberately do NOT touch ProjectCard (task Hard Rule:
 * integration is 1.7's). Styles stay inline on the host semantic vars with
 * fallbacks (the M2 precedent — no stylesheet pipeline).
 */
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import type { WorkbenchKey } from '../../../locale/en'

/** Pill geometry (the M2 card-badge precedent: 12/18, r9 filled). */
const pillStyle = {
  alignItems: 'center',
  borderRadius: '9px',
  display: 'inline-flex',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '1px 8px',
  whiteSpace: 'nowrap',
} as const

/** The 可迁移 pill: warn-state tinted outline (非仅颜色 — the text carries it). */
const migratablePillStyle = {
  ...pillStyle,
  border: '1px solid var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
} as const

/** The 已迁移 pill: success-state outline, quiet for a settled fact. */
const migratedPillStyle = {
  ...pillStyle,
  border: '1px solid var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
  color: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
} as const

/** The pill's status vocabulary: migratable (files authority + index.json) vs migrated (sqlite). */
export type MigrationPillStatus = 'migratable' | 'migrated'

/** The pill's tooltip (hover) copy per status. */
const PILL_TITLE_KEYS: Record<MigrationPillStatus, WorkbenchKey> = {
  migratable: 'migration.pill.migratable',
  migrated: 'migration.pill.migrated',
}

/** Inputs of {@link MigrationPill}. */
export interface MigrationPillProps {
  /** The locale seat (the shell's `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** Which marker the card carries (1.7 derives it from getMigrationStatus + index.json detection). */
  readonly status: MigrationPillStatus
}

/**
 * The card-corner migration marker. `data-dsh-forge-migration-pill` is the
 * observation hook (the card-badge contract).
 */
export function MigrationPill(props: MigrationPillProps) {
  const label = props.t(props.status === 'migratable' ? 'migration.pill.migratable' : 'migration.pill.migrated')
  return (
    <span
      data-dsh-forge-migration-pill={props.status}
      title={props.t(PILL_TITLE_KEYS[props.status])}
      aria-label={label}
      style={props.status === 'migratable' ? migratablePillStyle : migratedPillStyle}
    >
      {label}
    </span>
  )
}

/** ui-design sm ghost action (h28 r14) — the ProjectCard action twin. */
const entryStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
  height: '28px',
  padding: '0 10px',
} as const

/** Inputs of {@link MigrationEntryButton}. */
export interface MigrationEntryButtonProps {
  /** The locale seat (the shell's `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** False (not migratable / already migrated) renders NOTHING (the entry retires). */
  readonly migratable: boolean
  /** The entry-guard's blocked (在跑编排 → disabled). */
  readonly blocked: boolean
  /** The guard tooltip copy ('' when unguarded — no title attribute). */
  readonly tooltip: string
  /** Open the confirm dialog (the explicit-migration Hard Rule's single door). */
  readonly onOpen: () => void
}

/**
 * The 「迁移」 entry. `data-dsh-forge-migration-entry` is the observation
 * hook; the disabled + tooltip pair is the ui-design guard state (AC4).
 */
export function MigrationEntryButton(props: MigrationEntryButtonProps) {
  if (!props.migratable) return null
  return (
    <ChromeButton
      type="button"
      data-dsh-forge-migration-entry=""
      disabled={props.blocked}
      title={props.blocked && props.tooltip !== '' ? props.tooltip : undefined}
      style={entryStyle}
      onClick={props.onOpen}
    >
      {props.t('migration.entry.migrate')}
    </ChromeButton>
  )
}
