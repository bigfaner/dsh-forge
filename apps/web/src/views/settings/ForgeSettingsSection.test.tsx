// Forge设置 分区组件单测 —— 4.5：分区多小节结构（分区标题 + worker 小节 + 行式控件）+
// worker 三项（Provider/Model 联动/Reasoning 三段——Hard Rule：无 Output 上限回潮）+
// 未配置 ⚠ 占位 + 脏态实时（input+change 双监听同门纯函数）+ 保存五态反馈
// （保存中冻结 / 成功 ✓ 复位 + 下次派发生效注记 / 失败错误行留场可重试）。
// 渲染面 = renderToStaticMarkup 纯 Body（设置对话框 slot 注入归 4.7——本件全相位静态可测）；
// 保存链 = saveForgeSettings 纯异步面（补丁增量合并——表单内容结构性不被清空）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ForgeSettings, ReasoningLevel, WorkerSettings } from '@dsh-forge/contracts'
import { RpcClientError } from '../../rpc/errors.js'
import type { ForgeRpcClient } from '../../rpc/index.js'
import {
  FUTURE_NOTE,
  ForgeSettingsSection,
  ForgeSettingsSectionBody,
  SAVED_EFFECT_NOTE,
  UNCONFIGURED_NOTICE,
  WORKER_PROVIDER_CATALOG,
  applyForgeSettingsLoaded,
  applyProviderChange,
  canSaveWorkerDraft,
  editWorkerDraft,
  fetchForgeSettings,
  initialForgeSettingsUiState,
  initialWorkerDraft,
  isWorkerDraftComplete,
  isWorkerDraftDirty,
  modelSelectOptions,
  providerSelectOptions,
  saveForgeSettings,
  submitWorkerSettings,
  workerModelCandidates,
  type ForgeSettingsPatch,
  type ForgeSettingsUiState,
} from './ForgeSettingsSection.js'

const NOOP = (): void => {}

const SAVED: WorkerSettings = { provider: 'dsh-openai', model: 'glm-5.3', reasoning: 'high' }

function body(overrides: Partial<Parameters<typeof ForgeSettingsSectionBody>[0]> = {}): string {
  return renderToStaticMarkup(
    ForgeSettingsSectionBody({
      load: 'ready',
      draft: { ...SAVED },
      saved: SAVED,
      saving: false,
      savedFlash: false,
      error: undefined,
      onEditProvider: NOOP,
      onEditModel: NOOP,
      onEditReasoning: NOOP,
      onSave: NOOP,
      onRetryLoad: NOOP,
      ...overrides,
    }),
  )
}

function clientWith(
  get?: () => Promise<ForgeSettings>,
  set?: (input: unknown) => Promise<void>,
): ForgeRpcClient {
  return {
    settings: {
      get: get ?? (async () => { throw new Error('get 不应被调用') }),
      set: set ?? (async () => { throw new Error('set 不应被调用') }),
    },
  } as unknown as ForgeRpcClient
}

// ─────────────────────────── AC1 分区结构 ───────────────────────────

describe('AC1 · 分区结构（分区标题 + worker 小节 + 行式控件 + 分区底注）', () => {
  it('分区标题（底色条类位）+ worker 小节标题 + 说明一行 + 分区底注未来注记（非交互）', () => {
    const html = body()
    expect(html).toContain('data-dswf-fs-title')
    expect(html.match(/data-dswf-fs-title="?"?[^>]*>Forge设置</) ?? html.match(/Forge设置/)).toBeTruthy()
    expect(html).toContain('data-dswf-fs-part="worker"')
    expect(html).toContain('>worker</')
    expect(html).toContain('默认 LLM（全部执行子代理统一档位）')
    // 分区底注 = 未来注记一行（<p> 非交互——非 button）
    expect(html).toContain(FUTURE_NOTE)
    expect(html).toContain('data-dswf-fs-future-note')
    expect(html).not.toMatch(/<button[^>]*data-dswf-fs-future-note/)
  })

  it('三项行式控件：标签左/控件右（dswf-fs-row 三行 + data 锚逐项在场）', () => {
    const html = body()
    expect(html.match(/class="dswf-fs-row"/g)?.length).toBe(3)
    expect(html).toContain('data-dswf-fs-provider')
    expect(html).toContain('data-dswf-fs-model')
    expect(html).toContain('data-dswf-fs-reasoning')
    for (const label of ['Provider', 'Model', 'Reasoning']) {
      expect(html).toContain(`>${label}<`)
    }
  })

  it('多小节结构可扩展：分区容器与小节容器分层（fs > fs-part——后续小节并列挂 fs 直下）', () => {
    const html = body()
    const fsAt = html.indexOf('class="dswf-fs"')
    const partAt = html.indexOf('class="dswf-fs-part"')
    expect(fsAt).toBeGreaterThanOrEqual(0)
    expect(partAt).toBeGreaterThan(fsAt)
  })
})

