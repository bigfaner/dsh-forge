---
created: "2026-09-23"
related: design/tech-design.md
---

# Page Map: dsh-forge M3 流程即产品

> **路由现实**(M2 page-map 延续):上游 SPA 无 URL 路由,页面寻址 = **视图键(会话期内存切换)**。M3 修订 workbench 内 tab 序为 **概览 / 提案 / Feature / 任务**(PRD Navigation Architecture),新增 `workbench/proposals` tab 页;其余为既有视图的功能扩展。tab 序修订落点 = `client/store/view-key.ts` 状态机(WORKBENCH_TABS + localStorage 持久化)+ `components/chrome/TabBar.tsx` + locale `tab.*`(M2 实码核对,2026-09-23)。本图供 gen-contracts/gen-test-scripts 以**元素与状态**(非 URL)定位页面。

## Page Overview

主窗口双顶层视图互斥:`session`(上游继承)| `workbench`(M2 注入,M3 扩展)。`workbench` 内四 tab 子页(概览/提案/Feature/任务)+ 浮层(迁移/派发/偏好对话框族)+ 侧板(任务详情 / 审批 dock)+ 浮动条(选择模式)。

## Pages

### 工作台 · 项目概览(UF3 迁移 + UF4 偏好扩展)

**View Key**: `workbench/overview`(tab,默认)
**Layout**: WorkbenchShell → OverviewPage(M2 既有 + 迁移入口 + PreferenceSection)
**Auth**: none(单用户桌面)
**Navigation**: 项目卡「迁移」入口 / 向导条件步骤;偏好面层级 segmented

#### Route Parameters / Query Parameters

无(视图键寻址;偏好层级选择 = 会话期内存)。

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 项目卡(M3 扩展) | ProjectCard + MigrationPill | workbench.getMigrationStatus | 可迁移 warn Pill / 已迁移 success Pill;「迁移」按钮 |
| 偏好面(UF4) | PreferenceSection | workbench.getPrefs/setPrefs/clearPrefOverride | 层级 segmented(全局/项目/Feature)+ 键分组(auto.*/worktree.*/eval.*)+ 继承/覆盖 Pill + 脏保存条 |
| 迁移对话框族(UF3) | MigrateConfirm/Progress/Error/Guard | startMigration + migration_progress 事件 | 进度中 `data-close-guard` 不可关;失败回滚;守卫列在跑清单 |
| 注册向导(条件步骤) | RegisterWizard(M2 扩展) | 检出 index.json 时插入「迁移预检」步骤 | 立即迁移(推荐)/稍后 |

#### Permissions

| Role | Access Level |
|------|-------------|
| 单用户(桌面) | 迁移发起 + 偏好编辑(任务写零 UI 延续) |

---

### 工作台 · 提案看板(UF5,新增页)

**View Key**: `workbench/proposals`(tab,第二位)
**Layout**: WorkbenchShell → ProposalsPage(新)
**Auth**: none
**Navigation**: tab 提案;提案卡 → 详情子视图;feature 徽标 ↔ Feature 详情互跳

#### Route Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| slug | string(视图键段) | 是(详情子视图) | 提案目录名;正文经 readProposalDoc |

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 提案卡 grid | ProposalCardGrid | workbench.getProposalBoard | slug/status 4 态 Pill/作者/时间/关联 feature 徽标(无关联不渲染) |
| 提案详情 | ProposalDetail + DocViewer | workbench.readProposalDoc(kind:'proposal'\|'eval') | 只读渲染防注入;eval 同构 tab |
| 回流呈现 | FlowOverlay | deviation/prefs_updated 等事件 | 外部变更 ≤5s;aria-live |

#### Permissions

| Role | Access Level |
|------|-------------|
| 单用户(桌面) | 只读(零写入口,PRD G6) |

---

### 工作台 · Feature 看板(UF2 阶段化扩展)

