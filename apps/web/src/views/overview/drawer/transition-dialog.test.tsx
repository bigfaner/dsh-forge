// 转移对话框单测 —— AC1 选项集唯一源（allowedTransitions 透传，禁自算）/ AC2 空因拒绝留场 /
// AC3 提交载荷（taskId + toStatus + reason）+ 终态 autoRestore 提示 / AC4 关闭（Esc/取消）。
// 渲染面 = renderToStaticMarkup（仓库形制）；确认钮点击链与 Esc DOM 事件 = 4.1 装配 + 5.2 e2e 面
// （判定逻辑以 transitionDialogEscapeHandler 纯函数先行覆盖）。
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TaskSnapshot, TransitionTaskInput } from '@dsh-forge/contracts'
import { RpcClientError } from '../../../rpc/errors.js'
import type { ForgeRpcClient } from '../../../rpc/index.js'
import { detailFixture } from './detail-model.test.js'
import {
  TransitionDialog,
  TransitionDialogBody,
  bindTransitionDialogEscape,
  checkTransitionSubmit,
  confirmTransitionDialog,
  initialTransitionDialogState,
  submitTaskTransition,
  transitionDialogEscapeHandler,
  transitionErrorMessage,
  transitionTargetOptions,
  type TransitionDialogPatch,
} from './transition-dialog.js'

const NOOP = (): void => {}
/** 基准任务（in_progress + 交付集真子集——证明选项集非七态自算） */
function dialogFixture(overrides: Parameters<typeof detailFixture>[0] = {}) {
  return detailFixture({
    taskStatus: 'in_progress',
    allowedTransitions: ['pending', 'blocked', 'skipped'],
    ...overrides,
  })
}

describe('AC1 · 选项集唯一源 = allowedTransitions（Hard Rule：禁自行计算）', () => {
  it('transitionTargetOptions 透传交付集（真子集原样返回——非七态全集自算）', () => {
    expect(transitionTargetOptions(['pending', 'blocked', 'skipped'], 'in_progress')).toEqual([
      'pending',
      'blocked',
      'skipped',
    ])
  })

  it('from≠to 机械排除：交付集混入当前态 → 滤除（用户点不到当前态）', () => {
    expect(transitionTargetOptions(['in_progress', 'pending'], 'in_progress')).toEqual(['pending'])
  })

  it('Body 选项 = 交付集逐项（value=状态键 + 中文（英文）标签）；交付集外状态不出现', () => {
    const detail = dialogFixture()
    const html = renderToStaticMarkup(
      TransitionDialogBody({
        task: detail,
        options: transitionTargetOptions(detail.allowedTransitions, detail.taskStatus),
        toStatus: 'pending',
        reason: '',
        error: undefined,
        submitting: false,
        onEditTarget: NOOP,
        onEditReason: NOOP,
        onConfirm: NOOP,
        onCancel: NOOP,
      }),
    )
    expect(html.match(/<option[^>]*value="pending"/)).toBeTruthy()
    expect(html.match(/<option[^>]*value="blocked"/)).toBeTruthy()
    expect(html.match(/<option[^>]*value="skipped"/)).toBeTruthy()
    // 交付集外（含当前态）六态均不可点
    for (const absent of ['in_progress', 'completed', 'suspended', 'rejected']) {
      expect(html.match(new RegExp(`<option[^>]*value="${absent}"`))).toBeFalsy()
    }
    expect(html).toContain('已阻塞（Blocked）')
    expect(html).toContain('当前状态')
    expect(html).toContain('进行中')
  })
})

