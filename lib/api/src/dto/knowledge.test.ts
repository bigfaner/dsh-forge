// knowledge-review-ui（1.3）—— knowledge 域 DTO pin（人工裁决写面契约）。
// 契约正本：.forge/docs/proposals/knowledge-review-ui/testing/contracts/entry-action-channel.md
//（§1 通道形状 / §2 回执 code 封闭字面量联合）。接口形状为编译期面——键结构断言锚，
// expectTypeOf 锚经 lint:test-types 机械执行。
// 定位铁律：dto 文件纯类型零逻辑零依赖（本测试只 pin 形状）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { assertSameStructure } from '../../../../e2e/support/knowledge-golden/compare.js'
import type {
  DomainNode,
  EntryActionFailureCode,
  EntryActionReceipt,
  EntryActionRequest,
  EntryActionRequestReject,
  EntryActionRequestRejectCode,
  EntryActionResult,
  EntryScope,
  EntryScopeFilter,
  EntryStatusFilter,
  KnowledgeCard,
  ListEntriesQuery,
  RecallFeedbackFailureCode,
  RecallFeedbackOutcome,
  RecallFeedbackRequest,
  RecallFeedbackResult,
  RecallGroup,
  RecallGroupHit,
  RecallQuerySnapshot,
  RecallVerb,
} from './knowledge.js'

describe('knowledge-review-ui AC1 ListEntriesQuery 扩 statusFilter', () => {
  it('statusFilter 可选封闭字面量（all/unconfirmed/confirmed——服务端执行过滤）', () => {
    expectTypeOf<EntryStatusFilter>().toEqualTypeOf<'all' | 'unconfirmed' | 'confirmed'>()
    expectTypeOf<ListEntriesQuery['statusFilter']>().toEqualTypeOf<EntryStatusFilter | undefined>()
  })
})

describe('knowledge-review-ui AC1 DomainNode 扩 unconfirmedCount', () => {
  it('unconfirmedCount 恒在场（未过滤口径独立查询面供数——SC-E2 过滤独立性）', () => {
    expectTypeOf<DomainNode['unconfirmedCount']>().toEqualTypeOf<number>()
  })
})

describe('knowledge-review-ui AC1 EntryActionRequest 判别联合（action 判别键）', () => {
  it('五动词判别：confirm/reject 批量 / move·editMeta 恰 1 条 / createDomain 无 entryIds', () => {
    const confirm: EntryActionRequest = { projectId: 'p-1', action: 'confirm', entryIds: [1, 2] }
    const reject: EntryActionRequest = { projectId: 'p-1', action: 'reject', entryIds: [] }
    const move: EntryActionRequest = { projectId: 'p-1', action: 'move', entryIds: [1], targetDomain: '编程/java' }
    const editMeta: EntryActionRequest = {
      projectId: 'p-1',
      action: 'editMeta',
      entryIds: [1],
      title: 't',
      keywords: ['k'],
      summary: 's',
      body: 'b',
    }
    const createDomain: EntryActionRequest = { projectId: 'p-1', action: 'createDomain', domain: '编程/java' }
    expect(confirm.entryIds).toHaveLength(2)
    expect(reject.entryIds).toEqual([])
    expect(move.targetDomain).toBe('编程/java')
    expect(editMeta.entryIds).toHaveLength(1)
    expect(createDomain.domain).toBe('编程/java')
    expectTypeOf<EntryActionRequest['action']>().toEqualTypeOf<
      'confirm' | 'reject' | 'move' | 'editMeta' | 'createDomain'
    >()
  })

  it('批量/单条/空校验语义入注释锚：move/editMeta entryIds 元组 [number]（恰 1 条编译期形状）', () => {
    expectTypeOf<Extract<EntryActionRequest, { action: 'move' }>['entryIds']>().toEqualTypeOf<[number]>()
    expectTypeOf<Extract<EntryActionRequest, { action: 'editMeta' }>['entryIds']>().toEqualTypeOf<[number]>()
    expectTypeOf<Extract<EntryActionRequest, { action: 'confirm' }>['entryIds']>().toEqualTypeOf<number[]>()
    expectTypeOf<Extract<EntryActionRequest, { action: 'createDomain' }>>().not.toHaveProperty('entryIds')
  })
})

