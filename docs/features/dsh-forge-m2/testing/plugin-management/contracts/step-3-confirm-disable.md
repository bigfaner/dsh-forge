---
journey: "plugin-management"
step: 3
step-action: "确认禁用"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/plugin-management/journey.md

anchors:
  web:
    page: "workbench/overview"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage → PluginSection(行态转换:transitioning → 已停用)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: plugin-management / Step 3: 确认禁用

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "禁用二次确认对话框已确认;目标第三方插件启用中且注入内容未在线使用(常规场景);另一第三方插件启用中(对照);启停覆盖文件已存在(常规装置,预置内容见 state_requirements;覆盖文件尚不存在时的首次写文件腿见 first-write-creates-overlay)"
  fixture_spec:
    entities:
      - entity_type: "Plugin"
        min_count: 5
        field_constraints:
          - field: "mandatory"
            value: "目标与对照第三方插件 = false"
          - field: "enabled"
            value: "确认前目标与对照均启用"
    state_requirements:
      - description: "常规装置:plugin-runtime.json 预置存在,disabled 集不含目标与对照第三方名(对照插件「不受影响」断言的装置基线)"
        prerequisite_entity: "Plugin"
      - description: "第三方 fixture 插件经测试 profile 清单变体物化(口径见 step-1 Setup:产品 3 必备 + 2 第三方样例,行集唯一来源 = 清单文件)"
        prerequisite_entity: "Plugin"
      - description: "跨面断言口径:forge 数据零损坏 = hash 前后对拍(测试进程直读 fixture 文件)"
        prerequisite_entity: "Plugin"
- Input: "确认禁用"
- Output: "仅该插件注入内容退出,该插件行转为已停用态(状态 + 「启用」动作);另一第三方插件注入内容不受影响;任务看板/会话挂接等核心能力不受影响;forge 数据零损坏"
- State: "覆盖文件写入(目标插件名入 disabled 集,结构上仅容第三方名,FT-048);清单态与行态刷新"
- Side-effect: "启停仅写 userData 覆盖文件(产品清单字节不变)"

## Outcome "double-click-guard"
<!-- source: inferred:「重复点击不触发第二次启停执行」无 PRD 明文;依据 = UF6 transitioning 态语义(启停执行中行呈现操作中指示,动词在执行期不可再发起) -->
- Preconditions: "一次启停操作正在执行(行处于操作中 transitioning 指示)"
  fixture_spec:
    entities:
      - entity_type: "Plugin"
        min_count: 5
        field_constraints:
          - field: "mandatory"
            value: "目标第三方插件 = false"
    state_requirements:
      - description: "启停操作执行窗口期(transitioning)"
        prerequisite_entity: "Plugin"
- Input: "在操作完成前快速重复点击「禁用/启用」"
- Output: "行保持操作中指示直至本次操作完成,重复点击不触发第二次启停执行;不产生中间损坏状态(零损坏不变量)"
- State: "仅一次启停执行落覆盖文件;最终行态 = 单次操作结果"
- Side-effect: "同单次启停(无重复写)"

## Outcome "cancel-no-op"
- Preconditions: "禁用二次确认对话框已打开(Step 2 发起后);启停覆盖文件已存在且 disabled 集不含目标与对照第三方名(装置钉死存在性,见 state_requirements——覆盖文件缺席装置由 first-write-creates-overlay 腿持有,本腿「写入未发生」断言需既有字节为基线)"
  fixture_spec:
    entities:
      - entity_type: "Plugin"
        min_count: 5
        field_constraints:
          - field: "mandatory"
            value: "目标第三方插件 = false"
          - field: "enabled"
            value: "目标插件启用中"
    state_requirements:
      - description: "取消腿装置:plugin-runtime.json 预置存在,disabled 集不含目标与对照第三方名(「覆盖文件未被写入」断言的对拍基线;若无文件装置,断言改为「文件仍不存在」)"
        prerequisite_entity: "Plugin"
- Input: "在确认对话框选择「取消」"
- Output: "对话框关闭且无任何状态变化:该插件仍启用、注入内容保持在线"
- State: "启停覆盖文件未被写入(内容与预置一致)"
- Side-effect: "none(取消路径零写入)"

## Outcome "first-write-creates-overlay"
<!-- source: inferred:全新隔离 userData 尚无 plugin-runtime.json(文件缺失 = 空覆盖 = 全启用)时首次禁用创建覆盖文件——推自覆盖文件读取契约(缺失视为空覆盖,见 apps/desktop/src/main/workbench/ipc/plugins.ts:100-116 与 plugin-runtime/overlay.ts 头注);单写路径(setPluginEnabled 动词)为唯一写入者 -->
- Preconditions: "隔离 userData 内 plugin-runtime.json 尚不存在(全新装置,空覆盖 = 全启用);第三方插件均启用"
  fixture_spec:
    entities:
      - entity_type: "Plugin"
        min_count: 5
        field_constraints:
          - field: "mandatory"
            value: "目标第三方插件 = false"
    state_requirements:
      - description: "plugin-runtime.json 缺失(首次启停前的初始态)"
        prerequisite_entity: "Plugin"
- Input: "对目标第三方插件执行禁用并确认"
- Output: "禁用生效(行转已停用);覆盖文件被创建,内容恰为只含该插件名的 disabled 集;产品清单字节不变"
- State: "覆盖文件由无到有;disabled 集恰含目标插件名"
- Side-effect: "仅写覆盖文件(单一写路径)"

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
