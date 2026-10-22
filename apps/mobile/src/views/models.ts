/**
 * models 模型列表（根 `#/models`，mockup 屏⑧）——设置面板唯一子视图：
 * 返回钮与搜索框同行（sticky）、~300ms 防抖检索、提供商分组折叠（计数）、
 * 最近使用置顶（localStorage 按配对域隔离，不可用静默降级为空列表）、
 * 当前模型对勾 + 选中态（primary 边 + 7% tint）；过滤态扁平列表；选中即生效返回。
 *
 * 纯逻辑面（单测主战场）：catalog 收敛 / 检索过滤 / 分组计数 / 最近使用栈 / 防抖器。
 */
import type { RemoteRpc } from '../core/rpc.ts'
import { DisconnectedError } from '../core/rpc.ts'
import { PROXY_SESSION_MODEL_CATALOG_CHANNEL, PROXY_SESSION_SELECT_MODEL_CHANNEL, proxyCall } from '../core/rpc.ts'
import { el, ensureIconSprite } from '../widgets/msg-cards.ts'

// ---------------------------------------------------------------------------
// 纯函数：catalog 收敛（官方 session-model-catalog groups 形状，缺字段 fail-soft）
// ---------------------------------------------------------------------------

export interface EffortOptionInfo {
  readonly id: string
  /** 官方 adapter 下发显示名（默认/低/高/极高等——逐字透传不自造映射）。 */
  readonly name: string
}

export interface ModelInfo {
  readonly provider: string
  readonly id: string
  readonly name: string
  /** 推理档位取值（随模型 reasoning.efforts 联动；空 = 不支持，隐藏分段）。 */
  readonly efforts: readonly EffortOptionInfo[]
}

export interface ModelSelection {
  readonly provider: string
  readonly id: string
  readonly name: string
  readonly reasoningEffort?: string
}

export interface ModelCatalog {
  readonly models: readonly ModelInfo[]
  readonly current?: ModelSelection
}

/** efforts 项收敛（官方 ModelReasoningEffort {id,name,…}——非法项剔除；name 透传 adapter 显示词）。 */
function coerceEfforts(raw: unknown): readonly EffortOptionInfo[] {
  const efforts = (typeof raw === 'object' && raw !== null ? (raw as { reasoning?: { efforts?: unknown } }) : {})
  const list = efforts.reasoning?.efforts
  return Array.isArray(list)
    ? list
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((item) => ({ id: typeof item['id'] === 'string' ? item['id'] : '', name: typeof item['name'] === 'string' ? item['name'] : '' }))
        .filter((item): item is EffortOptionInfo => item.id !== '' && item.name !== '')
    : []
}

/** 官方 ModelCatalog 收敛：groups 平铺为模型行；current = 部署 default（{provider,model}），
 * name 取目录成员名回退 id——会话当前档以回执/投影为准（preset 锁定语义 host 侧）。 */
export function coerceModelCatalog(raw: unknown): ModelCatalog {
  if (typeof raw !== 'object' || raw === null) return { models: [] }
  const frame = raw as { default?: unknown; groups?: unknown }
  const groups = Array.isArray(frame.groups) ? frame.groups : []
  const models: ModelInfo[] = []
  for (const group of groups) {
    if (typeof group !== 'object' || group === null) continue
    const g = group as { id?: unknown; name?: unknown; models?: unknown }
    const provider = typeof g.id === 'string' && g.id !== '' ? g.id : typeof g.name === 'string' && g.name !== '' ? g.name : '其他'
    if (!Array.isArray(g.models)) continue
    for (const item of g.models) {
      if (typeof item !== 'object' || item === null) continue
      const m = item as { id?: unknown; name?: unknown }
      if (typeof m.id !== 'string' || m.id === '') continue
      const name = typeof m.name === 'string' && m.name !== '' ? m.name : m.id
      models.push({ provider, id: m.id, name, efforts: coerceEfforts(item) })
    }
  }
  const fallback = (id: string): string => models.find((model) => model.id === id)?.name ?? id
  if (
    typeof frame.default === 'object' && frame.default !== null &&
    typeof (frame.default as { provider?: unknown }).provider === 'string' &&
    typeof (frame.default as { model?: unknown }).model === 'string'
  ) {
    const d = frame.default as { provider: string; model: string }
    return { models, current: { provider: d.provider, id: d.model, name: fallback(d.model) } }
  }
  return { models }
}

/** 当前选中判据：provider+id 全等（对勾与选中态同判据）。 */
export function isSameModel(a: Pick<ModelInfo, 'provider' | 'id'>, b: Pick<ModelSelection, 'provider' | 'id'>): boolean {
  return a.provider === b.provider && a.id === b.id
}

/** 选档前置守卫（bug：无会话时发 select-model → host resume "" 崩——空 sessionId 显式阻断）。 */
export function selectionBlockedReason(sessionId: string): string | undefined {
  return sessionId === '' ? '当前无会话——先新建或选择会话后再切换模型' : undefined
}

