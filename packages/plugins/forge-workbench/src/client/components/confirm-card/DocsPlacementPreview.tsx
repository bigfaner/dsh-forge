/**
 * The C7 文档位置预览行 (task 1.5; ui-design C7 Layout + decisions §5.4): a
 * READ of the write promise (首次向用户仓库写入 = 信任事件), not a radio
 * chooser — path + note in an r14 border card, collapsed by default. ✎
 * expands the mode radios (应用管理 / 仓内; 沿用仓内 offered only when the
 * evidence hit) + the 仓内 path box. Preview copy follows decisions §5 v2;
 * the app note's 「内部版本历史」 promise is dropped per tech-design T6
 * (shadow git deferred to the storage milestone).
 */
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../chrome/ChromeButton'
import { ghostButtonStyle } from '../../views/tasks/launch/LaunchStates'
import type { EvidenceTier, PlacementDraft, PlacementResolution } from './card-state'

export interface DocsPlacementPreviewProps {
  t: (key: WorkbenchKey) => string
  /** The evidence tier (the 沿用仓内 radio is offered only on a 'repo-existing' hit). */
  tier: EvidenceTier | null
  draft: PlacementDraft
  resolution: PlacementResolution
  /** ✎ panel open state (the browser owns it; default collapsed). */
  expanded: boolean
  onToggle: () => void
  onPickMode: (mode: EvidenceTier) => void
  onDocsPathChange: (path: string) => void
}

const previewCardStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  display: 'flex',
  gap: '8px',
  minHeight: '38px',
  padding: '6px 8px 6px 12px',
} as const

const pathStyle = {
  color: 'var(--dsw-alias-label-primary, CanvasText)',
  display: 'block',
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: '12px',
  lineHeight: '18px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  width: '100%',
} as const

const noteStyle = {
  color: 'var(--dsw-alias-label-secondary, GrayText)',
  display: 'block',
  fontSize: '12px',
  lineHeight: '18px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  width: '100%',
} as const

const panelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginTop: '6px',
} as const

const radioRowStyle = {
  alignItems: 'center',
  color: 'var(--dsw-alias-label-primary, CanvasText)',
  cursor: 'pointer',
  display: 'flex',
  fontSize: '13px',
  gap: '8px',
  lineHeight: '20px',
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
  padding: '0 10px',
  width: '100%',
} as const

const NOTE_KEY: Record<Exclude<PlacementResolution['mode'], 'custom'>, WorkbenchKey> = {
  'repo-existing': 'confirmCard.note.repo-existing',
  'repo-new': 'confirmCard.note.repo-new',
  app: 'confirmCard.note.app',
}

/** 预览行 (r14 border card) + the ✎-expanded mode/path panel. */
export function DocsPlacementPreview(props: DocsPlacementPreviewProps) {
  const { t, resolution } = props
  const note = resolution.mode === 'custom'
    ? t('confirmCard.custom.note') + (resolution.needsAuthorization ? t('confirmCard.custom.pendingAuth') : '')
    : t(NOTE_KEY[resolution.mode])
  return (
    <div>
      <div data-dsh-forge-confirm-preview="" style={previewCardStyle}>
        <span style={{ flex: 1, minWidth: 0 }}>
          {resolution.previewPath !== null && (
            <span data-dsh-forge-confirm-preview-path="" style={pathStyle}>{resolution.previewPath}</span>
          )}
          <span data-dsh-forge-confirm-preview-note="" style={noteStyle}>{note}</span>
        </span>
        <ChromeButton
          type="button"
          data-dsh-forge-confirm-edit=""
          aria-expanded={props.expanded ? 'true' : 'false'}
          aria-label={t('confirmCard.docs.edit')}
          title={t('confirmCard.docs.edit')}
          style={ghostButtonStyle}
          onClick={props.onToggle}
        >
          ✎
        </ChromeButton>
      </div>
      {props.expanded && (
        <div data-dsh-forge-confirm-panel="" style={panelStyle}>
          <label style={radioRowStyle}>
            <input
              type="radio"
              name="dsh-forge-confirm-mode"
              data-dsh-forge-confirm-mode="app"
              checked={resolution.mode === 'app'}
              onChange={() => { props.onPickMode('app') }}
            />
            {t('confirmCard.mode.appOption')}
          </label>
          <label style={radioRowStyle}>
            <input
              type="radio"
              name="dsh-forge-confirm-mode"
              data-dsh-forge-confirm-mode="repo-new"
              checked={resolution.mode === 'repo-new'}
              onChange={() => { props.onPickMode('repo-new') }}
            />
            {t('confirmCard.mode.repo-newOption')}
          </label>
          {props.tier === 'repo-existing' && (
            <label style={radioRowStyle}>
              <input
                type="radio"
                name="dsh-forge-confirm-mode"
                data-dsh-forge-confirm-mode="repo-existing"
                checked={resolution.mode === 'repo-existing'}
                onChange={() => { props.onPickMode('repo-existing') }}
              />
              {t('confirmCard.mode.repo-existingOption')}
            </label>
          )}
          <input
            data-dsh-forge-confirm-docpath=""
            value={props.draft.docsPath}
            placeholder={t('confirmCard.docsPath.placeholder')}
            aria-label={t('confirmCard.docsPath.placeholder')}
            style={pathInputStyle}
            onChange={(event) => { props.onDocsPathChange(event.target.value) }}
          />
        </div>
      )}
    </div>
  )
}
