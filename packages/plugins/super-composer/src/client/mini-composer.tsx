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
// 球面信号（1.35 用户裁决）：流式中 = 官方 StateDot ongoing spinner（同源动效
// 词汇）；流式停止 ∧ 未读 = 右上角官方 warning 圆点（官方 unread 指示词汇——
// sidebar pendingInteraction→warning 同源），查看（点球/展开）即消失；未读面
// 流式增量与非流式补账合并记账。
//
// 标题栏：左「—」+ 会话 title（1.41 用户裁决——header 左侧当前会话标题，官方
// sessions.list title/displayTitle 口径，切换/重命名经既有订阅实时更新；单行溢出
// 裁剪按 DESIGN.md PathLabel 规格）、中热区（承载开合 affordance）、右「⧉」；热区
// 光标 = 应用风格 chevron
// 自定义光标（styles.ts 注入的 svg data-uri cursor，随主题暗色锚切换），tooltip =
// 应用风格浮层（跟随光标，非原生 title）。样式令牌化（--dsw-alias-*）随主题。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StateDot } from "@deepseek-ai/dsh-client-ui-primitives";
import { SurrogateComposer } from "./official-input/surrogate-composer.js";
import { FactoryChatView } from "./factory-bridge.js";
import type { SuperComposerDataFace } from "./data-face.js";

export type MiniComposerPhase = "s0" | "s1" | "s2" | "ball";

declare const __DSH_FORGE_BUILD_REV__: string | undefined;

/**
 * 构建版本戳解析（data-dscf-rev，供用户/排查者肉眼对账当前构建）：
 * ① 壳掌舵装载的 bundle URL ?rev=（= apps/web 构建期 __DSH_FORGE_BUILD_REV__ 缓存戳
 * ——脚本标签常驻 DOM，真机装载必命中）；② 同名全局（若宿主以 define 注入）；
 * ③ 兜底 "unknown"（单测等无装载链环境——属性仍在场非空）。
 */
function resolveBuildRev(): string {
  const src = document.querySelector<HTMLScriptElement>('script[src*="super-composer-client.js"]')?.src;
  const fromUrl = src?.match(/[?&]rev=([^&]+)/)?.[1];
  if (fromUrl !== undefined && fromUrl !== "") return decodeURIComponent(fromUrl);
  if (typeof __DSH_FORGE_BUILD_REV__ === "string" && __DSH_FORGE_BUILD_REV__ !== "") {
    return __DSH_FORGE_BUILD_REV__;
  }
  return "unknown";
}

/** 会话消息投影（同 binding eventSource 快照切片——宿主任务注入数据渠道）。 */
export interface MiniComposerMessage {
  readonly id: string
  readonly role: "user" | "assistant"
  readonly content: string
}

/** 替身属性面（状态输入全部注入——组件不感知 cordis 服务与数据渠道装配）。 */
export interface MiniComposerProps {
  /** 会话 title（标题栏左侧展示——官方 sessions.list title/displayTitle 口径） */
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
  /**
   * 1.45 引用现身：选区菜单「添加到对话」插入成功后替身以球态表面化（true = 强制
   * 球态 + 「有新引用」warning 圆点；点球展开查看 chip——挂载层现身豁免在替身门控
   * 隐藏时渲染球态用）。
   */
  readonly surfaceChip?: boolean
  /** 现身球态被点开（点球展开——挂载层现身豁免转段：ball → card，现身持续） */
  readonly onSurfaceExpand?: () => void
  /** 现身球态被 Esc 解除（现身豁免解除——挂载层恢复常规门控，非全屏即隐藏） */
  readonly onSurfaceDismiss?: () => void
  /** 展开卡体收回球态（「—」/Esc/idle 收球——挂载层现身豁免解除，恢复常规门控） */
  readonly onCollapseFromCard?: () => void
  /** 折叠态读数上报（挂载层现身判据探测——门控隐藏期视同收起；每次渲染同步） */
  readonly reportCollapsed?: (collapsed: boolean) => void
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