// ─────────────────── AC2 worker 三项（Hard Rule：无 Output 上限） ───────────────────

describe('AC2 · worker 三项 + Provider→Model 联动候选（供应商 × 模型二维）', () => {
  it('Provider 选项 = 目录两供应商；Model 选项 = 当前供应商候选；Reasoning = 三段 seg（低|中|高）', () => {
    const html = body()
    for (const entry of WORKER_PROVIDER_CATALOG) {
      expect(html).toContain(`<option value="${entry.provider}"`)
    }
    // glm-5.3 属 dsh-openai 候选；deepseek 候选不在 dsh-openai 选中态下面
    expect(html).toContain('<option value="glm-5.3"')
    expect(html).not.toContain('<option value="deepseek-chat"')
    // 三段 seg：role=tablist + 三 tab（aria-selected 承载当前档）
    expect(html).toContain('role="tablist"')
    expect(html.match(/role="tab"/g)?.length).toBe(3)
    expect(html).toContain('id="dswf-fs-reasoning-high"')
    expect(html).not.toContain('id="dswf-fs-reasoning-output"')
    for (const label of ['低', '中', '高']) {
      expect(html).toContain(label)
    }
  })

  it('Hard Rule：配置面恒三项——无 Output 上限项回潮', () => {
    const html = body()
    expect(html).not.toContain('Output')
    expect(html).not.toContain('上限')
    expect(html.match(/class="dswf-fs-row"/g)?.length).toBe(3)
  })

  it('workerModelCandidates：供应商 × 模型二维（每供应商各自候选；空/未知供应商 = 空）', () => {
    expect(workerModelCandidates('dsh-openai')).toEqual(['glm-5.3-flash', 'glm-5.3'])
    expect(workerModelCandidates('dsh-deepseek')).toEqual(['deepseek-chat', 'deepseek-reasoner'])
    expect(workerModelCandidates('')).toEqual([])
    expect(workerModelCandidates(undefined)).toEqual([])
    expect(workerModelCandidates('unknown-provider')).toEqual([])
  })

  it('applyProviderChange 联动：新候选含当前 model → 保留；不含 → 清空待重选', () => {
    const draft = { provider: 'dsh-openai', model: 'glm-5.3', reasoning: 'high' as ReasoningLevel }
    expect(applyProviderChange(draft, 'dsh-deepseek')).toEqual({
      provider: 'dsh-deepseek',
      model: '',
      reasoning: 'high',
    })
    expect(applyProviderChange(draft, 'dsh-openai')).toEqual(draft)
  })

  it('目录外存量值防失显：providerSelectOptions / modelSelectOptions 并入持久域自由字符串', () => {
    const legacy: WorkerSettings = { provider: 'dsh-custom', model: 'custom-model', reasoning: 'low' }
    expect(providerSelectOptions(legacy).map((o) => o.provider)).toContain('dsh-custom')
    expect(modelSelectOptions('dsh-custom', 'custom-model')).toContain('custom-model')
    // 目录内值不重复并入
    expect(providerSelectOptions(SAVED).map((o) => o.provider)).not.toContain('dsh-custom')
    expect(modelSelectOptions('dsh-openai', 'glm-5.3')).toEqual(['glm-5.3-flash', 'glm-5.3'])
  })

  it('Body Model 候选随 Provider 联动刷新（dsh-deepseek 选中态 → deepseek 候选直出）', () => {
    const html = body({
      draft: { provider: 'dsh-deepseek', model: 'deepseek-reasoner', reasoning: 'medium' },
      saved: undefined,
    })
    expect(html).toContain('<option value="deepseek-reasoner"')
    expect(html).not.toContain('<option value="glm-5.3"')
  })
})

