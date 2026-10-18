import { describe, expect, it, vi } from 'vitest'
import {
  coerceWorktreeList,
  composerWorktreeLabel,
  createHeroController,
  HERO_SESSION_CREATE_CHANNEL,
  HERO_WORKTREE_LIST_CHANNEL,
  needsWorktreeBinding,
  pickDefaultRow,
  promptModeOf,
  rowHintText,
  type HeroDeps,
} from './hero.ts'
import type { RpcResult } from '../core/rpc.ts'

const listPayload = {
  isGit: true,
  entries: [
    { path: 'Z:/proj', branch: 'main', worktreeName: 'proj', isMain: true },
    { path: 'Z:/wt/fix', branch: 'fix/mobile-rpc', worktreeName: 'wt-fix' },
    { path: 'Z:/wt/feat', branch: 'feat/pin-durable', worktreeName: 'wt-feat' },
    { path: '', branch: 'main' },
  ],
}

interface Harness {
  rpcCalls: [string, unknown][]
  createSession: (workspaceId: string) => Promise<{ sessionId: string }>
  prompt: (sessionId: string, text: string, mode: 'steer' | 'queue') => Promise<unknown>
  onOpenSession: (sessionId: string) => void
  changes: number
  /** session-create 通道回执（可改写——成功径用例注入 ok 载荷）。 */
  sessionCreateResult: RpcResult<unknown>
}

function makeDeps(overrides: Partial<HeroDeps> = {}): { deps: HeroDeps; h: Harness } {
  const h: Harness = {
    rpcCalls: [],
    createSession: vi.fn(async (workspaceId: string): Promise<{ sessionId: string }> => {
      if (workspaceId === 'fail') throw new Error('boom')
      return { sessionId: `s-${workspaceId || 'main'}` }
    }),
    prompt: vi.fn(async (_sessionId: string, _text: string, _mode: 'steer' | 'queue'): Promise<unknown> => ({})),
    onOpenSession: vi.fn((_sessionId: string): void => {}),
    changes: 0,
    sessionCreateResult: { ok: false, error: { code: 'invalid-state', reason: 'worktree 不在场' } },
  }
  const deps: HeroDeps = {
    rpc: {
      call: async <T>(channel: string, payload: unknown): Promise<RpcResult<T>> => {
        h.rpcCalls.push([channel, payload])
        if (channel === HERO_WORKTREE_LIST_CHANNEL) return { ok: true, data: listPayload } as RpcResult<T>
        return h.sessionCreateResult as RpcResult<T>
      },
    },
    api: { createSession: h.createSession, prompt: h.prompt },
    projectRoot: 'Z:/proj',
    currentBranch: 'main',
    currentWorktreePath: 'Z:/proj',
    workspaceId: 'ws-1',
    onOpenSession: h.onOpenSession,
    onChange: () => {
      h.changes += 1
    },
    ...overrides,
  }
  return { deps, h }
}

describe('清单收敛 + 行派生（纯函数）', () => {
  it('coerceWorktreeList：isGit 收敛 + 缺 path 剔行 + 空 payload fail-soft', () => {
    const list = coerceWorktreeList(listPayload)
    expect(list.isGit).toBe(true)
    expect(list.rows).toHaveLength(3)
    expect(coerceWorktreeList(null)).toEqual({ isGit: false, rows: [] })
    expect(coerceWorktreeList({}).rows).toHaveLength(0)
  })

  it('pickDefaultRow：当前分支命中优先，未命中回退主行，空集 null（不强切）', () => {
    const rows = coerceWorktreeList(listPayload).rows
    expect(pickDefaultRow(rows, 'main')?.path).toBe('Z:/proj')
    expect(pickDefaultRow(rows, 'FIX/MOBILE-RPC')?.path).toBe('Z:/wt/fix')
    expect(pickDefaultRow(rows, undefined)?.path).toBe('Z:/proj')
    expect(pickDefaultRow([], 'main')).toBeNull()
  })

  it('rowHintText / composerWorktreeLabel：默认行与复用行文案', () => {
    const rows = coerceWorktreeList(listPayload).rows
    const defaultRow = pickDefaultRow(rows, 'main')
    expect(rowHintText(rows[0]!, defaultRow)).toBe('当前所在分支 · 主 worktree（默认）')
    expect(rowHintText(rows[1]!, defaultRow)).toBe('复用已有 worktree')
    expect(composerWorktreeLabel(rows[0]!, defaultRow)).toBe('main · 当前所在分支')
    expect(composerWorktreeLabel(rows[1]!, defaultRow)).toBe('fix/mobile-rpc')
    expect(composerWorktreeLabel(null, defaultRow)).toBe('')
  })

  it('needsWorktreeBinding：主行 false；当前路径同行 false（斜杠归一）；他树 true', () => {
    const rows = coerceWorktreeList(listPayload).rows
    expect(needsWorktreeBinding(rows[0]!, 'Z:/proj')).toBe(false)
    expect(needsWorktreeBinding(rows[1]!, 'z:/wt/fix/')).toBe(false)
    expect(needsWorktreeBinding(rows[1]!, 'Z:/proj')).toBe(true)
    expect(needsWorktreeBinding(rows[1]!, undefined)).toBe(true)
    expect(needsWorktreeBinding(null, 'Z:/proj')).toBe(false)
  })

  it('promptModeOf：突击=steer、远征=queue、未知回退 steer', () => {
    expect(promptModeOf('突击')).toBe('steer')
    expect(promptModeOf('远征')).toBe('queue')
    expect(promptModeOf('其他')).toBe('steer')
  })
})

