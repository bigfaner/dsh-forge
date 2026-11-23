// dock tab 族 Typert 传输适配（fix-15——bug 9c5469c8 斩传输收口，fix-14 同族残留批斩）：
// dock-tabs/knowledge rpc-channels 的缺省 makeClient 骑已退役的 preload 传输
// （宿主 preload 专有 invoke 全局——dsh-forge host 专属），官方宿主构造期即崩 → 概览
// dock tab 零渲染。本适配把通道字符串（forge:<seg>/<method>，contracts 常量单源）映射到
// 官方 Typert remote face 的 namespace 方法（installForgeRemoteFace 页内锚解析缝逐调用
// 现查；namespace 取法 = rpc.ts namespaceFaceOf 归一——Map/对象/顶层三形态零漂移）：
// 在场通道照常送达；缺席通道（forge:tasks/docs/knowledge/settings——官方宿主无对应
// namespace）= typed 拒绝信封（RpcErr 形），消费面既有错误相位收敛，零槽渲染崩溃。
// 在 dsh-forge 集成态行为不变性：apply 期 installForgeRemoteFace 与 host preload 面
// 同源装配，适配面同样命中——两宿主单通路。
import { createForgeRpcClient, type ForgeTransport } from './rpc-channels.js'
import { forgeRemoteFaceOf, namespaceFaceOf, type ForgeRemoteFace } from '../rpc.js'

/** 通道 seg → Typert namespace（六族在场集；contracts channels 常量的 seg 单源映射） */
const SEG_NAMESPACE: Readonly<Record<string, keyof ForgeRemoteFace>> = {
  projects: 'forgeProjects',
  fs: 'forgeFs',
  bugs: 'forgeBugs',
  worktree: 'forgeWorktree',
  features: 'forgeFeatures',
  dirs: 'forgeDirs',
  specs: 'forgeSpecs', // G3 spec 子 tab（spec 插件缺席 = namespace 缺席 → typed 拒绝信封，可选边）
}

/** 通道字符串解析（forge:<seg>/<method>——形状漂移 = null 调用方 typed 降级） */
function channelPartsOf(channel: string): { readonly seg: string; readonly method: string } | null {
  const match = /^forge:([a-z]+)\/([A-Za-z]+)$/.exec(channel)
  return match === null ? null : { seg: match[1]!, method: match[2]! }
}

/**
 * Typert 传输适配（ForgeTransport 同形）：通道字符串 → namespace 方法调用，RemoteResult
 * 信封投影为 RpcResult（{ok,data|error}）。face/namespace/方法缺席 = typed 拒绝信封
 * （不抛构造错——消费面错误相位 fail-soft）。
 */
export function typertTransport(): ForgeTransport {
  return async (channel, payload) => {
    const parts = channelPartsOf(channel)
    const namespaceName = parts === null ? undefined : SEG_NAMESPACE[parts.seg]
    const face = forgeRemoteFaceOf()
    const namespace = face === undefined || namespaceName === undefined ? undefined : namespaceFaceOf(face, namespaceName)
    const fn = namespace?.[parts?.method ?? '']
    if (typeof fn !== 'function') {
      return {
        ok: false,
        error: {
          code: 'internal',
          message: `forge:${parts?.seg ?? '?'}/${parts?.method ?? '?'} 通道在官方宿主不可达（Typert 未提供该 namespace 方法）——typed 降级`,
        },
      }
    }
    const raw = await (fn as (arg?: unknown) => unknown)(payload)
    if (raw === null || typeof raw !== 'object' || !('ok' in raw)) {
      return {
        ok: false,
        error: { code: 'internal', message: `forge:${parts!.seg}/${parts!.method} 响应形状非法（期望 RemoteResult 信封）` },
      }
    }
    const result = raw as { ok: boolean; value?: unknown; error?: { code?: unknown; message?: unknown; details?: unknown } }
    if (result.ok) return { ok: true, data: result.value }
    return {
      ok: false,
      error: {
        code: typeof result.error?.code === 'string' ? result.error.code : 'internal',
        message: typeof result.error?.message === 'string' ? result.error.message : 'forge remote failure',
        data: result.error?.details,
      },
    }
  }
}

/**
 * dock tab 族 makeClient 缺省真身（fix-15）：transport = Typert 适配（官方宿主可达；
 * preload invoke 全局零依赖——构造期不抛）。
 */
export function typertRpcClientFactory(): ReturnType<typeof createForgeRpcClient> {
  return createForgeRpcClient(typertTransport())
}
