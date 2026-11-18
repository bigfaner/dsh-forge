// @dsh-forge/lib-ui —— slot 键与双形态 priority 约定具名常量单源
// （host-integration-fixes 裁决 5：键名与 priority 值收敛 lib 纳管，禁两插件
// 字面量各自为政——400b3952 同键同 priority 撞车的结构性根因）。
// 官方 slots 语义：keyed 同 key 异 priority 共存、升序排序、最低者渲染
// （dsh slots/index.js 正缝），priority 约定值按该语义分工。

/** 右栏 dock tab keyed 槽名（官方 sidebar-right slots 声明键）。 */
export const SIDEBAR_RIGHT_PANE_TAB_SLOT = 'sidebar.right.pane.tab'

/** 右栏 dock tab 副段：tab 标题 keyed 槽名。 */
export const SIDEBAR_RIGHT_PANE_TAB_TITLE_SLOT = 'sidebar.right.pane.tab.title'

/** 概览 dock tab 键（project 拥有 / task-loop 单装兜底双形态共用）。 */
export const DSWF_OVERVIEW_TAB_KEY = 'dswf-overview'

/** 集成形态 AC 进度段子槽键（task-loop 经 keyed-section 注入 project 概览主体）。 */
export const DSWF_OVERVIEW_AC_PROGRESS_SLOT = 'dswf-overview.ac-progress'

/** AC 进度段 keyed 占用键（project 概览 renderSlot entryKey 分发 / task-loop 落座键——跨 bundle 契约单源）。 */
export const AC_PROGRESS_ENTRY_KEY = 'dswf-ac-progress'

/** 双形态 priority 约定：project 恒 0 —— 概览 tab 拥有者与主体渲染者。 */
export const PRIORITY_PROJECT_OVERVIEW_OWNER = 0

/** 双形态 priority 约定：task-loop 单装兜底 -10 —— project 缺席时独立 body 注册值。 */
export const PRIORITY_TASK_LOOP_FALLBACK = -10
