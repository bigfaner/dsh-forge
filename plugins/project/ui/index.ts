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
export {
  WorktreeRiskConfirmation,
  WorktreeRiskConfirmationBody,
  type WorktreeRiskConfirmationBodyProps,
  type WorktreeRiskConfirmationProps,
} from './risk-confirmation.js'
export {
  BranchDriftNotice,
  SealNotice,
  SealedComposerPlaceholder,
  StaleSelectionNotice,
  type BranchDriftNoticeProps,
  type SealNoticeProps,
  type StaleSelectionNoticeProps,
} from './seal-notice.js'
export { HeroWorktreePicker, heroWorktreeRows, pickerRowDisabled, type HeroWorktreePickerProps, type WorktreeMenuRow } from './hero-worktree-picker.js'
export {
  aheadBehindInline,
  aheadBehindSegments,
  collectSlugCandidates,
  createConflicts,
  deleteBlockers,
  deriveWorktreeName,
  filterSlugCandidates,
  inferSource,
  isCreateReady,
  isCrossBranchRisk,
  isDeleteBlocked,
  joinWorktreePath,
  pendingAheadBehindPaths,
  worktreeLabelSegments,
  type AheadBehindSegments,
  type CreateConflict,
  type DeleteBlocker,
  type DeleteChecks,
  type SlugCandidate,
  type WorktreeRow,
  type WorktreeSource,
} from './model.js'
export * from './icons.js'

// 组合 cordis 插件面（包骨架 1.3 正门，无 src 层；worktree 域 UI 平移后仍承担装载契约）：
// 无 apply → 真机 `invalid plugin` 判例（expert-squad annotator gotcha-web-boot 同径）；
// apply 返回值铁律：必须返回 undefined（cordis 组合把返回值当 effect 消费）。
export const projectClient = {
  // 骨架期零服务消费；UI 面落位后按缝逐行声明（slots/configForms 等）。
  inject: [] as string[],
  apply(_ctx: unknown): void {
    // 占位空实现——bundle 管线验证面（scripts/bundle-client.mjs 产物自注册形态）。
  },
};

/**
 * 装载器正门（client-modules 装载契约）：materialize 后的 module.exports 项本身为
 * cordis 插件面——function 或含 apply 方法的对象（expert-squad 同型判例）。
 * default 导出经 unwrapExports（__esModule → default）还原插件对象本体。
 */
export default projectClient;
export const apply = projectClient.apply.bind(projectClient);
