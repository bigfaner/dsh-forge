---
journey: "multi-project-management"
step: 4
step-action: "切换激活项目"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/multi-project-management/journey.md

anchors:
  web:
    page: "workbench/overview"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → TopBar 项目切换器(Menu 卡)+ 各 tab 页数据面"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: multi-project-management / Step 4: 切换激活项目

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "注册表中已有至少 2 个项目,当前激活第二个项目;第一个项目数据完整可读"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "active"
            value: "恰有一个(待切换离开的目标)"
- Input: "从项目切换器切换回第一个项目"
- Output: "看板/feature/挂接数据完整切换到目标项目(任务/feature 列表、详情、挂接历史均按目标项目呈现)"
- State: "active_project_id 更新为目标项目(单激活,状态读数对拍);感知链按激活切换全量重建(旧 watch 全释放,新项目根建立);派生快照按目标项目读出"
- Side-effect: "none(切换只写激活指针,不写 forge 数据)"
- Invariants: "任意时刻至多一个激活项目"

## Outcome "project-path-invalid"
<!-- surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用(继承 M1 无端口模型),无字面会话过期面;通道失效类比 = 已注册项目数据通道(路径)失效 = 本边 -->
<!-- source: inferred:失联提示 + 重新指向/移除引导 —— 推自 UF4 校验规则「路径失效时明确提示不可访问,并提供重新指向/移除项目引导」(仓外路径既定口径推广至代码根目录,已落地 e2e sc5 失联卡同口径);「不误改」推自移除只删注册信息约束 -->
- Preconditions: "已注册项目的代码根目录已不可访问(被移动/删除;fixture 临时目录内操作)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "codeRoot"
            value: "至少一个项目的根目录已不可访问"
- Input: "打开项目切换器并选择该项目"
- Output: "该项目卡片呈现明确的失联/不可访问提示与重新指向/移除引导;应用不崩溃,项目数据不被误改"
- State: "注册表行保留(不自动删除);其余项目浏览与切换不受影响"
- Side-effect: "none(失联不触发任何写操作)"

## Journey Invariants

- 项目三分模型:代码根目录、工作台自有状态、过程文档位置三者独立存放;工作台自有状态不与 forge 数据混放
- 移除项目只删工作台注册信息:任何移除操作不改动项目仓内文件与 forge 数据
- 单激活约束:任意时刻至多一个激活项目

## Fixture Specification

本 Contract 各 Outcome 的 fixture 实体并集(逐 Outcome 明细见各 Preconditions 内 fixture_spec):

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 2
```
