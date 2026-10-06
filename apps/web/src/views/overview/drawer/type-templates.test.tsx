// 类型模板单测 —— 六族路由 ×20 类型穷尽（AC3）+ 各族区块渲染 + eval 空态注记 +
// 参考文档 chip 点击锚（refs 水化 = core taskDetail）。渲染面 = renderToStaticMarkup。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TASK_TYPES, type TaskDocRef } from '@dsh-forge/contracts'
import { detailFixture } from './detail-model.test.js'
import {
  TASK_TYPE_FAMILY,
  TypeTemplateBody,
  templateFamilyOf,
  typeCategoryClassOf,
} from './type-templates/index.js'

const OPEN_DOC = (): void => {}

describe('模板族路由（AC3：六族 × 20 类型穷尽）', () => {
  it('TASK_TYPE_FAMILY 词汇表穷尽映射（20 值逐一断言）', () => {
    expect(TASK_TYPE_FAMILY).toEqual({
      'coding-feature': 'coding',
      'coding-enhancement': 'coding',
      'coding-cleanup': 'coding',
      'coding-refactor': 'coding',
      'code-quality-simplify': 'coding',
      'coding-fix': 'fix',
      gate: 'gate',
      doc: 'doc',
      'doc-consolidate': 'doc',
      'doc-drift': 'doc',
      'doc-review': 'doc',
      'doc-summary': 'doc',
      'test-run': 'test',
      'test-gen-contracts': 'test',
      'test-gen-journeys': 'test',
      'test-gen-scripts': 'test',
      'validation-code': 'eval',
      'validation-ux': 'eval',
      'eval-contract': 'eval',
      'eval-journey': 'eval',
    })
  })

  it('词汇表 20 值全部命中六族（无 generic 漏网）', () => {
    for (const type of TASK_TYPES) {
      expect(templateFamilyOf(type)).not.toBe('generic')
    }
  })

  it('未注册类型走通用键值回退（generic）；doc-fix 防御路由 fix 族（ui-design 块一表）', () => {
    expect(templateFamilyOf('mystery-type')).toBe('generic')
    expect(templateFamilyOf('doc-fix')).toBe('fix')
  })

  it('类别色族映射（Design System 六色）：coding/code-quality→coding、validation 独立、其余按前缀', () => {
    expect(typeCategoryClassOf('coding-feature')).toBe('coding')
    expect(typeCategoryClassOf('code-quality-simplify')).toBe('coding')
    expect(typeCategoryClassOf('coding-fix')).toBe('coding')
    expect(typeCategoryClassOf('doc')).toBe('doc')
    expect(typeCategoryClassOf('test-run')).toBe('test')
    expect(typeCategoryClassOf('eval-contract')).toBe('eval')
    expect(typeCategoryClassOf('validation-ux')).toBe('validation')
    expect(typeCategoryClassOf('gate')).toBe('gate')
    expect(typeCategoryClassOf('mystery')).toBe('generic')
  })
})

describe('coding 族（AC3/AC4：参考文档 → 改动范围 → 验收标准）', () => {
  const refs: readonly TaskDocRef[] = [
    { docRel: 'docs/proposals/dsh-forge-m2-pipeline/db-schema.md', resolved: true, title: 'db-schema' },
    { docRel: 'docs/features/ghost/absent.md', resolved: false },
  ]
  const detail = detailFixture({
    vars: {
      goal: 'G',
      scope: 'packages/core/src/forge/schema.ts\npackages/core/src/forge/migrate.ts',
      acceptance: '["七表 DDL 一致", "幂等迁移"]',
    },
    refs,
    actualFiles: ['packages/core/src/forge/schema.ts', 'packages/core/src/index.ts'],
    records: [
      { verb: 'submit', actor: 'plugin-tool', createdAt: '2026-10-02T10:00:00.000Z', commitHash: 'a1b2c3d4' },
    ],
  })

  it('区块序 = 参考文档 → 改动范围 → 验收标准（v14 顺序；覆盖率/备注归块组装）', () => {
    const html = renderToStaticMarkup(
      TypeTemplateBody({ detail, onOpenDoc: OPEN_DOC }),
    )
    const refsAt = html.indexOf('参考文档')
    const scopeAt = html.indexOf('改动范围')
    const accAt = html.indexOf('验收标准')
    expect(refsAt).toBeGreaterThanOrEqual(0)
    expect(scopeAt).toBeGreaterThan(refsAt)
    expect(accAt).toBeGreaterThan(scopeAt)
  })

  it('参考文档 chips：resolved = 可点按钮（dock 开 tab 锚 + title），未命中置灰不可点（AC3）', () => {
    const html = renderToStaticMarkup(
      TypeTemplateBody({ detail, onOpenDoc: OPEN_DOC }),
    )
    expect(html).toContain('data-dswf-td-ref="docs/proposals/dsh-forge-m2-pipeline/db-schema.md"')
    expect(html).toContain('data-dswf-td-ref-unresolved="docs/features/ghost/absent.md"')
    expect(html).not.toContain('<button[^>]*data-dswf-td-ref-unresolved')
  })

  it('改动范围双列：预期声明（✓ 已提交/未涉及 徽标）+ 实际（commit 来源 + 计划外）+ 差异摘要', () => {
    const html = renderToStaticMarkup(
      TypeTemplateBody({ detail, onOpenDoc: OPEN_DOC }),
    )
    expect(html).toContain('预期(2)')
    expect(html).toContain('✓ 已提交') // schema.ts 命中实际
    expect(html).toContain('未涉及') // migrate.ts 未触及
    expect(html).toContain('实际(2)')
    expect(html).toContain('a1b2c3d4') // commit 来源徽标
    expect(html).toContain('计划外') // packages/core/src/index.ts
    expect(html).toContain('预期 2 · 实际 2 · 预期内 1 · 计划外 +1 · 未涉及 1')
  })

  it('文件路径完整展示刻度（word-break 类在场——长路径换行不截断，AC4）', () => {
    const html = renderToStaticMarkup(
      TypeTemplateBody({ detail, onOpenDoc: OPEN_DOC }),
    )
    expect(html).toContain('dswf-td-file')
    expect(html).toContain('packages/core/src/forge/schema.ts')
  })
})

