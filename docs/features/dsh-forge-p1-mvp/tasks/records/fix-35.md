---
status: "completed"
started: "2026-10-04 20:26"
completed: "2026-10-04 20:50"
time_spent: "~24m"
---

# Task Record: fix-35 Fix(P2): 服务端整洁批——knowledge 域内五处同构拷贝抽 shared + registerProject/browse 工厂拆分 + 三份测试语料夹具收编 + 死导出清理 + 同概念异名统一

## Summary
服务端整洁批（clean code B+ → 单一来源化，零行为变更）：① knowledge/shared.ts 五助手单源（escapeLike 吸收进 selectRowsByDomain、requireProject、rebuildMissingIndex（scope+verb 参数化，fix-31 口径注释随迁）、insertKeyLog→writeKeyLog、selectRows→selectRowsByDomain）+ parseKeywords（五处 JSON.parse 收编）+ isNonEmptyString 双份收编 + normalizeUpdated（displayUpdated/normalizeUpdated 异签名统一 fallbackMs）+ prepareHeatByEntry（selectHeat/selectHeatByEntry 异名+ORDER BY 统一）；② registerProject 拆 writeProjectRow + compensateFailedWrite（主链 36 行纯编排，≤40 AC）+ sessionRecall 抽 groupRecallRows 纯函数（照 aggregateDomainTree 先例）+ reconcileAtStartup 抽 reconcileRowDegrade 单项处理器 + attachExistingRow throwaway report 开关拆 isRefHealthy 纯判定（reconcileProjectRef 同源消费）；③ 测试夹具收编 testutil 三件：knowledge-corpus.ts（index/recall/browse 三 .test.ts 的 fixture/writeCorpus/writeMd/entryIdByTitle/recallLogsOf/keyLogsOf/countingIndexService，语料=RECALL_CORPUS/BROWSE_CORPUS 各域口径头注保留）+ project-rows.ts（forge 两测试 readRows/keyLogs/ProjectRow，与 fix-34 registry-stub 同目录）+ date-assertions.ts（ISO 双份失真命名 → isParseableDateStyle 单点）；④ 死导出清零（grep 实证）：rankEntries/RankableEntry/RankedEntry 降模块私有、defaultTitleFromRelPath/digestOf 去 export（barrel 同步收缩）、recallStats 标注「测试对拍面」、isForgeDirExternal core 版去 export（web 版留 web 面）；⑤ 命名统一：errMessage/errorMessage/内联三元 → util.ts errMessage 单源（跨域基础层，铁律③ 下 forge/knowledge 共享件唯一合法层）、插件装配入口对称化 core service.ts→index.ts（与 knowledge/contracts/path-key 同惯例；package.json main/types/exports + assemble-installer-resources ×2 + installer-pipeline/scaffold 结构 pin + pin-07 真实 import + knowledge integration-core 相对引入 + 活文档引用同步）、withTransaction 包单语句去样板 ×3（③ INSERT/updateProject UPDATE/reconcileProjectRef UPDATE）。假前提核查：前次会话=服务端评审本身即规格源，四项交付物全空盘（无 fix-35 提交/无 shared.ts/工作树零代码改动）——依派发注记转真实现。

## Changes

### Files Created
- packages/core/src/util.ts
- packages/core/src/knowledge/shared.ts
- packages/core/src/testutil/knowledge-corpus.ts
- packages/core/src/testutil/project-rows.ts
- packages/core/src/testutil/date-assertions.ts

### Files Modified
- packages/core/src/knowledge/recall-service.ts
- packages/core/src/knowledge/browse-service.ts
- packages/core/src/knowledge/parser.ts
- packages/core/src/knowledge/index.ts
- packages/core/src/knowledge/README.md
- packages/core/src/knowledge/index-service.test.ts
- packages/core/src/knowledge/recall-service.test.ts
- packages/core/src/knowledge/browse-service.test.ts
- packages/core/src/forge/project-service.ts
- packages/core/src/forge/errors.ts
- packages/core/src/forge/project-service.test.ts
- packages/core/src/forge/reconcile-queries.test.ts
- packages/core/src/forge/service-assembly.test.ts
- packages/core/src/db/db.test.ts
- packages/core/src/testutil/README.md
- packages/core/package.json
- packages/knowledge/src/index.ts
- packages/knowledge/src/tools/faces.ts
- packages/knowledge/src/integration-core.test.ts
- scripts/assemble-installer-resources.mjs
- tests/structure/installer-pipeline.test.ts
- tests/structure/scaffold.test.ts
- tests/contract/pin-07-cordis-services.test.ts
- docs/conventions/rpc-and-contracts.md
- docs/features/dsh-forge-p1-mvp/specs/tech-specs.md
- docs/features/dsh-forge-p1-mvp/tasks/fix-37.md
- .forge/fact-table.json

### Key Decisions
- errMessage 单源落点 = packages/core/src/util.ts（src 根基础层）：铁律③ forge↔knowledge 互禁令下跨域共享件唯一合法层（db/ 属库语义、contracts 零逻辑铁律禁函数、新微包对单函数过重）
- 入口对称方向 = core service.ts→index.ts（contracts/path-key/knowledge 三包均 index.ts，core 为唯一离群者；且避免 knowledge 侧改名触发插件 tarball 重 stage 管线）
- 服务.test.ts→index.test.ts 连带改名（测试名镜像源文件名惯例）；fix-37 待执行任务文件的 core/service.test.ts 锚点同步更新防后续执行者困惑
- rebuildMissingIndex 参数化 = keyLogScope（recall/index）+ verb（search/listEntries）双参——SQL scope 由语句字面量改绑定参数（值域 ER CHECK 保证，行为零变化），消息文案逐字保留
- knowledge 测试语料双常量（RECALL_CORPUS 六条/BROWSE_CORPUS 七条）而非单语料——browse 变体（updated/authors/根域条目）是其 AC 断言载体，合并即语义漂移；生命周期 disposeKnowledgeCorpus 由各测试文件 afterAll 显式调用（vitest 按文件隔离，testutil 不 import vitest 保持纯度）
- normalizeUpdated 统一签名取 fallbackMs:number（更原始）；parser 调用点 mtime.getTime() 换算——同时刻 ISO 输出逐字节等值

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1009
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] knowledge 域五助手单一来源（escapeLike/requireProject/rebuildMissingIndex/selectRows/insertKeyLog → shared.ts）
- [x] registerProject 主链 ≤40 行纯编排
- [x] 三测试文件共享语料夹具（testutil/knowledge-corpus.ts）
- [x] 全部现有测试零语义变化全绿
- [x] grep 实证死导出清零（rankEntries 三件/parser 两件零外部消费）

## Notes
前次执行假前提（第十三例，fix-34 同形态）：无 fix-35 提交/全分支 grep 空/shared.ts 不存在——依派发「假前提则真实现」注记执行完整清单。质量门（worktree 无 justfile 等价映射）：tsc -b 干净 + playwright 集合探测 64 tests/15 files + pnpm lint 全绿（oxlint/import/token/selftest/types 五道）+ vitest 1009/1009（VITEST_MAX_WORKERS=4）。陈旧 dist/service.js* 本地产物已删（untracked）；dist/release 均不入库无连带。knowledge 插件 tarball 未触及（core 侧改名不触发 build:plugins/stage:plugin-tarballs 管线）。
