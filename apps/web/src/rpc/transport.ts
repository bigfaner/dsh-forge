// RPC 传输面（定位：基础——preload 桥的 forge:* 调用切片）。
// 形状权威 = apps/host/src/ipc/preload-api.ts 的 window.dshForge.invoke（结构同型镜像，
// 运行期边界禁 import host 源码——web/host 不 import 彼此）；通道常量唯一源 =
// @dsh-forge/contracts channels（transport 只透传不解释通道名，allowlist 守门在 preload/main 两侧）。

/** forge:* 通道调用形状（client 注入消费——测试替身与 preload 真身同型） */
export type ForgeTransport = (channel: string, payload?: unknown) => Promise<unknown>

/** preload 暴露面的 RPC 切片（window.dshForge.invoke） */
interface DshForgeInvokeGlobal {
  invoke(channel: string, payload?: unknown): Promise<unknown>
}

/** 取 preload 传输真身；缺席即装配断裂（host 未接 preload / 非 Electron 载体），fail-loud。 */
export function preloadTransport(): ForgeTransport {
  const bridge = (globalThis as { dshForge?: DshForgeInvokeGlobal }).dshForge
  if (bridge === undefined || typeof bridge.invoke !== 'function') {
    throw new Error(
      'dsh-forge web: window.dshForge.invoke 缺席——宿主 preload 未接 RPC 面（forge:* 通道常量 = @dsh-forge/contracts channels）',
    )
  }
  return (channel, payload) => bridge.invoke(channel, payload)
}
