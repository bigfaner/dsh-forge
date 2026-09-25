---
journey: "session-native-ops-skill-addressing"
step: 1
step-action: "会话内任务查询(只读 tool)"
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

# Contract: session-native-ops-skill-addressing / Step 1: 会话内任务查询(只读 tool)

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->
<!-- 测试通道定义(本 journey 全部 Input 共用):web harness 不直接驱动 agent 会话;agent 动作经测试通道注入 —— ①驱动面:harness 在 exec 上下文中直接调用 dsh model-facing tool 调用集(与 agent 会话调用同面),不经浏览器表单;②身份供给:exec 上下文携带会话标识 session:<id>(actor 由此派生),可按 outcome 构造身份缺失;③调用记录:通道逐次记录 tool 调用入参、canonical JSON 返回与上抛错误,供断言;④边界注入:宿主/插件面缺席、配置漂移、非法 taskKey 等边界状态经通道构造。回流/审计/寻址断言不受模拟方式影响(journey e2e 驱动面注记)。 -->

## Outcome "success"
<!-- source: fact FT-088(forge-tools/index.ts:1-27):model-facing tool 清单含 forge_task_list/forge_task_query/forge_task_get 等只读工具 -->
<!-- source: fact FT-096(host/index.ts:6):宿主面零 CLI spawn 位点,应用通道管线零 forge CLI 调用 -->
- Preconditions: "已注册且完成 SoT 迁移的项目;dsh 宿主可用,model-facing tool 已注册;agent 会话处于该项目语境"
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
            value: "任一七态词表值"
- Input: "用户在已注册项目的 agent 会话内指示 agent 查询任务状态与依赖(经测试通道驱动 dsh tool 只读调用集)"
- Output: "agent 经 dsh tool 只读查询成功(forge_task_list/forge_task_query/forge_task_get 类只读工具),结果以 canonical JSON 返回;零 bash spawn CLI;查询结果与数据内核一致(看板同口径)"
- State: "只读操作:零写入、零状态变更;查询结果即项目任务当前权威数据(看板同口径)"
- Side-effect: "none"
- Invariants: "已注册且已迁移(sqlite 权威)项目的会话内任务操作唯一通道 = dsh tool(零 CLI 依赖、零 bash spawn、零 forge: 前缀);未迁移(files 权威)项目写操作被拒并引导走 forge CLI(双形态过渡)"

## Outcome "tool-unavailable-degraded"
<!-- surface-web required_outcomes 映射:session-expired → tool 通道不可用映射为会话内明确降级提示 + 恢复引导,非静默失败 -->
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-089(task-tools.ts:98-112):桥 transport 失败经重试后 = ERR_TOOL_BRIDGE_UNAVAILABLE 显式上抛(禁静默),内核业务拒绝以值返回而非错误噪音;「宿主/插件面缺席 → 会话内明确降级提示」为 journey 对 session-expired surface 规则的映射推演 -->
- Preconditions: "dsh tool 暂不可用(宿主/插件面缺席,经测试通道注入)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
    state_requirements:
      - description: "dsh tool 通道不可用(宿主/插件面缺席,测试通道注入)"
        prerequisite_entity: "Project"
- Input: "用户在会话中尝试任务查询/变更操作"
- Output: "得到明确的降级提示(而非静默失败);提示指向可用恢复路径;不产生任何部分写"
- State: "桥 transport 失败经重试后仍失败 → ERR_TOOL_BRIDGE_UNAVAILABLE 显式上抛会话(禁静默);内核零写入"
- Side-effect: "none"
- Invariants: "tool 不可用永不静默失败"

## Outcome "actor-missing-fail-closed"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-060(task-tools.ts:55-66):actor 自动携带自 exec 会话标识,缺失 = fail-closed 拒绝(throw,宁失败不误记审计);工具调用无会话身份是桥面现实边界 -->
- Preconditions: "tool 调用未携带 agent 会话身份(exec 上下文无会话标识)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
    state_requirements:
      - description: "调用上下文缺失会话身份(测试通道构造)"
        prerequisite_entity: "Project"
- Input: "经测试通道以无会话身份的执行上下文调用任务工具"
- Output: "调用被拒绝并抛出审计纪律错误(不产生误记的 actor 标识)"
- State: "零写入;审计不留任何记录(宁失败不误记)"
- Side-effect: "none"
- Invariants: "每笔变更留 actor 标识 —— 无标识即拒绝"

## Journey Invariants

- 已注册且已迁移(sqlite 权威)的项目,会话内任务操作唯一通道 = dsh tool(零 CLI 依赖、零 bash spawn、零 forge: 前缀);未迁移(files 权威)项目写被拒并引导走 forge CLI(双形态过渡)
- 每笔变更留 actor 标识(FORGE_ACTOR 语义延续),审计、记录与看板来源一致
- 技能承载 = customSkillDirs 配置路径(应用写入与升级同步维护);项目仓零新增文件
- tool 不可用永不静默失败;非法变更恒被状态机/依赖解析拒绝,不产生部分写
