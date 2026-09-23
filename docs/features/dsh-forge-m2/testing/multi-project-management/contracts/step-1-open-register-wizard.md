---
journey: "multi-project-management"
step: 1
step-action: "进入注册向导"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/multi-project-management/journey.md

anchors:
  web:
    page: "workbench/overview"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage + workbench/dialog 注册向导浮层(RegisterWizard 3 步)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: multi-project-management / Step 1: 进入注册向导

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "应用已启动且已有 1 个注册项目并处于激活状态;工作台自有状态(项目注册表)可正常读写"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
    state_requirements:
      - description: "存在第二个可注册的 forge 项目路径(含 .forge 与 docs/features 等 forge 数据)备用"
        prerequisite_entity: "Project"
      - description: "一次性 fixture 承载:临时目录 + 隔离 userData,测试后清理(不以生产仓为承载、不污染真实注册表)"
        prerequisite_entity: "Project"
      - description: "跨面断言口径:注册/激活态 = 工作台状态读数对拍(浏览器侧不自行观测文件系统)"
        prerequisite_entity: "Project"
- Input: "用户从项目切换器点「添加项目」"
- Output: "进入项目注册向导(浮层/分步),停在步骤 ①(选代码根目录);三步结构可见(①检出校验 ②仓外授权 ③确认)"
- State: "向导浮层打开(FT-053:注册向导属 workbench/dialog/* 浮层键族);未产生任何注册写入"
- Side-effect: "none(打开向导零落库)"

## Outcome "wizard-abandon-guard"
<!-- source: inferred:放弃确认守卫推自 page-map 浮层契约(Esc/mask/✕ 关闭,向导带放弃确认守卫;见 docs/features/dsh-forge-m2/design/page-map.md 浮层节) -->
- Preconditions: "注册向导已打开且步骤内已有输入(未完成的注册上下文)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
- Input: "用户经 Esc/遮罩/关闭钮触发关闭,并在守卫中做出选择(确认放弃/取消留下)"
- Output: "呈现放弃确认守卫,两个选择都被尊重:确认放弃后向导关闭且不落任何注册(无项目行、无激活变更);取消放弃则守卫关闭,向导停留原步骤且已有输入完整保留"
- State: "两条选择腿均注册表零写入;放弃腿返回概览页原状态,取消腿向导保持打开、已输入内容不丢失"
- Side-effect: "none(放弃路径零持久化)"

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
      min_count: 1
```
