// 本地薄片（退役留切片）。PROVENANCE：主体退役自官方镜像 ui-conversation/src/client/contract/input.ts
// @ deepseek-harness f059f01ce367748392d8f665c0705fb4302a626b（0.2.0-rc.2，2026-10-22）。
//
// 退役核销（任务 1.5，type-mirror-retirement.md）：
// - 官方公开 types（@deepseek-ai/dsh-client-ui-conversation 的 client 导出面）已承载
//   InputState/InputActions 全量正本——公开导出的非替身消费切片全部退役，消费点直连官方；
// - 本片仅保留替身降级域适配切片（官方全量面无此承载位）：
//   ① DraftAttachmentId 去 brand（string）——替身无附件域；
//   ② InputState.queue 放宽为 readonly unknown[]——官方 queue 类型绑 dsh-agent InboxState；
//   ③ InputActions 为替身消费子集——无 insertQuote/persistDraft 动词（替身无 quote/持久化域）。
/**
 * Frozen input-machine contract. Types only. The draft text and its
 * reference chips live in the shell's Lexical editor; the machine is the
 * submit plane (phase, claim, attempt) alone.
 */
import type { TokenSpan } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { Occurrence } from './draft-editor.js'

/** Browser-runtime identity of one unsent attachment draft（镜像面去 brand——替身无附件域）。 */
export type DraftAttachmentId = string

/**
 * The public input action face provided to every session-scope slot
 * component: stable-identity void callbacks, mirroring the
 * useStore+actions convention. Command-style handles (arbitrate/space/
 * paste/…) stay InputBar-private and never ride this face.
 * 替身消费子集：无 insertQuote/persistDraft（替身无 quote/持久化域——官方降级路径）。
 */
export interface InputActions {
  /** @returns a revision-guarded copy of the current editor selection. */
  captureInsertion(): TokenSpan
  /**
   * Insert asynchronous text without replacing subsequent edits or reference chips.
   * @param text - plain text to insert in one undo step.
   * @param span - captured selection and draft revision.
   * @returns false when the draft changed or submission locked the editor.
   */
  insertText(text: string, span: TokenSpan): boolean
  /** Replace the whole draft (persisted-draft seed and programmatic writes). */
  setDraft(text: string): void
  /** Append ordered browser-owned attachment ids; busy admission phases refuse. */
  addAttachments(ids: readonly DraftAttachmentId[]): boolean
  /** Remove one browser-owned attachment id; busy admission phases refuse. */
  removeAttachment(id: DraftAttachmentId): void
  /** Drop ids whose browser-owned objects no longer exist. */
  pruneAttachments(ids: readonly DraftAttachmentId[]): void
  /** Enter submission (adjudication / claim transaction / default sink inside). */
  submit(): void
}

/** Published input state (the currency; per-session). */
export interface InputState {
  /** Clipboard-text projection of the editor document (chips expanded to their clipboard form). */
  readonly draft: string
  /** Ordered runtime-only attachment ids; browser objects stay in ConversationController. */
  readonly attachmentIds: readonly DraftAttachmentId[]
  /** Monotonic editor revision (span CAS compares against this). */
  readonly draftRev: number
  // rc.5 新增 'sending'：消息等待 Host 接受的冻结相（InputBar machineBusy 含 sending——
  // 替身官方 phase 透传经 data-face，形态随官方）。
  readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting' | 'sending'
  /** Present exactly while claimed/submitting (claim snapshot during flight; submit closure withheld). */
  readonly claim?: { readonly name: string; readonly token: string; readonly hint?: string; readonly attachments?: boolean }
  /** Reference occurrence view of the editor's chips, sorted by offset. */
  readonly occurrences: readonly Occurrence[]
  /** Messages still waiting for their own turn（镜像面放宽——官方绑 dsh-agent InboxState，替身结构读取）。 */
  readonly queue: readonly unknown[]
}
