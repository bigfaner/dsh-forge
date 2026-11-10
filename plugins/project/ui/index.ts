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
// AheadBehind 域类型（worktree-ops 单源——type-only re-export，client bundle 零运行时载荷；
// 1.17 批二：apps/web WorktreeFaces 自旧 @dsh-forge/git-worktree 根出口迁入本出口）
export type { AheadBehind } from '../host/worktrees/worktree-ops.js'

// ── add-project 流程（1.14 UI 迁入第一批——inventory §2.4：两段式向导组件本体 + 纯函数
// 模型 + css 整体平移；RPC 数据源 = 本插件内部面 ui/rpc.ts；宿主壳经 exports./client-ui
// 消费 ShellHost 挂载，入口经 flow-open 页内缝跨单元直达）──
export * from './add-project/index.js'

// ── bug 三件（1.14——BugGlyph / BugPreview / bug-source+chip-restore+ChipRestoreOverlay）：
// 注册路由挂载声明收编本出口——组件本体经 ./bug-refs/views.ts 递达 apps/web 发布面
// （product-views 引用改指本包出口，壳内自有源收缩为零；React 单例 = 发布件随壳 bundle
// 渲染）；纯模型面（bug-source / chip-restore——零 react）另经 ./client-ui/bug-model 与
// ./client-ui/chip-restore 窄子路径出口直供 client 插件 bundle（自含 classic script 内联）。
export { ForgeBugGlyph, type ForgeBugGlyphProps } from './bug-refs/BugGlyph.js'
export * from './bug-refs/BugPreview.js'
export * from './bug-refs/ChipRestoreOverlay.js'
export * from './bug-refs/bug-source.js'
export * from './bug-refs/chip-restore.js'
export * from './bug-refs/reference-mirrors.js'
export * from './bug-refs/dock-tab-mirrors.js'

// ── 插件内部 RPC 窄面（forge:projects/fs/bugs 消费切片——壳侧 rpc 发布面零参与）──
export * from './rpc.js'

// ── 领域无关小件承载副本（apps/web src/components 同源镜像——迁移面渲染依赖）──
export * from './components.js'


import { registerSettingsSection } from './settings-section/index.js'

// ── keyed section 扩展点 + 配置节双缝（1.16：tab keyed 占用者模式泛化 + settings 节
// bundle.config/detail.section 双缝——configForms revisioned 写径；详见各模块头注）──
export * from './keyed-section.js'
export * from './settings-section/index.js'
export * from './settings-section/worktree-prefs.js'

// 组合 cordis 插件面（包骨架 1.3 正门，无 src 层；worktree 域 UI 平移后仍承担装载契约）：
// 无 apply → 真机 `invalid plugin` 判例（expert-squad annotator gotcha-web-boot 同径）；
// apply 返回值铁律：必须返回 undefined（cordis 组合把返回值当 effect 消费）。
// 零消费零 inject 边（settings-unification 圆桌处方）：dsh.client.inject 不声明 settings
// 域激活边、cordis 注入边不声明 configForms——消费点现查（configFormsFaceOf 直取 + reflect
// 兜底，面形状校验 fail-soft），缺席 = 配置节不注册（settings-section/index.ts
// registerSettingsSection），不炸组合；slots 为槽注册唯一必需服务（声明边，官方同型先例）。
export const projectClient = {
  inject: ['slots'] as string[],
  apply(ctx: unknown): void {
    const rec = ctx as Record<string, unknown> | undefined
    const slots = rec?.['slots'] as
      | Parameters<typeof registerSettingsSection>[1]
      | undefined
    if (slots === undefined || typeof slots.inject !== 'function') {
      // 官方 slots 面缺席（宿主形状漂移）——fail-soft：UI 静默缺失优于 boot 崩溃。
      console.warn('[dsh-forge/project] ctx.slots.inject absent; settings section not mounted')
      return
    }
    // 配置节双缝注册面异常只降本节（registerSettingsSection 内部逐缝降级），不炸装配。
    registerSettingsSection(rec ?? {}, slots)
  },
};

/**
 * 装载器正门（client-modules 装载契约）：materialize 后的 module.exports 项本身为
 * cordis 插件面——function 或含 apply 方法的对象（expert-squad 同型判例）。
 * default 导出经 unwrapExports（__esModule → default）还原插件对象本体。
 */
export default projectClient;
export const apply = projectClient.apply.bind(projectClient);
