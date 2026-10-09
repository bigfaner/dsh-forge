// Forge设置 分区组件（定位：业务——M3 4.5 UF-2 半身（Build）：分区标题 + worker 小节
//（多小节结构可扩展——fs > fs-part 分层）+ 默认 LLM 三项行式控件（标签左/控件右，对齐
// dsh 通用设置形态）+ 未配置 ⚠ 占位 + 脏态实时 + 保存五态反馈）。读写 = forge:settings/{get,set}
//（4.1 通道——forgeSettings 服务单门；图 11：UI 与 dispatchTask 同门消费，改完即生效无重启）。
// slot 注册 = 4.7（settings.section——本件自带分区容器/标题，注入即整节）。
// Hard Rule：配置面恒三项（Provider/Model/Reasoning）——无 Output 上限回潮（用户裁决 2026-10-07）。
// m3.1 D24：Provider/Model 原生 select 退役 → 官方 Menu 件（MenuSurface 半透卡
// [radius-lg 16/pad 4/blur40 + elevation-prominent] + 项 min-h 34/r8/13px + trailing 官方
// Check + Esc/点外收——全部官方件自带；触发钮 = 值 + 官方 ChevronDown，原型 m31-dd 刻度）。
// m3.1 D25：选项值 =「设置>模型」目录（remote.session.modelCatalog——插件 inject face
// loadModelCatalog 递达；缺席/失败 = 静态目录回退面 WORKER_PROVIDER_CATALOG）。
// 组装分工沿 M2/M3 对话框形制：Body = 纯渲染体（renderToStaticMarkup 全相位可测）；
// ForgeSettingsSection = 装载壳（mount 装载 + 受控态 + rpc 保存）。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  IconChevronDownOutlineRegular,
  Menu,
  SegmentedControl,
  type MenuEntry,
  type SegmentedControlOption,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  type ForgeSettings,
  type ReasoningLevel,
  type SetForgeSettingsInput,
  type WorkerSettings,
} from '@dsh-forge/contracts'
import { rpcUiState, type RpcUiStateKind } from '../../rpc/ui-state.js'
import { RpcClientError } from '../../rpc/errors.js'
import { preloadRpcClientFactory, type ForgeRpcClient, type RpcClientFactory } from '../../rpc/index.js'
import './forge-settings.css'

// ─────────────────────────── 展示常量（apps/web 层——持久域为自由字符串） ───────────────────────────

/** 供应商 × 模型二维候选表（AC2：Provider 联动 Model 候选刷新——ui-design Data Binding；
 * 展示常量非校验面：forge-settings.json 持久值可为目录外字符串，选择面防御性并入防失显。
 * m3.1 D25：静态回退面——目录装载（loadModelCatalog）成功时被「设置>模型」目录取代） */
export interface WorkerProviderEntry {
  readonly provider: string
  readonly models: readonly string[]
}

export const WORKER_PROVIDER_CATALOG: readonly WorkerProviderEntry[] = [
  { provider: 'dsh-openai', models: ['glm-5.3-flash', 'glm-5.3'] },
  { provider: 'dsh-deepseek', models: ['deepseek-chat', 'deepseek-reasoner'] },
]

/** 下拉空值占位（m3.1 D24：fsMenuItems 首项与触发钮回显同源） */
export const UNSELECTED_PLACEHOLDER = '（未选择）'

/** Reasoning 三段 seg 选项（AC2：低|中|高——contracts REASONING_LEVELS 词汇；
 * reasoning → agentOptions.effort 直映射 = Interface 1 设置三段与上游请求字段一对一） */
export const REASONING_SEG_OPTIONS: readonly SegmentedControlOption<ReasoningLevel>[] = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]

/** worker 小节说明一行（ui-design Layout：11px tertiary） */
export const WORKER_SECTION_HINT = '默认 LLM（全部执行子代理统一档位）'

/** 未配置态 ⚠ 占位（AC3 + 图 11 语义：worker 键缺席 → dispatchTask 不携带 agentOptions 回退父会话继承） */
export const UNCONFIGURED_NOTICE = '⚠ 未配置——worker 派发将回退父会话继承（显式提示，不静默）'

/** 保存成功注记（AC4：下次派发生效——改完即生效无重启，图 11 虚线「下次派发即生效」） */
export const SAVED_EFFECT_NOTE =
  '已保存 ✓——下次 run-tasks 派发经 agentOptions 携带生效（无需重启，优先于父会话继承）'

