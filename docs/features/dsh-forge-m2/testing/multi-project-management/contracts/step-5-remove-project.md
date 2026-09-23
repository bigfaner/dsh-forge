---
journey: "multi-project-management"
step: 5
step-action: "移除一个注册项目"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/multi-project-management/journey.md

anchors:
  web:
    page: "workbench/overview"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage 项目卡(移除动作)+ workbench/dialog 移除确认浮层"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: multi-project-management / Step 5: 移除一个注册项目

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "第二个项目已注册且当前未激活(第一个项目激活中);工作台自有状态可正常读写"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "active"
            value: "第一个项目激活,第二个未激活"
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "project"
            value: "两项目各至少 1 个任务(级联删除与激活项目不受影响断言非空洞)"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "project"
            value: "被移除项目至少 1 个 feature(派生快照级联非空洞)"
      - entity_type: "SessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "task"
            value: "被移除项目的任务至少 1 条挂接(挂接行级联非空洞;挂接索引为工作台自有 SoT、不可从 forge 文件推导)"
    state_requirements:
      - description: "跨面断言口径:「项目仓内文件与 forge 数据不被改动」= 测试进程对项目目录做移除前/后文件树快照对拍"
        prerequisite_entity: "Project"
- Input: "用户对第二个项目执行移除并确认二次确认弹层,随后对同一根目录重新发起注册"
- Output: "二次确认明确提示「仅删除工作台注册信息,不动项目文件」;确认后仅工作台注册信息被删除,项目仓内文件与 forge 数据不被改动;同一 code_root 此后可再次注册成功(占用随移除释放——FT-036:移除事务删除项目行,唯一占用随之解除)"
- State: "projects 行删除;该项目的派生快照与挂接行随移除级联删除(FT-036:CASCADE 删除快照与挂接);激活指针不变(仍指第一个项目);感知链不受影响(FT-047:停链仅及被移除项目)"
- Side-effect: "移除只写工作台自有库,零项目目录写入"
- Invariants: "移除不改动项目文件(文件面对拍为据,不以「没报错」为据)"

## Outcome "remove-active-with-remaining"
<!-- 事实锚:FT-036(removeProject 即时事务:目标为激活项目时清空 active_project_id 指针、不自动迁移,且 CASCADE 删除快照与挂接);source: inferred:「项目域页呈现选择/注册引导卡」推自 tasks 裁决与已落地 e2e(sc5-multi-project)断言 -->
- Preconditions: "待移除项目是当前激活项目,且移除后剩余注册项目至少 1 个"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 2
        field_constraints:
          - field: "active"
            value: "待移除项目为激活项目"
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "project"
            value: "被移除项目至少 1 个任务 + 剩余项目至少 1 个任务(「不残留/剩余可浏览」断言非空洞)"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "project"
            value: "被移除项目至少 1 个 feature(快照级联非空洞)"
      - entity_type: "SessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "task"
            value: "被移除项目的任务至少 1 条挂接(「不残留挂接数据」断言非空洞)"
- Input: "用户执行移除并二次确认"
- Output: "注册信息删除;任务/feature 等项目域页面呈现选择/注册引导卡(激活指针置空,不自动迁移到剩余项目)"
- State: "激活指针清空(active_project_id 置空——FT-036:移除事务内清理,不自动迁移);工作台不残留已移除项目的看板/挂接数据(FT-036:随移除级联删除)"
- Side-effect: "同 success(仅删注册信息)"

## Outcome "remove-last-project"
- Preconditions: "注册项目仅剩 1 个(即当前激活项目)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
    state_requirements:
      - description: "注册表仅剩此一个项目(项目行数 = 1)"
        prerequisite_entity: "Project"
      - description: "「项目仓内文件不被改动」= 测试进程对项目目录做移除前/后文件树快照对拍"
        prerequisite_entity: "Project"
- Input: "用户执行移除并二次确认"
- Output: "进入空态,注册向导自动进入(UF1 States empty:首次使用/全部移除;FT-053:无激活项目 → 概览空态自动进向导);项目仓内文件不被改动"
- State: "注册表清空(项目行删除);激活指针随之清空(FT-036);概览空态引导至向导"
- Side-effect: "同 success(仅删注册信息)"

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
    - entity_type: "Task"
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Project"
    - entity_type: "Feature"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
    - entity_type: "SessionLink"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
