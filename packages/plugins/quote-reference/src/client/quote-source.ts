// quote trigger source 纯模型（定位：模型——@ 补全菜单选段引用组的候选投影 /
// 原子引用插入 / serialize codec / 选段全文快照缓存——super-composer 提案 §2.3，
// bug-source.ts 判例同构）。
//
// bundle 自含纪律（client-plugin 经典 script 形状，bug-source.ts 先例）：本文件零外部
// import——官方 input-trigger 契约面（InputTriggerSource/ReferenceCodec/
// InputTriggerCandidate/ReferenceInsert/PickOutcome）以结构同型镜像承载。
//
// 快照语义（提案 §2.3）：pick 时落选段全文快照；serialize 快照优先（mention +
// <quote> 结构化块）、缺失回退最小块（mention 保留、不追加块）——永不抛错，规避
// 官方「serialize 失败阻断发送」语义在会话重启回放、快照缺失时的误伤。
//
// 共存约束②（bug-source 同则）：不实现 lexicon 装饰——引用只以原子 chip / 明文投影
// 两种形态存在，无 subscribeLexicon 面。
// quoted=true（@" 引号路径态）一律空候选——引号态是文件路径专属语义（共存约束①）。

/** 菜单候选行结构同型镜像（镜像 InputTriggerCandidate 消费切片） */
export interface QuoteTriggerCandidate {
  readonly name: string
  readonly label?: string
  readonly description?: string
  readonly hint?: string
  readonly value?: string
}

/** 原子引用插入结构同型镜像（镜像 ReferenceInsert） */
export interface QuoteReferenceInsert {
  readonly source: string
  readonly ref: string
  readonly label: string
  readonly clipboardText: string
}

/** pick 载荷结构同型镜像（镜像 InputTriggerPick 消费切片） */
export interface QuoteTriggerPick {
  readonly candidate: QuoteTriggerCandidate
  readonly session: { readonly sessionId: string }
  readonly position: 'leading' | 'inline'
  readonly via: 'menu' | 'space' | 'enter'
  readonly action: 'pick' | 'drill'
}

/** 候选请求结构同型镜像（镜像 CandidateRequest 消费切片） */
export interface QuoteCandidateRequest {
  readonly query: string
  readonly quoted?: boolean
  readonly position: 'leading' | 'inline'
  readonly drilled: boolean
  readonly signal: AbortSignal
}

/** source 产物结构同型镜像（镜像 InputTriggerSource 的 quote 组实现面） */
export interface QuoteReferenceSource {
  readonly trigger: '@'
  readonly name: string
  readonly order?: number
  candidates(
    session: { readonly sessionId: string },
    req: QuoteCandidateRequest,
  ): Promise<readonly QuoteTriggerCandidate[]>
  onPick(pick: QuoteTriggerPick): { readonly insert: QuoteReferenceInsert } | { readonly text: string } | 'handled' | undefined
  /**
   * 划选快照入候选池（选区浮出菜单「添加到对话」外的直供缝——监听面在 mouseup
   * 落快照后 offer，@ 菜单据此投影候选）。
   */
  offerSelection(snapshot: QuoteSnapshot): void
  /** 外部插入径快照落缓存（不经 onPick 的插入面补齐——bug 27ab222b 判例同构） */
  cacheQuoteSnapshot(snapshot: QuoteSnapshot): void
  /** 引用 codec（clipboardText + serialize——官方 ReferenceCodec 同签名） */
  readonly codec: {
    clipboardText(ref: string): string
    serialize(ref: string, signal: AbortSignal): Promise<string>
  }
}

/** 引用前缀（ref = quote:<uuid>） */
export const QUOTE_REF_PREFIX = 'quote:'

/** uuid → ref */
export function quoteRefOf(id: string): string {
  return `${QUOTE_REF_PREFIX}${id}`
}

/** ref → uuid（非 quote 引用 = undefined） */
export function quoteIdOfRef(ref: string): string | undefined {
  return ref.startsWith(QUOTE_REF_PREFIX) && ref.length > QUOTE_REF_PREFIX.length
    ? ref.slice(QUOTE_REF_PREFIX.length)
    : undefined
}

/**
 * mention 明文投影：`〔引用：${summary}〕`——草稿/会话日志单一真相（提案 §2.3，
 * bug aced6f28 形状改判）。Root cause: 旧形状 `@[摘要](quote:uuid)` 与官方
 * projectUserText 硬编码投影形状集碰撞（`@[^\s]+` token 一律投影 file chip，显示名
 * 取路径末段 = quote:uuid，点击 openFile 报文件找不到）——新形状不含 `@`/`/` 起始
 * token，官方形状集零命中（纯文本投影），uuid 只落 `<quote>` 结构化块不入明面。
 */
export function mentionTextOf(summary: string, _id: string): string {
  return `〔引用：${summary}〕`
}

/** 摘要缺省占位（永不抛错口径的兜底文案） */
export const QUOTE_SUMMARY_UNAVAILABLE = 'quote:ref 摘要不可用'

/** 选段快照（pick 时落缓存；serialize 快照优先） */
export interface QuoteSnapshot {
  /** 选段锚定 uuid（ref scheme quote:<uuid>） */
  readonly id: string
  /** 选段摘要（mention 投影 label；截断由监听面负责，纯模型原样承载） */
  readonly summary: string
  /** 选段全文（<quote> 块体） */
  readonly text: string
  /** 选段来源（文档标题等——<quote> 块 source 属性；缺席 = 不出属性） */
  readonly source?: string
}

