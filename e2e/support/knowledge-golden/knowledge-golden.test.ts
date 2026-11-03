// knowledge-stage1-foundation 1.3 —— 五通道 golden 载荷固化测试（SC-8 唯一断言载体）。
// 三断言面：
//   · fixture 完备性：五通道（KNOWLEDGE_CHANNELS 全集）× 典型载荷各≥1，fixture 注明
//     录制来源 = core 现役供数（迁移前形态）；
//   · 录制时点断言：core 供数在位（八法全集 + 索引六条目——mountGoldenSupply 内 fail-loud）；
//   · 对照执行入口：本测试即对照面——加载 fixture 与实时通道响应做结构等价比对
//     （assertSameStructure；供 SC-8 与供数迁移后复用）。
// 录制入口：KNOWLEDGE_GOLDEN_RECORD=1 npx vitest run --project e2e-support
//   e2e/support/knowledge-golden/knowledge-golden.test.ts（重录 fixture 落盘）。
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { KNOWLEDGE_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { assertSameStructure, loadGoldenFixture } from './compare.js'
import type { GoldenFixture } from './compare.js'
import { captureAllChannels, mountGoldenSupply } from './harness.js'
import type { GoldenMount } from './harness.js'
import { recordGoldenFixtures } from './record.js'

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')

// ── 挂载（单 mount 复用——五通道共享一次 core 供数装配） ──

const home = mkdtempSync(join(tmpdir(), 'dsh-forge-kgolden-test-'))
const mount: GoldenMount = await mountGoldenSupply(home)

afterAll(() => {
  mount.dispose()
  rmSync(home, { recursive: true, force: true })
})

// ── 录制入口（重录面——正常轮跳过） ──

describe.skipIf(process.env.KNOWLEDGE_GOLDEN_RECORD !== '1')('golden 重录入口', () => {
  it('录制五通道 fixture 落盘（core 现役供数）', async () => {
    const written = await recordGoldenFixtures(FIXTURES_DIR)
    expect(written).toHaveLength(5)
  })
})

// ── fixture 完备性与录制来源 ──

describe('五通道 golden fixture 完备性', () => {
  const channels = Object.values(KNOWLEDGE_CHANNELS)

  it('fixtures 目录 = 五通道全集（KNOWLEDGE_CHANNELS 逐通道一文件，无多余）', () => {
    const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json')).sort()
    expect(files).toEqual(channels.map((c) => `${c.replace('forge:knowledge/', '')}.json`).sort())
  })

  for (const channel of channels) {
    it(`${channel}：fixture 在场且典型载荷非空（响应快照 ≥1 条目/元素）`, () => {
      const fixture = loadGoldenFixture(FIXTURES_DIR, channel)
      const res = fixture.response
      const count = Array.isArray(res)
        ? res.length
        : res !== null && typeof res === 'object'
          ? Object.keys(res as object).length
          : 0
      expect(count, `${channel} 响应载荷为空——非典型载荷`).toBeGreaterThan(0)
    })

    it(`${channel}：fixture 注明录制来源 = core 现役供数（迁移前形态）`, () => {
      const fixture: GoldenFixture = loadGoldenFixture(FIXTURES_DIR, channel)
      expect(fixture.source.provider).toBe('core')
      expect(fixture.source.detail).toContain('createKnowledgeService')
      expect(fixture.source.detail).toContain('迁移前')
      expect(fixture.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  }
})

// ── 对照执行入口：fixture ↔ 实时通道响应结构等价比对（SC-8） ──

describe('golden ↔ 实时通道响应结构等价比对（SC-8）', () => {
  it('五通道全量：实时 core 供数响应与 fixture 逐通道结构等价', async () => {
    const captured = await captureAllChannels(mount)
    expect(captured.map((c) => c.channel).sort()).toEqual(Object.values(KNOWLEDGE_CHANNELS).sort())
    for (const { channel, response } of captured) {
      const fixture = loadGoldenFixture(FIXTURES_DIR, channel)
      expect(() => assertSameStructure(fixture.response, response), `${channel} 结构比对`).not.toThrow()
    }
  })

  it('结构等价比对器 fail-loud 自证：键集漂移与类型漂移均报出', () => {
    expect(() => assertSameStructure({ a: 1 }, { a: 1, b: 2 })).toThrowError(/键集失配/)
    expect(() => assertSameStructure([{ x: 's' }], [{ x: 1 }])).toThrowError(/类型 string ≠ number/)
    expect(() => assertSameStructure([1, 2], [1])).toThrowError(/数组长度/)
  })
})
