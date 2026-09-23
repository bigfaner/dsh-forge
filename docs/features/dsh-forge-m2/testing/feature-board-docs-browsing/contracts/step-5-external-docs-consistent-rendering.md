---
journey: "feature-board-docs-browsing"
step: 5
step-action: "仓外文档一致渲染"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/feature-board-docs-browsing/journey.md

anchors:
  web:
    page: "workbench/features"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → FeatureDetail(仓外文档角标 + DocViewer 同一渲染面)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: feature-board-docs-browsing / Step 5: 仓外文档一致渲染

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "仓外文档项目已注册并激活(Step 4 产物);仓外 docs 树同构五类文档且路径有效"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "docLocationType"
            value: "external"
          - field: "active"
            value: true
      - entity_type: "ExternalDocTree"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "对比口径:渲染文本空白剥离规范化后与仓外 fixture 文件投影全等(仓内/仓外同口径,测试进程直读)"
        prerequisite_entity: "ExternalDocTree"
      - description: "读取/渲染实现口径:readFeatureDoc 按项目文档位置解析(FT-030;external 位置语义 = FT-036);仓内/仓外由同一渲染组件承载(「同一渲染面」实现口径)"
        prerequisite_entity: "ExternalDocTree"
- Input: "打开该仓外项目的 feature 过程文档浏览"
- Output: "feature 详情带仓外文档角标(设计源 = ui-design UF4 Data Mapping:仓外角标 = 文档位置来源,工作台自有状态 DF005);文档与仓内同一渲染面只读展示,渲染内容与仓外 fixture 文件投影一致(对拍口径见 state_requirements)"
- State: "文档读取自项目登记的仓外文档位置(FT-036);呈现与仓内同一渲染面、零分叉"
- Side-effect: "none(只读)"

## Outcome "external-path-invalid-repoint"
<!-- surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用(继承 M1 无端口/无服务端会话模型),无字面会话过期面;通道失效类比 = 已注册仓外文档通道失效(watcher 失联 + 文档读取复验失败),映射为 UF4 error(读取异常,含仓外路径失效)态 = 本边 -->
- Preconditions: "已注册仓外项目的文档路径失效(仓外 docs 树被移动/删除;fixture 临时目录内操作);备第二仓外树作重指向恢复腿目标"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "docLocationType"
            value: "external"
          - field: "active"
            value: true
      - entity_type: "ExternalDocTree"
        min_count: 2
        field_constraints:
          - field: "state"
            value: "第一棵树已失效(移动/删除);第二棵树为恢复目标"
    state_requirements:
      - description: "重指向落库口径(仅供对拍,不入行为断言):doc_location_path 更新为第二仓外树(FT-036);路径失效注入 = fixture 临时目录内移动/删除第一棵树(随 fixture 清理)"
        prerequisite_entity: "ExternalDocTree"
- Input: "打开该项目的 feature 详情并点击文档;随后经重新指向入口走向导编辑模式,指向第二仓外树并重确认授权"
- Output: "明确提示路径不可访问(error 态)并提供重新指向/移除项目引导(FT-053:外部文档失效 → 错误卡 + 重新指向引导);已扫快照数据不被静默清空(feature 列表仍在);重指向并重确认授权后,错误态消退、feature 列表与文档按新树重建"
- State: "失效期:读取失败仅作用于文档读取面,既有 feature 快照保留(不静默清空);恢复:仓外文档位置更新为第二仓外树(编辑模式走同一注册校验链,仓外同样需授权——无豁免,FT-051),快照按新树重建"
- Side-effect: "重指向只写工作台自有库;零项目目录写入"

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
    - entity_type: "ExternalDocTree"
      min_count: 2
    - entity_type: "Feature"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
```
