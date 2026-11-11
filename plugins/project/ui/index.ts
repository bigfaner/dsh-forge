// @dsh-forge/project client UI 面出口：
// worktree-picker（hero 选择器 + 新建/删除弹窗 + 风险确认框 + 纯模型）+ session-badge
// （会话头只读 chip + 封存三通道 + 挂载面）——1.15 UI 迁入第二批（apps/web WorktreeFaces
// 单体拆解终态目录）。样式取 DESIGN.md 令牌（--dsw-* 唯一），图标取官方 primitives
// 图标库（零 emoji 零自绘）。
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
} from './worktree-picker/create-dialog.js'
export {
  DeleteChecksList,
  DeleteWorktreeDialog,
  type DeleteWorktreeDialogProps,
} from './worktree-picker/delete-dialog.js'
export { SessionWorktreeChip, type SessionWorktreeChipProps } from './session-badge/chip.js'
export {
  WorktreeRiskConfirmation,
  WorktreeRiskConfirmationBody,
  type WorktreeRiskConfirmationBodyProps,
  type WorktreeRiskConfirmationProps,
} from './worktree-picker/risk-confirm.js'
export {
  BranchDriftNotice,
  SealNotice,
  SealedComposerPlaceholder,
  StaleSelectionNotice,
  type BranchDriftNoticeProps,
  type SealNoticeProps,
  type StaleSelectionNoticeProps,
} from './session-badge/seal-notice.js'
export { HeroWorktreePicker, heroWorktreeRows, pickerRowDisabled, type HeroWorktreePickerProps, type WorktreeMenuRow } from './worktree-picker/hero-worktree-picker.js'
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
} from './worktree-picker/model.js'
export { EditableCombobox, type EditableComboboxProps } from './worktree-picker/EditableCombobox.js'
export * from './worktree-picker/combobox-model.js'

// ── 挂载面（WorktreeFaces 主体/尾段拆出——apps/web 发布面经本出口消费，壳内自有源
// 收缩为零；1.15 UI 迁入第二批）──
export {
  ForgeHeroWorktreeMount,
  ForgeWorktreeSwitchMarker,
  anchorDefaultWorktreePath,
  createFollowup,
  type CreateFollowupDeps,
} from './worktree-picker/picker.js'
export { ForgeSessionWorktreeChip } from './session-badge/chip.js'
export {
  ForgeWorktreeSealOverlay,
  useWorktreeSeal,
} from './session-badge/seal-notice.js'
export type { WorktreeSealPhase } from './session-badge/seal-notice.js'

// ── 两功能点共享态单源（圆桌处方③——picker 与 add-project 两功能点共享；滚动重构
// 不得拆裂。归属注释显式在各模块头注：window 全局锚 KEY 契约单源在本目录，入口侧
// client-plugin 持只读/安装镜像，禁共 import 模块——classic 形状 pin，判例 20be1ba7）──
export { setSelectedTreeDisplay } from './state/selected-tree-window.js'
export {
  beginWorktreeSwitch,
  isWorktreeSwitchPending,
  subscribeWorktreeSwitch,
} from './state/worktree-switch-gate.js'
export { openWorkspaceFace, type OpenWorkspaceFace } from './state/open-workspace-face.js'

// 1.34 确认闩锁/「不再提示」/陈旧自愈纯模型（WorktreeFaces 挂载面消费——挂载面已迁
// worktree-picker/picker.tsx，纯模型随迁 model.ts）
export {
  riskDialogNeeded,
  riskDismissedMemoryOf,
  riskDismissedMemorySync,
  riskLatchConfirm,
  riskLatchMemoryOf,
  riskLatchMemorySync,
  riskLatchReselect,
  staleSelectionResetOf,
  type RiskConfirmLatch,
  type StaleSelectionReset,
  type StaleSelectionRow,
} from './worktree-picker/model.js'

export * from './icons.js'
// AheadBehind 域类型（worktree-ops 单源——type-only re-export，client bundle 零运行时载荷）
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

// ── 插件内部 RPC 窄面（forge:projects/fs/bugs/worktree/settings/proposals/features 消费
// 切片——壳侧 rpc 发布面零参与）──
export * from './rpc.js'

// ── 领域无关小件承载副本（apps/web src/components 同源镜像——迁移面渲染依赖）──
export * from './components.js'


import { registerOfficialSeamFaces, revokeOfficialSeamGlobals } from './official-seams.js'
import { installOfficialRpcFace, type OfficialRpcCallFace } from './rpc.js'
import { registerSettingsSection } from './settings-section/index.js'
import { registerWorktreeDetailSection } from './detail-section/index.js'

