---
journey: "document-browsing"
step: 3
step-action: "查看 mermaid 图渲染"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/document-browsing/journey.md
anchors:
  web:
    page: "右栏「文档」tab（dswf-doc）mermaid 段渲染"
    route: "dswf-doc"
    requires_auth: false
    layout: "sidebar.right.pane.tab（MermaidDiagram 分段渲染件）"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: document-browsing / Step 3: 查看 mermaid 图渲染

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 只读渲染面，无表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "已打开的文档含合法 mermaid 代码块（如 erDiagram）；mermaid 引擎可动态加载"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "FeatureDocument"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "content"
            value: "正文含合法 mermaid erDiagram 代码块"
          - field: "filePresent"
            value: true
- Input: "查看文档中的 mermaid 图（erDiagram）"
- Output: "mermaid 代码块渲染为图（erDiagram = 验收锚，SVG 在场）；mermaid 库懒加载（含块才加载，securityLevel=strict 安全级）"
- State: "无变更（纯渲染；无 mermaid 块的文档零加载）"
- Side-effect: "none"

## Outcome "render-failure-fallback-card"
- Preconditions: "mermaid 源非法或渲染失败（语法错误 / 引擎渲染异常）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "FeatureDocument"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "content"
            value: "正文含非法 mermaid 源（语法错误）"
          - field: "filePresent"
            value: true
- Input: "查看该图"
- Output: "回退占位卡（源码 + 回退注记，纯文本呈现）；不影响文档其余部分渲染（异常不外溢）"
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
    - entity_type: "FeatureDocument"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Feature"
```
