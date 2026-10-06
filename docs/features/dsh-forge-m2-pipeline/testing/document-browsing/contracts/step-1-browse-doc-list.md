---
journey: "document-browsing"
step: 1
step-action: "浏览概览 feature 子 tab 文档列表"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/document-browsing/journey.md
anchors:
  web:
    page: "右栏「项目概览」tab（dswf-overview）feature 子 tab 文档列表"
    route: "dswf-overview"
    requires_auth: false
    layout: "sidebar.right.pane.tab"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: document-browsing / Step 1: 浏览概览 feature 子 tab 文档列表

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 只读浏览面，无表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "仓内项目：按目录约定组织文档的已注册工作区（features + 全类文档 + proposals 在场）；概览 feature 子 tab 可达"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "registration"
            value: "仓内项目（已注册工作区）"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "FeatureDocument"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "docKind"
            value: "多类在场（含 design 类）"
- Input: "在概览 feature 子 tab 浏览某 feature 的文档行（含 design 文档）"
- Output: "文档行经真实发现链建行（注册 / 首次打开只读扫描按目录约定）；文档行整行可点（行尾 › 箭头）"
- State: "无变更（只读列表 = feature_documents 索引行直读）"
- Side-effect: "none"
- Invariants: "只读纪律：应用对代码仓与文档位置零写入"

## Journey Invariants

- 只读纪律：应用对代码仓与文档位置零写入（文件系统级监控验证，SC3 回归；显式「在编辑器中打开」跳转除外——跳转不写文件）
- 文档 tab 按 docRel 去重（同文档不重复开 tab）
- 悬空文档不崩溃、不写入、不删行（条目保留，文件恢复后可正常打开）
- 仓内 / 仓外项目同构呈现（同一渲染面，无特例分支心智）

## Fixture Specification

This Contract requires the following pre-existing data state. See `rules/fixture-spec.md` for schema details.

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Feature"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
    - entity_type: "FeatureDocument"
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Feature"
```
