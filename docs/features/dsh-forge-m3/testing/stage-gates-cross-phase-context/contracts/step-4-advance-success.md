---
journey: "stage-gates-cross-phase-context"
step: 4
step-action: "推进成功"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-context/journey.md
anchors:
  web:
    page: "工作台 · Feature 看板(UF2 阶段化扩展)"
    route: "workbench/features/:slug"
    requires_auth: false
    layout: "WorkbenchShell → FeatureDetail(AdvanceStageButton + StatusStepper)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: stage-gates-cross-phase-context / Step 4: 推进成功

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
<!-- facts: FT-081(advanceStage 为阶段字段唯一内核写面:原位替换、其余字段保留、缺 manifest 创建最小件;成功推进写文件 + 快照对、清偏离(保留外部变更时间审计)、推送 stage_advanced) -->
- Preconditions: "feature 处于中间阶段(tasks)且当前阶段总结已生成(stages/<当前阶段>.md 存在,门满足;此前无成功推进记录,本次为首次生效推进)"
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
          - field: "status"
            value: "tasks(中间阶段,首次待推进)"
      - entity_type: "ManifestFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "frontmatter.status"
            value: "tasks(与 feature 当前阶段一致;原位替换的观察基线)"
      - entity_type: "StageAsset"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "stage"
            value: "与 feature 当前阶段一致(门资产在场)"
- Input: "用户再次请求推进"
- Output: "推进成功;阶段 stepper 前移(阶段推进至管线下一阶段)"
- State: "阶段字段经唯一内核写面更新(其余字段与正文原文保留);详情呈现同步刷新;偏离标记清除(合法推进 = 偏离清除点,外部变更时间保留审计);阶段推进事件(stage_advanced)推送"
- Side-effect: "manifest 文件写入(阶段字段原位替换;原缺失时创建最小 manifest)"
- Invariants: "manifest 写入仅经 advanceStage 内核路径"

## Outcome "multi-advance-accumulation"
<!-- facts: FT-084(资产登记按 项目/feature/阶段 三元唯一,同阶段恒单份;内容留文档根文件,登记为可弃重建的派生索引) -->
- Preconditions: "feature 已先后完成多次阶段推进,当前处于其后阶段(先行阶段资产 ≥2 齐全;本结果为浏览观察,非推进请求)"
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
          - field: "status"
            value: "in-progress(已多次推进)"
      - entity_type: "StageAsset"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "stage"
            value: "管线序中互异的前行阶段"
- Input: "用户打开「阶段资产」面板逐阶段浏览"
- Output: "各阶段资产按阶段完整累积、可回溯;面板内容与文档根文件一致"
- State: "资产登记按项目/feature/阶段三元累积(同阶段恒单份);内容留文档根文件"
- Side-effect: "none"
- Invariants: "内容留文件、元数据入 SQLite;面板与文档根一致"

## Outcome "manifest-unreadable-rejected"
<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,映射为推进动作作用于不可解析 manifest 状态时的近动作位可观察拒绝(推进前状态校验失败) -->
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-081(advance-service.ts:234-294):malformed YAML → ERR_STAGE_MANIFEST_UNREADABLE refusing to merge;推进是本旅程唯一用户写动作,其状态校验失败即 validation-error 的同构边界 -->
<!-- facts: FT-081 -->
- Preconditions: "feature 的 manifest 阶段头部不可解析(损坏 YAML);当前阶段总结即便在场"
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
          - field: "status"
            value: "tasks(中间阶段)"
      - entity_type: "ManifestFile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "content"
            value: "YAML 损坏(frontmatter 阶段字段不可解析)"
- Input: "用户请求推进该 feature"
- Output: "推进被拒:错误(ERR_STAGE_MANIFEST_UNREADABLE)在推进动作位附近呈现;feature 阶段不变;manifest 原文零改动(拒绝合并写入)"
- State: "推进零生效(零写入、零事件);门资产判定不因此变更"
- Side-effect: "none"
- Invariants: "manifest 原文不被破坏性改写;推进零生效"

## Journey Invariants

- 阶段推进门为编排层硬门:总结未生成必拒绝推进;门校验与产物检查均为确定性代码(断言无模型参与)
- 阶段资产内容留文件、元数据入 SQLite;工作台呈现恒只读(白名单渲染)
- 外部会话永不硬阻断(零宿主侵入);偏离仅呈现
- 上下文跨阶段不断裂:阶段推进后新阶段会话必携带目标 + 摘要(强制注入)
