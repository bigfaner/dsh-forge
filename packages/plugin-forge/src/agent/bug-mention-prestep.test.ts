// bug mention 发送期展开 pre-step 单测（bug-mention-prestep 提案）：
// 正则双锚定扫描（scheme + uuid36 形状）/ 多 mention 去重 / 幂等（已含同 id 块不追加）/
// 九字段块投影（apps/web serializeBugCard 同构镜像）/ 项目锚定（cwd→projectId 绑定优先，
// 未解析则注册项目有界遍历——client 侧 ea4fe3be 同口径）/ waterfall next 语义 / fail-soft。
import { describe, expect, it, vi } from 'vitest'
import type { BugCard } from '@dsh-forge/contracts'
import {
  attachBugMentionPrestep,
  expandBugMentions,
  hasBugBlock,
  scanBugMentions,
  serializeBugCardBlock,
  UUID36_PATTERN_SOURCE,
} from './bug-mention-prestep.js'
import type {
  BugMentionPrestepDeps,
  PreStepDecisionFace,
  PreStepRegisterFace,
  PrestepUserMessageFace,
} from './bug-mention-prestep.js'

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const UUID2 = 'a8098c1a-f86e-11da-bd1a-00112444be1e'

function card(bugId: string, overrides: Partial<BugCard> = {}): BugCard {
  return {
    bugId,
    summary: '修复后段一目录选取双开对话框',
    bugDesc: 'NativePick 在途态守卫缺失。',
    triggerDesc: '对话框在途时再次快速单击同钮。',
    expected: '恒至多一个对话框。',
    actual: '连开两个对话框。',
    bugStatus: 'open',
    reporter: 'faner',
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:00.000Z',
    ...overrides,
  }
}

function userMessage(text: string): PrestepUserMessageFace {
  return { id: 'm-1', role: 'user', content: [{ type: 'text', text }] }
}

function deps(options?: {
  anchoredProjectId?: string
  anchoredBugs?: BugCard[]
  registeredIds?: string[]
  projectsBugs?: Record<string, BugCard[]>
}): BugMentionPrestepDeps & { listBugsCalls: string[] } {
  const listBugsCalls: string[] = []
  return {
    listBugsCalls,
    bugs: {
      listBugs: async (q: { projectId: string }) => {
        listBugsCalls.push(q.projectId)
        if (options?.anchoredBugs !== undefined && q.projectId === options.anchoredProjectId) return options.anchoredBugs
        return options?.projectsBugs?.[q.projectId] ?? []
      },
    },
    projects: {
      listProjects: async () => (options?.registeredIds ?? []).map((id) => ({ id })),
    },
    resolveProjectId: (cwd: string) =>
      options?.anchoredProjectId !== undefined && cwd === 'C:\\ws\\demo' ? options.anchoredProjectId : undefined,
  }
}

describe('scanBugMentions（正则双锚定：@[…](bug:<uuid36>)）', () => {
  it('uuid36 形状命中', () => {
    expect(scanBugMentions(`看下 @[摘要](bug:${UUID}) 这个`)).toEqual([UUID])
  })

  it('非 uuid 形状（短号/缺 scheme）不命中——误报面收窄', () => {
    expect(scanBugMentions('@[摘要](bug:b-42)')).toEqual([])
    expect(scanBugMentions(`@[摘要](notbug:${UUID})`)).toEqual([])
    expect(scanBugMentions(`@[摘要](bug:${UUID.slice(0, 8)})`)).toEqual([])
  })

  it('多 mention 去重按 id', () => {
    const text = `@[一](bug:${UUID}) 中间 @[二](bug:${UUID2}) 再 @[三](bug:${UUID})`
    expect(scanBugMentions(text)).toEqual([UUID, UUID2])
  })

  it('无 mention = 空集', () => {
    expect(scanBugMentions('普通消息，@文件引用与纯文本')).toEqual([])
  })

  it('uuid36 形状源暴露（单源正则拼装面）', () => {
    expect(UUID36_PATTERN_SOURCE).toContain('{8}')
  })
})

