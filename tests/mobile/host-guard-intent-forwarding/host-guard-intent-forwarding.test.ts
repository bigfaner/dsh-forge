// @feature:mobile-ui
// @mobile-e2e
// Journey: host-guard-intent-forwarding（三类意图经官方面落地：分支切换/暂停/派发 + 桌面对照）。
// 溯源：contracts/step-1-branch-switch-intent.md … step-4-desktop-baseline.md（随 1.8
// binding-derivation §2.7 新语义重写——建会话经 forge:proxy/session-create 中继官方
// session.create（chip 双发 {workspaceId, worktreePath}），预铸守卫面退役）。
// 策略：hero 行为链（复用 hero Journey 控制器夹具）+ tasks 意图面（dispatchLine/pauseLine/
// hasActiveSource/stale 置灰）+ 桌面基线核查（mobile 源面零循环写路径 grep 证据）。零真实 host。
import { describe, expect, it } from 'vitest'
import type { RemoteRpc, RpcResult } from '../../../apps/mobile/src/core/rpc.js'
import { HERO_WORKTREE_LIST_CHANNEL, createHeroController, type HeroWorktreeRow } from '../../../apps/mobile/src/views/hero.js'
import { dispatchLine, hasActiveSource, pauseLine, type TaskRun } from '../../../apps/mobile/src/views/tasks.js'
import { loadFixtures, mobileSrc } from '../support.js'

const FIX = loadFixtures()

const ROWS: readonly HeroWorktreeRow[] = [
  { path: 'Z:\\proj', branch: 'main', worktreeName: 'proj', isMain: true, workspaceId: 'ws-main' },
  { path: 'Z:\\proj\\wt-feature', branch: 'feature', worktreeName: 'wt-feature', isMain: false, workspaceId: 'ws-feature' },
]

const RUNNING_RUNS: readonly TaskRun[] = [
  { sourceSlug: 's', taskKey: 's/1.1', number: 1, title: '1.1', status: 'running', counts: {} },
]

/** hero 控制器夹具（与 hero Journey 同构——创建链行为实测） */
function makeIntentHarness(createOk: boolean) {
  const createCalls: { workspaceId: string; worktreePath?: string }[] = []
  const opened: string[] = []
  const controller = createHeroController({
    rpc: {
      call: (async (channel: string): Promise<RpcResult<unknown>> => {
        if (channel === HERO_WORKTREE_LIST_CHANNEL) return { ok: true as const, data: { isGit: true, entries: ROWS } }
        return { ok: false as const, error: { code: 'unknown', reason: channel } }
      }) as RemoteRpc['call'],
    },
    api: {
      createSession: async (workspaceId: string, worktreePath?: string) => {
        if (!createOk) throw new Error('创建失败：环境不可用')
        createCalls.push({ workspaceId, worktreePath })
        return { sessionId: 's-created' }
      },
      prompt: async () => ({}),
      selectAgentPreset: async () => ({}),
      listAgentPresets: async () => ({ presets: [] }),
      selectModel: async () => ({ selected: true }),
    },
    projectRoot: 'Z:\\proj',
    currentBranch: 'main',
    workspaceId: 'ws-1',
    onOpenSession: (id) => opened.push(id),
  })
  return { controller, createCalls, opened }
}

describe('step-1 branch-switch-intent（分支切换意图经官方面落地）', () => {
  it('success（创建链通过后落地）', async () => {
    // 回链 contracts/step-1-branch-switch-intent.md Outcome:success——创建链通过才落地
    const h = makeIntentHarness(true)
    await h.controller.load()
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    await h.controller.send('切换')
    for (let i = 0; i < 6; i += 1) await Promise.resolve() // 建会话链微任务落定
    // chip 双发：官方面 createSession({workspaceId, worktreePath})——workspaceId 随选中行
    expect(h.createCalls).toEqual([{ workspaceId: 'ws-feature', worktreePath: 'Z:\\proj\\wt-feature' }])
    expect(h.opened).toContain('s-created') // 回执 sessionId → 进入对话（落地一次）
    expect(h.controller.state().busy).toBe(false)
    // 映射语义钉面：官方面 method 经 forge:proxy/session-create 中继（main.ts 隧道域映射单源）
    expect(mobileSrc('main.ts')).toMatch(/'session\.create':\s*'forge:proxy\/session-create'/)
    // 载荷自包含：worktreePath 随载荷透传（host proxy 零猜测，原样转发官方 create）
    expect(mobileSrc('core/api.ts')).toMatch(/workspaceId, worktreePath/)
    // 退役通道钉面：预铸单门已退役——已删导出 + 通道字面量零残留（hero 源面 + fixtures 双查）
    expect(mobileSrc('views/hero.ts')).not.toMatch(/HERO_SESSION_CREATE_CHANNEL|'forge:worktree\/session-create'/)
    expect(FIX.proxy.some((e) => (e.request as { channel?: string }).channel === 'forge:worktree/session-create')).toBe(false)
    // fixtures 缺口显性化：worktree/list 与 proxy/session-create 均未录制（录制期不在 proxy 面）
    expect(FIX.proxy.some((e) => (e.request as { channel?: string }).channel === HERO_WORKTREE_LIST_CHANNEL)).toBe(false)
    expect(FIX.proxy.some((e) => (e.request as { channel?: string }).channel === 'forge:proxy/session-create')).toBe(false)
  })

  it('create-rejected（创建失败零落地）', async () => {
    // 回链 contracts/step-1-branch-switch-intent.md Outcome:guard-rejected（新语义收敛）——
    // 失败只回传数据：错误面承载 reason，零半切换状态、零会话进入
    const h = makeIntentHarness(false)
    await h.controller.load()
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    await h.controller.send('切换')
    for (let i = 0; i < 6; i += 1) await Promise.resolve() // 建会话链微任务落定
    expect(h.controller.state().error).toBe('发送失败：创建失败：环境不可用')
    expect(h.createCalls).toHaveLength(0) // 失败请求不落地——宿主环境零变更
    expect(h.opened).toEqual([]) // 零会话进入
    h.controller.reset() // 选回语义由 reset 承担（确认框退役）
    expect(h.controller.state().error).toBeNull()
    expect(h.controller.state().selectedPath).toBe(h.controller.state().defaultRow?.path)
  })
})

