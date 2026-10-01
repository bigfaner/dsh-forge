#!/usr/bin/env node
// import 边界扫描（G0）—— oxlint 1.86 未实现 no-restricted-syntax，以下两类禁令
// 由本零依赖扫描器机械执行（与 oxlint 三铁律同入根 `pnpm lint`）：
//   1. 运行期边界：apps/web 禁 import @dsh-forge/{core,knowledge}（renderer 只经 IPC RPC）；
//   2. SC2 无投影：apps/web + packages/core 禁 fs.watch / fs.watchFile / chokidar 类
//      监听回流依赖——索引重建只经用户显式触发的扫描。
// 豁免：行尾 `// raw-import`（使用须在执行记录说明理由）。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const MSG_RPC =
  '[import-lint] dsh-forge 运行期边界：renderer 只经 IPC RPC（contracts 通道常量）与数据内核通信，禁 import'
const MSG_WATCH =
  '[import-lint] dsh-forge SC2 无投影：禁文件监听回流依赖（fs.watch/chokidar 类）——重建只经用户显式触发'

const SCAN = [
  { dir: 'apps/web/src', rpc: true, watch: true },
  { dir: 'packages/core/src', rpc: false, watch: true },
]

const errors = []

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
}

function scanFile(rootDir, rpc, watch, abs) {
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
for (const { dir, rpc, watch } of SCAN) {
  for (const p of walk(join(ROOT, dir))) {
    const ext = extname(p)
    if (ext !== '.ts' && ext !== '.tsx' && ext !== '.mts') continue
    scanned++
    scanFile(dir, rpc, watch, p)
  }
}

if (errors.length > 0) {
  console.error(`[import-lint] ${errors.length} 处违规：`)
  for (const e of errors) console.error('  ' + e)
  process.exit(1)
}
console.log(`[import-lint] 0 违规（${scanned} 个文件扫描：RPC 边界 + SC2 watch 禁令）`)
