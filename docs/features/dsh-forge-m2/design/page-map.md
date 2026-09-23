---
created: "2026-09-22"
related: design/tech-design.md
---

# Page Map: dsh-forge M2 需求与会话工作台

> **路由现实**:上游 SPA 无 router(M1 spike-3 已证,PRD ui-functions 亦注明)。M2 页面族不引入 URL 路由——页面寻址 = **视图键(会话期内存切换)**,经插件导航注入承载;本 page-map 以视图键替代 Route 字段,供 gen-contracts/gen-test-scripts 以**元素与状态**(非 URL)定位页面。M2 落地后建议运行 `/gen-web-sitemap` 建立 sitemap 基线(PRD 附注)。

## Page Overview

主窗口双顶层视图(互斥,同一时刻一个):`session`(上游会话视图,100% 继承)| `workbench`(本 feature 新增,forge-workbench 插件注入)。`workbench` 内三 tab 子页(概览/任务/feature)+ 浮层(向导/确认/错误对话框)+ 侧板(任务详情)+ 子视图(feature 详情)。切换契约见 ui-design §Navigation。

## Pages

### 工作台 · 项目概览

**View Key**: `workbench/overview`(tab,默认)
**Layout**: WorkbenchShell(导航注入 + 顶栏项目切换器 + tab 条)→ OverviewPage
**Auth**: none(单用户桌面)
**Navigation**: 顶栏项目切换器「添加项目」/ 空态「注册项目」进向导;tab 概览

#### Route Parameters

无(视图键寻址,无路由参数;激活项目上下文来自 `WorkbenchState.activeProjectId`)。

#### Query Parameters

无(筛选/排序偏好 = 会话期内存,不持久化,ui-design 口径)。

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 项目元信息行 | OverviewMeta | workbench.getState | 激活项目路径/文档位置(mono) |
| 项目卡片 grid | ProjectCardGrid | workbench.getState | 重命名(inline)/切换/移除(二次确认) |
| 插件管理区(UF6) | PluginSection | workbench.listPlugins / setPluginEnabled | 必备行无动作;第三方启停(确认对话框) |
| 空态/加载/错误卡 | StateCards | getState 错误码 | 重新指向 = 向导编辑模式 |

#### Permissions

| Role | Access Level |
|------|-------------|
| 单用户(桌面) | 全部(无角色面) |

---

### 工作台 · 任务看板

**View Key**: `workbench/tasks`(tab)
**Layout**: WorkbenchShell → TaskBoardPage(工具栏 sticky + 三视图容器)
**Auth**: none
**Navigation**: tab 任务;节点/行点击开详情侧板;UF5 发起后切 `session`

#### Route Parameters

无。

#### Query Parameters

无(视图切换/筛选/排序 = 会话期内存;任务计数随筛选更新)。

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 工具栏 | BoardToolbar | 快照内存态 | segmented 三视图 + 筛选(feature/状态/worktree)+ 排序 + 计数 |
| 视图 A 依赖树 | TaskDagView(@xyflow/react) | workbench.getTaskBoard | 默认视图;键盘遍历;节点 hover UF5 按钮 |
| 视图 B 状态分组 | TaskGroupView | 同上 | 7 态看板列 |
| 视图 C 列表 | TaskListView | 同上 | ID/标题/状态/feature/分支/worktree/来源/更新时间 |
| 任务详情侧板(UF3) | TaskDetailPanel | workbench.getTaskDetail | z100 dock;描述/依赖链/执行记录/挂接历史 |
| 回流呈现 | FlowOverlay | workbench.onEvents | 属性级高亮/结构性增量;aria-live |

#### Permissions

| Role | Access Level |
|------|-------------|
| 单用户(桌面) | 只读 + UF5 发起(无任务写操作入口,PRD 操作主体模型) |

---

### 工作台 · feature 看板

**View Key**: `workbench/features`(tab)+ 子视图 `workbench/features/:slug`(面包屑,会话期)
**Layout**: WorkbenchShell → FeaturesPage(列表)+ FeatureDetail(子视图)
**Auth**: none
**Navigation**: tab feature;feature 卡进详情;面包屑返回(保留列表滚动)

#### Route Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| slug | string(视图键段) | 是(详情子视图) | feature 目录名;上下文来自 feature_snapshot |

#### Query Parameters

无。

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| feature 卡 grid | FeatureCardGrid | workbench.getFeatureBoard | slug/状态 Pill/进度/更新时间 |
| 状态机 stepper | StatusStepper | 同上 | 5 态全称标签(prd/design/tasks/in-progress/completed) |
| 五类文档 tab | DocTabs + DocViewer | workbench.readFeatureDoc | 空缺类 disabled;只读渲染防注入;仓外失效 → 错误卡 + 重新指向 |

#### Permissions

| Role | Access Level |
|------|-------------|
| 单用户(桌面) | 只读 |

---

### 浮层(工作台视图内)

**View Key**: `workbench/dialog/*`(z1200;注册向导 `wizard`、移除确认、插件禁用确认、UF5 发起失败)
**Layout**: 上游 Dialog 几何(r24 · mask-1 + blur(2px));向导宽 `min(520px, 100vw-48px)`(ui-design 宽度偏离声明)
**Navigation**: 由所属页面动作唤出;Esc/mask/✕ 关闭(向导带放弃确认守卫)

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 注册向导(3 步 + 编辑模式) | RegisterWizard | workbench.registerProject/updateProject | 步骤①检出校验、②仓外授权、③确认 |
| 确认/错误对话框 | ConfirmDialog / LaunchErrorDialog | 对应动词错误码 | 影响说明文案(locale) |

### 上游会话视图(existing,跳转目标)

**View Key**: `session`(上游继承,不在本 feature 设计范围)
**Navigation**: UF5 发起成功/「进入会话」切入;返回 = 壳级视图切换(会话期记忆工作台状态);定位沿用 M1 fallback(前置 + toast),DF004 侦察含 localStorage poke 增强

## Shared Components

| Component | Used In | Description |
|-----------|---------|-------------|
| WorkbenchShell(导航注入) | 全部 workbench 页 | 首选上游导航槽位/降级自绘 rail(D3 裁决;行为契约一致) |
| ProjectSwitcher(Menu 卡) | 全部 workbench 页 | 顶栏项目切换 + 「添加项目」 |
| StateDot / Pill / Stepper | 任务/feature/插件区 | 状态呈现统一件(ui-design Design System) |
| WizardDialog | 概览/feature 错误卡 | 注册 + 重新指向(编辑模式)同源组件 |
| TaskDetailPanel | 任务看板 | UF3 侧板(焦点锁定) |

## Route Guard Configuration

无路由守卫(无 URL 路由 + 单用户桌面)。等效门控 = 状态门:无激活项目 → 概览空态自动进向导(PRD 业务流);外部文档失效 → 错误卡 + 重新指向引导(不静默)。
