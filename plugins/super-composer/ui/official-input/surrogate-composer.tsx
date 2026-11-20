// surrogate-composer —— 替身输入区装配层（官方 InputBar/DraftEditor 复制件的宿主胶水）。
//
// 职责（proposal 用户裁决 2026-10-22 源码复制径）：为复制件 InputBar 组装
// ComposerBarProps 消费面——本包自有 Lexical editor（DraftEditorRuntime 复制件）+
// 本地 InputState 快照店 + ComposerKeyboard 面（submit 走官方 SessionInput 发送链、
// arbitrate/space/dismiss 走官方 inputTriggers controller），并把官方机器草稿双向
// 同步到本地 editor（官方 editor 与替身 editor 共用同一草稿机 setDraft 通道）。
//
// 同步协议（fix-19 单一草稿源通用机制——用户架构裁决正本）：官方草稿是唯一事实源
//（conversation.input.for(actx) 草稿面），复制件 editor 只是投影/编辑面——
// 官方机器变更 → 与本地 projection 比对，不等（他端写入 / quote token 回流）时
// runtime.restoreDraft 回灌（quote token 重建为原生 ReferenceChipNode）；本地编辑 →
// 回写走官方动词正门：自身回声零写；双侧无 chip = setDraft（无损面）；chip 在稿 ∨
// 纯插入 = bail 'slash/input-insert-text' span 正门（官方 chip 保持动词——不得走
// setDraft 全文替换，官方契约纯文本整稿替换会摧毁 chip 节点 = 双面不一致根因）；
// chip 在稿 ∧ 破坏性差量 = 官方无 chip 保持删除动词，症状级回落 setDraft（已知边界）。
// 同步信号单源（subscribeSync 扇出或降级直订 face），无第二份数据面订阅。
//
// 槽位红线：renderSlot 空实现（不申请官方 conversation.input.* 槽位授权——
// declaring-is-claiming）；附件/命令菜单/模型选择器面缺席（undefined）→ InputBar
// 官方同源降级路径（按钮 disabled）。
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { DEFAULT_BUSY_ENTER_BEHAVIOR } from './submission-settings.js'
import { createSnapshotStore, type ObservableSnapshot, type SnapshotStore } from './store.js'
import { InputBar } from './skeleton/InputBar.js'
import type { ComposerBarProps, SessionFacts, SnapshotHook, UseProjection } from './contract/composer-bar.js'
import type { ComposerKeyboard, Occurrence } from './contract/draft-editor.js'
import type { InputActions, InputState } from './contract/input.js'
import type { InputSubmitMode } from './contract/composer-submission.js'
import { DraftEditorRuntime } from './input/editor/runtime.js'
import { surrogateTranslate } from './locale.js'
import type { SuperComposerDataFace } from '../data-face.js'

const EMPTY_INPUT: InputState = {
  draft: '',
  attachmentIds: [],
  draftRev: 0,
  phase: 'plain',
  occurrences: [],
  queue: [],
}

/**
 * 官方机器草稿中的 quote 引用 token（`〔引用：label〕`）→ 原生 chip Occurrence 投影
 *（clipboard 坐标一一对应——restoreDraft 按 offset/length 重建 ReferenceChipNode）。
 */
export function quoteOccurrencesOf(draft: string, startSeq = 0): readonly Occurrence[] {
  const out: Occurrence[] = []
  const re = /〔引用：([^〕\n]*)〕/g
  let seq = startSeq
  let match: RegExpExecArray | null
  while ((match = re.exec(draft)) !== null) {
    const label = match[1] ?? ''
    out.push({
      occurrenceId: (seq += 1),
      source: 'quote',
      ref: label,
      offset: match.index,
      length: match[0].length,
      label,
      clipboardText: match[0],
    })
  }
  return out
}

/** quote token 判定（fix-19 回写径 chip 在稿判定——quoteOccurrencesOf 同形状）。 */
const QUOTE_DRAFT_TOKEN_RE = /〔引用：[^〕\n]*〕/g

