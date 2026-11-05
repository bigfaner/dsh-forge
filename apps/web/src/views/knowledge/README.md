# views/knowledge/

定位：**业务** —— 知识浏览（域树/卡片/工具栏/详情 dialog/视图装配壳）。填充：3.6（浏览主体）/ 3.7（详情 dialog）/ 3.8（知识视图挂载 + 召回跳转复用）/ knowledge-review-ui（审核 UI：多选裁决 + dialog 双模式 + 域树交互 + entryAction 通道）。
边界：禁 import `../session/`（依赖铁律③ 同级业务互禁——跨视图经工作台桥（workbench/workbench-bridge.ts）与 `rpc/` 解耦；召回 tab 跳转经桥 `openKnowledgeEntry` 驱动，不直引）。

## 模块面（3.6 浏览主体 + 3.7 详情 dialog + 3.8 视图装配壳 + 审核 UI）

| 文件 | 职责 |
|---|---|
| `browse-model.ts` | 纯派生层：过滤态机（`browseFilterReducer`）/ 查询透传（`entriesQueryOf`）/ 网格相位推导（`browseFaceState`）/ 域树行投影（`domainRows`）/ 卡片时间标签（`cardTimeLabel`——zh 切换委托 components/time-label 共享源）/ entryAction 回执文案分派（`entryActionFailureText` 封闭码集 + `entryActionNotice` 成功/失败计数） |
| `KnowledgeView.tsx` | 知识视图装配壳（3.8 立制 / 官方面板形态）：`KnowledgeBrowse` + 详情 dialog 组合，挂载位 = KnowledgePanel（官方 `main` keyed 'dswf-knowledge' 占用者，workbench/）；`openEntryId` 进出（卡片点击与召回 tab 跳转两入口共用的 dialog 打开态——态归工作台桥持有，面板经 useSyncExternalStore 订阅）；dialog 动作成功 → 浏览面重拉句柄（`bindRefetch` 归本壳持有）；无项目锚 = 引导空态（`data-dswf-knowledge-view` = 视图在场锚） |
| `use-knowledge-browse.ts` | 数据装载 hook：`forge:knowledge/browse + listEntries` ∥ `forge:projects/get`（项目名 + 知识目录位置）；过滤重拉 + 竞态守卫（seq）；typed error → `rpcUiState` 三态映射；entryAction 执行入口（`runEntryActionRequest` 单点透传）+ 多选裁决绑定（`multiActions`：态机事件 + 执行 + 动作后按当前过滤重拉）+ 域树动作绑定（move/createDomain，回执文案分派同 multiActions） |
| `KnowledgeToolbar.tsx` | 工具栏：官方 Input（关键词受控件，Esc 清空）+ 官方 Pill 范围显示（P1 项目级）+ 状态过滤 chips（官方 Pill 三片——服务端 `statusFilter` 执行，回调缺席 = 面不在场）+ 多选模式（右端「多选/取消」切换钮常驻；进入后左侧同排浮现「已选 N/共 M + 通过 + 驳回 + 全选」功能组，五钮同刻度胶囊实线描边、语义色区分；功能组仅多选模式在场；驳回弹官方 Modal 确认） |
| `DomainTree.tsx` | 左轨域目录树（~224px）：「全部域」根行 + 聚合节点行（缺省常展开 ≤3 层，节点收合 caret 旋转）；待审核徽记（官方 Tag 数字形态，按**未过滤口径**派生——独立查询面供数，不随 statusFilter 抖动）；树头「＋」新建目录（entryAction createDomain 上抛）；域行 drop 落点（卡片拖拽 move 上抛——仅具体域行是落点，hover 反馈） |
| `KnowledgeCardGrid.tsx` | auto-fill 卡片网格 + 主体四态（骨架/卡片/过滤无结果+清除入口/空库引导）+ 错误态（错误条/不可用空态）；卡片本体点击 = 开 dialog 唯一主行为（多选模式不豁免）；checkbox 仅多选模式在场（`stopPropagation` 不触发开 dialog）；StateChip 仅 unconfirmed 态可点（Tooltip「点击通过」，confirmed/superseded 严格只读）；卡片 draggable（`text/knowledge-entry` 键携 entryId） |
| `KnowledgeBrowse.tsx` | 装配：`KnowledgeBrowse`（hook 装载壳——3.8 挂知识视图槽）+ `KnowledgeBrowseBody`（纯渲染，全相位静态可测） |
| `EntryDrawer.tsx` | 详情 dialog（3.7，自持可拖移）：`EntryDrawer`（装载壳 + 拖移/拉伸机械——标题栏拖移 + 左右缘拉伸调宽 + resize）+ dialog 双模式（查看 = 三分区零改动；编辑 = 字段内联展开：首行域只读+标题同行 → 关键词 chips（双击编辑/＋新增/✕移除）→ 摘要 → 正文 AutoTextarea）+ controller hook（mode/draft/errors/busy/toast 状态机 + Esc 链式退场）+ `runEntryMetaEdit`/`runEntryVerdict`（纯异步面，回执归一永不 reject）+ `entryMetaRows`（两列元数据投影）+ `fetchEntryDetail`（纯异步面） |

