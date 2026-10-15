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
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Modal, Button, IconCloseOutlineRegular, IconCopyOutlineRegular, Switch, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import QRCode from 'react-qr-code'
import type { SnapshotSource } from '../sidebar/sidebar-model.js'
import type { RemotePhase, RemoteStatusSnapshot, TunnelFace, TunnelProvider } from './remote-status.js'
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
// QR 显示尺寸 220×220 / 倒计时缺省 300s（官方 PAIRING_TTL_MS=5min 同刻度）。
// fix-9（bug d9affbdf）：dialog 内容面样式逐位对齐官方——headless Modal 自绘品牌头（官方
// BrandWordmark 件 + 居中大标题）+ 胶囊分段 tab（官方 SegmentedTabs 刻度；互联网「即将支持」
// 禁用——隧道另立项）+ 说明文案圆角卡居中 + QR 圆角卡 + pill 地址条（mono + 官方复制图标）
// + 倒计时居中 + 官方 Switch 件（弃原生 checkbox）。功能面零回退：/pair 协议 / 300s 倒计时 /
// 复制 / 四态语义照旧。
/** 官方 dialog 标题（fix-8 Modal title + 图标 aria 同源单源） */
export const REMOTE_DIALOG_TITLE = '连接移动设备'
/** QR 显示尺寸（官方实机 220×220） */
export const PAIRING_QR_SIZE = 220
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
 *  manifest 隧道面单源驱动；受控 mode 缝保留——测试/装配仍可控）。 */
