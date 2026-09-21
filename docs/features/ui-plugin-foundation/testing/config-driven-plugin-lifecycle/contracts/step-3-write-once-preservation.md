---
journey: "config-driven-plugin-lifecycle"
step: 3
step-action: "确认存量投影的写一次语义未被破坏"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/journey.md
skip_eval: true
state-verification: full
---

# Contract: config-driven-plugin-lifecycle / Step 3: 确认存量投影的写一次语义未被破坏

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "Step 2 已完成(新增条目调和已执行);既有 userData profile 投影中存在未被本次配置变更涉及的其他插件条目物化(写一次语义存量)"
  fixture_spec:
    entities:
      - entity_type: "UserDataProfileProjection"
        min_count: 1
      - entity_type: "MaterializedBundle"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "UserDataProfileProjection"
        field_constraints:
          - field: "touched_by_config_change"
            value: false
- Input: "用户检查既有 userData profile 投影中未被配置变更涉及的条目"
- Output: "「存在即跳过」语义保持——既有物化未被推倒重建;其他插件条目的投影保持原状(内容与时间戳层面无重建痕迹),无损坏"
- State: "存量条目的 profile 物化保持不变;profile manifest 中这些条目保持既有顺序与声明"
- Side-effect: "none"
- Invariants: "配置变更默认不自动传播到存量 profile 的未涉及条目"

## Outcome "stale-version-materialization"
<!-- source: journey edge case 3b -->
- Preconditions: "存量 profile 中该条目的物化是旧版本(写一次语义下未被更新),配置条目指向新版本"
  fixture_spec:
    entities:
      - entity_type: "MaterializedBundle"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "UserDataProfileProjection"
        field_constraints:
          - field: "version"
            value: "older than the version referenced by the config entry"
      - entity_type: "PluginBundleConfig"
        min_count: 1
        field_constraints:
          - field: "entry_version"
            value: "newer than the profile materialization"
- Input: "用户启动壳并观察该条目的装配形态"
- Output: "行为按落档的对账/写一次语义确定且可预测(保持既有物化,或按落档裁决升级);不出现静默的半新半旧装配或投影损坏;结果可归因到落档语义"
- State: "最终装配形态与落档语义一致且确定;M2 UF6 启停读写同一配置的前提不被破坏"
- Side-effect: "none"

## Outcome "fallback-links-preserved"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-017/FT-019(host-profile/index.ts: 上游自有的 .dsh-module-fallback/ 链接属上游 boot 自愈产物,调和永不触碰)——存量投影检查须覆盖「调和不得越界清理上游自愈面」这一边界 -->
- Preconditions: "存量 userData profile 中存在上游自有的 .dsh-module-fallback/ 模块回退链接(上游每次 boot 自愈的产物),与本次配置变更无关"
  fixture_spec:
    entities:
      - entity_type: "UserDataProfileProjection"
        min_count: 1
        field_constraints:
          - field: "module_fallback_links"
            value: "upstream-owned .dsh-module-fallback/ links present"
- Input: "用户在调和执行后检查该上游自有链接区"
- Output: "上游自有的 .dsh-module-fallback/ 链接保持原状(不被清理/失效/改写)——写一次语义检查的对象边界清晰:壳只管自己的投影,上游自愈面归上游"
- State: "上游自愈链接区内容不变;上游 host 下次 boot 的自愈行为不受影响"
- Side-effect: "none"

## Journey Invariants

- 配置增删两次操作的壳代码 diff = 0(配置是插件树唯一事实源,壳代码常量清单不得回归)
- 产品清单条目对运行时启停只读(产品级配置不被第二写入方破坏)
- 对账/调和只做清理与失效,不发明旁路装配通道(dsh 插件机制为唯一装配机制)
- 配置化改动不引入壳启动回归(冷启动预算内),M1 验收面(SC7/SC9)保持绿
- 离线自足、进程足迹 = 2、无监听端口等 M1 NFR 在增删全程不被破坏
