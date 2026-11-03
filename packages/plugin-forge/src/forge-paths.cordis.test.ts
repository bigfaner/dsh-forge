// 真 cordis 契约测试（bug 0520cbaf——拉取缝防漂移钉）：用真实 @deepseek-ai/cordis 包
// （宿主依赖同版本 devDep 在场）构造 Context，钉住反向拉取缝依赖的三条 cordis 机制事实：
//   a) 根 scope provide('dirKeys.*') 后，隔离 scope（isolate）内 reflect.props 含该名
//      且 get 可取——跨 scope 拉取可达性（collectDeclaredDirKeys 全量生效）；
//   b) 对照：隔离 scope 内 provide('forgeDirs') 时，根 scope internal/service 监听收不到
//      ——推式注册跨 scope 不可达（bug 04d445f4 机制，防回退到推式缝）；
//   c) provide 注销后约定名残留 props 名表、get 归 undefined——cordis 注销器只删 store
//      不删 props 的脆弱面（拉取缝零贡献 fail-soft）。
// 探针形态来源：proposals/forge-dirs-query-tool/walkthrough/fix1-forgeDirs/cordis-repro2.mjs。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context, type Context as CordisContext } from '@deepseek-ai/cordis'
import { collectDeclaredDirKeys, DIR_KEY_REGISTRY, type DirKeyEntry, type ReflectDeclarePullFace } from './forge-paths.js'

const entry: DirKeyEntry = {
  dirKey: 'knowledge.root',
  description: '工作区知识库根（.knowledge/）',
  resolve: (ctx) => `${ctx.forgeDir ?? ''}\\..\\.knowledge`,
  declaredBy: 'knowledge',
}
const BUILTIN_KEYS = DIR_KEY_REGISTRY.map((e) => e.dirKey)

let ctx: CordisContext
/** a) 用例的根 scope 声明注销器（c) 用例清场用——声明块级闭包提升到模块级） */
let disposeDeclarer: (() => Promise<void>) | undefined

beforeAll(() => {
  ctx = new Context()
})

afterAll(async () => {
  await (ctx as unknown as { shutdown?: () => Promise<void> }).shutdown?.()
  ;(ctx as unknown as { destroy?: () => void }).destroy?.()
})

describe('a) 跨 scope 反向拉取可达性（拉取缝主缝钉）', () => {
  it('根 scope provide dirKeys.* 后，隔离 scope 内 props 含该名 + get 可取 + 拉取合并生效', async () => {
    let isolatedReflect: ReflectDeclarePullFace | undefined
    await ctx.plugin((c) => {
      disposeDeclarer = c.reflect.provide('dirKeys.contract-test', [entry]) as () => Promise<void>
    }, { name: 'declarer-root' })
    await ctx.plugin(async (c) => {
      const scoped = c.isolate('forgeDirs', 'session-x')
      await scoped.plugin((c2) => {
        isolatedReflect = c2.reflect as ReflectDeclarePullFace
      }, { name: 'plugin-forge-isolated' })
    }, { name: 'session-runtime' })
    expect(isolatedReflect).toBeDefined()
    expect(Object.keys(isolatedReflect!.props ?? {})).toContain('dirKeys.contract-test')
    expect(isolatedReflect!.get('dirKeys.contract-test')).toEqual([entry])
    // 拉取合并（collectDeclaredDirKeys 同形态消费——跨 scope 第三方键唯一可达径）
    expect(collectDeclaredDirKeys(isolatedReflect, BUILTIN_KEYS).map((e) => e.dirKey)).toEqual(['knowledge.root'])
  })
})

describe('b) 对照：推式缝跨 scope 不可达（bug 04d445f4 机制钉）', () => {
  it('隔离 scope 内 provide forgeDirs 服务，根 scope internal/service 监听收不到（防回退推式）', async () => {
    const fired: string[] = []
    ctx.on('internal/service', (name: string) => {
      if (name === 'forgeDirs') fired.push(name)
    })
    await ctx.plugin(async (c) => {
      const scoped = c.isolate('forgeDirs', 'session-y')
      await scoped.plugin((c2) => {
        c2.reflect.provide('forgeDirs', { registerDirKeys: () => {} })
      }, { name: 'plugin-forge-isolated-y' })
    }, { name: 'session-runtime-y' })
    expect(fired).toEqual([]) // 隔离 provide 被滤——推式注册/事件跨 scope 不可达
  })
})

describe('c) provide 注销后残名脆弱面（拉取零贡献 fail-soft 钉）', () => {
  it('注销器只删 store 不删 props：残名在场 + get undefined → 拉取零贡献', async () => {
    let reflect: ReflectDeclarePullFace | undefined
    let disposeProvider: (() => Promise<void>) | undefined
    await ctx.plugin((c) => {
      disposeProvider = c.reflect.provide('dirKeys.contract-test-2', [entry]) as () => Promise<void>
      reflect = c.reflect as ReflectDeclarePullFace
    }, { name: 'declarer-dispose' })
    expect(collectDeclaredDirKeys(reflect, BUILTIN_KEYS).map((e) => e.dirKey)).toContain('knowledge.root')
    await disposeDeclarer?.() // 清场：a) 的根 scope 声明先注销，本用例只留待测名
    await disposeProvider?.()
    // 脆弱面：props 名表残留约定名（注销器只删 store 不删 props）
    expect(Object.keys(reflect!.props ?? {})).toContain('dirKeys.contract-test-2')
    // get 归 undefined（store 已删）→ 拉取缝零贡献不抛
    expect(reflect!.get('dirKeys.contract-test-2')).toBeUndefined()
    expect(collectDeclaredDirKeys(reflect, BUILTIN_KEYS)).toEqual([])
  })
})
