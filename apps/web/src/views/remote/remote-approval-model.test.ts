// 远程审批动作模型单测（mobile-remote-approval 1.4）——动作转发（forge:remote/approval
// 通道信封归一：forwarded=true / unavailable / 非 ok / 传输抛错四径）+ 三态状态机
// （idle → submitting → success|error；提交冻结、成功复位、失败可重试——settings 五态口径同型）。
import { describe, expect, it } from 'vitest'
import { REMOTE_CHANNELS, type RemoteApprovalDecision } from '@dsh-forge/contracts'
import type { ForgeTransport } from '../../rpc/transport.js'
import {
  beginApproval,
  initialApprovalState,
  resolveApproval,
  resetApproval,
  runApprovalDecision,
  submitApprovalDecision,
  type ApprovalOutcome,
} from './remote-approval-model.js'

function transportOf(
  impl: (channel: string, payload?: unknown) => unknown,
): ForgeTransport {
  return async (channel, payload) => impl(channel, payload)
}

const ALLOW: RemoteApprovalDecision = 'allow'
const INPUT = { requestId: 't-1', decision: ALLOW } as const

describe('submitApprovalDecision 动作转发（forge:remote/approval 通道）', () => {
  it('正样例：通道名 = REMOTE_CHANNELS.approval 本尊；决策负载原样透传；forwarded=true → ok', async () => {
    const calls: { channel: string; payload?: unknown }[] = []
    const out = await submitApprovalDecision(
      transportOf((channel, payload) => {
        calls.push({ channel, payload })
        return { ok: true, data: { forwarded: true } }
      }),
      INPUT,
    )
    expect(calls).toEqual([{ channel: REMOTE_CHANNELS.approval, payload: INPUT }])
    expect(out).toEqual({ ok: true })
  })

  it('forwarded=false（官方审批面缺席 fail-soft）→ 不 ok + 缺席文案', async () => {
    const out = await submitApprovalDecision(transportOf(async () => ({ ok: true, data: { forwarded: false, reason: 'unavailable' } })), INPUT)
    expect(out.ok).toBe(false)
    expect(out.message).toContain('不可用')
  })

  it('非 ok 信封 → 不 ok + 信封错误文案归一', async () => {
    const out = await submitApprovalDecision(
      transportOf(async () => ({ ok: false, error: { code: 'X', message: '通道被拒' } })),
      INPUT,
    )
    expect(out.ok).toBe(false)
    expect(out.message).toContain('通道被拒')
  })

  it('传输面抛错 → 不 ok（message 归一，永不 reject）', async () => {
    const out = await submitApprovalDecision(
      transportOf(() => Promise.reject(new Error('未配对'))),
      INPUT,
    )
    expect(out.ok).toBe(false)
    expect(out.message).toContain('未配对')
  })
})

describe('runApprovalDecision 交互编排（成功 → onDecided 进度重 poll；失败 → 不回调）', () => {
  it('成功径：态序 submitting → success，onDecided 恰一次', async () => {
    const states: string[] = []
    let decided = 0
    await runApprovalDecision(transportOf(async () => ({ ok: true, data: { forwarded: true } })), 't-1', ALLOW, {
      onState: (s) => states.push(s.phase),
      onDecided: () => {
        decided += 1
      },
    })
    expect(states).toEqual(['submitting', 'success'])
    expect(decided).toBe(1)
  })

  it('失败径：态序 submitting → error（文案在场），onDecided 零回调（不重 poll）', async () => {
    const states: string[] = []
    let decided = 0
    await runApprovalDecision(transportOf(async () => ({ ok: true, data: { forwarded: false, reason: 'unavailable' } })), 't-1', 'reject', {
      onState: (s) => states.push(s.phase),
      onDecided: () => {
        decided += 1
      },
    })
    expect(states).toEqual(['submitting', 'error'])
    expect(decided).toBe(0)
  })
})

describe('三态状态机（idle → submitting → success|error；成功复位 / 失败可重试）', () => {
  it('初始 = idle 空态', () => {
    expect(initialApprovalState()).toEqual({ requestId: '', decision: null, phase: 'idle', message: null })
  })

  it('begin → submitting（提交冻结载荷 = requestId + decision 在场）', () => {
    const next = beginApproval(initialApprovalState(), 't-1', ALLOW)
    expect(next.phase).toBe('submitting')
    expect(next.requestId).toBe('t-1')
    expect(next.decision).toBe(ALLOW)
  })

  it('成功 → success（复位前闪示态；零错误文案）', () => {
    const next = resolveApproval(beginApproval(initialApprovalState(), 't-1', ALLOW), { ok: true })
    expect(next.phase).toBe('success')
    expect(next.message).toBeNull()
  })

  it('失败 → error + 错误文案（可重试：回到同状态机再 begin 即重发）', () => {
    const base = beginApproval(initialApprovalState(), 't-1', 'reject')
    const failed = resolveApproval(base, { ok: false, message: '审批通道不可用' })
    expect(failed.phase).toBe('error')
    expect(failed.message).toBe('审批通道不可用')
    const retried = beginApproval(failed, 't-1', ALLOW)
    expect(retried.phase).toBe('submitting')
  })

  it('成功复位 → idle（清载荷；成功回显后定时复位的组件径单源）', () => {
    const done = resolveApproval(beginApproval(initialApprovalState(), 't-1', ALLOW), { ok: true })
    expect(resetApproval(done)).toEqual(initialApprovalState())
  })

  it('畸形 outcome 兜底：非 ok 无 message = 通用失败文案（永无 undefined 文案外溢）', () => {
    const failed = resolveApproval(beginApproval(initialApprovalState(), 't-1', ALLOW), {
      ok: false,
    } as ApprovalOutcome)
    expect(failed.phase).toBe('error')
    expect(failed.message).toBeTruthy()
  })
})
