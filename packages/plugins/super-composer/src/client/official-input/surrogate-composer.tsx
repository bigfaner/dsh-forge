// surrogate-composer —— 替身输入区装配层（官方 InputBar/DraftEditor 复制件的宿主胶水）。
//
// 职责（proposal 用户裁决 2026-10-22 源码复制径）：为复制件 InputBar 组装
// ComposerBarProps 消费面——本包自有 Lexical editor（DraftEditorRuntime 复制件）+
// 本地 InputState 快照店 + ComposerKeyboard 面（submit 走官方 SessionInput 发送链、
// arbitrate/space/dismiss 走官方 inputTriggers controller），并把官方机器草稿双向
// 同步到本地 editor（官方 editor 与替身 editor 共用同一草稿机 setDraft 通道）。
//
// 同步协议（防回环）：本地编辑 → projection.clipboardText → face.setDraft（官方机器）
// ；官方机器变更 → 与本地 projection 比对，仅在不等（他端写入 / quote token 回流）时
// runtime.restoreDraft 回灌（quote token 重建为原生 ReferenceChipNode——quote chip
// 原生原子渲染）。自家回声 = 文本相等，零动作。
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

/** 替身 composer 模型（editor + 本地机器快照 + 键盘面；一个替身卡一个实例）。 */
class SurrogateComposerModel {
  readonly runtime: DraftEditorRuntime
  readonly keyboard: ComposerKeyboard
  readonly inputActions: InputActions
  private readonly store: SnapshotStore<InputState>
  private rev = 0
  private officialPhase: InputState['phase'] = 'plain'
  private officialQueue: readonly unknown[] = []
  private running = false
  private started = false
  private unregisterEditor: (() => void) | undefined
  private unsubscribeFace: (() => void) | undefined

  constructor(
    private readonly face: SuperComposerDataFace,
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

  /** 挂 editor 行为 + 官方机器订阅（返回全量撤销）。 */
  start(): () => void {
    if (this.started) return () => undefined
    this.started = true
    this.unregisterEditor = this.runtime.register()
    this.unsubscribeFace = this.face.subscribe(() => {
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

  /** 本地编辑发布：projection → 官方机器 setDraft + mention track + 本地快照。 */
  private onEditorUpdate(): void {
    this.runtime.refreshProjection()
    const projection = this.runtime.projection
    const text = projection.clipboardText
    try {
      this.face.setDraft(text)
    } catch {
      // fail-soft
    }
    try {
      this.face.trackMention(text, projection.selection?.end ?? projection.detectText.length)
    } catch {
      // fail-soft
    }
    this.publish()
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
  /** 流式进行中（官方 running 语义投影——Stop/Send 形态切与 busyEnter 语境） */
  readonly streaming: boolean
  /** 发送动作旁路（Enter/点击发送即回调——卡片 S2 自动展开缝） */
  readonly onSubmitted?: () => void
  /** 编辑器焦点变化（空闲判据消费） */
  readonly onFocusChange?: (focused: boolean) => void
}): React.JSX.Element {
  const { face, streaming, onSubmitted, onFocusChange } = props
  const model = useMemo(
    () => new SurrogateComposerModel(face, () => onSubmitted?.()),
    // face/onSubmitted 由挂载方持有稳定引用（单订阅者契约）——模型一个卡一个实例
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => model.start(), [model])
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
