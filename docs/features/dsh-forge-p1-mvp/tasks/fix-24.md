---
id: "fix-24"
title: "Fix: 新会话输入框上方控件工作区语义→项目语义——picker 影子列项目（名/选中/切换）+ 注册时 workspace 标题对齐项目名（官方 chip/所有 title 面免费显示项目名）+「添加」接产品注册流程"
priority: "P1"
estimated_time: "5h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: hero 工作区控件 → 项目选择/切换控件

> 来源：走查人（2026-10-04）初版「选择器过滤未绑定工作区」→ 升版「**新会话的消息输入框上面的工作区选择/切换控件更改为项目选择/切换控件**」（本任务吞并初版过滤口径——项目化是其超集）。fix-18 共享真 home 使原生工作区混入 + 控件语义与产品「项目域」模型不一致。

## 官方链事实（源码实证）

- 控件两半：**触发 chip**（收起态文案）= owner 侧渲染（[ui-conversation client.js:16254-16285](../../../apps/host/profile.dev/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js) ConversationContent `heroWorkspaceRow` → `WorkspaceChip`，label = `pendingWorkspace?.title ?? sessionWorkspace?.title ?? workspaceLabel(cwd)` —— **workspace title，产品经 picker 槽改不到**）；**弹层菜单** = `conversation.hero.workspace` 槽（root/single，官方 WorkspacePickFlow 占用——items 全量账本无过滤缝）；
- owner 契约（影子面须保形）：`{open, anchorRef, selectedId(=workspaceId), onPick(workspaceId), onClose}`；
- **官方改名 API 现成**：`workspaces.rename(workspaceId, title)`（api-workspace-controller Remote `workspace/rename`，非空 title）；`create({path})` 后 title = 目录名；
- title 特例：`default-workspace` 字面量官方按本地化默认名显示（default-workspace.ts）——项目名碰撞该串属病态，忽略。

## Description

### ① 弹层菜单：picker 影子列**项目**（接缝与初版同——影子占用 `conversation.hero.workspace`）

- children 声明照抄官方（保 `conversation.hero.workspace.directoryFlow` 子洞 = fix-14/16 原生选取链不断）；
- **items = forge 项目**（`forge:projects/list` → name + 官方文件夹图标；archived 排除）；未绑定项目的工作区**天然不出现**（初版过滤口径被子集覆盖）；
- 选中映射：owner 传 `selectedId`(workspaceId) → 高亮 `project.workspaceId === selectedId` 的项目；
- 切换语义：`onPick(project.workspaceId)` —— owner 契约零变化（selectWorkspace 走官方链）；
- **「添加项目…」入口** → `openAddProjectFlow()`（UF-3：OS 选目录 → 注册 → 绑定；与 hero CTA/fix-16 同径）；
- 空项目集：仅「添加」单项 + 官方 addIsTheOnlyEntry 自动开目录流语义对齐（:1935-1943）→ 即直达产品注册流；
- 官方件复用：Menu（anchor/portal/footer/selectedId）/ Modal（错误重试）primitives，零自绘。

### ② 触发 chip 文案：**注册时 workspace 标题对齐项目名**

chip 是官方 owner 侧渲染，唯一持久路 = **让 workspace.title 本身 = 项目名**：

- core 注册链（`forge:projects/register`）：workspace 创建/挂接落定后调 `workspaces.rename(workspaceId, project.name)`（**新建与挂接既有两径都对齐**——幂等；fix-26 隔离后挂接既有 = 产品账本内工作区，改名无原生污染面；补偿链同步考虑 rename 回滚）；
- 收益全局化：官方 chip、账本 title、原生 dsh 侧显示**全部免费显示项目名**（fix-25 官方 ConversationRoot 回归后更多官方面受益）；
- 项目改名（未来 M2 功能）须联动 workspace rename —— 记录耦合口径；
- 备选否决：影子 chip（在 ConversationContent 官方渲染内部，无独立槽缝；且与 fix-25 官方回归方向冲突）。

### ③ 周边语义（P1 接受面，注记不改）

- 输入框禁用态占位文案 `t("placeholder.workspace")`（官方 locale「选择工作区」语义）——官方文案面，P1 接受，后续随 fix-25 架构落定再评估；
- agent preset 行（`conversation.hero.agentPreset`）官方件不动。

## 验收

1. 多项目 + 真 home 含原生工作区：弹层**只列项目名**（原生工作区不出现）；点项目 → 会话落在其工作区；chip 显示当前项目名；
2. 切换项目（新会话未发消息时）：chip/selectedId 随选高亮；发消息后会话归属所选项目（侧栏项目树吻合）；
3. 「添加项目…」→ 产品注册流程端到端（OS 选取 → 表单 → 注册完成 → 新项目即入弹层、chip 可选）；
4. 注册对齐：`workspaces.rename` 幂等可重入（同项目重注册不炸）；注册失败补偿链 rename 不残留（或残留无害注记）；
5. e2e：hero 控件只列项目（多项目夹具 + 假未绑定账本行）；单测：项目映射纯函数（workspaceId↔project、archived 排除、空集）+ 注册 rename 调用形状。

## Reference Files

- 官方（只读）：ui-conversation client.js:16239-16285（chip/owner 契约/inert 判定）；ui-workspace client.js:1885-2013（WorkspacePickFlow 行语言面）/:4398-4406（hero 注册 + children）/:4270-4272（renameWorkspace 消费式）；api-workspace-controller service.d.ts:116-120（create/rename 面板）；dsh-client-ui-directory-picker-native client.js:66（子洞链）
- 产品：apps/web/src/client-plugin/plugin.ts（槽位注册位）、views/sidebar/use-forge-projects.ts（项目源）、flows/add-project/flow-open.ts（添加路由）、packages/core 注册链（rename 对齐点）
- 关联：fix-26（隔离——账本天然只含产品工作区）、fix-25（官方 ConversationRoot 回归——title 对齐的全局收益面）、fix-16（添加直达链）、fix-18（共享副作用起源）

## 边界与不做

- 不动官方 chip/ConversationContent 渲染（文案经 title 对齐达成，非影子）；
- 不改账本/ledger 服务（只读消费 + 官方 rename API）；
- 项目改名联动、placeholder 官方文案 —— 注记为后续耦合/评估点，不在本任务。
