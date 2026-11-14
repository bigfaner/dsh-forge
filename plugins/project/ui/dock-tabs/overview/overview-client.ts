// 概览行集读缝自洽化（bug 24311b78——fix-19）：bugs 子 tab 行集/计数 chips 读缝改
// 插件自有 forgeBugs（forgeBugsController = plugins/project/host/bugs 服务，读
// project.db——与 bug-register 写入缝同源闭合）；core forge:bugs/* preload 读缝自本面
// 退役——降级为 dsh-forge 集成态可选加速（fail-soft 不阻塞、不作数据源）。
// 路由形态 = transport 级分流：forge:bugs/list 单通道重定向到 Typert 适配（官方宿主与
// dsh-forge 集成态同径）；其余通道原样走 preload（读缝斩除只限 bugs 面——零范围外漂移）。
// window.dshForge 缺席（无 core 环境形态）时非 bugs 通道按既有 fail-loud 语义收敛——
// bugs 读缝不依赖 core 通道，解析恒成立。
import { BUGS_CHANNELS } from '@dsh-forge/contracts'
import { createForgeRpcClient, preloadTransport, type ForgeRpcClient, type ForgeTransport } from '../rpc-channels.js'
import { typertTransport } from '../typert-transport.js'

/** 概览 transport（bugs 读缝 = Typert forgeBugs 同库；其余 = preload 原样） */
export function overviewTransport(): ForgeTransport {
  const bugsTypert = typertTransport()
  let preload: ForgeTransport | undefined
  const preloadOf = (): ForgeTransport => (preload ??= preloadTransport())
  return (channel, payload) =>
    channel === BUGS_CHANNELS.list ? bugsTypert(channel, payload) : preloadOf()(channel, payload)
}

/** 概览 RPC client（概览 dock tab 族 makeClient 缺省真身——bugs 读缝同库单源） */
export function overviewRpcClientFactory(): ForgeRpcClient {
  return createForgeRpcClient(overviewTransport())
}