describe('hero 控制器（乐观切换 + 守卫回执确认框）', () => {
  it('load：清单收敛 + 默认模式=突击 + 默认选中=当前所在分支（不强切）', async () => {
    const { deps, h } = makeDeps()
    const controller = createHeroController(deps)
    await controller.load()
    const state = controller.state()
    expect(state.mode).toBe('突击')
    expect(state.rows).toHaveLength(3)
    expect(state.defaultRow?.path).toBe('Z:/proj')
    expect(state.selectedPath).toBe('Z:/proj')
    expect(h.rpcCalls).toEqual([[HERO_WORKTREE_LIST_CHANNEL, { projectRoot: 'Z:/proj' }]])
    expect(h.changes).toBe(1)
  })

  it('乐观切换：点选即改选中态（零建会话调用）；模式乐观切换 + 弹层开合 + reset 回默认', async () => {
    const { deps, h } = makeDeps()
    const controller = createHeroController(deps)
    await controller.load()
    controller.openPop('branch')
    expect(controller.state().pop).toBe('branch')
    controller.pickBranch('Z:/wt/fix')
    expect(controller.state().selectedPath).toBe('Z:/wt/fix')
    expect(controller.state().pop).toBeNull()
    expect(h.rpcCalls).toHaveLength(1) // 零建会话调用——乐观零网络
    controller.pickMode('远征')
    expect(controller.state().mode).toBe('远征')
    controller.pickMode('不存在')
    expect(controller.state().mode).toBe('远征')
    controller.reset()
    expect(controller.state().mode).toBe('突击')
    expect(controller.state().selectedPath).toBe('Z:/proj')
  })

  it('默认分支发送：直走官方面 session.create（零守卫调用）+ prompt（突击=steer）+ 进入会话', async () => {
    const { deps, h } = makeDeps()
    const controller = createHeroController(deps)
    await controller.load()
    await controller.send('你好')
    expect(h.createSession).toHaveBeenCalledWith('ws-1')
    expect(h.prompt).toHaveBeenCalledWith('s-ws-1', '你好', 'steer')
    expect(h.onOpenSession).toHaveBeenCalledWith('s-ws-1')
    expect(controller.state().busy).toBe(false)
    expect(h.rpcCalls).toHaveLength(1)
  })

  it('非默认 worktree 发送：session-create 透传（预铸采纳）成功直达会话', async () => {
    const { deps, h } = makeDeps()
    const controller = createHeroController(deps)
    await controller.load()
    controller.pickBranch('Z:/wt/feat')
    h.rpcCalls.length = 0
    h.sessionCreateResult = { ok: true, data: { sessionId: 's-bound', branch: 'feat/pin-durable' } }
    await controller.send('开工')
    expect(h.rpcCalls).toEqual([[HERO_SESSION_CREATE_CHANNEL, { worktreePath: 'Z:/wt/feat' }]])
    expect(h.prompt).toHaveBeenCalledWith('s-bound', '开工', 'steer')
    expect(h.onOpenSession).toHaveBeenCalledWith('s-bound')
  })

  it('守卫拒绝回执 → 确认框待决（busy 冻结、零预检文本语义）', async () => {
    const { deps } = makeDeps()
    const controller = createHeroController(deps)
    await controller.load()
    controller.pickBranch('Z:/wt/fix')
    await controller.send('开工')
    const state = controller.state()
    expect(state.pendingGuard?.reason).toBe('worktree 不在场')
    expect(state.busy).toBe(true)
    expect(state.selectedPath).toBe('Z:/wt/fix') // 乐观选中态保持——待用户裁决
  })

  it('守卫拒绝 → 选回：选中态回退默认行、不建会话、发送面解冻', async () => {
    const { deps, h } = makeDeps()
    const controller = createHeroController(deps)
    await controller.load()
    controller.pickBranch('Z:/wt/feat')
    await controller.send('开工')
    controller.resolveGuard('cancel')
    const state = controller.state()
    expect(state.pendingGuard).toBeNull()
    expect(state.selectedPath).toBe('Z:/proj')
    expect(state.busy).toBe(false)
    expect(h.createSession).not.toHaveBeenCalled()
    expect(h.onOpenSession).not.toHaveBeenCalled()
  })

  it('守卫拒绝 → 仍要切换：官方面 session.create 兜底（落主树）+ 进入会话', async () => {
    const { deps, h } = makeDeps()
    const controller = createHeroController(deps)
    await controller.load()
    controller.pickBranch('Z:/wt/fix')
    await controller.send('开工')
    controller.resolveGuard('confirm')
    await Promise.resolve()
    await Promise.resolve()
    expect(h.createSession).toHaveBeenCalledWith('ws-1')
    expect(h.onOpenSession).toHaveBeenCalledWith('s-ws-1')
    expect(controller.state().pendingGuard).toBeNull()
    expect(controller.state().busy).toBe(false)
  })

  it('官方面 createSession 失败：不进入会话、busy 解冻可重试', async () => {
    const { deps, h } = makeDeps({ workspaceId: 'fail' })
    const controller = createHeroController(deps)
    await controller.load()
    await controller.send('你好')
    expect(h.onOpenSession).not.toHaveBeenCalled()
    expect(controller.state().busy).toBe(false)
    expect(controller.state().pendingGuard).toBeNull()
  })

  it('守卫待决期间发送零重入；无清单（projectRoot 缺席）双径全走官方面', async () => {
    const { deps, h } = makeDeps({ projectRoot: undefined })
    const controller = createHeroController(deps)
    await controller.load()
    expect(controller.state().rows).toHaveLength(0)
    await controller.send('你好')
    expect(h.createSession).toHaveBeenCalledWith('ws-1')
    expect(h.onOpenSession).toHaveBeenCalledWith('s-ws-1')
  })
})
