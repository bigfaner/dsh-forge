/**
 * The UF1 编排态角标谱 (task 3.7, ui-design UF1 编排态角标表 + 全局规则
 * 枚举 label 映射): the dispatch.state → Pill presentation table the node
 * cards / list rows mount — 待启动 中性描边 / 执行中 品牌蓝 + StateDot
 * 呼吸点 / 待审批 warn 可点(打开审批 dock 并滚动定位对应条目)/ 失败
 * error / 已提交 success 一闪 0.3s 后回落普通状态角标. Unknown states fall
 * back to the RAW value in a neutral Pill (映射外未知值兜底 = 数据原值原样
 * 透出 — 状态语义归 forge 数据, the mapping is presentation only).
 *
 * Labels ride the locale halves (`tasks.orch.*`, the 枚举值 → 文案 mapping,
 * zh/en via the upstream locale mechanism — no second copy anywhere); the
 * breathing dot is the plugin's own inline SMIL (the LaunchSpinner precedent:
 * no stylesheet pipeline, inert in reduced-motion user agents).
 *
 * The module ALSO owns the aria-live 播报节流 policy (ui-design 全局规则:
 * 同一任务 2s 窗口内多次态变仅播报终态;批量回流聚合为一条计数播报;一次
 * 感知批至多 1 条聚合播报,审批计数变化单列 1 条;节流独立于动效降级) —
 * a pure, clock-fed announcer the 3.9 board integration mounts beside the
 * badge spectrum so every orchestration reflux announcement goes through ONE
 * throttle.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DispatchState } from '../../../ipc-types'
import type { WorkbenchKey } from '../../../locale/en'
import { fillTemplate } from '../../overview/format'
import { ChromeButton } from '../../../components/chrome/ChromeButton'

/** The locale seat shape this module's consumers pass through. */
export type DispatchTranslate = (key: WorkbenchKey) => string

// ---------------------------------------------------------------------------
// The 枚举映射表 (spec: the mapping table IS the acceptance object)
// ---------------------------------------------------------------------------

/** The badge spectrum's visual tones (prototype .pill.* classes verbatim). */
export type OrchTone = 'outline' | 'blue' | 'warn' | 'error' | 'success'

/** One state's presentation spec. */
export interface OrchBadgeSpec {
  readonly tone: OrchTone
  readonly labelKey: WorkbenchKey
  /** 执行中: StateDot 呼吸点 inside the pill. */
  readonly breathing: boolean
  /** 待审批: clickable = open the dock + locate the entry (卡片侧审批入口). */
  readonly clickable: boolean
  /** 已提交: success flash 0.3s, then fall back to the normal status pill. */
  readonly flashThenFallback: boolean
}

/**
 * dispatch.state → 角标谱 (一一对应, ui-design 编排态角标表). `done` is the
 * 已提交 flash face — after 0.3s the badge falls back to the caller's normal
 * status pill (回落普通状态角标).
 */
export const ORCH_BADGE_SPECS: Readonly<Record<DispatchState, OrchBadgeSpec>> = Object.freeze({
  starting: { tone: 'outline', labelKey: 'tasks.orch.starting', breathing: false, clickable: false, flashThenFallback: false },
  running: { tone: 'blue', labelKey: 'tasks.orch.running', breathing: true, clickable: false, flashThenFallback: false },
  awaiting: { tone: 'warn', labelKey: 'tasks.orch.awaiting', breathing: false, clickable: true, flashThenFallback: false },
  failed: { tone: 'error', labelKey: 'tasks.orch.failed', breathing: false, clickable: false, flashThenFallback: false },
  done: { tone: 'success', labelKey: 'tasks.orch.done', breathing: false, clickable: false, flashThenFallback: true },
})

/** The enum narrowing (defensive DTO reads — unknown strings stay presentable). */
export function isDispatchState(value: unknown): value is DispatchState {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ORCH_BADGE_SPECS, value)
}

/** The done flash's dwell (已提交 success 一闪 0.3s 后回落). */
export const ORCH_DONE_FLASH_MS = 300

// ---------------------------------------------------------------------------
// Styles (prototype pill classes, inline — no stylesheet pipeline)
// ---------------------------------------------------------------------------

const TONE_COLORS: Readonly<Record<OrchTone, { background: string; color: string }>> = Object.freeze({
  outline: {
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary, inherit)',
  },
  blue: {
    background: 'color-mix(in srgb, var(--dsw-alias-link, rgb(65, 118, 230)) 14%, transparent)',
    color: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  },
  warn: {
    background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary, rgb(245, 158, 11)) 14%, transparent)',
    color: 'var(--dsw-alias-state-warn-primary, rgb(245, 158, 11))',
  },
  error: {
    background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary, rgb(239, 68, 68)) 12%, transparent)',
    color: 'var(--dsw-alias-state-error-primary, rgb(239, 68, 68))',
  },
  success: {
    background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary, rgb(34, 197, 94)) 14%, transparent)',
    color: 'var(--dsw-alias-state-success-primary, rgb(34, 197, 94))',
  },
})

