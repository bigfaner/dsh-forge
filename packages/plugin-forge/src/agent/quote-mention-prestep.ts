// quote mention 发送期展开 pre-step（super-composer 提案 §2.3 LLM 所见形式——
// bug-mention-prestep 判例同构：'agent/pre-step' waterfall 接入、纯函数投影面、
// 异常透传 fail-soft）。
//
// 行为（提案已定）：
// ① 扫描直接用户消息文本中的 quote mention——正则双锚定 @[…](quote:<uuid36>)
//    （scheme + uuid 形状，bug mention 同构，误报面极小）；
// ② 命中 → 快照缓存现查（选段快照由插件内存缓存——零业务耦合、不落库）；
// ③ 查得 → 消息 content 尾部追加 <quote id source>全文</quote> 结构化块
//    （原文 mention 保留——只追加不替换；块形状与 quote-reference client
//    serializeQuoteSnapshot 尾块同构，跨面禁 import——本镜像自持）；查无（会话
//    重启后回放等快照缺失场景）→ 原文不动、不追加（mention 保留，不伪造语境）；
// ④ 幂等：消息已含同 id 块不追加（早退零开销）；多 mention 去重按 id；
// ⑤ fail-soft：展开面任何异常 → 决策原样放行，绝不阻断发送。
//
// 形态：扫描/投影/取数纯函数 + attachQuoteMentionPrestep 挂接（ctx.on 防御读取——
// 服务缺席 = 不注册 fail-soft；global 注册使任意 agent scope waterfall 可达——
// bug-mention-prestep 同位）。快照存储 = createQuoteSnapshotStore 内存 Map
// （宿主侧单一真相；插件侧 cache 入口由后续装配任务接线）。
import { UUID36_PATTERN_SOURCE } from './bug-mention-prestep.js'

// ─────────────────────────── 官方面结构化消费面（零上游 import——bug-mention-prestep 同纪律） ───────────────────────────

/** UserMessage 消费子面（role 判别 + content 文本块；展开 = 结构拷贝新消息对象） */
export interface PrestepUserMessageFace {
  readonly role?: unknown
  readonly content?: readonly unknown[]
  readonly [key: string]: unknown
}

/** pre-step payload 消费子面（quote 展开不读 payload——快照缓存全局单一真相） */
export type PrestepPayloadFace = unknown

/**
 * PreStepDecision 消费子面（dsh-agent runtime-types 同形）：
 * reject = 拒绝该步；enter = 以（可能替换的）messages 进入。
 */
export type PreStepDecisionFace =
  | { readonly kind: 'reject' }
  | { readonly kind: 'enter'; readonly messages: readonly PrestepUserMessageFace[]; readonly startsRequestSeries?: true }

/**
 * dsh ctx.on 事件注册收窄面（官方 Context.on——'agent/pre-step' waterfall 单事件）：
 * 返回注销器；options.global 使任意 agent scope 可达。
 */
export interface PreStepRegisterFace {
  on?(
    event: 'agent/pre-step',
    listener: (payload: PrestepPayloadFace, next: () => Promise<PreStepDecisionFace>) => Promise<PreStepDecisionFace>,
    options?: { readonly global?: boolean },
  ): () => void
}

// ─────────────────────────── 快照面（quote-reference QuoteSnapshot 结构兼容镜像） ───────────────────────────

/** 选段快照消费子面（id/text 必备；source 缺席 = 块不出 source 属性） */
export interface QuoteSnapshotFace {
  readonly id: string
  readonly text: string
  readonly source?: string
}

/** 快照查找面（内存缓存收窄——查无 = undefined，原文不动） */
export type QuoteSnapshotLookupFace = (id: string) => QuoteSnapshotFace | undefined

/** 快照存储（pick/offer 时落缓存——宿主侧单一真相的内存 Map） */
export interface QuoteSnapshotStore {
  cache(snapshot: QuoteSnapshotFace): void
  get(id: string): QuoteSnapshotFace | undefined
}

export function createQuoteSnapshotStore(): QuoteSnapshotStore {
  const snapshots = new Map<string, QuoteSnapshotFace>()
  return {
    cache(snapshot) {
      if (typeof snapshot?.id === 'string' && snapshot.id !== '') snapshots.set(snapshot.id, snapshot)
    },
    get(id) {
      return snapshots.get(id)
    },
  }
}

/** 挂接依赖（index.ts 装配注入） */
export interface QuoteMentionPrestepDeps {
  resolveQuote: QuoteSnapshotLookupFace
}

// ─────────────────────────── ① 扫描（正则双锚定纯函数——bug mention 同构） ───────────────────────────

const QUOTE_MENTION_RE = new RegExp(`@\\[[^\\]]*\\]\\(quote:(${UUID36_PATTERN_SOURCE})\\)`, 'g')

