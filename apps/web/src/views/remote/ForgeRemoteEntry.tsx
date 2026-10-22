// 手机远程入口 + 配对面（定位：业务装配——官方 sidebar.footer.action 扩展槽占用者）。
// fix-8（用户裁决 2026-10-14，bug 5a293dfb——fix-7 点①方向反转）：承载改回官方 Modal
// dialog（dsh-client-ui-primitives Modal 既有件，零新弹层机械）——fix-7 独立窗在无壳样式
// 链文档上裸排，独立窗与 host openPairingWindow IPC 缝整体退役；图标点击开合主窗内
// dialog。fix-7 点②③逐位保留：①状态语义对齐官方——未扫码 = 等待扫码（「远程监听中」
// 属服务相位泄漏不外泄），/pair 握手成功才抬「手机已连接」态卡；②布局逐位对齐官方——
// 双模式 tab 卡（局域网 / 互联网「即将支持」占位，隧道另立项）+ QR 220×220 居中卡 +
// 官方说明文案 + 地址条带 + 复制图标按钮。300s 倒计时自动刷新与 /pair 协议（fix-6 交付
// 面）零回退（onRefresh = 插件注入 refresh 缝——重取 boot manifest 换 token）。
// 图标相位 = 产品配置 × boot manifest 双源快照直读（useSyncExternalStore——状态单源零本地
// 副本，插件侧 remote-face 产出源；源缺席 = fail-soft 灰态 off）。QR 内容 = 官方配对/连接
// 地址（手机扫码开宿主地址经官方配对流程认证，产品不自持配对协议）；QR 渲染 =
// react-qr-code 2.2.0 精确 pin。面板 = 开关（默认关，回写产品自有配置 forge:settings/set
// ——重启生效形态，onToggle 由插件注入）+ 地址条带（复制图标按钮）+ 状态态。待重启生效
// （pending）/ 远程关（off）/ 地址读数缺席 = 对应空态而非 QR——不伪装已监听（fix-3 用户裁决）。
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Modal, Button, IconCloseOutlineRegular, IconCopyOutlineRegular, Switch, Tooltip, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import QRCode from 'react-qr-code'
import type { SnapshotSource } from '../sidebar/sidebar-model.js'
import type { RemoteDotState, RemotePhase, RemoteStatusSnapshot, TunnelFace, TunnelProvider } from './remote-status.js'
import { remoteDotStateOf } from './remote-status.js'
import './remote.css'

/** sidebar.footer.action 占用者注入面（插件 remote-face 递达；逐位缺席 fail-soft） */
export interface ForgeRemoteEntryProps {
  /** 远程状态快照源（产品配置 × boot manifest 双源——缺席 = 灰态 off） */
  readonly status?: SnapshotSource<RemoteStatusSnapshot>
  /** 开关动作（forge:settings/set remoteApproval 分节回写 + refresh——缺席 = 开关禁用态） */
  readonly onToggle?: (next: boolean) => Promise<void> | void
  /** 挂载期初刷（fix-3 重启生效形态——装配期绑定变化只能在挂载时捕获；缺席 = no-op） */
  readonly refresh?: () => unknown
  /** fix-10：断开连接动作（forge:remote/disconnect 撤该设备会话 + refresh——缺席 = 钮禁用） */
  readonly onDisconnect?: () => Promise<void> | void
  /** fix-17 ②：tab 切换重连动作（切互联网 tab 隧道不在线时触发建立——缺席 = 仅刷新读数） */
  readonly onTunnelEnsure?: () => Promise<void> | void
  /** fix-18 ②：换线动作（互联网 tab 换线链接触发——缺席 = 链接不呈现） */
  readonly onFallback?: () => Promise<void> | void
  /** fix-18 ③：PIN 重置动作（PIN 方框「重置密码」触发——缺席 = 动作禁用态） */
  readonly onPinReset?: () => Promise<void> | void
  /** fix-26：长效密码开关动作（consent checkbox/「取消长效密码」触发——缺席 = 动作禁用态） */
  readonly onPinConsent?: (consent: boolean) => Promise<void> | void
  /** 1.107：连接密钥三件套读数缝（读数即显——缺席 = 段内空态） */
  readonly pskRead?: () => Promise<PskTrioFace | undefined>
  /** 1.107：连接密钥轮换动作缝（重新生成——确认弹窗防误触；缺席 = 动作禁用态） */
  readonly onPskRotate?: () => Promise<PskTrioFace | undefined>
}

/** 四态人面语言（图标 aria-label 与面板状态行同源）——fix-7 语义对齐官方：等待扫码 /
 *  手机已连接（服务相位词「远程监听中」不外泄）；pending = 待重启生效提示态（fix-3） */
export function remotePhaseLabel(phase: RemotePhase): string {
  if (phase === 'connected') return '手机已连接'
  if (phase === 'listening') return '等待扫码'
  if (phase === 'pending') return '待重启生效'
  return '远程已关闭'
}

// fix-6/fix-7 官方对齐常量（DSH Desktop 0.10.0「连接移动设备」实机逐位对照）：dialog 标题 /
// QR 显示尺寸 180×180（fix-26 ①走查定稿——容器 204 同步收缩）/ 倒计时缺省 300s（官方
// PAIRING_TTL_MS=5min 同刻度）。
// fix-9（bug d9affbdf）：dialog 内容面样式逐位对齐官方——headless Modal 自绘品牌头（官方
// BrandWordmark 件 + 居中大标题）+ 胶囊分段 tab（官方 SegmentedTabs 刻度；互联网「即将支持」
// 禁用——隧道另立项）+ 说明文案圆角卡居中 + QR 圆角卡 + pill 地址条（mono + 官方复制图标）
// + 倒计时居中 + 官方 Switch 件（弃原生 checkbox）。功能面零回退：/pair 协议 / 300s 倒计时 /
// 复制 / 四态语义照旧。
/** 官方 dialog 标题（fix-8 Modal title + 图标 aria 同源单源） */
export const REMOTE_DIALOG_TITLE = '连接移动设备'
/** QR 显示尺寸（fix-26 ①走查定稿 180×180——容器 204 相应收缩） */
export const PAIRING_QR_SIZE = 180
/** 倒计时缺省秒数（token TTL 读数缺席时的兜底刻度 = 官方 5min） */
export const PAIRING_COUNTDOWN_SECONDS = 300

/** fix-10：dialog 开启期状态轮询刻度（官方锚 main.js:1194 800ms 轮询——隧道激活/撤面与
 *  connected 位变化经 refresh → getBootManifest 单源回流，任何失败路径可收敛不冻结） */
export const REMOTE_STATUS_POLL_MS = 800

/** 隧道空态文案（fix-10：manifest 隧道面缺席 = 双链路失败撤面/读数缝降级——互联网 tab
 *  内空态收敛，不禁用 tab、不停留「正在建立隧道」无限进行态） */
export function tunnelEmptyText(): string {
  return '隧道暂不可用——宿主建立公网隧道失败或已关闭。可稍后重开此面板重试，或使用 WiFi 连接模式。'
}

/** 倒计时余秒（纯函数——token TTL 读数驱动；缺席 = 官方 300s 兜底；过期收敛 0） */
export function secondsLeftOf(pairExpiresAt: number | undefined, now: number): number {
  if (pairExpiresAt === undefined) return PAIRING_COUNTDOWN_SECONDS
  return Math.max(0, Math.ceil((pairExpiresAt - now) / 1000))
}

/** 倒计时文案（官方常量对照——「二维码将在 N 秒后刷新」） */
export function pairCountdownText(seconds: number): string {
  return `二维码将在 ${seconds} 秒后刷新`
}

/** PIN 临时 hint 文案（fix-26 ⑧——官方 pinHintTemp 逐字 + ` (Ns)` 实时秒倒计时后缀） */
export function pinCountdownText(seconds: number): string {
  return `${PIN_HINT_TEMP_TEXT} (${seconds}s)`
}

// ── fix-18 官方逐字文案（单源对照 = .forge/docs/probes/official-pairing-page-spec.md §1） ──

