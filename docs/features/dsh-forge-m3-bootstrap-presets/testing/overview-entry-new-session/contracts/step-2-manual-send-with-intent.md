---
journey: "overview-entry-new-session"
step: 2
step-action: "用户补明确意图后手动发送"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/journey.md
anchors:
  web:
    page: "新会话"
    route: ""
    requires_auth: false
    layout: "既有会话面新增入口行为（composer 预填 + 手动发送）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: overview-entry-new-session / Step 2: 用户补明确意图后手动发送

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = 旅程裁决边界承载 Outcome "empty-intent-send"（输入框为自由文本会话输入、非受控表单——空意图发送 = 合法消息，无字段级校验拦截）; session-expired = N/A（旅程裁决：本地化 = 草稿/会话连续性，承载步 = Step 1e——本步无连续性断言面） -->

## Outcome "success"
- Preconditions: "Step 1 的预填草稿在场（未发送）；用户已明确意图"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "draft"
            value: "预填上下文在场（未发送）"
- Input: "单人开发者在预填草稿末尾补一句明确意图并手动发送"
- Output: "首条消息 = 预填上下文 + 用户意图全文（会话转录可见——预填内容作为消息发出，草稿未被丢弃）"
- State: "会话首回合发出（blank 期结束——blank 锁随之生效）；草稿清空（内容已成消息体）"
- Side-effect: "首回合消息入会话转录"
- Invariants: "手动发送 = 草稿整体成为消息体，无丢弃路径"

## Outcome "empty-intent-send"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 2b［输入框无字段校验语义；UF-1 第 4 条只约定「等待用户输入明确意图后手动发送」，未设强制门，空意图发送 = 合法消息——surface-web validation-error 规则考虑记录的边界承载］ -->
- Preconditions: "Step 1 的预填草稿在场、用户未补写意图"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "draft"
            value: "预填上下文在场（意图空缺）"
- Input: "不补意图直接手动发送"
- Output: "消息照常发出（预填上下文即消息体——「我的意图：」后为空）；无字段级校验拦截、无近场报错"
- State: "会话首回合发出；无强制门拦截痕迹"
- Side-effect: "首回合消息入会话转录"
- Invariants: "消息输入框为自由文本会话输入、非受控表单"

## Journey Invariants
- 自动发送例外清单收口 = 诊断两路（feature 子图诊断 + 任务失败诊断）+ 派发指令；「打开新会话」预填一律不自动发送（等待用户明确意图）
- 模式路由恒 = 容器对应模式：提案渠道 → 提案 mode（无溯源 → 不切换）；feature 渠道 → 固定远征；任务失败诊断发送与派发新会话 → 任务容器对应模式；feature 子图诊断为 feature 容器专属 → 恒远征
- 消息体以 @path 引用容器目录锚；不含模式（由会话预设承载）；派发指令例外 = 「/run-tasks 加容器标识」单行最小消息
- 派发按钮语义恒定：未终态任务在场亮起 / 全部终态置灰；执行中在场跳转既有派发会话（不新建、不重发）