/**
 * 扫描文本中的 quote mention → 去重 id 序（首现顺位）。双锚定 = `quote:` scheme +
 * uuid36 形状，短号/缺 scheme/其他 scheme 链接不命中。
 */
export function scanQuoteMentions(text: string): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  const re = new RegExp(QUOTE_MENTION_RE.source, QUOTE_MENTION_RE.flags)
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const id = m[1]
    if (id === undefined) continue
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

/** 幂等判别：文本已含该 id 的 <quote> 块（真 chip serialize 产物同形） */
export function hasQuoteBlock(text: string, id: string): boolean {
  return text.includes(`<quote id="quote:${id}"`)
}

/** 消息全文（content 文本块拼接——幂等判别与扫描的统一读面） */
function messageTextOf(message: PrestepUserMessageFace): string {
  if (!Array.isArray(message.content)) return ''
  const parts: string[] = []
  for (const block of message.content) {
    if (typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join('\n')
}

// ─────────────────────────── ③ 投影（<quote> 块——client serializeQuoteSnapshot 尾块镜像） ───────────────────────────

/**
 * QuoteSnapshot → 结构化引用块（提案 §2.3 示例形态：`<quote id="quote:…" source="…">`
 * 换行全文换行 `</quote>`；source 缺席/空 = 不出属性）。
 */
export function serializeQuoteBlock(snapshot: QuoteSnapshotFace): string {
  const attr = snapshot.source !== undefined && snapshot.source !== '' ? ` source="${snapshot.source}"` : ''
  return `<quote id="quote:${snapshot.id}"${attr}>\n${snapshot.text}\n</quote>`
}

// ─────────────────────────── 展开核心（消息变换——零改动返回原引用） ───────────────────────────

/**
 * 对直接用户消息做 quote mention 展开：命中且快照在场 → 消息 content 尾部追加
 * <quote> 块（原文 mention 保留——只追加不替换；同 id 多 mention 只追加一块；
 * 已含同 id 块 = 幂等跳过且零取数）。快照缺失/无 mention = 原样返回**同一引用**
 * （零改动零开销）。非 user 角色消息不扫描。
 */
export function expandQuoteMentions(
  messages: readonly PrestepUserMessageFace[],
  deps: QuoteMentionPrestepDeps,
): readonly PrestepUserMessageFace[] {
  if (!Array.isArray(messages)) return messages
  let result = messages
  for (let i = 0; i < result.length; i++) {
    const message = result[i]
    if (typeof message !== 'object' || message === null) continue
    if (message.role !== 'user') continue
    const text = messageTextOf(message)
    if (text === '') continue
    const pending = scanQuoteMentions(text).filter((id) => !hasQuoteBlock(text, id))
    if (pending.length === 0) continue
    const blocks: string[] = []
    for (const id of pending) {
      const snapshot = deps.resolveQuote(id)
      if (snapshot !== undefined && typeof snapshot.text === 'string' && snapshot.text !== '') {
        blocks.push(serializeQuoteBlock({ id, text: snapshot.text, ...(snapshot.source !== undefined ? { source: snapshot.source } : {}) }))
      }
    }
    if (blocks.length === 0) continue // 快照缺失 = 原文不动（mention 保留，不伪造语境）
    if (result === messages) result = messages.slice()
    result[i] = {
      ...message,
      content: [
        ...(Array.isArray(message.content) ? message.content : []),
        { type: 'text', text: blocks.join('\n\n') },
      ],
    }
  }
  return result
}

// ─────────────────────────── ⑤ 挂接（waterfall + fail-soft + global——bug-mention-prestep 同位） ───────────────────────────

/**
 * 挂接 'agent/pre-step' waterfall：next() 先行取得官方决策，enter 态对直接用户消息做
 * quote mention 展开（替换 messages 进决策）；reject 原样透传。展开面任何异常 = 决策
 * 原样放行（fail-soft——不阻断发送，不影响官方既有 pre-step 链）。global 注册。
 * face.on 缺席/非函数 = 不注册（返回 undefined）；注册抛错由装配方 try/catch 收口。
 */
export function attachQuoteMentionPrestep(
  face: PreStepRegisterFace,
  deps: QuoteMentionPrestepDeps,
): (() => void) | undefined {
  if (typeof face.on !== 'function') return undefined
  const listener = async (
    payload: PrestepPayloadFace,
    next: () => Promise<PreStepDecisionFace>,
  ): Promise<PreStepDecisionFace> => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    try {
      const messages = expandQuoteMentions(decision.messages, deps)
      if (messages === decision.messages) return decision
      return {
        kind: 'enter',
        messages,
        ...(decision.startsRequestSeries === true ? { startsRequestSeries: true as const } : {}),
      }
    } catch {
      return decision // fail-soft：展开故障 = 原文放行
    }
  }
  return face.on('agent/pre-step', listener, { global: true })
}
