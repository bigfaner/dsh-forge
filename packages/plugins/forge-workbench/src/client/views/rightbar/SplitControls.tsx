/**
 * The C9 分屏 controls (M4 task 4.4, ui-design §Component C9 + the a11y
 * baseline): the 工作台头 [分屏] menu and the 分隔条.
 *
 *   [分屏] menu   — a `conversation.session.header.utilities` LIST entry
 *                  (the 76px workbench header's right-aligned utilities row,
 *                  the MetadataBar list-seat discipline: append-only, no
 *                  native occupant touched). The menu offers the two views —
 *                  会话旁置 / 看板 (Menu: 会话旁置/看板) — and each pick adds
 *                  a pane through the model's `openPane` (tabs-model.ts: the
 *                  board via `openTab('board', { preferNewPane: true })`, the
 *                  aside via the 2.7 channel's exact `openResource(
 *                  subagentChatAddress, preferNewPane)` call). The aside entry
 *                  renders DISABLED while no subagent address is resolvable
 *                  (its target is a live subagent session — the C5/C6 jump
 *                  contexts' territory), never a dead click.
 *
 *   分隔条        — the a11y keyboard separator (`role="separator"` +
 *                  `aria-valuenow` = the current percentage): focused ←/→
 *                  steps ±2%, Shift ±10%, Home/End 复位 50/50, clamped exactly
 *                  like the drag (30%–70%, 两侧 pane 最小宽 30%), Enter/Space
 *                  无激活语义. Pointer drags commit EVERY move (即时存, no
 *                  preview-then-settle) into the model through the same clamp.
 *                  The NATIVE dockkit divider between the panes keeps its own
 *                  pointer drag and its own native clamps — the public seam
 *                  set (vendored untouched, the Hard Rule) carries no resize
 *                  verb, so the forge 分隔条 is the C9 ratio control and the
 *                  model state it commits is what the 4.5 seam collects.
 *
 * The separator mounts at the forge pane body's left edge (adjacent to the
 * native divider, INSIDE the pane so the native divider stays fully
 * draggable) with a ≥28px hit band (the a11y 命中区 baseline).
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import type { LineageSubagentAddress } from '../../lineage'
import type { WorkbenchKey } from '../../locale/en'
import {
  ratioFromDrag, stepSplitRatio, SPLIT_RATIO_MAX, SPLIT_RATIO_MIN,
  type RightbarSplitFace, type SplitPaneStore,
} from './tabs-model'

// ---------------------------------------------------------------------------
// The utilities seat's local type view (the structural-twin discipline)
// ---------------------------------------------------------------------------

/**
 * The owner share `conversation.session.header.utilities` entries receive —
 * the STRUCTURAL TWIN of ui-conversation's marker owner (that package is not
 * a linked peer of this plugin, so the declaration is mirrored here with the
 * exact subset this entry reads; a drift upstream surfaces as this twin
 * failing to compile, never as a silent behavior change).
 */
export interface ConversationHeaderUtilitiesZone {
  /** Marker field: entries receive no owner-specific values. */
  children?: never
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * The mirror of ui-conversation's declaration (kind/scope verbatim). If
     * this program ever compiles together WITH ui-conversation's own merge,
     * the duplicate member is a compile error — the loud drift alarm, by
     * design.
     */
    'conversation.session.header.utilities': { kind: 'list'; scope: 'session'; owner: ConversationHeaderUtilitiesZone }
  }
}

/** The utilities seat's name (the mirror above keys it into the SlotMap). */
export const CONVERSATION_HEADER_UTILITIES_SLOT = 'conversation.session.header.utilities'

// ---------------------------------------------------------------------------
// The [分屏] menu control
// ---------------------------------------------------------------------------

/** The translate seat the split controls read (the plugin's own `t`). */
export type SplitControlsTranslate = (key: WorkbenchKey) => string

/** The menu popover card (ui-design Menu 卡 r20 pad4). */
const MENU_CARD_STYLE = {
  background: 'var(--dsw-alias-bg-layer-2, #fff)',
  borderRadius: '20px',
  boxShadow: '0 8px 28px rgba(0, 0, 0, 0.18)',
  minWidth: '160px',
  padding: '4px',
  position: 'absolute',
  right: '0',
  top: 'calc(100% + 6px)',
  zIndex: 40,
} as const

/** One menu row. */
const MENU_ROW_STYLE = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  font: 'inherit',
  fontSize: '13px',
  gap: '8px',
  height: '30px',
  padding: '0 12px',
  textAlign: 'left',
  width: '100%',
} as const

/** The utilities-row control button (an icon-seat glyph button, h28). */
const SPLIT_BUTTON_STYLE = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  font: 'inherit',
  height: '28px',
  justifyContent: 'center',
  padding: '0 6px',
  width: '30px',
} as const

