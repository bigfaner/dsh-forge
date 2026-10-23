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
  selectAgentPreset: (sessionId: string, preset: string) => Promise<unknown>
  listAgentPresets: () => Promise<{ presets: readonly unknown[] }>
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
    selectAgentPreset: vi.fn(async (_sessionId: string, _preset: string): Promise<unknown> => ({})),
    listAgentPresets: vi.fn(async (): Promise<{ presets: readonly unknown[] }> => ({ presets: [] })),
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
    api: { createSession: h.createSession, prompt: h.prompt, selectAgentPreset: h.selectAgentPreset, listAgentPresets: h.listAgentPresets },
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

  it('bug 488e860d：detached/bare 行（branch=null）剔行——预铸挂靠契约一 worktree 一分支，不可挂靠行不可选', () => {
    const list = coerceWorktreeList({
      isGit: true,
      entries: [
        { path: 'Z:/proj', branch: 'main', worktreeName: 'proj', isMain: true, detached: false, bare: false },
        { path: 'Z:\\tmp', branch: null, worktreeName: 'tmp', isMain: false, detached: true, bare: false },
        { path: 'Z:/bare', branch: null, worktreeName: 'bare', isMain: false, detached: false, bare: true },
      ],
    })
    expect(list.rows.map((row) => row.path)).toEqual(['Z:/proj'])
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

  it('bug 488e860d：非 git 项目 gitReady=false（worktree chip 隐藏判据）；发送零透传径全走官方面', async () => {
    const { deps, h } = makeDeps()
    const controller = createHeroController(deps)
    await controller.load()
    // listPayload isGit:true——换非 git 清单重载
    h.rpcCalls.length = 0
    deps.rpc.call = async <T>(channel: string): Promise<RpcResult<T>> => {
      h.rpcCalls.push([channel, {}])
      return { ok: true, data: { isGit: false, entries: [] } } as RpcResult<T>
    }
    await controller.load()
    expect(controller.state().gitReady).toBe(false)
    await controller.send('你好')
    expect(h.rpcCalls).toHaveLength(1) // 仅清单调用——零 session-create 透传
    expect(h.createSession).toHaveBeenCalledWith('ws-1')
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

  it('默认分支发送：直走官方面 session.create（零守卫调用）+ prompt（首条消息恒 queue——新会话 agent 必空闲）+ 进入会话', async () => {
    const { deps, h } = makeDeps()
    const controller = createHeroController(deps)
    await controller.load()
    await controller.send('你好')
    expect(h.createSession).toHaveBeenCalledWith('ws-1')
    expect(h.prompt).toHaveBeenCalledWith('s-ws-1', '你好', 'queue')
    expect(h.onOpenSession).toHaveBeenCalledWith('s-ws-1')
    expect(controller.state().busy).toBe(false)
    expect(h.rpcCalls).toHaveLength(1)
  })

  it('bug 16ac5bc2：workspaceId 缺席（隧道域）默认分支发送走 forge 单门（主树路径）——空 workspaceId 不直达官方面', async () => {
    const { deps, h } = makeDeps({ workspaceId: undefined })
    h.sessionCreateResult = { ok: true, data: { sessionId: 's-forge', branch: 'main' } }
    const controller = createHeroController(deps)
    await controller.load()
    await controller.send('你好')
    expect(h.createSession).not.toHaveBeenCalled()
    expect(h.rpcCalls).toContainEqual([HERO_SESSION_CREATE_CHANNEL, { worktreePath: 'Z:/proj' }])
    expect(h.prompt).toHaveBeenCalledWith('s-forge', '你好', 'queue')
    expect(h.onOpenSession).toHaveBeenCalledWith('s-forge')
  })

  it('bug 16ac5bc2：workspaceId 缺席且主树锚也缺席（projectRoot 无）= 发送失败解冻可重试（不再发空 workspaceId）', async () => {
    const { deps, h } = makeDeps({ workspaceId: undefined, projectRoot: undefined, currentWorktreePath: undefined })
    const controller = createHeroController(deps)
    await controller.load()
    await controller.send('你好')
    expect(h.createSession).not.toHaveBeenCalled()
    expect(controller.state().busy).toBe(false)
  })

  it('模式清单随 roster 动态增减（用户裁决 2026-10-22）：roster 追加 forge 双预设之后；broken 剔行；选 roster 模式 = agentPreset.select(id) 下发', async () => {
    const presetSelects: [string, string][] = []
    const { deps } = makeDeps({
      api: {
        createSession: async () => ({ sessionId: 's-x' }),
        prompt: async () => ({}),
        selectAgentPreset: async (sessionId, preset) => {
          presetSelects.push([sessionId, preset])
          return {}
        },
        listAgentPresets: async () => ({
          presets: [
            { id: 'standard', name: '标准模式' },
            { id: 'ptc', name: 'PTC 模式' },
            { id: 'minimal', name: '极简模式' },
            { id: 'cordis', name: '创造模式' },
            { id: 'custom-x', name: '我的预设' }, // 健康自定义预设——动态追加
            { id: 'bad', name: '坏预设', broken: '配置损坏' }, // broken 剔行
          ],
        }),
      },
    })
    const controller = createHeroController(deps)
    await controller.load()
    const modes = controller.state().modes
    expect(modes.slice(0, 2)).toEqual(['突击', '远征']) // forge 双预设恒前
    expect(modes).toContain('我的预设')
    expect(modes).not.toContain('坏预设')
    controller.pickMode('我的预设')
    await controller.send('hi')
    expect(presetSelects).toContainEqual(['s-x', 'custom-x']) // roster id 下发
  })

  it('roster 不可达（官方面缺席）= 回退内置四静态清单；内置模式经 BUILTIN 映射 select', async () => {
    const presetSelects: [string, string][] = []
    const { deps } = makeDeps({
      api: {
        createSession: async () => ({ sessionId: 's-y' }),
        prompt: async () => ({}),
        selectAgentPreset: async (sessionId, preset) => {
          presetSelects.push([sessionId, preset])
          return {}
        },
        listAgentPresets: async () => {
          throw new Error('403')
        },
      },
    })
    const controller = createHeroController(deps)
    await controller.load()
    expect(controller.state().modes).toEqual(['突击', '远征', '标准', 'PTC', '极简', '创造'])
    controller.pickMode('创造')
    await controller.send('hi')
    expect(presetSelects).toContainEqual(['s-y', 'cordis'])
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
    expect(h.prompt).toHaveBeenCalledWith('s-bound', '开工', 'queue')
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
    await new Promise((resolve) => setTimeout(resolve, 0))
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

  it('bug 53b5d685：首条 prompt 失败 = 错误态 + 文本回填草稿，不静默进入空会话', async () => {
    let promptFails = true
    const { deps, h } = makeDeps({
      api: {
        createSession: async (workspaceId: string) => h.createSession(workspaceId),
        prompt: async (...args: Parameters<typeof h.prompt>) => {
          if (promptFails) {
            promptFails = false
            throw new Error('prompt rejected')
          }
          return h.prompt(...args)
        },
        selectAgentPreset: async (...args: Parameters<typeof h.selectAgentPreset>) => h.selectAgentPreset(...args),
        listAgentPresets: async () => h.listAgentPresets(),
      },
    })
    const controller = createHeroController(deps)
    await controller.load()
    await controller.send('你好')
    expect(h.onOpenSession).not.toHaveBeenCalled() // 不进空会话
    expect(controller.state().busy).toBe(false)
    expect(controller.state().error).toContain('prompt rejected')
    expect(controller.state().draft).toBe('你好') // 文本退回 composer
    // 重试成功 = 错误清零
    await controller.send('你好')
    expect(h.onOpenSession).toHaveBeenCalled()
    expect(controller.state().error).toBeNull()
    expect(controller.state().draft).toBeNull()
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

  it('bug 38ab5a8d：新会话默认档暂存在场——建会话后 select-model 下发（含推理等级）+ 清除暂存', async () => {
    const selectModels: [string, string, string, string?][] = []
    const cleared: number[] = []
    const { deps, h } = makeDeps({
      api: {
        createSession: async (workspaceId: string) => h.createSession(workspaceId),
        prompt: async (...args: Parameters<typeof h.prompt>) => h.prompt(...args),
        selectAgentPreset: async (...args: Parameters<typeof h.selectAgentPreset>) => h.selectAgentPreset(...args),
        listAgentPresets: async () => h.listAgentPresets(),
        selectModel: async (sessionId, provider, model, reasoningEffort) => {
          selectModels.push([sessionId, provider, model, reasoningEffort])
          return {}
        },
      },
      modelDefault: {
        read: () => ({ provider: 'DeepSeek', id: 'deepseek-r1', name: 'DeepSeek-R1', reasoningEffort: 'low' }),
        clear: () => void cleared.push(1),
      },
    })
    const controller = createHeroController(deps)
    await controller.load()
    await controller.send('你好')
    expect(h.onOpenSession).toHaveBeenCalledWith('s-ws-1')
    expect(selectModels).toContainEqual(['s-ws-1', 'DeepSeek', 'deepseek-r1', 'low'])
    expect(cleared).toHaveLength(1)
  })

  it('bug 38ab5a8d：暂存缺席 = 零 select-model 调用（行为不变）', async () => {
    const selectModels: unknown[] = []
    const { deps } = makeDeps({
      api: {
        createSession: h_create(),
        prompt: async () => ({}),
        selectAgentPreset: async () => ({}),
        listAgentPresets: async () => ({ presets: [] }),
        selectModel: async (...args: unknown[]) => {
          selectModels.push(args)
          return {}
        },
      },
      modelDefault: { read: () => undefined, clear: () => {} },
    })
    const controller = createHeroController(deps)
    await controller.load()
    await controller.send('你好')
    expect(selectModels).toHaveLength(0)
  })

  function h_create(): (workspaceId: string) => Promise<{ sessionId: string }> {
    return async (workspaceId: string) => ({ sessionId: `s-${workspaceId || 'main'}` })
  }
})
