---
created: "2026-09-28"
related: design/tech-design.md
---

# Page Map: dsh-forge M4 项目中心工作台

> **路由现实**(M2/M3 page-map 延续):上游 SPA 无 URL 路由,页面寻址 = **视图键 + 布局态**(会话期内存切换,`ctx.layout.selectPanel`)。M4 裁决 T1 = **原生 home 增强层**:`project` 工作台 = 原生 conversation 面板(`selectPanel(null)`,默认即启动首屏)+ 左栏座位注入 + 原生 rightbar 挂 forge tabs;旧 `workbench/*` 四 tab 键退役(任务看板 = 右栏 pane 双宿主;概览 = 逃生门单页)。本图供 gen-contracts/gen-test-scripts 以**元素与状态**(非 URL)定位页面。

## Page Overview

- **顶层互斥 main 面板**:`conversation`(= `project` 工作台,启动首屏)| `workbench`(overview 逃生门,过渡)| 上游原生(plugins 等)。
- **全局座位**:左栏 = `sidebar.workspaces`(M4 替换为 forge 项目树)| `sidebar.panellist`(「项目」行,M4 首项)| `sidebar.settings`(上游原生,M4 不动)。
- **右栏 dockkit**:原生 rightbar 多 pane;forge tab kinds = guide/overview/board/doc/depgraph。
- **壳层窗口**:主窗 + detached 集(`windowOpenDetached`/`windowRecall`,role 经主进程)。
- **浮层**:C7 添加项目确认卡(左栏 ＋ 原位,唯一入口)| C8 归档/删除确认 | M3 既有对话框族(迁移/派发/偏好,随宿主面)。

## Pages

### 项目工作台(`project` 逻辑态 = conversation 面板 + 注入层)

**View Key**: `project` = `selectPanel(null)`;启动默认落点(恢复 `active_project_id`,无项目 → 空态引导)
**Layout**: AppFrame → ConversationPanel(原生)+ forge 注入(左栏座位/panellist 行/C6 条/右栏 tabs)
**Auth**: none(单用户桌面)
**Navigation**: 启动默认;panellist「项目」行;左栏项目树点击(原位切换,#28);hero 项目▾(`?p=&new=1` 草稿单例)

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 左栏项目树(C3) | forge ProjectTreeBrowser(座位注入,行语言自绘) | ctx.workspaces/ctx.sessions + listProjects IPC | 项目行(归档分区/⋯ 菜单)+ 会话行(状态点/相对时间/⋯)+ subagent 行(↳ 缩进,默认收起)+ 溢出折叠 + 未分组组头(纳管入口)+ 区头(🔍/视图选项/📁＋) |
| 中间会话面板(C2) | 原生 ConversationPanel | 上游 | hero/对话/轨迹/composer 全原生;C6 元数据条注入(仅 subagent 实例) |
| 右栏 dockkit(C2) | 原生 rightbar + forge tabs | M3 face 动词 + lineage | 开始(guide)/项目概览(提案·feature·任务三子 tab)/文档/依赖图/任务看板;pane 分割 = C9 分屏;⛶ 全屏 |
| 添加项目确认卡(C7) | forge ConfirmCard(Dialog r24) | probeProjectPath + registerProject | 证据三档预览行/黏性禁令/授权收窄;左栏 ＋ 唯一入口 |

### 任务看板(右栏 pane / 拆出窗口双宿主)

**View Key**: pane 内形态(`TabKind='board'`)+ detached(`view='board'`);旧 `workbench/tasks` main 键注销(#27:不从属 feature 的独立视图)
**Layout**: rightbar pane → TasksView(组件化,去 TabBar 耦合)
**Navigation**: 右栏概览「任务」子 tab;分屏 [分屏]→选视图;概览 feature 行任务入口

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 看板主体 | StatusBoard/TaskList/DAG(M2/M3 既有) | task 快照/权威表 | 功能面零缩水 |
| 任务详情 dock(C5) | TaskDetailPanel(既有)+ LinkHistory 增强 | get-task-detail + lineage | 四手风琴节保持;挂接历史行展开血缘后代 + [打开](顶层/subagent 双通道);No-link 态 [发起] 按任务终态禁用(todo#30) |

### 概览逃生门(过渡)

**View Key**: `workbench`(main 面板,收缩为单页)
**Navigation**: 右栏概览 tab 行尾设置链(过渡期;偏好/插件面宿主 = 开放项,用户裁决「暂时忽略」2026-09-28)

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 概览 | OverviewPage(M2/M3 既有:项目卡/插件管理/偏好/迁移入口) | 既有动词 | SC5 零缩水过渡载体;正式归宿开放 |

### 拆出窗口(C10)

**View Key**: 壳层 `WindowRole={kind:'detached'}`(主进程供给,不走 URL)
**Layout**: 第二 BrowserWindow(同源 SPA 重载;标题「<项目名> · <视图名>」)
**Navigation**: pane 头 [拆出为窗口];OS 关闭 ≡ [收回](主窗 pane 原位恢复);主窗关闭 = 退出应用(单实例)

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| board 视图 | TasksView | 同看板 | 绑定来源项目,不随主窗激活指针 |
| conversation 视图 | 原生 conversation + openSession(target) | SessionTarget | 归档项目窗口保持可用(标题追加「已归档」) |

## Shared Components

| Component | Used In | Description |
|-----------|---------|-------------|
| ProjectTreeBrowser(C3) | 左栏(全局座位) | 数据面 = 上游服务;行语言自绘(dsw 令牌) |
| lineage 服务 | C3 树/C5 展开/C6 条 | 只读推导,≤100ms 降级 |
| TasksView | 右栏 board pane / detached 窗 | 组件化双宿主 |
| 确认卡(C7) | 左栏 ＋ / 空态 | 唯一注册入口 |
| 投影状态行 | 右栏概览 | healthy/degraded/deviation + [重试投影] + 偏差明细折叠 |

## Route Guard Configuration

无路由守卫(视图键寻址,单用户桌面);唯一入口纪律 = C7 确认卡为注册唯一入口、C8 生命周期动作带确认 Dialog(禁反向写)。
