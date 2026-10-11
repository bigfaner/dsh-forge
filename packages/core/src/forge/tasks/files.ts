// files_json v2 读面归一（fix-of worker-lean-execution/1.13——自 contracts dto/forge.ts 按层迁出：
// 契约层零逻辑铁律 scope.test AC4；消费方 core 侧 submit/detail/query 读面单源）。
import type { TaskFilesPayload } from '@dsh-forge/contracts'

/** files 分组归一（读面单源：{created, modified} → 平铺并集，created 序优先） */
export function taskFilesUnion(payload: TaskFilesPayload): string[] {
  const union: string[] = []
  for (const f of [...(payload.created ?? []), ...(payload.modified ?? [])]) {
    if (!union.includes(f)) union.push(f)
  }
  return union
}