/** 分区底注一行非交互（AC4：未来注记文案锚点——不实现） */
export const FUTURE_NOTE = '按任务类型指派特定 LLM = 未来注记（不实现）'

/** 供应商 → 模型候选（联动纯函数：空/未知供应商 = 空候选面；m3.1 D25 目录参数化——缺省静态回退面） */
export function workerModelCandidates(
  provider: string | undefined,
  catalog: readonly WorkerProviderEntry[] = WORKER_PROVIDER_CATALOG,
): readonly string[] {
  if (provider === undefined || provider === '') return []
  return catalog.find((entry) => entry.provider === provider)?.models ?? []
}

/** Provider 选择面选项 = 目录 ∪ 已持久化目录外值（自由字符串持久域防失显；目录缺省 = 静态回退面） */
export function providerSelectOptions(
  saved: WorkerSettings | undefined,
  catalog: readonly WorkerProviderEntry[] = WORKER_PROVIDER_CATALOG,
): readonly WorkerProviderEntry[] {
  if (saved !== undefined && !catalog.some((entry) => entry.provider === saved.provider)) {
    return [...catalog, { provider: saved.provider, models: [saved.model] }]
  }
  return catalog
}

/** Model 选择面选项 = 当前供应商候选 ∪ 目录外当前值（同上防失显；目录缺省 = 静态回退面） */
export function modelSelectOptions(
  provider: string | undefined,
  model: string,
  catalog: readonly WorkerProviderEntry[] = WORKER_PROVIDER_CATALOG,
): readonly string[] {
  const candidates = workerModelCandidates(provider, catalog)
  if (model !== '' && !candidates.includes(model)) return [...candidates, model]
  return candidates
}

// ─────────────────────────── 纯模型（AC2/AC3 判定面） ───────────────────────────

/** worker 三项表单草稿（reasoning seg 恒有三值之一——无空态） */
export interface WorkerDraft {
  readonly provider: string
  readonly model: string
  readonly reasoning: ReasoningLevel
}

/** 未配置起步草稿（provider/model 空 + reasoning 缺省中——prototype fs 缺省态同值） */
export function initialWorkerDraft(saved: WorkerSettings | undefined): WorkerDraft {
  if (saved === undefined) return { provider: '', model: '', reasoning: 'medium' }
  return { provider: saved.provider, model: saved.model, reasoning: saved.reasoning }
}

/** 完整判定（AC3 填齐激活）：provider ∧ model 非空（reasoning 恒有值不参与） */
export function isWorkerDraftComplete(draft: WorkerDraft): boolean {
  return draft.provider !== '' && draft.model !== ''
}

/** 脏态判定：与已持久化值等值比较（未配置 = 对缺席——填齐即脏） */
export function isWorkerDraftDirty(draft: WorkerDraft, saved: WorkerSettings | undefined): boolean {
  if (saved === undefined) return isWorkerDraftComplete(draft)
  return (
    draft.provider !== saved.provider || draft.model !== saved.model || draft.reasoning !== saved.reasoning
  )
}

/** 保存亮起（AC3）：完整 ∧ 脏（未配置填齐激活 / 已配置改后激活；值直出不脏禁用） */
export function canSaveWorkerDraft(draft: WorkerDraft, saved: WorkerSettings | undefined): boolean {
  return isWorkerDraftComplete(draft) && isWorkerDraftDirty(draft, saved)
}

/** Provider 联动（AC2）：新供应商候选含当前 model → 保留；不含 → 清空待重选
 *  （m3.1 D25：候选判定以现行目录为准——缺省静态回退面） */
export function applyProviderChange(
  draft: WorkerDraft,
  provider: string,
  catalog: readonly WorkerProviderEntry[] = WORKER_PROVIDER_CATALOG,
): WorkerDraft {
  if (provider === draft.provider) return draft
  const model = workerModelCandidates(provider, catalog).includes(draft.model) ? draft.model : ''
  return { provider, model, reasoning: draft.reasoning }
}

// ─────────────────────────── 受控态 + 编辑/装载动作（纯函数） ───────────────────────────

/** 错误两形（load = 装载读取失败留场 + 重试 / save = 保存失败留场可重试） */
export type ForgeSettingsError = { readonly kind: 'load' | 'save'; readonly message: string }

