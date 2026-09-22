---
journey: "slot-collision-coexistence"
step: 4
step-action: "落档撞键结论移交 M2"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/journey.md
skip_eval: true
state-verification: full
---

# Contract: slot-collision-coexistence / Step 4: 落档撞键结论移交 M2

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "Step 3 观察完成且行为已归入三型之一(可归因到冲突插件与槽位键);复现步骤与 UI 结果证据(截图/DOM)在位;spike 报告的撞键落档框架(三型归档结构)就位"
  fixture_spec:
    entities:
      - entity_type: "CollisionObservation"
        min_count: 1
        field_constraints:
          - field: "classified_type"
            value: "exactly one of merge-coexist / layered-override / startup-explicit-error"
          - field: "reproduction_steps"
            value: "present"
          - field: "ui_evidence"
            value: "screenshot/DOM evidence attached"
      - entity_type: "SpikeReport"
        min_count: 1
        field_constraints:
          - field: "collision_archive_section"
            value: "three-type framework ready to receive entries"
- Input: "将复现步骤与观察到的 UI 结果按三型归档进 spike 报告,作为 M2 真实工作台槽位设计的前置输入移交"
- Output: "结论入 spike 报告(SC6 验收件):三型归属 + 复现步骤 + UI 结果证据;无论落哪一型,归档完整可复现"
- State: "spike 报告含撞键结论条目;M2 槽位设计的前置输入就绪"
- Side-effect: "spike 报告文档更新(文档态变更,非产品状态)"

## Outcome "incomplete-archive"
<!-- source: journey edge case 4b -->
- Preconditions: "观察到了撞键行为但复现步骤或 UI 结果证据缺失(无法归型或无法复现)"
  fixture_spec:
    entities:
      - entity_type: "CollisionObservation"
        min_count: 1
        field_constraints:
          - field: "completeness"
            value: "reproduction steps or UI evidence missing"
- Input: "尝试按 SC6 归档"
- Output: "判为归档不完整——SC6 要求含复现步骤与观察到的 UI 结果;补齐证据后方可作为 M2 前置输入移交"
- State: "归档标记为不完整;不产生可移交的 M2 前置输入"
- Side-effect: "none"

## Journey Invariants

- 撞键行为始终可观察、可归因(可定位到冲突插件与槽位键);「静默后者覆盖且不可观察」即失败
- 撞键复制品与 hello-world 经同一标准装配机制(dsh plugin add)安装,fixture 无任何特判通道
- 宿主基座核心界面在第三方槽位撞键全程保持可用
- 观察到的撞键行为必须归入且仅归入三型之一(合并共存 / 分层覆盖 / 启动期显式报错),归档含复现步骤与 UI 结果
- 共存状态可逆:移除任一/全部插件后 UI 恢复对应基线,无残留
