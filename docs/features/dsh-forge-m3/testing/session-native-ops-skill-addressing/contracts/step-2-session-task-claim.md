---
journey: "session-native-ops-skill-addressing"
step: 2
step-action: "会话内任务领取(claim)"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/session-native-ops-skill-addressing/journey.md
anchors:
  web:
    page: "上游会话视图(agent 会话)"
    route: "session"
    requires_auth: false
    layout: "上游 session 视图(agent 动作经测试通道驱动 dsh tool 调用集)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: session-native-ops-skill-addressing / Step 2: 会话内任务领取(claim)

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "备一个可执行任务(带执行 prompt,状态 pending,依赖满足);审计日志通道可查"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "pending"
          - field: "blockers"
            value: "空数组或全部上游终态"
- Input: "用户指示 agent 领取(claim)该可执行任务(经测试通道驱动 forge_task_claim)"
- Output: "claim 成功,结果以 canonical JSON 返回(ok 为真);任务状态回流看板 ≤5s"
- State: "任务行 pending → in_progress(经内核状态机合法边);updated_by 记 session 会话标识(actor 审计可查);task_updated 事件直发"
- Side-effect: "task_updated 事件批推"
- Invariants: "操作留 actor 标识(审计可查)"

## Outcome "illegal-transition-rejected"
<!-- source: inferred:状态机(7 态)入数据内核,非法转换必拒(如对 completed 任务 claim) -->
- Preconditions: "目标任务当前状态不允许该操作(状态机 7 态约束外,如 completed 任务)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "completed(终态,claim 非法)"
- Input: "指示 agent 执行该变更(claim 终态任务)"
- Output: "状态机拒绝并返回明确错误(ERR_TASK_STATE_INVALID,Go 原码消息透传,如 completed 不可逆提示);任务状态不变;审计不留成功记录"
- State: "任务行零变更;拒绝以业务值(ok 为假 + code)返回,非错误噪音"
- Side-effect: "none"
- Invariants: "非法变更恒被状态机拒绝,不产生部分写"

## Outcome "deps-unsatisfied-rejected"
<!-- source: inferred:依赖解析入数据内核,依赖不满足的任务变更被拒 -->
- Preconditions: "任务依赖未满足(已解析 blocker 未终态)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "pending"
          - field: "blockers"
            value: "含至少一个未终态的已解析上游"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "in_progress(blocker 未终态)"
- Input: "指示 agent 变更该任务(claim 依赖未满足任务)"
- Output: "依赖解析拒绝并返回明确错误(ERR_TASK_DEPS_UNSATISFIED,unmet 原词清单);不产生越序状态"
- State: "任务行零变更"
- Side-effect: "none"
- Invariants: "不产生越序状态"

## Outcome "not-authoritative-rejected"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-059(task-service.ts:27-32):写集仅对 data_authority='sqlite' 项目开放,files 项目 → ERR_TASK_NOT_AUTHORITATIVE 并提示走 CLI(双形态纪律);已注册未迁移项目上的会话写是过渡期现实边界 -->
- Preconditions: "目标任务所属项目已注册但未迁移(data_authority 为 files)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "files"
      - entity_type: "TaskSnapshot"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
- Input: "指示 agent 经 dsh tool 对该任务执行 claim"
- Output: "写操作被拒并返回明确错误(ERR_TASK_NOT_AUTHORITATIVE,提示走 forge CLI 双形态纪律)"
- State: "零写入;项目权威状态不变"
- Side-effect: "none"
- Invariants: "写集权限界判定在内核,不信任 tool 输入语义"

## Journey Invariants

- 已注册项目会话内任务操作唯一通道 = dsh tool(零 CLI 依赖、零 bash spawn、零 forge: 前缀)
- 每笔变更留 actor 标识(FORGE_ACTOR 语义延续),审计、记录与看板来源一致
- 技能承载 = customSkillDirs 配置路径(应用写入与升级同步维护);项目仓零新增文件
- tool 不可用永不静默失败;非法变更恒被状态机/依赖解析拒绝,不产生部分写
