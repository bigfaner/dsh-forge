// 手机远程入口 + 远程面板单测（mobile-remote-approval 1.2）——静态渲染面（renderToStaticMarkup
// 纯渲染同 2.6 组件测法）：图标三态（官方反射面快照驱动 / 缺席 fail-soft 灰态）+ 面板
// （开关默认关 / 配对入口 / 局域网地址展示）。开弹层交互归装配（插件槽 inject 面），
// 本层钉渲染语言与状态类名。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ForgeRemoteEntry,
  HARNESS_MENU_ITEMS,
  PAIRING_COUNTDOWN_SECONDS,
  PAIRING_QR_SIZE,
  RemoteDialogHead,
  RemotePanel,
  REMOTE_DIALOG_TITLE,
  REMOTE_STATUS_POLL_MS,
  TUNNEL_PROVIDER_LABEL,
  TunnelCard,
  harnessBridgeOf,
  harnessMenuFocusLeft,
  harnessMenuPointerOutside,
  modeSelectEffectOf,
  pairCountdownText,
  pinCountdownText,
  secondsLeftOf,
  tunnelBannerText,
  tunnelMinutesLeftOf,
  tunnelPhaseOf,
} from './ForgeRemoteEntry.js'
import type { RemoteStatusSnapshot, TunnelFace } from './remote-status.js'
import type { SnapshotSource } from '../sidebar/sidebar-model.js'
// @ts-expect-error —— web tsconfig types 仅 vite/client；node:fs 仅测试内读取样式表源文
import { readFileSync } from 'node:fs'

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

  it('fix-10（bug ec239552 反转）：互联网 tab 真实可用——可选中双 tab（「即将支持」禁用徽标退役）', () => {
    const lan = renderToStaticMarkup(<RemotePanel snapshot={LISTENING} onToggle={() => undefined} />)
    expect(lan).toMatch(/data-testid="dswf-remote-tab-lan"[^>]*>WiFi连接模式/)
    expect(lan).toMatch(/data-testid="dswf-remote-tab-lan"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-testid="dswf-remote-tab-lan"/)
    expect(lan).toMatch(/data-testid="dswf-remote-tab-internet"[^>]*>[\s\S]*?互联网连接模式/)
    expect(lan).not.toMatch(/dswf-remote-tab-internet[^>]*disabled/)
    expect(lan).not.toContain('即将支持')
  })

  it('fix-10：互联网 tab 隧道面缺席 = 空态文案收敛（撤面后不得停留「正在建立隧道」无限进行态）', () => {
    const net = renderToStaticMarkup(
      <RemotePanel snapshot={LISTENING} onToggle={() => undefined} mode="internet" />,
    )
    expect(net).toMatch(/data-testid="dswf-remote-tab-lan"/)
    expect(net).toMatch(/dswf-remote-tab-internet/)
    expect(net).toContain('data-testid="dswf-remote-tunnel-empty"')
    expect(net).toMatch(/隧道暂不可用/)
    expect(net).not.toContain('正在建立隧道')
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
    expect(html).toMatch(/role="switch"/)
    expect(html).toMatch(/aria-checked="false"/)
    expect(html).not.toMatch(/type="checkbox"/)
    expect(html).toMatch(/远程已关闭——开启远程并重启宿主后生成配对二维码/)
    expect(html).not.toContain('dswf-remote-address')
    expect(html).not.toMatch(/待重启生效提示/)
  })

  it('监听中：开关选中 + 官方连接文案 + 局域网地址展示', () => {
    const html = renderToStaticMarkup(<RemotePanel snapshot={LISTENING} onToggle={() => undefined} />)
    expect(html).toMatch(/aria-checked="true"/)
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

  it('fix-8（用户裁决 2026-10-14）：配对面承载改回 dialog——图标触发器带 aria-haspopup="dialog"（官方 Modal 由点击开合，独立窗退役）', () => {
    const html = renderToStaticMarkup(
      <ForgeRemoteEntry status={sourceOf(LISTENING)} />,
    )
    expect(html).toMatch(/aria-haspopup="dialog"/)
    expect(html).not.toContain('dswf-remote-pairing-page')
    expect(html).not.toContain('forgePair')
  })

  it('fix-8：dialog 标题常量 = REMOTE_DIALOG_TITLE（「连接移动设备」——官方 Modal title 单源）', () => {
    expect(REMOTE_DIALOG_TITLE).toBe('连接移动设备')
  })
})

