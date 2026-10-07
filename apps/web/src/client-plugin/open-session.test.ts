// openSessionWithPreset 组合子测试（定位：装配测试——M3 4.1 AC4/AC6）。
// 编排序断言（mock 平台 API：创建 → select → 预填 → autosend 三步——tech-design Interface 5）+
// 分支面（mode 缺席不切换 / autosend 缺席不发送——预填不自动发送 Hard Rule / 阶段化失败 /
// 跳转姊妹出口）+ 适配层胶水（binding 等待 + conversation.input.for 会话寻址）。
import { describe, expect, it, vi } from 'vitest'
import {
  createOpenSessionOrchestrator,
  openSessionPlatformFrom,
  type ComposerInputFace,
  type OpenSessionPlatform,
  type PresetSelectResult,
} from './open-session.js'

/** mock 平台：记录调用序（步骤名 + 实参），可编程各步行为 */
function mockPlatform(overrides?: {
  select?: (sessionId: string, presetId: string) => PresetSelectResult
  setDraft?: boolean
  submitDraft?: boolean
  openWorkspace?: (workspaceId: string, beforeOpen?: (sessionId: string) => void) => Promise<void>
}) {
  const calls: string[] = []
  const platform: OpenSessionPlatform = {
    openWorkspace: overrides?.openWorkspace ?? ((workspaceId, beforeOpen) => {
      calls.push(`openWorkspace:${workspaceId}`)
      beforeOpen?.('sess-new-1')
      return Promise.resolve()
    }),
    openSession: (sessionId) => {
      calls.push(`openSession:${sessionId}`)
    },
    selectPreset: (sessionId, presetId) => {
      calls.push(`select:${presetId}@${sessionId}`)
      return Promise.resolve(overrides?.select?.(sessionId, presetId) ?? { ok: true, value: presetId })
    },
    setDraft: async (sessionId, text) => {
      calls.push(`setDraft:${text.slice(0, 12)}…@${sessionId}`)
      return overrides?.setDraft ?? true
    },
    submitDraft: (sessionId) => {
      calls.push(`submit@${sessionId}`)
      return overrides?.submitDraft ?? true
    },
    focusComposer: (sessionId) => {
      calls.push(`focus@${sessionId}`)
    },
  }
  return { platform, calls }
}

describe('openSessionWithPreset 编排序（AC4——mock 平台 API 三步）', () => {
  it('全参：创建 blank 会话 → agentPreset.select → composer 预填 → autosend 提交（序即此）', async () => {
    const { platform, calls } = mockPlatform()
    const outcome = await createOpenSessionOrchestrator(platform).openSessionWithPreset({
      workspaceId: 'ws-1',
      mode: 'expedition',
      prefill: '现状上下文预填文本',
      autosend: true,
    })
    expect(outcome).toEqual({ ok: true, sessionId: 'sess-new-1', presetApplied: true, sent: true })
    expect(calls).toEqual(['openWorkspace:ws-1', 'select:expedition@sess-new-1', 'setDraft:现状上下文预填文本…@sess-new-1', 'submit@sess-new-1'])
  })

  it('mode 缺席 = 不切换（提案渠道无溯源沿 registry 默认——零 select 调用）', async () => {
    const { platform, calls } = mockPlatform()
    const outcome = await createOpenSessionOrchestrator(platform).openSessionWithPreset({
      workspaceId: 'ws-1',
      prefill: 'p',
    })
    expect(outcome).toEqual({ ok: true, sessionId: 'sess-new-1', presetApplied: false, sent: false })
    expect(calls.filter((c) => c.startsWith('select:'))).toEqual([])
  })

  it('autosend 缺省恒关 = 预填不自动发送（Hard Rule——零 submit 调用）', async () => {
    const { platform, calls } = mockPlatform()
    await createOpenSessionOrchestrator(platform).openSessionWithPreset({
      workspaceId: 'ws-1',
      mode: 'blitz',
      prefill: 'p',
    })
    expect(calls.filter((c) => c.startsWith('submit'))).toEqual([])
  })

  it('预设选择被拒 = 阶段化失败（stage=preset + 原因文本），不预填不发送', async () => {
    const { platform, calls } = mockPlatform({
      select: () => ({
        ok: false,
        error: { message: 'session not blank', details: { reason: '会话已过首回合' } },
      }),
    })
    const outcome = await createOpenSessionOrchestrator(platform).openSessionWithPreset({
      workspaceId: 'ws-1',
      mode: 'expedition',
      prefill: 'p',
      autosend: true,
    })
    expect(outcome).toEqual({ ok: false, stage: 'preset', message: '预设切换被拒（expedition）：会话已过首回合' })
    expect(calls.filter((c) => c.startsWith('setDraft'))).toEqual([])
    expect(calls.filter((c) => c.startsWith('submit'))).toEqual([])
  })

  it('会话编排失败 = 阶段化失败（stage=create——官方 workspace 通知已呈现，错误文本随附）', async () => {
    const { platform } = mockPlatform({
      openWorkspace: () => Promise.reject(new Error('host refused')),
    })
    const outcome = await createOpenSessionOrchestrator(platform).openSessionWithPreset({
      workspaceId: 'ws-x',
      prefill: 'p',
    })
    expect(outcome).toEqual({ ok: false, stage: 'create', message: 'host refused' })
  })

  it('导航被取代（beforeOpen 未回传）= stage=create 口径', async () => {
    const { platform } = mockPlatform({
      openWorkspace: (workspaceId, beforeOpen) => {
        void beforeOpen // 被取代：上游跳过 beforeOpen
        return Promise.resolve()
      },
    })
    const outcome = await createOpenSessionOrchestrator(platform).openSessionWithPreset({ workspaceId: 'ws-1', prefill: 'p' })
    expect(outcome).toEqual({ ok: false, stage: 'create', message: '会话编排被后续导航取代（beforeOpen 未回传）' })
  })

  it('draft 缝未就绪 = 聚焦兜底 + stage=draft（OQ#1 兜底形态——韧性回退）', async () => {
    const { platform, calls } = mockPlatform({ setDraft: false })
    const outcome = await createOpenSessionOrchestrator(platform).openSessionWithPreset({
      workspaceId: 'ws-1',
      prefill: 'p',
      autosend: true,
    })
    expect(outcome).toEqual({ ok: false, stage: 'draft', message: 'composer 预填失败（会话输入缝未就绪）' })
    expect(calls).toContain('focus@sess-new-1')
    expect(calls.filter((c) => c.startsWith('submit'))).toEqual([])
  })

  it('提交面拒绝 = stage=send（预填已落保持）', async () => {
    const { platform } = mockPlatform({ submitDraft: false })
    const outcome = await createOpenSessionOrchestrator(platform).openSessionWithPreset({
      workspaceId: 'ws-1',
      prefill: 'p',
      autosend: true,
    })
    expect(outcome).toEqual({ ok: false, stage: 'send', message: '自动发送失败（提交面拒绝）' })
  })
})

