---
journey: "blitz-direct-chain"
step: 4
step-action: "worker submit 全绿"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/blitz-direct-chain/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: blitz-direct-chain / Step 4: worker submit 全绿

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（worker 结算面为 tool 参数校验非 web 表单；AC 证据拒绝形态由 Outcome "ac-evidence-missing" 承载——功能断言同门）; session-expired = N/A（无登录态；结算状态落库即时，无会话凭据路径） -->

## Outcome "success"
- Preconditions: "任务已被 worker 领取（in_progress）；改动完成且自检通过（gate 四项齐备；带 AC 任务已附测试证据）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "in_progress"
          - field: "mode"
            value: "blitz"
- Input: "worker 依次执行任务并调 submitTask 结算（result=success；summary 必带；gate 四布尔齐备；commit_hash 携带）"
- Output: "各任务落账（completed）；执行记录含 summary / files / gate / commit_hash；无需人工介入"
- State: "任务行 in_progress → completed；概览三视图在写入返回后单次重取即见新值（M2 即时口径回归）"
- Side-effect: "task-submitted 事件（worker 自身会话 id）写入事件日志；执行记录与提交哈希入自身库"
- Invariants: "submit 记录恒含 commit_hash；actor 恒为 plugin-tool"

## Outcome "ac-evidence-missing"
- Preconditions: "某任务带 AC 清单（ac_json 非空），worker submitTask 时缺测试证据（gate.test 不为真）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "in_progress"
          - field: "ac_json"
            value: "非空清单（至少一条验收项）"
- Input: "worker 调 submitTask 提交（result=success，无 gate.test 通过证据）"
- Output: "拒绝且错误信息含 AC 清单（逐行列出验收项——自查可修）；补齐证据后方可过门"
- State: "任务状态不变更（保持 in_progress）、不落部分审计（单事务全成全败）"
- Side-effect: "tool-error 事件落事件日志"
- Invariants: "gate 纪律不折扣——突击链不开全套 SDD 仪式 ≠ 免检（M2/M3 同门）"

## Outcome "concurrent-browsing-single-refetch"
- Preconditions: "概览页签处于打开状态且用户正在浏览（读路径活跃——并发观察场景，与 worker 结算动作同场）；派发链有写入动词（claim / submit）即将发生"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 2
        field_constraints:
          - field: "task_status"
            value: "in_progress 与 pending 混合（写入动词将发生）"
      - entity_type: "Project"
        min_count: 1
- Input: "派发链写入动词发生的同时用户持续浏览概览三视图（列表 / DAG / 泳道）"
- Output: "tool 写入与 UI 读取无锁竞争；列表在写入返回后单次重取即见新值（即时判据成立，无 watch / 无同步延迟）"
- State: "库状态由写入动词正常推进；读面不阻塞、不串话"
- Side-effect: "none（读路径零副作用）"

## Journey Invariants
- 突击链 gate 纪律不折扣：单写路径 / 执行记录 / 提交规范 / 验证门原样
- 任务语义由 mode 溯源（blitz）决定：整数 ID / 无 stage-gate / eval 门豁免
- 突击无 feature 阶段：提案与任务之外无中间层
- 概览三视图即时口径：写入返回后单次重取即见新值（数据直读每工作区库，无 watch / 回流 / 快照同步）
