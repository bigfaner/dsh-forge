// openSessionWithPreset 组合子（定位：装配——M3 4.1：四 UF 共用的「打开新会话」平台编排单源）。
// 编排序（tech-design Interface 5 + 图 9）：平台会话编排创建/复用 blank 会话 → mode 在场则
// agentPreset.select（remote 面——`__DSH_TRANSPORT__` carrier 上的 typert remote 协议）→
// composer 预填（draft 缝）→ autosend 例外成员（诊断两路 + 派发指令——数据约束 7，例外
// 清单禁扩；预填不自动发送 = Hard Rule，autosend 缺省恒关）。
//
// OQ#1 实施期核实结论（2026-10-08，上游 0.2.0-rc.2 源码核实——两条缝俱在，兜底不启用）：
//   - 会话编排 = `uiWorkspace.openWorkspace(workspaceId, beforeOpen)`（UiWorkspaceService）：
//     内部 connectWorkspace = reuse-or-create blank（官方 startSession 同径）+ replaceMain
//     同步 retain(mainView) 并呈现；beforeOpen 同步回传 sessionId——零「新会话 id 不可得」缝。
//   - 预设选择 = `ctx.remote.agentPresets.select(sessionId, presetId)`（TypertRemoteNamespace
//     agentPresets/select——官方 AgentPresetSeat 同一面；blank 会话首回合前重绑，失败带原因）。
//   - composer draft 缝 = `conversation.input.for(actx).setDraft(text)`（SessionInput——
//     "Replace the whole draft (persisted-draft seed and programmatic writes)"——官方
//     persisted-draft 种子同径；shell 拥有 Lexical editor，composer 未挂载亦可写）；
//     自动发送 = 同 facade `submit()`（Enter/发送钮同径——含 / 前缀 slash 仲裁与默认 sink）。
//   - 「按会话 id 打开既有会话」跳转缝（姊妹出口，4.4 派发跳转消费）= `uiWorkspace.openSession`
//     （fix-11 起生产在用——非缺口）。
// 兜底裁决（设计预留）：draft 缝缺席时 = 聚焦 + 引导粘贴；跳转缝缺席时 = toast 提示手动切换
// ——两缝核实俱在，兜底路径保留为韧性回退（focusComposer）而非产品形态。
//
// bundle 自含纪律（client-plugin 经典 script 形状）：本文件零运行时 import——上游服务面以
// 结构同型镜像窄接口承载（plugin.ts 先例）；`'expedition' | 'blitz'` 词汇镜像 contracts MODES。
/** 模式词汇（镜像 contracts MODES——双预设 id：expedition/blitz） */
export type OpenSessionMode = 'expedition' | 'blitz'

/** agentPresets/select 远端结果（镜像上游 RemoteResult<string> 判别联合消费面） */
export type PresetSelectResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: { readonly message: string; readonly details?: { readonly reason?: string } } }

/** composer 输入 facade 窄面（镜像上游 SessionInput——draft 缝 + 提交 + 聚焦） */
export interface ComposerInputFace {
  /** 整体替换草稿（官方 persisted-draft 种子同径——OQ#1 核实的预填缝） */
  setDraft(text: string): void
  /** 进入提交（adjudication / claim 事务 / 默认 sink 内聚——Enter/发送钮同径） */
  submit(): void
  /** 键盘焦点归还 composer（兜底形态：聚焦 + 引导粘贴） */
  focus(): void
}

/** openSessionWithPreset 输入 */
export interface OpenSessionWithPresetInput {
  /** 目标工作区（anchored 项目的工作区——官方 openWorkspace 语义：连接工作区并开会话） */
  readonly workspaceId: string
  /** 模式（在场 = agentPreset.select 切换；缺席 = 不切换——提案渠道无溯源沿 registry 默认） */
  readonly mode?: OpenSessionMode
  /** 预填消息体（formatPrefill / formatDiagMessage 产出；诊断/派发渠道 = 例外成员） */
  readonly prefill: string
  /** 自动发送（例外成员收口 = 诊断两路 + 派发指令——缺省恒关：预填不自动发送 Hard Rule） */
  readonly autosend?: boolean
}

