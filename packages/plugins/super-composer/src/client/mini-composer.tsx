// mini-composer —— 底部一体卡替身（proposal §UI/UX 交互规格终态）。
//
// 四态状态机：S0 输入卡（简易 composer）/ S1 标题栏态（标题栏 + 简易 composer）/
// S2 对话态（消息流 + 完整控件行）/ C 悬浮球。视觉派生（derivePhase）：collapsed =
// C；展开 ∧ 有消息 = S2；active（chip ∨ 草稿 ∨ 消息）= S1；否则 S0。
//
// 转换表（proposal 转换表逐条）：标题栏热区开合（可展开判定 = 消息流非空）/
//「—」收球 /「⧉」退全屏 / Esc 逐层（S2→S1→C）/ 发送自动展开 / 流式钉死（一切自动
// 收起禁用）/ 30s 四条件空闲（无流式 ∧ 无草稿 ∧ 无焦点 ∧ 无 hover）→ 3s 预告
//（淡化 + 提示，任一条件恢复即取消）→ 收球 / 点球：未读直达 S2 否则回 S1/S0 /
// 鼠标离开不收起（鼠标位置 ≠ 注意力归属）。
//
// 标题栏：左「—」、中会话 title（热区承载）、右「⧉」；热区光标 = 应用风格 chevron
// 自定义光标（styles.ts 注入的 svg data-uri cursor，随主题暗色锚切换），tooltip =
// 应用风格浮层（跟随光标，非原生 title）。样式令牌化（--dsw-alias-*）随主题。
import { useCallback, useEffect, useRef, useState } from "react";

export type MiniComposerPhase = "s0" | "s1" | "s2" | "ball";

/** 会话消息投影（同 binding eventSource 快照切片——宿主任务注入数据渠道）。 */
export interface MiniComposerMessage {
  readonly id: string
  readonly role: "user" | "assistant"
  readonly content: string
}

/** 替身属性面（状态输入全部注入——组件不感知 cordis 服务与数据渠道装配）。 */
export interface MiniComposerProps {
  /** 会话 title（标题栏中位展示） */
  readonly title: string
  /** 共享草稿（同草稿机投影；空串 = 无草稿） */
  readonly draft: string
  /** 草稿内引用 chip 数量（occurrences 投影；>0 = active 判据之一） */
  readonly chipCount: number
  /** 当前会话消息流（非空 = 可展开判定 + active 判据） */
  readonly messages: readonly MiniComposerMessage[]
  /** 流式进行中（钉死一切自动收起） */
  readonly streaming: boolean
  /** 草稿变更（同草稿机 setDraft 同径；caret = 光标偏移——mention 官方检测入口） */
  readonly onDraftChange: (text: string, caret?: number) => void
  /** 发送（官方发送链 submit 同径；空草稿不触发） */
  readonly onSend: (text: string) => void
  /**
   * mention 菜单同壳面（官方 inputTriggers controller 模型投影——data-face
   * mentionMenuOf 组装；菜单闭/服务缺席 = undefined 不渲染）。候选与开合全在
   * 官方 controller：↑↓/Enter/Esc 走 arbitrate，点击走 pick——替身零自造源。
   */
  readonly mention?: MiniMentionMenu
  /**「⧉」退出全屏（恢复常规模式视图） */
  readonly onExitFullscreen: () => void
  /** 空闲阈值 ms（默认 30_000；测试注入缩短） */
  readonly idleMs?: number
  /** 预告时长 ms（默认 3_000；测试注入缩短） */
  readonly previewMs?: number
}

/** 视觉态（collapsed = C 球；expanded = 消息流展开） */
interface MiniComposerView {
  collapsed: boolean
  expanded: boolean
  preview: boolean
}

/** mention 菜单同壳面（官方 inputTriggers controller 模型投影——data-face 组装）。 */
export interface MiniMentionMenu {
  readonly open: boolean
  readonly groups: readonly {
    readonly source: string
    readonly items: readonly { readonly name: string; readonly label?: string; readonly description?: string }[]
  }[]
  readonly highlight: { readonly source: string; readonly index: number } | null
  onArbitrate(key: "up" | "down" | "enter" | "escape"): "consumed" | "pick-highlighted" | "pass"
  onPick(source: string, index: number): void
}

