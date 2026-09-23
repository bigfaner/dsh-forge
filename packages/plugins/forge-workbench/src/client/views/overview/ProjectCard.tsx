/**
 * One project card (task 5.3, ui-design UF1 项目概览卡): the Interface 1
 * Project DTO's presentation — displayName, codeRoot (mono), the doc-location
 * 徽标 (仓内/仓外 Pill), the last-activation time, the single-activation
 * marker (「当前」 Pill + the brand border on the active card) — plus the
 * three sm ghost actions 重命名 / 切换 / 移除.
 *
 * Field-set note (task 5.3): the breakdown's card sketch mentioned
 * branch-count / task-count / snapshot-time columns, but the §Interface 1
 * Project DTO (the structural authority) carries no such fields and the
 * ui-design UF1 field set is 名称/路径/文档位置/激活标记 — the card renders the
 * DTO's own fields (`lastActivatedAt` being its timestamp), so the BUILD
 * stage needs no second data face; counts join later views if the DTO grows.
 *
 * Rename is INLINE (ui-design Interactions): 重命名 swaps the display name
 * for a prefilled 14/22 input — Enter saves (empty submit reverts, no verb),
 * Esc cancels; the save routes through the page's rename verb and the editor
 * only closes on success (an ERR_PROJECT_NOT_FOUND keeps it open until the
 * refresh settles).
 *
 * Styles stay inline (no stylesheet pipeline — Hard Rule): the theme rides
 * the host `--dsw-alias-*` / `--dsh-*` vars with fallbacks, light/dark alike.
 */
import { useState } from 'react'
import type { Project } from '../../ipc-types'
import type { MigrationFace } from '../../contract'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { formatTimestamp } from './format'
import { MigrationPill } from './migration/MigrationPill'
import { MigrationCardEntry } from './migration/MigrationCardEntry'

/**
 * The card's migration surface (task 1.7, ui-design 项目卡追加): present ONLY
 * on the assembled path (the page derives it from getMigrationStatus —
 * authority 'files' + indexJsonDetected = 'migratable', 'sqlite' =
 * 'migrated'); absent = the M2 card verbatim (the build-stage default).
 */
export interface ProjectCardMigration {
  /** 'migratable' = 可迁移 Pill + 「迁移」 entry; 'migrated' = the 已迁移 Pill (entry retired). */
  readonly status: 'migratable' | 'migrated'
  /** The migration family's face (the entry-guard hook's reads). */
  readonly face: MigrationFace
  /** Open the migration dialog family (the page owns MigrationDialogs). */
  readonly onMigrate: (project: Project) => void
}

/** Inputs of {@link ProjectCard}. */
export interface ProjectCardProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The registered project (Interface 1 Project DTO). */
  project: Project
  /** True when `project.id` is the single-activation pointer. */
  active: boolean
  /** True when path re-validation failed (the 失联徽标, 5.14's sync signal). */
  lost: boolean
  /** Interface 1 activateProject(id) — the 切换 action (disabled on the active card). */
  onActivate: (id: string) => void
  /**
   * The rename leg: resolves true on success (the editor closes), false when
   * the verb failed (the editor stays for the refresh to settle).
   */
  onRename: (id: string, displayName: string) => Promise<boolean>
  /** Opens the double-step RemoveConfirm (task Hard Rule: never one-click). */
  onRemove: (project: Project) => void
  /** The migration surface (task 1.7) — absent renders the M2 card verbatim. */
  migration?: ProjectCardMigration | undefined
}

/** ui-design 项目卡: r14 · bg-layer-2 · pad 14; active = brand border 1.5px. */
const cardStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  minWidth: '0',
  padding: '14px',
} as const

const activeCardStyle = {
  ...cardStyle,
  border: '1.5px solid var(--dsw-alias-link, rgb(65, 118, 230))',
} as const

/** Pill geometry (ui-design Design System 徽标用 Pill): 12/18, r9 filled. */
const pillStyle = {
  alignItems: 'center',
  borderRadius: '9px',
  display: 'inline-flex',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '1px 8px',
  whiteSpace: 'nowrap',
} as const

const activePillStyle = {
  ...pillStyle,
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  color: '#fff',
  fontWeight: 500,
} as const

/** The 失联徽标: warn-state tinted outline (非仅颜色 — the text carries it). */
const lostPillStyle = {
  ...pillStyle,
  border: '1px solid var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
} as const

/** Neutral doc-location 徽标 (仓内/仓外): secondary label, quiet border. */
const docPillStyle = {
  ...pillStyle,
  border: '1px solid var(--dsh-border-color, CanvasText)',
  color: 'var(--dsw-alias-label-secondary, inherit)',
} as const

const badgeRowStyle = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
} as const

const nameStyle = {
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: '22px',
  margin: '0',
  overflowWrap: 'anywhere',
} as const

const monoSecondaryStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const metaStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** ui-design sm ghost action (h28 r14) — the card's three verbs. */
const actionStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
  height: '28px',
  padding: '0 10px',
} as const

