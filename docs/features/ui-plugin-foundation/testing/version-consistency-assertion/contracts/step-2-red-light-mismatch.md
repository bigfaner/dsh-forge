---
journey: "version-consistency-assertion"
step: 2
step-action: "人为错配触发红灯"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/version-consistency-assertion/journey.md
skip_eval: true
state-verification: full
---

# Contract: version-consistency-assertion / Step 2: 人为错配触发红灯

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "当前树处于绿灯基线(Step 1 通过);存在可归档的红灯复现证据通道;临时改动可自由实施与恢复"
  fixture_spec:
    entities:
      - entity_type: "PluginPackage"
        min_count: 1
        field_constraints:
          - field: "alignment_deps"
            value: "temporarily edited to a value mismatching desktopHostVersion"
      - entity_type: "UpstreamLock"
        min_count: 1
        field_constraints:
          - field: "desktopHostVersion"
            value: "0.1.6-alpha.2 (unchanged baseline)"
- Input: "临时把任一对齐线依赖版本改为与 desktopHostVersion 不一致的值(复现错配),再次运行断言门禁"
- Output: "红灯——断言失败且显式指出比对集中失配的条目(指明包、依赖字段与期望值);红灯复现证据归档(SC3 验收件);恢复 exact 后复跑回到绿灯"
- State: "错配复现为临时改动且证据归档;恢复后树回到绿灯基线"
- Side-effect: "红灯证据进入归档通道;工程状态经恢复操作回到原状"
- Invariants: "红灯显式可归因;复现为临时改动"

## Outcome "mutable-tag-redlight"
<!-- source: journey edge case 2b -->
- Preconditions: "对齐线依赖借 alpha dist-tag 定位(定位到现行线)但依赖声明中保留可变 tag 而非解析锁定的 exact 结果"
  fixture_spec:
    entities:
      - entity_type: "PluginPackage"
        min_count: 1
        field_constraints:
          - field: "alignment_deps"
            value: "mutable dist-tag (alpha) written directly in a dependency spec"
- Input: "运行断言门禁"
- Output: "红灯——可变 tag 不得直接写入依赖(纪律:借 tag 定位须解析并锁定为 exact 结果);tag 漂移即静默契约漂移的入口,门禁必须拦截"
- State: "红灯暴露可变 tag 声明;改为解析后的 exact 后回绿"
- Side-effect: "none"

## Journey Invariants

- 断言比对集显式界定且稳定:对齐线依赖族(@deepseek-ai/dsh-client-* 前缀)与 cordis 独立版本线,不因新增包而漂移界定
- 断言结果只有显式红/绿两态,无静默通过路径;红灯复现证据可归档
- 断言作为 CI/质量门的一部分随变更自动运行,不依赖人工自觉
- 断言只读版本声明与锁基准,不修改任何工程状态
