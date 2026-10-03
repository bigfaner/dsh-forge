# workbench/

定位：**装配** —— 三区工作台组装（Page Composition「工作台（单页三区）」，2.12）：壳入口面板 +
hero 相位（UF-2）+ 知识视图 M0 占位 + 官方会话面嵌入 + 工作台桥发布。无独立业务语义——域内容
一律经 `zones/` 槽位与既有业务模块（views/flows）注入；依赖方向 = 装配 → 基础 + 业务单向。

## 组成

| 文件 | 职责 |
|---|---|
| `WorkbenchPanel.tsx` | 装配面板（`main.conversation` 洞位占用者）：`sessionZonePhase` 相位机（Hard Rule hero 单一条件）+ `WorkbenchAssembly` 三区槽位装配（纯渲染）+ 效应面（桥发布 / 官方会话锚跟随 / 项目数三锚重拉 / 3.8：`projectAnchorOf` 项目锚推导 + 抽屉打开态 + 召回 tab 激活锚 / fix-11：`TranscriptAnchor` 转录接线 + `transcriptOfChatSnapshot` wire 映射）+ UF-3 流程宿主挂载 |
| `HeroEmpty.tsx` | UF-2 首用 hero 空态（价值一句话 + 「＋添加项目」CTA——官方 Button；零判据零数据源） |
| `ChatSurface.tsx` | 对话 tab 官方会话面嵌入（S2 嵌入配方：`conversation.content` 工厂 variant=embedded × `conversation.session` owner view='chat'——upstream ui-subagent sidebar-chat 同型先例；kit 窄面 + 缺席降级占位） |
| `workbench-bridge.ts` | 工作台桥发布面（`__DSH_FORGE_WORKBENCH__` 发布侧；读取侧 = views/sidebar/sidebar-actions） |
| `workbench.css` | 装配样式（容器 = 官方 ConversationRoot 同型几何；hero/校平位/dock 角钮全令牌 + 原型刻度 dsw-raw 注记） |

## 装配结构（对应 page-map「工作台·会话视图」Page Sections）

- **左栏 rail** = 官方 ui-sidebar 壳（槽位路线 A，2.7：ForgeSidebarSlot 占 `sidebar.workspaces` +
  品牌行内容洞位）——zones rail 槽不注入（空轨），折叠/导航/快捷键白拿。
- **中区会话视图** = `SessionPanel`（2.11）入 `slots.session`，`chatSurface` = ChatSurface
  （官方会话面嵌入——转录/输入/草稿/滚动位全官方面自持）；召回 tab（3.8）= `RecallTab`
  注入（sessionRecall 单通道 + visible 激活重拉锚；命中行点击 → 抽屉打开 + show-knowledge）。
- **hero 相位（UF-2）** = 项目数 **正零** 时中区替换呈现（Hard Rule：仅由项目数驱动，单一条件；
  注册成功即永久让位——P1 无项目删除、archived 随行计数不回落）。CTA → `openAddProjectFlow()`。
- **知识视图** = `KnowledgeView`（3.8）入 `slots.knowledge`（常挂载 keep-alive；UF-6 浏览面 +
  详情抽屉——无项目锚 = 引导空态）；视图互换/右栏联动机制归 zones 容器（2.5）。
- **当前项目锚（3.8）** = `projectAnchorOf`（会话锚 → workspace 归属 → 项目；无锚兜底唯一项目；
  多项目无锚 = null）——知识视图与召回 tab 共用范围锚；抽屉打开态（`drawerEntryId`）为
  知识卡片与召回行两入口共用的装配态（Hard Rule：跨视图跳转经装配态，不直引组件）。
- **右栏 dock** = zones dock 轨道（UF-7 机制）+ M0 占位页签集（全局「开始」）；会话区右上角
  常显收展开关（原型 conv-corner 同位）。
- **模态层** = `AddProjectFlow` 宿主（mount 期发布 `__DSH_FORGE_ADD_PROJECT_FLOW__` 打开缝）。

## 数据流

- **项目数（hero 判据）**：`useForgeProjects`（`forge:projects/list`）× 三刷新锚——mount 首拉 /
  workspace 归属快照身份变化（外部注册 dsh create 后自愈，与左栏面板同锚口径）/ 注册成功回调
  （`AddProjectFlow.onRegistered`）。相位机：`settling`（未就绪在途——防闪现）→ `hero`（正零）/
  `session`（≥1 或未就绪失败 fail-soft——计数未知 ≠ 0）。
- **工作台桥**：mount 发布 / unmount 撤销；左栏导航（知识库入口 / 会话行）经
  sidebar-actions 读桥派发视图事件（缺席期 fail-soft no-op）。
- **官方会话锚跟随**：`sessionId` 变更 → `select-session`（官方新会话/品牌行激活会话即回会话
  视图——UF-5「再次点新会话/会话行/品牌行 → 切回会话视图」的装配侧接缝）。

## 残留（后续里程碑/任务）

- ~~ChatSnapshot wire 判别值 → TranscriptEntry 映射（轨迹 tab 数据）~~ 已随 fix-11 接线
  （`TranscriptAnchor` 订阅 `useConversation` 标准钩子 → `transcriptOfChatSnapshot` 纯函数
  映射（wire 判别 = ConversationNode `kind` 字段族）→ SessionPanel `transcript` 注入）；
  conversationPhase 完整相位（settling）仍待装配实跑锚定入 G1 pin 池（2.13），冒烟迁移断言（2.14）。
- dock 域页签（知识文档/审核台/文档）与按项目页签切换的实机驱动：后续里程碑登记表接入；
  机制面（visibleDockTabs 口径）已由 zones 单测 pin。
- hero / 注册链的实机 e2e 证明受 **host 侧 forge:projects/* 通道实装** 前置（main.ts 未接
  `registerProjectsChannels`；profile core 行 disabled——见执行记录）；落地后 workbench-sc1
  spec 的 hero 组断言即可转正。
