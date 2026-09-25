---
journey: "preferences-tiered-override"
step: 1
step-action: "打开偏好编辑面"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/preferences-tiered-override/journey.md
anchors:
  web:
    page: "工作台 · 项目概览(偏好面 PreferenceSection)"
    route: "workbench/overview"
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage → PreferenceSection(层级 segmented + 键分组)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: preferences-tiered-override / Step 1: 打开偏好编辑面

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "应用已启动并激活一个含至少 1 个 feature 的已注册项目;三级偏好存储可用"
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
        parent_entity: "Project"
        field_constraints:
          - field: "key"
            value: "注册键集内(auto.*/worktree.*/coverage.*/eval.* 之一)"
- Input: "用户进入工作台·项目概览设置区,打开偏好面板"
- Output: "呈现三级层级(全局/当前项目/当前 feature);键集固定呈现(auto.*/worktree.*/eval.*/coverage.* 分组折叠),无自由键编辑;surfaces 不出现在键集"
- State: "纯读(getPrefs 返回全键投影:值/来源/覆盖位 + 类型元数据);键集经 API 暴露,UI 不硬编码"
- Side-effect: "none"
- Invariants: "键集固定(surfaces 除外);无自由键编辑"

## Outcome "no-feature-tier-disabled"
- Preconditions: "当前项目不存在 feature(或无激活项目)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "featureCount"
            value: 0
- Input: "用户打开偏好面板尝试选择 feature 层级"
- Output: "feature 级不可编辑(禁用 + 说明);全局/项目级查看与修改照常可用"
- State: "纯读;feature 层级入口禁用"
- Side-effect: "none"

## Journey Invariants

- 键集固定(auto.*/worktree.*/eval.*,surfaces 除外);无自由键编辑,值类型校验
- 生效解析恒为 feature > 项目 > 全局;全局层兜底
- 修改仅经内核偏好 API(单一写路径);编辑面生效值与派发链消费值同源一致
- 预合成消费时点 = 派发时;已派发会话不追溯改写(inferred)