// ─────────────────── AC3 未配置态 + 脏态实时（双监听同门） ───────────────────

describe('AC3 · 未配置 ⚠ 占位 + 填齐激活 + 脏态实时', () => {
  it('未配置态：⚠ 占位「worker 派发将回退父会话继承」在场 + 保存禁用', () => {
    const html = body({
      draft: { provider: '', model: '', reasoning: 'medium' },
      saved: undefined,
    })
    expect(html).toContain(UNCONFIGURED_NOTICE)
    expect(html).toContain('data-dswf-fs-unconfigured')
    expect(html).toMatch(/<button[^>]*data-dswf-fs-save[^>]*disabled/)
  })

  it('填齐激活：provider+model 填齐 → ⚠ 隐去 + 保存亮起（reasoning seg 恒有值）', () => {
    const html = body({
      draft: { provider: 'dsh-openai', model: 'glm-5.3', reasoning: 'medium' },
      saved: undefined,
    })
    expect(html).not.toContain('data-dswf-fs-unconfigured')
    expect(html).not.toMatch(/<button[^>]*data-dswf-fs-save[^>]*disabled/)
  })

  it('isWorkerDraftComplete / canSaveWorkerDraft：完整 ∧ 非等值（未配置填齐 / 已配置改后）', () => {
    const empty = { provider: '', model: '', reasoning: 'medium' as ReasoningLevel }
    expect(isWorkerDraftComplete(empty)).toBe(false)
    expect(isWorkerDraftComplete({ ...empty, provider: 'dsh-openai' })).toBe(false)
    expect(isWorkerDraftComplete({ ...empty, provider: 'dsh-openai', model: 'glm-5.3' })).toBe(true)
    // 未配置：填齐即激活（differs-from-absent = 脏）
    expect(canSaveWorkerDraft({ provider: 'dsh-openai', model: 'glm-5.3', reasoning: 'low' }, undefined)).toBe(true)
    expect(canSaveWorkerDraft(empty, undefined)).toBe(false)
    // 已配置：值直出不脏（保存禁用）；任一项改动激活
    expect(canSaveWorkerDraft(SAVED, SAVED)).toBe(false)
    expect(canSaveWorkerDraft({ ...SAVED, reasoning: 'low' }, SAVED)).toBe(true)
    expect(canSaveWorkerDraft({ provider: '', model: '', reasoning: 'medium' }, SAVED)).toBe(false)
  })

  it('isWorkerDraftDirty：未配置填齐 = 脏（对缺席）；已配置等值 = 不脏', () => {
    expect(isWorkerDraftDirty({ provider: 'p', model: 'm', reasoning: 'high' }, undefined)).toBe(true)
    expect(isWorkerDraftDirty(SAVED, SAVED)).toBe(false)
  })

  it('editWorkerDraft：脏态实时（input+change 双监听同门纯函数）+ 编辑清成功反馈与保存错', () => {
    const state: ForgeSettingsUiState = {
      ...initialForgeSettingsUiState(),
      load: 'ready',
      draft: { ...SAVED },
      saved: SAVED,
      savedFlash: true,
      error: { kind: 'save', message: '上次失败' },
    }
    const edited = editWorkerDraft(state, { reasoning: 'low' })
    expect(edited.draft).toEqual({ ...SAVED, reasoning: 'low' })
    expect(edited.savedFlash).toBe(false)
    expect(edited.error).toBeUndefined()
    expect(edited.saved).toEqual(SAVED) // 已持久化值不被编辑动作触碰
    // Provider 联动内聚：换供应商 → model 不在新候选集被清空
    const linked = editWorkerDraft(state, { provider: 'dsh-deepseek' })
    expect(linked.draft).toEqual({ provider: 'dsh-deepseek', model: '', reasoning: 'high' })
  })

  it('装载链：initial → 未配置 pending（⚠ 未知不显）→ ready 后按 worker 在场/缺席播种', () => {
    const pending = initialForgeSettingsUiState()
    expect(pending.load).toBe('pending')
    expect(pending.draft).toEqual({ provider: '', model: '', reasoning: 'medium' })
    expect(pending.saved).toBeUndefined()

    const html = renderToStaticMarkup(
      ForgeSettingsSectionBody({
        load: 'pending',
        draft: pending.draft,
        saved: undefined,
        saving: false,
        savedFlash: false,
        error: undefined,
        onEditProvider: NOOP,
        onEditModel: NOOP,
        onEditReasoning: NOOP,
        onSave: NOOP,
        onRetryLoad: NOOP,
      }),
    )
    expect(html).not.toContain('data-dswf-fs-unconfigured')
    expect(html).toMatch(/<select[^>]*data-dswf-fs-provider[^>]*disabled/)

    const unconfigured: ForgeSettings = {}
    const ready = applyForgeSettingsLoaded(pending, unconfigured)
    expect(ready.load).toBe('ready')
    expect(ready.draft.provider).toBe('')
    const configured = applyForgeSettingsLoaded(pending, { worker: SAVED })
    expect(configured.saved).toEqual(SAVED)
    expect(configured.draft).toEqual(SAVED)
    expect(initialWorkerDraft(undefined).reasoning).toBe('medium')
  })

  it('装载失败：错误行留场 + 重试按钮 + 控件面不渲染', () => {
    const html = body({
      load: 'error',
      draft: { provider: '', model: '', reasoning: 'medium' },
      saved: undefined,
      error: { kind: 'load', message: 'IPC 缺席' },
    })
    expect(html).toContain('data-dswf-fs-error="load"')
    expect(html).toContain('读取设置失败：IPC 缺席')
    expect(html).toContain('data-dswf-fs-retry')
    expect(html).not.toContain('data-dswf-fs-provider')
  })
})

