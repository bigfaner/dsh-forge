/**
 * The UF5 会话发起入口, BUILD half (task 5.10; the 5.11 integrate task mounts
 * it into the 5.6 DAG node cards and the 5.7 detail panel and swaps the
 * mocked service face for the real remotes). ONE component, TWO mount
 * variants (ui-design Placement): the node-card hover/:focus-within icon
 * button (28×28 r14 ghost, chat glyph, aria-named) and the detail-panel
 * md primary button (「▶ 发起会话」) — the same machine either way, so the
 * two mounts cannot diverge (AC1).
 *
 * Flow (Interface 2 / Interface 5 as fixed by 4.1/4.2):
 *
 *   probe   — `getTaskPrompt({projectRoot, taskKey})` on mount:
 *             available → entry enabled (promptText cached byte-faithful);
 *             ERR_NO_PROMPT / ERR_FORGE_CLI_UNAVAILABLE → disabled + reason
 *             tooltip (AC5), never an error surface.
 *   confirm — click opens the ConfirmPanel (prompt preview default-collapsed,
 *             expand-to-full, confirm button = default focus → Enter launches;
 *             ≤1 click, ≤3s budget).
 *   launch  — runSessionLaunchChain: tier 1 host channel → tier 2
 *             `ctx.remote.session` same-semantics retry (carrying the tier-1
 *             recovery sessionId) → tier 3 frozen fallback (clipboard +
 *             front window + manual-guidance toast, M1 session-focus form).
 *             A channel failure ROUTES down the chain — it is never presented
 *             as an error; only chain exceptions and a denied clipboard
 *             surface the error dialog (三终态齐备, 无静默).
 *   success — sessionId → recordSessionLink({projectId, taskKey: QUALIFIED
 *             `<featureSlug>/<localId>` (2.5 dialect), sessionId}) →
 *             onLaunched(sessionId) (5.11: 切会话视图 + ctx.uiWorkspace.
 *             openSession — the M1 localStorage poke is boot-time only).
 */
import { useEffect, useRef, useState } from 'react'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { MOCK_SESSION_LAUNCH_SERVICES } from '../../mocks/workbench'
import type { SessionLaunchServices, SessionLaunchTaskRef } from '../../contract'
import type { SessionLaunchInput, SessionLaunchResult } from '../../session-launch'
import { ConfirmPanel } from './launch/ConfirmPanel'
import { DegradedToast, LaunchErrorDialog, primaryButtonStyle } from './launch/LaunchStates'

/** The workbench dialect task address (task 2.5): `<featureSlug>/<localId>`. */
export function qualifyTaskKey(featureSlug: string, localId: string): string {
  return `${featureSlug}/${localId}`
}

/**
 * The launch chain's injectable legs (the service face's remote-shaped
 * members — split out so the pure runner is unit-testable without React).
 */
export interface LaunchChainDeps {
  /** Tier 1: the host-half DF004 main channel. */
  launchHostChannel: (input: SessionLaunchInput) => Promise<SessionLaunchResult>
  /** Tier 2: the renderer-side `ctx.remote.session` retry, same semantics. */
  launchClientChannel: (input: SessionLaunchInput) => Promise<SessionLaunchResult>
  /** Tier 3 leg 1: clipboard; resolves false when denied/failed. */
  copyToClipboard: (text: string) => Promise<boolean>
  /** Tier 3 leg 2: bring the main window to front. */
  bringToFront: () => void
}

/** Terminal outcomes of the chain — all three explicit, none silent (AC3). */
export type LaunchChainOutcome =
  | { readonly kind: 'launched'; readonly sessionId: string }
  | { readonly kind: 'degraded' }
  | {
    readonly kind: 'failed'
    /** Which error copy the dialog shows (AC5/AC6 error mapping). */
    readonly reason: 'clipboard-denied' | 'unexpected'
    readonly detail: string
  }

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

/**
 * The Interface 5 degradation chain, pure: tier 1 → tier 2 → tier 3.
 *
 * Both tier-1 reason codes ROUTE (never display): ERR_HOST_NOT_READY
 * (channel absent) and ERR_SESSION_CHANNEL_UNAVAILABLE (leg failed/timed
 * out, possibly after adopting a session) both fall through to the tier-2
 * renderer retry — carrying `sessionId` when tier 1 provided one, so the
 * adopt + re-prompt stays replay-safe. A tier-2 failure lands in the frozen
 * tier-3 fallback: the verbatim prompt to the clipboard + the main window
 * fronted (the toast itself is presentation, the caller's job). Only a
 * DENIED clipboard breaks the fallback's deliverability — that, and a thrown
 * rejection (an assembly fault, per the 4.2 error convention), resolve
 * `failed`.
 */
