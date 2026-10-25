// state.ts —— 启停状态（tech-design §5 / §13 D4 / AD2）：ctx.storage 自有 domain
// 表（官方 storage-domain 正门，域全局、表按 id 键控、无工作区隔离语义），工作区
// 隔离走 key 前缀方案：key = disabled/<canonicalWorkspacePath>/<expertId>，
// canonicalWorkspacePath = realpathNormalize(工作区路径)——与 workspace 包
// canonical cwd 判据同源。取值点（D4 钉死）：tool 面传调用 agent scope 的 cwd，
// fetch 路由传 client 显式 workspace 参数（workspaceParamSchema zod 门）。

import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { realpathNormalize } from '@deepseek-ai/dsh-workspace'
import { z } from 'zod'

/** 自有 domain 名（UNIT_NAME_RE 约束：安全文件名/SQL 标识段）。 */
export const EXPERT_STATE_DOMAIN = 'expert_squad_state' as const

/** 启停状态单表名：仅存禁用记录（缺记录 = 启用）。 */
export const EXPERT_STATE_TABLE = 'disabled' as const

/** 一条禁用记录：expertId + canonical 工作区路径（冗余存档，便于盘点）。 */
export const disabledRecordSchema = z.object({
  expertId: z.string().min(1),
  workspace: z.string().min(1),
})
export type DisabledRecord = z.infer<typeof disabledRecordSchema>

/** 自有 domain 声明：single 布局（key 含路径分隔符与盘符，保持 opaque）。 */
export const expertSquadStateDomainSpec = defineDomain({
  name: EXPERT_STATE_DOMAIN,
  version: 1,
  tables: { [EXPERT_STATE_TABLE]: domainTable(disabledRecordSchema) },
})

/** fetch 路由 workspace 参数 zod 门（D4：client 显式携带，杜绝进程级 cwd 串域）。 */
export const workspaceParamSchema = z.string().min(1)

/** 禁用键：disabled/<canonicalWorkspacePath>/<expertId>。 */
export function disabledKey(canonicalWorkspacePath: string, expertId: string): string {
  return `${EXPERT_STATE_TABLE}/${canonicalWorkspacePath}/${expertId}`
}

/** canonical 工作区路径（realpathNormalize——工作区身份唯一判据）。 */
export function canonicalWorkspacePath(workspacePath: string): Promise<string> {
  return realpathNormalize(workspacePath)
}

/** 启停状态门面：读同步走 domain 内存态，canonical 化带缓存。 */
export class ExpertSquadState {
  private readonly canonical = new Map<string, Promise<string>>()

  constructor(private readonly domain: Domain<typeof expertSquadStateDomainSpec>) {}

  private table() {
    return this.domain.table(EXPERT_STATE_TABLE)
  }

  private canon(workspacePath: string): Promise<string> {
    let hit = this.canonical.get(workspacePath)
    if (!hit) {
      hit = canonicalWorkspacePath(workspacePath)
      // Root cause: rejected promise 永久缓存 = 毒化缓存（路径就绪后仍恒败）——
      // 失败即逐出条目，下次请求重新解析（bug f9410209）。
      hit.catch(() => {
        if (this.canonical.get(workspacePath) === hit) this.canonical.delete(workspacePath)
      })
      this.canonical.set(workspacePath, hit)
    }
    return hit
  }

  /** 专家在该工作区是否禁用（无记录 = 启用）。 */
  async isDisabled(workspacePath: string, expertId: string): Promise<boolean> {
    const key = disabledKey(await this.canon(workspacePath), expertId)
    return this.table().get(key) !== undefined
  }

  /** 设置启用/禁用（按 canonical 工作区隔离写入/删除记录）。 */
  async setEnabled(workspacePath: string, expertId: string, enabled: boolean): Promise<void> {
    const ws = await this.canon(workspacePath)
    const key = disabledKey(ws, expertId)
    if (enabled) {
      await this.table().delete(key)
      return
    }
    await this.table().put(key, { expertId, workspace: ws })
  }

  /** 关闭 domain（调用方持有，典型挂 ctx.effect disposer）。 */
  close(): Promise<void> {
    return this.domain.close()
  }
}
