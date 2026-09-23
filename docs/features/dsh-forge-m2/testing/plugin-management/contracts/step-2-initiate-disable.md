---
journey: "plugin-management"
step: 2
step-action: "发起禁用第三方插件"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/plugin-management/journey.md

anchors:
  web:
    page: "workbench/overview"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage → PluginSection 第三方行「禁用」+ 确认对话框浮层"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: plugin-management / Step 2: 发起禁用第三方插件

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "第三方插件处于启用状态,其注入内容未在活跃会话/挂接视图内在线使用(常规启停场景)"
  fixture_spec:
    entities:
      - entity_type: "Plugin"
        min_count: 5
        field_constraints:
          - field: "mandatory"
            value: "目标第三方插件 = false"
          - field: "enabled"
            value: "目标插件启用中"
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "SessionLink"
        min_count: 0
        relationship_type: "belongs_to"
        parent_entity: "Task"
    state_requirements:
      - description: "常规场景装置:session_links 无承载目标插件注入内容的活跃挂接(目标内容未在线使用)——挂接索引为工作台自有 SoT、不可从 forge 文件推导(FT-035),fixture 显式钉缺席"
        prerequisite_entity: "SessionLink"
      - description: "第三方 fixture 插件经测试 profile 清单变体物化(口径见 step-1 Setup:产品 3 必备 + 2 第三方样例,行集唯一来源 = 清单文件)"
        prerequisite_entity: "Plugin"
- Input: "对第三方插件点击「禁用」"
- Output: "出现二次确认,说明影响(仅该插件注入内容退出;forge 数据与工作台核心能力不受影响)"
- State: "确认对话框打开;启停尚未执行(未写覆盖文件)"
- Side-effect: "none(发起阶段零写入)"

## Outcome "in-session-disable"
- Preconditions: "待禁用第三方插件的注入内容正在活跃挂接会话内在线使用(会话界面可见其注入内容;与常规场景互斥)"
  fixture_spec:
    entities:
      - entity_type: "Plugin"
        min_count: 5
        field_constraints:
          - field: "mandatory"
            value: "目标第三方插件 = false"
          - field: "enabled"
            value: "目标插件启用中"
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "active"
            value: true
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "SessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "status"
            value: "active"
    state_requirements:
      - description: "目标插件注入内容在活跃挂接会话内在线使用(挂接会话经 UF5 发起链铺出或 fixture 直排 session_links;挂接索引为工作台自有 SoT、不可从 forge 文件推导,FT-035)"
        prerequisite_entity: "SessionLink"
      - description: "挂接会话本体存活装置:该 active 挂接承载的会话进程在线(禁用断言「会话本体不中断」以此为前提)"
        prerequisite_entity: "SessionLink"
      - description: "第三方 fixture 插件经测试 profile 清单变体物化(口径见 step-1 Setup:产品 3 必备 + 2 第三方样例,行集唯一来源 = 清单文件)"
        prerequisite_entity: "Plugin"
- Input: "在此在线使用状态下对该插件发起禁用并确认"
- Output: "二次确认明确提示影响(会话本体与核心挂接能力不受影响);确认后仅该插件注入内容退出,会话本体不中断,挂接区显示第三方扩展内容退出说明(third-party-disabled 态)"
- State: "会话本体与挂接关系保持;被禁插件的注入内容退出呈现"
- Side-effect: "启停写覆盖文件(仅该插件名入 disabled 集)"

## Journey Invariants

- 两级插件模型恒成立:forge 核心插件始终以必备身份在位,任何操作不能使其退出或被禁用
- 启停仅写运行时启停覆盖文件(同一配置的可写区):forge 数据与项目文件零改动(数据零损坏)
- 运行时启停不得改写产品清单条目(必备清单/保护分区对运行时启停只读)
- 禁用第三方只收敛该插件注入内容,其余第三方插件与工作台核心能力(任务看板/会话挂接)不受影响(Setup 至少 2 第三方装置下可证伪)

## Fixture Specification

本 Contract 各 Outcome 的 fixture 实体并集(逐 Outcome 明细见各 Preconditions 内 fixture_spec):

```yaml
fixture_spec:
  entities:
    - entity_type: "Plugin"
      min_count: 5
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Task"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
    - entity_type: "SessionLink"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
