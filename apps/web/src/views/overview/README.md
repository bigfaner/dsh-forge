# views/overview/

定位：**业务** —— UF-1「项目概览」dock tab 框架（ov-head 折叠头 + sticky 三子 tab + 搜索/排序 + 提案|feature 子 tab + 七态 chips 过滤接口）。填充：3.5（本目录）；任务三视图 = 3.6（`task-tab/`，经 `renderTasksTab` 槽接入）；抽屉 = 3.7（`drawer/`）；转移对话框 = 3.8；dock 注册集成 = 4.1（`sidebarRightTabs.register('dswf-overview')` + `useTabInfo` 注入）。
边界：禁 import `../session/` `../knowledge/`（依赖铁律③ 同级业务互禁）；rpc 仅经 `rpc/` client（renderer 禁 core/knowledge import——运行期边界①）。

## 任务详情弹窗（3.7 `drawer/`——m3.1 D21 抽屉退役 + D23 挂载独立）

模块化弹窗（两分块：任务内容/时间线——v11 裁决；数据 = `rpc tasks.detail` → TaskDetail DTO；m3.1 锚点迁移台账 = `drawer/README.md`）。可拖动弹窗形态（D21）：标题栏全窗拖移 + 左右缘拖宽 320–760（对侧锚定，沿袭宽度档机制）+ 单例（切任务原位换内容）+ Esc/✕ 关闭 + 几何逐开本地态（关闭即弃——裁决 #3 不记忆）。挂载（D23）= ShellHost 常驻树（`shell.overlay` 槽）经桥 `drawerTaskId` 受控——独立于 dock 概览 tab（对话中直接打开；`OverviewDockBody` 仅消费 `activeTaskId` 行高亮）。打开/关闭/切换 = props 受控（`taskId: string | null`）；「转移状态…」→ `onTransition(taskId)` 回调（3.8 对话框接线位，随弹窗挂 ShellHost；缺席禁用）；参考文档 chip → `onOpenDoc(docRel)`（dock 开 tab——弹窗保持）；挂接 pill → `onOpenSession(sessionId)`（缺席非交互呈现）。

| 文件 | 职责 |
|---|---|
| `drawer/collapse.ts` | 折叠/宽度/位置纯函数（320–760 钳制/±32 步进/左右缘对侧锚定拖宽/默认起始位[水平居中+14vh]/标题栏拖移视口钳制/0.92 视口因子）+ 会话级存储单例（折叠跨任务/关开保持——宽度/位置不入：裁决 #3 不记忆） |
| `drawer/detail-model.ts` | TaskDetail 投影纯函数：kv chips（类别只显类型/实际耗时仅 completed[XhYm 格式化]）/目标·结果推导（综合任务记录）/改动范围投影（actualFiles ↔ vars.scope + 差异摘要）/vars 负载解析（JSON 数组 ∥ 换行列表）/gate M·N 计数 |
| `drawer/coverage-bar.tsx` | 单元测试覆盖率组件（实际 N%/预期 ≥M% + 进度条填充=实际 + 阈值刻度线=预期 + 判定徽标 ✓达标/未达标/未执行；小数 0–1 → 百分比） |
| `drawer/timeline.tsx` | 块二：现状条（六型条件）+ 事件流（verb 六值穷尽路由——eval 族 submit 呈现「评估」；关联信息织入：digest/派发⟞/gate/commit 徽标/执行⟞/from→to+reason/fix 链） |
| `drawer/type-templates/` | 六族模板路由（`routing.ts` 20 值穷尽 Record + 未注册 generic 回退）+ 族模板（coding[refs→scope 双列→acceptance]/fix/doc/gate/test/eval[+M2 空态注记]/generic）+ 共享子件（`parts.tsx`） |
| `drawer/index.tsx` | `TaskDrawerBody`（纯渲染体——弹窗壳[标题栏全窗拖移手柄 + 左右缘手柄/键盘调宽 + 位置注入] + 两分块 + kv 标签行 + 转移入口）+ `TaskDrawer`（装载壳：`useTaskDetail` 拉取 + 事件推送静默重取 + Esc capture + 逐开几何本地态注入[关闭随壳卸载弃置] + 会话级折叠注入；单例——taskId props 变更不卸载原位换内容） |
| `drawer/transition-dialog.tsx` | 转移对话框（3.8）：`TransitionDialogBody`（纯渲染体——当前状态只读 + 目标态 select[仅 allowedTransitions] + 原因必填 + 拒绝留场错误条 + 终态 autoRestore 提示）+ `TransitionDialog`（装载壳：受控态 + `bindTransitionDialogEscape`[window capture——层序先于弹窗 document capture]）；确认主流程 = `confirmTransitionDialog` 纯动作（补丁流恒不含 toStatus/reason——「不清空已选」结构性成立；单飞守卫）→ `submitTaskTransition`（rpc tasks.transition 唯一通道） |

