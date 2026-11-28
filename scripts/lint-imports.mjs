#!/usr/bin/env node
// import 边界扫描（G0）—— oxlint 1.86 未实现 no-restricted-syntax，以下几类禁令
// 由本零依赖扫描器机械执行（与 oxlint 三铁律同入根 `pnpm lint`）：
//   1. 运行期边界：apps/web 禁 import @dsh-forge/{core,knowledge}（renderer 只经 IPC RPC）；
//   2. SC2 无投影：apps/web + packages/core 禁 fs.watch / fs.watchFile / chokidar 类
//      监听回流依赖——索引重建只经用户显式触发的扫描。
//   3. mobile 边界：apps/mobile 独立工程，禁 import @dsh-forge/web / apps/web 源路径。
//   4. plugins 只依赖 lib（铁律）：plugins/* 禁 import 非 `lib-*` 的 @dsh-forge/*——插件只经
//      lib/ 基座取能力，不依赖 packages/* 的任何实现、契约或基元（白名单只放 @dsh-forge/lib-*）。
//      存量走文件级基线 scripts/lint-imports.plugins-baseline.json：基线内文件放行但违规数
//      只减不增；基线外文件（含新文件）零容忍。M2 清账逐批收缩基线，缩空即删基线与本段。
// 豁免：行尾 `// raw-import`（使用须在执行记录说明理由）。
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const MSG_RPC =
  '[import-lint] dsh-forge 运行期边界：renderer 只经 IPC RPC（contracts 通道常量）与数据内核通信，禁 import'
const MSG_WATCH =
  '[import-lint] dsh-forge SC2 无投影：禁文件监听回流依赖（fs.watch/chokidar 类）——重建只经用户显式触发'
const MSG_MOBILE_WEB =
  '[import-lint] dsh-forge mobile 边界：apps/mobile 独立工程（纯 view 层，零桌面依赖），禁 import apps/web'
const MSG_PLUGINS_LIB =
  '[import-lint] dsh-forge plugins 只依赖 lib 铁律：plugins/* 禁 import 非 lib-* 的 @dsh-forge/*（插件只经 lib/ 基座取能力）'

const SCAN = [
  { dir: 'apps/web/src', rpc: true, watch: true },
  { dir: 'packages/core/src', rpc: false, watch: true },
  { dir: 'apps/mobile/src', mobile: true },
  { dir: 'plugins/*', pluginsLib: true },
]

/** plugins 只依赖 lib：非 lib- 前缀的 @dsh-forge/* 子路径即违规（import / dynamic import / require 三形） */
const RE_PLUGINS_LIB = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]@dsh-forge\/(?!lib-)[\w-]*/
/** plugins 扫描面：四源码目录，排除测试与产物（测试可 import contracts 做断言——合理，不禁） */
const PLUGINS_SUBDIRS = ['host', 'ui', 'shared', 'src']
const PLUGINS_BASELINE = join(ROOT, 'scripts/lint-imports.plugins-baseline.json')

const errors = []

/**
 * 注释剥离（单次扫描状态机）：行注释跳到行尾、块注释跳到闭合、单/双/反引号字符串整体跳过
 * （字符串内的注释符不是注释）。
 * Root cause（selftest _lintneg_comment_fake_block_opener 判例）：旧实现「先剥块注释再剥行注释」
 * 两遍正则——行注释里出现字面块注释开头符（如「（/* 消费面）」）会被误当块注释起点，一路吃到
 * 下一个真闭合符，把中间的 import 整段吞掉，四条规则在该文件上全部失效。
 * 保留行数（注释替换为空、不删行）——调用方按行号定位。
 */
function stripComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const next = i + 1 < n ? src[i + 1] : ''
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n' // 保留行数
        i++
      }
      i = Math.min(i + 2, n)
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c
      out += c
      i++
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '')
          i += 2
          continue
        }
        if (src[i] === '\n') out += '\n'
        else out += src[i]
        i++
      }
      if (i < n) {
        out += q
        i++
      }
      continue
    }
    out += c
    i++
  }
  return out
}

/** plugins→packages 违规行计数（剥离注释、跳过 raw-import 行后逐行匹配） */
function countPluginsLibHits(src) {
  let n = 0
  stripComments(src)
    .split('\n')
    .forEach((line) => {
      if (/raw-import/.test(line)) return
      if (RE_PLUGINS_LIB.test(line)) n++
    })
  return n
}

/** 基线读取：{ "<rel path>": <hits> }；缺席 = 空基线（全部按新文件零容忍） */
function loadPluginsBaseline() {
  if (!existsSync(PLUGINS_BASELINE)) return new Map()
  try {
    const obj = JSON.parse(readFileSync(PLUGINS_BASELINE, 'utf8'))
    return new Map(Object.entries(obj).map(([k, v]) => [k, Number(v)]))
  } catch {
    return new Map()
  }
}

const pluginsBaseline = loadPluginsBaseline()
const pluginsSeen = new Set()

