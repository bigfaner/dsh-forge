// 五句判定式回归测试集（knowledge-stage2-write-gateway/1.6——提案 §2.5）：
// 每类 ≥5 篇人工定标。定标面两层：
//   ① 真实语料锚点（存量收编 121 篇中人工定标、判定式高置信一致的样本）
//   ② 人工定标样例（判定式修订用的随仓定标篇章——判据语义来自 §2.1 五句判定式）
// 判定式修订必须本集全绿（置信误判 = FAIL；低置信不定判 = 允许——procedure 默认 + 待定路径）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { predictType } from '../../../packages/plugins/knowledge/src/service/write.js'
import type { KnowledgeType } from '../../../packages/plugins/knowledge/src/service/types.js'

/** 真实语料锚点（.knowledge 存量——人工定标 + 判定式高置信一致） */
const CORPUS_PINS: ReadonlyArray<readonly [KnowledgeType, string]> = [
  ['conventions', 'conventions/bare-catch-exemption-five-families.md'],
  ['conventions', 'conventions/blocked-source-derivation-needs-block-source.md'],
  ['conventions', 'conventions/cross-realm-service-via-inject-service-key.md'],
  ['conventions', 'conventions/structural-guarantee-uninstallable.md'],
  ['conventions', 'conventions/negative-claims-exhaust-all-test-surfaces.md'],
  ['pitfalls', 'conventions/assembly-guards-atomic-idempotent-with-diag.md'],
  ['pitfalls', 'conventions/batch-state-transition-skips-terminal.md'],
  ['pitfalls', 'conventions/committed-json-artifacts-byte-verified-no-bom.md'],
  ['pitfalls', 'conventions/full-gate-inflight-pollution-narrowing.md'],
  ['pitfalls', 'lessons/fix-bug-dedup-before-record.md'],
  ['lessons', 'examples/cdp-attribution-four-round-contrast.md'],
  ['lessons', 'examples/immutable-map-snapshot-via-mutator-override-freeze.md'],
  ['lessons', 'examples/persona-migration-audit-trace.md'],
  ['lessons', 'lessons/audit-actor-hardcoded-provenance-degrades-to-one-way-prefix.md'],
  ['decisions', 'examples/full-renumber-idempotent-sort-write.md'],
  ['decisions', 'examples/four-key-total-order-null-last.md'],
  ['decisions', 'examples/hr-preset-mirror-plus-single-increment-line.md'],
  ['facts', 'lessons/baseline-dump-after-restart-needs-triggered-turn.md'],
]

/** 人工定标样例（判定式修订定标面——每类语义骨架的最小篇章） */
const AUTHORED_PINS: ReadonlyArray<readonly [KnowledgeType, string]> = [
  ['conventions', ['守卫装配纪律', '装配守卫必须原子幂等；降级必须留诊断痕迹；禁止静默吞错。', '## 规范\n\n- 必须原子幂等\n- 禁止 fail-soft 零留痕'].join('\n')],
  ['conventions', ['提交纪律约定', '提交必须按逻辑单元分批；禁止 add -A 一把梭；不得夹带过程产物。', '## 约定\n\n- 提交先 lint 后 add 指名路径'].join('\n')],
  ['pitfalls', ['watch 孤儿坑', 'watch 形态子进程成孤儿持续吃内存，已发生原生崩溃误诊。', '## 现象\n\n- 内存耗尽崩溃\n\n## 避免方式\n\n- 一律 run-once'].join('\n')],
  ['pitfalls', ['junction 误诊陷阱', 'junction 绑定目录不报错，UI 不变症状极易误诊为构建层问题。', '## 现象\n\n- 改源码不生效\n\n## 处置\n\n- 先查 Target'].join('\n')],
  ['lessons', ['取证方法复盘', '事后归纳的等价证据方法论：文本日志与截图互证，闭环验证。', '## 复盘\n\n- 归纳出可复用的最小形态'].join('\n')],
  ['lessons', ['经验总结', '对三轮排障的总结与经验教训提炼，形成方法论沉淀。', '## 总结\n\n- 教训沉淀为范式'].join('\n')],
  ['decisions', ['排序方案论证', '为何四键全序而非三键局部序：这样设计保证确定性重放。', '## 设计\n\n- 该方案的权衡：全序换取零回填'].join('\n')],
  ['decisions', ['选型裁决记录', '为什么选 junction 而非复制装载：零拷贝即时生效是取舍依据。', '## 选型\n\n- 改用前方案的缺陷'].join('\n')],
  ['facts', ['数据落位现状', '自持库当前为单文件应用级库；进程名为 dsh-forge-dev；表结构含六实体。', '## 机制\n\n- 存储在数据域 knowledge 子目录'].join('\n')],
  ['facts', ['生命周期事实', '会话日志字段集现状：boot 事件无 workspace 字段，此为机制陈述。', '## 环境\n\n- 版本为 v4 schema'].join('\n')],
  ['facts', ['路径契约事实', 'volume 路径契约现状：落位在建模报告目录，路径为固定派生。', '## 结构\n\n- 目录为三级派生'].join('\n')],
  ['facts', ['进程形态事实', '两形态进程名现状：安装包形态为 dsh-forge，dev 形态为 dsh-forge-dev。', '## 环境\n\n- 进程名区分两形态'].join('\n')],
]

describe('五句判定式回归集（每类 ≥5 人工定标；判定式修订必须全绿）', () => {
  it('真实语料锚点：高置信判定与定标一致', () => {
    for (const [expected, rel] of CORPUS_PINS) {
      const raw = readFileSync(join(process.cwd(), '.knowledge', rel), 'utf8')
      const judged = predictType(raw)
      expect({ rel, ...judged }).toEqual({ rel, type: expected, confident: true })
    }
  })

  it('人工定标样例：判定与定标一致', () => {
    for (const [expected, text] of AUTHORED_PINS) {
      const judged = predictType(text)
      expect({ expected, ...judged }).toEqual({ expected, type: expected, confident: true })
    }
  })

  it('每类 ≥5 篇定标（数量下限门）', () => {
    const counts = new Map<KnowledgeType, number>()
    for (const [type] of [...CORPUS_PINS, ...AUTHORED_PINS]) counts.set(type, (counts.get(type) ?? 0) + 1)
    expect(Object.fromEntries(counts)).toMatchObject({
      conventions: expect.any(Number),
      pitfalls: expect.any(Number),
      lessons: expect.any(Number),
      decisions: expect.any(Number),
      facts: expect.any(Number),
    })
    for (const [type, n] of counts) expect(n, `${type} 定标数`).toBeGreaterThanOrEqual(5)
  })

  it('零信号文本 → 低置信不定判（procedure 默认 + 待定路径不改写）', () => {
    const judged = predictType('一日午后。')
    expect(judged.confident).toBe(false)
  })
})
