---
journey: "slot-collision-coexistence"
step: 1
step-action: "装配 hello-world 建立基线"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/journey.md
skip_eval: true
state-verification: partial
---

# Contract: slot-collision-coexistence / Step 1: 装配 hello-world 建立基线

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "官方 dsh web 环境可用;测试 profile 可独占使用(装/卸自由);hello-world 插件可装配,其贡献的自有子槽位键已知(hello-world.panel),注入目标为既有稳定基座槽(conversation.chat.assistant-actions)"
  fixture_spec:
    entities:
      - entity_type: "OfficialDshWebEnvironment"
        min_count: 1
      - entity_type: "SelfInstallableProfile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "OfficialDshWebEnvironment"
      - entity_type: "PluginPackage"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "@dsh-forge/plugin-hello-world"
          - field: "contributed_slot_key"
            value: "hello-world.panel"
- Input: "对自己的官方 dsh web profile 执行 dsh plugin add 装入 hello-world"
- Output: "hello-world 的基座槽位面板与贡献的自有子槽位正常渲染;宿主核心界面(ui-chat / ui-renderer 承载的既有功能)不受影响——单声明方基线成立"
- State: "profile bundle 清单含 hello-world;单声明方持有该槽位键"
- Side-effect: "装配写入用户自己的 profile(可移除恢复)"
- Invariants: "fixture 与基线插件经同一标准装配机制安装,无特判通道"

## Outcome "core-slot-collision-splash"
<!-- source: journey edge case 1b -->
- Preconditions: "第三方插件声明的槽位键与宿主基座核心槽(承载官方 dsh 核心功能的槽位)撞键"
  fixture_spec:
    entities:
      - entity_type: "PluginPackage"
        min_count: 1
        field_constraints:
          - field: "declared_slot_key"
            value: "collides with a host base core slot key"
      - entity_type: "CoreSlot"
        min_count: 1
        relationship_type: "has_many"
        parent_entity: "OfficialDshWebEnvironment"
- Input: "装配后打开官方 dsh web 核心功能界面"
- Output: "宿主基座核心界面保持可用(第三方撞键不得破坏宿主核心功能面);若发生破坏,按撞键行为型归档并升级为 M2 槽位设计的硬约束输入"
- State: "宿主核心功能面可用性结论落档;若破坏则缺陷记录升级"
- Side-effect: "none"

## Journey Invariants

- 撞键行为始终可观察、可归因(可定位到冲突插件与槽位键);「静默后者覆盖且不可观察」即失败
- 撞键复制品与 hello-world 经同一标准装配机制(dsh plugin add)安装,fixture 无任何特判通道
- 宿主基座核心界面在第三方槽位撞键全程保持可用
- 观察到的撞键行为必须归入且仅归入三型之一(合并共存 / 分层覆盖 / 启动期显式报错),归档含复现步骤与 UI 结果
- 共存状态可逆:移除任一/全部插件后 UI 恢复对应基线,无残留
