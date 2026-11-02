// bug 0db72bcb 生产装配径接线断言（仿 plugin.test.ts 装配 runtime 形态）：临时 Cordis
// runtime 装配 forgePlugin，claim 返回盲试 fix 任务、台账 face 返回深链——断言生产装配
// 的 loopDriver deps 两 face 在场且被 claim 守卫消费（T3 软拒绝 → 零 spawn）。
// 非桩注入径：face 不经 driver deps 手工注入，而是经插件装配缝（ctx.forgeBugs + projects
// face 工厂）生产接线后由循环核心真实消费。
import { describe, expect, it, vi } from 'vitest'
import type { ForgeProposalsService, ForgeTasksService, ProjectServiceM2, TaskSnapshot } from '@dsh-forge/contracts'
import forgePlugin from './index.js'
import type { ForgeToolDefinition, ForgeToolDeps } from './tools/index.js'
import { setForgeSpawnOverride } from './spawn/seam.js'
import type { SpawnWorkerHandle } from './dispatch-core/index.js'

const PROJECT = 'p-wire'
const WS = 'C:\\ws\\wire'

function blindFixTask(): TaskSnapshot {
  return {
    taskId: 't-fix-1', slug: 'feat-x', localId: '2.1', source: { kind: 'feature', slug: 'feat-x' },
    title: '修复阻塞', taskType: 'coding-fix', taskStatus: 'in_progress', breaking: false, complexity: 'low',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', sourceTaskId: 't-src-1',
  } as TaskSnapshot
}

describe('生产装配径接线（bug 0db72bcb——loopDriver deps 两 face 经插件装配缝在场）', () => {
  it('dispatchTask → 循环 claim → T3 守卫消费生产 face：台账 face 被调 + 同缝 ≥2 报告不在场 → 软拒绝零 spawn', async () => {
    let faceCalls = 0
    let spawnCalls = 0
    const removeSpawn = setForgeSpawnOverride(async () => {
      spawnCalls += 1
      return { workerSessionId: 'w-1', result: Promise.resolve({ stopReason: 'completed', output: '' }), dispose: async () => {} } as SpawnWorkerHandle
    })
    let claims = 0
    const transitions: string[] = []
    const tasks = {
      claimTask: async () => {
        claims += 1
        return claims === 1
          ? { task: blindFixTask(), dispatchPrompt: '', digest: '', reclaimed: false }
          : { task: null, dispatchPrompt: '', digest: '', reclaimed: false }
      },
      taskStats: async () => ({
        total: 1,
        byStatus: { pending: 0, in_progress: 1, blocked: 0, completed: 0, skipped: 0, rejected: 0, suspended: 0, interrupted: 0 },
        unmetPending: 0,
      }),
      listTasks: async () => [],
      transitionTask: async (input: { toStatus: string }) => {
        transitions.push(input.toStatus)
        return blindFixTask()
      },
      reconcileInterrupted: async () => ({ reconciled: [] }),
    } as unknown as ForgeTasksService
    const bugs = {
      findRecurrenceCandidates: () => {
        faceCalls += 1
        return Promise.resolve([{ bugId: 'b-root', summary: '根', chain: ['b-root', 'b-r1', 'b-r2'] }])
      },
    } as unknown as ForgeToolDeps['bugs']
    const registeredTools: ForgeToolDefinition[] = []
    const ctx = {
      forgeTasks: tasks,
      forgeProposals: {} as ForgeProposalsService,
      forgeBugs: bugs,
      forgeCheckpoints: {} as ForgeToolDeps['checkpoints'],
      forgeProjects: {
        getProject: async (id: string) => (id === PROJECT ? { wsPath: WS, projectId: id } : null),
        deriveTaskStoreDir: async () => ({ dir: WS }),
      } as Pick<ProjectServiceM2, 'getProject' | 'deriveTaskStoreDir'> as ProjectServiceM2,
      tools: { register: (d: ForgeToolDefinition) => { registeredTools.push(d); return () => {} } },
      systemPrompt: { section: () => () => {} },
      experts: { get: () => undefined, registerRoot: () => {}, refresh: async () => {} },
      emit: vi.fn(),
    }
    const dispose = forgePlugin(ctx as never, { projects: [{ wsPath: WS, projectId: PROJECT }] })
    try {
      const dispatch = registeredTools.find((t) => t.name === 'dispatchTask')!
      const exec = { agent: { session: { id: 's-owner', header: { cwd: WS } } } }
      const out = (await dispatch.execute({ source_kind: 'feature', source_slug: 'feat-x' }, exec)) as {
        data?: { status?: string }
      }
      // 循环启动受理（后台挂起/推进由驱动器叙述面承载）
      expect(out).toBeDefined()
      // 等待首轮 claim 现算（守卫消费生产 face）
      for (let i = 0; i < 100 && faceCalls === 0; i++) await new Promise((r) => setTimeout(r, 10))
      expect(faceCalls).toBeGreaterThanOrEqual(1) // 生产 face 被循环核心消费（接线在场）
      expect(spawnCalls).toBe(0) // 同缝 ≥2 ∧ 报告不在场 → 软拒绝，spawn 不发生
      // 被拒 pending 行去向 = escalation 挂起（transitionTask → suspended；异步径有界等待）
      for (let i = 0; i < 100 && !transitions.includes('suspended'); i++) await new Promise((r) => setTimeout(r, 10))
      expect(transitions).toContain('suspended')
    } finally {
      removeSpawn()
      dispose()
    }
  })
})