describe('step-2 pause-intent（暂停意图经守卫落地）', () => {
  it('success（暂停落地且双端一致）', () => {
    // 回链 contracts/step-2-pause-intent.md Outcome:success——暂停 = 官方指令面意图（无专用通道）
    expect(pauseLine()).toBe('/stop-dag-tasks') // 发用户当前浏览会话——桌面端同源指令逻辑执行
    // 单一事实源：手机端零本地循环状态机（状态徽标 = 回执投影）
    expect(mobileSrc('views/tasks.ts')).toMatch(/command\/run|commandReceipts|command-chip/)
  })

  it('desktop-concurrent（暂停意图与桌面端并发）', () => {
    // 回链 contracts/step-2-pause-intent.md Outcome:desktop-concurrent——
    // 正确性 host 单点：意图转发是纯文本指令，客户端竞速不改变落点（同源独占守卫防重复）
    expect(mobileSrc('views/tasks.ts')).toMatch(/同源独占守卫|hasActiveSource/)
    expect(hasActiveSource(RUNNING_RUNS, 's')).toBe(true) // 活跃源禁重复派发（客户端侧防竞速入口）
  })
})

describe('step-3 dispatch-intent（派发意图经守卫落地）', () => {
  it('success（派发执行）', () => {
    // 回链 contracts/step-3-dispatch-intent.md Outcome:success——派发 = 官方指令面意图
    expect(dispatchLine('mobile-ui')).toBe('/run-dag-tasks mobile-ui')
    // 指令仲裁单源：composer `/` 前缀 → 官方指令执行远程面
    expect(mobileSrc('core/rpc.ts')).toMatch(/arbitrate|parseSlashLine/)
  })

  it('stale-intent-blocked（数据 stale 时发意图）', () => {
    // 回链 contracts/step-3-dispatch-intent.md Outcome:stale-intent-blocked——双保险
    const src = mobileSrc('views/tasks.ts')
    expect(src).toMatch(/const disabled = stale \|\| busy/) // 客户端置灰（体验）
    expect(src).toMatch(/'stale'/) // host 守卫 stale 错误 → 静默刷新 + 置灰（正确性）
  })
})

describe('step-4 desktop-baseline（桌面端对照循环主权）', () => {
  it('success（循环行为零改变）', () => {
    // 回链 contracts/step-4-desktop-baseline.md Outcome:success——
    // 核查：mobile 源面零循环写路径（零 dispatch-loop 控制、零任务状态直写）
    for (const rel of ['views/tasks.ts', 'views/hero.ts', 'views/worker.ts', 'core/rpc.ts', 'core/api.ts']) {
      const src = mobileSrc(rel)
      expect(src, `${rel} 不得含循环控制直写`).not.toMatch(/transitionTask|claimTask|submitTask|auto-restore/)
      expect(src, `${rel} 不得直写宿主任务状态`).not.toMatch(/UPDATE tasks|task_records/i)
    }
    // 意图面收敛为透传/指令：零宿主循环改动
    expect(mobileSrc('views/tasks.ts')).toMatch(/指令面|dispatchLine|stop-dag-tasks/)
  })

  it('offline-intent-reconcile（断线期间意图补发）', () => {
    // 回链 contracts/step-4-desktop-baseline.md Outcome:offline-intent-reconcile——
    // host 独立落地：RPC 断线 = disconnected 信封（读侧对账恢复），不产生本地补发队列
    expect(mobileSrc('core/rpc.ts')).toMatch(/'disconnected'/)
    expect(mobileSrc('core/rpc.ts')).not.toMatch(/retryQueue|resend.*intent/i) // 零客户端补发机制
  })
})

describe('smoke: happy path 依序走全链（host-guard-intent-forwarding）', () => {
  it('分支切换创建链 → 暂停/派发意图 → 桌面基线', async () => {
    // ① 分支切换：创建通过落地 / 失败零落地
    const pass = makeIntentHarness(true)
    await pass.controller.load()
    pass.controller.pickBranch('Z:\\proj\\wt-feature')
    await pass.controller.send('通过径')
    for (let i = 0; i < 6; i += 1) await Promise.resolve() // 建会话链微任务落定
    expect(pass.opened).toContain('s-created')
    const reject = makeIntentHarness(false)
    await reject.controller.load()
    reject.controller.pickBranch('Z:\\proj\\wt-feature')
    await reject.controller.send('拒绝径')
    expect(reject.controller.state().error).not.toBeNull()
    expect(reject.createCalls).toHaveLength(0)
    // ② 暂停/派发 = 官方指令面意图
    expect(pauseLine()).toBe('/stop-dag-tasks')
    expect(dispatchLine('s')).toBe('/run-dag-tasks s')
    // ③ 桌面基线：mobile 零循环写路径
    expect(mobileSrc('views/tasks.ts')).not.toMatch(/transitionTask|claimTask|submitTask/)
  })
})
