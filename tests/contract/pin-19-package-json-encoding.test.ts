// G1 pin ⑲：仓库包清单编码/JSON 合法性契约。
// 背景：package.json 编码损坏（U+FFFD 吞中文截断引号）在本仓多度复发，均靠后继崩溃偶然暴露
// （提交体声称全绿而其树含非法 JSON）——本 pin 让损坏在 contract 套件即红，不再依赖后继暴露。
// 断言面：全仓 packages/**/package.json（含 apps/host 与根 package.json，排除 node_modules）逐个：
//   1. UTF-8 可解码（无非法字节序列）
//   2. 无 BOM（EF BB BF）
//   3. 原始文本无 U+FFFD 替换字符
//   4. JSON.parse 合法
// 失败信息携带文件路径与首个损坏字节的字节偏移（机械定位）。
// 校验器/枚举器单源 = scripts/lib/check-package-json.mjs（bug 家族 eaea8cea 收口——
// 同一实现同时供 pnpm build / pnpm dev 前置机检 CLI 消费，不再各持一份）。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enumerateRepoPackageJsons, expectValidPackageJson, ROOT } from '../../scripts/lib/check-package-json.mjs'

const BOM = '\uFEFF'
const SAMPLE_DIR = `${ROOT}/.tmp-pin-19-samples`
const SAMPLE_PATH = `${SAMPLE_DIR}/package.json`

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
  it('枚举面非空（packages/**/package.json 含 apps/host 与根）', () => {
    const files = enumerateRepoPackageJsons()
    expect(files.length).toBeGreaterThan(0)
    expect(files).toContain('apps/host/package.json')
    expect(files).toContain('package.json')
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
