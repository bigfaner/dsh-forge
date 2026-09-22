---
journey: "version-consistency-assertion"
step: 3
step-action: "检查模板侧版本戳可见性"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/version-consistency-assertion/journey.md
skip_eval: true
state-verification: full
---

# Contract: version-consistency-assertion / Step 3: 检查模板侧版本戳可见性

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "工程模板(packages/templates/plugin)携带 version-stamp.json(模板必备,插件可缺省);模板版本戳经同源机制可见(与断言同一机制);模板 engines 声明 exact 等于 desktopHostVersion"
  fixture_spec:
    entities:
      - entity_type: "PluginTemplate"
        min_count: 1
        field_constraints:
          - field: "version_stamp"
            value: "version-stamp.json present and matching the lock baseline"
          - field: "engines"
            value: "engines[\"@deepseek-ai/dsh\"] exact == desktopHostVersion"
      - entity_type: "UpstreamLock"
        min_count: 1
- Input: "经同源机制检查工程模板的版本戳"
- Output: "模板流出侧的版本同步同样可见、可断言——模板版本戳与锁基准一致;漂移会被同一门禁暴露"
- State: "模板侧版本同步状态确认;工程状态零修改(检查只读)"
- Side-effect: "none"
- Invariants: "模板版本戳与断言同源"

## Outcome "upgrade-bump-missed"
<!-- source: journey edge case 3b -->
- Preconditions: "vendored 基准(SHA/desktopHostVersion)已升级,插件依赖与模板版本戳未随同一 diff 更新"
  fixture_spec:
    entities:
      - entity_type: "UpstreamLock"
        min_count: 1
        field_constraints:
          - field: "desktopHostVersion"
            value: "upgraded to a newer version"
      - entity_type: "PluginTemplate"
        min_count: 1
        field_constraints:
          - field: "version_stamp"
            value: "stale — not bumped in the same diff as the lock upgrade"
      - entity_type: "PluginPackage"
        min_count: 1
        field_constraints:
          - field: "alignment_deps"
            value: "stale — still pinned to the pre-upgrade version"
- Input: "在升级后的树上运行断言门禁"
- Output: "红灯即升级提醒(不静默过期)——版本断言与上游 SHA 升级任务同 diff bump 的纪律由门禁守住;维护者完成对齐 bump 后回绿"
- State: "红灯暴露过期声明;完成对齐 bump 后全树回绿"
- Side-effect: "none"

## Journey Invariants

- 断言比对集显式界定且稳定:对齐线依赖族(@deepseek-ai/dsh-client-* 前缀)与 cordis 独立版本线,不因新增包而漂移界定
- 断言结果只有显式红/绿两态,无静默通过路径;红灯复现证据可归档
- 断言作为 CI/质量门的一部分随变更自动运行,不依赖人工自觉
- 断言只读版本声明与锁基准,不修改任何工程状态
