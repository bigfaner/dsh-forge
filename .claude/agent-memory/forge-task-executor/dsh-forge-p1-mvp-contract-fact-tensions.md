---
name: dsh-forge-p1-mvp-contract-fact-tensions
description: p1-mvp 测试合约生成(9c205eb)发现的 5 处旅程期望 vs 代码现实张力 + 2 项 fix-11 已裁决口径（知识段无条件注入 / 哨兵行计入召回次数）——eval-contract 与 gen-test-scripts 必读
metadata:
  type: project
---

dsh-forge-p1-mvp 任务 T-test-gen-contracts（2026-10-03，commit 9c205eb，33 contracts/76 outcomes）代码侦察发现 5 处「旅程期望 vs shipped 代码」张力，已写入合约 fact-note 注释与 `.forge/fact-table.json` 的 FACT-TENSION 条目：

1. **召回计数口径冲突（最重要）**：shipped 代码按「每次工具调用 × 每命中条目」逐行记 knowledge_recall_logs（一条链 = search + read-abstract = 2 组/2 行 → 召回次数 2、热度 +2，recall-service.ts:192-214 / browse-service.ts:87-104）；旅程（eval 已过）钉死「一次命中的检索链记 1 条」→ 断言 1/1/徽章 1。旅程 invariant 原文明示这是**故意的缺陷信号设计**（"实现若按工具调用逐条计则热度 +2 ≠ 断言 +1，断言失败即缺陷信号"）。现有 e2e/specs/flywheel.spec.ts:494 却按 per-call 口径断言（calls = groups.length，heat ≥1）——下游 gen-test-scripts 若照合约生成，测试会红，这是预期信号不是合约错误。
2. **test.setFault 不存在**：旅程故障注入词汇是测试基建契约，非 shipped 代码；单测现实缝 = StubRegistry 构造注入（failCreate/failDelete）+ ws_path UNIQUE 冲突行预置（project-service.test.ts:17-112）；e2e 无故障注入设施。
3. **启动对账未自动接线**：reconcileAtStartup 仅通道暴露（forge:projects/reconcile），host main/boot/core 插件激活均不自动调——compensation 旅程 4b/5c「重启触发对账」缺触发缝。
4. **知识索引无过期重建**：rebuild 只在项目索引零行时内联 await（digest 存而不比）；knowledge-browsing 1c 第二阶段（外部改目录后网格更新）无自动触发路径。
5. **dock 项目级页签未注册**：M0 只注册全局「开始」页签；session-workbench 6 的甲/乙项目级页签靠旅程 Setup 声明的 fixture 预置缝。

**fix-11 已裁决口径（2026-10-03，勿再当 UNKNOWN 重新生成为 not.toContain 断言）**：

6. **知识段注入口径 = B 侧（能力性指引，随插件加载无条件注入）**：无知识目录/空知识目录工作区的系统提示词**仍含** `## Project knowledge base`。依据：PRD Story 4 AC1 仅正向态；tech-design Interface 3 静态注册；段文本自声明 "may be registered"；两 tool 同为无条件注册；精确门控在设计边界内不可实现（Interface 2 无路径反查 / Hard Rule 禁第二 core 服务 / 绑定表不含知识目录 / core 索引空态异步）。原 2b/2c「不含知识段」断言为 provisional 反向派生，已随裁决撤销（contract/journey/spec 三处同步修订）。
7. **哨兵行口径 = 零命中 search 是已发生的召回事件**：哨兵行为 RecallGroup 契约一等分组（hitCount=0/hits=[]），计入召回次数、不计覆盖与热度（heatByEntry 排除）。零命中检索后召回 tab 呈「召回次数 ≥1 · 覆盖知识 0」；「本会话暂无召回」占位语义 = 零召回**事件**（非零命中）。Step4d soft 断言已按此重写。

**Why**: 这些张力是 eval-contract 评分（Fact Alignment 维）与 gen-test-scripts 落地的关键输入；误把它们当合约缺陷去"修正"会破坏旅程的缺陷信号设计；已裁决项再翻回就是口径回退。
**How to apply**: 处理 T-eval-contract / gen-test-scripts / run-tests 红测试时，先查本清单与 fact-table.json 的 FACT-TENSION 条目，区分「故意缺陷信号」与「真缺陷」；涉及知识段注入或哨兵行断言时按第 6/7 条已裁决口径生成。
