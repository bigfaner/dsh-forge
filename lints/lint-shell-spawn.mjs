#!/usr/bin/env node
// 子进程壳包装扫描——Windows 上「包 cmd /c」与「shell 包装不隐藏窗口」会拉起可见的
// cmd.exe 控制台窗口（长命令即黑窗常驻）。以下两类由本零依赖扫描器机械执行（入根 `pnpm lint`）：
//   1. 禁包 cmd 壳：spawn/exec 族首实参为 cmd / cmd.exe / ComSpec，或执行字符串含
//      `cmd /c`、`cmd /k`（含 .exe 变体）。
//   2. shell 包装须隐藏窗口：spawn/exec 族调用的实参区内 `shell` 键取非 false 值时，同一
//      实参区须带 `windowsHide: true`（Windows 上 shell 包装即 cmd.exe /d /s /c 包装）。
//      实参区以调用括号配对界定——类型字面量、数据表、夹具字符串里的 `shell:` 不属调用实参，不判。
//      选项对象经变量间接传入调用时不在实参区内，本规则不覆盖。
// 豁免：行尾 `// shell-spawn-exempt: <理由>`（无等价非壳形态时使用，理由须就地写明）。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SELF = 'lint-shell-spawn.mjs'

const SCAN_DIRS = ['scripts', 'plugins', 'apps', 'lib', 'packages', 'e2e', 'tests', 'lints']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'release', 'coverage', '.git', '.vite'])
const EXTS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.cjs', '.js'])

const MSG_CMD =
  '[shell-spawn-lint] 禁包 cmd 壳：spawn/exec 族不得经 cmd /c、cmd /k 执行（无等价非壳形态时行尾注 // shell-spawn-exempt: <理由>）'
const MSG_HIDE =
  '[shell-spawn-lint] shell 包装须隐藏窗口：调用的 shell 选项取非 false 值时同一实参区须带 windowsHide: true（Windows 上 shell 包装即 cmd.exe 包装）'

/** spawn/exec 族调用，首实参为 cmd / cmd.exe / ComSpec */
const RE_CMD_SPAWN =
  /\b[\w$]*(?:spawn|exec|fork)[\w$]*\s*\(\s*(['"])(?:cmd(?:\.exe)?|%ComSpec%|ComSpec)\1/g
/** spawn/exec 族调用，首实参表达式含 ComSpec（process.env.ComSpec 及其字面量回落） */
const RE_CMD_COMSPEC = /\b[\w$]*(?:spawn|exec|fork)[\w$]*\s*\(\s*[^,()]*?\bComSpec\b/g
/** 执行字符串内含 cmd /c | cmd /k（含引号与 .exe 变体） */
const RE_CMD_STRING = /\bcmd(?:\.exe)?['"]?\s+\/[ck]\b/g
/** spawn/exec 族调用起点（标识符含 spawn/exec/fork——含 promisify 包装名；regex.exec 等命中无害） */
const RE_CALL = /\b[\w$]*(?:spawn|exec|fork)[\w$]*\s*\(/g
/** 调用实参区内 shell 键取非 false 值 */
const RE_SHELL = /\bshell\s*:\s*(?!\s*false\b)\S/
const RE_HIDE = /\bwindowsHide\s*:\s*true\b/
const RE_EXEMPT = /\/\/\s*shell-spawn-exempt:\s*\S/

/**
 * 注释与字符串剥离（长度保持——偏移与行号不变；换行保留）：行注释到行尾、块注释到闭合。
 * keepStrings=true 保留字符串内容（规则 1 需读执行字符串）；false 把字符串内容置空
 * （规则 2 的括号配对与键名查找不受字符串内字符干扰）。
 */
export function stripForScan(text, keepStrings) {
  let out = ''
  let i = 0
  const n = text.length
  const blank = (ch) => (ch === '\n' ? '\n' : ' ')
  while (i < n) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === '/' && next === '/') {
      while (i < n && text[i] !== '\n') {
        out += ' '
        i++
      }
      continue
    }
    if (ch === '/' && next === '*') {
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        out += blank(text[i])
        i++
      }
      if (i < n) {
        out += '  '
        i += 2
      }
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      out += keepStrings ? ch : quote
      i++
      while (i < n && text[i] !== quote) {
        if (text[i] === '\\' && i + 1 < n) {
          out += keepStrings ? text[i] + text[i + 1] : '  '
          i += 2
          continue
        }
        out += keepStrings ? text[i] : blank(text[i])
        i++
      }
      if (i < n) {
        out += quote
        i++
      }
      continue
    }
    out += ch
    i++
  }
  return out
}

/** 调用实参区：自开括号后起到配对闭括号止（括号计数；超长或未闭合时截断） */
export function callArgRegions(code) {
  const out = []
  RE_CALL.lastIndex = 0
  let m
  while ((m = RE_CALL.exec(code)) !== null) {
    const open = m.index + m[0].length - 1
    let depth = 0
    let end = Math.min(code.length, open + 2000)
    for (let i = open; i < Math.min(code.length, open + 2000); i++) {
      const ch = code[i]
      if (ch === '(') depth++
      else if (ch === ')') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    out.push({ start: open + 1, end })
  }
  return out
}

export function shellSpawnViolations(rel, raw) {
  const out = []
  const lines = raw.split('\n')
  const lineOf = (at) => raw.slice(0, at).split('\n').length
  const exempt = (at) => RE_EXEMPT.test(lines[lineOf(at) - 1] ?? '')
  const withStrings = stripForScan(raw, true)
  const noStrings = stripForScan(raw, false)
  for (const re of [RE_CMD_SPAWN, RE_CMD_COMSPEC, RE_CMD_STRING]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(withStrings)) !== null) {
      if (exempt(m.index)) continue
      out.push(`${rel}:${lineOf(m.index)}: ${MSG_CMD}`)
    }
  }
  for (const { start, end } of callArgRegions(noStrings)) {
    const region = noStrings.slice(start, end)
    const hit = RE_SHELL.exec(region)
    if (hit === null || exempt(start + hit.index) || RE_HIDE.test(region)) continue
    out.push(`${rel}:${lineOf(start + hit.index)}: ${MSG_HIDE}`)
  }
  return out
}

function* walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    let stat
    try {
      stat = statSync(p)
    } catch {
      continue
    }
    if (stat.isDirectory()) yield* walk(p)
    else if (EXTS.has(extname(name))) yield p
  }
}

function main() {
  const errors = []
  let scanned = 0
  for (const dir of SCAN_DIRS) {
    for (const p of walk(join(ROOT, dir))) {
      if (basename(p) === SELF) continue // 规则源码自身含规则文本
      scanned++
      errors.push(...shellSpawnViolations(relative(ROOT, p).replaceAll('\\', '/'), readFileSync(p, 'utf8')))
    }
  }
  if (errors.length > 0) {
    console.error(`[shell-spawn-lint] ${errors.length} 处违规：`)
    for (const e of errors) console.error('  ' + e)
    process.exit(1)
  }
  console.log(`[shell-spawn-lint] 0 违规（${scanned} 个文件扫描：禁包 cmd 壳 + shell 包装须隐藏窗口）`)
}

const isCli = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) main()
