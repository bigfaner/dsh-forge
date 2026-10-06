---
journey: "workspace-registration-derived-path"
step: 2
step-action: "查看任务清单只读行"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/workspace-registration-derived-path/journey.md
anchors:
  web:
    page: "注册表单派生行（升级）"
    route: ""
    requires_auth: false
    layout: "flows/add-project/RegisterForm 派生行位（DerivedTaskStoreRow）"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: workspace-registration-derived-path / Step 2: 查看任务清单只读行

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 派生行为只读展示面（值经 RPC 下发，无用户输入域）。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "注册表单已选定工作区目录；forge:projects/deriveTaskStoreDir RPC 可达；tasksHome 已定"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "selectedInForm"
            value: true
- Input: "查看注册表单的任务清单只读行"
- Output: "展示 {dsh-forge-home}/{扁平化}@{hash8} 全路径（扁平化主体为分隔符转连字符的 canonical 路径，hash8 = 路径 sha-256 前 8 hex 小写消歧后缀）；该串由应用侧单一来源下发（core 派生 + RPC 下发，web 侧不自算）"
- State: "派生行相位 = ready(dir)；无库写入（纯读预检位——表单预检在注册前）"
- Side-effect: "none"
- Invariants: "派生串单源 = core deriveTaskStoreDir（前端自算废除，禁自算回退）"

## Outcome "same-flatten-subject-disambiguation"
- Preconditions: "存在扁平化后主体相同的多个工作区路径（如仅分隔符或大小写拼写不同的路径，flatten 后同主体）；各自的 tasksHome 下已按各自 hash8 建有目录"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 2
        field_constraints:
          - field: "flattenSubject"
            value: "两路径扁平化后主体相同"
      - entity_type: "TaskStoreDir"
        min_count: 2
        relationship_type: "has_one"
        parent_entity: "WorkspaceDir"
        field_constraints:
          - field: "hash8Suffix"
            value: "互不相同"
- Input: "查看各自注册表单的派生行（两个工作区分别进入注册面）"
- Output: "hash8 消歧后缀正确区分——两派生串主体相同、hash8 相异，各自指向独立任务库目录；同主体异路径各自成库，不互串"
- State: "两个任务库目录并存（互不覆盖、互不认领）；无写入"
- Side-effect: "none"

<!-- source: inferred -->
<!-- reasoning: Fact Table M2_DERIVED_ROW_PHASE（derived-store-row.tsx:22-29）：派生行相位机含 loading 态（在途 / 换选目录复检中）——fetchDerivePhase 异步在途是 UI 可观测的过渡态，surface-web 规则 additional outcome「loading-state」的承载面。 -->
## Outcome "derive-in-flight-loading"
- Preconditions: "表单刚选定（或换选）目录，deriveTaskStoreDir RPC 在途未返回"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "selectedInForm"
            value: true
    state_requirements:
      - description: "派生 RPC 在途（fetchDerivePhase 未决）"
        prerequisite_entity: "WorkspaceDir"
- Input: "选定目录后立即查看任务清单只读行"
- Output: "派生行呈 loading 态（在途占位，不显示空串或旧值）；RPC 返回后转为 ready 或错误态"
- State: "表单派生行相位 = loading（瞬态）；无库写入"
- Side-effect: "none"

<!-- source: inferred -->
<!-- reasoning: Fact Table M2_DERIVED_ROW_PHASE（derived-store-row.tsx:22-29）：相位机含 error 态（RPC 失败）；派生虽为本地纯计算，但通道层失败（桥/宿主不可达）由该态承载——fail-loud 消费面。 -->
## Outcome "derive-rpc-error-state"
- Preconditions: "deriveTaskStoreDir RPC 调用失败（通道层错误，非业务错误）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "selectedInForm"
            value: true
    state_requirements:
      - description: "forge:projects/deriveTaskStoreDir 通道返回错误（非 ERR_SUSPECTED_MOVE 业务码）"
        prerequisite_entity: "WorkspaceDir"
- Input: "选定目录后查看派生行"
- Output: "派生行呈错误态（可辨识的错误呈现，不显示伪路径）；表单留场，可重试（重选目录复检）"
- State: "无库写入；派生行相位 = error"
- Side-effect: "none"

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
    - entity_type: "TaskStoreDir"
      min_count: 1
      relationship_type: "has_one"
      parent_entity: "WorkspaceDir"
```