export async function runSessionLaunchChain(
  input: SessionLaunchInput,
  deps: LaunchChainDeps,
): Promise<LaunchChainOutcome> {
  try {
    const tier1 = await deps.launchHostChannel(input)
    if (tier1.ok) return { kind: 'launched', sessionId: tier1.sessionId }

    const tier2Input: SessionLaunchInput = tier1.sessionId === undefined
      ? input
      : { ...input, sessionId: tier1.sessionId }
    const tier2 = await deps.launchClientChannel(tier2Input)
    if (tier2.ok) return { kind: 'launched', sessionId: tier2.sessionId }

    const copied = await deps.copyToClipboard(input.promptText)
    if (!copied) {
      return {
        kind: 'failed',
        reason: 'clipboard-denied',
        detail: `clipboard denied after channel failures (${tier1.reasonCode}, ${tier2.reasonCode})`,
      }
    }
    deps.bringToFront()
    return { kind: 'degraded' }
  } catch (error) {
    return { kind: 'failed', reason: 'unexpected', detail: describeError(error) }
  }
}

/** Probe state: the availability verdict + the cached byte-faithful prompt. */
type ProbeState =
  | { readonly phase: 'probing' }
  | { readonly phase: 'available'; readonly promptText: string }
  | {
    readonly phase: 'unavailable'
    readonly reasonCode: 'ERR_NO_PROMPT' | 'ERR_FORGE_CLI_UNAVAILABLE'
    readonly detail?: string
  }

/** Entry stage: which overlay (if any) the entry presents. */
export type LaunchStage = 'idle' | 'confirm' | 'degraded' | 'failed' | 'done'

/** The two ui-design mount variants (Placement). */
export type SessionLaunchEntryVariant = 'node-hover' | 'panel-primary'

/** ui-design node-card icon button: 28×28 r14 ghost. */
const iconButtonStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  height: '28px',
  justifyContent: 'center',
  padding: '0',
  width: '28px',
} as const

const chatGlyphStyle = { display: 'block' } as const

/** A minimal chat-bubble glyph (inline SVG — no upstream icon import at build stage). */
function ChatGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" style={chatGlyphStyle}>
      <path
        d="M2.5 3.5h11v7h-6.4L4 13.2v-2.7H2.5z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  )
}

/** Inputs of {@link SessionLaunchEntry}. */
export interface SessionLaunchEntryProps {
  /** The mount variant — presentation only; both run the same machine (AC1). */
  variant: SessionLaunchEntryVariant
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The task being launched (identity + cwd + title). */
  task: SessionLaunchTaskRef
  /** Success leg — 5.11 wires 切会话视图 + ctx.uiWorkspace.openSession(sessionId). */
  onLaunched?: (sessionId: string) => void
  /** Service seam: absent members keep the build-stage mock (5.11 injects the real face). */
  services?: Partial<SessionLaunchServices>
}

/**
 * The launch entry: trigger (variant-styled) + the confirm dialog / degraded
 * toast / error dialog overlays. The trigger disables while probing or
 * unavailable — with the reason as its tooltip (AC5).
 */
