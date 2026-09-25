---
journey: "preferences-tiered-override"
step: 3
step-action: "修改 feature 级键值"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/preferences-tiered-override/journey.md
anchors:
  web:
    page: "工作台 · 项目概览(偏好面·编辑 + 脏保存条)"
    route: "workbench/overview"
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage → PreferenceSection(脏保存条 + PrefSaveErrorDialog)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: preferences-tiered-override / Step 3: 修改 feature 级键值

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "目标布尔键的 feature 级可编辑(feature 在场);内核偏好 API 可用"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "PrefEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "key"
            value: "布尔键(如 auto.test.quick)"
- Input: "用户修改该键的 feature 级值并保存"
- Output: "保存经内核偏好 API 持久化;生效值即时更新;呈现「本级覆盖」+ 清除入口"
- State: "prefs 表 feature 级行 upsert(事务原子);prefs_updated 事件推送;生效解析即时反映新值"
- Side-effect: "prefs_updated 事件批推"
- Invariants: "修改仅经内核偏好 API(单一写路径)"

## Outcome "type-validation-error"
<!-- surface-web required_outcomes 映射:validation-error → 偏好值为固定类型(布尔/数值/枚举),非法输入就近报错不保存 -->
- Preconditions: "修改布尔键时输入非法值(类型不匹配)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "PrefEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "type"
            value: "boolean"
    state_requirements:
      - description: "用户输入值与键类型不符(测试通道构造非法输入)"
        prerequisite_entity: "PrefEntry"
- Input: "用户尝试保存"
- Output: "类型校验错误就近呈现(ERR_PREF_VALUE_INVALID 语义);不保存;用户改正后可重试"
- State: "校验全部前置(键集 + 类型规范化),失败零写入;prefs 表零变更"
- Side-effect: "none"
- Invariants: "值类型校验(键集封闭 + 类型域校验)"

## Outcome "save-channel-error"
<!-- surface-web required_outcomes 映射:session-expired → 内核偏好 API 通道异常时错误呈现,不落半写状态 -->
<!-- source: inferred:偏好修改仅经偏好 API(与 dsh tool 写路径同源,无第二写者)——通道失败必不产生部分持久化 -->
- Preconditions: "保存时内核偏好 API 通道异常(经测试通道注入)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "内核偏好 API 通道异常(测试通道注入)"
        prerequisite_entity: "Project"
- Input: "用户保存修改"
- Output: "错误呈现(整体回滚说明 + 重试入口),不落半写状态;恢复后可重试;编辑面不呈现未持久化的假生效值"
- State: "写入同一事务,中途失败整体回滚零半写;prefs 表保持修改前值"
- Side-effect: "none"
- Invariants: "不落半写状态;呈现与持久化同源"

## Journey Invariants

- 键集固定(auto.*/worktree.*/eval.*,surfaces 除外);无自由键编辑,值类型校验
- 生效解析恒为 feature > 项目 > 全局;全局层兜底
- 修改仅经内核偏好 API(单一写路径);编辑面生效值与派发链消费值同源一致
- 预合成消费时点 = 派发时;已派发会话不追溯改写(inferred)
