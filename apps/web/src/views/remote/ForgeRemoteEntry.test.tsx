// 手机远程入口 + 远程面板单测（mobile-remote-approval 1.2）——静态渲染面（renderToStaticMarkup
// 纯渲染同 2.6 组件测法）：图标三态（官方反射面快照驱动 / 缺席 fail-soft 灰态）+ 面板
// （开关默认关 / 配对入口 / 局域网地址展示）。开弹层交互归装配（插件槽 inject 面），
// 本层钉渲染语言与状态类名。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ForgeRemoteEntry,
  PAIRING_COUNTDOWN_SECONDS,
  PAIRING_QR_SIZE,
  RemotePanel,
  REMOTE_DIALOG_TITLE,
  TUNNEL_PROVIDER_LABEL,
  TunnelCard,
  pairCountdownText,
  secondsLeftOf,
  tunnelBannerText,
  tunnelMinutesLeftOf,
  tunnelPhaseOf,
} from './ForgeRemoteEntry.js'
import type { RemoteStatusSnapshot, TunnelFace } from './remote-status.js'
import type { SnapshotSource } from '../sidebar/sidebar-model.js'

function sourceOf(snapshot: RemoteStatusSnapshot): SnapshotSource<RemoteStatusSnapshot> {
  return { getSnapshot: () => snapshot, subscribe: () => () => {} }
}

const LISTENING: RemoteStatusSnapshot = { phase: 'listening', lanAddress: 'http://192.168.1.7:8787' }

describe('fix-6 官方对齐常量与倒计时纯函数', () => {
  it('官方 dialog 标题 = 「连接移动设备」；QR 显示尺寸 = 220×220（官方实机逐位对照）', () => {
    expect(REMOTE_DIALOG_TITLE).toBe('连接移动设备')
    expect(PAIRING_QR_SIZE).toBe(220)
  })

  it('倒计时缺省 = 300 秒（官方 5min TTL 同刻度）；读数驱动 = ceil((expiresAt-now)/1000) 收敛 0', () => {
    expect(PAIRING_COUNTDOWN_SECONDS).toBe(300)
    expect(secondsLeftOf(undefined, 1_000_000)).toBe(300)
    expect(secondsLeftOf(1_000_000 + 90_500, 1_000_000)).toBe(91)
    expect(secondsLeftOf(1_000_000, 1_000_000)).toBe(0)
    expect(secondsLeftOf(999_000, 1_000_000)).toBe(0)
  })

  it('倒计时文案 = 「二维码将在 N 秒后刷新」（官方常量对照）', () => {
    expect(pairCountdownText(300)).toBe('二维码将在 300 秒后刷新')
    expect(pairCountdownText(1)).toBe('二维码将在 1 秒后刷新')
  })
})