/** 分区受控态（装载壳持有） */
export interface ForgeSettingsUiState {
  readonly load: 'pending' | 'ready' | 'error'
  readonly draft: WorkerDraft
  /** 已持久化 worker 段（undefined = 未配置——⚠ 占位与脏态基准） */
  readonly saved: WorkerSettings | undefined
  /** Provider/Model 选项目录（m3.1 D25：初始 = 静态回退面；装载成功入位「设置>模型」目录） */
  readonly catalog: readonly WorkerProviderEntry[]
  readonly saving: boolean
  /** 成功 ✓ 反馈位（编辑即复位——按钮 label 与生效注记行的呈现源） */
  readonly savedFlash: boolean
  readonly error: ForgeSettingsError | undefined
}

/** 初始态：装载在途（⚠ 未知不显——saved 真值待 get 归来；目录 = 静态回退面起步） */
export function initialForgeSettingsUiState(): ForgeSettingsUiState {
  return {
    load: 'pending',
    draft: initialWorkerDraft(undefined),
    saved: undefined,
    catalog: WORKER_PROVIDER_CATALOG,
    saving: false,
    savedFlash: false,
    error: undefined,
  }
}

/** 装载成功：worker 在场/缺席播种草稿（值直出 / 空值起步） */
export function applyForgeSettingsLoaded(
  state: ForgeSettingsUiState,
  settings: ForgeSettings,
): ForgeSettingsUiState {
  return {
    ...state,
    load: 'ready',
    saved: settings.worker,
    draft: initialWorkerDraft(settings.worker),
    error: undefined,
  }
}

/** 装载失败：错误留场（重试归装载壳 nonce 重发） */
export function applyForgeSettingsLoadError(
  state: ForgeSettingsUiState,
  message: string,
): ForgeSettingsUiState {
  return { ...state, load: 'error', error: { kind: 'load', message } }
}

/** 模型目录入位（m3.1 D25 装载动作）：undefined = 装载缺席/失败——静态目录回退面保留不动 */
export function applyModelCatalogLoaded(
  state: ForgeSettingsUiState,
  catalog: readonly WorkerProviderEntry[] | undefined,
): ForgeSettingsUiState {
  if (catalog === undefined) return state
  return { ...state, catalog }
}

/**
 * 编辑动作（AC3 脏态实时——Menu onSelect 与 Reasoning seg 同喂本函数，受控值实时回流）：
 * provider 编辑先过联动（model 不在新候选集清空——m3.1 D25 以 state.catalog 现行目录为准），
 * 编辑即清成功反馈与保存错（新待存值在场）。恒不触碰 load/saved（结构性不动装载面）。
 */
export function editWorkerDraft(
  state: ForgeSettingsUiState,
  patch: { readonly provider?: string; readonly model?: string; readonly reasoning?: ReasoningLevel },
): ForgeSettingsUiState {
  let draft = state.draft
  if (patch.provider !== undefined) draft = applyProviderChange(draft, patch.provider, state.catalog)
  if (patch.model !== undefined) draft = { ...draft, model: patch.model }
  if (patch.reasoning !== undefined) draft = { ...draft, reasoning: patch.reasoning }
  return { ...state, draft, savedFlash: false, error: undefined }
}

// ─────────────────────────── 保存链（纯异步面） ───────────────────────────

/** 保存结果（归一——永不 reject） */
export type WorkerSettingsSaveOutcome =
  | { readonly ok: true; readonly saved: WorkerSettings }
  | { readonly ok: false; readonly error: { readonly message: string; readonly uiState: RpcUiStateKind } }

/** 装载读取（mount——rpc settings.get 唯一通道；typed error → message） */
export async function fetchForgeSettings(
  client: ForgeRpcClient,
): Promise<{ readonly ok: true; readonly settings: ForgeSettings } | { readonly ok: false; readonly error: { readonly message: string } }> {
  try {
    const settings = await client.settings.get()
    return { ok: true, settings }
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } }
  }
}

/** 模型目录装载（m3.1 D25——插件 inject face loadModelCatalog：remote.session.modelCatalog
 *  解信封面；装载器缺席/拒绝 = undefined 静默回退静态目录，不炸装载面） */
export async function fetchModelCatalogEntries(
  load: (() => Promise<readonly WorkerProviderEntry[] | undefined>) | undefined,
): Promise<readonly WorkerProviderEntry[] | undefined> {
  if (load === undefined) return undefined
  try {
    return await load()
  } catch {
    return undefined
  }
}

/** 保存提交（AC4——rpc settings.set 唯一通道；整体覆写 worker 段 = SetForgeSettingsInput 形状；
 * typed error → message + rpcUiState 映射） */
