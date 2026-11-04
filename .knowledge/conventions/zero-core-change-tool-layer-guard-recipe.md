---
title: 零 core 改动下 tool 层守卫三件套：parse 强制、两支全覆盖、同步 span 关 TOCTOU
summary: >-
  「零 core 改动」约束下把机械守卫落在 agent tool 层的稳定配方：①约束升格到 tool parse
  层（正则/判据机械强制，不靠提示词约定）；②守卫必须覆盖全部分支（只约束一分支会被同型反例在另一分支复活）；③快照读取与 core 写调用之间禁插
  await（同一同步 span，单进程单写者下机械关闭 TOCTOU）。
keywords:
  - tool 层守卫
  - parse 强制
  - TOCTOU
  - 同步 span
  - 相位守卫
  - 零 core 改动
domainPath: .knowledge/conventions/
来源容器: implicit-stage-approval
来源任务: 形式化验证（verification/report.md P2/P4、report-round2.md V-1/V-2）
bug id: 无
id: zero-core-change-tool-layer-guard-recipe
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# tool 层守卫三件套

## 配方

凡提案定性为「core 语义零改动、守卫落 tool 层」，三条缺一不可：

1. **parse 层机械强制**：格式类约束（必带字段、前缀正则）放 zod/parse 校验，typed 拒——提示词约定只留行为类软约束。正则须精确锚定（如 `^(隐式赞同|显式指令)：` 全角冒号），防半角冒号/前缀后空白产生第四类合规形态。
2. **两支全覆盖**：守卫判据按 feature 状态分支时，每个分支都要单独过反例。实证：首版守卫只约束「有任务」分支，「无任务」分支引用「core 推导机既有保证」——实读源码发现 core 对人类纠偏写径的全部约束仅为 from≠to + reason 非空，单调性只在推导机重算路径存在；design→prd 回退后首个写动词即 PhaseInvariantViolation 回滚。修法 = 无任务分支补「archived 或 order(to) ≥ max(order(cur), docPhaseMax)」单调前推判据。
3. **同步 span 关 TOCTOU**：tool execute 内「读快照 → 守卫判定 → 调 core 服务」之间不得插入任何 await——better-sqlite3 单连接同步 + 服务体无 await 点，单进程单写者下读/写落同一同步执行段，事件循环不可穿插，窗口机械关闭。实现处注释 pin 此约束并以测试锚定。

## 依据

- 两支反例：V-1c（无任务回退等价复活第一轮 P2 反例）。
- TOCTOU 条件成立凭据：`db/transaction.ts` 同步铁律 + `transitionFeature` 服务体无 await（V-1b）。
- 推导机不动点闭合凭据：deriveTaskPhase 确定性 + 写动词自推不动点（V-1a）。

## 反例边界

- 同步 span 配方只对「tool 与 core 同进程、core 存储单连接同步」语境成立；跨进程或异步存储（如经 harness 二段执行）窗口即开启，须另设守卫。
- 守卫是形式化验证反例驱动的：先构造反例再写条款，比「写完条款再验证」少一轮返工（本案第一轮 P2 即因先写后验产生返工条款）。
