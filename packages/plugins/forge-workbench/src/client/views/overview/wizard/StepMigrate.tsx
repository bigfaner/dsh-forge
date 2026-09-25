/**
 * The wizard's CONDITIONAL migration-confirm step (task 1.7, ui-design
 * 注册向导·条件性四步 + Interface 4 §8): rendered ONLY when the settled
 * step-② doc tree probed `tasks/index.json` — the step inserts between ②
 * 文档位置 and the summary, turning the three-dot stepper into four.
 *
 * Content = the 内嵌同款说明块 (the confirm dialog's four-line 复份/淘汰/
 * md-不动 description — the SAME migration.confirm.bullet.* copy, no second
 * wording) + the 「迁移到 M3 内核」 toggle. Default ON (ui-design: 开关默认
 * 开); OFF registers the read-only compatibility state — the project card
 * keeps its 「可迁移」 entry and migration can start later from the overview
 * (the off-hint copy states exactly that).
 *
 * The step COLLECTS a choice only — the task Hard Rule keeps holding: no
 * persistent write fires before the summary confirm, and the migration verb
 * itself fires only after registerProject resolves (the in-place progress
 * phase).
 */
import type { WorkbenchKey } from '../../../locale/en'

const titleStyle = {
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '22px',
} as const

const introStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0 0 8px 0',
} as const

const bulletListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  margin: '0 0 10px 0',
  padding: '0 0 0 18px',
} as const

/** ui-design 授权说明块同款 warn 块(the toggle rides inside it)。 */
const blockStyle = {
  border: '1.5px solid var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  borderRadius: '14px',
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  display: 'flex',
  flexDirection: 'column',
  fontSize: '12px',
  gap: '8px',
  lineHeight: '18px',
  margin: '0',
  padding: '10px 12px',
} as const

const toggleRowStyle = {
  alignItems: 'flex-start',
  color: 'inherit',
  display: 'flex',
  gap: '8px',
} as const

const toggleTextStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
} as const

const toggleLabelStyle = {
  fontSize: '14px',
  lineHeight: '22px',
} as const

const hintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** Inputs of {@link StepMigrate}. */
export interface StepMigrateProps {
  /** The locale seat (the shell's `t`). */
  readonly t: (key: WorkbenchKey) => string
  /** The draft's toggle state (default ON — the off state registers compat). */
  readonly migrateNow: boolean
  /** Toggle update. */
  readonly onMigrateNowChange: (migrateNow: boolean) => void
}

/**
 * The conditional step ③ content: 迁移确认. `data-dsh-forge-wizard-step-migrate`
 * is the observation hook (the four-step form's discriminator); the toggle
 * carries `data-dsh-forge-wizard-migrate-toggle`.
 */
export function StepMigrate(props: StepMigrateProps) {
  return (
    <section data-dsh-forge-wizard-step-migrate="">
      <h3 style={titleStyle}>{props.t('wizard.stepMigrate.title')}</h3>
      <p style={introStyle}>{props.t('wizard.stepMigrate.intro')}</p>
      <ul style={bulletListStyle}>
        <li>{props.t('migration.confirm.bullet.tasks')}</li>
        <li>{props.t('migration.confirm.bullet.backup')}</li>
        <li>{props.t('migration.confirm.bullet.archive')}</li>
        <li>{props.t('migration.confirm.bullet.md')}</li>
      </ul>
      <div data-dsh-forge-wizard-migrate-block="" style={blockStyle}>
        <label style={toggleRowStyle}>
          <input
            type="checkbox"
            checked={props.migrateNow}
            data-dsh-forge-wizard-migrate-toggle=""
            onChange={(event) => { props.onMigrateNowChange(event.target.checked) }}
          />
          <span style={toggleTextStyle}>
            <span style={toggleLabelStyle}>{props.t('wizard.stepMigrate.toggle')}</span>
            <span style={hintStyle}>
              {props.t(props.migrateNow ? 'wizard.stepMigrate.onHint' : 'wizard.stepMigrate.offHint')}
            </span>
          </span>
        </label>
      </div>
    </section>
  )
}
