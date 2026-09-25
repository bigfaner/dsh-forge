---
journey: "task-dispatch-execution-loop"
step: 6
step-action: "进入会话界面观察执行并返回"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/journey.md
anchors:
  web:
    page: "上游会话视图(自任务看板跳入)"
    route: "session"
    requires_auth: false
    layout: "上游 session 视图(经 uiWorkspace.openSession 切换)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: task-dispatch-execution-loop / Step 6: 进入会话界面观察执行并返回

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "编排条目对应派发行已回填 session_id(subagent 会话已建立);用户处于任务看板"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Dispatch"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "state"
            value: "running"
          - field: "session_id"
            value: "非空(subagent 会话已回填)"
- Input: "用户从编排条目点击「进入会话」观察 subagent 执行,随后点击返回"
- Output: "跳转主窗口会话界面并定位该 subagent 会话;返回时回到任务看板(返回来源页)"
- State: "视图切换为会话期内存态(视图键 session ↔ workbench/tasks);数据内核零变更"
- Side-effect: "none"
- Invariants: "返回来源页语义:自哪来回哪去"

## Outcome "bridge-unavailable-degraded"
<!-- source: inferred -->
<!-- reasoning: page-map.md Route Guard Configuration:「桥不可用 → 会话内降级提示(不静默)」;宿主桥缺席时进入会话观察面得到明确降级提示,与 M1/M2 错误呈现模式一致 -->
- Preconditions: "宿主桥不可用(宿主异常),用户自任务看板尝试进入会话观察"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Dispatch"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "宿主桥通道不可用(测试通道注入)"
        prerequisite_entity: "Dispatch"
- Input: "用户点击「进入会话」"
- Output: "得到会话内明确的降级提示(不静默失败),提示指向可用恢复路径;不产生部分写"
- State: "无状态变更;看板编排态照常可观察"
- Side-effect: "none"
- Invariants: "通道不可用永不静默失败"

## Journey Invariants

- 看板对人无任务状态写入口:全程任何视图不出现 add/claim/transition/submit/reopen 的写操作入口;人的写操作仅限编排发起(派发/审批/重派发)
- 零 CLI 执行链:旅程全程 forge CLI 调用数 = 0(进程/日志级断言,SC1 口径)
- 任务状态变更唯一通道 = agent 会话经 dsh tool;每笔变更留 actor 标识,且与看板来源标记一致
- 回流时效:感知链健康时每笔变更 ≤5 秒免手动刷新可见;数据内核恒为事实源,看板为派生快照
- 并行互不串扰:各 subagent 独立启动、独立审批、独立提交、独立回流
- 可派发任务集恒只含依赖满足 + 状态允许 + 当前阶段的任务
