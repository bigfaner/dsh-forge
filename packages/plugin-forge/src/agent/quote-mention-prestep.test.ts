// quote mention 发送期展开 pre-step 单测（super-composer 提案 §2.3——bug-mention-prestep.test 同构）：
// 正则双锚定扫描（scheme + uuid36 形状）/ 多 mention 去重 / 幂等（已含同 id 块不追加）/
// <quote> 块投影（client serializeQuoteSnapshot 尾块同构镜像）/ 快照缺失跳过 /
// waterfall next 语义 / fail-soft / 零开销。
import { describe, expect, it, vi } from 'vitest'
import {
  attachQuoteMentionPrestep,
  createQuoteSnapshotStore,
  expandQuoteMentions,
  hasQuoteBlock,
  scanQuoteMentions,
  serializeQuoteBlock,
} from './quote-mention-prestep.js'
import type {
  PreStepDecisionFace,
  PreStepRegisterFace,
  PrestepUserMessageFace,
  QuoteMentionPrestepDeps,
  QuoteSnapshotFace,
} from './quote-mention-prestep.js'

const UUID = '3f9c2a1e-8b14-4c6d-9a77-2e5f0b81c9d3'
const UUID2 = 'a8098c1a-f86e-11da-bd1a-00112444be1e'

function snapshot(overrides: Partial<QuoteSnapshotFace> = {}): QuoteSnapshotFace {
  return {
    id: UUID,
    text: '文本引用锚定的核心是把一段选区映射为稳定描述符：精确前缀 + 引用文本 + 精确后缀三段拼合。',
    source: 'dockkit 文档示例：锚定与重定位',
    ...overrides,
  }
}

function userMessage(text: string): PrestepUserMessageFace {
  return { id: 'm-1', role: 'user', content: [{ type: 'text', text }] }
}

function deps(snapshots: QuoteSnapshotFace[] = []): QuoteMentionPrestepDeps & { lookups: string[] } {
  const lookups: string[] = []
  const map = new Map(snapshots.map((s) => [s.id, s]))
  return {
    lookups,
    resolveQuote: (id: string) => {
      lookups.push(id)
      return map.get(id)
    },
  }
}

describe('scanQuoteMentions（正则双锚定：@[…](quote:<uuid36>)）', () => {
  it('uuid36 形状命中', () => {
    expect(scanQuoteMentions(`看下 @[摘要](quote:${UUID}) 这个`)).toEqual([UUID])
  })

  it('非 uuid 形状（短号/缺 scheme/他 scheme）不命中——误报面收窄', () => {
    expect(scanQuoteMentions('@[摘要](quote:b-42)')).toEqual([])
    expect(scanQuoteMentions(`@[摘要](notquote:${UUID})`)).toEqual([])
    expect(scanQuoteMentions(`@[摘要](quote:${UUID.slice(0, 8)})`)).toEqual([])
    expect(scanQuoteMentions(`@[摘要](${UUID})`)).toEqual([])
  })

  it('多 mention 去重按 id', () => {
    const text = `@[一](quote:${UUID}) 中间 @[二](quote:${UUID2}) 再 @[三](quote:${UUID})`
    expect(scanQuoteMentions(text)).toEqual([UUID, UUID2])
  })

  it('无 mention = 空集', () => {
    expect(scanQuoteMentions('普通消息，@文件引用与纯文本')).toEqual([])
  })
})

describe('serializeQuoteBlock（<quote> 块——client serializeQuoteSnapshot 尾块镜像）', () => {
  it('id/source 属性与全文块体逐位一致', () => {
    expect(serializeQuoteBlock(snapshot())).toBe(
      [
        `<quote id="quote:${UUID}" source="dockkit 文档示例：锚定与重定位">`,
        '文本引用锚定的核心是把一段选区映射为稳定描述符：精确前缀 + 引用文本 + 精确后缀三段拼合。',
        '</quote>',
      ].join('\n'),
    )
  })

  it('source 缺席/空 = 不出属性', () => {
    expect(serializeQuoteBlock(snapshot({ source: undefined }))).toBe(
      `<quote id="quote:${UUID}">\n${snapshot().text}\n</quote>`,
    )
    expect(serializeQuoteBlock(snapshot({ source: '' }))).not.toContain('source=')
  })
})

