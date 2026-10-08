---
journey: "gate-and-submit-discipline"
step: 3
step-action: "gate 类型任务派发执行并提交"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/gate-and-submit-discipline/journey.md
anchors:
  web:
    page: "概览 · 任务子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（task-tab 工具栏「派发」按钮）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: gate-and-submit-discipline / Step 3: gate 类型任务派发执行并提交

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（派发入口为状态门控按钮非表单；gate 摘要拒绝形态由 Outcome "gate-summary-missing" 功能断言承载）; session-expired = N/A（无登录态；gate 失败恢复由 fix 链机制承载，无会话凭据路径） -->

## Outcome "success"
- Preconditions: "gate 类型任务在库（task_type=gate、pending 且依赖满足）；git 可提交"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_type"
            value: "gate"
          - field: "task_status"
            value: "pending（可派发）"
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "git_available"
            value: true
- Input: "派发一个 gate 类型任务（如契约面/审计类检查）并待其结算"
- Output: "gate 任务可派发执行；提交时 gate_json 承载数字摘要落账（执行记录含量化结果——compile/fmt/lint/test 布尔与可选 coverage 小数）"
- State: "任务行推进至 completed；task_records 新增 submit 行（gate_json 结构化负载 + commit_hash）"
- Side-effect: "task-submitted 事件落事件日志；gate worker 携带矩阵 ✓ 列工具（gate 族：jobs 长跑可用）"
- Invariants: "gate 任务产出数字摘要（gate_json 落账）"

## Outcome "gate-failure-fix-chain"
- Preconditions: "gate 任务执行结果为失败"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_type"
            value: "gate"
          - field: "task_status"
            value: "in_progress（执行失败形态）"
- Input: "gate 失败后观察管线行为"
- Output: "走 fix 链自动恢复（block_source 单事务 + 恢复钩子——M2 机制回归断言）；失败不丢弃、不静默"
- State: "gate 任务 blocked（reason 落审计）；fix 任务入链；修复完成后源任务自动恢复"
- Side-effect: "fix 链审计行与事件落库"

## Outcome "gate-summary-missing"
<!-- source: inferred -->
<!-- reasoning: M3_SUBMIT_GATE_DOOR——task_type=gate ∧ success 结算缺 gate 载荷即 ERR_GATE_SUMMARY_REQUIRED（packages/core/src/forge/tasks/errors.ts:296-308）；数字摘要门是 gate 任务类型的专属结算边界 -->
- Preconditions: "gate 类型任务结算 result=success 但未带 gate 载荷"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_type"
            value: "gate"
          - field: "task_status"
            value: "in_progress"
          - field: "gate_payload"
            value: "缺席（结算未携带）"
- Input: "worker 调 submitTask（result=success、无 gate 载荷）"
- Output: "拒绝（type=gate 任务结算必带 gate 载荷——数字摘要必带落 gate_json）；补摘要后可提交"
- State: "任务保持 in_progress；无记录写入"
- Side-effect: "tool-error 事件落事件日志"

## Outcome "blocked-submit-skips-doors"
<!-- source: inferred -->
<!-- reasoning: M3_SUBMIT_AC_GATE/M3_SUBMIT_GATE_DOOR 双门均仅挂 success 结算（blocked submit 不经——C4 失败分诊走 fix 链；packages/core/src/forge/tasks/submit.ts:60-70 注记）；受阻径只要求 reason，是双门边界的行为分叉 -->
- Preconditions: "gate 类型任务（或带 AC 任务）执行受阻，worker 走 blocked 结算（reason 在场）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_type"
            value: "gate（或 ac_json 非空）"
          - field: "task_status"
            value: "in_progress"
          - field: "blocked_reason"
            value: "在场（受阻有因）"
- Input: "worker 调 submitTask（result=blocked、reason 在场、无 gate 载荷/测试证据）"
- Output: "双门不拦（blocked submit 不经 AC 证据门与 gate 摘要门）；任务 blocked 落审计（reason 单源）"
- State: "任务行 in_progress → blocked；submit 记录含 reason（可附失败 gate 载荷原样落账）"
- Side-effect: "fix 链承接（follow-up 派发面）"

## Outcome "task-not-found"
<!-- source: inferred -->
<!-- reasoning: submitTask 任务定位 = slug + local_id 两显式参（UNIQUE(slug, local_id) 行解析——packages/plugin-forge/src/tools/submit-task.ts:1-8；resolveTaskRef 未命中即拒绝）；错键结算是资源访问步的真实边界 -->
- Preconditions: "worker 以不存在的任务键（容器 slug 或 local_id 错误）发起结算"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "natural_key"
            value: "与结算入参不同的在库键（入参键未命中）"
- Input: "worker 调 submitTask（slug/local_id 未命中在库行）"
- Output: "拒绝并回报任务未命中（资源定位失败——不落任何记录）"
- State: "库状态不变"
- Side-effect: "tool-error 事件落事件日志"

## Journey Invariants
- 带 AC 任务无测试证据不得过 submit 门（错误信息含 AC 清单——自查可修）
- submit 记录恒含 commit_hash；提交信息恒符合规范（配置 AGENTS.md 从其约定 / 缺省回退模型常识级 Conventional Commits）
- gate 任务产出数字摘要（gate_json 落账）；失败不丢弃——fix 链自动恢复
- 提交历史可审计：每步自举开发都有质检环（证据 + 哈希 + 规范三件套）
