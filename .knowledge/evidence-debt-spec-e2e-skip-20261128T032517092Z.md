---
title: evidence_debt 债卡与 spec「e2e 不真跑」冲突：拆解期预期、结算后人工 skip
summary: >-
  spec 写明「e2e 不真跑」不影响 task-loop 按 facets 自动派生 test-run 债卡（每张声明 evidence_debt
  的实现卡一张）——机械不看 spec。债卡在实现链收口后变 ready 会真跑 e2e。规避：拆解期在收口卡 brief 写明「预期派生债卡、按 spec
  不真跑、人工 skip」；债卡 ready 前人工 skip（agent 无 skip 工具）；不要为阻止派生而让 worker 不声明 debt。
keywords:
  - evidence_debt
  - test-run
  - 债卡
  - 派生
  - e2e
  - spec口径
  - skip
  - facets
  - 拆解
  - task-loop
id: evidence-debt-spec-e2e-skip
status: unconfirmed
version_ts: '2026-11-28T03:25:17.092Z'
updated: '2026-11-28T03:25:17.092Z'
type: pitfalls
procedure: true
candidate_of: forge-pluginization-three-domain-map
---
# spec 声明「e2e 不真跑」时，循环仍会派生 e2e 债卡

## 现象

spec §验证方式写明「e2e spec 不真跑，提交说明里逐项声明」。循环跑到结算时，task-loop 仍按 facets 机械派生出 `test-run` 类型的「e2e 补充验证」卡——每张声明了 evidence_debt 的实现卡派生一张。判例：一个循环派生 5 张（4.2–4.6）。

这些卡：
- 与 spec 口径直接冲突（spec 说不跑，卡要求跑）
- 若不处理，实现链收口后它们变 ready，循环会真去跑 e2e
- 判例里 4.6 真跑了，撞上环境问题，267 failed

## 机制

`submit_task` 的 facets 结算门：实现 + 单测绿但真机 e2e 证据未取时，worker 声明 `evidence_debt_suite` → 循环自动创建依赖的 `test-run` 债卡。这是工具描述里写明的既定行为，**不受 spec 验证方式约束**——spec 是文档，机械不看。

worker 侧往往判断对了（brief 自己写着「纯删减零行为变更、spec §3.4 不需真机」），但结算门要 evidence 或 debt 二选一，它只能声明 debt。

## 规避

**拆解期**（to-tasks）：
- spec 声明不真跑 e2e 的容器，在收口门卡的 brief 里写明：「预期派生 N 张 e2e 债卡，按 spec §X 不真跑，结算后由人工 skip」
- 或在 spec 里显式写一句「本批 evidence_debt 卡预期 skip」，让口径有据可依

**结算期**：债卡变 ready 前人工 skip（human 面操作，agent 无 skip 工具——状态机里 `skipped` 只有 human 面可写）。不要让循环真跑。

**不要**为了让债卡不派生而让 worker 不声明 debt——那会让实现卡因缺证据被拒。

## 判例

容器 `plugins-remediation-m1-legacy-retirement`（2026-11-28）：派生 5 张，4.2/4.3/4.6 人工 skip，4.4/4.5 跑了（定向池替代 e2e，结算 success）。4.6 真跑全量 e2e 撞环境崩。

## 关系

- 四类门与跨卡拆解的总错配：`blocked-2`
- 4.6 撞的环境问题：`pnpm-virtual-store-junction-empty-dir`
