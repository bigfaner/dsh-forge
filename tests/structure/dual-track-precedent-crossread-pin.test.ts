// 对读结构 pin（forge-test-pipeline-hardening 1.12——architecture MEDIUM #2/#3 双点文字零锚定收口）。
// 原 pin ① 为双轨基线裁决句跨包对读（packages/core compose.ts ↔ 旧包 plugin-forge settle.ts）
// ——旧包随 M1 阶段B 退役，跨包半边随删；core 侧裁决句逐字锚保留（通用不变量）。
// pin ②（现 ①）：测试判例三类 SKILL ↔ driver 对读：task-loop to-tasks/SKILL.md ↔ task-loop loop/driver.ts
//      （quick-tasks 随远征退役批替代退役——拆解径判例检索职责由 to-tasks 承接，锚随迁新位）
//      「flaky 史」「退役理由」「覆盖真空」三类关键词两侧双双在案（对读防闭环错位）。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')

const composeSrc = readFileSync(resolve(ROOT, 'packages/core/src/forge/tasks/prompt/compose.ts'), 'utf8')
const skillSrc = readFileSync(resolve(ROOT, 'plugins/task-loop/skills/to-tasks/SKILL.md'), 'utf8')
const driverSrc = readFileSync(resolve(ROOT, 'plugins/task-loop/host/loop/driver.ts'), 'utf8')

describe('对读结构 pin（forge-test-pipeline-hardening 1.12）', () => {
  it('双轨基线裁决句：主短语在 compose.ts 逐字在案（锚守卫 + 逐字 pin）', () => {
    const PHRASE = '双轨基线并存时以 E2E_BASELINE_RED 用例级清单优先'
    // 锚守卫：红灯/基线装配锚缺失即红（防读错文件或段落漂移恒绿）
    expect(composeSrc.indexOf('E2E_BASELINE_RED'), '锚缺失：compose.ts E2E_BASELINE_RED 装配段').toBeGreaterThan(-1)
    expect(composeSrc.indexOf('TEST_BASELINE 文档基线作补充归因参考'), '锚缺失：compose.ts 补充归因句').toBeGreaterThan(-1)
    // 主短语逐字在案
    expect(composeSrc, 'compose.ts 缺双轨基线裁决句主短语（逐字）').toContain(PHRASE)
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
