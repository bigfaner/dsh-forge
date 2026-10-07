// 评审流转对话框单测 —— 4.2 AC2：目标态仅列五态机允许集（allowedTransitions 纯函数——
// prototype 170 断言基线单源矩阵）+ reason 必填（空因拒绝留场）+ superseded 必带 supersededBy
// （contracts 服务 fail-loud 面）+ accepted 分叉文案（远征成链 / 突击直挂 / 未标记边界）。
// 渲染面 = renderToStaticMarkup 纯 Body（官方 Modal 形制 portal——静态不渲，开弹行为归 4.6/e2e）；
// 提交链 = confirmVerdictDialog 纯异步面（补丁增量合并——留场结构性成立）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TransitionProposalInput } from '@dsh-forge/contracts'
import { RpcClientError } from '../../../rpc/errors.js'
import type { ForgeRpcClient } from '../../../rpc/index.js'
import {
  ProposalVerdictDialogBody,
  allowedTransitions,
  checkVerdictSubmit,
  confirmVerdictDialog,
  initialVerdictDialogState,
  submitProposalVerdict,
  verdictAcceptedHint,
  verdictErrorMessage,
  type VerdictDialogPatch,
  type VerdictProposalView,
} from './ProposalVerdictDialog.js'

const NOOP = (): void => {}

function view(overrides: Partial<VerdictProposalView> = {}): VerdictProposalView {
  return {
    proposalId: 'pr-1',
    title: 'M3 自举·模式预设',
    proposalStatus: 'under-review',
    mode: 'expedition',
    ...overrides,
  }
}

const CANDIDATES = [
  { proposalId: 'pr-9', title: 'M3.75 弹性项' },
  { proposalId: 'pr-1', title: '自身（应被滤除）' },
]

describe('AC2 · 五态机允许集（allowedTransitions 纯函数——prototype 基线矩阵）', () => {
  it('五态矩阵逐行（draft→评审中起步 / under-review→三向 / accepted→superseded / rejected→draft / superseded→终态无出边）', () => {
    expect(allowedTransitions('draft')).toEqual(['under-review'])
    expect(allowedTransitions('under-review')).toEqual(['accepted', 'rejected', 'draft'])
    expect(allowedTransitions('accepted')).toEqual(['superseded'])
    expect(allowedTransitions('rejected')).toEqual(['draft'])
    expect(allowedTransitions('superseded')).toEqual([])
  })

  it('返回全新数组（调用方改写不污染矩阵）', () => {
    const a = allowedTransitions('under-review')
    a.push('superseded')
    expect(allowedTransitions('under-review')).toEqual(['accepted', 'rejected', 'draft'])
  })

  it('Body 选项 = 允许集逐项（under-review 三向；允许集外状态不出现在 option 面）', () => {
    const html = renderToStaticMarkup(
      ProposalVerdictDialogBody({
        proposal: view(),
        options: allowedTransitions('under-review'),
        toStatus: 'accepted',
        supersededBy: undefined,
        candidates: [],
        reason: '',
        error: undefined,
        onEditTarget: NOOP,
        onEditSupersededBy: NOOP,
        onEditReason: NOOP,
      }),
    )
    expect(html.match(/<option[^>]*value="accepted"/)).toBeTruthy()
    expect(html.match(/<option[^>]*value="rejected"/)).toBeTruthy()
    expect(html.match(/<option[^>]*value="draft"/)).toBeTruthy()
    for (const absent of ['under-review', 'superseded']) {
      expect(html.match(new RegExp(`<option[^>]*value="${absent}"`))).toBeFalsy()
    }
    expect(html).toContain('已接受（Accepted）')
    expect(html).toContain('当前状态')
    expect(html).toContain('评审中')
  })

  it('空允许集（superseded 当前态）：select disabled + 占位（无允许目标态）', () => {
    const html = renderToStaticMarkup(
      ProposalVerdictDialogBody({
        proposal: view({ proposalStatus: 'superseded' }),
        options: [],
        toStatus: undefined,
        supersededBy: undefined,
        candidates: CANDIDATES,
        reason: '',
        error: undefined,
        onEditTarget: NOOP,
        onEditSupersededBy: NOOP,
        onEditReason: NOOP,
      }),
    )
    expect(html).toContain('disabled')
    expect(html).toContain('（无允许目标态）')
  })
})