export async function submitWorkerSettings(
  client: ForgeRpcClient,
  input: SetForgeSettingsInput,
): Promise<WorkerSettingsSaveOutcome> {
  try {
    await client.settings.set(input)
    return { ok: true, saved: input.worker }
  } catch (error) {
    if (error instanceof RpcClientError) {
      return { ok: false, error: { message: error.message, uiState: rpcUiState(error.code) } }
    }
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error), uiState: 'error-bar' } }
  }
}

/** 保存动作补丁——恒不含 draft/load/saved（表单内容与装载面结构性不被清空） */
export type ForgeSettingsPatch = Partial<Omit<ForgeSettingsUiState, 'draft' | 'load' | 'saved'>>

/** 保存动作依赖（装载壳注入） */
export interface ForgeSettingsSaveDeps {
  readonly makeClient: RpcClientFactory
  /** 已持久化值入位（成功路径——canSave 基准更新 → 按钮复位禁用） */
  readonly onSaved: (saved: WorkerSettings) => void
  readonly onPatch: (patch: ForgeSettingsPatch) => void
}

/**
 * 保存动作（AC4 主流程——纯异步面）：单飞守卫（saving 中 no-op）+ 不完整守卫（canSave
 * 先验同门——按钮 disabled 防线的函数面）→ 提交中补丁（saving=true 输入冻结）→
 * settings.set → 成功 onSaved + ✓ 反馈 / 失败错误留场可重试（saved 不动 = 脏态基准原样）。
 */
export async function saveForgeSettings(state: ForgeSettingsUiState, deps: ForgeSettingsSaveDeps): Promise<void> {
  if (state.saving) return
  if (!canSaveWorkerDraft(state.draft, state.saved)) return
  deps.onPatch({ error: undefined, saving: true, savedFlash: false })
  const out = await submitWorkerSettings(deps.makeClient(), { worker: { ...state.draft } })
  if (out.ok) {
    deps.onSaved(out.saved)
    deps.onPatch({ error: undefined, saving: false, savedFlash: true })
    return
  }
  deps.onPatch({ error: { kind: 'save', message: out.error.message }, saving: false })
}

// ─────────────────────────── 纯渲染体（全相位 renderToStaticMarkup 可测） ───────────────────────────

/** 下拉选项面（m3.1 D24——官方 Menu items 生成纯函数：首项「（未选择）」+ 值直出行） */
export function fsMenuItems(values: readonly string[]): readonly MenuEntry[] {
  return [{ id: '', label: UNSELECTED_PLACEHOLDER }, ...values.map((value) => ({ id: value, label: value }))]
}

/** 下拉行位（Body 两行判别——data-dswf-fs-dd 值） */
export type FsDropdownAnchor = 'provider' | 'model'

export interface FsDropdownProps {
  /** 触发钮 id（label htmlFor 关联） */
  readonly triggerId: string
  /** 行位锚（data-dswf-fs-dd——provider/model） */
  readonly anchor: FsDropdownAnchor
  /** 当前值（'' = 未选择——触发钮回显占位 + 选中项 trailing Check） */
  readonly value: string
  /** 选项值集（官方 Menu items 经 fsMenuItems 组装） */
  readonly values: readonly string[]
  readonly disabled: boolean
  /** 选中（Menu onSelect——'' = 清空待选） */
  readonly onSelect: (value: string) => void
}

/**
 * 行式下拉（m3.1 D24：官方 Menu 件——MenuSurface 半透卡[radius-lg 16/pad 4/blur40 半透 +
 * elevation-prominent] + 项[min-h 34/r8/13px + trailing 官方 Check] + Esc/点外收全部官方件
 * 自带；触发钮 = 值 + 官方 ChevronDown[原型 m31-dd-btn 刻度：min-h 34/r8/13]）。
 * portal = 设置对话框 options 列 overflow 滚动裁剪逃逸（官方 Menu portal 口径，dswf-hero-
 * picker-list 同先例）；开合 = 本叶本地态（Body 纯渲染体不持有——闭态静态可测对照锚）。
 */
export function FsDropdown({ triggerId, anchor, value, values, disabled, onSelect }: FsDropdownProps): ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <Menu
      className="dswf-fs-dd"
      listClassName="dswf-fs-dd-list"
      open={open}
      portal
      side="bottom"
      items={fsMenuItems(values)}
      selectedId={value}
      selection="check"
      onClose={() => {
        setOpen(false)
      }}
      onSelect={(id) => {
        setOpen(false)
        onSelect(id)
      }}
      anchor={
        <button
          type="button"
          id={triggerId}
          className="dswf-fs-dd-btn"
          data-dswf-fs-dd={anchor}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => {
            setOpen(!open)
          }}
        >
          <span className={value === '' ? 'dswf-fs-dd-val is-empty' : 'dswf-fs-dd-val'}>
            {value === '' ? UNSELECTED_PLACEHOLDER : value}
          </span>
          <IconChevronDownOutlineRegular size={14} className="dswf-fs-dd-caret" />
        </button>
      }
    />
  )
}