// ─────────────────── AC4 保存反馈（中/成功/失败三相位） ───────────────────

describe('AC4 · 保存反馈：保存中冻结 / 成功 ✓ 复位 + 下次派发生效注记 / 失败留场可重试', () => {
  it('保存中：按钮 loading（保存中…）+ 三控件冻结（disabled）', () => {
    const html = body({
      draft: { ...SAVED, reasoning: 'low' },
      saving: true,
      savedFlash: false,
    })
    expect(html).toContain('保存中')
    expect(html).toMatch(/<button[^>]*data-dswf-fs-save[^>]*disabled/)
    expect(html).toMatch(/<select[^>]*data-dswf-fs-provider[^>]*disabled/)
    expect(html).toMatch(/<select[^>]*data-dswf-fs-model[^>]*disabled/)
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*disabled/) // seg 三段冻结
  })

  it('保存成功：按钮 ✓ 复位（值直出不脏再禁用）+ 下次派发生效注记行', () => {
    const html = body({ saving: false, savedFlash: true })
    expect(html).toContain('已保存 ✓')
    expect(html).toMatch(/<button[^>]*data-dswf-fs-save[^>]*disabled/)
    expect(html).toContain(SAVED_EFFECT_NOTE)
    expect(html).toContain('data-dswf-fs-saved-note')
    expect(html).not.toContain('data-dswf-fs-unconfigured')
  })

  it('保存失败：错误行留场（role=alert）+ 表单保留可重试（保存按钮仍亮）', () => {
    const html = body({
      draft: { ...SAVED, reasoning: 'low' },
      saving: false,
      savedFlash: false,
      error: { kind: 'save', message: '写失败' },
    })
    expect(html).toContain('data-dswf-fs-error="save"')
    expect(html).toContain('保存失败：写失败')
    expect(html).not.toMatch(/<button[^>]*data-dswf-fs-save[^>]*disabled/)
    // 表单内容保留：改动值直出
    expect(html.match(/<option value="glm-5.3"[^>]*selected/)).toBeTruthy()
  })
})