关键口径：折叠**就地更新**（块体常驻 DOM——grid 0fr/1fr 类切换，React 原地协调不重建弹窗；Hard Rule）；弹窗形态（m3.1 D21）：右缘 `position:fixed` 抽屉/左缘拖宽/滑入动画**零在场**——几何（宽/左/上）= 装载壳逐开本地态 inline 注入（关闭即弃回默认起始位[水平居中+14vh]）；类型六色按 Design System，紫/青无上游语义令牌 → 最近似映射（drawer.css 注记——SPEC CONTRADICTION 裁决）；实际范围 = actualFiles（core：files_json → commit 查找，git 失败回退记录语单元素直接呈现）；评估结果 M2 = vars.score/severity 自由文本承载（空态注记 = `data-dswf-td-eval-empty`）；转移目标态选项**禁自行计算**（恒 props 下发 TaskDetail.allowedTransitions——与服务端 transitionTargets 同源零漂移，Hard Rule；任务入参收窄 `TransitionTaskView`，TaskCard/TaskDetail 同喂——⋯ 菜单与弹窗两入口，接线 4.1）。


## 模块面（3.5 框架）

| 文件 | 职责 |
|---|---|
| `overview-model.ts` | 纯态模型：三子 tab（用户定向顺序 提案\|feature\|任务）/ 排序翻转（`nextSort`）/ 搜索参归一（`searchQueryOf`——Hard Rule 服务端承载）/ chips 过滤接口（`toggleStatusFilter`/`statusFilterParam`）/ 父行与 ov-head 展开态（多开并存）/ ov-head 摘要合成（`overviewHeadSummary`/`activeFeatureSlug`） |
| `overview-data.ts` | 数据装载：头路（`loadOverviewHead` = projects.get ∥ deriveTaskStoreDir ∥ features.list 无参 ∥ tasks.stats 四路并发）+ 列路（`fetchOverviewList` = proposals/features 子 tab 服务端过滤装载）+ `useOverviewLoad` hook（两路 effect + seq 竞态守卫）+ 落点纯函数 |
| `ov-head.tsx` | 折叠头（AC1）：默认折叠 = 项目名 + 一行摘要 + ▾；展开 4 行（工作区/文档位置/知识目录/任务清单@hash8）+ ▴ 收起 |
| `sticky-bar.tsx` | sticky 区（AC2）：三子 tab（role=tablist）+ 搜索行（官方 Input 限宽 240px + 条件清除钮 + Esc 清空）+ 排序 pill 右固定（⇅ 活跃优先 ↔ 最新创建）；IME 安全 = 搜索行稳定子树 |
| `status-chips.tsx` | 七态 chips（AC5）：contracts TASK_STATUSES 行序 + 中文标签 + 计数 + StateDot 语义映射；0 计数 disabled——过滤接口三视图统一（3.6 消费同组件同状态） |
| `proposal-tab.tsx` | 提案子 tab（AC4）：父行 ▸ 展开（slug/作者/创建/裁决/谱系——谱系 = feature.proposalSlug 反查）+ proposal.md 文档行（名称 + 状态标签紧贴 + › 行尾） |
| `feature-tab.tsx` | feature 子 tab（AC4）：父行 ▸ 展开（摘要/来源提案/任务七态分布/文档统计/创建更新）+ 文档行（`FeatureDocumentRow[]` 契约类型 props——不含提案文档） |
| `OverviewTab.tsx` | 帧装配：`OverviewFrame`（纯呈现——结构静态可测）+ `OverviewTab`（filter 本地态单一来源 + `useOverviewLoad` 胶水 + `renderTasksTab` 槽 = 3.6 三视图装载位） |

## 关键口径