/** The split glyph: a rectangle with a vertical divider (the C9 mark). */
function SplitGlyph(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M 8 2.5 V 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

/** The [分屏] menu control's props. */
export interface SplitMenuControlProps {
  /** The plugin locale seat. */
  t: SplitControlsTranslate
  /** 添加 pane 并选视图 — the board pick's handler. */
  onOpenBoard: () => void
  /** 添加 pane 并选视图 — the aside pick's handler (the 会话旁置 row). */
  onOpenAside: () => void
  /** False = the aside row renders DISABLED (no resolvable subagent target). */
  asideAvailable: boolean
}

/**
 * The 工作台头 [分屏] control: the utilities-row button + the self-drawn
 * view menu (the TreeHeader popover discipline — role=menu/menuitem, Esc and
 * outside-pointer close, no upstream Menu dependency).
 * @returns the control.
 */
export function SplitMenuControl({ t, onOpenBoard, onOpenAside, asideAvailable }: SplitMenuControlProps): ReactNode {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (event: PointerEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => { document.removeEventListener('pointerdown', onDocPointerDown) }
  }, [open])
  const pick = (run: () => void): void => {
    setOpen(false)
    run()
  }
  return (
    <span
      ref={wrapRef}
      data-dsh-forge-split-menu=""
      style={{ display: 'inline-flex', position: 'relative' }}
    >
      <ChromeButton
        type="button"
        style={SPLIT_BUTTON_STYLE}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('rightbar.split.menu')}
        title={t('rightbar.split.menu')}
        data-dsh-forge-split-trigger=""
        onClick={() => { setOpen(!open) }}
      >
        <SplitGlyph />
      </ChromeButton>
      {open && (
        <div role="menu" data-dsh-forge-split-menu-list="" aria-label={t('rightbar.split.menu')} style={MENU_CARD_STYLE}>
          <button
            type="button"
            role="menuitem"
            style={MENU_ROW_STYLE}
            data-dsh-forge-split-menu-item="session-aside"
            disabled={!asideAvailable}
            aria-disabled={!asideAvailable}
            title={asideAvailable ? undefined : t('rightbar.split.menu.asideUnavailable')}
            onClick={() => { if (asideAvailable) pick(onOpenAside) }}
          >
            {t('rightbar.split.menu.aside')}
          </button>
          <button
            type="button"
            role="menuitem"
            style={MENU_ROW_STYLE}
            data-dsh-forge-split-menu-item="board"
            onClick={() => { pick(onOpenBoard) }}
          >
            {t('rightbar.split.menu.board')}
          </button>
        </div>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// The 分隔条 (the a11y separator)
// ---------------------------------------------------------------------------

/** The separator's outer hit band (≥28px wide — the 命中区 baseline). */
const SEPARATOR_HIT_STYLE = {
  cursor: 'col-resize',
  display: 'block',
  height: '100%',
  left: '0',
  position: 'absolute',
  top: '0',
  touchAction: 'none',
  width: '28px',
  zIndex: 30,
} as const

/** The 6px visual bar centered in the hit band (w6 可拖, hover 高亮 via focus-within/active styling). */
const SEPARATOR_BAR_STYLE = {
  background: 'var(--dsw-alias-border-l4, rgba(128, 128, 128, 0.45))',
  borderRadius: '3px',
  display: 'block',
  height: '100%',
  margin: '0 auto',
  transition: 'background 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
  width: '6px',
} as const

/** The drag gesture's captured start facts. */
interface DragStart {
  readonly clientX: number
  readonly ratio: number
  readonly containerPx: number
}

/** The 分隔条's props. */
export interface SplitSeparatorProps {
  /** The plugin locale seat. */
  t: SplitControlsTranslate
  /** The committed left-pane share (the model's ratio). */
  ratio: number
  /** The commit seam — every keyboard step and every drag move lands here. */
  onRatioChange: (ratio: number) => void
  /**
   * The split container's width in px, read ONCE per gesture (the drag math's
   * denominator). Absent / zero = the pane measures nothing (a jsdom mount) —
   * the drag degrades to the committed ratio, the keyboard path still works.
   */
  measureContainer?: (() => number) | undefined
}

/**
 * The C9 分隔条: `role="separator"` (slider semantics) + `aria-valuenow` = the
 * current percentage; focused ←/→ ±2% / Shift ±10% / Home/End 复位 50/50,
 * clamped like the drag; Enter/Space 无激活语义 (consumed, activating
 * nothing); pointer drags commit every move (即时存). The 6px visual bar sits
 * centered in a 28px hit band at the pane body's left edge — adjacent to the
 * native divider, which keeps its own native drag.
 * @returns the separator.
 */
export function SplitSeparator({ t, ratio, onRatioChange, measureContainer }: SplitSeparatorProps): ReactNode {
  const dragRef = useRef<DragStart | undefined>(undefined)
  const [dragging, setDragging] = useState(false)
  const percent = Math.round(clampPercent(ratio * 100))
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const key = event.key
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End'
      || key === 'Enter' || key === ' ') {
      // Handled keys are consumed (Enter/Space included — 无激活语义 means NO
      // activation, not a pass-through to whatever the host would scroll).
      event.preventDefault()
    }
    if (key === 'Enter' || key === ' ') return
    onRatioChange(stepSplitRatio(ratio, key, event.shiftKey))
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    dragRef.current = { clientX: event.clientX, ratio, containerPx: measureContainer?.() ?? 0 }
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // A synthetic/hostile pointer id (a jsdom event) — the gesture runs on
      // the move handlers without capture.
    }
    setDragging(true)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const start = dragRef.current
    if (start === undefined) return
    // An unmeasurable container (a zero-width mount) commits nothing — the
    // drag degrades rather than pinning the ratio at its start value.
    if (!(start.containerPx > 0)) return
    onRatioChange(ratioFromDrag(start.ratio, event.clientX - start.clientX, start.containerPx))
  }
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current === undefined) return
    dragRef.current = undefined
    setDragging(false)
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    } catch {
      // Not captured (see onPointerDown) — nothing to release.
    }
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('rightbar.split.separator')}
      aria-valuemin={SPLIT_RATIO_MIN * 100}
      aria-valuemax={SPLIT_RATIO_MAX * 100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
      data-dsh-forge-split-separator=""
      data-dragging={dragging || undefined}
      tabIndex={0}
      style={SEPARATOR_HIT_STYLE}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span
        aria-hidden="true"
        style={{ ...SEPARATOR_BAR_STYLE, ...(dragging ? { background: 'var(--dsw-alias-link, rgb(65, 118, 230))' } : {}) }}
      />
    </div>
  )
}

