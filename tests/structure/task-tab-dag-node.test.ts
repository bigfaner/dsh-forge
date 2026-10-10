// M3.1 D29 结构 pin —— DAG 节点 190×72 + 标题两行换行的 CSS 形态语义
// （任务 dsh-forge-m3.1-ui-alignment/1.14；读文件法 = 本目录 overview-chips-subtab
// 先例——apps/web 测试面无 node 类型位，结构 pin 归此）。
// 断言面 = 源样式规则块（选择器 → 声明块抽取），非运行时计算样式（实机走查归 1.13）。
// 节点刻度数值面（常量 190/72 + 画布公式）归 dag-layout.test 字面 pin，此处不重复。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const taskTabCss = readFileSync(join(ROOT, 'apps/web/src/views/overview/task-tab/task-tab.css'), 'utf8')

/** 选择器规则块声明集（平铺 CSS 零嵌套；注释先剥离；多命中取并集） */
function declsOf(css: string, selector: string): string {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => (m[1] ?? '').split(',').some((s) => s.trim() === selector))
    .map((m) => m[2] ?? '')
    .join('\n')
}

describe('D29 DAG 节点标题两行完整展示（CSS 形态语义）', () => {
  const title = declsOf(taskTabCss, '.dswf-tt-node-title')

  it('节点标题 = 两行换行 clamp（单行 nowrap ellipsis 退役）', () => {
    expect(title, '两行截断').toContain('-webkit-line-clamp: 2')
    expect(title, '盒模型竖排').toContain('-webkit-box-orient: vertical')
    expect(title, '单行 nowrap 退役').not.toContain('white-space: nowrap')
    expect(title, '单行省略号退役').not.toContain('text-overflow')
  })

  it('字号 = 原型 12px/17px 的 --dsw-* 令牌最近语义映射（xxs-12 = 12px/18px）', () => {
    expect(title).toContain('font: var(--dsw-font-xxs-12)')
  })

  it('节点内距 = 原型 .dag-node 结构刻度（7px 9px——两行标题在 72px 节点内的承载面前提）', () => {
    expect(declsOf(taskTabCss, '.dswf-tt-node')).toContain('padding: 7px 9px')
  })
})