export interface ForgeSettingsSectionBodyProps {
  readonly load: 'pending' | 'ready' | 'error'
  readonly draft: WorkerDraft
  readonly saved: WorkerSettings | undefined
  /** Provider/Model 选项目录（m3.1 D25——缺省静态回退面；装载壳透传装载后目录） */
  readonly catalog?: readonly WorkerProviderEntry[]
  readonly saving: boolean
  readonly savedFlash: boolean
  readonly error: ForgeSettingsError | undefined
  readonly onEditProvider: (provider: string) => void
  readonly onEditModel: (model: string) => void
  readonly onEditReasoning: (level: ReasoningLevel) => void
  readonly onSave: () => void
  readonly onRetryLoad: () => void
}

/**
 * Forge设置 分区纯渲染体（AC1 结构：分区标题[底色条+13px/600] + worker 小节[12px/600 次色+
 * 分隔线——fs > fs-part 分层多小节可并列] + 行式控件[标签左/控件右]三项 + 保存动作行 +
 * 未配置 ⚠ + 错误行 + 分区底注未来注记[非交互]）。装载失败 = 错误行 + 重试（控件面不渲染）；
 * 装载在途/保存中 = 控件冻结（editing）。
 */
export function ForgeSettingsSectionBody({
  load,
  draft,
  saved,
  catalog = WORKER_PROVIDER_CATALOG,
  saving,
  savedFlash,
  error,
  onEditProvider,
  onEditModel,
  onEditReasoning,
  onSave,
  onRetryLoad,
}: ForgeSettingsSectionBodyProps): ReactNode {
  const ready = load === 'ready'
  const editing = saving || !ready
  const canSave = ready && !saving && canSaveWorkerDraft(draft, saved)
  const showUnconfigured = ready && saved === undefined && !isWorkerDraftComplete(draft)
  const saveLabel = saving ? '保存中…' : savedFlash ? '已保存 ✓' : '保存'
  const savePhase = saving ? 'saving' : savedFlash ? 'saved' : 'idle'
  return (
    <div className="dswf-fs" data-dswf-fs="">
      <div className="dswf-fs-title" data-dswf-fs-title="">
        Forge设置
      </div>
      <section className="dswf-fs-part" data-dswf-fs-part="worker">
        <h4 className="dswf-fs-part-title">worker</h4>
        <p className="dswf-fs-hint">{WORKER_SECTION_HINT}</p>
        {load === 'error' ? (
          <>
            <p className="dswf-fs-err" role="alert" data-dswf-fs-error="load">
              读取设置失败：{error?.message ?? ''}
            </p>
            <div className="dswf-fs-actions">
              <Button variant="outline" size="sm" className="dswf-fs-retry" data-dswf-fs-retry="" onClick={onRetryLoad}>
                重试
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="dswf-fs-row">
              <label className="dswf-fs-label" htmlFor="dswf-fs-provider">
                Provider
              </label>
              <FsDropdown
                triggerId="dswf-fs-provider"
                anchor="provider"
                value={draft.provider}
                values={providerSelectOptions(saved, catalog).map((entry) => entry.provider)}
                disabled={editing}
                onSelect={onEditProvider}
              />
            </div>
            <div className="dswf-fs-row">
              <label className="dswf-fs-label" htmlFor="dswf-fs-model">
                Model
              </label>
              <FsDropdown
                triggerId="dswf-fs-model"
                anchor="model"
                value={draft.model}
                values={modelSelectOptions(draft.provider, draft.model, catalog)}
                disabled={editing}
                onSelect={onEditModel}
              />
            </div>
            <div className="dswf-fs-row">
              <span className="dswf-fs-label">Reasoning</span>
              <div className="dswf-fs-seg" data-dswf-fs-reasoning="">
                <SegmentedControl
                  id="dswf-fs-reasoning"
                  value={draft.reasoning}
                  options={REASONING_SEG_OPTIONS}
                  onChange={onEditReasoning}
                  label="Reasoning（低|中|高）"
                  disabled={editing}
                />
              </div>
            </div>
            <div className="dswf-fs-actions">
              <Button
                variant="primary"
                size="sm"
                className="dswf-fs-save"
                data-dswf-fs-save=""
                data-dswf-fs-phase={savePhase}
                disabled={!canSave}
                onClick={onSave}
              >
                {saveLabel}
              </Button>
            </div>
            {showUnconfigured ? (
              <p className="dswf-fs-unconfigured" data-dswf-fs-unconfigured="">
                {UNCONFIGURED_NOTICE}
              </p>
            ) : null}
            {savedFlash ? (
              <p className="dswf-fs-saved-note" data-dswf-fs-saved-note="">
                {SAVED_EFFECT_NOTE}
              </p>
            ) : null}
            {error?.kind === 'save' ? (
              <p className="dswf-fs-err" role="alert" data-dswf-fs-error="save">
                保存失败：{error.message}——表单保留可重试
              </p>
            ) : null}
          </>
        )}
      </section>
      <p className="dswf-fs-future-note" data-dswf-fs-future-note="">
        {FUTURE_NOTE}
      </p>
    </div>
  )
}

