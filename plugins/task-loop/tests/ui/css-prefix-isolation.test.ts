// 跨包同名类结构钉（overview-dockkit-alignment 2.7——方案 A 类名前缀隔离收口）：
// task-loop 单装版概览曾与 project 完整版概览共用 dswf-ov-wrap/panel/head 同名类，
// CSS 全局注入期 task-loop 的规则命中 project 的 DOM（容器层污染，1.3/1.7 两轮内容层
// 修复压不住）——2026-11-24 用户裁决：task-loop 侧类名全量改前缀 dswl-ov-。
// 本钉断言两包 CSS 类选择器交集恒空：任一包日后新增同名类即红（防再撞车）。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))

/** 递归收集目录下全部 .css 文件路径 */
function cssFilesOf(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name)
    if (name.isDirectory()) out.push(...cssFilesOf(full))
    else if (name.name.endsWith('.css')) out.push(full)
  }
  return out
}

/** 去 CSS 注释（注释里的跨包类名互指不构成选择器撞车面） */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** 提取 CSS 文本中的全部类选择器名（注释剔除后按 .cls 词法收集） */
function classNamesOf(css: string): Set<string> {
  const names = new Set<string>()
  for (const m of stripComments(css).matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)) names.add(m[1]!)
  return names
}

describe('task-loop ↔ project 概览类名前缀隔离（dswl- 结构钉）', () => {
  const taskLoopDir = join(repoRoot, 'plugins', 'task-loop', 'ui')
  const projectOverviewDir = join(repoRoot, 'plugins', 'project', 'ui', 'dock-tabs', 'overview')

  it('两包 CSS 类选择器交集为空（同名类 = 全局注入撞车源，零容忍）', () => {
    const taskLoopNames = new Set<string>()
    for (const f of cssFilesOf(taskLoopDir)) {
      for (const n of classNamesOf(readFileSync(f, 'utf8'))) taskLoopNames.add(n)
    }
    const projectNames = new Set<string>()
    for (const f of cssFilesOf(projectOverviewDir)) {
      for (const n of classNamesOf(readFileSync(f, 'utf8'))) projectNames.add(n)
    }
    // is-* 状态修饰类（.is-error 等）恒与前缀化基类联用、非独立撞车载体——不入交集判据
    const collision = [...taskLoopNames].filter((n) => !n.startsWith('is-') && projectNames.has(n))
    expect(collision, `同名类撞车：${collision.join(', ')}`).toEqual([])
  })

  it('task-loop 概览 CSS 零 dswf-ov- 旧前缀残留（迁移收口钉——全量 dswl-ov-）', () => {
    for (const f of cssFilesOf(join(taskLoopDir, 'overview'))) {
      const css = stripComments(readFileSync(f, 'utf8'))
      expect(css, `${f} 残留旧前缀`).not.toMatch(/dswf-ov-/)
    }
  })
})