describe('hasQuoteBlock（幂等判别）', () => {
  it('已含同 id 块 = true；他 id 块 = false', () => {
    const text = `前文 <quote id="quote:${UUID}" source="x">\n全文\n</quote> 后文`
    expect(hasQuoteBlock(text, UUID)).toBe(true)
    expect(hasQuoteBlock(text, UUID2)).toBe(false)
  })
})

describe('expandQuoteMentions（展开核心）', () => {
  it('命中且快照在场：原文 mention 保留，尾部追加 <quote> 块', () => {
    const d = deps([snapshot()])
    const mention = `@[文本引用锚定的核心是…](quote:${UUID}) 这段什么意思？`
    const messages = [userMessage(mention)]
    const out = expandQuoteMentions(messages, d)
    expect(out).not.toBe(messages)
    const content = out[0]?.content as readonly { type: string; text: string }[]
    expect(content).toHaveLength(2)
    expect((content[0] as { text: string }).text).toBe(mention)
    expect((content[1] as { text: string }).text).toBe(serializeQuoteBlock(snapshot()))
    expect(d.lookups).toEqual([UUID])
  })

  it('幂等：消息已含同 id 块不重复追加（引用不变）', () => {
    const d = deps([snapshot()])
    const text = `@[x](quote:${UUID})\n${serializeQuoteBlock(snapshot())}`
    const messages = [userMessage(text)]
    expect(expandQuoteMentions(messages, d)).toBe(messages)
    expect(d.lookups).toEqual([]) // 早退零开销——不触发快照查找
  })

  it('同 id 多 mention 只追加一块', () => {
    const d = deps([snapshot()])
    const messages = [userMessage(`@[一](quote:${UUID}) @[二](quote:${UUID})`)]
    const out = expandQuoteMentions(messages, d)
    const content = out[0]?.content as readonly unknown[]
    expect(content).toHaveLength(2)
    expect(((content[1] as { text: string }).text.match(/<quote id=/g) ?? []).length).toBe(1)
  })

  it('快照缺失：原文不动（同引用）、mention 保留、零追加', () => {
    const d = deps([])
    const messages = [userMessage(`@[ghost](quote:${UUID})`)]
    expect(expandQuoteMentions(messages, d)).toBe(messages)
  })

  it('快照 text 空/非字符串 = 视同缺失不追加', () => {
    const d = deps([snapshot({ text: '' })])
    const messages = [userMessage(`@[x](quote:${UUID})`)]
    expect(expandQuoteMentions(messages, d)).toBe(messages)
  })

  it('非 user 角色消息不扫描', () => {
    const d = deps([snapshot()])
    const messages = [{ id: 'm-2', role: 'assistant', content: [{ type: 'text', text: `@[x](quote:${UUID})` }] }]
    expect(expandQuoteMentions(messages, d)).toBe(messages)
    expect(d.lookups).toEqual([])
  })

  it('多 mention 混合：在场快照追加、缺失跳过不阻断他块', () => {
    const d = deps([snapshot()])
    const messages = [userMessage(`@[有](quote:${UUID}) @[无](quote:${UUID2})`)]
    const out = expandQuoteMentions(messages, d)
    const content = out[0]?.content as readonly { text: string }[]
    expect(content).toHaveLength(2)
    expect(content[1]?.text).toContain(`<quote id="quote:${UUID}"`)
    expect(content[1]?.text).not.toContain(UUID2)
  })
})

describe('createQuoteSnapshotStore', () => {
  it('cache 后 get 命中；非法快照不落缓存', () => {
    const store = createQuoteSnapshotStore()
    store.cache(snapshot())
    expect(store.get(UUID)).toEqual(snapshot())
    expect(store.get(UUID2)).toBeUndefined()
    store.cache({ id: '', text: 'x' })
    expect(store.get('')).toBeUndefined()
  })
})

