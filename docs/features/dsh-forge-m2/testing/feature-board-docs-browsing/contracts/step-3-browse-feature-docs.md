---
journey: "feature-board-docs-browsing"
step: 3
step-action: "浏览五类过程文档"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/feature-board-docs-browsing/journey.md

anchors:
  web:
    page: "workbench/features"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → FeatureDetail → DocTabs + DocViewer(只读渲染)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: feature-board-docs-browsing / Step 3: 浏览五类过程文档

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "completed 样板 feature 的 manifest/prd/design/ui/tasks 五类文档齐备且内容有效——不含外部链接与注入性内容,且无损坏(安全腿见 external-link-guard / injection-guard;损坏腿见 doc-read-error)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "completed"
      - entity_type: "FeatureDoc"
        min_count: 5
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "kind"
            value: "manifest/prd/design/ui/tasks 五类齐备"
    state_requirements:
      - description: "渲染对比口径:渲染文本空白剥离规范化后与 fixture 文件投影全等(测试进程直读)"
        prerequisite_entity: "FeatureDoc"
- Input: "依次点击 completed 样板的 manifest/prd/design/ui/tasks 文档"
- Output: "五类文档在应用内只读渲染,渲染文本与 fixture 文件按规范化口径全等(空白剥离后逐字对比);返回 feature 详情的导航可用"
- State: "每次读取 = readFeatureDoc 逐文档动词调用;文档内容零改写"
- Side-effect: "none(只读渲染,无编辑入口)"
- Invariants: "只读渲染;无任何编辑入口"

## Outcome "doc-read-error"
<!-- source: inferred:「不影响其他文档与其他 feature 的浏览」无 PRD 明文;依据 = Interface 1 readFeatureDoc 为逐文档读取动词,失败面收敛于被读文档,UF4 error 行(错误+重试)仅作用于失败文档 -->
- Preconditions: "文档位置路径有效,但某个过程文档内容读取失败(文件损坏;fixture 副本注入)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "FeatureDoc"
        min_count: 5
        relationship_type: "belongs_to"
        parent_entity: "Feature"
    state_requirements:
      - description: "目标文档在 fixture 副本上注入内容损坏(单文档粒度)"
        prerequisite_entity: "FeatureDoc"
- Input: "点击该文档"
- Output: "显示错误(error)态与重试;不影响其他文档与其他 feature 的浏览;恢复文件后重试,渲染恢复正常(规范化口径对拍)"
- State: "失败面收敛于被读文档;其余文档快照与浏览不受影响"
- Side-effect: "none"

## Outcome "external-link-guard"
- Preconditions: "过程文档内容中包含外部链接且不含注入性脚本/HTML 内容(Setup 预置;与 injection-guard 互斥)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "FeatureDoc"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "content"
            value: "含外部链接(Setup 预置)"
- Input: "渲染该文档并尝试点击外链"
- Output: "只读渲染禁用外链跳转离开应用(安全约束),用户停留在应用内"
- State: "无导航离开;应用内视图不变"
- Side-effect: "none(外链点击不触发外部打开)"

## Outcome "injection-guard"
- Preconditions: "过程文档内容包含注入性内容(脚本/HTML 标签;Setup 预置)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "FeatureDoc"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "content"
            value: "含脚本/HTML 注入性内容(Setup 预置)"
- Input: "浏览该文档"
- Output: "内容按 forge 原文只读安全渲染(markdown 防注入),不执行任何注入内容"
- State: "渲染为文本呈现;无脚本执行面"
- Side-effect: "none"

## Journey Invariants

- 全部过程文档为只读渲染:不提供任何编辑入口;外链不离开应用
- feature 列表与状态机展示与 forge 数据一致(状态为 forge manifest 词表透传;校验通道见 Setup)
- 仓外与仓内文档格式一致、浏览功能等价(同一渲染面 + 同一对比口径,见 Setup)

## Fixture Specification

本 Contract 各 Outcome 的 fixture 实体并集(逐 Outcome 明细见各 Preconditions 内 fixture_spec):

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Feature"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
    - entity_type: "FeatureDoc"
      min_count: 5
      relationship_type: "belongs_to"
      parent_entity: "Feature"
```