describe('AC2 · reason 必填 + superseded 必带取代目标（提交校验）', () => {
  const base = {
    projectId: 'p-1',
    proposal: view(),
    toStatus: 'accepted' as const,
    supersededBy: undefined,
  }

  it('空因 / 纯空白 reason → reason-required', () => {
    expect(checkVerdictSubmit({ ...base, reason: '' })).toEqual({ ok: false, error: 'reason-required' })
    expect(checkVerdictSubmit({ ...base, reason: '  \n\t ' })).toEqual({ ok: false, error: 'reason-required' })
  })

  it('目标缺席（空允许集防线）→ target-required', () => {
    expect(
      checkVerdictSubmit({ projectId: 'p-1', proposal: view({ proposalStatus: 'superseded' }), toStatus: undefined, supersededBy: undefined, reason: 'x' }),
    ).toEqual({ ok: false, error: 'target-required' })
  })

  it('superseded 目标缺席 supersededBy → superseded-by-required（服务 fail-loud 面的 UI 先验）', () => {
    expect(
      checkVerdictSubmit({ ...base, toStatus: 'superseded' as const, supersededBy: undefined, reason: '被取代' }),
    ).toEqual({ ok: false, error: 'superseded-by-required' })
  })

  it('通过 → 载荷（reason 不入载荷——contracts TransitionProposalInput 无 reason 面：提案域审计 = decided_at，tech-design Interface 3 权威形状）', () => {
    const out = checkVerdictSubmit({ ...base, reason: '  证据充分  ' })
    expect(out).toEqual({
      ok: true,
      payload: { projectId: 'p-1', proposalId: 'pr-1', toStatus: 'accepted' } satisfies TransitionProposalInput,
    })
  })

  it('superseded 载荷携带 supersededBy；非 superseded 不带 supersededBy 键', () => {
    const sup = checkVerdictSubmit({ ...base, toStatus: 'superseded' as const, supersededBy: 'pr-9', reason: '被取代' })
    expect(sup).toEqual({
      ok: true,
      payload: { projectId: 'p-1', proposalId: 'pr-1', toStatus: 'superseded', supersededBy: 'pr-9' },
    })
    const plain = checkVerdictSubmit({ ...base, reason: 'ok' })
    expect(plain.ok).toBe(true)
    if (plain.ok) expect('supersededBy' in plain.payload).toBe(false)
  })

  it('错误文案三形（留场错误条——Body role=alert）', () => {
    expect(verdictErrorMessage({ kind: 'reason-required' })).toContain('原因必填')
    expect(verdictErrorMessage({ kind: 'target-required' })).toContain('未选择目标状态')
    expect(verdictErrorMessage({ kind: 'superseded-by-required' })).toContain('取代')
    expect(verdictErrorMessage({ kind: 'rpc', message: 'x' })).toContain('流转失败')
  })
})

describe('AC2 · accepted 分叉文案', () => {
  it('远征 → 将单步成链建 feature（registerFeature 原子）', () => {
    expect(verdictAcceptedHint('expedition')).toContain('单步成链')
    expect(verdictAcceptedHint('expedition')).toContain('feature')
  })

  it('突击 → 直接进入任务阶段·无 feature', () => {
    expect(verdictAcceptedHint('blitz')).toContain('任务阶段')
    expect(verdictAcceptedHint('blitz')).toContain('无 feature')
  })

  it('未标记（NULL 溯源边界）→ 不成链：先定模式、补链显式 registerFeature', () => {
    const hint = verdictAcceptedHint(undefined)
    expect(hint).toContain('不成链')
    expect(hint).toContain('registerFeature')
  })

  it('Body 分叉文案在场性随目标态切换：accepted 在场 / 其它目标缺席', () => {
    const accepted = renderToStaticMarkup(
      ProposalVerdictDialogBody({
        proposal: view({ mode: 'blitz' }),
        options: allowedTransitions('under-review'),
        toStatus: 'accepted',
        supersededBy: undefined,
        candidates: [],
        reason: '',
        error: undefined,
        onEditTarget: NOOP,
        onEditSupersededBy: NOOP,
        onEditReason: NOOP,
      }),
    )
    expect(accepted).toContain('data-dswf-ov-vd-accepted-hint')
    expect(accepted).toContain('任务阶段')

    const rejected = renderToStaticMarkup(
      ProposalVerdictDialogBody({
        proposal: view(),
        options: allowedTransitions('under-review'),
        toStatus: 'rejected',
        supersededBy: undefined,
        candidates: [],
        reason: '',
        error: undefined,
        onEditTarget: NOOP,
        onEditSupersededBy: NOOP,
        onEditReason: NOOP,
      }),
    )
    expect(rejected).not.toContain('data-dswf-ov-vd-accepted-hint')
  })
})

