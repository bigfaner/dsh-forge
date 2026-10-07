// DiagToast 单测 —— AC2：双档计时（成功 1s / 失败族 5s）+ 三档构造器（子图成功 / 子图失败
// 五类检查逐项·✗ 含违规描述 / 任务失败 = 状态+原因+最近记录≤3+任务键）+ 服务异常档 +
// 「发送给 agent」按钮（fail 档独有——payload 直喂 formatDiagMessage）+ 隐藏态。
// 重跑零陈旧滞留 = 受控 result（undefined = 不呈现；新结果整体替换——计时随 result 重置）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TaskStatus, ViolationKind } from '@dsh-forge/contracts'
import type { DiagRecordLine, MessageContainer, TaskFailureDiagInput } from '../message-format.js'
import {
  DIAG_TOAST_FAIL_MS,
  DIAG_TOAST_OK_MS,
  DiagToast,
  diagServiceError,
  diagToastDurationMs,
  subgraphDiagFail,
  subgraphDiagOk,
  taskFailureDiagToast,
} from './DiagToast.js'

const NOOP = (): void => {}

const FEATURE_CONTAINER: MessageContainer = {
  kind: 'feature',
  slug: 'm2-pipeline',
  title: 'M2 管线接管',
  summary: '状态层转正',
  phase: 'tasks',
}

const BLITZ_CONTAINER: MessageContainer = {
  kind: 'proposal',
  slug: 'legacy-eval-retire',
  title: '旧线 eval 退役',
  summary: '完整 eval 体系不迁移',
}

function violation(kind: ViolationKind, message: string): { readonly kind: ViolationKind; readonly message: string } {
  return { kind, message }
}

function record(verb: string, at: string, note?: string): DiagRecordLine {
  return { verb, at, ...(note !== undefined ? { note } : {}) }
}

function taskFailureInput(records: readonly DiagRecordLine[], taskStatus: TaskStatus = 'blocked'): TaskFailureDiagInput {
  return {
    kind: 'task-failure',
    container: FEATURE_CONTAINER,
    taskKey: 'm2-pipeline/2.5',
    taskTitle: '概览 tab 三视图接线',
    taskStatus,
    reason: '前置 2.4 未完成',
    records,
  }
}

describe('双档计时（AC2——纯时长映射）', () => {
  it('成功档 = 1s；失败族（子图失败/任务失败/服务异常）= 5s', () => {
    expect(DIAG_TOAST_OK_MS).toBe(1000)
    expect(DIAG_TOAST_FAIL_MS).toBe(5000)
    expect(diagToastDurationMs(subgraphDiagOk())).toBe(1000)
    expect(diagToastDurationMs(subgraphDiagFail(FEATURE_CONTAINER, [violation('cycle', '2.5 → 2.4 → 2.5')]))).toBe(5000)
    expect(diagToastDurationMs(taskFailureDiagToast(taskFailureInput([])))).toBe(5000)
    expect(diagToastDurationMs(diagServiceError('RPC 超时'))).toBe(5000)
  })
})

describe('子图诊断档构造器', () => {
  it('成功：标题「子图健康 ✓」+ 五类检查全通过副行', () => {
    const result = subgraphDiagOk()
    expect(result).toMatchObject({ tier: 'ok' })
    if (result.tier !== 'ok') return
    expect(result.title).toBe('子图健康 ✓')
    expect(result.subtitle).toBe('五类检查全部通过（派生不变量 / 依赖无环 / Liveness / 记录链完整性 / 拓扑可分层）')
  })

  it('失败：标题 = 诊断失败 · 容器标题；五类检查固定读序逐项（✗ 含违规描述 / ✓ 通过）', () => {
    const result = subgraphDiagFail(FEATURE_CONTAINER, [
      violation('cycle', 'm2-pipeline/2.5 存在环依赖'),
      violation('liveness', 'm2-pipeline/2.6 悬挂等待'),
    ])
    expect(result.tier).toBe('fail')
    if (result.tier !== 'fail') return
    expect(result.title).toBe('诊断失败 · M2 管线接管')
    const texts = result.lines.map((line) => line.text)
    expect(texts).toEqual([
      '✓ 派生不变量',
      '✗ 依赖无环 — m2-pipeline/2.5 存在环依赖',
      '✗ Liveness — m2-pipeline/2.6 悬挂等待',
      '✓ 记录链完整性',
      '✓ 拓扑可分层',
    ])
    // tone：违规行 bad / 通过行 ok
    expect(result.lines.map((line) => line.tone)).toEqual(['ok', 'bad', 'bad', 'ok', 'ok'])
    // 发送负载直喂 formatDiagMessage（SubgraphDiagInput 形状）
    expect(result.send).toMatchObject({ kind: 'subgraph', container: FEATURE_CONTAINER })
  })

  it('失败档零违规不可达防御（violations 空 → 五项全 ✓——调用面以 length 判成功档）', () => {
    const result = subgraphDiagFail(FEATURE_CONTAINER, [])
    expect(result.tier).toBe('fail')
    if (result.tier !== 'fail') return
    expect(result.lines.every((line) => line.tone === 'ok')).toBe(true)
  })
})