/** 编排结果（阶段化失败——调用面 toast 呈现；失败不含半途撤销，会话/预设已落者保持） */
export type OpenSessionOutcome =
  | { readonly ok: true; readonly sessionId: string; readonly presetApplied: boolean; readonly sent: boolean }
  | { readonly ok: false; readonly stage: 'create' | 'preset' | 'draft' | 'send'; readonly message: string }

/**
 * 平台动作窄面（上游 0.2.0-rc.2 核实——plugin.ts 侧经 openSessionPlatformFrom 组装）。
 * 六法与上游面一一对应：openWorkspace/openSession = uiWorkspace；selectPreset =
 * remote.agentPresets.select；setDraft/submitDraft/focusComposer = conversation.input 会话寻址。
 */
export interface OpenSessionPlatform {
  /** 连接工作区并打开其 blank 会话（reuse-or-create；beforeOpen 同步回传会话 id） */
  openWorkspace(workspaceId: string, beforeOpen?: (sessionId: string) => void): Promise<void>
  /** 按会话 id 打开既有会话（跳转缝——4.4 派发跳转消费） */
  openSession(sessionId: string): void
  /** 预设选择（blank 会话首回合前重绑——失败带原因文本） */
  selectPreset(sessionId: string, presetId: string): Promise<PresetSelectResult>
  /** composer 预填（会话作用域就绪等待内聚——false = 缝未就绪/写入失败） */
  setDraft(sessionId: string, text: string): Promise<boolean>
  /** 提交当前草稿（false = 提交面拒绝/缺席） */
  submitDraft(sessionId: string): boolean
  /** 聚焦目标会话 composer（兜底形态——best effort） */
  focusComposer(sessionId: string): void
}