// ---------------------------------------------------------------------------
// 纯函数：检索过滤 + 分组
// ---------------------------------------------------------------------------

/** 检索过滤：name/id 大小写不敏感子串；query 空白 = 全量。 */
export function filterModels(models: readonly ModelInfo[], query: string): readonly ModelInfo[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return models
  return models.filter(
    (model) => model.name.toLowerCase().includes(needle) || model.id.toLowerCase().includes(needle),
  )
}

export interface ModelGroup {
  readonly provider: string
  readonly models: readonly ModelInfo[]
}

/** 提供商分组（保持 catalog 顺序）；过滤态由调用方走扁平列表，不经此。 */
export function groupByProvider(models: readonly ModelInfo[]): readonly ModelGroup[] {
  const groups: ModelGroup[] = []
  const index = new Map<string, ModelGroup>()
  for (const model of models) {
    const found = index.get(model.provider)
    if (found !== undefined) {
      groups[groups.indexOf(found)] = { provider: found.provider, models: [...found.models, model] }
    } else {
      const group = { provider: model.provider, models: [model] }
      groups.push(group)
      index.set(model.provider, group)
    }
  }
  return groups
}

// ---------------------------------------------------------------------------
// 纯函数：最近使用（localStorage 按配对域隔离，不可用静默降级）
// ---------------------------------------------------------------------------

export const RECENT_LIMIT = 3