describe('serializeBugCardBlock（九字段块——apps/web serializeBugCard 同构镜像）', () => {
  it('字段序与值逐字段一致；可空键缺席不出键', () => {
    expect(serializeBugCardBlock(card(UUID))).toBe(
      [
        `<bug bugId="${UUID}">`,
        '  summary: 修复后段一目录选取双开对话框',
        '  bugStatus: open',
        '  bugDesc: NativePick 在途态守卫缺失。',
        '  triggerDesc: 对话框在途时再次快速单击同钮。',
        '  expected: 恒至多一个对话框。',
        '  actual: 连开两个对话框。',
        '</bug>',
      ].join('\n'),
    )
  })

  it('errorType/suspected 在场时出键', () => {
    const block = serializeBugCardBlock(card(UUID, { errorType: 'concurrency', suspected: 'src/a.ts:120' }))
    expect(block).toContain('  errorType: concurrency')
    expect(block).toContain('  suspected: src/a.ts:120')
  })
})

describe('hasBugBlock（幂等判别）', () => {
  it('已含同 id 块 = true；他 id 块 = false', () => {
    const text = `前文 <bug bugId="${UUID}">\n  summary: x\n</bug> 后文`
    expect(hasBugBlock(text, UUID)).toBe(true)
    expect(hasBugBlock(text, UUID2)).toBe(false)
  })
})

describe('expandBugMentions（展开核心）', () => {
  it('命中且台账在场：原文保留，消息后紧跟九字段块（逐字段一致）', async () => {
    const d = deps({ anchoredProjectId: 'p-1', anchoredBugs: [card(UUID)] })
    const messages = [userMessage(`@[修复后段一目录选取双开对话框](bug:${UUID})`)]
    const out = await expandBugMentions(messages, d, 'C:\\ws\\demo')
    expect(out).not.toBe(messages)
    const content = out[0]?.content as readonly { type: string; text: string }[]
    expect(content).toHaveLength(2)
    expect((content[0] as { text: string }).text).toBe(`@[修复后段一目录选取双开对话框](bug:${UUID})`)
    expect((content[1] as { text: string }).text).toBe(serializeBugCardBlock(card(UUID)))
    expect(d.listBugsCalls).toEqual(['p-1']) // 绑定锚优先，未落空不遍历
  })

  it('幂等：消息已含同 id 块不重复追加（引用不变）', async () => {
    const d = deps({ anchoredProjectId: 'p-1', anchoredBugs: [card(UUID)] })
    const text = `@[x](bug:${UUID})\n<bug bugId="${UUID}">\n  summary: x\n</bug>`
    const messages = [userMessage(text)]
    await expect(expandBugMentions(messages, d, 'C:\\ws\\demo')).resolves.toBe(messages)
    expect(d.listBugsCalls).toEqual([]) // 早退零开销——不触发取数
  })

  it('同 id 多 mention 只追加一块', async () => {
    const d = deps({ anchoredProjectId: 'p-1', anchoredBugs: [card(UUID)] })
    const messages = [userMessage(`@[一](bug:${UUID}) @[二](bug:${UUID})`)]
    const out = await expandBugMentions(messages, d, 'C:\\ws\\demo')
    const content = out[0]?.content as readonly unknown[]
    expect(content).toHaveLength(2)
    expect(((content[1] as { text: string }).text.match(/<bug bugId=/g) ?? []).length).toBe(1)
  })

  it('查无此 bug：原文不动（同引用）、零追加', async () => {
    const d = deps({ anchoredProjectId: 'p-1', anchoredBugs: [] })
    const messages = [userMessage(`@[ghost](bug:${UUID})`)]
    await expect(expandBugMentions(messages, d, 'C:\\ws\\demo')).resolves.toBe(messages)
  })

  it('项目锚定：未解析绑定则注册项目有界遍历，首命中即全卡', async () => {
    const d = deps({ registeredIds: ['p-a', 'p-b'], projectsBugs: { 'p-b': [card(UUID)] } })
    const messages = [userMessage(`@[x](bug:${UUID})`)]
    const out = await expandBugMentions(messages, d, 'C:\\ws\\unbound')
    expect(out).not.toBe(messages)
    expect(d.listBugsCalls).toEqual(['p-a', 'p-b'])
  })

  it('非 user 角色消息不扫描', async () => {
    const d = deps({ anchoredProjectId: 'p-1', anchoredBugs: [card(UUID)] })
    const messages = [{ id: 'm-2', role: 'assistant', content: [{ type: 'text', text: `@[x](bug:${UUID})` }] }]
    await expect(expandBugMentions(messages, d, 'C:\\ws\\demo')).resolves.toBe(messages)
    expect(d.listBugsCalls).toEqual([])
  })
})