/**
 * chip 边缘空白归一（fix-31）：折叠紧贴 quote token 的空白——官方 insertReference
 * 尾规则（chip 后无分隔空格则补一，ui-conversation runtime.insertReference 核销）
 * 使 chip 邻接空白在回写兜底（setDraft + 重物化）后必然回到官方归一形态，用户对
 * chip 邻接空白的删除无法经官方动词在官方机保持。同步判据（回写回声门 + fix-28
 * 回灌判据）按此归一比较：token 集与 chip 计数一致、仅 chip 邻接空白有差 = 等价
 * （已知边界：该空白删除在官方机一侧保留官方归一形态，不逐字逐字镜像）。
 */
export function chipEdgeNormalized(draft: string): string {
  return draft.replace(/\s+〔引用：/g, '〔引用：').replace(/〕[ \t]+/g, '〕')
}

/**
 * 回写差量（fix-19 纯插入识别）：公共前缀 + 公共后缀收敛——中间段即插入差量。
 * 非纯插入（删除/替换/无差量语义不明）= undefined（调用方走兜底径）。
 */
export function insertDeltaOf(prev: string, next: string): { readonly at: number; readonly text: string } | undefined {
  if (next.length <= prev.length) return undefined
  let prefix = 0
  const maxPrefix = Math.min(prev.length, next.length)
  while (prefix < maxPrefix && prev[prefix] === next[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < prev.length - prefix &&
    prev[prev.length - 1 - suffix] === next[next.length - 1 - suffix]
  )
    suffix += 1
  const text = next.slice(prefix, next.length - suffix)
  if (text === '') return undefined
  return { at: prefix, text }
}

/**
 * clipboard → detect 平面换算（官方 span-map 契约——chip 在 detect 投影坍缩为单
 * 字符）：目标 clipboard 偏移之前的每个完整 chip 贡献 length − 1 的平面差。
 */
export function detectOffsetAtClipboardOffset(
  draft: string,
  occurrences: readonly { readonly offset?: unknown; readonly length?: unknown }[],
  clipboardAt: number,
): number {
  const at = Math.max(0, Math.min(clipboardAt, draft.length))
  let extra = 0
  for (const occ of occurrences) {
    const offset = typeof occ.offset === 'number' ? occ.offset : Number.NaN
    const length = typeof occ.length === 'number' ? occ.length : Number.NaN
    if (!Number.isFinite(offset) || !Number.isFinite(length)) continue
    if (offset + length <= at) extra += Math.max(0, length - 1)
  }
  return at - extra
}

/**
 * 复制件模型的官方草稿同步消费切片（fix-19）：挂载层单一数据面扇出供给
 * （subscribeSync），或降级直订（单订阅者契约由调用方保证）。insertText =
 * bail 'slash/input-insert-text' span 正门（官方 chip 保持动词——在场才启用）。
 */
export type DraftSyncFace = Pick<
  SuperComposerDataFace,
  'subscribe' | 'inputState' | 'setDraft' | 'trackMention' | 'mention' | 'submit'
> & {
  /** chip 保持文本插入（span-CAS 正门；漂移/缺席 = undefined 走 setDraft 兜底） */
  insertText?(text: string, span: { readonly start: number; readonly end: number; readonly draftRev: number }): boolean
  /**
   * 引用 chip 插入（官方 insertReference span 覆盖域替换语义——fix-18 setDraft 兜底后
   * quote token 重物化动词；漂移/缺席 = 跳过重物化，保持症状级兜底）。
   */
  insertReference?(reference: {
    readonly source: string
    readonly ref: string
    readonly label: string
    readonly clipboardText: string
  }, span: { readonly start: number; readonly end: number; readonly draftRev: number }): boolean
}

/** 替身 composer 模型（editor + 本地机器快照 + 键盘面；一个替身卡一个实例）。 */
export class SurrogateComposerModel {
  readonly runtime: DraftEditorRuntime
  readonly keyboard: ComposerKeyboard
  readonly inputActions: InputActions
  private readonly store: SnapshotStore<InputState>
  private rev = 0
  private officialPhase: InputState['phase'] = 'plain'
  private officialQueue: readonly unknown[] = []
  private running = false
  private started = false
  /** 最近一次同步的官方草稿投影（回写判据基线——fix-19 单一草稿源同步协议） */
  private syncedDraft = ''
  /**
   * quote token → reference 备忘（fix-18：官方 occurrences 投影带 chip 真值
   * source/ref/label/clipboardText——clipboardText 即草稿 token 全文；setDraft 兜底
   * 摧毁 chip 后据此把幸存 token 重物化回官方 chip，发送链才走 serializeReference
   * 出裸 <quote> 块。官方 occurrences 缺 ref 的 legacy 面 = 无备忘不重物化）。
   */
  private readonly quoteMemo = new Map<string, { source: string; ref: string; label: string; clipboardText: string }>()
  private unregisterEditor: (() => void) | undefined
  private unsubscribeFace: (() => void) | undefined
  /**
   * 自身回写进行中旗标（fix-31）：writeBack 触发的官方 notify 会在本 editor update
   * 批内同步进入 onOfficialSync，此时 setDraft 兜底刚清零官方 occurrences、
   * rematerialize 尚未补回——fix-28 的 chip 计数判据把这一瞬态差量判为双面分歧而
   * restoreDraft 重建复制件 editor。实测（logs/super-composer/fix-20/005、008 取证）：
   * 首次删除本可落稿，但重建把编辑器 DOM/选区测量基准打碎后，双面（含官方 composer）
   * 后续 Backspace 全部空删——键击链一次性报废。写中一拍抑制重建：真键击径复制件
   * chip 节点本就是删除后真值，rematerialize 补回后计数自洽零重建；写毕补偿同步
   * 补跑 fix-28 判据——程序化 setDraft 径（chip 被整稿替换摧毁、计数不等）仍回灌
   * 重物化复制件 chip，官方持 chip 复制件残留明文的持久分歧不受此豁免。
   */
  private writingBack = false

  constructor(
    private readonly face: DraftSyncFace,
    private readonly onSubmitted: () => void,
  ) {
    this.runtime = new DraftEditorRuntime({
      onUpdate: () => {
        this.onEditorUpdate()
      },
      openReference: () => false,
      activeClaimToken: () => null,
      lexicon: () => new Map(),
      resolveLexicon: () => undefined,
    })
    this.store = createSnapshotStore<InputState>(EMPTY_INPUT)
    const store = this.store
    const submitOf = (mode?: InputSubmitMode, source?: 'click' | 'enter'): void => {
      try {
        this.face.submit(mode, source)
      } catch {
        // fail-soft（官方面漂移只降本动作）
      }
      this.onSubmitted()
    }
    this.keyboard = {
      get snapshot(): InputState {
        return store.getSnapshot()
      },
      editor: this.runtime.editor,
      submit: (mode, source) => {
        submitOf(mode, source)
      },
      steerQueue: () => {
        submitOf('steer')
      },
      paste: (text) => {
        this.runtime.paste(text)
      },
      caretSpan: () => this.runtime.caretSpan(),
      arbitrate: (key, composing) => this.arbitrate(key, composing),
      space: () => this.space(),
      dismissPopup: () => {
        try {
          face.mention()?.dismiss()
        } catch {
          // fail-soft
        }
      },
      bindFilePicker: () => () => undefined,
    }
    this.inputActions = {
      captureInsertion: () => {
        const span = this.runtime.caretSpan()
        return { start: span.start, end: span.end, draftRev: store.getSnapshot().draftRev }
      },
      insertText: (text, span) => this.runtime.insertAsyncText(span, text),
      setDraft: (text) => {
        this.runtime.setDraft(text)
      },
      addAttachments: () => false,
      removeAttachment: () => undefined,
      pruneAttachments: () => undefined,
      submit: () => {
        submitOf(undefined, 'click')
      },
    }
  }

  /** 挂 editor 行为 + 官方机器订阅（返回全量撤销）。subscribeSync 在场 = 经挂载层
   * 单一数据面扇出取同步信号（fix-19 收敛——不再私挂第二份 face 订阅）。 */
  start(subscribeSync?: (listener: () => void) => () => void): () => void {
    if (this.started) return () => undefined
    this.started = true
    this.unregisterEditor = this.runtime.register()
    this.unsubscribeFace = (subscribeSync ?? ((listener) => this.face.subscribe(listener)))(() => {
      this.onOfficialSync()
    })
    this.onOfficialSync()
    return () => {
      this.unsubscribeFace?.()
      this.unsubscribeFace = undefined
      this.unregisterEditor?.()
      this.unregisterEditor = undefined
      this.started = false
    }
  }

  /** React 绑定面（useSyncExternalStore 消费）。 */
  readonly subscribeStore = (listener: () => void): (() => void) => this.store.subscribe(listener)
  readonly getInputState = (): InputState => this.store.getSnapshot()

  /** 会话事实投影（streaming → running；promptError/subagent/removed 替身不可达 = 零值）。 */
  sessionFacts(): SessionFacts {
    return { promptError: null, running: this.running, subagent: null, removed: false }
  }

  setRunning(running: boolean): void {
    this.running = running
    // sessionFacts 是派生读取（bindSessionHook 每渲染取）——running 变化经 store 发布
    // 扇出重渲染即可，无独立店。
    this.publish()
  }

  private arbitrate(key: Parameters<ComposerKeyboard['arbitrate']>[0], composing: boolean): 'consumed' | 'pick-highlighted' | 'pass' {
    try {
      return this.face.mention()?.arbitrate(key, composing) ?? 'pass'
    } catch {
      return 'pass'
    }
  }

  private space(): boolean {
    try {
      return this.face.mention()?.onSpace?.() ?? false
    } catch {
      return false
    }
  }

  /**
   * 本地编辑发布：projection → 官方机器写入 + mention track + 本地快照。
   * fix-19 单一草稿源同步协议（用户架构裁决正本——复制件回写不得旁路官方草稿真值）：
   *   ① 自身回声（projection === 最近同步的官方草稿）→ 零写（restoreDraft 回灌驱动
   *      的 editor update 不再折返写官方机）。
   *   ② 双侧无 chip → face.setDraft（官方 setDraft 契约 = 纯文本整稿替换，无 chip
   *      时无损）。
   *   ③ chip 在稿 ∨ 纯插入差量 → bail 'slash/input-insert-text' span 正门（官方
   *      chip 保持动词——Root cause: 旧径无条件 setDraft 全文替换，官方 runtime
   *      root.clear + 纯文本节点，官方 chip 节点被摧毁 → 官方 composer placeholder
   *      消失但 chip 不渲染、chip 只剩替身可见的双面不一致）。
   *   ④ chip 在稿 ∧ 破坏性差量（删除/替换）→ 官方无 chip 保持删除动词，症状级回落
   *      setDraft + quote chip 逆序重物化（fix-18：官方 occurrences 备忘把幸存 token
   *      换回 chip——官方发送链对零 occurrence 草稿不做 serializeReference，不重物化
   *      则 clipboard 投影明文原样落会话消息）。
   */
  private onEditorUpdate(): void {
    this.runtime.refreshProjection()
    const projection = this.runtime.projection
    const text = projection.clipboardText
    // fix-31：回声门按 chip 边缘归一比较（官方重物化尾规则使 chip 邻接空白在官方机
    // 侧恒为归一形态；字面不等会驱动 setDraft+重物化逐键空转回写环）。
    if (chipEdgeNormalized(text) !== chipEdgeNormalized(this.syncedDraft)) this.writeBack(text)
    try {
      this.face.trackMention(text, projection.selection?.end ?? projection.detectText.length)
    } catch {
      // fail-soft
    }
    this.publish()
  }

  /** 本地编辑 → 官方机器写入（chip 保持正门优先；见 onEditorUpdate 协议注释）。 */
  private writeBack(text: string): void {
    let state: ReturnType<SuperComposerDataFace['inputState']>
    try {
      state = this.face.inputState()
    } catch {
      state = undefined
    }
    this.harvestQuoteMemo(state?.occurrences ?? [])
    this.writingBack = true
    try {
      const occurrences = (state?.occurrences ?? []) as readonly { readonly offset?: unknown; readonly length?: unknown }[]
      const chipsInvolved =
        occurrences.length > 0 || QUOTE_DRAFT_TOKEN_RE.test(text) || QUOTE_DRAFT_TOKEN_RE.test(this.syncedDraft)
      QUOTE_DRAFT_TOKEN_RE.lastIndex = 0
      if (!chipsInvolved) {
        try {
          this.face.setDraft(text)
        } catch {
          // fail-soft
        }
        return
      }
      const delta = insertDeltaOf(this.syncedDraft, text)
      if (delta !== undefined && state !== undefined && this.face.insertText !== undefined) {
        const start = detectOffsetAtClipboardOffset(this.syncedDraft, occurrences, delta.at)
        try {
          if (this.face.insertText(delta.text, { start, end: start, draftRev: state.draftRev }) === true) return
        } catch {
          // fail-soft（回落症状级）
        }
      }
      this.fallbackSetDraft(text)
    } finally {
      this.writingBack = false
      // 回写收尾补偿同步（fix-31）：写中脉冲被抑制后补跑 fix-28 chip 真值判据
      //（真键击径计数相等 → 零重建；程序化 setDraft 径计数不等 → 仍回灌重物化）。
      this.onOfficialSync()
    }
  }

  /**
   * setDraft 兜底 + quote chip 重物化（fix-18 根因修复落点）：
   * Root cause: 官方 setDraft 契约 = 纯文本整稿替换，摧毁 chip 节点（occurrences
   * 清零）——官方发送链 sinkSerialized 对零 occurrence 草稿跳过 serializeReference，
   * clipboard 投影 `〔引用：摘要…〕` 明文原样落会话消息（fix-19 注释「不外溢」假设
   * 不成立）。修法：兜底 setDraft 后按备忘逆序把幸存 token 换回官方 chip
   *（insertReference span 覆盖域替换语义；逆序 = 已插入 chip 全在当前 token 之后，
   * detect 偏移不漂移、draftRev 每步取官方 fresh 快照）。
   */
  private fallbackSetDraft(text: string): void {
    try {
      this.face.setDraft(text)
    } catch {
      return
    }
    this.rematerializeQuotes(text)
  }

  /** 官方 occurrences → token 备忘采集（clipboardText 全文为键；缺 ref 的行跳过）。 */
  private harvestQuoteMemo(occurrences: readonly unknown[]): void {
    for (const occ of occurrences) {
      const row = occ as { source?: unknown; ref?: unknown; label?: unknown; clipboardText?: unknown }
      if (typeof row.ref !== 'string' || row.ref === '') continue
      const clipboardText = typeof row.clipboardText === 'string' ? row.clipboardText : undefined
      if (clipboardText === undefined || clipboardText === '') continue
      this.quoteMemo.set(clipboardText, {
        source: typeof row.source === 'string' && row.source !== '' ? row.source : 'quote',
        ref: row.ref,
        label: typeof row.label === 'string' ? row.label : clipboardText,
        clipboardText,
      })
    }
  }

  /** 幸存 quote token 逆序重物化为官方 chip（备忘未命中跳过；全缝 fail-soft）。 */
  private rematerializeQuotes(text: string): void {
    const tokens = [...text.matchAll(new RegExp(QUOTE_DRAFT_TOKEN_RE.source, 'g'))]
    for (let i = tokens.length - 1; i >= 0; i--) {
      const match = tokens[i]!
      const reference = this.quoteMemo.get(match[0])
      if (reference === undefined || this.face.insertReference === undefined) continue
      let state: ReturnType<SuperComposerDataFace['inputState']>
      try {
        state = this.face.inputState()
      } catch {
        return
      }
      if (state === undefined) return
      // fix-28：兜底 setDraft 已清零官方 occurrences → clipboard 坐标 == detect 坐标，
      // span 直传为覆盖域替换（Root cause fix-28：data-face 旧径丢 span 恒尾插，删除
      // 场景幸存 token 明文原位保留 + 尾插复制 chip，回灌令 chip 越删越多）。
      const start = match.index ?? 0
      try {
        this.face.insertReference(reference, { start, end: start + match[0].length, draftRev: state.draftRev })
      } catch {
        // fail-soft（单 token 重物化失败不阻断余量）
      }
    }
  }

  /** 官方机器同步：phase/queue 采纳 + 草稿非回声回灌（quote token 重建原生 chip）。 */
  private onOfficialSync(): void {
    let state: ReturnType<SuperComposerDataFace['inputState']>
    try {
      state = this.face.inputState()
    } catch {
      state = undefined
    }
    if (state !== undefined) {
      this.officialPhase = state.phase
      this.officialQueue = state.queue ?? []
      this.syncedDraft = state.draft
      this.harvestQuoteMemo(state.occurrences ?? [])
      // fix-28：回灌判据除草稿字符串外加 chip 计数——删除径兜底 setDraft + span 覆盖
      // 重物化后官方草稿字符串与复制件 projection 相等但官方持 chip、复制件残留明文
      // token，字符串回声抑制会把双面 chip 性分歧钉死（Root cause 同源：删除收敛须
      // 双面 chip 真值一致，不只 clipboard 投影一致）。
      // fix-31：字符串与计数比较均按 chip 边缘归一（chipEdgeNormalized）——官方
      // insertReference 尾规则使 chip 邻接空白在官方机侧恒为归一形态，字面比较会把
      // 用户对 chip 邻接空白的合法删除逐键回灌回滚（吞键根因之一）。
      if (
        (chipEdgeNormalized(state.draft) !== chipEdgeNormalized(this.runtime.projection.clipboardText)
          || (state.occurrences?.length ?? 0) !== this.runtime.projection.occurrences.length)
        && !this.writingBack
      ) {
        this.runtime.restoreDraft(state.draft, quoteOccurrencesOf(state.draft))
        this.runtime.refreshProjection()
      }
    }
    this.publish()
  }

  private publish(): void {
    const projection = this.runtime.projection
    this.store.set({
      draft: projection.clipboardText,
      attachmentIds: [],
      draftRev: (this.rev += 1),
      phase: this.officialPhase,
      occurrences: projection.occurrences,
      queue: this.officialQueue,
    })
  }
}

/** 快照店 → 官方 useStore 同形 hook（InputBar 内每 read 一次 useSyncExternalStore）。 */
function bindSnapshot<T>(store: ObservableSnapshot<T>): SnapshotHook<T> {
  return (selector) => selector(useSyncExternalStore(store.subscribe, store.getSnapshot))
}

/** 替身输入区组件：复制件 InputBar 的完整宿主（composer 胶水——唯一自建 React 面）。 */
export function SurrogateComposer(props: {
  /** 专用数据面实例（挂载方为替身创建——单订阅者契约） */
  readonly face: SuperComposerDataFace
  /**
   * 挂载层同步信号扇出（fix-19 单一数据面收敛——在场 = 模型经此取官方机器变更，
   * 不再私挂第二份 face 订阅；缺席 = 降级直订 face，单订阅者契约由调用方保证）。
   */
  readonly subscribeSync?: (listener: () => void) => () => void
  /** 流式进行中（官方 running 语义投影——Stop/Send 形态切与 busyEnter 语境） */
  readonly streaming: boolean
  /** 发送动作旁路（Enter/点击发送即回调——卡片 S2 自动展开缝） */
  readonly onSubmitted?: () => void
  /** 编辑器焦点变化（空闲判据消费） */
  readonly onFocusChange?: (focused: boolean) => void
}): React.JSX.Element {
  const { face, subscribeSync, streaming, onSubmitted, onFocusChange } = props
  const model = useMemo(
    () => new SurrogateComposerModel(face, () => onSubmitted?.()),
    // face/onSubmitted 由挂载方持有稳定引用（单订阅者契约）——模型一个卡一个实例
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => model.start(subscribeSync), [model, subscribeSync])
  useEffect(() => {
    model.setRunning(streaming)
  }, [model, streaming])
  const sessionStore = useMemo(() => createSnapshotStore<SessionFacts>(model.sessionFacts()), [model])
  useEffect(() => {
    sessionStore.set(model.sessionFacts())
  }, [model, sessionStore, streaming])
  const stubNotices = useMemo(() => createSnapshotStore<null>(null), [])
  const stubMenuLauncher = useMemo(() => createSnapshotStore<string | null>(null), [])
  const stubStopShortcut = useMemo(() => createSnapshotStore<readonly string[]>([]), [])
  const stubFileUploads = useMemo(() => createSnapshotStore<Readonly<Record<string, { readonly status?: string }>>>({}), [])
  const stubLexicon = useMemo(() => createSnapshotStore<ReadonlyMap<'/' | '@', readonly string[]>>(new Map()), [])
  const busyEnter = useMemo(() => createSnapshotStore(DEFAULT_BUSY_ENTER_BEHAVIOR), [])
  const useProjection = useMemo(() => ((_key: string) => undefined) as UseProjection, [])
  const barProps: ComposerBarProps = {
    useSession: bindSnapshot(sessionStore),
    useInput: (selector) => selector(useSyncExternalStore(model.subscribeStore, model.getInputState)),
    inputActions: model.inputActions,
    keyboard: model.keyboard,
    addFiles: undefined,
    removeAttachment: undefined,
    resolveDraftAttachments: undefined,
    retryFileUpload: undefined,
    toggleCommandMenu: undefined,
    stop: undefined,
    hooks: {
      stopShortcut: stubStopShortcut,
      busyEnter,
      fileUploads: stubFileUploads,
      notices: stubNotices,
      lexicon: stubLexicon,
      menuLauncher: stubMenuLauncher,
    },
    renderSlot: () => null,
    useProjection,
    useBusyEnter: bindSnapshot(busyEnter),
    useFileUploads: bindSnapshot(stubFileUploads),
    useNotices: bindSnapshot(stubNotices),
    useLexicon: bindSnapshot(stubLexicon),
    useMenuLauncher: bindSnapshot(stubMenuLauncher),
    useStopShortcut: bindSnapshot(stubStopShortcut),
    t: surrogateTranslate,
    sessionId: undefined,
    variant: 'composer',
    disabled: false,
    blocked: undefined,
    workspacePickerOpen: false,
    onRequestWorkspace: undefined,
    placeholder: undefined,
    accessory: undefined,
  }
  return (
    // 作用域锚（bundle 层给复制件 CSS 加 [data-dscf-official-input] 前缀——官方类名
    // .card/.root 等过于通用，全局注入会碰撞宿主样式）
    <div
      data-dscf-official-input=""
      onFocus={(): void => onFocusChange?.(true)}
      onBlur={(event): void => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        onFocusChange?.(false)
      }}
    >
      <InputBar {...barProps} />
    </div>
  )
}
