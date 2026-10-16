// @dsh-forge/git-worktree client —— UI 面出口（提案「UI 展示形态」节全量）：
// hero 选择控件 + 新建/删除弹窗 + 会话头只读 chip + 封存三通道 + 能力位条件渲染。
// 样式取 DESIGN.md 令牌（--dsw-* 唯一），图标取官方 primitives 图标库（零 emoji 零自绘）。
export {
  CreateWorktreeDialog,
  CreateWorktreeFields,
  createFormPathPreview,
  deriveFormWorktreeName,
  initialCreateForm,
  type BranchComboboxSlot,
  type BranchComboboxSlotOption,
  type BranchComboboxSlotProps,
  type CreateWorktreeDialogProps,
  type CreateWorktreeFormValue,
  type CreateWorktreeRequest,
} from './create-worktree-dialog.js'
export {
  DeleteChecksList,
  DeleteWorktreeDialog,
  type DeleteWorktreeDialogProps,
} from './delete-worktree-dialog.js'
export { SessionWorktreeChip, type SessionWorktreeChipProps } from './session-worktree-chip.js'
export { SealNotice, SealedComposerPlaceholder, type SealNoticeProps } from './seal-notice.js'
export { HeroWorktreePicker, heroWorktreeRows, type HeroWorktreePickerProps, type WorktreeMenuRow } from './hero-worktree-picker.js'
export {
  aheadBehindSegments,
  collectSlugCandidates,
  createConflicts,
  deleteBlockers,
  deriveWorktreeName,
  filterSlugCandidates,
  inferSource,
  isCreateReady,
  isDeleteBlocked,
  pendingAheadBehindPaths,
  type AheadBehindSegments,
  type CreateConflict,
  type DeleteBlocker,
  type DeleteChecks,
  type SlugCandidate,
  type WorktreeRow,
  type WorktreeSource,
} from './model.js'
export * from './icons.js'