describe('attachQuoteMentionPrestep（waterfall 挂接——bug-mention-prestep 同位）', () => {
  type PrestepListener = (payload: unknown, next: () => Promise<PreStepDecisionFace>) => Promise<PreStepDecisionFace>
  function faceOf(): PreStepRegisterFace & { registered: { event: string; options: unknown; listener: PrestepListener }[] } {
    const registered: { event: string; options: unknown; listener: PrestepListener }[] = []
    const face: PreStepRegisterFace = {
      on: (event, listener, options) => {
        registered.push({ event, listener: listener as PrestepListener, options })
        return () => {}
      },
    }
    return Object.assign(face, { registered })
  }

  async function runListener(
    face: ReturnType<typeof faceOf>,
    payload: unknown,
    decision: PreStepDecisionFace,
  ): Promise<PreStepDecisionFace> {
    const first = face.registered[0]
    if (first === undefined) throw new Error('pre-step 监听器未注册')
    return first.listener(payload, async () => decision)
  }

  it('enter 决策：展开后的消息替换进决策；无 mention = 原样透传（零改动）', async () => {
    const face = faceOf()
    const d = deps([snapshot()])
    expect(attachQuoteMentionPrestep(face, d)).toBeTypeOf('function')
    const messages = [userMessage(`@[x](quote:${UUID})`)]
    const out = await runListener(face, {}, { kind: 'enter', messages })
    expect(out.kind).toBe('enter')
    expect((out as { messages: unknown }).messages).not.toBe(messages)
    const plain = [userMessage('hello')]
    const out2 = await runListener(face, {}, { kind: 'enter', messages: plain })
    expect((out2 as { messages: unknown }).messages).toBe(plain)
  })

  it('startsRequestSeries 语义保留', async () => {
    const face = faceOf()
    attachQuoteMentionPrestep(face, deps([snapshot()]))
    const messages = [userMessage(`@[x](quote:${UUID})`)]
    const out = await runListener(face, {}, { kind: 'enter', messages, startsRequestSeries: true })
    expect((out as { startsRequestSeries?: true }).startsRequestSeries).toBe(true)
  })

  it('reject 决策原样透传（不触消息）', async () => {
    const face = faceOf()
    attachQuoteMentionPrestep(face, deps())
    const out = await runListener(face, {}, { kind: 'reject' })
    expect(out).toEqual({ kind: 'reject' })
  })

  it('fail-soft：快照查找异常不阻断——决策原样放行', async () => {
    const face = faceOf()
    const d: QuoteMentionPrestepDeps = {
      resolveQuote: () => {
        throw new Error('store down')
      },
    }
    attachQuoteMentionPrestep(face, d)
    const messages = [userMessage(`@[x](quote:${UUID})`)]
    const out = await runListener(face, {}, { kind: 'enter', messages })
    expect((out as { messages: unknown }).messages).toBe(messages)
  })

  it('face.on 缺席 = 不注册（undefined 返回）', () => {
    expect(attachQuoteMentionPrestep({}, deps())).toBeUndefined()
  })

  it('注册携带 global 选项（任意 agent scope waterfall 可达）', () => {
    const face = faceOf()
    attachQuoteMentionPrestep(face, deps())
    expect((face.registered[0] as { event: string; options: unknown }).event).toBe('agent/pre-step')
    expect((face.registered[0] as { options: { global?: boolean } }).options).toEqual({ global: true })
  })

  it('零开销：无 mention 不触发任何快照查找', async () => {
    const face = faceOf()
    const d = deps([snapshot()])
    const spy = vi.spyOn(d, 'resolveQuote')
    attachQuoteMentionPrestep(face, d)
    await runListener(face, {}, { kind: 'enter', messages: [userMessage('没有 mention')] })
    expect(spy).not.toHaveBeenCalled()
  })
})
