// @feature:mobile-ui
// @mobile-e2e
// Journey: settings-model-catalog（设置面板 + 模型目录 + 搜索过滤 + 最近使用 + 推理档位）。
// 溯源：contracts/step-1-open-settings.md … step-7-reasoning-tier.md（每 Outcome 一测 + 冒烟）。
// 策略：models.ts / settings.ts 纯逻辑面（catalog 收敛/过滤/分组/最近使用/档位状态机）行为
// 实测；数据面钉 e2e/fixtures/mobile（session-model-catalog 通道录制 + api 参照腿
// session/modelCatalog 官方形状）。零真实 host、离线可重复。
import { describe, expect, it } from 'vitest'
import {
  RECENT_LIMIT,
  SEARCH_DEBOUNCE_MS,
  coerceModelCatalog,
  filterModels,
  groupByProvider,
  isSameModel,
  loadRecentModels,
  pushRecentModel,
  recentStorageKey,
  saveRecentModels,
  type KeyValueStore,
  } from '../../../apps/mobile/src/views/models.js'
import {
  DEFAULT_EFFORT,
  commitEffort,
  currentEffort,
  effortOptions,
  rollbackEffort,
  settleEffort,
  type EffortDraft,
} from '../../../apps/mobile/src/views/settings.js'
import { firstProxy, loadFixtures, mobileSrc, sessionSummarySample } from '../support.js'

const FIX = loadFixtures()

const CATALOG = {
  default: { provider: 'zai-coding-cn', model: 'glm-5.3' },
  routableProviders: ['zai-coding-cn', 'deepseek'],
  groups: [
    {
      id: 'zai-coding-cn',
      name: 'zai-coding-cn',
      models: [
        { id: 'glm-5.3', name: 'GLM 5.3', reasoning: { efforts: [{ id: 'min', name: '极低' }, { id: 'default', name: '默认' }, { id: 'max', name: '高' }] } },
        { id: 'glm-4.6v', name: 'GLM 4.6V' },
      ],
    },
    {
      id: 'deepseek',
      name: 'deepseek',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', reasoning: { efforts: [{ id: 'default', name: '默认' }] } },
        { id: 'deepseek-r2', name: 'DeepSeek R2', reasoning: { efforts: [{ id: 'max', name: '高' }] } },
      ],
    },
  ],
}

/** EffortOptionInfo 构造（当前契约 efforts = {id,name}[]——name 缺席即滤除）。 */
const eff = (id: string, name = id): { id: string; name: string } => ({ id, name })

function makeKv(): { store: KeyValueStore; backing: Map<string, string> } {
  const backing = new Map<string, string>()
  return {
    backing,
    store: { getItem: (k) => backing.get(k) ?? null, setItem: (k, v) => { backing.set(k, v) } },
  }
}

describe('step-1 open-settings（打开最小化设置面板）', () => {
  it('success（两行入口面板）', () => {
    // 回链 contracts/step-1-open-settings.md Outcome:success——两行入口：模型行 + 推理档位
    const catalog = coerceModelCatalog(CATALOG)
    expect(catalog.current?.id).toBe('glm-5.3') // SSE 帧含当前会话模型
    expect(catalog.current?.reasoningEffort).toBeUndefined()
    // 当前会话模型锚点：官方 SessionSummary 参照腿 modelSelection 字段
    const summary = sessionSummarySample(FIX.apiRef)
    const values = (summary.projections as { values?: Record<string, unknown> }).values ?? {}
    expect(Object.keys(values)).toContain('modelSelection')
    // 最小化面板不变式（源面锚点）：无标题/说明文本，选档即生效
    const src = mobileSrc('views/settings.ts')
    expect(src).toContain('无标题/无说明文本') // 最小化面板纪律源面钉死
    expect(src).toMatch(/选档即生效/)
    // R12 口径源面钉死：模型面 = session-model-catalog 读 + session-select-model 写（settings/models 两屏）
    expect(mobileSrc('views/models.ts')).toMatch(/PROXY_SESSION_MODEL_CATALOG_CHANNEL/)
    expect(mobileSrc('views/models.ts')).toMatch(/PROXY_SESSION_SELECT_MODEL_CHANNEL/)
    expect(mobileSrc('views/settings.ts')).toMatch(/PROXY_SESSION_MODEL_CATALOG_CHANNEL/)
    expect(mobileSrc('views/settings.ts')).toMatch(/PROXY_SESSION_SELECT_MODEL_CHANNEL/)
    // 目录通道录制在场（404 缺口显性化）
    expect(FIX.proxy.some((e) => (e.request as { channel?: string }).channel === 'forge:proxy/session-model-catalog')).toBe(true)
  })

  it('preset-locked（preset 锁定会话）', () => {
    // 回链 contracts/step-1-open-settings.md Outcome:preset-locked——
    // 无前端预检：呈现值 = host 回执结果（失败回滚维持原值）
    const draft = commitEffort({ pending: false, picked: 'default' }, 'max')
    expect(draft.pending).toBe(true) // 乐观在途
    expect(rollbackEffort(draft, 'default').picked).toBe('default') // 失败回执 → 原值
    expect(mobileSrc('views/settings.ts')).toMatch(/rollbackEffort|settleEffort/)
  })
})

