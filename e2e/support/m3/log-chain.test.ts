// M3 5.2 logs/{slug}.jsonl 串联（AC6①——support 夹具层）：
// Hard Rule 禁真实模型 → 运行期派发链（真实 dispatchTask）的事件流 = 5.3 dogfood 重录面；
// 本件在 e2e-support 池 wiring **真实事件链**（bus + sink + log-listener 三件——产品装配
// 同构）承载 5.2 串联断言：
//   · logs/{slug}.jsonl 在场 + 标准行形状（slug = 归属判定产物——taskKey 前缀覆盖信封 slug）；
//   · taskKey 过滤重组：claim/spawn/worker-done（派发会话 D）+ submit（执行会话 W）会话链
//     ——两径会话分型可判（SC6③ 双源同口径）；
//   · no-ready-task（contextSlug 归属）+ 未解析会话丢行（fail-soft 防线）边界。
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createForgeEventBus } from '../../../packages/plugin-forge/src/events/bus.js'
import { createForgeEventSink } from '../../../packages/plugin-forge/src/events/sink.js'
import { attachForgeLogListener, forgeLogFileOf, readForgeEventLog } from '../../../packages/plugin-forge/src/events/log-listener.js'
import type { ForgePluginEvent } from '../../../packages/contracts/src/dto/forge.js'

const containerDir = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-logchain-'))
afterAll(() => {
  rmSync(containerDir, { recursive: true, force: true })
})

/** 真实链 wiring（产品装配同构：bus → 监听器落盘；sink 记忆会话 → 目录） */
function wireChain() {
  const bus = createForgeEventBus()
  const sink = createForgeEventSink({ bus, resolveDir: async () => containerDir })
  const dispose = attachForgeLogListener(bus, { resolveContainerDir: (event) => sink.dirOf(event.sessionId) })
  return {
    sink,
    dispose,
    emit: (event: ForgePluginEvent): void => {
      bus.emit(event)
    },
  }
}

/** dispatchTask/submitTask 发射面同形事件（信封声明序——工具源 emit 点字面镜像） */
function emitLifecycle(chain: ReturnType<typeof wireChain>, taskKey: string, dispatchSession: string, workerSession: string): void {
  const slug = taskKey.slice(0, taskKey.indexOf('/'))
  chain.emit({ ts: Date.now(), sessionId: dispatchSession, slug, type: 'task-claimed', payload: { taskKey, taskType: 'doc', mode: 'expedition', dispatchDigest: 'abc123def456' } })
  chain.emit({
    ts: Date.now(), sessionId: dispatchSession, slug, type: 'task-spawned',
    payload: { taskKey, workerSessionId: workerSession, toolFilter: ['ask_user_question', 'present'], model: 'inherit' },
  })
  chain.emit({ ts: Date.now(), sessionId: workerSession, slug, type: 'task-submitted', payload: { taskKey, outcome: 'success', commitHash: '0f1e2d3c4b5a6978877665544332211ff0e1d2c3' } })
  chain.emit({ ts: Date.now(), sessionId: dispatchSession, slug, type: 'task-worker-done', payload: { taskKey, workerSessionId: workerSession, outcome: 'success', durationMs: 1234 } })
}