/** 换线链接逐字文案（官方 fallbackLink——下划线文本链接形态） */
export const FALLBACK_LINK_TEXT = '扫码打不开？换一条线路'
/** 换线进行中文案（官方 fallbackLoading——遮罩承载） */
export const FALLBACK_LOADING_TEXT = '正在切换备用线路'
/** PIN 方框 label（官方 pinLabel） */
export const PIN_LABEL_TEXT = '配对 PIN'
/** PIN 临时 hint 前段（官方 pinHintTemp——§1 逐字；后缀 ` (Ns)` 实时秒倒计时 fix-26 ⑧） */
export const PIN_HINT_TEMP_TEXT = '5 分钟内有效，过期后需重新扫码。'
/** PIN 长效 hint（官方 pinHintDurable——§1 逐字；fix-26 ⑦） */
export const PIN_HINT_DURABLE_TEXT = '长效 PIN 保存在本机，可随时重置或取消。'
/** PIN 重置动作逐字文案（官方 pinReset——pinIssuer rotate 缝触发） */
export const PIN_RESET_TEXT = '重置 PIN'
/** PIN 取消动作逐字文案（官方 pinCancel——fix-26 ⑤ 对齐：解除长效回临时 PIN + QR 换新） */
export const PIN_CANCEL_TEXT = '取消长效 PIN'
/** PIN consent checkbox label（官方 pinConsent——§1 逐字；fix-21 §2⑥ 样式对齐面，
 *  durable 后端机制 host 端点缺（§4 差值③在途）——本任务只落展示行） */
export const PIN_CONSENT_TEXT = '生成长期有效的配对 PIN'
/** PIN consent 隐私 small 字（官方 pinPrivacy——§1 逐字） */
export const PIN_PRIVACY_TEXT = '长效 PIN 只保存在本机，不上云、不写入二维码，可随时重置或取消。'

// ── 1.107 互联网模式带外秘钥展示面（连接密钥三件套——位置 = 连接密码下方，用户裁决 2026-10-19） ──

/** 连接密钥三件套读数（读数即显——桌面零缓存零 storage，轮换后旧读数失效） */
export interface PskTrioFace {
  /** PSK 展示串（base32 5 字符 ×8 组 `-` 分隔） */
  readonly display: string
  /** 校验段（SHA-256 hex 前 4 字符——带外核对锚） */
  readonly checksum: string
  /** host Ed25519 公钥（SPKI DER base64——手机端静态验签根） */
  readonly spki: string
  /** 连接密码已配置态提示位 */
  readonly pinConfigured?: boolean
  /** 长效密码位（true = PIN 不随 TTL 轮换） */
  readonly pinDurable?: boolean
}

/** 三件套段标题 */
export const PSK_TRIO_TITLE = '连接密钥'
/** 轮换动作文案 */
export const PSK_REGEN_TEXT = '重新生成'
/** 轮换确认弹窗标题 */
export const PSK_REGEN_CONFIRM_TITLE = '重新生成连接密钥？'
/** 轮换确认弹窗正文（v3.1 宽限期语义） */
export const PSK_REGEN_CONFIRM_BODY =
  '重新生成后当前连接密钥立即被替换；旧密钥在 5 分钟宽限期内仅用于验证、到期彻底失效，手机端需使用新密钥重新激活。'
/** 段内宽限期 hint 行 */
export const PSK_GRACE_HINT_TEXT = '重新生成后旧密钥 5 分钟宽限期内仅验证不加密，到期彻底失效。'
/** 三件套空态文案（读数缝缺席/门未配置——不伪装可用） */
export const PSK_EMPTY_TEXT = '连接密钥暂不可用——宿主密钥未就绪，重开此面板重试。'

// ── fix-19 官方逐字文案（单源对照 = .forge/docs/probes/official-pairing-page-spec.md §1-§3） ──

/** fix-19 ⑥ 已连接态标题（官方 manageHeading——§1 逐字；dialog 标题随相位切换单源） */
export const REMOTE_MANAGE_TITLE = '管理手机连接'
/** fix-19 ⑨ 隧道建立中文案（官方 tunnelLoading——§1 逐字） */
export const TUNNEL_LOADING_TEXT = '正在建立全球网络链接'
/** fix-19 ⑨ LAN 切换 loading 文案（官方 lanLoading——§1 逐字） */
export const LAN_LOADING_TEXT = '正在切换至 WiFi 连接模式'
/** fix-19 ⑧ QR 过期过渡文案（官方 expired——§1 逐字；刷新完成前保持该态） */
export const QR_EXPIRED_TEXT = '二维码已过期，正在自动刷新…'

/** dialog 标题相位派生（纯函数——⑥ 已连接态切「管理手机连接」，其余配对态 = 配对标题） */
export function remoteDialogTitleOf(phase: RemotePhase): string {
  return phase === 'connected' ? REMOTE_MANAGE_TITLE : REMOTE_DIALOG_TITLE
}

/** QR 倒计时行文案（纯函数——⑧ 到 0 = 过渡文案，刷新完成（新 token 倒计时 >0）即恢复） */
export function pairCountdownLineOf(seconds: number): string {
  return seconds <= 0 ? QR_EXPIRED_TEXT : pairCountdownText(seconds)
}

/**
 * fix-19 ⑦ Pinggy 意外断线自动重开判定（纯函数——官方 :1188 reopeningDeadPinggy 形态单源）：
 * 互联网 tab × 未连接 × 非切换中 × 隧道面携 unexpectedlyClosed × 一次性守卫未开 = 重开。
 */
export function tunnelAutoReopenOf(
  input: { mode: RemoteMode; phase: RemotePhase; switching: boolean; tunnel?: TunnelFace },
  guardOpen: boolean,
): boolean {
  if (guardOpen) return false
  if (input.mode !== 'internet') return false
  if (input.phase === 'connected') return false
  if (input.switching) return false
  return input.tunnel?.unexpectedlyClosed === true
}

/**
 * fix-17 ② tab 切换重连动作派生（纯函数——官方 :1187 模式切换语义单源）：
 * internet × 隧道非在线 = ensure（触发建立）；internet × 在线 = refresh（刷新读数）；
 * lan = refresh（webserver 常在无需重连——刷新 LAN 读数即可）。
 */
export function modeSelectEffectOf(mode: RemoteMode, tunnelPhase: TunnelPhase): 'refresh' | 'ensure' {
  if (mode === 'lan') return 'refresh'
  return tunnelPhase === 'online' ? 'refresh' : 'ensure'
}

// ── fix-12 B：Harness 菜单三项（DSH Desktop 0.10.0 main.js:22317-22336 文案逐字搬运；
//    菜单动作 = host 侧 dshForge 三缝（relaunch / safe-mode relaunch / showItemInFolder
//    harness.log）——域外直转面先例同制，不进 forge RPC allowlist） ──

/** Harness 菜单三项官方文案（逐字——zh 形态；en = Restart Harness / Restart as Safe Mode… / Show Harness Log） */
export const HARNESS_MENU_ITEMS = {
  relaunch: '重启 Harness',
  safeMode: '以安全模式重启…',
  showLog: '查看 Harness 日志',
} as const

/** host dshForge 桥 Harness 缝窄面（preload-api 同名三成员结构同型镜像） */
export interface DshForgeHarnessBridge {
  relaunchHarness(): Promise<unknown>
  relaunchSafeMode(): Promise<unknown>
  showHarnessLog(): Promise<unknown>
}

/** dshForge 桥 Harness 缝读取（缺席/形状不符 = undefined——菜单项禁用态 fail-soft） */
export function harnessBridgeOf(
  globalObject: { dshForge?: unknown } = globalThis as { dshForge?: unknown },
): DshForgeHarnessBridge | undefined {
  const bridge = globalObject.dshForge as
    | { relaunchHarness?: unknown; relaunchSafeMode?: unknown; showHarnessLog?: unknown }
    | undefined
  if (
    bridge !== undefined &&
    typeof bridge.relaunchHarness === 'function' &&
    typeof bridge.relaunchSafeMode === 'function' &&
    typeof bridge.showHarnessLog === 'function'
  ) {
    return bridge as DshForgeHarnessBridge
  }
  return undefined
}

/** fix-15 失焦收起判定（纯函数——focusout relatedTarget 离容器或缺席 = 真失焦；
 *  容器内焦点移动（触发钮↔菜单项）不收） */