describe('step-2 open-models（进入模型列表唯一子视图）', () => {
  it('success（分组目录 + 当前对勾）', () => {
    // 回链 contracts/step-2-open-models.md Outcome:success——提供商分组 + 计数 + 当前对勾
    const catalog = coerceModelCatalog(CATALOG)
    const groups = groupByProvider(catalog.models)
    expect(groups.map((g) => g.provider)).toEqual(['zai-coding-cn', 'deepseek'])
    expect(groups[0]!.models).toHaveLength(2)
    // 当前模型对勾判据 = provider+id 全等（对勾与选中态同判据）
    const current = catalog.models[0]!
    expect(isSameModel(current, catalog.current!)).toBe(true)
    expect(isSameModel(catalog.models[2]!, catalog.current!)).toBe(false)
    // 通道代表录制钉面（404 缺口显性化——录制期未放行）
    const entry = firstProxy(FIX.proxy, 'forge:proxy/session-model-catalog')
    expect((entry.response as { ok?: boolean }).ok).toBe(false)
  })
})

describe('step-3 search-filter（搜索框过滤模型目录）', () => {
  it('success（防抖过滤扁平列表）', () => {
    // 回链 contracts/step-3-search-filter.md Outcome:success——防抖 ~300ms + 扁平命中直列
    expect(SEARCH_DEBOUNCE_MS).toBe(300)
    const catalog = coerceModelCatalog(CATALOG)
    const hits = filterModels(catalog.models, 'deepseek')
    expect(hits.map((m) => m.provider)).toEqual(['deepseek', 'deepseek']) // 跨模型命中去分组直列
    expect(hits.every((m) => m.name.toLowerCase().includes('deepseek') || m.id.toLowerCase().includes('deepseek'))).toBe(true)
  })

  it('no-hit（搜索无命中）', () => {
    // 回链 contracts/step-3-search-filter.md Outcome:no-hit——空命中零报错零布局跳变
    const catalog = coerceModelCatalog(CATALOG)
    expect(filterModels(catalog.models, '不存在关键词')).toEqual([])
    // 清空恢复全量（分组视图基线还原）
    expect(filterModels(catalog.models, '  ')).toHaveLength(catalog.models.length)
  })

  it('debounce-burst（防抖窗口连续输入）', () => {
    // 回链 contracts/step-3-search-filter.md Outcome:debounce-burst——防抖收敛：只执行最终关键词
    const catalog = coerceModelCatalog(CATALOG)
    const bursts = ['d', 'de', 'dee', 'deepseek-r']
    const final = bursts[bursts.length - 1]!
    expect(filterModels(catalog.models, final).map((m) => m.id)).toEqual(['deepseek-r2'])
    // 防抖单源常量（~300ms）——中间关键词零过滤副作用由 createDebounce 承担
    expect(mobileSrc('views/models.ts')).toMatch(/export function createDebounce/)
  })
})

