// G1 契约 pin · pin-dispatch-injection（dispatch-loop-hardening 3b④ / 提案 AC 8·11）：
// dispatchTask 工具 description ↔ 注入模板关键句**同源断言**——协作协议双载体（工具自描述
// 与 forge:dispatch-loop 注入模板）各自演进时的措辞漂移即红。断言对象：
// ① 同源使用面——工具壳 render 直调 renderP3（不复制模板正文）；
// ② 语义锚对——stopTaskLoop 入口 / re-entry 不重跑 / 挂起摘要 / 守卫归属与入口，两载体同现；
// ③ 机制断言——P8 评审指示段（四重点逐字在文）仅随 finished-all 分支追加；
// ④ 占位符纪律——全量渲染零残留 <...>。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FORGE_DISPATCH_LOOP_SECTION_NAME,
  payloadOf,
  renderEndOfLoop,
  renderP1,
  renderP2,
  renderP3,
  renderP5,
  renderP6,
  renderP7,
  renderP8,
  renderP9,
} from '../../src/loop/injection.js'
import { createDispatchTaskTool } from '../../src/tools/dispatch-task.js'
import type { DispatchTaskToolDeps } from '../../src/tools/dispatch-task.js'
import type { LoopRecord } from '../../src/loop/index.js'
import { LOOP_EXCLUSIVE_GUIDANCE, OWNER_ACTIVE_GUIDANCE } from '../../src/dispatch-core/index.js'

// ─────────────────────────── 夹具 ───────────────────────────

const PAYLOAD = {
  slug: 'feat-x',
  ownerSessionId: 'sess-a1',
  taskKey: 'feat-x/2.3',
  reason: '验收标准要求全部测试通过，但 3 个既有用例与改动冲突',
  history: '第1次处置——建议拆分剩余范围；第2次处置——分析未得出结论',
  completed: 4,
  blocked: 1,
}

/** P8 评审指示四重点（injection-templates.md 逐字口径——AC 11 机制断言面） */
const P8_FOCUS_LINES = [
  '- 架构是否被破坏——分层、依赖方向、模块边界是否仍然成立。',
  '- 实际改动是否超出各任务声明的范围。',
  '- 各模块与包的职责边界是否清晰（core 保持纯状态层，plugin-forge 保持装配与编排）。',
  '- 业务逻辑是否混入公共或基础包。',
]

/** dispatch-task.ts 源文（同源使用面审计——代码级 pin 对象） */
const DISPATCH_TASK_SOURCE = readFileSync(
  fileURLToPath(new URL('../../src/tools/dispatch-task.ts', import.meta.url)),
  'utf-8',
)

/** 工具定义桩 deps（description 读取面——创建期零依赖触达） */
function descriptionOf(): string {
  const deps = {
    tasks: {},
    proposals: {},
    bugs: {},
    resolveProjectId: () => undefined,
    loop: { driver: {}, registry: {} },
  } as unknown as DispatchTaskToolDeps
  return createDispatchTaskTool(deps).description
}

function recordOf(suspended: boolean): LoopRecord {
  return {
    id: 'loop-1',
    source: { kind: 'feature', slug: PAYLOAD.slug },
    ownerSessionId: PAYLOAD.ownerSessionId,
    projectId: 'p-1',
    takeoverSessions: new Set<string>(),
    ...(suspended
      ? {
          suspended: {
            escalation: {
              kind: 'blocked-ask-user' as const,
              ownerSessionId: PAYLOAD.ownerSessionId,
              source: { kind: 'feature' as const, slug: PAYLOAD.slug },
              task: {
                taskId: 't-1',
                slug: PAYLOAD.slug,
                localId: '2.3',
                source: { kind: 'feature' as const, slug: PAYLOAD.slug },
                title: 'T',
                taskType: 'coding-fix' as const,
                taskStatus: 'blocked' as const,
                breaking: false,
                complexity: 'high' as const,
                createdAt: '2026-10-17T00:00:00.000Z',
                updatedAt: '2026-10-17T00:00:00.000Z',
              },
              reason: PAYLOAD.reason,
              history: PAYLOAD.history.split('；'),
            },
            since: 1,
          },
        }
      : {}),
  }
}

// ─────────────────────────── 同源使用面（零复制） ───────────────────────────

describe('pin-dispatch-injection · 同源使用面', () => {
  it('工具壳挂起摘要直调 renderP3——模板正文零复制（不出现模板标题原文）', () => {
    expect(DISPATCH_TASK_SOURCE).toContain('renderP3(payload)')
    expect(DISPATCH_TASK_SOURCE).not.toContain('【任务循环挂起】')
    expect(DISPATCH_TASK_SOURCE).not.toContain('【派发被拒】')
    // 守卫拒绝指引单源：独占指引常量直用（不复制行文）
    expect(DISPATCH_TASK_SOURCE).toContain('LOOP_EXCLUSIVE_GUIDANCE')
  })

  it('渲染产物与工具响应同文：renderP3 全文逐字进入 suspended 响应（summary 字段同源）', () => {
    const p3 = renderP3(PAYLOAD)
    expect(p3).toContain('【任务循环挂起】')
    expect(p3).toContain(`任务 ${PAYLOAD.taskKey} 以 blocked 结束`)
    // 与工具壳渲染分支的取文函数同源（renderDispatchLoopResult 的 v.summary 即 renderP3 产物）
    expect(renderP3(payloadOf(recordOf(true)))).toContain('【任务循环挂起】')
  })
})

