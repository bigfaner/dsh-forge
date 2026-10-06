---
journey: "document-browsing"
step: 5
step-action: "浏览仓外项目文档"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/document-browsing/journey.md
anchors:
  web:
    page: "右栏「项目概览」tab（dswf-overview）提案 / feature 子 tab + 右栏「文档」tab（dswf-doc）"
    route: "dswf-overview"
    requires_auth: false
    layout: "sidebar.right.pane.tab"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: document-browsing / Step 5: 浏览仓外项目文档

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 只读浏览 + 点开动作，无表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "仓外项目夹具：按目录约定预置目录结构（features + proposals 在场）且已注册；应用内可切换到该仓外项目"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "registration"
            value: "其一 = 仓内项目，其二 = 仓外项目（forge 目录在仓外）"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "FeatureDocument"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "ownerProject"
            value: "仓外项目"
- Input: "切换到仓外项目，浏览其概览提案 / feature 子 tab 并点开文档"
- Output: "经真实发现链建行后同构呈现（只读渲染 + canonical 路径栏 + mermaid 渲染）；仓内 / 仓外同构"
- State: "无变更（同构渲染面，无特例分支）"
- Side-effect: "none"
- Invariants: "仓内 / 仓外项目同构呈现（同一渲染面，无特例分支心智）"

## Outcome "zero-hit-project-empty-state"
- Preconditions: "项目目录内无任何约定文档（零命中——features 与 proposals 均无约定文件）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "discoveryHits"
            value: "零命中（目录约定文档缺席——features 与 proposals 均无约定文件）"
    state_requirements:
      - description: "该项目的发现面扫描无任何 features / proposals 行（零命中态）"
        prerequisite_entity: "Project"
- Input: "浏览其概览提案 / feature 子 tab"
- Output: "呈现空态（一等展示，非错误——EmptyState 形态）"
- State: "无变更"
- Side-effect: "none"

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
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Feature"
```
