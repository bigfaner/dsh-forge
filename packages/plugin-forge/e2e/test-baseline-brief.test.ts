// e2e dogfood · loop 径 TEST_BASELINE 简报行回放取证（forge-test-boundary-gates fix-1）。
// 缺口回填：简报 TEST_BASELINE 行仅在 driver.runRound loop 径注入（driver.testBaselineBriefOf
// → claimForDispatch → core claimTask → compose.renderTaskContext）——forgeTasks.claimTask
// 桥直调径与既有冒烟形态触达不到。本用例驱动真循环派发（真驱动器 + 真 dispatch-core 链 +
// 真 core tasks 服务），在 worker spawn 请求上断言简报原文两形态：
//   · 在场 = TEST_BASELINE: <docsRoot 锚定绝对路径>（基线时点：…）（既有失败清单正本…）
//   · 兜底 = TEST_BASELINE: 无既有失败清单，遇失败默认按新回归上报
// 覆盖待验证面：packages/plugin-forge/src/loop/driver.ts（testBaselineBriefOf + runRound 注入）
// 与 packages/core/src/forge/tasks/prompt/compose.ts（TEST_BASELINE 行渲染）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ForgePluginEvent, ForgeTasksService } from '@dsh-forge/contracts'
import { createLoopDriver } from '../src/loop/driver.js'
import type { LoopDriver, LoopDriverDeps } from '../src/loop/driver.js'
import { createLoopRegistry } from '../src/loop/registry.js'
import { createNarrator } from '../src/notify/index.js'
import type { Narrator } from '../src/notify/index.js'
import type { ForgeEventSink } from '../src/events/sink.js'
import type { SpawnWorker } from '../src/dispatch-core/index.js'
import { resetExclusiveLoopSources } from '../src/dispatch-core/index.js'
import { createTasksHarness, seedFeature, seedTask } from '../../../packages/core/src/forge/tasks/harness.js'
import { createTasksService } from '../../../packages/core/src/forge/tasks/service.js'

// ─────────────────────────── 夹具（真 core tasks 服务——dispatchPrompt 合成单源） ───────────────────────────

const OWNER = 'owner-session-1'
const FEATURE = 'feat-tb'

interface Built {
  driver: LoopDriver
  /** worker spawn 请求的简报原文（dispatchPrompt 全文 = worker 首条用户消息） */
  readonly prompts: string[]
  dispose(): void
}

/**
 * 回放装配：真驱动器 + 真 dispatch-core 链 + 真 core tasks 服务（临时库——seed feature 行 +
 * pending I 卡）+ 捕获 spawn（句柄 result 永不结算——取证窗确定性载体，同 dispatch-loop-settlement
 * 先例 spawnDelayMs=-1；取证后 driver.stop 经 killed 径收口）。docsRoot 由 LoopStartInput 携带（在场形态调用方预置基线文档 / 缺席 = 兜底形态）。
 */
function build(): Built {
  const h = createTasksHarness()
  seedFeature(h.db, { slug: FEATURE, status: 'tasks' })
  seedTask(h.db, FEATURE, '2.1', { status: 'pending', type: 'coding-feature' })
  const tasks: ForgeTasksService = createTasksService({
    store: h.store,
    events: h.events,
    resolveWsPath: () => process.cwd(), // taskDetail git 只读查找 cwd——本用例不触达该径
  })
  const prompts: string[] = []
  const spawn: SpawnWorker = async (req) => {
    prompts.push(req.prompt) // 全文直达 worker——dispatch-core spawn 阶段 `prompt: claimed.dispatchPrompt`
    return {
      workerSessionId: `worker-${prompts.length}`,
      result: new Promise<never>(() => {}), // 永不结算——取证窗确定性载体
      dispose: async () => {},
    }
  }
  const narrator: Narrator = createNarrator({ channel: { send: async () => {} } })
  const sink: ForgeEventSink = { emit: (_e: ForgePluginEvent) => {}, prepare: async () => {}, dirOf: () => undefined, remember: () => {} }
  const registry = createLoopRegistry()
  const deps: LoopDriverDeps = {
    projectId: h.projectId,
    tasks,
    spawn,
    narrator,
    events: sink,
    registry,
    // 3c/耐心窗生产缺省 30s/5s——回放装配同缝注入小值（dispatch-loop-settlement 同款判例）
    delays: { backoffBaseMs: 1, patiencePauseMs: 1, quiescenceWindowMs: 1, quiescencePollMs: 1 },
  }
  return {
    driver: createLoopDriver(deps),
    prompts,
    dispose(): void {
      h.dispose()
    },
  }
}

