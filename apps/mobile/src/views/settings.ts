/**
 * settings 最小化设置面板（浮层，mockup 屏⑦）——composer 滑杆钮打开：
 * 无标题/无说明文本；模型行（点开 #/models 唯一子视图）+ 推理等级分段控件内联
 * （选档即生效：forge:proxy/session-select-model 即时下发；无子视图）。
 * 推理档位随当前模型 reasoning.efforts 联动——不支持则整段隐藏。
 * （R12 口径：模型面 = forge:proxy/session-model-catalog 读 + session-select-model 写，
 * preset 锁定语义 host 侧。）
 *
 * 纯逻辑面（单测主战场）：effort 档位映射 / 当前档收敛 / 乐观回滚状态机。
 */
import type { RemoteRpc } from '../core/rpc.ts'
import { PROXY_SESSION_MODEL_CATALOG_CHANNEL, PROXY_SESSION_SELECT_MODEL_CHANNEL, proxyCall } from '../core/rpc.ts'
import type { ModelCatalog, ModelSelection } from './models.ts'
import { coerceModelCatalog, isSameModel } from './models.ts'
import { el, ensureIconSprite } from '../widgets/msg-cards.ts'

// ---------------------------------------------------------------------------
// 纯函数：推理档位
// ---------------------------------------------------------------------------

/** 档位取值 → 显示词（mockup 口径：默认/低/中/高；越界取值原样展示）。 */
const EFFORT_LABELS: Readonly<Record<string, string>> = {
  default: '默认',
  minimal: '极低',
  low: '低',
  medium: '中',
  high: '高',
  max: '最高',
}

export interface EffortOption {
  readonly value: string
  readonly label: string
}

/** 模型支持档位 → 分段选项（空数组 = 不支持，调用方隐藏分段）。 */
export function effortOptions(efforts: readonly string[]): readonly EffortOption[] {
  return efforts.map((value) => ({ value, label: EFFORT_LABELS[value] ?? value }))
}

export const DEFAULT_EFFORT = 'default'

/** 当前选中档：会话档在支持列表内取之；否则取列表首个（default 优先缺席时兜底）。 */
export function currentEffort(efforts: readonly string[], reasoningEffort: string | undefined): string | undefined {
  if (efforts.length === 0) return undefined
  if (reasoningEffort !== undefined && efforts.includes(reasoningEffort)) return reasoningEffort
  return efforts.includes(DEFAULT_EFFORT) ? DEFAULT_EFFORT : efforts[0]
}

// ---------------------------------------------------------------------------
// 纯函数：乐观选档回滚状态机
// ---------------------------------------------------------------------------

export interface EffortDraft {
  readonly pending: boolean
  readonly picked: string | undefined
}

/** 点档：pending 置位 + 乐观picked；失败回滚到 previous。 */
export function commitEffort(draft: EffortDraft, value: string): EffortDraft {
  return { pending: true, picked: value }
}

export function rollbackEffort(draft: EffortDraft, previous: string | undefined): EffortDraft {
  return { pending: false, picked: previous }
}

export function settleEffort(draft: EffortDraft, value: string): EffortDraft {
  return { pending: false, picked: value }
}

// ---------------------------------------------------------------------------
// 视图装配
// ---------------------------------------------------------------------------

export interface SettingsDeps {
  readonly rpc: RemoteRpc
  readonly sessionId: string
  /** 模型行点击 → 打开 #/models 唯一子视图（路由侧装配）。 */
  readonly onOpenModels?: () => void
}

export interface SettingsHandle {
  /** 浮层根（.sheet-mask，hidden 控制）。 */
  readonly root: HTMLElement
  open(): void
  close(): void
  /** 重新拉取 session.models 收敛当前模型/档位（models 子视图返回后调用）。 */
  refresh(): Promise<void>
}

export function createSettingsSheet(deps: SettingsDeps): SettingsHandle {
  const root = el('div', 'sheet-mask')
  root.hidden = true
  const sheet = el('div', 'sheet settings-sheet')
  sheet.appendChild(el('div', 'grab'))
  root.appendChild(sheet)
  ensureIconSprite(root)

  let catalog: ModelCatalog = { models: [] }
  let draft: EffortDraft = { pending: false, picked: undefined }
  /** 乐观写盘失败时的回滚锚点。 */
  let previousEffort: string | undefined

  function currentModel(): ModelSelection | undefined {
    return catalog.current
  }

  function supportedEfforts(): readonly string[] {
    const current = currentModel()
    if (current === undefined) return []
    return catalog.models.find((model) => isSameModel(model, current))?.efforts ?? []
  }

  function render(): void {
    sheet.textContent = ''
    sheet.appendChild(el('div', 'grab'))
    const current = currentModel()

    // 模型行（无标题无说明文本——lbl 属行内词汇）
    const row = el('div', 'setrow')
    row.appendChild(el('span', 'lbl', '模型'))
    row.appendChild(el('span', 'val', current?.name ?? '…'))
    row.insertAdjacentHTML('beforeend', '<span class="chev-r"><svg class="ic"><use href="#i-chev"/></svg></span>')
    row.addEventListener('click', () => deps.onOpenModels?.())
    sheet.appendChild(row)

    // 推理等级分段：随模型 efforts 联动，不支持则整段隐藏
    const efforts = supportedEfforts()
    if (efforts.length === 0 || current === undefined) return
    sheet.appendChild(el('div', 'grp-title', '推理等级'))
    const seg = el('div', 'seg')
    const picked = draft.picked ?? currentEffort(efforts, current.reasoningEffort)
    for (const option of effortOptions(efforts)) {
      const button = el('button', option.value === picked ? 'picked' : undefined, option.label)
      button.disabled = draft.pending
      button.addEventListener('click', () => void selectEffort(option.value))
      seg.appendChild(button)
    }
    sheet.appendChild(seg)
  }

  async function selectEffort(value: string): Promise<void> {
    const current = currentModel()
    if (current === undefined || draft.pending) return
    previousEffort = draft.picked ?? currentEffort(supportedEfforts(), current.reasoningEffort)
    draft = commitEffort(draft, value) // 选档即生效：乐观 picked
    render()
    try {
      // 选档即生效（SessionSelectModelRequest + reasoningEffort——preset 锁定语义 host 侧）
      await proxyCall(deps.rpc, PROXY_SESSION_SELECT_MODEL_CHANNEL, {
        sessionId: deps.sessionId,
        provider: current.provider,
        model: current.id,
        reasoningEffort: value,
      })
      draft = settleEffort(draft, value)
    } catch {
      draft = rollbackEffort(draft, previousEffort) // 失败回滚显示
    }
    render()
  }

  async function refresh(): Promise<void> {
    try {
      catalog = coerceModelCatalog(await proxyCall(deps.rpc, PROXY_SESSION_MODEL_CATALOG_CHANNEL, {}))
    } catch {
      /* 拉取失败保留旧数据，面板保持可用 */
    }
    draft = { pending: false, picked: undefined }
    render()
  }

  return {
    root,
    open() {
      root.hidden = false
      void refresh()
    },
    close() {
      root.hidden = true
    },
    refresh: () => refresh(),
  }
}