// ── fix-9（bug d9affbdf）：配对 dialog 样式逐位对齐官方实机七点差清单 ──

describe('fix-9 配对 dialog 样式对齐官方（bug d9affbdf）', () => {
  it('fix-11 反转①：brand 头退役——BrandWordmark/dswf-remote-brand 不在场；标题「连接移动设备」+ 右上关闭钮保留（headless Modal 自绘壳——headless 走 portal 归 e2e 面）', () => {
    const html = renderToStaticMarkup(<RemoteDialogHead onClose={() => undefined} />)
    expect(html).not.toContain('dswf-remote-brand')
    expect(html).not.toContain('BrandWordmark')
    expect(html).toContain('dswf-remote-dialog-title')
    expect(html).toMatch(/dswf-remote-dialog-title[^>]*>[\s\S]*连接移动设备/)
    expect(html).toMatch(/aria-label="关闭"/)
  })

  it('③说明文案居中置圆角卡内；⑥倒计时文案居中', () => {
    const html = renderToStaticMarkup(<RemotePanel snapshot={LISTENING} onToggle={() => undefined} />)
    expect(html).toMatch(/dswf-remote-note-card[^>]*>[\s\S]*扫码即可连接/)
    expect(html).toContain('dswf-remote-countdown')
  })

  it('⑤地址条 = pill 胶囊 + 等宽字体载体类 + 官方复制图标（aria-label 复制地址保留）', () => {
    const html = renderToStaticMarkup(<RemotePanel snapshot={LISTENING} onToggle={() => undefined} />)
    expect(html).toMatch(/dswf-remote-address dswf-remote-pill/)
    expect(html).toContain('dswf-remote-address-text')
    expect(html).toMatch(/aria-label="复制地址"/)
    expect(html).not.toContain('已复制')
  })

  it('⑦远程访问开关 = 官方 Switch 件（role="switch" aria-checked 全托管；fix-18 ① 起连接态独占——开关行属配对面，判读取 listening 态）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel snapshot={LISTENING} onToggle={() => undefined} />,
    )
    expect(html).toMatch(/role="switch"[\s\S]*aria-checked="true"/)
    expect(html).not.toMatch(/type="checkbox"/)
  })

  it('fix-10（bug ec239552）：连接成功态绿卡——✓ 手机已连接 + 后台保持文案 + 断开连接/完成双钮（官方锚 main.js:1176）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel
        snapshot={{ phase: 'connected' }}
        onToggle={() => undefined}
        onClose={() => undefined}
        onDisconnect={() => undefined}
      />,
    )
    expect(html).toContain('data-testid="dswf-remote-connected"')
    expect(html).toMatch(/✓[\s\S]*手机已连接/)
    expect(html).toMatch(/连接会在后台保持，现在可以关闭此窗口。/)
    expect(html).toMatch(/data-testid="dswf-remote-disconnect"[^>]*>[\s\S]*断开连接/)
    expect(html).toMatch(/data-testid="dswf-remote-done"[^>]*>[\s\S]*完成/)
    expect(html).not.toContain('dswf-remote-qr')
  })

  it('fix-10：完成钮 = onClose 缝；断开连接钮 = onDisconnect 缝（撤该设备会话动作）', () => {
    const calls: string[] = []
    const html = renderToStaticMarkup(
      <RemotePanel
        snapshot={{ phase: 'connected' }}
        onToggle={() => undefined}
        onClose={() => calls.push('close')}
        onDisconnect={() => {
          calls.push('disconnect')
          return undefined
        }}
      />,
    )
    expect(html).toMatch(/dswf-remote-disconnect/)
    expect(html).toMatch(/dswf-remote-done/)
    // 静态渲染钉缝在场；交互断言在插件装配面（remote-face）承载
    expect(calls).toEqual([])
  })

  it('fix-10：轮询刻度常量 = 800ms（官方锚 main.js:1194——dialog 开启期状态轮询单源）', () => {
    expect(REMOTE_STATUS_POLL_MS).toBe(800)
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

  it('fix-10（隧道卡死收敛）：隧道面缺席 = 互联网 tab 空态（非 starting 无限进行态——读数缝断裂/撤面均收敛空态）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel snapshot={LISTENING} onToggle={() => undefined} mode="internet" />,
    )
    expect(html).toContain('data-testid="dswf-remote-tunnel-empty"')
    expect(html).toMatch(/隧道暂不可用/)
    expect(html).not.toContain('正在建立隧道')
    expect(html).not.toContain('dswf-remote-tunnel-qr')
    expect(html).not.toContain('dswf-remote-tunnel-ttl')
  })

  it('在线（Pinggy）：QR（data-value = 隧道 URL，复用 react-qr-code 载体）+ TTL 横幅 + 链路标签 + PIN 引导（fix-18 ② 起无换线链接——链接为 cloudflared 专属）', () => {
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
    expect(html).not.toContain('dswf-remote-fallback-link')
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

  it('换线中：switching 相位 = 官方 fallbackLoading 文案（fix-18 ④——遮罩见专项组）', () => {
    const html = renderToStaticMarkup(
      <TunnelCard phase="switching" onFallback={() => undefined} />,
    )
    expect(html).toMatch(/dswf-remote-tunnel[^>]*data-phase="switching"/)
    expect(html).toMatch(/正在切换备用线路/)
    expect(html).not.toContain('dswf-remote-tunnel-qr')
  })

  it('fix-18 ② 换线链接显示条件（官方三因子）：pinggy 链路 = 不呈现（链接为 cloudflared 专属）', () => {
    const withSeam = renderToStaticMarkup(
      <TunnelCard phase="online" url={TUNNEL_URL} provider="pinggy" onFallback={() => undefined} />,
    )
    expect(withSeam).not.toContain('dswf-remote-fallback-link')
    const noSeam = renderToStaticMarkup(<TunnelCard phase="online" url={TUNNEL_URL} provider="pinggy" />)
    expect(noSeam).not.toContain('dswf-remote-fallback-link')
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

// ── fix-17：官方交互复刻（QR 隧道面倒计时 / tab 切换重连 / 互联网 PIN 卡） ──

describe('fix-17 ① 隧道面 QR 倒计时（官方 :1145-1147/:1196——倒计时读数对齐 token TTL 5min）', () => {
  it('互联网 tab 在线态：QR 下方 token TTL 倒计时行（「二维码将在 N 秒后刷新」——与 LAN 面同文案单源）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel
        snapshot={{
          ...LISTENING,
          tunnel: TUNNEL_PINGGY,
          pairExpiresAt: Date.now() + 120_000,
        }}
        onToggle={() => undefined}
        mode="internet"
      />,
    )
    expect(html).toContain('data-testid="dswf-remote-tunnel-countdown"')
    expect(html).toMatch(/二维码将在 \d+ 秒后刷新/)
  })

  it('隧道读数/倒计时缺席 = 零倒计时行（不伪装）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel snapshot={{ ...LISTENING, tunnel: TUNNEL_CF }} onToggle={() => undefined} mode="internet" />,
    )
    expect(html).not.toContain('dswf-remote-tunnel-countdown')
  })
})