// ── keyed section 扩展点 + 配置节双缝（1.16：tab keyed 占用者模式泛化 + settings 节
// bundle.config/detail.section 双缝——configForms revisioned 写径；详见各模块头注）──
export * from './keyed-section.js'
export * from './settings-section/index.js'
export * from './settings-section/worktree-prefs.js'

// ── worktree 管理面（1.32：plugins.detail.section list 缝——forge.worktrees 缝消费，
// 不依赖 configForms；槽/缝缺席或劣形 fail-soft 退无面板；详见各模块头注）──
export {
  ProjectWorktreesSection,
  WORKTREE_DETAIL_SECTION_ID,
  WORKTREE_SEAM_KEY,
  registerWorktreeDetailSection,
} from './detail-section/index.js'
export { worktreePortOf, type WorktreeSeamCtx } from './detail-section/seam-face.js'

// 组合 cordis 插件面（包骨架 1.3 正门，无 src 层；worktree 域 UI 平移后仍承担装载契约）：
// 无 apply → 真机 `invalid plugin` 判例（expert-squad annotator gotcha-web-boot 同径）；
// apply 返回值铁律：必须返回 undefined（cordis 组合把返回值当 effect 消费）。
// 零消费零 inject 边（settings-unification 圆桌处方）：dsh.client.inject 不声明 settings
// 域激活边、cordis 注入边不声明 configForms——消费点现查（configFormsFaceOf 直取 + reflect
// 兜底，面形状校验 fail-soft），缺席 = 配置节不注册（settings-section/index.ts
// registerSettingsSection），不炸组合；slots 为槽注册唯一必需服务（声明边，官方同型先例）。
// fix-13 缝注册面迁移：官方缝五面（chip/overlay 双行/Bug tab 两段/@ source）随本 bundle
// apply 期自注册（ui/official-seams.ts）——官方宿主不装载产品壳，注册面归属本插件域
// （插件可移植性：装配缝归插件，宿主只做 wiring）；inject 声明五官方服务（apply 期等待
// 合法——官方宿主五服务恒在场；缺一 = apply 不激活，即宿主形状漂移 fail-loud 形态）。
export const projectClient = {
  inject: ['slots', 'sidebarRightTabs', 'sidebarRight', 'workspaces', 'sessions'] as string[],
  apply(ctx: unknown): void {
    const rec = ctx as Record<string, unknown> | undefined
    // 1.33 官方缝双宿主传输：解析缝安装（apply 期一次安装、逐调用现查——AGENTS 1.6 检测
    // 永不缓存；reflect 防御读取不声明 inject 边——inject 缺席宿主会被 cordis 门阻载）。
    // ctx.connection.rpc.call 在场 → RPC 数据走官方缝；缺席 → 自家 channels face 兜底。
    try {
      const reflect = rec?.['reflect'] as { get?: (key: string) => unknown } | undefined
      installOfficialRpcFace(() => {
        let connection: unknown
        try {
          connection = typeof reflect?.get === 'function' ? reflect.get('connection') : undefined
        } catch {
          connection = undefined
        }
        const rpc = (connection as { rpc?: unknown } | undefined)?.rpc as
          | { call?: unknown }
          | undefined
        return typeof rpc?.call === 'function' ? (rpc as unknown as OfficialRpcCallFace) : undefined
      })
    } catch (error) {
      console.warn('[dsh-forge/project] official rpc face install failed——退自家 channels face', error)
    }
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
    // worktree 管理面（1.32）：forge.worktrees 缝劣形①②/slots 缺席 = 不注册 fail-soft
    // （registerWorktreeDetailSection 内收口），注册面异常只降本面，不炸装配。
    try {
      registerWorktreeDetailSection(rec as never, slots)
    } catch (error) {
      console.warn('[dsh-forge/project] worktree detail section registration failed——降级不注册', error)
    }
    // 官方缝五面自注册（逐面 fail-soft——单面异常只降本面；页内全局缝随摘除面收口）。
    try {
      const seams = registerOfficialSeamFaces(rec as never, slots)
      console.info(`[dsh-forge/project] official seam faces registered=[${seams.registered.join(', ')}]`)
    } catch (error) {
      revokeOfficialSeamGlobals()
      console.warn('[dsh-forge/project] official seam faces registration interrupted', error)
    }
  },
};

/**
 * 装载器正门（client-modules 装载契约）：materialize 后的 module.exports 项本身为
 * cordis 插件面——function 或含 apply 方法的对象（expert-squad 同型判例）。
 * default 导出经 unwrapExports（__esModule → default）还原插件对象本体。
 */
export default projectClient;
export const apply = projectClient.apply.bind(projectClient);
