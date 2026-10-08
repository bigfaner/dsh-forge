---
journey: "worker-provisioning"
step: 2
step-action: "派发任一 worker"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/worker-provisioning/journey.md
anchors:
  web:
    page: "概览 · 任务子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（task-tab 工具栏「派发」按钮 / 会话内 run-tasks 两途）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: worker-provisioning / Step 2: 派发任一 worker

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（派发入口为状态门控非表单——表单承载步 = Step 1b，见 step-1 合约）; session-expired = N/A（旅程裁决：本地化 = 配置时效边界，承载步 = Step 1d——本步无连续性断言面） -->

## Outcome "success"
- Preconditions: "Forge设置 worker 档位已配置（Step 1）且父会话模型与配置档一致（无冲突对照形态）；任务库有可派发任务（就绪任务在场）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "forge_settings"
            value: "worker 段已配置（provider/model/reasoning 三项齐）"
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "pending（依赖满足——就绪）"
- Input: "经任务子 tab 工具栏「派发」按钮（或会话内直接发起 run-tasks）派发一个 worker"
- Output: "spawn 携带 agentOptions：provider / model / effort 随配置面三项，output-token 沿机制通道默认（配置面仅三项——机制通道能力保留四字段）；agentOptions 显式携带、优先于父会话继承；worker 会话 model 与配置一致"
- State: "任务 pending → in_progress（claim 写 task_session_links 派发挂接）；worker 子会话创建（model = 配置档）"
- Side-effect: "in-process spawn；task-claimed / task-spawned 事件（含 workerSessionId / toolFilter / model）落事件日志"
- Invariants: "两途（工具栏按钮 / 会话内 run-tasks）汇入同一 dispatcher 循环"

## Outcome "agentoptions-priority"
- Preconditions: "父会话模型与配置档不同（Setup 冲突夹具在场）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "model"
            value: "与 Forge设置 worker 档不同的模型（冲突夹具）"
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "forge_settings"
            value: "worker 段已配置（档位 ≠ 父会话模型）"
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "pending（就绪）"
- Input: "从该父会话派发 worker 并核对其会话 model"
- Output: "worker model = 配置档（显式指定优先于父会话继承——不随父漂移）"
- State: "worker 子会话 model = 配置档（非父会话模型）"
- Side-effect: "in-process spawn（契约面观察：会话 model 元数据）"

## Journey Invariants
- worker 永不问用户、不派生子代（全局拒绝集 ask-user / delegation / todo / present 对所有 worker 生效）
- worker 会话 model 恒 = Forge设置 默认档（已配置时——agentOptions 显式携带、优先于父会话继承；未配置回退父会话继承）
- worker 技能目录 = 组合继承目录（catalog 行级常驻、内容按需加载——token 纪律）
- 零新装载机制：工具/技能装载走 dsh 既有能力体系（toolFilter 携带者 = run-tasks 派发面 in-process spawn；模型面调用参数不可达）
