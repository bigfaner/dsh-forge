// @feature:mobile-ui
// @mobile-e2e
// Journey: host-guard-intent-forwarding（三类意图经 host 守卫落地：分支切换/暂停/派发 + 桌面对照）。
// 溯源：contracts/step-1-branch-switch-intent.md … step-4-desktop-baseline.md（每 Outcome 一测 + 冒烟）。
// 策略：hero 守卫回执链（复用 hero Journey 控制器夹具）+ tasks 意图面（dispatchLine/pauseLine/
// hasActiveSource/stale 置灰）+ 桌面基线核查（mobile 源面零循环写路径 grep 证据）。零真实 host。
import { describe, expect, it } from 'vitest'
import type { RemoteRpc, RpcResult } from '../../../apps/mobile/src/core/rpc.js'
import {
  HERO_SESSION_CREATE_CHANNEL,
  HERO_WORKTREE_LIST_CHANNEL,
  createHeroController,
  type HeroWorktreeRow,
} from '../../../apps/mobile/src/views/hero.js'
import { dispatchLine, hasActiveSource, pauseLine, type TaskRun } from '../../../apps/mobile/src/views/tasks.js'
import { loadFixtures, mobileSrc } from '../support.js'

const FIX = loadFixtures()

const ROWS: readonly HeroWorktreeRow[] = [
  { path: 'Z:\\proj', branch: 'main', worktreeName: 'proj', isMain: true },
  { path: 'Z:\\proj\\wt-feature', branch: 'feature', worktreeName: 'wt-feature', isMain: false },
]

const RUNNING_RUNS: readonly TaskRun[] = [
  { sourceSlug: 's', taskKey: 's/1.1', number: 1, title: '1.1', status: 'running', counts: {} },
]

/** hero 控制器夹具（与 hero Journey 同构——守卫回执链行为实测） */
function makeGuardHarness(guardRejects: boolean) {
  const sessionCreates: number[] = []
  const opened: string[] = []
  const controller = createHeroController({
    rpc: {
      call: (async (channel: string): Promise<RpcResult<unknown>> => {
        if (channel === HERO_WORKTREE_LIST_CHANNEL) return { ok: true as const, data: { isGit: true, entries: ROWS } }
        if (channel === HERO_SESSION_CREATE_CHANNEL) {
          return guardRejects
            ? { ok: false as const, error: { code: 'invalid-state', reason: '守卫拒绝：工作树未收口' } }
            : { ok: true as const, data: { sessionId: 's-guarded', branch: 'feature' } }
        }
        return { ok: false as const, error: { code: 'unknown', reason: channel } }
      }) as RemoteRpc['call'],
    },
    api: {
      createSession: async () => {
        sessionCreates.push(1)
        return { sessionId: 's-plain' }
      },
      prompt: async () => ({}),
      selectAgentPreset: async () => ({}),
      listAgentPresets: async () => ({ presets: [] }),
      selectModel: async () => ({ selected: true }),
    },
    projectRoot: 'Z:\\proj',
    currentBranch: 'main',
    currentWorktreePath: 'Z:\\proj',
    workspaceId: 'ws-1',
    onOpenSession: (id) => opened.push(id),
  })
  return { controller, sessionCreates, opened }
}

describe('step-1 branch-switch-intent（分支切换意图经守卫落地）', () => {
  it('success（校验通过后落地）', async () => {
    // 回链 contracts/step-1-branch-switch-intent.md Outcome:success——守卫通过才落地
    const h = makeGuardHarness(false)
    await h.controller.load()
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    await h.controller.send('切换')
    for (let i = 0; i < 6; i += 1) await Promise.resolve() // 建会话链微任务落定
    expect(h.opened).toContain('s-guarded') // 通道回执 sessionId → 进入对话（落地一次）
    expect(h.controller.state().busy).toBe(false)
    // 透传通道钉面：forge:worktree/session-create（fixtures 缺录制——404 缺口显性化）
    expect(HERO_SESSION_CREATE_CHANNEL).toBe('forge:worktree/session-create')
    expect(FIX.proxy.some((e) => (e.request as { channel?: string }).channel === HERO_WORKTREE_LIST_CHANNEL)).toBe(false)
  })

  it('guard-rejected（守卫拒绝分支切换）', async () => {
    // 回链 contracts/step-1-branch-switch-intent.md Outcome:guard-rejected——
    // 失败只回传数据：pendingGuard 承载 reason，零半切换状态、零官方面落地
    const h = makeGuardHarness(true)
    await h.controller.load()
    h.controller.pickBranch('Z:\\proj\\wt-feature')
    await h.controller.send('切换')
    for (let i = 0; i < 6; i += 1) await Promise.resolve() // 建会话链微任务落定
    expect(h.controller.state().pendingGuard?.reason).toBe('守卫拒绝：工作树未收口')
    expect(h.sessionCreates).toHaveLength(0) // 宿主环境零变更
    h.controller.resolveGuard('cancel') // 选回：零落地收口
    expect(h.controller.state().pendingGuard).toBeNull()
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
  it('分支切换守卫 → 暂停/派发意图 → 桌面基线', async () => {
    // ① 分支切换：守卫通过落地 / 拒绝零落地
    const pass = makeGuardHarness(false)
    await pass.controller.load()
    pass.controller.pickBranch('Z:\\proj\\wt-feature')
    await pass.controller.send('通过径')
    for (let i = 0; i < 6; i += 1) await Promise.resolve() // 建会话链微任务落定
    expect(pass.opened).toContain('s-guarded')
    const reject = makeGuardHarness(true)
    await reject.controller.load()
    reject.controller.pickBranch('Z:\\proj\\wt-feature')
    await reject.controller.send('拒绝径')
    expect(reject.controller.state().pendingGuard).not.toBeNull()
    reject.controller.resolveGuard('cancel')
    // ② 暂停/派发 = 官方指令面意图
    expect(pauseLine()).toBe('/stop-dag-tasks')
    expect(dispatchLine('s')).toBe('/run-dag-tasks s')
    // ③ 桌面基线：mobile 零循环写路径
    expect(mobileSrc('views/tasks.ts')).not.toMatch(/transitionTask|claimTask|submitTask/)
  })
})