// ─────────────────────────── 装载壳（mount 装载 + 受控态 + rpc 保存） ───────────────────────────

export interface ForgeSettingsSectionProps {
  /**
   * 官方 owner share（SettingsSectionOwnerProps 结构同型镜像——ui-settings contract/slots：
   * 壳拥有对话框可见性，分区唯一递达动作）。组件零「离开设置」流 = 不消费；
   * 在场保 slot 座位 props 契约完整（4.7 注入即整节）。
   */
  readonly close?: () => void
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
  /**
   * 模型目录装载器（m3.1 D25：插件 inject face——remote.session.modelCatalog 惰性反射
   * 解信封 → [{provider, models}]；缺席/失败 = undefined → 静态目录回退面）。
   */
  readonly loadModelCatalog?: () => Promise<readonly WorkerProviderEntry[] | undefined>
}

/**
 * Forge设置 分区装载壳：mount → settings.get 装载（seq 竞态守卫——重试丢弃过期回包）→
 * 受控态（编辑 = editWorkerDraft 纯函数；保存 = saveForgeSettings 纯动作 + onSaved 基准入位）。
 * 分区落位（设置对话框 settings.section slot）= 4.7 接线。
 */
export function ForgeSettingsSection({
  makeClient = preloadRpcClientFactory,
  loadModelCatalog,
}: ForgeSettingsSectionProps): ReactNode {
  const [state, setState] = useState<ForgeSettingsUiState>(initialForgeSettingsUiState)
  const [reloadNonce, setReloadNonce] = useState(0)
  const seqRef = useRef(0)

  useEffect(() => {
    const seq = ++seqRef.current
    void fetchForgeSettings(makeClient()).then((out) => {
      if (seq !== seqRef.current) return
      setState((prev) =>
        out.ok ? applyForgeSettingsLoaded(prev, out.settings) : applyForgeSettingsLoadError(prev, out.error.message),
      )
    })
    // m3.1 D25：模型目录装载（静默回退——失败/缺席保留静态目录；seq 竞态守卫同门）
    void fetchModelCatalogEntries(loadModelCatalog).then((catalog) => {
      if (seq !== seqRef.current) return
      if (catalog !== undefined) setState((prev) => applyModelCatalogLoaded(prev, catalog))
    })
  }, [makeClient, loadModelCatalog, reloadNonce])

  return (
    <ForgeSettingsSectionBody
      load={state.load}
      draft={state.draft}
      saved={state.saved}
      catalog={state.catalog}
      saving={state.saving}
      savedFlash={state.savedFlash}
      error={state.error}
      onEditProvider={(provider) => {
        setState((prev) => editWorkerDraft(prev, { provider }))
      }}
      onEditModel={(model) => {
        setState((prev) => editWorkerDraft(prev, { model }))
      }}
      onEditReasoning={(reasoning) => {
        setState((prev) => editWorkerDraft(prev, { reasoning }))
      }}
      onSave={() => {
        void saveForgeSettings(state, {
          makeClient,
          onSaved: (saved) => {
            setState((prev) => ({ ...prev, saved }))
          },
          onPatch: (patch) => {
            setState((prev) => ({ ...prev, ...patch }))
          },
        })
      }}
      onRetryLoad={() => {
        setState(initialForgeSettingsUiState())
        setReloadNonce((n) => n + 1)
      }}
    />
  )
}