describe('fix-17 ③ 互联网 tab 连接密码 PIN 卡（官方 :1199-1215——6 位数字 + 有效期倒计时）', () => {
  it('internet tab：PIN 卡在场（大字号 6 位 + 倒计时行）；lan tab 不呈现', () => {
    const snapshot: RemoteStatusSnapshot = {
      ...LISTENING,
      tunnel: TUNNEL_PINGGY,
      pin: '482913',
      pinExpiresAt: Date.now() + 240_000,
    }
    const net = renderToStaticMarkup(
      <RemotePanel snapshot={snapshot} onToggle={() => undefined} mode="internet" />,
    )
    expect(net).toContain('data-testid="dswf-remote-pin"')
    expect(net).toMatch(/482913/)
    expect(net).toMatch(/PIN 有效期还剩 \d+ 秒/)
    const lan = renderToStaticMarkup(
      <RemotePanel snapshot={snapshot} onToggle={() => undefined} mode="lan" />,
    )
    expect(lan).not.toContain('dswf-remote-pin')
  })

  it('PIN 读数缺席 = 零 PIN 卡（不伪装、不占位）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel snapshot={{ ...LISTENING, tunnel: TUNNEL_PINGGY }} onToggle={() => undefined} mode="internet" />,
    )
    expect(html).not.toContain('dswf-remote-pin')
  })

  it('PIN 倒计时纯函数 pinCountdownText = 「PIN 有效期还剩 N 秒」', () => {
    expect(pinCountdownText(240)).toBe('PIN 有效期还剩 240 秒')
  })
})