describe('attachBugMentionPrestep（waterfall 挂接）', () => {
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
    const d = deps({ anchoredProjectId: 'p-1', anchoredBugs: [card(UUID)] })
    expect(attachBugMentionPrestep(face, d)).toBeTypeOf('function')
    const messages = [userMessage(`@[x](bug:${UUID})`)]
    const out = await runListener(face, { agent: { session: { header: { cwd: 'C:\\ws\\demo' } } } }, { kind: 'enter', messages })
    expect(out.kind).toBe('enter')
    expect((out as { messages: unknown }).messages).not.toBe(messages)
    // 无 mention 消息：同引用透传
    const plain = [userMessage('hello')]
    const out2 = await runListener(face, { agent: { session: { header: { cwd: 'C:\\ws\\demo' } } } }, { kind: 'enter', messages: plain })
    expect((out2 as { messages: unknown }).messages).toBe(plain)
  })

  it('reject 决策原样透传（不触消息）', async () => {
    const face = faceOf()
    attachBugMentionPrestep(face, deps({ anchoredProjectId: 'p-1' }))
    const out = await runListener(face, {}, { kind: 'reject' })
    expect(out).toEqual({ kind: 'reject' })
  })

  it('fail-soft：取数异常不阻断——决策原样放行', async () => {
    const face = faceOf()
    const d = deps({ anchoredProjectId: 'p-1', anchoredBugs: [] })
    d.bugs.listBugs = async () => {
      throw new Error('ledger down')
    }
    attachBugMentionPrestep(face, d)
    const messages = [userMessage(`@[x](bug:${UUID})`)]
    const out = await runListener(face, { agent: { session: { header: { cwd: 'C:\\ws\\demo' } } } }, { kind: 'enter', messages })
    expect((out as { messages: unknown }).messages).toBe(messages)
  })

  it('face.on 缺席 = 不注册（undefined 返回）', () => {
    expect(attachBugMentionPrestep({}, deps())).toBeUndefined()
  })

  it('注册携带 global 选项（任意 agent scope waterfall 可达——approval relay 同径）', () => {
    const face = faceOf()
    attachBugMentionPrestep(face, deps())
    expect((face.registered[0] as { event: string; options: unknown }).event).toBe('agent/pre-step')
    expect((face.registered[0] as { options: { global?: boolean } }).options).toEqual({ global: true })
  })

  it('零开销：无 mention 不触发任何取数', async () => {
    const face = faceOf()
    const d = deps({ anchoredProjectId: 'p-1' })
    const spy = vi.spyOn(d.bugs, 'listBugs')
    attachBugMentionPrestep(face, d)
    const messages = [userMessage('没有 mention')]
    await runListener(face, { agent: { session: { header: { cwd: 'C:\\ws\\demo' } } } }, { kind: 'enter', messages })
    expect(spy).not.toHaveBeenCalled()
  })
})