describe('保存链（纯异步面：submitWorkerSettings / saveForgeSettings / fetchForgeSettings）', () => {
  it('submitWorkerSettings：唯一通道 settings.set 整体覆写 worker 段；成功回写值 = 入参', async () => {
    const payloads: unknown[] = []
    const input = { worker: { ...SAVED } }
    const out = await submitWorkerSettings(
      clientWith(undefined, async (payload) => {
        payloads.push(payload)
      }),
      input,
    )
    expect(out).toEqual({ ok: true, saved: input.worker })
    expect(payloads).toEqual([input])
  })

  it('submitWorkerSettings：RpcClientError → message + uiState 映射；非 Rpc 错误兜底 error-bar', async () => {
    const typed = await submitWorkerSettings(
      clientWith(undefined, async () => {
        throw new RpcClientError({ code: 'ERR_WORKSPACE_NOT_REGISTERED', message: '工作区未注册' })
      }),
      { worker: { ...SAVED } },
    )
    expect(typed.ok).toBe(false)
    if (!typed.ok) {
      expect(typed.error.message).toBe('工作区未注册')
      expect(typed.error.uiState).toBe('error-bar')
    }
    const raw = await submitWorkerSettings(
      clientWith(undefined, async () => { throw new Error('boom') }),
      { worker: { ...SAVED } },
    )
    expect(raw.ok).toBe(false)
    if (!raw.ok) expect(raw.error.uiState).toBe('error-bar')
  })

  it('saveForgeSettings：成功 → 提交中补丁 → onSaved + 成功反馈；补丁恒不含 draft/saved/load（表单不被清空）', async () => {
    const patches: ForgeSettingsPatch[] = []
    let savedSeen: WorkerSettings | undefined
    await saveForgeSettings(
      { load: 'ready', draft: { ...SAVED, reasoning: 'low' }, saved: SAVED, saving: false, savedFlash: false, error: undefined },
      {
        makeClient: () => clientWith(undefined, async () => {}),
        onPatch: (p) => { patches.push(p) },
        onSaved: (saved) => { savedSeen = saved },
      },
    )
    expect(patches).toEqual([
      { error: undefined, saving: true, savedFlash: false },
      { error: undefined, saving: false, savedFlash: true },
    ])
    expect(savedSeen).toEqual({ ...SAVED, reasoning: 'low' })
    for (const patch of patches) {
      expect('draft' in patch).toBe(false)
      expect('saved' in patch).toBe(false)
      expect('load' in patch).toBe(false)
    }
  })

  it('saveForgeSettings：失败 → 错误留场 + saving 复位 + onSaved 零调用；单飞/不完整守卫 = no-op', async () => {
    const patches: ForgeSettingsPatch[] = []
    await saveForgeSettings(
      { load: 'ready', draft: { ...SAVED, reasoning: 'low' }, saved: SAVED, saving: false, savedFlash: false, error: undefined },
      {
        makeClient: () =>
          clientWith(undefined, async () => { throw new RpcClientError({ code: 'ERR_WORKSPACE_NOT_REGISTERED', message: 'x' }) }),
        onPatch: (p) => { patches.push(p) },
        onSaved: () => { throw new Error('onSaved 不应被调用') },
      },
    )
    expect(patches).toEqual([
      { error: undefined, saving: true, savedFlash: false },
      { error: { kind: 'save', message: 'x' }, saving: false },
    ])

    // 单飞守卫：saving 中重复保存 = no-op
    const guardPatches: ForgeSettingsPatch[] = []
    await saveForgeSettings(
      { load: 'ready', draft: { ...SAVED }, saved: undefined, saving: true, savedFlash: false, error: undefined },
      {
        makeClient: () => { throw new Error('makeClient 不应被调用（单飞守卫）') },
        onPatch: (p) => { guardPatches.push(p) },
        onSaved: NOOP,
      },
    )
    expect(guardPatches).toEqual([])

    // 不完整守卫：未配置未填齐 = no-op（按钮 disabled 的先验同门）
    await saveForgeSettings(
      { load: 'ready', draft: { provider: '', model: '', reasoning: 'medium' }, saved: undefined, saving: false, savedFlash: false, error: undefined },
      {
        makeClient: () => { throw new Error('makeClient 不应被调用（不完整守卫）') },
        onPatch: (p) => { guardPatches.push(p) },
        onSaved: NOOP,
      },
    )
    expect(guardPatches).toEqual([])
  })

  it('fetchForgeSettings：settings.get 唯一通道；worker 缺席 = 键缺席语义；失败 → message', async () => {
    const out = await fetchForgeSettings(clientWith(async () => ({})))
    expect(out).toEqual({ ok: true, settings: {} })
    const configured = await fetchForgeSettings(clientWith(async () => ({ worker: SAVED })))
    expect(configured.ok).toBe(true)

    const failed = await fetchForgeSettings(clientWith(async () => {
      throw new RpcClientError({ code: 'ERR_WORKSPACE_NOT_REGISTERED', message: '库不可用' })
    }))
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.error.message).toBe('库不可用')
  })
})

