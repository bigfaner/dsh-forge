/**
 * Component C6 — the subagent 会话·任务元数据条 (M4 task 2.7; ui-design
 * §Component C6 / UF6, tech-design §Integration #3, Story 7 执行 agent 的
 * 任务身份可见): the h40 bar a SUBAGENT session's conversation carries,
 * naming the task that session executes — 血缘为准 (the LINEAGE derivation's
 * task, never the session title: Story 7-3's conflict = silent correction by
 * construction), 命名仅辅助.
 *
 * SEAT (the task-period 座位形态核对项, resolved): the design's first-named
 * `conversation.session` seat is a SINGLE slot — SlotCore single slots
 * SHADOW (a second registration would REPLACE the native ConversationSession,
 * i.e. the wrap/remount form the zero-invasion Hard Rule forbids) — so the
 * bar rides the design's OWN documented fallback seat: the upstream
 * `conversation.input.dock` list slot (「Full-width entries above the
 * composer card」, ui-goal's GoalBar / ui-conversation's TodoPanel are the
 * in-tree occupants) — 「composer 上方 forge 自绘条, 数据面不变」.
 * 声明合并纯增量: one list entry under {@link CONVERSATION_DOCK_SLOT}, no
 * native component wrapped or remounted, vendored untouched.
 *
 * States (ui-design C6·States): bound (the lineage hit is UNIQUE → the full
 * bar: 「⟂ task <key> — <title> / <status>」 Pill + 「查看任务」 ghost, click
 * → the C5 task-detail dock) / ambiguous (多任务共会话 → 「该会话执行中」
 * secondary text, no task number, no jump — the 2.5 session-level
 * granularity limitation's presentation) / unbound (a non-task subagent or
 * a degraded snapshot → renders NOTHING).
 *
 * The module's three layers stay pure-testable: {@link deriveMetadataBinding}
 * (the session→task reverse derivation over the 2.5 lineage service — pure,
 * 不落库), {@link MetadataBar} (the presentation bar — props only), and
 * {@link MetadataBarDock} + {@link installMetadataBar} (the seat host — the
 * guarded faces in, the bar out).
 */
import { useEffect, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer-owned slots service (ctx.slots) Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { CONVERSATION_DOCK_SLOT } from '../../contract'
import { deriveTaskBinding, lineageSnapshotOf } from '../../lineage'
import type {
  LineageSessionsSource, LineageSessionsSnapshot, LineageTaskRef,
} from '../../lineage'
import type { SessionLink, TaskStatus } from '../../ipc-types'
import { TASK_STATUS_DOT_STATE, taskStatusShortLabel } from '../../i18n/task-status'
import type { TaskStatusTranslate } from '../../i18n/task-status'
import { ChromeButton } from '../chrome/ChromeButton'
import { ghostButtonStyle } from '../../views/tasks/launch/LaunchStates'

// ---------------------------------------------------------------------------
// The seat's local type view (the structural-twin discipline)
// ---------------------------------------------------------------------------

/**
 * The owner share `conversation.input.dock` entries receive — the STRUCTURAL
 * TWIN of ui-conversation's `InputZone` (that package is not a linked peer of
 * this plugin, so its SlotMap declaration is mirrored here with the exact
 * subset this entry reads; the runtime owner is the real zone — extra fields
 * flow through unseen, and a drift upstream surfaces as this twin failing to
 * compile, never as a silent behavior change).
 */
export interface MetadataDockZone {
  /** The session's own snapshot (SessionSnapshot twin: identity + subagent address). */
  readonly session: {
    readonly sessionId: string
    readonly subagent: {
      readonly address: {
        readonly parentSessionId: string
        readonly childSessionId: string
        readonly mode: 'one-shot' | 'continuable'
      }
    } | null
  }
  /** The input state (unread here — the twin keeps the owner contract honest). */
  readonly input: unknown
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * The mirror of ui-conversation's declaration (kind/scope verbatim; the
     * owner narrowed onto {@link MetadataDockZone} — see its doc). If this
     * program ever compiles together WITH ui-conversation's own merge, the
     * duplicate member is a compile error — the loud drift alarm, by design.
     */
    'conversation.input.dock': { kind: 'list'; scope: 'session'; owner: MetadataDockZone }
  }
}

