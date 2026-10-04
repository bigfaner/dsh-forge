---
id: "fix-35"
title: "Fix(P2): 服务端整洁批——knowledge 域内五处同构拷贝抽 shared + registerProject/browse 工厂拆分 + 三份测试语料夹具收编 + 死导出清理 + 同概念异名统一"
priority: "P2"
estimated_time: "5h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix(P2): 服务端整洁批（clean code 服务端路 B+ → 单一来源化）

> 来源：clean code 服务端评审（2026-10-04，B+）。核心债：域内样板复制 + 测试夹具拷贝 + 死导出。

## 清单

1. **knowledge 域内 shared 抽取**（五处同构，recall-service ↔ browse-service 同目录）：`escapeLike`（134/140）、`requireProject`（237/205）、`rebuildMissingIndex`（222/216，仅 scope 与动词名不同——注意 fix-31 改判定时一并落）、`selectRows`（244/232）、`insertKeyLog`（183/197，参数化 scope）→ `knowledge/shared.ts`；顺带 `JSON.parse(row.keywords) as string[]` 五处 → `parseKeywords()`；`isNonEmptyString` 双份收编；
2. **函数拆分**：`registerProject`（86 行，project-service.ts:66-151）抽 `writeProjectRow()` + `compensate()`——主链降 ~30 行纯编排（与 fix-30 归一化改造协同，先 fix-30 后本项避免冲突）；`createKnowledgeBrowseService` 工厂 213 行中 `sessionRecall`(322-374) 抽纯聚合函数（照本文件 aggregateDomainTree 先例）；`reconcileAtStartup` 三层 try 抽单项处理器；`attachExistingRow` 的 throwaway report 当开关 → 拆 `isRefHealthy` 纯判定；
3. **测试夹具收编**：index/recall/browse 三 .test.ts 的 `fixture`/`writeCorpus`/`writeMd`/`entryIdByTitle` 三份近似拷贝（各 50-70 行）→ test-support 文件（保留各域口径头注）；forge 域 StubRegistry+readRows/keyLogs 两份同收（与 fix-34④ testutil 协同）；`ISO` 断言助手双文件复制 + 命名失真 → 单点 `isParseableDateStyle`；
4. **死导出清理**（grep 零消费实证）：`rankEntries`/`RankableEntry`/`RankedEntry`（recall-service:47-88）降模块私有；`defaultTitleFromRelPath`/`digestOf`（parser:53,116）去 export；`recallStats`（browse:98）标注「测试对拍面」或收敛；`isForgeDirExternal` core 版（project-service:61）与 web 版（form-model.ts:96）双实现——去 export 或加 parity 对拍测试钉等价；
5. **命名统一**：`errMessage`/`errorMessage`/内联三元×6 → 单 util；`selectHeat` vs `selectHeatByEntry` 同 SQL 异名 + ORDER BY 口径统一；`displayUpdated` vs `normalizeUpdated` 同概念异签名收编；插件装配入口对称化（core=service.ts / knowledge=index.ts → 统一）；`withTransaction` 包单语句去样板（94-110、286-292）。

## 验收

- knowledge 域五助手单一来源；registerProject 主链 ≤40 行纯编排；三测试文件共享语料夹具；
- 全部现有测试（194+972 池）零语义变化全绿；grep 实证死导出清零。

## Reference Files

- 见清单定位；服务端评审报告（本会话 2026-10-04）为规格源；依赖序：fix-30（归一化）→ 本任务 ②（避免同函数两次改）

## 边界与不做

- 零行为变更（纯整洁重构）；铁律（跨域禁 import）保持——shared 仅限 knowledge 域内。