describe('Body 相位渲染（superseded 目标面 + 留场证物）', () => {
  it('supersededBy 选择面仅在目标 = superseded 时呈现；候选滤除自身', () => {
    const html = renderToStaticMarkup(
      ProposalVerdictDialogBody({
        proposal: view(),
        options: allowedTransitions('under-review'),
        toStatus: 'accepted',
        supersededBy: undefined,
        candidates: CANDIDATES,
        reason: '',
        error: undefined,
        onEditTarget: NOOP,
        onEditSupersededBy: NOOP,
        onEditReason: NOOP,
      }),
    )
    expect(html).not.toContain('data-dswf-ov-vd-supersede')

    const sup = renderToStaticMarkup(
      ProposalVerdictDialogBody({
        proposal: view({ proposalStatus: 'draft' }),
        options: allowedTransitions('draft'),
        toStatus: 'under-review',
        supersededBy: undefined,
        candidates: CANDIDATES,
        reason: '',
        error: undefined,
        onEditTarget: NOOP,
        onEditSupersededBy: NOOP,
        onEditReason: NOOP,
      }),
    )
    // draft 允许集仅 under-review（非 superseded）——仍不应出现取代面
    expect(sup).not.toContain('data-dswf-ov-vd-supersede')
  })

  it('目标 = superseded：取代提案选择面在场（候选行呈现、自身滤除）', () => {
    const html = renderToStaticMarkup(
      ProposalVerdictDialogBody({
        proposal: view({ proposalStatus: 'accepted' }),
        options: allowedTransitions('accepted'),
        toStatus: 'superseded',
        supersededBy: 'pr-9',
        candidates: CANDIDATES,
        reason: '',
        error: undefined,
        onEditTarget: NOOP,
        onEditSupersededBy: NOOP,
        onEditReason: NOOP,
      }),
    )
    expect(html).toContain('data-dswf-ov-vd-supersede')
    expect(html).toContain('value="pr-9"')
    expect(html).not.toContain('value="pr-1"') // 自身候选滤除
  })

  it('空因拒绝留场：错误行在场 + 已选目标与已输内容保留（role=alert）', () => {
    const html = renderToStaticMarkup(
      ProposalVerdictDialogBody({
        proposal: view(),
        options: allowedTransitions('under-review'),
        toStatus: 'rejected',
        supersededBy: undefined,
        candidates: [],
        reason: '   ',
        error: { kind: 'reason-required' },
        onEditTarget: NOOP,
        onEditSupersededBy: NOOP,
        onEditReason: NOOP,
      }),
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('data-dswf-ov-vd-error="reason-required"')
    expect(html).toContain('原因必填')
    const selected = html.match(/<option[^>]*value="rejected"[^>]*>/)?.[0] ?? ''
    expect(selected).toContain('selected')
    expect(html).toContain('data-dswf-ov-vd-reason')
  })
})

describe('提交链（纯异步面）', () => {
  function clientWith(
    transition: (input: unknown) => Promise<unknown>,
    setMode?: (input: unknown) => Promise<unknown>,
  ): ForgeRpcClient {
    return {
      proposals: {
        list: async () => [],
        transition,
        setMode: setMode ?? (async () => { throw new Error('setMode 不应被调用') }),
        listDocs: async () => [],
      },
    } as unknown as ForgeRpcClient
  }

  it('初始态：已选目标 = 允许集首项（免点选）；空集 = undefined 防线', () => {
    expect(initialVerdictDialogState(allowedTransitions('under-review')).toStatus).toBe('accepted')
    expect(initialVerdictDialogState(allowedTransitions('superseded')).toStatus).toBeUndefined()
  })

  it('submitProposalVerdict：唯一通道 = proposals.transition + 载荷原样；成功回传结果', async () => {
    const calls: string[] = []
    const payloads: unknown[] = []
    const result = { proposalId: 'pr-1', slug: 'm3', title: 't', proposalStatus: 'accepted', createdAt: 'x', updatedAt: 'y' }
    const client = clientWith(async (input) => {
      calls.push('proposals.transition')
      payloads.push(input)
      return result
    })
    const out = await submitProposalVerdict(client, { projectId: 'p-1', proposalId: 'pr-1', toStatus: 'accepted' })
    expect(out).toEqual({ ok: true, result })
    expect(calls).toEqual(['proposals.transition'])
    expect(payloads[0]).toEqual({ projectId: 'p-1', proposalId: 'pr-1', toStatus: 'accepted' })
  })

  it('submitProposalVerdict：RpcClientError → message + uiState 映射；非 Rpc 错误兜底', async () => {
    const client = clientWith(async () => {
      throw new RpcClientError({ code: 'ERR_INVALID_TRANSITION', message: '非法转移' })
    })
    const out = await submitProposalVerdict(client, { projectId: 'p-1', proposalId: 'pr-1', toStatus: 'draft' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error.message).toBe('非法转移')

    const raw = clientWith(async () => { throw new Error('boom') })
    const out2 = await submitProposalVerdict(raw, { projectId: 'p-1', proposalId: 'pr-1', toStatus: 'draft' })
    expect(out2.ok).toBe(false)
    if (!out2.ok) expect(out2.error.message).toBe('boom')
  })

  it('confirmVerdictDialog：空因 → 单补丁拒绝留场（rpc 零调用 + onDone 零调用）', async () => {
    const patches: VerdictDialogPatch[] = []
    let rpcCalls = 0
    let done = 0
    await confirmVerdictDialog(
      { toStatus: 'accepted', supersededBy: undefined, reason: '  ', error: undefined, submitting: false },
      {
        projectId: 'p-1',
        proposal: view(),
        makeClient: () => clientWith(async () => { rpcCalls += 1; return {} }),
        onDone: () => { done += 1 },
        onPatch: (p) => { patches.push(p) },
      },
    )
    expect(patches).toEqual([{ error: { kind: 'reason-required' } }])
    expect(rpcCalls).toBe(0)
    expect(done).toBe(0)
  })

  it('confirmVerdictDialog：通过 → 提交中补丁 → onDone + 清错态；补丁恒不含 toStatus/reason（留场结构性成立）', async () => {
    const patches: VerdictDialogPatch[] = []
    const result = { proposalId: 'pr-1', proposalStatus: 'accepted', chained: { featureId: 'f-1' } }
    await confirmVerdictDialog(
      { toStatus: 'accepted', supersededBy: undefined, reason: '证据充分', error: undefined, submitting: false },
      {
        projectId: 'p-1',
        proposal: view(),
        makeClient: () => clientWith(async () => result),
        onDone: (r) => { expect(r).toEqual(result) },
        onPatch: (p) => { patches.push(p) },
      },
    )
    expect(patches).toEqual([{ error: undefined, submitting: true }, { error: undefined, submitting: false }])
    for (const patch of patches) {
      expect('toStatus' in patch).toBe(false)
      expect('reason' in patch).toBe(false)
    }
  })

  it('confirmVerdictDialog：rpc 失败 → 错误留场 + submitting 复位；提交中重复确认 = no-op', async () => {
    const patches: VerdictDialogPatch[] = []
    await confirmVerdictDialog(
      { toStatus: 'accepted', supersededBy: undefined, reason: 'x', error: undefined, submitting: true },
      {
        projectId: 'p-1',
        proposal: view(),
        makeClient: () => { throw new Error('makeClient 不应被调用（submitting 守卫）') },
        onDone: () => { throw new Error('onDone 不应被调用') },
        onPatch: (p) => { patches.push(p) },
      },
    )
    expect(patches).toEqual([]) // 提交中 no-op（单飞守卫）

    const patches2: VerdictDialogPatch[] = []
    await confirmVerdictDialog(
      { toStatus: 'accepted', supersededBy: undefined, reason: 'x', error: undefined, submitting: false },
      {
        projectId: 'p-1',
        proposal: view(),
        makeClient: () =>
          clientWith(async () => { throw new RpcClientError({ code: 'ERR_FEATURE_EXISTS', message: 'slug 冲突' }) }),
        onDone: () => { throw new Error('onDone 不应被调用') },
        onPatch: (p) => { patches2.push(p) },
      },
    )
    expect(patches2).toEqual([
      { error: undefined, submitting: true },
      { error: { kind: 'rpc', message: 'slug 冲突' }, submitting: false },
    ])
  })
})
