// 生产装配路径单测（bug 14984d4f——「单测桩路径 ≠ 生产装配路径」封口）：既有单测注入
// 桩 spawn，桩绿不证真机——本文件走**真装配链**：真实 faces 档案取用缝（resolver）→
// 真实 WorkerDispatchProfile 投影（createWorkerProfileProjection——index.ts 装配同源）→
// 真实 spawnClaimed 组装（workerAgentOptionsOf + reconcileWorkerReasoning）→ 真实
// createInProcessDriverSpawn 适配层 → 上游 startInProcessRun 请求捕获。仅上游官方包
// 边界（外部依赖装配面，正本 docs/conventions/external-dependency-verification.md）以
// 模块 mock 替身捕获请求——真机端到端取证归 worker-provisioning 旅程（1.13 闭环）。
// 断言面：档案 provider+model 成对在场时，settings.worker 缺席不拦截——agentOptions
// 路由对必须抵达上游请求（真机此前整链回退 inherit 的装配丢失位，此测试即红）。
import { describe, expect, it, vi } from 'vitest'
import type { ForgePluginEvent, ForgeTasksService, TaskSnapshot } from '@dsh-forge/contracts'
import { createExpertProfileResolver, createWorkerProfileProjection } from '../faces.js'
import { createInProcessDriverSpawn } from './in-process-driver.js'
import { spawnClaimed } from '../dispatch-core/index.js'
import type { ClaimedDispatch, DispatchCoreDeps, DispatchCoreExec, DispatchChainScope, SpawnWorkerHandle } from '../dispatch-core/index.js'

// 上游官方包边界替身：捕获 startInProcessRun 请求（断言锚）；run 形状满足本缝消费面
// （id / localAgent.session.header.createdAt 目录事实 / result / dispose）。
const upstreamRequests: unknown[] = []
vi.mock('@deepseek-ai/dsh-subagent-in-process-driver', () => ({
  startInProcessRun: async (request: unknown): Promise<{
    id: string
    localAgent: unknown
    result: Promise<{ stopReason: string; output: readonly unknown[] }>
    dispose: () => Promise<void>
  }> => {
    upstreamRequests.push(request)
    return {
      id: 'child-route-1',
      localAgent: { session: { header: { createdAt: 1 } } },
      result: Promise.resolve({ stopReason: 'completed', output: [] }),
      dispose: async () => {},
    }
  },
}))

function snapshot(): TaskSnapshot {
  return {
    taskId: 't-route-1',
    slug: 'feat-route',
    localId: '1.1',
    source: { kind: 'proposal', slug: 'feat-route' },
    title: '路由钉住任务',
    taskType: 'coding-fix',
    taskStatus: 'pending',
    taskDesc: '生产装配路径探针',
    breaking: false,
    complexity: 'low',
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
  }
}

/** 真实装配链构建（index.ts 装配同构：resolver → 投影缝 → spawnClaimed deps.spawn = 真适配层） */
function buildProductionChain(entries: { provider?: string; model?: string } | undefined) {
  const experts = {
    get: (key: string) => ({
      name: key,
      personaMd: `档案正文：${key}`,
      tools: ['read'],
      ...entries,
    }),
    registerRoot: () => {},
  }
  const resolver = createExpertProfileResolver({ experts })
  const resolveWorkerProfile = createWorkerProfileProjection({ resolver })
  const events: ForgePluginEvent[] = []
  const tasks = {
    recordSpawn: async () => {},
  } as unknown as ForgeTasksService
  const deps: DispatchCoreDeps = {
    tasks,
    events: {
      emit: (e) => events.push(e),
      prepare: async () => {},
      dirOf: () => undefined,
      remember: () => {},
    },
    // 装配同构关键位：resolveWorkerProfile 注入（index.ts 同名依赖——漏注入即真机
    // inherit 丢失位形态，本测试自身曾红证）
    ...(resolveWorkerProfile !== undefined ? { resolveWorkerProfile } : {}),
    spawn: createInProcessDriverSpawn(),
  }
  const exec: DispatchCoreExec = { attribution: {}, parent: { session: { append: () => {} } }, signal: new AbortController().signal, verb: 'run-dag-tasks' }
  const scope: DispatchChainScope = { sessionId: 'owner-1', projectId: 'p-1', guardKey: 'loop-1', source: { kind: 'proposal', slug: 'feat-route' } }
  const claimed: ClaimedDispatch = {
    kind: 'claimed',
    task: snapshot(),
    digest: 'digest-route-1',
    dispatchPrompt: '派发简报全文',
    persona: 'PERSONA-MATRIX',
    reclaimed: false,
  }
  return { deps, exec, scope, claimed, events }
}

/** spawnClaimed → 句柄 result 收口（阻塞至 worker 终态，结算零悬挂） */
async function runSpawn(deps: DispatchCoreDeps, exec: DispatchCoreExec, scope: DispatchChainScope, claimed: ClaimedDispatch): Promise<SpawnWorkerHandle> {
  const stage = await spawnClaimed(deps, exec, claimed, { scope })
  if (!stage.ok) throw new Error(`spawn 失败：${JSON.stringify(stage.failure)}`)
  return stage.handle
}

describe('生产装配路径（真实 resolver → 投影 → spawnClaimed → 真适配层 → 上游请求）', () => {
  it('bug 14984d4f：档案 provider+model 成对在场 + settings.worker 缺席 → 路由对抵达上游 startInProcessRun 请求（不回落 inherit）', async () => {
    const { deps, exec, scope, claimed } = buildProductionChain({ provider: 'deepseek-official', model: 'deepseek-flash' })
    const handle = await runSpawn(deps, exec, scope, claimed)
    expect(handle.workerSessionId).toBe('child-route-1')
    await handle.dispose()
    expect(upstreamRequests).toHaveLength(1)
    const req = upstreamRequests[0] as { agentOptions?: { provider: string; model: string }; persona?: string; prompt: readonly { type: string; text: string }[] }
    // 定罪面：装配丢失位（真机此前整链 inherit）在真实链上必须携带显式路由对
    expect(req.agentOptions).toEqual({ provider: 'deepseek-official', model: 'deepseek-flash' })
    // persona / dispatchPrompt 全文照常抵达（档案本体既有取证面不回退）
    expect(req.persona).toBe('PERSONA-MATRIX')
    expect(req.prompt).toEqual([{ type: 'text', text: '派发简报全文' }])
  })

  it('审计同源：task-spawned 事件 model = 显式路由（非 inherit——循环审计由此可判）', async () => {
    const { deps, exec, scope, claimed, events } = buildProductionChain({ provider: 'deepseek-official', model: 'deepseek-flash' })
    const handle = await runSpawn(deps, exec, scope, claimed)
    await handle.dispose()
    const spawned = events.find((e) => e.type === 'task-spawned') as { payload: { model: string; workerSessionId: string } }
    expect(spawned.payload.model).toBe('deepseek-flash')
    expect(spawned.payload.workerSessionId).toBe('child-route-1')
  })

  it('档案无路由字段 + settings 缺席 = 形态兼容回退：上游请求零 agentOptions 键（inherit 语义显式可判）', async () => {
    const { deps, exec, scope, claimed } = buildProductionChain(undefined)
    const handle = await runSpawn(deps, exec, scope, claimed)
    await handle.dispose()
    const req = upstreamRequests[upstreamRequests.length - 1] as { agentOptions?: unknown }
    expect('agentOptions' in req).toBe(false)
  })
})