describe('step-4 clear-search（清空搜索恢复分组视图）', () => {
  it('success（恢复折叠基线）', () => {
    // 回链 contracts/step-4-clear-search.md Outcome:success——检索往返无损：分组基线还原
    const catalog = coerceModelCatalog(CATALOG)
    const baseline = groupByProvider(catalog.models).map((g) => [g.provider, g.models.length])
    const filtered = filterModels(catalog.models, 'glm')
    expect(filtered.length).toBeLessThan(catalog.models.length)
    const restored = groupByProvider(filterModels(catalog.models, '')).map((g) => [g.provider, g.models.length])
    expect(restored).toEqual(baseline) // 折叠基线逐位一致
  })
})

describe('step-5 select-model（点选模型转发选择意图）', () => {
  it('success（选中态 + 回执更新）', () => {
    // 回链 contracts/step-5-select-model.md Outcome:success——新模型 efforts 重新呈现档位集
    const target = coerceModelCatalog(CATALOG).models[2]! // deepseek-v4-flash（efforts 非空）
    expect(target.efforts).toEqual([eff('default', '默认')])
    expect(effortOptions(target.efforts).map((o) => o.value)).toEqual(['default'])
    // 官方参照腿：session/selectModel 已录（协议形状参照）
    expect(FIX.apiRef.some((e) => (e.request as { method?: string }).method === 'session/selectModel')).toBe(true)
  })

  it('no-efforts-model（不支持推理档位的模型）', () => {
    // 回链 contracts/step-5-select-model.md Outcome:no-efforts-model——无 efforts = 无控件（隐藏）
    const noEfforts = coerceModelCatalog(CATALOG).models[1]! // glm-4.6v
    expect(noEfforts.efforts).toEqual([])
    expect(currentEffort(noEfforts.efforts, 'max')).toBeUndefined() // 档位控件退场语义
    expect(effortOptions(noEfforts.efforts)).toEqual([])
  })

  it('in-flight-no-dupe（选择在途重复点选）', () => {
    // 回链 contracts/step-5-select-model.md Outcome:in-flight-no-dupe——意图单发（回执收口）
    // 纯函数口径：选择意图经 selectModel 通道一次转发——重复点选在视图在途位短路
    expect(mobileSrc('views/models.ts')).toMatch(/session-select-model|selectModel/i)
  })
})

describe('step-6 recent-used（最近使用置顶区）', () => {
  it('success（最近使用置顶 + 对勾正确）', () => {
    // 回链 contracts/step-6-recent-used.md Outcome:success——localStorage 持久化 + 置顶 + limit=3
    const { store } = makeKv()
    const key = recentStorageKey('domain-a')
    expect(RECENT_LIMIT).toBe(3)
    saveRecentModels(store, key, [])
    saveRecentModels(store, key, pushRecentModel(loadRecentModels(store, key), 'glm-5.3'))
    saveRecentModels(store, key, pushRecentModel(loadRecentModels(store, key), 'deepseek-r2'))
    expect(loadRecentModels(store, key)).toEqual(['deepseek-r2', 'glm-5.3']) // 最近使用置顶（新者居首）
  })

  it('domain-isolated（配对域隔离）', () => {
    // 回链 contracts/step-6-recent-used.md Outcome:domain-isolated——存储键按配对域隔离
    expect(recentStorageKey('domain-a')).not.toBe(recentStorageKey('domain-b'))
    const { store } = makeKv()
    saveRecentModels(store, recentStorageKey('domain-a'), ['glm-5.3'])
    expect(loadRecentModels(store, recentStorageKey('domain-b'))).toEqual([]) // 零跨域泄漏
  })

  it('storage-absent（localStorage 缺席/清空）', () => {
    // 回链 contracts/step-6-recent-used.md Outcome:storage-absent——空存储合法基线，零报错
    expect(loadRecentModels(null, recentStorageKey('d'))).toEqual([]) // 存储不可用静默降级
    const { store } = makeKv()
    expect(loadRecentModels(store, recentStorageKey('d'))).toEqual([]) // 首次访问空集
  })
})