describe('knowledge-review-ui AC1 EntryActionReceipt 逐条回执（per-item outcome）', () => {
  it('逐条结果判别：success / failure{code,message}', () => {
    const ok: EntryActionResult = { entryId: 1, outcome: 'success' }
    const fail: EntryActionResult = { entryId: 2, outcome: 'failure', code: 'stale', message: '条目已前进' }
    expect(ok.outcome).toBe('success')
    expect(fail.code).toBe('stale')
    expectTypeOf<EntryActionResult['outcome']>().toEqualTypeOf<'success' | 'failure'>()
    expectTypeOf<EntryActionReceipt['results']>().toEqualTypeOf<EntryActionResult[]>()
  })

  it('请求级拒收形状：rejected-request + code invalid-request（不进逐条数组）', () => {
    const rejected: EntryActionRequestReject = { outcome: 'rejected-request', code: 'invalid-request', message: 'x' }
    expect(rejected.outcome).toBe('rejected-request')
    expectTypeOf<EntryActionRequestReject['outcome']>().toEqualTypeOf<'rejected-request'>()
    expectTypeOf<EntryActionRequestRejectCode>().toEqualTypeOf<'invalid-request'>()
  })
})

describe('knowledge-review-ui AC1 failure code 封闭字面量联合（契约 §2 码集锚）', () => {
  it('码集七成员逐位 pin（already-confirmed 不是 failure 码——幂等成功等价）', () => {
    expectTypeOf<EntryActionFailureCode>().toEqualTypeOf<
      'rejected-confirmed' | 'stale' | 'cas-failed' | 'not-found' | 'domain-depth' | 'yaml-invalid' | 'precheck-failed'
    >()
    expectTypeOf<'already-confirmed'>().not.toMatchTypeOf<EntryActionFailureCode>()
  })
})

// ───────────────────────── stage④ 1.7：recall-scope contracts 面（recall-record-channel.md §1 S1–S12） ─────────────────────────

describe('stage④ 1.7 RecallVerb 四值封闭枚举（S1——DB v7 ck_krl_verb 同步承载）', () => {
  it('search/read-abstract/read/browse 四值；联合外成员拒收', () => {
    expectTypeOf<RecallVerb>().toEqualTypeOf<'search' | 'read-abstract' | 'read' | 'browse'>()
    expectTypeOf<'grep'>().not.toMatchTypeOf<RecallVerb>()
  })
})

describe('stage④ 1.7 RecallGroup 扩 call 级三字段（S2/S3/S4）', () => {
  it('turnSeq/triggerSnap/contentSnap 可空字段 = `| null`（判例 7db97a7c：可空一律 null 禁 undefined）', () => {
    expectTypeOf<RecallGroup['turnSeq']>().toEqualTypeOf<number | null>()
    expectTypeOf<RecallGroup['triggerSnap']>().toEqualTypeOf<string | null>()
    expectTypeOf<RecallGroup['contentSnap']>().toEqualTypeOf<string | null>()
  })

  it('可空字段恒在场显式 null——序列化 round-trip 逐键保真（lossless JSON 判例 7db97a7c 运行期钉）', () => {
    const group: RecallGroup = {
      callId: 'call-1',
      verb: 'read',
      query: { frontmatterId: 'kb-be-001' },
      hitCount: 1,
      durationMs: null,
      createdAt: '2026-11-20T00:00:00.000Z',
      turnSeq: null,
      triggerSnap: null,
      contentSnap: '# 标题 (id, status, version ts)\n正文',
      hits: [],
    }
    for (const key of Object.keys(group)) {
      expect((group as Record<string, unknown>)[key], `键 ${key} 不得为 undefined`).not.toBeUndefined()
    }
    expect(JSON.parse(JSON.stringify(group))).toEqual(group)
  })
})

