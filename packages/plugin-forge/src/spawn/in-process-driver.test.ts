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
import type { WorkerTreeGuard } from './job-tree.js'

/** 守卫桩工厂（reclaim 调用计数——改进 4 终态可达断言） */
function guardSpy() {
  const reclaims: number[] = []
  const guard: WorkerTreeGuard = {
    keeperPid: 4242,
    whenReady: Promise.resolve(),
    exclude: () => {},
    reclaim: async () => {
      reclaims.push(Date.now())
      return true
    },
  }
  return { guard, reclaims, factory: () => guard }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** 官方 SubagentRun 桩（真形状子集——id/localAgent（子 session header）/result/dispose） */
function runStub(over: Partial<{ id: string; stopReason: string; output: { type: 'text'; text: string }[] }> = {}) {
  return {
    id: over.id ?? 'worker-session-7',
    localAgent: { session: { header: { id: over.id ?? 'worker-session-7', createdAt: 1_760_000_000_000 } } },
    result: Promise.resolve({
      output: over.output ?? [{ type: 'text', text: 'worker final answer' }],
      stopReason: over.stopReason ?? 'completed',
    }),
    dispose: vi.fn(async () => {}),
  }
}

/** 派发父会话桩（session.append 可断言——catalog 目录事实落点） */
function parentStub(over: Record<string, unknown> = {}) {
  return { session: { id: 'dispatch-1', append: vi.fn(), ...over } }
}

describe('createInProcessDriverSpawn（适配契约——驱动器桩化）', () => {
  it('请求映射：prompt 文本块 / parent+signal 透传 / toolFilter deny 展开 / agentOptions 携带 / one-shot descriptor v3', async () => {
    const spawn = createInProcessDriverSpawn()
    const parent = parentStub()
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
    expect(request.signal).not.toBe(signal) // 中继解耦（bug 修复）——驱动器不直挂调用方 signal
    expect((request.signal as AbortSignal).aborted).toBe(false)
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
      parent: parentStub(),
      signal: new AbortController().signal,
      toolFilter: { deny: [] },
      label: 'a/1',
    })
    const [request] = startInProcessRun.mock.calls[0] as [Record<string, unknown>]
    expect('agentOptions' in request).toBe(false)
  })

  it('persona 透传（S2 分层承载）：persona 在场 = 请求携带原文；缺席 = 请求不携带键', async () => {
    const spawn = createInProcessDriverSpawn()
    startInProcessRun.mockResolvedValueOnce(runStub())
    await spawn({
      prompt: 'P',
      parent: parentStub(),
      signal: new AbortController().signal,
      toolFilter: { deny: [] },
      persona: '你是质量门守卫：只认全绿证据。',
    })
    const [request] = startInProcessRun.mock.calls[0] as [Record<string, unknown>]
    expect(request.persona).toBe('你是质量门守卫：只认全绿证据。')
    startInProcessRun.mockResolvedValueOnce(runStub())
    await spawn({ prompt: 'P', parent: parentStub(), signal: new AbortController().signal, toolFilter: { deny: [] } })
    const [request2] = startInProcessRun.mock.calls[1] as [Record<string, unknown>]
    expect('persona' in request2).toBe(false)
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
    const handle = await spawn({ prompt: 'P', parent: parentStub(), signal: new AbortController().signal, toolFilter: { deny: [] } })
    const result = await handle.result
    expect(result).toEqual({ stopReason: 'max-tokens', output: 'part one\npart two' })
    await handle.dispose()
    expect(run.dispose).toHaveBeenCalledTimes(1)
  })

  it('bug: abort 送达已处置的子代理时，cancel 抛错不得炸穿宿主（ctrl+r 刷新白屏——uncaught fatal）', async () => {
    const spawn = createInProcessDriverSpawn()
    const upstream = new AbortController()
    // 桩复刻上游真行为（child.cancel → inbox.clear → projection 已注销时抛错——线上
    // 同款报错原文）：abort 后转发直调 localAgent.cancel，抛错必须被缝内就地吞掉
    const run = runStub()
    ;(run as { localAgent?: unknown }).localAgent = {
      session: { header: { id: 'worker-session-7', createdAt: 1_760_000_000_000 } },
      cancel: () => {
        throw new Error(`agent "182ae054" cannot read inbox state: its projection registration is not active`)
      },
    }
    startInProcessRun.mockResolvedValueOnce(run)
    await spawn({ prompt: 'P', parent: parentStub(), signal: upstream.signal, toolFilter: { deny: [] } })
    expect(() => upstream.abort('refresh')).not.toThrow()
    // abort 已送达（cancel 被调用过且抛错被吞）——再 abort 幂等无操作
    expect(() => upstream.abort('refresh-again')).not.toThrow()
  })

  it('abort 转发：上游 signal abort → 直调 localAgent.cancel（正常取消路径不回退）；驱动器信号永不 abort', async () => {
    const spawn = createInProcessDriverSpawn()
    const upstream = new AbortController()
    let driverSignal: AbortSignal | undefined
    const cancel = vi.fn()
    let settle!: (r: { output: { type: 'text'; text: string }[]; stopReason: string }) => void
    startInProcessRun.mockImplementationOnce(async (request: { signal: AbortSignal }) => {
      driverSignal = request.signal
      // 受控结算：result 挂起，测试在 abort 之后才 settle——映射在结算时读 cancelled（真时序）
      const run = {
        id: 'worker-session-7',
        result: new Promise<{ output: { type: 'text'; text: string }[]; stopReason: string }>((resolve) => {
          settle = resolve
        }),
        dispose: async () => {},
        localAgent: { session: { header: { id: 'worker-session-7', createdAt: 1_760_000_000_000 } }, cancel },
      }
      return run
    })
    const handle = await spawn({ prompt: 'P', parent: parentStub(), signal: upstream.signal, toolFilter: { deny: [] } })
    expect(driverSignal).toBeDefined()
    expect(driverSignal!.aborted).toBe(false)
    upstream.abort()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith({ kind: 'parent' })
    expect(driverSignal!.aborted).toBe(false) // 中继信号永不 abort（驱动器监听器不再有炸点）
    settle({ output: [{ type: 'text', text: 'worker final answer' }], stopReason: 'max-tokens' })
    expect((await handle.result).stopReason).toBe('aborted') // cancelled → 'aborted' 缝内投影
  })

  it('驱动器 start 拒绝 = spawn 拒绝面（dispatchTask ERR_SPAWN_FAILED 防线承接）', async () => {
    const spawn = createInProcessDriverSpawn()
    startInProcessRun.mockRejectedValueOnce(new Error('agent factory rejected'))
    await expect(
      spawn({ prompt: 'P', parent: parentStub(), signal: new AbortController().signal, toolFilter: { deny: [] } }),
    ).rejects.toThrow(/agent factory rejected/)
  })
})

