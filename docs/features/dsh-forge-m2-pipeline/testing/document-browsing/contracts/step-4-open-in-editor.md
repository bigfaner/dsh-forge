---
journey: "document-browsing"
step: 4
step-action: "在编辑器中打开"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/document-browsing/journey.md
anchors:
  web:
    page: "右栏「文档」tab（dswf-doc）「在编辑器中打开」动作"
    route: "dswf-doc"
    requires_auth: false
    layout: "sidebar.right.pane.tab（openExternal 主侧执行）"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: document-browsing / Step 4: 在编辑器中打开

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 单一按钮动作（无输入面）。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "文档 tab 已打开（目标文档在册）；该文档路径属工作区 projectHead 路径集（feature_documents 与 proposals 的 rel_path 解析全集）；系统关联编辑器已配置"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "FeatureDocument"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "canonicalPath"
            value: "在工作区 projectHead 路径集内（在册）"
          - field: "filePresent"
            value: true
- Input: "点击「在编辑器中打开」"
- Output: "跳转系统关联编辑器打开该文档（shell 层 openPath 动作）；跳转不写文件（只读纪律豁免面 = 跳转本身，非写入）"
- State: "无产品侧状态变更（外部编辑器进程启动归 OS）"
- Side-effect: "系统编辑器进程启动（经 forge:docs/openExternal 主侧执行——先经桥校验路径在册，越界即拒 ERR_DOC_PATH_INVALID 面）"
- Invariants: "只读纪律：显式「在编辑器中打开」跳转除外——跳转不写文件"

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
