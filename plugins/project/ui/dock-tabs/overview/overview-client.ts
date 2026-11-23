// 概览数据路双宿主收口（T1-head——overview-dockkit-alignment）：
//   头路（projects/stats/features）= Typert 适配单通路（官方宿主 forgeProjects/forgeDirs
//   namespace 可达；dsh-forge 集成态 apply 期 installForgeRemoteFace 同源装配同样命中——
//   typert-transport 两宿主单通路注）。preload transport（window.dshForge.invoke）官方宿主
//   构造期即抛——头数据路不再依赖 preload 通道。
//   bugs 列路保留 fix-20 本地读缝（dsh-forge host 本地 forgeBugs 供数缝单源；本地缝不可达
//   时 Typert fail-soft 回落——原语义不动）。
import { BUGS_CHANNELS } from '@dsh-forge/contracts'
import { createForgeRpcClient, preloadTransport, type ForgeRpcClient, type ForgeTransport } from '../rpc-channels.js'
import { typertTransport } from '../typert-transport.js'

/** 概览 transport（头路 = Typert 单通路；bugs 列路 = 本地 forgeBugs 缝 + Typert fail-soft 回落） */
export function overviewTransport(): ForgeTransport {
  const typert = typertTransport()
  let preload: ForgeTransport | undefined
  const preloadOf = (): ForgeTransport => (preload ??= preloadTransport())
  return async (channel, payload) => {
    if (channel !== BUGS_CHANNELS.list) return typert(channel, payload)
    try {
      return await preloadOf()(channel, payload)
    } catch {
      // 本地缝不可达（通道缺席/宿主 preload 缺席）——Typert 可选加速回落（fail-soft）
      return typert(channel, payload)
    }
  }
}

/** 概览 RPC client（概览 dock tab 族 makeClient 缺省真身——头路 Typert + bugs 本地读缝） */
export function overviewRpcClientFactory(): ForgeRpcClient {
  return createForgeRpcClient(overviewTransport())
}
