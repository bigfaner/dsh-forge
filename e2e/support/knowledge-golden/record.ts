// golden fixture 录制器（一次性落盘——录制入口；正常测试轮走比对，不走本模块写面）。
// 录制时点断言在 harness.mountGoldenSupply 内（core 供数在位 + 索引六条目）；
// 产物 = e2e/support/knowledge-golden/fixtures/<channel>.json × 5（KNOWLEDGE_CHANNELS 全集）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KNOWLEDGE_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { GOLDEN_FORMAT } from './compare.js'
import type { GoldenFixture } from './compare.js'
import { captureAllChannels, mountGoldenSupply } from './harness.js'

/** 录制五通道响应载荷快照 → fixturesDir（覆盖写；来源注明 core 现役供数） */
export async function recordGoldenFixtures(fixturesDir: string): Promise<string[]> {
  mkdirSync(fixturesDir, { recursive: true })
  const home = mkdtempSync(join(tmpdir(), 'dsh-forge-kgolden-'))
  const mount = await mountGoldenSupply(home)
  try {
    const captured = await captureAllChannels(mount)
    const written: string[] = []
    for (const { channel, request, response } of captured) {
      const fixture: GoldenFixture = {
        format: GOLDEN_FORMAT,
        version: 1,
        channel,
        recordedAt: new Date().toISOString(),
        source: {
          provider: 'core',
          detail:
            'packages/core createKnowledgeService（ctx.forgeKnowledge 现役供数——knowledge 迁移前形态，任务 1.3 录制；SC-8 契约与响应形状零变化的比对基线）',
          harness: 'e2e/support/knowledge-golden/harness.ts',
        },
        request,
        response,
      }
      const file = join(fixturesDir, `${channel.replace('forge:knowledge/', '')}.json`)
      writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
      written.push(file)
    }
    // 录制面完备自检：五通道全集落盘（KNOWLEDGE_CHANNELS 全覆盖）
    const expected = Object.values(KNOWLEDGE_CHANNELS).map((c) => join(fixturesDir, `${c.replace('forge:knowledge/', '')}.json`))
    if (written.length !== expected.length || !expected.every((f) => written.includes(f))) {
      throw new Error(`录制不完备：${written.join(',')} ≠ ${expected.join(',')}`)
    }
    return written
  } finally {
    mount.dispose()
    rmSync(home, { recursive: true, force: true })
  }
}
