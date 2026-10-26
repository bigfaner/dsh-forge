// D33 结构 pin——悬浮面板锚源与行状态单源（任务 dsh-forge-m3.1-ui-alignment/1.18 机械面锚
// + loop-event-delivery 1.8 面板继任随迁；读文件法 = 本目录 overview-chips-subtab/scaffold
// 先例——apps/web 测试面无 node 类型位）。
// 悬浮面板 = DispatchEventsPanel（1.8 接替 DispatchPanel UI；1.16 行状态章退役——状态章
// pills 由任务轨状态点 + 备注行「状态 · 摘要」文案接替，语义词单源随迁）。行为断言分工：
// 真 DOM 同形几何 stub 与状态呈现归 DispatchEventsPanel.test.tsx（web 池），此处 pin 源级
// 单点——① 锚源常量 = 真盒官方锚（display:contents 槽宿主零盒退役）；② 行状态 = 状态词
// 常量表单点（零散落字面量、零 Tag tone 行内硬编码）。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const src = readFileSync(join(ROOT, 'apps/web/src/views/session/DispatchEventsPanel.tsx'), 'utf8')

describe('D33 残差①：锚源 = 真盒官方锚（槽宿主零盒退役）', () => {
  it('DEP_CONV_SELECTOR = [data-conversation-scroll]（官方 chat 台账真盒锚——brand.css/fix-38 台账先例）', () => {
    expect(src).toContain("export const DEP_CONV_SELECTOR = '[data-conversation-scroll]'")
  })
  it('display:contents 零盒槽宿主不再作锚源（renderer ANCHOR_STYLE → rect 恒零——pin ⑮-4）', () => {
    expect(src).not.toContain(`'[data-slot="main.conversation"]'`)
  })
})

describe('D33 残差②：行状态 = DISPATCH_EVENT_STATUS_WORD 单源（1.16 状态章退役随迁）', () => {
  it('状态词常量表（载荷 status 四值 → 备注行/统计条语义词——单源）', () => {
    expect(src).toContain('DISPATCH_EVENT_STATUS_WORD')
  })
  it('行 Tag 零硬编码 tone 字面量（tone="neutral" 同灰退役）', () => {
    expect(src).not.toContain('tone="neutral"')
  })
})
