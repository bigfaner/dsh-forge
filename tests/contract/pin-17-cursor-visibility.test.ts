// G1 pin ⑰：全局光标系统（apps/web/src/styles/cursors.css——2026-10-11 用户裁决链
// ①「重新鼠标光标的效果，风格要和应用一致，移动到任何位置视觉效果要明显」
// ②「风格不一致。整个产品的风格要一致」 ③「拖宽/拖移不要过大」+「按钮悬浮效果」
// ④「按钮指手好丑」 ⑤「ok，按钮这个全局修改。整个产品要保持一致」＝ v4 终稿）。
// D32（wco.css——WCO 双表面缓解）的全局面接任 + 品牌风格对齐：墨/纸配色 = 正文
// label-primary 同值随主题翻转（浅墨 #0f1115 / 暗纸 #f9fafb，描边取反侧——强调蓝归还
// 链接/按钮专属位）；四形（钢笔 / 缩小版双向箭头 / 缩小版十字箭头 / Lucide 指手）；
// 指针面双径消费（产品 45 处 var() 就地接线 + 中央元素阶梯兜官方包）。
// 对比度机械面（tmp/cursor-review 六底色 × 四形 × 双主题 = 72 组合全过，max 19:1）
// 不在本 pin 重复——本 pin 守结构与消费面。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from './pins.js'

const css = readFileSync(join(ROOT, 'apps/web/src/styles/cursors.css'), 'utf8')
const drawer = readFileSync(join(ROOT, 'apps/web/src/views/overview/drawer/drawer.css'), 'utf8')
const dispatch = readFileSync(join(ROOT, 'apps/web/src/views/session/dispatch-panel.css'), 'utf8')
const wco = readFileSync(join(ROOT, 'apps/web/src/styles/wco.css'), 'utf8')
const main = readFileSync(join(ROOT, 'apps/web/src/main.ts'), 'utf8')

/** 规则体提取（选择器含 needle 的声明块——压空白；先剥块注释：注释内 braces
 *  （`_handle{cursor:col-resize}` 记账引文）不参与匹配） */
function ruleOf(cssText: string, escapedNeedle: string): string {
  const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = new RegExp(`(^|})[^{}]*${escapedNeedle}[^{}]*\\{([^}]*)\\}`, 'm')
  return (stripped.match(re)?.[2] ?? '').replace(/\s+/g, ' ').trim()
}

/** 中央资产抽取：形名 → { uri, tail }（tail = 热点 + 关键字降级链） */
const defsOf = (cssText: string) =>
  [...cssText.matchAll(/--dsh-cursor-([a-z-]+):\s*url\("(data:image\/svg\+xml,[^)]+)"\)\s*([^;]+);/g)].map((m) => ({
    shape: m[1] as string,
    uri: m[2] as string,
    tail: (m[3] as string).trim(),
  }))
const lightDefs = defsOf(css.slice(0, css.indexOf('body[data-ds-dark-theme]')))
const darkDefs = defsOf(css.slice(css.indexOf('body[data-ds-dark-theme]')))

/** apps/web/src 递归 css 文件清单（sweep 零残留断言面） */
function walkCss(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walkCss(p) : p.endsWith('.css') ? [p] : []
  })
}

describe('pin ⑰-1 中央资产（墨/纸双主题 × 四形——单源中央化）', () => {
  it.each([
    ['text', '6 22, text'], // 钢笔形——热点 = 笔尖（D32 裁决 #24 造型沿袭）
    ['col-resize', '14 14, col-resize'], // 缩小版双向箭头——v3 用户裁决「不要过大」（16px 幅面 / 描边 4/2）
    ['move', '14 14, move'], // 缩小版十字箭头——同上
    ['pointer', '9 3, pointer'], // 指手——热点 = 指尖（Lucide pointer 几何派生）
  ])('%s：亮/暗双档各一，data-URI + 热点 + 关键字降级链', (shape, tail) => {
    const light = lightDefs.find((d) => d.shape === shape)
    const dark = darkDefs.find((d) => d.shape === shape)
    expect(light, `亮档 --dsh-cursor-${shape} 在场`).toBeTruthy()
    expect(dark, `暗档 --dsh-cursor-${shape} 在场`).toBeTruthy()
    for (const def of [light, dark]) {
      expect(def?.uri).toMatch(/^data:image\/svg\+xml,/)
      expect(def?.tail).toBe(tail)
    }
  })

  it('墨/纸色对（label-primary 同值随主题翻转；v6 非对称描边）：亮 = 纯墨单层（白描边退役）；暗 = 纸形体 + 墨描边', () => {
    for (const def of lightDefs) {
      expect(def?.uri.toLowerCase()).toContain('0f1115') // 墨形体（bluish-1000）
      expect(def?.uri, 'v6 用户裁决「浅色外圈白色边框去掉」——白描边层退役').not.toContain('%23ffffff')
    }
    for (const def of darkDefs) {
      expect(def?.uri).toContain("stroke='%230f1115'") // 墨描边（暗底不可见，白内容岛承对比——仅暗侧保留）
      expect(def?.uri.toLowerCase()).toContain('f9fafb') // 纸形体（bluish-50）
    }
  })

  it('资产可解码 + 画布刻度 + dsw-raw 记账（指手几何 = Lucide（ISC）派生注记）', () => {
    for (const def of [...lightDefs, ...darkDefs]) {
      const svg = decodeURIComponent(def.uri.slice('data:image/svg+xml,'.length))
      expect(svg.startsWith('<svg ') && svg.endsWith('</svg>'), `${def.shape} data-URI 可解码为 SVG`).toBe(true)
      expect(svg).toContain(def.shape === 'pointer' ? "width='26'" : "width='28'") // 指手 26px（1px 边距防裁切）
      const line = css.split('\n').find((l) => l.includes(`--dsh-cursor-${def.shape}:`))
      expect(line).toContain('dsw-raw') // data-URI 内色值不可令牌化——随行记账
      expect(line).toContain('%23') // URL 编码色值——无裸 #（lint-tokens 裸色面零触发）
    }
    const pointerLine = css.split('\n').find((l) => l.includes('--dsh-cursor-pointer:'))
    expect(pointerLine).toContain('Lucide') // 几何出处注记（v4 用户裁决链）
    // v3 缩小 + v5 减细 + v6 浅色单层：浅色箭头族单层 1.8（白描边退役）；暗色 3/1.8 双层
    // （沿革：v1 6/3 → v3 4/2 → v5 3/1.8 → v6 浅色单层 1.8）
    for (const shape of ['col-resize', 'move']) {
      const lightUri = lightDefs.find((d) => d.shape === shape)?.uri ?? ''
      expect(lightUri).toContain("stroke-width='1.8'")
      expect(lightUri, '浅色白描边层退役（v6）').not.toContain("stroke-width='3'")
      const darkUri = darkDefs.find((d) => d.shape === shape)?.uri ?? ''
      expect(darkUri).toContain("stroke-width='3'")
      expect(darkUri).toContain("stroke-width='1.8'")
    }
  })
})

