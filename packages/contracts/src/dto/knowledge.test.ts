// knowledge-review-ui（1.3）—— knowledge 域 DTO pin（人工裁决写面契约）。
// 契约正本：.forge/docs/proposals/knowledge-review-ui/testing/contracts/entry-action-channel.md
//（§1 通道形状 / §2 回执 code 封闭字面量联合）。接口形状为编译期面——键结构断言锚，
// expectTypeOf 锚经 lint:test-types 机械执行。
// 定位铁律：dto 文件纯类型零逻辑零依赖（本测试只 pin 形状）。
import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  DomainNode,
  EntryActionFailureCode,
  EntryActionReceipt,
  EntryActionRequest,
  EntryActionRequestReject,
  EntryActionRequestRejectCode,
  EntryActionResult,
  EntryStatusFilter,
  ListEntriesQuery,
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