const pillBaseStyle = {
  alignItems: 'center',
  borderRadius: '11px',
  display: 'inline-flex',
  flex: '0 0 auto',
  fontSize: '12px',
  gap: '4px',
  height: '22px',
  lineHeight: '18px',
  padding: '2px 8px',
  whiteSpace: 'nowrap',
} as const

const pillStyleOf = (tone: OrchTone): Record<string, string | number> => ({
  ...pillBaseStyle,
  ...TONE_COLORS[tone],
  ...(tone === 'outline' ? { border: '1px solid var(--dsw-alias-border-l2, var(--dsh-border-color, CanvasText))' } : {}),
})

const pillButtonStyle = {
  border: 'none',
  cursor: 'pointer',
  font: 'inherit',
} as const

/**
 * The breathing dot (呼吸点, aria-hidden decoration): an inline SMIL opacity
 * loop — the LaunchSpinner precedent (self-contained, no stylesheet; inert
 * in reduced-motion user agents that disable SMIL, where the dot stays a
 * static state point — never a loss of information, the label carries it).
 */
export function BreathDot(props: { readonly color?: string | undefined }) {
  return (
    <span aria-hidden="true" data-dsh-forge-orch-dot="" style={{ display: 'inline-flex', flex: '0 0 auto', height: '8px', width: '8px' }}>
      <svg viewBox="0 0 8 8" width="8" height="8" focusable="false">
        <circle cx="4" cy="4" r="4" fill={props.color ?? 'currentColor'}>
          <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>
    </span>
  )
}

/** Inputs of {@link DispatchBadge}. */
export interface DispatchBadgeProps {
  /** The locale seat (the shell's `t`). */
  readonly t: DispatchTranslate
  /** The badge's task (the qualified board key — the awaiting entry locator). */
  readonly taskKey: string
  /** The dispatch row's state; unknown values render RAW in a neutral Pill. */
  readonly state: string
  /**
   * 待审批 click — open the approval dock AND locate this task's entry
   * (ui-design Interactions: 点击「待审批」角标 = 打开审批面板并定位该条目).
   * Absent renders a static (non-clickable) warn pill — the integration
   * always supplies it, tests may not.
   */
  readonly onOpenApproval?: ((taskKey: string) => void) | undefined
  /**
   * 已提交回落 face: after the 0.3s success flash the badge renders THIS
   * (the card's normal status pill). Absent → renders nothing after the
   * flash (the caller's own pill keeps its place).
   */
  readonly fallback?: ReactNode | undefined
}

/**
 * The 编排态角标 (`data-dsh-forge-orch-badge="<state>"`). The awaiting face
 * is a NATIVE button (the Hard-Rule Button contract: Tab reachable,
 * Enter/Space activation, the ChromeButton focus ring) with the aria-label
 * 全称 (任务 X 待审批,点击进入审批); every other face is a static span
 * with the tone's color + label (never color-only).
 */
