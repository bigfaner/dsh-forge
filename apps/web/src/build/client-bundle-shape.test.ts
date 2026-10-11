// forge-client 形状 pin 单测（定位：装配——vite.config pin 的纯函数面回归）。
// 报障锚（2026-10-11 web boot「loaded without registering」）：413e3dd 起 shell 树
// （views/session/ForgeProgressNode）与 client 树（client-plugin/progress-node）运行时
// 共享纯模块 → rollup 拆公共 chunk → forge-client.js 以 `import{n}from"./assets/…"`
// 开头（最小化零空格花括号紧邻形态）——旧 pin 字符类漏 `{` 未拒绝，破坏产物流到运行期。
import { describe, expect, it } from 'vitest'
import { assertClientBundleClassicScript } from './client-bundle-shape.js'

/** 自含注册体（求值即 __ModuleLoader__.load——合法 classic script 形状） */
const SELF_CONTAINED = 'window.__ModuleLoader__.load({id:"@dsh-forge/web-client",factory:function(){}})'

describe('assertClientBundleClassicScript（vite 形状 pin 纯函数面）', () => {
  it('bug: import 花括号紧邻形态（import{n}from——共享 chunk 拆分产物）未被拒绝', () => {
    // 413e3dd 实际产物首行形态（dist 实录）：最小化零空格 import 语句
    const esmSharedChunk = 'import{n as e,r as t,t as n}from"./assets/progress-node-CcPwg__j.js";' + SELF_CONTAINED
    expect(() => assertClientBundleClassicScript(esmSharedChunk)).toThrow()
  })

  it('其余 import 语句形态照拒：命名空间/默认/裸字符串/动态 import', () => {
    for (const stmt of [
      'import*as e from"./assets/x.js";',
      'import e from"./assets/x.js";',
      'import"./assets/x.js";',
      'const e=await import("./assets/x.js");',
    ]) {
      expect(() => assertClientBundleClassicScript(stmt + ';' + SELF_CONTAINED), `未拒绝: ${stmt}`).toThrow()
    }
  })

  it('export 语句照拒：具名/默认/聚合/声明形态', () => {
    for (const stmt of ['export{n};', 'export default n;', 'export*from"./assets/x.js";', 'export function f(){}']) {
      expect(() => assertClientBundleClassicScript(stmt + SELF_CONTAINED), `未拒绝: ${stmt}`).toThrow()
    }
  })

  it('自含 classic script（含 __ModuleLoader__ 注册面）放行', () => {
    expect(() => assertClientBundleClassicScript(SELF_CONTAINED)).not.toThrow()
  })

  it('注册面缺席照拒（__ModuleLoader__ 字面量必在）', () => {
    expect(() => assertClientBundleClassicScript('function f(){}')).toThrow()
  })

  it('非语句位置 import 词不误伤（标识符内/属性访问位零触发）', () => {
    const inIdentifier = 'var importer=1,reimport=importer;' + SELF_CONTAINED
    expect(() => assertClientBundleClassicScript(inIdentifier)).not.toThrow()
  })
})