function scanFile(rootDir, rpc, watch, mobile, abs) {
  const rel2 = relative(ROOT, abs).split('\\').join('/')
  const src = readFileSync(abs, 'utf8')
  stripComments(src)
    .split('\n')
    .forEach((line) => {
      if (/raw-import/.test(line)) return
      if (rpc && /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]@dsh-forge\/(?:core|knowledge)['"]/.test(line)) {
        errors.push(`${rel2} ${MSG_RPC} @dsh-forge/{core,knowledge}`)
      }
      if (watch) {
        if (/(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](?:@parcel\/watcher|chokidar)['"]/.test(line)) {
          errors.push(`${rel2} ${MSG_WATCH}（chokidar/@parcel/watcher）`)
        }
        if (
          /\bimport\s+(?:type\s+)?\{[^}]*\b(?:watch|watchFile)\b[^}]*\}\s*from\s*['"](?:node:)?fs['"]/.test(line) ||
          /\bimport\s+(?:type\s+)?\{[^}]*\b(?:watch|watchFile)\b[^}]*\}\s*from\s*['"](?:node:)?fs\/promises['"]/.test(line)
        ) {
          errors.push(`${rel2} ${MSG_WATCH}（fs watch/watchFile 命名导入）`)
        }
        if (/\b(?:fs|fsPromises|fsp)\.(?:watch|watchFile)\s*\(/.test(line)) {
          errors.push(`${rel2} ${MSG_WATCH}（fs.watch/watchFile 调用）`)
        }
      }
      if (mobile && /['"](?:@dsh-forge\/web|.*\/apps\/web\/)['"]/.test(line)) {
        errors.push(`${rel2} ${MSG_MOBILE_WEB}`)
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

/** plugins/* 的源码文件枚举（四子目录；排除测试与产物） */
function* walkPluginsSources() {
  const pluginsRoot = join(ROOT, 'plugins')
  if (!existsSync(pluginsRoot)) return
  for (const pkg of readdirSync(pluginsRoot)) {
    const pkgDir = join(pluginsRoot, pkg)
    if (!statSync(pkgDir).isDirectory()) continue
    for (const sub of PLUGINS_SUBDIRS) {
      const subDir = join(pkgDir, sub)
      if (!existsSync(subDir)) continue
      for (const p of walk(subDir)) {
        const ext = extname(p)
        if (ext !== '.ts' && ext !== '.tsx' && ext !== '.mts') continue
        const base = p.split(/[\\/]/).pop()
        if (/\.test\.|\.spec\./.test(base)) continue
        if (/[\\/]dist[\\/]/.test(p)) continue
        yield p
      }
    }
  }
}

/**
 * plugins 只依赖 lib（铁律）核验：基线内文件违规数只减不增；基线外文件零容忍。
 * 基线缩空后本段与基线文件一并删除——届时规则对全部 plugins 文件零容忍。
 */
function checkPluginsLib(abs) {
  const rel2 = relative(ROOT, abs).split('\\').join('/')
  const hits = countPluginsLibHits(readFileSync(abs, 'utf8'))
  pluginsSeen.add(rel2)
  const allowed = pluginsBaseline.get(rel2)
  if (allowed === undefined) {
    if (hits > 0) errors.push(`${rel2} ${MSG_PLUGINS_LIB}（${hits} 处；基线外文件零容忍）`)
    return
  }
  if (hits > allowed) {
    errors.push(`${rel2} ${MSG_PLUGINS_LIB}（${hits} 处 > 基线 ${allowed}——只减不增；从基线删行前先清零该文件）`)
  }
}

let scanned = 0
for (const { dir, rpc, watch, mobile } of SCAN) {
  if (dir === 'plugins/*') continue // plugins 面单独枚举（见下）
  for (const p of walk(join(ROOT, dir))) {
    const ext = extname(p)
    if (ext !== '.ts' && ext !== '.tsx' && ext !== '.mts') continue
    scanned++
    scanFile(dir, rpc, watch, mobile, p)
  }
}
for (const p of walkPluginsSources()) {
  scanned++
  checkPluginsLib(p)
}
// 基线里的文件若已不存在（删除/迁移），提示可从基线移除——不报错，只收敛提示
const staleBaseline = [...pluginsBaseline.keys()].filter((k) => !pluginsSeen.has(k))
for (const k of staleBaseline) console.error(`[import-lint] 基线陈旧：${k} 已不在扫描面，可从 plugins-baseline.json 删除`)

if (errors.length > 0) {
  console.error(`[import-lint] ${errors.length} 处违规：`)
  for (const e of errors) console.error('  ' + e)
  process.exit(1)
}
const baseN = pluginsBaseline.size
console.log(
  `[import-lint] 0 违规（${scanned} 个文件扫描：RPC 边界 + SC2 watch 禁令 + mobile 边界 + plugins 只依赖 lib[基线 ${baseN} 文件待清账]）`,
)
