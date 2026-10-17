#!/usr/bin/env node
// apps/host dist 新鲜度自检/重建(dev 起 watch 前置)——2026-10-15 实测事故治法:
// tsc -b 增量判定只信 dist/.tsbuildinfo 记录的源版本号,从不回头校验输出文件本身——
// 一旦 tsbuildinfo 与输出脱节(taskkill /T /F 截断在"输出已写、状态未写"中间态,或
// 孤儿 watch 与新 watch 共写同一 tsbuildinfo),后续 tsc -b / --watch 永远判定
// up-to-date 零 emit 不自愈,dist 半新半旧(main.js 新 import × lifecycle.js 旧导出)
// → electron ESM 加载即崩(dev.mjs existsSync 守卫查在场不查新鲜,脏 dist 照样放行)。
// 对拍口径绕开 tsbuildinfo:src 逐文件(ts→js、mts→mjs;*.test.ts 随 tsconfig exclude
// 无输出)mtime 须 ≤ 对应输出 mtime;dist *.js/*.mjs 无 src 对应 = 孤儿输出(退役
// 模块残留)。任一不符 → 清该 dist 全量重建(tsc -b 全图——根 references 含全部构建包;
// 清 dist 连腐化 tsbuildinfo 一并出局,重建后 watch 沿净状态起步)。
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** 守卫面：host + 全部 workspace 构建包（packages/plugins/* 曾游离 tsc -b 图外致 stale
 * dist——2026-10-17 git-worktree 事故；拓扑接入后此处对拍同步覆盖，防同一脱节病） */
const GUARDS = [
  { name: 'apps/host', src: join(ROOT, 'apps', 'host', 'src'), dist: join(ROOT, 'apps', 'host', 'dist') },
  ...readdirSync(join(ROOT, 'packages', 'plugins'), { withFileTypes: true })
    .filter((row) => row.isDirectory() && existsSync(join(ROOT, 'packages', 'plugins', row.name, 'tsconfig.json')))
    .map((row) => ({
      name: `packages/plugins/${row.name}`,
      src: join(ROOT, 'packages', 'plugins', row.name, 'src'),
      dist: join(ROOT, 'packages', 'plugins', row.name, 'dist'),
    })),
]

/** 递归收集目录下全部文件的 rel 路径(POSIX 分隔符,跨 Windows)。 */
function walkRel(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkRel(full, base, acc)
    else acc.push(relative(base, full).replaceAll('\\', '/'))
  }
  return acc
}

/** src rel → tsc 输出 rel(ts→js、mts→mjs);无输出者(*.test.ts / *.d.ts / 非 TS 资产)undefined。 */
function outputOf(rel) {
  if (rel.endsWith('.test.ts') || rel.endsWith('.d.ts')) return undefined
  if (rel.endsWith('.ts')) return `${rel.slice(0, -3)}.js`
  if (rel.endsWith('.mts')) return `${rel.slice(0, -4)}.mjs`
  return undefined
}

/** 输出 rel → src rel(仅可执行产物参与孤儿判定;d.ts/map 由 sourceOf 天然过滤)。 */
function sourceOf(outRel) {
  if (outRel.endsWith('.js')) return `${outRel.slice(0, -3)}.ts`
  if (outRel.endsWith('.mjs')) return `${outRel.slice(0, -4)}.mts`
  return undefined
}

const stale = [] // { name, dist, reasons[] }
for (const guard of GUARDS) {
  const reasons = []
  const srcRels = existsSync(guard.src) ? walkRel(guard.src) : []
  for (const rel of srcRels) {
    const outRel = outputOf(rel)
    if (outRel === undefined) continue
    const outPath = join(guard.dist, outRel)
    if (!existsSync(outPath)) {
      reasons.push(`缺输出 ${outRel}`)
      continue
    }
    if (statSync(join(guard.src, rel)).mtimeMs > statSync(outPath).mtimeMs) reasons.push(`输出落后 ${rel} → ${outRel}`)
  }
  if (existsSync(guard.dist)) {
    const srcSet = new Set(srcRels)
    for (const outRel of walkRel(guard.dist)) {
      const srcRel = sourceOf(outRel)
      if (srcRel === undefined || srcSet.has(srcRel)) continue
      reasons.push(`孤儿输出 ${outRel}(src 无 ${srcRel})`)
    }
  }
  if (reasons.length > 0) stale.push({ ...guard, reasons })
}
if (stale.length === 0) process.exit(0) // 新鲜——零输出零动作

console.warn('[ensure-host-dist] dist 陈旧(tsc -b 信 tsbuildinfo 不自愈)——清 dist 全量重建:')
for (const guard of stale) {
  console.warn(`  [${guard.name}]`)
  for (const reason of guard.reasons) console.warn(`    - ${reason}`)
  try {
    // maxRetries:electron 持锁输出文件的瞬时 EBUSY 缓冲(dev 重启竞速窗口)
    rmSync(guard.dist, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch (err) {
    console.error(`[ensure-host-dist] 清 dist 失败(文件被占用?先停 dev/electron):${err.message}`)
    process.exit(1)
  }
}
// 全图重建（根 references 已含 plugins——tsc -b 一次性更新所有 dist，防部分 stale）
const build = spawnSync('pnpm exec tsc -b', { shell: true, stdio: 'inherit', cwd: ROOT })
process.exit(build.status ?? 1)