## 关键口径

- **域过滤 = 目录路径前缀匹配**（Hard Rule）：`domainPrefix` 原样透传 `listEntries`，前缀语义在 core 服务面执行——本模块零客户端过滤语义、零其它过滤维度（statusFilter 同服务端执行）。
- **关键词细分** = keywords 维度（服务端执行）；工具栏输入原样传递，未激活（空白）不出查询键。
- **热度徽章 = card.heat 原样呈现**（AC3）：`listEntries` 单表同源 join（与 `heatByEntry` 同口径）——UI 零再推导、不另调 heat 通道；三方一致断言（事件 ↔ tab ↔ 热度）归 3.8/4.2 e2e。
- **缓存先行（AC5）**：过滤重拉/重试期旧卡片保持可见（`aria-busy` 标注）；首装零数据 = 骨架（索引缺失静默重建期在 core 侧，本侧表现为在途等待）；跨项目切换清场（旧项目卡片不残留）；重试携过滤在场 → 全量装载后追过滤视图（不打散过滤语义）。
- **网格相位**：`browseFaceState` 纯函数（error > cards > skeleton > no-results/empty-library）；error 相位内三态分流（`rpcUiState`：empty-state → 不可用空态；error-bar/banner → 错误条）归 `KnowledgeCardGrid`。
- **entryAction 通道（第六通道）**：`forge:knowledge/entryAction` 单通道收敛全部人工动作——confirm / reject（批量，逐条回执 `entryId + outcome + code`）、move / editMeta（单条，多条拒收）、createDomain（树级）；回执归一（永不 reject），文案分派归 `entryActionFailureText`/`entryActionNotice`（封闭 code 集是 UI 文案分派键）；幂等重放 = already-confirmed 成功等价回执；动作成功后按当前过滤重拉（nonce 递增走既有 seq 守卫）。
- **dialog 双模式（对齐专家 detail-dialog 同型机制）**：标题栏右侧按钮组（查看态 = [编辑]，unconfirmed 另显 通过/驳回，+ ✕；编辑态 = [保存] + ✕；实线描边胶囊钮、语义色区分）；Esc 链式退场（编辑 → 查看 → 关闭）；保存走 editMeta（域不可编辑——改域唯一入口 = 域树拖拽）；校验/回执错误留 dialog（`dswf-dlg-err` 同型行）；驳回 = 官方 Modal 确认框（清单+数量）从 dialog 之上正确叠层（官方 Modal 栈）。
- **多选模式**：通过/驳回仅多选模式在场；批量 confirm/reject 与 dialog 标题栏、卡片 chip 点击同通道收敛（entryAction，副作用语义逐位一致）；驳回 = 条目删除（不可逆）——dialog 场景驳回成功即关闭 dialog。
- **域树徽记口径**：待审核徽记 = 「哪里有待审核」导航提示，按未过滤口径派生（browse 聚合不带 statusFilter 的独立查询面供数），与多选功能组计数（过滤结果集口径）作用域不同、各自所见即所得。
- **样式纪律**：输入/工具栏件官方（Input/Pill/Button/Tag/Checkbox）；自绘仅限领域组件（域树行 `dswf-kn-dom-row` / 知识卡片 `dswf-kn-card` / dialog 自持皮 `dswf-kn-dialog`）且吃令牌；dsw-raw 豁免 = 原型结构刻度（左轨 224px / 域树行 24px / 层级缩进 13px·层 / 骨架卡高），同 2.7 sidebar 豁免先例。

## e2e / 走查锚（3.8 装配 + 4.2 飞轮 e2e + knowledge-review-ui 旅程消费）

