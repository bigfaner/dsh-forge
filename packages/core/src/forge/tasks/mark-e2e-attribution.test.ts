// markE2eAttribution 动词单测（loop-phase-gate §2.9——归因卡生成侧标记写面）：
// 标记列后置置 1（未标记行 e2e_attribution 缺省 0）/ 未命中 fail-loud（ERR_TASK_NOT_FOUND）/
// 幂等重写无害 / 写后事件发射。
import { describe, expect, it } from 'vitest'
import { TaskNotFoundError } from './errors.js'
import { createTasksHarness, seedFeature, seedTask } from './harness.js'
import { markE2eAttribution } from './mark-e2e-attribution.js'

describe('markE2eAttribution（CE-6 方案 A 写入径）', () => {
  it('后置 UPDATE e2e_attribution = 1 + 写后事件发射（幂等重写无害）', () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat-x' })
      seedTask(h.db, 'feat-x', '3.1', { status: 'pending', type: 'test-run' })
      markE2eAttribution(h, { projectId: h.projectId, slug: 'feat-x', localId: '3.1' })
      const row = h.db.prepare(`SELECT e2e_attribution FROM tasks WHERE slug = 'feat-x' AND local_id = '3.1'`).get() as { e2e_attribution: number }
      expect(row.e2e_attribution).toBe(1)
      expect(h.events.emitted).toContainEqual({ projectId: h.projectId })
      // 幂等重写
      markE2eAttribution(h, { projectId: h.projectId, slug: 'feat-x', localId: '3.1' })
      const again = h.db.prepare(`SELECT e2e_attribution FROM tasks WHERE slug = 'feat-x' AND local_id = '3.1'`).get() as { e2e_attribution: number }
      expect(again.e2e_attribution).toBe(1)
    } finally {
      h.dispose()
    }
  })

  it('未命中 fail-loud（ERR_TASK_NOT_FOUND——归因卡无标记等于无豁免）', async () => {
    const h = createTasksHarness()
    try {
      await expect(markE2eAttribution(h, { projectId: h.projectId, slug: 'feat-x', localId: '9.9' })).rejects.toThrow(TaskNotFoundError)
    } finally {
      h.dispose()
    }
  })
})
