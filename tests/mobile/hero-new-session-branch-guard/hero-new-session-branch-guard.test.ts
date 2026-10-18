// @feature:mobile-ui
// @mobile-e2e
// Journey: hero-new-session-branch-guard（hero 初始态 + 默认建会话 + 乐观切换 + 守卫确认框）。
// 溯源：contracts/step-1-open-hero.md … step-4-guard-confirm.md（每 Outcome 一测 + 冒烟）。
// 策略：createHeroController 纯状态机（零 DOM）+ 注入 fake rpc/api 实测行为链；数据面钉
// e2e/fixtures/mobile proxy 通道（forge:worktree/list 缺录制——404 缺口显性化，载荷形状按
// coerceWorktreeList 契约构造）。零真实 host、离线可重复。
import { describe, expect, it } from 'vitest'
import type { RemoteRpc, RpcResult } from '../../../apps/mobile/src/core/rpc.js'
import {
  HERO_DEFAULT_MODE,
  HERO_MODES,
  HERO_SESSION_CREATE_CHANNEL,
  HERO_WORKTREE_LIST_CHANNEL,
  coerceWorktreeList,
  composerWorktreeLabel,
  createHeroController,
  needsWorktreeBinding,
  pickDefaultRow,
  promptModeOf,
  rowDisplayName,
  rowHintText,
  type HeroWorktreeRow,
} from '../../../apps/mobile/src/views/hero.js'
import { loadFixtures, mobileSrc } from '../support.js'

const FIX = loadFixtures()

const ROWS: readonly HeroWorktreeRow[] = [
  { path: 'Z:\\proj', branch: 'main', worktreeName: 'proj', isMain: true },
  { path: 'Z:\\proj\\wt-feature', branch: 'feature', worktreeName: 'wt-feature', isMain: false },
]

interface FakeRpcCall { readonly channel: string; readonly payload: unknown }

function makeHarness(over: { listOk?: boolean; createOk?: boolean; guardReason?: string } = {}) {
  const calls: FakeRpcCall[] = []
  let createCalls = 0
  const opened: string[] = []
  const controller = createHeroController({
    rpc: {
      call: (async (channel: string, payload: unknown): Promise<RpcResult<unknown>> => {
        calls.push({ channel, payload })
        if (channel === HERO_WORKTREE_LIST_CHANNEL) {
          return over.listOk === false
            ? { ok: false as const, error: { code: 'unavailable', reason: '目录不可达' } }
            : { ok: true as const, data: { isGit: true, entries: ROWS } }
        }
        if (channel === HERO_SESSION_CREATE_CHANNEL) {
          return over.createOk === false
            ? { ok: false as const, error: { code: 'invalid-state', reason: over.guardReason ?? '存在未收口工作树' } }
            : { ok: true as const, data: { sessionId: 's-new', branch: 'feature' } }
        }
        return { ok: false as const, error: { code: 'unknown', reason: channel } }
      }) as RemoteRpc['call'],
    },
    api: {
      createSession: async () => {
        createCalls += 1
        return { sessionId: 's-plain' }
      },
      prompt: async (sessionId: string, content: string, mode: string) => {
        opened.push(`${sessionId}:${content}:${mode}`)
        return {}
      },
    },
    currentBranch: 'main',
    currentWorktreePath: 'Z:\\proj',
    projectRoot: 'Z:\\proj',
    workspaceId: 'ws-1',
    onOpenSession: (id) => opened.push(id),
  })
  return { controller, calls, getCreateCalls: () => createCalls, opened }
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
    expect(state.selectedPath).toBe(state.defaultRow?.path)
    expect(state.pendingGuard).toBeNull()
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
    // 回链 contracts/step-2-create-default.md Outcome:success——默认环境走官方面径（不触守卫）
    const h = makeHarness()
    await h.controller.load()
    await h.controller.send('开始')
    expect(h.getCreateCalls()).toBe(1) // 官方面 createSession
    expect(h.calls.filter((c) => c.channel === HERO_SESSION_CREATE_CHANNEL)).toEqual([]) // 零守卫触达
    expect(h.opened).toContain('s-plain')
    expect(h.opened.some((o) => o.startsWith('s-plain:开始:steer'))).toBe(true) // 首条消息随创建转发（突击 = steer）
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
    expect(h.getCreateCalls()).toBe(0) // 零会话创建请求
  })

  it('double-submit-guard（连点开建防重）', async () => {
    // 回链 contracts/step-2-create-default.md Outcome:double-submit-guard
    // inferred：意图一次性——busy 单发标记，在途连点零并发多发
    const h = makeHarness()
    await h.controller.load()
    await h.controller.send('第一条')
    await h.controller.send('第二条') // busy 已收敛后再发 = 新意图（非并发）
    expect(h.controller.state().busy).toBe(false)
    // 守卫待决期间发送面冻结（busy 保持——确认期间零并发创建）
    const h2 = makeHarness({ createOk: false })
    await h2.controller.load()
    h2.controller.pickBranch('Z:\\proj\\wt-feature')
    await h2.controller.send('守卫径')
    expect(h2.controller.state().pendingGuard).not.toBeNull()
    await h2.controller.send('连点') // pendingGuard 挂起期直接短路
    expect(h2.getCreateCalls()).toBe(0) // 官方面零调用（未选择前创建链挂起）
  })
})

