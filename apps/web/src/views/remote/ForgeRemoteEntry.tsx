// 手机远程入口 + 配对 dialog（定位：业务装配——官方 sidebar.footer.action 扩展槽占用者，
// mobile-remote-approval 1.2/fix-3/1.7；探针点①结论驱动：官方底行扩展槽在场，设置按钮同排）。
// 图标相位 = 产品配置 × boot manifest 双源快照直读（useSyncExternalStore——状态单源零本地
// 副本，插件侧 remote-face 产出源；源缺席 = fail-soft 灰态 off）。1.7 扫码对齐官方（用户
// 裁决 2026-10-14）：图标点击弹官方 Modal dialog（弹层机械 = dsh-client-ui-primitives Modal
// 既有件，零新弹层）展示配对二维码——QR 内容 = 官方配对/连接地址（手机扫码开宿主地址经
// 官方配对流程认证，产品不自持配对协议）；QR 渲染 = react-qr-code 2.2.0 精确 pin（最小
// 纯 SVG 依赖）。面板 = 开关（默认关，回写产品自有配置 forge:settings/set——重启生效形态，
// onToggle 由插件注入）+ 连接地址文本兜底（点击复制）+ 状态态。待重启生效（pending）/
// 远程关（off）/ 地址读数缺席 = 对应空态而非 QR——不伪装已监听（fix-3 用户裁决）。
import { useCallback, useEffect, useSyncExternalStore, useState, type ReactNode } from 'react'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import QRCode from 'react-qr-code'
import type { SnapshotSource } from '../sidebar/sidebar-model.js'
import type { RemotePhase, RemoteStatusSnapshot } from './remote-status.js'
import './remote.css'

/** sidebar.footer.action 占用者注入面（插件 remote-face 递达；逐位缺席 fail-soft） */
export interface ForgeRemoteEntryProps {
  /** 远程状态快照源（产品配置 × boot manifest 双源——缺席 = 灰态 off） */
  readonly status?: SnapshotSource<RemoteStatusSnapshot>
  /** 开关动作（forge:settings/set remoteApproval 分节回写 + refresh——缺席 = 开关禁用态） */
  readonly onToggle?: (next: boolean) => Promise<void> | void
  /** 挂载期初刷（fix-3 重启生效形态——装配期绑定变化只能在挂载时捕获；缺席 = no-op） */
  readonly refresh?: () => unknown
}

/** 三态人面语言（图标 aria-label 与面板状态行同源；pending = 待重启生效提示态——fix-3） */
export function remotePhaseLabel(phase: RemotePhase): string {
  if (phase === 'connected') return '设备已连接'
  if (phase === 'listening') return '远程监听中'
  if (phase === 'pending') return '待重启生效'
  return '远程已关闭'
}

// fix-6 官方对齐常量（DSH Desktop 0.10.0「连接移动设备」dialog 实机逐位对照——文案常量
// 锚 = 闭源壳 bundle :1119-1151）：dialog 标题 / QR 显示尺寸 220×220 / 倒计时缺省 300s
// （官方 PAIRING_TTL_MS=5min 同刻度）。
/** 官方配对 dialog 标题 */
export const REMOTE_DIALOG_TITLE = '连接移动设备'
/** QR 显示尺寸（官方实机 220×220） */
export const PAIRING_QR_SIZE = 220
/** 倒计时缺省秒数（token TTL 读数缺席时的兜底刻度 = 官方 5min） */
export const PAIRING_COUNTDOWN_SECONDS = 300

/** 倒计时余秒（纯函数——token TTL 读数驱动；缺席 = 官方 300s 兜底；过期收敛 0） */
export function secondsLeftOf(pairExpiresAt: number | undefined, now: number): number {
  if (pairExpiresAt === undefined) return PAIRING_COUNTDOWN_SECONDS
  return Math.max(0, Math.ceil((pairExpiresAt - now) / 1000))
}

/** 倒计时文案（官方常量对照——「二维码将在 N 秒后刷新」） */
export function pairCountdownText(seconds: number): string {
  return `二维码将在 ${seconds} 秒后刷新`
}

