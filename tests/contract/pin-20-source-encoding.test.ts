// G1 pin ⑳：仓库源码文件编码契约（pin-19 盲区扩展——判例家族 eaea8cea 第八度）。
// 背景：plugins/task-loop/ui/keyed-section.ts 整文件 UTF-8 被 GBK 误读后二次编码落盘
// （头注/JSDoc/运行期 console.error 文案全 mojibake）——package.json 之外的源码文件
// 无任何编码机检，损坏靠人工终审偶然暴露。本 pin 让源码编码损坏在 contract 套件即红。
// 断言面：packages / plugins / apps / scripts / tests / e2e 递归源码文件（ts/tsx/js 族，
// 排除 node_modules / dist / 隐藏目录）逐个：
//   1. UTF-8 可解码（无非法字节序列）
//   2. 无 BOM（EF BB BF）
//   3. 无 GBK-mojibake 签名字符簇（双字损坏痕迹，≥2 个不同签名命中即判损坏）
// 校验器/枚举器单源 = scripts/lib/check-source-encoding.mjs。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { ROOT, enumerateRepoSources, expectValidUtf8Source } from '../../scripts/lib/check-source-encoding.mjs'

const SAMPLE_DIR = `${ROOT}/.tmp-pin-20-samples`
const SAMPLE_PATH = `${SAMPLE_DIR}/sample.ts`

function writeSample(content: string | Buffer): void {
  mkdirSync(SAMPLE_DIR, { recursive: true })
  writeFileSync(SAMPLE_PATH, content)
}

afterEach(() => {
  rmSync(SAMPLE_DIR, { recursive: true, force: true })
})

describe('pin ⑳-1 在场树：全仓源码文件编码合法', () => {
  it('枚举面非空（含 task-loop ui 池）', () => {
    const files = enumerateRepoSources()
    expect(files.length).toBeGreaterThan(0)
    expect(files).toContain('plugins/task-loop/ui/keyed-section.ts')
  })

  it('逐个断言 UTF-8 可解码 + 无 BOM + 无 GBK-mojibake 签名', () => {
    const bad: string[] = []
    for (const rel of enumerateRepoSources()) {
      try {
        expectValidUtf8Source(`${ROOT}/${rel}`)
      } catch (err) {
        bad.push((err as Error).message)
      }
    }
    expect(bad, `源码编码损坏（${bad.length} 个）:\n${bad.join('\n')}`).toEqual([])
  })
})

describe('pin ⑳-2 校验器自测：构造损坏样本可使其红（自测径，临时样本不触仓库树）', () => {
  it('GBK-mojibake 双字损坏样本 → 红（含签名与路径）', () => {
    // keyed-section.ts 判例同款签名簇（「——降级不注册」的 GBK 二次编码形态；
    // \u 转义书写——本测试文件自身也在扫描面内，字面量会自伤）
    writeSample(
      'const x = 1; // failed\u{9225}\u{65ba}\u{20ac}\u{951b}\u{6ab7}\u{7efe}\u{442}\u{7b09}\u{5a09}\u{951f}\u{553d}\n' +
        '// \u{93bb}\u{6393}\u{42b}\u{93b5}\u{2541}\u{774d}\u{9410}\u{6052}\u{20ac}\u{509c}\u{6d30}\u{93cd}\u{56e8}\u{3002}',
    )
    expect(() => expectValidUtf8Source(SAMPLE_PATH)).toThrow(/GBK-mojibake.*pin-20-samples.*@ byte \d+/)
  })

  it('非法字节序列坏样本 → 红（含 byte 偏移与路径）', () => {
    writeSample('const ok = 1;\n')
    // 截断的多字节序列（E6 8F 后缺续字节）= 非 UTF-8 可解码
    writeSample(Buffer.concat([Buffer.from('const ok = 1;\n'), Buffer.from([0xe6, 0x8f])]))
    expect(() => expectValidUtf8Source(SAMPLE_PATH)).toThrow(/非 UTF-8 可解码.*@ byte/)
  })

  it('BOM 坏样本 → 红', () => {
    writeSample('\uFEFFconst ok = 1;\n')
    expect(() => expectValidUtf8Source(SAMPLE_PATH)).toThrow(/UTF-8 BOM/)
  })

  it('合法样本（含中文注释）→ 绿（校验器不误伤）', () => {
    writeSample('// keyed section 插槽扩展点——声明缝与落座同名（含全角标点：（））\nexport const x = 1;\n')
    expect(() => expectValidUtf8Source(SAMPLE_PATH)).not.toThrow()
  })
})
