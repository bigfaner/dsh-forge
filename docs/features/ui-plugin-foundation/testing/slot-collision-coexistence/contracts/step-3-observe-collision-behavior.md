---
journey: "slot-collision-coexistence"
step: 3
step-action: "打开界面观察撞键行为"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/journey.md
skip_eval: true
state-verification: partial
---

# Contract: slot-collision-coexistence / Step 3: 打开界面观察撞键行为

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "两个插件(hello-world + 撞键复制品)已同时记入 profile bundle 清单(Step 2 通过);观察通道就绪(可复现步骤记录 + 截图/DOM 采集);ui-slots 声明合并机制行为待观察"
  fixture_spec:
    entities:
      - entity_type: "SelfInstallableProfile"
        min_count: 1
        field_constraints:
          - field: "installed_plugins"
            value: "both hello-world and collision fixture present"
      - entity_type: "CollidedSlotKey"
        min_count: 1
        field_constraints:
          - field: "declarers"
            value: "two distinct plugins declare the same slot key"
- Input: "打开/重载官方 dsh web,观察同名槽位键处的实际 UI 结果(两插件声明的组件如何解析)"
- Output: "撞键行为被观察并归入且仅归入三型之一:合并共存(多源声明聚合)/ 分层覆盖(显式分层规则解析,类 CSS 级联,先前占位者留在账本)/ 启动期显式报错(非法贡献启动校验期可见,register 调用显式抛出);行为可观察、可归因"
- State: "观察结论与归因(冲突插件与槽位键)形成记录,可进入 Step 4 归档"
- Side-effect: "截图/DOM 证据采集"
- Invariants: "观察结果必须能定位到冲突插件与槽位键"

## Outcome "silent-latter-overrides"
<!-- source: journey edge case 3b -->
- Preconditions: "后装插件的声明静默覆盖先装声明,界面无任何冲突提示、无分层痕迹可观察"
  fixture_spec:
    entities:
      - entity_type: "CollidedSlotKey"
        min_count: 1
        field_constraints:
          - field: "resolution_behavior"
            value: "latter declaration silently overrides, no conflict hint, no layering trace"
- Input: "执行观察并按 SC6 判定"
- Output: "判为未通过——「静默后者覆盖且不可观察」是 SC6 明确的失败态;须触发修正路线(如改用显式声明形态或启动期校验)后重测,不得归档为合法三型之一"
- State: "该观察结果不进入合法归档;修正路线任务被触发"
- Side-effect: "none"

## Outcome "startup-explicit-error"
<!-- source: journey edge case 3c -->
- Preconditions: "ui-slots 声明合并机制对撞键采取启动校验期显式报错策略(三型之第三型;如相同 cell id 同优先级的 tie 注册被注册表显式拒绝)"
  fixture_spec:
    entities:
      - entity_type: "CollidedSlotKey"
        min_count: 1
        field_constraints:
          - field: "resolution_behavior"
            value: "startup-time explicit error (e.g. registry rejects exact-tie registration with a throw)"
- Input: "装配两插件后启动/重载界面"
- Output: "报错显式可见、信息可归因到冲突的插件与槽位键;用户移除其一即可恢复——错误可诊断、可恢复,不出现无提示的白屏/卡死"
- State: "报错态可恢复(移除其一回到单声明方基线);结论归入启动期显式报错型"
- Side-effect: "none"

## Journey Invariants

- 撞键行为始终可观察、可归因(可定位到冲突插件与槽位键);「静默后者覆盖且不可观察」即失败
- 撞键复制品与 hello-world 经同一标准装配机制(dsh plugin add)安装,fixture 无任何特判通道
- 宿主基座核心界面在第三方槽位撞键全程保持可用
- 观察到的撞键行为必须归入且仅归入三型之一(合并共存 / 分层覆盖 / 启动期显式报错),归档含复现步骤与 UI 结果
- 共存状态可逆:移除任一/全部插件后 UI 恢复对应基线,无残留
