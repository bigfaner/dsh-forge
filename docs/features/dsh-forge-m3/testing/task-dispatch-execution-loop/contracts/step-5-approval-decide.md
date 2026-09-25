---
journey: "task-dispatch-execution-loop"
step: 5
step-action: "处理审批请求"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/journey.md
anchors:
  web:
    page: "工作台 · 任务看板(审批 dock)"
    route: "workbench/panel/approval"
    requires_auth: false
    layout: "WorkbenchShell → ApprovalPanel(与详情侧板互斥;z100)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: task-dispatch-execution-loop / Step 5: 处理审批请求

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "approve-success"
- Preconditions: "看板存在待审批条目(来源 subagent 会话经 host 审批桥入列;对应派发行处 running/awaiting 态)"
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
            value: "running 或 awaiting"
      - entity_type: "ApprovalRequest"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Dispatch"
        field_constraints:
          - field: "state"
            value: "pending"
          - field: "session_id"
            value: "来源 subagent 会话 id(非空)"
- Input: "用户在看板对待审批条目查看内容与来源任务,显式点击「批准」"
- Output: "审批条目可见(请求正文 + 来源任务);批准后 subagent 继续执行;无默认自动批准(操作必须显式点击)"
- State: "approval_request 行 pending → approved,decided_by/decided_at 记录人侧审计;最后一条 pending 决策后对应派发行 awaiting → running(同事务)"
- Side-effect: "dispatch_updated 事件推送;审批结果回流来源 subagent 会话继续执行"
- Invariants: "决策为显式人工动作;pending 不随终局静默失效"

## Outcome "reject"
- Preconditions: "看板存在待审批条目(同 approve-success 的条目形态)"
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
      - entity_type: "ApprovalRequest"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Dispatch"
        field_constraints:
          - field: "state"
            value: "pending"
- Input: "用户显式点击「拒绝」"
- Output: "拒绝结果回流 subagent,该请求对应的操作不执行;任务/编排态呈现拒绝后的走向,不误呈完成态"
- State: "approval_request 行 pending → rejected(留 decided_by/decided_at 审计);派发行按其状态机继续走向(拒绝不产生隐式终局)"
- Side-effect: "拒绝决策回流来源 subagent 会话"
- Invariants: "拒绝为可审计决策;呈现不误报完成"

## Outcome "channel-unavailable"
<!-- surface-web required_outcomes 映射:session-expired → 宿主不可用/凭据失效使会话通道不可用,呈现为编排错误/失败态 + 恢复引导 -->
- Preconditions: "审批链依赖的宿主会话通道不可用(宿主异常/凭据失效),经测试通道注入"
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
            value: "running 或 awaiting"
    state_requirements:
      - description: "宿主会话通道不可用(宿主异常或凭据失效,测试通道注入)"
        prerequisite_entity: "Dispatch"
- Input: "用户察看看板编排条目状态"
- Output: "通道异常以错误/失败态呈现 + 恢复引导(沿用 M1/M2 错误呈现模式),不静默;通道恢复后可继续,不残留半状态编排条目"
- State: "受影响派发行进入 failed 态并记录原因(启动/终局回调路径);通道恢复后经重派发重新进入运行态,无中间残留态"
- Side-effect: "dispatch_updated 事件推送失败态"
- Invariants: "通道失败永不静默;不残留半状态"

## Outcome "already-decided"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-074(dispatch-service.ts:435-458):对同一审批条目重复决策 → ERR_APPROVAL_DECIDED;审批面板与事件推送并存(批推 ≤500ms)时双击/迟到决策是现实竞态边界 -->
- Preconditions: "同一审批条目已被决策(approved 或 rejected),用户在事件回流前再次对该条目执行决策操作"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "ApprovalRequest"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Dispatch"
        field_constraints:
          - field: "state"
            value: "approved 或 rejected(已决策)"
- Input: "用户再次点击该条目的「批准」或「拒绝」"
- Output: "重复决策被拒绝并呈现明确错误(重复决策语义),首次决策结果不被改写"
- State: "approval_request 行保持首次决策结果不变,decided_by/decided_at 不被覆盖"
- Side-effect: "none"
- Invariants: "决策一次性:首次决策为终局审计"

## Journey Invariants

- 看板对人无任务状态写入口:全程任何视图不出现 add/claim/transition/submit/reopen 的写操作入口;人的写操作仅限编排发起(派发/审批/重派发)
- 零 CLI 执行链:旅程全程 forge CLI 调用数 = 0(进程/日志级断言,SC1 口径)
- 任务状态变更唯一通道 = agent 会话经 dsh tool;每笔变更留 actor 标识,且与看板来源标记一致
- 回流时效:感知链健康时每笔变更 ≤5 秒免手动刷新可见;数据内核恒为事实源,看板为派生快照
- 并行互不串扰:各 subagent 独立启动、独立审批、独立提交、独立回流
- 可派发任务集恒只含依赖满足 + 状态允许 + 当前阶段的任务