async function untilClaimed(built: Built): Promise<void> {
  await vi.waitFor(
    () => {
      expect(built.prompts).toHaveLength(1)
    },
    { timeout: 5000, interval: 10 },
  )
}

async function untilStopped(built: Built): Promise<void> {
  await vi.waitFor(
    () => {
      expect(built.driver.activeOf(OWNER)).toBeUndefined()
    },
    { timeout: 5000, interval: 10 },
  )
}

afterEach(() => {
  resetExclusiveLoopSources()
})

// ─────────────────────────── 回放取证（两形态） ───────────────────────────

describe('e2e dogfood · loop 径 TEST_BASELINE 简报行（forge-test-boundary-gates fix-1）', () => {
  it('在场形态：docsRoot 基线文档在场——worker 简报原文携 TEST_BASELINE 锚定绝对路径 + 基线时点行', async () => {
    const docsRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-tb-docs-'))
    try {
      // 预置基线文档（docsRoot 锚定路径 = driver.testBaselineBriefOf 解析式：docsRoot/features/<slug>/test-baseline.md）
      const baselinePath = join(docsRoot, 'features', FEATURE, 'test-baseline.md')
      mkdirSync(join(docsRoot, 'features', FEATURE), { recursive: true })
      writeFileSync(baselinePath, '# 测试基线（既有失败清单）\n')

      const built = build()
      await built.driver.start({ source: { kind: 'feature', slug: FEATURE }, ownerSessionId: OWNER, parent: {}, docsRoot })
      await untilClaimed(built)

      const prompt = built.prompts[0]!
      // 真简报锚（非桩）：TASK_ID 自然键行在场——证明该 prompt 出自真 core claimTask 合成链
      expect(prompt, '简报含 TASK_ID 自然键（真循环真领取）').toContain(`TASK_ID: ${FEATURE}/2.1`)
      expect(prompt, 'TEST_BASELINE 行在场（loop 径注入——桥直调径触达不到的载荷）').toContain('TEST_BASELINE: ')
      expect(prompt, '在场形态 = 文档根锚定绝对路径').toContain(`TEST_BASELINE: ${baselinePath}（基线时点：`)
      expect(prompt, '在场形态 = 基线时点 ISO + 既有失败清单正本措辞').toMatch(
        /TEST_BASELINE: .+（基线时点：\d{4}-\d{2}-\d{2}T.+）（既有失败清单正本——遇失败先比对区分既有失败与新回归；双轨基线并存时以 E2E_BASELINE_RED 用例级清单优先，TEST_BASELINE 文档基线作补充归因参考）/,
      )

      await built.driver.stop({ ownerSessionId: OWNER })
      await untilStopped(built)
      built.dispose()
    } finally {
      rmSync(docsRoot, { recursive: true, force: true })
    }
  })

  it('兜底形态：基线文档缺席——worker 简报原文携 TEST_BASELINE 兜底行（宁误报不漏报）', async () => {
    // docsRoot 在场但基线文档缺席（stat 缺席与 docsRoot 无锚定同形回落兜底——fail-soft 不上抛 claim 链）
    const docsRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-tb-docs-'))
    try {
      const built = build()
      await built.driver.start({ source: { kind: 'feature', slug: FEATURE }, ownerSessionId: OWNER, parent: {}, docsRoot })
      await untilClaimed(built)

      const prompt = built.prompts[0]!
      expect(prompt, '简报含 TASK_ID 自然键（真循环真领取）').toContain(`TASK_ID: ${FEATURE}/2.1`)
      expect(prompt, '兜底行逐字在场').toContain('TEST_BASELINE: 无既有失败清单，遇失败默认按新回归上报')
      expect(prompt, '兜底形态不携带路径').not.toContain('test-baseline.md')

      await built.driver.stop({ ownerSessionId: OWNER })
      await untilStopped(built)
      built.dispose()
    } finally {
      rmSync(docsRoot, { recursive: true, force: true })
    }
  })

  it('兜底形态：docsRoot 缺席（无锚定根）——同形回落兜底行', async () => {
    const built = build() // docsRoot 缺省
    await built.driver.start({ source: { kind: 'feature', slug: FEATURE }, ownerSessionId: OWNER, parent: {} })
    await untilClaimed(built)

    const prompt = built.prompts[0]!
    expect(prompt, '简报含 TASK_ID 自然键（真循环真领取）').toContain(`TASK_ID: ${FEATURE}/2.1`)
    expect(prompt, '兜底行逐字在场（docsRoot 缺席同形回落）').toContain('TEST_BASELINE: 无既有失败清单，遇失败默认按新回归上报')

    await built.driver.stop({ ownerSessionId: OWNER })
    await untilStopped(built)
    built.dispose()
  })
})