describe('AC2 · reason 必带：空因确认拒绝留场', () => {
  it('checkTransitionSubmit：空串 / 纯空白 reason → reason-required；非空 → ok', () => {
    const task = dialogFixture()
    const base = { projectId: 'p-1', task, toStatus: 'blocked' as const }
    expect(checkTransitionSubmit({ ...base, reason: '' })).toEqual({ ok: false, error: 'reason-required' })
    expect(checkTransitionSubmit({ ...base, reason: '   \n\t ' })).toEqual({ ok: false, error: 'reason-required' })
    expect(checkTransitionSubmit({ ...base, reason: '等待外部依赖' }).ok).toBe(true)
  })

  it('目标缺席（空选项集防线）→ target-required', () => {
    const task = dialogFixture()
    expect(checkTransitionSubmit({ projectId: 'p-1', task, toStatus: undefined, reason: 'x' })).toEqual({
      ok: false,
      error: 'target-required',
    })
  })

  it('Body 错误相位：role="alert" + 错误提示在场；已选目标与已输内容保留（不清空）', () => {
    const detail = dialogFixture()
    const html = renderToStaticMarkup(
      TransitionDialogBody({
        task: detail,
        options: transitionTargetOptions(detail.allowedTransitions, detail.taskStatus),
        toStatus: 'skipped',
        reason: '   ',
        error: { kind: 'reason-required' },
        submitting: false,
        onEditTarget: NOOP,
        onEditReason: NOOP,
        onConfirm: NOOP,
        onCancel: NOOP,
      }),
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('data-dswf-td-tr-error="reason-required"')
    expect(html).toContain('原因必填')
    // 留场证物：目标仍选中（selected 落在 skipped option 上）+ reason 原文在 textarea
    const selected = html.match(/<option[^>]*value="skipped"[^>]*>/)?.[0] ?? ''
    expect(selected).toContain('selected')
    expect(html).toContain('data-dswf-td-tr-reason')
    expect(html.match(/<textarea[^>]*>[\s]*<\/textarea>/)).toBeTruthy()
  })
})

describe('AC3 · 提交载荷 + 终态提示', () => {
  it('载荷 = { projectId, taskId, toStatus, reason }（taskId 引用锚——非自然键；reason 修剪）', () => {
    const task = dialogFixture()
    const out = checkTransitionSubmit({ projectId: 'p-1', task, toStatus: 'completed', reason: '  重开补断言  ' })
    expect(out).toEqual({
      ok: true,
      payload: { projectId: 'p-1', taskId: 't-1', toStatus: 'completed', reason: '重开补断言' } satisfies TransitionTaskInput,
    })
  })

  it('submitTaskTransition：唯一通道 = tasks.transition + 载荷原样；成功回传快照', async () => {
    const calls: string[] = []
    const payloads: unknown[] = []
    const snapshot: TaskSnapshot = {
      taskId: 't-1', slug: 'm2-pipeline', localId: '2.4', featureId: 'f-1', title: 't',
      taskType: 'coding-feature', taskStatus: 'blocked', mainSession: false, breaking: false,
      complexity: 'high', createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z',
    }
    const client = {
      tasks: {
        transition: async (input: unknown) => { calls.push('tasks.transition'); payloads.push(input); return snapshot },
        query: async () => { calls.push('tasks.query'); return {} },
        validateFeatureTasks: async () => { calls.push('tasks.validateFeatureTasks'); return {} },
        list: async () => { calls.push('tasks.list'); return [] },
        stats: async () => { calls.push('tasks.stats'); return {} },
        graph: async () => { calls.push('tasks.graph'); return {} },
        detail: async () => { calls.push('tasks.detail'); return {} },
        sessionLinks: async () => { calls.push('tasks.sessionLinks'); return [] },
      },
    } as unknown as ForgeRpcClient
    const input: TransitionTaskInput = { projectId: 'p-1', taskId: 't-1', toStatus: 'blocked', reason: '等待依赖' }
    const out = await submitTaskTransition(client, input)
    expect(out).toEqual({ ok: true, snapshot })
    expect(calls).toEqual(['tasks.transition'])
    expect(payloads).toEqual([input])
  })

  it('submitTaskTransition：RpcClientError → message 原样 + rpcUiState 映射（ERR_INVALID_TRANSITION → error-bar）', async () => {
    const fail: Promise<never> = Promise.reject(new RpcClientError({ code: 'ERR_INVALID_TRANSITION', message: '目标不在允许集' }))
    const client = { tasks: { transition: () => fail } } as unknown as ForgeRpcClient
    const out = await submitTaskTransition(client, { projectId: 'p-1', taskId: 't-1', toStatus: 'pending', reason: 'r' })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error.message).toBe('目标不在允许集')
      expect(out.error.uiState).toBe('error-bar')
    }
  })

  it('submitTaskTransition：读未命中码走 typed 分支（ERR_TASK_NOT_FOUND → empty-state——非兜底档判别）', async () => {
    const client = { tasks: { transition: () => Promise.reject(new RpcClientError({ code: 'ERR_TASK_NOT_FOUND', message: '任务未命中' })) } } as unknown as ForgeRpcClient
    const out = await submitTaskTransition(client, { projectId: 'p-1', taskId: 'ghost', toStatus: 'pending', reason: 'r' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error.uiState).toBe('empty-state')
  })

  it('submitTaskTransition：非 typed 抛体（普通 Error / 字符串）→ 通用错误条兜底（message 承载）', async () => {
    const errClient = { tasks: { transition: () => Promise.reject(new Error('通道断裂')) } } as unknown as ForgeRpcClient
    const errOut = await submitTaskTransition(errClient, { projectId: 'p-1', taskId: 't-1', toStatus: 'pending', reason: 'r' })
    expect(errOut).toEqual({ ok: false, error: { message: '通道断裂', uiState: 'error-bar' } })
    const strClient = { tasks: { transition: () => Promise.reject('裸字符串') } } as unknown as ForgeRpcClient
    const strOut = await submitTaskTransition(strClient, { projectId: 'p-1', taskId: 't-1', toStatus: 'pending', reason: 'r' })
    expect(strOut).toEqual({ ok: false, error: { message: '裸字符串', uiState: 'error-bar' } })
  })

  it('错误文案三形：target-required / reason-required / rpc（message 织入）', () => {
    expect(transitionErrorMessage({ kind: 'target-required' })).toContain('未选择目标状态')
    expect(transitionErrorMessage({ kind: 'reason-required' })).toContain('原因必填')
    expect(transitionErrorMessage({ kind: 'rpc', message: '目标不在允许集' })).toBe('转移失败：目标不在允许集')
  })

  it('Body 终态提示：目标 ∈ {completed, skipped} → autoRestore 提示在场；非终态缺席', () => {
    const detail = dialogFixture()
    const props = (toStatus: string) => ({
      task: detail,
      options: ['pending', 'blocked', 'skipped', 'completed'] as const,
      toStatus: toStatus as (typeof detail)['taskStatus'],
      reason: 'r',
      error: undefined,
      submitting: false,
      onEditTarget: NOOP,
      onEditReason: NOOP,
      onConfirm: NOOP,
      onCancel: NOOP,
    })
    expect(renderToStaticMarkup(TransitionDialogBody(props('completed')))).toContain('autoRestore')
    expect(renderToStaticMarkup(TransitionDialogBody(props('skipped')))).toContain('autoRestore')
    expect(renderToStaticMarkup(TransitionDialogBody(props('pending')))).not.toContain('autoRestore')
  })

  it('Body submitting：确认钮禁用（防双发）；idle 可点', () => {
    const detail = dialogFixture()
    const base = {
      task: detail,
      options: transitionTargetOptions(detail.allowedTransitions, detail.taskStatus),
      toStatus: 'pending' as const,
      reason: 'r',
      error: undefined,
      onEditTarget: NOOP,
      onEditReason: NOOP,
      onConfirm: NOOP,
      onCancel: NOOP,
    }
    expect(renderToStaticMarkup(TransitionDialogBody({ ...base, submitting: true }))).toContain('disabled')
    expect(renderToStaticMarkup(TransitionDialogBody({ ...base, submitting: false }))).not.toContain('disabled')
  })
})