describe('fix / doc / gate / test 族区块（AC3 模板表逐族）', () => {
  it('fix：症状 / 修复步骤（编号）/ 验证命令', () => {
    const html = renderToStaticMarkup(
      TypeTemplateBody({
        detail: detailFixture({
          taskType: 'coding-fix',
          vars: { symptom: '注册名形违规', steps: '["改名", "补单测"]', verify: 'pnpm vitest run' },
        }),
        onOpenDoc: OPEN_DOC,
      }),
    )
    expect(html).toContain('症状')
    expect(html).toContain('注册名形违规')
    expect(html).toContain('修复步骤')
    expect(html).toContain('1')
    expect(html).toContain('验证')
    expect(html).toContain('pnpm vitest run')
  })

  it('doc：大纲（编号）/ 交付物 / 读者', () => {
    const html = renderToStaticMarkup(
      TypeTemplateBody({
        detail: detailFixture({ taskType: 'doc', vars: { outline: '发现面契约', deliverable: 'docs/x.md', readers: '评审' } }),
        onOpenDoc: OPEN_DOC,
      }),
    )
    expect(html).toContain('大纲')
    expect(html).toContain('交付物')
    expect(html).toContain('docs/x.md')
    expect(html).toContain('读者')
    expect(html).toContain('评审')
  })

  it('gate：走查步骤 / 检查项（随最近 gate 全过勾选）', () => {
    const allPass = renderToStaticMarkup(
      TypeTemplateBody({
        detail: detailFixture({
          taskType: 'gate',
          taskStatus: 'in_progress',
          vars: { steps: '领取', checks: '["SC-M2 全项", "零 JS 错误"]' },
          records: [
            { verb: 'submit', actor: 'plugin-tool', createdAt: '2026-10-02T10:00:00.000Z', gate: { compile: true, fmt: true, lint: true, test: true } },
          ],
        }),
        onOpenDoc: OPEN_DOC,
      }),
    )
    expect(allPass).toContain('走查步骤')
    expect(allPass).toContain('检查项')
    expect(allPass).toContain('is-done') // gate 全过 → checklist 全勾划线
    const noGate = renderToStaticMarkup(
      TypeTemplateBody({
        detail: detailFixture({ taskType: 'gate', vars: { checks: '["SC-M2 全项"]' } }),
        onOpenDoc: OPEN_DOC,
      }),
    )
    expect(noGate).not.toContain('is-done')
  })

  it('test：命令 / 采集指标 / 基线', () => {
    const html = renderToStaticMarkup(
      TypeTemplateBody({
        detail: detailFixture({
          taskType: 'test-run',
          surfaceKey: 'web',
          surfaceType: 'web',
          vars: { command: 'pnpm bench', metrics: '["p95 耗时", "内存峰值"]', baseline: 'v0.2.0 @ 90 天' },
        }),
        onOpenDoc: OPEN_DOC,
      }),
    )
    expect(html).toContain('命令')
    expect(html).toContain('pnpm bench')
    expect(html).toContain('采集指标')
    expect(html).toContain('内存峰值')
    expect(html).toContain('基线')
    expect(html).toContain('v0.2.0 @ 90 天')
  })
})

describe('eval 族（AC3：空态注记——M2 无技能写入）与 generic 回退', () => {
  it('eval：评估对象 / 评分表（分值着色行）/ 结论 + 空态注记（无结构化得分时）', () => {
    const html = renderToStaticMarkup(
      TypeTemplateBody({
        detail: detailFixture({
          taskType: 'eval-contract',
          vars: {
            target: 'contracts/eval-contract.spec.md',
            rubric: '[{"k":"断言可机械化","s":60},{"k":"六维覆盖","s":40}]',
            conclusion: '口径过时',
          },
        }),
        onOpenDoc: OPEN_DOC,
      }),
    )
    expect(html).toContain('评估对象')
    expect(html).toContain('contracts/eval-contract.spec.md')
    expect(html).toContain('评分表')
    expect(html).toContain('断言可机械化')
    expect(html).toContain('60')
    expect(html).toContain('结论')
    expect(html).toContain('口径过时')
    expect(html).toContain('data-dswf-td-eval-empty') // 空态注记（vars.score 缺席）
  })

  it('eval：vars.score 在场（自由文本承载）→ 不显空态注记', () => {
    const html = renderToStaticMarkup(
      TypeTemplateBody({
        detail: detailFixture({ taskType: 'eval-journey', vars: { score: '87' } }),
        onOpenDoc: OPEN_DOC,
      }),
    )
    expect(html).not.toContain('data-dswf-td-eval-empty')
  })

  it('generic：键值行 + 数组列表回退（未注册类型）', () => {
    const html = renderToStaticMarkup(
      TypeTemplateBody({
        detail: detailFixture({ taskType: 'mystery-type', vars: { note2: '自由文本', list2: '["a", "b"]' } }),
        onOpenDoc: OPEN_DOC,
      }),
    )
    expect(html).toContain('note2')
    expect(html).toContain('自由文本')
    expect(html).toContain('list2')
    expect(html).toContain('a')
  })
})