/**
 * 草稿分段（bug 49368004）：quote 引用 token（`〔引用：label〕`——quote-reference
 * mentionTextOf 序列化形状同形镜像，bug aced6f28 形状改判：旧 `@[label](quote:uuid)`
 * 与官方 projectUserText file-chip 投影形状集碰撞且 uuid 明面暴露）与普通明文拆开，
 * 供叠加层把明文段替换为原子 chip 渲染。
 * 官方 file mention `@"path"` / session wire `@[..](dsh-session:..)` 语法不误伤（新
 * 形状不含 `@`，形状集零交集）。
 */
export type QuoteSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "quote"; readonly raw: string; readonly label: string }

const QUOTE_TOKEN_RE = /〔引用：([^〕\n]*)〕/g

export function splitQuoteSegments(draft: string): readonly QuoteSegment[] {
  const segments: QuoteSegment[] = []
  let cursor = 0
  for (const match of draft.matchAll(QUOTE_TOKEN_RE)) {
    const start = match.index
    if (start > cursor) segments.push({ kind: "text", text: draft.slice(cursor, start) })
    segments.push({ kind: "quote", raw: match[0], label: match[1] ?? "" })
    cursor = start + match[0].length
  }
  if (cursor < draft.length) segments.push({ kind: "text", text: draft.slice(cursor) })
  return segments
}

/** 菜单键盘键 → 官方 arbitrate key（同壳键盘词汇——ArrowUp/Down 归一）。 */
export function mentionKeyOf(key: string): "up" | "down" | "enter" | "escape" | null {
  if (key === "ArrowUp") return "up"
  if (key === "ArrowDown") return "down"
  if (key === "Enter") return "enter"
  if (key === "Escape") return "escape"
  return null
}

/** active 判据：加 chip ∨ 草稿非空 ∨ 有消息（proposal 状态机表 S1 进入条件）。 */
export function isCardActive(props: Pick<MiniComposerProps, "draft" | "chipCount" | "messages">): boolean {
  return props.chipCount > 0 || props.draft.trim() !== "" || props.messages.length > 0
}

/** 可展开判定：标题栏开合热区仅在替身消息流非空（发过消息）时激活。 */
export function isExpandable(props: Pick<MiniComposerProps, "messages">): boolean {
  return props.messages.length > 0
}

/** 四条件空闲判据：无流式 ∧ 无草稿 ∧ 无焦点 ∧ 无 hover（proposal 转换表空闲行）。 */
export function isIdleEligible(
  props: Pick<MiniComposerProps, "draft" | "streaming">,
  focus: boolean,
  hover: boolean,
): boolean {
  return !props.streaming && props.draft.trim() === "" && !focus && !hover
}

/** 四态派生（纯函数——状态机表逐条映射）。 */
export function derivePhase(
  props: Pick<MiniComposerProps, "draft" | "chipCount" | "messages">,
  view: MiniComposerView,
): MiniComposerPhase {
  if (view.collapsed) return "ball"
  if (isExpandable(props) && view.expanded) return "s2"
  if (isCardActive(props)) return "s1"
  return "s0"
}

/** 30s 空闲 / 3s 预告默认时序（proposal 转换表）。 */
export const DEFAULT_IDLE_MS = 30_000
export const DEFAULT_PREVIEW_MS = 3_000

/** 悬浮球 glyph（官方图标清单无独立 chat-bubble 语义件——按 DESIGN.md 自绘刻度：16px、1px 描边、currentColor）。 */
function BallGlyph(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 3.5h11v7h-6l-3 2.8v-2.8h-2z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 发送箭头图标（官方 InputBar 主钮同源 path——16×16、fill currentColor）。 */
function SendArrowGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z"
        fill="currentColor"
      />
    </svg>
  )
}

/** 流式停止图标（官方 InputBar 停止钮同源——圆角方块 rect rx 3）。 */
function StopGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect x="3" y="3" width="10" height="10" rx="3" fill="currentColor" />
    </svg>
  )
}