describe('M3 5.2 logs/{slug}.jsonl 串联（support 夹具——真实 bus/sink/listener 链）', () => {
  it('任务全程四事件落 logs/{slug}.jsonl + taskKey 过滤重组会话链（派发/执行两径分型）', async () => {
    const chain = wireChain()
    try {
      const TASK_KEY = 'sc-logchain/1.1'
      const D = 'e2e-logchain-dispatch-s1'
      const W = 'e2e-logchain-worker-w1'
      // sink.prepare 先行（dispatchTask 首 emit 前 await——产品调用序同构）
      await chain.sink.prepare({ sessionId: D, cwd: join(containerDir, 'ws') })
      await chain.sink.prepare({ sessionId: W, cwd: join(containerDir, 'ws') })
      emitLifecycle(chain, TASK_KEY, D, W)

      const file = forgeLogFileOf(containerDir, 'sc-logchain')
      const events = readForgeEventLog(file)
      expect(events.map((e) => e.type), '四事件齐（claim/spawn/submit/worker-done）').toEqual(['task-claimed', 'task-spawned', 'task-submitted', 'task-worker-done'])
      // 标准行：slug = 归属判定产物（taskKey 前缀——payload.taskKey 单源）
      expect(events.every((e) => e.slug === 'sc-logchain'), '行 slug 恒 = 容器 slug（归属三分支①）').toBe(true)
      expect(events.every((e) => typeof e.ts === 'number' && e.ts > 0), 'ts epoch 毫秒在场').toBe(true)

      // taskKey 过滤重组（串联读法）：单任务会话链 = 派发会话（claim/spawn/done）+ 执行会话（submit）
      const ofTask = readForgeEventLog(file).filter((e) => (e.payload as { taskKey?: string }).taskKey === TASK_KEY)
      expect(ofTask, 'taskKey 过滤 = 四行').toHaveLength(4)
      const bySession = new Map(ofTask.map((e) => [e.type, e.sessionId]))
      expect(bySession.get('task-claimed'), 'claim = 派发会话 D').toBe(D)
      expect(bySession.get('task-spawned'), 'spawn = 派发会话 D（附 workerSessionId 对账锚）').toBe(D)
      expect(bySession.get('task-submitted'), 'submit = 执行会话 W（worker 自身）').toBe(W)
      expect(bySession.get('task-worker-done'), 'worker-done = 派发会话 D').toBe(D)
      const spawned = ofTask.find((e) => e.type === 'task-spawned')?.payload as { workerSessionId?: string; toolFilter?: readonly string[]; model?: string }
      expect(spawned.workerSessionId, 'spawn 行携带 workerSessionId（对账锚）').toBe(W)
      expect(Array.isArray(spawned.toolFilter), 'spawn 行携带 toolFilter（收窄面机械证据）').toBe(true)
      expect(spawned.model, 'spawn 行携带 model（inherit = 未配置回退）').toBe('inherit')
      // 会话链分型可判：D ≠ W（双源相异——SC6③ 同口径）
      expect(bySession.get('task-claimed')).not.toBe(bySession.get('task-submitted'))

      // 原文行形状（JSONL 键序 = 信封声明序——standardizeEvent 单源）
      const firstLine = JSON.parse(readFileSync(file, 'utf8').split('\n')[0] as string) as Record<string, unknown>
      expect(Object.keys(firstLine), '行键序 = ts/sessionId/slug/type/payload').toEqual(['ts', 'sessionId', 'slug', 'type', 'payload'])
    } finally {
      chain.dispose()
    }
  })

  it('no-ready-task 归属 contextSlug + 未解析会话丢行（fail-soft——绝不落相对路径）', async () => {
    const chain = wireChain()
    try {
      const KNOWN = 'e2e-logchain-known'
      await chain.sink.prepare({ sessionId: KNOWN, cwd: join(containerDir, 'ws') })
      // 无任务事件：payload.contextSlug 承载归属（信封 slug 语境回声被判定覆盖）
      chain.emit({ ts: Date.now(), sessionId: KNOWN, slug: '_pool', type: 'no-ready-task', payload: { contextSlug: 'sc-pool-scope' } })
      const poolEvents = readForgeEventLog(forgeLogFileOf(containerDir, 'sc-pool-scope'))
      expect(poolEvents.map((e) => e.type), 'no-ready-task 落 contextSlug 文件').toEqual(['no-ready-task'])
      expect(poolEvents[0]?.slug, '归属分支②：contextSlug 覆盖信封 slug').toBe('sc-pool-scope')

      // 未解析会话（sink.prepare 未达）：监听器丢行——logs/ 不新增、不落相对路径
      chain.emit({ ts: Date.now(), sessionId: 'e2e-logchain-unknown', slug: 'sc-orphan', type: 'no-ready-task', payload: {} })
      const orphanFile = forgeLogFileOf(containerDir, 'sc-orphan')
      expect(readForgeEventLog(orphanFile), '未解析会话零落盘（fail-soft 丢行）').toEqual([])
    } finally {
      chain.dispose()
    }
  })
})