// ---------------------------------------------------------------------------
// The binding derivation (session → task, the reverse of the 2.5 binding)
// ---------------------------------------------------------------------------

/** The bar's three-state product (undefined = unbound → render nothing). */
export type MetadataBarBinding =
  | {
    readonly kind: 'bound'
    readonly taskKey: string
    readonly title: string
    readonly status: TaskStatus
  }
  | { readonly kind: 'ambiguous' }

/** One task's derivation input: the task ref + its session_links rows. */
export interface MetadataTaskSource {
  readonly task: LineageTaskRef
  readonly links: readonly SessionLink[]
}

/** The ancestry walk's cycle/depth guard (the 1.4 tree-derive defense numbers). */
const ANCESTRY_LIMIT = 64

/**
 * Derive one session's task binding (点击时计算 discipline — pure, re-runnable,
 * 不落库): walk the session's ancestor chain up to its TOP (the byId parentId
 * walk), then count the tasks whose 2.5 binding COVERS this session — a task
 * covers it when one of its badges (a session_links row still present in byId,
 * active OR ended) hits any chain node, or the session itself sits inside the
 * task's executing-subagents tree. UNIQUE → bound (the task's key/title/status
 * — the LINEAGE's task, never the session name); >1 → ambiguous (多任务共会话,
 * the session-level granularity limitation); 0 / absent snapshot / not a
 * subagent row → undefined (unbound — the bar stays absent, silent degrade).
 * @param sessionId - the subagent session the bar addresses.
 * @param snapshot - the guarded upstream sessions snapshot (undefined = degraded).
 * @param sources - the candidate tasks + their links (undefined = no data yet).
 * @returns the binding, or undefined for the unbound state.
 */
export function deriveMetadataBinding(
  sessionId: string,
  snapshot: LineageSessionsSnapshot | undefined,
  sources: readonly MetadataTaskSource[] | undefined,
): MetadataBarBinding | undefined {
  if (snapshot === undefined || sources === undefined || sources.length === 0) return undefined
  const row = snapshot.byId[sessionId]
  // 仅 subagent 实例 (AC): an absent row or a top row renders nothing.
  if (row === undefined || row.origin !== 'subagent') return undefined

  // The ancestor chain (self → top): parentId links up through the subagent
  // tree; the top (a non-subagent row, or a parent byId no longer knows —
  // whose badges are skipped by the service anyway) ends the walk. The guard
  // set doubles as the cycle defense (the 1.4 discipline).
  const chain = new Set<string>([sessionId])
  let cursor: string | undefined = row.parentId
  let depth = 0
  while (typeof cursor === 'string' && cursor !== '' && !chain.has(cursor) && depth < ANCESTRY_LIMIT) {
    chain.add(cursor)
    const parent = snapshot.byId[cursor]
    if (parent === undefined || parent.origin !== 'subagent') break
    cursor = parent.parentId
    depth += 1
  }

  const matches: LineageTaskRef[] = []
  for (const source of sources) {
    const binding = deriveTaskBinding({ task: source.task, links: source.links, sessions: snapshot })
    const covered = binding.sessionTaskBadges.some(badge => chain.has(badge.sessionId))
      || binding.executingSubagents.some(hit => hit.sessionId === sessionId)
    if (covered) matches.push(source.task)
  }
  if (matches.length === 1) {
    const task = matches[0] as LineageTaskRef
    return { kind: 'bound', taskKey: task.key, title: task.title, status: task.status }
  }
  if (matches.length > 1) return { kind: 'ambiguous' }
  return undefined
}

// ---------------------------------------------------------------------------
// The bar (pure presentation)
// ---------------------------------------------------------------------------

/** ui-design C6·Layout: bg-layer-2, r12, h40, pad 0 12 — full-width dock entry. */
const barStyle = {
  alignItems: 'center',
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  borderRadius: '12px',
  boxSizing: 'border-box',
  display: 'flex',
  gap: '8px',
  height: '40px',
  minWidth: 0,
  padding: '0 12px',
  width: '100%',
} as const

