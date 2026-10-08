---
journey: "blitz-direct-chain"
step: 3
step-action: "run-tasks 派发"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/blitz-direct-chain/journey.md
anchors:
  web:
    page: "概览 · 任务子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（task-tab 工具栏「派发」按钮）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: blitz-direct-chain / Step 3: run-tasks 派发

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（本步无表单提交面——派发按钮为状态门控非字段校验，全部终态置灰分支归 Step 5 域）; session-expired = N/A（无登录态；派发循环状态落库可恢复，无凭据过期路径） -->

## Outcome "success"
- Preconditions: "突击提案已 accepted；其直挂任务存在未终态成员且依赖满足（就绪任务在场）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "proposal_status"
            value: "accepted"
          - field: "mode"
            value: "blitz"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Proposal"
        field_constraints:
          - field: "task_status"
            value: "pending（依赖满足）"
- Input: "在会话内（或经任务子 tab「派发」入口）发起 run-tasks——派发指令为单行最小消息（run-tasks 加容器标识）"
- Output: "dispatcher 领取就绪任务并派发 worker：toolFilter 按任务类型收窄（矩阵 deny 面）+ agentOptions 携带 Forge设置 默认 LLM（已配置时）；工具返回结算 + 池快照"
- State: "被领取任务 pending → in_progress（claim 写 task_session_links 派发挂接）；worker 会话创建"
- Side-effect: "插件事件：task-claimed / task-spawned（含 workerSessionId 与 toolFilter）写入 logs/容器 slug.jsonl；in-process worker spawn"
- Invariants: "worker 供给细节归 worker-provisioning 旅程；本步断言派发链启动与收窄/档位参数在场"

## Outcome "worker-blocked"
- Preconditions: "某任务执行受阻（无法完成，如 AC 证据缺口或重大问题）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "in_progress"
- Input: "worker submitTask result=blocked（reason 必带）或经 addTask 追加逃生任务"
- Output: "任务 in_progress → blocked（reason 落审计记录）；逃生任务前缀按语义二分：disc-N（独立问题，不阻塞源）/ fix-N（走 fix 链协议）；工具返回 blocked 结算 + follow-up 任务键 + 池快照"
- State: "任务行 blocked；fix 径源任务同事务即时 blocked 并引用新任务（block_source 单事务）；恢复钩子在修复完成后自动恢复源任务"
- Side-effect: "fix 链协议事件与审计行落库；链深不超过 6"
- Invariants: "M2 fix 链机制回归（block_source 单事务 / 链深 ≤6 / 恢复钩子）"

## Outcome "no-ready-task-pool-done"
<!-- source: inferred -->
<!-- reasoning: M3_DISPATCH_POOL_SNAPSHOT——dispatchTask 空手返回 no-task 分支附池快照与三分判词（全终态 = done）； blitz 链任务全部结算后派发循环收口，此为派发步真实边界（池态收工） -->
- Preconditions: "容器任务全部处于终态（completed / skipped / rejected），无就绪任务可领"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "completed / skipped / rejected（全部终态）"
- Input: "再次发起 run-tasks（派发循环继续调用 dispatchTask）"
- Output: "no-task 返回 + 池快照（pending 0 / in_progress 0 / blocked 0）+ 收工判词（pool all settled — wrap up）"
- State: "库状态不变（无新领取）"
- Side-effect: "no-ready-task 事件（contextSlug 归属）写入事件日志"

## Journey Invariants
- 突击链 gate 纪律不折扣：单写路径 / 执行记录 / 提交规范 / 验证门原样
- 任务语义由 mode 溯源（blitz）决定：整数 ID / 无 stage-gate / eval 门豁免
- 突击无 feature 阶段：提案与任务之外无中间层
- 概览三视图即时口径：写入返回后单次重取即见新值
