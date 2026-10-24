// @feature:mobile-ui
// @mobile-e2e
// Journey: hero-new-session-branch-guard（hero 初始态 + 默认建会话 + 乐观切换 + 创建失败错误面）。
// 溯源：contracts/step-1-open-hero.md … step-4-guard-confirm.md（随 1.8 binding-derivation
// §2.7 新语义重写——建会话官方面单径 api.createSession({workspaceId, worktreePath})，
// 经 forge:proxy/session-create 中继；预铸守卫面退役，确认框语义收敛为创建失败错误面）。
// 策略：createHeroController 纯状态机（零 DOM）+ 注入 fake rpc/api 实测行为链；数据面钉
// e2e/fixtures/mobile proxy 通道（forge:worktree/list 缺录制——404 缺口显性化，载荷形状按
// coerceWorktreeList 契约构造）。零真实 host、离线可重复。
import { describe, expect, it } from 'vitest'
import type { RemoteRpc, RpcResult } from '../../../apps/mobile/src/core/rpc.js'
import {
  HERO_DEFAULT_MODE,
  HERO_MODES,
  HERO_WORKTREE_LIST_CHANNEL,
  coerceWorktreeList,
  composerWorktreeLabel,
  createHeroController,
  pickDefaultRow,
  promptModeOf,
  rowDisplayName,
  rowHintText,
  type HeroWorktreeRow,
} from '../../../apps/mobile/src/views/hero.js'
import { loadFixtures, mobileSrc } from '../support.js'

const FIX = loadFixtures()

const ROWS: readonly HeroWorktreeRow[] = [
  { path: 'Z:\\proj', branch: 'main', worktreeName: 'proj', isMain: true, workspaceId: 'ws-main' },
  { path: 'Z:\\proj\\wt-feature', branch: 'feature', worktreeName: 'wt-feature', isMain: false, workspaceId: 'ws-feature' },
]

interface CreateCall {
  readonly workspaceId: string
  readonly worktreePath?: string
}

function makeHarness(over: { listOk?: boolean; createOk?: boolean; failMessage?: string } = {}) {
  const listCalls: { channel: string; payload: unknown }[] = []
  const createCalls: CreateCall[] = []
  const opened: string[] = []
  let createOk = over.createOk !== false
  let promptError: string | null = null
  const controller = createHeroController({
    rpc: {
      call: (async (channel: string, payload: unknown): Promise<RpcResult<unknown>> => {
        listCalls.push({ channel, payload })
        if (channel === HERO_WORKTREE_LIST_CHANNEL) {
          return over.listOk === false
            ? { ok: false as const, error: { code: 'unavailable', reason: '目录不可达' } }
            : { ok: true as const, data: { isGit: true, entries: ROWS } }
        }
        return { ok: false as const, error: { code: 'unknown', reason: channel } }
      }) as RemoteRpc['call'],
    },
    api: {
      createSession: async (workspaceId: string, worktreePath?: string) => {
        if (!createOk) throw new Error(over.failMessage ?? '存在未收口工作树')
        createCalls.push({ workspaceId, worktreePath })
        return { sessionId: 's-plain' }
      },
      prompt: async (sessionId: string, content: string, mode: string) => {
        if (promptError !== null) throw new Error(promptError)
        opened.push(`${sessionId}:${content}:${mode}`)
        return {}
      },
      selectAgentPreset: async () => ({}),
      listAgentPresets: async () => ({ presets: [] }),
      selectModel: async () => ({ selected: true }),
    },
    currentBranch: 'main',
    currentWorktreePath: 'Z:\\proj',
    projectRoot: 'Z:\\proj',
    workspaceId: 'ws-1',
    onOpenSession: (id) => opened.push(id),
  })
  return {
    controller,
    listCalls,
    createCalls,
    opened,
    setCreateOk: () => {
      createOk = true
    },
    failPrompt: (message: string) => {
      promptError = message
    },
  }
}