describe('cwd 钉定核销（1.14 判例修复——worker 会话未钉定 worktree、提交落 main）', () => {
  const PIN = 'Z:\\project\\dsh\\dsh-forge\\.forge\\worktrees\\feat-x'

  it('parent 会话 cwd = 钉定检出（含路径拼写变体归一）→ spawn 照常，请求不含 cwd 键（上游无覆盖位）', async () => {
    const spawn = createInProcessDriverSpawn()
    startInProcessRun.mockResolvedValueOnce(runStub())
    const handle = await spawn({
      prompt: 'P',
      parent: parentStub({ header: { cwd: PIN } }),
      signal: new AbortController().signal,
      toolFilter: { deny: [] },
      workspaceCwd: PIN.replaceAll('\\', '/'),
    })
    expect(handle.workerSessionId).toBe('worker-session-7')
    const [request] = startInProcessRun.mock.calls.at(-1) as [Record<string, unknown>]
    expect('workspaceCwd' in request).toBe(false) // 官方 SubagentStartRequest 无 cwd 覆盖位——不外泄
  })

  it('parent 会话 cwd ≠ 钉定检出（主检出发起形态）→ spawn 拒绝并自解释（上游零触达）', async () => {
    const spawn = createInProcessDriverSpawn()
    await expect(
      spawn({
        prompt: 'P',
        parent: parentStub({ header: { cwd: 'Z:\\project\\dsh\\dsh-forge' } }),
        signal: new AbortController().signal,
        toolFilter: { deny: [] },
        workspaceCwd: PIN,
      }),
    ).rejects.toThrow(/\[spawn-cwd-pin\].*重新发起循环/)
    expect(startInProcessRun).not.toHaveBeenCalled()
  })

  it('parent 会话 cwd 不可读 → spawn 拒绝（不依赖 spawn 时点环境 cwd 的判据面）', async () => {
    const spawn = createInProcessDriverSpawn()
    await expect(
      spawn({ prompt: 'P', parent: parentStub(), signal: new AbortController().signal, toolFilter: { deny: [] }, workspaceCwd: PIN }),
    ).rejects.toThrow(/\[spawn-cwd-pin\].*不可读/)
    expect(startInProcessRun).not.toHaveBeenCalled()
  })

  it('workspaceCwd 缺席（工具壳径）= 不核销，行为零变化', async () => {
    const spawn = createInProcessDriverSpawn()
    startInProcessRun.mockResolvedValueOnce(runStub())
    const handle = await spawn({ prompt: 'P', parent: parentStub(), signal: new AbortController().signal, toolFilter: { deny: [] } })
    expect(handle.workerSessionId).toBe('worker-session-7')
  })
})

