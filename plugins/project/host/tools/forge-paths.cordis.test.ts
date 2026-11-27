// 真 cordis 契约测试（目录键声明变化跟随的机制钉）：用真实 @deepseek-ai/cordis 包构造
// Context，钉住 watchDirKeysDeclarations 依赖的三条 cordis 机制事实：
//   a) 根 scope provide('dirKeys.*') → internal/service 事件携带约定名（声明方在 apply 期
//      provide，事件于其可通知时点发出）——晚于工具注册上线的声明方可被跟随；
//   b) 注销器调用 → 同名事件再发一次（声明方卸载可被跟随）；
//   c) 非约定名服务（如 forgeTasks）同样发事件，但监听面按前缀过滤不触发回调。
// 探针形态来源：dirs/anchors.cordis.test.ts（同包同版本真 Context 钉法）。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context, type Context as CordisContext, type Plugin } from '@deepseek-ai/cordis'
import { watchDirKeysDeclarations } from './forge-paths.js'

/** 内联插件函数的 config 面（cordis plugin 泛型推断需显式 config 型） */
type NamedPlugin = Plugin.Function<{ name?: string }>

const DECLARATION = {
  'watcher.dir': {
    description: '探针目录',
    deps: ['workspaceRoot'],
    resolve: (deps: { workspaceRoot: string }) => `${deps.workspaceRoot}\\probe`,
  },
}

/** 事件 → 微任务合并回调落定所需的排空 */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

let ctx: CordisContext

beforeAll(() => {
  ctx = new Context()
})

afterAll(async () => {
  await (ctx as unknown as { shutdown?: () => Promise<void> }).shutdown?.()
  ;(ctx as unknown as { destroy?: () => void }).destroy?.()
})

describe('目录键声明变化跟随（internal/service 事件机制钉）', () => {
  it('a) + b)：根 scope provide dirKeys.* 触发一次回调；注销后再触发一次', async () => {
    let hits = 0
    const off = watchDirKeysDeclarations(ctx, () => void (hits += 1))
    let disposeProvider: (() => Promise<void>) | undefined
    await ctx.plugin(((c: CordisContext) => {
      disposeProvider = c.reflect.provide('dirKeys.watcher-test', DECLARATION) as () => Promise<void>
    }) as NamedPlugin, { name: 'declarer-watcher' })
    await settle()
    expect(hits).toBe(1) // 提供事件
    await disposeProvider!()
    await settle()
    expect(hits).toBe(2) // 注销事件
    off()
  })

  it('c)：非约定名服务的事件不触发回调', async () => {
    let hits = 0
    const off = watchDirKeysDeclarations(ctx, () => void (hits += 1))
    let disposeProvider: (() => Promise<void>) | undefined
    await ctx.plugin(((c: CordisContext) => {
      disposeProvider = c.reflect.provide('watcherUnrelatedService', { ok: true }) as () => Promise<void>
    }) as NamedPlugin, { name: 'declarer-unrelated' })
    await settle()
    await disposeProvider!()
    await settle()
    expect(hits).toBe(0)
    off()
  })
})
