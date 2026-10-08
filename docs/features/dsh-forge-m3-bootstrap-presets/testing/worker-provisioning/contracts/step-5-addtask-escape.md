---
journey: "worker-provisioning"
step: 5
step-action: "worker 遇重大问题经 addTask 追加任务"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/worker-provisioning/journey.md
anchors:
  web:
    page: "概览 · 任务子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（task-tab 详情时间线——源任务 blocked 行 + 新任务行上屏）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: worker-provisioning / Step 5: worker 遇重大问题经 addTask 追加任务

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（逃生通道为 tool 写径 + 时间线上屏，无表单交互面）; session-expired = N/A（无登录态；fix 链恢复机制承载连续性） -->

## Outcome "success"
- Preconditions: "注定受阻的任务 fixture 已派发（Setup 夹具——带 AC 清单且执行路径必缺测试证据的任务，诱导「重大问题」走 addTask 逃生；worker 执行中将遇无法解决的重大问题）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "ac_json"
            value: "非空（注定受阻 fixture——AC gate 将拒）"
          - field: "task_status"
            value: "in_progress（已派发执行中）"
- Input: "worker 执行中遇重大问题（fixture 诱导），经 addTask 追加任务并结算自身（blocked）"
- Output: "前缀按语义二分：disc-N（独立问题，不阻塞源）/ fix-N（走 fix 链协议——block_source 单事务、链深 ≤6、恢复钩子，M2 机制回归）；自身任务以 blocked 收尾并引用新任务；任务子 tab 详情时间线：源任务 blocked 行 + 新任务行上屏（写入返回后单次重取即见口径）"
- State: "源任务 in_progress → blocked（引用新任务）；新任务入任务域（fix-N 或 disc-N 前缀）；fix 径 block_source 单事务即时生效"
- Side-effect: "fix 链协议事件与审计行落库；时间线上屏（M2 即时口径）"

## Outcome "fix-chain-depth-limit"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 5b［源证「链深 ≤6」不变量；「超限不放行」＝不变量在边界的行为推论（源未明文定义超限态系统响应）——M3_FIX_CHAIN_MAX_DEPTH：新 fix 任务链深 = 源链长 + 1，超限拒绝］ -->
- Preconditions: "fix 链已接近最大深度（链上 fix 任务数近 6）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 6
        field_constraints:
          - field: "local_id_prefix"
            value: "fix 链（沿 source_task_id 链深近 6）"
- Input: "worker 再经 addTask 追加 fix-N 任务"
- Output: "链深 ≤6 纪律（M2 机制回归）；超限不放行（无无限 fix 链）；任务列表无第 7 层 fix 行"
- State: "超限追加被拒绝（链深守卫）；既有链保持 ≤6"
- Side-effect: "拒绝事件/审计（追加失败形态）"

## Outcome "prefix-bifurcation"
- Preconditions: "两个受阻场景各一在场——独立问题型与阻塞问题型（Setup 夹具双份，均可确定性诱导 worker 走 addTask）"
  fixture_spec:
    entities:
      - entity_type: "Task"
        min_count: 2
        field_constraints:
          - field: "blocked_scenario"
            value: "独立问题型与阻塞问题型各一（双份夹具）"
- Input: "分别经 addTask 以独立问题（disc-N）与阻塞问题（fix-N）追加"
- Output: "两前缀行为分化：disc-N 不阻塞源任务（源可继续）/ fix-N block_source 单事务（源即时 blocked 并引用）；两源任务状态分化上屏"
- State: "disc 径源任务状态不受新任务影响；fix 径源任务 blocked + fix-chain 边落库"
- Side-effect: "block_source 事务断言（契约面）+ 状态分化上屏（web 面）"

## Journey Invariants
- worker 永不问用户、不派生子代（全局拒绝集 ask-user / delegation / todo / present 对所有 worker 生效）
- worker 会话 model 恒 = Forge设置 默认档（已配置时——agentOptions 显式携带、优先于父会话继承；未配置回退父会话继承）
- worker 技能目录 = 组合继承目录（catalog 行级常驻、内容按需加载——token 纪律）
- 零新装载机制：工具/技能装载走 dsh 既有能力体系（toolFilter 携带者 = run-tasks 派发面 in-process spawn；模型面调用参数不可达）
