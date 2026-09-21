---
journey: "slot-collision-coexistence"
step: 2
step-action: "装入撞键复制品 fixture"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/journey.md
skip_eval: true
state-verification: full
---

# Contract: slot-collision-coexistence / Step 2: 装入撞键复制品 fixture

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "hello-world 已装配(Step 1 基线成立);撞键复制品 fixture 就绪:第二个自装插件,声明与 hello-world 贡献子槽位同名的槽位键(hello-world.panel),构建期 MODE 可选(replica/coexist/shadow/tie)"
  fixture_spec:
    entities:
      - entity_type: "SelfInstallableProfile"
        min_count: 1
        field_constraints:
          - field: "installed_plugins"
            value: "contains @dsh-forge/plugin-hello-world"
      - entity_type: "CollisionFixturePlugin"
        min_count: 1
        field_constraints:
          - field: "declared_slot_key"
            value: "hello-world.panel (same key as hello-world's contribution)"
          - field: "install_mechanism"
            value: "standard dsh plugin add, no special-casing"
- Input: "对同一 profile 再执行 dsh plugin add 装入撞键复制品(声明同名槽位键)"
- Output: "两个自装插件同时记入 profile bundle 清单,经同一装配机制共存;不出现安装期特判或静默拒绝"
- State: "profile bundle 清单同时含 hello-world 与撞键复制品;撞键尚未在界面观察(观察属 Step 3)"
- Side-effect: "none"
- Invariants: "fixture 与基线插件经同一标准装配机制安装,无特判通道"

## Outcome "fixture-alone-baseline"
<!-- source: journey edge case 2b -->
- Preconditions: "profile 中只有撞键复制品、无 hello-world(单一声明方持有该槽位键)"
  fixture_spec:
    entities:
      - entity_type: "SelfInstallableProfile"
        min_count: 1
        field_constraints:
          - field: "installed_plugins"
            value: "contains only the collision fixture, no hello-world"
      - entity_type: "CollisionFixturePlugin"
        min_count: 1
- Input: "单独装配撞键复制品并观察"
- Output: "该槽位键正常渲染(单声明方无撞键)——证明 Step 3 观察到的行为确由撞键引起,而非 fixture 自身缺陷"
- State: "单声明方渲染基线成立,可作为撞键观察的对照组"
- Side-effect: "none"

## Journey Invariants

- 撞键行为始终可观察、可归因(可定位到冲突插件与槽位键);「静默后者覆盖且不可观察」即失败
- 撞键复制品与 hello-world 经同一标准装配机制(dsh plugin add)安装,fixture 无任何特判通道
- 宿主基座核心界面在第三方槽位撞键全程保持可用
- 观察到的撞键行为必须归入且仅归入三型之一(合并共存 / 分层覆盖 / 启动期显式报错),归档含复现步骤与 UI 结果
- 共存状态可逆:移除任一/全部插件后 UI 恢复对应基线,无残留
