---
created: "2026-10-06"
related: design/tech-design.md
---

# Page Map: dsh-forge M2 —— forge 管线接管

> Platform = web(Electron renderer,apps/web)。M2 全部 UI 面 = 既有工作台上的**槽位/tab 扩展**(dock slot 注册制,无新路由);布局结构基准 = [ui-design.md](../ui/ui-design.md) v17 静态原型(135 断言),视觉实现遵循官方样式纪律(令牌唯一/官方件复用)。

## Page Overview

| Page | 类型 | 注册缝 | 入口 | 返回 |
|---|---|---|---|---|
| 右栏「项目概览」tab | dock tab(唯一,replaceTab) | `sidebarRightTabs.register('dswf-overview')` + `sidebar.right.pane.tab` body | 开始页 guide 入口卡(排最前)/ 会话头挂接 pill | chip ×(回开始页) |
| 右栏「文档」tab | dock tab(multiple,按 address 去重) | `sidebarRightTabs.register('dswf-doc')` + body 槽 | 概览提案/feature 子 tab 文档行(整行可点)/ 抽屉参考文档 chip | chip ×(回概览或开始页) |
| 任务详情抽屉 | 右侧滑入浮层(320–760px 可拖宽) | 概览/文档 tab 内局部 | 任务行/DAG 节点/泳道卡片/挂接 pill/⋯ 菜单 | Esc / ✕ / 点击另一任务 |
| 转移状态对话框 | 模态(官方 Modal) | 抽屉/⋯ 菜单局部 | 「转移状态…」按钮 | Esc / 取消(空因拒绝留场) |
| 会话头挂接 pill 行 | session.header actions 槽(list) | `conversation.session.header.actions` 注册 | 会话头常驻(有挂接才渲染) | —(非页面) |
| 注册表单派生行 | 表单只读行(升级) | `flows/add-project/RegisterForm` 现派生行位 | hero CTA / 侧栏 ＋ → OS 选择器 → 表单 | —(表单行) |

## Pages

### 右栏「项目概览」tab(`dswf-overview`)

- **Target File**:`apps/web/src/views/overview/OverviewTab.tsx`(tab body,`useTabInfo` 注入)+ 子组件 `OverviewHead / ProposalsTab / FeaturesTab / TasksTab / views/{TaskList,TaskDag,TaskSwim} / TaskDrawer / TransitionDialog`
- **Data Source**:`forge:tasks/{list,stats,graph,detail,sessionLinks}` · `forge:features/list` · `forge:proposals/list`(通道全集见 tech-design Interface 7);ov-head「N 会话」= sessions/workspaces 账本快照;项目锚 = knowledge-anchor 裁决(主视图会话优先,唯一项目兜底);刷新 = 事件订阅 + 交互重取
- **结构**:ov-head(默认折叠,▾ 展开路径 4 行)→ sticky(子 tab 提案|feature|任务 + 搜索限宽 + 排序 pill 右固定)→ 内容区;任务子 tab = feature pill + 七态 chips + 三视图 seg(列表/DAG/泳道)
- **约束**:IME 安全(仅更新内容区);三视图统一 chips 过滤;0 计数禁用;@500 任务首屏 ≤2s

### 右栏「文档」tab(`dswf-doc`,multiple)

- **Target File**:`apps/web/src/views/docs/DocTab.tsx` + `MermaidDiagram.tsx`(懒加载;失败回退占位卡内联于同组件)
- **Data Source**:`forge:docs/read`(content + canonicalPath + dangling);`forge:docs/openExternal`(main 侧,路径在册校验);↻ 重读
- **结构**:头部(文件名+只读徽标+悬空徽标)→ 路径栏(canonical 全路径 + 📁 + ↻)→ 摘要块 → `MarkdownDoc`(variant=body) + **mermaid 分段渲染**(MermaidDiagram 懒加载;erDiagram = 验收锚;渲染失败/非法源回退占位卡)
- **约束**:悬空 = 只读占位面(路径栏保留,不崩溃不写入不删行);按 address 去重(revealIfOpened)

### 任务详情抽屉

- **Target File**:`apps/web/src/views/overview/TaskDrawer.tsx`(EntryDrawer 形制:dockkit 浮层令牌 + 右缘滑入;**净新增拖宽手柄**——无官方先验)
- **Data Source**:`forge:tasks/detail`(snapshot + 关联水化 + files/commit 实际范围 + allowedTransitions)
- **结构**:通用区(头部 ✕ 右端 + 标签行 chip kv)→ 块一 任务内容(目标/结果上下展示 + 类型模板 + 单元测试覆盖率 + 备注)→ 块二 时间线(现状条 + 事件流)→ 转移按钮;两块顺滑折叠(grid 0fr/1fr 就地更新)

### 转移状态对话框

- **Target File**:`apps/web/src/views/overview/TransitionDialog.tsx`(官方 Modal + 官方原语)
- **Data Source**:`taskDetail.allowedTransitions`(选项集所见即所得);提交 `forge:tasks/transition`(reason 必带,空因拒绝留场)

### 会话头挂接 pill 行(`SessionTaskPills`)

- **Target File**:`apps/web/src/views/session/SessionTaskPills.tsx`;注册 = plugin.ts `conversation.session.header.actions` 新槽位登记
- **Data Source**:`forge:tasks/sessionLinks`(sessionId 来自会话上下文;projectId = sessions→workspaces 账本解析 cwd 单库);事件订阅刷新
- **约束**:双数据源分型(派发 ⟞ links / 执行 ⟞ records.session_id);≤2 并排 + +N 溢出;点击 → dock 开概览 + 切任务子 tab + 抽屉打开

### 注册表单派生行(升级)

- **Target File**:`apps/web/src/flows/add-project/RegisterForm.tsx`(现派生行 L219-223 整行替换)
- **Data Source**:`forge:projects/deriveTaskStoreDir`(RPC 下发,web 自算废除);`ERR_SUSPECTED_MOVE` → 错误条 + 手工指引留场

## Shared Components

| 组件 | 落点 | 说明 |
|---|---|---|
| TaskStatusTag / TypeChip / KvChip | `apps/web/src/components/` | 七态中文 tag、类型着色 chip、`{key} : {value}` chip |
| TaskDrawerShell(拖宽手柄) | `apps/web/src/components/` | 320–760px 拖拽/双击复位 420/←→ ±32;会话级宽度保持 |
| MermaidDiagram | `apps/web/src/views/docs/` | mermaid 块分段渲染(懒加载 mermaid 库,strict 安全级;erDiagram = 验收锚;失败回退占位卡) |
| EmptyState / SkeletonRows / ErrorBar / StateChip | 既有 | 三态沿 P1 形制 |

## Route Guard Configuration

不适用——M2 无新路由;全部面 = dock tab 注册制(`sidebarRightTabs`)与槽位注册制(`slots.register`),生命周期由官方右栏管理(布局持久化 localStorage `dsh.sidebar-right.v1.<sessionId>`)。
