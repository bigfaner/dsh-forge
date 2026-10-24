---
feature: "expert-squad"
journey: "panel-detail-dialog"
risk_level: "High"
module: "web"
sources:
  - ".forge/docs/features/expert-squad/prd/user-stories.md#US3"
  - ".forge/docs/features/expert-squad/prd/user-stories.md#US13"
  - ".forge/docs/features/expert-squad/prd/user-stories.md#US6"
  - ".forge/docs/features/expert-squad/ui/ui-design.md#F2"
  - ".forge/docs/features/expert-squad/design/tech-design.md#§10"
generated: "2026-10-23"
---

# Journey：专家详情 Dialog · 查看/编辑双模式 → 变更落盘 → 启停 → 关闭联动

**用户故事**：US3 面板详情查看与编辑；US13 查看专家详情；US6 禁用专家（面板呈现半）。

## 搭建前置条件

- 专家团插件已装载（client bundle 注册 main keyed `expert-squad` 面板）；面板已激活且卡片网格呈数据态（F1 旅程正路）。
- 专家目录中存在启用与禁用的专家若干（夹具档案 frontmatter：name/title/description/tools/skills + 人设正文）。
- 详情 Dialog 变更缝在线：POST `/api/expert-squad/update` / `enable` / `disable`（routes.ts 精确路由族）。

## Happy Path

1. **用户点击某启用专家卡片** → 预期：详情 Dialog 打开（查看态）——头部状态灯 on + 名称 + 英文标识 chip（等宽）+ [编辑] 钮 + ✕ 钮；背景遮罩在场。
2. **用户浏览查看态分段** → 预期：自上而下依次为「岗位 · 启用中」meta → 「简介（何时委派我）」段 → 人设（Markdown 分块渲染：标题/加粗/行内代码/列表，记号不外露）→ 「工具白名单（子会话强制生效）」chips → 「技能标签」chips；不暴露 frontmatter 技术细节。
3. **用户点 [编辑] 切编辑态** → 预期：字段集预填——岗位 Input、简介 textarea（1 行起步）、人设 textarea（6 行起步）、工具白名单 multi-select（候选固定清单）、技能标签 multi-select（候选=全目录技能汇总、可新增，工具上技能下）；头部钮变 [保存]；**英文标识 name 不可编辑（键正本不入草稿）**。
4. **用户修改岗位/简介/人设/白名单/技能并点 [保存]** → 预期：update 路由落盘成功 → 回查看态 + Toast「档案已保存（热刷新生效）」；Dialog 内专家换新呈现新值；**背后列表卡片即时同步**（patchEntry，不待轮询）。
5. **用户点底部 [禁用]** → 预期：disable 路由即时生效 → 状态灯变 off、meta 变「已禁用」、底部钮变 [启用]、Toast「<名称> 已禁用」；关闭后列表卡片同步降透明。再点 [启用] 对称恢复。
6. **用户以 ✕ 关闭 Dialog** → 预期：Dialog 退场、遮罩消失，面板恢复卡片网格（列表状态保留），无残留草稿态。

## 边界用例

1. **（引步骤 4）保存校验·空岗位**：分叉前置 = 编辑态清空岗位字段后点 [保存] → 字段级错误「岗位不能为空」（`.dswf-dlg-err`），停留编辑态，update 不发出、档案不落盘。
2. **（引步骤 4）保存校验·裸 `{{`**：分叉前置 = 人设 textarea 含裸 `{{` 后点 [保存] → 字段级错误「人设含裸 {{ ——不被允许」，停留编辑态，不落盘。
3. **（引步骤 4）update 通道失败**：分叉前置 = update 路由非 2xx/拒绝 → 停留编辑态，Toast「保存失败：<错误信息>」，档案与草稿不变；修正后可再次保存成功。
4. **（引步骤 5）启停通道失败**：分叉前置 = enable/disable 路由拒绝 → Toast「启停失败：<错误信息>」，启用态不变（灯、meta、按钮、卡片均不切换）。
5. **（引步骤 1）禁用专家打开详情**：分叉前置 = 被点卡片为禁用专家 → Dialog 正常打开：状态灯 off、meta「· 已禁用」形态、底部钮呈 [启用]。
6. **（引步骤 6）三关闭路径等价**：分叉前置 = Esc 键 / 点遮罩 / 点 ✕ 三种触发 → 均关闭 Dialog 并恢复列表；编辑态草稿一并丢弃（重开为查看态新快照）。

## Journey Invariants

- Dialog 模式互斥：同一时刻只呈查看态或编辑态；编辑态由查看态经 [编辑] 进入，成功保存或关闭后必回查看态或退场。
- **name 是键正本**：任何编辑操作不可修改英文标识（不入草稿、不随 update 变更）；所有变更路由以 name 键定址。
- 校验失败零落盘：空岗位与裸 `{{` 只产生字段级错误并停留编辑态，不发 update 请求。
- busy 防重：保存/启停在途时 [保存]/[禁用/启用] 钮禁用，零并发双写。
- 变更成功必联动：update/enable/disable 成功后 Dialog 专家与背后列表卡片经 patchEntry 原子换新（不待 5s 轮询）；失败则两侧均不变。
- Toast 是唯一反馈通道：成功（热刷新/启停）与失败（保存失败/启停失败）均经 `role=status` Toast 透出，零 alert。
