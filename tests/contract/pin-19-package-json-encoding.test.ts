// G1 pin ⑲：仓库包清单编码/JSON 合法性契约。
// 背景：package.json 编码损坏（U+FFFD 吞中文截断引号）在本仓多度复发，均靠后继崩溃偶然暴露
// （提交体声称全绿而其树含非法 JSON）——本 pin 让损坏在 contract 套件即红，不再依赖后继暴露。
// 断言面：全仓 packages/**/package.json（含 apps/host package.json，排除 node_modules）逐个：
//   1. UTF-8 可解码（无非法字节序列）
//   2. 无 BOM（EF BB BF）
//   3. 原始文本无 U+FFFD 替换字符
//   4. JSON.parse 合法
// 失败信息携带文件路径与首个损坏字节的字节偏移（机械定位）。
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ROOT } from './pins.js'

const BOM = '\uFEFF'
const REPLACEMENT = '\uFFFD'
const SAMPLE_DIR = `${ROOT}/.tmp-pin-19-samples`
const SAMPLE_PATH = `${SAMPLE_DIR}/package.json`

/** 单文件校验：非法即抛错（消息含绝对路径 + 首损坏字节偏移）——供在场树枚举与坏样本自测共用 */
export function expectValidPackageJson(absPath: string): void {
  const buf = readFileSync(absPath)
  // 1) UTF-8 可解码 + 首损坏字节偏移
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    // fatal decode 拒绝时逐字节回溯定位首个非法序列起点
    let offset = 0
    while (offset < buf.length) {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(offset, offset + 4))
        offset += 1
      } catch {
        break
      }
    }
    throw new Error(`package.json 非 UTF-8 可解码: ${absPath} @ byte ${offset}`)
  }
  // 2) BOM（TextDecoder 默认剥头部 BOM，须按原始字节断言 EF BB BF）
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    throw new Error(`package.json 带 UTF-8 BOM: ${absPath} @ byte 0`)
  }
  // 3) U+FFFD 替换字符
  const fffd = text.indexOf(REPLACEMENT)
  if (fffd >= 0) {
    // 字符索引 → 字节偏移（按 UTF-8 折算，失败消息给字节级定位）
    const before = Buffer.from(text.slice(0, fffd), 'utf8')
    throw new Error(`package.json 含 U+FFFD 替换字符（编码损坏痕迹）: ${absPath} @ byte ${before.length}`)
  }
  // 4) JSON.parse
  try {
    JSON.parse(text)
  } catch (err) {
    throw new Error(`package.json 非法 JSON: ${absPath} @ ${(err as SyntaxError).message}`)
  }
}

/** 仓库在场包清单枚举：packages 递归 package.json + apps/host/package.json，排除 node_modules */
export function enumerateRepoPackageJsons(): string[] {
  const walk = (dir: string, base: string): string[] => {
    const out: string[] = []
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue
      const rel = base ? `${base}/${ent.name}` : ent.name
      if (ent.isDirectory()) out.push(...walk(`${dir}/${ent.name}`, rel))
      else if (ent.name === 'package.json') out.push(rel)
    }
    return out
  }
  return [...walk(`${ROOT}/packages`, 'packages'), 'apps/host/package.json'].sort()
}

function withSampleFile(content: string, fn: () => void): void {
  mkdirSync(SAMPLE_DIR, { recursive: true })
  writeFileSync(SAMPLE_PATH, content, 'utf8')
  try {
    fn()
  } finally {
    rmSync(SAMPLE_DIR, { recursive: true, force: true })
  }
}

describe('pin ⑲-1 在场树：全仓 package.json 编码与 JSON 合法', () => {
  it('枚举面非空（packages/**/package.json 含 apps/host）', () => {
    const files = enumerateRepoPackageJsons()
    expect(files.length).toBeGreaterThan(0)
    expect(files).toContain('apps/host/package.json')
  })

  it('逐个断言 UTF-8 可解码 + 无 BOM + 无 U+FFFD + JSON.parse 合法', () => {
    const bad: string[] = []
    for (const rel of enumerateRepoPackageJsons()) {
      try {
        expectValidPackageJson(`${ROOT}/${rel}`)
      } catch (err) {
        bad.push((err as Error).message)
      }
    }
    expect(bad, `包清单编码/JSON 损坏（${bad.length} 个）:\n${bad.join('\n')}`).toEqual([])
  })
})

describe('pin ⑲-2 校验器自测：构造损坏样本可使其红（自测径，临时样本不触仓库树）', () => {
  it('U+FFFD 吞中文截断引号的坏样本 → 红（含 byte 偏移与路径）', () => {
    withSampleFile(`{"name":"\uFFFD测试","version":"0.1.0}`, () => {
      expect(() => expectValidPackageJson(SAMPLE_PATH)).toThrow(/U\+FFFD 替换字符.*pin-19-samples.*@ byte \d+/)
    })
  })

  it('非法 JSON（截断）坏样本 → 红', () => {
    withSampleFile('{"name": "x"', () => {
      expect(() => expectValidPackageJson(SAMPLE_PATH)).toThrow(/非法 JSON/)
    })
  })

  it('BOM 坏样本 → 红', () => {
    withSampleFile(`${BOM}{"name": "x"}`, () => {
      expect(() => expectValidPackageJson(SAMPLE_PATH)).toThrow(/UTF-8 BOM/)
    })
  })

  it('合法样本（含中文）→ 绿（校验器不误伤）', () => {
    withSampleFile('{"name":"合法中文名","version":"0.1.0"}', () => {
      expect(() => expectValidPackageJson(SAMPLE_PATH)).not.toThrow()
    })
  })
})
