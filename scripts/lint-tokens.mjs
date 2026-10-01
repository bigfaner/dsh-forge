#!/usr/bin/env node
// 令牌 lint（G0）—— 样式风格纪律第 1 条「令牌唯一」：
// 色 / 字号 / 间距 / 圆角 / 阴影零裸值，一律 var(--dsw-*) 令牌。
// 面：apps/web/src/**/*.{css,ts,tsx}（CSS 文件 + TS/TSX 内联样式与颜色字面量——不在 oxlint 解析面）。
// 豁免：行尾 `/* dsw-raw */`（CSS）/ `// dsw-raw`（TS）——使用须在执行记录说明理由。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_ROOT = join(ROOT, 'apps/web/src')

const TOKEN_PROPS = [
  'font-size',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-inline',
  'padding-inline-start',
  'padding-inline-end',
  'padding-block',
  'padding-block-start',
  'padding-block-end',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-inline',
  'margin-inline-start',
  'margin-inline-end',
  'margin-block',
  'margin-block-start',
  'margin-block-end',
  'gap',
  'row-gap',
  'column-gap',
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'box-shadow',
]
const TS_PROP_MAP = new Map(
  TOKEN_PROPS.map((p) => [
    p.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
    p,
  ]),
)

const PERCENT = /^-?\d+(?:\.\d+)?%$/
const KEYWORDS =
  /^(?:0|none|auto|inherit|initial|unset|revert|revert-layer|transparent|currentcolor)$/i
const DSW_VAR = /^var\(--dsw-[a-z0-9-]+(?:,([^()]*))?$/i

const errors = []

function stripBlockComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '')
}
function stripLineComments(s) {
  return s
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
}
function exempt(line) {
  return /dsw-raw/.test(line)
}

function atomOk(atom) {
  const a = atom.trim().replace(/,+$/, '').trim()
  if (!a) return true
  if (KEYWORDS.test(a)) return true
  if (PERCENT.test(a)) return true
  if (DSW_VAR.test(a)) return true
  if (/^var\(/i.test(a)) return false // 非 --dsw 令牌引用
  if (/^calc\(/i.test(a)) {
    const hasToken = /var\(--dsw-/i.test(a)
    const rawNum = /\d+(?:\.\d+)?(?:px|rem|em|pt)\b/i.test(a)
    return hasToken && !rawNum
  }
  return false
}

function valueOk(value, prop, file, line, no) {
  if (exempt(line)) return
  const atoms = value.trim().split(/\s+(?![^(]*\))/)
  for (const atom of atoms) {
    if (!atomOk(atom)) {
      errors.push(
        `${file}:${no} [token-lint] 裸值 ${prop}: ${atom.trim()} —— 须取 --dsw-* 令牌（豁免须 dsw-raw 并说明理由）`,
      )
    }
  }
}

function lintCss(file, src) {
  const text = stripBlockComments(src)
  text.split('\n').forEach((line, i) => {
    const no = i + 1
    if (exempt(line)) return
    const hex = line.match(/#[0-9a-fA-F]{3,8}\b/)
    if (hex) errors.push(`${file}:${no} [token-lint] 裸色值 ${hex[0]} —— 须 var(--dsw-*)`)
    if (/\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i.test(line)) {
      errors.push(`${file}:${no} [token-lint] 裸色函数（rgb/hsl 系）—— 须 var(--dsw-*)`)
    }
    const decl = line.match(/([a-z-]+)\s*:\s*([^;]+);?/)
    if (decl && TOKEN_PROPS.includes(decl[1])) {
      valueOk(decl[2], decl[1], file, line, no)
    }
  })
}

function lintTs(file, src) {
  const text = stripLineComments(stripBlockComments(src))
  text.split('\n').forEach((line, i) => {
    const no = i + 1
    if (exempt(line)) return
    if (/querySelector|getElementById/.test(line)) return // '#id' 选择器非色值
    const hex = line.match(/['"]#[0-9a-fA-F]{3,8}['"]/)
    if (hex) errors.push(`${file}:${no} [token-lint] 裸色值 ${hex[0]} —— 须 var(--dsw-*)`)
    if (/['"`][^'"`]*\b(?:rgba?|hsla?)\(/.test(line)) {
      errors.push(`${file}:${no} [token-lint] 裸色函数（rgb/hsl 系）—— 须 var(--dsw-*)`)
    }
    const style = line.match(
      /\b(fontSize|padding|paddingTop|paddingRight|paddingBottom|paddingLeft|paddingInline|paddingBlock|margin|marginTop|marginRight|marginBottom|marginLeft|marginInline|marginBlock|gap|rowGap|columnGap|borderRadius|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius|boxShadow)\s*:\s*('[^']*'|"[^"]*"|`[^`]*`|-?\d+(?:\.\d+)?)/,
    )
    if (style) {
      const prop = style[1]
      const raw = style[2]
      const cssProp = TS_PROP_MAP.get(prop) ?? prop
      if (/^-?\d/.test(raw)) {
        errors.push(
          `${file}:${no} [token-lint] 内联样式裸值 ${prop}: ${raw}（数字即 px）—— 须 'var(--dsw-*)'`,
        )
      } else {
        valueOk(raw.slice(1, -1), cssProp, file, line, no)
      }
    }
  })
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) yield* walk(p)
    else yield p
  }
}

let scanned = 0
for (const p of walk(SCAN_ROOT)) {
  const ext = extname(p)
  if (ext !== '.css' && ext !== '.ts' && ext !== '.tsx') continue
  scanned++
  const rel2 = relative(ROOT, p).split('\\').join('/')
  const src = readFileSync(p, 'utf8')
  if (ext === '.css') lintCss(rel2, src)
  else lintTs(rel2, src)
}

if (errors.length > 0) {
  console.error(`[token-lint] ${errors.length} 处裸值（令牌唯一纪律被违反）：`)
  for (const e of errors) console.error('  ' + e)
  process.exit(1)
}
console.log(`[token-lint] 0 裸值（${scanned} 个 css/ts/tsx 文件扫描）`)