describe('RemotePanel 配对二维码（1.7 扫码对齐官方——QR 内容 = 官方配对/连接地址）', () => {
  it('监听中：QR 锚在场（data-value pin 连接地址）+ svg 载体 + 地址文本兜底', () => {
    const html = renderToStaticMarkup(<RemotePanel snapshot={LISTENING} onToggle={() => undefined} />)
    expect(html).toContain('data-testid="dswf-remote-qr"')
    expect(html).toContain('data-value="http://192.168.1.7:8787"')
    expect(html).toMatch(/<svg/)
    expect(html).toContain('http://192.168.1.7:8787') // 地址文本兜底
  })

  it('有设备已连接：QR 收回，呈现「手机已连接」态卡（fix-7 官方语义——等待扫码/已连接两态）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel snapshot={{ phase: 'connected' }} onToggle={() => undefined} />,
    )
    expect(html).toContain('data-testid="dswf-remote-connected"')
    expect(html).toMatch(/手机已连接/)
    expect(html).not.toContain('dswf-remote-qr')
  })

  it('fix-7：双模式 tab 卡在场——「局域网」active + 「互联网」tab；1.4 互联网真实启用（去掉「即将支持」占位）', () => {
    const html = renderToStaticMarkup(<RemotePanel snapshot={LISTENING} onToggle={() => undefined} />)
    expect(html).toMatch(/data-testid="dswf-remote-tab-lan"/)
    expect(html).toMatch(/data-testid="dswf-remote-tab-internet"/)
    expect(html).not.toMatch(/即将支持/)
    expect(html).not.toMatch(/disabled/)
  })

  it('1.4：双 tab aria-selected/data-active 语义随受控 mode 缝切换（局域网默认 / 互联网激活）', () => {
    const lan = renderToStaticMarkup(<RemotePanel snapshot={LISTENING} onToggle={() => undefined} />)
    expect(lan).toMatch(/aria-selected="true"[^>]*dswf-remote-tab-lan/)
    expect(lan).toMatch(/aria-selected="false"[^>]*dswf-remote-tab-internet/)
    const net = renderToStaticMarkup(
      <RemotePanel snapshot={LISTENING} onToggle={() => undefined} mode="internet" />,
    )
    expect(net).toMatch(/aria-selected="true"[^>]*dswf-remote-tab-internet/)
    expect(net).toMatch(/aria-selected="false"[^>]*dswf-remote-tab-lan/)
    expect(net).toMatch(/dswf-remote-tab-internet[^>]*data-active="true"/)
  })

  it('远程关 = 空态替代 QR（不渲染二维码锚）', () => {
    const html = renderToStaticMarkup(<RemotePanel snapshot={{ phase: 'off' }} onToggle={() => undefined} />)
    expect(html).toContain('data-dswf-remote-empty')
    expect(html).not.toContain('dswf-remote-qr')
  })

  it('待重启生效 = 空态替代 QR + 重启提示（不伪装已监听）', () => {
    const html = renderToStaticMarkup(<RemotePanel snapshot={{ phase: 'pending' }} onToggle={() => undefined} />)
    expect(html).toContain('data-dswf-remote-empty')
    expect(html).not.toContain('dswf-remote-qr')
    expect(html).toMatch(/重启宿主后/)
  })

  it('监听中但地址读数缺席 = 空态回退（不渲染空值 QR）', () => {
    const html = renderToStaticMarkup(<RemotePanel snapshot={{ phase: 'listening' }} onToggle={() => undefined} />)
    expect(html).toContain('data-dswf-remote-empty')
    expect(html).not.toContain('dswf-remote-qr')
  })

  it('fix-6：官方文案（「扫码即可连接。移动设备与电脑需连接至同一 WiFi，同步实时性高。」）+ 倒计时行在场 + QR 220', () => {
    const html = renderToStaticMarkup(
      <RemotePanel
        snapshot={{ ...LISTENING, pairExpiresAt: Date.now() + 120_000 }}
        onToggle={() => undefined}
      />,
    )
    expect(html).toMatch(/扫码即可连接。移动设备与电脑需连接至同一 WiFi，同步实时性高。/)
    expect(html).toMatch(/二维码将在 \d+ 秒后刷新/)
    expect(html).toMatch(/width="220"/)
  })

  it('fix-7：地址条带 + 复制图标按钮（aria-label 复制地址——独立钮不再整条可点）', () => {
    const html = renderToStaticMarkup(<RemotePanel snapshot={LISTENING} onToggle={() => undefined} />)
    expect(html).toContain('dswf-remote-address')
    expect(html).toMatch(/aria-label="复制地址"/)
    expect(html).toContain('http://192.168.1.7:8787')
    expect(html).not.toContain('已复制')
  })
})

describe('ForgeRemoteEntry 图标三态', () => {
  it('远程关 = data-phase off（灰态）', () => {
    const html = renderToStaticMarkup(<ForgeRemoteEntry status={sourceOf({ phase: 'off' })} />)
    expect(html).toContain('data-phase="off"')
    expect(html).toMatch(/远程已关闭/)
  })

  it('监听中 = data-phase listening（绿态）——fix-7 语义：等待扫码（服务相位词不外泄）', () => {
    const html = renderToStaticMarkup(<ForgeRemoteEntry status={sourceOf(LISTENING)} />)
    expect(html).toContain('data-phase="listening"')
    expect(html).toMatch(/等待扫码/)
    expect(html).not.toMatch(/远程监听中/)
  })

  it('有设备已连接 = data-phase connected（亮态）——fix-7 语义：手机已连接', () => {
    const html = renderToStaticMarkup(<ForgeRemoteEntry status={sourceOf({ phase: 'connected' })} />)
    expect(html).toContain('data-phase="connected"')
    expect(html).toMatch(/手机已连接/)
    expect(html).not.toMatch(/设备已连接/)
  })

  it('fix-3 待重启生效 = data-phase pending（提示态——不伪装 listening）', () => {
    const html = renderToStaticMarkup(<ForgeRemoteEntry status={sourceOf({ phase: 'pending' })} />)
    expect(html).toContain('data-phase="pending"')
    expect(html).toMatch(/待重启生效/)
  })

  it('反射面缺席（status undefined）= fail-soft 灰态 off，不炸装配', () => {
    const html = renderToStaticMarkup(<ForgeRemoteEntry />)
    expect(html).toContain('data-phase="off"')
  })
})