describe('stage④ 1.7 RecallGroupHit 扩 rowId/score/scope（S5/S6/S7）', () => {
  it('rowId 恒在场（行级反馈目标键）；score 可空 number；scope 封闭二值', () => {
    expectTypeOf<RecallGroupHit['rowId']>().toEqualTypeOf<number>()
    expectTypeOf<RecallGroupHit['score']>().toEqualTypeOf<number | null>()
    expectTypeOf<RecallGroupHit['scope']>().toEqualTypeOf<EntryScope>()
    expectTypeOf<EntryScope>().toEqualTypeOf<'project' | 'global'>()
    const hit: RecallGroupHit = { rowId: 41, entryId: 1, frontmatterId: 'kb-fe-001', title: 't', domainPath: 'd', heat: 1, score: 0.91, scope: 'project' }
    expect(hit.scope).toBe('project')
  })
})

describe('stage④ 1.7 RecallQuerySnapshot 快照键（S8/S9/S10）', () => {
  it('keywords 保留可选键标 legacy（JSON.parse 直转静默丢存量过滤事实防线）；hint/frontmatterId 有值才落键', () => {
    expectTypeOf<RecallQuerySnapshot['keywords']>().toEqualTypeOf<string[] | undefined>()
    expectTypeOf<RecallQuerySnapshot['hint']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<RecallQuerySnapshot['frontmatterId']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<RecallQuerySnapshot['domain']>().toEqualTypeOf<string | undefined>()
  })
})

describe('stage④ 1.7 列表查询面 scope 过滤（scope-source.md §1 S1/S2）', () => {
  it('scopeFilter 可选封闭三值（审核入口承载；缺省 all = 现役行为零变化）；KnowledgeCard.scope 恒在场', () => {
    expectTypeOf<EntryScopeFilter>().toEqualTypeOf<'all' | 'project' | 'global'>()
    expectTypeOf<ListEntriesQuery['scopeFilter']>().toEqualTypeOf<EntryScopeFilter | undefined>()
    expectTypeOf<KnowledgeCard['scope']>().toEqualTypeOf<EntryScope>()
  })
})

describe('stage④ 1.7 recallFeedback 第七通道信封（feedback-channel.md §1 S2/S3）', () => {
  it('请求判别联合：row 行级三值 / batch 事件级二值（事件级 👍 不存在——联合形状排除）', () => {
    const row: RecallFeedbackRequest = { projectId: 'p-1', action: 'row', rowId: 41, feedback: 1 }
    const batch: RecallFeedbackRequest = { projectId: 'p-1', action: 'batch', callId: 'call-1', feedback: -1, note: '误召回' }
    expect(row.action).toBe('row')
    expect(batch.feedback).toBe(-1)
    expectTypeOf<Extract<RecallFeedbackRequest, { action: 'row' }>['feedback']>().toEqualTypeOf<1 | -1 | 0>()
    expectTypeOf<Extract<RecallFeedbackRequest, { action: 'batch' }>['feedback']>().toEqualTypeOf<-1 | 0>()
    expectTypeOf<Extract<RecallFeedbackRequest, { action: 'batch' }>>().not.toHaveProperty('rowId')
  })

  it('回执码集封闭三值 + 请求级拒收（沿 entryAction 先例）', () => {
    expectTypeOf<RecallFeedbackFailureCode>().toEqualTypeOf<'not-found' | 'note-required' | 'unconfirmed'>()
    expectTypeOf<RecallFeedbackResult['outcome']>().toEqualTypeOf<'success' | 'failure'>()
    const rejected: RecallFeedbackOutcome = { outcome: 'rejected-request', code: 'invalid-request', message: 'x' }
    expect(rejected.outcome).toBe('rejected-request')
  })
})

// ───────────────────────── stage④ 1.2 golden 零漂移对照（J2-CT-04 / 动工固化后契约↔golden 形状一致） ─────────────────────────

