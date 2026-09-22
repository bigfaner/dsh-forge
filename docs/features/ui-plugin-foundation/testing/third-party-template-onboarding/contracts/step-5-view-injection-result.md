---
journey: "third-party-template-onboarding"
step: 5
step-action: "在官方 dsh web 界面看到注入结果"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/journey.md
skip_eval: true
state-verification: partial
---

# Contract: third-party-template-onboarding / Step 5: 在官方 dsh web 界面看到注入结果

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "自建插件已注入 profile(Step 4 通过);官方 dsh web 界面可打开;插件声明的目标槽位区域位于既有稳定基座面"
  fixture_spec:
    entities:
      - entity_type: "SelfInstallableProfile"
        min_count: 1
        field_constraints:
          - field: "installed_plugins"
            value: "contains the derived third-party plugin"
      - entity_type: "CoreSlot"
        min_count: 1
        field_constraints:
          - field: "target_region"
            value: "stable core slot region targeted by the plugin declaration"
- Input: "打开官方 dsh web 界面查看目标槽位区域"
- Output: "自建插件的槽位贡献在官方 UI 渲染——第三方用户零壳修改、零 vendored 引用地扩展了官方 dsh"
- State: "界面呈现含第三方插件贡献的完整视图;宿主核心功能不受影响"
- Side-effect: "none"
- Invariants: "渲染证明插件只经官方标准机制存在"

## Outcome "template-stamp-drift"
<!-- source: journey edge case 5b -->
- Preconditions: "vendored 基准升级后模板版本戳未同 diff bump(上游 0.1.x alpha 快速演进期)"
  fixture_spec:
    entities:
      - entity_type: "PluginTemplate"
        min_count: 1
        field_constraints:
          - field: "version_stamp"
            value: "not bumped in the same diff as the vendored baseline upgrade"
      - entity_type: "UpstreamLock"
        min_count: 1
        field_constraints:
          - field: "desktopHostVersion"
            value: "upgraded while the template stamp lags behind"
- Input: "经同源机制检查模板版本戳(或运行版本断言门禁)"
- Output: "同源版本戳机制将漂移显式可见(断言红灯即升级提醒,不静默);模板维护者按「断言与上游 SHA 升级任务同 diff bump」纪律修复"
- State: "漂移被红灯暴露;补齐 bump 后回绿"
- Side-effect: "none"

## Journey Invariants

- 全程零 vendored 树引用(源与产物),零 dsh-forge 壳代码修改——第三方插件只经官方 dsh web 的标准插件机制存在
- 对齐线依赖始终 exact 等于 desktopHostVersion,cordis 以独立版本线单列 exact(不与宿主版本比对)
- 模板文档全程不要求读者接触 dsh-forge 仓的 vendored 树
- 插件包体积与构建产物面保持 ui-goal 参照量级(小包)
