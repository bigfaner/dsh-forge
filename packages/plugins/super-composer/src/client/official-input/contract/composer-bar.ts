/**
 * ComposerBarProps 结构同型镜像（official-input 复制件的对接 contract）�? * PROVENANCE：官方源�?ui-conversation/src/client/contract/slots.ts �?ComposerBarProps
 * 不整体复制——原类型依赖包内 slots runtime 类型族（PropsRuntime/PropsRenderSlots/
 * InjectFace/PropsLocale），替身只消费其中的结构面。本文件按复制件 InputBar/
 * view-binding/ContextMeter 实际消费字段承载同型结构（字段逐一对照官方 0.2.0-rc.2�? * repo f059f01ce367748392d8f665c0705fb4302a626b�?026-10-22）。renderSlot 等槽位面�? * 替身装配层给空实现（不申请官方槽位授权——declaring-is-claiming 红线）�? */
import type { ReactNode } from 'react'
import type { Translate } from './translate.js'
import type { ComposerKeyboard } from './draft-editor.js'
import type { InputActions, InputState } from './input.js'
import type { BusyEnterBehavior } from './composer-submission.js'
import type { ObservableSnapshot } from '../store.js'

/** 会话事实切片（官�?useSession store 消费面——InputBar �?promptError/running/subagent/removed�?*/
export interface SessionFacts {
  readonly promptError: { readonly error: { readonly code: string; readonly message: string; readonly details: { readonly reason: string } } } | null
  readonly running: boolean | null
  readonly subagent: { readonly address: { readonly mode: string }; readonly parentAvailable?: boolean } | null
  readonly removed: boolean | null
}


/** 附件消费切片（官方 ComposerAttachment 结构同型——InputBar intake 预检与上传门消费） */
export interface ComposerAttachment {
  readonly id: string
  readonly kind: 'image' | 'file'
  readonly file: File
}

/** 投影读取面（官方 UseProjection 结构同型——替身装配层给空投影源；select 管线放宽以承载官方泛型投影键消费） */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type UseProjection = <K extends string>(key: K, select?: (value: any) => any) => any

/** 快照�?hook 面（官方 useStore 适配形——getSnapshot + subscribe �?React 绑定�?*/
export type SnapshotHook<T> = <S>(selector: (snapshot: T) => S) => S

/** 复制�?InputBar 的完�?props（结构同型——官�?ComposerBarProps 消费子集�?*/
export interface ComposerBarProps {
  useSession: SnapshotHook<SessionFacts>
  useInput: SnapshotHook<InputState | undefined>
  inputActions: InputActions | undefined
  keyboard: ComposerKeyboard | undefined
  addFiles: ((files: readonly File[], directories?: ReadonlySet<File>) => string | null) | undefined
  removeAttachment: ((id: string) => void) | undefined
  resolveDraftAttachments: ((ids: readonly string[]) => readonly ComposerAttachment[]) | undefined
  retryFileUpload: ((id: string) => void) | undefined
  toggleCommandMenu: ((selection: { readonly start: number; readonly end: number }) => void) | undefined
  stop: (() => void) | undefined
  hooks: {
    stopShortcut: ObservableSnapshot<readonly string[]>
    busyEnter: ObservableSnapshot<BusyEnterBehavior>
    fileUploads: ObservableSnapshot<Readonly<Record<string, { readonly status?: string }>>>
    notices: ObservableSnapshot<{ readonly level: 'info' | 'error'; readonly text: string; readonly seq: number } | null>
    lexicon: ObservableSnapshot<ReadonlyMap<'/' | '@', readonly string[]>>
    menuLauncher: ObservableSnapshot<string | null>
  }
  renderSlot: (name: string, props: unknown) => ReactNode
  useProjection: UseProjection
  useBusyEnter: SnapshotHook<BusyEnterBehavior>
  useFileUploads: SnapshotHook<Readonly<Record<string, { readonly status?: string }>>>
  useNotices: SnapshotHook<{ readonly level: 'info' | 'error'; readonly text: string; readonly seq: number } | null>
  useLexicon: SnapshotHook<ReadonlyMap<'/' | '@', readonly string[]>>
  useMenuLauncher: SnapshotHook<string | null>
  useStopShortcut: SnapshotHook<readonly string[]>
  t: Translate
  sessionId: string | undefined
  variant: 'hero' | 'composer'
  disabled?: boolean | undefined
  blocked?: unknown
  workspacePickerOpen?: boolean | undefined
  onRequestWorkspace?: (() => void) | undefined
  placeholder?: string | undefined
  accessory?: ReactNode
}
