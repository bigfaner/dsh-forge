---
journey: "third-party-template-onboarding"
step: 4
step-action: "安装进官方 dsh web(装进宿主第一步)"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/journey.md
skip_eval: true
state-verification: full
---

# Contract: third-party-template-onboarding / Step 4: 安装进官方 dsh web(装进宿主第一步)

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "构建产物就绪(Step 3 通过);官方 dsh web 环境可用,用户拥有可自装的 profile;engines 式兼容声明与 exact 依赖已声明"
  fixture_spec:
    entities:
      - entity_type: "DerivedPluginPackage"
        min_count: 1
        field_constraints:
          - field: "build_artifacts"
            value: "complete artifact set, vendor-free"
      - entity_type: "SelfInstallableProfile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "OfficialDshWebEnvironment"
- Input: "对自己的官方 dsh web profile 执行 dsh plugin add 装入自建插件"
- Output: "注入成功:插件记入 profile bundle 清单,node_modules 物化完成;engines 式兼容声明被宿主接受,无版本冲突警告"
- State: "profile bundle 清单含自建插件;profile node_modules 完成物化"
- Side-effect: "装配写入用户自己的 profile(可移除恢复)"
- Invariants: "只经标准客户端插件机制安装"

## Outcome "injection-failure"
<!-- source: journey edge case 4b — Web surface validation-error derivation: 槽位键/产物形态非法腿 -->
- Preconditions: "插件声明的槽位键非法/不存在,或构建产物形态不符合客户端插件契约"
  fixture_spec:
    entities:
      - entity_type: "DerivedPluginPackage"
        min_count: 1
        field_constraints:
          - field: "defect"
            value: "invalid/absent slot key declaration or artifact shape violating the client plugin contract"
- Input: "执行 dsh plugin add 并打开界面"
- Output: "失败显式可见且带诊断指向(区别于静默不渲染);用户按提示修正后重试可成功"
- State: "修正后重试装配成功;无静默半装配残留"
- Side-effect: "none"

## Journey Invariants

- 全程零 vendored 树引用(源与产物),零 dsh-forge 壳代码修改——第三方插件只经官方 dsh web 的标准插件机制存在
- 对齐线依赖始终 exact 等于 desktopHostVersion,cordis 以独立版本线单列 exact(不与宿主版本比对)
- 模板文档全程不要求读者接触 dsh-forge 仓的 vendored 树
- 插件包体积与构建产物面保持 ui-goal 参照量级(小包)
