/**
 * ComposerBarProps 结构同型镜像（official-input 复制件的对接 contract）。
 * PROVENANCE：官方源 = ui-conversation/src/client/contract/slots.ts 的 ComposerBarProps
 * 不整体复制——原类型依赖包内 slots runtime 类型族（PropsRuntime/PropsRenderSlots/
 * InjectFace/PropsLocale），替身只消费其中的结构面。本文件按复制件 InputBar/
 * view-binding/ContextMeter 实际消费字段承载同型结构（字段逐一对照官方
 * dsh-client-ui-conversation@0.2.2-rc.5，deepseek-harness
 * 2c990f0b14fbe870cd6a083c1708b35fd22a7172，2026-11 任务 1.4 glue 逐字段核对更新）。
 * renderSlot 等槽位面由替身装配层给空实现（不申请官方槽位授权——
 * declaring-is-claiming 红线）。
 */
import type { ReactNode } from 'react'
import type { Translate } from './translate.js'
import type { ComposerKeyboard } from './draft-editor.js'
import type { InputActions, InputState } from './input.js'
import type { BusyEnterBehavior } from './composer-submission.js'
import type { ObservableSnapshot } from '../store.js'

/** 会话事实切片（官方 useSession store 消费面——rc.5 InputBar 的 promptError/running/openState/pendingSubmissions/subagent/removed） */
export interface SessionFacts {
  readonly promptError: { readonly error: { readonly code: string; readonly message: string; readonly details: { readonly reason: string } } } | null
  readonly running: boolean | null
  /** 会话面板开合态（rc.5 retry 主钮前置条件——替身不可达 = null） */
  readonly openState: 'open' | 'closed' | null
  /** 尚未落 turn 的提交（rc.5 retry 主钮前置条件——替身零值） */
  readonly pendingSubmissions: readonly unknown[]
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

/** 快照 hook 面（官方 useStore 适配形——getSnapshot + subscribe 的 React 绑定） */
export type SnapshotHook<T> = <S>(selector: (snapshot: T) => S) => S

/** 文档级 paste 路由目标（官方 ComposerFileIntakeTarget 结构同型——rc.5 新增；替身给空路由） */
export interface ComposerFileIntakeTarget {
  readonly card: HTMLElement
  /** 渲染该 composer 的会话内容 occurrence（'main' | 'embedded'） */
  readonly occurrence: 'main' | 'embedded'
  readonly accepts: () => boolean
  readonly add: (files: readonly File[], directories?: ReadonlySet<File>) => void
}

/** 权限快照读取面（官方 useAccess 结构同型——替身无权限域，恒 undefined = 不拒绝） */
export type UseAccess = (permission: string) => boolean | undefined

/** 复制件 InputBar 的完整 props（结构同型——官方 ComposerBarProps 消费子集） */
export interface ComposerBarProps {
  useSession: SnapshotHook<SessionFacts>
  useInput: SnapshotHook<InputState | undefined>
  inputActions: InputActions | undefined
  keyboard: ComposerKeyboard | undefined
  addFiles: ((files: readonly File[], directories?: ReadonlySet<File>) => string | null) | undefined
  removeAttachment: ((id: string) => void) | undefined
  resolveDraftAttachments: ((ids: readonly string[]) => readonly ComposerAttachment[]) | undefined
  retryFileUpload: ((id: string) => void) | undefined
  /** 文档级 paste 路由注册（rc.5 新增——替身无附件域，给空路由桩） */
  registerFileIntake: (target: ComposerFileIntakeTarget) => () => void
  toggleCommandMenu: ((selection: { readonly start: number; readonly end: number }) => void) | undefined
  stop: (() => void) | undefined
  /** 对展示的失败 turn 重发空输入（rc.5 新增——替身无 retry 域 = undefined） */
  retry: ((failureSeq: number) => void) | undefined
  hooks: {
    stopShortcut: ObservableSnapshot<readonly string[]>
    busyEnter: ObservableSnapshot<BusyEnterBehavior>
    fileUploads: ObservableSnapshot<Readonly<Record<string, { readonly status?: string; readonly reason?: string }>>>
    notices: ObservableSnapshot<{ readonly level: 'info' | 'error'; readonly text: string; readonly seq: number } | null>
    lexicon: ObservableSnapshot<ReadonlyMap<'/' | '@', readonly string[]>>
    menuLauncher: ObservableSnapshot<string | null>
  }
  renderSlot: (name: string, props: unknown) => ReactNode
  /** 权限快照读取（rc.5 新增——替身给恒 undefined 桩：Send/Stop/文件入口不因权限缺席） */
  useAccess: UseAccess
  useProjection: UseProjection
  useBusyEnter: SnapshotHook<BusyEnterBehavior>
  useFileUploads: SnapshotHook<Readonly<Record<string, { readonly status?: string; readonly reason?: string }>>>
  useNotices: SnapshotHook<{ readonly level: 'info' | 'error'; readonly text: string; readonly seq: number } | null>
  useLexicon: SnapshotHook<ReadonlyMap<'/' | '@', readonly string[]>>
  useMenuLauncher: SnapshotHook<string | null>
  useStopShortcut: SnapshotHook<readonly string[]>
  t: Translate
  sessionId: string | undefined
  variant: 'hero' | 'composer'
  /** 渲染该 composer 的会话内容 occurrence（rc.5 新增——paste 路由选举键） */
  occurrence: 'main' | 'embedded'
  disabled?: boolean | undefined
  blocked?: unknown
  workspacePickerOpen?: boolean | undefined
  onRequestWorkspace?: (() => void) | undefined
  placeholder?: string | undefined
  accessory?: ReactNode
}
