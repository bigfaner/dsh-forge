---
journey: "document-browsing"
step: 2
step-action: "点开 design 文档"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/document-browsing/journey.md
anchors:
  web:
    page: "右栏「文档」tab（dswf-doc，multiple）"
    route: "dswf-doc"
    requires_auth: false
    layout: "sidebar.right.pane.tab（按 address/docRel 去重，revealIfOpened）"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: document-browsing / Step 2: 点开 design 文档

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 只读打开动作，无表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "目标 design 文档行在场且文件在盘上（非悬空）；文档 tab 注册面可达"
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
        field_constraints:
          - field: "docKind"
            value: "design"
          - field: "filePresent"
            value: true
- Input: "点击一篇 design 文档行"
- Output: "dock 开出独立文档 tab（按 docRel 去重）；内容呈现正文只读渲染（MarkdownDoc）+ canonical 路径栏 + 只读徽标"
- State: "UI 导航态变更（新 tab 开出）；库与文件系统零变更（readDoc 纯读）"
- Side-effect: "none"

## Outcome "dangling-doc-readonly-placeholder"
- Preconditions: "文档引用悬空（模拟分支切换后文件不在当前分支——rel_path 在索引行但文件缺席）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "FeatureDocument"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "filePresent"
            value: false（悬空——索引行在场，盘上文件缺席）
- Input: "打开对应文档条目"
- Output: "只读缺省渲染并标注悬空（悬空徽标 + 路径栏保留）；不崩溃、不写入、不删行（SC-branch）"
- State: "无变更（dangling=true 只读返回：内容为空、canonicalPath 保留库内 rel_path 原值）；条目保留，文件恢复后可正常打开"
- Side-effect: "none"
- Invariants: "悬空文档不崩溃、不写入、不删行"

## Outcome "same-doc-reopen-dedup"
- Preconditions: "该文档的 tab 已打开（dswf-doc 按 address 已在场）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "FeatureDocument"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "openState"
            value: "文档 A 的 tab 已打开；文档 B 未打开（并存对照）"
- Input: "再次点击同一文档行（文档 A）"
- Output: "激活已有 tab（不新开）；多文档可并存开多个 tab（文档 B 点击后另开新 tab）"
- State: "UI tab 激活态变更；无新 tab 创建"
- Side-effect: "none"
- Invariants: "文档 tab 按 docRel 去重（同文档不重复开 tab）"

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
    - entity_type: "FeatureDocument"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Feature"
```
