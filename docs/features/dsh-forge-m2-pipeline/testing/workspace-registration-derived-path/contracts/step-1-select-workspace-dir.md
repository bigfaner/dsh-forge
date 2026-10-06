---
journey: "workspace-registration-derived-path"
step: 1
step-action: "选择工作区目录"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/workspace-registration-derived-path/journey.md
anchors:
  web:
    page: "注册表单（hero CTA / 侧栏 ＋ 入口）"
    route: ""
    requires_auth: false
    layout: "flows/add-project/RegisterForm（OS 目录选择器接入）"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: workspace-registration-derived-path / Step 1: 选择工作区目录

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A for 本步骤 — 目录选取 = 系统对话框动作，表单字段只读回填（无手动输入路径面；字段级校验在 Step 3 确认门承载）。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "hero CTA / 侧栏 ＋ 入口可达注册表单；OS 目录选择器可用（系统对话框一步）；tasksHome 已定（env DSH_FORGE_TASKS_HOME 覆盖 > {userData}/forge-workspaces 默认）；候选工作区目录在盘上存在"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "exists"
            value: true
    state_requirements:
      - description: "OS 原生目录选择对话框可用（桥在场；缺席时回退内嵌浏览器面板）"
        prerequisite_entity: "WorkspaceDir"
- Input: "从 hero CTA 或侧栏 ＋ 打开 OS 目录选择器，选定工作区目录"
- Output: "选定目录一步回填注册表单（系统对话框，无手动输入路径）——工作区目录字段只读回填，项目名自动取文件夹名"
- State: "表单值更新（workspaceDir + 派生联动 relink：未手改字段随新工作区重构）；触发派生行预检（forge:projects/deriveTaskStoreDir RPC 取数）"
- Side-effect: "none（纯表单态；无库写入、无目录创建）"

## Outcome "reselect-updates-derive-row"
- Preconditions: "表单已展示某目录 A 的派生路径（派生行处于 ready 态）；另一候选目录 B 在盘上存在；用户重开选择器"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 2
        field_constraints:
          - field: "roles"
            value: "A = 当前表单选定（派生行已呈现其串）；B = 重选目标"
    state_requirements:
      - description: "表单已选定目录 A，派生行已呈现 A 的 {tasksHome}/{flatten}@{hash8} 串"
        prerequisite_entity: "WorkspaceDir"
- Input: "重新选择另一工作区目录 B"
- Output: "派生行随目录变化更新（扁平化主体与 hash8 相应变化），表单不残留旧值；换选复检期间派生行呈 loading 态直至新值就绪"
- State: "表单 workspaceDir = B；派生行相位机经历 loading → ready(B 的派生串)；未手改字段随 relink 重构"
- Side-effect: "none"

<!-- source: inferred -->
<!-- reasoning: P1 Fact FLOW_PHASES（add-project 流程相位 + cancel/close 意图）与 BrowsePanel onBack「返回表单（不改值——取消点在 dsh create 之前，零副作用）」（RegisterForm.tsx:245）：取消是流程的一等相位，原生选择器取消 = 无路径返回 = 表单不变。 -->
## Outcome "picker-cancel-unchanged"
- Preconditions: "注册表单已打开，用户触发目录选择器；盘上存在可浏览目录；用户在系统对话框中取消而非确认"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
    state_requirements:
      - description: "表单当前无选定目录或保有既有选定值（取消前的表单态）"
        prerequisite_entity: "WorkspaceDir"
- Input: "打开 OS 目录选择器后取消（不选定任何目录）"
- Output: "表单保持取消前状态（无新路径回填、无错误提示）；用户可再次发起选择"
- State: "零变更（取消点在注册执行之前，零副作用）"
- Side-effect: "none"

<!-- source: inferred -->
<!-- reasoning: Fact Table 前端侦察（RegisterForm.tsx:218-222）：nativePickError 非 null 时渲染 data-dswf-rf-np-error「目录选择失败：{原因}」告警行——选择器失败是一等错误展示面（role=alert）。 -->
## Outcome "picker-failure-error-shown"
- Preconditions: "OS 目录选择器调用失败（桥错误或系统对话框不可用，nativePickError 非 null）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "selectable"
            value: false
- Input: "发起目录选择，选择器返回失败"
- Output: "表单呈现目录选择失败告警（含失败原因文本，role=alert 可达性标注）；表单留场可重试"
- State: "表单保有既有值（无路径回填）；无库写入"
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
      field_constraints:
        - field: "exists"
          value: true
```