/** QR 可编码判定（纯函数——监听/已连接 × 连接地址读数在场才编码；空值 QR 不渲染） */
export function remotePairQrOf(snapshot: RemoteStatusSnapshot): string | undefined {
  if (snapshot.phase !== 'listening' && snapshot.phase !== 'connected') return undefined
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

/** 配对面（受控呈现——入口 open 态经官方 Modal 挂载；测试静态面同源直出）。
 * fix-6 官方对齐：QR 220×220 + 官方文案 + 倒计时（1s interval）到期自动刷新
 * （onRefresh = 重取 boot manifest 换 token——宿主轮换推送经 refresh 单源回流）+
 * 地址条复制完整 pairingUrl（「已复制」1.8s 反馈）。 */
export function RemotePanel(props: {
  readonly snapshot: RemoteStatusSnapshot
  readonly onToggle?: (next: boolean) => Promise<void> | void
  readonly busy?: boolean
  /** QR 倒计时到期自动刷新（重取 boot manifest——新 token 随快照回流；缺席 = 倒计时停在 0） */
  readonly onRefresh?: () => void
}): ReactNode {
  const { snapshot, onToggle, busy, onRefresh } = props
  const checked = snapshot.phase !== 'off'
  const onSwitch = useCallback(
    (event: { currentTarget: { checked: boolean } }) => {
      void onToggle?.(event.currentTarget.checked)
    },
    [onToggle],
  )
  const pairValue = remotePairQrOf(snapshot)
  // fix-6 倒计时：1s interval 渲染「二维码将在 N 秒后刷新」；到期触发 onRefresh 重取
  // （新 token 经快照回流后 countdown 自动重置——interval 存续期 = QR 在场期）。
  const [nowTs, setNowTs] = useState(() => Date.now())
  const secondsLeft = secondsLeftOf(snapshot.pairExpiresAt, nowTs)
  useEffect(() => {
    if (pairValue === undefined) return
    const timer = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [pairValue])
  useEffect(() => {
    if (pairValue !== undefined && secondsLeft <= 0) onRefresh?.()
  }, [pairValue, secondsLeft, onRefresh])
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
            <p className="dswf-remote-panel-note" data-testid="dswf-remote-countdown">
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
      <label className="dswf-remote-panel-row">
        <span>远程访问</span>
        {/* native checkbox（官方 Switch 依赖官方壳上下文——受限面零 fork，native 刻度对齐） */}
        <input
          type="checkbox"
          className="dswf-remote-switch"
          checked={checked}
          disabled={onToggle === undefined || busy === true}
          onChange={onSwitch}
          aria-label="远程访问开关"
        />
      </label>
      <p className="dswf-remote-panel-note">扫码即可连接。移动设备与电脑需连接至同一 WiFi。</p>
      {snapshot.lanAddress !== undefined && (
        <button
          type="button"
          className="dswf-remote-address"
          title="点击复制地址"
          onClick={() => {
            writeClipboard(snapshot.lanAddress ?? '')
            setCopied(true)
          }}
        >
          {copied ? '已复制' : snapshot.lanAddress}
        </button>
      )}
      <p className="dswf-remote-panel-note">未配对设备不可见任何内容；关闭远程后通道即断。</p>
    </div>
  )
}

/** 底行手机图标入口（官方 footer.action 槽占用者——设置按钮同排右侧；点击弹官方 Modal 配对 dialog） */
export function ForgeRemoteEntry({ status, onToggle, refresh }: ForgeRemoteEntryProps): ReactNode {
  const [open, setOpen] = useState(false)
  const subscribe = useCallback((onChange: () => void) => status?.subscribe(onChange) ?? (() => {}), [status])
  const read = useCallback(() => status?.getSnapshot() ?? ({ phase: 'off' } satisfies RemoteStatusSnapshot), [status])
  const snapshot = useSyncExternalStore(subscribe, read, read)
  const close = useCallback(() => setOpen(false), [])
  // fix-3 挂载期初刷：重启后装配期绑定只在挂载时捕获一次（一次性——零轮询，SC2 纪律）
  useEffect(() => {
    void refresh?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载一次性（refresh 闭包随注入面生命周期稳定）
  }, [])
  return (
    <div className="dswf-remote-root">
      <button
        type="button"
        className="dswf-remote-entry"
        data-phase={snapshot.phase}
        aria-label={`手机远程（${remotePhaseLabel(snapshot.phase)}）`}
        title={`手机远程（${remotePhaseLabel(snapshot.phase)}）`}
        onClick={() => setOpen((value) => !value)}
      >
        <PhoneGlyph />
      </button>
      {/* 官方 Modal（Esc/遮罩/portal 生命周期归官方件——零新弹层机械；开态才挂载） */}
      {open && (
        <Modal open onClose={close} title={REMOTE_DIALOG_TITLE} closeLabel="关闭" contentClassName="dswf-remote-modal">
          <RemotePanel
            snapshot={snapshot}
            onToggle={onToggle}
            onRefresh={refresh !== undefined ? () => void refresh() : undefined}
          />
        </Modal>
      )}
    </div>
  )
}
