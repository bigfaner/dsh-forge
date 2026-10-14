// 手机远程入口 + 远程面板单测（mobile-remote-approval 1.2）——静态渲染面（renderToStaticMarkup
// 纯渲染同 2.6 组件测法）：图标三态（官方反射面快照驱动 / 缺席 fail-soft 灰态）+ 面板
// （开关默认关 / 配对入口 / 局域网地址展示）。开弹层交互归装配（插件槽 inject 面），
// 本层钉渲染语言与状态类名。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ForgeRemoteEntry, RemotePanel } from './ForgeRemoteEntry.js'
import type { RemoteStatusSnapshot } from './remote-status.js'
import type { SnapshotSource } from '../sidebar/sidebar-model.js'

function sourceOf(snapshot: RemoteStatusSnapshot): SnapshotSource<RemoteStatusSnapshot> {
  return { getSnapshot: () => snapshot, subscribe: () => () => {} }
}

const LISTENING: RemoteStatusSnapshot = { phase: 'listening', lanAddress: 'http://192.168.1.7:8787' }

describe('RemotePanel 配对二维码（1.7 扫码对齐官方——QR 内容 = 官方配对/连接地址）', () => {
  it('监听中：QR 锚在场（data-value pin 连接地址）+ svg 载体 + 地址文本兜底', () => {
    const html = renderToStaticMarkup(<RemotePanel snapshot={LISTENING} onToggle={() => undefined} />)
    expect(html).toContain('data-testid="dswf-remote-qr"')
    expect(html).toContain('data-value="http://192.168.1.7:8787"')
    expect(html).toMatch(/<svg/)
    expect(html).toContain('http://192.168.1.7:8787') // 地址文本兜底
  })

  it('有设备已连接：QR 同样在场（扫码连接不因已连接收回）', () => {
    const html = renderToStaticMarkup(
      <RemotePanel snapshot={{ phase: 'connected', lanAddress: 'http://192.168.1.7:8787' }} onToggle={() => undefined} />,
    )
    expect(html).toContain('data-testid="dswf-remote-qr"')
    expect(html).toContain('data-value="http://192.168.1.7:8787"')
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
})

describe('ForgeRemoteEntry 图标三态', () => {
  it('远程关 = data-phase off（灰态）', () => {
    const html = renderToStaticMarkup(<ForgeRemoteEntry status={sourceOf({ phase: 'off' })} />)
    expect(html).toContain('data-phase="off"')
    expect(html).toMatch(/远程已关闭/)
  })

  it('监听中 = data-phase listening（绿态）', () => {
    const html = renderToStaticMarkup(<ForgeRemoteEntry status={sourceOf(LISTENING)} />)
    expect(html).toContain('data-phase="listening"')
    expect(html).toMatch(/远程监听中/)
  })

  it('有设备已连接 = data-phase connected（亮态）', () => {
    const html = renderToStaticMarkup(<ForgeRemoteEntry status={sourceOf({ phase: 'connected' })} />)
    expect(html).toContain('data-phase="connected"')
    expect(html).toMatch(/设备已连接/)
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
  it('默认关：开关未选中 + 地址行回退提示', () => {
    const html = renderToStaticMarkup(
      <RemotePanel snapshot={{ phase: 'off' }} onToggle={() => undefined} />,
    )
    expect(html).toMatch(/type="checkbox"/)
    expect(html).not.toMatch(/checked/)
    expect(html).toMatch(/开启并重启宿主后显示局域网地址/)
    expect(html).not.toMatch(/待重启生效提示/)
  })

  it('监听中：开关选中 + 配对入口 + 局域网地址展示', () => {
    const html = renderToStaticMarkup(<RemotePanel snapshot={LISTENING} onToggle={() => undefined} />)
    expect(html).toMatch(/checked/)
    expect(html).toMatch(/配对/)
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

  it('状态行语言随相位（关闭/待重启/监听中/设备已连接）', () => {
    expect(renderToStaticMarkup(<RemotePanel snapshot={{ phase: 'connected' }} onToggle={() => undefined} />)).toMatch(
      /设备已连接/,
    )
    expect(renderToStaticMarkup(<RemotePanel snapshot={{ phase: 'pending' }} onToggle={() => undefined} />)).toMatch(
      /待重启生效/,
    )
  })
})
