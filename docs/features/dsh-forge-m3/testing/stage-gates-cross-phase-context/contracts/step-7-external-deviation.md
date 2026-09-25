---
journey: "stage-gates-cross-phase-context"
step: 7
step-action: "外部会话跨阶段操作的偏离呈现"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-context/journey.md
anchors:
  web:
    page: "工作台 · Feature 看板(UF2 阶段化扩展)"
    route: "workbench/features"
    requires_auth: false
    layout: "WorkbenchShell → FeaturesPage(偏离徽标 + 详情区偏离标识)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: stage-gates-cross-phase-context / Step 7: 外部会话跨阶段操作的偏离呈现

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
<!-- facts: FT-085(感知扫描前比对活性 manifest 与既有快照:不一致 → 偏离置位 + 外部变更时间 + deviation_detected 事件;扫描随后收敛快照,同一外部变更只报一次;呈现不阻断) -->
- Preconditions: "feature 处于已扫描快照在场的阶段;外部会话(终端/冻结 CC 插件)将 manifest status 改写为不同阶段(跨阶段操作)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "snapshotPresent"
            value: true
      - entity_type: "ManifestFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "frontmatter.status"
            value: "被外部改写为与快照不同的词表内阶段"
- Input: "用户以外部会话对该 feature 做跨阶段操作,回看 feature 看板"
- Output: "偏离标识可见;外部会话不被硬阻断;标识仅为呈现"
- State: "感知扫描前比对文档根 manifest 阶段与既有快照:不一致 → 偏离标记置位并记录外部变更时间;偏离事件(deviation_detected)推送;本轮扫描随后将快照收敛到文档根现状(同一外部变更只报一次)"
- Side-effect: "deviation_detected 事件;manifest 字节与 mtime 原样(零宿主侵入)"
- Invariants: "外部会话永不硬阻断(零宿主侵入);偏离仅呈现"

## Outcome "no-blocking-interaction"
<!-- facts: FT-085(偏离仅呈现、零阻断交互;标记持续至下次内核合法 advanceStage 清除) -->
- Preconditions: "偏离标识呈现中"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "deviated"
            value: 1
- Input: "用户点击偏离标识并继续正常编排操作"
- Output: "任何交互不产生阻断弹窗/锁定;正常派发与浏览照旧可用(标识仅呈现)"
- State: "偏离标记持续至下次内核合法推进(advanceStage 成功即清除);门拒绝与终态 no-op 不清除"
- Side-effect: "none"
- Invariants: "偏离不产生阻断交互"

## Journey Invariants

- 阶段推进门为编排层硬门:总结未生成必拒绝推进;门校验与产物检查均为确定性代码(断言无模型参与)
- 阶段资产内容留文件、元数据入 SQLite;工作台呈现恒只读(白名单渲染)
- 外部会话永不硬阻断(零宿主侵入);偏离仅呈现
- 上下文跨阶段不断裂:阶段推进后新阶段会话必携带目标 + 摘要(强制注入)