const STAGE4_FIXTURES = join(import.meta.dirname, '../../../../e2e/support/knowledge-golden/fixtures/stage4')

/** 契约 DTO 镜像（typed）↔ golden fixture 结构等价：golden 任一键集/类型/长度漂移即红 */
describe('stage4 golden 对照：契约与响应形状零漂移（assertSameStructure——标量不参与）', () => {
  it('sessionRecall.json ↔ RecallGroup[] 契约镜像（六组：search×2/read/read-abstract/browse/legacy）', () => {
    const fixture = JSON.parse(readFileSync(join(STAGE4_FIXTURES, 'sessionRecall.json'), 'utf8')) as { response: unknown }
    const mirror: RecallGroup[] = [
      {
        callId: 'g1', turnSeq: 3, verb: 'search',
        query: { text: 'q', domainPrefix: 'd', hint: 'h' },
        hitCount: 2, durationMs: 4, createdAt: 't', triggerSnap: 's', contentSnap: null,
        hits: [
          { rowId: 41, entryId: 1, frontmatterId: 'id', title: 't', domainPath: 'd', heat: 2, score: 0.91, scope: 'project' },
          { rowId: 42, entryId: 6, frontmatterId: 'id', title: 't', domainPath: '', heat: 1, score: 0.72, scope: 'global' },
        ],
      },
      {
        callId: 'g2', turnSeq: 3, verb: 'search',
        query: { text: 'q', hint: 'h' },
        hitCount: 0, durationMs: 2, createdAt: 't', triggerSnap: 's', contentSnap: null, hits: [],
      },
      {
        callId: 'g3', turnSeq: 3, verb: 'read',
        query: { frontmatterId: 'kb-be-001' },
        hitCount: 1, durationMs: 1, createdAt: 't', triggerSnap: 's', contentSnap: '# 标题\n正文',
        hits: [{ rowId: 43, entryId: 3, frontmatterId: 'id', title: 't', domainPath: 'd', heat: 1, score: null, scope: 'project' }],
      },
      {
        callId: 'g4', turnSeq: 3, verb: 'read-abstract',
        query: { entryId: 2 },
        hitCount: 1, durationMs: 1, createdAt: 't', triggerSnap: 's', contentSnap: null,
        hits: [{ rowId: 44, entryId: 2, frontmatterId: 'id', title: 't', domainPath: 'd', heat: 2, score: null, scope: 'project' }],
      },
      {
        callId: 'g5', turnSeq: 3, verb: 'browse',
        query: { domain: 'd', offset: 0, limit: 20, order: 'status' },
        hitCount: 2, durationMs: 3, createdAt: 't', triggerSnap: 's', contentSnap: null,
        hits: [
          { rowId: 45, entryId: 4, frontmatterId: 'id', title: 't', domainPath: 'd', heat: 1, score: null, scope: 'project' },
          { rowId: 46, entryId: 5, frontmatterId: 'id', title: 't', domainPath: 'd', heat: 0, score: null, scope: 'global' },
        ],
      },
      {
        callId: 'g6', turnSeq: null, verb: 'search',
        query: { keywords: ['legacy'] },
        hitCount: 0, durationMs: 0, createdAt: 't', triggerSnap: null, contentSnap: null, hits: [],
      },
    ]
    expect(() => assertSameStructure(fixture.response, mirror, '$.response')).not.toThrow()
  })

  it('listEntries.json ↔ KnowledgeCard[] 契约镜像（scopeFilter=global 请求——卡级 scope 在场）', () => {
    const fixture = JSON.parse(readFileSync(join(STAGE4_FIXTURES, 'listEntries.json'), 'utf8')) as { request: { scopeFilter?: string }; response: unknown }
    expect(fixture.request.scopeFilter).toBe('global')
    const mirror: KnowledgeCard[] = [
      { entryId: 6, title: 't', summary: 's', keywords: ['k'], status: 'confirmed', domainPath: '', updated: 'u', heat: 1, scope: 'global' },
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