export function DispatchBadge(props: DispatchBadgeProps) {
  const { t, taskKey, state } = props
  const spec = isDispatchState(state) ? ORCH_BADGE_SPECS[state] : null
  // The done flash: armed on (re-)entry into 'done', disarmed by the 0.3s
  // timer — the badge then renders the fallback (回落普通状态角标).
  const [flashed, setFlashed] = useState(state === 'done')
  const lastStateRef = useRef(state)
  useEffect(() => {
    if (lastStateRef.current !== state) {
      lastStateRef.current = state
      setFlashed(state === 'done')
    }
  }, [state])
  useEffect(() => {
    if (!flashed) return
    const timer = setTimeout(() => { setFlashed(false) }, ORCH_DONE_FLASH_MS)
    return () => { clearTimeout(timer) }
  }, [flashed])

  if (!spec) {
    // 未知值兜底: the RAW value, verbatim, in a neutral Pill.
    return (
      <span data-dsh-forge-orch-badge={state} data-dsh-forge-orch-unknown="true" style={pillStyleOf('outline')}>
        {state}
      </span>
    )
  }
  if (spec.flashThenFallback && !flashed) {
    return <>{props.fallback ?? null}</>
  }
  const label = t(spec.labelKey)
  if (spec.clickable) {
    const aria = fillTemplate(t('tasks.orch.awaiting.aria'), { key: taskKey })
    return (
      <ChromeButton
        type="button"
        aria-label={aria}
        title={t('tasks.orch.awaiting.tooltip')}
        data-dsh-forge-orch-badge={state}
        data-dsh-forge-orch-jump={taskKey}
        style={{ ...pillStyleOf(spec.tone), ...pillButtonStyle }}
        onClick={() => { props.onOpenApproval?.(taskKey) }}
      >
        {label}
      </ChromeButton>
    )
  }
  return (
    <span data-dsh-forge-orch-badge={state} style={pillStyleOf(spec.tone)}>
      {spec.breathing && <BreathDot />}
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// The aria-live 播报节流 (全局规则口径 — pure, clock-fed)
// ---------------------------------------------------------------------------

/** The announce window: same-task state changes inside it announce ONLY the final state. */
export const ORCH_ANNOUNCE_WINDOW_MS = 2000

/** One announcement line (structured; copy assembly stays in the locale halves). */
export type OrchAnnounceLine =
  | { readonly kind: 'task'; readonly taskKey: string; readonly state: DispatchState }
  /** 批量聚合 (≥2 tasks in one drain): `state === null` = mixed states. */
  | { readonly kind: 'batch'; readonly count: number; readonly state: DispatchState | null }
  /** 审批计数变化 — its own single line, never merged into the batch. */
  | { readonly kind: 'approval-count'; readonly count: number }

/** The announcer's mutable seat (one per live region). */
export interface DispatchAnnouncer {
  /** Record a task's state change (overwrites the pending window = 终态 wins). */
  pushState(taskKey: string, state: DispatchState): void
  /** Record the approval pending count (at most ONE line per drain). */
  pushApprovalCount(count: number): void
  /**
   * Emit the ready lines at `now` (ms): per-task windows not yet elapsed stay
   * buffered; ≥2 ready tasks aggregate into ONE batch line (一次感知批至多
   * 1 条聚合播报); a changed approval count rides as its own single line.
   */
  drain(now: number): OrchAnnounceLine[]
}

/** Build an announcer (the `windowMs` default = the 2s 口径). */
export function createDispatchAnnouncer(options?: { readonly windowMs?: number }): DispatchAnnouncer {
  const windowMs = options?.windowMs ?? ORCH_ANNOUNCE_WINDOW_MS
  // `at === null` = not yet anchored (buffered this drain cycle); the anchor
  // is the FIRST push's drain time and later pushes only overwrite the STATE
  // (终态 wins) — a task changing every <windowMs would otherwise starve.
  const pending = new Map<string, { state: DispatchState; at: number | null }>()
  let approvalCount: number | null = null
  let dirtyApproval = false
  return {
    pushState: (taskKey, state) => {
      const entry = pending.get(taskKey)
      if (entry === undefined) pending.set(taskKey, { state, at: null })
      else entry.state = state
    },
    pushApprovalCount: (count) => {
      if (approvalCount !== null && approvalCount === count) return
      approvalCount = count
      dirtyApproval = true
    },
    drain: (now) => {
      const lines: OrchAnnounceLine[] = []
      const ready: Array<[string, DispatchState]> = []
      for (const [taskKey, entry] of pending) {
        if (entry.at === null) entry.at = now
        if (now - entry.at >= windowMs) {
          ready.push([taskKey, entry.state])
          pending.delete(taskKey)
        }
      }
      if (ready.length === 1) {
        lines.push({ kind: 'task', taskKey: ready[0]![0], state: ready[0]![1] })
      } else if (ready.length >= 2) {
        const states = new Set(ready.map(([, state]) => state))
        lines.push({
          kind: 'batch',
          count: ready.length,
          state: states.size === 1 ? ready[0]![1] : null,
        })
      }
      if (dirtyApproval && approvalCount !== null) {
        lines.push({ kind: 'approval-count', count: approvalCount })
        dirtyApproval = false
      }
      return lines
    },
  }
}

/** Assemble a line's copy against the locale halves (the live region's text). */
export function orchAnnounceText(line: OrchAnnounceLine, t: DispatchTranslate): string {
  if (line.kind === 'approval-count') {
    return fillTemplate(t('tasks.approval.announce.arrived'), { count: String(line.count) })
  }
  if (line.kind === 'task') {
    return fillTemplate(t('tasks.orch.announce.task'), { key: line.taskKey, state: t(ORCH_BADGE_SPECS[line.state].labelKey) })
  }
  if (line.state === null) {
    return fillTemplate(t('tasks.orch.announce.batchMixed'), { count: String(line.count) })
  }
  return fillTemplate(t('tasks.orch.announce.batch'), { count: String(line.count), state: t(ORCH_BADGE_SPECS[line.state].labelKey) })
}