export function SessionLaunchEntry(props: SessionLaunchEntryProps) {
  const services: SessionLaunchServices = { ...MOCK_SESSION_LAUNCH_SERVICES, ...props.services }
  const taskKey = qualifyTaskKey(props.task.featureSlug, props.task.localId)

  const [probe, setProbe] = useState<ProbeState>({ phase: 'probing' })
  const [stage, setStage] = useState<LaunchStage>('idle')
  const [initiating, setInitiating] = useState(false)
  const [failureDetail, setFailureDetail] = useState<string | undefined>(undefined)
  const [failureReason, setFailureReason] = useState<'clipboard-denied' | 'unexpected'>('unexpected')
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Availability probe (mount-once): getTaskPrompt doubles as the prompt
  // fetch — the cached promptText is what the preview shows AND what the
  // launch posts, byte-for-byte.
  useEffect(() => {
    let alive = true
    void services.probe({ projectRoot: props.task.codeRoot, taskKey }).then((result) => {
      if (!alive) return
      if (result.available) {
        setProbe({ phase: 'available', promptText: result.promptText })
      } else {
        setProbe({
          phase: 'unavailable',
          reasonCode: result.reasonCode,
          ...(result.detail === undefined ? {} : { detail: result.detail }),
        })
      }
    })
    return () => { alive = false }
    // The task identity is fixed for an entry instance; services merges are
    // not part of the probe contract.
  }, [])

  const closeToIdle = (): void => {
    setStage('idle')
    triggerRef.current?.focus()
  }

  const startLaunch = async (): Promise<void> => {
    if (probe.phase !== 'available' || initiating) return
    const input: SessionLaunchInput = {
      promptText: probe.promptText,
      title: props.task.title,
      cwd: props.task.codeRoot,
    }
    setInitiating(true)
    const outcome = await runSessionLaunchChain(input, {
      launchHostChannel: services.launch,
      launchClientChannel: services.launchViaClientChannel,
      copyToClipboard: services.copyPromptToClipboard,
      bringToFront: services.bringMainWindowToFront,
    })
    setInitiating(false)

    if (outcome.kind === 'launched') {
      // Success chain: record the 挂接 (qualified key) — the session already
      // exists, so a persistence hiccup must not un-launch it; swallow and
      // still hand over to the session view.
      await services.recordSessionLink({
        projectId: props.task.projectId,
        taskKey,
        sessionId: outcome.sessionId,
      }).catch(() => undefined)
      setStage('done')
      props.onLaunched?.(outcome.sessionId)
      return
    }
    if (outcome.kind === 'degraded') {
      setStage('degraded')
      return
    }
    setFailureDetail(outcome.detail)
    setFailureReason(outcome.reason)
    setStage('failed')
  }

  // The retry path (error dialog): back into the confirm seat, chain re-run.
  const retryLaunch = (): void => {
    setStage('confirm')
    void startLaunch()
  }

  const triggerDisabled = probe.phase !== 'available' || initiating
  const triggerTitle = probe.phase === 'probing'
    ? props.t('launch.probing')
    : probe.phase === 'unavailable'
      ? props.t(probe.reasonCode === 'ERR_NO_PROMPT' ? 'launch.reason.noPrompt' : 'launch.reason.cliUnavailable')
      : undefined

  return (
    <>
      {props.variant === 'node-hover'
        ? (
          <ChromeButton
            ref={triggerRef}
            type="button"
            aria-label={props.t('launch.entry')}
            title={triggerTitle}
            disabled={triggerDisabled}
            data-dsh-forge-launch-trigger=""
            data-mount="node-hover"
            data-probe={probe.phase}
            data-stage={stage}
            style={iconButtonStyle}
            onClick={() => { setStage('confirm') }}
          >
            <ChatGlyph />
          </ChromeButton>
        )
        : (
          <ChromeButton
            ref={triggerRef}
            type="button"
            title={triggerTitle}
            disabled={triggerDisabled}
            data-dsh-forge-launch-trigger=""
            data-mount="panel-primary"
            data-probe={probe.phase}
            data-stage={stage}
            style={{ ...primaryButtonStyle, alignItems: 'center', display: 'inline-flex', gap: '6px', justifyContent: 'center' }}
            onClick={() => { setStage('confirm') }}
          >
            <span aria-hidden="true">▶</span>
            <span>{props.t('launch.primary')}</span>
          </ChromeButton>
        )}

      {stage === 'confirm' && probe.phase === 'available' && (
        <ConfirmPanel
          t={props.t}
          taskTitle={props.task.title}
          taskKeyId={taskKey}
          cwd={props.task.codeRoot}
          promptText={probe.promptText}
          initiating={initiating}
          onCancel={closeToIdle}
          onConfirm={() => { void startLaunch() }}
        />
      )}

      {stage === 'degraded' && (
        <DegradedToast
          title={props.t('launch.degraded.title')}
          copied={props.t('launch.degraded.copied')}
          guide={props.t('launch.degraded.guide')}
          dismissLabel={props.t('launch.degraded.dismiss')}
          onDismiss={closeToIdle}
        />
      )}

      {stage === 'failed' && (
        <LaunchErrorDialog
          titleId="dsh-forge-launch-error-title"
          title={props.t('launch.error.title')}
          reason={failureReason === 'clipboard-denied'
            ? props.t('launch.error.clipboard')
            : props.t('launch.error.unexpected')}
          detail={failureDetail}
          retryLabel={props.t('launch.error.retry')}
          closeLabel={props.t('launch.error.close')}
          onRetry={retryLaunch}
          onClose={closeToIdle}
        />
      )}
    </>
  )
}