/** The destructive 移除 action: error-state tinted text (still ghost geometry). */
const removeActionStyle = {
  ...actionStyle,
  color: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
} as const

const actionsRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  marginTop: '2px',
} as const

/** The inline rename input (ui-design: 14/22 输入框替换显示名). */
const renameInputStyle = {
  border: '1px solid var(--dsw-alias-link, rgb(65, 118, 230))',
  borderRadius: '8px',
  font: 'inherit',
  fontSize: '14px',
  height: '26px',
  lineHeight: '22px',
  padding: '0 8px',
  width: '100%',
} as const

const renameHintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/**
 * The card. `data-dsh-forge-project-card`/`data-active`/`data-lost` and the
 * `data-dsh-forge-card-action` markers are the 5.3/e2e observation hooks —
 * attributes are contract, not deco (the 5.1 chrome precedent).
 */
export function ProjectCard(props: ProjectCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.project.displayName)
  const [saving, setSaving] = useState(false)

  const submitRename = (): void => {
    const value = draft.trim()
    // 空提交回退原名 (ui-design): close the editor, fire no verb.
    if (value === '' || value === props.project.displayName) {
      setEditing(false)
      return
    }
    setSaving(true)
    void props.onRename(props.project.id, value).then((saved) => {
      setSaving(false)
      if (saved) setEditing(false)
    })
  }

  const lastActivated = props.project.lastActivatedAt === null
    ? props.t('overview.card.neverActivated')
    : formatTimestamp(props.project.lastActivatedAt)

  return (
    <article
      data-dsh-forge-project-card={props.project.id}
      data-active={props.active ? 'true' : 'false'}
      data-lost={props.lost ? 'true' : 'false'}
      style={props.active ? activeCardStyle : cardStyle}
    >
      <div style={badgeRowStyle}>
        {props.active && (
          <span data-dsh-forge-card-active-badge="" style={activePillStyle}>
            {props.t('overview.card.activeBadge')}
          </span>
        )}
        {props.lost && (
          <span data-dsh-forge-card-lost-badge="" style={lostPillStyle}>
            {props.t('overview.card.lostBadge')}
          </span>
        )}
        <span
          data-dsh-forge-card-doc={props.project.docLocationType}
          title={props.project.docLocationPath ?? undefined}
          style={docPillStyle}
        >
          {props.t(props.project.docLocationType === 'in_repo' ? 'overview.doc.inRepo' : 'overview.doc.external')}
        </span>
        {props.migration !== undefined && (
          <MigrationPill t={props.t} status={props.migration.status} />
        )}
      </div>

      {editing
        ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <input
              type="text"
              value={draft}
              aria-label={props.t('overview.rename.label')}
              data-dsh-forge-card-rename-input=""
              disabled={saving}
              style={renameInputStyle}
              onChange={(event) => { setDraft(event.target.value) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitRename()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  setEditing(false)
                }
              }}
            />
            <p style={renameHintStyle}>{props.t('overview.rename.hint')}</p>
          </div>
        )
        : <h3 style={nameStyle}>{props.project.displayName}</h3>}

      <p title={props.project.codeRoot} style={monoSecondaryStyle}>{props.project.codeRoot}</p>
      {props.project.docLocationPath !== null && (
        <p title={props.project.docLocationPath} style={monoSecondaryStyle}>
          {props.project.docLocationPath}
        </p>
      )}
      <p style={metaStyle}>
        <span>{props.t('overview.card.lastActivated')}</span>
        <span aria-hidden="true">: </span>
        <span data-dsh-forge-card-last-activated="">{lastActivated}</span>
      </p>

      <div style={actionsRowStyle}>
        <ChromeButton
          type="button"
          data-dsh-forge-card-action="rename"
          disabled={editing}
          style={actionStyle}
          onClick={() => {
            setDraft(props.project.displayName)
            setEditing(true)
          }}
        >
          {props.t('overview.card.rename')}
        </ChromeButton>
        <ChromeButton
          type="button"
          data-dsh-forge-card-action="activate"
          aria-disabled={props.active ? 'true' : 'false'}
          disabled={props.active}
          title={props.active ? props.t('overview.card.activeBadge') : undefined}
          style={actionStyle}
          onClick={() => { props.onActivate(props.project.id) }}
        >
          {props.t('overview.card.activate')}
        </ChromeButton>
        <ChromeButton
          type="button"
          data-dsh-forge-card-action="remove"
          style={removeActionStyle}
          onClick={() => { props.onRemove(props.project) }}
        >
          {props.t('overview.card.remove')}
        </ChromeButton>
        {props.migration !== undefined && props.migration.status === 'migratable' && (
          <MigrationCardEntry
            t={props.t}
            projectId={props.project.id}
            face={props.migration.face}
            migratable={true}
            onOpen={() => { props.migration?.onMigrate(props.project) }}
          />
        )}
      </div>
    </article>
  )
}
