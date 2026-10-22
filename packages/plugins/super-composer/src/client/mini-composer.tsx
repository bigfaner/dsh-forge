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
import { SurrogateComposer } from "./official-input/surrogate-composer.js";
import { SurrogateChatView } from "./official-chatview/surrogate-chatview.js";
import type { SuperComposerDataFace } from "./data-face.js";

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
  /**
   * 替身 composer 数据面（官方 InputBar/DraftEditor 复制件宿主——挂载方为替身
   * 创建的专用实例，单订阅者契约；缺席 = 不渲染输入区）。
   */
  readonly composer?: SuperComposerDataFace
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

/** 一体卡替身组件（状态机本体；全部样式令牌化——--dsw-alias-* 随主题）。 */
export function MiniComposerCard(props: MiniComposerProps): React.JSX.Element {
  const idleMs = props.idleMs ?? DEFAULT_IDLE_MS
  const previewMs = props.previewMs ?? DEFAULT_PREVIEW_MS
  const [view, setView] = useState<MiniComposerView>({ collapsed: false, expanded: false, preview: false })
  // 输入面 = 官方 InputBar/DraftEditor 复制件（SurrogateComposer 宿主）——草稿真值
  // 在复制件 Lexical editor（本地机器快照店），官方机器草稿经数据面双向同步
  //（surrogate-composer.tsx 同步协议）；卡片只消费投影判据（draft/chipCount/messages）。
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null)
  const [unread, setUnread] = useState(false)
  const seenCountRef = useRef(0)

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

  // Esc 逐层退：S2 → S1（只留标题栏 + 输入区）→ C；球态不再动作。
  // mention 菜单开 = 菜单 Esc 优先（复制件 keymap 内官方 arbitrate 消费）——状态机不动作。
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

  // 消息流滚动吸底由 SurrogateChatView 承接（官方 ConversationContent 复制件的
  // scrollport `[data-conversation-scroll]`——1.28 渲染层复制件切换）。

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
        /* S2 对话态：官方 ConversationContent 复制件（消息行 = MessageItem/
           AssistantMarkdown 官方渲染闭包 + sticky composerSeat 承载输入区复制件）——
           自绘消息列表退役（1.28 用户裁决渲染层同源）。 */
        <SurrogateChatView
          messages={props.messages}
          streaming={props.streaming}
          composerBar={
            props.composer !== undefined ? (
              <SurrogateComposer
                face={props.composer}
                streaming={props.streaming}
                onSubmitted={(): void => setViewSafe({ expanded: true, preview: false })}
                onFocusChange={setFocused}
              />
            ) : null
          }
        />
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

      {!expanded ? (
        <div style={{ padding: "0 16px 12px" }}>
          {/* 官方 InputBar/DraftEditor 复制件宿主（fix-12 用户裁决源码复制径）：
              quote chip 原生原子渲染（Lexical ReferenceChipNode 装饰器 portal），发送钮/
              输入形态与官方同源；textarea 旧径与叠加 chip 层已退役（bug 49368004 叠加层
              方案②连同 bug 008d44e7 自绘发送钮一并退役）。S2 对话态输入区移入官方
              composerSeat（SurrogateChatView composerBar 槽）。 */}
          {props.composer !== undefined ? (
            <SurrogateComposer
              face={props.composer}
              streaming={props.streaming}
              onSubmitted={(): void => setViewSafe({ expanded: true, preview: false })}
              onFocusChange={setFocused}
            />
          ) : null}
        </div>
      ) : null}
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
