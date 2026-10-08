---
journey: "gate-and-submit-discipline"
step: 2
step-action: "未配置 AGENTS.md 态提交"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/gate-and-submit-discipline/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: gate-and-submit-discipline / Step 2: 未配置 AGENTS.md 态提交

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（worker tool 结算面非 web 表单；提交规范拒绝形态由 Outcome "nonconforming-message-rejected" 功能断言承载）; session-expired = N/A（无登录态；两态切换为工作区文件级操作，无会话凭据路径） -->

## Outcome "success"
- Preconditions: "工作区 AGENTS.md 已移除（未配置态）；另一任务由 worker 完成并自检"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "in_progress"
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "agents_md"
            value: "缺席（未配置态）"
- Input: "worker 完成任务后提交并调 submitTask（result=success；summary / gate / commit_hash 齐）"
- Output: "回退模型常识级 Conventional Commits（提交信息符合常识级规范）；submit 记录含 commit_hash（与配置态分别断言）"
- State: "任务行 in_progress → completed；task_records 新增 submit 行（含 commit_hash）"
- Side-effect: "task-submitted 事件落事件日志；工作区产生常识级规范提交"
- Invariants: "两态（配置 / 未配置）提交信息均符合规范——提交历史可审计"

## Outcome "nonconforming-message-rejected"
- Preconditions: "worker 产出的提交信息不符合约定/常识级规范"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "in_progress"
          - field: "commit_message"
            value: "失范形态（不符合 AGENTS.md 约定或常识级 Conventional Commits）"
- Input: "worker 尝试以失范信息提交"
- Output: "拒绝（提交历史可审计——不产生无规范提交）；纠正后可过"
- State: "无失范提交产生；任务结算待规范提交后落账"
- Side-effect: "none（提交纪律通道）"

## Outcome "gate-args-all-or-none"
<!-- source: inferred -->
<!-- reasoning: M3_SUBMIT_GATE_ALL_OR_NONE——gate 四布尔 all-or-none、coverage 依赖四项在场（packages/plugin-forge/src/tools/submit-task.ts:50-72）；半门提交 = 歧义报告被拒，是结算参数面的真实形状边界 -->
- Preconditions: "worker 结算时 gate 载荷只给了部分布尔（如仅 compile 与 test）或单给 coverage"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "in_progress"
          - field: "gate_payload"
            value: "部分布尔（半门形态）或缺四项仅 coverage"
- Input: "worker 调 submitTask（gate 参数不完整）"
- Output: "拒绝并提示四项须齐给（all-or-none——半门为歧义报告）；补齐后可提交"
- State: "任务保持 in_progress；无记录写入"
- Side-effect: "none（参数形状先证在 tool 面）"

## Journey Invariants
- 带 AC 任务无测试证据不得过 submit 门（错误信息含 AC 清单——自查可修）
- submit 记录恒含 commit_hash；提交信息恒符合规范（配置 AGENTS.md 从其约定 / 缺省回退模型常识级 Conventional Commits）
- gate 任务产出数字摘要（gate_json 落账）；失败不丢弃——fix 链自动恢复
- 提交历史可审计：每步自举开发都有质检环（证据 + 哈希 + 规范三件套）
