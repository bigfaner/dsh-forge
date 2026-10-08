---
journey: "overview-entry-new-session"
step: 1
step-action: "blitz 提案行头点「打开新会话」"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/journey.md
anchors:
  web:
    page: "概览 · 提案子 tab"
    route: ""
    requires_auth: false
    layout: "概览三子 tab（proposal-tab.tsx 行头「打开新会话」）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: overview-entry-new-session / Step 1: blitz 提案行头点「打开新会话」

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（旅程裁决：入口行为步无字段校验面——边界承载步 = Step 2b，见 step-2 合约）; session-expired = 旅程裁决本地化（草稿/会话连续性）——承载 Outcome "draft-independence"（本步 1e） -->

## Outcome "success"
- Preconditions: "mode 溯源 = blitz 的提案在场（Setup——基础形态：文档仅 proposal.md 一篇）；概览 dock tab 可达；消息输入框可用"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "blitz"
- Input: "单人开发者在概览提案子 tab 该提案行头点「打开新会话」"
- Output: "新会话以突击模式起步（座位标签断言口径）；消息输入框预填格式化上下文——@docs/proposals/加提案标识目录行打头的多行体（名称行 → 摘要行 → 状态行 → 已生成文档行与逐篇路径（状态）清单——不含模式）且不自动发送；末尾留「我的意图：」空位"
- State: "新 blank 会话创建；agentPreset.select 以 blitz 写入；composer 草稿 = 预填文本（未发送）"
- Side-effect: "会话编排创建动作（autosend 恒关——预填等待用户意图）"

## Outcome "no-mode-source-keeps-default"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 1b［「不切换」为 UF-1 第 4 条原词；「保持远征」由 registry 默认 = 远征（SC1）补足——扫描吸收旧提案无溯源字段］ -->
- Preconditions: "经行头入口打开的提案为扫描吸收的旧提案（无溯源字段——Setup 在场）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "NULL（扫描吸收——无溯源）"
- Input: "点其行头「打开新会话」"
- Output: "新会话不切换模式（保持默认远征）；现状上下文预填照常（不自动发送）；提案行 mode chip 显示缺省占位"
- State: "新 blank 会话创建（registry 默认远征）；草稿预填在场"
- Side-effect: "会话编排创建动作"

## Outcome "multi-doc-prefill-boundary"
- Preconditions: "提案挂有多篇文档（proposal.md 之外任意文档行——Setup 在场）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
      - entity_type: "ProposalDocument"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Proposal"
- Input: "点行头「打开新会话」后检查输入框草稿"
- Output: "消息体不含模式行（模式由会话预设承载）；文档清单 = 相对容器目录的真实路径 + 状态逐行；末尾「我的意图：」空位在场"
- State: "新会话草稿 = 完整多文档清单预填（未发送）"
- Side-effect: "none"

## Outcome "expedition-proposal-align"
- Preconditions: "mode 溯源 = expedition 的提案在场（Setup）"
  fixture_spec:
    entities:
      - entity_type: "Proposal"
        min_count: 1
        field_constraints:
          - field: "mode"
            value: "expedition"
- Input: "点该远征提案行头「打开新会话」"
- Output: "新会话以远征模式起步（对齐提案 mode）；预填 @docs/proposals/ 加提案标识目录行打头的上下文、不自动发送（与主 Outcome 同构、仅模式不同）"
- State: "新 blank 会话创建；agentPreset = expedition（select 对齐）"
- Side-effect: "会话编排创建动作"

## Outcome "draft-independence"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 1e［预填目标 = 各新会话自身输入框（UF-1 第 4 条），会话间无共享输入框语义；surface-web session-expired 规则本地化映射（未发送草稿保留、不被新开覆盖）］ -->
- Preconditions: "首个「打开新会话」会话的预填草稿未发送（在场未动）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "draft"
            value: "预填未发送（在场）"
      - entity_type: "Feature"
        min_count: 1
- Input: "不发送，再从另一行头（如 feature 行）点「打开新会话」"
- Output: "新开第二个会话、其输入框预填该渠道上下文；第一会话的草稿原样保留（会话间输入框独立——新开不覆盖/不清空既有会话草稿）；两会话均常驻可回访（中区会话面常驻——Page Composition）"
- State: "两会话各自草稿独立在场；既有会话状态不受新开影响"
- Side-effect: "第二个会话编排创建动作"

## Journey Invariants
- 自动发送例外清单收口 = 诊断两路（feature 子图诊断 + 任务失败诊断）+ 派发指令；「打开新会话」预填一律不自动发送（等待用户明确意图）
- 模式路由恒 = 容器对应模式：提案渠道 → 提案 mode（无溯源 → 不切换）；feature 渠道 → 固定远征；任务失败诊断发送与派发新会话 → 任务容器对应模式；feature 子图诊断为 feature 容器专属 → 恒远征（Step 4/4e 口径收窄）
- 消息体以 @path 引用容器目录锚（@docs/proposals/加标识目录 / @docs/features/加标识目录）；不含模式（由会话预设承载）；派发指令例外 = 「/run-tasks 加容器标识」单行最小消息（唯一必要参数 = contextSlug）
- 派发按钮语义恒定：未终态任务在场亮起 / 全部终态置灰；执行中在场跳转既有派发会话（不新建、不重发）