// ─────────────────────────── 语义锚对（description ↔ 模板） ───────────────────────────

describe('pin-dispatch-injection · description ↔ 模板语义锚对', () => {
  const description = descriptionOf()

  it('停止单入口：stopTaskLoop 双载体同现（description / P1·P2·P9）', () => {
    expect(description).toContain('stopTaskLoop')
    expect(renderP1(PAYLOAD)).toContain('stopTaskLoop')
    expect(renderP2(PAYLOAD)).toContain('stopTaskLoop')
    expect(renderP9(PAYLOAD)).toContain('stopTaskLoop')
    // 守卫指引（工具失败 DTO violations 行）同锚
    expect(LOOP_EXCLUSIVE_GUIDANCE.join('\n')).toContain('stopTaskLoop')
    expect(OWNER_ACTIVE_GUIDANCE.join('\n')).toContain('stopTaskLoop')
  })

  it('re-entry 幂等不重跑：description 英文锚 ↔ P3/P9 中文锚', () => {
    expect(description).toContain('completed tasks are not re-run')
    expect(renderP3(PAYLOAD)).toContain('已完成任务不会重跑')
    expect(renderP9(PAYLOAD)).toContain('不重跑已完成任务')
  })

  it('挂起摘要兜底：description 承诺 ↔ 工具壳消费 renderP3 兑现', () => {
    expect(description).toContain('the response always carries the suspension summary')
    expect(DISPATCH_TASK_SOURCE).toContain('summary: renderP3(payload)')
  })

  it('无池级盲选 / 单活门控：description ↔ 参数解析拒绝与守卫指引同现', () => {
    expect(description).toContain('no pool-wide mode')
    expect(DISPATCH_TASK_SOURCE).toContain('no pool-wide mode')
    expect(description).toContain('at most one loop')
    expect(OWNER_ACTIVE_GUIDANCE[0]).toContain('at most one dispatch loop')
  })

  it('守卫归属与入口：P2 含发起会话与 slug；工具拒绝响应同键（owner session id + slug）', () => {
    const p2 = renderP2(PAYLOAD)
    expect(p2).toContain(`${PAYLOAD.slug} 已有正在运行的任务循环（发起会话 ${PAYLOAD.ownerSessionId}）`)
    expect(description).toContain('the response names the loop owner and the correct entries')
  })

  it('section 注册单点：段名常量 ↔ 注入模板消费面同源', () => {
    expect(FORGE_DISPATCH_LOOP_SECTION_NAME).toBe('forge:dispatch-loop')
    expect(DISPATCH_TASK_SOURCE).toContain("from '../loop/injection.js'")
  })
})

// ─────────────────────────── 结束族机制断言（AC 11） ───────────────────────────

describe('pin-dispatch-injection · 结束族 settlement 形态（P8 评审指示段）', () => {
  it('finished-all 分支即 P8——四重点逐字在文、无重复结束块', () => {
    const text = renderEndOfLoop('finished-all', PAYLOAD)
    expect(text).toContain('【代码评审指示】')
    expect(text).not.toContain('【任务循环结束】')
    for (const focus of P8_FOCUS_LINES) expect(text).toContain(focus)
    // P8 单渲染与结束族同文（非改写）
    expect(text).toContain(renderP8(PAYLOAD))
  })

  it('其余分支互斥单选——零 P8 残留（不做段内条件拼接）', () => {
    for (const kind of ['blocked-residue', 'spawn-failure', 'wait-timeout'] as const) {
      const text = renderEndOfLoop(kind, PAYLOAD)
      expect(text).not.toContain('【代码评审指示】')
      for (const focus of P8_FOCUS_LINES) expect(text).not.toContain(focus)
    }
    expect(renderP5(PAYLOAD)).toContain('已完成 4，blocked 1')
    expect(renderP6(PAYLOAD)).toContain(`${PAYLOAD.slug} 连续派发失败`)
    expect(renderP7(PAYLOAD)).toContain(`dispatchTask(${PAYLOAD.slug})`)
  })

  it('driver 消费同源：driver.ts 结束径直调 renderEndOfLoop（非二次抄写）', () => {
    const driverSource = readFileSync(
      fileURLToPath(new URL('../../src/loop/driver.ts', import.meta.url)),
      'utf-8',
    )
    expect(driverSource).toContain("renderEndOfLoop('finished-all'")
    expect(driverSource).toContain('narrator.settle')
    expect(driverSource).not.toContain('【代码评审指示】')
  })
})

// ─────────────────────────── 占位符纪律 ───────────────────────────

describe('pin-dispatch-injection · 占位符完整性', () => {
  it('全量渲染零残留 <...>（注入前必须全部替换）', () => {
    const renders = [
      renderP1(PAYLOAD),
      renderP2(PAYLOAD),
      renderP3(PAYLOAD),
      renderP9(PAYLOAD),
      renderP5(PAYLOAD),
      renderP6(PAYLOAD),
      renderP7(PAYLOAD),
      renderP8(PAYLOAD),
      renderEndOfLoop('finished-all', PAYLOAD),
    ]
    for (const text of renders) expect(text).not.toMatch(/<[^<>\n]+>/)
  })
})
