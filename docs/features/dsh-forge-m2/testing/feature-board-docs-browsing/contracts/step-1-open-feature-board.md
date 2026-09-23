---
journey: "feature-board-docs-browsing"
step: 1
step-action: "进入 feature 看板"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/feature-board-docs-browsing/journey.md

anchors:
  web:
    page: "workbench/features"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → FeaturesPage(feature 卡 grid + 状态 stepper)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: feature-board-docs-browsing / Step 1: 进入 feature 看板

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "应用已启动且已注册并激活一个 forge 项目 fixture,fixture 含双 feature:completed 样板(五类文档齐备)与 in-progress 样板(缺 ui 类可选文档)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
      - entity_type: "Feature"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "completed 与 in-progress 各一个"
          - field: "docKinds"
            value: "completed 五类齐备;in-progress 缺 ui 类(单类缺席实例,可确定实例化)"
      - entity_type: "Task"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "status"
            value: "completed 样板名下任务全部 completed(计数全满);in-progress 样板名下 completed 与 pending 并存(计数部分完成)"
    state_requirements:
      - description: "跨面断言口径:「与 forge 数据一致」= 测试进程直读 fixture forge 文件(仓内/仓外同口径;任务计数对拍锚点 = 每 feature 名下任务状态分布)"
        prerequisite_entity: "Feature"
      - description: "承载口径:一次性 fixture(临时目录 + 隔离 userData,测试后清理);跑腿前探测本机无活跃 dsh-forge 实例(单实例锁,FT-006)"
        prerequisite_entity: "Project"
- Input: "用户切换到工作台·feature 看板(tab 切换)"
- Output: "激活项目的 feature 列表显示双 feature,各带状态标识与任务计数:completed 样板带完成徽标、计数全满,in-progress 样板无徽标、计数部分完成(任务计数 = 每 feature 的任务完成投影,FT-034),与 fixture 模型一致"
- State: "FeatureBoardData 载入(slug/状态/文档类/任务计数);feature 状态为 forge manifest 词表透传(FT-034)"
- Side-effect: "none(只读浏览)"

## Outcome "empty-state"
- Preconditions: "注册并激活零 feature fixture 项目(Setup 另备)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "featureCount"
            value: 0
- Input: "用户进入 feature 看板"
- Output: "显示空(empty)态「无 feature」引导,不显示错误"
- State: "无 feature 快照数据;空态呈现"
- Side-effect: "none"

## Outcome "loading-state"
- Preconditions: "feature 看板数据尚未就绪(首次加载/切换项目)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "loading 窗口确定性供给:就绪门控——观察点先于数据就绪信号注入(或以足量 fixture 拉开未就绪窗口),loading 态断言不依赖竞态时序;「就绪后转入正常列表」断言以就绪信号为界"
        prerequisite_entity: "Feature"
- Input: "用户进入 feature 看板(数据未就绪窗口期内观察)"
- Output: "先行显示 loading 骨架,数据就绪后转入正常列表;未就绪期间不显示错误态或空态(UF4 States:loading 行)"
- State: "加载中不误判为空/错误"
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
      min_count: 2
      # success 腿激活项目 + empty-state 腿零 feature 项目(Setup 另备;loading-state「切换项目」变体亦需 ≥2 注册项目)
    - entity_type: "Feature"
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Project"
    - entity_type: "Task"
      min_count: 3
      relationship_type: "belongs_to"
      parent_entity: "Feature"
```
