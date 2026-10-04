# workbench/

定位：**装配** —— 官方基座降位后的产品装配面（fix-25 架构重排）：常驻壳宿主 +
官方 main 面板族（hero/知识）+ hero 纯渲染件 + 面板模型纯函数 + 工作台桥。
无独立业务语义——域内容一律经既有业务模块（views/flows）注入；依赖方向 =
装配 → 基础 + 业务单向。

## 架构（fix-25：官方头部链点亮）

**中区 = 官方 ConversationRoot 直渲**（`main.conversation` 产品影子退役）。根因（runtime
源码三层实证 + fix-23 探针）：slot runtime 的 `renderSlot` 授权按「占用者注册行自声明的
children」发放（renderer standardKit：`entry.children` 在场才注入），子槽声明全局唯一
（ui-slots register 重声明即 throw）——产品影子行（-100 不声明 children）恒拿不到官方
子座渲染权。官方 ConversationRoot 自带 children 声明 → 官方头部链
（`conversation.header` → `conversation.session.header` → lineage/actions/
**utilities「打开方式」+「⋯」**/**corner 官方 ExpandButton**）与官方页签行/内容面全部白拿。

产品面降位官方缝（content 工厂域承载不可行——`registerFactory` 定义唯一不可影子）：

- **知识视图（UF-5）** = 官方 `main` keyed 面板 roster（ui-layout「root-scoped main slot
  selects the Conversation or a global panel」——先例 ui-plugin-manager/ui-schedule）：
  `key='dswf-knowledge'` 占用者 KnowledgePanel；入口 = 官方 `sidebar.panellist` 行
  （官方 PanelRow 行语言）+ 召回视图跳转（桥）；回会话 = 官方 `openSession`
  （内部 `layout.selectPanel(null)`）或桥 `showSession`。keyed 面板非选中即卸载
  （DOM keep-alive 语义退役——会话状态（草稿/转录）归官方 store 自持）。
- **UF-2 hero（零项目首用引导）** = 产品全局 main 面板 `key='dswf-hero'`（HeroPanel）；
  ShellHost 驱动选中/让位（boot 期零项目 → selectPanel；注册成功 → null——一次性守卫
  防导航争用）。零 workspace 下官方 hero 为死端（空选择器+禁用输入），产品引导面板为
  功能必需。
- **产品页签（UF-4 轨迹/知识召回）** = 官方 `conversation.view` roster 登记项
  （ui-trajectory 同型先例——`id`/`order`/`label`）；对话 tab = 官方 'chat' 直用。
  官方 'trajectory' 登记项受 developerTools 设置门控（默认隐藏）——产品自登记
  'dswf-trajectory' 保三页签恒在场；developerTools 开启期两项并陈 = 已知边界。

## 组成

| 文件 | 职责 |
|---|---|
| `ShellHost.tsx` | 常驻壳宿主（`shell.overlay` 槽位件——AppFrame root 五子槽之一，不随面板互换卸载）：相位推导 + `data-dswf-workbench/phase/view` 锚（e2e/走查）+ UF-3 流程宿主 + hero 面板驱动（`heroPanelDrive` 纯函数）+ 知识模式右栏联动（`rightbarViewPlan` + effect——fix-23 语义随迁）+ `WorkspacesAnchor` 归属锚 |
| `HeroPanel.tsx` | UF-2 零项目 hero 面板（`main` keyed 'dswf-hero' 占用者——HeroEmpty 挂载舞台） |
| `HeroEmpty.tsx` | UF-2 首用 hero 空态（价值一句话 + 「添加项目」CTA——官方 Button；零判据零数据源） |
| `KnowledgePanel.tsx` | UF-5 知识面板（`main` keyed 'dswf-knowledge' 占用者）：KnowledgeView 挂载 + 项目锚推导 + 桥抽屉缝消费（useSyncExternalStore） |
| `panel-model.ts` | 纯函数面：`sessionZonePhase`（Hard Rule hero 单一条件）/ `nextLastReadyCount` / `projectAnchorOf` / `rightbarViewPlan` / `centerViewOf`（activePanelId → 视图镜像）+ 面板 key 常量（plugin.ts 字面量同源 pin） |
| `workbench-bridge.ts` | 工作台桥（`__DSH_FORGE_WORKBENCH__`）：官方面板导航窄面（`createWorkbenchBridge`——nav 闭包绑定 `layout.selectPanel`）+ 知识抽屉目标缝（召回视图跳转 → 知识面板抽屉——两棵独立槽位树的唯一通道）|
| `workbench.css` | 装配样式（壳宿主零交互舞台 + hero/知识面板舞台——官方 CenterColumn 内自排；中区容器零样式：官方 ConversationRoot 直渲） |

## 数据流

- **项目数（hero 判据）**：`useForgeProjects`（`forge:projects/list`）× 三刷新锚——mount 首拉 /
  workspace 归属快照身份变化（外部注册 dsh create 后自愈，与左栏面板同锚口径）/ 注册成功回调
  （`AddProjectFlow.onRegistered`）。相位机：`settling`（未就绪在途——防闪现）→ `hero`（正零）/
  `session`（≥1 或未就绪失败 fail-soft——计数未知 ≠ 0）。
- **面板互换**：官方 `layout.selectPanel`（ui-layout LayoutController）；官方 `openSession`
  内部 `selectPanel(null)` 回会话——「会话行切回」UF-5 主路径全官方收口（产品视图态机退役）。
- **工作台桥**：插件 apply 期经发布面工厂创建（nav 绑定官方 selectPanel）+ 页内全局发布；
  消费方 = 召回视图跳转（inject face）+ 知识面板抽屉（订阅）+ e2e 载体（`showSession`）。
- **知识模式右栏联动**：ShellHost effect（`rightbarViewPlan`——进知识面板收起并记忆、回会话
  按记忆恢复；UF-5/SC8 语义保持，收展态本体归官方 per-session store 自持）。

## 已知边界（P1）

- **多项目知识锚定降级**：知识面板 = root 作用域（无会话锚可读）→ `projectAnchorOf` 恒走
  唯一项目兜底；会话锚定径由召回/轨迹视图（session 作用域）消费。多项目知识视图锚定归
  后续里程碑（会话锚跨面板传递缝）。
- **developerTools 开启期轨迹页签并陈**：官方 'trajectory'（门控显示）与产品
  'dswf-trajectory' 同时在场——官方门控不改写，P1 接受。
