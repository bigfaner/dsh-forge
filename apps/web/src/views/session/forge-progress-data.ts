// 'forge/progress' 节点数据面（定位：业务——1.17 循环进度流；壳树自持纯模块）。
// 边界纪律（2026-10-11 web boot 报障收口）：本模块原居 client-plugin/progress-node.ts，
// 因壳树视图 ForgeProgressNode runtime import 它，rollup 双入口拆出公共 chunk——
// forge-client.js 变 ESM（import{…}from）破坏 classic script 形状，模块系统报
// 「loaded without registering "@dsh-forge/web-client"」。守卫唯一 runtime 消费者 =
// 壳树视图，故归壳树；client 树零引用（定义面数据透传 unknown 不窄读）。
// 数据纪律：形状防御（plugin-forge isForgeProgressData 同语义镜像——他形不猜不抛）。

/** 节点数据（buildViewNode.data = append 侧 ForgeProgressEventData 原样整值，纯 JSON；
 * 时序锚走节点 anchorSeq（buildViewNode 自 state.seq 取），载荷无 seq——2026-10-12 报障收口：
 * 镜像守卫曾误要求 data.seq（append 契约无此位）恒 false → 组件静默 null 空行） */
export interface ForgeProgressNodeData {
  readonly sourceSlug: string
  readonly verb: 'claim' | 'claim-resume' | 'settle' | 'stop' | 'suspend'
  readonly status: 'running' | 'completed' | 'blocked' | 'interrupted'
  readonly taskKey?: string
  readonly scenario?: string
  readonly note?: string
  readonly counts?: { readonly pending: number; readonly running: number; readonly done: number }
  readonly at: number
}

/** 数据守卫（plugin-forge isForgeProgressData 同语义镜像——载荷位与 append 契约逐位同） */
export function isForgeProgressNodeData(value: unknown): value is ForgeProgressNodeData {
  if (typeof value !== 'object' || value === null) return false
  const raw = value as Record<string, unknown>
  return (
    typeof raw['sourceSlug'] === 'string' &&
    raw['sourceSlug'] !== '' &&
    (raw['verb'] === 'claim' || raw['verb'] === 'claim-resume' || raw['verb'] === 'settle' || raw['verb'] === 'stop' || raw['verb'] === 'suspend') &&
    (raw['status'] === 'running' || raw['status'] === 'completed' || raw['status'] === 'blocked' || raw['status'] === 'interrupted') &&
    (raw['taskKey'] === undefined || typeof raw['taskKey'] === 'string') &&
    (raw['scenario'] === undefined || typeof raw['scenario'] === 'string') &&
    (raw['note'] === undefined || typeof raw['note'] === 'string') &&
    typeof raw['at'] === 'number' &&
    Number.isFinite(raw['at'])
  )
}
