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
<!-- 测试通道定义(本 journey 全部 Input 共用):web harness 不直接驱动 agent 会话;agent 动作经测试通道注入 —— ①驱动面:harness 在 exec 上下文中直接调用 dsh model-facing tool 调用集(与 agent 会话调用同面),不经浏览器表单;②身份供给:exec 上下文携带会话标识 session:<id>(actor 由此派生),可按 outcome 构造身份缺失;③调用记录:通道逐次记录 tool 调用入参、canonical JSON 返回与上抛错误,供断言;④边界注入:宿主/插件面缺席、配置漂移、非法 taskKey 等边界状态经通道构造。回流/审计/寻址断言不受模拟方式影响(journey e2e 驱动面注记)。 -->

## Outcome "success"
<!-- source: fact FT-093(task-service.ts:95-109):权威写事务提交后 task_updated 事件直发(看板 ≤5s 免手动刷新回流依赖此直发) -->
<!-- source: fact FT-060(schema-v2.ts:48;task-service.ts:34-36):每笔内核写记 updated_by(session:<id>)与 updated_at -->
- Preconditions: "目标任务存在且可执行:状态 pending、依赖全部终态、附执行 prompt"
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
<!-- 错误码溯源:ERR_TASK_STATE_INVALID 及其消息 = 代码实勘(task-service.ts:122-124),准确但未入 Fact Table(FT-057 为状态表事实,不含该错误码) -->
- Preconditions: "项目为 sqlite 权威(data_authority='sqlite';files 权威项目在状态判定前即被权威闸以 ERR_TASK_NOT_AUTHORITATIVE 拒绝,见 not-authoritative-rejected);目标任务当前状态不允许该操作(状态机 7 态约束外,如 completed 任务)"
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
- Output: "状态机拒绝并返回明确错误(ERR_TASK_STATE_INVALID,消息为具体业务说明,如 completed 为终态不可逆);任务状态不变;审计不留成功记录"
- State: "任务行零变更;拒绝以业务值(ok 为假 + code)返回,非错误噪音"
- Side-effect: "none"
- Invariants: "非法变更恒被状态机拒绝,不产生部分写"

## Outcome "deps-unsatisfied-rejected"
<!-- source: inferred:依赖解析入数据内核,依赖不满足的任务变更被拒 -->
<!-- 错误码溯源:ERR_TASK_DEPS_UNSATISFIED 与 unmet 原词清单 = 代码实勘(task-service.ts:127-133),准确但未入 Fact Table -->
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

- 已注册且已迁移(sqlite 权威)的项目,会话内任务操作唯一通道 = dsh tool(零 CLI 依赖、零 bash spawn、零 forge: 前缀);未迁移(files 权威)项目写被拒并引导走 forge CLI(双形态过渡)
- 每笔变更留 actor 标识(FORGE_ACTOR 语义延续),审计、记录与看板来源一致
- 技能承载 = customSkillDirs 配置路径(应用写入与升级同步维护);项目仓零新增文件
- tool 不可用永不静默失败;非法变更恒被状态机/依赖解析拒绝,不产生部分写
