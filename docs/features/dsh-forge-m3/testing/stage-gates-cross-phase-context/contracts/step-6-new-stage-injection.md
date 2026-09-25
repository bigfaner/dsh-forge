---
journey: "stage-gates-cross-phase-context"
step: 6
step-action: "新阶段会话注入断言"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-context/journey.md
anchors:
  web:
    page: "工作台 · 任务看板(UF1 编排扩展)→ 上游会话视图"
    route: "workbench/tasks → session"
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage(派发)→ session 视图"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: stage-gates-cross-phase-context / Step 6: 新阶段会话注入断言

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
<!-- facts: FT-071(预合成三要素之 feature 目标/摘要 = 最近先行阶段资产,排除 feature 当前阶段自身的总结;确定性组装禁模型调用;组合消息 sha256 = prompt_hash);FT-070(派发必携非空预合成内容与定稿 hash);FT-068(可派发状态 = pending|blocked,in_progress 拒绝并提示「单执行者」);FT-059(派发要求 data_authority=sqlite) -->
- Preconditions: "feature 已推进至新阶段且先行阶段资产在场;项目存在可派发状态的任务;派发行记录可读取注入指纹与组合消息"
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
            value: "推进后的新阶段"
      - entity_type: "StageAsset"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "status"
            value: "pending ×1(可派发)+ in_progress ×1(对照:单执行者占用,不可派发)"
          - field: "task_type"
            value: "可派发类型键(非派发受限类型)"
- Input: "用户在新阶段发起任务派发(任务看板选择模式 → 派发确认链),派发后进入会话"
- Output: "派发确认链呈现预合成三要素说明;任务详情侧板呈现预合成要素就位标识;新阶段会话系统提示词强制包含 feature 目标 + 摘要 —— 断言载体 = 派发行记录(prompt_hash = 组合消息 sha256)与会话首条组合消息,经任务详情侧板派发记录读取;可派发集按任务状态界定:pending 任务可派发,对照 in_progress 任务被拒并提示「单执行者」原因"
- State: "预合成三要素之「feature 目标/摘要」= 最近先行阶段资产(排除 feature 当前阶段自身的总结);注入为确定性组装(禁模型调用);注入指纹随派发行落库"
- Side-effect: "subagent 会话创建与预合成注入(host 通道);派发行写入"
- Invariants: "上下文跨阶段不断裂:阶段推进后新阶段会话必携带目标 + 摘要(强制注入)"

## Outcome "host-channel-unavailable"
<!-- surface-web required_outcomes 映射:session-expired → 单用户桌面无登录态(页面图 Auth: none),映射为宿主会话通道不可用(宿主异常/凭据失效)时派发-会话链的失败态呈现 + 恢复引导,不静默 -->
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-073(dispatch-service.ts:224-255):notifyLaunchFailed → 派发行 failed + reason + 事件推送;step-6 会话链依赖宿主通道,通道失效为现实边界;同构映射先例 = task-dispatch-execution-loop step-5 channel-unavailable -->
<!-- facts: FT-073 -->
- Preconditions: "宿主会话通道不可用(宿主异常/凭据失效);存在已发起的派发(启动中/运行中)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "pending"
      - entity_type: "Dispatch"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "state"
            value: "starting 或 running"
    state_requirements:
      - description: "宿主会话通道不可用(宿主异常或凭据失效,测试通道注入)"
        prerequisite_entity: "Dispatch"
- Input: "用户发起派发/进入会话后察看任务看板编排条目状态"
- Output: "通道异常以编排错误/失败态呈现 + 失败原因 + 恢复引导(沿用错误呈现模式),不静默;通道恢复后可经重派发继续,不残留半状态编排条目"
- State: "受影响派发行进入 failed 态并记录原因;通道恢复后经重派发重新进入运行态,无中间残留态"
- Side-effect: "失败态事件推送"
- Invariants: "通道失败永不静默;不残留半状态"

## Journey Invariants

- 阶段推进门为编排层硬门:总结未生成必拒绝推进;门校验与产物检查均为确定性代码(断言无模型参与)
- 阶段资产内容留文件、元数据入 SQLite;工作台呈现恒只读(白名单渲染)
- 外部会话永不硬阻断(零宿主侵入);偏离仅呈现
- 上下文跨阶段不断裂:阶段推进后新阶段会话必携带目标 + 摘要(强制注入)
