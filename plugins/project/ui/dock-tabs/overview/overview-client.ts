// 概览行集读缝自洽化（bug 24311b78——fix-19；bug 145b3d3b——fix-20）：bugs 子 tab 行集/
// 计数 chips 数据源 = 插件本地 forgeBugs（plugins/project/host/bugs = project.db——与
// bug-register 写入缝/seed 缝同库闭合），经本地 preload 通道（window.dshForge.invoke →
// forge:bugs/list——宿主供数缝自 fix-20 起改接插件 forge.bugs 缝）投影。
// Typert/forge remote 消费在该行集路径归零为数据源：仅当本地缝不可达（通道缺席/调用
// 失败/window.dshForge 缺席——官方 web 舞台形态）时 fail-soft 回落 Typert 适配作可选加速，
// 不作数据源。其余通道原样走 preload（读缝斩除只限 bugs 面——零范围外漂移）。
import { BUGS_CHANNELS } from '@dsh-forge/contracts'
import { createForgeRpcClient, preloadTransport, type ForgeRpcClient, type ForgeTransport } from '../rpc-channels.js'
import { typertTransport } from '../typert-transport.js'

/** 概览 transport（bugs 数据源 = 插件本地 forgeBugs；Typert = fail-soft 回落加速） */
export function overviewTransport(): ForgeTransport {
  const bugsTypert = typertTransport()
  let preload: ForgeTransport | undefined
  const preloadOf = (): ForgeTransport => (preload ??= preloadTransport())
  return async (channel, payload) => {
    if (channel !== BUGS_CHANNELS.list) return preloadOf()(channel, payload)
    try {
      return await preloadOf()(channel, payload)
    } catch {
      // 本地缝不可达（通道缺席/宿主 preload 缺席）——Typert 可选加速回落（fail-soft）
      return bugsTypert(channel, payload)
    }
  }
}

/** 概览 RPC client（概览 dock tab 族 makeClient 缺省真身——bugs 读缝本地单源） */
export function overviewRpcClientFactory(): ForgeRpcClient {
  return createForgeRpcClient(overviewTransport())
}