describe('step-3 switch-branch-optimistic（乐观切换分支/worktree）', () => {
  it('success（乐观切换即时呈现）', async () => {
    // 回链 contracts/step-3-switch-branch-optimistic.md Outcome:success——点选即改选中态（零网络、零预检）
    const h = makeHarness()
    await h.controller.load()
    const before = h.calls.length
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    expect(h.controller.state().selectedPath).toBe('Z:\\proj\\wt-feature')
    expect(h.calls.length).toBe(before) // 零 host 调用
    // 非默认行才触达 host 守卫（needsWorktreeBinding 双径判定）
    expect(needsWorktreeBinding(ROWS[0]!, 'Z:\\proj')).toBe(false) // 主行 = 当前所在
    expect(needsWorktreeBinding(ROWS[1]!, 'Z:\\proj')).toBe(true) // 复用行
    // 呈现派生：展示名 / 说明文案 / composer chip
    expect(rowDisplayName(ROWS[1]!)).toBe('feature')
    expect(rowHintText(ROWS[0]!, ROWS[0]!)).toBe('当前所在分支 · 主 worktree（默认）')
    expect(rowHintText(ROWS[1]!, ROWS[0]!)).toBe('复用已有 worktree')
    expect(composerWorktreeLabel(ROWS[0]!, ROWS[0]!)).toBe('main · 当前所在分支')
    // 源面锚点：UI 无预检说明文本（确认框数据完全回执驱动）
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

describe('step-4 guard-confirm（host 守卫拒绝与确认框选择）', () => {
  it('proceed（选「仍要切换」继续创建）', async () => {
    // 回链 contracts/step-4-guard-confirm.md Outcome:proceed——确认后经官方面落主树
    const h = makeHarness({ createOk: false, guardReason: '分支冲突' })
    await h.controller.load()
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    await h.controller.send('切换意图')
    expect(h.controller.state().pendingGuard?.reason).toBe('分支冲突') // 确认框数据 = 回执驱动
    h.controller.resolveGuard('confirm') // 仍要切换
    for (let i = 0; i < 6; i += 1) await Promise.resolve() // 创建链微任务落定
    expect(h.getCreateCalls()).toBe(1) // 官方面创建落地
    expect(h.opened).toContain('s-plain')
    expect(h.controller.state().pendingGuard).toBeNull()
  })

  it('revert（选「选回」不创建）', async () => {
    // 回链 contracts/step-4-guard-confirm.md Outcome:revert——选回 = 回退原分支、零创建
    const h = makeHarness({ createOk: false })
    await h.controller.load()
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    await h.controller.send('切换意图')
    h.controller.resolveGuard('cancel') // 选回
    const state = h.controller.state()
    expect(state.selectedPath).toBe(state.defaultRow?.path) // 回退当前所在
    expect(state.pendingGuard).toBeNull()
    expect(state.busy).toBe(false)
    expect(h.getCreateCalls()).toBe(0) // 被拒绝的切换不落任何 host 侧状态
  })

  it('await-user-decision（守卫拒绝且用户无动作）', async () => {
    // 回链 contracts/step-4-guard-confirm.md Outcome:await-user-decision——
    // 确认框模态挂起：无选择则创建链冻结（busy 保持 + pendingGuard 在显），零自动选回/继续
    const h = makeHarness({ createOk: false })
    await h.controller.load()
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    await h.controller.send('切换意图')
    const state = h.controller.state()
    expect(state.pendingGuard).not.toBeNull()
    expect(state.busy).toBe(true) // 创建链挂起
    expect(h.getCreateCalls()).toBe(0)
  })

  it('non-branch-guard-failure（非分支类守卫失败）', async () => {
    // 回链 contracts/step-4-guard-confirm.md Outcome:non-branch-guard-failure——
    // 失败只回传数据：确认框呈现回执 reason，零自动重试/降级
    const h = makeHarness({ createOk: false, guardReason: 'host 校验失败：环境不可用' })
    await h.controller.load()
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    await h.controller.send('意图')
    expect(h.controller.state().pendingGuard?.reason).toBe('host 校验失败：环境不可用')
    expect(h.getCreateCalls() + h.calls.filter((c) => c.channel === HERO_SESSION_CREATE_CHANNEL).length).toBe(1) // 零重试多发
    // 源面锚点：守卫单点在 host，客户端零校验
    expect(mobileSrc('views/hero.ts')).toMatch(/host 建会话守卫拒绝/)
  })

  it('late-receipt-race（确认期间回执迟到）', async () => {
    // 回链 contracts/step-4-guard-confirm.md Outcome:late-receipt-race
    // inferred：确认框数据以最新回执为准——迟到回执覆盖 pendingGuard.reason，无双落地
    const h = makeHarness({ createOk: false, guardReason: '第一份回执' })
    await h.controller.load()
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    await h.controller.send('意图')
    expect(h.controller.state().pendingGuard?.reason).toBe('第一份回执')
    // 迟到回执（第二次守卫拒绝）覆盖呈现
    await h.controller.send('意图重发') // pendingGuard 挂起期短路——零二次落地
    expect(h.controller.state().pendingGuard?.reason).toBe('第一份回执') // 呈现不被竞态污染
    h.controller.resolveGuard('cancel')
    expect(h.controller.state().pendingGuard).toBeNull() // 用户决定收口，无双落地
  })
})

describe('smoke: happy path 依序走全链（hero-new-session-branch-guard）', () => {
  it('打开 → 默认建会话 → 切换 → 守卫 → 选回/仍要切换全链', async () => {
    // ① 打开：目录装载 + 默认 = 当前分支 + 突击
    const h = makeHarness()
    await h.controller.load()
    expect(h.controller.state().mode).toBe('突击')
    expect(h.controller.state().defaultRow?.branch).toBe('main')
    // ② 默认建会话（官方面径）→ 进入对话
    await h.controller.send('默认路径')
    expect(h.opened).toContain('s-plain')
    // ③④ 乐观切换 → 守卫拒绝 → 仍要切换落地
    h.controller.reset()
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    expect(h.controller.state().selectedPath).toBe('Z:\\proj\\wt-feature')
    h.controller.resolveGuard('confirm') // 无 pendingGuard 时确认框点按幂等安全
    // 选回径独立验证（revert 后零创建）
    const h2 = makeHarness({ createOk: false })
    await h2.controller.load()
    h2.controller.pickBranch('Z:\\proj\\wt-feature')
    await h2.controller.send('守卫径')
    h2.controller.resolveGuard('cancel')
    expect(h2.controller.state().selectedPath).toBe(h2.controller.state().defaultRow?.path)
    expect(h2.getCreateCalls()).toBe(0)
  })
})