**View Key**: `workbench/features`(tab)+ 子视图 `workbench/features/:slug`
**Layout**: WorkbenchShell → FeaturesPage + FeatureDetail(M2 既有 + 阶段门 + 资产 tab)
**Navigation**: tab Feature;提案页徽标互跳(M3 新)

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| stepper(M3 扩展) | StatusStepper + GateHint | workbench.getStageGate | 门态(可推进/拒绝 + 缺失清单引导);偏离徽标 |
| 「阶段资产」tab(第六) | StageAssetsTab | workbench.listStageAssets | `stages/<stage>.md` 只读渲染(frontmatter + 摘要) |
| 推进动作 | AdvanceStageButton | workbench.advanceStage | 门不满足 → ERR_STAGE_GATE_UNSATISFIED 引导 |

#### Permissions

| Role | Access Level |
|------|-------------|
| 单用户(桌面) | 阶段推进(编排面;任务写仍零 UI) |

---

### 工作台 · 任务看板(UF1 编排扩展)

**View Key**: `workbench/tasks`(tab)
**Layout**: WorkbenchShell → TaskBoardPage(M2 三视图继承 + 选择模式 + 审批 dock + 派发链)
**Navigation**: tab 任务(带审批计数徽标);编排角标点击进审批;详情「进入会话」切 `session`

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 工具栏(M3 扩展) | BoardToolbar + DispatchButton + ApprovalButton | dispatch/approvals 动词 | 「派发」进选择模式;审批按钮带呼吸点计数 |
| 三视图(继承) | TaskDag/Group/ListView | getTaskBoard(读路由按 data_authority) | 节点编排角标谱(待启动/执行中/待审批/失败/已提交);选择模式整面勾选 + 键盘契约(Space/Enter/Esc/方向键) |
| 浮动选择条 | SelectionFloatBar | 内存态 | 已选计数 + 取消 + 派发所选 |
| 派发对话框链 | DispatchWarning/Confirm/Error | checkStageArtifacts/dispatchTasks | warning(缺失清单,确认续)→ confirm(三要素说明)→ 超时错误 |
| 审批 dock(UF1) | ApprovalPanel | listApprovals/decideApproval + approval_received 事件 | 条目 = 任务 + 请求正文(clamp 展开);批准/拒绝显式点击;与详情侧板互斥 |
| 任务详情侧板(M3 扩展) | TaskDetailPanel | getTaskDetail + getDispatches | 编排分区(当前态/会话/去审批/失败原因+重派发/预合成要素 ✓✓✓)置于执行记录之上 |

#### Permissions

| Role | Access Level |
|------|-------------|
| 单用户(桌面) | 派发/审批/重派发(编排面);任务状态写零 UI(操作主体模型) |

---

### 浮层与侧板(工作台视图内)

**View Key**: `workbench/dialog/*`(z1200)+ `workbench/panel/*`(z100)
**Layout**: 上游 Dialog 几何延续;侧板与 M2 TaskDetailPanel 同构互斥
**Navigation**: Esc 分层:对话框 > 选择模式 > 侧板;迁移进度中 close-guard 不可关

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 重派发确认 | RedispatchDialog | redispatch | 上次失败原因 + 重走检查/预合成说明 |
| 偏好保存失败 | PrefSaveErrorDialog | setPrefs 错误 | 整体回滚说明 + 重试 |

### 上游会话视图(existing,跳转目标)

**View Key**: `session`(上游继承);subagent 会话经 dispatch-launch 创建,详情「进入会话」切入(M2 DF004 通道延续)

## Shared Components

| Component | Used In | Description |
|-----------|---------|-------------|
| WorkbenchShell / ProjectSwitcher | 全部 workbench 页 | M2 件延续;tab 序修订在此 |
| StateDot / Pill / Stepper | 全部 | 编排角标谱/审批/迁移/偏离 Pill 扩展词表 |
| TaskDetailPanel / ApprovalPanel | 任务看板 | 同构侧板互斥;z100 焦点锁定 |
| WizardDialog | 概览 | 注册 + 重新指向 + 条件迁移步骤 |
| DocViewer(MarkdownView 白名单) | Feature/提案/阶段资产 | 只读渲染防注入统一件 |

## Route Guard Configuration

无路由守卫(无 URL 路由 + 单用户桌面)。等效门控 = 状态门:迁移进行中 → 进度对话框不可关(close-guard);在跑编排 → 迁移守卫对话框(互斥);门不满足 → 推进拒绝 + 引导;桥不可用 → 会话内降级提示(不静默)。