export function harnessMenuFocusLeft(
  relatedTarget: unknown,
  container: { contains(node: unknown): boolean } | null,
): boolean {
  return container === null || relatedTarget === null || !container.contains(relatedTarget)
}

/** fix-15 外点收起判定（纯函数——pointerdown 目标在容器外或缺席 = 收） */
export function harnessMenuPointerOutside(
  target: unknown,
  container: { contains(node: unknown): boolean } | null,
): boolean {
  return container === null || target === null || !container.contains(target)
}

/** Harness 菜单（dialog 左上角下拉——官方应用菜单 Harness 族 web 同位搬运；桥缺席 =
 *  触发钮禁用 + 三项禁用态呈现）。交互 = 本组件自持开合（零弹层机械——下拉就地展开）。
 *  fix-15（bug f4b55bb9）：对齐官方 Menu/dropdown 失焦即收惯例——开启期监听 document
 *  focusout/pointerdown（capture）+ window blur，判定落在容器外即收；关闭期零监听，
 *  卸载/关闭即清理（禁全局监听泄漏）。 */
export function HarnessMenu(props: { readonly harness?: DshForgeHarnessBridge }): ReactNode {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const harness = props.harness
  const disabled = harness === undefined
  // Root cause: 菜单开合此前只有触发钮 toggle 与菜单项点击两条收起路径，缺焦点收口——
  // 官方下拉惯例是焦点离开即关，需在组件层补失焦/外点/窗口失焦三缝。
  useEffect(() => {
    if (!open) return
    const root = rootRef.current
    if (root === null) return
    const onFocusOut = (event: FocusEvent) => {
      if (harnessMenuFocusLeft(event.relatedTarget, root)) setOpen(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (harnessMenuPointerOutside(event.target, root)) setOpen(false)
    }
    const onWindowBlur = () => setOpen(false)
    document.addEventListener('focusout', onFocusOut, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      document.removeEventListener('focusout', onFocusOut, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [open])
  return (
    <div ref={rootRef} className="dswf-remote-harness" data-open={open}>
      <button
        type="button"
        className="dswf-remote-harness-trigger"
        data-testid="dswf-remote-harness-trigger"
        aria-label="Harness 菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        Harness
      </button>
      <div className="dswf-remote-harness-menu" role="menu" aria-label="Harness">
        <button
          type="button"
          role="menuitem"
          data-testid="dswf-remote-harness-relaunch"
          disabled={disabled}
          onClick={() => {
            setOpen(false)
            void harness?.relaunchHarness()
          }}
        >
          {HARNESS_MENU_ITEMS.relaunch}
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="dswf-remote-harness-safe-mode"
          disabled={disabled}
          onClick={() => {
            setOpen(false)
            void harness?.relaunchSafeMode()
          }}
        >
          {HARNESS_MENU_ITEMS.safeMode}
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="dswf-remote-harness-show-log"
          disabled={disabled}
          onClick={() => {
            setOpen(false)
            void harness?.showHarnessLog()
          }}
        >
          {HARNESS_MENU_ITEMS.showLog}
        </button>
      </div>
    </div>
  )
}

/** QR 可编码判定（纯函数——等待扫码 × 连接地址读数在场才编码；空值 QR 不渲染） */
export function remotePairQrOf(snapshot: RemoteStatusSnapshot): string | undefined {
  if (snapshot.phase !== 'listening') return undefined
  return snapshot.lanAddress
}

/** QR 空态语言（off/pending/地址缺席三分——对应空态而非 QR，不伪装已监听） */
export function remotePairEmptyText(snapshot: RemoteStatusSnapshot): string {
  if (snapshot.phase === 'pending') return '设置已保存——重启宿主后生成配对二维码'
  if (snapshot.phase === 'off') return '远程已关闭——开启远程并重启宿主后生成配对二维码'
  return '暂无法读取局域网地址——检查宿主 webserver 绑定后重开此面板'
}

/** 手机字形（产品自绘单色 currentColor——官方 primitives 无 phone 字形；16 刻度） */
function PhoneGlyph(): ReactNode {
  return (
    <svg className="dswf-remote-glyph" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4.5" y="1.5" width="7" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="12" r="0.9" fill="currentColor" />
    </svg>
  )
}

// fix-9 ⑤：复制字形退役——官方 IconCopyOutlineRegular 在场件接管（官方图标零自绘）。

/** 双模式 tab（fix-9 ②：胶囊分段——官方 SegmentedTabs 刻度自绘；选中项白底 pill。
 *  fix-10 反转：互联网 tab 真实可用（禁用占位/「即将支持」徽标退役——dsh-mobile-tunnel
 *  manifest 隧道面单源驱动；受控 mode 缝保留——测试/装配仍可控）。
 *  fix-18 ④：链路切换进行中双 tab 禁用（官方 modeSwitching 锁同语义——防重入）。 */
function ModeTabs(props: { active: RemoteMode; disabled?: boolean; onSelect: (mode: RemoteMode) => void }): ReactNode {
  const { active, disabled, onSelect } = props
  return (
    // fix-21 §2①：官方 mode-panel 容器（410px/15px 圆角/panel 底/1px 描边）包裹分段器
    <div className="dswf-remote-mode-panel">
      <div className="dswf-remote-tabs" role="tablist" aria-label="连接方式">
      <button
        type="button"
        role="tab"
        aria-selected={active === 'lan'}
        className="dswf-remote-tab"
        data-testid="dswf-remote-tab-lan"
        data-active={active === 'lan'}
        disabled={disabled === true}
        onClick={() => onSelect('lan')}
      >
        WiFi连接模式
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'internet'}
        className="dswf-remote-tab"
        data-testid="dswf-remote-tab-internet"
        data-active={active === 'internet'}
        disabled={disabled === true}
        onClick={() => onSelect('internet')}
      >
        互联网连接模式
      </button>
      </div>
    </div>
  )
}

// ── dsh-mobile-tunnel 1.4：互联网 tab 隧道面（状态/换线/横幅/PIN/QR） ──

/** 连接模式（双 tab 受控缝——测试/装配可控，缺省组件内自持） */
export type RemoteMode = 'lan' | 'internet'

/** 隧道相位（四态：启动中 / 在线 / 换线中 / 失败——状态卡 data-phase 单源） */
export type TunnelPhase = 'starting' | 'online' | 'switching' | 'failed'

/** 链路类型标签（官方交互词汇对照——状态卡链路行单源） */
export const TUNNEL_PROVIDER_LABEL: Record<TunnelProvider, string> = {
  cloudflared: 'Cloudflare 快速隧道',
  pinggy: 'Pinggy 隧道',
}

/** TTL 余分钟（纯函数——manifest tunnelExpiresAt 读数驱动；缺席/过期收敛 0） */
export function tunnelMinutesLeftOf(expiresAt: number | undefined, now: number): number {
  if (expiresAt === undefined) return 0
  return Math.max(0, Math.ceil((expiresAt - now) / 60_000))
}

/** TTL 横幅文案（官方语义——「约 N 分钟后失效」） */
export function tunnelBannerText(minutes: number): string {
  return `约 ${minutes} 分钟后失效`
}

/** 隧道相位派生（纯函数）：换线中优先；读数缺席 = 启动中；TTL 过期 = 失败；其余 = 在线 */
export function tunnelPhaseOf(
  input: { url?: string; expiresAt?: number; switching?: boolean },
  now: number,
): TunnelPhase {
  if (input.switching === true) return 'switching'
  if (typeof input.url !== 'string' || input.url === '') return 'starting'
  if (input.expiresAt !== undefined && input.expiresAt <= now) return 'failed'
  return 'online'
}

/**
 * fix-20（bug a50db966）切换冻结展示面派生（纯函数——官方 §2：底层 QR 恒挂载、遮罩
 * .qr-loading absolute 覆盖承载中间态）：切换进行中恒取冻结面——live 撤面先到/新面未到
 * 均不落空态分支（QR 卸载重排 = 闪屏）；切换收敛 = 恒 live 面（新面原子换新，冻结零残留）。
 * Root cause: 面板渲染以 snapshot.tunnel 在场为分支条件，切换中间态（撤面事件先到/新面
 * 未到）瞬时清空即落空态分支，QR 整体卸载再重挂——布局重排即用户可见闪屏。
 */
export function tunnelDisplayFaceOf(
  live: TunnelFace | undefined,
  switching: boolean,
  frozen: TunnelFace | undefined,
): TunnelFace | undefined {
  if (switching && frozen !== undefined) return frozen
  return live
}

/** 隧道状态卡（互联网 tab 载体——四态 + 隧道 URL QR（复用既有 QR 机械）+ Pinggy TTL
 *  横幅 + PIN 引导 + fix-18 ②换线链接（官方 fallback-link 形态——online × cloudflared ×
 *  缝在场才呈现，switching 中隐藏）+ fix-18 ④切换中 QR 灰色半透明遮罩） */
export function TunnelCard(props: {
  readonly phase: TunnelPhase
  readonly url?: string
  readonly provider?: TunnelProvider
  /** TTL 余分钟（Pinggy 链路在场——横幅读数；cloudflared = 缺席零横幅） */
  readonly minutesLeft?: number
  /** fix-17 ①：token TTL 余秒（QR 倒计时读数——对齐官方 5min；缺席 = 零倒计时行） */
  readonly secondsLeft?: number
  /** fallback 缝（换线动作——缺席 = 链接不呈现） */
  readonly onFallback?: () => Promise<void> | void
}): ReactNode {
  const { phase, url, provider, minutesLeft, secondsLeft, onFallback } = props
  const online = phase === 'online'
  // fix-18 ④：切换中 QR 保留 + 灰色半透明遮罩（官方 .qr-loading 全覆盖语义——产品接真
  // 切换态：tunnel-fallback 返回/tunnel 推送到达即 phase 收敛解遮）
  const showQr = (online || phase === 'switching') && url !== undefined
  return (
    <div className="dswf-remote-tunnel" data-phase={phase} data-testid="dswf-remote-tunnel">
      {/* fix-24（bug d8986cac）：遮罩在场（switching × QR）= loading 文案由遮罩单源承载——
          状态行不重复呈现（官方 .qr-loading 形态）；遮罩缺席（starting/failed/无 QR）= 状态行保留 */}
      {!showQr || phase !== 'switching' ? (
        <p className="dswf-remote-tunnel-status" data-testid="dswf-remote-tunnel-status">
          {/* fix-19 ⑨：建立中文案 = 官方 tunnelLoading 逐字（「正在建立全球网络链接」）；
              fix-26 ③：online 态链路类型行退役（「Cloudflare 快速隧道」不渲染） */}
          {phase === 'starting' && TUNNEL_LOADING_TEXT + '……'}
          {phase === 'switching' && FALLBACK_LOADING_TEXT + '……'}
          {phase === 'failed' && '隧道已失效——点击换线重试建立连接。'}
        </p>
      ) : null}
      {showQr && (
        <div className="dswf-remote-qr-wrap">
          <div
            className="dswf-remote-qr"
            data-testid="dswf-remote-tunnel-qr"
            data-value={url}
          >
            {/* 复用既有 QR 机械（react-qr-code 2.2.0 pin——LAN 面同款白底静区载体） */}
            <QRCode value={url} size={PAIRING_QR_SIZE} />
          </div>
          {phase === 'switching' && (
            <div className="dswf-remote-qr-overlay" data-testid="dswf-remote-qr-overlay" role="status">
              {FALLBACK_LOADING_TEXT}
              {/* fix-21 §2②：官方假进度条（5px/999px/brand 色——隧道切换 4.5s 档） */}
              <span className="dswf-remote-qr-progress" data-speed="tunnel" aria-hidden="true" />
            </div>
          )}
        </div>
      )}
      {online && provider === 'pinggy' && minutesLeft !== undefined && (
        <p className="dswf-remote-tunnel-banner" data-testid="dswf-remote-tunnel-ttl">
          {tunnelBannerText(minutesLeft)}
        </p>
      )}
      {/* fix-17 ①：QR 倒计时读数对齐 token TTL（官方 :1145-1147/:1196——轮换推送换 token/QR 即时重绘） */}
      {online && secondsLeft !== undefined && (
        <p className="dswf-remote-panel-note dswf-remote-countdown" data-testid="dswf-remote-tunnel-countdown">
          {/* fix-19 ⑧：到 0 = 过渡文案（官方 expired——刷新完成前保持） */}
          {pairCountdownLineOf(secondsLeft)}
        </p>
      )}
      {/* fix-26 ③：PIN 引导 hint 退役（「手机扫码打开上方地址…」——官方无此行，PIN 语义由
          PIN 方框卡单源承载） */}
      {/* fix-18 ②：换线 = 官方下划线文本链接（fallback-link）——显示三因子：online ×
          cloudflared × 缝在场；switching 中隐藏（官方显示条件同源） */}
      {online && provider === 'cloudflared' && onFallback !== undefined && (
        <button
          type="button"
          className="dswf-remote-fallback-link"
          data-testid="dswf-remote-fallback-link"
          onClick={() => onFallback()}
        >
          {FALLBACK_LINK_TEXT}
        </button>
      )}
    </div>
  )
}

/** 三件套读数行（label + mono 值 + 复制图标钮——官方复制成功绿圆勾徽 1.8s 反馈复用） */
function PskTrioRow(props: {
  readonly label: string
  readonly value: string
  readonly testId: string
  readonly copied?: boolean
  readonly onCopy?: () => void
  /** 掩码切换（私钥材料行——默认掩码，点击显/隐；公钥行不携） */
  readonly onToggleMask?: () => void
  readonly masked?: boolean
}): ReactNode {
  return (
    <div className="dswf-remote-psk-row" data-testid={props.testId}>
      <span className="dswf-remote-psk-label">{props.label}</span>
      <span className="dswf-remote-psk-value" title={props.value}>{props.value}</span>
      {props.onToggleMask !== undefined && (
        <Tooltip label={props.masked ? '显示' : '隐藏'} portal>
          <button type="button" className="dswf-remote-copy" aria-label={props.masked ? '显示连接密钥' : '隐藏连接密钥'} onClick={props.onToggleMask}>
            {props.masked ? '显' : '隐'}
          </button>
        </Tooltip>
      )}
      {props.onCopy !== undefined && (
        <Tooltip label={`复制${props.label}`} portal>
          <button type="button" className="dswf-remote-copy" aria-label={`复制${props.label}`} onClick={props.onCopy}>
            {props.copied ? (
              <span className="dswf-remote-copy-done" aria-hidden="true">✓</span>
            ) : (
              <IconCopyOutlineRegular size={14} />
            )}
          </button>
        </Tooltip>
      )}
    </div>
  )
}

/**
 * 连接密钥三件套段（1.107——互联网 tab 连接密码下方）：PSK 分组展示 + 校验段 + host 公钥
 * （SPKI）+ 连接密码已配置态提示；各字段一键复制。读数即显零缓存——挂载期 pskRead 取一次
 * 读数（不进 storage 不入快照）；轮换 = 确认弹窗防误触（官方 Modal 件）→ onPskRotate →
 * 结果即新读数原位换新（旧读数失效）。读数缝缺席/门未配置 = 段内空态（不伪装可用）。
 */
export function PskTrioSection(props: {
  /** 受控读数缝（测试/装配可控——缺省组件挂载期 pskRead 自持一次） */
  readonly trio?: PskTrioFace
  readonly pskRead?: () => Promise<PskTrioFace | undefined>
  readonly onPskRotate?: () => Promise<PskTrioFace | undefined>
}): ReactNode {
  const [liveTrio, setLiveTrio] = useState<PskTrioFace | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const trio = props.trio ?? liveTrio
  // 挂载期读数一次（读数即显——零轮询零缓存；seam 闭包随注入面生命周期稳定）
  useEffect(() => {
    let alive = true
    void Promise.resolve(props.pskRead?.()).then((next) => {
      if (!alive) return
      setLiveTrio(next)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载一次性（pskRead 闭包随注入面生命周期稳定）
  }, [])
  // 轮换（确认弹窗确认后触发）——结果即新读数原位换新，旧读数失效
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [rotating, setRotating] = useState(false)
  const handleRotate = useCallback(() => {
    if (props.onPskRotate === undefined || rotating) return
    setRotating(true)
    void Promise.resolve(props.onPskRotate())
      .then((next) => {
        if (next !== undefined) setLiveTrio(next)
      })
      .catch(() => undefined)
      .finally(() => {
        setRotating(false)
        setConfirmOpen(false)
      })
  }, [props.onPskRotate, rotating])
  // 复制反馈（per-field——绿圆勾徽 1.8s 自动消退）
  const [copiedKey, setCopiedKey] = useState('')
  useEffect(() => {
    if (copiedKey === '') return
    const timer = setTimeout(() => setCopiedKey(''), 1800)
    return () => clearTimeout(timer)
  }, [copiedKey])
  const copyField = (key: string, value: string): void => {
    writeClipboard(value)
    setCopiedKey(key)
  }
  // PSK 私钥材料默认掩码（用户裁决 2026-10-22「不展示私钥」——复制钮恒取全文，展示面不落明文）
  const [pskRevealed, setPskRevealed] = useState(false)
  return (
    <div className="dswf-remote-psk" data-testid="dswf-remote-psk">
      {/* 用户裁决 2026-10-22：重新生成 = 标题行右侧图标钮（原底部文字钮退役） */}
      <div className="dswf-remote-psk-head">
        <span className="dswf-remote-psk-title">{PSK_TRIO_TITLE}</span>
        <Tooltip label="重新生成连接密钥（旧密钥 5 分钟宽限期）" portal>
          <button
            type="button"
            className="dswf-remote-copy"
            aria-label="重新生成连接密钥"
            data-testid="dswf-remote-psk-regen"
            disabled={props.onPskRotate === undefined || rotating}
            onClick={() => setConfirmOpen(true)}
          >
            {rotating ? '…' : '↻'}
          </button>
        </Tooltip>
      </div>
      {trio === undefined ? (
        loaded ? (
          <p className="dswf-remote-psk-empty" data-testid="dswf-remote-psk-empty">
            {PSK_EMPTY_TEXT}
          </p>
        ) : null
      ) : (
        <>
          <PskTrioRow
            label="连接密钥（PSK）"
            value={pskRevealed ? trio.display : trio.display.replace(/[^-]/g, '•')}
            testId="dswf-remote-psk-display"
            copied={copiedKey === 'display'}
            onCopy={() => copyField('display', trio.display)}
            onToggleMask={() => setPskRevealed((v) => !v)}
            masked={!pskRevealed}
          />
          <PskTrioRow
            label="校验段"
            value={trio.checksum}
            testId="dswf-remote-psk-checksum"
            copied={copiedKey === 'checksum'}
            onCopy={() => copyField('checksum', trio.checksum)}
          />
          <PskTrioRow
            label="host 公钥（SPKI）"
            value={trio.spki}
            testId="dswf-remote-psk-spki"
            copied={copiedKey === 'spki'}
            onCopy={() => copyField('spki', trio.spki)}
          />
          <small className="dswf-remote-pin-privacy">{PSK_GRACE_HINT_TEXT}</small>
        </>
      )}
      {/* 轮换确认弹窗（官方 Modal 件——防误触；v3.1 宽限期语义正文） */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={PSK_REGEN_CONFIRM_TITLE} closeLabel="关闭">
        <div className="dswf-remote-psk-confirm">
          <p className="dswf-remote-psk-confirm-body">{PSK_REGEN_CONFIRM_BODY}</p>
          <div className="dswf-remote-actions">
            <Button variant="outline" size="sm" data-testid="dswf-remote-psk-regen-cancel" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button variant="primary" size="sm" data-testid="dswf-remote-psk-regen-confirm" disabled={rotating} onClick={handleRotate}>
              {PSK_REGEN_TEXT}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/** 配对面（受控呈现——1.7 起静态测试面同源直出；承载由 ForgeRemoteDialog 官方 Modal）。
 * fix-6 保留：QR 220×220 + 官方文案 + 倒计时（1s interval）到期自动刷新（onRefresh =
 * 重取 boot manifest 换 token——宿主轮换推送经 refresh 单源回流）。
 * fix-7 对齐（零回退）：双模式 tab 卡 + 「手机已连接」态卡（connected 收回 QR）+ 地址条带 +
 * 复制图标按钮（复制成功绿圆勾徽 1.8s 反馈）+ 官方说明文案。 */
export function RemotePanel(props: {
  readonly snapshot: RemoteStatusSnapshot
  readonly onToggle?: (next: boolean) => Promise<void> | void
  readonly busy?: boolean
  /** QR 倒计时到期自动刷新（重取 boot manifest——新 token 随快照回流；缺席 = 倒计时停在 0） */
  readonly onRefresh?: () => void
  /** 1.4 受控模式缝（测试/装配可控——缺省组件内自持局域网起始） */
  readonly mode?: RemoteMode
  /** fix-18 ②：fallback 缝（换线动作透传——缺席 = 换线链接不呈现） */
  readonly onFallback?: () => Promise<void> | void
  /** fix-18 ③：PIN 重置缝（host pinIssuer rotate——缺席 = 重置动作禁用态） */
  readonly onPinReset?: () => Promise<void> | void
  /** fix-26：长效密码开关缝（consent checkbox/「取消长效密码」触发——缺席 = 动作禁用态） */
  readonly onPinConsent?: (consent: boolean) => Promise<void> | void
  /** 1.107：三件套受控读数缝（测试/装配可控） */
  readonly trio?: PskTrioFace
  /** 1.107：三件套读数缝（缺席 = 段内空态） */
  readonly pskRead?: () => Promise<PskTrioFace | undefined>
  /** 1.107：三件套轮换动作缝（确认弹窗防误触——缺席 = 动作禁用态） */
  readonly onPskRotate?: () => Promise<PskTrioFace | undefined>
  /** fix-18 ④：受控 switching 缝（测试/装配可控——缺省组件内自持） */
  readonly switching?: boolean
  /** fix-20：受控冻结隧道面缝（switching 态冻结展示面——测试/装配可控；缺省组件内自持） */
  readonly frozenTunnel?: TunnelFace
  /** fix-17 ②：tab 切换重连缝（切互联网 tab 隧道不在线时触发建立——缺席 = 仅刷新读数） */
  readonly onTunnelEnsure?: () => Promise<void> | void
  /** fix-10：完成钮缝（关 dialog——连接成功态官方锚 main.js:1176 双钮之 primary） */
  readonly onClose?: () => void
  /** fix-10：断开连接缝（撤该设备会话——官方锚 :1176 双钮之 outline；缺席 = 钮禁用） */
  readonly onDisconnect?: () => Promise<void> | void
  /** fix-19 ⑥：manage-connected 二级态（dialog 打开时已连接——隐藏 closeHint 与「完成」钮） */
  readonly manageConnected?: boolean
}): ReactNode {
  const { snapshot, onRefresh } = props
  const pairValue = remotePairQrOf(snapshot)
  // 1.4 双模式 tab：受控 mode 缝优先，缺省组件内自持（互联网 tab 激活 → 隧道卡呈现）
  const [modeState, setModeState] = useState<RemoteMode>('lan')
  const mode = props.mode ?? modeState
  // fix-18 ④：切换进行态（受控缝优先——fallback/tab-ensure 在途 = true；遮罩 + tab 禁用单源）
  const [switchingState, setSwitchingState] = useState(false)
  const switching = props.switching ?? switchingState
  // fix-20：切换冻结展示面（受控缝优先）——换线/tab-ensure 触发时同步捕获当时 live 面；
  // switching 期快照隧道面瞬时清空（撤面先到/新面未到）回退冻结面（QR 恒挂载 + 遮罩承载，
  // 官方 §2 .qr-loading 覆盖同形），切换收敛清冻结（新面原子换新，冻结零残留）。
  const [frozenTunnelState, setFrozenTunnelState] = useState<TunnelFace | undefined>(undefined)
  const frozenTunnel = props.frozenTunnel ?? frozenTunnelState
  useEffect(() => {
    if (!switching) {
      setFrozenTunnelState(undefined)
      return
    }
    const live = snapshot.tunnel
    if (live?.url !== undefined && live.url !== '') setFrozenTunnelState(live)
  }, [switching, snapshot.tunnel])
  // fix-26：长效 consent 态（checkbox 本地乐观态 + 快照 durable 位双源——官方 consent
  // checkbox/pin-actions 仅 consent 态呈现语义；新 PIN 读数到达即随快照复位）
  const [pinConsent, setPinConsent] = useState(false)
  const pinDurable = snapshot.pinDurable === true
  const pinConsentOn = pinDurable || pinConsent
  useEffect(() => {
    setPinConsent(pinDurable)
  }, [pinDurable, snapshot.pin])
  // fix-17 ②：tab 切换重连（官方 :1187 模式切换语义）——internet 非在线 = 触发建立后
  // 刷新读数；online/lan = 直接刷新读数。效果派生归 modeSelectEffectOf 单源（测试锚）。
  // fix-18 ④：切换中防重入（switching 在途拒绝再触发）+ ensure 在途期收 switching 态。
  const handleModeSelect = useCallback(
    (next: RemoteMode) => {
      setModeState(next)
      if (props.mode !== undefined) return // 受控模式 = 装配侧自驱（测试/装配缝不抢动作）
      if (switching) return // fix-18 ④：防重入
      const phase = tunnelPhaseOf(
        {
          url: snapshot.tunnel?.url,
          expiresAt: snapshot.tunnel?.expiresAt,
          switching,
        },
        Date.now(),
      )
      const effect = modeSelectEffectOf(next, phase)
      if (effect === 'ensure') {
        setSwitchingState(true)
        setFrozenTunnelState(snapshot.tunnel) // fix-20：切换起点同步冻结 live 面
        void Promise.resolve(props.onTunnelEnsure?.())
          .catch(() => undefined)
          .then(() => onRefresh?.())
          .finally(() => setSwitchingState(false))
        return
      }
      onRefresh?.()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 派生读数取当值（切换时刻判定），依赖面刻意收窄
    [props.mode, props.onTunnelEnsure, onRefresh, snapshot.tunnel, switching],
  )
  // fix-18 ②：换线链接触发——置 switching 态（QR 遮罩 + tab 禁用），动作结算即解遮。
  const handleFallback = useCallback(() => {
    if (props.onFallback === undefined || switching) return
    setSwitchingState(true)
    setFrozenTunnelState(snapshot.tunnel) // fix-20：切换起点同步冻结 live 面
    void Promise.resolve(props.onFallback())
      .catch(() => undefined)
      .then(() => setSwitchingState(false))
  }, [props.onFallback, switching, snapshot.tunnel])
  // 1.4 隧道相位派生（manifest 隧道面单源——换线中优先；TTL 过期 = 失败）
  const tunnel: TunnelFace | undefined = snapshot.tunnel
  const [nowTs, setNowTs] = useState(() => Date.now())
  const tunnelPhase = tunnelPhaseOf(
    { url: tunnel?.url, expiresAt: tunnel?.expiresAt, switching },
    nowTs,
  )
  // fix-20：展示面 = 冻结派生单源（switching 在途恒冻结面；切换收敛即 live 原子换新）
  const displayTunnel = tunnelDisplayFaceOf(tunnel, switching, frozenTunnel)
  const tunnelMinutesLeft =
    displayTunnel?.expiresAt !== undefined ? tunnelMinutesLeftOf(displayTunnel.expiresAt, nowTs) : undefined
  const secondsLeft = secondsLeftOf(snapshot.pairExpiresAt, nowTs)
  // fix-17 ③：PIN 倒计时读数（同刻度 1s interval——pinExpiresAt 单源）
  const pinSecondsLeft = secondsLeftOf(snapshot.pinExpiresAt, nowTs)
  // fix-6/1.4/fix-17 倒计时：1s interval 渲染读数（LAN QR 倒计时 / 隧道 TTL 横幅 / PIN 倒
  // 计时同刻度）；到期触发 onRefresh 重取（新 token/TTL/PIN 随快照回流——官方刷新机制对齐）。
  const pinLive = snapshot.pin !== undefined
  const ttlLive = mode === 'internet' && tunnelPhase === 'online' && tunnel?.expiresAt !== undefined
  useEffect(() => {
    if (pairValue === undefined && !ttlLive && !pinLive) return
    const timer = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [pairValue, ttlLive, pinLive])
  useEffect(() => {
    if (pairValue !== undefined && secondsLeft <= 0) onRefresh?.()
  }, [pairValue, secondsLeft, onRefresh])
  // fix-19 ⑦：Pinggy 意外断线自动重开（官方 :1188 reopeningDeadPinggy 形态）——撤面事件携
  // unexpectedlyClosed 且当前互联网 tab、未连接、非切换中 → 一次性守卫触发 tunnelEnsure 重开；
  // 健康面到达即守卫复位（下次意外死亡可再重开），判定全归 tunnelAutoReopenOf 单源。
  const reopenGuardRef = useRef(false)
  useEffect(() => {
    if (snapshot.tunnel !== undefined && snapshot.tunnel.unexpectedlyClosed !== true) {
      reopenGuardRef.current = false
    }
  }, [snapshot.tunnel])
  useEffect(() => {
    if (props.onTunnelEnsure === undefined) return
    if (
      !tunnelAutoReopenOf(
        { mode, phase: snapshot.phase, switching, tunnel: snapshot.tunnel },
        reopenGuardRef.current,
      )
    ) {
      return
    }
    reopenGuardRef.current = true
    void Promise.resolve(props.onTunnelEnsure()).catch(() => undefined)
  }, [mode, snapshot.phase, snapshot.tunnel, switching, props.onTunnelEnsure])
  // fix-17 ③：PIN 到期 → 重取 manifest（新 PIN 随轮换回流——官方 TTL 5min 换新语义）
  useEffect(() => {
    if (pinLive && pinSecondsLeft <= 0) onRefresh?.()
  }, [pinLive, pinSecondsLeft, onRefresh])
  useEffect(() => {
    if (ttlLive && tunnel !== undefined && tunnel.expiresAt !== undefined && tunnel.expiresAt <= nowTs) {
      onRefresh?.()
    }
  }, [ttlLive, tunnel, nowTs, onRefresh])
  // fix-6/fix-21 复制反馈：绿圆勾徽 1.8s 自动消退（writeClipboard = 官方 primitives 既有件）。
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <div className="dswf-remote-panel" aria-label="手机远程">
      {/* fix-26 ②：面板头（「手机远程」标题 + 相位文字行）退役——状态语义由入口圆点与
          连接态卡承载，官方页面无此头 */}
      {/* 用户裁决 2026-10-22：连接成功态仍持续展示配对 PIN/密钥段（换机/重装/隧道换 URL 随时可取）——绿卡置顶，配对面常驻不退场 */}
      {snapshot.phase === 'connected' && (
        // fix-10（bug ec239552）官方连接成功态（锚 main.js:1176）：绿色成功卡 ✓ 手机已连接 +
        // 「连接会在后台保持，现在可以关闭此窗口。」+ 断开连接（outline——撤该设备会话缝）/
        // 完成（primary——关 dialog）双钮。
        // fix-18 ①：连接态独占——配对面（tab/QR/倒计时/地址条/PIN/说明卡）整体退场
        // （官方 .pairing-content display:none + tab disabled 同语义），仅态卡 + 双钮。
        // fix-19 ⑥：manage-connected 二级态收窄——隐藏 closeHint 与「完成」钮只留「断开连接」
        // （官方 manage 态语义：连接已在前台保持过，无需再提示关窗）。
        <div className="dswf-remote-connected-wrap">
          <div className="dswf-remote-connected" data-testid="dswf-remote-connected">
            <span className="dswf-remote-connected-check" aria-hidden="true">✓</span>
            <span className="dswf-remote-connected-title">手机已连接</span>
          </div>
          {props.manageConnected !== true && (
            <p className="dswf-remote-connected-note">连接会在后台保持，现在可以关闭此窗口。</p>
          )}
          <div className="dswf-remote-actions">
            <Button
              variant="outline"
              size="sm"
              data-testid="dswf-remote-disconnect"
              disabled={props.onDisconnect === undefined}
              onClick={() => void props.onDisconnect?.()}
            >
              断开连接
            </Button>
            {props.manageConnected !== true && (
              <Button
                variant="primary"
                size="sm"
                data-testid="dswf-remote-done"
                disabled={props.onClose === undefined}
                onClick={() => props.onClose?.()}
              >
                完成
              </Button>
            )}
          </div>
        </div>
      )}
        <>
        <ModeTabs active={mode} disabled={switching} onSelect={handleModeSelect} />
        {mode === 'internet' ? (
          <>
          {displayTunnel === undefined ? (
            // fix-10（隧道卡死收敛）：manifest 隧道面缺席 = 双链路失败撤面/读数缝降级——
            // 互联网 tab 内空态收敛（禁无限「正在建立隧道」进行态；tab 不禁用）。
            // fix-20：切换进行中经 displayTunnel 冻结派生不落此分支（QR 恒挂载防闪屏）
            <p className="dswf-remote-empty" data-testid="dswf-remote-tunnel-empty">
              {tunnelEmptyText()}
            </p>
          ) : (
            <TunnelCard
              phase={tunnelPhase}
              url={displayTunnel.url}
              provider={displayTunnel.provider}
              minutesLeft={tunnelMinutesLeft}
              secondsLeft={
                mode === 'internet' && tunnelPhase === 'online' && snapshot.pairExpiresAt !== undefined
                  ? secondsLeft // fix-17 ①：token TTL 读数在场才渲染倒计时（缺席 = 零行不伪装）
                  : undefined
              }
              onFallback={handleFallback}
            />
          )}
          {/* fix-18 ③ + fix-26：连接密码 PIN 独立方框卡（官方 :1171 布局——label + 大字 mono
              值 + hint 双态（长效 = pinHintDurable ⑦ / 临时 = pinHintTemp + (Ns) 实时秒倒计时 ⑧）
              + consent checkbox + pin-actions 双钮（仅 consent 态呈现 ④——重置密码 / 取消长效
              密码；⑥：两动作经 host 缝断开隧道重连 + pair token 轮换——QR/URL 全量换新）；
              读数缺席 = 卡不呈现，不占位不伪装） */}
          {snapshot.pin !== undefined && (
            <div className="dswf-remote-pin" data-testid="dswf-remote-pin">
              <span className="dswf-remote-pin-label">{PIN_LABEL_TEXT}</span>
              <span className="dswf-remote-pin-value">{snapshot.pin}</span>
              <span className="dswf-remote-panel-note dswf-remote-countdown" data-testid="dswf-remote-pin-hint">
                {pinConsentOn ? PIN_HINT_DURABLE_TEXT : pinCountdownText(pinSecondsLeft)}
              </span>
              {/* fix-21 §2⑥ + fix-26 ④：官方 consent checkbox 行——勾选 = 长效机制；
                  用户裁决 2026-10-22：重置 PIN 钮移至 consent 同行右侧 */}
              <div className="dswf-remote-pin-consent-row">
                <label className="dswf-remote-pin-consent">
                  <input
                    type="checkbox"
                    checked={pinConsentOn}
                    onChange={(event) => {
                      const next = event.target.checked
                      setPinConsent(next)
                      void props.onPinConsent?.(next)
                    }}
                  />
                  <span>{PIN_CONSENT_TEXT}</span>
                </label>
                <button
                  type="button"
                  className="dswf-remote-pin-action"
                  data-testid="dswf-remote-pin-reset"
                  disabled={props.onPinReset === undefined}
                  onClick={() => void props.onPinReset?.()}
                >
                  {PIN_RESET_TEXT}
                </button>
              </div>
              <small className="dswf-remote-pin-privacy">{PIN_PRIVACY_TEXT}</small>
              {/* fix-26 ④⑤：pin-actions 仅 consent 态呈现（官方 :1190 同语义）——取消 =
                  解除长效回临时 PIN（onPinConsent(false) 缝） */}
              {pinConsentOn && (
                <div className="dswf-remote-pin-actions">
                  <button
                    type="button"
                    className="dswf-remote-pin-action"
                    data-testid="dswf-remote-pin-cancel"
                    disabled={props.onPinConsent === undefined}
                    onClick={() => {
                      setPinConsent(false)
                      void props.onPinConsent?.(false)
                    }}
                  >
                    {PIN_CANCEL_TEXT}
                  </button>
                </div>
              )}
            </div>
          )}
          {/* 1.107：连接密钥三件套段（位置 = 连接密码下方——读数即显 + 复制 + 轮换确认弹窗） */}
          <PskTrioSection
            trio={props.trio}
            pskRead={props.pskRead}
            onPskRotate={props.onPskRotate}
          />
          </>
        ) : (
          <div className="dswf-remote-pair">
            {pairValue !== undefined ? (
              <>
                <Tooltip label="手机扫码打开配对地址" portal>
                <div className="dswf-remote-qr-wrap">
                  <div
                    className="dswf-remote-qr"
                    data-testid="dswf-remote-qr"
                    data-value={pairValue}
                  >
                    {/* react-qr-code（2.2.0 pin）——纯 SVG 同步渲染，零弹层零网络机械；
                        底色/前景取依赖默认（白底黑码——扫码器需固定浅色静区，随主题会破坏扫码） */}
                    <QRCode value={pairValue} size={PAIRING_QR_SIZE} />
                  </div>
                  {/* fix-19 ⑨：LAN 切换 loading（官方 lanLoading「正在切换至 WiFi 连接模式」
                      ——遮罩复用 fix-18 ④ 既有机械，切换态收敛即解遮） */}
                  {switching && (
                    <div className="dswf-remote-qr-overlay" data-testid="dswf-remote-qr-overlay" role="status">
                      {LAN_LOADING_TEXT}
                      {/* fix-21 §2②：官方假进度条（LAN 切换 0.8s 档——50ms 步进同刻度） */}
                      <span className="dswf-remote-qr-progress" data-speed="lan" aria-hidden="true" />
                    </div>
                  )}
                </div>
              </Tooltip>
              <p className="dswf-remote-panel-note dswf-remote-countdown" data-testid="dswf-remote-countdown">
                {/* fix-19 ⑧：到 0 = 过渡文案（官方 expired——刷新完成前保持） */}
                {pairCountdownLineOf(secondsLeft)}
              </p>
              </>
            ) : (
              <p className="dswf-remote-empty" data-dswf-remote-empty="">
                {remotePairEmptyText(snapshot)}
              </p>
            )}
            {snapshot.phase === 'pending' && (
              <p className="dswf-remote-panel-note" data-testid="dswf-remote-pending-hint">
                设置已保存——重启宿主后生效（开启与关闭均需重启）。
              </p>
            )}
          </div>
        )}
        {/* 用户裁决 2026-10-22：远程访问开关上移 dialog 标题右侧（只留钮）——面板行退役 */}
        {/* fix-16：说明文案随模式切换（tab 分流内）——lan = WiFi 文案 + LAN 地址条；
            internet = 无说明卡（用户裁决 2026-10-22：互联网 explainer 及外框移除） */}
        {mode !== 'internet' && (
          <>
            {/* fix-9 ③：说明文案居中置圆角卡内 */}
            <p className="dswf-remote-note-card">扫码即可连接。移动设备与电脑需连接至同一 WiFi，同步实时性高。</p>
            {snapshot.lanAddress !== undefined && (
              <div className="dswf-remote-address dswf-remote-pill">
                <span className="dswf-remote-address-text">{snapshot.lanAddress}</span>
                <Tooltip label="复制地址" portal>
                  <button
                    type="button"
                    className="dswf-remote-copy"
                    aria-label="复制地址"
                    onClick={() => {
                      writeClipboard(snapshot.lanAddress ?? '')
                      setCopied(true)
                    }}
                  >
                    {/* fix-21 §2③：done 态 = 绿圆勾徽（官方复制成功形态——1.8s 反馈逻辑保持） */}
                    {copied ? (
                      <span className="dswf-remote-copy-done" aria-hidden="true">✓</span>
                    ) : (
                      <IconCopyOutlineRegular size={14} />
                    )}
                  </button>
                </Tooltip>
              </div>
            )}
          </>
        )}
        <p className="dswf-remote-panel-note dswf-remote-countdown">未配对设备不可见任何内容；关闭远程后通道即断。</p>
        </>
    </div>
  )
}

/** dialog 头（fix-11 ①：brand 头退役——BrandWordmark 不在场，标题「连接移动设备」保留为
 *  dialog 标题；居中大标题 + 右上关闭钮 + fix-12 左上角 Harness 菜单；官方 Modal headless
 *  组合件，遮罩/Esc 恒归 Modal） */
export function RemoteDialogHead(props: {
  readonly onClose: () => void
  /** fix-12：Harness 菜单动作缝（缺席 = 菜单禁用态 fail-soft） */
  readonly harness?: DshForgeHarnessBridge
  /** fix-19 ⑥：标题读数（缺省 = 配对标题——已连接态由 ForgeRemoteDialog 传管理标题） */
  readonly title?: string
  /** 用户裁决 2026-10-22：远程访问开关上移标题右侧（只留钮不留文字） */
  readonly trailing?: ReactNode
}): ReactNode {
  return (
    <div className="dswf-remote-dialog">
      <HarnessMenu harness={props.harness} />
      <button
        type="button"
        className="dswf-remote-dialog-close"
        aria-label="关闭"
        onClick={props.onClose}
      >
        <IconCloseOutlineRegular size={16} />
      </button>
      {props.trailing !== undefined && (
        <div className="dswf-remote-dialog-switch">{props.trailing}</div>
      )}
      <h2 className="dswf-remote-dialog-title">{props.title ?? REMOTE_DIALOG_TITLE}</h2>
    </div>
  )
}

/** 配对面 dialog（fix-8 官方 Modal 承载；fix-11 ① brand 头退役——标题即 dialog 头）。
 *  内容面 = RemotePanel 既有件（fix-7 逐位布局 + fix-6 倒计时刷新缝 onRefresh 透传）。
 *  独立导出 = 静态测试/复用缝。 */
export function ForgeRemoteDialog(props: {
  readonly open: boolean
  readonly onClose: () => void
  readonly snapshot: RemoteStatusSnapshot
  readonly onToggle?: (next: boolean) => Promise<void> | void
  readonly busy?: boolean
  /** fix-6 倒计时到期自动刷新（重取 boot manifest 换 token；缺席 = 倒计时停在 0） */
  readonly onRefresh?: () => void
  /** fix-10：断开连接缝（透传 RemotePanel——官方锚 :1176 outline 钮） */
  readonly onDisconnect?: () => Promise<void> | void
  /** fix-17 ②：tab 切换重连缝（透传 RemotePanel——切互联网 tab 隧道不在线时触发建立） */
  readonly onTunnelEnsure?: () => Promise<void> | void
  /** fix-18 ②：换线缝（透传 RemotePanel——互联网 tab 换线链接触发） */
  readonly onFallback?: () => Promise<void> | void
  /** fix-18 ③：PIN 重置缝（透传 RemotePanel——PIN 方框「重置密码」触发） */
  readonly onPinReset?: () => Promise<void> | void
  /** fix-26：长效密码开关缝（透传 RemotePanel——consent checkbox/「取消长效密码」触发） */
  readonly onPinConsent?: (consent: boolean) => Promise<void> | void
  /** 1.107：三件套读数/轮换缝（透传 RemotePanel——读数即显 + 重新生成确认弹窗） */
  readonly pskRead?: () => Promise<PskTrioFace | undefined>
  readonly onPskRotate?: () => Promise<PskTrioFace | undefined>
  /** fix-19 ⑥：manage-connected 二级态（dialog 打开时已连接——透传 RemotePanel） */
  readonly manageConnected?: boolean
}): ReactNode {
  // fix-19 ⑥：标题随相位切换（已连接态 = 「管理手机连接」——官方 manageHeading 单源）
  const title = remoteDialogTitleOf(props.snapshot.phase)
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={title}
      headless
      className="dswf-remote-modal"
    >
      <RemoteDialogHead
        onClose={props.onClose}
        harness={harnessBridgeOf()}
        title={title}
        trailing={
          /* 用户裁决 2026-10-22：远程访问开关上移标题右侧——只留钮不留文字 */
          <Switch
            checked={props.snapshot.phase !== 'off'}
            disabled={props.onToggle === undefined || props.busy === true}
            label="远程访问开关"
            onChange={(next) => {
              void props.onToggle?.(next)
            }}
          />
        }
      />
      <RemotePanel
        snapshot={props.snapshot}
        onToggle={props.onToggle}
        busy={props.busy}
        onRefresh={props.onRefresh}
        onClose={props.onClose}
        onDisconnect={props.onDisconnect}
        onTunnelEnsure={props.onTunnelEnsure}
        onFallback={props.onFallback}
        onPinReset={props.onPinReset}
        onPinConsent={props.onPinConsent}
        pskRead={props.pskRead}
        onPskRotate={props.onPskRotate}
        manageConnected={props.manageConnected}
      />
    </Modal>
  )
}

/** 底行手机图标入口（官方 footer.action 槽占用者——设置按钮同排右侧；fix-8：点击开合
 *  主窗内官方 Modal 配对 dialog——独立窗承载退役） */
export function ForgeRemoteEntry({ status, onToggle, refresh, onDisconnect, onTunnelEnsure, onFallback, onPinReset, onPinConsent, pskRead, onPskRotate }: ForgeRemoteEntryProps): ReactNode {
  const [open, setOpen] = useState(false)
  // fix-19 ⑥：manage-connected 判定（dialog 打开时刻已连接 = 管理形态——closeHint/完成收窄；
  // 打开后即时达成连接 = 官方连接全形态，零收窄）
  const [manageConnected, setManageConnected] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const subscribe = useCallback((onChange: () => void) => status?.subscribe(onChange) ?? (() => {}), [status])
  const read = useCallback(() => status?.getSnapshot() ?? ({ phase: 'off' } satisfies RemoteStatusSnapshot), [status])
  const snapshot = useSyncExternalStore(subscribe, read, read)
  // fix-12 圆点态（纯派生——图标本体恒 currentColor，右上角小圆点承载四态；now 取渲染
  // 时刻——面板开启期 800ms 轮询与挂载初刷驱动收敛，关闭期随快照事件刷新）
  const dot: RemoteDotState = remoteDotStateOf(snapshot, Date.now())
  // fix-3 挂载期初刷：重启后装配期绑定只在挂载时捕获一次（一次性——零轮询，SC2 纪律）
  useEffect(() => {
    void refresh?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载一次性（refresh 闭包随注入面生命周期稳定）
  }, [])
  // fix-10：dialog 开启期 800ms 状态轮询（官方锚 main.js:1194 同刻度）——隧道激活/撤面与
  // connected 位变化经 refresh → getBootManifest 单源回流；关闭即停（非开启期零轮询）。
  useEffect(() => {
    if (!open || refresh === undefined) return
    const timer = setInterval(() => {
      void refresh()
    }, REMOTE_STATUS_POLL_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 开启态驱动的轮询（refresh 闭包随注入面生命周期稳定）
  }, [open])
  return (
    <div className="dswf-remote-root">
      <Tooltip label={`手机远程（${remotePhaseLabel(snapshot.phase)}）`} portal>
        <button
          type="button"
          className="dswf-remote-entry"
          data-phase={snapshot.phase}
          aria-label={`手机远程（${remotePhaseLabel(snapshot.phase)}）`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() =>
            setOpen((value) => {
              const next = !value
              if (next) setManageConnected(snapshot.phase === 'connected')
              return next
            })
          }
        >
          <PhoneGlyph />
          {/* fix-12：右上角状态圆点（off = 无圆点零渲染） */}
          {dot !== 'none' && <span className="dswf-remote-dot" data-state={dot} aria-hidden="true" />}
        </button>
      </Tooltip>
      {/* fix-8 官方 Modal dialog（关态 = 官方件自身返回 null；开合/Esc/遮罩归官方机械） */}
      <ForgeRemoteDialog
        open={open}
        onClose={close}
        snapshot={snapshot}
        onToggle={onToggle}
        onRefresh={refresh !== undefined ? () => { void refresh() } : undefined}
        onDisconnect={onDisconnect}
        onTunnelEnsure={onTunnelEnsure}
        onFallback={onFallback}
        onPinReset={onPinReset}
        onPinConsent={onPinConsent}
        pskRead={pskRead}
        onPskRotate={onPskRotate}
        manageConnected={manageConnected}
      />
    </div>
  )
}
