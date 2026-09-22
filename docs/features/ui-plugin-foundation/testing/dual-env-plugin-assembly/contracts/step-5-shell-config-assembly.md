---
journey: "dual-env-plugin-assembly"
step: 5
step-action: "在 dsh-forge 壳内经产品级配置装配同一插件"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/journey.md
skip_eval: true
state-verification: partial
---

# Contract: dual-env-plugin-assembly / Step 5: 在 dsh-forge 壳内经产品级配置装配同一插件

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "dsh-forge 壳可启动;hello-world 已按产品级配置(plugin-bundles.json)登记为内置 bundle(装配走配置路径,无新增壳内硬编码);官方 dsh web 侧装配证据(Step 2-4)已采集可对比"
  fixture_spec:
    entities:
      - entity_type: "PluginBundleConfig"
        min_count: 1
        field_constraints:
          - field: "entries"
            value: "contains @dsh-forge/plugin-hello-world as built-in bundle"
      - entity_type: "ShellEnvironment"
        min_count: 1
      - entity_type: "DualEnvEvidence"
        min_count: 1
        field_constraints:
          - field: "official_web_side"
            value: "DOM/screenshot evidence of steps 2-4 collected"
- Input: "启动 dsh-forge 壳(hello-world 经产品级配置登记为内置 bundle)"
- Output: "同一基座槽位面板与自有子槽位在壳内渲染,呈现与官方 dsh web 环境一致(双环境一致性);壳内装配不引入新的壳内硬编码"
- State: "壳内 userData profile 完成装配;两锚解析(host-profile/index.ts 投影 + HOST_RUNTIME_DIR)与版本对齐在壳内同样成立"
- Side-effect: "壳侧装配证据(DOM/截图)归档"
- Invariants: "配置为插件树唯一事实源;HOST_PROFILE_BUNDLES 类常量保持迁出壳代码状态"

## Outcome "config-bypass-hardcode"
<!-- source: journey edge case 5b -->
- Preconditions: "壳内装配绕开产品级配置(残留硬编码清单或第二事实源)"
  fixture_spec:
    entities:
      - entity_type: "ShellAssemblySource"
        min_count: 1
        field_constraints:
          - field: "derivation"
            value: "hardcoded bundle list or second source of truth, bypassing plugin-bundles.json"
- Input: "检查壳内装配来源并核对壳代码 diff"
- Output: "识别为缺陷——配置必须是插件树唯一事实源,壳内装配不允许新的壳内硬编码;HOST_PROFILE_BUNDLES 保持迁出壳代码状态"
- State: "缺陷状态被标记;修正后装配来源回到配置派生"
- Side-effect: "none"

## Outcome "dual-env-divergence"
<!-- source: journey edge case 5c -->
- Preconditions: "同一插件在两侧环境的渲染或交互行为出现漂移(槽位解析、样式 tokens、交互行为任一不一致)"
  fixture_spec:
    entities:
      - entity_type: "DualEnvEvidence"
        min_count: 1
        field_constraints:
          - field: "comparison"
            value: "official dsh web evidence and shell evidence diverge on rendering or interaction"
- Input: "对比两侧环境的 DOM/截图证据"
- Output: "不一致被标记为未通过——双环境一致性是可移植性证据;差异点可归因(槽位解析/样式 tokens/交互行为)"
- State: "该验收腿判未通过;不产生可移植性通过结论"
- Side-effect: "none"

## Journey Invariants

- 壳内插件树装配唯一派生自产品级配置,全程不出现新的壳内硬编码清单(bundle 清单焊死缺陷不得回归)
- 插件构建产物的模块来源在任何步骤都零 vendored 树引用(产物级校验绿灯)
- 两侧环境(官方 dsh web 与 dsh-forge 壳)对同一插件的渲染与交互行为一致
- 插件只走标准客户端插件 API(rpc/fetch/stream,carrier 面以内),不引入新的壳内进程内代码路径
- 对齐线依赖始终 exact 等于 UpstreamLock.desktopHostVersion(当前 0.1.6-alpha.2),cordis 单列独立版本线