/** Keep a percentage read inside the aria band (a drifted ratio never shows out-of-band). */
function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 50
  return Math.min(SPLIT_RATIO_MAX * 100, Math.max(SPLIT_RATIO_MIN * 100, percent))
}

// ---------------------------------------------------------------------------
// The seat host + installer
// ---------------------------------------------------------------------------

/**
 * The split controls' installer face: the locale seat, the plugin-lifetime
 * split store, and the two LAZY legs (the late-boot lesson — an apply-time
 * `ctx.get` freezes an absent service in for the plugin's lifetime).
 */
export interface SplitControlsFace {
  /** The locale seat. */
  readonly t: SplitControlsTranslate
  /** The C9 split store (the menu's opens and the separator's commits land here). */
  readonly store: SplitPaneStore
  /** The controller subset resolver (absent = the pick degrades, no throw). */
  readonly getSplitFace?: (() => RightbarSplitFace | undefined) | undefined
  /** The aside target resolver (absent = the 会话旁置 row renders disabled). */
  readonly getAsideAddress?: (() => LineageSubagentAddress | undefined) | undefined
}

/** The utilities entry's composed props (the mirrored marker owner + the face). */
export type SplitControlSeatProps =
  & ConversationHeaderUtilitiesZone
  & InjectFace<SplitControlsFace>

/**
 * The utilities-row seat: the [分屏] menu over the split store. Each pick
 * resolves the controller face and the aside target AT CLICK TIME.
 */
export function SplitControlSeat({ t, store, getSplitFace, getAsideAddress }: SplitControlSeatProps): ReactNode {
  return (
    <SplitMenuControl
      t={t}
      asideAvailable={getAsideAddress?.() !== undefined}
      onOpenBoard={() => { store.openPane(getSplitFace?.(), { view: 'board' }) }}
      onOpenAside={() => {
        const address = getAsideAddress?.()
        if (address === undefined) return
        store.openPane(getSplitFace?.(), { view: 'session-aside', address })
      }}
    />
  )
}

/** The utilities entry's list id (the row's cell beside the upstream 📁▾). */
export const SPLIT_CONTROL_ID = 'forge-split'

/** The utilities entry's order (after the upstream 📁▾ entry's ascending run). */
export const SPLIT_CONTROL_ORDER = 100

/**
 * Install the 工作台头 [分屏] control (tech-design §Overview 交付线 4): ONE
 * list registration under the conversation header's utilities row,
 * arrival-ordered on ui-conversation's declaration, disposed with the fiber.
 * 声明合并纯增量 — no native occupant touched (Hard Rule: 零侵入); the seat
 * renders ONLY while a session body does (the utilities row's own phase rule
 * — the hero 新会话 phase carries no header icons).
 * @param ctx - client root context.
 * @param face - the locale seat + the split store + the two lazy legs.
 * @returns disposer removing the registration.
 */
export function installSplitControls(ctx: ClientContext, face: SplitControlsFace): () => void {
  return ctx.slots.inject(CONVERSATION_HEADER_UTILITIES_SLOT, () => {
    const dispose = ctx.slots.register({
      name: CONVERSATION_HEADER_UTILITIES_SLOT,
      id: SPLIT_CONTROL_ID,
      order: SPLIT_CONTROL_ORDER,
      registrant: 'forge-workbench: split controls',
      inject: (): SplitControlsFace => face,
    }, SplitControlSeat)
    return () => { dispose() }
  })
}
