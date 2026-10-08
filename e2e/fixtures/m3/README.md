# M3 走查证据（5.3 SC-M3 门——AC5 归档）

`e2e/specs/m3/dogfood-sc-m3.spec.ts` —— SC-M3 自举走查（M3.5 知识沉淀立项启动；真实模型
dogfood——Hard Rule：唯一真实模型依赖面）。本目录承载运行记录与环境备忘（M2 5.4 形制）；
断言真相 = spec 内嵌（forge.db 审计 + logs/{slug}.jsonl + 文件系统 + UI 全景）。

## 运行记录（2026-10-08，首次全绿）

- **生产者**：`e2e/specs/m3/dogfood-sc-m3.spec.ts`（走查即 M3.5 立项启动——真实提案文档
  `docs/proposals/dsh-forge-m3.5-knowledge-consolidation/proposal.md` 逐字拷贝入夹具）。
- **模型面**：zai-coding-cn / glm-5.3-flash（`e2e/support/dogfood.ts` 缺省；凭据经隔离
  DSH_HOME 播种）。halted 注入 = forgeSettings worker provider 指向不存在名（spawn 组装
  恒拒——非伪造模型调用面）。
- **走查链**：createProposal（bridge，mode=expedition 创建时写入）→ 提案子 tab 人工评审
  流转两步（draft → under-review → accepted——五态机 UI 允许集窄集）→ 成链原子三行 →
  upsertDoc 两篇 + 任务四件 db-insert → UF-3 派发入口（会话 A：spawn 失败 ×3 → halted 粘住，
  1.1 留 in_progress）→ 人工转移复位（forge:tasks/transition，actor=ui）→ 派发入口再入
  （会话 B：1.1/1.2/1.3/fix-1 全绿 + 1.4 收官占位 no-task 确定性闭环）。
- **收敛**：halt 63s / 全链 285s（套件 4.8m）；tasks=5 records=19 logLines=31 bridgeEvents=22。
- **断言全绿**：AC1（成链三行 + 任务/执行记录 100% 入自身 forge.db——每任务 claim+submit、
  worker ≠ dispatcher 会话、gate/files/commit 真实 git、fix 链单事务相邻、halted 连环 ≥3 claim
  双会话复位）；AC2（概览三视图/文档/提案子 tab 全景一致 + 全程零 manifest.md 文件系统断言
  + 预置文档哈希零变化 + git status 干净）；AC3（总纲 SC2 无投影——runAllSourceAuditAnchors
  零残留 + UI=db 直读一致；SC7 真闭环——真实模型 worker 经 tool 写入状态层）；
  AC4（dispatchTask 四分支：spawned·success / spawned·blocked / halted+复位 / no-task——
  logs task-claimed→task-spawned→task-submitted→task-worker-done 串联 + no-ready-task 事件）。

## 走查期产品缺陷实证与收口（M2 5.4 先例同形——dogfood 价值所在）

1. **dispatchPrompt 任务规格缺席（首跑全阻）**：`<task-context>` 只含键值行（TASK_ID/SOURCE/
   TYPE/…），任务 title/desc/AC 不入简报；worker 收窄面禁 queryTask（矩阵 forge 族 =
   submitTask+addTask）且 M3 task_file 列砍除 → db-only 任务（quick-tasks/addTask 建）三路皆无
   定义可读 → 全员 blocked（missing-input 分诊）——突击链与一切 tool 建任务在真实派发下不可用
   （5.2 回放主径未暴露——bridge 不走 spawn 面）。收口 = 任务规格内嵌：
   `packages/core/src/forge/tasks/prompt/compose.ts`（TITLE 键值行 + DESCRIPTION/
   ACCEPTANCE_CRITERIA 段——tech-design 图 4「dispatchPrompt 角色唯一来源·纯任务规格」兑付）
   + `claim.ts` 注入 + 模板 Step 1 文本随迁（queryTask 死指消除）。测试锚 =
   claim.test.ts「任务规格内嵌」+ compose.test.ts 5.3 describe + 快照 ×20 重生成。
2. **no-task 末轮收口时序**：末轮 spawned 返回的池快照若显示全终态，模型直接收工不再调用
   （no-ready-task 事件不发射）。1.4 收官占位 = harness 预领 in_progress（双 dispatcher 防线
   实证：盲选不可见）+ 事件门控结算（首轮 no-ready-task 落日志后才结算 1.4 → 末轮 no-task
   done 判词收工）。

## 环境备忘（S8 口径 + M2 5.4 三坑沿用）

1. **真实 node 路径绕 harness node shim（S8 spike 实证）**：harness 会话的 `node`/`pnpm` 若为
   `…\dsh-desktop\harness\.desktop-bin\*.cmd` shim，其 `node.cmd` 会 `set ELECTRON_RUN_AS_NODE=1`
   ——继承该变量的 electron 以 Node 模式启动，playwright 报 `bad option: --remote-debugging-port`。
   规避 = 用真实 node 直调 playwright CLI；本仓 e2e 会话 PATH 首位即真实 node（`which node`
   自证）时无需额外动作。
2. **flash 模型对多分支指令依从不稳（run2/run3 实证）**：「若 X 则不结算/受阻」类条件分支
   依从率 ~50-70%——走查场景的确定性编排原则：机械判据（justfile verify 配方）+ 角色钉死
   （验证员只判定）+ harness 侧确定性注入（预领/中途结算），不依赖模型对剧本的依从。
3. **长跑前置**：跑前查 commit charge（<10GB 时 vite/electron 随机崩）+ tasklist 查 electron
   残留（单实例纪律）+ `DSH_FORGE_E2E_SKIP_WEB_BUILD=1`（前置 `pnpm -C apps/web build:vite`
   + host `tsc -b`）。
4. **重跑**：`DSH_FORGE_E2E_SKIP_WEB_BUILD=1 pnpm exec playwright test -c e2e/playwright.config.ts
   m3/dogfood-sc-m3`（超时可经 `DSH_FORGE_DOGFOOD_DEADLINE_MS`/`DSH_FORGE_DOGFOOD_HALT_MS`
   覆写；失败时 userData/夹具工作区自动保留取证）。