  // ── 1.34 S2 布局融合 + 1.38 渐进展开 ──
  // 尺寸锚 = 标题栏底部分隔线（dscf-header 底缘，DOM 锚核销后定值——headerH 实测，
  // happy-dom 等无布局环境回落 40px 定值）。增高上限 = 100dvh - 底部留白 - 标题栏高
  // （再减 factory-bridge 的 GROW_RESERVE 顶缘留白——不顶格）；高度本体随内容实测
  // 递进（factory-bridge ResizeObserver），此处只交上限锚。
  const headerRef = useRef<HTMLDivElement | null>(null)
  const [headerH, setHeaderH] = useState(40)
  useLayoutEffect(() => {
    if (phase === "s0") return
    const measure = (): void => {
      const measured = headerRef.current?.offsetHeight ?? 0
      if (measured > 0) setHeaderH(measured)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [phase])
  const grownMaxHeight = `calc(100dvh - var(--dsw-space-6, 24px) - ${headerH}px)`

  // 发送触发增高：S2 展开期间消息流增长（发送落账/流式回复）→ grown；收起复位，
  // 再展开（无新消息）回初始块。热区展开既有消息流不误触发（离开展开态时同步基线）。
  const [grown, setGrown] = useState(false)
  const seenMessagesRef = useRef(0)
  useEffect(() => {
    if (!expanded) {
      seenMessagesRef.current = props.messages.length
      setGrown(false)
      return
    }
    if (props.messages.length > seenMessagesRef.current) setGrown(true)
    seenMessagesRef.current = props.messages.length
  }, [expanded, props.messages.length])

  // 未读追踪（1.35 合并语义）：球态期间消息流增长（流式增量 ∨ 非流式补账）= 未读；
  // 卡体在场即清账（seen = 当前消息数）。圆点面 = 未读 ∧ 非流式（流式期间球面由
  // spinner 动效承担，停止后未读转圆点提示——查看（点球/展开）即消失）。
  useEffect(() => {
    if (view.collapsed) {
      if (props.messages.length > seenCountRef.current) setUnread(true)
      return
    }
    seenCountRef.current = props.messages.length
    setUnread(false)
  }, [view.collapsed, props.messages.length])

  // 1.45 引用现身：surfaceChip 强制球态（选区菜单插入成功后的表面化面——挂载层在
  // 门控隐藏期以球态渲染替身）。折叠态读数上报 + 转段上报：现身豁免在「点球展开」
  // 转 card 持续、「Esc/收球」解除恢复常规门控；surfaceChip 强制的球态不算收球转换
  //（现身态本体，继续现身）。
  const surface = props.surfaceChip === true
  const collapsedNow = view.collapsed || surface
  const wasCollapsedRef = useRef(true)
  useEffect(() => {
    props.reportCollapsed?.(collapsedNow)
    if (!wasCollapsedRef.current && collapsedNow && !surface) props.onCollapseFromCard?.()
    wasCollapsedRef.current = collapsedNow
  })

  const setViewSafe = useCallback((patch: Partial<MiniComposerView>) => {
    setView((prev) => ({ ...prev, ...patch }))
  }, [])

  // 空闲时序：四条件连续满足 idleMs → 预告；预告期间任一条件恢复即取消；
  // 预告满 previewMs → 收球。流式钉死 = streaming 使四条件恒不满足，两条链全停。
  const idle = isIdleEligible(props, focused, hovered)
  useEffect(() => {
    if (view.collapsed || surface || view.preview || !idle) return
    const timer = setTimeout(() => setViewSafe({ preview: true }), idleMs)
    return () => clearTimeout(timer)
  }, [idle, view.collapsed, view.preview, idleMs, surface, setViewSafe])

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
      // 1.45 现身球态：Esc = 现身豁免解除（挂载层恢复常规门控——非全屏隐藏）。
      if (props.surfaceChip === true) {
        props.onSurfaceDismiss?.()
        return
      }
      if (view.expanded) setViewSafe({ expanded: false, preview: false })
      else setViewSafe({ collapsed: true, preview: false })
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [view.collapsed, view.expanded, props.mention, props.surfaceChip, props.onSurfaceDismiss, setViewSafe])

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

  if (collapsedNow) {
    // C 悬浮球（1.35 用户裁决）：流式中 = 官方 StateDot ongoing spinner 动效
    // （dsh-client-ui-primitives 同源动效词汇，零自造动画）；流式停止 ∧ 未读 =
    // 右上角官方 warning 未读圆点（官方 sidebar pendingInteraction→warning 同源
    // 指示词汇，琥珀 user-attention 语义色）；点球——未读直达 S2，否则回 S1/S0。
    // 1.45 引用现身：surfaceChip 现身态共用球面 + 圆点词汇（「有新引用可查看」
    // ——点球展开查看 chip；Esc = 现身豁免解除）。
    const showUnreadDot = (unread || surface) && !props.streaming
    const surfaceRef = props.surfaceChip === true
    return (
      <div data-testid="dscf-root" data-phase="ball" data-dscf-rev={resolveBuildRev()}>
        <button
        type="button"
        data-testid="dscf-ball"
        data-streaming={props.streaming ? "true" : undefined}
        data-unread={showUnreadDot ? "true" : undefined}
        data-surface={surfaceRef ? "true" : undefined}
        aria-label={
          props.streaming
            ? "回复生成中，展开对话"
            : surfaceRef
              ? "有新引用，展开查看"
              : unread
                ? "有新回复，展开对话"
                : "展开对话"
        }
        onClick={(): void => {
          setViewSafe({ collapsed: false, expanded: expandable && unread, preview: false })
          if (surfaceRef) props.onSurfaceExpand?.()
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
        {props.streaming ? <StateDot state="ongoing" size={20} /> : <BallGlyph />}
        {showUnreadDot ? (
          <span
            data-testid="dscf-ball-unread"
            style={{
              position: "absolute",
              top: 3,
              right: 3,
              display: "flex",
              padding: 1.5,
              borderRadius: "50%",
              background: "var(--dsw-alias-bg-layer-1)",
            }}
          >
            <StateDot state="warning" size={9} />
          </span>
        ) : null}
        </button>
      </div>
    )
  }

  return (
    <div
      data-testid="dscf-root"
      data-phase={phase}
      data-dscf-rev={resolveBuildRev()}
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
          ref={headerRef}
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
          <span
            data-testid="dscf-title"
            style={{
              flex: "0 1 auto",
              minWidth: 0,
              maxWidth: "40%",
              fontSize: 13,
              lineHeight: "20px",
              fontWeight: 500,
              color: "var(--dsw-alias-label-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              userSelect: "none",
            }}
          >
            {props.title}
          </span>
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
          />
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
        /* S2 对话态：官方 conversation.content 工厂（slots 复用裁决 1.30——经
           shell.overlay 桥 portal 渲染，消息流/composer bar 官方子槽自供）；
           1.28 复制件消息渲染与 S2 复制件输入区（SurrogateChatView + composerSeat
           承载 SurrogateComposer）退役。S0/S1 简易态输入区仍为复制件（官方工厂
           无裁剪缝——declaring-is-claiming 红线，见台账）。
           1.34 布局融合：composer 与 chat-view 同一平面（工厂宿主单面承载，无
           独立高度块），composer seat 分隔线按 DESIGN.md 令牌（styles.ts 注入）；
           1.38 发送/流式后 chat-view 随内容渐进展开（不一步到顶），上限 = 标题栏
           底部分隔线锚减顶缘留白（grownMaxHeight + factory-bridge GROW_RESERVE）。 */
        <FactoryChatView
          streaming={props.streaming}
          grown={grown}
          grownMaxHeight={grownMaxHeight}
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
              输入形态与官方同源；S0/S1 简易态保留复制件径（官方工厂无裁剪缝——
              declaring-is-claiming 红线）。S2 对话态输入区 = 工厂自带官方
              conversation.composer.bar（1.30 slots 复用裁决）。 */}
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