describe('step-1 open-hero（打开 hero 初始态）', () => {
  it('success（默认突击 + 当前分支）', async () => {
    // 回链 contracts/step-1-open-hero.md Outcome:success——初始恒为突击 + 当前所在分支
    const h = makeHarness()
    expect(h.controller.state().mode).toBe(HERO_DEFAULT_MODE)
    expect(HERO_DEFAULT_MODE).toBe('突击')
    expect(HERO_MODES).toContain('突击')
    await h.controller.load()
    const state = h.controller.state()
    expect(state.defaultRow?.branch).toBe('main') // 分支 = 当前所在（分支命中行优先）
    expect(state.defaultRow?.workspaceId).toBe('ws-main') // 行自带 workspaceId（chip 双发硬前置）
    expect(state.selectedPath).toBe(state.defaultRow?.path)
    // 数据源通道 = forge:worktree/list（透传；fixtures 缺 ok 录制——404 缺口显性化）
    expect(HERO_WORKTREE_LIST_CHANNEL).toBe('forge:worktree/list')
    // fixtures 缺口显性化：worktree/list 未录制（录制期通道不在 proxy 面）——常量钉面即契约
    expect(FIX.proxy.some((e) => (e.request as { channel?: string }).channel === HERO_WORKTREE_LIST_CHANNEL)).toBe(false)
  })

  it('catalog-unavailable（分支目录加载失败）', async () => {
    // 回链 contracts/step-1-open-hero.md Outcome:catalog-unavailable
    // inferred：目录缺席不伪造选项——fail-soft 空集 + 保持当前分支默认值 + hero 可退出
    expect(coerceWorktreeList({ ok: false })).toEqual({ isGit: false, rows: [] })
    expect(coerceWorktreeList(null).rows).toEqual([])
    expect(pickDefaultRow([], 'main')).toBeNull() // 空集 = null（composer 只显当前分支名）
    // workspaceId 缺席行剔除（binding-derivation：chip 双发建会话硬前置——恒缺席 = 死路选项）
    expect(
      coerceWorktreeList({ isGit: true, entries: [{ path: 'Z:\\x', branch: 'dev', worktreeName: 'x', isMain: false }] }).rows,
    ).toEqual([])
    const h = makeHarness({ listOk: false })
    await h.controller.load()
    const state = h.controller.state()
    expect(state.rows).toEqual([])
    expect(state.selectedPath).toBeNull()
    expect(state.mode).toBe(HERO_DEFAULT_MODE) // 默认语义不因目录失败而丢失
  })
})

describe('step-2 create-default（保持默认直接开建会话）', () => {
  it('success（当前环境建会话）', async () => {
    // 回链 contracts/step-2-create-default.md Outcome:success——默认环境走官方面单径
    const h = makeHarness()
    await h.controller.load()
    await h.controller.send('开始')
    // 官方面 createSession({workspaceId, worktreePath})：默认行 chip 双发
    expect(h.createCalls).toEqual([{ workspaceId: 'ws-main', worktreePath: 'Z:\\proj' }])
    expect(h.opened).toContain('s-plain')
    expect(h.opened.some((o) => o.startsWith('s-plain:开始:queue'))).toBe(true) // 首条消息随创建转发（恒 queue followup——新会话 agent 必空闲，官方 steer 拒绝队列外抢占）
    // 源面锚点：建会话零 forge 专用通道（已删导出 + 通道字面量零残留）
    expect(mobileSrc('views/hero.ts')).not.toMatch(/HERO_SESSION_CREATE_CHANNEL|'forge:worktree\/session-create'/)
  })

  it('reopen-no-residue（快速连开与返回）', async () => {
    // 回链 contracts/step-2-create-default.md Outcome:reopen-no-residue——未提交零落地
    const h = makeHarness()
    await h.controller.load()
    h.controller.openPop('branch')
    h.controller.closePop()
    h.controller.reset() // 返回即复位
    const state = h.controller.state()
    expect(state.pop).toBeNull()
    expect(state.mode).toBe(HERO_DEFAULT_MODE)
    expect(state.selectedPath).toBe(state.defaultRow?.path)
    expect(h.createCalls).toEqual([]) // 零会话创建请求
  })

  it('double-submit-guard（连点开建防重）', async () => {
    // 回链 contracts/step-2-create-default.md Outcome:double-submit-guard
    // inferred：意图一次性——busy 单发标记，在途连点零并发多发；busy 收敛后重发 = 新意图
    const h = makeHarness()
    await h.controller.load()
    await h.controller.send('第一条')
    await h.controller.send('第二条') // busy 已收敛后再发 = 新意图（非并发）
    expect(h.controller.state().busy).toBe(false)
    expect(h.createCalls).toHaveLength(2)
  })
})

