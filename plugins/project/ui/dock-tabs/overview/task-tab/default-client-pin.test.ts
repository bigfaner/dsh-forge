// 生产默认值守护钉（2.12 回归判例 2026-11-25）：
// 任务子 tab 的数据装载 hooks（useTasksTabLoad / useTaskContainerCards / TasksTab）缺省 client
// 工厂必须是官方宿主可达的 Typert 工厂（overviewRpcClientFactory）——此前缺省为
// preloadRpcClientFactory（window.dshForge.invoke，仅自建宿主 dsh-forge 存在），官方宿主上
// 渲染期同步抛「宿主 preload 未接 RPC 面」→ slot entry crashed → 项目概览整片空白。
//
// 为什么读源码而不渲染：既有用例全部注入 makeClient 替身，绕过缺省值——替身永远绿、
// 真机恒炸（本容器「替身绕过生产路径」判例族）。本钉直接对源码文本断言缺省值归属，
// 不经任何注入面，任一工厂退回 preload 即红。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = import.meta.dirname
const src = (f: string): string => readFileSync(join(DIR, f), 'utf8')

describe('任务子 tab 数据装载缺省 client 工厂（生产默认值——零替身注入面）', () => {
  it('task-tab-data.ts：useTasksTabLoad / useTaskContainerCards 缺省 = overviewRpcClientFactory（Typert 可达）', () => {
    const s = src('task-tab-data.ts')
    const defaults = [...s.matchAll(/makeClient:\s*RpcClientFactory\s*=\s*(\w+)/g)].map((m) => m[1])
    expect(defaults.length, '两个装载 hook 的缺省参数均应显式声明').toBeGreaterThanOrEqual(2)
    for (const d of defaults) expect(d).toBe('overviewRpcClientFactory')
    expect(s).not.toMatch(/\bpreloadRpcClientFactory\b/)
  })

  it('task-tab.tsx：TasksTab 缺省 = overviewRpcClientFactory', () => {
    const s = src('task-tab.tsx')
    const m = s.match(/makeClient\s*=\s*(\w+),\s*\}:\s*TasksTabProps/)
    expect(m?.[1]).toBe('overviewRpcClientFactory')
    expect(s).not.toMatch(/\bpreloadRpcClientFactory\b/)
  })

  it('overviewRpcClientFactory 本身不触达 preload 通道（window.dshForge.invoke）', () => {
    // 工厂真身：overviewTransport 仅 bugs.list 走本地缝（带 Typert 回落），其余全 Typert——
    // tasks.* 通道恒 Typert。此处钉 transport 源码对 tasks 通道零 preload 直连。
    const s = src('../overview-client.ts')
    expect(s).toContain('overviewRpcClientFactory')
    // 头路/任务路 = Typert 单通路：仅 BUGS_CHANNELS.list 一条例外走 preload，且带 Typert 回落
    const preloadUses = [...s.matchAll(/preloadOf\(\)/g)].length
    expect(preloadUses, 'preload 仅 bugs.list 一处消费且带回落').toBe(1)
    expect(s).toMatch(/if \(channel !== BUGS_CHANNELS\.list\) return typert\(channel, payload\)/)
  })
})
