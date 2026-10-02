---
status: "completed"
started: "2026-10-02 14:55"
completed: "2026-10-02 15:29"
time_spent: "~34m"
---

# Task Record: fix-1 Fix: direct-in-main 宿主内 agent 工具派发恒挂起——boot 切 child 形态并桥接产品双服务（4.2 dogfood 阻塞根因）

## Summary
boot 切 child 形态修复 direct-in-main 内 agent 工具派发恒挂起（4.2 dogfood 阻塞根因）：新增 boot/ 桥协议三件——child.ts（ELECTRON_RUN_AS_NODE=1 --expose-internals 子进程入口，S1 spike run3 母本，loadProfileDirectory→overlay→runProfile 原路径平移 + ready/rpc/shutdown 消息面）、bridge.ts（IPC 桥纯逻辑：消息守卫/Map wire 信封/argv 选项解析/子侧派发/主侧方法白名单代理，21 断言单测）、run.ts 重写为 spawn 编排（pending 表结算/close 全量拒/有界关停）；DshHostHandle 面不变故 main.ts 零改动（91 行纪律保持），产品双服务 forgeProjects/forgeKnowledge 经 RPC 桥面世、main.ts forge:* 通道接线与绑定表维护原样工作。e2e 实跑另修出三处潜伏缺陷：① flywheel.spec 会话文件版本漂移（上游 SESSION_FORMAT_VERSION=4 写 session.v4.jsonl.zstd，spec 硬编码 v3 恒漏检→版本无关 bestSessionLog 解析）；② agent 查询掌舵（rankEntries 为 keywords AND + text 整段子串，agent 自然语言长查询合法零命中致 dogfood 方差→search tool 描述/参数说明/零命中提示/prompt 流程指引加「短查询优先」掌舵，匹配语义本身不动）；③ 知识浏览面激活重拉（keep-alive 常挂载仅 mount 拉取致热度徽章陈旧破 AC3 三方一致→useKnowledgeBrowse 加 active 参数，RecallTab AC4 同型隐藏 hold/激活翻转全量重拉，WorkbenchPanel 注入 view.center==='knowledge'）。验证：flywheel.spec.ts dogfood e2e 连续两绿（18.8s/18.7s，转录可见 knowledge.search→read-abstract→追加 search 多步链）；全仓单测 896/896 绿；tsc -b + pnpm lint 全绿。

## Changes

### Files Created
- apps/host/src/boot/bridge.ts
- apps/host/src/boot/child.ts
- apps/host/src/boot/bridge.test.ts

### Files Modified
- apps/host/src/boot/run.ts
- apps/host/src/boot/index.ts
- apps/host/src/boot/README.md
- packages/knowledge/src/tools/search.ts
- packages/knowledge/src/prompt/index.ts
- apps/web/src/views/knowledge/use-knowledge-browse.ts
- apps/web/src/views/knowledge/KnowledgeBrowse.tsx
- apps/web/src/views/knowledge/KnowledgeView.tsx
- apps/web/src/workbench/WorkbenchPanel.tsx
- e2e/specs/flywheel.spec.ts

### Key Decisions
- child 形态整体切换而非 direct-in-main 保留回退——任务口径「boot 切 child 形态」，且 direct 形态 boot 可跑但会话/工具链从未可用，保留只会留陷阱面
- boot 选项经 argv[2] JSON 单串传递（非 env 键）——避免 env 命名碰撞且可被 parseChildOptions 纯函数校验；DSH_HOME/DSH_FORGE_PATCH_FILES 等经 spawn env 继承（语义与 direct 形态逐字一致）
- Map（heatByEntry 唯一 Map 返回体）经 __dshForgeMap__ entries wire 信封显式编解码——不依赖 Node IPC serialization 选项，纯函数可单测
- 服务方法白名单常量（ProjectService 5 法/KnowledgeService+browse 8 法）同时锚定主侧代理与子侧可达面——RPC 边界动态调用的类型面由白名单承载
- 查询掌舵只动 agent 可见面（tool 描述/零命中提示/prompt 指引）不动 rankEntries 匹配语义——AND/子串语义被单测 pin 且属 M5/M6 质量域
- 知识浏览激活重拉沿用 RecallTab AC4 同型（隐藏 hold/激活翻转重拉）——AC3 三方一致与 AC4 即时累积同一模式，epoch 进 fullKey 实现缓存先行不闪骨架

## Test Results
- **Tests Executed**: Yes
- **Passed**: 896
- **Failed**: 0
- **Coverage**: 94.6%

## Acceptance Criteria
- [x] bootDshHost 切 child 形态（ELECTRON_RUN_AS_NODE=1 --expose-internals 子进程，S1 spike run3 母本）——agent 工具派发不再挂起（e2e 转录实见 knowledge.search/read-abstract 执行返回）
- [x] 产品双服务 forgeProjects/forgeKnowledge 经子进程桥接面世，main.ts forge:* 通道接线与 knowledge 绑定表维护原样工作（main.ts 零改动，91 行纪律保持）
- [x] e2e/specs/flywheel.spec.ts 全绿（dogfood 6 步链：注册→会话→agent 召回→事件落库→召回 tab→卡片热度）
- [x] 静态门全绿：tsc -b 编译 + pnpm lint（oxlint/imports/tokens/selftest/types）

## Notes
testsPassed=896 为全仓 vitest 套件（含新增 bridge.test.ts；结构 pin host-main/main.ts 行数纪律通过）。coverage=94.64 为新增桥协议 bridge.ts 的语句覆盖率（vitest v8 实跑：stmts 94.64/branch 92.15/lines 100）——child.ts/run.ts 为进程编排胶水、main.ts 为 Electron 入口，按仓内既定口径（结构 pin + e2e 面）不进 Node 单测面（host 项目整体 stmts 58.71 系此三件拖累，非本次回退）。dogfood e2e 稳定 ~19s，可作常规回归面。fix-1 完成后源任务 4.2 按 index 联动恢复 pending。
