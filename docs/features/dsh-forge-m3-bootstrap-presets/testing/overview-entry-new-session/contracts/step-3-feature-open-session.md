---
journey: "overview-entry-new-session"
step: 3
step-action: "feature 行头点「打开新会话」"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/journey.md
anchors:
  web:
    page: "概览 · feature 子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（feature-tab.tsx 行头「打开新会话」）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: overview-entry-new-session / Step 3: feature 行头点「打开新会话」

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（旅程裁决：入口行为步无字段校验面——边界承载步 = Step 2b）; session-expired = N/A（旅程裁决：本地化 = 草稿/会话连续性，承载步 = Step 1e——本步无连续性断言面） -->

## Outcome "success"
- Preconditions: "feature 在场（Setup，远征内容——含分层文档；当前语境无突击漂移源）"
  fixture_spec:
    entities:
      - entity_type: "Feature"
        min_count: 1
      - entity_type: "FeatureDocument"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
- Input: "在概览 feature 子 tab 该 feature 行头点「打开新会话」"
- Output: "新会话固定切远征模式；输入框预填 @docs/features/ 加 feature 标识目录打头的同构上下文（含阶段与分层文档真实路径清单），同样不自动发送"
- State: "新 blank 会话创建；agentPreset = expedition（固定）；草稿预填在场（未发送）"
- Side-effect: "会话编排创建动作"
- Invariants: "feature 渠道恒远征——不随当前语境漂移"

## Outcome "context-drift-proof"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 3b［feature 固定远征——不随当前语境漂移；当前会话语境为突击（或上次打开了 blitz 提案）时点 feature 行头，新会话仍一律远征］ -->
- Preconditions: "当前会话语境为突击（或上次打开了 blitz 提案）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "blitz（当前语境）"
      - entity_type: "Feature"
        min_count: 1
- Input: "点 feature 行头「打开新会话」"
- Output: "新会话一律固定切远征（feature 固定远征——不随当前语境漂移）；预填含阶段行与分层文档真实路径"
- State: "新 blank 会话创建；agentPreset = expedition（覆盖语境）"
- Side-effect: "会话编排创建动作"

## Journey Invariants
- 自动发送例外清单收口 = 诊断两路 + 派发指令；「打开新会话」预填一律不自动发送
- 模式路由恒 = 容器对应模式：提案渠道 → 提案 mode（无溯源 → 不切换）；feature 渠道 → 固定远征；任务失败诊断发送与派发新会话 → 任务容器对应模式；feature 子图诊断为 feature 容器专属 → 恒远征
- 消息体以 @path 引用容器目录锚；不含模式；派发指令例外 = 「/run-tasks 加容器标识」单行最小消息
- 派发按钮语义恒定：未终态任务在场亮起 / 全部终态置灰；执行中在场跳转既有派发会话（不新建、不重发）