describe('RemotePanel 面板', () => {
  it('默认关：开关未选中 + 空态提示（地址条不呈现）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel snapshot={{ phase: 'off' }} onToggle={() => undefined} />,
    )
    expect(html).toMatch(/type="checkbox"/)
    expect(html).not.toMatch(/checked/)
    expect(html).toMatch(/远程已关闭——开启远程并重启宿主后生成配对二维码/)
    expect(html).not.toContain('dswf-remote-address')
    expect(html).not.toMatch(/待重启生效提示/)
  })

  it('监听中：开关选中 + 官方连接文案 + 局域网地址展示', () => {
    const html = renderToStaticMarkup(<RemotePanel snapshot={LISTENING} onToggle={() => undefined} />)
    expect(html).toMatch(/checked/)
    expect(html).toMatch(/扫码即可连接/)
    expect(html).toContain('http://192.168.1.7:8787')
  })

  it('fix-3 待重启生效：开关选中 + 重启提示行（不呈现局域网地址——不伪装已监听）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel snapshot={{ phase: 'pending' }} onToggle={() => undefined} />,
    )
    expect(html).toMatch(/checked/)
    expect(html).toContain('dswf-remote-pending-hint')
    expect(html).toMatch(/重启宿主后生效/)
    expect(html).not.toContain('http://')
  })

  it('状态行语言随相位（关闭/待重启/等待扫码/手机已连接）', () => {
    expect(renderToStaticMarkup(<RemotePanel snapshot={{ phase: 'listening' }} onToggle={() => undefined} />)).toMatch(
      /等待扫码/,
    )
    expect(renderToStaticMarkup(<RemotePanel snapshot={{ phase: 'pending' }} onToggle={() => undefined} />)).toMatch(
      /待重启生效/,
    )
  })

  it('fix-7：Modal 承载退役——入口组件零弹层渲染（开窗归 host 独立配对窗）', () => {
    const html = renderToStaticMarkup(
      <ForgeRemoteEntry status={sourceOf(LISTENING)} onOpenPairing={() => undefined} />,
    )
    expect(html).not.toContain('dswf-remote-modal')
    expect(html).not.toContain('dialog')
  })
})

// ── dsh-mobile-tunnel 1.4：互联网 tab 隧道面（状态卡 / TTL 横幅 / PIN 引导 / 换线） ──

const TUNNEL_URL = 'https://x.pinggy.link/pair?token=t'
const TUNNEL_PINGGY: TunnelFace = {
  url: TUNNEL_URL,
  provider: 'pinggy',
  expiresAt: Date.now() + 60 * 60 * 1000, // 60min 后失效 → 横幅「约 60 分钟后失效」
}
const TUNNEL_CF: TunnelFace = { url: 'https://x.trycloudflare.com/pair?token=t', provider: 'cloudflared' }

describe('隧道纯函数（状态相位 / TTL 分钟读数 / 横幅文案）', () => {
  it('tunnelPhaseOf：读数缺席 = starting；在线 = online；TTL 过期 = failed；换线中优先', () => {
    expect(tunnelPhaseOf({}, 1_000)).toBe('starting')
    expect(tunnelPhaseOf({ url: TUNNEL_URL }, 1_000)).toBe('online')
    expect(tunnelPhaseOf({ url: TUNNEL_URL, expiresAt: 1_000 }, 1_000)).toBe('failed')
    expect(tunnelPhaseOf({ url: TUNNEL_URL, expiresAt: 1_001 }, 1_000)).toBe('online')
    expect(tunnelPhaseOf({ switching: true }, 1_000)).toBe('switching')
    expect(tunnelPhaseOf({ url: TUNNEL_URL, switching: true }, 1_000)).toBe('switching')
  })

  it('tunnelMinutesLeftOf：缺席 = 0；ceil 分钟刻度；过期收敛 0', () => {
    expect(tunnelMinutesLeftOf(undefined, 0)).toBe(0)
    expect(tunnelMinutesLeftOf(90_500, 0)).toBe(2)
    expect(tunnelMinutesLeftOf(60_000, 0)).toBe(1)
    expect(tunnelMinutesLeftOf(0, 0)).toBe(0)
    expect(tunnelMinutesLeftOf(-1, 0)).toBe(0)
  })

  it('tunnelBannerText = 「约 N 分钟后失效」；链路类型标签（官方词汇对照）', () => {
    expect(tunnelBannerText(60)).toBe('约 60 分钟后失效')
    expect(TUNNEL_PROVIDER_LABEL.cloudflared).toBe('Cloudflare 快速隧道')
    expect(TUNNEL_PROVIDER_LABEL.pinggy).toBe('Pinggy 隧道')
  })
})