describe('进程树守卫接线（改进 4——清理路径全部终态可达）', () => {
  const requestOf = () => ({ prompt: 'P', parent: parentStub(), signal: new AbortController().signal, toolFilter: { deny: [] } })

  it('result 终态（completed）→ reclaim 可达', async () => {
    const { reclaims, factory } = guardSpy()
    const spawn = createInProcessDriverSpawn({ treeGuard: factory })
    startInProcessRun.mockResolvedValueOnce(runStub())
    const handle = await spawn(requestOf())
    await handle.result
    await flush()
    expect(reclaims.length).toBeGreaterThanOrEqual(1)
  })

  it('result 异常拒绝（异常终止）→ reclaim 可达', async () => {
    const { reclaims, factory } = guardSpy()
    const spawn = createInProcessDriverSpawn({ treeGuard: factory })
    startInProcessRun.mockResolvedValueOnce({ ...runStub(), result: Promise.reject(new Error('worker crashed')) })
    const handle = await spawn(requestOf())
    await expect(handle.result).rejects.toThrow(/worker crashed/)
    await flush()
    expect(reclaims.length).toBeGreaterThanOrEqual(1)
  })

  it('dispose（终态前置收尾）→ reclaim 可达', async () => {
    const { reclaims, factory } = guardSpy()
    const spawn = createInProcessDriverSpawn({ treeGuard: factory })
    const run = runStub()
    startInProcessRun.mockResolvedValueOnce(run)
    const handle = await spawn(requestOf())
    await handle.dispose()
    await flush()
    expect(reclaims.length).toBeGreaterThanOrEqual(1)
    expect(run.dispose).toHaveBeenCalledTimes(1)
  })

  it('start 失败径 → reclaim 可达 + 拒绝照旧上抛', async () => {
    const { reclaims, factory } = guardSpy()
    const spawn = createInProcessDriverSpawn({ treeGuard: factory })
    startInProcessRun.mockRejectedValueOnce(new Error('agent factory rejected'))
    await expect(spawn(requestOf())).rejects.toThrow(/agent factory rejected/)
    await flush()
    expect(reclaims.length).toBe(1)
  })
})

describe('subagent/catalog 目录事实（官方 establishCatalogChild 同式——父会话日志落点）', () => {
  const requestOf = (parent: unknown) => ({ prompt: 'P', parent, signal: new AbortController().signal, toolFilter: { deny: [] } })

  it('spawn 发布后向父会话追加 one-shot catalog 事件（version 0 / childId / childCreatedAt / label）', async () => {
    const spawn = createInProcessDriverSpawn()
    const parent = parentStub()
    startInProcessRun.mockResolvedValueOnce(runStub({ id: 'worker-9' }))
    await spawn(requestOf(parent))
    expect(parent.session.append).toHaveBeenCalledTimes(1)
    expect(parent.session.append).toHaveBeenCalledWith('subagent/catalog', {
      version: 0,
      childId: 'worker-9',
      childCreatedAt: 1_760_000_000_000,
      mode: 'one-shot',
      // label 缺席 = 不携带键（官方 one-shot 分支同式）
    })
  })

  it('label 在场 = 事件携带 label 键', async () => {
    const spawn = createInProcessDriverSpawn()
    const parent = parentStub()
    startInProcessRun.mockResolvedValueOnce(runStub())
    await spawn({ ...requestOf(parent), label: 'feat-x/2.5' })
    expect(parent.session.append).toHaveBeenCalledWith('subagent/catalog', {
      version: 0,
      childId: 'worker-session-7',
      childCreatedAt: 1_760_000_000_000,
      mode: 'one-shot',
      label: 'feat-x/2.5',
    })
  })

  it('追加失败 = 官方同语义处置：dispose 该 run + reclaim + spawn 拒绝（catalog 错误上抛）', async () => {
    const { reclaims, factory } = guardSpy()
    const spawn = createInProcessDriverSpawn({ treeGuard: factory })
    const parent = parentStub()
    parent.session.append.mockImplementation(() => {
      throw new Error('session log sealed')
    })
    const run = runStub()
    startInProcessRun.mockResolvedValueOnce(run)
    await expect(spawn(requestOf(parent))).rejects.toThrow(/session log sealed/)
    expect(run.dispose).toHaveBeenCalledTimes(1)
    await flush()
    expect(reclaims.length).toBe(1)
  })

  it('子会话 header.createdAt 不可读 = 拒绝追加（目录事实缺 childCreatedAt 会拒还原——不落半截事实）', async () => {
    const spawn = createInProcessDriverSpawn()
    const parent = parentStub()
    const run = runStub()
    ;(run.localAgent as { session: { header: unknown } }).session = { header: {} }
    startInProcessRun.mockResolvedValueOnce(run)
    await expect(spawn(requestOf(parent))).rejects.toThrow(/\[spawn-catalog\].*childCreatedAt/)
    expect(parent.session.append).not.toHaveBeenCalled()
    expect(run.dispose).toHaveBeenCalledTimes(1)
  })
})