`data-dswf-kn-browse`（主体）· `data-dswf-kn-toolbar` · `data-dswf-kn-tree` / `data-dswf-domain="<path>"`（域行）/ `data-dswf-kn-dom-add`（树头新建目录）/ `data-drag-over`（拖拽落位 hover 反馈）· `data-dswf-kn-cards` / `data-dswf-entry="<id>"`（卡片；热度一致性断言选择器 = `[data-dswf-entry] .dswf-heat-badge`）/ `data-dswf-kn-chip-confirm="<id>"`（unconfirmed chip 点击通过）/ `data-dswf-kn-card-check`（多选 checkbox）· `data-dswf-kn-skeleton`（加载/重建骨架——域前缀化，与 className 对齐）· `data-dswf-clear-filters`（清除过滤入口）· `data-dswf-kn-error` / `data-dswf-kn-retry`（错误面）· `data-dswf-kn-statuschip="<value>"`（状态过滤 chips）· `data-dswf-kn-multiselect` / `data-dswf-kn-multiselect-toggle`（多选切换）/ `data-dswf-kn-selcount`（已选计数）/ `data-dswf-kn-act-confirm` / `data-dswf-kn-act-reject` / `data-dswf-kn-act-selectall`（功能组三动作）。

详情 dialog：`data-dswf-kn-dialog`（可拖移弹窗壳——在场即打开态）· `data-dswf-kn-dialog-head`（标题栏——拖移手柄 + 动作钮）· `data-dswf-kn-dialog-actions` 内 `data-dswf-kn-dialog-save` / `-edit` / `-confirm` / `-reject`（模式化按钮组）· `data-dswf-kn-dialog-close`（✕ 关闭位）· `data-dswf-kn-dialog-resize="[left|right]"`（缘侧拉伸）· `data-dswf-kn-summary`（摘要块）/ `data-dswf-kn-meta` + `data-dswf-kn-meta-row="<key>"`（两列元数据五行）/ `data-dswf-kn-body`（正文区——该区内不得出现 frontmatter 字段/摘要/关键词字面量）· `data-dswf-kn-dialog-skeleton`（详情拉取骨架）· `data-dswf-kn-dialog-retry`（错误面重试）· `data-dswf-kn-edit-chips` / `data-dswf-kn-kwchip="<keyword>"`（编辑态关键词 chips）· `data-dswf-kn-toast`（动作回执提示）。

## 关键口径（3.7 详情 dialog）

- **查看模式三分区呈现序 = 摘要块（summary 先行：条目标题 + 摘要）→ 两列元数据（域/状态/关键词/作者/更新时间；关键词整行，其余半行两列）→ Markdown 正文**（经 `MarkdownDoc` 全量渲染——variant=body + CodeToolbar labels；mermaid fence 渲染为官方代码块后由 DOM 增强器出图；Hard Rule：dialog 内禁裸 MarkdownText）。
- **编辑模式字段序 = 域（只读）+ 文档名称/标题（同行）→ 关键词 chips → 摘要（≤3 行）→ 正文**（AutoTextarea 随内容增高；dialog 内尽量撑满）。
- **正文按需读取**：打开（entryId 变更）才拉 `forge:knowledge/entryDetail`，全库通道（browse/listEntries/heat）零调用；竞态守卫同浏览面（seq 序号）。
- **关闭回浏览上下文**：dialog 不持有过滤态（旁挂层）；Esc 捕获阶段拦截（dialog 先于工具栏清空——`stopPropagation` 防「关 dialog 连带清空关键词」）；✕/Esc 均 `onClose` 上抛装配方。
- **机械形态**：自持可拖移 dialog——标题栏整头拖移 + 左右缘拉伸调宽 + resize；高度机制对齐专家 detail-dialog（height auto + min-height 320px + max-height 92%，内容驱动）；宽 770px；层级/抬升吃官方浮层令牌（`--dsh-dockkit-float-layer` 回退 60 + `--dsw-elevation-prominent`）。
- **错误面**：typed error 经 `rpcUiState` 三态（ENTRY_NOT_FOUND/INDEX_STALE/目录非法 → 不可用空态；其余 → 错误条），均带重试；entryAction 回执失败 = code 分派文案留 dialog（不关不跳转）。

## 残留（按任务依赖序）

- 实机 e2e 数据面（真数据卡片/dialog/热度一致性三方断言/索引静默重建走查）= host 通道装配转正（`knowledge-integration.spec.ts` 组二，SMOKE-LEDGER §5）+ dogfood（4.2）；本任务面 = 模块契约面：纯函数 + 纯异步面 + 全相位静态渲染 + 结构 pin。
- knowledge-review-ui 行为链 e2e 取证（拖拽/新建目录/徽记/批量链旅程）= 测试债务任务（走查报告证据索引在案）。
- 统计/召回日志页签、「从会话抽取」chip = M4+（PRD UF-6 排除项）。
