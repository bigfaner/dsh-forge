// 5.3 审计锚源码扫描引擎（Hard Rule：审计锚必须自动化——grep/构建图/测试断言落 test 面）。
// 形制沿 G0 import 扫描器（scripts/lint-imports.mjs——行级正则 + 注释剥离），差异：
//   · 块注释以空格替身（保行号——findings 可定位到行）；
//   · .md 文件不剥离（markdown 无注释语法，剥离会误吞 URL 的 //）——技能文本引用扫描面；
//   · 行尾 `audit-allow` 豁免（使用须在执行记录说明理由——raw-import 同口径）。
// 本文件零 electron 依赖——vitest（e2e-support 池）与 Playwright spec 双面消费。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** 单条禁令（id = finding 归因锚；pattern = 行级正则；message = 违规说明） */
export interface SourceScanRule {
  readonly id: string
  readonly pattern: RegExp
  readonly message: string
}

/** 命中行（file = 相对扫描根的前斜杠路径；line = 1 起） */
export interface SourceScanHit {
  readonly rule: string
  readonly file: string
  readonly line: number
  readonly text: string
}

/** 扫描文件筛选（缺省 .ts/.tsx/.mts——与 G0 扫描器同集；.md 按需追加） */
export interface ListSourceOptions {
  readonly extensions?: readonly string[]
}

/**
 * 注释剥离（块注释空格替身保行号 + 行注释整段剔除——G0 同形制）。
 * 已知取舍（与 G0 一致）：字符串字面量内的 `//`（如 URL）会被误剥——禁令模式与
 * URL 共存概率可忽略，且剥离只会漏报不会误报。
 */
export function stripSourceComments(src: string): string {
  const blockErased = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  return blockErased
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** 递归列源码文件（字母序确定性；符号链接不跟随） */
export function listSourceFiles(rootDir: string, opts: ListSourceOptions = {}): string[] {
  const exts = opts.extensions ?? ['.ts', '.tsx', '.mts']
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile() && exts.some((x) => e.name.endsWith(x))) out.push(p)
    }
  }
  walk(rootDir)
  return out
}

/** 依规则集扫描文件清单（.md 原文、其余剥注释；audit-allow 行豁免） */
export function scanFilesForRules(absRoot: string, files: readonly string[], rules: readonly SourceScanRule[]): SourceScanHit[] {
  const hits: SourceScanHit[] = []
  for (const abs of files) {
    const rel = relative(absRoot, abs).split('\\').join('/')
    let src: string
    try {
      src = readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    const scanned = abs.endsWith('.md') ? src : stripSourceComments(src)
    for (const [idx, line] of scanned.split('\n').entries()) {
      if (/audit-allow/.test(src.split('\n')[idx] ?? '')) continue
      for (const rule of rules) {
        if (rule.pattern.test(line)) {
          hits.push({ rule: rule.id, file: rel, line: idx + 1, text: line.trim().slice(0, 200) })
        }
      }
    }
  }
  return hits
}

/** 目录在场判定（正锚使用——白名单/只读面等「必须在场」断言的路径存在性） */
export function pathExists(absPath: string): boolean {
  try {
    statSync(absPath)
    return true
  } catch {
    return false
  }
}

/** 读源码文件原文（缺席 → null；正锚面由调用方判空报 finding） */
export function readSourceOrNull(absPath: string): string | null {
  try {
    return readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
}
