---
journey: "spike-conclusion-fallback"
step: 4
step-action: "落档分发形态结论与离线自足兼容性"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/journey.md
skip_eval: true
state-verification: full
---

# Contract: spike-conclusion-fallback / Step 4: 落档分发形态结论与离线自足兼容性

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "候选分发形态可验证(npm 物化 / tarball 内置 / 预播种);离线验证环境可用;报告两栏结构就位"
  fixture_spec:
    entities:
      - entity_type: "DistributionForm"
        min_count: 1
        field_constraints:
          - field: "candidates"
            value: "npm materialization / tarball built-in / pre-seeding, at least one verifiable"
      - entity_type: "OfflineVerificationEnv"
        min_count: 1
- Input: "验证 hello-world 到达打包态/离线壳的分发形态并离线启动验证"
- Output: "分发形态结论落档(由 spike 定夺其一);该形态与离线自足 NFR 的兼容性声明显式落档(离线装配+启动全程无网络依赖)"
- State: "spike 报告含分发结论 + 兼容性声明(二者同报告、不可拆分)"
- Side-effect: "spike 报告文档更新"
- Invariants: "分发形态结论与离线自足兼容性声明同报告落档"

## Outcome "offline-conflict"
<!-- source: journey edge case 4b -->
- Preconditions: "领先候选形态(如 npm 物化)在离线壳内装配或启动需要网络"
  fixture_spec:
    entities:
      - entity_type: "DistributionForm"
        min_count: 1
        field_constraints:
          - field: "network_requirement"
            value: "offline assembly or boot requires external network"
      - entity_type: "OfflineVerificationEnv"
        min_count: 1
- Input: "离线验证候选形态并落档"
- Output: "兼容性声明如实记录冲突,形态切换到兼容候选(tarball 内置 / 预播种);不允许「带冲突过关」或隐藏网络依赖"
- State: "分发结论更新为兼容候选;冲突记录在案"
- Side-effect: "none"

## Journey Invariants

- 三项未验证项每项都以「结论 + 独立退路」两栏落档,退路按项独立、不得互相挪用
- spike 操作只在抛弃型 scratch profile/环境上进行,不污染产品自身的 userData 状态与既有 profile
- 报告内联的源码级事实锚定唯一权威 checkout(SHA c36ba648 / 0.1.6-alpha.2),不传递依赖 Draft 文档现状
- spike 结论(含推翻假设的修正路线)先于 M2 UI 插件设计落档——无结论不开工
- 分发形态结论与离线自足 NFR 兼容性声明同报告落档,二者不可拆分
