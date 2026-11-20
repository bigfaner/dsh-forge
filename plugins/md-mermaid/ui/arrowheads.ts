// 箭头开放化手术（1.14——用户裁决链 2026-10-13：开放燕尾 + 箭头颜色跟线条一致，
// Chromium 计算样式程序化验证收敛——walkthrough/arrow-style-review.html/.png）。
// 形状模式驱动：只认五族实心三角 d 值（mermaid 12.1.0 出厂几何），不认 marker id——
// 上游改几何即零命中原样返回，安全回归实心箭头（失效模式安全，不炸渲染管线）。
// cross / o（circle）/ solidTopArrowHead 为语义/装饰 marker，不在手术清单，永不改写。
// 级联：命中 path 内联 style 整体重写为 fill:none + stroke=主题 lineColor +
// 1.6px 圆角线帽（内联 style 高于 SVG <style> 类规则——computed stroke 同线条值）。
import { MERMAID_THEME_VARIABLES } from './theme.js'

/** 五族实心三角 d → 开放燕尾 d（对照 walkthrough/arrow-style-review.html 手术清单） */
export const OPEN_ARROWHEADS_D_PATTERNS: ReadonlyArray<readonly [solid: string, open: string]> = [
  ['M 0 0 L 10 5 L 0 10 z', 'M 1.5 1 L 9 5 L 1.5 9'], // flowchart pointEnd / point
  ['M -1 0 L 10 5 L 0 10 z', 'M 0.5 1 L 9 5 L 0.5 9'], // sequence arrowhead
  ['M 0 5 L 10 10 L 10 0 z', 'M 8.5 1 L 1 5 L 8.5 9'], // flowchart pointStart（反向）
  ['M 0 0 L 11.5 7 L 0 14 z', 'M 1.5 1.5 L 10.5 7 L 1.5 12.5'], // pointEnd-margin（边标签让位）
  ['M 18,7 L9,13 L14,7 L9,1 Z', 'M 9,1.5 L 16.5,7 L 9,12.5'], // sequence filled-head（->> 肥箭头）
] as const

/** 开放燕尾内联 style（级联最高——computed stroke 与线条同值） */
const OPEN_STYLE = `style="fill:none;stroke:${MERMAID_THEME_VARIABLES.lineColor};stroke-width:1.6px;stroke-linecap:round;stroke-linejoin:round;"`

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 单个 path 开标签手术：d 换燕尾 + 内联 style 整体重写（无 style 属性则补挂） */
function rewritePathTag(tag: string, openD: string): string {
  const next = tag.replace(/\bd="[^"]*"/, `d="${openD}"`)
  if (/\bstyle="/.test(next)) return next.replace(/\bstyle="[^"]*"/, OPEN_STYLE)
  return next.replace(/\/?>$/, ` ${OPEN_STYLE}$&`)
}

/**
 * 开放燕尾手术：SVG 字符串面替换五族实心三角 marker 几何并重写其内联 style。
 * 零命中（上游改几何/无箭头图型）原样返回——回归实心箭头。
 */
export function applyOpenArrowheads(svg: string): string {
  let out = svg
  let hits = 0
  for (const [solid, open] of OPEN_ARROWHEADS_D_PATTERNS) {
    const pattern = new RegExp(`(<path\\b[^>]*\\bd="${escapeRegExp(solid)}"[^>]*?/?>)`, 'g')
    out = out.replace(pattern, (_m, tag: string) => {
      hits += 1
      return rewritePathTag(tag, open)
    })
  }
  return hits > 0 ? out : svg
}