describe('RemotePanel 互联网 tab 隧道面（1.4）', () => {
  it('局域网 tab 默认激活：隧道读数在场也不渲染隧道卡', () => {
    const html = renderToStaticMarkup(
      <RemotePanel
        snapshot={{ ...LISTENING, tunnel: TUNNEL_PINGGY }}
        onToggle={() => undefined}
      />,
    )
    expect(html).not.toContain('dswf-remote-tunnel')
  })

  it('启动中：隧道读数缺席 = starting 态卡（正在建立隧道，零 QR 零横幅）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel snapshot={LISTENING} onToggle={() => undefined} mode="internet" />,
    )
    expect(html).toMatch(/dswf-remote-tunnel[^>]*data-phase="starting"/)
    expect(html).toMatch(/正在建立隧道/)
    expect(html).not.toContain('dswf-remote-tunnel-qr')
    expect(html).not.toContain('dswf-remote-tunnel-ttl')
  })

  it('在线（Pinggy）：QR（data-value = 隧道 URL，复用 react-qr-code 载体）+ TTL 横幅 + 链路标签 + PIN 引导 + 换线钮', () => {
    const html = renderToStaticMarkup(
      <RemotePanel
        snapshot={{ ...LISTENING, tunnel: TUNNEL_PINGGY }}
        onToggle={() => undefined}
        mode="internet"
      />,
    )
    expect(html).toMatch(/dswf-remote-tunnel[^>]*data-phase="online"/)
    expect(html).toContain('data-testid="dswf-remote-tunnel-qr"')
    expect(html).toContain(`data-value="${TUNNEL_URL}"`)
    expect(html).toMatch(/<svg/)
    expect(html).toMatch(/dswf-remote-tunnel-ttl[^>]*>约 60 分钟后失效/)
    expect(html).toMatch(/Pinggy 隧道/)
    expect(html).toMatch(/dswf-remote-tunnel-pin-hint[^>]*>[\s\S]*6 位 PIN/)
    expect(html).toMatch(/5 分钟/)
    expect(html).toMatch(/data-testid="dswf-remote-tunnel-fallback"/)
    expect(html).toMatch(/换线/)
  })

  it('在线（cloudflared）：无 TTL 语义 = 零横幅；链路标签 Cloudflare 快速隧道', () => {
    const html = renderToStaticMarkup(
      <RemotePanel
        snapshot={{ ...LISTENING, tunnel: TUNNEL_CF }}
        onToggle={() => undefined}
        mode="internet"
      />,
    )
    expect(html).toMatch(/data-phase="online"/)
    expect(html).not.toContain('dswf-remote-tunnel-ttl')
    expect(html).toMatch(/Cloudflare 快速隧道/)
  })

  it('失败：TTL 过期（expiresAt ≤ now）= failed 态卡（零 QR；失效文案 + 换线重试去向）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel
        snapshot={{
          ...LISTENING,
          tunnel: { url: TUNNEL_URL, provider: 'pinggy', expiresAt: Date.now() - 1 },
        }}
        onToggle={() => undefined}
        mode="internet"
      />,
    )
    expect(html).toMatch(/dswf-remote-tunnel[^>]*data-phase="failed"/)
    expect(html).toMatch(/隧道已失效/)
    expect(html).not.toContain('dswf-remote-tunnel-qr')
    expect(html).not.toContain('dswf-remote-tunnel-ttl')
  })

  it('换线中：switching 相位 = 换线中文案（零 QR——换线期间不呈现旧链路面）', () => {
    const html = renderToStaticMarkup(
      <TunnelCard phase="switching" onFallback={() => undefined} />,
    )
    expect(html).toMatch(/dswf-remote-tunnel[^>]*data-phase="switching"/)
    expect(html).toMatch(/换线中/)
    expect(html).not.toContain('dswf-remote-tunnel-qr')
  })

  it('换线钮：onFallback 缺席 = 禁用态（有缝才可触发 fallback 语义）', () => {
    const withSeam = renderToStaticMarkup(
      <TunnelCard phase="online" url={TUNNEL_URL} provider="pinggy" onFallback={() => undefined} />,
    )
    expect(withSeam).toMatch(/data-testid="dswf-remote-tunnel-fallback"[^>]*aria-label="换线"/)
    expect(withSeam).not.toMatch(/dswf-remote-tunnel-fallback[^>]*disabled/)
    const noSeam = renderToStaticMarkup(<TunnelCard phase="online" url={TUNNEL_URL} provider="pinggy" />)
    expect(noSeam).toMatch(/dswf-remote-tunnel-fallback[^>]*disabled/)
  })

  it('PIN 引导文案在互联网 tab 在场、局域网 tab 不在场', () => {
    const net = renderToStaticMarkup(
      <RemotePanel
        snapshot={{ ...LISTENING, tunnel: TUNNEL_PINGGY }}
        onToggle={() => undefined}
        mode="internet"
      />,
    )
    expect(net).toContain('dswf-remote-tunnel-pin-hint')
    const lan = renderToStaticMarkup(
      <RemotePanel
        snapshot={{ ...LISTENING, tunnel: TUNNEL_PINGGY }}
        onToggle={() => undefined}
      />,
    )
    expect(lan).not.toContain('dswf-remote-tunnel-pin-hint')
  })
})
