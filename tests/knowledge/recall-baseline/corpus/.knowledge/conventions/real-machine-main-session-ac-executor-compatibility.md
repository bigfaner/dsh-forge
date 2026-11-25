---
title: 真机主会话 AC 先判执行体兼容性——不可兼容拆解期即声明 evidence_debt
summary: >-
  AC 若要求在 dev 宿主主会话调用工具/留档取证，被派发子代理天然无法执行——拆解层必须前置判定执行体兼容性，不兼容的直接按 evidence_debt
  拆分立据，否则要付出 blocked + triage 失败 + 复验 + 重派的多帧代价。
keywords:
  - 真机取证
  - evidence_debt
  - 执行体兼容性
  - 拆解
  - dev 宿主
domainPath: .knowledge/conventions/
来源容器: expert-headhunter-tools
来源任务: first-pass 知识沉淀（1.6）；事件源自 1.3 首派 blocked
bug id: 无
id: real-machine-main-session-ac-executor-compatibility
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 真机主会话 AC 先判执行体兼容性——不可兼容拆解期即声明 evidence_debt

## 适用条件

- AC 涉及「重启 dev 宿主后在主会话调用工具并留档」一类运行面操作时。
- 执行体是派发 worker（子代理），无权重启宿主、也无法代调主会话工具——该约束在拆解期即可判定，不需执行期试错。

## 反例边界

- 实现 + 单测类 AC 与子代理兼容，不受影响。
- dev 宿主恰在运行且操作可经 RPC/CDP 通道代达时，可正常取证，不必走 debt（参照 unattended-probe 的 RPC 驱动先例）。
- 判定为「可兼容」必须有通道依据，不能以「应该可以」放行。

## 做法

拆解时发现该形态，直接按 `evidence_debt_suite`（如 dev-host-forensics）声明拆分：实现 + 单测先行 success 结算，欠账由自动生成的依赖 test-run 任务在真机环境承载。判例：expert-headhunter-tools/1.3 首派因 dev 宿主缺席 blocked，最终重派以 evidence_debt 一步收口——先撞一轮 ERR_AC_NOT_MET + blocked + triage 失败 + fix 复验，共 4 个任务帧的可省代价。

## 来源锚点

- `logs/expert-headhunter-tools/1.3/001-blocked/error.log`（执行体不可达的事实陈述）。
- `logs/expert-headhunter-tools/1.3/resume.md`（evidence_debt 欠账立据形态）。
- 容器复盘 `logs/expert-headhunter-tools/1.5/retro-first-pass.md` W1 节。
