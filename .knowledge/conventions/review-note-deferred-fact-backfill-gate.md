---
title: 评审 Note 实现期事实回填以单源门槛兜底
summary: 评审发现「实现期即可定谳的事实缺口」（词表对齐、场景归属等）不要求提案期强判定，改为在提案中内置单源映射表/清单门槛（实现前必须以常量单源列全量映射），缺口被门槛兜住不构成 Blocker。
keywords: [评审, Note, 映射表, 单源, 事实回填]
domainPath: .knowledge/conventions/
来源容器: loop-consol-flywheel-improvement
来源任务: first-pass 复盘（1.9）；先例见 review/report-round2.md N-1/N-2
bug id: 无
---

# 评审 Note 实现期事实回填以单源门槛兜底

- **适用**：提案引用的枚举/词表存在实现期才可完全定谳的归属缺口（如场景码 → 三态映射的个别码归属）。
- **做法**：提案写明「实现前以 `<SINGLE_SOURCE>` 常量单源列出全量映射表，逐项断言」，评审以 Note 记缺口、不判 Blocker——门槛保证缺口必被回填。
- **实证**：loop-consol-flywheel-improvement 评审 N-1（suspend 族携 taskKey）与 N-2（`loop/blocked-pool` 归属）均被「FORGE_PROGRESS_SCENARIOS 单源映射表」门槛兜住，实现期 1.5 走查以 `FORGE_LOOP_SCENARIO_PHASE` 24 值映射表闭合，pin 测试防漂移。
- 依据：`.forge/docs/proposals/loop-consol-flywheel-improvement/review/report-round2.md`（§三）、`walkthrough/ac-1-6-verdict.md`（映射表节）。
