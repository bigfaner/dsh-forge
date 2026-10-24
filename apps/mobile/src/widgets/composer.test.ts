// composer 唤醒菜单纯逻辑面（feature：/ 命令 + @ 文件 mention——super-composer
// InputTriggerController 语义的移动端轻量镜像：行首/空白后触发 + 候选过滤 + span 替换）
import { describe, expect, it } from 'vitest'
import { applySuggestion, detectTrigger, filterItems, type SuggestItem } from './composer.ts'

describe('detectTrigger（触发判定——official scanTextRefs 同语义）', () => {
  it('行首 / 与空白后 @ 触发；query = 触发符后至光标', () => {
    expect(detectTrigger('/', 1)).toEqual({ kind: '/', query: '', start: 0 })
    expect(detectTrigger('/run', 4)).toEqual({ kind: '/', query: 'run', start: 0 })
    expect(detectTrigger('看下 @src', 7)).toEqual({ kind: '@', query: 'src', start: 3 })
    expect(detectTrigger('@', 1)).toEqual({ kind: '@', query: '', start: 0 })
  })

  it('词中触发符不触发（prose——3/4、邮箱 a@b）；触发符后空白关闭', () => {
    expect(detectTrigger('3/4', 3)).toBeNull()
    expect(detectTrigger('a@b.com', 7)).toBeNull()
    expect(detectTrigger('/run ', 5)).toBeNull() // query 后随空白 = 已完成命令，菜单关
    expect(detectTrigger('看 @ 已结束', 6)).toBeNull()
  })

  it('query 允许路径字符与 CJK（@src/app/模块）', () => {
    expect(detectTrigger('@src/app/模块', 11)).toEqual({ kind: '@', query: 'src/app/模块', start: 0 })
  })

  it('caret 在触发符之前 = 不触发', () => {
    expect(detectTrigger('/run', 0)).toBeNull()
  })
})

describe('filterItems（候选前缀过滤——子串不区分大小写）', () => {
  const items: readonly SuggestItem[] = [
    { insert: '/run-dag-tasks ', label: 'run-dag-tasks', description: '派发' },
    { insert: '/stop-dag-tasks ', label: 'stop-dag-tasks' },
    { insert: '@src/app.ts ', label: 'src/app.ts' },
  ]
  it('空 query 全量；query 过滤 label；无命中 = 空', () => {
    expect(filterItems(items, '')).toHaveLength(3)
    expect(filterItems(items, 'dag')).toHaveLength(2)
    expect(filterItems(items, 'RUN')).toHaveLength(1) // 仅 run-dag-tasks
    expect(filterItems(items, 'app.ts')).toEqual([items[2]])
    expect(filterItems(items, 'zzz')).toEqual([])
  })
})

describe('applySuggestion（span 替换——触发符起至光标）', () => {
  it('替换触发 token，光标落在插入文本尾', () => {
    expect(applySuggestion('/run', { kind: '/', query: 'run', start: 0 }, '/run-dag-tasks ')).toEqual({
      text: '/run-dag-tasks ',
      caret: 15,
    })
    expect(applySuggestion('看下 @sr', { kind: '@', query: 'sr', start: 3 }, '@src/app.ts ')).toEqual({
      text: '看下 @src/app.ts ',
      caret: 15,
    })
  })
})
