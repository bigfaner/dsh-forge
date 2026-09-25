/**
 * The tasks family's shared presentation chrome (task 5.10 起;M3 6.1 起为
 * 全工作台共享件): the shared dialog frame (ui-dialog geometry — r24 card
 * over a mask-1 + blur overlay, z1200 per the M2 层序), the initiating
 * spinner, and the button/geometry constants the dispatch dialogs, the
 * migration dialogs, the wizard steps, and the prefs rows all compose. The
 * M2 launch-specific members (ConfirmPanel 的 degradation toast + 发起失败
 * error dialog) were deleted with the ForgeBridge retirement (task 6.1).
 *
 * Every dialog overlay built on DialogFrame shares one focus contract:
 * focus lands on the dialog's primary control on open, Tab/Shift+Tab cycle
 * inside (focus trap), Esc / mask / ✕ dismiss, and the caller returns focus
 * to the trigger on close.
 *
 * Styles stay inline (no stylesheet pipeline — Hard Rule): the theme rides
 * the host `--dsw-*` / `--dsh-*` vars exactly like the 5.1 chrome.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { ChromeButton } from '../../../components/chrome/ChromeButton'

/** ui-design 层叠: dialog overlays z1200 (mask + blur), toasts z1100. */
export const DIALOG_Z = 1200
export const TOAST_Z = 1100

/**
 * ui-design 层叠 + UF3 Placement: the side DOCK family's shared geometry —
 * z100 below the float bar (z200, 选择模式) and every dialog/toast, width
 * min(440px, 45vw) (the board insets its flow layout by exactly this strip
 * while EITHER dock — detail or approval, 同层互斥 since 3.9 — is open).
 * Declared HERE (the tasks family's shared chrome module) since 3.9: the
 * detail panel and the approval panel import each other's components, so
 * the constants need an acyclic home every dock consumer shares.
 */
export const DETAIL_DOCK_Z = 100
export const DETAIL_DOCK_WIDTH = 'min(440px, 45vw)'

/** ui-dialog geometry: full-screen mask (mask-1 + 2px blur) with a centered r24 card. */
const maskStyle = {
  alignItems: 'center',
  background: 'var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.4))',
  backdropFilter: 'blur(2px)',
  display: 'flex',
  inset: '0',
  justifyContent: 'center',
  position: 'fixed',
  zIndex: DIALOG_Z,
} as const

const cardStyle = {
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '24px',
  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.24)',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '70vh',
  maxWidth: 'min(520px, calc(100vw - 48px))',
  padding: '22px 24px 24px',
  width: 'min(520px, calc(100vw - 48px))',
} as const

const titleStyle = {
  fontSize: '16px',
  fontWeight: 600,
  lineHeight: '24px',
  margin: '0',
} as const

const bodyStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  minHeight: '0',
  overflowY: 'auto',
  paddingTop: '10px',
} as const

const footerStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '8px',
  justifyContent: 'flex-end',
  paddingTop: '16px',
} as const

/** ui-design md primary pill (h36 r18, brand action color). */
export const primaryButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '18px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  height: '36px',
  padding: '0 16px',
} as const

/** ui-design sm ghost pill (h28 r14). */
export const ghostButtonStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
  height: '28px',
  padding: '0 12px',
} as const

const closeButtonStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  flex: '0 0 auto',
  font: 'inherit',
  height: '28px',
  justifyContent: 'center',
  marginLeft: 'auto',
  width: '28px',
} as const

/**
 * Focusables of a dialog card in DOM order (the trap's cycle set). Disabled
 * buttons are skipped — the browser's own Tab semantics agree. Shared since
 * task 5.7: the UF3 detail dock's non-modal trap cycles the same set.
 */
export function focusablesOf(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
  ))
}

/**
 * Ref the DialogFrame focuses on open — attach it to the dialog's default
 * control (a button for the launch family, the first INPUT for the 5.4
 * wizard: `RefObject<HTMLButtonElement>` stays assignable under the widened
 * element type).
 */
export type DialogInitialFocus = React.RefObject<HTMLElement | null>