describe('跳转姊妹出口（「按会话 id 打开既有会话」缝——4.4 派发跳转消费）', () => {
  it('openExistingSession = 平台 openSession 直达（不新建不重发不切模式）', () => {
    const { platform, calls } = mockPlatform()
    createOpenSessionOrchestrator(platform).openExistingSession('sess-existing-7')
    expect(calls).toEqual(['openSession:sess-existing-7'])
  })
})

describe('平台适配层 openSessionPlatformFrom（真实服务切片 → 窄面）', () => {
  function fakeServices(delayBindingBy = 0) {
    let bindingReady = delayBindingBy === 0
    if (delayBindingBy > 0) setTimeout(() => (bindingReady = true), delayBindingBy)
    const draftWrites: string[] = []
    const submitted: boolean[] = []
    const focused: boolean[] = []
    const face: ComposerInputFace = {
      setDraft: (text) => {
        draftWrites.push(text)
      },
      submit: () => {
        submitted.push(true)
      },
      focus: () => {
        focused.push(true)
      },
    }
    const openSessionCalls: string[] = []
    return {
      services: {
        uiWorkspace: {
          openWorkspace: (workspaceId: string, beforeOpen?: (id: string) => void) => {
            beforeOpen?.('s-1')
            return Promise.resolve()
          },
          openSession: (id: string) => {
            openSessionCalls.push(id)
          },
        },
        agentPresets: {
          select: vi.fn(() => Promise.resolve({ ok: true, value: 'expedition' } as PresetSelectResult)),
        },
        sessions: {
          binding: (id: string) => (bindingReady && id === 's-1' ? { ctx: { tag: 'actx-s-1' } } : undefined),
        },
        conversation: {
          input: {
            for: (actx: unknown) => {
              if ((actx as { tag?: string }).tag !== 'actx-s-1') throw new Error('conversation.input.for requires a retained Session scope')
              return face
            },
          },
        },
      },
      draftWrites,
      submitted,
      focused,
      openSessionCalls,
    }
  }

  it('setDraft：binding 即时在场 → conversation.input.for(binding.ctx).setDraft 路由', async () => {
    const f = fakeServices()
    const platform = openSessionPlatformFrom(f.services)
    await expect(platform.setDraft('s-1', '预填文本')).resolves.toBe(true)
    expect(f.draftWrites).toEqual(['预填文本'])
  })

  it('setDraft：binding 延迟物化 → 轮询等待内命中（异步会话作用域 fiber 容错）', async () => {
    const f = fakeServices(8)
    const platform = openSessionPlatformFrom(f.services, { pollMs: 2, timeoutMs: 1000 })
    await expect(platform.setDraft('s-1', '迟到绑定')).resolves.toBe(true)
    expect(f.draftWrites).toEqual(['迟到绑定'])
  })

  it('setDraft：超时无 binding → false（不抛——阶段化错误由编排器承载）', async () => {
    const f = fakeServices(50)
    const platform = openSessionPlatformFrom(f.services, { pollMs: 1, timeoutMs: 5 })
    await expect(platform.setDraft('s-1', 'x')).resolves.toBe(false)
  })

  it('submitDraft/focusComposer：会话寻址同径；binding 缺席 = false / 静默', async () => {
    const f = fakeServices()
    const platform = openSessionPlatformFrom(f.services)
    expect(platform.submitDraft('s-1')).toBe(true)
    expect(f.submitted).toEqual([true])
    expect(platform.submitDraft('unknown')).toBe(false)
    platform.focusComposer('s-1')
    expect(f.focused).toEqual([true])
    platform.focusComposer('unknown') // 静默 best effort
    expect(f.focused).toEqual([true])
  })

  it('编排器 × 适配层全链（真实胶水下序不变）', async () => {
    const f = fakeServices()
    const orchestrator = createOpenSessionOrchestrator(openSessionPlatformFrom(f.services))
    const outcome = await orchestrator.openSessionWithPreset({
      workspaceId: 'ws-1',
      mode: 'expedition',
      prefill: '全文',
      autosend: true,
    })
    expect(outcome).toEqual({ ok: true, sessionId: 's-1', presetApplied: true, sent: true })
    expect(f.draftWrites).toEqual(['全文'])
    expect(f.submitted).toEqual([true])
    orchestrator.openExistingSession('s-9')
    expect(f.openSessionCalls).toEqual(['s-9'])
  })
})
