/**
 * The UF6 插件管理区, BUILD half (task 5.12): the 区块卡 below the overview
 * grid (ui-design Placement: r14 · bg-layer-2 · pad 14, 标题「插件」16/24)
 * rendering the two-tier model over the Interface 1 DTOs through the
 * PluginFace seam — the build stage defaults to the shared mock twin
 * (mocks/workbench.createMockPluginFace), the 5.13/5.14 assembly tasks inject
 * the IPC verbs. No IPC runtime is touched here (the 5.x BUILD layering rule).
 *
 * Behavior (ui-design 插件管理区 States/Interactions):
 *   load        — listPlugins on mount; loading skeleton / load-error retry
 *                 card / ready rows (the 空态 = mandatory-only + quiet hint);
 *   disable     — 「禁用」opens the double-confirm (r24 DialogFrame, 标题
 *                 「禁用插件」+ 影响说明: 仅该插件注入内容退出; forge 数据与
 *                 工作台核心能力不受影响); confirm fires setPluginEnabled
 *                 (pending-then-refresh: the RESOLVED rows drive the state
 *                 migration, spinner in the action button while in flight);
 *   enable      — direct verb, no confirmation;
 *   failures    — revert (nothing optimistically flipped) + readable toast:
 *                 ERR_PLUGIN_MANDATORY explains 不可禁用 and ERR_PLUGIN_
 *                 RUNTIME_STATE explains 已自动重建 (both then re-list — the
 *                 Error Handling table's 返回当前 PluginRow[] semantics); any
 *                 other rejection gets the generic {message} copy. The two
 *                 guard codes are UNREACHABLE from this UI by construction
 *                 (mandatory rows render no write control) — their mapping is
 *                 defense-in-depth's visible layer, exercised via the mock
 *                 twin's failure pokes.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { PluginRow, WorkbenchVerbError } from '../../ipc-types'
import type { PluginFace } from '../../contract'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { createMockPluginFace } from '../../mocks/workbench'
import {
  DialogBody, DialogFooter, DialogFrame, DialogHeader, ghostButtonStyle,
} from '../tasks/launch/LaunchStates'
import { PluginRowView } from './plugin/PluginRowView'

/** Narrow an unknown verb rejection to the serialized Interface 1 error code. */
function verbErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error
    && typeof (error as { code: unknown }).code === 'string') {
    return (error as WorkbenchVerbError).code
  }
  return undefined
}

/** Human text for a verb rejection (the serialized shape's message, or String). */
function describeVerbError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error
    && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return String(error)
}

/** Fill the generic failure template's `{message}` slot. */
function fillTemplate(template: string, message: string): string {
  return template.replace('{message}', message)
}

/** Inputs of {@link PluginSection}. */
export interface PluginSectionProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The section face — absent members fall back to the build-stage mock (5.14 injects the IPC face). */
  face?: Partial<PluginFace> | undefined
}

/** ui-design 区块卡: r14 · bg-layer-2 · pad 14. */
const cardStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  minWidth: '0',
  padding: '14px',
} as const

const titleStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
} as const

const bodyStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
} as const

/** The quiet 空态 hint (no third-party rows — 12/18 secondary). */
const hintStyle = {
  ...bodyStyle,
  fontSize: '12px',
  lineHeight: '18px',
} as const

const errorCardStyle = {
  ...cardStyle,
  border: '1.5px solid var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
  gap: '8px',
} as const

/** md primary pill (the load-error retry — the overview retry precedent). */
const retryButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '18px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  height: '36px',
  padding: '0 16px',
} as const

/** The destructive confirm: error-state fill (the RemoveConfirm precedent). */
const destructiveButtonStyle = {
  background: 'var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
  border: 'none',
  borderRadius: '18px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 500,
  height: '36px',
  padding: '0 16px',
} as const

/** Skeleton block: gray ghost with the 0.3s shimmer loop (the overview precedent). */
const skeletonBlockStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '9px',
  height: '44px',
  overflow: 'hidden',
} as const

/** The toast (z1100, role=status per ui-design 全局规则; explicit dismiss only). */
const toastCardStyle = {
  alignItems: 'flex-start',
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  bottom: '16px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  display: 'flex',
  gap: '10px',
  maxWidth: '360px',
  padding: '12px 14px',
  position: 'fixed',
  right: '16px',
  zIndex: 1100,
} as const

const rowLabelStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** The plugin's package name in the dialog — mono, wrap-anywhere (the RemoveConfirm precedent). */
const pluginNameStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
  overflowWrap: 'anywhere',
} as const

/** The confirm dialog's impact copy — the point of the dialog, 14/22 readable. */
const impactStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
} as const

/**
 * The UF6 plugin section. Renders nothing but the skeleton until the first
 * listPlugins settles; every toggle adopts the verb's RESOLVED rows (getState
 * semantics — the mock twin and the IPC verb agree here), and a rejection
 * never flips a row optimistically (revert = the last good rows stay).
 */
export function PluginSection(props: PluginSectionProps) {
  // Build-stage default face: one isolated mock twin per mount (the 5.14
  // assembly spreads the IPC-backed members over it).
  const [defaultFace] = useState(() => createMockPluginFace())
  const face: PluginFace = { ...defaultFace, ...props.face }
  const t = props.t

  const [phase, setPhase] = useState<'loading' | 'ready' | 'load-error'>('loading')
  const [rows, setRows] = useState<readonly PluginRow[] | undefined>(undefined)
  const [pendingName, setPendingName] = useState<string | undefined>(undefined)
  const [confirming, setConfirming] = useState<PluginRow | undefined>(undefined)
  const [toastText, setToastText] = useState<string | undefined>(undefined)
  const hasLoaded = useRef(false)

  const load = async (): Promise<void> => {
    try {
      const next = await face.listPlugins()
      hasLoaded.current = true
      setRows(next)
      setPhase('ready')
    } catch {
      // A failed FIRST load has nothing to render — the retry card. A failed
      // re-list (guard-error refresh) keeps the last good rows.
      if (!hasLoaded.current) {
        setRows(undefined)
        setPhase('load-error')
      }
    }
  }

  // Mount-once initial load (the face identity is fixed for the section's life).
  useEffect(() => {
    void load()
  }, [])

  /**
   * One third-party toggle: pending-then-refresh. Success adopts the verb's
   * resolved rows; a failure keeps the last good rows and maps the rejection
   * code to the readable toast (ERR_PLUGIN_MANDATORY / ERR_PLUGIN_RUNTIME_
   * STATE additionally re-list — 返回当前 PluginRow[] semantics).
   */
  const toggle = async (row: PluginRow, enabled: boolean): Promise<void> => {
    if (pendingName !== undefined) return
    setPendingName(row.name)
    try {
      const next = await face.setPluginEnabled(row.name, enabled)
      setRows(next)
    } catch (error) {
      const code = verbErrorCode(error)
      if (code === 'ERR_PLUGIN_MANDATORY') {
        setToastText(t('overview.plugins.err.mandatory'))
        await load()
      } else if (code === 'ERR_PLUGIN_RUNTIME_STATE') {
        setToastText(t('overview.plugins.err.runtimeState'))
        await load()
      } else {
        setToastText(fillTemplate(t('overview.plugins.err.generic'), describeVerbError(error)))
      }
    } finally {
      setPendingName(undefined)
    }
  }

  const cancelConfirm = (): void => {
    const row = confirming
    setConfirming(undefined)
    // Focus return: back to the row's 禁用 trigger (the dialog contract).
    if (row !== undefined) {
      const trigger = document.querySelector<HTMLButtonElement>(
        `[data-dsh-forge-plugin-row="${row.name}"] [data-dsh-forge-plugin-action="disable"]`,
      )
      trigger?.focus()
    }
  }

  const confirmDisable = (): void => {
    const row = confirming
    if (row === undefined) return
    setConfirming(undefined)
    void toggle(row, false)
  }

  const ready = phase === 'ready' && rows !== undefined
  const thirdParty = ready ? rows.filter(row => !row.mandatory) : []

  return (
    <section data-dsh-forge-plugins-section="" aria-label={t('overview.plugins.title')} style={cardStyle}>
      <h3 style={titleStyle}>{t('overview.plugins.title')}</h3>

      {phase === 'loading' && (
        <div
          role="status"
          aria-label={t('overview.plugins.loading')}
          data-dsh-forge-plugins-skeleton=""
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          aria-busy="true"
        >
          {[0, 1, 2].map(index => (
            <div key={index} style={skeletonBlockStyle} aria-hidden="true">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" focusable="false">
                <rect width="100" height="100" fill="currentColor" opacity="0.12">
                  <animate attributeName="opacity" values="0.12;0.3;0.12" dur="0.3s" repeatCount="indefinite" />
                </rect>
              </svg>
            </div>
          ))}
        </div>
      )}

      {phase === 'load-error' && (
        <div data-dsh-forge-plugins-error="" role="alert" style={errorCardStyle}>
          <h4 style={titleStyle}>{t('overview.plugins.loadError.title')}</h4>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ChromeButton
              type="button"
              data-dsh-forge-plugins-retry=""
              style={retryButtonStyle}
              onClick={() => {
                setPhase('loading')
                setRows(undefined)
                void load()
              }}
            >
              {t('overview.plugins.loadError.retry')}
            </ChromeButton>
          </div>
        </div>
      )}

      {ready && (
        <>
          {rows.map(row => (
            <PluginRowView
              key={row.name}
              t={t}
              row={row}
              pending={pendingName === row.name}
              onDisable={(target) => { setConfirming(target) }}
              onEnable={(target) => { void toggle(target, true) }}
            />
          ))}
          {thirdParty.length === 0 && (
            <p data-dsh-forge-plugins-empty-third-party="" style={hintStyle}>
              {t('overview.plugins.emptyThirdParty')}
            </p>
          )}
        </>
      )}

      {confirming !== undefined && (
        <DisableConfirm
          t={t}
          row={confirming}
          onConfirm={confirmDisable}
          onCancel={cancelConfirm}
        />
      )}

      {toastText !== undefined && (
        <div role="status" aria-live="polite" data-dsh-forge-plugins-toast="" style={toastCardStyle}>
          <p style={{ ...bodyStyle, margin: '0' }}>{toastText}</p>
          <ChromeButton
            type="button"
            aria-label={t('overview.plugins.toast.dismiss')}
            data-dsh-forge-plugins-toast-dismiss=""
            style={{ ...ghostButtonStyle, height: '24px', padding: '0 8px' }}
            onClick={() => { setToastText(undefined) }}
          >
            <span aria-hidden="true">✕</span>
          </ChromeButton>
        </div>
      )}
    </section>
  )
}

