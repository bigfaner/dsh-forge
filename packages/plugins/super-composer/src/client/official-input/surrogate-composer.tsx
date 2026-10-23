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
  private unregisterEditor: (() => void) | undefined
  private unsubscribeFace: (() => void) | undefined

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
   *      setDraft（明文整稿替换——已知边界，官方侧 chip 退化为明文 token，与现状
   *      一致不外溢）。
   */
  private onEditorUpdate(): void {
    this.runtime.refreshProjection()
    const projection = this.runtime.projection
    const text = projection.clipboardText
    if (text !== this.syncedDraft) this.writeBack(text)
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
    try {
      this.face.setDraft(text)
    } catch {
      // fail-soft
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
      if (state.draft !== this.runtime.projection.clipboardText) {
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