describe('确认动作 confirmTransitionDialog（AC2/AC3 主流程——补丁序）', () => {
  /** 记录补丁/成功上抛/rpc 调用的依赖罐 */
  function harness(client: unknown, snapshot?: TaskSnapshot) {
    const patches: TransitionDialogPatch[] = []
    const dones: TaskSnapshot[] = []
    const rpcCalls: unknown[] = []
    const makeClient = () => ({
      tasks: {
        transition: async (input: unknown) => {
          rpcCalls.push(input)
          if (snapshot === undefined) throw new Error('rpc 缺席')
          return snapshot
        },
      },
    }) as unknown as ForgeRpcClient
    return {
      patches,
      dones,
      rpcCalls,
      deps: {
        projectId: 'p-1',
        task: dialogFixture(),
        makeClient,
        onDone: (s: TaskSnapshot) => { dones.push(s) },
        onPatch: (p: TransitionDialogPatch) => { patches.push(p) },
      },
    }
  }
  const snapshot: TaskSnapshot = {
    taskId: 't-1', slug: 'm2-pipeline', localId: '2.4', featureId: 'f-1', title: 't',
    taskType: 'coding-feature', taskStatus: 'blocked', mainSession: false, breaking: false,
    complexity: 'high', createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z',
  }

  it('初始态 = 允许集首项（免点选）；空集 → toStatus undefined（target-required 防线）', () => {
    expect(initialTransitionDialogState(['pending', 'blocked'])).toEqual({
      toStatus: 'pending', reason: '', error: undefined, submitting: false,
    })
    expect(initialTransitionDialogState([]).toStatus).toBeUndefined()
  })

  it('空因拒绝留场：单补丁 error=reason-required；rpc 与 onDone 零调用；补丁不含 toStatus/reason（结构性不清空）', async () => {
    const h = harness(undefined)
    await confirmTransitionDialog(
      { toStatus: 'blocked', reason: '   ', error: undefined, submitting: false },
      h.deps,
    )
    expect(h.patches).toEqual([{ error: { kind: 'reason-required' } }])
    expect(h.rpcCalls).toEqual([])
    expect(h.dones).toEqual([])
  })

  it('成功径：补丁序 = [提交中] → [清错]；onDone 回传快照；rpc 载荷 = 校验产出', async () => {
    const h = harness(undefined, snapshot)
    await confirmTransitionDialog(
      { toStatus: 'completed', reason: ' 重开补断言 ', error: undefined, submitting: false },
      h.deps,
    )
    expect(h.patches).toEqual([
      { error: undefined, submitting: true },
      { error: undefined, submitting: false },
    ])
    expect(h.dones).toEqual([snapshot])
    expect(h.rpcCalls).toEqual([{ projectId: 'p-1', taskId: 't-1', toStatus: 'completed', reason: '重开补断言' }])
  })

  it('rpc 失败留场：补丁序 = [提交中] → [rpc 错误]；onDone 零调用', async () => {
    const makeClient = () => ({ tasks: { transition: () => Promise.reject(new RpcClientError({ code: 'ERR_INVALID_TRANSITION', message: '目标不在允许集' })) } }) as unknown as ForgeRpcClient
    const patches: TransitionDialogPatch[] = []
    const dones: TaskSnapshot[] = []
    await confirmTransitionDialog(
      { toStatus: 'pending', reason: '回退', error: undefined, submitting: false },
      { projectId: 'p-1', task: dialogFixture(), makeClient, onDone: (s) => { dones.push(s) }, onPatch: (p) => { patches.push(p) } },
    )
    expect(patches).toEqual([
      { error: undefined, submitting: true },
      { error: { kind: 'rpc', message: '目标不在允许集' }, submitting: false },
    ])
    expect(dones).toEqual([])
  })

  it('单飞守卫：submitting 态重复确认 = no-op（零补丁零调用）', async () => {
    const h = harness(undefined, snapshot)
    await confirmTransitionDialog(
      { toStatus: 'pending', reason: 'r', error: undefined, submitting: true },
      h.deps,
    )
    expect(h.patches).toEqual([])
    expect(h.rpcCalls).toEqual([])
    expect(h.dones).toEqual([])
  })
})

