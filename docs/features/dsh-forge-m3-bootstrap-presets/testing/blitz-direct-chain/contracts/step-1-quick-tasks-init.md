---
journey: "blitz-direct-chain"
step: 1
step-action: "突击会话发起 quick-tasks"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/blitz-direct-chain/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: blitz-direct-chain / Step 1: 突击会话发起 quick-tasks

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（本步为会话内技能发起，无表单提交面；自由文本会话输入无字段级校验语义）; session-expired = N/A（本地单人工作台无登录态；会话连续性由平台会话常驻承载，非本步断言面） -->

## Outcome "success"
- Preconditions: "突击会话已确立（组合 = 突击预设，blank 锁前或后均可）；工作区已注册且每工作区 forge 库就绪；库中尚无该小需求对应的提案行"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "registered"
            value: true
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "blitz（customSkillDirs 仅含 plugin-forge 技能目录）"
- Input: "会话内以一句话发起 quick-tasks 技能（表达一个明确小需求）"
- Output: "产出提案行（五态 draft 起步，经 createProposal 落库）与任务清单（经 addTask 落库；任务 local_id 为纯整数顺延、无 stage-gate、eval 门豁免）；工具返回面为成功格式化文本（含提案锚与任务键清单）"
- State: "proposals 表新增一行（status=draft）；tasks 表新增若干行（挂该提案容器、mode 快照 = blitz）；无 feature 行、无文档域写入"
- Side-effect: "插件事件总线写入 logs/容器 slug.jsonl（提案与任务写入动词事件）；无文件系统文档产出"
- Invariants: "任务语义（整数 ID / 无 stage-gate / eval 豁免）由 mode 快照（blitz）决定，不随执行会话预设漂移"

## Outcome "mode-written-at-creation"
- Preconditions: "quick-tasks 已产出提案（提案行已落库，创建动作为 quick-tasks 技能经 createProposal）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "blitz"
          - field: "proposal_status"
            value: "draft"
          - field: "created_by"
            value: "quick-tasks（经 createProposal tool）"
- Input: "检查库中该提案行的 mode 溯源字段（读面查询）"
- Output: "mode 溯源字段 = blitz 且写入时机 = 创建时（非事后补写）；后续会话预设变更不影响该值"
- State: "库状态不变（只读核查）；mode 列值保持创建时快照"
- Side-effect: "none"
- Invariants: "溯源字段一经创建不被任何后续动词改写（模式唯一变更通道 = 提案子 tab 人工更改，且不改变既有任务语义快照）"

## Journey Invariants
- 突击链 gate 纪律不折扣：单写路径 / 执行记录 / 提交规范 / 验证门原样（不开全套 SDD 仪式 ≠ 免检）
- 任务语义由 mode 溯源（blitz）决定：整数 ID / 无 stage-gate / eval 门豁免——不随执行会话预设漂移
- 突击无 feature 阶段：提案与任务之外无中间层（无 feature 行 / 无文档域）
- 概览三视图即时口径：写入返回后单次重取即见新值（数据直读每工作区库，无 watch / 回流 / 快照同步）