/** 一体卡替身组件（状态机本体；全部样式令牌化——--dsw-alias-* 随主题）。 */
export function MiniComposerCard(props: MiniComposerProps): React.JSX.Element {
  const idleMs = props.idleMs ?? DEFAULT_IDLE_MS
  const previewMs = props.previewMs ?? DEFAULT_PREVIEW_MS
  const [view, setView] = useState<MiniComposerView>({ collapsed: false, expanded: false, preview: false })
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null)
  const [unread, setUnread] = useState(false)
  // 输入以本地态为源（bug f863404a）：官方共享 store 对替身 setDraft 的回灌投影存在
  // 周期性回摆（真机 fix-8 001-diag run3/run4 取证：post-setDraft 快照即时正确，~2s
  // 周期投影回读回摆空串）——受控源落在共享投影上会被 React 回滚清空 DOM。本地态承
  // DOM 真值，数据面经 onDraftChange 同步（即时发布已证），投影仅在外部值非本机回声
  // 且非空时采纳（chip 插入 / 他端写入）；空串不采纳（发送清稿由本组件显式收口）。
  const [draftLocal, setDraftLocal] = useState(props.draft)
  const pushedRef = useRef<string | null>(null)
  const seenCountRef = useRef(0)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const mirrorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const external = props.draft
    if (external === draftLocal || external === pushedRef.current || external === "") return
    setDraftLocal(external)
  }, [props.draft, draftLocal])

  const phase = derivePhase(props, view)
  const expandable = isExpandable(props)
  const expanded = phase === "s2"

  // 未读追踪：卡体在场即清账（seen = 当前消息数）；球态期间流式增长 = 未读。
  useEffect(() => {
    if (view.collapsed) {
      if (props.streaming && props.messages.length > seenCountRef.current) setUnread(true)
      return
    }
    seenCountRef.current = props.messages.length
    setUnread(false)
  }, [view.collapsed, props.streaming, props.messages.length])

  const setViewSafe = useCallback((patch: Partial<MiniComposerView>) => {
    setView((prev) => ({ ...prev, ...patch }))
  }, [])

  // 空闲时序：四条件连续满足 idleMs → 预告；预告期间任一条件恢复即取消；
  // 预告满 previewMs → 收球。流式钉死 = streaming 使四条件恒不满足，两条链全停。
  const idle = isIdleEligible(props, focused, hovered)
  useEffect(() => {
    if (view.collapsed || view.preview || !idle) return
    const timer = setTimeout(() => setViewSafe({ preview: true }), idleMs)
    return () => clearTimeout(timer)
  }, [idle, view.collapsed, view.preview, idleMs, setViewSafe])

  useEffect(() => {
    if (!view.preview) return
    if (!idle) {
      // 任一条件恢复即取消预告（可拦截）
      setViewSafe({ preview: false })
      return
    }
    const timer = setTimeout(() => setViewSafe({ preview: false, collapsed: true }), previewMs)
    return () => clearTimeout(timer)
  }, [view.preview, idle, previewMs, setViewSafe])

  const handleSend = useCallback((): void => {
    const text = draftLocal.trim()
    if (text === "" || props.streaming) return
    props.onSend(text)
    // 发送自动进入 S2（消息流展开 + 完整控件行）；本地清稿（官方 submit 同步清空
    // 共享草稿，本地态为源须显式收口）
    setDraftLocal("")
    pushedRef.current = ""
    setViewSafe({ expanded: true, preview: false })
  }, [props, draftLocal, setViewSafe])

  // Esc 逐层退：S2 → S1（只留标题栏 + 输入区）→ C；球态不再动作。
  // mention 菜单开 = 菜单 Esc 优先（官方 arbitrate 消费）——状态机不动作。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || view.collapsed) return
      if (props.mention?.open === true) return
      event.preventDefault()
      if (view.expanded) setViewSafe({ expanded: false, preview: false })
      else setViewSafe({ collapsed: true, preview: false })
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [view.collapsed, view.expanded, props.mention, setViewSafe])

  // 消息流滚动吸底（快照增量上屏后钉在底部——proposal 消息流行）。
  useEffect(() => {
    const scroller = messagesRef.current
    if (scroller === null) return
    scroller.scrollTop = scroller.scrollHeight
  }, [props.messages, expanded])

  // 标题栏热区点击（可展开判定 = 消息流非空；不可展开纯展示零动作）。
  const onHotzoneClick = useCallback((): void => {
    if (!expandable) return
    setViewSafe({ expanded: !view.expanded, preview: false })
  }, [expandable, view.expanded, setViewSafe])

  const hotzoneClass =
    "dscf-hotzone" + (expandable ? (view.expanded ? " dscf-hotzone-collapse" : " dscf-hotzone-expand") : "")
  const tooltipLabel = view.expanded ? "收起对话" : "展开对话"

  if (view.collapsed) {
    // C 悬浮球：点球——有未读流式回复 → 直达 S2；否则回 S1/S0。
    return (
      <div data-testid="dscf-root" data-phase="ball">
        <button
        type="button"
        data-testid="dscf-ball"
        aria-label={unread ? "有新回复，展开对话" : "展开对话"}
        onClick={(): void => {
          setViewSafe({ collapsed: false, expanded: expandable && unread, preview: false })
        }}
        style={{
          position: "fixed",
          right: "var(--dsw-space-6, 24px)",
          bottom: "var(--dsw-space-6, 24px)",
          // 层叠修正（bug ba885f7d ③ + fix-8）：fixed 球/卡须浮出 dock pane 层叠上下文
          //——常规 doc pane 族之上，且全屏呈现态 dock layer 升至 40（官方 sidebar-right
          // panel [data-sidebar-right-panel=fullscreen] --dsh-dockkit-dock-layer:40），
          // 取 50 盖过全屏内容（float 层 60 仍在其上，官方弹层不被压）。
          zIndex: 50,
          width: 44,
          height: 44,
          borderRadius: "var(--dsw-radius-panel, 28px)",
          border: "0.5px solid var(--dsw-alias-border-l2)",
          background: "var(--dsw-alias-bg-layer-1)",
          color: "var(--dsw-alias-label-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "var(--dsw-alias-shadow-menu, 0 4px 16px rgba(0,0,0,.08))",
        }}
      >
        <BallGlyph />
        </button>
      </div>
    )
  }

  return (
    <div
      data-testid="dscf-root"
      data-phase={phase}
      data-previewing={view.preview ? "true" : "false"}
      onMouseOver={(): void => setHovered(true)}
      onMouseOut={(event): void => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setHovered(false)
      }}
      style={{
        position: "fixed",
        left: "50%",
        bottom: "var(--dsw-space-6, 24px)",
        transform: "translateX(-50%)",
        zIndex: 50,
        width: "min(860px, 94vw)",
        borderRadius: "var(--dsw-radius-lg, 16px)",
        border: "0.5px solid var(--dsw-alias-border-l2)",
        background: "var(--dsw-alias-bg-layer-1)",
        color: "var(--dsw-alias-label-primary)",
        boxShadow:
          "var(--dsw-alias-shadow-menu, 0 4px 16px rgba(0,0,0,.08)), 0 12px 32px rgba(0,0,0,.08)",
        opacity: view.preview ? 0.3 : 1,
        transition: "opacity .2s var(--ds-ease-in-out, ease)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {phase !== "s0" ? (
        <div
          data-testid="dscf-header"
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px" }}
        >
          <button
            type="button"
            data-testid="dscf-minimize"
            aria-label="收成悬浮球"
            onClick={(): void => setViewSafe({ collapsed: true, preview: false })}
            style={headerBtnStyle}
          >
            —
          </button>
          <div
            data-testid="dscf-hotzone"
            className={hotzoneClass}
            onClick={onHotzoneClick}
            onMouseMove={(event): void => {
              if (!expandable) return
              setTooltip({ x: event.clientX, y: event.clientY, label: tooltipLabel })
            }}
            onMouseLeave={(): void => setTooltip(null)}
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              padding: "6px 0",
              userSelect: "none",
            }}
          >
            <span
              data-testid="dscf-title"
              style={{
                fontSize: 13,
                lineHeight: "20px",
                color: "var(--dsw-alias-label-secondary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {props.title}
            </span>
          </div>
          <button
            type="button"
            data-testid="dscf-fullscreen"
            aria-label="退出全屏"
            onClick={props.onExitFullscreen}
            style={headerBtnStyle}
          >
            ⧉
          </button>
        </div>
      ) : null}

      {tooltip !== null ? (
        <div
          data-testid="dscf-tooltip"
          style={{
            position: "fixed",
            left: tooltip.x + 12,
            top: tooltip.y + 14,
            padding: "3px 8px",
            fontSize: 12,
            lineHeight: "18px",
            borderRadius: "var(--dsw-radius-sm, 8px)",
            border: "0.5px solid var(--dsw-alias-border-l2)",
            background: "var(--dsw-alias-bg-layer-1)",
            color: "var(--dsw-alias-label-primary)",
            boxShadow: "var(--dsw-alias-shadow-menu, 0 4px 16px rgba(0,0,0,.08))",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {tooltip.label}
        </div>
      ) : null}

      {view.preview ? (
        <div
          data-testid="dscf-preview"
          style={{
            textAlign: "center",
            fontSize: 12,
            lineHeight: "18px",
            color: "var(--dsw-alias-label-tertiary)",
            padding: "2px 0",
          }}
        >
          即将收起 · 移入即保留
        </div>
      ) : null}

      {expanded ? (
        <div
          ref={messagesRef}
          data-testid="dscf-messages"
          data-streaming={props.streaming ? "true" : "false"}
          style={{
            maxHeight: "40vh",
            overflowY: "auto",
            padding: "8px 16px",
            borderTop: "0.5px solid var(--dsw-alias-border-l2)",
          }}
        >
          {props.messages.map((message) => (
            <div key={message.id} data-role={message.role} style={{ padding: "4px 0" }}>
              <span
                style={{
                  fontSize: 13,
                  lineHeight: "22px",
                  color: "var(--dsw-alias-label-primary)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {message.content}
              </span>
              {message.role === "assistant" && props.streaming ? " ▍" : ""}
            </div>
          ))}
        </div>
      ) : null}

      {props.mention?.open === true ? (
        <div
          data-testid="dscf-mention"
          role="listbox"
          style={{
            margin: "0 16px",
            maxHeight: "30vh",
            overflowY: "auto",
            borderRadius: "var(--dsw-radius-md, 12px)",
            border: "0.5px solid var(--dsw-alias-border-l2)",
            background: "var(--dsw-alias-bg-layer-1)",
            boxShadow: "var(--dsw-alias-shadow-menu, 0 4px 16px rgba(0,0,0,.08))",
          }}
        >
          {props.mention.groups.map((group) => (
            <div key={group.source}>
              {group.items.map((item, index) => {
                const highlighted =
                  props.mention?.highlight !== null &&
                  props.mention?.highlight?.source === group.source &&
                  props.mention?.highlight?.index === index
                return (
                  <div
                    key={item.name}
                    role="option"
                    aria-selected={highlighted}
                    data-testid={`dscf-mention-item-${group.source}-${index}`}
                    onClick={(): void => props.mention?.onPick(group.source, index)}
                    style={{
                      padding: "4px 10px",
                      fontSize: 13,
                      lineHeight: "20px",
                      cursor: "pointer",
                      background: highlighted ? "var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))" : "transparent",
                      color: "var(--dsw-alias-label-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.label ?? item.name}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ) : null}

      {props.chipCount > 0 ? (
        <div
          data-testid="dscf-chips"
          style={{ padding: "4px 16px 0", fontSize: 12, color: "var(--dsw-alias-label-tertiary)" }}
        >
          {props.chipCount} 个引用
        </div>
      ) : null}

      <div style={{ position: "relative", padding: "8px 16px 12px" }}>
        {/* 叠加 chip 层（bug 49368004，方案②——walkthrough/111-fix11-alternatives.md）：
            textarea 文本透明 + 同度量 mirror 层逐字重绘；quote 明文段 visibility:hidden
            保位（宽度与折行与 textarea 一致 ⇒ 光标/后续文本零错位），原位绝对覆盖原子
            chip。脆弱点核销：折行（同字体/行高/宽度/内边距 + pre-wrap）与滚动（onScroll
            同步 scrollTop）；余量：超长引用段跨行时 chip 只覆盖首行起位（度量为真）。 */}
        <div
          ref={mirrorRef}
          data-testid="dscf-mirror"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "8px 16px 12px",
            pointerEvents: "none",
            overflow: "hidden",
            whiteSpace: "pre-wrap",
            wordWrap: "break-word",
            padding: 0,
            color: "var(--dsw-alias-label-primary)",
            fontSize: 14,
            lineHeight: "22px",
          }}
        >
          {splitQuoteSegments(draftLocal).map((segment, index) =>
            segment.kind === "text" ? (
              <span key={index}>{segment.text}</span>
            ) : (
              <span key={index} style={{ position: "relative" }}>
                <span style={{ visibility: "hidden" }}>{segment.raw}</span>
                <span
                  data-testid="dscf-quote-chip"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 1,
                    maxWidth: "100%",
                    display: "inline-flex",
                    alignItems: "center",
                    height: 20,
                    padding: "0 8px",
                    borderRadius: 999,
                    border: "0.5px solid var(--dsw-alias-border-l2)",
                    background: "var(--dsw-alias-bg-layer-2, rgba(0,0,0,.04))",
                    color: "var(--dsw-alias-label-secondary)",
                    fontSize: 12,
                    lineHeight: "18px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {segment.label}
                </span>
              </span>
            ),
          )}
        </div>
        <textarea
          data-testid="dscf-input"
          data-dscf-composer-input=""
          value={draftLocal}
          onChange={(event): void => {
            const text = event.target.value
            setDraftLocal(text)
            pushedRef.current = text
            props.onDraftChange(text, event.target.selectionStart ?? event.target.value.length)
          }}
          onScroll={(event): void => {
            // textarea 内部滚动（rows=1 多行草稿）→ mirror 同步折行对位
            const mirror = mirrorRef.current
            if (mirror !== null) mirror.scrollTop = event.currentTarget.scrollTop
          }}
          onFocus={(): void => setFocused(true)}
          onBlur={(): void => setFocused(false)}
          onKeyDown={(event): void => {
            // mention 菜单开 = 官方 arbitrate 先裁（↑↓/Enter/Esc 同壳键盘链）——
            // pass 才落回本 composer 语义（Enter 发送 / Esc 逐层退）。
            if (props.mention?.open === true) {
              const menuKey = mentionKeyOf(event.key)
              if (menuKey !== null) {
                const outcome = props.mention.onArbitrate(menuKey)
                if (outcome !== "pass") {
                  event.preventDefault()
                  return
                }
                // pass = 官方菜单不消费（无高亮/菜单闭）——落回本 composer 键盘语义。
                if (menuKey !== "enter" && menuKey !== "escape") return
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              handleSend()
            }
          }}
          placeholder="输入消息…（Enter 发送 / Shift+Enter 换行）"
          rows={1}
          style={{
            width: "100%",
            boxSizing: "border-box",
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            // 文本透明（bug 49368004：可见字形由 mirror 叠加层承载）；光标显式着色
            color: "transparent",
            caretColor: "var(--dsw-alias-label-primary)",
            padding: 0,
            fontSize: 14,
            lineHeight: "22px",
          }}
        />
        {expanded ? (
          <div
            data-testid="dscf-controls"
            style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 6 }}
          >
            <button type="button" aria-label="添加附件" style={controlBtnStyle}>
              ＋
            </button>
            <button type="button" aria-label="完全权限" style={controlBtnStyle}>
              完全权限
            </button>
            <button type="button" aria-label="模型选择器" style={controlBtnStyle}>
              模型
            </button>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              data-testid="dscf-send"
              aria-label={props.streaming ? "生成中" : "发送"}
              disabled={props.streaming}
              onClick={handleSend}
              style={{
                // 官方 InputBar `.primary` 逐位对齐（bug 008d44e7；官方
                // dsh-client-ui-conversation lib/client.js:17169 CSS 取证）：主题色
                // 圆钮 + 白色图标 + hover/disabled 态。Root cause: 原实现引用了
                // 官方令牌表不存在的 --dsw-alias-button-primary-fill（正确令牌 =
                // button-info-fill），令牌未定义回落 UA 默认即黑方块。
                flex: "none",
                width: 34,
                height: 34,
                border: "none",
                borderRadius: 999,
                background: "var(--dsw-alias-button-info-fill)",
                color: "#fff",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                transition: "background-color .1s",
              }}
            >
              {props.streaming ? <StopGlyph /> : <SendArrowGlyph />}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const headerBtnStyle: React.CSSProperties = {
  flex: "none",
  width: 26,
  height: 26,
  border: "none",
  background: "transparent",
  color: "var(--dsw-alias-label-tertiary)",
  borderRadius: "var(--dsw-radius-xs, 4px)",
  cursor: "pointer",
  fontSize: 13,
  lineHeight: "20px",
}

const controlBtnStyle: React.CSSProperties = {
  flex: "none",
  border: "none",
  background: "transparent",
  color: "var(--dsw-alias-label-tertiary)",
  borderRadius: "var(--dsw-radius-xs, 4px)",
  cursor: "pointer",
  fontSize: 12,
  lineHeight: "20px",
  padding: "0 6px",
}