/** 编排器（openSessionWithPreset + 跳转姊妹出口） */
export interface OpenSessionOrchestrator {
  openSessionWithPreset(input: OpenSessionWithPresetInput): Promise<OpenSessionOutcome>
  openExistingSession(sessionId: string): void
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function refusalOf(result: PresetSelectResult & { ok: false }): string {
  const reason = result.error.details?.reason
  return reason !== undefined && reason !== '' ? reason : result.error.message
}

/**
 * 组合子工厂（纯编排面——平台动作注入，测试 mock 编排序）。
 * 步序：创建 blank 会话（openWorkspace）→（mode 在场）agentPreset.select → composer 预填
 * （setDraft；失败 = 聚焦兜底 + 阶段化错误）→（autosend）submit。select 失败不预填（避免
 * 半编排态：模式未对齐的会话携预填易误导——调用面 toast 后可重入）。
 */
export function createOpenSessionOrchestrator(platform: OpenSessionPlatform): OpenSessionOrchestrator {
  return {
    async openSessionWithPreset(input) {
      let sessionId: string | undefined
      try {
        await platform.openWorkspace(input.workspaceId, (id) => {
          sessionId = id
        })
      } catch (error) {
        return { ok: false, stage: 'create', message: failureMessage(error) }
      }
      if (sessionId === undefined) {
        // beforeOpen 被跳过 = 导航被后续动作取代（上游语义）——按创建失败口径上报
        return { ok: false, stage: 'create', message: '会话编排被后续导航取代（beforeOpen 未回传）' }
      }
      const id: string = sessionId
      let presetApplied = false
      if (input.mode !== undefined) {
        const result = await platform.selectPreset(id, input.mode)
        if (!result.ok) {
          return { ok: false, stage: 'preset', message: `预设切换被拒（${input.mode}）：${refusalOf(result)}` }
        }
        presetApplied = true
      }
      const drafted = await platform.setDraft(id, input.prefill)
      if (!drafted) {
        platform.focusComposer(id)
        return { ok: false, stage: 'draft', message: 'composer 预填失败（会话输入缝未就绪）' }
      }
      let sent = false
      if (input.autosend === true) {
        if (!platform.submitDraft(id)) {
          return { ok: false, stage: 'send', message: '自动发送失败（提交面拒绝）' }
        }
        sent = true
      }
      return { ok: true, sessionId: id, presetApplied, sent }
    },
    openExistingSession(sessionId) {
      // 跳转缝（不新建、不重发、不切模式——v22 派发跳转三不语义；动作面失败由上游呈现）
      platform.openSession(sessionId)
    },
  }
}

// ─────────────────────────── 平台适配层（真实服务 → 窄面） ───────────────────────────

/** uiWorkspace 窄面（镜像上游 UiWorkspace 两法） */
export interface OpenSessionUiWorkspace {
  openWorkspace(workspaceId: string, beforeOpen?: (sessionId: string) => void): Promise<void>
  openSession(sessionId: string): void
}

/** remote.agentPresets 窄面（镜像 TypertRemoteNamespace$agentPresets 的 select） */
export interface OpenSessionAgentPresets {
  select(sessionId: string, presetId: string): Promise<PresetSelectResult>
}

/** 会话绑定窄面（镜像上游 SessionBinding 消费切片——会话作用域 ctx 递达物） */
export interface OpenSessionBinding {
  readonly ctx: unknown
}

/** sessions 服务窄面（镜像 ISessions.binding——借用既保留会话代际的绑定） */
export interface OpenSessionSessions {
  binding(sessionId: string): OpenSessionBinding | undefined
}

/** conversation 服务窄面（镜像 IConversation.input——SessionInputResolver 消费切片） */
export interface OpenSessionConversation {
  readonly input: { for(actx: unknown): ComposerInputFace }
}

/** 适配层组装输入（plugin.ts ctx.inject 作用域递达的真实服务切片） */
export interface OpenSessionServices {
  readonly uiWorkspace: OpenSessionUiWorkspace
  readonly agentPresets: OpenSessionAgentPresets
  readonly sessions: OpenSessionSessions
  readonly conversation: OpenSessionConversation
}

/** 等待参数（缺省 50ms 轮询 / 2s 上限——测试可注入快参） */
export interface OpenSessionWaitOptions {
  readonly pollMs?: number
  readonly timeoutMs?: number
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * 真实服务 → 平台窄面适配层。setDraft/submitDraft/focusComposer 经 `conversation.input.for
 * (binding.ctx)` 会话寻址（SessionInputResolver）；openSession 同步 retain(mainView) 在
 * replaceMain 内完成，但会话作用域物化为异步 fiber——binding 缺席时轮询等待（上限内重试）。
 */
export function openSessionPlatformFrom(
  services: OpenSessionServices,
  options?: OpenSessionWaitOptions,
): OpenSessionPlatform {
  const pollMs = options?.pollMs ?? 50
  const timeoutMs = options?.timeoutMs ?? 2000
  async function bindingWithin(sessionId: string): Promise<OpenSessionBinding | undefined> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const binding = services.sessions.binding(sessionId)
      if (binding !== undefined) return binding
      if (Date.now() >= deadline) return undefined
      await wait(pollMs)
    }
  }
  async function faceOf(sessionId: string): Promise<ComposerInputFace | undefined> {
    const binding = await bindingWithin(sessionId)
    if (binding === undefined) return undefined
    try {
      return services.conversation.input.for(binding.ctx)
    } catch {
      return undefined
    }
  }
  return {
    openWorkspace: (workspaceId, beforeOpen) => services.uiWorkspace.openWorkspace(workspaceId, beforeOpen),
    openSession: (sessionId) => {
      services.uiWorkspace.openSession(sessionId)
    },
    selectPreset: (sessionId, presetId) => services.agentPresets.select(sessionId, presetId),
    setDraft: async (sessionId, text) => {
      const face = await faceOf(sessionId)
      if (face === undefined) return false
      try {
        face.setDraft(text)
        return true
      } catch {
        return false
      }
    },
    submitDraft: (sessionId) => {
      const binding = services.sessions.binding(sessionId)
      if (binding === undefined) return false
      try {
        services.conversation.input.for(binding.ctx).submit()
        return true
      } catch {
        return false
      }
    },
    focusComposer: (sessionId) => {
      const binding = services.sessions.binding(sessionId)
      if (binding === undefined) return
      try {
        services.conversation.input.for(binding.ctx).focus()
      } catch {
        // best effort（兜底形态——聚焦失败静默，错误口径由 setDraft 阶段承载）
      }
    },
  }
}
