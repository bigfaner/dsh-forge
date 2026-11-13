// stage④ 1.2 golden 零漂移对照（J2-CT-04——契约↔golden 形状一致）。
// 迁移自 packages/contracts/src/dto/knowledge.test.ts（bug c8a50d50）：运行期 fixture 对照
// 违反 dto 测试自述「纯类型零逻辑零依赖」，且 e2e/support import 越出 contracts 测试
// tsconfig rootDir（TS6059）——按执行树归位 tests/knowledge（vitest knowledge-journeys
// 工程；tests/tsconfig 无 rootDir 锁）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertSameStructure } from '../../../e2e/support/knowledge-golden/compare.js'
import type { KnowledgeCard, RecallFeedbackOutcome, RecallGroup } from '../../../packages/contracts/src/dto/knowledge.js'

const STAGE4_FIXTURES = join(import.meta.dirname, '../../../e2e/support/knowledge-golden/fixtures/stage4')

/** 契约 DTO 镜像（typed）↔ golden fixture 结构等价：golden 任一键集/类型/长度漂移即红 */
describe('stage4 golden 对照：契约与响应形状零漂移（assertSameStructure——标量不参与）', () => {
  it('sessionRecall.json ↔ RecallGroup[] 契约镜像（六组：search×3/read/read-abstract/browse——键集/类型/命中长度逐组对齐 1.9 回填夹具）', () => {
    const fixture = JSON.parse(readFileSync(join(STAGE4_FIXTURES, 'sessionRecall.json'), 'utf8')) as { response: unknown }
    const mirror: RecallGroup[] = [
      {
        callId: 'g1', turnSeq: null, verb: 'read',
        query: { entryId: 2 },
        hitCount: 1, durationMs: 1, createdAt: 't', triggerSnap: null, contentSnap: '# 标题 (id, status, version ts)\n正文',
        hits: [{ rowId: 43, entryId: 3, frontmatterId: 'id', title: 't', domainPath: 'd', heat: 1, score: null, scope: 'project' }],
      },
      {
        callId: 'g2', turnSeq: null, verb: 'browse',
        query: { domain: 'd', offset: 0, limit: 20, order: 'status' },
        hitCount: 1, durationMs: 3, createdAt: 't', triggerSnap: null, contentSnap: null,
        hits: [
          { rowId: 45, entryId: 4, frontmatterId: 'id', title: 't', domainPath: 'd', heat: 1, score: null, scope: 'project' },
          { rowId: 46, entryId: 5, frontmatterId: 'id', title: 't', domainPath: 'd', heat: 0, score: null, scope: 'global' },
        ],
      },
      {
        callId: 'g3', turnSeq: null, verb: 'search',
        query: { text: 'q' },
        hitCount: 1, durationMs: 2, createdAt: 't', triggerSnap: null, contentSnap: null,
        hits: [
          { rowId: 41, entryId: 1, frontmatterId: 'id', title: 't', domainPath: 'd', heat: 2, score: 0.91, scope: 'project' },
          { rowId: 42, entryId: 6, frontmatterId: 'id', title: 't', domainPath: '', heat: 1, score: 0.72, scope: 'global' },
        ],
      },
      {
        callId: 'g4', turnSeq: null, verb: 'search',
        query: { text: 'q' },
        hitCount: 0, durationMs: 2, createdAt: 't', triggerSnap: null, contentSnap: null, hits: [],
      },
      {
        callId: 'g5', turnSeq: null, verb: 'read-abstract',
        query: { entryId: 2 },
        hitCount: 1, durationMs: 1, createdAt: 't', triggerSnap: null, contentSnap: null,
        hits: [{ rowId: 44, entryId: 2, frontmatterId: 'id', title: 't', domainPath: 'd', heat: 2, score: null, scope: 'project' }],
      },
      {
        callId: 'g6', turnSeq: null, verb: 'search',
        query: { text: 'q', domainPrefix: 'd' },
        hitCount: 0, durationMs: 0, createdAt: 't', triggerSnap: null, contentSnap: null, hits: [],
      },
    ]
    expect(() => assertSameStructure(fixture.response, mirror, '$.response')).not.toThrow()
  })

  it('listEntries.json ↔ KnowledgeCard[] 契约镜像（卡级 scope 在场；请求面 domainPrefix 过滤形态——1.9 回填夹具）', () => {
    const fixture = JSON.parse(readFileSync(join(STAGE4_FIXTURES, 'listEntries.json'), 'utf8')) as { request: { domainPrefix?: string }; response: unknown }
    expect(typeof fixture.request.domainPrefix).toBe('string')
    const mirror: KnowledgeCard[] = [
      { entryId: 6, title: 't', summary: 's', keywords: ['k', 'k2'], status: 'confirmed', domainPath: '', updated: 'u', heat: 1, scope: 'global' },
      { entryId: 5, title: 't', summary: 's', keywords: ['k1', 'k2'], status: 'unconfirmed', domainPath: 'd', updated: 'u', heat: 0, scope: 'global' },
    ]
    expect(() => assertSameStructure(fixture.response, mirror, '$.response')).not.toThrow()
  })

  it('recallFeedback.json ↔ RecallFeedbackOutcome 契约镜像（行级 👍 成功回执——第七通道）', () => {
    const fixture = JSON.parse(readFileSync(join(STAGE4_FIXTURES, 'recallFeedback.json'), 'utf8')) as { response: unknown }
    const mirror: RecallFeedbackOutcome = { results: [{ rowId: 41, outcome: 'success' }] }
    expect(() => assertSameStructure(fixture.response, mirror, '$.response')).not.toThrow()
  })
})
