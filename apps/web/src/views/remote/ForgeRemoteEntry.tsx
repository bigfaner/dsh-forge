// 手机远程入口 + 远程面板（定位：业务装配——官方 sidebar.footer.action 扩展槽占用者，
// mobile-remote-approval 1.2/fix-3；探针点①结论驱动：官方底行扩展槽在场，设置按钮同排）。
// 图标相位 = 产品配置 × boot manifest 双源快照直读（useSyncExternalStore——状态单源零本地
// 副本，插件侧 remote-face 产出源；源缺席 = fail-soft 灰态 off）。面板 = 开关（默认关，
// 回写产品自有配置 forge:settings/set——重启生效形态，onToggle 由插件注入）+ 配对入口
// （官方配对 = 手机浏览器开宿主地址，产品不自建配对协议）+ 局域网地址展示。待重启生效
// （pending）= 配置 ↔ 实际绑定不一致提示态——不伪装已监听（fix-3 用户裁决）。
import { useCallback, useEffect, useSyncExternalStore, useState, type ReactNode } from 'react'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
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

/** 手机字形（产品自绘单色 currentColor——官方 primitives 无 phone 字形；16 刻度） */
function PhoneGlyph(): ReactNode {
  return (
    <svg className="dswf-remote-glyph" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4.5" y="1.5" width="7" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="12" r="0.9" fill="currentColor" />
    </svg>
  )
}

/** 远程面板（受控呈现——入口 open 态挂载；测试静态面同源直出） */
export function RemotePanel(props: {
  readonly snapshot: RemoteStatusSnapshot
  readonly onToggle?: (next: boolean) => Promise<void> | void
  readonly busy?: boolean
}): ReactNode {
  const { snapshot, onToggle, busy } = props
  const checked = snapshot.phase !== 'off'
  const onSwitch = useCallback(
    (event: { currentTarget: { checked: boolean } }) => {
      void onToggle?.(event.currentTarget.checked)
    },
    [onToggle],
  )
  return (
    <div className="dswf-remote-panel" role="dialog" aria-label="手机远程">
      <div className="dswf-remote-panel-head">
        <span className="dswf-remote-panel-title">手机远程</span>
        <span className="dswf-remote-panel-phase" data-phase={snapshot.phase}>
          {remotePhaseLabel(snapshot.phase)}
        </span>
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
      <div className="dswf-remote-panel-row">
        <span>配对</span>
        <span className="dswf-remote-panel-hint">
          {snapshot.lanAddress !== undefined
            ? '手机浏览器打开以下地址，按官方配对流程认证'
            : '开启并重启宿主后显示局域网地址'}
        </span>
      </div>
      {snapshot.phase === 'pending' && (
        <p className="dswf-remote-panel-note" data-testid="dswf-remote-pending-hint">
          设置已保存——重启宿主后生效（开启与关闭均需重启）。
        </p>
      )}
      {snapshot.lanAddress !== undefined && (
        <button
          type="button"
          className="dswf-remote-address"
          title="点击复制地址"
          onClick={() => writeClipboard(snapshot.lanAddress ?? '')}
        >
          {snapshot.lanAddress}
        </button>
      )}
      <p className="dswf-remote-panel-note">未配对设备不可见任何内容；关闭远程后通道即断。</p>
    </div>
  )
}

/** 底行手机图标入口（官方 footer.action 槽占用者——设置按钮同排右侧） */
export function ForgeRemoteEntry({ status, onToggle, refresh }: ForgeRemoteEntryProps): ReactNode {
  const [open, setOpen] = useState(false)
  const subscribe = useCallback((onChange: () => void) => status?.subscribe(onChange) ?? (() => {}), [status])
  const read = useCallback(() => status?.getSnapshot() ?? ({ phase: 'off' } satisfies RemoteStatusSnapshot), [status])
  const snapshot = useSyncExternalStore(subscribe, read, read)
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
      {open && <RemotePanel snapshot={snapshot} onToggle={onToggle} />}
    </div>
  )
}
