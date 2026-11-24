// dock tab 族 Typert 传输适配（1.13 随六组件迁包，fix-15 同径）：通道字符串
// （forge:<seg>/<method>，contracts 常量单源）映射到官方 Typert remote face 的 namespace
// 方法（installForgeRemoteFace 页内锚解析缝逐调用现查；namespace 取法 = rpc.ts
// namespaceFaceOf 归一——Map/对象/顶层三形态零漂移）：在场通道照常送达；缺席通道
// （官方宿主 registry 未提供对应 namespace）= typed 拒绝信封（RpcErr 形），消费面既有
// 错误相位收敛，零槽渲染崩溃。forgeTasks = 本包自有 namespace（host 半 Typert 工件
// 另批落位——face 缺席同径 typed 降级）。preload dshForge transport 不随迁（本包 client
// 产物零 dshForge 引用——self-containment 机检锚）。
import { createForgeRpcClient, type ForgeTransport } from "./rpc-channels.js";
import { forgeRemoteFaceOf, namespaceFaceOf, type ForgeRemoteFace } from "../rpc.js";

/** 通道 seg → Typert namespace（可选族集；contracts channels 常量的 seg 单源映射）。
 *  2.9 死依赖拔除：projects/fs/bugs/features 行移除——task-loop ui 侧零消费（逐族核销
 *  去向列任务结算；消费方在 project 包侧副本），通道命中即 typed 降级不阻断其余族。 */
const SEG_NAMESPACE: Readonly<Record<string, keyof ForgeRemoteFace>> = {
  worktree: "forgeWorktree",
  dirs: "forgeDirs",
  tasks: "forgeTasks",
  docs: "forgeDocs",
  knowledge: "forgeKnowledge",
  settings: "forgeSettings",
};

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
    const fn = namespace?.[parts?.method ?? ""]
    if (typeof fn !== "function") {
      return {
        ok: false,
        error: {
          code: "internal",
          message: `forge:${parts?.seg ?? "?"}/${parts?.method ?? "?"} 通道在官方宿主不可达（Typert 未提供该 namespace 方法）——typed 降级`,
        },
      }
    }
    const raw = await (fn as (arg?: unknown) => unknown)(payload)
    if (raw === null || typeof raw !== "object" || !("ok" in raw)) {
      return {
        ok: false,
        error: { code: "internal", message: `forge:${parts!.seg}/${parts!.method} 响应形状非法（期望 RemoteResult 信封）` },
      }
    }
    const result = raw as { ok: boolean; value?: unknown; error?: { code?: unknown; message?: unknown; details?: unknown } }
    if (result.ok) return { ok: true, data: result.value }
    return {
      ok: false,
      error: {
        code: typeof result.error?.code === "string" ? result.error.code : "internal",
        message: typeof result.error?.message === "string" ? result.error.message : "forge remote failure",
        data: result.error?.details,
      },
    }
  }
}

/**
 * dock tab 族 makeClient 缺省真身（1.13 迁包——组件族 makeClient 缺省统一指本工厂）：
 * transport = Typert 适配（官方宿主可达；零 dshForge 依赖——构造期不抛）。
 */
export function typertRpcClientFactory(): ReturnType<typeof createForgeRpcClient> {
  return createForgeRpcClient(typertTransport())
}

