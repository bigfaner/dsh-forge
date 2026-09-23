/**
 * The UF5 confirm 态 (task 5.10): the dialog between the entry click and the
 * launch — prompt 预览 (strictly READ-ONLY: rendered as a plain-text pre,
 * never markdown, never executable content — Hard Rule, 5.2 discipline),
 * default-collapsed with an expand-to-full toggle so the prompt is
 * 逐字符可核对, the 目标会话说明 (which task, which working directory, what
 * will happen), and the 确认/取消 pair with the CONFIRM button as the
 * default focus (Story2 AC1: Enter alone launches — ≤1 click reach).
 *
 * While the launch is in flight (`initiating`) the buttons disable and the
 * confirm button shows the spinner + 「正在发起会话…」 (ui-design initiating
 * 态); dismissal stays armed only outside that phase.
 */
import { useId, useRef, useState } from 'react'
import type { WorkbenchKey } from '../../../locale/en'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import {
  DialogBody, DialogFooter, DialogFrame, DialogHeader, LaunchSpinner,
  ghostButtonStyle, primaryButtonStyle,
} from './LaunchStates'

/** The prompt preview collapsed clamp (visual fold; the full text stays in the DOM). */
const PROMPT_COLLAPSED_MAX_HEIGHT = 96
/** The expanded ceiling — beyond it the full text scrolls inside the block. */
const PROMPT_EXPANDED_MAX_HEIGHT = 320

const explainStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
} as const

const rowLabelStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const monoStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const promptBlockStyle = {
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '10px 12px',
} as const

const promptHeaderRowStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '8px',
} as const

const promptLabelStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const toggleStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '12px',
  height: '24px',
  lineHeight: '18px',
  marginLeft: 'auto',
  padding: '0 4px',
} as const

/** The read-only prompt <pre>: pre-wrap keeps every byte visible, verbatim, selectable. */
const promptPreStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
  overflowY: 'auto',
  userSelect: 'text',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
} as const

/** Inputs of {@link ConfirmPanel}. */
export interface ConfirmPanelProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** Task display title (the launch input's `title`). */
  taskTitle: string
  /** Qualified workbench key (`<featureSlug>/<localId>`) — the identity being launched. */
  taskKeyId: string
  /** The registered project codeRoot — the session create cwd. */
  cwd: string
  /** The COMPLETE forge prompt output, byte-faithful (SC3). */
  promptText: string
  /** True while the launch chain is in flight. */
  initiating: boolean
  /** Cancel / close (armed outside the initiating phase; focus returns to the trigger). */
  onCancel: () => void
  /** Confirm — starts the launch chain. */
  onConfirm: () => void
}

/**
 * The confirm dialog. The confirm button is the dialog's initial focus and
 * carries the spinner while initiating; the prompt preview starts collapsed
 * and expands to the full verbatim text on toggle.
 */
export function ConfirmPanel(props: ConfirmPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const titleId = `dsh-forge-launch-confirm-title-${generatedId}`
  const promptId = `dsh-forge-launch-prompt-${generatedId}`

  return (
    <DialogFrame
      role="dialog"
      ariaLabelledBy={titleId}
      initialFocus={confirmRef}
      onDismiss={props.initiating ? undefined : props.onCancel}
      dialogDataKey="launch-confirm"
    >
      <DialogHeader
        id={titleId}
        title={props.t('launch.confirm.title')}
        closeLabel={props.t('launch.confirm.cancel')}
        onClose={props.initiating ? undefined : props.onCancel}
      />
      <DialogBody>
        <div>
          <div style={rowLabelStyle}>{props.t('launch.confirm.task')}</div>
          <div style={{ fontSize: '14px', lineHeight: '22px' }}>
            <strong>{props.taskTitle}</strong>
            <span aria-hidden="true"> · </span>
            <span style={monoStyle}>{props.taskKeyId}</span>
          </div>
        </div>
        <div>
          <div style={rowLabelStyle}>{props.t('launch.confirm.cwd')}</div>
          <div style={monoStyle} data-dsh-forge-launch-cwd="">{props.cwd}</div>
        </div>
        <p style={explainStyle}>{props.t('launch.confirm.explain')}</p>
        <div style={promptBlockStyle} data-dsh-forge-launch-prompt-block="">
          <div style={promptHeaderRowStyle}>
            <span style={promptLabelStyle}>{props.t('launch.confirm.promptLabel')}</span>
            <button
              type="button"
              aria-expanded={expanded ? 'true' : 'false'}
              aria-controls={promptId}
              data-dsh-forge-launch-prompt-toggle=""
              style={toggleStyle}
              onClick={() => { setExpanded(current => !current) }}
            >
              {expanded ? props.t('launch.confirm.collapse') : props.t('launch.confirm.expand')}
            </button>
          </div>
          {/* READ-ONLY prompt preview (Hard Rule): a plain-text pre — no markdown
              pipeline, no HTML interpretation; the toggle only changes the visual
              clamp, the DOM text is always the complete verbatim prompt. */}
          <pre
            id={promptId}
            data-dsh-forge-launch-prompt=""
            style={{
              ...promptPreStyle,
              maxHeight: `${expanded ? PROMPT_EXPANDED_MAX_HEIGHT : PROMPT_COLLAPSED_MAX_HEIGHT}px`,
            }}
          >
            {props.promptText}
          </pre>
        </div>
      </DialogBody>
      <DialogFooter>
        <ChromeButton
          type="button"
          data-dsh-forge-launch-confirm-cancel=""
          style={ghostButtonStyle}
          disabled={props.initiating}
          onClick={props.onCancel}
        >
          {props.t('launch.confirm.cancel')}
        </ChromeButton>
        <ChromeButton
          ref={confirmRef}
          type="button"
          data-dsh-forge-launch-confirm-ok=""
          style={{ ...primaryButtonStyle, alignItems: 'center', display: 'inline-flex', gap: '6px', justifyContent: 'center' }}
          disabled={props.initiating}
          onClick={props.onConfirm}
        >
          {props.initiating
            ? (
              <>
                <LaunchSpinner label={props.t('launch.initiating')} />
                <span>{props.t('launch.initiating')}</span>
              </>
            )
            : props.t('launch.confirm.ok')}
        </ChromeButton>
      </DialogFooter>
    </DialogFrame>
  )
}