describe('pin ⑰-2 全局 scope（「移动到任何位置」裁决口径）', () => {
  it('零 data-windows-titlebar 选择器（浏览器/WCO 双窗体同覆盖——D32 WCO 门退役）', () => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const selectors = [...stripped.matchAll(/([^{}]+)\{/g)].map((m) => m[1] as string)
    expect(selectors.length).toBeGreaterThanOrEqual(3) // 资产块 + 三消费规则组
    for (const sel of selectors) expect(sel).not.toContain('data-windows-titlebar')
  })
})

describe('pin ⑰-3 消费面（文字面 / 官方 DragHandle / 产品自持拖拽面）', () => {
  it('文字面：会话消息文字容器 + input 文本族白名单 + textarea + contenteditable → var(--dsh-cursor-text)', () => {
    const body = ruleOf(css, '\\[data-conversation-content\\]')
    expect(body).toContain('cursor: var(--dsh-cursor-text, text)')
    const group = css.slice(0, css.indexOf('cursor: var(--dsh-cursor-text'))
    expect(group).toContain("input:where(:not([type])")
    expect(group.slice(group.lastIndexOf('input:where'))).toContain('textarea')
    expect(css).toContain("[contenteditable='']")
    expect(css).toContain("[contenteditable='true']")
  })

  it('官方 DragHandle 全族（frame 结构子 div[data-side]）→ var(--dsh-cursor-col-resize)', () => {
    const body = ruleOf(css, 'div\\[data-side\\]')
    expect(body).toContain('cursor: var(--dsh-cursor-col-resize, col-resize)')
    expect(css).toContain('div:has(> [data-shell-overlay]) > div[data-side]')
  })

  it('drawer 拖宽缘 → col-resize 资产；拖移头 → move 资产（表面自持规则就地接 var）', () => {
    expect(ruleOf(drawer, '\\.dswf-td-resize')).toContain('cursor: var(--dsh-cursor-col-resize, col-resize)')
    expect(ruleOf(drawer, '\\.dswf-td-head')).toContain('cursor: var(--dsh-cursor-move, move)')
  })

  it('dispatch-panel 拖移头 → move 资产（D32 同病面「dispatch-panel move」收口）', () => {
    expect(ruleOf(dispatch, '\\.dswf-dp-head')).toContain('cursor: var(--dsh-cursor-move, move)')
  })
})

describe('pin ⑰-4 指针面双径（v4 用户裁决「按钮这个全局修改——整个产品保持一致」）', () => {
  it('径 a 产品面全量接线：apps/web/src 零裸 cursor:pointer 声明（45 处 sweep 零残留）', () => {
    const files = walkCss(join(ROOT, 'apps/web/src')).filter((p) => !p.includes('styles/cursors.css'))
    expect(files.length).toBeGreaterThan(10)
    const offenders: string[] = []
    let wired = 0
    for (const p of files) {
      const text = readFileSync(p, 'utf8')
      wired += (text.match(/cursor: var\(--dsh-cursor-pointer, pointer\);/g) ?? []).length
      for (const line of text.split('\n')) {
        if (/cursor:\s*pointer\s*;/.test(line)) offenders.push(`${p.split(/[\\/]/).pop()}: ${line.trim()}`)
      }
    }
    expect(offenders, `裸 cursor:pointer 残留（须 var() 接线）：\n${offenders.join('\n')}`).toEqual([])
    expect(wired, 'sweep 接线基数（45 处族——新增可点击面须同径接线）').toBeGreaterThanOrEqual(45)
  })

  it('径 b 中央元素阶梯（官方包兜底）：:root body :is(...) :not(禁用族) → var(--dsh-cursor-pointer)', () => {
    const body = ruleOf(css, ':root body :is')
    expect(body).toContain('cursor: var(--dsh-cursor-pointer, pointer)')
    const ladder = css.slice(css.indexOf(':root body :is'), css.indexOf('cursor: var(--dsh-cursor-pointer'))
    expect(ladder).toContain('button')
    expect(ladder).toContain("[role='button']")
    expect(ladder).toContain("a:where([href])") // 死链锚点不劫持
    expect(ladder).toContain(':disabled') // 禁用族保 UA 语义
  })

  it('D32 退役面（wco.css 零 cursor:url 行）+ main.ts 挂载', () => {
    expect(wco.split('\n').filter((line) => line.includes('cursor: url('))).toHaveLength(0)
    expect(main).toContain("import './styles/cursors.css'")
  })
})
