// G1 pin ⑲（M3 pin 池扩池 #19，任务 5.1）：预设镜像行机械 diff + config 全集（常驻项）。
// 权威：tech-design Appendix「契约面 pin 扩池」第 19 项 + Testing Strategy 契约 pin 行
// （预设镜像行机械 diff + config 全集）。Story 6：双预设镜像不随上游演进漂移（机械防线）。
// 3.7 契约测试（apps/host/src/profile/presets.test.ts——底稿落面 AC）收口为 G1 常驻项：
// 本 pin 在 G1 单一入口（pnpm test:contract）独立复做机械 diff（两池同红 = 上游 bump
// 告警面；分叉行豁免集与产品增量行口径与 3.7 一致）。
// Hard Rule：pin = 机械断言（diff/枚举）——无装载行为断言（装载面归 3.7 池）。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from './pins.js'

const PRESETS_DIR = join(ROOT, 'apps/host/src/profile/presets')
const UPSTREAM = join(
  ROOT,
  'apps/host/profile.dev/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml',
)

/** 插件行块抽取（10 空格缩进 `- id:` 分块——与 3.7 presets.test.ts 同法；尾随空行收敛） */
function pluginRowBlocks(text: string): Map<string, string> {
  const blocks = new Map<string, string[]>()
  let current: { id: string; buf: string[] } | undefined
  for (const line of text.split('\n')) {
    const match = /^ {10}- id: (\S+)\s*$/.exec(line)
    if (match !== null) {
      if (current !== undefined) blocks.set(current.id, current.buf)
      current = { id: match[1]!, buf: [line] }
      continue
    }
    if (current !== undefined) current.buf.push(line)
  }
  if (current !== undefined) blocks.set(current.id, current.buf)
  return new Map([...blocks].map(([id, buf]) => [id, buf.join('\n').trimEnd()]))
}

/** 行块内映射键全集（任意深度 `key:` 行——config 全集断言比较基） */
function blockKeys(block: string): Set<string> {
  const keys = new Set<string>()
  for (const line of block.split('\n')) {
    const match = /^\s+([A-Za-z][\w-]*):(?:\s|$)/.exec(line)
    if (match !== null) keys.add(match[1]!)
  }
  return keys
}

const upstreamText = existsSync(UPSTREAM) ? readFileSync(UPSTREAM, 'utf8') : ''
const upstreamRows = pluginRowBlocks(upstreamText)

/** 产品分叉行（镜像 diff 豁免）与产品增量行（上游没有）——口径与 3.7 presets.test.ts 一致 */
const FORKED_ROWS = new Set(['persona', 'skill-filesystem'])
const PRODUCT_ROWS = new Set(['plugin-forge', 'plugin-forge-spec'])

describe('pin ⑲ 前置（环境门——上游物化树在场）', () => {
  it('上游 standard.patch.yml 在场且行集非空（缺席 = 环境缺口，先 pnpm -C apps/host/profile.dev install）', () => {
    expect(existsSync(UPSTREAM), UPSTREAM).toBe(true)
    expect(upstreamRows.size).toBeGreaterThan(0)
  })
})

for (const preset of ['expedition', 'blitz'] as const) {
  const text = readFileSync(join(PRESETS_DIR, `${preset}.patch.yml`), 'utf8')
  const rows = pluginRowBlocks(text)

  describe(`pin ⑲ ${preset} 预设镜像行（standard 基础行机械 diff + config 全集）`, () => {
    it('standard 基础行 ↔ 上游机械 diff 一致（分叉行外逐字节——行集不缺不增）', () => {
      // 行集等式：底稿行集 − 产品增量行 = 上游行集（不缺不增——上游增删行即红）
      expect([...rows.keys()].filter((id) => !PRODUCT_ROWS.has(id))).toEqual([...upstreamRows.keys()])
      // 逐行逐字节：非分叉镜像行与上游行块全等
      for (const [id, block] of upstreamRows) {
        if (FORKED_ROWS.has(id)) continue
        expect(rows.get(id), `${preset} 行 ${id} ↔ 上游漂移`).toBe(block)
      }
    })

    it('镜像行 config 全集（上游键 ⊆ 底稿键——含分叉行；缺键 = schema 拒 → 整预设 broken）', () => {
      for (const [id, block] of upstreamRows) {
        const mirror = rows.get(id)
        expect(mirror, `${preset} 行 ${id} 缺席`).toBeDefined()
        for (const key of blockKeys(block)) {
          expect(blockKeys(mirror!), `${preset} 行 ${id} 丢上游 config 键 ${key}`).toContain(key)
        }
      }
    })

    it('产品增量行在场（镜像面之外的产品行——plugin-forge[+spec] 归属 3.7 分叉断言，此处只锚行集边界）', () => {
      expect(rows.has('plugin-forge')).toBe(true)
      expect(rows.has('plugin-forge-spec')).toBe(preset === 'expedition')
    })
  })
}