/** The left cluster: transparent, no border — the bar is the affordance. */
const clusterStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  display: 'flex',
  font: 'inherit',
  gap: '6px',
  minWidth: 0,
  padding: '0',
  textAlign: 'left',
} as const

/** The mono task key (the 代码栈 dialect — 12/18). */
const keyStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '0 0 auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** The task title (the flexible middle — ellipsis, full text on `title`). */
const titleStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  flex: '1 1 auto',
  fontSize: '12px',
  lineHeight: '18px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** The 状态 Pill (the StateDot carries the color; the label the redundancy). */
const statusPillStyle = {
  alignItems: 'center',
  borderRadius: '8px',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  color: 'var(--dsw-alias-label-secondary, inherit)',
  display: 'inline-flex',
  flex: '0 0 auto',
  fontSize: '12px',
  gap: '4px',
  lineHeight: '18px',
  padding: '0 6px',
  whiteSpace: 'nowrap',
} as const

/** The ambiguous state's 「该会话执行中」 次文字. */
const secondaryStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

/** Inputs of {@link MetadataBar}. */
export interface MetadataBarProps {
  /** The locale seat (the shell's `t`). */
  t: TaskStatusTranslate
  /** The derived binding — undefined (unbound) renders NOTHING. */
  readonly binding: MetadataBarBinding | undefined
  /**
   * The 双向跳转 seam: click (the bar or 「查看任务」) → open the task's C5
   * detail dock. Absent = the bound bar stays informational (no cursor, no
   * button); ambiguous NEVER jumps (no unique task to open).
   */
  readonly onOpenTask?: ((taskKey: string) => void) | undefined
}

/**
 * The bar itself (ui-design C6). Unbound = null (the seat renders nothing);
 * ambiguous = the degraded text bar; bound = the full bar whose every leg
 * (cluster button, bar body, 「查看任务」 ghost) fires the ONE open seam.
 */