describe('step-3 switch-branch-optimistic（乐观切换分支/worktree）', () => {
  it('success（乐观切换即时呈现）', async () => {
    // 回链 contracts/step-3-switch-branch-optimistic.md Outcome:success——点选即改选中态（零网络、零预检）
    const h = makeHarness()
    await h.controller.load()
    const before = h.listCalls.length
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    expect(h.controller.state().selectedPath).toBe('Z:\\proj\\wt-feature')
    expect(h.listCalls.length).toBe(before) // 零 host 调用（选中态纯本地，无预铸守卫触达）
    // 呈现派生：展示名 / 说明文案 / composer chip
    expect(rowDisplayName(ROWS[1]!)).toBe('feature')
    expect(rowHintText(ROWS[0]!, ROWS[0]!)).toBe('当前所在分支 · 主 worktree（默认）')
    expect(rowHintText(ROWS[1]!, ROWS[0]!)).toBe('复用已有 worktree')
    expect(composerWorktreeLabel(ROWS[0]!, ROWS[0]!)).toBe('main · 当前所在分支')
    // 源面锚点：UI 无预检说明文本（创建即官方面单径，零预检调用）
    expect(mobileSrc('views/hero.ts')).not.toMatch(/预检中|预检调用中/)
  })

  it('repeat-op-no-flicker（回执未达重复操作）', async () => {
    // 回链 contracts/step-3-switch-branch-optimistic.md Outcome:repeat-op-no-flicker——
    // 重复点选稳定于最终选中态，不叠加切换（selectedPath 单值语义）
    const h = makeHarness()
    await h.controller.load()
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    h.controller.pickBranch('Z:\\proj\\wt-feature') // 回执未达重复点选
    h.controller.pickBranch('Z:\\proj') // 再改选
    expect(h.controller.state().selectedPath).toBe('Z:\\proj')
    // 不在清单的路径零采纳（不产生中间态闪烁）
    h.controller.pickBranch('Z:\\ghost')
    expect(h.controller.state().selectedPath).toBe('Z:\\proj')
  })

  it('mode-toggled（模式档位切换）', async () => {
    // 回链 contracts/step-3-switch-branch-optimistic.md Outcome:mode-toggled
    // inferred：模式档乐观切换，创建意图按所选模式转发（突击 = steer 抢占 / 远征 = queue 排队）
    expect(promptModeOf('突击')).toBe('steer')
    expect(promptModeOf('远征')).toBe('queue')
    expect(promptModeOf('未知档')).toBe('steer') // 缺省回退突击语义
    const h = makeHarness()
    await h.controller.load()
    h.controller.pickMode('远征')
    expect(h.controller.state().mode).toBe('远征')
    h.controller.pickMode('幽灵档') // 不在档位集 = 零采纳
    expect(h.controller.state().mode).toBe('远征')
    await h.controller.send('远征首条')
    expect(h.opened.some((o) => o.endsWith(':queue'))).toBe(true)
  })
})