/** 快照缓存（pick/offer 时落 Map——serialize/clipboardText 快照优先） */
export type QuoteSnapshotCache = Map<string, QuoteSnapshot>

/**
 * QuoteSnapshot → 结构化块（提案示例形态：mention 明文投影 + 尾部 <quote> 结构化块，
 * 块内为选段全文语境）。
 */
export function serializeQuoteSnapshot(snapshot: QuoteSnapshot): string {
  const attr = snapshot.source !== undefined && snapshot.source !== '' ? ` source="${snapshot.source}"` : ''
  return `${mentionTextOf(snapshot.summary, snapshot.id)}\n<quote id="${quoteRefOf(snapshot.id)}"${attr}>\n${snapshot.text}\n</quote>`
}

/** 末级回退最小块（快照缺失：mention 保留、不追加块、uuid 不入明面——永不抛错口径的兜底形态） */
export function minimalQuoteBlock(_id: string, summary?: string): string {
  const label = summary !== undefined && summary !== '' ? summary : '摘要不可用'
  return mentionTextOf(label, _id)
}

/** 快照 → 候选行投影（name=id / label=摘要 / description=来源 / hint=原文前缀预览） */
export function quoteCandidateFrom(snapshot: QuoteSnapshot): QuoteTriggerCandidate {
  return {
    name: snapshot.id,
    label: snapshot.summary,
    description: snapshot.source,
    hint: snapshot.text.slice(0, 48),
    value: quoteRefOf(snapshot.id),
  }
}

/** 候选集投影：query 关键词过滤（摘要/原文命中保留；空 query 全列） */
export function quoteCandidates(snapshots: readonly QuoteSnapshot[], query: string): QuoteTriggerCandidate[] {
  const q = query.trim()
  if (q === '') return snapshots.map(quoteCandidateFrom)
  const lowered = q.toLowerCase()
  return snapshots
    .filter(
      (snapshot) =>
        snapshot.summary.toLowerCase().includes(lowered) ||
        snapshot.text.toLowerCase().includes(lowered),
    )
    .map(quoteCandidateFrom)
}

/**
 * quote 引用 chip 构造单一事实源（@ 菜单 pick 与外部插入面同径产出：同 ref/codec
 * 路由、同 clipboardText 投影；sourceName 缺省 'quote'）。
 */
export function quoteReferenceInsertOf(
  snapshot: { readonly id: string; readonly summary: string },
  sourceName?: string,
): QuoteReferenceInsert {
  return {
    source: sourceName ?? 'quote',
    ref: quoteRefOf(snapshot.id),
    label: snapshot.summary,
    clipboardText: mentionTextOf(snapshot.summary, snapshot.id),
  }
}

/**
 * Quote 引用 source 工厂（纯模型——候选池由 offerSelection 显式供给，零 RPC、零
 * lexicon）。candidates：quoted=true 空候选、query 关键词过滤；onPick 落快照并产出
 * 原子引用插入；serialize 快照优先、缺失回退最小块——永不抛错。
 */
export function createQuoteReferenceSource(deps?: { readonly name?: string }): QuoteReferenceSource {
  const name = deps?.name ?? 'quote'
  const snapshots: QuoteSnapshotCache = new Map()
  /** 候选池（offerSelection 供给——最新在前的投影序） */
  const offered: QuoteSnapshot[] = []

  return {
    trigger: '@',
    name,
    order: 40,
    async candidates(_session, req) {
      if (req.quoted === true) return []
      return quoteCandidates(offered, req.query)
    },
    onPick(pick) {
      const id = pick.candidate.name
      const summary = pick.candidate.label ?? id
      // pick 时落快照：候选池选段全文优先，缺席落最小切片（serialize 走最小块回退）
      const offeredHit = offered.find((snapshot) => snapshot.id === id)
      if (offeredHit !== undefined) snapshots.set(id, offeredHit)
      else snapshots.set(id, { id, summary, text: '' })
      return { insert: quoteReferenceInsertOf({ id, summary }, name) }
    },
    offerSelection(snapshot) {
      snapshots.set(snapshot.id, snapshot)
      offered.unshift(snapshot)
    },
    cacheQuoteSnapshot(snapshot) {
      snapshots.set(snapshot.id, snapshot)
    },
    codec: {
      clipboardText(ref) {
        try {
          const id = quoteIdOfRef(ref)
          if (id === undefined) return ''
          const summary = snapshots.get(id)?.summary
          return mentionTextOf(summary !== undefined && summary !== '' ? summary : '摘要不可用', id)
        } catch {
          return ''
        }
      },
      async serialize(ref, _signal) {
        try {
            const id = quoteIdOfRef(ref)
          if (id === undefined) return ''
          // 快照优先（全文真值在即出 mention + <quote> 块）
          const snapshotted = snapshots.get(id)
          if (snapshotted !== undefined && snapshotted.text) return serializeQuoteSnapshot(snapshotted)
          // 末级回退：mention 最小块（快照缺失——会话重启回放等；永不抛错阻断发送）
          return minimalQuoteBlock(id, snapshotted?.summary)
        } catch {
          return ''
        }
      },
    },
  }
}
