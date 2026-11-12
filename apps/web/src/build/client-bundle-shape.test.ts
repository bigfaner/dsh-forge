// forge-client 形状 pin 单测（定位：装配——vite.config pin 的纯函数面回归）。
// 报障锚（2026-10-11 web boot「loaded without registering」）：413e3dd 起 shell 树
// （views/session/ForgeProgressNode）与 client 树（client-plugin/progress-node）运行时
// 共享纯模块 → rollup 拆公共 chunk → forge-client.js 以 `import{n}from"./assets/…"`
// 开头——共享 chunk 拆分 = 破坏形态①。
// 1.46 改版注记：词素级正则扫描（旧 pin）会命中依赖携带的字符串/正则字面量内的
// import/export 词素（TextMate 语法 JSON `import(?=\s*\(`、jsdoc 高亮正则 `exports?`
// 实录）——检测面改 bundle 元数据结构三facet（chunk 数 / 外部 import / 导出名）。
import { describe, expect, it } from 'vitest'
import { assertClientBundleClassicScript } from './client-bundle-shape.js'

/** 合法形状输入（自含注册体 + 单 chunk + 零外部 import + 零导出） */
const ok = (overrides: Partial<Parameters<typeof assertClientBundleClassicScript>[0]> = {}): Parameters<typeof assertClientBundleClassicScript>[0] => ({
  chunkCount: 1,
  externalImports: [],
  exportNames: [],
  code: 'window.__ModuleLoader__.load({id:"@dsh-forge/web-client",factory:function(){}})',
  ...overrides,
})

describe('assertClientBundleClassicScript（vite 形状 pin 纯函数面）', () => {
  it('bug 413e3dd：共享 chunk 拆分（chunk 数 > 1）拒绝', () => {
    expect(() => assertClientBundleClassicScript(ok({ chunkCount: 2 }))).toThrow(/chunk 数/)
  })

  it('外部 import（依赖外部化残留 import 语句）拒绝', () => {
    expect(() => assertClientBundleClassicScript(ok({ externalImports: ['react'] }))).toThrow(/外部 import/)
  })

  it('入口导出（export 语句残留）拒绝', () => {
    expect(() => assertClientBundleClassicScript(ok({ exportNames: ['registerForgeClient'] }))).toThrow(/export/)
  })

  it('自含 classic script（含 __ModuleLoader__ 注册面）放行', () => {
    expect(() => assertClientBundleClassicScript(ok())).not.toThrow()
  })

  it('注册面缺席照拒（__ModuleLoader__ 字面量必在）', () => {
    expect(() => assertClientBundleClassicScript(ok({ code: 'function f(){}' }))).toThrow(/__ModuleLoader__/)
  })

  it('1.46 误报复盘：字符串/正则字面量内的 import/export 词素不参与判定（结构 facet 不受词素干扰）', () => {
    // TextMate 语法 JSON（import(?=\s*\(）与 jsdoc 高亮正则（exports?）实录词素
    const literalNoise =
      'var g={"match":"(?<![$_])import(?=\\\\s*\\\\(\\\\s*[\\"\'`])","name":"keyword.operator.expression.import.ts"};'
      + 'var hl=/((@)(?:alias|exports?|extends))\\\\s+/;'
    expect(() => assertClientBundleClassicScript(ok({ code: literalNoise + ok().code }))).not.toThrow()
  })
})
