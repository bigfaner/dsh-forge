---
journey: "feature-board-docs-browsing"
step: 4
step-action: "注册仓外文档项目"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/feature-board-docs-browsing/journey.md

anchors:
  web:
    page: "workbench/overview"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage + RegisterWizard 浮层(步骤②显式仓外路径 + 授权勾选)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: feature-board-docs-browsing / Step 4: 注册仓外文档项目

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
<!-- surface-web required_outcomes 映射:validation-error → Step 4 复用 UF1 注册向导表单,其非法输入腿(路径未检出 forge 数据/仓外路径=代码根目录/未授权)不在本旅程展开,由 multi-project-management journey Step 2b/3b/3c 持有(家族认领) -->
- Preconditions: "存在一个代码根目录与仓外 docs 树分离的 forge 项目;仓外 docs 树 fixture 同构五类文档;仓外路径未与任何既有项目冲突"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "ExternalDocTree"
        min_count: 1
        field_constraints:
          - field: "path"
            value: "与代码根目录分离的仓外本地路径"
          - field: "docKinds"
            value: "同构五类文档"
    state_requirements:
      - description: "跨面断言口径:注册落库形态 = 工作台状态读数对拍(浏览器侧不自行观测文件系统/注册库)"
        prerequisite_entity: "Project"
- Input: "以仓外本地路径为文档位置注册该 forge 项目(向导步骤②显式选择仓外路径并勾选授权确认)"
- Output: "不超过 3 步注册完成并激活;注册信息落库为仓外文档位置(不等于代码根目录,状态读数对拍);feature 列表与文档均读仓外树(slug 与仓外 fixture 一致)"
- State: "projects 行 doc_location_type = external、doc_location_path = 仓外路径;激活指针指向新项目;感知链 watch 目标含仓外 docs 路径(授权已登记)"
- Side-effect: "注册/授权只写工作台自有库;零项目目录与仓外树写入"
- Invariants: "仓外注册与仓内同一向导面(非法输入腿家族持有)"

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
      min_count: 1
```