/** Inputs of {@link DisableConfirm}. */
interface DisableConfirmProps {
  t: (key: WorkbenchKey) => string
  row: PluginRow
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The disable double-confirm (ui-design Interactions): r24 dialog, 标题
 * 「禁用插件」+ 影响说明, riding the shared DialogFrame family — focus lands on
 * the CANCEL button (the dialog-safe default; the confirm is destructive-
 * tinted), Tab/Shift+Tab trap, Esc/mask/✕ dismiss, focus returns to the row's
 * 禁用 trigger on cancel (the section wires that leg).
 */
function DisableConfirm(props: DisableConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const generatedId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const titleId = `dsh-forge-plugins-disable-title-${generatedId}`

  return (
    <DialogFrame
      role="alertdialog"
      ariaLabelledBy={titleId}
      initialFocus={cancelRef}
      onDismiss={props.onCancel}
      dialogDataKey="plugins-disable-confirm"
    >
      <DialogHeader
        id={titleId}
        title={props.t('overview.plugins.confirm.title')}
        closeLabel={props.t('overview.plugins.confirm.cancel')}
        onClose={props.onCancel}
      />
      <DialogBody>
        <div>
          <div style={rowLabelStyle}>{props.t('overview.plugins.title')}</div>
          <p style={pluginNameStyle}>{props.row.name}</p>
        </div>
        {/* The impact copy — the reason the dialog exists (ui-design). */}
        <p data-dsh-forge-plugin-impact="" style={impactStyle}>
          {props.t('overview.plugins.confirm.impact')}
        </p>
        {/* The 运行中 spinner is NOT here: the confirm closes the dialog and the
            row's action button carries the transitioning 态 (ui-design States). */}
        <p style={rowLabelStyle}>
          {props.t('overview.plugins.thirdPartyHint')}
        </p>
      </DialogBody>
      <DialogFooter>
        <ChromeButton
          ref={cancelRef}
          type="button"
          data-dsh-forge-plugin-cancel=""
          style={ghostButtonStyle}
          onClick={props.onCancel}
        >
          {props.t('overview.plugins.confirm.cancel')}
        </ChromeButton>
        <ChromeButton
          type="button"
          data-dsh-forge-plugin-confirm=""
          style={destructiveButtonStyle}
          onClick={props.onConfirm}
        >
          {props.t('overview.plugins.confirm.confirm')}
        </ChromeButton>
      </DialogFooter>
    </DialogFrame>
  )
}