- **搜索过滤服务端承载（Hard Rule）**：`searchQueryOf` 只做 trim/空归一，关键词原文经 `fetchOverviewList` 透传 `listProposals`/`listFeatures` 查询参（core `matchesSearch` + `sortByActiveThenCreated` 执行）——本目录零行本地过滤/排序逻辑；chips 同理转 `statusFilterParam` 白名单参（3.6 `listTasks` 消费）。
- **子 tab 切换清空（AC3）**：`switchSubtab` = 清空搜索 + 清空 chips + 收起全部展开态（ov-head 展开态跨子 tab 保持——路径详情与内容区正交）。
- **IME 安全（AC2）**：搜索行 = 稳定受控子树——输入值仅回流 input `value` 属性与（非空的）清除钮兄弟位；结构不变式断言（input 前键树前缀等价 + 唯一 input）见 sticky-bar.test。
- **feature 文档行 = 契约张力裁决**：ui-design 要求文档行，但 Interface 2 读面（`listFeatures → FeatureCard`）仅含 `docCount`、全契约无 feature_documents 列举 API——`FeatureTab.docs` props 携契约类型接口在场，3.5 帧不喂行（展开元数据呈现 `docCount` 统计）；提案子 tab 文档行 = `ProposalCard.relPath` 真数据。
- **提案摘要行缺席**：contracts `ProposalRow` 无 summary 字段（Interface 3 数据形状权威）——摘要在文档 tab（`DocContent.summary`）承载，行级不重复。
- **ov-head 会话计数 = 4.1 注入位**：`sessionCount` props（sessions/workspaces 账本快照）；缺席省略段（「feature · N 完成」）。
- **样式纪律**：输入/钮/标签官方件（Input/Button/Pill/Tag/StateDot）；自绘仅领域行（卡头/文档行/chips）吃令牌；dsw-raw 豁免 = 原型结构刻度（搜索限宽 240px = ui-design v8 检索刻度 / 行高 28px·24px / M3.1 卡片刻度：圆角 8·行距 6·卡头内距 8 10·meta 内距 8 12 12 24），同 sidebar/knowledge 豁免先例。M3.1 D13 卡片语言：灰底内容区（interactive-bg-hover 最近语义映射——官方亮色层令牌全白）+ 浮卡 + bg-3 meta 块 + 顶分隔线。

## e2e / 走查锚（4.1 集成 + 5.2 e2e 消费）

`data-dswf-ov-panel`（tab 体）· `data-dswf-ov-head` / `data-dswf-ov-head-toggle`（折叠头与同位翻转钮——M3.1 D20：ChevronDown 旋转 + 展开↔收起文案 + aria-expanded）· `data-dswf-ov-sticky` / `data-dswf-ov-subtab="<proposals|features|tasks>"`（子 tab）· `data-dswf-ov-searchrow` / `data-dswf-ov-searchclear`（搜索行——IME 安全断言位）· `data-dswf-ov-sort`（排序 pill）· `data-dswf-ov-stchips` / `data-dswf-ov-stchip="<status>"`（chips）· `data-dswf-ov-parent="<prop:id|feat:slug>"` / `data-dswf-ov-meta`（卡头/元数据——M3.1 D13 卡片语言：`.dswf-ov-item` 浮卡承载）· `data-dswf-ov-doc="<relPath>"`（文档行——dock 开 tab 点击位）· `data-dswf-ov-skeleton` / `data-dswf-ov-error` / `data-dswf-ov-banner` / `data-dswf-ov-retry`（三态面）。M3.1 D12：内容弹性填满整 tab——`data-dswf-ov-resize` 左缘拖拽手柄与定宽 560 管线退役（否定断言锚）。

弹窗（3.7，5.2 e2e 消费；m3.1 D21 形态变迁——完整锚台账 = `drawer/README.md`）：`data-dswf-td-drawer`（弹窗壳）· `data-dswf-td-head`（标题栏——全窗拖移手柄[m3.1 D21 新增]）· `data-dswf-td-resize="<left|right>"`（左右缘手柄——拖拽/双击/←→ 位；值化为缘侧[m3.1 D21]）· `data-dswf-td-close`（✕）· `data-dswf-td-kv`（kv 标签行）· `data-dswf-td-sect="<content|timeline>"` / `data-dswf-td-sect-body`（块头折叠——aria-expanded 断言位）· `data-dswf-td-goal` / `data-dswf-td-result`（目标/结果对行）· `data-dswf-td-ref="<docRel>"` / `data-dswf-td-ref-unresolved`（参考文档 chip——dock 开 tab 点击位）· `data-dswf-td-cov` / `data-dswf-td-cov-verdict`（覆盖率）· `data-dswf-td-note`（备注）· `data-dswf-td-eval-empty`（eval 空态注记）· `data-dswf-td-now`（现状条）· `data-dswf-td-ev-verb="<verb>"`（事件流节点）· `data-dswf-td-sess="<sessionId>"`（挂接 pill——跳会话点击位）· `data-dswf-td-commit`（commit 徽标）· `data-dswf-td-trans`（转移入口——3.8）· `data-dswf-td-skeleton` / `data-dswf-td-error` / `data-dswf-td-retry`（三态面）。

转移对话框（3.8，5.2 e2e 消费）：`data-dswf-td-tr-mask`（遮罩）· `data-dswf-td-tr-dialog`（弹体）· `data-dswf-td-tr-to`（目标态 select——选项集断言位）· `data-dswf-td-tr-reason`（原因域）· `data-dswf-td-tr-error="<kind>"`（拒绝留场错误条——reason-required/target-required/rpc）· `data-dswf-td-tr-terminal`（终态 autoRestore 提示）· `data-dswf-td-tr-cancel` / `data-dswf-td-tr-confirm`（动作行）。