describe('fix-17 ② tab 切换重连缝（官方 :1187 模式切换语义——纯函数单源）', () => {
  it('modeSelectEffectOf：internet × 隧道在线 = refresh；internet × 非在线 = ensure；lan = refresh', () => {
    expect(modeSelectEffectOf('internet', 'online')).toBe('refresh')
    expect(modeSelectEffectOf('internet', 'starting')).toBe('ensure')
    expect(modeSelectEffectOf('internet', 'failed')).toBe('ensure')
    expect(modeSelectEffectOf('internet', 'switching')).toBe('ensure')
    expect(modeSelectEffectOf('lan', 'online')).toBe('refresh')
    expect(modeSelectEffectOf('lan', 'starting')).toBe('refresh')
  })
})

// ── fix-11（用户裁决 2026-10-14）：去 brand 头 + 宽度翻倍不换行 + 手机图标三态色 ──
// CSS 面用例以样式表源文断言（静态标记不含 CSS；令牌取值按 DESIGN.md 语义色表：
// Warning #f59e0b = state-warning-primary / Success #22c55e = state-success-primary）

describe('fix-11 配对 dialog 样式裁决（宽度翻倍 + 三态色，remote.css 源文断言）', () => {
  const css = readFileSync(new URL('./remote.css', import.meta.url), 'utf8')

  it('②宽度翻倍：dialog 卡宽 696px（348 ×2）', () => {
    expect(css).toMatch(/\.dswf-remote-modal\s*\{[^}]*width:\s*696px/)
  })

  it('②不换行：说明/倒计时/说明行单行 + 地址 pill 单行溢出省略（复制钮 flex:none 不受挤压）', () => {
    expect(css).toMatch(/\.dswf-remote-note-card\s*\{[^}]*white-space:\s*nowrap/)
    expect(css).toMatch(/\.dswf-remote-panel-note\s*\{[^}]*white-space:\s*nowrap/)
    expect(css).toMatch(
      /\.dswf-remote-address-text\s*\{[^}]*white-space:\s*nowrap[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/,
    )
    expect(css).toMatch(/\.dswf-remote-copy\s*\{[^}]*flex:\s*none/)
  })

  it('fix-13 关闭钮不贴边：右缘距卡缘留白 = 官方 Modal .header 右内距 14px', () => {
    // 官方 Modal.module.css .header { padding: 22px 14px 12px 24px } —— 关钮右缘距卡缘 14px
    expect(css).toMatch(/\.dswf-remote-dialog-close\s*\{[^}]*right:\s*-10px/)
    expect(css).not.toMatch(/\.dswf-remote-dialog-close\s*\{[^}]*right:\s*-24px/)
  })

  it('fix-14 Harness 菜单左缘不贴边：触发钮与 dialog 左缘留白 = 14px 内距刻度（关闭钮 right 侧对称镜像）', () => {
    expect(css).toMatch(/\.dswf-remote-harness\s*\{[^}]*left:\s*-10px/)
    expect(css).not.toMatch(/\.dswf-remote-harness\s*\{[^}]*left:\s*-24px/)
  })

  it('③fix-12 翻转：图标本体恒 currentColor（零 per-phase 着色）+ 圆点四态令牌（无/橙/绿/红）', () => {
    // 旧口径退役：入口钮不再按 phase 整体变色
    expect(css).not.toMatch(/\.dswf-remote-entry\[data-phase='off'\]/)
    expect(css).not.toMatch(/\.dswf-remote-entry\[data-phase='listening'\]/)
    expect(css).not.toMatch(/\.dswf-remote-entry\[data-phase='pending'\]/)
    expect(css).not.toMatch(/\.dswf-remote-entry\[data-phase='connected'\]/)
    // 圆点三色令牌（off = 零渲染无样式态）
    expect(css).toMatch(/\.dswf-remote-dot\[data-state='warning'\]\s*\{[^}]*state-warning-primary/)
    expect(css).toMatch(/\.dswf-remote-dot\[data-state='success'\]\s*\{[^}]*state-success-primary/)
    expect(css).toMatch(/\.dswf-remote-dot\[data-state='error'\]\s*\{[^}]*state-error-primary/)
  })
})

// ── fix-12：圆点四态渲染 + Harness 菜单三项（官方文案逐字 main.js:22317-22336） ──

describe('fix-12 图标圆点渲染（本体恒 currentColor）', () => {
  it('off = 无圆点（零渲染）', () => {
    const html = renderToStaticMarkup(<ForgeRemoteEntry status={sourceOf({ phase: 'off' })} />)
    expect(html).not.toContain('dswf-remote-dot')
  })

  it('listening = 圆点 warning / connected = success / pending = warning（data-state 单源）', () => {
    expect(renderToStaticMarkup(<ForgeRemoteEntry status={sourceOf(LISTENING)} />)).toMatch(
      /dswf-remote-dot" data-state="warning"/,
    )
    expect(
      renderToStaticMarkup(<ForgeRemoteEntry status={sourceOf({ phase: 'connected' })} />),
    ).toMatch(/dswf-remote-dot" data-state="success"/)
    expect(renderToStaticMarkup(<ForgeRemoteEntry status={sourceOf({ phase: 'pending' })} />)).toMatch(
      /dswf-remote-dot" data-state="warning"/,
    )
  })

  it('listening × 隧道 TTL 已到期 = 圆点 error（红）', () => {
    const html = renderToStaticMarkup(
      <ForgeRemoteEntry
        status={sourceOf({
          phase: 'listening',
          tunnel: { url: 'https://t.example/', provider: 'pinggy', expiresAt: Date.now() - 1_000 },
        })}
      />,
    )
    expect(html).toMatch(/dswf-remote-dot" data-state="error"/)
  })
})

describe('fix-12 Harness 菜单（dialog 左上角下拉——文案逐字对齐官方）', () => {
  const harness = {
    relaunchHarness: async () => undefined,
    relaunchSafeMode: async () => undefined,
    showHarnessLog: async () => undefined,
  }

  it('菜单触发钮在场（aria-label Harness 菜单）+ 三项文案逐字（官方 main.js:22317-22336 zh 形态）', () => {
    const html = renderToStaticMarkup(
      <RemoteDialogHead onClose={() => undefined} harness={harness} />,
    )
    expect(html).toMatch(/aria-label="Harness 菜单"/)
    // fix-14（DESIGN.md Dialog chrome 裁决）：触发器 = 纯文字「Harness」弃图标（官方菜单栏同词）
    expect(html).toMatch(/dswf-remote-harness-trigger[^>]*>Harness<\/button>/)
    expect(html).toContain('重启 Harness')
    expect(html).toContain('以安全模式重启…')
    expect(html).toContain('查看 Harness 日志')
  })

  it('HARNESS_MENU_ITEMS 常量逐字 pin（文案单源）', () => {
    expect(HARNESS_MENU_ITEMS).toEqual({
      relaunch: '重启 Harness',
      safeMode: '以安全模式重启…',
      showLog: '查看 Harness 日志',
    })
  })

  it('桥缺席（harness undefined）= 三项禁用态 fail-soft（触发钮禁用、菜单不炸装配）', () => {
    const html = renderToStaticMarkup(<RemoteDialogHead onClose={() => undefined} />)
    expect(html).toMatch(/aria-label="Harness 菜单"[^>]*disabled/)
    expect(html).toMatch(/dswf-remote-harness-relaunch[^>]*disabled/)
    expect(html).toMatch(/dswf-remote-harness-safe-mode[^>]*disabled/)
    expect(html).toMatch(/dswf-remote-harness-show-log[^>]*disabled/)
  })

  it('harnessBridgeOf：dshForge 三成员齐备才可用；缺席/形状不符 = undefined', () => {
    expect(harnessBridgeOf({})).toBeUndefined()
    expect(harnessBridgeOf({ dshForge: { invoke: () => undefined } })).toBeUndefined()
    expect(harnessBridgeOf({ dshForge: harness })).toBe(harness)
  })
})

// ── fix-15（bug f4b55bb9）：Harness 菜单失焦自动收起（官方 Menu/dropdown 惯例——焦点离开
//    即关）。容器内焦点移动/容器内 pointerdown 不收；焦点离容器、容器外按下、窗口失焦即收。 ──
describe('fix-15 Harness 菜单失焦收起判定（纯函数）', () => {
  const inside = { id: 'inside' }
  const outside = { id: 'outside' }
  const container = { contains: (node: unknown) => node === inside }

  it('focusout：relatedTarget 在容器外或缺席 = 收；容器内移动 = 不收', () => {
    expect(harnessMenuFocusLeft(outside, container)).toBe(true)
    expect(harnessMenuFocusLeft(null, container)).toBe(true)
    expect(harnessMenuFocusLeft(inside, container)).toBe(false)
  })

  it('pointerdown：目标在容器外或缺席 = 收；容器内（触发钮/菜单项）= 不收', () => {
    expect(harnessMenuPointerOutside(outside, container)).toBe(true)
    expect(harnessMenuPointerOutside(null, container)).toBe(true)
    expect(harnessMenuPointerOutside(inside, container)).toBe(false)
    expect(harnessMenuPointerOutside(inside, null)).toBe(true)
  })
})

// ── fix-16（tab 内容随模式切换）：说明文案与 LAN 地址条移入 mode 分流——lan = WiFi 文案 +
//    LAN 地址条（现状）；internet = 互联网说明文案，无 WiFi/LAN 残留。 ──
describe('fix-16 RemotePanel tab 内容随模式切换', () => {
  const LAN_SNAPSHOT: RemoteStatusSnapshot = {
    ...LISTENING,
    pairExpiresAt: Date.now() + 120_000,
  }

  it('lan 模式 = WiFi 文案 + LAN 地址条在场（现状保持）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel snapshot={LAN_SNAPSHOT} onToggle={() => undefined} mode="lan" />,
    )
    expect(html).toMatch(/同一 WiFi/)
    expect(html).toContain('dswf-remote-address')
    expect(html).toContain('http://192.168.1.7:8787')
  })

  it('internet 模式 = 互联网说明文案；无 WiFi 文案/LAN 地址条残留', () => {
    const html = renderToStaticMarkup(
      <RemotePanel snapshot={LAN_SNAPSHOT} onToggle={() => undefined} mode="internet" />,
    )
    expect(html).toMatch(/无需同一 WiFi/)
    expect(html).not.toMatch(/同一 WiFi，同步实时性高/)
    expect(html).not.toContain('dswf-remote-address')
    expect(html).not.toContain('http://192.168.1.7:8787')
  })
})

// ── fix-18：连接态独占 / 换线链接 / PIN 方框重置取消 / 切换遮罩（实机五项走查 2026-10-15；
//    官方单源对照 = .forge/docs/probes/official-pairing-page-spec.md） ──

/** 互联网 tab 在线快照（cloudflared 隧道 + PIN 读数齐备——五项测试共用载体） */
const TUNNEL_ONLINE: RemoteStatusSnapshot = {
  ...LISTENING,
  pin: '654321',
  pinExpiresAt: Date.now() + 300_000,
  tunnel: {
    url: 'https://x.trycloudflare.com/pair?token=t',
    provider: 'cloudflared',
    expiresAt: Date.now() + 3_600_000,
  },
}

describe('fix-18 ① 连接成功态独占（配对面整体退场——官方 :1176 连接态卡）', () => {
  it('connected：仅连接卡+说明+双钮——tab/隧道卡/PIN/说明卡/地址条全部退场', () => {
    const html = renderToStaticMarkup(
      <RemotePanel
        snapshot={{ phase: 'connected', tunnel: TUNNEL_ONLINE.tunnel, pin: '654321', pinExpiresAt: TUNNEL_ONLINE.pinExpiresAt }}
        onToggle={() => undefined}
        mode="internet"
      />,
    )
    expect(html).toContain('data-testid="dswf-remote-connected"')
    expect(html).not.toContain('dswf-remote-tab-lan')
    expect(html).not.toContain('dswf-remote-tab-internet')
    expect(html).not.toContain('data-testid="dswf-remote-tunnel"')
    expect(html).not.toContain('data-testid="dswf-remote-pin"')
    expect(html).not.toContain('dswf-remote-note-card')
    expect(html).not.toContain('dswf-remote-address')
    expect(html).not.toContain('data-testid="dswf-remote-countdown"')
  })
})

describe('fix-18 ② 换线 = 官方下划线链接「扫码打不开？换一条线路」（fallback-link 形态）', () => {
  it('online × cloudflared × 缝在场 = 链接呈现（旧「换线」按钮退役）', () => {
    const html = renderToStaticMarkup(
      <TunnelCard phase="online" url="https://x/pair?token=t" provider="cloudflared" onFallback={() => undefined} />,
    )
    expect(html).toContain('data-testid="dswf-remote-fallback-link"')
    expect(html).toContain('扫码打不开？换一条线路')
    expect(html).not.toContain('dswf-remote-tunnel-fallback')
  })

  it('pinggy 链路 / switching 中 / 缝缺席 = 链接不呈现（官方显示三因子）', () => {
    expect(
      renderToStaticMarkup(<TunnelCard phase="online" url="u" provider="pinggy" onFallback={() => undefined} />),
    ).not.toContain('dswf-remote-fallback-link')
    expect(
      renderToStaticMarkup(<TunnelCard phase="switching" url="u" provider="cloudflared" onFallback={() => undefined} />),
    ).not.toContain('dswf-remote-fallback-link')
    expect(
      renderToStaticMarkup(<TunnelCard phase="online" url="u" provider="cloudflared" />),
    ).not.toContain('dswf-remote-fallback-link')
  })
})

describe('fix-18 ④ 切换中 QR 灰色半透明遮罩 + tab 防重入', () => {
  it('switching：QR 保留并覆盖遮罩（「正在切换备用线路」进行态文案）', () => {
    const html = renderToStaticMarkup(
      <TunnelCard phase="switching" url="https://x/pair?token=t" provider="cloudflared" onFallback={() => undefined} />,
    )
    expect(html).toContain('data-testid="dswf-remote-tunnel-qr"')
    expect(html).toContain('data-testid="dswf-remote-qr-overlay"')
    expect(html).toContain('正在切换备用线路')
  })

  it('online：遮罩不呈现（零切换零遮罩）', () => {
    const html = renderToStaticMarkup(
      <TunnelCard phase="online" url="https://x/pair?token=t" provider="cloudflared" onFallback={() => undefined} />,
    )
    expect(html).not.toContain('dswf-remote-qr-overlay')
  })

  it('switching 受控缝：ModeTabs 双 tab 禁用（防重入）；常态不禁用', () => {
    const switching = renderToStaticMarkup(
      <RemotePanel snapshot={TUNNEL_ONLINE} mode="internet" switching onFallback={() => undefined} />,
    )
    expect(switching).toMatch(/dswf-remote-tab-lan[^>]*disabled/)
    expect(switching).toMatch(/dswf-remote-tab-internet[^>]*disabled/)
    expect(switching).toContain('data-testid="dswf-remote-qr-overlay"')
    const idle = renderToStaticMarkup(
      <RemotePanel snapshot={TUNNEL_ONLINE} mode="internet" onFallback={() => undefined} />,
    )
    expect(idle).not.toMatch(/dswf-remote-tab-lan[^>]*disabled/)
  })
})

describe('fix-18 ③ PIN 独立方框卡（官方布局）+ 重置/取消动作', () => {
  it('PIN 读数在场：方框卡（label「连接密码」+ 大字值 + 倒计时 + 重置密码/取消双动作）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel snapshot={TUNNEL_ONLINE} mode="internet" onPinReset={() => undefined} />,
    )
    expect(html).toContain('data-testid="dswf-remote-pin"')
    expect(html).toContain('连接密码')
    expect(html).toContain('654321')
    expect(html).toContain('data-testid="dswf-remote-pin-reset"')
    expect(html).toContain('重置密码')
    expect(html).toContain('data-testid="dswf-remote-pin-cancel"')
    expect(html).toMatch(/dswf-remote-pin-cancel[^>]*>取消</)
  })

  it('onPinReset 缺席 = 重置动作禁用态（缝缺席 fail-soft）', () => {
    const html = renderToStaticMarkup(<RemotePanel snapshot={TUNNEL_ONLINE} mode="internet" />)
    expect(html).toMatch(/dswf-remote-pin-reset[^>]*disabled/)
  })
})
