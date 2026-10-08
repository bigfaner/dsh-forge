---
journey: "worker-provisioning"
step: 4
step-action: "远征默认会话派发 worker（技能继承）"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/worker-provisioning/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: worker-provisioning / Step 4: 远征默认会话派发 worker（技能继承）

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（会话投影面转录步，无表单交互面）; session-expired = N/A（无登录态；技能继承为组合级投影，无会话凭据路径） -->

## Outcome "success"
- Preconditions: "远征默认会话在场（registry 默认即可）；可派发任务在场（含一个测试类与一个非测试类任务——按需加载对照）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "expedition（registry 默认）"
      - entity_type: "Task"
        min_count: 2
        field_constraints:
          - field: "task_type"
            value: "测试类与非测试类各一（按需加载对照）"
- Input: "从远征默认会话派发 worker 并转录其技能目录（会话系统提示技能目录投影——spike S6 实证通道）"
- Output: "目录 = 组合继承目录（与父一致——子会话工具面/目录继承达 worker）；测试任务实际加载 run-tests、非测试任务不加载（按需加载）；远征 worker 含 spec 技能行（内容不加载）"
- State: "worker 子会话组合投影 = 父组合继承目录（catalog 行级常驻）"
- Side-effect: "in-process spawn；按需加载行为（token 纪律——SC2 断言通道已落地，3.9 W 用例）"
- Invariants: "worker 技能目录 = 组合继承目录（行级常驻、内容按需加载）"

## Outcome "blitz-worker-spec-invisible"
- Preconditions: "从突击会话派发的 worker（父组合 = 突击）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "blitz"
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "task_status"
            value: "pending（可派发）"
- Input: "转录其技能目录并尝试请求 spec 技能"
- Output: "物理不可见（预设级 L1 不破——技能枚举面）；远征 worker 含 spec 技能行但内容不加载（token 纪律——与主 Outcome 对照）"
- State: "突击 worker 技能目录不含 spec 技能行（组合继承自父——父即物理缺位）"
- Side-effect: "none（枚举面即证）"
- Invariants: "预设级 L1 物理边界向 worker 延伸（继承不越级补装）"

## Journey Invariants
- worker 永不问用户、不派生子代（全局拒绝集 ask-user / delegation / todo / present 对所有 worker 生效）
- worker 会话 model 恒 = Forge设置 默认档（已配置时——agentOptions 显式携带、优先于父会话继承；未配置回退父会话继承）
- worker 技能目录 = 组合继承目录（catalog 行级常驻、内容按需加载——token 纪律）
- 零新装载机制：工具/技能装载走 dsh 既有能力体系（toolFilter 携带者 = run-tasks 派发面 in-process spawn；模型面调用参数不可达）
