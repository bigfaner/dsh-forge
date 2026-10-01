// G1 pin ②：`__DSH_TRANSPORT__` carrier。
// 权威：tech-design Appendix 契约面清单第 2 项 + S2 spike §1。上游面（0.2.0-rc.2）：
//   - dsh-client-connection `apply(ctx)` 读 `globalThis.__DSH_TRANSPORT__` 整体作为
//     `installConnection(ctx, { transport })` 的物理载波（浏览器插件 apply 面）
//   - ClientTransportHooks = 载波形状（rpc?/fetch?/openStream?/loadBundle?/ownsHost?/streamBaseUrl?）
//     ——产品只消费 ownsHost/streamBaseUrl 切片（desktop 形态：页面排他拥有宿主 + ws 基址）
//   - README「Use this package」公开文档化 `__DSH_TRANSPORT__.streamBaseUrl` 语义
// 我方镜像：apps/web/src/shell/carrier.ts（TransportCarrier 结构同型切片）。
// Hard Rule 边界：浏览器面 client bundle 无法 Node 直载（window 引用），carrier 名与
// 形状以随包分发的 d.ts + README + client.js 全局名读取行为做文本/结构 pin。
import { describe, expect, it } from 'vitest'
import { installTransportCarrier, transportCarrierFor } from '../../apps/web/src/shell/carrier.js'
import { expectPinnedVersion, norm, readTypes, readUpstream } from './pins.js'

describe('pin ②-1 版本锚', () => {
  it('dsh-client-connection（host 锚，运行期组合闭包成员）= 精确 pin 版本', () => {
    expectPinnedVersion('host', '@deepseek-ai/dsh-client-connection')
  })
})

describe('pin ②-2 ClientTransportHooks 公开形状（d.ts）', () => {
  const types = readTypes(
    'host',
    '@deepseek-ai/dsh-client-connection',
    'lib/types/client/index.d.ts',
  )

  it('接口在场且导出（physical carrier 公开类型）', () => {
    expect(types).toContain('export interface ClientTransportHooks')
  })

  it('ownsHost?: boolean——页面排他拥有宿主声明（isLoopback 特权面判定依据）', () => {
    expect(types).toContain('ownsHost?: boolean')
    expect(types).toContain('The transport owner declares the page owns the Host outright')
  })

  it('streamBaseUrl?: string——壳自有宿主 HTTP origin（ws 基址异源解析）', () => {
    expect(types).toContain('streamBaseUrl?: string')
    expect(types).toContain('HTTP origin of a shell-owned Host when its WebSocket uses a different page origin')
  })

  it('载波消费口：installConnection 的 transport?: ClientTransportHooks 选项', () => {
    expect(types).toMatch(/readonly transport\?: ClientTransportHooks/)
  })
})

describe('pin ②-3 carrier 全局名（运行期读取行为 + 公开文档）', () => {
  it('client bundle 读取 globalThis.__DSH_TRANSPORT__（apply 面整读为 transport）', () => {
    const client = readUpstream('host', '@deepseek-ai/dsh-client-connection', 'lib/client.js')
    const hit = client.match(/globals\.__DSH_TRANSPORT__/)
    expect(hit).not.toBeNull()
    expect(client).toContain('...transport === void 0 ? {} : { transport }')
  })

  it('README 公开文档化 __DSH_TRANSPORT__.streamBaseUrl（desktop 载波语义）', () => {
    const readme = readUpstream('host', '@deepseek-ai/dsh-client-connection', 'README.md')
    expect(readme).toContain('__DSH_TRANSPORT__.streamBaseUrl')
    expect(norm(readme)).toContain('The desktop carrier owns authentication')
  })
})

describe('pin ②-4 我方镜像兼容（apps/web shell carrier）', () => {
  it('transportCarrierFor：ownsHost=true（desktop 排他）+ streamBaseUrl=已认证面 origin', () => {
    expect(transportCarrierFor('http://127.0.0.1:8421/some/path?x=1')).toEqual({
      ownsHost: true,
      streamBaseUrl: 'http://127.0.0.1:8421',
    })
  })

  it('installTransportCarrier 装载 globalThis.__DSH_TRANSPORT__（幂等重装以最新为准）', () => {
    const g = globalThis as { __DSH_TRANSPORT__?: { ownsHost: boolean; streamBaseUrl: string } }
    installTransportCarrier({ ownsHost: true, streamBaseUrl: 'http://127.0.0.1:1' })
    expect(g.__DSH_TRANSPORT__?.streamBaseUrl).toBe('http://127.0.0.1:1')
    installTransportCarrier({ ownsHost: true, streamBaseUrl: 'http://127.0.0.1:2' })
    expect(g.__DSH_TRANSPORT__?.streamBaseUrl).toBe('http://127.0.0.1:2')
    delete g.__DSH_TRANSPORT__
  })

  it('镜像切片 ⊆ 上游 ClientTransportHooks 成员集（结构同型不越面）', () => {
    const types = readUpstream('host', '@deepseek-ai/dsh-client-connection', 'lib/types/client/index.d.ts')
    const block = types.match(/export interface ClientTransportHooks \{[\s\S]*?\n\}/)?.[0] ?? ''
    const upstreamMembers = new Set(
      [...norm(block).matchAll(/(?:^| )((?:readonly )?[A-Za-z_$][\w$]*\??):/g)].map((m) =>
        (m[1] as string).replace(/^readonly /, '').replace(/\?$/, ''),
      ),
    )
    // 镜像消费切片 = {ownsHost, streamBaseUrl}，两键均属上游公开面；
    // 上游其余成员（rpc/fetch/openStream/loadBundle）为 worker 形态面，产品不消费、不 pin
    expect(upstreamMembers.has('ownsHost')).toBe(true)
    expect(upstreamMembers.has('streamBaseUrl')).toBe(true)
  })
})
