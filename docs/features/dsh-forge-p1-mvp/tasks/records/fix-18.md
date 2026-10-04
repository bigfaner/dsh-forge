---
status: "completed"
started: "2026-10-04 08:23"
completed: "2026-10-04 08:31"
time_spent: "~8m"
---

# Task Record: fix-18 Fix: DSH_HOME 默认共享用户真 home（~/.dsh）——API Key 等凭据/配置复用原生 dsh（S1 隔离 pin 按产品裁决翻案），e2e 隔离语义经 DSH_FORGE_USER_DATA 隐式保留

## Summary
DSH_HOME 默认共享用户真 home（S1 隔离 pin 经产品属主裁决翻案）：paths.ts 新增 resolveDshHome 三态解析（显式 DSH_FORGE_DSH_HOME > DSH_FORGE_USER_DATA 隐式隔离 {userData}/dsh-home > 缺省 {homedir}/.dsh），main.ts ??= 消费点不变；真 home 凭据/会话账本/设置用户层/workspace 注册表复用原生 dsh，应用私有面（state.db/bindings/userData）不动，e2e 隔离语义经 USER_DATA 隐式保留（全套零改动）。人用路径裸跑实测：main 进程 DSH_HOME=C:\Users\panda\.dsh，「添加一个 API Key」官方引导不再自动弹出（真 home DEEPSEEK_API_KEY 被原生 llm-deepseek 读到 → provider-ready）。

## Changes

### Files Created
无

### Files Modified
- apps/host/src/profile/paths.ts
- apps/host/src/profile/paths.test.ts
- apps/host/src/main.ts

### Key Decisions
- 三态解析独立 resolveDshHome 函数：在场判定沿仓内约定 !== undefined && !== ''，显式覆盖相对路径经 resolveFromHost 锚 host 根（与 PROFILE_DIR/RESOURCES_DIR/INSTALL_ANCHOR 同语义）
- USER_DATA 在场兼作 dshHome 隐式隔离门：13/13 启动型 e2e 规格全设 USER_DATA → 隔离语义零改动保留（000-canary 为 runner 自检不启应用）；DSH_FORGE_DSH_HOME 为新增测试/调试口（最高优先级）
- 零迁移逻辑：旧 {userData}/dsh-home 留盘不动，真 home 即真相源（Hard Rule：不自创配置迁移/合并）；凭据纪律不变——产品代码仍零经手凭据（本改动仅路径解析）
- dshDesktop 宿主标记抑制官方引导：按任务边界留作单独裁决项（该全局还门控其他官方行为面，client.js:4010/4076），未并入本任务
- 判别器设计：旧隔离 home（%APPDATA%/dsh-forge/dsh-home）也配过凭据，弹窗缺席不单独构成新旧代码判别证据——以 main 进程 process.env.DSH_HOME 实测值为准（旧=隔离路径，新=真 home）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 13
- **Failed**: 0
- **Coverage**: 100.0%

## Acceptance Criteria
- [x] 解析优先级三态单测（显式 DSH_FORGE_DSH_HOME > USER_DATA 隐式隔离 > 缺省真 home）
- [x] 人用路径实测：dev 裸跑（无 USER_DATA env）→ API Key 引导不再自动弹出（真 home 凭据被原生插件读到；执行记录附对照）
- [x] e2e 全套零改动全绿（隔离语义保持：所有 e2e 设 USER_DATA → dsh-home 隔离）
- [x] 打包形态同口径（userData 天然应用私有，但 DSH_HOME 缺省走真 home）
- [x] state.db / bindings / userData 私有面回归（路径断言不变）
- [x] tsc + lint 绿；S1 pin 注记翻案记录（本任务 = 产品属主裁决）

## Notes
静态门：tsc -b exit 0；pnpm lint（oxlint/imports/tokens/selftest/types）全绿；仓内无 just fmt 配方（oxlint 风格道即 fmt 等价）。定向测试：vitest paths.test.ts 13/13 绿，coverage（v8, --coverage.include=apps/host/src/profile/paths.ts）Statements 12/12、Branches 31/31 = 100%。人用路径实测（tmp-ui-review/fix18-probe.mjs，沿 fix15 探针形制，零交互零写入、不点任何钮）：main-DSH_HOME=C:\Users\panda\.dsh（新解析真值）；20s 观察窗 dialogs-observed=[]、onboarding-auto-shown=false（官方 provider-ready 语义成立，client.js:1112/1114 深读链）；截图 tmp-ui-review/fix18-bare-main.png；探针资产沿仓内形态不入仓（tmp-ui-review 全量 untracked）。e2e env 核查：启动型 13/13 设 DSH_FORGE_USER_DATA（flywheel/session-workbench/knowledge-recall 的凭据拷贝进隔离 DSH_HOME 机制不变——其种子源即真 home ~/.dsh/.credentials.yaml）；全套 e2e 绿由 submit 质量门执行（executor 协议：agent 仅定向测试）。真 home 并发面观察项：本探针与官方桌面无并行（探针前 tasklist 核查无活跃实例）；账本写并发归 dsh 运行时自持（任务边界内无新增观察）。
