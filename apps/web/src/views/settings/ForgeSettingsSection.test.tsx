// Forge设置 分区组件单测 —— 4.5：分区多小节结构（分区标题 + worker 小节 + 行式控件）+
// worker 三项（Provider/Model 联动/Reasoning 官方 Menu 下拉——默认|低|中|高中文标签、
// 默认值档恒在场；Hard Rule：无 Output 上限回潮）+ 档位兼容（目录能力面过滤 +
// 无法兼容回默认值不设置）+ 未配置 ⚠ 占位 + 脏态实时（双监听同门纯函数）+ 保存五态反馈
// （保存中冻结 / 成功 ✓ 复位 + 下次派发生效注记 / 失败错误行留场可重试）。
// 渲染面 = renderToStaticMarkup 纯 Body（设置对话框 slot 注入归 4.7——本件全相位静态可测）；
// 保存链 = saveForgeSettings 纯异步面（补丁增量合并——表单内容结构性不被清空）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ForgeSettings, ReasoningLevel, WorkerSettings } from '@dsh-forge/contracts'
import { RpcClientError } from '../../rpc/errors.js'
import type { ForgeRpcClient } from '../../rpc/index.js'
import {
  ForgeSettingsSection,
  ForgeSettingsSectionBody,
  REASONING_LEVEL_OPTIONS,
  SAVED_EFFECT_NOTE,
  UNCONFIGURED_NOTICE,
  UNSELECTED_PLACEHOLDER,
  WORKER_PROVIDER_CATALOG,
  applyForgeSettingsLoaded,
  applyModelCatalogLoaded,
  applyProviderChange,
  canSaveWorkerDraft,
  editWorkerDraft,
  fetchForgeSettings,
  fetchModelCatalogEntries,
  fsMenuItems,
  initialForgeSettingsUiState,
  initialWorkerDraft,
  isWorkerDraftComplete,
  isWorkerDraftDirty,
  modelReasoningEfforts,
  modelSelectOptions,
  providerSelectOptions,
  reasoningLabelOf,
  reasoningLevelOptions,
  reasoningMenuItems,
  reconcileWorkerReasoning,
  saveForgeSettings,
  submitWorkerSettings,
  workerModelCandidates,
  type ForgeSettingsPatch,
  type ForgeSettingsUiState,
  type WorkerDraft,
  type WorkerProviderEntry,
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

describe('AC1 · 分区结构（分区标题 + worker 小节 + 行式控件）', () => {
  it('分区标题（底色条类位）+ worker 小节标题 + 说明一行 + 零过程注释文案（m3.1 D26——底注废除）', () => {
    const html = body()
    expect(html).toContain('data-dswf-fs-title')
    expect(html.match(/data-dswf-fs-title="?"?[^>]*>Forge设置</) ?? html.match(/Forge设置/)).toBeTruthy()
    expect(html).toContain('data-dswf-fs-part="worker"')
    expect(html).toContain('>worker</')
    expect(html).toContain('默认 LLM（全部执行子代理统一档位）')
    // m3.1 D26：零过程注释文案——「未来注记」底注零在场（字符串级断言）
    expect(html).not.toContain('未来注记')
    expect(html).not.toContain('data-dswf-fs-future-note')
  })

  it('三项行式控件：标签左/控件右（dswf-fs-row 三行 + data 锚逐项在场）', () => {
    const html = body()
    expect(html.match(/class="dswf-fs-row"/g)?.length).toBe(3)
    expect(html).toContain('data-dswf-fs-dd="provider"')
    expect(html).toContain('data-dswf-fs-dd="model"')
    expect(html).toContain('data-dswf-fs-dd="reasoning"')
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
  it('Provider 选项 = 目录两供应商；Model 选项 = 当前供应商候选；Reasoning = 官方 Menu 下拉（默认|低|中|高——默认值恒在场）', () => {
    const html = body()
    // m3.1 D24：选项面 = 官方 Menu items（fsMenuItems 纯函数——静态闭态卡不可达的选项锚）
    const providerItems = fsMenuItems(providerSelectOptions(undefined).map((entry) => entry.provider))
    for (const entry of WORKER_PROVIDER_CATALOG) {
      expect(providerItems).toContainEqual({ id: entry.provider, label: entry.provider })
    }
    // glm-5.3 属 dsh-openai 候选；deepseek 候选不在 dsh-openai 选中态下面
    expect(fsMenuItems(modelSelectOptions('dsh-openai', ''))).toContainEqual({ id: 'glm-5.3', label: 'glm-5.3' })
    expect(modelSelectOptions('dsh-openai', '')).not.toContain('deepseek-chat')
    // 触发钮值回显：选中 provider 直出 + 异供应商候选零在场（DOM 面）
    expect(html).toContain('>dsh-openai</span>')
    expect(html).not.toContain('deepseek-chat')
    // Reasoning 下拉（用户裁决：seg 退役）：行位锚 + 触发钮中文标签回显 + seg 零残留
    expect(html).toContain('data-dswf-fs-dd="reasoning"')
    expect(html).toContain('id="dswf-fs-reasoning"')
    expect(html).toContain('>高</span>') // SAVED.reasoning='high' → 触发钮回显中文标签
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('dswf-fs-seg')
    // 选项面（纯函数锚）：value→label 映射 + 「默认」首项恒在场
    expect(reasoningMenuItems('dsh-openai', 'glm-5.3', WORKER_PROVIDER_CATALOG)).toEqual([
      { id: 'default', label: '默认' },
      { id: 'low', label: '低' },
      { id: 'medium', label: '中' },
      { id: 'high', label: '高' },
    ])
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

  // ─────────────────── 档位兼容（目录能力面——不同 provider/model 支持集不同） ───────────────────

  it('modelReasoningEfforts：目录能力面读取（缺席模型/未携带能力 = undefined 不判）', () => {
    const catalog: readonly WorkerProviderEntry[] = [
      { provider: 'zai-coding-cn', models: ['glm-5.3-flash', 'glm-5.3'], modelEfforts: { 'glm-5.3-flash': ['low', 'high', 'max'] } },
      { provider: 'dsh-deepseek', models: ['deepseek-chat'] },
    ]
    expect(modelReasoningEfforts('zai-coding-cn', 'glm-5.3-flash', catalog)).toEqual(['low', 'high', 'max'])
    expect(modelReasoningEfforts('zai-coding-cn', 'glm-5.3', catalog)).toBeUndefined() // 未携带能力
    expect(modelReasoningEfforts('dsh-deepseek', 'deepseek-chat', catalog)).toBeUndefined()
    expect(modelReasoningEfforts('unknown', 'glm-5.3-flash', catalog)).toBeUndefined()
    expect(modelReasoningEfforts('', '', catalog)).toBeUndefined()
  })

  it('reasoningLevelOptions：目录已知 → 默认恒在场 + 受支持档位过滤；目录不可知 = 全四值', () => {
    const catalog: readonly WorkerProviderEntry[] = [
      { provider: 'zai-coding-cn', models: ['glm-5.3-flash'], modelEfforts: { 'glm-5.3-flash': ['low', 'high', 'max'] } },
    ]
    // glm-5.3-flash 无 medium：过滤后 = 默认|低|高（max 不在下拉词汇内自然缺席）
    expect(reasoningLevelOptions('zai-coding-cn', 'glm-5.3-flash', catalog).map((o) => o.value)).toEqual([
      'default',
      'low',
      'high',
    ])
    // 目录不可知（静态回退面/未携带能力）= 全四值不过滤
    expect(reasoningLevelOptions('dsh-openai', 'glm-5.3', WORKER_PROVIDER_CATALOG).map((o) => o.value)).toEqual([
      'default',
      'low',
      'medium',
      'high',
    ])
    expect(REASONING_LEVEL_OPTIONS.map((o) => o.value)).toEqual(['default', 'low', 'medium', 'high'])
  })

  it('reasoningMenuItems / reasoningLabelOf：value→中文标签映射（下拉选项面 + 触发钮回显）', () => {
    const catalog: readonly WorkerProviderEntry[] = [
      { provider: 'zai-coding-cn', models: ['glm-5.3-flash'], modelEfforts: { 'glm-5.3-flash': ['low', 'high', 'max'] } },
    ]
    expect(reasoningMenuItems('zai-coding-cn', 'glm-5.3-flash', catalog)).toEqual([
      { id: 'default', label: '默认' },
      { id: 'low', label: '低' },
      { id: 'high', label: '高' },
    ])
    expect(reasoningLabelOf('default', 'zai-coding-cn', 'glm-5.3-flash', catalog)).toBe('默认')
    expect(reasoningLabelOf('high', 'zai-coding-cn', 'glm-5.3-flash', catalog)).toBe('高')
    // 被过滤档位的标签查询 = 目录外值防御性直出（正常流经 reconcile 不达）
    expect(reasoningLabelOf('medium', 'zai-coding-cn', 'glm-5.3-flash', catalog)).toBe('medium')
  })

  it('reconcileWorkerReasoning：目录已知且当前档位不支持 → 回默认值（无法兼容就不设置）；受支持/不可知 = 不动', () => {
    const catalog: readonly WorkerProviderEntry[] = [
      { provider: 'zai-coding-cn', models: ['glm-5.3-flash'], modelEfforts: { 'glm-5.3-flash': ['low', 'high', 'max'] } },
    ]
    const broken: WorkerDraft = { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoning: 'medium' }
    expect(reconcileWorkerReasoning(broken, catalog).reasoning).toBe('default')
    expect(reconcileWorkerReasoning({ ...broken, reasoning: 'high' }, catalog).reasoning).toBe('high')
    expect(reconcileWorkerReasoning({ ...broken, reasoning: 'default' }, catalog).reasoning).toBe('default')
    // 目录不可知（静态回退面）= 不判不动
    expect(reconcileWorkerReasoning(broken, WORKER_PROVIDER_CATALOG).reasoning).toBe('medium')
  })

  it('editWorkerDraft 档位兼容回退：切到不支持当前档位的模型 → 草稿自动回默认值', () => {
    const catalog: readonly WorkerProviderEntry[] = [
      { provider: 'zai-coding-cn', models: ['glm-5.3-flash'], modelEfforts: { 'glm-5.3-flash': ['low', 'high', 'max'] } },
    ]
    const state: ForgeSettingsUiState = {
      ...initialForgeSettingsUiState(),
      load: 'ready',
      catalog,
      draft: { provider: 'zai-coding-cn', model: 'other-model', reasoning: 'medium' },
    }
    const edited = editWorkerDraft(state, { model: 'glm-5.3-flash' })
    expect(edited.draft).toEqual({ provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoning: 'default' })
  })

  it('applyModelCatalogLoaded 档位兼容回退：目录后到（装载双异步径）→ saved 档位不支持时草稿回默认值待存', () => {
    const catalog: readonly WorkerProviderEntry[] = [
      { provider: 'zai-coding-cn', models: ['glm-5.3-flash'], modelEfforts: { 'glm-5.3-flash': ['low', 'high', 'max'] } },
    ]
    const saved: WorkerSettings = { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoning: 'medium' }
    let state: ForgeSettingsUiState = { ...initialForgeSettingsUiState(), catalog: WORKER_PROVIDER_CATALOG }
    state = applyForgeSettingsLoaded(state, { worker: saved })
    expect(state.draft.reasoning).toBe('medium') // 目录未到 = 不判
    state = applyModelCatalogLoaded(state, catalog)
    expect(state.draft.reasoning).toBe('default') // 目录到达 = 回默认值
    expect(state.saved).toEqual(saved) // 已持久化值不动（保存动作基准）
  })

  it('applyForgeSettingsLoaded 档位兼容回退：目录先到 → saved 档位不支持时播种草稿即回默认值', () => {
    const catalog: readonly WorkerProviderEntry[] = [
      { provider: 'zai-coding-cn', models: ['glm-5.3-flash'], modelEfforts: { 'glm-5.3-flash': ['low', 'high', 'max'] } },
    ]
    const saved: WorkerSettings = { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoning: 'medium' }
    let state: ForgeSettingsUiState = { ...initialForgeSettingsUiState(), catalog }
    state = applyForgeSettingsLoaded(state, { worker: saved })
    expect(state.draft.reasoning).toBe('default')
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
    // m3.1 D24：值回显（触发钮直出）+ 候选面纯函数双锚——glm-5.3 候选不在 deepseek 选中态
    expect(html).toContain('>deepseek-reasoner</span>')
    expect(modelSelectOptions('dsh-deepseek', 'deepseek-reasoner')).toContain('deepseek-reasoner')
    expect(modelSelectOptions('dsh-deepseek', '')).not.toContain('glm-5.3')
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
    expect(pending.draft).toEqual({ provider: '', model: '', reasoning: 'default' })
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
    expect(html).toMatch(/<button[^>]*data-dswf-fs-dd="provider"[^>]*disabled/)

    const unconfigured: ForgeSettings = {}
    const ready = applyForgeSettingsLoaded(pending, unconfigured)
    expect(ready.load).toBe('ready')
    expect(ready.draft.provider).toBe('')
    const configured = applyForgeSettingsLoaded(pending, { worker: SAVED })
    expect(configured.saved).toEqual(SAVED)
    expect(configured.draft).toEqual(SAVED)
    expect(initialWorkerDraft(undefined).reasoning).toBe('default')
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
    expect(html).toMatch(/<button[^>]*data-dswf-fs-dd="provider"[^>]*disabled/)
    expect(html).toMatch(/<button[^>]*data-dswf-fs-dd="model"[^>]*disabled/)
    expect(html).toMatch(/<button[^>]*data-dswf-fs-dd="reasoning"[^>]*disabled/) // 下拉三行齐冻结
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
    // 表单内容保留：改动值直出（触发钮回显——原生 select selected 锚迁移）
    expect(html).toContain('>glm-5.3</span>')
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
      { load: 'ready', catalog: WORKER_PROVIDER_CATALOG, draft: { ...SAVED, reasoning: 'low' }, saved: SAVED, saving: false, savedFlash: false, error: undefined },
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
      { load: 'ready', catalog: WORKER_PROVIDER_CATALOG, draft: { ...SAVED, reasoning: 'low' }, saved: SAVED, saving: false, savedFlash: false, error: undefined },
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
      { load: 'ready', catalog: WORKER_PROVIDER_CATALOG, draft: { ...SAVED }, saved: undefined, saving: true, savedFlash: false, error: undefined },
      {
        makeClient: () => { throw new Error('makeClient 不应被调用（单飞守卫）') },
        onPatch: (p) => { guardPatches.push(p) },
        onSaved: NOOP,
      },
    )
    expect(guardPatches).toEqual([])

    // 不完整守卫：未配置未填齐 = no-op（按钮 disabled 的先验同门）
    await saveForgeSettings(
      { load: 'ready', catalog: WORKER_PROVIDER_CATALOG, draft: { provider: '', model: '', reasoning: 'medium' }, saved: undefined, saving: false, savedFlash: false, error: undefined },
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

  it('已配置：值直出（触发钮回显持久值）+ 无 ⚠ + 保存禁用（值直出不脏）', () => {
    const html = body()
    expect(html).not.toContain('data-dswf-fs-unconfigured')
    expect(html).toContain('>dsh-openai</span>')
    expect(html).toContain('>glm-5.3</span>')
    expect(html).toContain('>高</span>') // reasoning=high → 触发钮回显中文标签
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

// ─────────────────── m3.1 D24 官方 Menu 下拉（原生 select 退役） ───────────────────

describe('m3.1 D24 · 官方 Menu 下拉（原生 select 退役）', () => {
  it('原生 <select> 零在场（全相位 DOM 断言——pending/ready/saving/error）', () => {
    const pending = renderToStaticMarkup(
      ForgeSettingsSectionBody({
        load: 'pending',
        draft: { provider: '', model: '', reasoning: 'medium' },
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
    const saving = body({ draft: { ...SAVED, reasoning: 'low' }, saving: true })
    const error = body({
      load: 'error',
      draft: { provider: '', model: '', reasoning: 'medium' },
      saved: undefined,
      error: { kind: 'load', message: 'IPC 缺席' },
    })
    for (const html of [pending, body(), saving, error]) {
      expect(html).not.toContain('<select')
    }
  })

  it('触发钮 = 值回显 + 官方 ChevronDown svg + aria-haspopup/expanded（原型 m31-dd-btn 刻度）', () => {
    const html = body()
    expect(html).toContain('class="dswf-fs-dd-btn"')
    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"/)
    expect(html).toMatch(/<button[^>]*aria-expanded="false"/)
    expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(2) // 两触发钮官方 ChevronDown（Reasoning seg 无 svg）
    expect(html).toContain('dswf-fs-dd-val')
  })

  it('闭态零弹层（portal 面静态不可达对照锚——开卡/项刻度/trailing Check/Esc 收 = 官方 Menu 件自带，e2e/走查面承载）', () => {
    const html = body()
    expect(html).not.toContain('role="menu"')
    expect(html).not.toContain('dswf-fs-dd-list')
  })

  it('未选择态：两触发钮「（未选择）」占位回显（空值 tertiary 面 is-empty）', () => {
    const html = body({ draft: { provider: '', model: '', reasoning: 'medium' }, saved: undefined })
    expect(html.match(new RegExp(`>${UNSELECTED_PLACEHOLDER}<`, 'g'))?.length).toBe(2)
    expect(html.match(/class="dswf-fs-dd-val is-empty"/g)?.length).toBe(2)
  })

  it('fsMenuItems：首项「（未选择）」+ 值直出行（官方 Menu items 面）', () => {
    expect(fsMenuItems([])).toEqual([{ id: '', label: UNSELECTED_PLACEHOLDER }])
    expect(fsMenuItems(['a', 'b'])).toEqual([
      { id: '', label: UNSELECTED_PLACEHOLDER },
      { id: 'a', label: 'a' },
      { id: 'b', label: 'b' },
    ])
  })
})

// ─────────────────── m3.1 D25 选项源 =「设置>模型」目录 ───────────────────

describe('m3.1 D25 · 选项源 =「设置>模型」目录（blitz 1.2 结果性承接——本任务补齐）', () => {
  const CATALOG: readonly WorkerProviderEntry[] = [
    { provider: 'zai-coding-cn', models: ['glm-5.3-flash', 'glm-5.3'] },
    { provider: 'deepseek-account', models: ['deepseek-chat', 'deepseek-reasoner'] },
  ]

  it('目录参数化：providerSelectOptions / modelSelectOptions / workerModelCandidates 消费传入目录（值 = 目录直出）', () => {
    expect(providerSelectOptions(undefined, CATALOG)).toEqual(CATALOG)
    expect(workerModelCandidates('zai-coding-cn', CATALOG)).toEqual(['glm-5.3-flash', 'glm-5.3'])
    expect(modelSelectOptions('zai-coding-cn', '', CATALOG)).toEqual(['glm-5.3-flash', 'glm-5.3'])
    expect(modelSelectOptions('zai-coding-cn', 'glm-5.3', CATALOG)).toEqual(['glm-5.3-flash', 'glm-5.3'])
    expect(workerModelCandidates('dsh-openai', CATALOG)).toEqual([])
  })

  it('目录外存量值防失显（目录参数化下不变）：saved 目录外 provider 并入 + 目录外当前 model 并入', () => {
    const legacy: WorkerSettings = { provider: 'dsh-openai', model: 'glm-5.3', reasoning: 'low' }
    expect(providerSelectOptions(legacy, CATALOG).map((o) => o.provider)).toEqual([
      'zai-coding-cn',
      'deepseek-account',
      'dsh-openai',
    ])
    expect(modelSelectOptions('dsh-openai', 'glm-5.3', CATALOG)).toEqual(['glm-5.3'])
  })

  it('applyProviderChange / editWorkerDraft 联动以现行目录为准（新目录不含当前 model → 清空待重选）', () => {
    const draft = { provider: 'zai-coding-cn', model: 'glm-5.3', reasoning: 'high' as ReasoningLevel }
    expect(applyProviderChange(draft, 'deepseek-account', CATALOG)).toEqual({
      provider: 'deepseek-account',
      model: '',
      reasoning: 'high',
    })
    const state: ForgeSettingsUiState = {
      ...initialForgeSettingsUiState(),
      load: 'ready',
      draft,
      saved: undefined,
      catalog: CATALOG,
    }
    expect(editWorkerDraft(state, { provider: 'deepseek-account' }).draft).toEqual({
      provider: 'deepseek-account',
      model: '',
      reasoning: 'high',
    })
  })

  it('applyModelCatalogLoaded：目录入位（undefined = 静态目录回退保留不动）；initial = 静态目录', () => {
    const initial = initialForgeSettingsUiState()
    expect(initial.catalog).toEqual(WORKER_PROVIDER_CATALOG)
    expect(applyModelCatalogLoaded(initial, CATALOG).catalog).toEqual(CATALOG)
    expect(applyModelCatalogLoaded(applyModelCatalogLoaded(initial, CATALOG), undefined).catalog).toEqual(CATALOG)
  })

  it('fetchModelCatalogEntries：装载器缺席 / 装载拒绝 = undefined（静默回退）；成功直出', async () => {
    expect(await fetchModelCatalogEntries(undefined)).toBeUndefined()
    expect(await fetchModelCatalogEntries(() => Promise.reject(new Error('boom')))).toBeUndefined()
    expect(await fetchModelCatalogEntries(async () => CATALOG)).toEqual(CATALOG)
  })

  it('目录装载后 provider 选项与「设置>模型」目录一致（fsMenuItems 组合 = 目录供应商全集）', () => {
    expect(fsMenuItems(providerSelectOptions(undefined, CATALOG).map((entry) => entry.provider))).toEqual([
      { id: '', label: UNSELECTED_PLACEHOLDER },
      { id: 'zai-coding-cn', label: 'zai-coding-cn' },
      { id: 'deepseek-account', label: 'deepseek-account' },
    ])
  })

  it('装载壳静态渲染零目录装载调用（effects 归交互面）；loadModelCatalog prop 缺省不炸', () => {
    let catalogCalls = 0
    const html = renderToStaticMarkup(
      <ForgeSettingsSection
        makeClient={() => clientWith()}
        loadModelCatalog={() => {
          catalogCalls += 1
          return Promise.resolve(CATALOG)
        }}
      />,
    )
    expect(catalogCalls).toBe(0)
    expect(html).toContain('data-dswf-fs-dd="provider"')
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
    expect(html).toMatch(/<button[^>]*data-dswf-fs-dd="provider"[^>]*disabled/)
    expect(html).not.toContain('data-dswf-fs-unconfigured')
    expect(html).toMatch(/<button[^>]*data-dswf-fs-save[^>]*disabled/)
  })

  it('4.7 slot 座位契约：官方 owner share（close）递达下渲染不受扰——分区整节可见（标题 + worker 小节）', () => {
    // 官方 SettingsSectionOwnerProps = { close }（ui-settings contract/slots——壳拥有
    // 对话框可见性，分区唯一递达动作）；组件零「离开设置」流 = 不消费不炸。
    const html = renderToStaticMarkup(
      <ForgeSettingsSection close={() => {}} makeClient={() => clientWith()} />,
    )
    expect(html).toContain('data-dswf-fs-title')
    expect(html).toContain('Forge设置')
    expect(html).toContain('data-dswf-fs-part="worker"')
  })
})
