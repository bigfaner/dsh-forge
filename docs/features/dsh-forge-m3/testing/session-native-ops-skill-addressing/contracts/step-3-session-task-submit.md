---
journey: "session-native-ops-skill-addressing"
step: 3
step-action: "会话内任务提交(submit)"
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

# Contract: session-native-ops-skill-addressing / Step 3: 会话内任务提交(submit)

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->
<!-- 测试通道定义(本 journey 全部 Input 共用):web harness 不直接驱动 agent 会话;agent 动作经测试通道注入 —— ①驱动面:harness 在 exec 上下文中直接调用 dsh model-facing tool 调用集(与 agent 会话调用同面),不经浏览器表单;②身份供给:exec 上下文携带会话标识 session:<id>(actor 由此派生),可按 outcome 构造身份缺失;③调用记录:通道逐次记录 tool 调用入参、canonical JSON 返回与上抛错误,供断言;④边界注入:宿主/插件面缺席、配置漂移、非法 taskKey 等边界状态经通道构造。回流/审计/寻址断言不受模拟方式影响(journey e2e 驱动面注记)。 -->

## Outcome "success"
<!-- source: fact FT-057(statemachine.ts:46-98):仅 submit 角色可至 completed;FT-093(task-service.ts:95-109):task_updated 直发 -->
<!-- 记录链路溯源:submit 不写执行记录,记录 md 由 agent 会话经文档根写入后由内核读取渲染(代码实勘 task-service.ts:187-193,410-415,缺失 = 空态非错误),未入 Fact Table -->
- Preconditions: "目标任务已被 agent 领取(in_progress);agent 已完成执行并将执行记录(md)写入项目文档根 records/ 位置(写_ONCE 形态)"
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
            value: "in_progress"
          - field: "updated_by"
            value: "session 会话标识(agent 已领取)"
      - entity_type: "ExecutionRecord"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "recordFile"
            value: "项目文档根下 records/<taskStem>.md(agent 会话写入,写_ONCE 形态)"
- Input: "用户指示 agent 提交(submit)任务(经测试通道驱动 forge_task_submit);执行记录的文档根写入先于 submit 调用"
- Output: "submit 成功(ok 为真);执行记录可渲染(记录渲染入内核);看板回流任务终态"
- State: "任务行 in_progress → completed(仅 submit 角色可至 completed);updated_by 刷新 session 标识;执行记录(md 写_ONCE 形态)经记录渲染入内核可查;task_updated 事件直发"
- Side-effect: "task_updated 事件批推;审计行留存"
- Invariants: "actor 标识留存(审计可查)"

## Outcome "audit-tri-consistency"
- Preconditions: "claim/submit 均已完成"
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
            value: "completed"
          - field: "updated_by"
            value: "session 会话标识"
      - entity_type: "ExecutionRecord"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
- Input: "用户对照看板来源标记、执行记录与审计日志(测试通道三方直读)"
- Output: "actor 标识、看板来源标记、执行记录三方一致,审计链完整可回查"
- State: "三方数据同源(updated_by → 看板来源投影与记录渲染同一权威值)"
- Side-effect: "none"
- Invariants: "审计、记录与看板来源一致"

## Outcome "task-key-invalid"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-088(task-tools.ts:68-91,114-117):taskKey 工具面白名单 = 看板限定地址(恰一个斜杠、两段非空);形态非法 → ERR_TASK_KEY_INVALID 值返回(双闸防御的工具侧闸);agent 传参错形是现实边界 -->
<!-- surface-web required_outcomes 映射:validation-error → 本 outcome 即无效输入提交形态:错误信息就地返回(业务值含形态说明),流程未推进(零写入),agent 可更正后重试 -->
- Preconditions: "agent 调用携带非法任务地址(非 <featureSlug>/<localId> 看板限定地址形态)"
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
            value: "in_progress(「任务行不变」断言的锚点行)"
    state_requirements:
      - description: "调用入参 taskKey 为非法形态(缺段/多段/含路径分隔)"
        prerequisite_entity: "Project"
- Input: "经测试通道以非法 taskKey 调用 forge_task_submit"
- Output: "调用被拒并返回 ERR_TASK_KEY_INVALID 与形态说明(看板限定地址要求);不触达内核写面;agent 更正为合法 <featureSlug>/<localId> 地址后重试,调用成功(更正-重试闭环)"
- State: "零写入;任务行不变"
- Side-effect: "none"
- Invariants: "taskKey 白名单双闸防御(工具面 + 内核面)"

## Journey Invariants

- 已注册且已迁移(sqlite 权威)的项目,会话内任务操作唯一通道 = dsh tool(零 CLI 依赖、零 bash spawn、零 forge: 前缀);未迁移(files 权威)项目写被拒并引导走 forge CLI(双形态过渡)
- 每笔变更留 actor 标识(FORGE_ACTOR 语义延续),审计、记录与看板来源一致
- 技能承载 = customSkillDirs 配置路径(应用写入与升级同步维护);项目仓零新增文件
- tool 不可用永不静默失败;非法变更恒被状态机/依赖解析拒绝,不产生部分写
