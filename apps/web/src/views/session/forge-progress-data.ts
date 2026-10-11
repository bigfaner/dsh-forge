// 'forge/progress' 节点数据面（定位：业务——1.17 循环进度流；壳树自持纯模块）。
// 边界纪律（2026-10-11 web boot 报障收口）：本模块原居 client-plugin/progress-node.ts，
// 因壳树视图 ForgeProgressNode runtime import 它，rollup 双入口拆出公共 chunk——
// forge-client.js 变 ESM（import{…}from）破坏 classic script 形状，模块系统报
// 「loaded without registering "@dsh-forge/web-client"」。守卫唯一 runtime 消费者 =
// 壳树视图，故归壳树；client 树零引用（定义面数据透传 unknown 不窄读）。
// 数据纪律：形状防御（plugin-forge isForgeProgressData 同语义镜像——他形不猜不抛）。

/** 节点数据（buildViewNode.data——客户端可见整值，纯 JSON） */
export interface ForgeProgressNodeData {
  readonly sourceSlug: string
  readonly verb: 'claim' | 'claim-resume' | 'settle' | 'stop'
  readonly status: 'running' | 'completed' | 'blocked' | 'interrupted'
  readonly taskKey?: string
  readonly counts?: { readonly pending: number; readonly running: number; readonly done: number }
  readonly at: number
  /** 事件 seq（节点时序锚——流内交错位） */
  readonly seq: number
}

/** 数据守卫（plugin-forge isForgeProgressData 同语义镜像） */
export function isForgeProgressNodeData(value: unknown): value is ForgeProgressNodeData {
  if (typeof value !== 'object' || value === null) return false
  const raw = value as Record<string, unknown>
  return (
    typeof raw['sourceSlug'] === 'string' &&
    raw['sourceSlug'] !== '' &&
    (raw['verb'] === 'claim' || raw['verb'] === 'claim-resume' || raw['verb'] === 'settle' || raw['verb'] === 'stop') &&
    (raw['status'] === 'running' || raw['status'] === 'completed' || raw['status'] === 'blocked' || raw['status'] === 'interrupted') &&
    (raw['taskKey'] === undefined || typeof raw['taskKey'] === 'string') &&
    typeof raw['at'] === 'number' &&
    Number.isFinite(raw['at']) &&
    typeof raw['seq'] === 'number'
  )
}