function ModeTabs(props: { active: RemoteMode; onSelect: (mode: RemoteMode) => void }): ReactNode {
  const { active, onSelect } = props
  return (
    <div className="dswf-remote-tabs" role="tablist" aria-label="连接方式">
      <button
        type="button"
        role="tab"
        aria-selected={active === 'lan'}
        className="dswf-remote-tab"
        data-testid="dswf-remote-tab-lan"
        data-active={active === 'lan'}
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
        onClick={() => onSelect('internet')}
      >
        互联网连接模式
      </button>
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

/** 隧道状态卡（互联网 tab 载体——四态 + 隧道 URL QR（复用既有 QR 机械）+ Pinggy TTL
 *  横幅 + PIN 引导 + 换线钮（onFallback 缝——缺席 = 禁用态） */
export function TunnelCard(props: {
  readonly phase: TunnelPhase
  readonly url?: string
  readonly provider?: TunnelProvider
  /** TTL 余分钟（Pinggy 链路在场——横幅读数；cloudflared = 缺席零横幅） */
  readonly minutesLeft?: number
  /** fallback 缝（换线动作——缺席 = 钮禁用） */
  readonly onFallback?: () => Promise<void> | void
}): ReactNode {
  const { phase, url, provider, minutesLeft, onFallback } = props
  const online = phase === 'online'
  return (
    <div className="dswf-remote-tunnel" data-phase={phase} data-testid="dswf-remote-tunnel">
      <p className="dswf-remote-tunnel-status" data-testid="dswf-remote-tunnel-status">
        {phase === 'starting' && '正在建立隧道……'}
        {phase === 'switching' && '换线中——正在切换备用链路……'}
        {phase === 'failed' && '隧道已失效——点击换线重试建立连接。'}
        {online && provider !== undefined && TUNNEL_PROVIDER_LABEL[provider]}
      </p>
      {online && url !== undefined && (
        <div
          className="dswf-remote-qr"
          data-testid="dswf-remote-tunnel-qr"
          data-value={url}
          title="手机扫码打开隧道配对地址"
        >
          {/* 复用既有 QR 机械（react-qr-code 2.2.0 pin——LAN 面同款白底静区载体） */}
          <QRCode value={url} size={PAIRING_QR_SIZE} />
        </div>
      )}
      {online && provider === 'pinggy' && minutesLeft !== undefined && (
        <p className="dswf-remote-tunnel-banner" data-testid="dswf-remote-tunnel-ttl">
          {tunnelBannerText(minutesLeft)}
        </p>
      )}
      {online && (
        <p className="dswf-remote-panel-note" data-testid="dswf-remote-tunnel-pin-hint">
          手机扫码打开上方地址，在手机端输入 6 位 PIN 完成认证（PIN 5 分钟内有效，超时自动换新）。
        </p>
      )}
      <button
        type="button"
        className="dswf-remote-tunnel-fallback"
        data-testid="dswf-remote-tunnel-fallback"
        aria-label="换线"
        title="换线"
        disabled={onFallback === undefined || phase === 'switching'}
        onClick={() => onFallback?.()}
      >
        换线
      </button>
    </div>
  )
}

/** 配对面（受控呈现——1.7 起静态测试面同源直出；承载由 ForgeRemoteDialog 官方 Modal）。
 * fix-6 保留：QR 220×220 + 官方文案 + 倒计时（1s interval）到期自动刷新（onRefresh =
 * 重取 boot manifest 换 token——宿主轮换推送经 refresh 单源回流）。
 * fix-7 对齐（零回退）：双模式 tab 卡 + 「手机已连接」态卡（connected 收回 QR）+ 地址条带 +
 * 复制图标按钮（「已复制」1.8s 反馈）+ 官方说明文案。 */
export function RemotePanel(props: {
  readonly snapshot: RemoteStatusSnapshot
  readonly onToggle?: (next: boolean) => Promise<void> | void
  readonly busy?: boolean
  /** QR 倒计时到期自动刷新（重取 boot manifest——新 token 随快照回流；缺席 = 倒计时停在 0） */
  readonly onRefresh?: () => void
  /** 1.4 受控模式缝（测试/装配可控——缺省组件内自持局域网起始） */
  readonly mode?: RemoteMode
  /** 1.4 fallback 缝（换线动作透传——缺席 = 换线钮禁用态） */
  readonly onFallback?: () => Promise<void> | void
  /** fix-10：完成钮缝（关 dialog——连接成功态官方锚 main.js:1176 双钮之 primary） */
  readonly onClose?: () => void
  /** fix-10：断开连接缝（撤该设备会话——官方锚 :1176 双钮之 outline；缺席 = 钮禁用） */
  readonly onDisconnect?: () => Promise<void> | void
}): ReactNode {
  const { snapshot, onToggle, busy, onRefresh } = props
  const checked = snapshot.phase !== 'off'
  const pairValue = remotePairQrOf(snapshot)
  // 1.4 双模式 tab：受控 mode 缝优先，缺省组件内自持（互联网 tab 激活 → 隧道卡呈现）
  const [modeState, setModeState] = useState<RemoteMode>('lan')
  const mode = props.mode ?? modeState
  const [switching, setSwitching] = useState(false)
  const handleFallback = useCallback(() => {
    if (props.onFallback === undefined) return
    setSwitching(true)
    void Promise.resolve(props.onFallback())
      .catch(() => undefined)
      .then(() => setSwitching(false))
  }, [props.onFallback])
  // 1.4 隧道相位派生（manifest 隧道面单源——换线中优先；TTL 过期 = 失败）
  const tunnel: TunnelFace | undefined = snapshot.tunnel
  const [nowTs, setNowTs] = useState(() => Date.now())
  const tunnelPhase = tunnelPhaseOf(
    { url: tunnel?.url, expiresAt: tunnel?.expiresAt, switching },
    nowTs,
  )
  const tunnelMinutesLeft =
    tunnel?.expiresAt !== undefined ? tunnelMinutesLeftOf(tunnel.expiresAt, nowTs) : undefined
  const secondsLeft = secondsLeftOf(snapshot.pairExpiresAt, nowTs)
  // fix-6/1.4 倒计时：1s interval 渲染读数（LAN QR 倒计时 / 隧道 TTL 横幅同刻度）；
  // 到期触发 onRefresh 重取（新 token/TTL 随快照回流——官方刷新机制对齐）。
  const ttlLive = mode === 'internet' && tunnelPhase === 'online' && tunnel?.expiresAt !== undefined
  useEffect(() => {
    if (pairValue === undefined && !ttlLive) return
    const timer = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [pairValue, ttlLive])
  useEffect(() => {
    if (pairValue !== undefined && secondsLeft <= 0) onRefresh?.()
  }, [pairValue, secondsLeft, onRefresh])
  useEffect(() => {
    if (ttlLive && tunnel !== undefined && tunnel.expiresAt !== undefined && tunnel.expiresAt <= nowTs) {
      onRefresh?.()
    }
  }, [ttlLive, tunnel, nowTs, onRefresh])
  // fix-6 复制反馈：「已复制」1.8s 自动消退（writeClipboard = 官方 primitives 既有件）。
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <div className="dswf-remote-panel" aria-label="手机远程">
      <div className="dswf-remote-panel-head">
        <span className="dswf-remote-panel-title">手机远程</span>
        <span className="dswf-remote-panel-phase" data-phase={snapshot.phase}>
          {remotePhaseLabel(snapshot.phase)}
        </span>
      </div>
      {snapshot.phase === 'connected' ? (
        // fix-10（bug ec239552）官方连接成功态（锚 main.js:1176）：绿色成功卡 ✓ 手机已连接 +
        // 「连接会在后台保持，现在可以关闭此窗口。」+ 断开连接（outline——撤该设备会话缝）/
        // 完成（primary——关 dialog）双钮。
        <div className="dswf-remote-connected-wrap">
          <div className="dswf-remote-connected" data-testid="dswf-remote-connected">
            <span className="dswf-remote-connected-check" aria-hidden="true">✓</span>
            <span>手机已连接</span>
          </div>
          <p className="dswf-remote-connected-note">连接会在后台保持，现在可以关闭此窗口。</p>
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
            <Button
              variant="primary"
              size="sm"
              data-testid="dswf-remote-done"
              disabled={props.onClose === undefined}
              onClick={() => props.onClose?.()}
            >
              完成
            </Button>
          </div>
        </div>
      ) : (
        <>
        <ModeTabs active={mode} onSelect={setModeState} />
        {mode === 'internet' ? (
          snapshot.tunnel === undefined ? (
            // fix-10（隧道卡死收敛）：manifest 隧道面缺席 = 双链路失败撤面/读数缝降级——
            // 互联网 tab 内空态收敛（禁无限「正在建立隧道」进行态；tab 不禁用）
            <p className="dswf-remote-empty" data-testid="dswf-remote-tunnel-empty">
              {tunnelEmptyText()}
            </p>
          ) : (
            <TunnelCard
              phase={tunnelPhase}
              url={tunnel?.url}
              provider={tunnel?.provider}
              minutesLeft={tunnelMinutesLeft}
              onFallback={handleFallback}
            />
          )
        ) : (
          <div className="dswf-remote-pair">
            {pairValue !== undefined ? (
              <>
                <div
                  className="dswf-remote-qr"
                  data-testid="dswf-remote-qr"
                  data-value={pairValue}
                  title="手机扫码打开配对地址"
                >
                  {/* react-qr-code（2.2.0 pin）——纯 SVG 同步渲染，零弹层零网络机械；
                      底色/前景取依赖默认（白底黑码——扫码器需固定浅色静区，随主题会破坏扫码） */}
                  <QRCode value={pairValue} size={PAIRING_QR_SIZE} />
                </div>
                <p className="dswf-remote-panel-note dswf-remote-countdown" data-testid="dswf-remote-countdown">
                  {pairCountdownText(secondsLeft)}
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
        </>
      )}
      {/* fix-9 ⑦：官方 Switch 件（dsh-client-ui-primitives 在场——弃原生 checkbox） */}
      <div className="dswf-remote-panel-row">
        <span>远程访问</span>
        <Switch
          checked={checked}
          disabled={onToggle === undefined || busy === true}
          label="远程访问开关"
          onChange={(next) => {
            void onToggle?.(next)
          }}
        />
      </div>
      {/* fix-9 ③：说明文案居中置圆角卡内 */}
      <p className="dswf-remote-note-card">扫码即可连接。移动设备与电脑需连接至同一 WiFi，同步实时性高。</p>
      {snapshot.lanAddress !== undefined && (
        <div className="dswf-remote-address dswf-remote-pill">
          <span className="dswf-remote-address-text">{snapshot.lanAddress}</span>
          <button
            type="button"
            className="dswf-remote-copy"
            aria-label="复制地址"
            title="复制地址"
            onClick={() => {
              writeClipboard(snapshot.lanAddress ?? '')
              setCopied(true)
            }}
          >
            {copied ? '已复制' : <IconCopyOutlineRegular size={14} />}
          </button>
        </div>
      )}
      <p className="dswf-remote-panel-note dswf-remote-countdown">未配对设备不可见任何内容；关闭远程后通道即断。</p>
    </div>
  )
}

/** dialog 头（fix-11 ①：brand 头退役——BrandWordmark 不在场，标题「连接移动设备」保留为
 *  dialog 标题；居中大标题 + 右上关闭钮；官方 Modal headless 组合件，遮罩/Esc 恒归 Modal） */
export function RemoteDialogHead(props: { readonly onClose: () => void }): ReactNode {
  return (
    <div className="dswf-remote-dialog">
      <button
        type="button"
        className="dswf-remote-dialog-close"
        aria-label="关闭"
        title="关闭"
        onClick={props.onClose}
      >
        <IconCloseOutlineRegular size={16} />
      </button>
      <h2 className="dswf-remote-dialog-title">{REMOTE_DIALOG_TITLE}</h2>
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
}): ReactNode {
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={REMOTE_DIALOG_TITLE}
      headless
      className="dswf-remote-modal"
    >
      <RemoteDialogHead onClose={props.onClose} />
      <RemotePanel
        snapshot={props.snapshot}
        onToggle={props.onToggle}
        busy={props.busy}
        onRefresh={props.onRefresh}
        onClose={props.onClose}
        onDisconnect={props.onDisconnect}
      />
    </Modal>
  )
}

/** 底行手机图标入口（官方 footer.action 槽占用者——设置按钮同排右侧；fix-8：点击开合
 *  主窗内官方 Modal 配对 dialog——独立窗承载退役） */
export function ForgeRemoteEntry({ status, onToggle, refresh, onDisconnect }: ForgeRemoteEntryProps): ReactNode {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const subscribe = useCallback((onChange: () => void) => status?.subscribe(onChange) ?? (() => {}), [status])
  const read = useCallback(() => status?.getSnapshot() ?? ({ phase: 'off' } satisfies RemoteStatusSnapshot), [status])
  const snapshot = useSyncExternalStore(subscribe, read, read)
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
      <button
        type="button"
        className="dswf-remote-entry"
        data-phase={snapshot.phase}
        aria-label={`手机远程（${remotePhaseLabel(snapshot.phase)}）`}
        title={`手机远程（${remotePhaseLabel(snapshot.phase)}）`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <PhoneGlyph />
      </button>
      {/* fix-8 官方 Modal dialog（关态 = 官方件自身返回 null；开合/Esc/遮罩归官方机械） */}
      <ForgeRemoteDialog
        open={open}
        onClose={close}
        snapshot={snapshot}
        onToggle={onToggle}
        onRefresh={refresh !== undefined ? () => { void refresh() } : undefined}
        onDisconnect={onDisconnect}
      />
    </div>
  )
}
