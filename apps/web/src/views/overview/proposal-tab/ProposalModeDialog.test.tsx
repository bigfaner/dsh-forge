// 模式更改对话框单测 —— 4.2 AC3：远征⇄突击二选（官方 SegmentedControl）+ 变更说明必填
// （空说明拒绝留场）+ 「既有任务按创建时模式照旧执行」快照不回溯一行明示。
// 渲染面 = renderToStaticMarkup 纯 Body（官方 Modal portal——静态不渲，开弹行为归 4.6/e2e）；
// 提交链 = confirmModeDialog 纯异步面（proposals.setMode 唯一通道——律三唯一正门）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RpcClientError } from '../../../rpc/errors.js'
import type { ForgeRpcClient } from '../../../rpc/index.js'
import {
  MODE_DIALOG_NOTE,
  MODE_DIALOG_OPTIONS,
  ProposalModeDialogBody,
  checkModeSubmit,
  confirmModeDialog,
  initialModeDialogState,
  modeDialogErrorMessage,
  submitProposalMode,
  type ModeDialogPatch,
  type ModeProposalView,
} from './ProposalModeDialog.js'

const NOOP = (): void => {}

function view(overrides: Partial<ModeProposalView> = {}): ModeProposalView {
  return { proposalId: 'pr-1', title: 'UI 打磨轮', mode: 'blitz', ...overrides }
}

describe('AC3 · 远征⇄突击二选 + 快照不回溯明示', () => {
  it('选项集恰二员：远征（完整 SDD）/ 突击（直达执行）', () => {
    expect(MODE_DIALOG_OPTIONS).toEqual([
      { value: 'expedition', label: '远征（完整 SDD）' },
      { value: 'blitz', label: '突击（直达执行）' },
    ])
  })

  it('Body：官方 SegmentedControl 二选（role=tablist + aria-selected 承载当前选择）+ 两选项标签', () => {
    const html = renderToStaticMarkup(
      ProposalModeDialogBody({
        proposal: view(),
        mode: 'blitz',
        reason: '',
        error: undefined,
        onEditMode: NOOP,
        onEditReason: NOOP,
      }),
    )
    expect(html).toContain('role="tablist"')
    expect(html).toContain('远征（完整 SDD）')
    expect(html).toContain('突击（直达执行）')
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1)
    const at = html.indexOf('id="dswf-ov-md-seg-blitz"')
    const blitzTab = html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at))
    expect(blitzTab).toContain('aria-selected="true"')
  })

  it('快照不回溯一行明示（「既有任务按创建时模式照旧执行」）', () => {
    expect(MODE_DIALOG_NOTE).toContain('既有任务按创建时模式照旧执行')
    const html = renderToStaticMarkup(
      ProposalModeDialogBody({
        proposal: view(),
        mode: 'blitz',
        reason: '',
        error: undefined,
        onEditMode: NOOP,
        onEditReason: NOOP,
      }),
    )
    expect(html).toContain('data-dswf-ov-md-note')
    expect(html).toContain('既有任务按创建时模式照旧执行')
    expect(html).toContain('快照不回溯')
  })
})

describe('AC3 · 变更说明必填（提交校验）', () => {
  const base = { projectId: 'p-1', proposal: view() }

  it('空说明 / 纯空白 → reason-required', () => {
    expect(checkModeSubmit({ ...base, mode: 'expedition', reason: '' })).toEqual({ ok: false, error: 'reason-required' })
    expect(checkModeSubmit({ ...base, mode: 'expedition', reason: ' \t ' })).toEqual({ ok: false, error: 'reason-required' })
  })

  it('通过 → 载荷 { projectId, proposalId, mode, reason }（SetProposalModeInput 形状——reason 入载荷：服务端 ERR_REASON_REQUIRED 先验同门）', () => {
    expect(checkModeSubmit({ ...base, mode: 'expedition', reason: '  目标膨胀，转完整 SDD  ' })).toEqual({
      ok: true,
      payload: { projectId: 'p-1', proposalId: 'pr-1', mode: 'expedition', reason: '目标膨胀，转完整 SDD' },
    })
  })

  it('错误文案两形 + rpc 形', () => {
    expect(modeDialogErrorMessage({ kind: 'reason-required' })).toContain('变更说明必填')
    expect(modeDialogErrorMessage({ kind: 'rpc', message: 'x' })).toContain('模式更改失败')
  })

  it('Body 留场相位：错误行 role=alert + 已选模式与已输内容保留', () => {
    const html = renderToStaticMarkup(
      ProposalModeDialogBody({
        proposal: view(),
        mode: 'expedition',
        reason: '   ',
        error: { kind: 'reason-required' },
        onEditMode: NOOP,
        onEditReason: NOOP,
      }),
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('data-dswf-ov-md-error="reason-required"')
    expect(html).toContain('变更说明必填')
    // 留场证物：模式选择仍指向 expedition + 说明域在场
    const at = html.indexOf('id="dswf-ov-md-seg-expedition"')
    const tab = html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at))
    expect(tab).toContain('aria-selected="true"')
    expect(html).toContain('data-dswf-ov-md-reason')
  })

  it('初始态：已选模式 = 当前模式（同值直出——确认前必经显式改选）', () => {
    expect(initialModeDialogState('blitz')).toEqual({ mode: 'blitz', reason: '', error: undefined, submitting: false })
  })
})

