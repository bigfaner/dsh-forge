// M3.1 D33 结构 pin——悬浮面板两残差收口（任务 dsh-forge-m3.1-ui-alignment/1.18 机械面锚；
// 读文件法 = 本目录 overview-chips-subtab/scaffold 先例——apps/web 测试面无 node 类型位）。
// 行为断言分工：真 DOM 同形几何 stub 与七态 tone 呈现归 DispatchPanel.test.tsx（web 池），
// 此处 pin 源级单点——① 锚源常量 = 真盒官方锚（display:contents 槽宿主零盒退役）；
// ② tone 映射零复制（跨视图 import taskStatusTagTone 单源 + 行 Tag 零硬编码 tone 字面量）。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const src = readFileSync(join(ROOT, 'apps/web/src/views/session/DispatchPanel.tsx'), 'utf8')

describe('D33 残差①：锚源 = 真盒官方锚（槽宿主零盒退役）', () => {
  it('DP_CONV_SELECTOR = [data-conversation-scroll]（官方 chat 台账真盒锚——brand.css/fix-38 台账先例）', () => {
    expect(src).toContain("export const DP_CONV_SELECTOR = '[data-conversation-scroll]'")
  })
  it('display:contents 零盒槽宿主不再作锚源（renderer ANCHOR_STYLE → rect 恒零——pin ⑮-4）', () => {
    expect(src).not.toContain(`'[data-slot="main.conversation"]'`)
  })
})

describe('D33 残差②：行状态 Tag tone = taskStatusTagTone 单源（零复制映射表）', () => {
  it('taskStatusTagTone 跨视图 import 自任务子 tab 单源模块（overview/task-tab/task-tab-model）', () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\btaskStatusTagTone\b[^}]*\}\s*from\s*'\.\.\/overview\/task-tab\/task-tab-model\.js'/,
    )
  })
  it('行 Tag 零硬编码 tone 字面量（tone="neutral" 七态同灰退役）', () => {
    expect(src).not.toContain('tone="neutral"')
  })
})
