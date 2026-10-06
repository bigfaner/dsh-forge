---
journey: "workspace-registration-derived-path"
step: 3
step-action: "确认注册"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/workspace-registration-derived-path/journey.md
anchors:
  web:
    page: "注册表单（确认门）"
    route: ""
    requires_auth: false
    layout: "flows/add-project/RegisterForm（确认按钮 + DerivedTaskStoreRow）"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: workspace-registration-derived-path / Step 3: 确认注册

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: session-expired N/A — 本地单人工作台无服务端会话凭据（旅程级裁决）。validation-error 由本步骤表单确认门承载（见 validation-error-confirm-gated Outcome——surface-web 规则必派生项）。 -->

## Outcome "success"
- Preconditions: "表单已选定工作区目录且派生行 ready；无字段校验问题；目标存储目录不存在且无同扁平化主体异 hash8 的既有目录（正常新建态）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "selectedInForm"
            value: true
      - entity_type: "TaskStoreDir"
        min_count: 1
        relationship_type: "has_one"
        parent_entity: "WorkspaceDir"
        field_constraints:
          - field: "exists"
            value: "将由本步骤创建（注册前不存在）"
- Input: "确认注册提交（点击「确认」）"
- Output: "注册成功 + 建库（含发现面只读扫描建行——docs/features 与 docs/proposals 目录约定扫描）；实际建库位置与展示串逐字一致（SC2 单源断言）"
- State: "中央 state.db 落项目行；每工作区 forge.db 建库（v1 schema + 七表 + 发现面行：features / feature_documents / proposals）；任务库目录 {tasksHome}/{flatten}@{hash8} 创建"
- Side-effect: "文件系统建目录 + 建库；注册闭包尾部不发射任务事件（forge 域事件发射归任务四域写动词）"

## Outcome "suspected-move-rejected"
- Preconditions: "目标存储目录不存在，但发现同扁平化主体、异 hash8 的既有目录（疑似移动）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "selectedInForm"
            value: true
      - entity_type: "TaskStoreDir"
        min_count: 1
        relationship_type: "has_one"
        parent_entity: "WorkspaceDir"
        field_constraints:
          - field: "relation"
            value: "同扁平化主体异 hash8 的孤儿目录（疑似移动自标的）"
- Input: "确认注册"
- Output: "拒绝注册并给出手工指引（删除孤儿目录或改回原名；ERR_SUSPECTED_MOVE，data 带指引文案）；表单错误条 + 指引留场"
- State: "拒绝发生在中央行落库之前——零副作用（不清理、不认领、不崩溃）；表单留场（确认钮因 suspected-move 态禁用）"
- Side-effect: "none"
- Invariants: "疑似移动 = 拒绝 + 手工指引，零副作用"

## Outcome "reselect-recheck-passes"
- Preconditions: "曾因疑似移动被拒绝（表单处于错误态）；用户已处置孤儿目录或改选了别的工作区目录，碰撞条件不再成立"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "selectedInForm"
            value: "重选后的目录（无同主体异 hash8 碰撞）"
      - entity_type: "TaskStoreDir"
        min_count: 1
        relationship_type: "has_one"
        parent_entity: "WorkspaceDir"
        field_constraints:
          - field: "collisionFree"
            value: true
    state_requirements:
      - description: "此前一次确认曾被 ERR_SUSPECTED_MOVE 拒绝（表单曾有错误态）"
        prerequisite_entity: "WorkspaceDir"
- Input: "重选目录后再次确认注册"
- Output: "复检通过，恢复正常确认（注册成功 + 建库）；错误条消退，派生行随重选更新"
- State: "同 success 形态（中央行 + 建库 + 发现面行）"
- Side-effect: "同 success 形态"

<!-- surface-required: web validation-error（表单提交步骤必派生） -->
## Outcome "validation-error-confirm-gated"
- Preconditions: "表单存在字段校验问题（必填字段空缺或非法——如项目名为空 / 目录未选定），或派生行处于非 ready 态"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "formFieldIssues"
            value: "存在至少一个校验问题（issues 非空）"
- Input: "在字段校验问题在场时尝试确认提交（点击「确认」）"
- Output: "确认被门禁拦截——确认按钮禁用（disabled = issues 非空 或 suspected-move 态）；相关字段近旁呈现问题提示（FieldIssue）；表单不提交、用户可修正后重试"
- State: "零提交、零库写入（校验门先于注册执行链）"
- Side-effect: "none"

<!-- source: inferred -->
<!-- reasoning: Fact Table M2_SUSPECTED_MOVE_TRISTATE 注册碰撞三态之幂等复用 + M2_REGISTER_IDEMPOTENT_HINT（RegisterForm.tsx:185-190）：已注册目录在表单呈现「已注册」StateChip + 幂等返回提示，确认走 attachedToExisting 幂等径——重复注册是一等表单态而非错误。 -->
## Outcome "already-registered-idempotent-reuse"
- Preconditions: "选定的工作区目录已在中央注册（canonical 路径精确命中既有项目）；派生目录在场且 hash 一致"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "canonicalWsPath"
            value: "与表单选定目录 canonical 相等"
      - entity_type: "WorkspaceDir"
        min_count: 1
        relationship_type: "has_one"
        parent_entity: "Project"
      - entity_type: "TaskStoreDir"
        min_count: 1
        relationship_type: "has_one"
        parent_entity: "WorkspaceDir"
        field_constraints:
          - field: "hash8Consistent"
            value: true
- Input: "确认注册（对已注册目录再次提交）"
- Output: "幂等返回既有项目（挂接既有工作区，不重复登记）——表单事前呈现「已注册」StateChip 与幂等提示；不报错、不建重复库"
- State: "中央零重复行；既有任务库原样（幂等径只做库在场确认，缺席补建 + 扫描）"
- Side-effect: "none（幂等复用零新建）"

## Journey Invariants

- 派生路径单源：展示串由 core 派生经 RPC 下发，与实际建库位置逐字一致（SC2 断言锚）
- 建库位置恒为 {dsh-forge-home}/{扁平化}@{hash8}（hash8 = 原路径 sha-256 前 8 hex 消歧后缀）
- 疑似移动 = 拒绝 + 手工指引，零副作用（不清理、不认领、不崩溃）
- 注册写动作只经 core 单门（表单确认不绕过建库协作者）

## Fixture Specification

This Contract requires the following pre-existing data state. See `rules/fixture-spec.md` for schema details.

```yaml
fixture_spec:
  entities:
    - entity_type: "WorkspaceDir"
      min_count: 1
      field_constraints:
        - field: "selectedInForm"
          value: true
    - entity_type: "TaskStoreDir"
      min_count: 1
      relationship_type: "has_one"
      parent_entity: "WorkspaceDir"
    - entity_type: "Project"
      min_count: 1
      relationship_type: "has_one"
      parent_entity: "WorkspaceDir"
```
