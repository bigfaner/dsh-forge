// 对读结构 pin（forge-test-pipeline-hardening 1.12——architecture MEDIUM #2/#3 双点文字零锚定收口）。
// 两条对读 pin，配方同 1.4 pin（锚守卫 + 关键句粒度）：
//   1. 双轨基线裁决句跨包对读：packages/core compose.ts ↔ packages/plugin-forge settle.ts
//      主短语「双轨基线并存时以 E2E_BASELINE_RED 用例级清单优先」两侧逐字在案。
//   2. 测试判例三类 SKILL ↔ driver 对读：quick-tasks/SKILL.md ↔ loop/driver.ts
//      「flaky 史」「退役理由」「覆盖真空」三类关键词两侧双双在案（对读防闭环错位）。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')

const composeSrc = readFileSync(resolve(ROOT, 'packages/core/src/forge/tasks/prompt/compose.ts'), 'utf8')
const settleSrc = readFileSync(resolve(ROOT, 'packages/plugin-forge/src/dispatch-core/settle.ts'), 'utf8')
const skillSrc = readFileSync(resolve(ROOT, 'packages/plugin-forge/skills/quick-tasks/SKILL.md'), 'utf8')
const driverSrc = readFileSync(resolve(ROOT, 'packages/plugin-forge/src/loop/driver.ts'), 'utf8')

describe('对读结构 pin（forge-test-pipeline-hardening 1.12）', () => {
  it('双轨基线裁决句跨包对读：主短语在 compose.ts 与 settle.ts 两侧逐字在案（锚守卫 + 逐字 pin，改一漏一即红）', () => {
    const PHRASE = '双轨基线并存时以 E2E_BASELINE_RED 用例级清单优先'
    // 锚守卫：两侧各自的红灯/基线装配锚缺失即红（防读错文件或段落漂移恒绿）
    expect(composeSrc.indexOf('E2E_BASELINE_RED'), '锚缺失：compose.ts E2E_BASELINE_RED 装配段').toBeGreaterThan(-1)
    expect(composeSrc.indexOf('TEST_BASELINE 文档基线作补充归因参考'), '锚缺失：compose.ts 补充归因句').toBeGreaterThan(-1)
    expect(settleSrc.indexOf('E2E_BASELINE_RED 行'), '锚缺失：settle.ts E2E_BASELINE_RED 行装配段').toBeGreaterThan(-1)
    expect(settleSrc.indexOf('TEST_BASELINE 文档基线作补充归因参考'), '锚缺失：settle.ts 补充归因句').toBeGreaterThan(-1)
    // 主短语逐字：两侧双双在案
    expect(composeSrc, 'compose.ts 缺双轨基线裁决句主短语（逐字）').toContain(PHRASE)
    expect(settleSrc, 'settle.ts 缺双轨基线裁决句主短语（逐字）——跨包改一漏一即红').toContain(PHRASE)
  })

  it('测试判例三类 SKILL↔driver 对读：flaky 史/退役理由/覆盖真空三类关键词双双在案（锚守卫 + 逐类 pin）', () => {
    const CLASSES = ['flaky 史', '退役理由', '覆盖真空']
    // 锚守卫：两侧的判例三类段锚缺失即红
    expect(skillSrc.indexOf('测试判例检索提示'), '锚缺失：SKILL.md 测试判例检索提示条目').toBeGreaterThan(-1)
    expect(driverSrc.indexOf('测试判例三类沉淀'), '锚缺失：driver.ts 测试判例三类沉淀句').toBeGreaterThan(-1)
    for (const cls of CLASSES) {
      expect(skillSrc, `SKILL.md 缺判例类关键词：${cls}`).toContain(cls)
      expect(driverSrc, `driver.ts 缺判例类关键词：${cls}——SKILL↔driver 闭环错位即红`).toContain(cls)
    }
  })
})