/** 配对域隔离键：同一 host 配对域共用一份最近使用。 */
export function recentStorageKey(pairDomain: string): string {
  return `dshf.mobile.models.recent.${pairDomain}`
}

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 读取最近使用 id 栈（新→旧）；存储不可用/形状损坏 → 空列表。 */
export function loadRecentModels(storage: KeyValueStore | null, key: string): readonly string[] {
  if (storage === null) return []
  try {
    const raw = storage.getItem(key)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/** 写最近使用 id 栈；存储不可用 → 静默丢弃。 */
export function saveRecentModels(storage: KeyValueStore | null, key: string, ids: readonly string[]): void {
  if (storage === null) return
  try {
    storage.setItem(key, JSON.stringify([...ids]))
  } catch {
    /* 静默降级 */
  }
}

/** 选中入栈：去重置顶 + 上限截断。 */
export function pushRecentModel(ids: readonly string[], id: string, limit = RECENT_LIMIT): readonly string[] {
  return [id, ...ids.filter((item) => item !== id)].slice(0, limit)
}

/** localStorage 适配（不可用环境 → null，最近使用降级为空列表）。 */
export function defaultStore(): KeyValueStore | null {
  try {
    if (typeof window === 'undefined' || window.localStorage === null) return null
    return window.localStorage
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 纯函数：检索防抖
// ---------------------------------------------------------------------------

export const SEARCH_DEBOUNCE_MS = 300

export interface DebounceTimers {
  setTimeout(handler: () => void, timeoutMs: number): unknown
  clearTimeout(handle: unknown): void
}

/** ~300ms 防抖：尾触发；cancel 丢弃挂起。 */
export function createDebounce(
  fn: () => void,
  ms: number,
  timers: DebounceTimers,
): { push(): void; cancel(): void } {
  let handle: unknown
  return {
    push() {
      timers.clearTimeout(handle)
      handle = timers.setTimeout(() => {
        handle = undefined
        fn()
      }, ms)
    },
    cancel() {
      timers.clearTimeout(handle)
      handle = undefined
    },
  }
}

// ---------------------------------------------------------------------------
// 视图装配
// ---------------------------------------------------------------------------

export interface ModelsDeps {
  readonly rpc: RemoteRpc
  readonly sessionId: string
  /** 最近使用存储键（按配对域隔离，见 recentStorageKey）。 */
  readonly recentKey: string
  readonly onBack: () => void
  /** 选中即生效（selectModel 成功后回调，路由侧返回屏⑦）。 */
  readonly onSelected?: (model: ModelSelection) => void
  readonly store?: KeyValueStore | null
  readonly timers?: DebounceTimers
}

export function createModelsView(deps: ModelsDeps): HTMLElement {
  const root = el('div', 'phone-root models-root')
  ensureIconSprite(root)

  const store = deps.store === undefined ? defaultStore() : deps.store
  const timers: DebounceTimers =
    deps.timers ?? {
      setTimeout: (handler, timeoutMs) => window.setTimeout(handler, timeoutMs),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    }

  // ---- 头行：返回钮 + 搜索框同行（sticky）----
  const head = el('div', 'srow')
  const back = el('button', 'bkbtn')
  back.title = '返回'
  back.innerHTML = '<svg class="ic" style="transform:rotate(90deg)"><use href="#i-chev"/></svg>'
  back.addEventListener('click', () => deps.onBack())
  const search = el('div', 'msearch')
  search.innerHTML = '<svg class="ic"><use href="#i-search"/></svg>'
  const input = document.createElement('input')
  input.placeholder = '搜索模型…'
  input.className = 'msearch-input'
  search.appendChild(input)
  head.append(back, search)

  // ---- 列表滚动面（高度恒定，3px 滚动条）----
  const list = el('div', 'mlist')
  root.append(head, list)

  let catalog: ModelCatalog = { models: [] }
  let query = ''
  const collapsed = new Set<string>()

  const applyQuery = createDebounce(() => {
    query = input.value
    render()
  }, SEARCH_DEBOUNCE_MS, timers)
  input.addEventListener('input', () => applyQuery.push())

  /** 最近使用 id 栈 → 置顶成员（按栈序）。 */
  function recentModels(): readonly ModelInfo[] {
    const ids = loadRecentModels(store, deps.recentKey)
    const picked: ModelInfo[] = []
    for (const id of ids) {
      const model = catalog.models.find((item) => item.id === id)
      if (model !== undefined && !picked.some((item) => item.id === id)) picked.push(model)
    }
    return picked
  }

  function renderModelRow(model: ModelInfo): HTMLElement {
    const current = catalog.current
    const picked = current !== undefined && isSameModel(model, current)
    const row = el('button', `mrow${picked ? ' picked' : ''}`)
    row.appendChild(document.createTextNode(model.name))
    if (picked) row.insertAdjacentHTML('beforeend', '<span class="chk"><svg class="ic"><use href="#i-check"/></svg></span>')
    row.addEventListener('click', () => void pick(model))
    return row
  }

  function renderProviderGroup(group: ModelGroup): HTMLElement {
    const wrap = el('div', 'mgroup')
    const headRow = el('div', `pv${collapsed.has(group.provider) ? ' closed' : ''}`)
    headRow.innerHTML = '<svg class="ic"><use href="#i-chev"/></svg>'
    headRow.appendChild(document.createTextNode(group.provider))
    headRow.appendChild(el('span', 'cnt', String(group.models.length)))
    headRow.addEventListener('click', () => {
      if (collapsed.has(group.provider)) collapsed.delete(group.provider)
      else collapsed.add(group.provider)
      render()
    })
    wrap.appendChild(headRow)
    if (!collapsed.has(group.provider)) for (const model of group.models) wrap.appendChild(renderModelRow(model))
    return wrap
  }

  function render(): void {
    list.textContent = ''
    const filtered = filterModels(catalog.models, query)
    if (query.trim() === '') {
      // 最近使用置顶（分组头无计数无折叠）
      const recents = recentModels()
      if (recents.length > 0) {
        const wrap = el('div', 'mgroup')
        wrap.appendChild(el('div', 'pv recent', '最近使用'))
        for (const model of recents) wrap.appendChild(renderModelRow(model))
        list.appendChild(wrap)
      }
      for (const group of groupByProvider(filtered)) list.appendChild(renderProviderGroup(group))
    } else {
      // 过滤态 = 扁平列表
      for (const model of filtered) list.appendChild(renderModelRow(model))
      if (filtered.length === 0) list.appendChild(el('div', 'msearch-hint', '无匹配模型'))
    }
  }

  async function pick(model: ModelInfo): Promise<void> {
    const blocked = selectionBlockedReason(deps.sessionId)
    if (blocked !== undefined) {
      list.appendChild(el('div', 'msearch-hint err', blocked))
      return
    }
    try {
      // 选档即转发（SessionSelectModelRequest {sessionId, provider, model}——preset 锁定语义 host 侧）
      await proxyCall(deps.rpc, PROXY_SESSION_SELECT_MODEL_CHANNEL, {
        sessionId: deps.sessionId,
        provider: model.provider,
        model: model.id,
      })
    } catch (error) {
      if (error instanceof DisconnectedError) {
        list.appendChild(el('div', 'msearch-hint err', '连接已断开'))
        return
      }
      list.appendChild(el('div', 'msearch-hint err', '切换失败，请重试'))
      return
    }
    const selection: ModelSelection = {
      provider: model.provider,
      id: model.id,
      name: model.name,
    }
    // 选中即生效 + 最近使用入栈（只在成功后写）
    saveRecentModels(store, deps.recentKey, pushRecentModel(loadRecentModels(store, deps.recentKey), model.id))
    catalog = { ...catalog, current: selection }
    render()
    deps.onSelected?.(selection)
  }

  async function load(): Promise<void> {
    try {
      catalog = coerceModelCatalog(await proxyCall(deps.rpc, PROXY_SESSION_MODEL_CATALOG_CHANNEL, {}))
    } catch (error) {
      list.appendChild(
        el('div', 'msearch-hint err', error instanceof DisconnectedError ? '连接已断开' : '模型列表加载失败'),
      )
      return
    }
    render()
  }

  void load()
  return root
}
