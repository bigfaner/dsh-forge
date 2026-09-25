---
journey: "proposal-board-browsing"
step: 4
step-action: "外部变更回流"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/proposal-board-browsing/journey.md
anchors:
  web:
    page: "工作台 · 提案看板(列表/详情回流)"
    route: "workbench/proposals"
    requires_auth: false
    layout: "WorkbenchShell → ProposalsPage(FlowOverlay 回流呈现;aria-live)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: proposal-board-browsing / Step 4: 外部变更回流

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "感知链就绪(外部文件变更回流 ≤5s 口径);提案看板已打开"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Proposal"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "感知链健康(watcher/扫描正常)"
        prerequisite_entity: "Project"
- Input: "用户在应用外新增/修改提案文件(或 eval 报告),回到提案看板"
- Output: "列表与详情 ≤5 秒回流变更,免手动刷新;回流内容与文件一致"
- State: "proposal_snapshot 随感知扫描行集替换;事件复用既有 sync 批(v2 事件词表闭合,无提案专属事件型)"
- Side-effect: "感知事件批推(≤500ms 合并语义)"
- Invariants: "感知健康时外部变更 ≤5s 回流;看板为派生视图"

## Outcome "sync-error-degraded"
<!-- source: inferred:感知链故障的失败面沿用 M2 口径(sync-error 工具栏指示 + 静默重试、保留最后良好视图);文件恒为事实源,看板为派生快照可重建 -->
- Preconditions: "感知链(watcher/扫描)故障,外部变更无法回流"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Proposal"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
    state_requirements:
      - description: "感知链故障(watcher/扫描失败,测试通道注入)"
        prerequisite_entity: "Project"
- Input: "用户察看提案看板状态与内容,等待恢复或重启后回看"
- Output: "sync-error 工具栏指示 + 静默重试,保留最后一次良好视图;恢复或重启全量重扫后与文档根文件一致"
- State: "快照保留最后良好行集(派生缓存可重建);文件恒为事实源"
- Side-effect: "none"
- Invariants: "故障时保留最后良好视图且文件恒为事实源"

## Journey Invariants

- 提案看板全页面零状态写入口(只读硬约束;状态流转归终端/agent)
- 渲染恒经 MarkdownView 白名单(防注入)
- 看板内容与文档根文件一致(派生视图);感知健康时外部变更 ≤5s 回流,故障时保留最后良好视图且文件恒为事实源
