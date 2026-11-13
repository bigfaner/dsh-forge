// readUnsettledChain——容器实现链未终态 I 卡清单只读读面（loop-phase-gate 评审收口 bug
// a587123e：链集合判据单点）。定位：业务（forge/tasks 子域）。执行体 = phase-gate.ts
// readUnsettledChain（与 GATE_SQL 第④支同判据同执行体）——消费方（plugin-forge driver
// suspend 载荷）经本动词取数，零第二实现、载荷零复制。纯读：零状态效应、零事件；
// 容器未命中 = 空清单（读面零 404 同口径，list.ts resolveContainerScope）。
import type { ReadUnsettledChainInput, ReadUnsettledChainResult } from '@dsh-forge/contracts'
import type { TasksVerbDeps } from './add.js'
import { resolveContainerScope } from './list.js'
import { readUnsettledChain as readUnsettledChainRows } from './phase-gate.js'

/** Interface 1 readUnsettledChain：容器解析 → 链集合同执行体查询（纯读） */
export async function readUnsettledChain(deps: TasksVerbDeps, input: ReadUnsettledChainInput): Promise<ReadUnsettledChainResult> {
  const db = deps.store.ensureOpen(input.projectId)
  const scope = resolveContainerScope(db, input.source)
  if (scope === undefined) return { unsettled: [] }
  return { unsettled: readUnsettledChainRows(db, scope) }
}
