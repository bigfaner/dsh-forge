---
journey: "default-agent-options-panel"
step: 2
action: "write-persists-id-targeted-patch"
title: "写配置 → patch 落 id 定向条目"
risk_level: "High"
surface: { type: "web", key: "expert-squad" }
anchors:
  patch: "活动 profile cordis.patch.yml 的 `- id: expert-squad` 行（dev 形态 = apps/host/profile.dev/cordis.patch.yml）"
  write: "ConfigFormMirror.set/unset → 官方 configForms（revisioned 写径）"
anchors_source: "src-client/settings/index.tsx commit 径 + dsh-settings lib/index.js（configEditor.documentPath = 活动 profile patch）+ proposal §数据面持久化实证锚点"
last_anchor_sync: "2026-10-31T12:00:00+08:00"
sources:
  - "testing/default-agent-options-panel/journey.md 步骤2 + 边界2b"
---

# Contract · step-2-write-persists-id-targeted-patch

## Outcome: success（id 定向条目落盘）

### Preconditions
- fixture_spec：Step 1 面板 ready；patch 写前字节备份在手（spec 还原责任）。

### Input
表单草稿 { provider: P, model: M, reasoning: "high" }（blur/Enter 提交；reasoning 选「高」即时提交）。

### Output
patch 新增/更新 `- id: expert-squad` 行，config.defaultAgentOptions = { provider: P, model: M, reasoning: "high" }——逐字落盘（trim 后形态）；schema 校验/stale 拒写/schema 门归官方。

### State
官方 settings 快照换代（revision 递增）；profile patch 含该 id 行且其余行逐字不变。

### Side-effect
volatile 变更通知发出（Step 3 的生效前提）；无其它文件写径（插件零自持文件）。

### Invariants
- patch 按 row id 整体替换 config：只动 expert-squad 行，其余行逐字不动。
- 空串位剔除：缺省 = 该层不生效（写侧如实存用户所填，整组语义由消费链承担）。

## Outcome: cleared-to-unset（全空 = unset 整字段）`source: inferred`

### Preconditions
- fixture_spec：success 条目在盘。

### Input
清空 Provider/Model、Reasoning 拨回「默认」并提交。

### Output
patch 条目 `defaultAgentOptions` 整字段移除（unset，非写空对象）——不残留空键/空串壳条目；面板回占位态（「继承父Agent」/「默认」）。

### State
patch expert-squad 行回未配置形态（或行收敛为无 config 形态）。

### Side-effect
volatile 通知再次发出。

### Invariants
- 全空 = unset 整字段（default-options-logic defaultOptionsPatchOf 契约），回退组合层。

## Outcome: write-rejected（官方拒写不落半写态）`source: inferred`

### Preconditions
- fixture_spec：stale revision 或 schema 非法值提交。

### Input
被官方 settings 服务拒绝的写。

### Output
patch 零变化；面板 console.error「defaultAgentOptions write rejected——等待下一次修订」留痕；UI 不崩、草稿保留待重同步。

### State
快照 revision 不变（或官方回读折返后一致）。

### Side-effect
none

### Invariants
- 拒写是官方机械（revisioned + schema 门），插件面只留痕不自行重试/不伪造成功。

## Journey Invariants
- 配置写径唯一正门 = 官方 configForms/settings 服务；插件零平行写径、零自持文件。
- 断言以 patch 文件实况为准（真实文件系统取证），不以面板回显替代。