describe('任务失败档构造器（v19–v21：所属背景 + 状态/原因 + 最近记录 ≤3 + 任务键）', () => {
  const records = [
    record('auto-block', '2026-10-02T11:30:00.000Z', '前置未满足'),
    record('submit', '2026-10-02T10:00:00.000Z', 'gate 未过'),
    record('claim', '2026-10-01T09:00:00.000Z'),
    record('transition', '2026-09-30T08:00:00.000Z', '人工挂起'),
  ]

  it('行集 = 所属（含种类词+阶段）+ 摘要 + 状态·原因(bad) + 最近记录 ≤3 + 任务键', () => {
    const result = taskFailureDiagToast(taskFailureInput(records))
    expect(result.tier).toBe('fail')
    if (result.tier !== 'fail') return
    expect(result.title).toBe('任务失败 · 概览 tab 三视图接线')
    const texts = result.lines.map((line) => line.text)
    expect(texts).toEqual([
      '所属：M2 管线接管（feature） · 阶段：任务',
      '摘要：状态层转正',
      '状态：阻塞 — 前置 2.4 未完成',
      '· submit 10-02 10:00 gate 未过',
      '· claim 10-01 09:00',
      '· transition 09-30 08:00 人工挂起',
      '任务键：m2-pipeline/2.5',
    ])
    expect(result.lines.map((line) => line.tone)).toEqual(['plain', 'plain', 'bad', 'plain', 'plain', 'plain', 'plain'])
    // 发送负载原样回传（formatDiagMessage 直喂）
    expect(result.send).toEqual(taskFailureInput(records))
  })

  it('记录截最近 3 条（slice(-3)——首条 auto-block 出局）；无记录 = 空行集', () => {
    const result = taskFailureDiagToast(taskFailureInput(records))
    expect(result.tier).toBe('fail')
    if (result.tier !== 'fail') return
    expect(result.lines.some((line) => line.text.includes('auto-block'))).toBe(false)
    const empty = taskFailureDiagToast(taskFailureInput([]))
    if (empty.tier !== 'fail') return
    expect(empty.lines.map((l) => l.text)).toEqual([
      '所属：M2 管线接管（feature） · 阶段：任务',
      '摘要：状态层转正',
      '状态：阻塞 — 前置 2.4 未完成',
      '任务键：m2-pipeline/2.5',
    ])
  })

  it('突击提案容器：所属行无阶段段（无 feature 阶段）；状态短语 rejected → 已拒绝', () => {
    const result = taskFailureDiagToast({
      kind: 'task-failure',
      container: BLITZ_CONTAINER,
      taskKey: 'legacy-eval-retire/1.2',
      taskTitle: '旧线 eval 退役走查',
      taskStatus: 'rejected',
      reason: '用例集冲突',
      records: [record('submit', '2026-09-22T14:30:00.000Z', '冲突')],
    })
    if (result.tier !== 'fail') return
    const texts = result.lines.map((line) => line.text)
    expect(texts).toContain('所属：旧线 eval 退役（突击提案）')
    expect(texts).toContain('状态：已拒绝 — 用例集冲突')
  })
})

describe('服务异常档（States 服务异常行——错误 toast + 重试语义）', () => {
  it('标题 + 错误消息 + 再点诊断重试提示行', () => {
    const result = diagServiceError('RPC 超时')
    expect(result.tier).toBe('error')
    if (result.tier !== 'error') return
    expect(result.title).toBe('诊断服务异常')
    expect(result.lines.map((l) => l.text)).toEqual(['RPC 超时', '再点「诊断」重试（留场不吞错）'])
  })
})

describe('DiagToast 渲染面（静态全相位——受控 result）', () => {
  it('result = undefined → 不呈现（零陈旧滞留：切换 feature/重跑由装载侧整体替换）', () => {
    expect(renderToStaticMarkup(<DiagToast result={undefined} onDismiss={NOOP} />)).toBe('')
  })

  it('成功档：role=status + 档位锚 + 标题/副行；无「发送给 agent」', () => {
    const markup = renderToStaticMarkup(<DiagToast result={subgraphDiagOk()} onDismiss={NOOP} />)
    expect(markup).toContain('data-dswf-tt-diagtoast="ok"')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('子图健康 ✓')
    expect(markup).toContain('五类检查全部通过')
    expect(markup).not.toContain('发送给 agent')
  })

  it('失败档：标题 + 行集 tone 类（is-ok/is-bad）+「发送给 agent」动作钮', () => {
    const result = subgraphDiagFail(FEATURE_CONTAINER, [violation('cycle', 'm2-pipeline/2.5 存在环依赖')])
    const markup = renderToStaticMarkup(
      <DiagToast result={result} onDismiss={NOOP} onSend={() => {}} />,
    )
    expect(markup).toContain('data-dswf-tt-diagtoast="fail"')
    expect(markup).toContain('诊断失败 · M2 管线接管')
    expect(markup).toContain('is-ok')
    expect(markup).toContain('is-bad')
    expect(markup).toContain('发送给 agent')
    expect(markup).toContain('data-dswf-tt-diagtoast-send')
  })

  it('服务异常档：错误呈现 + 无发送钮（无消息可发）', () => {
    const markup = renderToStaticMarkup(<DiagToast result={diagServiceError('RPC 超时')} onDismiss={NOOP} />)
    expect(markup).toContain('data-dswf-tt-diagtoast="error"')
    expect(markup).toContain('诊断服务异常')
    expect(markup).not.toContain('发送给 agent')
  })
})