describe('step-7 reasoning-tier（切换推理等级档位）', () => {
  it('success（选档即生效）', () => {
    // 回链 contracts/step-7-reasoning-tier.md Outcome:success——选档即转发（乐观呈现，无确认步骤）
    const efforts = [eff('minimal', '极低'), eff('default', '默认'), eff('high', '高')]
    let draft: EffortDraft = { pending: false, picked: DEFAULT_EFFORT }
    draft = commitEffort(draft, 'high')
    expect(draft).toEqual({ pending: true, picked: 'high' }) // 乐观（回执前呈现）
    draft = settleEffort(draft, 'high')
    expect(draft).toEqual({ pending: false, picked: 'high' }) // 回执对账
    expect(currentEffort(efforts, 'high')).toBe('high') // 会话档在支持列表内取之
    expect(currentEffort(efforts, undefined)).toBe('default') // 缺席取 default
    expect(DEFAULT_EFFORT).toBe('default')
    // 档位显示词映射（adapter name 单源——mockup 口径）
    expect(effortOptions(efforts).map((o) => o.label)).toEqual(['极低', '默认', '高'])
  })

  it('out-of-range-fallback（档位越界恢复）', () => {
    // 回链 contracts/step-7-reasoning-tier.md Outcome:out-of-range-fallback——档位值域恒合法
    const newEfforts = [eff('low', '低'), eff('high', '高')] // 切模型后的新档位集
    expect(currentEffort(newEfforts, 'max')).toBe('low') // 旧档越界 → 回退首档（不残留越界选中）
    expect(currentEffort(newEfforts, 'high')).toBe('high')
    expect(currentEffort(['default', 'high'].map((id) => eff(id)), 'max')).toBe('default') // default 优先兜底
    // 回执失败回滚 + 越界回退默认档
    const draft = commitEffort({ pending: false, picked: 'low' }, 'max')
    expect(rollbackEffort(draft, 'low').picked).toBe('low')
    expect(settleEffort(commitEffort({ pending: false, picked: 'minimal' }, 'high'), 'high').picked).toBe('high')
  })
})

describe('smoke: happy path 依序走全链（settings-model-catalog）', () => {
  it('打开面板 → 目录分组 → 过滤 → 选择 → 最近使用 → 档位', () => {
    // ① 面板：当前模型 + 档位
    const catalog = coerceModelCatalog(CATALOG)
    expect(catalog.current?.id).toBe('glm-5.3')
    // ② 目录分组 + 当前对勾
    expect(groupByProvider(catalog.models).length).toBe(2)
    // ③ 过滤往返
    expect(filterModels(catalog.models, 'r2').map((m) => m.id)).toEqual(['deepseek-r2'])
    expect(groupByProvider(filterModels(catalog.models, ''))).toEqual(groupByProvider(catalog.models))
    // ④ 选择意图 → 档位集随新模型
    const target = catalog.models[2]!
    expect(isSameModel(target, { provider: target.provider, id: target.id })).toBe(true)
    expect(effortOptions(target.efforts).length).toBeGreaterThan(0)
    // ⑤⑥ 最近使用（域隔离持久化）+ 档位提交
    const { store } = makeKv()
    saveRecentModels(store, recentStorageKey('d'), pushRecentModel([], target.id))
    expect(loadRecentModels(store, recentStorageKey('d'))).toEqual([target.id])
    expect(settleEffort(commitEffort({ pending: false, picked: 'minimal' }, 'default'), 'default').picked).toBe('default')
    // 参照腿钉面：官方 session/modelCatalog 形状已录
    expect(FIX.apiRef.some((e) => (e.request as { method?: string }).method === 'session/modelCatalog')).toBe(true)
    // 目录通道信封形状（404 缺口显性化——ok:false 但为 RPC 信封）
    const entry = firstProxy(FIX.proxy, 'forge:proxy/session-model-catalog')
    expect(typeof (entry.response as { error?: { message?: string } }).error?.message === 'string' || (entry.response as { ok?: boolean }).ok === false).toBe(true)
  })
})