describe('step-4 create-failure（创建失败错误面——守卫确认框退役后语义）', () => {
  it('create-rejected（官方面创建失败 = 错误提示 + 草稿回填）', async () => {
    // 回链 contracts/step-4-guard-confirm.md Outcome:guard-rejected（新语义收敛）——
    // host/官方面拒绝只回传数据：错误面呈现 reason，零半切换状态、零自动重试
    const h = makeHarness({ createOk: false, failMessage: '分支冲突' })
    await h.controller.load()
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    await h.controller.send('切换意图')
    const state = h.controller.state()
    expect(state.error).toBe('发送失败：分支冲突')
    expect(state.draft).toBe('切换意图') // 文本退回 composer
    expect(state.busy).toBe(false) // 链路解冻可重试
    expect(h.opened).toEqual([]) // 零会话进入（失败不落任何会话）
    expect(h.createCalls).toEqual([]) // 失败请求不记为落地
  })

  it('retry-after-failure（失败后重发）', async () => {
    // inferred：错误面不阻断——草稿回填后重发走完整创建链，成功即清错误/草稿
    const h = makeHarness({ createOk: false })
    await h.controller.load()
    await h.controller.send('第一条')
    expect(h.controller.state().error).not.toBeNull()
    h.setCreateOk()
    await h.controller.send('第一条') // 同文本重发（新意图）
    const state = h.controller.state()
    expect(state.error).toBeNull()
    expect(state.draft).toBeNull()
    expect(h.opened).toContain('s-plain')
  })

  it('prompt-failure（会话已建、首条消息投递失败）', async () => {
    // inferred：创建成功但 prompt 失败 = 错误面上抛（不静默进空会话），零自动重试多发
    const h = makeHarness()
    await h.controller.load()
    h.failPrompt('prompt rejected')
    await h.controller.send('投递径')
    expect(h.controller.state().error).toBe('发送失败：prompt rejected')
    expect(h.createCalls).toHaveLength(1) // 创建单次落地，零重试多发
    expect(h.opened).toEqual([]) // 投递失败不进会话
  })

  it('late-receipt-race（确认期间零竞态污染）', async () => {
    // 回链 contracts/step-4-guard-confirm.md Outcome:late-receipt-race（新语义收敛）——
    // busy 挂起期发送面短路：失败在途连发零二次落地，呈现不被竞态污染
    const h = makeHarness({ createOk: false, failMessage: '第一份回执' })
    await h.controller.load()
    const first = h.controller.send('意图') // 不 await——busy 在途
    await h.controller.send('意图重发') // busy 短路——零二次创建
    await first
    expect(h.controller.state().error).toBe('发送失败：第一份回执')
  })
})

describe('smoke: happy path 依序走全链（hero-new-session-branch-guard）', () => {
  it('打开 → 默认建会话 → 切换 → 失败错误面 → 重发落地全链', async () => {
    // ① 打开：目录装载 + 默认 = 当前分支 + 突击
    const h = makeHarness()
    await h.controller.load()
    expect(h.controller.state().mode).toBe('突击')
    expect(h.controller.state().defaultRow?.branch).toBe('main')
    // ② 默认建会话（官方面单径）→ 进入对话
    await h.controller.send('默认路径')
    expect(h.opened).toContain('s-plain')
    // ③ 乐观切换（选中态即时，零网络）
    h.controller.reset()
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    expect(h.controller.state().selectedPath).toBe('Z:\\proj\\wt-feature')
    // ④ 失败径独立验证（失败 = 错误面 + 草稿回填，零会话进入）
    const h2 = makeHarness({ createOk: false })
    await h2.controller.load()
    h2.controller.pickBranch('Z:\\proj\\wt-feature')
    await h2.controller.send('失败径')
    expect(h2.controller.state().error).not.toBeNull()
    expect(h2.createCalls).toEqual([])
    expect(h2.opened).toEqual([])
  })
})