// ─────────────────── AC5 五态相位（未配置/已配置/保存中/成功/失败） ───────────────────

describe('AC5 · 五态相位渲染签名', () => {
  it('未配置：⚠ 占位 + 保存禁用 + 空值占位（未选择）', () => {
    const html = body({ draft: { provider: '', model: '', reasoning: 'medium' }, saved: undefined })
    expect(html).toContain('data-dswf-fs-unconfigured')
    expect(html).toContain(UNCONFIGURED_NOTICE)
    expect(html).toContain('（未选择）')
    expect(html).toMatch(/<button[^>]*data-dswf-fs-save[^>]*disabled/)
  })

  it('已配置：值直出（selected 落持久值）+ 无 ⚠ + 保存禁用（值直出不脏）', () => {
    const html = body()
    expect(html).not.toContain('data-dswf-fs-unconfigured')
    expect(html.match(/<option value="dsh-openai" selected/)).toBeTruthy()
    expect(html.match(/<option value="glm-5.3" selected/)).toBeTruthy()
    expect(html).toMatch(/id="dswf-fs-reasoning-high"[^>]*aria-selected="true"/)
    expect(html).toMatch(/<button[^>]*data-dswf-fs-save[^>]*disabled/)
  })

  it('保存中 / 成功 / 失败：三相位签名互异（phase 锚 + 按钮 label + 冻结面）', () => {
    const saving = body({ draft: { ...SAVED, reasoning: 'low' }, saving: true })
    expect(saving).toContain('data-dswf-fs-phase="saving"')
    expect(saving).toContain('保存中')

    const saved = body({ savedFlash: true })
    expect(saved).toContain('data-dswf-fs-phase="saved"')
    expect(saved).toContain('data-dswf-fs-saved-note')
    expect(saved).not.toContain('保存中')

    const failed = body({
      draft: { ...SAVED, reasoning: 'low' },
      error: { kind: 'save', message: 'x' },
    })
    expect(failed).toContain('data-dswf-fs-phase="idle"')
    expect(failed).toContain('data-dswf-fs-error="save"')
  })
})

// ─────────────────── 装载壳（server 渲染相位——effects 不跑，装载在途确定性） ───────────────────

describe('装载壳 · ForgeSettingsSection（初始渲染 = 装载在途相位）', () => {
  it('makeClient 注入面渲染装载在途（控件冻结 + ⚠ 未知不显 + 保存禁用）；server 渲染零装载调用', () => {
    let clientCalls = 0
    const html = renderToStaticMarkup(
      <ForgeSettingsSection
        makeClient={() => {
          clientCalls += 1
          return clientWith()
        }}
      />,
    )
    expect(clientCalls).toBe(0) // server 渲染不跑 effect——装载归 4.7 接线后的交互面/e2e
    expect(html).toContain('data-dswf-fs')
    expect(html).toContain('（未选择）')
    expect(html).toMatch(/<select[^>]*data-dswf-fs-provider[^>]*disabled/)
    expect(html).not.toContain('data-dswf-fs-unconfigured')
    expect(html).toMatch(/<button[^>]*data-dswf-fs-save[^>]*disabled/)
  })
})