describe('提交链（proposals.setMode 唯一通道——律三唯一正门）', () => {
  function clientWith(setMode: (input: unknown) => Promise<unknown>): ForgeRpcClient {
    return {
      proposals: {
        list: async () => [],
        transition: async () => { throw new Error('transition 不应被调用') },
        setMode,
        listDocs: async () => [],
      },
    } as unknown as ForgeRpcClient
  }

  it('submitProposalMode：唯一通道 = proposals.setMode + 载荷原样；成功回传行', async () => {
    const payloads: unknown[] = []
    const row = { proposalId: 'pr-1', slug: 'ui-polish', title: 'UI 打磨轮', proposalStatus: 'under-review', mode: 'expedition', createdAt: 'x', updatedAt: 'y' }
    const client = clientWith(async (input) => { payloads.push(input); return row })
    const out = await submitProposalMode(client, { projectId: 'p-1', proposalId: 'pr-1', mode: 'expedition', reason: '转完整 SDD' })
    expect(out).toEqual({ ok: true, row })
    expect(payloads).toEqual([{ projectId: 'p-1', proposalId: 'pr-1', mode: 'expedition', reason: '转完整 SDD' }])
  })

  it('submitProposalMode：RpcClientError → message + uiState；非 Rpc 错误兜底', async () => {
    const client = clientWith(async () => { throw new RpcClientError({ code: 'ERR_REASON_REQUIRED', message: '需要 reason' }) })
    const out = await submitProposalMode(client, { projectId: 'p-1', proposalId: 'pr-1', mode: 'blitz', reason: 'r' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error.message).toBe('需要 reason')

    const raw = clientWith(async () => { throw new Error('boom') })
    const out2 = await submitProposalMode(raw, { projectId: 'p-1', proposalId: 'pr-1', mode: 'blitz', reason: 'r' })
    expect(out2.ok).toBe(false)
    if (!out2.ok) expect(out2.error.message).toBe('boom')
  })

  it('confirmModeDialog：空说明 → 单补丁拒绝留场（rpc 零调用）；补丁恒不含 mode/reason', async () => {
    const patches: ModeDialogPatch[] = []
    let rpcCalls = 0
    await confirmModeDialog(
      { mode: 'expedition', reason: ' ', error: undefined, submitting: false },
      {
        projectId: 'p-1',
        proposal: view(),
        makeClient: () => clientWith(async () => { rpcCalls += 1; return {} }),
        onDone: () => { throw new Error('onDone 不应被调用') },
        onPatch: (p) => { patches.push(p) },
      },
    )
    expect(patches).toEqual([{ error: { kind: 'reason-required' } }])
    expect(rpcCalls).toBe(0)
    for (const patch of patches) {
      expect('mode' in patch).toBe(false)
      expect('reason' in patch).toBe(false)
    }
  })

  it('confirmModeDialog：通过 → 提交中补丁 → onDone + 清错态；rpc 失败 → 错误留场；提交中 no-op', async () => {
    const row = { proposalId: 'pr-1', mode: 'expedition' }
    const patches: ModeDialogPatch[] = []
    await confirmModeDialog(
      { mode: 'expedition', reason: '转完整 SDD', error: undefined, submitting: false },
      {
        projectId: 'p-1',
        proposal: view(),
        makeClient: () => clientWith(async () => row),
        onDone: (r) => { expect(r).toEqual(row) },
        onPatch: (p) => { patches.push(p) },
      },
    )
    expect(patches).toEqual([{ error: undefined, submitting: true }, { error: undefined, submitting: false }])

    const patches2: ModeDialogPatch[] = []
    await confirmModeDialog(
      { mode: 'expedition', reason: '转完整 SDD', error: undefined, submitting: true },
      {
        projectId: 'p-1',
        proposal: view(),
        makeClient: () => { throw new Error('makeClient 不应被调用（submitting 守卫）') },
        onDone: () => { throw new Error('onDone 不应被调用') },
        onPatch: (p) => { patches2.push(p) },
      },
    )
    expect(patches2).toEqual([])

    const patches3: ModeDialogPatch[] = []
    await confirmModeDialog(
      { mode: 'expedition', reason: 'x', error: undefined, submitting: false },
      {
        projectId: 'p-1',
        proposal: view(),
        makeClient: () =>
          clientWith(async () => { throw new RpcClientError({ code: 'ERR_PROPOSAL_NOT_FOUND', message: '提案未命中' }) }),
        onDone: () => { throw new Error('onDone 不应被调用') },
        onPatch: (p) => { patches3.push(p) },
      },
    )
    expect(patches3).toEqual([
      { error: undefined, submitting: true },
      { error: { kind: 'rpc', message: '提案未命中' }, submitting: false },
    ])
  })
})