describe('AC4 · 关闭：Esc / 取消', () => {
  it('取消钮在场（data-dswf-td-tr-cancel）；确认钮锚（data-dswf-td-tr-confirm）', () => {
    const detail = dialogFixture()
    const html = renderToStaticMarkup(
      TransitionDialogBody({
        task: detail,
        options: transitionTargetOptions(detail.allowedTransitions, detail.taskStatus),
        toStatus: 'pending',
        reason: '',
        error: undefined,
        submitting: false,
        onEditTarget: NOOP,
        onEditReason: NOOP,
        onConfirm: NOOP,
        onCancel: NOOP,
      }),
    )
    expect(html).toContain('data-dswf-td-tr-cancel')
    expect(html).toContain('data-dswf-td-tr-confirm')
    expect(html).toContain('取消')
    expect(html).toContain('确认转移')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
  })

  it('Esc 判定（transitionDialogEscapeHandler）：Escape → onCancel + stopPropagation；他键 no-op', () => {
    let cancelled = 0
    let stopped = 0
    const handler = transitionDialogEscapeHandler(() => { cancelled += 1 })
    handler({ key: 'Escape', stopPropagation: () => { stopped += 1 } })
    expect(cancelled).toBe(1)
    expect(stopped).toBe(1)
    handler({ key: 'Enter', stopPropagation: () => { stopped += 1 } })
    handler({ key: 'Esc', stopPropagation: () => { stopped += 1 } })
    expect(cancelled).toBe(1)
    expect(stopped).toBe(1)
  })

  it('Esc 绑定（bindTransitionDialogEscape）：keydown capture 注册 + 解绑函数成对移除（层序挂点由挂点对象承载）', () => {
    const registered: Array<{ type: string; capture: boolean }> = []
    const removed: Array<{ type: string; capture: boolean }> = []
    let handler: ((event: { key: string; stopPropagation(): void }) => void) | undefined
    let cancelled = 0
    const target = {
      addEventListener: (type: string, fn: (event: { key: string; stopPropagation(): void }) => void, opts: { capture?: boolean }) => {
        registered.push({ type, capture: opts.capture === true })
        handler = fn
      },
      removeEventListener: (type: string, fn: unknown, opts: { capture?: boolean }) => {
        expect(fn).toBe(handler)
        removed.push({ type, capture: opts.capture === true })
      },
    } as unknown as Window
    const dispose = bindTransitionDialogEscape(target, () => { cancelled += 1 })
    expect(registered).toEqual([{ type: 'keydown', capture: true }])
    handler?.({ key: 'Escape', stopPropagation: () => {} })
    expect(cancelled).toBe(1)
    dispose()
    expect(removed).toEqual([{ type: 'keydown', capture: true }])
  })

  it('装载壳静态首帧：mask + 对话框 + 初始选中 = 交付集首项；静态渲染期 rpc 零调用', () => {
    // 拒绝体惰性创建（未调用即无 promise——不产生 unhandled rejection）
    const client = { tasks: { transition: () => Promise.reject(new Error('不应在静态渲染期调用')) } } as unknown as ForgeRpcClient
    const detail = dialogFixture()
    const html = renderToStaticMarkup(
      createElement(TransitionDialog, {
        projectId: 'p-1',
        task: detail,
        allowedTransitions: detail.allowedTransitions,
        onCancel: NOOP,
        onDone: NOOP,
        makeClient: () => client,
      }),
    )
    expect(html).toContain('data-dswf-td-tr-mask')
    expect(html).toContain('data-dswf-td-tr-dialog')
    expect(html).toContain('m2-pipeline/2.4')
    const selected = html.match(/<option[^>]*value="pending"[^>]*>/)?.[0] ?? ''
    expect(selected).toContain('selected')
  })
})
