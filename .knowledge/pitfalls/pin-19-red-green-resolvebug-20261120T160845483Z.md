---
title: 结算证据留痕纪律：落档/可区分/复读核销
summary: >-
  门禁输出必落 task_logs（声明不算留痕）、red/green 对照必 SHA256 可区分、resolveBug 回填后必 getBug
  复读核销——三实证翻车的结算证据纪律
keywords:
  - pin-19
  - 留痕
  - red-green
  - resolvebug
  - 台账
  - 证据链
id: pin-19-red-green-resolvebug
status: confirmed
version_ts: '2026-11-20T16:08:45.483Z'
updated: '2026-11-20T16:08:45.483Z'
type: pitfalls
procedure: true
candidate_of: orphan-reconciliation-dynamic-binding-gap
confirmed_at: '2026-11-22T15:34:52.583Z'
---
# 结算证据留痕纪律：门禁输出落档 / red-green 可区分 / 台账回填复读核销

来源：input-history-migrate-and-upgrade / 1.4-1.6 评审链，2026-11。工单：派生提案 task-loop-evidence-ledger-hardening。

## 三条纪律（均实证翻车）

1. **门禁输出必须落档 task_logs**：提交信息文字声明「pin-19 6 绿 / tsc 过 / vitest 绿」不构成在档留痕（1.4 评审 Major）——run-once 输出落 `task_logs/<task>/`，可实读。
2. **red/green 对照两侧必须可区分**：red 复现文件与 green 逐字同形（`Already up to date / Done`）= 复现证据无效——归档前对两侧做 SHA256/差异校验；red 必须含真实错误输出（如 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` exit 1）。
3. **resolveBug 回填后必须 getBug 复读核销**：回写可静默丢失（1.6 结算声明已回填、台账实读仍 open/commit_hash null）——主会话补结算兜底；状态/blood Hash 不符即 fail-loud 上抛。

## 覆盖真空点名（评审发现，待补）

`inboxSpliced` 假件 outcome 仅取首条，多消息混合 outcome 形态未覆盖（input-history tests，fix-2 评审 Minor）。

## 弃置记录

探针脚本本体、分支拓扑事件流水等一次性上下文不入库（probes/walkthrough 留盘）。
