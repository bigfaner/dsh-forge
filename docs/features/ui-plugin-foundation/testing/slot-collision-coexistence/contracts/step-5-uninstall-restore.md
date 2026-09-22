---
journey: "slot-collision-coexistence"
step: 5
step-action: "卸载撞键插件验证可恢复"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/journey.md
skip_eval: true
state-verification: partial
---

# Contract: slot-collision-coexistence / Step 5: 卸载撞键插件验证可恢复

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "remove-collision-only"
- Preconditions: "两插件共存态成立(hello-world + 撞键复制品均装配);移除目标为撞键复制品(hello-world 保留)"
  fixture_spec:
    entities:
      - entity_type: "SelfInstallableProfile"
        min_count: 1
        field_constraints:
          - field: "installed_plugins"
            value: "hello-world and collision fixture both present"
      - entity_type: "CollisionFixturePlugin"
        min_count: 1
        field_constraints:
          - field: "removal_target"
            value: true
- Input: "从 profile 移除撞键复制品并重载界面"
- Output: "UI 回到干净状态:hello-world 子槽位恢复单声明方渲染;共存破坏可逆,无残留注册状态"
- State: "profile bundle 清单仅含 hello-world;撞键复制品的注册声明与物化清除"
- Side-effect: "none"

## Outcome "remove-all-pristine"
<!-- source: journey edge case(Step 5 用户动作的另一半:或两插件都移除) -->
- Preconditions: "两插件共存态成立;移除目标为两插件全部(hello-world 与撞键复制品都移除)"
  fixture_spec:
    entities:
      - entity_type: "SelfInstallableProfile"
        min_count: 1
        field_constraints:
          - field: "installed_plugins"
            value: "hello-world and collision fixture both present"
          - field: "removal_target"
            value: "all plugins"
- Input: "从 profile 移除全部两个插件并重载界面"
- Output: "UI 恢复无插件基线——共存状态完全可逆,无残留注册状态、无孤儿槽位声明"
- State: "profile 回到无自装插件基线;注册表无两插件的任何痕迹"
- Side-effect: "none"
- Invariants: "移除任一/全部插件后 UI 恢复对应基线,无残留"

## Journey Invariants

- 撞键行为始终可观察、可归因(可定位到冲突插件与槽位键);「静默后者覆盖且不可观察」即失败
- 撞键复制品与 hello-world 经同一标准装配机制(dsh plugin add)安装,fixture 无任何特判通道
- 宿主基座核心界面在第三方槽位撞键全程保持可用
- 观察到的撞键行为必须归入且仅归入三型之一(合并共存 / 分层覆盖 / 启动期显式报错),归档含复现步骤与 UI 结果
- 共存状态可逆:移除任一/全部插件后 UI 恢复对应基线,无残留