export function MetadataBar(props: MetadataBarProps): ReactNode {
  const { binding } = props
  if (binding === undefined) return null
  if (binding.kind === 'ambiguous') {
    return (
      <div data-dsh-forge-metadata-bar="" data-dsh-forge-metadata-state="ambiguous" style={barStyle}>
        <span style={secondaryStyle}>{props.t('metadata.executing')}</span>
      </div>
    )
  }
  const open = (): void => { props.onOpenTask?.(binding.taskKey) }
  const clickable = props.onOpenTask !== undefined
  const stopAndOpen = (event: MouseEvent): void => {
    event.stopPropagation()
    open()
  }
  return (
    <div
      data-dsh-forge-metadata-bar=""
      data-dsh-forge-metadata-state="bound"
      data-dsh-forge-metadata-task={binding.taskKey}
      style={{ ...barStyle, ...(clickable ? { cursor: 'pointer' } : {}) }}
      {...(clickable ? { onClick: open } : {})}
    >
      <ChromeButton
        type="button"
        disabled={!clickable}
        data-dsh-forge-metadata-cluster=""
        style={{ ...clusterStyle, ...(clickable ? { cursor: 'pointer' } : { cursor: 'default' }) }}
        {...(clickable
          ? {
            'aria-label': `${props.t('metadata.viewTask')}: task ${binding.taskKey} — ${binding.title}`,
            onClick: stopAndOpen,
          }
          : {})}
      >
        <span aria-hidden="true">⟂</span>
        <span style={{ ...keyStyle, color: 'inherit' }}>{props.t('metadata.taskPrefix')}</span>
        <span style={keyStyle}>{binding.taskKey}</span>
        <span aria-hidden="true" style={keyStyle}>—</span>
        <span style={titleStyle} title={binding.title}>{binding.title}</span>
        <span data-dsh-forge-metadata-status={binding.status} style={statusPillStyle}>
          <StateDot state={TASK_STATUS_DOT_STATE[binding.status]} />
          <span>{taskStatusShortLabel(binding.status, props.t)}</span>
        </span>
      </ChromeButton>
      {clickable && (
        <ChromeButton
          type="button"
          data-dsh-forge-metadata-open=""
          style={ghostButtonStyle}
          onClick={stopAndOpen}
        >
          {props.t('metadata.viewTask')}
        </ChromeButton>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The seat host + installer
// ---------------------------------------------------------------------------

/** The installer's face — every leg guarded; an absent leg degrades (unbound). */
export interface MetadataBarFace {
  /** The locale seat. */
  readonly t: TaskStatusTranslate
  /** The guarded upstream sessions source (absent = snapshot degraded → unbound). */
  readonly sessions?: LineageSessionsSource | undefined
  /**
   * The candidate tasks + links read (bridge-gated, best-effort): the board's
   * task list with each task's session_links rows. Rejections/absence answer
   * unbound — the bar simply stays away (BIZ-resilience-001, silent degrade).
   */
  readonly readSources?: (() => Promise<readonly MetadataTaskSource[] | undefined>) | undefined
  /** The 双向跳转 seam (the C5 dock bridge; absent = informational bar). */
  readonly onOpenTask?: ((taskKey: string) => void) | undefined
}

/** The dock entry's composed props (the mirrored owner zone + the face). */
export type MetadataBarDockProps = MetadataDockZone & MetadataBarFace

/**
 * The dock entry host: 仅 subagent 实例 (a null `session.subagent` renders
 * nothing before any work), the sources fetched per session (点击时计算 —
 * one read per session view, never a standing subscription), the derivation
 * recomputed per render over the guarded snapshot (the owner zone re-flows
 * on upstream session updates — 持鲜 without a forge-side subscription).
 */
export function MetadataBarDock(props: MetadataBarDockProps): ReactNode {
  const subagent = props.session.subagent
  const sessionId = props.session.sessionId
  const readSources = props.readSources
  const [sources, setSources] = useState<readonly MetadataTaskSource[] | undefined>(undefined)
  useEffect(() => {
    // 非 subagent 实例 / 无取数缝 = nothing to fetch (unbound, silently).
    if (subagent === null || readSources === undefined) return
    let cancelled = false
    readSources()
      .then((value) => { if (!cancelled) setSources(value) })
      .catch(() => { /* silent degrade — the bar stays away */ })
    return () => { cancelled = true }
    // The face is install-time stable; a session switch re-reads.
  }, [sessionId, readSources, subagent])
  if (subagent === null) return null
  const binding = deriveMetadataBinding(sessionId, lineageSnapshotOf(props.sessions), sources)
  return (
    <MetadataBar
      t={props.t}
      binding={binding}
      {...(props.onOpenTask === undefined ? {} : { onOpenTask: props.onOpenTask })}
    />
  )
}

/** The dock entry id (the list slot's cell — distinct from todo/goal/queue). */
export const METADATA_BAR_DOCK_ID = 'forge-task-metadata'

/** The dock entry order (todo=0 / goal=10 precede; the bar rides last). */
export const METADATA_BAR_DOCK_ORDER = 20

/**
 * Install the C6 bar's dock entry (tech-design §Integration #3 — the resolved
 * fallback seat): ONE list registration under {@link CONVERSATION_DOCK_SLOT},
 * arrival-ordered on ui-conversation's declaration, disposed with the fiber.
 * 声明合并纯增量 — no native occupant touched (Hard Rule: 零侵入).
 * @param ctx - client root context.
 * @param face - the locale seat + the three guarded legs.
 * @returns disposer removing the registration.
 */
export function installMetadataBar(ctx: ClientContext, face: MetadataBarFace): () => void {
  return ctx.slots.inject(CONVERSATION_DOCK_SLOT, () => {
    const dispose = ctx.slots.register({
      name: CONVERSATION_DOCK_SLOT,
      id: METADATA_BAR_DOCK_ID,
      order: METADATA_BAR_DOCK_ORDER,
      registrant: 'forge-workbench: task metadata bar',
      inject: (): MetadataBarFace => face,
    }, MetadataBarDock)
    return () => { dispose() }
  })
}
