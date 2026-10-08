---
journey: "gate-and-submit-discipline"
step: 1
step-action: "worker 完成任务自检后提交（AGENTS.md 配置态）"
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

# Contract: gate-and-submit-discipline / Step 1: worker 完成任务自检后提交（AGENTS.md 配置态）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（worker tool 结算面非 web 表单——拒绝形态由功能断言 Outcome 承载：ac-evidence-missing / summary-missing / blocked-reason-required 同门）; session-expired = N/A（无登录态；结算状态落库即时，无会话凭据路径） -->

## Outcome "success"
- Preconditions: "任务已被 worker 领取（in_progress）；工作区已配置 AGENTS.md（含 commit 约定）；任务改动与自检完成（AC / run-tests 配方）"
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
            value: "在场（含 commit 约定——配置态）"
- Input: "worker 完成任务改动与自检后提交并调 submitTask（result=success；summary 必带；gate 四项齐备；带 AC 任务附测试证据；commit_hash 携带）"
- Output: "提交信息从其约定（AGENTS.md 约定优先）；submitTask 落账（completed）；submit 记录含 commit_hash"
- State: "任务行 in_progress → completed；task_records 新增 submit 行（files / gate / commit_hash 结构化负载；actor=plugin-tool）"
- Side-effect: "task-submitted 事件落事件日志；工作区产生符合约定的提交"
- Invariants: "submit 记录恒含 commit_hash；提交信息恒符合规范（配置态从 AGENTS.md 约定）"

## Outcome "ac-evidence-missing"
- Preconditions: "任务带 AC 清单（ac_json 非空），worker 未附任何测试证据"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "in_progress"
          - field: "ac_json"
            value: "非空清单（至少一条验收项）"
- Input: "worker 调 submitTask 提交（result=success，缺测试证据——gate.test 不为真）"
- Output: "拒绝且错误信息含 AC 清单（逐行列出验收项——自查可修）；任务状态不变更、不落部分审计"
- State: "任务保持 in_progress；无 submit 记录写入（单事务全成全败）"
- Side-effect: "tool-error 事件落事件日志"
- Invariants: "带 AC 任务无测试证据不得过 submit 门（Hard Rule 禁裸错误码——错误信息人话 + 清单）"

## Outcome "invalid-transition-rejected"
- Preconditions: "任务实际状态与 submit 假设不符（如已被转移出 in_progress——pending / blocked / 终态）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "非 in_progress（如 blocked 或 completed）"
- Input: "worker 调 submitTask 结算（from 假设 in_progress）"
- Output: "拒绝并回报校验提示（from 匹配口径——非法状态转移）；库状态不被破坏（M2 口径回归）"
- State: "任务状态保持原值；无记录写入"
- Side-effect: "tool-error 事件落事件日志"

## Outcome "summary-missing-rejected"
<!-- source: inferred -->
<!-- reasoning: M3_SUBMIT_SUMMARY_REQUIRED——success 结算空摘要先于转移校验拒绝（packages/core/src/forge/tasks/errors.ts:252-261）；带 AC 任务缺证据之外的又一真实提交边界（执行摘要为审计负载） -->
- Preconditions: "任务为普通任务（无 AC 清单或已附证据），worker 提交 result=success 但 summary 为空"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "in_progress"
          - field: "ac_json"
            value: "空或 NULL（AC 门不触发）"
- Input: "worker 调 submitTask（result=success、summary 空白）"
- Output: "拒绝（success 结算需要执行摘要——空摘要拒绝）；补摘要后可提交"
- State: "任务保持 in_progress；无记录写入"
- Side-effect: "tool-error 事件落事件日志"

## Outcome "blocked-reason-required"
<!-- source: inferred -->
<!-- reasoning: M3_SUBMIT_BLOCKED_REASON——result=blocked 空因拒绝、reason 落 append-only 记录为审计单源（packages/core/src/forge/tasks/submit.ts:57-59）；受阻结算与成功结算同面的必填分叉 -->
- Preconditions: "任务执行受阻，worker 走 blocked 结算径"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "in_progress"
          - field: "blocked_reason"
            value: "结算入参 reason 空白（受阻但无因）"
- Input: "worker 调 submitTask（result=blocked、reason 空白）"
- Output: "拒绝（blocked 结算需要 reason——空因拒绝）；补因后可提交"
- State: "任务保持 in_progress；无记录写入（reason 为审计单源，不写列）"
- Side-effect: "tool-error 事件落事件日志"

## Journey Invariants
- 带 AC 任务无测试证据不得过 submit 门（错误信息含 AC 清单——自查可修）
- submit 记录恒含 commit_hash；提交信息恒符合规范（配置 AGENTS.md 从其约定 / 缺省回退模型常识级 Conventional Commits）
- gate 任务产出数字摘要（gate_json 落账）；失败不丢弃——fix 链自动恢复
- 提交历史可审计：每步自举开发都有质检环（证据 + 哈希 + 规范三件套）
