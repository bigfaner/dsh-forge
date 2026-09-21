---
journey: "version-consistency-assertion"
step: 1
step-action: "当前对齐状态跑绿灯"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/version-consistency-assertion/journey.md
skip_eval: true
state-verification: full
---

# Contract: version-consistency-assertion / Step 1: 当前对齐状态跑绿灯

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "断言已接入既有 CI/质量门(vitest tests/verify-plugins.spec.ts + CLI pnpm verify:plugins 双入口);vendor/upstream.lock.json 在位且 desktopHostVersion = 0.1.6-alpha.2(SHA c36ba648);当前树的对齐线依赖均为 exact 0.1.6-alpha.2,cordis peer 为 exact 4.0.2"
  fixture_spec:
    entities:
      - entity_type: "UpstreamLock"
        min_count: 1
        field_constraints:
          - field: "desktopHostVersion"
            value: "0.1.6-alpha.2"
          - field: "pinnedSha"
            value: "c36ba648dc106d21fb32562793b3e3b9c8922bc4"
      - entity_type: "PluginPackage"
        min_count: 1
        field_constraints:
          - field: "alignment_deps"
            value: "every @deepseek-ai/dsh-client-* dependency exact 0.1.6-alpha.2"
          - field: "cordis_peer"
            value: "exact 4.0.2 on its own independent line"
    state_requirements:
      - description: "assertion gate wired into CI/quality gate and runs on change"
        prerequisite_entity: "UpstreamLock"
- Input: "在当前树上运行版本断言门禁(pnpm test 内的 verify-plugins 腿或 pnpm verify:plugins)"
- Output: "绿灯——对齐线依赖 exact 等于 UpstreamLock.desktopHostVersion(0.1.6-alpha.2);cordis peer(4.0.2)作为独立版本线单列,仅校验 exact 锁定、不与 desktopHostVersion 比对,不产生误报"
- State: "门禁通过状态;工程状态零修改(断言只读)"
- Side-effect: "none"
- Invariants: "断言只读版本声明与锁基准,不修改任何工程状态"

## Outcome "cordis-misfiled-false-positive"
<!-- source: journey edge case 1b -->
- Preconditions: "断言实现把 cordis peer 也拿来与 desktopHostVersion 比对(未按独立版本线单列)"
  fixture_spec:
    entities:
      - entity_type: "AssertionImplementation"
        min_count: 1
        field_constraints:
          - field: "comparison_set"
            value: "cordis wrongly included in the desktopHostVersion comparison"
- Input: "运行断言门禁"
- Output: "判为实现缺陷——cordis 必须单列(仅校验 exact 锁定),当前树必须绿灯无误报;误报会淹没真失配信号,不可接受"
- State: "缺陷被标记并修复;修复后当前树绿灯"
- Side-effect: "none"

## Journey Invariants

- 断言比对集显式界定且稳定:对齐线依赖族(@deepseek-ai/dsh-client-* 前缀)与 cordis 独立版本线,不因新增包而漂移界定
- 断言结果只有显式红/绿两态,无静默通过路径;红灯复现证据可归档
- 断言作为 CI/质量门的一部分随变更自动运行,不依赖人工自觉
- 断言只读版本声明与锁基准,不修改任何工程状态
