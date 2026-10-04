// 跨包测试共用 workspaceRegistry 桩（fix-34 收编：原五处拷贝行为已分叉——core 双域
// project-service/reconcile-queries/service ×3 + host projects-rpc + knowledge
// integration-core——收敛为单份 superset，CoreContextFace 演进时单点改）。
// 消费面：core 内测试相对引入；host/knowledge 测试经相对路径引本源码（*.test.* 结构
// 豁免同现有 core 源引入惯例——生产面 host/knowledge 禁 import core 不受影响）。
// 语义锚定 G1 pin 第 4 项（../forge/registry.ts 头注同源）：create 幂等（同 canonical
// path 返回既有实体）、delete 保目录保日志且未知 id 幂等 no-op（false）、list 同步投影、
// get 同步查表。注入面（superset 可选，缺省关闭）：failCreate/failDelete/failList/
// beforeDelete——host 失败注入与 core 并发形态均由此承载。
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import type { WorkspaceLike, WorkspaceRegistryPort } from '../forge/registry.js'

/** dsh workspaceRegistry 结构化桩（不触盘——canonical 化用 path.resolve 替身） */
export class StubRegistry implements WorkspaceRegistryPort {
  readonly records = new Map<string, WorkspaceLike>()
  /** dsh 侧目录与日志投影（delete 语义 = 保目录保日志：本桩 delete 不触碰——断言面） */
  readonly dirs = new Set<string>()
  readonly createCalls: string[] = []
  readonly deleteCalls: string[] = []
  failCreate?: Error
  failDelete?: Error
  failList?: Error
  /** delete 执行前钩子（模拟「补偿删除时工作区已被并发清理」→ delete 返回 false） */
  beforeDelete?: (id: string) => void

  seed(path: string, id = randomUUID()): WorkspaceLike {
    const ws = { id, path: resolve(path) }
    this.records.set(id, ws)
    this.dirs.add(ws.path)
    return ws
  }

  get(id: string): WorkspaceLike | undefined {
    return this.records.get(id) // 未知 id → undefined（上游 get 语义，2.3 对账消费）
  }

  list(): WorkspaceLike[] {
    if (this.failList) throw this.failList
    return [...this.records.values()]
  }

  async create(path: string): Promise<WorkspaceLike> {
    this.createCalls.push(path)
    if (this.failCreate) throw this.failCreate
    const canonical = resolve(path)
    const existing = this.list().find((ws) => ws.path === canonical)
    if (existing) return existing // 幂等：同 canonical path 返回既有实体
    const ws = { id: randomUUID(), path: canonical }
    this.records.set(ws.id, ws)
    this.dirs.add(canonical)
    return ws
  }

  async delete(id: string): Promise<boolean> {
    this.deleteCalls.push(id)
    this.beforeDelete?.(id)
    if (this.failDelete) throw this.failDelete
    return this.records.delete(id) // 未知 id → false（幂等 no-op）；目录与日志保留
  }
}
