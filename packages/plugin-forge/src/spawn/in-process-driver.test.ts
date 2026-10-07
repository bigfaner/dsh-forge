// 3.4 单测 —— in-process driver 真绑定适配器（spawn/in-process-driver.ts）：
// 上游驱动器经 vi.mock 桩化（真驱动器需要 dsh 宿主 agent 工厂——boot 冒烟/dogfood 联证），
// 本测试锁适配契约：SpawnWorkerRequest → startInProcessRun 请求映射（prompt 文本块 /
// parent/signal 透传 / toolFilter deny 展开 / agentOptions 条件携带 / one-shot descriptor
// version 3 + provider 'forge-dispatch' + label）+ run → 句柄映射（id=workerSessionId /
// result stopReason+output 文本投影 / dispose 委托）。驱动器缺席（动态 import 拒绝）=
// spawn 拒绝面（ERR_SPAWN_FAILED 由 dispatchTask 防线承接——缺席形态联证）。
import { describe, expect, it, vi } from 'vitest'

const startInProcessRun = vi.fn()

vi.mock('@deepseek-ai/dsh-subagent-in-process-driver', () => ({
  startInProcessRun: (...args: unknown[]) => startInProcessRun(...(args as [])),
}))

import { createInProcessDriverSpawn } from './in-process-driver.js'

/** 官方 SubagentRun 桩（真形状子集——id/result/dispose） */
function runStub(over: Partial<{ id: string; stopReason: string; output: { type: 'text'; text: string }[] }> = {}) {
  return {
    id: over.id ?? 'worker-session-7',
    result: Promise.resolve({
      output: over.output ?? [{ type: 'text', text: 'worker final answer' }],
      stopReason: over.stopReason ?? 'completed',
    }),
    dispose: vi.fn(async () => {}),
  }
}

describe('createInProcessDriverSpawn（适配契约——驱动器桩化）', () => {
  it('请求映射：prompt 文本块 / parent+signal 透传 / toolFilter deny 展开 / agentOptions 携带 / one-shot descriptor v3', async () => {
    const spawn = createInProcessDriverSpawn()
    const parent = { session: { id: 'dispatch-1' } }
    const signal = new AbortController().signal
    startInProcessRun.mockResolvedValueOnce(runStub())
    const handle = await spawn({
      prompt: 'BRIEFING FULL TEXT',
      parent,
      signal,
      toolFilter: { deny: ['ask-user', 'queryTask'] },
      agentOptions: { provider: 'deepseek', model: 'reasoner', reasoningEffort: 'high' },
      label: 'feat-x/2.5',
    })
    expect(handle.workerSessionId).toBe('worker-session-7')
    expect(startInProcessRun).toHaveBeenCalledTimes(1)
    const [request, options] = startInProcessRun.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(options).toEqual({})
    expect(request.prompt).toEqual([{ type: 'text', text: 'BRIEFING FULL TEXT' }])
    expect(request.parent).toBe(parent)
    expect(request.signal).toBe(signal)
    expect(request.label).toBe('feat-x/2.5')
    expect(request.toolFilter).toEqual({ deny: ['ask-user', 'queryTask'] })
    expect(request.agentOptions).toEqual({ provider: 'deepseek', model: 'reasoner', reasoningEffort: 'high' })
    expect(request.descriptor).toEqual({
      version: 3,
      mode: 'one-shot',
      provider: 'forge-dispatch',
      label: 'feat-x/2.5',
    })
  })

  it('agentOptions 缺席 = 请求不携带键（回退父会话继承——直传 undefined 会被上游视为显式覆盖）', async () => {
    const spawn = createInProcessDriverSpawn()
    startInProcessRun.mockResolvedValueOnce(runStub())
    await spawn({
      prompt: 'P',
      parent: {},
      signal: new AbortController().signal,
      toolFilter: { deny: [] },
      label: 'a/1',
    })
    const [request] = startInProcessRun.mock.calls[0] as [Record<string, unknown>]
    expect('agentOptions' in request).toBe(false)
  })

  it('result 映射：stopReason 平移 + output text 块拼接（非 text 块跳过）；dispose 委托 run.dispose', async () => {
    const spawn = createInProcessDriverSpawn()
    const run = runStub({
      stopReason: 'max-tokens',
      output: [
        { type: 'text', text: 'part one' },
        { type: 'image', url: 'x' } as unknown as { type: 'text'; text: string },
        { type: 'text', text: 'part two' },
      ],
    })
    startInProcessRun.mockResolvedValueOnce(run)
    const handle = await spawn({ prompt: 'P', parent: {}, signal: new AbortController().signal, toolFilter: { deny: [] } })
    const result = await handle.result
    expect(result).toEqual({ stopReason: 'max-tokens', output: 'part one\npart two' })
    await handle.dispose()
    expect(run.dispose).toHaveBeenCalledTimes(1)
  })

  it('驱动器 start 拒绝 = spawn 拒绝面（dispatchTask ERR_SPAWN_FAILED 防线承接）', async () => {
    const spawn = createInProcessDriverSpawn()
    startInProcessRun.mockRejectedValueOnce(new Error('agent factory rejected'))
    await expect(
      spawn({ prompt: 'P', parent: {}, signal: new AbortController().signal, toolFilter: { deny: [] } }),
    ).rejects.toThrow(/agent factory rejected/)
  })
})
