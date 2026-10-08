---
journey: "overview-entry-new-session"
step: 4
step-action: "任务子 tab 诊断失败 toast 点「发送给 agent」"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/journey.md
anchors:
  web:
    page: "概览 · 任务子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（task-tab 工具栏「诊断」+ DiagToast）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: overview-entry-new-session / Step 4: 任务子 tab 诊断失败 toast 点「发送给 agent」

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（旅程裁决：诊断面无表单字段校验——近似物 = 状态门控/负向可用性，由 Outcome "no-diag-entry-for-nonfailed" 与 "blitz-container-no-diag-button" 承载）; session-expired = N/A（旅程裁决：本地化 = 草稿/会话连续性，承载步 = Step 1e——本步为自动发送例外面） -->

## Outcome "success"
- Preconditions: "当前 feature 容器子图存在结构违规（Setup 夹具——依赖环形态，如 1.3 依赖 1.4 依赖 1.3）；任务子 tab 工具栏「诊断」按钮可达（feature 容器专属）"
  fixture_spec:
    entities:
      - entity_type: "Feature"
        min_count: 1
      - entity_type: "Task"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "dependency_edges"
            value: "含环（结构违规子图——诊断失败确定性触发）"
- Input: "在任务子 tab 点工具栏「诊断」（feature 容器），在失败 toast 中点「发送给 agent」"
- Output: "打开新会话并自动发送格式化失败诊断——@docs/features/ 加 feature 标识目录行打头 → 所属行 → 摘要行 → 阶段行 → 诊断行（validateFeatureTasks 失败 + 五类检查逐行、叉标项含任务键与违规描述）→ 请求行（请排查修复）；会话模式 = 远征（工具栏「诊断」为 feature 容器专属——本路径无突击分支）"
- State: "新会话创建（远征）；诊断消息自动发送（autosend 例外成员）"
- Side-effect: "会话编排创建 + 自动发送（诊断两路之一）"
- Invariants: "自动发送例外清单收口——feature 子图诊断为成员之一"

## Outcome "no-diag-entry-for-nonfailed"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 4b［动作区无「诊断失败」按钮（仅失败任务出现）；详情其余动作照常在场——观察面有效性对照（负向可用性 + 阳性对照）］ -->
- Preconditions: "任务状态非 blocked / rejected（如 pending / completed）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "pending 或 completed（非失败态）"
- Input: "展开该任务行内详情查看动作区"
- Output: "动作区无「诊断失败」按钮（仅失败任务出现）；详情其余动作照常在场（观察面有效性对照）"
- State: "库状态不变（负向可用性观察）"
- Side-effect: "none"

## Outcome "task-failure-diag-autosend"
- Preconditions: "某任务状态 = blocked（如 fix 链源任务）且有失败记录（Setup）；任务级诊断入口由任务状态触发"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "blocked"
          - field: "failure_records"
            value: "在场（失败记录可水化）"
- Input: "展开详情点「诊断失败」查看失败摘要 toast，再点「发送给 agent」（点击落在 5 秒 toast 窗口内）"
- Output: "失败摘要 toast（状态 + 原因 + 最近记录 + 任务键，5 秒自消）；发送 = 新会话自动发送格式化失败诊断（@docs/features 或 proposals/ 加标识目录行打头 + 所属 + 摘要 + 阶段 + 任务键 + 失败记录逐行 + 修复请求）；会话模式 = 任务容器对应模式（feature 容器 → 远征 / 突击提案直挂任务 → 突击）"
- State: "新会话创建（容器对应模式）；诊断消息自动发送"
- Side-effect: "会话编排创建 + 自动发送（诊断两路之一）；窗口过期后可重开——「诊断失败」按钮常驻 blocked/rejected 详情动作区，重展开详情再点即重开结果 toast"
- Invariants: "窗口过期重开通道在场（按钮常驻）"

## Outcome "diag-success-toast"
- Preconditions: "feature 容器子图五类检查全绿（健康容器）"
  fixture_spec:
    entities:
      - entity_type: "Feature"
        min_count: 1
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "dependency_edges"
            value: "无违规（五类检查全绿）"
- Input: "点工具栏「诊断」"
- Output: "成功 toast「子图健康 ✓」1 秒自动消失；无「发送给 agent」按钮、不新开会话（成功路径无自动发送）"
- State: "库状态不变；无新会话"
- Side-effect: "none（toast 出现/消失双相为观察面）"

## Outcome "blitz-container-no-diag-button"
- Preconditions: "容器 pill 选中突击提案容器（任务直挂）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "blitz"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Proposal"
- Input: "查看任务子 tab 工具栏右簇"
- Output: "无「诊断」按钮（validateFeatureTasks 为 feature 域校验——突击容器不在面）；「派发」按钮与任务级「诊断失败」入口仍可用（阳性对照——工具栏其余控件在场）"
- State: "库状态不变（负向可用性 + 阳性对照）"
- Side-effect: "none"
- Invariants: "feature 子图诊断为 feature 容器专属 → 恒远征（Step 4/4e 口径收窄）"

## Journey Invariants
- 自动发送例外清单收口 = 诊断两路（feature 子图诊断 + 任务失败诊断）+ 派发指令；「打开新会话」预填一律不自动发送
- 模式路由恒 = 容器对应模式：提案渠道 → 提案 mode（无溯源 → 不切换）；feature 渠道 → 固定远征；任务失败诊断发送与派发新会话 → 任务容器对应模式；feature 子图诊断为 feature 容器专属 → 恒远征
- 消息体以 @path 引用容器目录锚；不含模式；派发指令例外 = 「/run-tasks 加容器标识」单行最小消息
- 派发按钮语义恒定：未终态任务在场亮起 / 全部终态置灰；执行中在场跳转既有派发会话（不新建、不重发）
