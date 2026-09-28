/**
 * The C7 高级折叠 (task 1.5; ui-design C7 Layout 高级折叠 + decisions §5.4):
 * 自定义文档路径 in a details fold. A custom path OUTSIDE the 代码区 (⊄ anchor)
 * surfaces the explicit authorization row — the BIZ-001/003 收窄: the ONLY
 * place an external docs location can be unlocked (授权使用此位置 → 成功态;
 * the face's recheck rejection → 授权行错误态). Authorization resets with
 * every path change and every custom edit (黏性禁令 — the reset itself lives
 * in ConfirmCard's handlers).
 */
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../chrome/ChromeButton'
import { ghostButtonStyle } from '../../views/tasks/launch/LaunchStates'
import { isCustomOutside, type PlacementDraft } from './card-state'

export interface AdvancedSectionProps {
  t: (key: WorkbenchKey) => string
  anchor: string | null
  draft: PlacementDraft
  /** The face recheck's rejection (ERR_EXTERNAL_PATH_UNREADABLE) → 错误态. */
  authError: string | null
  onCustomChange: (path: string) => void
  onGrant: () => void
}

const detailsStyle = {
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  fontSize: '12px',
} as const

const summaryStyle = {
  cursor: 'pointer',
  lineHeight: '20px',
  userSelect: 'none',
} as const

const pathInputStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '10px',
  color: 'var(--dsw-alias-label-primary, CanvasText)',
  font: 'inherit',
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: '12px',
  height: '30px',
  marginTop: '8px',
  padding: '0 10px',
  width: '100%',
} as const

const authRowStyle = {
  alignItems: 'center',
  borderRadius: '10px',
  display: 'flex',
  gap: '8px',
  marginTop: '6px',
  padding: '6px 4px 6px 10px',
} as const

const grantedStyle = {
  color: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const outsideStyle = {
  color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const failedStyle = {
  color: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** 高级:自定义文档路径 + the 仓外 authorization row. */
export function AdvancedSection(props: AdvancedSectionProps) {
  const { t, draft } = props
  const customFilled = draft.customPath.trim() !== ''
  const outside = isCustomOutside(props.anchor, draft.customPath)
  const granted = draft.customAuthorized && props.authError === null
  return (
    <details data-dsh-forge-confirm-advanced="" style={detailsStyle}>
      <summary style={summaryStyle}>{t('confirmCard.advanced.summary')}</summary>
      <input
        data-dsh-forge-confirm-custom=""
        value={draft.customPath}
        placeholder={t('confirmCard.advanced.placeholder')}
        aria-label={t('confirmCard.advanced.placeholder')}
        style={pathInputStyle}
        onChange={(event) => { props.onCustomChange(event.target.value) }}
      />
      {customFilled && outside && (
        <div data-dsh-forge-confirm-authrow="" data-auth={granted ? 'granted' : props.authError !== null ? 'failed' : 'pending'} style={authRowStyle}>
          {granted
            ? (
              <span data-dsh-forge-confirm-auth-ok="" style={grantedStyle}>✓ {t('confirmCard.auth.granted')}</span>
            )
            : (
              <>
                <span data-dsh-forge-confirm-auth-outside="" style={props.authError !== null ? failedStyle : outsideStyle}>
                  {props.authError !== null ? t('confirmCard.auth.failed') : t('confirmCard.auth.outside')}
                </span>
                <ChromeButton
                  type="button"
                  data-dsh-forge-confirm-auth-grant=""
                  style={ghostButtonStyle}
                  onClick={props.onGrant}
                >
                  {t('confirmCard.auth.grant')}
                </ChromeButton>
              </>
            )}
        </div>
      )}
    </details>
  )
}