/**
 * The shared dialog frame: mask + card, focus-in on mount (the primary
 * button the `initialFocus` ref addresses), Tab/Shift+Tab trap, Esc/mask
 * dismiss. `onDismiss === undefined` disarms dismissal (the initiating
 * phase — a launch that cannot be cancelled must not look cancellable).
 *
 * The card itself is a `tabIndex={-1}` focus anchor and an optional
 * `cardRef` hands the caller the card element — both exist for the dialog
 * focus contract's restore leg (fix-1 defect B): a sub-dialog that unmounts
 * WITHOUT restoring focus strands `document.activeElement` on `<body>`,
 * outside this card's keydown scope, so the parent dialog's Esc/mask/✕
 * handlers go keyboard-dead. (-1 keeps the anchor OUT of the trap's cycle
 * set — focusablesOf excludes it.)
 */
export function DialogFrame(props: {
  role: 'dialog' | 'alertdialog'
  ariaLabelledBy: string
  initialFocus?: DialogInitialFocus
  onDismiss?: (() => void) | undefined
  dialogDataKey?: string | undefined
  /** The caller's mutable card ref (the focus-restore anchor above). */
  cardRef?: RefObject<HTMLDivElement | null> | ((element: HTMLDivElement | null) => void) | undefined
  children: ReactNode
}) {
  const localCardRef = useRef<HTMLDivElement | null>(null)
  const setCardRef = (element: HTMLDivElement | null): void => {
    localCardRef.current = element
    if (typeof props.cardRef === 'function') {
      props.cardRef(element)
    } else if (props.cardRef !== undefined && props.cardRef !== null) {
      ;(props.cardRef as { current: HTMLDivElement | null }).current = element
    }
  }

  useEffect(() => {
    props.initialFocus?.current?.focus()
  }, [])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && props.onDismiss !== undefined) {
      event.preventDefault()
      props.onDismiss()
      return
    }
    if (event.key !== 'Tab' || localCardRef.current === null) return
    const focusables = focusablesOf(localCardRef.current)
    if (focusables.length === 0) return
    const first = focusables[0] as HTMLElement
    const last = focusables[focusables.length - 1] as HTMLElement
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      data-dsh-forge-dialog-mask=""
      style={maskStyle}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && props.onDismiss !== undefined) props.onDismiss()
      }}
    >
      <div
        ref={setCardRef}
        role={props.role}
        aria-modal="true"
        aria-labelledby={props.ariaLabelledBy}
        data-dsh-forge-dialog={props.dialogDataKey}
        tabIndex={-1}
        style={cardStyle}
        onKeyDown={onKeyDown}
      >
        {props.children}
      </div>
    </div>
  )
}

/** The dialog header row: title + (optional) ✕ close (28×28 r8, ui-dialog geometry). */
export function DialogHeader(props: {
  id: string
  title: string
  closeLabel?: string | undefined
  onClose?: (() => void) | undefined
}) {
  return (
    <div style={{ alignItems: 'center', display: 'flex', gap: '8px' }}>
      <h2 id={props.id} style={titleStyle}>{props.title}</h2>
      {props.onClose !== undefined && props.closeLabel !== undefined && (
        <ChromeButton
          type="button"
          aria-label={props.closeLabel}
          data-dsh-forge-dialog-close=""
          style={closeButtonStyle}
          onClick={props.onClose}
        >
          <span aria-hidden="true">✕</span>
        </ChromeButton>
      )}
    </div>
  )
}

/** The dialog body slot (scrollable interior, max 70vh per ui-dialog). */
export function DialogBody(props: { children: ReactNode }) {
  return <div style={bodyStyle}>{props.children}</div>
}

/** The dialog footer slot (right-aligned button row). */
export function DialogFooter(props: { children: ReactNode }) {
  return <div style={footerStyle}>{props.children}</div>
}

/**
 * The initiating indicator (ui-design initiating 态): spinner + label.
 * The rotation is SMIL inside the plugin's own inline SVG — self-contained,
 * no stylesheet pipeline, and inert in reduced-motion user agents that
 * disable SMIL animations.
 */
export function LaunchSpinner(props: { label: string }) {
  return (
    <span
      role="img"
      aria-label={props.label}
      data-dsh-forge-launch-spinner=""
      style={{ display: 'inline-flex', height: '14px', width: '14px' }}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 8 8" to="360 8 8" dur="0.8s" repeatCount="indefinite" />
        </path>
      </svg>
    </span>
  )
}
