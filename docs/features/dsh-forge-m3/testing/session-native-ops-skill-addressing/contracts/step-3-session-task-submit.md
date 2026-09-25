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

## Outcome "success"
- Preconditions: "目标任务已被 agent 领取(in_progress);agent 已完成执行"
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
- Input: "用户指示 agent 提交(submit)任务(经测试通道驱动 forge_task_submit)"
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
- Preconditions: "agent 调用携带非法任务地址(非 <featureSlug>/<localId> 看板限定地址形态)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
    state_requirements:
      - description: "调用入参 taskKey 为非法形态(缺段/多段/含路径分隔)"
        prerequisite_entity: "Project"
- Input: "经测试通道以非法 taskKey 调用 forge_task_submit"
- Output: "调用被拒并返回 ERR_TASK_KEY_INVALID 与形态说明(看板限定地址要求);不触达内核写面"
- State: "零写入;任务行不变"
- Side-effect: "none"
- Invariants: "taskKey 白名单双闸防御(工具面 + 内核面)"

## Journey Invariants

- 已注册项目会话内任务操作唯一通道 = dsh tool(零 CLI 依赖、零 bash spawn、零 forge: 前缀)
- 每笔变更留 actor 标识(FORGE_ACTOR 语义延续),审计、记录与看板来源一致
- 技能承载 = customSkillDirs 配置路径(应用写入与升级同步维护);项目仓零新增文件
- tool 不可用永不静默失败;非法变更恒被状态机/依赖解析拒绝,不产生部分写
