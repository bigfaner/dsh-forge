import { describe, expect, it } from 'vitest'
import {
  coerceModelCatalog,
  createDebounce,
  filterModels,
  groupByProvider,
  isSameModel,
  loadRecentModels,
  pushRecentModel,
  RECENT_LIMIT,
  recentStorageKey,
  saveRecentModels,
  SEARCH_DEBOUNCE_MS,
  type ModelInfo,
} from './models.ts'

const model = (id: string, provider = 'DeepSeek', efforts: string[] = []): ModelInfo => ({
  provider,
  id,
  name: id,
  efforts,
})

describe('catalog 收敛（缺字段 fail-soft）', () => {
  it('标准形状：models 数组 + 顶层 current', () => {
    const catalog = coerceModelCatalog({
      models: [
        { provider: 'DeepSeek', id: 'deepseek-r1', name: 'DeepSeek-R1', reasoning: { efforts: ['low', 'medium'] } },
        { provider: 'Anthropic', id: 'claude', displayName: 'Claude Sonnet 4.6' },
      ],
      current: { provider: 'DeepSeek', id: 'deepseek-r1', name: 'DeepSeek-R1', reasoningEffort: 'medium' },
    })
    expect(catalog.models).toHaveLength(2)
    expect(catalog.models[0]?.efforts).toEqual(['low', 'medium'])
    expect(catalog.current?.id).toBe('deepseek-r1')
    expect(catalog.current?.reasoningEffort).toBe('medium')
  })

  it('成员 current:true 兜底 + 缺 provider 归「其他」+ 非法项剔除', () => {
    const catalog = coerceModelCatalog({
      models: [{ id: 'a' }, { id: 'b', current: true }, 42, { provider: 'X' }],
    })
    expect(catalog.models).toHaveLength(2)
    expect(catalog.models[0]?.provider).toBe('其他')
    expect(catalog.current?.id).toBe('b')
  })

  it('空/畸形 payload 安全', () => {
    expect(coerceModelCatalog(null)).toEqual({ models: [] })
    expect(coerceModelCatalog({}).models).toHaveLength(0)
  })
})

describe('选中判据 + 检索过滤', () => {
  it('provider+id 全等', () => {
    expect(isSameModel(model('r1'), { provider: 'DeepSeek', id: 'r1' })).toBe(true)
    expect(isSameModel(model('r1'), { provider: 'OpenAI', id: 'r1' })).toBe(false)
  })

  it('name/id 大小写不敏感子串；空白 = 全量', () => {
    const models = [model('deepseek-r1', 'DeepSeek'), { ...model('sonnet', 'Anthropic'), name: 'Claude Sonnet' }]
    expect(filterModels(models, 'R1')).toHaveLength(1)
    expect(filterModels(models, 'claude')).toHaveLength(1)
    expect(filterModels(models, '  ')).toHaveLength(2)
    expect(filterModels(models, 'zzz')).toHaveLength(0)
  })
})

describe('提供商分组（保持 catalog 顺序 + 计数）', () => {
  it('分组按首次出现序，计数 = 成员数', () => {
    const groups = groupByProvider([model('a', 'DeepSeek'), model('b', 'OpenAI'), model('c', 'DeepSeek')])
    expect(groups.map((group) => group.provider)).toEqual(['DeepSeek', 'OpenAI'])
    expect(groups[0]?.models).toHaveLength(2)
    expect(groups[1]?.models).toHaveLength(1)
  })
})

describe('最近使用（localStorage 按配对域隔离，不可用静默降级）', () => {
  const memory = () => {
    const map = new Map<string, string>()
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    }
  }

  it('键按配对域隔离', () => {
    expect(recentStorageKey('pair-a')).toBe('dshf.mobile.models.recent.pair-a')
    expect(recentStorageKey('pair-b')).not.toBe(recentStorageKey('pair-a'))
  })

  it('入栈去重置顶 + 上限截断', () => {
    expect(pushRecentModel(['a', 'b', 'c'], 'a')).toEqual(['a', 'b', 'c'])
    const pushed = pushRecentModel(['a', 'b', 'c'], 'd')
    expect(pushed).toEqual(['d', 'a', 'b'])
    expect(pushed.length).toBeLessThanOrEqual(RECENT_LIMIT)
  })

  it('读写回路 + 损坏形状 → 空列表', () => {
    const store = memory()
    saveRecentModels(store, 'k', ['x', 'y'])
    expect(loadRecentModels(store, 'k')).toEqual(['x', 'y'])
    store.setItem('bad', '{oops')
    expect(loadRecentModels(store, 'bad')).toEqual([])
    store.setItem('bad', '{"not":"array"}')
    expect(loadRecentModels(store, 'bad')).toEqual([])
  })

  it('localStorage 不可用（null / 抛异常）→ 静默降级空列表', () => {
    expect(loadRecentModels(null, 'k')).toEqual([])
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadRecentModels(throwing, 'k')).toEqual([])
    expect(() => saveRecentModels(throwing, 'k', ['x'])).not.toThrow()
  })
})

describe('检索防抖 ~300ms', () => {
  it('尾触发：窗口内多次 push 只执行最后一次', () => {
    let now = 0
    const pending: Array<{ fn: () => void; at: number; handle: number }> = []
    let handleSeq = 0
    const timers = {
      setTimeout(handler: () => void, ms: number) {
        const handle = handleSeq++
        pending.push({ fn: handler, at: now + ms, handle })
        return handle
      },
      clearTimeout(handle: unknown) {
        const index = pending.findIndex((item) => item.handle === handle)
        if (index >= 0) pending.splice(index, 1)
      },
    }
    let runs = 0
    const debounced = createDebounce(() => void runs++, SEARCH_DEBOUNCE_MS, timers)
    debounced.push()
    now = 100
    debounced.push()
    debounced.push()
    expect(pending).toHaveLength(1)
    pending[0]?.fn()
    expect(runs).toBe(1)
  })

  it('cancel 丢弃挂起', () => {
    const pending: Array<{ fn: () => void; handle: number }> = []
    const timers = {
      setTimeout(handler: () => void) {
        pending.push({ fn: handler, handle: pending.length })
        return pending.length - 1
      },
      clearTimeout(handle: unknown) {
        const index = pending.findIndex((item) => item.handle === handle)
        if (index >= 0) pending.splice(index, 1)
      },
    }
    let runs = 0
    const debounced = createDebounce(() => void runs++, 300, timers)
    debounced.push()
    debounced.cancel()
    for (const item of pending) item.fn()
    expect(runs).toBe(0)
  })
})
