---
journey: "overview-entry-new-session"
step: 5
step-action: "工具栏「派发」按钮（存在未终态任务）"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/journey.md
anchors:
  web:
    page: "概览 · 任务子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（task-tab 工具栏「派发」按钮——右簇最右端）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: overview-entry-new-session / Step 5: 工具栏「派发」按钮（存在未终态任务）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（旅程裁决：派发按钮为状态门控非字段校验——置灰 + tooltip = 状态门控反馈，承载 Outcome "all-terminal-disabled"）; session-expired = N/A（旅程裁决：本地化 = 草稿/会话连续性，承载步 = Step 1e——本步为自动发送例外面） -->

## Outcome "success"
- Preconditions: "当前容器存在未处于终态的任务（待办/执行中/受阻/挂起）且无正在执行的任务"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "pending / blocked / suspended（未终态且非执行中）"
- Input: "点工具栏「派发」按钮"
- Output: "按钮亮起可点；点击 → 新开一个派发会话（模式 = 容器对应模式：feature → 远征 / 突击提案 → 突击）并自动发送派发指令——「/run-tasks 加容器标识」单行最小消息（只给 dispatchTask 必要信息 = contextSlug；不含所属/摘要/阶段/任务池快照/请求行——v23 裁决）"
- State: "新派发会话创建（容器对应模式）；派发指令自动发送（autosend 例外成员）"
- Side-effect: "会话编排创建 + 自动发送（派发指令）"
- Invariants: "派发指令 = 单行最小消息（唯一必要参数 = contextSlug）"

## Outcome "all-terminal-disabled"
- Preconditions: "当前容器任务全部处于终态（completed / skipped / rejected）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "completed / skipped / rejected（全部终态）"
- Input: "查看并尝试点击工具栏「派发」按钮"
- Output: "按钮置灰不可点（深灰实底 + tooltip 说明）；不新开派发会话、不发送派发指令"
- State: "无新会话、无发送（状态门控拒绝）"
- Side-effect: "none"

## Outcome "running-task-jumps-session"
- Preconditions: "当前容器有正在执行的任务（其派发会话在场——task_session_links 挂接）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "in_progress（执行中——最新接管者）"
      - entity_type: "TaskSessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
- Input: "点工具栏「派发」按钮"
- Output: "跳转到对应的派发会话（该任务最新派发挂接——task_session_links/claim 记录）：不新建会话、不重复发送、不切模式"
- State: "会话切换落点 = 既有派发会话（活动会话面切换）"
- Side-effect: "none（跳转复用）"

## Outcome "no-single-task-execution-entry"
- Preconditions: "任务子 tab 任意视图与任务详情在场（观察态——仅核查动作区控件面，不触发派发按钮）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
- Input: "查看任务行 / 详情动作区寻找单任务执行入口"
- Output: "无单任务直接执行入口（不支持指定单个任务直接执行——必须按 DAG 依赖顺序领取执行）；视图切换/详情展开等其余动作照常在场（观察面有效性对照）"
- State: "库状态不变（负向可用性 + 阳性对照）"
- Side-effect: "none"
- Invariants: "dispatchTask 就绪选择 = 机械序（全库盲选）——单任务直执行不在产品面"

## Journey Invariants
- 自动发送例外清单收口 = 诊断两路（feature 子图诊断 + 任务失败诊断）+ 派发指令；「打开新会话」预填一律不自动发送（等待用户明确意图）
- 模式路由恒 = 容器对应模式：提案渠道 → 提案 mode（无溯源 → 不切换）；feature 渠道 → 固定远征；任务失败诊断发送与派发新会话 → 任务容器对应模式；feature 子图诊断为 feature 容器专属 → 恒远征（Step 4/4e 口径收窄）
- 消息体以 @path 引用容器目录锚（@docs/proposals/加标识目录 / @docs/features/加标识目录）；不含模式（由会话预设承载）；派发指令例外 = 「/run-tasks 加容器标识」单行最小消息（唯一必要参数 = contextSlug）
- 派发按钮语义恒定：未终态任务在场亮起 / 全部终态置灰；执行中在场跳转既有派发会话（不新建、不重发）
