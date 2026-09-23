---
journey: "plugin-management"
step: 4
step-action: "重新启用"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/plugin-management/journey.md

anchors:
  web:
    page: "workbench/overview"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage → PluginSection 第三方行「启用」"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: plugin-management / Step 4: 重新启用

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "目标第三方插件处于禁用状态(行呈现已停用 + 「启用」动作)"
  fixture_spec:
    entities:
      - entity_type: "Plugin"
        min_count: 5
        field_constraints:
          - field: "mandatory"
            value: "目标第三方插件 = false"
          - field: "enabled"
            value: "目标插件已停用"
    state_requirements:
      - description: "第三方 fixture 插件经测试 profile 清单变体物化(口径见 step-1 Setup:产品 3 必备 + 2 第三方样例,行集唯一来源 = 清单文件)"
        prerequisite_entity: "Plugin"
      - description: "跨面断言口径:数据完整 = 测试进程直读 fixture 文件 hash 对拍"
        prerequisite_entity: "Plugin"
- Input: "对该第三方插件点击「启用」"
- Output: "该插件注入内容恢复、行回到启用态;数据完整"
- State: "覆盖文件写入(目标插件名移出 disabled 集);清单态不变"
- Side-effect: "启停仅写覆盖文件(清单字节不变)"

## Outcome "restart-persistence"
<!-- source: inferred:「重启后禁用状态保持」无 PRD 明文;依据 = UF6 Data Requirements「第三方插件状态 | 运行时启停状态(同一配置)」——启停状态持久于配置的运行时部分,跨启动并入装配对账 -->
- Preconditions: "第三方插件已被禁用且不执行启用操作,直接重启应用(与 success 的启用腿互斥)"
  fixture_spec:
    entities:
      - entity_type: "Plugin"
        min_count: 5
        field_constraints:
          - field: "mandatory"
            value: "目标与对照第三方插件 = false"
          - field: "enabled"
            value: "目标插件已停用,对照启用中"
    state_requirements:
      - description: "重启执行口径:测试进程等待进程退出 + 单实例锁释放后再启动,每次启动前单实例探测——重启前无活跃 dsh-forge 实例(单实例锁未释放 = ERR_SINGLE_INSTANCE 环境性失败,FT-006)"
        prerequisite_entity: "Plugin"
- Input: "重启应用并打开插件管理区与工作台"
- Output: "该插件禁用状态保持(行仍呈现已停用、注入内容仍退出);另一第三方插件启停状态不受牵连;数据完整;forge 核心插件仍以必备身份在位"
- State: "覆盖文件跨启动持久(userData 内);启动装配按清单 × 覆盖对账"
- Side-effect: "none(重启只读对账)"

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
```
